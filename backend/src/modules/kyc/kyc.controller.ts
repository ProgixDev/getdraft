import { Controller, Get, Post, Body, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { KycService } from './kyc.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('KYC')
@Controller('kyc')
export class KycController {
  constructor(private kycService: KycService) {}

  @Post('start')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start (or resume) a Didit verification session' })
  start(@CurrentUser('id') userId: string) {
    return this.kycService.startSession(userId);
  }

  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current KYC status for the authenticated user' })
  status(@CurrentUser('id') userId: string) {
    return this.kycService.getStatus(userId);
  }

  @Public()
  @Post('webhooks/didit')
  @ApiOperation({ summary: 'Didit webhook receiver (decision updates)' })
  async webhook(@Body() body: unknown) {
    await this.kycService.handleWebhook(body);
    return { ok: true };
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
