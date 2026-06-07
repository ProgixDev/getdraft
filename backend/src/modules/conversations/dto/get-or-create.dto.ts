import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetOrCreateConversationDto {
  @ApiProperty({ example: '6d2e…' })
  @IsUUID()
  userId: string;
}
