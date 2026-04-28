import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxx]' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ enum: ['ios', 'android'], example: 'ios' })
  @IsEnum(['ios', 'android'] as any)
  platform: 'ios' | 'android';
}
