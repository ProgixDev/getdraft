import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OutreachService } from './outreach.service';
import {
  CreateOutreachDto,
  UpdateOutreachStatusDto,
  SendOutreachMessageDto,
} from './dto/create-outreach.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../../common/types';

@ApiTags('Outreach (Parent-Recruiter)')
@ApiBearerAuth()
@Controller('outreach')
export class OutreachController {
  constructor(private outreachService: OutreachService) {}

  @Post()
  @ApiOperation({ summary: 'Recruiter sends outreach to a parent' })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateOutreachDto,
  ) {
    return this.outreachService.createOutreach(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get outreach list (parent or recruiter)' })
  getList(@CurrentUser() user: CurrentUserPayload) {
    return this.outreachService.getOutreachList(user.id, user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get outreach details' })
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.outreachService.getOutreach(id, userId);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Parent updates outreach status' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateOutreachStatusDto,
  ) {
    return this.outreachService.updateOutreachStatus(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an outreach thread (any participant)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.outreachService.deleteOutreach(id, userId);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send message in outreach thread' })
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendOutreachMessageDto,
  ) {
    return this.outreachService.sendMessage(id, userId, dto);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get outreach messages' })
  getMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.outreachService.getMessages(id, userId);
  }
}
