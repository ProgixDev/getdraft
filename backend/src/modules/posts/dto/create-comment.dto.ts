import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({ example: 'Big arm!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;

  @ApiPropertyOptional({ description: 'Parent comment id (one-level reply)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
