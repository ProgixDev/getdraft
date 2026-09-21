import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscoverMode, SwipeDirection } from '../../../common/types';

export class SwipeDto {
  @ApiProperty({ example: 'uuid-of-target-user' })
  @IsUUID()
  targetUserId: string;

  @ApiProperty({ enum: SwipeDirection, example: 'draft' })
  @IsEnum(SwipeDirection)
  direction: SwipeDirection;

  // Super Draft: only meaningful on a DRAFT. Optional + defaults to false so
  // an older client that never sends it keeps working (forbidNonWhitelisted
  // would otherwise 400 an unknown field).
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isSuper?: boolean;

  /**
   * Which pool this swipe came from. The server re-derives the allowed pairs
   * from it: recruit permits athlete ↔ coach/agent only, peer permits the
   * same role only. Sent explicitly rather than inferred from the two roles so
   * a client that never learned about peer mode (absent = recruit) cannot
   * create a same-role match by accident, and a parent in peer mode acts as
   * themselves instead of on behalf of their athlete.
   */
  @ApiPropertyOptional({ enum: DiscoverMode, example: 'recruit' })
  @IsOptional()
  @IsEnum(DiscoverMode)
  mode?: DiscoverMode;
}
