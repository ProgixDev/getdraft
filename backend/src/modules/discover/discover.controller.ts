import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DiscoverService } from './discover.service';
import { DiscoverQueryDto } from './dto/discover-query.dto';
import { SwipeDto } from './dto/swipe.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../../common/types';

@ApiTags('Discover')
@ApiBearerAuth()
@Controller('discover')
export class DiscoverController {
  constructor(private discoverService: DiscoverService) {}

  @Get('feed')
  @ApiOperation({ summary: 'Get discover feed (cards to swipe)' })
  getFeed(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: DiscoverQueryDto,
  ) {
    return this.discoverService.getFeed(user, query);
  }

  @Post('swipe')
  @ApiOperation({ summary: 'Swipe draft or pass on a profile' })
  swipe(@CurrentUser() user: CurrentUserPayload, @Body() dto: SwipeDto) {
    return this.discoverService.swipe(user, dto);
  }

  @Get('who-drafted-me')
  @ApiOperation({ summary: 'See who drafted you (Pro+ feature)' })
  whoDraftedMe(@CurrentUser('id') userId: string) {
    return this.discoverService.whoDraftedMe(userId);
  }
}
