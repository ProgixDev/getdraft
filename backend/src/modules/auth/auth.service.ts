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
import { MailService } from '../mail/mail.service';
import { SignupOtpService } from './signup-otp.service';
import { VerificationTokenService } from './verification-token.service';
import { CompleteSignupDto } from './dto/email-otp.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private supabaseService: SupabaseService,
    private mailService: MailService,
    private signupOtpService: SignupOtpService,
    private verificationTokenService: VerificationTokenService,
  ) {}

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

    if (contactType !== 'email') {
      // Phone path comes in Phase 2 — sharper error message until then.
      throw new BadRequestException('Phone signup is not yet supported.');
    }

    // Double-check no race created the user since request-otp.
    const { data: alreadyExists } = await admin
      .from('users')
      .select('id')
      .eq('email', contact)
      .maybeSingle();
    if (alreadyExists) {
      throw new BadRequestException('An account with this email already exists.');
    }

    // Create the auth user; the public.users row is inserted by the
    // handle_new_user trigger that ships with migration 001.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: contact,
      password: dto.password,
      email_confirm: true, // OTP already proved control of the address
      user_metadata: {
        role: dto.role,
        name: dto.name ?? null,
      },
    });
    if (createErr || !created.user) {
      this.logger.error(`createUser failed for ${contact}: ${createErr?.message}`);
      throw new BadRequestException(createErr?.message ?? 'Could not create account.');
    }

    // Sign them in immediately so the client gets a session.
    const anon = this.supabaseService.getClient();
    const { data: session, error: signInErr } = await anon.auth.signInWithPassword({
      email: contact,
      password: dto.password,
    });
    if (signInErr || !session.session) {
      this.logger.error(`post-signup signInWithPassword failed for ${contact}: ${signInErr?.message}`);
      throw new BadRequestException('Account created, but sign-in failed. Try logging in.');
    }

    // Cleanup OTP row — single-use; consumed.
    await this.signupOtpService.consume(contact, 'email');

    return {
      user: {
        id: created.user.id,
        email: contact,
        role: dto.role,
        name: dto.name ?? null,
      },
      isOnboarded: false,
      accessToken: session.session.access_token,
      refreshToken: session.session.refresh_token,
    };
  }
}
