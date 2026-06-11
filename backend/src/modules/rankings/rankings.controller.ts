import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RankingsService } from './rankings.service';
import type { RankingDivision } from './rankings.service';

@ApiTags('Rankings')
@ApiBearerAuth()
@Controller('rankings')
export class RankingsController {
  constructor(private rankings: RankingsService) {}

  // Open to every authenticated role: athletes check their standing,
  // recruiters scout the top of a division, parents follow their athlete.
  @Get()
  @ApiOperation({ summary: 'Athlete leaderboard by division (CA/US) and sport' })
  getRankings(
    @Query('division') division?: RankingDivision,
    @Query('sport') sport?: string,
    @Query('limit') limit?: string,
  ) {
    return this.rankings.getRankings({
      division,
      sport,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('sports')
  @ApiOperation({ summary: 'Distinct sports present in a division' })
  getSports(@Query('division') division?: RankingDivision) {
    return this.rankings.getSports(division ?? 'CA');
  }

  @Get('me')
  @ApiOperation({ summary: "The current athlete's rank within their cohort" })
  getMyRank(@CurrentUser('id') userId: string) {
    return this.rankings.getMyRank(userId);
  }

  // Public-profile credibility chip — returns the ranking row for an
  // arbitrary user id (or null when the user isn't a ranked athlete).
  @Get('user/:id')
  @ApiOperation({ summary: "Ranking row for a specific user" })
  getRankForUser(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rankings.getRankForUser(id);
  }
}
