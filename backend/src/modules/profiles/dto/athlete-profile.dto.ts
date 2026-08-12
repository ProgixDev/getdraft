import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertAthleteProfileDto {
  /**
   * Optional at the DTO layer so PARTIAL updates work; still mandatory when
   * the profile is first created, enforced in ProfilesService.
   *
   * It used to be unconditionally required, which broke onboarding outright:
   * MediaUploadScreen finishes the media step with
   * `upsertAthleteProfile({ photos, videos })` -- a deliberate partial update,
   * since sport was set on the previous step -- and every athlete got
   * 400 "sport must be a string" on Continue. The service already merges
   * partial updates correctly; only this decorator stood in the way.
   */
  @ApiPropertyOptional({ example: 'American Football' })
  @IsOptional()
  @IsString()
  sport?: string;

  @ApiPropertyOptional({ example: 'Quarterback' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({ example: 'NCAA Div I' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({ example: 'Dallas Jesuit Rangers' })
  @IsOptional()
  @IsString()
  team?: string;

  @ApiPropertyOptional({
    example: 'Wasserman',
    description: 'Player agency, if already signed (optional).',
  })
  @IsOptional()
  @IsString()
  agency?: string;

  @ApiPropertyOptional({ example: 'Class of 2025 QB prospect...' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: '2025' })
  @IsOptional()
  @IsString()
  class_year?: string;

  @ApiPropertyOptional({ example: 3.7 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(4.0)
  gpa?: number;

  @ApiPropertyOptional({ example: '6\'2"' })
  @IsOptional()
  @IsString()
  height?: string;

  @ApiPropertyOptional({ example: '215 lbs' })
  @IsOptional()
  @IsString()
  weight?: string;

  @ApiPropertyOptional({ example: '4.65s' })
  @IsOptional()
  @IsString()
  forty_yard_dash?: string;

  @ApiPropertyOptional({ example: ['State Championship MVP 2024'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  awards?: string[];

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

  @ApiPropertyOptional({ example: '2008-03-14', description: 'ISO YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @ApiPropertyOptional({ example: 'Man' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: '5' })
  @IsOptional()
  @IsString()
  experience?: string;

  @ApiPropertyOptional({ example: '10' })
  @IsOptional()
  @IsString()
  jersey_number?: string;
}
