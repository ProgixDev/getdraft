import { Controller, Post, Body, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import {
  VerifyEmailDto,
  ResendOtpDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/verify-email.dto';
import {
  RequestEmailOtpDto,
  VerifyEmailOtpDto,
  CompleteSignupDto,
} from './dto/email-otp.dto';
import {
  RequestPhoneOtpDto,
  VerifyPhoneOtpDto,
} from './dto/phone-otp.dto';
import { LogoutDto } from './dto/logout.dto';
import { Public } from '../../common/decorators/public.decorator';
import { AllowPending } from '../../common/decorators/allow-pending.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('signup')
  @ApiOperation({ summary: 'Register a new user' })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Public()
  @Post('login')
  // Brute-force guard: 5 attempts/min per IP.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Login with email and password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('verify-email')
  // Bounded guess: 5 OTP submissions/min per IP.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Verify email with 6-digit OTP, returns session' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.token);
  }

  @Public()
  @Post('resend-otp')
  // OTP send burns SMTP quota + real money — tightest budget: 3/min per IP.
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Resend the signup OTP email' })
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto.email);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  // Email send + enumeration vector: 3/min per IP.
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Email a 6-digit password-reset code' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  // Brute-force vector on the 6-digit code: 5/min per IP (the OTP row
  // itself also locks after 5 wrong attempts).
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Verify the reset code and set a new password' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
  }

  @Post('logout')
  @AllowPending()
  @ApiOperation({ summary: 'Logout current session' })
  logout(@Body() dto: LogoutDto, @Req() req: any) {
    const headerAuth = req?.headers?.authorization || '';
    const headerToken = headerAuth.startsWith('Bearer ')
      ? headerAuth.slice(7)
      : null;
    return this.authService.logout(dto.accessToken || headerToken);
  }

  // ----- New OTP-driven signup flow -----

  @Public()
  @Post('email/request-otp')
  // OTP send burns SMTP quota + real money — tightest budget: 3/min per IP.
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Send an email OTP to begin signup' })
  requestEmailOtp(@Body() dto: RequestEmailOtpDto) {
    return this.authService.requestEmailOtp(dto.email);
  }

  @Public()
  @Post('email/verify-otp')
  // Bounded guess: 5 OTP submissions/min per IP.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Verify the email OTP and receive a verification token' })
  verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) {
    return this.authService.verifyEmailOtp(dto.email, dto.code);
  }

  @Public()
  @Post('complete-signup')
  // Hold a verified token — 5/min/IP is plenty for a human finishing signup.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Finalize signup with verified contact + chosen password' })
  completeSignup(@Body() dto: CompleteSignupDto) {
    return this.authService.completeSignup(dto);
  }

  @Public()
  @Post('phone/request-otp')
  // SMS send burns Twilio Verify ($) — tightest budget: 3/min per IP.
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Send a phone OTP via SMS or WhatsApp (Twilio Verify)' })
  requestPhoneOtp(@Body() dto: RequestPhoneOtpDto) {
    return this.authService.requestPhoneOtp(dto.phone, dto.channel);
  }

  @Public()
  @Post('phone/verify-otp')
  // Bounded guess: 5 OTP submissions/min per IP.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary:
      'Verify the phone OTP — returns a session for existing accounts (login) or a verification token for new signups',
  })
  verifyPhoneOtp(@Body() dto: VerifyPhoneOtpDto) {
    return this.authService.verifyPhoneOtp(dto.phone, dto.code);
  }
}
