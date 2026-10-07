import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { LIMITS } from '../../../common/validators/limits';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertParentProfileDto {
  @ApiProperty({ example: 'Mother' })
  @IsString()
  @MaxLength(LIMITS.short)
  relationship: string;

  @ApiPropertyOptional({ description: 'UUID of the child athlete user' })
  @IsOptional()
  @IsUUID()
  child_athlete_id?: string;

  @ApiPropertyOptional({ example: 'Class of 2025' })
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.short)
  child_class_year?: string;

  @ApiPropertyOptional({ example: 'Focused on finding the right fit...' })
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.bio)
  bio?: string;
}
