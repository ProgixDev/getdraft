import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { DiscoverMode, SwipeDirection } from '../../../common/types';

export class SwipeDto {
  @ApiProperty({ example: 'uuid-of-target-user' })
  @IsUUID()
  targetUserId: string;

  @ApiProperty({ enum: SwipeDirection, example: 'draft' })
  @IsEnum(SwipeDirection)
  direction: SwipeDirection;

  // Super Draft: only meaningful on a DRAFT, and only in recruiting -- a
  // Super Draft sent in Community (peer mode) is refused with a 400.
  // Optional + defaults to false so an older client that never sends it
  // keeps working (forbidNonWhitelisted would otherwise 400 an unknown field).
  // Read from the raw body (`obj`), not `value`: the global pipe converts
  // implicitly first, and Boolean("false") is true, so a client sending the
  // string "false" would have spent a Super Draft.
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(({ obj }) => obj?.isSuper === true || obj?.isSuper === 'true')
  @IsBoolean()
  isSuper?: boolean;

  /**
   * Which pool this swipe came from. The server re-derives the allowed pairs
   * from it: recruit permits athlete ↔ coach/agent/team only, peer permits
   * the same role only (athlete pairs also need the Community rules: same
   * sport, same age group, both active). A parent in peer mode acts as
   * themselves instead of on behalf of their athlete.
   *
   * It also decides the price: a recruit Draft spends the daily allowance, a
   * peer Draft is free and unlimited.
   *
   * Optional. When absent the server infers it: peer when the swiper and the
   * target have the same role, recruit otherwise. That keeps screens and
   * older builds that never send a mode (Globe, Draft Board Accept / Refuse,
   * "who drafted you" Draft back) working for Community Drafts.
   */
  @ApiPropertyOptional({ enum: DiscoverMode, example: 'recruit' })
  @IsOptional()
  @IsEnum(DiscoverMode)
  mode?: DiscoverMode;
}
