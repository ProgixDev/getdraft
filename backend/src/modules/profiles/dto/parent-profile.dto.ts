import { IsString, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertParentProfileDto {
  @ApiProperty({ example: 'Mother' })
  @IsString()
  relationship: string;

  @ApiPropertyOptional({ description: 'UUID of the child athlete user' })
  @IsOptional()
  @IsUUID()
  child_athlete_id?: string;

  @ApiPropertyOptional({ example: 'Class of 2025' })
  @IsOptional()
  @IsString()
  child_class_year?: string;

  @ApiPropertyOptional({ example: 'Focused on finding the right fit...' })
  @IsOptional()
  @IsString()
  bio?: string;
}
