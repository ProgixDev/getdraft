import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { BlockUserDto } from './dto/block-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../../common/types';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return this.usersService.getMe(user);
  }

  @Put('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateMe(user, dto);
  }

  @Put('me/onboarding')
  @ApiOperation({ summary: 'Mark onboarding as complete' })
  completeOnboarding(@CurrentUser('id') userId: string) {
    return this.usersService.completeOnboarding(userId);
  }

  @Get('me/blocks')
  @ApiOperation({ summary: 'List users I have blocked' })
  listMyBlocks(@CurrentUser('id') userId: string) {
    return this.usersService.listMyBlocks(userId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search users by name (for compose)' })
  searchUsers(
    @CurrentUser('id') userId: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    const lim = Math.max(1, Math.min(50, Number(limit ?? 20) || 20));
    return this.usersService.searchUsers(userId, q ?? '', lim);
  }

  @Get('me/profile-views')
  @ApiOperation({ summary: 'List recent viewers of my profile' })
  listProfileViewers(@CurrentUser('id') userId: string) {
    return this.usersService.listProfileViewers(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get public user profile' })
  getPublicProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getPublicProfile(id);
  }

  @Post(':id/view')
  @ApiOperation({ summary: 'Track a profile view' })
  trackView(
    @CurrentUser('id') viewerId: string,
    @Param('id', ParseUUIDPipe) viewedId: string,
  ) {
    return this.usersService.trackProfileView(viewerId, viewedId);
  }

  @Post(':id/block')
  @ApiOperation({ summary: 'Block a user' })
  blockUser(
    @CurrentUser('id') blockerId: string,
    @Param('id', ParseUUIDPipe) blockedId: string,
    @Body() dto: BlockUserDto,
  ) {
    return this.usersService.blockUser(blockerId, blockedId, dto);
  }

  @Delete(':id/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unblock a user' })
  async unblockUser(
    @CurrentUser('id') blockerId: string,
    @Param('id', ParseUUIDPipe) blockedId: string,
  ) {
    await this.usersService.unblockUser(blockerId, blockedId);
  }
}
