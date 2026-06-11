import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { SupabaseService } from '../../config/supabase.config';
import { UserRole } from '../../common/types';

export type GuardianRelationship =
  | 'parent'
  | 'legal_guardian'
  | 'step_parent'
  | 'sibling'
  | 'aunt_uncle'
  | 'grandparent'
  | 'other';

export type GuardianLinkStatus =
  | 'pending_video'
  | 'pending_admin'
  | 'approved'
  | 'declined'
  | 'expired';

const QR_TTL_SECONDS = 10 * 60; // 10 minutes — short enough to limit replay.
const VIDEO_BUCKET = 'guardian-videos';

@Injectable()
export class GuardianLinksService {
  private readonly logger = new Logger(GuardianLinksService.name);

  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService,
  ) {}

  // ───────────────────────────────────────────────────────────────────
  // Token signing
  // ───────────────────────────────────────────────────────────────────

  private get secret(): string {
    return (
      this.configService.get<string>('GUARDIAN_QR_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      'dev-fallback-secret'
    );
  }

  /**
   * Compact "athleteId.exp.nonce.sig" token printed in the QR. We avoid
   * a full JWT lib because the payload is tiny and we want the QR to
   * scan reliably on cheap printers / dim phones.
   */
  private signToken(athleteId: string): { token: string; expiresAt: string } {
    const exp = Math.floor(Date.now() / 1000) + QR_TTL_SECONDS;
    const nonce = crypto.randomBytes(8).toString('hex');
    const payload = `${athleteId}.${exp}.${nonce}`;
    const sig = crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex')
      .slice(0, 32); // 128 bits is plenty here.
    return {
      token: `${payload}.${sig}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  private verifyToken(token: string): { athleteId: string } {
    const parts = (token || '').split('.');
    if (parts.length !== 4) {
      throw new BadRequestException('Malformed QR token.');
    }
    const [athleteId, expStr, nonce, sig] = parts;
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(`${athleteId}.${expStr}.${nonce}`)
      .digest('hex')
      .slice(0, 32);
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid QR signature.');
    }
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
      throw new BadRequestException('QR code has expired. Ask the athlete to refresh it.');
    }
    return { athleteId };
  }

  // ───────────────────────────────────────────────────────────────────
  // Athlete endpoints
  // ───────────────────────────────────────────────────────────────────

  /** Athlete generates a fresh QR token. Old tokens just expire on their own. */
  async issueQr(athleteUserId: string) {
    // Refuse to mint a QR for non-athletes — would just produce a token
    // the parent-side scan would reject with the confusing "Athlete
    // not found" error.
    const supabase = this.supabaseService.getAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', athleteUserId)
      .maybeSingle();
    if (!user) throw new NotFoundException('User not found.');
    if (user.role !== 'athlete') {
      throw new BadRequestException(
        'Only athlete accounts can generate guardian-link QR codes.',
      );
    }
    return this.signToken(athleteUserId);
  }

  /** List active links for the calling athlete (so they can see who's linked). */
  async listForAthlete(athleteUserId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('guardian_links')
      .select(
        'id, guardian_user_id, relationship, status, created_at, decided_at, ' +
          'guardian:users!guardian_links_guardian_user_id_fkey ( id, name, email, avatar_url )',
      )
      .eq('athlete_user_id', athleteUserId)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /** Athlete revokes a link (used in Settings → Linked guardians). */
  async revoke(athleteUserId: string, linkId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data: row } = await supabase
      .from('guardian_links')
      .select('athlete_user_id')
      .eq('id', linkId)
      .maybeSingle();
    if (!row) throw new NotFoundException('Link not found.');
    if (row.athlete_user_id !== athleteUserId) {
      throw new ForbiddenException('Not your link.');
    }
    const { error } = await supabase.from('guardian_links').delete().eq('id', linkId);
    if (error) throw new BadRequestException(error.message);
    return { revoked: true };
  }

  // ───────────────────────────────────────────────────────────────────
  // Guardian (parent) endpoints
  // ───────────────────────────────────────────────────────────────────

  /**
   * Parent submits a scanned QR + relationship + questionnaire. Creates
   * the link row in 'pending_video' state — the parent then has to
   * record + submit a declaration video before admin review.
   */
  async submitScan(
    guardianUserId: string,
    dto: {
      qrToken: string;
      relationship: GuardianRelationship;
      questionnaire: Record<string, unknown>;
    },
  ) {
    const { athleteId } = this.verifyToken(dto.qrToken);
    if (athleteId === guardianUserId) {
      throw new BadRequestException("You can't link to your own account.");
    }
    const supabase = this.supabaseService.getAdminClient();

    // Confirm the athlete exists and is actually an athlete-role user.
    const { data: athlete } = await supabase
      .from('users')
      .select('id, role, name')
      .eq('id', athleteId)
      .maybeSingle();
    if (!athlete) {
      this.logger.warn(`[guardian-link] scan referenced unknown athleteId=${athleteId}`);
      throw new NotFoundException('Athlete account not found. Ask them to regenerate the QR.');
    }
    if (athlete.role !== 'athlete') {
      this.logger.warn(
        `[guardian-link] scan QR for user ${athleteId} with role=${athlete.role}`,
      );
      throw new BadRequestException(
        `That QR isn't from an athlete account (role: ${athlete.role}).`,
      );
    }

    // Upsert (athlete, guardian) — if the parent rescans we re-use the
    // existing row instead of failing the unique constraint.
    const { data: existing } = await supabase
      .from('guardian_links')
      .select('id, status')
      .eq('athlete_user_id', athleteId)
      .eq('guardian_user_id', guardianUserId)
      .maybeSingle();

    if (existing && existing.status === 'approved') {
      throw new BadRequestException('You are already linked to this athlete.');
    }

    const row = {
      athlete_user_id: athleteId,
      guardian_user_id: guardianUserId,
      relationship: dto.relationship,
      questionnaire: dto.questionnaire ?? {},
      status: 'pending_video' as GuardianLinkStatus,
      qr_token: dto.qrToken,
    };

    if (existing) {
      const { data, error } = await supabase
        .from('guardian_links')
        .update(row)
        .eq('id', existing.id)
        .select()
        .maybeSingle();
      if (error) throw new BadRequestException(error.message);
      return data;
    }
    const { data, error } = await supabase
      .from('guardian_links')
      .insert(row)
      .select()
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /**
   * Returns a one-shot signed URL the client can POST the video bytes
   * to. Stored under guardian-videos/<guardianId>/<linkId>/<timestamp>.mp4.
   */
  async getVideoUploadUrl(
    guardianUserId: string,
    dto: { linkId: string; fileName: string },
  ) {
    const supabase = this.supabaseService.getAdminClient();
    const { data: link } = await supabase
      .from('guardian_links')
      .select('id, guardian_user_id, status')
      .eq('id', dto.linkId)
      .maybeSingle();
    if (!link) throw new NotFoundException('Link not found.');
    if (link.guardian_user_id !== guardianUserId) {
      throw new ForbiddenException('Not your link.');
    }
    if (link.status === 'approved' || link.status === 'declined') {
      throw new BadRequestException('This link is no longer accepting uploads.');
    }
    const safeName = (dto.fileName || 'declaration.mp4').replace(/[^A-Za-z0-9._\-]/g, '_');
    const filePath = `${guardianUserId}/${dto.linkId}/${Date.now()}-${safeName}`;
    const { data, error } = await supabase.storage
      .from(VIDEO_BUCKET)
      .createSignedUploadUrl(filePath);
    if (error) throw new BadRequestException(error.message);
    return { signedUrl: data.signedUrl, token: data.token, path: filePath };
  }

  /**
   * Parent confirms the video upload finished. Backend flips the link
   * to 'pending_admin' so the review queue picks it up.
   */
  async submitVideo(
    guardianUserId: string,
    dto: { linkId: string; storagePath: string },
  ) {
    const supabase = this.supabaseService.getAdminClient();
    const { data: link } = await supabase
      .from('guardian_links')
      .select('id, guardian_user_id, status')
      .eq('id', dto.linkId)
      .maybeSingle();
    if (!link) throw new NotFoundException('Link not found.');
    if (link.guardian_user_id !== guardianUserId) {
      throw new ForbiddenException('Not your link.');
    }
    if (!dto.storagePath?.startsWith(`${guardianUserId}/`)) {
      throw new BadRequestException('Video path does not belong to this guardian.');
    }
    const { data, error } = await supabase
      .from('guardian_links')
      .update({
        video_storage_path: dto.storagePath,
        video_recorded_at: new Date().toISOString(),
        status: 'pending_admin' as GuardianLinkStatus,
      })
      .eq('id', dto.linkId)
      .select()
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** Status read used by both the parent UI and the resume-on-reload logic. */
  async getMyLink(guardianUserId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data } = await supabase
      .from('guardian_links')
      .select(
        'id, athlete_user_id, relationship, status, video_storage_path, ' +
          'video_recorded_at, decided_at, admin_notes, created_at, ' +
          'athlete:users!guardian_links_athlete_user_id_fkey ( id, name, avatar_url )',
      )
      .eq('guardian_user_id', guardianUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  }

  // ───────────────────────────────────────────────────────────────────
  // Admin endpoints
  // ───────────────────────────────────────────────────────────────────

  async adminList(callerRole: UserRole, status?: GuardianLinkStatus) {
    // Defence in depth — the controller's @Roles guard already enforces
    // this, but a service-level check protects us if anything ever calls
    // adminList directly (cron, internal service, future refactor).
    if (callerRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin role required.');
    }
    const supabase = this.supabaseService.getAdminClient();
    let query = supabase
      .from('guardian_links')
      .select(
        'id, athlete_user_id, guardian_user_id, relationship, questionnaire, ' +
          'status, video_storage_path, video_recorded_at, admin_notes, ' +
          'created_at, decided_at, ' +
          'athlete:users!guardian_links_athlete_user_id_fkey ( id, name, email, avatar_url ), ' +
          'guardian:users!guardian_links_guardian_user_id_fkey ( id, name, email, avatar_url )',
      )
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    // Attach short-lived signed URLs so the admin UI can play the videos.
    const withVideoUrls = await Promise.all(
      (data ?? []).map(async (row: any) => {
        if (!row.video_storage_path) return row;
        const { data: signed } = await supabase.storage
          .from(VIDEO_BUCKET)
          .createSignedUrl(row.video_storage_path, 60 * 60); // 1h
        return { ...row, video_url: signed?.signedUrl ?? null };
      }),
    );
    return withVideoUrls;
  }

  async adminDecide(
    callerRole: UserRole,
    adminUserId: string,
    linkId: string,
    decision: 'approved' | 'declined',
    notes?: string,
  ) {
    if (callerRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin role required.');
    }
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('guardian_links')
      .update({
        status: decision,
        admin_notes: notes ?? null,
        decided_at: new Date().toISOString(),
        decided_by: adminUserId,
      })
      .eq('id', linkId)
      .select()
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Link not found.');
    this.logger.log(
      `[guardian-link] ${linkId} -> ${decision} by admin ${adminUserId}`,
    );
    return data;
  }
}
