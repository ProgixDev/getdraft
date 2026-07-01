import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../config/supabase.config';
import {
  DiditService,
  DiditDecisionResponse,
  normalizeDiditStatus,
} from './didit.service';
import { isMinor } from '../../common/utils/age';

export type KycStatus = 'none' | 'pending' | 'in_review' | 'approved' | 'declined';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private supabaseService: SupabaseService,
    private diditService: DiditService,
    private configService: ConfigService,
  ) {}

  /**
   * Dev-only escape hatch — flips the user to approved without going
   * through Didit. Guarded by NODE_ENV so production never has this.
   * Used by the simulator/dev-build "Skip verification" button.
   */
  async devApprove(userId: string): Promise<{ kycStatus: KycStatus }> {
    const env = this.configService.get<string>('NODE_ENV') ?? 'development';
    // Testing override: allow in production ONLY when ALLOW_KYC_DEV_SKIP=true.
    // MUST be turned off (unset this Railway var) before public launch.
    const allowOverride =
      this.configService.get<string>('ALLOW_KYC_DEV_SKIP') === 'true';
    if (env === 'production' && !allowOverride) {
      throw new BadRequestException('Dev approve is disabled in production.');
    }
    const admin = this.supabaseService.getAdminClient();
    const { error } = await admin
      .from('users')
      .update({
        kyc_status: 'approved',
        kyc_completed_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (error) throw new BadRequestException(error.message);
    this.logger.warn(`[dev] KYC bypassed for user ${userId}`);
    return { kycStatus: 'approved' };
  }

  /**
   * Start (or restart) a verification session for the given user. If
   * the user has an existing approved session, we no-op and return the
   * cached info. For 'pending'/'in_review' we return the existing
   * session url so retries don't burn credits.
   */
  async startSession(
    userId: string,
    clientCallbackUrl?: string,
  ): Promise<{
    sessionId: string;
    url: string;
    status: KycStatus;
  }> {
    const admin = this.supabaseService.getAdminClient();

    const { data: user } = await admin
      .from('users')
      .select('id, kyc_status')
      .eq('id', userId)
      .maybeSingle();
    if (!user) throw new NotFoundException('User not found.');
    if (user.kyc_status === 'approved') {
      throw new BadRequestException('Already verified.');
    }

    // Reuse an in-flight session if there is one (cuts cost and matches
    // Didit's per-user retry semantics).
    const { data: existing } = await admin
      .from('kyc_sessions')
      .select('didit_session_id, verification_url, status')
      .eq('user_id', userId)
      .in('status', ['pending', 'in_review'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && existing.verification_url) {
      return {
        sessionId: existing.didit_session_id,
        url: existing.verification_url,
        status: existing.status as KycStatus,
      };
    }

    // Otherwise create a fresh session at Didit. The client passes its
    // own deep-link return URL (e.g. getdraft://kyc/return) so the
    // in-app browser auto-closes after verification.
    const callbackUrl = clientCallbackUrl ?? this.callbackUrlFor(userId);
    const session = await this.diditService.createSession(userId, callbackUrl);
    const workflowId = this.diditService.getDefaultWorkflowId();

    const { error } = await admin.from('kyc_sessions').insert({
      user_id: userId,
      didit_session_id: session.session_id,
      workflow_id: workflowId,
      status: normalizeDiditStatus(session.status),
      verification_url: session.url,
      callback_url: callbackUrl,
    });
    if (error) {
      this.logger.error(`Insert kyc_session failed for ${userId}: ${error.message}`);
      throw new BadRequestException('Could not store the verification session.');
    }

    await admin
      .from('users')
      .update({ kyc_status: 'pending' })
      .eq('id', userId);

    return {
      sessionId: session.session_id,
      url: session.url,
      status: 'pending',
    };
  }

  /**
   * Lightweight status read used by the frontend's polling loop.
   * Pulls the latest kyc_sessions row + the denormalised
   * users.kyc_status. If the local row is still pending, ping Didit
   * to refresh — covers the case where the webhook hasn't arrived.
   */
  async getStatus(userId: string): Promise<{
    kycStatus: KycStatus;
    sessionId: string | null;
    decisionPreview: { status: string } | null;
  }> {
    const admin = this.supabaseService.getAdminClient();

    const { data: user } = await admin
      .from('users')
      .select('kyc_status, role')
      .eq('id', userId)
      .maybeSingle();
    if (!user) throw new NotFoundException('User not found.');

    // Minors are KYC-exempt: young athletes have no government ID, and the
    // guardian-consent flow (parent video + QR + the guardian's own KYC) is
    // their verification. Report as "approved" so onboarding skips the ID
    // step — the guardian-activation gate still applies. Adults are unaffected.
    if (user.role === 'athlete') {
      const { data: prof } = await admin
        .from('athlete_profiles')
        .select('date_of_birth')
        .eq('user_id', userId)
        .maybeSingle();
      if (isMinor(prof?.date_of_birth)) {
        return { kycStatus: 'approved', sessionId: null, decisionPreview: null };
      }
    }

    const { data: latest } = await admin
      .from('kyc_sessions')
      .select('id, didit_session_id, status, decision')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If the local view is still pending and Didit is configured,
    // refresh from upstream. Don't fail the request if the upstream
    // ping itself errors — just return the stale local view.
    if (
      latest &&
      (latest.status === 'pending' || latest.status === 'in_review') &&
      this.diditService.isConfigured()
    ) {
      try {
        const decision = await this.diditService.getSessionDecision(latest.didit_session_id);
        await this.applyDecision(latest.didit_session_id, decision);
      } catch (err: any) {
        this.logger.warn(
          `Didit decision refresh failed for ${latest.didit_session_id}: ${err?.message ?? err}`,
        );
      }
    }

    // Re-read after potential update.
    const { data: refreshedUser } = await admin
      .from('users')
      .select('kyc_status')
      .eq('id', userId)
      .maybeSingle();

    return {
      kycStatus: (refreshedUser?.kyc_status ?? user.kyc_status ?? 'none') as KycStatus,
      sessionId: latest?.didit_session_id ?? null,
      decisionPreview: latest ? { status: latest.status } : null,
    };
  }

  /**
   * Webhook handler — applies a decision payload to the matching
   * session row and the user's denormalised kyc_status.
   */
  async handleWebhook(payload: unknown): Promise<void> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Empty webhook payload.');
    }
    const p = payload as Record<string, any>;
    const sessionId = (p.session_id ?? p.id) as string | undefined;
    if (!sessionId) {
      throw new BadRequestException('Webhook payload missing session_id.');
    }
    await this.applyDecision(sessionId, p as DiditDecisionResponse);
  }

  // ----- internals -----

  private async applyDecision(
    sessionId: string,
    decision: DiditDecisionResponse,
  ): Promise<void> {
    const admin = this.supabaseService.getAdminClient();
    const compact = normalizeDiditStatus(decision.status);

    const { data: row } = await admin
      .from('kyc_sessions')
      .select('id, user_id, status')
      .eq('didit_session_id', sessionId)
      .maybeSingle();
    if (!row) {
      this.logger.warn(`applyDecision: unknown didit_session_id ${sessionId}`);
      return;
    }
    if (row.status === compact) return; // idempotent — no change

    const now = new Date().toISOString();
    const completed = ['approved', 'declined', 'expired'].includes(compact);
    await admin
      .from('kyc_sessions')
      .update({
        status: compact,
        decision: decision as any,
        completed_at: completed ? now : null,
      })
      .eq('id', row.id);

    // Mirror to users — BUT never regress an already-approved user.
    // A delayed Abandoned/Expired/Declined webhook for an OLD session
    // (the user retried and was approved on a later one) would otherwise
    // set their users.kyc_status back to none/declined and lock them out.
    // The kyc_sessions row itself stays up-to-date above for audit; we
    // just refuse to overwrite the user-level flag if it's already
    // approved AND the incoming decision isn't itself an approval.
    const userStatus: KycStatus =
      compact === 'expired' ? 'none' : (compact as KycStatus);

    if (userStatus !== 'approved') {
      const { data: currentUser } = await admin
        .from('users')
        .select('kyc_status')
        .eq('id', row.user_id)
        .maybeSingle();
      if (currentUser?.kyc_status === 'approved') {
        this.logger.log(
          `[kyc] ignoring late ${compact} decision for user ${row.user_id} — already approved`,
        );
        return;
      }
    }

    await admin
      .from('users')
      .update({
        kyc_status: userStatus,
        kyc_completed_at: completed ? now : null,
      })
      .eq('id', row.user_id);
  }

  private callbackUrlFor(_userId: string): string {
    // For dev the user returns to the app via expo-web-browser's
    // dismissBrowser, so the URL just needs to be a valid string
    // Didit can serve a landing page at. We point at our backend's
    // health endpoint as a stable fallback; the real "return to app"
    // happens via WebBrowser.openAuthSessionAsync on the client.
    const base = this.configService.get<string>('PUBLIC_BACKEND_URL') ?? 'http://localhost:3000';
    return `${base}/api/kyc/callback`;
  }
}
