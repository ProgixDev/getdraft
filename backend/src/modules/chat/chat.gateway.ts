import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { SupabaseService } from '../../config/supabase.config';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private chatService: ChatService,
    private supabaseService: SupabaseService,
  ) {}

  // Run token validation during the socket handshake (NOT post-connect). This
  // means the 'connect' event the client receives is only fired AFTER userId
  // is set on socket.data — so the very first emit (e.g. join_thread) is
  // authenticated, no race.
  afterInit(server: Server) {
    server.use(async (socket: Socket, next: (err?: Error) => void) => {
      const token = this.extractToken(socket);
      if (!token) {
        this.logger.warn(`WS handshake refused: missing token (${socket.id})`);
        return next(new Error('missing token'));
      }
      const supabase = this.supabaseService.getClient();
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        this.logger.warn(`WS handshake refused: invalid token (${socket.id})`);
        return next(new Error('invalid token'));
      }
      socket.data.userId = user.id;
      next();
    });
  }

  handleConnection(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (userId) client.join(`user:${userId}`);
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
    } catch (error: any) {
      client.emit('error', {
        message: error?.message || 'Failed to send message',
      });
    }
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

  broadcastMessage(matchId: string, message: any, senderId: string) {
    this.server.to(`thread:${matchId}`).emit('new_message', {
      id: message.id,
      matchId,
      senderId,
      text: message.text,
      createdAt: message.created_at,
    });
  }

  // ---- DM conversation events (open private DMs) ----

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.requireUserId(client);
    if (!userId) return;
    if (!(await this.userBelongsToConversation(userId, data.conversationId))) {
      client.emit('error', { message: 'Not authorized for this conversation' });
      return;
    }
    client.join(`conv:${data.conversationId}`);
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conv:${data.conversationId}`);
  }

  @SubscribeMessage('send_dm')
  async handleSendDm(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; text: string },
  ) {
    const userId = this.requireUserId(client);
    if (!userId) return;
    if (!(await this.userBelongsToConversation(userId, data.conversationId))) {
      client.emit('error', { message: 'Not authorized for this conversation' });
      return;
    }
    try {
      const text = (data.text ?? '').toString();
      if (!text.trim()) return;
      const supabase = this.supabaseService.getAdminClient();
      const { data: row, error } = await supabase
        .from('direct_messages')
        .insert({
          conversation_id: data.conversationId,
          sender_id: userId,
          text,
        })
        .select('id, text, created_at')
        .single();
      if (error || !row) throw new Error(error?.message ?? 'insert failed');
      this.broadcastDm(data.conversationId, row, userId);
    } catch (error: any) {
      client.emit('error', {
        message: error?.message || 'Failed to send DM',
      });
    }
  }

  broadcastDm(conversationId: string, message: any, senderId: string) {
    this.server.to(`conv:${conversationId}`).emit('new_dm', {
      id: message.id,
      conversationId,
      senderId,
      text: message.text,
      createdAt: message.created_at,
    });
  }

  private async userBelongsToConversation(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const supabase = this.supabaseService.getAdminClient();
    const { data } = await supabase
      .from('conversations')
      .select('user_a_id, user_b_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (!data) return false;
    return data.user_a_id === userId || data.user_b_id === userId;
  }

  private extractToken(client: Socket): string | null {
    const authHeader =
      (client.handshake.headers?.authorization as string) || '';
    if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);

    const queryToken =
      client.handshake.auth?.token || client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.length > 0)
      return queryToken;

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
