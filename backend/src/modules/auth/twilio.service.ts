import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';

export type VerifyChannel = 'sms' | 'whatsapp';

@Injectable()
export class TwilioService implements OnModuleInit {
  private readonly logger = new Logger(TwilioService.name);
  private client: Twilio | null = null;
  private verifyServiceSid: string | null = null;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const apiKeySid = this.configService.get<string>('TWILIO_API_KEY_SID');
    const apiKeySecret = this.configService.get<string>('TWILIO_API_KEY_SECRET');
    this.verifyServiceSid = this.configService.get<string>('TWILIO_VERIFY_SERVICE_SID') || null;

    if (!accountSid || !this.verifyServiceSid) {
      this.logger.warn(
        'Twilio not configured — phone OTP routes will fail until TWILIO_ACCOUNT_SID, ' +
          'TWILIO_VERIFY_SERVICE_SID, and either TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET ' +
          '(preferred) OR TWILIO_AUTH_TOKEN are set in .env.',
      );
      return;
    }

    // Prefer API Key + Secret (scoped, revocable). Fall back to Auth Token.
    if (apiKeySid && apiKeySecret) {
      this.client = twilio(apiKeySid, apiKeySecret, { accountSid });
      this.logger.log(`Twilio Verify ready via API Key (service ${this.verifyServiceSid})`);
    } else if (authToken) {
      this.client = twilio(accountSid, authToken);
      this.logger.log(`Twilio Verify ready via Auth Token (service ${this.verifyServiceSid})`);
    } else {
      this.logger.warn(
        'Twilio: no API Key or Auth Token set. Add either pair to .env.',
      );
    }
  }

  isConfigured(): boolean {
    return this.client !== null && this.verifyServiceSid !== null;
  }

  async startVerification(to: string, channel: VerifyChannel): Promise<void> {
    if (!this.client || !this.verifyServiceSid) {
      throw new InternalServerErrorException('Twilio not configured on the backend.');
    }
    try {
      await this.client.verify.v2
        .services(this.verifyServiceSid)
        .verifications.create({ to, channel });
    } catch (err: any) {
      // Twilio returns helpful error codes on rate-limits, bad numbers, etc.
      const code = err?.code;
      const message = err?.message ?? 'Could not send verification code.';
      this.logger.error(`Twilio start (${channel} → ${to}) failed [${code}]: ${message}`);

      if (code === 20003) {
        throw new InternalServerErrorException('Twilio authentication failed.');
      }
      if (code === 60200 || code === 60205 || code === 21211) {
        throw new BadRequestException('That phone number looks invalid.');
      }
      if (code === 60203) {
        throw new BadRequestException('Too many attempts. Please wait a few minutes.');
      }
      // Fall-through: never surface raw Twilio text to users (it can include
      // trial-mode / dashboard URLs). Real reason is logged above.
      throw new BadRequestException("Couldn't send the code — please try again.");
    }
  }

  /**
   * Returns true if the code was accepted, false otherwise. Twilio's
   * verificationChecks.status is 'approved' on success.
   */
  async checkVerification(to: string, code: string): Promise<boolean> {
    if (!this.client || !this.verifyServiceSid) {
      throw new InternalServerErrorException('Twilio not configured on the backend.');
    }
    try {
      const check = await this.client.verify.v2
        .services(this.verifyServiceSid)
        .verificationChecks.create({ to, code });
      return check.status === 'approved';
    } catch (err: any) {
      const code = err?.code;
      const message = err?.message ?? 'Could not check verification code.';
      this.logger.warn(`Twilio check (${to}) failed [${code}]: ${message}`);
      // 20404 = verification not found (expired or wrong number)
      if (code === 20404) {
        throw new BadRequestException('This code has expired. Request a new one.');
      }
      // 60202 = max attempts reached
      if (code === 60202) {
        throw new BadRequestException('Too many failed attempts. Request a new code.');
      }
      throw new BadRequestException("Couldn't verify the code — please try again.");
    }
  }
}
