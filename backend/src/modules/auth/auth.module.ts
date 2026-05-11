import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailModule } from '../mail/mail.module';
import { SignupOtpService } from './signup-otp.service';
import { VerificationTokenService } from './verification-token.service';
import { TwilioService } from './twilio.service';

@Module({
  imports: [MailModule],
  controllers: [AuthController],
  providers: [AuthService, SignupOtpService, VerificationTokenService, TwilioService],
  exports: [AuthService],
})
export class AuthModule {}
