import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../config/supabase.config';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { CompleteSignupDto } from './dto/email-otp.dto';
import { UserRole } from '../../common/types';
import { MailService } from '../mail/mail.service';
import { SignupOtpService } from './signup-otp.service';
import { VerificationTokenService } from './verification-token.service';
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
    private configService: ConfigService,
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
    // Belt-and-braces — the DTO already rejects ADMIN, but a future change
    // to the validator must not silently re-open the privilege-escalation
    // path. Mirrors users.service.ts:90-92.
    if (dto.role === UserRole.ADMIN) {
      throw new ForbiddenException('The admin role cannot be self-assigned.');
    }
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
        activationStatus:
          userData?.activation_status === 'pending_guardian'
            ? 'pending_guardian'
            : 'active',
      },
      isOnboarded: userData?.is_onboarded || false,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  async verifyEmail(email: string, token: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    });

    if (error || !data?.session || !data?.user) {
      throw new BadRequestException(error?.message ?? 'Invalid or expired code');
    }

    // Pull the user row (created by the auth trigger on signUp) for role/name/onboarding state.
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
        name: userData?.name || data.user.user_metadata?.name || '',
        activationStatus:
          userData?.activation_status === 'pending_guardian'
            ? 'pending_guardian'
            : 'active',
      },
      isOnboarded: userData?.is_onboarded || false,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  async resendOtp(email: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: 'Verification code sent' };
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

  /**
   * Code-based reset (no web link): Supabase's resetPasswordForEmail sends
   * a link to the project Site URL — useless in a mobile-only app (it
   * pointed at localhost:3000 in prod). Instead we email a 6-digit code
   * through our own branded transport and verify it in-app.
   */
  async forgotPassword(email: string) {
    const normalized = email.trim().toLowerCase();

    // Silent no-op for unknown emails — never leak which addresses exist.
    const admin = this.supabaseService.getAdminClient();
    const { data: existing } = await admin
      .from('users')
      .select('id')
      .eq('email', normalized)
      .maybeSingle();

    if (existing) {
      const code = this.signupOtpService.generateCode();
      // 'reset:' prefix keeps reset codes in their own (contact, type)
      // slot so they never collide with a signup OTP for the same email.
      await this.signupOtpService.upsert(`reset:${normalized}`, 'email', code);
      await this.mailService.sendPasswordReset(normalized, code);
    }

    return { message: 'If an account exists, a reset code has been sent.' };
  }

  /** Verify the emailed code and set the new password. */
  async resetPassword(email: string, code: string, newPassword: string) {
    const normalized = email.trim().toLowerCase();

    // Throws on wrong/expired code; burns the code on success so it
    // can't be replayed.
    await this.signupOtpService.verify(`reset:${normalized}`, 'email', code);

    const admin = this.supabaseService.getAdminClient();
    const { data: user } = await admin
      .from('users')
      .select('id')
      .eq('email', normalized)
      .maybeSingle();
    if (!user) {
      // Same shape as a bad-code failure — no account enumeration.
      throw new BadRequestException('Invalid or expired code.');
    }

    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (error) {
      throw new BadRequestException('Could not update the password. Try again.');
    }

    return { message: 'Password updated. You can sign in now.' };
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
    // Belt-and-braces — the DTO already rejects ADMIN, but a future change
    // to the validator must not silently re-open the privilege-escalation
    // path. Mirrors users.service.ts:90-92.
    if (dto.role === UserRole.ADMIN) {
      throw new ForbiddenException('The admin role cannot be self-assigned.');
    }
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
    //
    // HARD GATE: the purge is permanently disabled in production, even
    // if TEST_PHONES is misconfigured there. The Render checklist says to
    // leave TEST_PHONES empty, but this is the second line of defence:
    // a CASCADE wipe of a real user account must never happen because
    // an env var slipped through. Matches the dev-only 000000 OTP bypass.
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    if (!isEmail && !isProduction && this.testPhones().has(contact)) {
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

    let created: any = null;
    {
      const { data, error } = await admin.auth.admin.createUser(createPayload);
      created = data;

      // Orphan recovery for phone signups: a prior partial signup may have
      // left an auth.users row with no public.users row. Our duplicate
      // check above queries public.users and misses it, but createUser
      // now collides on the auth phone index — the user is permanently
      // locked out with no recovery path. Detect "phone exists" + "no
      // profile row" = orphan, delete it, retry once. We pay listUsers
      // only here, on the rare collision path.
      if (!isEmail && error && /already/i.test(error.message ?? '')) {
        const orphan = await this.findOrphanAuthByPhone(contact);
        if (orphan) {
          this.logger.warn(
            `[orphan-recovery] deleting orphan auth user ${orphan.id} for ${contact}`,
          );
          await admin.auth.admin.deleteUser(orphan.id);
          const retry = await admin.auth.admin.createUser(createPayload);
          if (retry.error || !retry.data?.user) {
            this.logger.error(
              `createUser retry failed for ${contact}: ${retry.error?.message}`,
            );
            throw new BadRequestException(
              retry.error?.message ?? 'Could not create account.',
            );
          }
          created = retry.data;
        } else {
          // Real duplicate (auth row WITH profile row) — let it fail.
          this.logger.error(`createUser failed for ${contact}: ${error.message}`);
          throw new BadRequestException(
            error.message ?? 'Could not create account.',
          );
        }
      } else if (error || !created?.user) {
        this.logger.error(
          `createUser failed for ${contact}: ${error?.message}`,
        );
        throw new BadRequestException(
          error?.message ?? 'Could not create account.',
        );
      }
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

    // Existing-user phones receive the OTP too — verifyPhoneOtp signs
    // them straight in (login mode). The response message is identical
    // either way, so the endpoint still doesn't leak which numbers are
    // registered.

    // Dev bypass for TEST_PHONES: skip Twilio entirely (no trial-account
    // verified-caller-id needed). verifyPhoneOtp accepts the fixed code
    // 000000 for these numbers. Never active in production.
    if (isTest && this.configService.get('NODE_ENV') !== 'production') {
      this.logger.log(
        `[test-phone] Twilio bypassed for ${normalized} — use code 000000`,
      );
      return { message: 'A code has been sent.' };
    }

    await this.twilioService.startVerification(normalized, channel);
    return { message: 'A code has been sent.' };
  }

  /**
   * Verify the phone OTP. Two outcomes:
   *  - LOGIN: the phone already belongs to an account → mint a real
   *    session server-side and return it. Nothing is ever purged or
   *    recreated on this path — existing accounts are safe.
   *  - SIGNUP: unknown phone → return a signup verification token for
   *    the role/password handoff, exactly as before.
   */
  async verifyPhoneOtp(phone: string, code: string) {
    const normalized = phone.trim();
    const isTest = this.testPhones().has(normalized);

    if (isTest && this.configService.get('NODE_ENV') !== 'production') {
      // Dev bypass — pairs with the Twilio skip in requestPhoneOtp.
      if (code !== '000000') {
        throw new BadRequestException('Incorrect or expired code.');
      }
    } else {
      const approved = await this.twilioService.checkVerification(normalized, code);
      if (!approved) {
        throw new BadRequestException('Incorrect or expired code.');
      }
    }

    const authUser = await this.findAuthUserByPhone(normalized);
    if (authUser) {
      const admin = this.supabaseService.getAdminClient();
      const { data: profile, error: profileErr } = await admin
        .from('users')
        .select('id, email, name, role, is_onboarded, activation_status')
        .eq('id', authUser.id)
        .maybeSingle();

      // A QUERY error (missing column, RLS, transient) is NOT the same as
      // "no profile row". Swallowing it here would drop a real returning
      // user into the signup branch below and mint a DUPLICATE account.
      // Fail loudly instead so the client shows a retry, not a wrong path.
      if (profileErr) {
        this.logger.error(
          `[phone-login] profile read failed for ${authUser.id}: ${profileErr.message}`,
        );
        throw new InternalServerErrorException(
          'Could not sign you in. Please try again.',
        );
      }

      if (profile) {
        const session = await this.mintSessionForAuthUser(
          authUser.id,
          authUser.email ?? null,
          normalized,
        );
        this.logger.log(
          `[phone-login] ${normalized} → existing user ${authUser.id} signed in`,
        );
        return {
          existingUser: true as const,
          user: {
            id: profile.id,
            email: profile.email ?? null,
            phone: normalized,
            role: profile.role,
            name: profile.name ?? null,
            activationStatus:
              profile.activation_status === 'pending_guardian'
                ? 'pending_guardian'
                : 'active',
          },
          isOnboarded: !!profile.is_onboarded,
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        };
      }
      // Orphan auth row without a profile — fall through to the signup
      // path; completeSignup's duplicate check / TEST_PHONES purge deals
      // with it exactly as before.
      this.logger.warn(
        `[phone-login] auth user ${authUser.id} has no public.users row — treating as signup`,
      );
    }

    const verificationToken = this.verificationTokenService.sign({
      contact: normalized,
      contactType: 'phone',
    });
    return { existingUser: false as const, verificationToken };
  }

  /**
   * Find an auth.users row matching `contact` by phone that has NO
   * corresponding public.users row — i.e. an orphan left by a partial
   * signup. Only used as the slow-path fallback when createUser collides
   * during a non-TEST phone signup. listUsers page-1 is acceptable here:
   * collision is rare AND a real legitimate row whose profile exists
   * would have been caught by the duplicate check earlier.
   */
  private async findOrphanAuthByPhone(contact: string) {
    const admin = this.supabaseService.getAdminClient();
    const wantDigits = contact.replace(/\D/g, '');
    const { data } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const candidates = (data?.users ?? []).filter((u) => {
      const d = (u.phone ?? '').replace(/\D/g, '');
      return d.length > 0 && d === wantDigits;
    });
    for (const candidate of candidates) {
      const { data: profile } = await admin
        .from('users')
        .select('id')
        .eq('id', candidate.id)
        .maybeSingle();
      if (!profile) return candidate;
    }
    return null;
  }

  /**
   * Look up an existing user by phone via the public.users.phone index
   * (added in migration 015), then fetch the auth row by id. Replaces the
   * old listUsers page-1 scan which silently capped at 1000 auth users
   * — past that limit a returning phone user was invisible to login and
   * fell through to "phone already exists" on signup.
   *
   * Tries exact match first (the normal case, since both client and
   * trigger store E.164), then a digits-only fallback for rows that
   * Supabase normalised differently (e.g. stripped the leading +).
   */
  private async findAuthUserByPhone(contact: string) {
    const admin = this.supabaseService.getAdminClient();
    const wantDigits = contact.replace(/\D/g, '');

    // Exact match — uses idx_users_phone_unique.
    let { data: row } = await admin
      .from('users')
      .select('id')
      .eq('phone', contact)
      .maybeSingle();

    // Fallback for legacy/normalised rows. Sequential scan, but only
    // runs when the exact match missed AND we have a non-empty digit
    // string — i.e. one corner-case query, not on every login.
    if (!row && wantDigits) {
      const { data: legacy } = await admin
        .from('users')
        .select('id, phone')
        .not('phone', 'is', null);
      row = (legacy ?? []).find(
        (u: { id: string; phone: string | null }) =>
          (u.phone ?? '').replace(/\D/g, '') === wantDigits,
      ) as { id: string } | undefined ?? null;
    }

    if (!row) return null;

    const { data: authUser, error } = await admin.auth.admin.getUserById(row.id);
    if (error || !authUser?.user) {
      this.logger.warn(
        `[phone-login] public.users ${row.id} has no auth row: ${error?.message ?? 'missing'}`,
      );
      return null;
    }
    return authUser.user;
  }

  /**
   * Mint a session for an existing user without knowing their password:
   * generate a magic-link token via the admin API and exchange its
   * token_hash for a session. Phone signups always carry a synthetic
   * email (completeSignup attaches it); legacy rows without one are
   * healed here with the same convention.
   */
  private async mintSessionForAuthUser(
    userId: string,
    email: string | null,
    phone: string,
  ) {
    const admin = this.supabaseService.getAdminClient();
    const anon = this.supabaseService.getClient();

    let authEmail = email;
    if (!authEmail) {
      authEmail = `phone-${phone.replace(/\D/g, '')}@phone.getdraft.local`;
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        email: authEmail,
        email_confirm: true,
      });
      if (updErr) {
        this.logger.error(
          `[phone-login] could not attach synthetic email to ${userId}: ${updErr.message}`,
        );
        throw new BadRequestException('Could not sign you in. Please try again.');
      }
    }

    const { data: linkData, error: linkErr } =
      await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: authEmail,
      });
    const tokenHash = (linkData as any)?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      this.logger.error(
        `[phone-login] generateLink failed for ${userId}: ${linkErr?.message ?? 'no token_hash'}`,
      );
      throw new BadRequestException('Could not sign you in. Please try again.');
    }

    const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    });
    if (verifyErr || !verified.session) {
      this.logger.error(
        `[phone-login] token exchange failed for ${userId}: ${verifyErr?.message}`,
      );
      throw new BadRequestException('Could not sign you in. Please try again.');
    }
    return verified.session;
  }
}
