import { IsIn, IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FeedQueryDto {
  @ApiPropertyOptional({ enum: ['post', 'reel'] })
  @IsOptional()
  @IsIn(['post', 'reel'])
  kind?: 'post' | 'reel';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
