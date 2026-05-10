import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '../../common/types';

@Injectable()
export class AuthService {
  constructor(private supabaseService: SupabaseService) {}

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
}
