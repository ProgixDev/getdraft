import { IsString, IsIn, IsOptional, Matches, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** E.164 format: leading +, then 8–15 digits. */
const E164 = /^\+[1-9]\d{7,14}$/;

export class RequestPhoneOtpDto {
  @ApiProperty({ example: '+15551234567' })
  @IsString()
  @Matches(E164, { message: 'phone must be in E.164 format (e.g. +15551234567)' })
  phone: string;

  @ApiProperty({ enum: ['sms', 'whatsapp'], example: 'sms' })
  @IsIn(['sms', 'whatsapp'])
  channel: 'sms' | 'whatsapp';

  /**
   * What the user is trying to do. Checked BEFORE the SMS is sent, so a
   * sign-in with an unregistered number (or a sign-up with a registered one)
   * is refused without spending a Prelude credit. Optional: clients built
   * before this existed send nothing and keep the old behaviour, where every
   * number gets a code and the outcome is decided after verification.
   */
  @ApiPropertyOptional({ enum: ['login', 'signup'], example: 'login' })
  @IsOptional()
  @IsIn(['login', 'signup'])
  intent?: 'login' | 'signup';
}

export class VerifyPhoneOtpDto {
  @ApiProperty({ example: '+15551234567' })
  @IsString()
  @Matches(E164, { message: 'phone must be in E.164 format (e.g. +15551234567)' })
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 10)
  code: string;
}
