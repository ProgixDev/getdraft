import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/types';

@ApiTags('Stats')
@Controller('stats')
export class StatsController {
  constructor(private statsService: StatsService) {}

  @Public()
  @Get('globe')
  @ApiOperation({ summary: 'Get globe stats by continent' })
  getGlobeStats() {
    return this.statsService.getGlobeStats();
  }

  @Public()
  @Get('welcome')
  @ApiOperation({ summary: 'Get welcome screen counters' })
  getWelcomeStats() {
    return this.statsService.getWelcomeStats();
  }

  @ApiBearerAuth()
  @Get('profile/:userId')
  @ApiOperation({ summary: 'Get profile stats (views, likes, matches)' })
  getProfileStats(
    @CurrentUser('id') viewerId: string,
    @CurrentUser('role') viewerRole: UserRole,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.statsService.getProfileStats(userId, viewerId, viewerRole);
  }
}
