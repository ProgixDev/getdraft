import { IsString, IsIn, Matches, Length, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
