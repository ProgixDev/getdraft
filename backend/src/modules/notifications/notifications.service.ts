import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../config/supabase.config';
import { PushPlatform } from '../../common/types';

/** Expo's documented cap on messages per /push/send request. */
const EXPO_CHUNK_SIZE = 100;

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService,
  ) {}

  async registerToken(userId: string, token: string, platform: PushPlatform) {
    const supabase = this.supabaseService.getAdminClient();

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { user_id: userId, token, platform },
        { onConflict: 'user_id,token' },
      );

    if (error) throw new BadRequestException(error.message);

    return { message: 'Token registered' };
  }

  async removeToken(userId: string, token: string) {
    const supabase = this.supabaseService.getAdminClient();

    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);

    return { message: 'Token removed' };
  }

  /**
   * Categories map to the toggles on the Settings screen
   * (users.preferences.{matchAlerts,messageNotifications,recruiterActivity}).
   * A falsy preference value suppresses the push. Categories the user
   * cannot toggle off (account/security/billing in the future) pass
   * undefined and always send.
   *
   * Default-true (silent absence) is intentional: a new user with no
   * preferences yet should receive notifications.
   */
  async sendPushToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    category?: 'matchAlerts' | 'messageNotifications' | 'recruiterActivity',
  ) {
    const supabase = this.supabaseService.getAdminClient();

    if (category) {
      const { data: row } = await supabase
        .from('users')
        .select('preferences')
        .eq('id', userId)
        .maybeSingle();
      const prefs = (row?.preferences ?? {}) as Record<string, unknown>;
      // Explicit `false` = opted out. `undefined` / `null` = default on.
      if (prefs[category] === false) {
        this.logger.log(
          `[push] suppressed ${category} for user ${userId} (preference off)`,
        );
        return;
      }
    }

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId);

    if (!tokens || tokens.length === 0) return;

    const messages: PushMessage[] = tokens.map((t) => ({
      to: t.token,
      title,
      body,
      data,
    }));

    await this.sendExpoPush(messages);
  }

  private async sendExpoPush(messages: PushMessage[]) {
    const accessToken = this.configService.get('EXPO_ACCESS_TOKEN');

    // Expo rejects more than 100 messages in a single request.
    for (let i = 0; i < messages.length; i += EXPO_CHUNK_SIZE) {
      await this.postChunk(messages.slice(i, i + EXPO_CHUNK_SIZE), accessToken);
    }
  }

  /**
   * Expo answers 200 even when every message in the batch failed — the real
   * outcome is per-message, in `data[i].status`, positionally matching the
   * request. Ignoring the body makes a fully broken push setup look identical
   * to a working one, so we read it: dead tokens get pruned, and anything
   * else is logged loudly enough to be found in Railway.
   */
  private async postChunk(chunk: PushMessage[], accessToken?: string) {
    let payload: any;

    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.error(
          `[push] Expo returned HTTP ${res.status} for ${chunk.length} message(s): ${detail.slice(0, 400)}`,
        );
        return;
      }

      payload = await res.json();
    } catch (err: any) {
      // Delivery is best-effort — a push failure must never break the request
      // that triggered it (a message send, a match, a draft).
      this.logger.error(`[push] Expo request failed: ${err?.message || 'unknown'}`);
      return;
    }

    // Request-level rejection (bad access token, malformed body).
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      this.logger.error(
        `[push] Expo rejected the batch: ${JSON.stringify(payload.errors).slice(0, 400)}`,
      );
      return;
    }

    const tickets: any[] = Array.isArray(payload?.data) ? payload.data : [];
    const staleTokens: string[] = [];

    tickets.forEach((ticket, index) => {
      if (ticket?.status !== 'error') return;

      const token = chunk[index]?.to;
      const code = ticket?.details?.error;

      if (code === 'DeviceNotRegistered') {
        // App uninstalled or notifications revoked. The token is permanently
        // dead; leaving it behind means re-sending to it on every future push.
        if (token) staleTokens.push(token);
        return;
      }

      if (code === 'InvalidCredentials') {
        // The push credential Expo holds for this project is missing or wrong
        // — on Android that means no FCM V1 service account has been uploaded.
        // This affects every device, not just this one, so say so plainly.
        this.logger.error(
          `[push] InvalidCredentials — Expo has no valid FCM credential for this project. ` +
            `Upload the FCM V1 service account key (eas credentials). Nothing will deliver until then.`,
        );
        return;
      }

      this.logger.warn(
        `[push] delivery error${code ? ` (${code})` : ''}: ${ticket?.message ?? 'unknown'}`,
      );
    });

    if (staleTokens.length > 0) await this.pruneTokens(staleTokens);
  }

  /** Drops tokens Expo has told us no longer belong to an installed app. */
  private async pruneTokens(tokens: string[]) {
    const supabase = this.supabaseService.getAdminClient();

    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .in('token', tokens);

    if (error) {
      this.logger.warn(`[push] could not prune ${tokens.length} dead token(s): ${error.message}`);
      return;
    }

    this.logger.log(`[push] pruned ${tokens.length} unregistered token(s)`);
  }
}
