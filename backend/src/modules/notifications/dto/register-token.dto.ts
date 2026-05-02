import { IsString, IsNotEmpty, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PushPlatform } from '../../../common/types';

export class RegisterTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxx]' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token: string;

  @ApiProperty({ enum: PushPlatform, example: PushPlatform.IOS })
  @IsEnum(PushPlatform)
  platform: PushPlatform;
}
