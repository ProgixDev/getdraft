import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../config/supabase.config';
import { PushPlatform } from '../../common/types';

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

  async registerToken(
    userId: string,
    token: string,
    platform: PushPlatform,
  ) {
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

  async sendPushToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    const supabase = this.supabaseService.getAdminClient();

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

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {}),
        },
        body: JSON.stringify(messages),
      });
    } catch (err: any) {
      // Push notifications are best-effort but we log the failure to aid ops.
      this.logger.warn(`Expo push failed: ${err?.message || 'unknown'}`);
    }
  }
}
