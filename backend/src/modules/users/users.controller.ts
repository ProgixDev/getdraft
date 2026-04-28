import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
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

  @Get(':id')
  @ApiOperation({ summary: 'Get public user profile' })
  getPublicProfile(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }

  @Post(':id/view')
  @ApiOperation({ summary: 'Track a profile view' })
  trackView(
    @CurrentUser('id') viewerId: string,
    @Param('id') viewedId: string,
  ) {
    return this.usersService.trackProfileView(viewerId, viewedId);
  }

  @Post(':id/block')
  @ApiOperation({ summary: 'Block a user' })
  blockUser(
    @CurrentUser('id') blockerId: string,
    @Param('id') blockedId: string,
  ) {
    return this.usersService.blockUser(blockerId, blockedId);
  }

  @Delete(':id/block')
  @ApiOperation({ summary: 'Unblock a user' })
  unblockUser(
    @CurrentUser('id') blockerId: string,
    @Param('id') blockedId: string,
  ) {
    return this.usersService.unblockUser(blockerId, blockedId);
  }
}
