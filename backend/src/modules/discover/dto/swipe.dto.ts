import { IsEnum, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SwipeDirection } from '../../../common/types';

export class SwipeDto {
  @ApiProperty({ example: 'uuid-of-target-user' })
  @IsUUID()
  targetUserId: string;

  @ApiProperty({ enum: SwipeDirection, example: 'draft' })
  @IsEnum(SwipeDirection)
  direction: SwipeDirection;
}
