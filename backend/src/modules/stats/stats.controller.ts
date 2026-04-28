import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { Public } from '../../common/decorators/public.decorator';

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
  getProfileStats(@Param('userId') userId: string) {
    return this.statsService.getProfileStats(userId);
  }
}
