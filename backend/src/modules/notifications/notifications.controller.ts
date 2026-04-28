import { Controller, Post, Delete, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { RegisterTokenDto } from './dto/register-token.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Post('register-token')
  @ApiOperation({ summary: 'Register Expo push token' })
  registerToken(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterTokenDto,
  ) {
    return this.notificationsService.registerToken(
      userId,
      dto.token,
      dto.platform,
    );
  }

  @Delete('token')
  @ApiOperation({ summary: 'Remove push token (on logout)' })
  removeToken(
    @CurrentUser('id') userId: string,
    @Body('token') token: string,
  ) {
    return this.notificationsService.removeToken(userId, token);
  }
}
