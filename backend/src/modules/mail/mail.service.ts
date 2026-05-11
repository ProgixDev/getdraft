import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private resend!: Resend;
  private fromAddress!: string;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from = this.configService.get<string>('MAIL_FROM');
    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY not set — emails will fail at send time. Add it to .env.',
      );
    }
    if (!from) {
      this.logger.warn(
        'MAIL_FROM not set — defaulting to onboarding@resend.dev. Set MAIL_FROM=GetDraft <hello@yourdomain> once domain is verified.',
      );
    }
    this.resend = new Resend(apiKey || 'placeholder-no-api-key');
    this.fromAddress = from || 'GetDraft <onboarding@resend.dev>';
  }

  async sendOtp(to: string, code: string): Promise<void> {
    const html = otpEmailHtml(code);
    const text = `Your GetDraft verification code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`;

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to,
        subject: `${code} is your GetDraft verification code`,
        html,
        text,
      });
      if (error) {
        this.logger.error(`Resend rejected OTP send to ${to}: ${error.message}`);
        throw new InternalServerErrorException('Could not send verification email.');
      }
    } catch (err: any) {
      // Network / SDK errors — bubble as 500 so the request retry policy kicks in.
      if (err instanceof InternalServerErrorException) throw err;
      this.logger.error(`Resend SDK threw on OTP send to ${to}: ${err?.message ?? err}`);
      throw new InternalServerErrorException('Could not send verification email.');
    }
  }
}

/**
 * Inline HTML — modern minimal, GetDraft-branded.
 * Centered card on dark canvas, big code, short copy.
 */
function otpEmailHtml(code: string): string {
  const safeCode = String(code).replace(/[^0-9A-Za-z]/g, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your GetDraft verification code</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#141414;border-radius:18px;padding:36px 32px;border:1px solid rgba(255,255,255,0.06);">
          <tr>
            <td style="font-size:13px;letter-spacing:0.18em;color:rgba(255,255,255,0.55);text-transform:uppercase;font-weight:600;padding-bottom:18px;">
              GetDraft
            </td>
          </tr>
          <tr>
            <td style="font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;padding-bottom:8px;">
              Confirm it's you
            </td>
          </tr>
          <tr>
            <td style="font-size:15px;color:rgba(255,255,255,0.7);line-height:1.55;padding-bottom:24px;">
              Use this code to finish signing up. It expires in 10 minutes.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 0 6px;">
              <div style="display:inline-block;background:#0a0a0a;border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:18px 28px;font-size:34px;letter-spacing:0.32em;font-weight:700;color:#ffffff;font-variant-numeric:tabular-nums;">
                ${safeCode}
              </div>
            </td>
          </tr>
          <tr>
            <td style="font-size:13px;color:rgba(255,255,255,0.4);line-height:1.55;padding-top:26px;">
              If you didn't request this, you can safely ignore it. Nobody can sign in without the code.
            </td>
          </tr>
          <tr>
            <td style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.5;padding-top:26px;border-top:1px solid rgba(255,255,255,0.06);margin-top:24px;">
              Where Talent Has No Borders.<br>
              <span style="color:rgba(255,255,255,0.25);">© ${new Date().getFullYear()} GetDraft</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
