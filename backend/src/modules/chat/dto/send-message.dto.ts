import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: 'Hey, great to connect!' })
  @IsString()
  @IsNotEmpty()
  text: string;
}
