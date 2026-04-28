import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class DiscoverQueryDto {
  @ApiPropertyOptional({ example: 160 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInternational?: boolean;

  @ApiPropertyOptional({ example: 'United States' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'Austin' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'American Football' })
  @IsOptional()
  @IsString()
  sport?: string;

  @ApiPropertyOptional({ enum: ['all', 'agent', 'coach'], example: 'all' })
  @IsOptional()
  @IsString()
  recruiterType?: string;

  @ApiPropertyOptional({ example: 'Quarterback' })
  @IsOptional()
  @IsString()
  athletePosition?: string;

  @ApiPropertyOptional({ example: 'NCAA Div I' })
  @IsOptional()
  @IsString()
  athleteLevel?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  verifiedRecruitersOnly?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}
