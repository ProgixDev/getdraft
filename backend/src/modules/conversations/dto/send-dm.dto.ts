import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendDmDto {
  @ApiProperty({ example: 'Hey!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}
