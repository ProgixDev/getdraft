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

  @ApiProperty({ example: 'a-strong-password' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ enum: UserRole, example: UserRole.ATHLETE })
  @IsIn(Object.values(UserRole) as string[])
  role: UserRole;

  @ApiPropertyOptional({ example: 'Marcus Johnson' })
  @IsOptional()
  @IsString()
  name?: string;
}
