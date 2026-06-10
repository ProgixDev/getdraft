import { Injectable, UnauthorizedException, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { ContactType } from './signup-otp.service';

const TOKEN_TTL = '30m';

export interface VerificationTokenPayload {
  contact: string;
  contactType: ContactType;
  /** Standard JWT claims (iat/exp/sub) are also present at runtime. */
}

@Injectable()
export class VerificationTokenService implements OnModuleInit {
  private readonly logger = new Logger(VerificationTokenService.name);
  private secret!: string;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const s = this.configService.get<string>('AUTH_VERIFICATION_SECRET');
    if (!s) {
      this.logger.error(
        'AUTH_VERIFICATION_SECRET not set — verification tokens will be unverifiable. Set it in .env.',
      );
    }
    // Fall back to a process-lifetime random so dev doesn't crash, but
    // tokens won't survive a restart. Production MUST set the env var.
    this.secret = s || `dev-only-${Math.random().toString(36).slice(2)}`;
  }

  sign(payload: VerificationTokenPayload): string {
    return jwt.sign(payload, this.secret, {
      expiresIn: TOKEN_TTL,
      issuer: 'getdraft-backend',
      subject: 'signup-verification',
    });
  }

  verify(token: string): VerificationTokenPayload {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: 'getdraft-backend',
        subject: 'signup-verification',
      }) as jwt.JwtPayload & VerificationTokenPayload;
      if (!decoded.contact || !decoded.contactType) {
        throw new UnauthorizedException('Verification token is malformed.');
      }
      return { contact: decoded.contact, contactType: decoded.contactType };
    } catch (err: any) {
      if (err?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Verification token has expired. Restart signup.');
      }
      throw new UnauthorizedException('Invalid verification token.');
    }
  }
}
