import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecruiterRoleType } from '../../../common/types';

export class UpsertRecruiterProfileDto {
  @ApiProperty({ example: 'Elite Sports Agency' })
  @IsString()
  organization: string;

  @ApiProperty({ example: 'American Football' })
  @IsString()
  sport: string;

  @ApiProperty({ enum: RecruiterRoleType, example: 'agent' })
  @IsEnum(RecruiterRoleType)
  role_type: RecruiterRoleType;

  @ApiPropertyOptional({ example: ['NFL Certified', '10+ Years'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 'NFL Certified Agent with 10+ years...' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  videos?: string[];
}
