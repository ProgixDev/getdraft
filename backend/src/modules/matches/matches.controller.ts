import { Controller, Get, Delete, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Matches (Draft Board)')
@ApiBearerAuth()
@Controller('matches')
export class MatchesController {
  constructor(private matchesService: MatchesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all matches (Draft Board)' })
  getMatches(@CurrentUser('id') userId: string) {
    return this.matchesService.getMatches(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get match details' })
  getMatch(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.matchesService.getMatch(id, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Unmatch' })
  unmatch(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.matchesService.unmatch(id, userId);
  }
}
