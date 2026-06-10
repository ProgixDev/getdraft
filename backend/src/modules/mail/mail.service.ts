import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter!: nodemailer.Transporter;
  private fromAddress!: string;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port = Number(this.configService.get<string>('SMTP_PORT') || 465);
    const user = this.configService.get<string>('SMTP_USER');
    // App-Passwords are 16 chars with optional spaces — Google accepts either form.
    const pass = (this.configService.get<string>('SMTP_PASS') || '').replace(/\s+/g, '');
    const from = this.configService.get<string>('MAIL_FROM');

    if (!user || !pass) {
      this.logger.warn(
        'SMTP_USER / SMTP_PASS not set — emails will fail at send time. Add them to .env.',
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      // Implicit TLS on 465; STARTTLS on 587. We default to 465.
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    this.fromAddress = from || (user ? `GetDraft <${user}>` : 'GetDraft <noreply@getdraft.local>');

    // Verify connection in the background — surfaces auth errors at boot
    // instead of waiting for the first OTP request to discover them.
    this.transporter
      .verify()
      .then(() => this.logger.log(`SMTP ready (${host}:${port})`))
      .catch((err) => this.logger.warn(`SMTP verify failed: ${err?.message ?? err}`));
  }

  async sendOtp(to: string, code: string): Promise<void> {
    const html = otpEmailHtml(code);
    const text = `Your GetDraft verification code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`;

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: `${code} is your GetDraft verification code`,
        html,
        text,
      });
    } catch (err: any) {
      this.logger.error(`SMTP send failed to ${to}: ${err?.message ?? err}`);
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
