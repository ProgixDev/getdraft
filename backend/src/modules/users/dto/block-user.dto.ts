import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class BlockUserDto {
  @ApiPropertyOptional({ example: 'Inappropriate behaviour' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
