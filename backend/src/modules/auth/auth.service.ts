import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '../../common/types';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { SignupOtpService } from './signup-otp.service';
import { VerificationTokenService } from './verification-token.service';
import { CompleteSignupDto } from './dto/email-otp.dto';
import { TwilioService, VerifyChannel } from './twilio.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private supabaseService: SupabaseService,
    private mailService: MailService,
    private signupOtpService: SignupOtpService,
    private verificationTokenService: VerificationTokenService,
    private twilioService: TwilioService,
    @Inject(ConfigService) private configService: ConfigService,
  ) {}

  /**
   * Set of phone numbers (E.164) that can be reused across many signups.
   * On each completeSignup that targets one of these, any pre-existing
   * Supabase user with the same phone is deleted before creating the
   * new one. Configured via TEST_PHONES env var (comma-separated).
   */
  private testPhones(): Set<string> {
    const raw = this.configService.get<string>('TEST_PHONES') ?? '';
    return new Set(
      raw
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
    );
  }

  /**
   * Delete every auth.users row whose phone matches the supplied
   * number. Compares digits-only to handle Supabase's leading-+
   * normalisation. CASCADE on public.users cleans up profile rows.
   * Test-only utility — gated by the testPhones() allowlist.
   */
  private async purgeAuthUsersByPhone(contact: string): Promise<void> {
    const admin = this.supabaseService.getAdminClient();
    const wantDigits = contact.replace(/\D/g, '');

    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error || !data) {
      this.logger.warn(`[test-phone] listUsers failed: ${error?.message ?? '(no data)'}`);
      return;
    }
    const matches = data.users.filter((u) => {
      const userDigits = (u.phone ?? '').replace(/\D/g, '');
      return userDigits.length > 0 && userDigits === wantDigits;
    });
    if (matches.length === 0) {
      this.logger.log(`[test-phone] no prior users found for ${contact}`);
      return;
    }
    this.logger.log(`[test-phone] purging ${matches.length} prior auth user(s) for ${contact}`);
    for (const u of matches) {
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
      if (delErr) {
        this.logger.warn(`[test-phone] deleteUser ${u.id}: ${delErr.message}`);
      }
    }
  }

  async signup(dto: SignupDto) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: {
        data: {
          role: dto.role,
          name: dto.name,
        },
      },
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      user: {
        id: data.user!.id,
        email: data.user!.email!,
        role: dto.role,
        name: dto.name,
      },
      isOnboarded: false,
      accessToken: data.session?.access_token || null,
      refreshToken: data.session?.refresh_token || null,
    };
  }

  async login(dto: LoginDto) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Fetch user data from public.users table
    const adminClient = this.supabaseService.getAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    return {
      user: {
        id: data.user.id,
        email: data.user.email!,
        role: (userData?.role as UserRole) || UserRole.ATHLETE,
        name: userData?.name || '',
      },
      isOnboarded: userData?.is_onboarded || false,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  async verifyEmail(token: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: 'email',
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: 'Email verified successfully' };
  }

  async refreshToken(refreshToken: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      accessToken: data.session!.access_token,
      refreshToken: data.session!.refresh_token,
    };
  }

  async forgotPassword(email: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: 'Password reset email sent' };
  }

  async resendVerification(email: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });

    // Don't surface "user already confirmed" or "user not found" errors to
    // the caller — same anti-enumeration reasoning as forgot-password.
    if (error && !/already confirmed|not found/i.test(error.message)) {
      throw new BadRequestException(error.message);
    }

    return { message: 'Verification email sent' };
  }

  async logout(accessToken: string | null) {
    if (!accessToken) {
      return { message: 'Logged out successfully' };
    }
    // admin.signOut requires the service_role key.
    const supabase = this.supabaseService.getAdminClient();

    await supabase.auth.admin.signOut(accessToken, 'local');

    return { message: 'Logged out successfully' };
  }

  // ----- New OTP-driven signup flow (backend-owned email) -----

  /**
   * Request an email OTP. Always returns success regardless of whether
   * the email is already registered — prevents account enumeration. We
   * still upsert + send if the email isn't already taken.
   */
  async requestEmailOtp(email: string): Promise<{ message: string }> {
    const normalized = email.trim().toLowerCase();

    // If the user is already registered, silently no-op. They should
    // log in or hit forgot-password instead.
    const admin = this.supabaseService.getAdminClient();
    const { data: existing } = await admin
      .from('users')
      .select('id')
      .eq('email', normalized)
      .maybeSingle();
    if (existing) {
      return { message: 'If this email is unused, a code has been sent.' };
    }

    const code = this.signupOtpService.generateCode();
    await this.signupOtpService.upsert(normalized, 'email', code);
    await this.mailService.sendOtp(normalized, code);
    return { message: 'If this email is unused, a code has been sent.' };
  }

  /**
   * Verify the OTP. Returns a signed verification_token the client carries
   * through the rest of the signup flow.
   */
  async verifyEmailOtp(email: string, code: string): Promise<{ verificationToken: string }> {
    const normalized = email.trim().toLowerCase();
    await this.signupOtpService.verify(normalized, 'email', code);
    const verificationToken = this.verificationTokenService.sign({
      contact: normalized,
      contactType: 'email',
    });
    return { verificationToken };
  }

  /**
   * Finalize signup: validates the verification_token, creates the Supabase
   * user via admin API, and returns session tokens. This is the single
   * write that introduces the user into auth.users.
   */
  async completeSignup(dto: CompleteSignupDto) {
    const { contact, contactType } = this.verificationTokenService.verify(dto.verificationToken);
    const admin = this.supabaseService.getAdminClient();
    const anon = this.supabaseService.getClient();

    const isEmail = contactType === 'email';
    const column = isEmail ? 'email' : 'phone';

    // Test-phone bypass: when the incoming phone is in TEST_PHONES,
    // delete any pre-existing auth.users row with the same phone so
    // the next createUser call doesn't collide. We query auth.users
    // directly via listUsers (rather than public.users) because an
    // earlier failed signup may have left an orphan auth row without
    // a matching public.users record — and that's exactly the
    // "phone already registered" case Supabase complains about.
    if (!isEmail && this.testPhones().has(contact)) {
      await this.purgeAuthUsersByPhone(contact);
    } else {
      // Normal path: refuse duplicates.
      const { data: alreadyExists } = await admin
        .from('users')
        .select('id')
        .eq(column, contact)
        .maybeSingle();
      if (alreadyExists) {
        throw new BadRequestException(
          isEmail
            ? 'An account with this email already exists.'
            : 'An account with this phone number already exists.',
        );
      }
    }

    // Create the auth user. For phone signups we ALSO attach a
    // synthetic email so we can sign the user in via email+password
    // immediately afterwards — Supabase's "Phone Auth provider" must
    // be explicitly enabled in the dashboard for phone-password
    // sign-in to work, and we don't want to require that toggle.
    // The synthetic email is never sent to anyone; it's just a
    // stable internal identifier derived from the phone number.
    const syntheticEmail = isEmail
      ? null
      : `phone-${contact.replace(/\D/g, '')}@phone.getdraft.local`;

    const createPayload: any = isEmail
      ? {
          email: contact,
          password: dto.password,
          email_confirm: true,
          user_metadata: { role: dto.role, name: dto.name ?? null },
        }
      : {
          phone: contact,
          email: syntheticEmail,
          password: dto.password,
          phone_confirm: true,
          email_confirm: true,
          user_metadata: { role: dto.role, name: dto.name ?? null },
        };

    const { data: created, error: createErr } = await admin.auth.admin.createUser(createPayload);
    if (createErr || !created.user) {
      this.logger.error(`createUser failed for ${contact}: ${createErr?.message}`);
      throw new BadRequestException(createErr?.message ?? 'Could not create account.');
    }

    // Sign them in. For phone signups, use the synthetic email since
    // the phone-login provider may be disabled.
    const signInPayload = isEmail
      ? { email: contact, password: dto.password }
      : { email: syntheticEmail!, password: dto.password };
    const { data: session, error: signInErr } = await anon.auth.signInWithPassword(signInPayload);
    if (signInErr || !session.session) {
      this.logger.error(`post-signup signInWithPassword failed for ${contact}: ${signInErr?.message}`);
      throw new BadRequestException('Account created, but sign-in failed. Try logging in.');
    }

    // For phone signups: the handle_new_user trigger copied the
    // synthetic email into public.users. Null it out so the rest of
    // the app sees the user as phone-only (auth.users keeps the
    // synthetic email for re-login).
    if (!isEmail) {
      await admin.from('users').update({ email: null }).eq('id', created.user.id);
    }

    // Cleanup any signup_otps row (email path only — phone uses Twilio Verify).
    if (isEmail) {
      await this.signupOtpService.consume(contact, 'email');
    }

    return {
      user: {
        id: created.user.id,
        email: isEmail ? contact : null,
        phone: isEmail ? null : contact,
        role: dto.role,
        name: dto.name ?? null,
      },
      isOnboarded: false,
      accessToken: session.session.access_token,
      refreshToken: session.session.refresh_token,
    };
  }

  // ----- Phone OTP (Twilio Verify: SMS or WhatsApp) -----

  async requestPhoneOtp(phone: string, channel: VerifyChannel): Promise<{ message: string }> {
    const normalized = phone.trim();
    const isTest = this.testPhones().has(normalized);

    // Anti-enumeration — same shape as request-email-otp. Test phones
    // bypass the "already taken" silent-no-op so we can retry signups.
    if (!isTest) {
      const admin = this.supabaseService.getAdminClient();
      const { data: existing } = await admin
        .from('users')
        .select('id')
        .eq('phone', normalized)
        .maybeSingle();
      if (existing) {
        return { message: 'If this number is unused, a code has been sent.' };
      }
    }

    await this.twilioService.startVerification(normalized, channel);
    return { message: 'If this number is unused, a code has been sent.' };
  }

  async verifyPhoneOtp(phone: string, code: string): Promise<{ verificationToken: string }> {
    const normalized = phone.trim();
    const approved = await this.twilioService.checkVerification(normalized, code);
    if (!approved) {
      throw new BadRequestException('Incorrect or expired code.');
    }
    const verificationToken = this.verificationTokenService.sign({
      contact: normalized,
      contactType: 'phone',
    });
    return { verificationToken };
  }
}
