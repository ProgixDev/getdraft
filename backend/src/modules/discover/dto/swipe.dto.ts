import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SwipeDirection } from '../../../common/types';

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
}
