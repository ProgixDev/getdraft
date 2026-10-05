import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsEnum,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { DiscoverMode } from '../../../common/types';

// Query params arrive as strings. `@Type(() => Boolean)` is WRONG for them:
// Boolean('false') === true, so "?includeInternational=false" became true and
// the toggle was silently ignored. Parse the string explicitly instead.
//
// And parse it from the RAW query (`obj[key]`), not from `value`: the global
// ValidationPipe runs with enableImplicitConversion, which has already turned
// the string into Boolean('false') === true by the time a @Transform sees
// `value`. Reading `value` here left the original bug in place -- the country
// filter never applied, and "verified only" could not be switched off.
const toBool = ({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
  obj?.[key] === true || obj?.[key] === 'true';

export class DiscoverQueryDto {
  /**
   * recruit (default) = the original matrix, athletes ↔ coaches/agents.
   * peer = community: your own role. Optional so every client built before
   * this existed keeps getting exactly the feed it always got.
   */
  @ApiPropertyOptional({ enum: DiscoverMode, example: 'recruit' })
  @IsOptional()
  @IsEnum(DiscoverMode)
  mode?: DiscoverMode;

  @ApiPropertyOptional({ example: 160 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(toBool)
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

  /** Wilaya / state / province. Narrows within `country`. */
  @ApiPropertyOptional({ example: 'Blida' })
  @IsOptional()
  @IsString()
  region?: string;

  /**
   * Ignored for athletes in peer mode: an athlete's Community is always the
   * sport on their own profile (see discover/community.ts).
   */
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
  @Transform(toBool)
  @IsBoolean()
  verifiedRecruitersOnly?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  // Created-at cursor — when set, the service filters `created_at < cursor`
  // and ignores `page`. Prefer this over offset-paging on the client so a
  // new signup landing between fetches can't shift everyone by one row and
  // make us skip a card. The response echoes `nextCursor` for the next call.
  @ApiPropertyOptional({ example: '2026-06-21T10:15:00.000Z' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  // Capped: without a ceiling one request could page out the whole pool
  // (names, photos, towns) instead of a deck at a time.
  @Max(50)
  limit?: number = 20;
}
