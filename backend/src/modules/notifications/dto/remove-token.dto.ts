import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RemoveTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxx]' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token: string;
}
