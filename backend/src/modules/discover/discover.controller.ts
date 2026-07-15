import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
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

  @Get('map')
  @ApiOperation({ summary: 'Minimal feed candidates with coordinates for the globe' })
  getMapPoints(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: DiscoverQueryDto,
  ) {
    return this.discoverService.getMapPoints(user, query);
  }

  @Post('swipe')
  @ApiOperation({ summary: 'Swipe draft or pass on a profile' })
  swipe(@CurrentUser() user: CurrentUserPayload, @Body() dto: SwipeDto) {
    return this.discoverService.swipe(user, dto);
  }

  @Get('who-drafted-me')
  @ApiOperation({ summary: 'See who drafted you (pending incoming drafts)' })
  whoDraftedMe(@CurrentUser() user: CurrentUserPayload) {
    return this.discoverService.whoDraftedMe(user);
  }

  @Get('my-drafts')
  @ApiOperation({ summary: 'My outgoing drafts with matched flag' })
  myDrafts(@CurrentUser() user: CurrentUserPayload) {
    return this.discoverService.myDrafts(user);
  }

  @Delete('drafts/:targetUserId')
  @ApiOperation({ summary: 'Withdraw a pending outgoing draft' })
  withdrawDraft(
    @CurrentUser() user: CurrentUserPayload,
    @Param('targetUserId', new ParseUUIDPipe()) targetUserId: string,
  ) {
    // Parents allowed: the service resolves them to their linked athlete and
    // withdraws the Draft they sent on that athlete's behalf.
    return this.discoverService.withdrawDraft(user, targetUserId);
  }
}
