import {
  IsOptional,
  IsString,
  IsNumber,
  IsObject,
  IsIn,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../common/types';
import { LIMITS, MaxJsonSize } from '../../../common/validators/limits';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Marcus Johnson' })
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.name)
  name?: string;

  @ApiPropertyOptional({ example: 'Austin, TX, USA' })
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.place)
  location?: string;

  @ApiPropertyOptional({ example: 'United States' })
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.place)
  country?: string;

  /**
   * Sub-national division: wilaya, state, province, région. Mapbox returns all
   * of them as `region`, so the column and the filter use that word too.
   */
  @ApiPropertyOptional({ example: 'Blida' })
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.place)
  region?: string;

  /** Must be the user's own upload (checked in UsersService.updateMe). */
  @ApiPropertyOptional({ example: 'https://storage.supabase.co/avatars/...' })
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.url)
  avatar_url?: string;

  @ApiPropertyOptional({ example: 30.2672 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: -97.7431 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Client-managed settings blob (users.preferences JSONB).',
    example: { notifications: { push: true } },
  })
  @IsOptional()
  @IsObject()
  @MaxJsonSize(LIMITS.preferencesBytes)
  preferences?: Record<string, any>;

  @ApiPropertyOptional({
    description:
      'Allow changing the user role mid-onboarding — used right after OAuth signup where the provider does not carry a role.',
    enum: UserRole,
    example: UserRole.ATHLETE,
  })
  @IsOptional()
  @IsIn(Object.values(UserRole) as string[])
  role?: UserRole;
}
