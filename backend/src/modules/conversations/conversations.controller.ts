import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { GetOrCreateConversationDto } from './dto/get-or-create.dto';
import { SendDmDto } from './dto/send-dm.dto';
import { ChatGateway } from '../chat/chat.gateway';

@ApiTags('Conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(
    private conversations: ConversationsService,
    private chatGateway: ChatGateway,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Get-or-create a DM conversation with another user' })
  getOrCreate(
    @CurrentUser('id') meId: string,
    @Body() dto: GetOrCreateConversationDto,
  ) {
    return this.conversations.getOrCreate(meId, dto.userId);
  }

  @Get()
  @ApiOperation({ summary: 'My DM inbox (newest first)' })
  inbox(@CurrentUser('id') meId: string) {
    return this.conversations.getInbox(meId);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Conversation messages (50 newest before cursor)' })
  messages(
    @CurrentUser('id') meId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.conversations.getMessages(meId, id, cursor);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a DM (REST fallback; also broadcasts)' })
  async sendMessage(
    @CurrentUser('id') meId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendDmDto,
  ) {
    const msg = await this.conversations.sendMessage(meId, id, dto.text);
    try {
      this.chatGateway.broadcastDm(
        id,
        { id: msg.id, text: msg.text, created_at: msg.createdAt },
        meId,
      );
      const recipientId =
        await this.chatGateway.resolveOtherConversationUserId(meId, id);
      await this.chatGateway.pushDmIfRecipientOffline(
        id,
        meId,
        recipientId,
        dto.text,
      );
    } catch {
      // broadcast/push best-effort
    }
    return msg;
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Mark conversation as read (mine = unread by me)' })
  markRead(
    @CurrentUser('id') meId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.markRead(meId, id);
  }
}
