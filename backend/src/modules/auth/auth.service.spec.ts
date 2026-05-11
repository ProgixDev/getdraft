import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseService } from '../../config/supabase.config';
import { MailService } from '../mail/mail.service';
import { SignupOtpService } from './signup-otp.service';
import { VerificationTokenService } from './verification-token.service';
import { TwilioService } from './twilio.service';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../common/types';

// Mock Supabase client chain builder
const createChain = (result: any) => {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
  return chain;
};

describe('AuthService', () => {
  let service: AuthService;
  let supabaseService: SupabaseService;

  const mockClient = {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      verifyOtp: jest.fn(),
      refreshSession: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      admin: { signOut: jest.fn() },
    },
  };

  const mockAdminClient: any = {
    from: jest.fn(),
    auth: {
      admin: { signOut: jest.fn() },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: () => mockClient,
            getAdminClient: () => mockAdminClient,
          },
        },
        {
          provide: MailService,
          useValue: { sendOtp: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: SignupOtpService,
          useValue: {
            generateCode: jest.fn().mockReturnValue('123456'),
            upsert: jest.fn().mockResolvedValue(undefined),
            verify: jest.fn().mockResolvedValue(undefined),
            consume: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: VerificationTokenService,
          useValue: {
            sign: jest.fn().mockReturnValue('signed-token'),
            verify: jest.fn().mockReturnValue({ contact: 'test@example.com', contactType: 'email' }),
          },
        },
        {
          provide: TwilioService,
          useValue: {
            isConfigured: jest.fn().mockReturnValue(true),
            startVerification: jest.fn().mockResolvedValue(undefined),
            checkVerification: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(''),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
  });

  describe('signup', () => {
    it('should create a new user and return tokens', async () => {
      mockClient.auth.signUp.mockResolvedValue({
        data: {
          user: { id: 'user-1', email: 'test@example.com' },
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
          },
        },
        error: null,
      });

      const result = await service.signup({
        email: 'test@example.com',
        password: 'Password123!',
        role: UserRole.ATHLETE,
        name: 'Test User',
      });

      expect(result.user.id).toBe('user-1');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe(UserRole.ATHLETE);
      expect(result.isOnboarded).toBe(false);
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
    });

    it('should throw BadRequestException on signup error', async () => {
      mockClient.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Email already registered' },
      });

      await expect(
        service.signup({
          email: 'existing@example.com',
          password: 'Password123!',
          role: UserRole.ATHLETE,
          name: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('should authenticate user and return tokens with user data', async () => {
      mockClient.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: { id: 'user-1', email: 'test@example.com' },
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
          },
        },
        error: null,
      });

      mockAdminClient.from.mockReturnValue(
        createChain({
          data: {
            role: 'athlete',
            name: 'Test User',
            is_onboarded: true,
          },
        }),
      );

      const result = await service.login({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(result.user.id).toBe('user-1');
      expect(result.isOnboarded).toBe(true);
      expect(result.accessToken).toBe('access-token');
    });

    it('should throw UnauthorizedException on invalid credentials', async () => {
      mockClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'wrong',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email token successfully', async () => {
      mockClient.auth.verifyOtp.mockResolvedValue({ error: null });

      const result = await service.verifyEmail('valid-token');
      expect(result.message).toBe('Email verified successfully');
    });

    it('should throw on invalid token', async () => {
      mockClient.auth.verifyOtp.mockResolvedValue({
        error: { message: 'Invalid token' },
      });

      await expect(service.verifyEmail('invalid')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('refreshToken', () => {
    it('should return new token pair', async () => {
      mockClient.auth.refreshSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'new-access',
            refresh_token: 'new-refresh',
          },
        },
        error: null,
      });

      const result = await service.refreshToken('old-refresh');
      expect(result.accessToken).toBe('new-access');
      expect(result.refreshToken).toBe('new-refresh');
    });

    it('should throw on invalid refresh token', async () => {
      mockClient.auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid refresh token' },
      });

      await expect(service.refreshToken('invalid')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('forgotPassword', () => {
    it('should send reset email', async () => {
      mockClient.auth.resetPasswordForEmail.mockResolvedValue({ error: null });

      const result = await service.forgotPassword('test@example.com');
      expect(result.message).toBe('Password reset email sent');
    });
  });

  describe('logout', () => {
    it('should sign out user via admin client', async () => {
      mockAdminClient.auth.admin.signOut.mockResolvedValue({});

      const result = await service.logout('access-token');
      expect(result.message).toBe('Logged out successfully');
      expect(mockAdminClient.auth.admin.signOut).toHaveBeenCalledWith(
        'access-token',
        'local',
      );
    });

    it('should no-op when no token is provided', async () => {
      const result = await service.logout(null);
      expect(result.message).toBe('Logged out successfully');
    });
  });
});
