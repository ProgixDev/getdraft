import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GuardianLinksService } from './guardian-links.service';
import type { GuardianLinkStatus, GuardianRelationship } from './guardian-links.service';

@ApiTags('Guardian Links')
@ApiBearerAuth()
@Controller('guardian-links')
export class GuardianLinksController {
  constructor(private readonly service: GuardianLinksService) {}

  // ──────────── Athlete-side ────────────

  @Post('qr')
  @ApiOperation({ summary: 'Athlete: mint a fresh QR token (expires in 10 min).' })
  issueQr(@CurrentUser('id') userId: string) {
    return this.service.issueQr(userId);
  }

  @Get('my-athlete-links')
  @ApiOperation({ summary: 'Athlete: list guardians linked (or pending) to me.' })
  listForAthlete(@CurrentUser('id') userId: string) {
    return this.service.listForAthlete(userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Athlete: revoke a guardian link.' })
  revoke(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.revoke(userId, id);
  }

  // ──────────── Guardian (parent) side ────────────

  @Post('scan')
  @ApiOperation({
    summary:
      'Guardian: submit a scanned QR token + relationship + questionnaire. Creates the link in pending_video state.',
  })
  scan(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      qrToken: string;
      relationship: GuardianRelationship;
      questionnaire: Record<string, unknown>;
    },
  ) {
    return this.service.submitScan(userId, body);
  }

  @Post('video-upload-url')
  @ApiOperation({ summary: 'Guardian: get a signed URL for the declaration video upload.' })
  videoUploadUrl(
    @CurrentUser('id') userId: string,
    @Body() body: { linkId: string; fileName: string },
  ) {
    return this.service.getVideoUploadUrl(userId, body);
  }

  @Post('submit-video')
  @ApiOperation({ summary: 'Guardian: confirm the video upload finished; flips status to pending_admin.' })
  submitVideo(
    @CurrentUser('id') userId: string,
    @Body() body: { linkId: string; storagePath: string },
  ) {
    return this.service.submitVideo(userId, body);
  }

  @Get('me')
  @ApiOperation({ summary: 'Guardian: read my current link status.' })
  getMyLink(@CurrentUser('id') userId: string) {
    return this.service.getMyLink(userId);
  }

  // ──────────── Admin ────────────

  @Get('admin')
  @ApiOperation({ summary: 'Admin: list links, optionally filtered by status.' })
  adminList(@Query('status') status?: GuardianLinkStatus) {
    // The global RolesGuard expects @Roles decorator usage; for now we
    // accept any authenticated user and rely on the AdminModule's own
    // gate added in 015. TODO: add @Roles('admin') here.
    return this.service.adminList(status);
  }

  @Post('admin/:id/approve')
  @ApiOperation({ summary: 'Admin: approve a guardian link.' })
  adminApprove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    return this.service.adminDecide(userId, id, 'approved', body?.notes);
  }

  @Post('admin/:id/decline')
  @ApiOperation({ summary: 'Admin: decline a guardian link.' })
  adminDecline(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    return this.service.adminDecide(userId, id, 'declined', body?.notes);
  }
}
