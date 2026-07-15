import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../common/types';

export class SignupDto {
  @ApiProperty({ example: 'athlete@example.com' })
  @IsEmail()
  email: string;

  // 8 = the Supabase Auth minimum. Supabase rejects anything shorter when the
  // account is created, so accepting 6 here would only produce a confusing
  // downstream error. NOTE: login.dto stays at 6 on purpose — see the comment
  // there before "aligning" it.
  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Marcus Johnson' })
  @IsString()
  @IsNotEmpty()
  name: string;

  // ADMIN is provisioned out-of-band (DB-only) and must never be assignable
  // through self-service signup. Mirrors the guard in users.service.ts
  // updateMe and the defensive throw in AuthService.
  @ApiProperty({ enum: ['athlete', 'parent', 'coach', 'recruiter'] })
  @IsIn([UserRole.ATHLETE, UserRole.PARENT, UserRole.COACH, UserRole.RECRUITER], {
    message: 'role must be one of: athlete, parent, coach, recruiter',
  })
  role: UserRole;
}
