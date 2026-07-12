import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseService } from '../../config/supabase.config';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { SignupOtpService } from './signup-otp.service';
import { VerificationTokenService } from './verification-token.service';
import { TwilioService } from './twilio.service';
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
      admin: { signOut: jest.fn(), updateUserById: jest.fn() },
    },
  };

  const mailMock = { sendOtp: jest.fn(), sendPasswordReset: jest.fn() };
  const otpMock = {
    requestOtp: jest.fn(),
    verifyOtp: jest.fn(),
    createAndSend: jest.fn(),
    generateCode: jest.fn(),
    upsert: jest.fn(),
    verify: jest.fn(),
  };

  /** users-table lookup chain: .from().select().eq().maybeSingle() */
  const mockUserLookup = (row: { id: string } | null) => {
    mockAdminClient.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
        }),
      }),
    });
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
        // Deps added since this spec was first written — mocked so the module
        // resolves; the existing tests exercise the Supabase-based paths only.
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: MailService, useValue: mailMock },
        { provide: SignupOtpService, useValue: otpMock },
        {
          provide: VerificationTokenService,
          useValue: { issue: jest.fn(), verify: jest.fn(), consume: jest.fn() },
        },
        {
          provide: TwilioService,
          useValue: {
            startVerification: jest.fn(),
            checkVerification: jest.fn(),
            isConfigured: jest.fn().mockReturnValue(false),
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
    it('should verify OTP and return a session', async () => {
      mockClient.auth.verifyOtp.mockResolvedValue({
        data: {
          user: { id: 'user-1', email: 'test@example.com', user_metadata: {} },
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
          },
        },
        error: null,
      });
      mockAdminClient.from.mockReturnValue(
        createChain({
          data: { role: 'athlete', name: 'Test User', is_onboarded: false },
        }),
      );

      const result = await service.verifyEmail('test@example.com', '123456');
      expect(result.user.id).toBe('user-1');
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.isOnboarded).toBe(false);
    });

    it('should throw on invalid OTP', async () => {
      mockClient.auth.verifyOtp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid token' },
      });

      await expect(
        service.verifyEmail('test@example.com', 'invalid'),
      ).rejects.toThrow(BadRequestException);
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
    it('emails a reset code when the account exists', async () => {
      mockUserLookup({ id: 'user-1' });
      otpMock.generateCode.mockReturnValue('123456');

      const result = await service.forgotPassword('Test@Example.com');
      expect(result.message).toBe(
        'If an account exists, a reset code has been sent.',
      );
      expect(otpMock.upsert).toHaveBeenCalledWith(
        'reset:test@example.com',
        'email',
        '123456',
      );
      expect(mailMock.sendPasswordReset).toHaveBeenCalledWith(
        'test@example.com',
        '123456',
      );
    });

    it('silently no-ops for unknown emails (no enumeration)', async () => {
      mockUserLookup(null);

      const result = await service.forgotPassword('ghost@example.com');
      expect(result.message).toBe(
        'If an account exists, a reset code has been sent.',
      );
      expect(mailMock.sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('verifies the code and updates the password', async () => {
      mockUserLookup({ id: 'user-1' });
      mockAdminClient.auth.admin.updateUserById.mockResolvedValue({ error: null });

      const result = await service.resetPassword(
        'test@example.com',
        '123456',
        'NewPassw0rd!',
      );
      expect(result.message).toBe('Password updated. You can sign in now.');
      expect(otpMock.verify).toHaveBeenCalledWith(
        'reset:test@example.com',
        'email',
        '123456',
      );
      expect(mockAdminClient.auth.admin.updateUserById).toHaveBeenCalledWith(
        'user-1',
        { password: 'NewPassw0rd!' },
      );
    });

    it('rejects a wrong code without touching the password', async () => {
      otpMock.verify.mockRejectedValue(new BadRequestException('Invalid code'));

      await expect(
        service.resetPassword('test@example.com', '000000', 'NewPassw0rd!'),
      ).rejects.toThrow(BadRequestException);
      expect(mockAdminClient.auth.admin.updateUserById).not.toHaveBeenCalled();
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
