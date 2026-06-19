import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  Req,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import * as crypto from 'crypto';
import { KycService } from './kyc.service';
import { StartKycDto } from './dto/start-kyc.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AllowPending } from '../../common/decorators/allow-pending.decorator';

@ApiTags('KYC')
// KYC runs during signup (before onboarding sets pending_guardian), but
// allow pending minors through so a resumed/retried KYC is never blocked.
@AllowPending()
@Controller('kyc')
export class KycController {
  private readonly logger = new Logger(KycController.name);

  constructor(
    private kycService: KycService,
    private configService: ConfigService,
  ) {}

  @Post('start')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start (or resume) a Didit verification session' })
  start(@CurrentUser('id') userId: string, @Body() dto: StartKycDto) {
    return this.kycService.startSession(userId, dto.callbackUrl);
  }

  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current KYC status for the authenticated user' })
  status(@CurrentUser('id') userId: string) {
    return this.kycService.getStatus(userId);
  }

  @Post('dev-approve')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '[DEV ONLY] Bypass Didit and mark current user approved.',
  })
  devApprove(@CurrentUser('id') userId: string) {
    return this.kycService.devApprove(userId);
  }

  @Public()
  @Post('webhooks/didit')
  @ApiOperation({ summary: 'Didit webhook receiver (decision updates)' })
  async webhook(@Body() body: unknown, @Req() req: FastifyRequest) {
    this.verifyDiditSignature(req, body);
    await this.kycService.handleWebhook(body);
    return { ok: true };
  }

  /**
   * HMAC-SHA256 signature check using the shared secret from Didit
   * dashboard. Header is `x-signature` (hex). When the secret isn't
   * configured we skip — only meant for dev. Production MUST set
   * DIDIT_WEBHOOK_SECRET.
   *
   * The HMAC is computed over the RAW request bytes (rawBody: true in
   * main.ts) — re-serialising the parsed body breaks on any whitespace
   * difference, so JSON.stringify is only the dev-grade fallback.
   */
  private verifyDiditSignature(req: FastifyRequest, body: unknown): void {
    const secret = this.configService.get<string>('DIDIT_WEBHOOK_SECRET');
    if (!secret) {
      // Fail CLOSED in production: without the secret anyone could POST a
      // forged "KYC approved" event and bypass identity verification. Only
      // skip the check in dev (mirrors the Stripe webhook's fail-closed).
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException(
          'KYC webhook signature verification is not configured.',
        );
      }
      this.logger.warn(
        'DIDIT_WEBHOOK_SECRET not set — webhook signature verification skipped (dev only).',
      );
      return;
    }
    const headers = (req?.headers ?? {}) as Record<string, string | string[] | undefined>;
    const sigHeader =
      (headers['x-signature'] as string | undefined) ??
      (headers['x-didit-signature'] as string | undefined);
    if (!sigHeader) {
      throw new UnauthorizedException('Missing webhook signature header.');
    }
    const raw = (req as FastifyRequest & { rawBody?: Buffer | string }).rawBody;
    const rawBody =
      raw != null
        ? typeof raw === 'string'
          ? raw
          : raw.toString('utf8')
        : typeof body === 'string'
          ? body
          : JSON.stringify(body);
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(sigHeader.replace(/^sha256=/i, ''), 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      this.logger.warn('Didit webhook signature mismatch.');
      throw new UnauthorizedException('Invalid webhook signature.');
    }
  }

  /**
   * Plain-HTML landing page Didit redirects to after the user finishes
   * (or cancels) verification. expo-web-browser's openAuthSessionAsync
   * watches for this redirect and closes itself. We return a minimal
   * page so anyone hitting the URL in a regular browser sees something
   * meaningful.
   */
  @Public()
  @Get('callback')
  callback(@Res() reply: FastifyReply) {
    reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(`<!doctype html><html><head><title>GetDraft — verification complete</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}
.card{max-width:420px}
h1{font-size:22px;margin:12px 0 8px}
p{color:rgba(255,255,255,0.7);line-height:1.55}
</style>
</head><body><div class="card">
<h1>Thanks — you can return to the app.</h1>
<p>GetDraft is finalising your verification. Close this page if it didn't close automatically.</p>
</div></body></html>`);
  }
}
