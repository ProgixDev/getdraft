import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private chatService: ChatService) {}

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      client.join(`user:${userId}`);
    }
  }

  handleDisconnect(client: Socket) {
    // cleanup handled by socket.io
  }

  @SubscribeMessage('join_thread')
  handleJoinThread(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ) {
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
    const userId = client.handshake.query.userId as string;
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
    } catch (error) {
      client.emit('error', { message: 'Failed to send message' });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; isTyping: boolean },
  ) {
    const userId = client.handshake.query.userId as string;
    client.to(`thread:${data.matchId}`).emit('user_typing', {
      matchId: data.matchId,
      userId,
      isTyping: data.isTyping,
    });
  }

  // Called by other services to notify a new match
  emitNewMatch(userId: string, matchData: any) {
    this.server.to(`user:${userId}`).emit('new_match', matchData);
  }
}
