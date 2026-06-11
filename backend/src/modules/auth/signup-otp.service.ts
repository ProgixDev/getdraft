import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SupabaseService } from '../../config/supabase.config';

export type ContactType = 'email' | 'phone';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 10;

@Injectable()
export class SignupOtpService {
  private readonly logger = new Logger(SignupOtpService.name);

  constructor(private supabaseService: SupabaseService) {}

  generateCode(): string {
    // 6-digit, zero-padded.
    return Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
  }

  /**
   * Persist (or replace) the OTP for this contact. Returns nothing — the
   * code itself is sent out-of-band by the caller (MailService / Twilio).
   */
  async upsert(contact: string, contactType: ContactType, code: string): Promise<void> {
    const supabase = this.supabaseService.getAdminClient();
    const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    const { error } = await supabase
      .from('signup_otps')
      .upsert(
        {
          contact,
          contact_type: contactType,
          code_hash: codeHash,
          attempts: 0,
          verified: false,
          expires_at: expiresAt,
        },
        { onConflict: 'contact,contact_type' },
      );

    if (error) {
      this.logger.error(`upsert signup_otp failed (${contact}): ${error.message}`);
      throw new BadRequestException('Could not store verification code.');
    }
  }

  /**
   * Compare the supplied code against the stored hash. On success, marks
   * the row verified so the same OTP can't be reused. On failure,
   * increments attempts; locks out after MAX_ATTEMPTS.
   */
  async verify(contact: string, contactType: ContactType, code: string): Promise<void> {
    const supabase = this.supabaseService.getAdminClient();

    const { data: row, error } = await supabase
      .from('signup_otps')
      .select('id, code_hash, attempts, verified, expires_at')
      .eq('contact', contact)
      .eq('contact_type', contactType)
      .maybeSingle();

    if (error) {
      this.logger.error(`fetch signup_otp failed (${contact}): ${error.message}`);
      throw new BadRequestException('Could not check verification code.');
    }
    if (!row) {
      throw new BadRequestException('No pending verification for this contact.');
    }
    if (row.verified) {
      // The OTP was already consumed once. The caller already received a
      // verificationToken; re-verifying must not mint another. The next
      // signup attempt must request a fresh code.
      throw new BadRequestException(
        'This code has already been used. Request a new one.',
      );
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new BadRequestException('This code has expired. Request a new one.');
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('Too many failed attempts. Request a new code.');
    }

    const match = await bcrypt.compare(code, row.code_hash);
    if (!match) {
      await supabase
        .from('signup_otps')
        .update({ attempts: row.attempts + 1 })
        .eq('id', row.id);
      throw new BadRequestException('Incorrect code.');
    }

    // Mark as verified (single-use). The caller will issue a signed
    // verification_token immediately after this returns.
    const { error: updateErr } = await supabase
      .from('signup_otps')
      .update({ verified: true, attempts: row.attempts + 1 })
      .eq('id', row.id);
    if (updateErr) {
      this.logger.warn(`mark verified failed (${contact}): ${updateErr.message}`);
      // Non-fatal — the OTP did match, downstream will still proceed.
    }
  }

  /**
   * Best-effort delete after a successful complete-signup so the row
   * doesn't sit around indefinitely.
   */
  async consume(contact: string, contactType: ContactType): Promise<void> {
    const supabase = this.supabaseService.getAdminClient();
    await supabase
      .from('signup_otps')
      .delete()
      .eq('contact', contact)
      .eq('contact_type', contactType);
  }
}
