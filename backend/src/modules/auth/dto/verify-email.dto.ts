import { IsString, IsNotEmpty, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ example: 'athlete@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class ResendOtpDto {
  @ApiProperty({ example: 'athlete@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'athlete@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
