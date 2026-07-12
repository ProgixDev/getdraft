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
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress!: string;
  // When set, sendOtp uses Resend's HTTP API instead of SMTP. Most managed
  // platforms (Vercel/Render) block outbound port 465/587, which is why SMTP
  // hangs in prod even though it works in dev. HTTPS to api.resend.com is
  // always reachable.
  private resendApiKey: string | null = null;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.resendApiKey =
      (this.configService.get<string>('RESEND_API_KEY') || '').trim() || null;

    const host = this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port = Number(this.configService.get<string>('SMTP_PORT') || 465);
    const user = this.configService.get<string>('SMTP_USER');
    // App-Passwords are 16 chars with optional spaces — Google accepts either form.
    const pass = (this.configService.get<string>('SMTP_PASS') || '').replace(/\s+/g, '');
    const from = this.configService.get<string>('MAIL_FROM');

    this.fromAddress = from || (user ? `GetDraft <${user}>` : 'GetDraft <noreply@getdraft.local>');

    // Resend mode wins when configured — skip SMTP setup entirely so we
    // don't spawn a doomed verify() against a blocked port in prod.
    if (this.resendApiKey) {
      this.logger.log('Mail transport: Resend HTTP API');
      return;
    }

    if (!user || !pass) {
      this.logger.warn(
        'SMTP_USER / SMTP_PASS not set and RESEND_API_KEY not set — emails will fail at send time.',
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      // Implicit TLS on 465; STARTTLS on 587. We default to 465.
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
      // Fail fast instead of hanging an OTP request for ~2 min (nodemailer's
      // default connectionTimeout) when the SMTP host is unreachable — e.g. a
      // platform that blocks outbound SMTP egress. Turns a hung request into a
      // quick, logged 500 and surfaces the real cause at boot via verify().
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    // Verify connection in the background — surfaces auth errors at boot
    // instead of waiting for the first OTP request to discover them.
    this.transporter
      .verify()
      .then(() => this.logger.log(`SMTP ready (${host}:${port})`))
      .catch((err) => this.logger.warn(`SMTP verify failed: ${err?.message ?? err}`));
  }

  async sendOtp(to: string, code: string): Promise<void> {
    const html = otpEmailHtml(code, "Confirm it's you", 'Use this code to finish signing up. It expires in 10 minutes.');
    const text = `Your GetDraft verification code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`;
    const subject = `${code} is your GetDraft verification code`;
    await this.deliver(to, subject, html, text);
  }

  /** Password reset — same branded shell, reset copy. */
  async sendPasswordReset(to: string, code: string): Promise<void> {
    const html = otpEmailHtml(
      code,
      'Reset your password',
      'Use this code in the app to set a new password. It expires in 10 minutes.',
    );
    const text = `Your GetDraft password reset code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email — your password stays unchanged.`;
    const subject = `${code} is your GetDraft password reset code`;
    await this.deliver(to, subject, html, text);
  }

  private async deliver(to: string, subject: string, html: string, text: string): Promise<void> {
    if (this.resendApiKey) {
      await this.sendViaResend(to, subject, html, text);
      return;
    }

    if (!this.transporter) {
      this.logger.error(
        'deliver called with neither RESEND_API_KEY nor SMTP credentials configured.',
      );
      throw new InternalServerErrorException('Email transport is not configured.');
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
        text,
      });
    } catch (err: any) {
      this.logger.error(`SMTP send failed to ${to}: ${err?.message ?? err}`);
      throw new InternalServerErrorException('Could not send verification email.');
    }
  }

  /**
   * POST to Resend's REST endpoint. We use the native fetch (Node 18+ ships
   * one — Nest's runtime is on 18/20). No SDK dependency so the SMTP-only
   * dev path doesn't have to import it. Non-2xx => surface as 500 with the
   * provider message logged but not echoed to the client (response bodies
   * can leak API hints).
   */
  private async sendViaResend(
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<void> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to,
          subject,
          html,
          text,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(
          `Resend send failed to ${to}: ${res.status} ${res.statusText} ${body}`,
        );
        throw new InternalServerErrorException(
          'Could not send verification email.',
        );
      }
    } catch (err: any) {
      if (err instanceof InternalServerErrorException) throw err;
      this.logger.error(`Resend request failed to ${to}: ${err?.message ?? err}`);
      throw new InternalServerErrorException('Could not send verification email.');
    }
  }
}

/**
 * Inline HTML — modern minimal, GetDraft-branded.
 * Centered card on dark canvas, big code, short copy.
 */
function otpEmailHtml(code: string, heading = "Confirm it's you", sub = 'Use this code to finish signing up. It expires in 10 minutes.'): string {
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
              ${heading}
            </td>
          </tr>
          <tr>
            <td style="font-size:15px;color:rgba(255,255,255,0.7);line-height:1.55;padding-bottom:24px;">
              ${sub}
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
