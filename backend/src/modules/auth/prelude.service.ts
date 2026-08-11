import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Phone verification via Prelude (https://docs.prelude.so), replacing
 * Twilio Verify.
 *
 * Deliberately a drop-in for the old TwilioService: same two methods, same
 * signatures, same user-facing error strings. AuthService only swaps the
 * injected type, and nothing on the client changes.
 *
 * No SDK — two POST endpoints do not justify a dependency, and Node's
 * global fetch covers it.
 */

export type VerifyChannel = 'sms' | 'whatsapp';

const BASE = 'https://api.prelude.dev/v2';

/** POST /v2/verification response status values. */
type CreateStatus =
  | 'success'
  | 'retry'
  | 'challenged'
  | 'blocked'
  | 'shadow_blocked';

/** POST /v2/verification/check response status values. */
type CheckStatus =
  | 'success'
  | 'failure'
  | 'expired_or_not_found'
  | 'transaction_missing'
  | 'transaction_mismatch';

@Injectable()
export class PreludeService implements OnModuleInit {
  private readonly logger = new Logger(PreludeService.name);
  private apiKey: string | null = null;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.apiKey = this.configService.get<string>('PRELUDE_API_KEY') || null;
    if (!this.apiKey) {
      this.logger.warn(
        'Prelude not configured — phone OTP routes will fail until ' +
          'PRELUDE_API_KEY is set in .env.',
      );
      return;
    }
    this.logger.log('Prelude Verify ready');
  }

  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  private async post(
    path: string,
    body: unknown,
  ): Promise<{ ok: boolean; status: number; json: any }> {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // Non-JSON body (gateway error page, empty 5xx). Leave json null and
      // let the caller decide — do not let a parse failure masquerade as a
      // verification failure.
    }
    return { ok: res.ok, status: res.status, json };
  }

  /**
   * Send a verification code. `to` must already be E.164.
   *
   * Twilio's `channel` maps onto Prelude's `preferred_channel`: preferred,
   * not forced, so Prelude can fall back to another channel when the
   * requested one cannot deliver. That is a deliverability improvement over
   * Twilio, where a failed channel was simply a failed send.
   */
  async startVerification(to: string, channel: VerifyChannel): Promise<void> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        'Phone verification is not configured on the backend.',
      );
    }

    let result: { ok: boolean; status: number; json: any };
    try {
      result = await this.post('/verification', {
        target: { type: 'phone_number', value: to },
        options: { preferred_channel: channel },
      });
    } catch (err: any) {
      // Network-level failure: Prelude was never reached.
      this.logger.error(`Prelude start (${channel} -> ${to}) threw: ${err?.message}`);
      throw new BadRequestException("Couldn't send the code — please try again.");
    }

    if (!result.ok) {
      const code = result.json?.code;
      const message = result.json?.message ?? `HTTP ${result.status}`;
      this.logger.error(
        `Prelude start (${channel} -> ${to}) failed [${result.status}/${code}]: ${message}`,
      );
      if (result.status === 401 || result.status === 403) {
        throw new InternalServerErrorException(
          'Phone verification authentication failed.',
        );
      }
      if (result.status === 400 || result.status === 422) {
        throw new BadRequestException('That phone number looks invalid.');
      }
      if (result.status === 429) {
        throw new BadRequestException(
          'Too many attempts. Please wait a few minutes.',
        );
      }
      // Never surface a provider's raw text to users — it can leak account
      // state and dashboard URLs. The real reason is logged above.
      throw new BadRequestException("Couldn't send the code — please try again.");
    }

    const status = result.json?.status as CreateStatus | undefined;
    const reason = result.json?.reason;

    switch (status) {
      case 'success':
      case 'retry':
        // 'retry' means a code was already in flight and Prelude reused or
        // resent it. From the caller's side that is a successful send.
        return;

      case 'shadow_blocked':
        // Prelude decided this request is abusive and silently dropped it.
        // The whole point is that the caller cannot tell, so returning an
        // error here would hand an attacker the signal shadow-blocking
        // exists. Report success; log loudly so WE can see it.
        this.logger.warn(
          `Prelude SHADOW BLOCKED ${to} (reason=${reason}) — no message sent, ` +
            'reporting success to the caller by design',
        );
        return;

      case 'blocked':
        this.logger.warn(`Prelude blocked ${to} (reason=${reason})`);
        if (reason === 'invalid_phone_number' || reason === 'invalid_phone_line') {
          throw new BadRequestException('That phone number looks invalid.');
        }
        if (reason === 'repeated_attempts') {
          throw new BadRequestException(
            'Too many attempts. Please wait a few minutes.',
          );
        }
        throw new BadRequestException(
          "Couldn't send the code — please try again.",
        );

      case 'challenged':
        // Prelude wants an additional anti-fraud challenge (e.g. captcha),
        // which this app has no UI for. Treat as a soft failure rather than
        // pretending a code is on its way to a user who will never get one.
        this.logger.warn(`Prelude challenged ${to} (reason=${reason})`);
        throw new BadRequestException(
          "Couldn't send the code — please try again.",
        );

      default:
        this.logger.error(
          `Prelude start (${to}) returned unexpected status: ${String(status)}`,
        );
        throw new BadRequestException(
          "Couldn't send the code — please try again.",
        );
    }
  }

  /**
   * Returns true when the code is accepted, false when it is simply wrong.
   * Expiry throws, matching the old Twilio behaviour so the client keeps
   * telling the user to request a new code rather than "wrong code".
   */
  async checkVerification(to: string, code: string): Promise<boolean> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        'Phone verification is not configured on the backend.',
      );
    }

    let result: { ok: boolean; status: number; json: any };
    try {
      result = await this.post('/verification/check', {
        target: { type: 'phone_number', value: to },
        code,
      });
    } catch (err: any) {
      this.logger.error(`Prelude check (${to}) threw: ${err?.message}`);
      throw new BadRequestException(
        "Couldn't verify the code — please try again.",
      );
    }

    if (!result.ok) {
      const message = result.json?.message ?? `HTTP ${result.status}`;
      this.logger.warn(
        `Prelude check (${to}) failed [${result.status}]: ${message}`,
      );
      if (result.status === 404) {
        throw new BadRequestException('This code has expired. Request a new one.');
      }
      if (result.status === 429) {
        throw new BadRequestException(
          'Too many failed attempts. Request a new code.',
        );
      }
      throw new BadRequestException(
        "Couldn't verify the code — please try again.",
      );
    }

    const status = result.json?.status as CheckStatus | undefined;

    if (status === 'success') return true;

    if (status === 'expired_or_not_found') {
      throw new BadRequestException('This code has expired. Request a new one.');
    }

    if (status === 'failure') return false;

    // transaction_missing / transaction_mismatch only occur for PSD2
    // templates, which this app does not use. Anything else is unknown.
    // A verification we cannot interpret is NOT a pass.
    this.logger.error(
      `Prelude check (${to}) returned unexpected status: ${String(status)}`,
    );
    return false;
  }
}
