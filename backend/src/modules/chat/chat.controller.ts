import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { SendMessageDto } from './dto/send-message.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(
    private chatService: ChatService,
    private chatGateway: ChatGateway,
  ) {}

  @Get('threads')
  @ApiOperation({ summary: 'Get all chat threads' })
  getThreads(@CurrentUser('id') userId: string) {
    return this.chatService.getThreads(userId);
  }

  @Get('threads/:matchId/messages')
  @ApiOperation({ summary: 'Get messages in a thread' })
  getMessages(
    @Param('matchId') matchId: string,
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.chatService.getMessages(matchId, userId, cursor);
  }

  @Post('threads/:matchId/messages')
  @ApiOperation({ summary: 'Send a message (REST fallback, also broadcasts)' })
  async sendMessage(
    @Param('matchId') matchId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    const message = await this.chatService.sendMessage(matchId, userId, dto.text);
    try {
      this.chatGateway.broadcastMessage(matchId, message, userId);
    } catch {
      // Broadcast is best-effort; REST send already persisted.
    }
    return message;
  }

  @Put('threads/:matchId/read')
  @ApiOperation({ summary: 'Mark messages as read' })
  markAsRead(
    @Param('matchId') matchId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.markAsRead(matchId, userId);
  }
}
