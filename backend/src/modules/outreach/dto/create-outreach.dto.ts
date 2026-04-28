import { IsString, IsUUID, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OutreachStatus } from '../../../common/types';

export class CreateOutreachDto {
  @ApiProperty({ description: 'Parent user ID' })
  @IsUUID()
  parentId: string;

  @ApiProperty({ description: 'Child athlete user ID' })
  @IsUUID()
  childAthleteId: string;

  @ApiProperty({ example: "Hi, we'd like to invite your son to our camp..." })
  @IsString()
  @IsNotEmpty()
  message: string;
}

export class UpdateOutreachStatusDto {
  @ApiProperty({ enum: OutreachStatus })
  @IsEnum(OutreachStatus)
  status: OutreachStatus;
}

export class SendOutreachMessageDto {
  @ApiProperty({ example: 'Thank you for reaching out...' })
  @IsString()
  @IsNotEmpty()
  text: string;
}
