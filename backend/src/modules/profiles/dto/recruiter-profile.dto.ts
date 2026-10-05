import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { OrgType, RecruiterRoleType } from '../../../common/types';

/** Longest website address accepted on a profile. */
export const WEBSITE_MAX_LENGTH = 255;

/** An empty or blank string means "not set": stored as NULL. */
const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/**
 * Website as people type it: trimmed, blank = not set, and "club.com" or
 * "www.club.com" gets https:// in front. What is stored therefore always
 * starts with http:// or https://, so the app can open it as it is, and a
 * javascript: or other scheme can never be saved (the @IsUrl below refuses
 * everything else).
 */
const normaliseWebsite = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
};

/** Profile of a coach, an agent or a team (PUT /profiles/recruiter). */
export class UpsertRecruiterProfileDto {
  @ApiProperty({
    example: 'Elite Sports Agency',
    description: 'Organization, agency or -- for a team -- the club name.',
  })
  @IsString()
  organization: string;

  @ApiProperty({ example: 'American Football' })
  @IsString()
  sport: string;

  // Ignored. The server sets role_type from the account type (coach ->
  // 'coach', agent -> 'agent', team -> 'team'), so a coach cannot label
  // itself a team. Still accepted so builds that send it are not rejected
  // by forbidNonWhitelisted.
  @ApiPropertyOptional({
    enum: RecruiterRoleType,
    example: 'agent',
    description: 'Ignored: derived from the account type on the server.',
  })
  @IsOptional()
  @IsEnum(RecruiterRoleType)
  role_type?: RecruiterRoleType;

  @ApiPropertyOptional({
    example: 'Dallas Jesuit Rangers',
    description: 'Coaches only — the team they coach. Agents use organization.',
  })
  @IsOptional()
  @IsString()
  team?: string;

  @ApiPropertyOptional({
    enum: OrgType,
    example: 'club',
    description: 'Teams — what kind of organisation this is.',
  })
  @IsOptional()
  @Transform(blankToNull)
  @IsEnum(OrgType)
  org_type?: OrgType | null;

  @ApiPropertyOptional({
    example: 'https://www.dallasjesuit.org',
    description:
      'Teams — public website. Stored with http(s)://; "club.com" is saved as "https://club.com".',
    maxLength: WEBSITE_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(normaliseWebsite)
  // No user:password@ part: "https://real-club.com@elsewhere.example" reads
  // as one site and opens another.
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    disallow_auth: true,
  })
  @MaxLength(WEBSITE_MAX_LENGTH)
  website?: string | null;

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
