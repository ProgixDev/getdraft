import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { SupabaseService } from '../../config/supabase.config';
import { NotificationsService } from '../notifications/notifications.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private chatService: ChatService,
    private supabaseService: SupabaseService,
    private notificationsService: NotificationsService,
  ) {}

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`WS connection refused: missing token (${client.id})`);
      client.disconnect(true);
      return;
    }

    const supabase = this.supabaseService.getClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      this.logger.warn(`WS connection refused: invalid token (${client.id})`);
      client.disconnect(true);
      return;
    }

    client.data.userId = user.id;
    client.join(`user:${user.id}`);
  }

  handleDisconnect(_client: Socket) {
    // socket.io cleans rooms automatically
  }

  @SubscribeMessage('join_thread')
  async handleJoinThread(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    const userId = this.requireUserId(client);
    if (!userId) return;
    if (!(await this.userBelongsToMatch(userId, data.matchId))) {
      client.emit('error', { message: 'Not authorized for this thread' });
      return;
    }
    client.join(`thread:${data.matchId}`);
  }

  @SubscribeMessage('leave_thread')
  handleLeaveThread(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    client.leave(`thread:${data.matchId}`);
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; text: string },
  ) {
    const userId = this.requireUserId(client);
    if (!userId) return;

    try {
      const message = await this.chatService.sendMessage(
        data.matchId,
        userId,
        data.text,
      );

      this.server.to(`thread:${data.matchId}`).emit('new_message', {
        id: message.id,
        matchId: data.matchId,
        senderId: userId,
        text: data.text,
        createdAt: message.created_at,
      });

      // Push to recipient if they're not actively viewing this thread.
      // Resolve the recipient (the other user on the match) and check whether
      // any of their sockets is in the thread room.
      const recipientId = await this.getOtherUserId(data.matchId, userId);
      if (recipientId) {
        const threadSockets = await this.server
          .in(`thread:${data.matchId}`)
          .fetchSockets();
        const recipientInThread = threadSockets.some(
          (s) => (s.data as any).userId === recipientId,
        );
        if (!recipientInThread) {
          const senderName = await this.getUserName(userId);
          await this.notificationsService.sendPushToUser(
            recipientId,
            senderName ? `New message from ${senderName}` : 'New message',
            data.text.length > 120 ? data.text.slice(0, 117) + '…' : data.text,
            { type: 'new_message', matchId: data.matchId },
          );
        }
      }
    } catch (error: any) {
      client.emit('error', {
        message: error?.message || 'Failed to send message',
      });
    }
  }

  private async getOtherUserId(
    matchId: string,
    userId: string,
  ): Promise<string | null> {
    const supabase = this.supabaseService.getAdminClient();
    const { data } = await supabase
      .from('matches')
      .select('user_1_id, user_2_id')
      .eq('id', matchId)
      .maybeSingle();
    if (!data) return null;
    if (data.user_1_id === userId) return data.user_2_id;
    if (data.user_2_id === userId) return data.user_1_id;
    return null;
  }

  private async getUserName(userId: string): Promise<string | null> {
    const supabase = this.supabaseService.getAdminClient();
    const { data } = await supabase
      .from('users')
      .select('name')
      .eq('id', userId)
      .maybeSingle();
    return data?.name ?? null;
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; isTyping: boolean },
  ) {
    const userId = this.requireUserId(client);
    if (!userId) return;
    client.to(`thread:${data.matchId}`).emit('user_typing', {
      matchId: data.matchId,
      userId,
      isTyping: data.isTyping,
    });
  }

  emitNewMatch(userId: string, matchData: any) {
    this.server.to(`user:${userId}`).emit('new_match', matchData);
  }

  private extractToken(client: Socket): string | null {
    const authHeader = (client.handshake.headers?.authorization as string) || '';
    if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);

    const queryToken = client.handshake.auth?.token || client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.length > 0) return queryToken;

    return null;
  }

  private requireUserId(client: Socket): string | null {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      client.emit('error', { message: 'Unauthenticated' });
      return null;
    }
    return userId;
  }

  private async userBelongsToMatch(
    userId: string,
    matchId: string,
  ): Promise<boolean> {
    const supabase = this.supabaseService.getAdminClient();
    const { data } = await supabase
      .from('matches')
      .select('user_1_id, user_2_id, is_active')
      .eq('id', matchId)
      .maybeSingle();

    if (!data || !data.is_active) return false;
    return data.user_1_id === userId || data.user_2_id === userId;
  }
}
