import { IsOptional, IsString, IsNumber, IsObject, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../common/types';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Marcus Johnson' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Austin, TX, USA' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'United States' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'https://storage.supabase.co/avatars/...' })
  @IsOptional()
  @IsString()
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
