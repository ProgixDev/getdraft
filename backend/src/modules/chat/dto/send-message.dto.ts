import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  // 2000 matches the socket path (chat.gateway.ts). Without the cap here the
  // REST route accepted a message as large as the request body (1 MB), which
  // then came back in every thread list and inbox preview.
  @ApiProperty({ example: 'Hey, great to connect!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}
