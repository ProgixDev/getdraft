import { IsEmail, IsNotEmpty, IsString, IsIn, IsOptional, MinLength, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../common/types';

export class RequestEmailOtpDto {
  @ApiProperty({ example: 'player@example.com' })
  @IsEmail()
  email: string;
}

export class VerifyEmailOtpDto {
  @ApiProperty({ example: 'player@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code: string;
}

export class CompleteSignupDto {
  @ApiProperty({ description: 'Signed token returned by verify-otp.' })
  @IsString()
  @IsNotEmpty()
  verificationToken: string;

  // 8 = the Supabase Auth minimum (see signup.dto). Account creation happens
  // here too, so this must match or Supabase rejects it downstream.
  @ApiProperty({ example: 'a-strong-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  // ADMIN is provisioned out-of-band (DB-only) and must never be assignable
  // through self-service signup — otherwise any caller could promote
  // themselves and reach the admin console. Mirrors the guard in
  // users.service.ts updateMe and the defensive throw in AuthService.
  @ApiProperty({
    enum: [UserRole.ATHLETE, UserRole.PARENT, UserRole.COACH, UserRole.RECRUITER],
    example: UserRole.ATHLETE,
  })
  @IsIn([UserRole.ATHLETE, UserRole.PARENT, UserRole.COACH, UserRole.RECRUITER])
  role: UserRole;

  @ApiPropertyOptional({ example: 'Marcus Johnson' })
  @IsOptional()
  @IsString()
  name?: string;
}
