import {
  IsString,
  IsUUID,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OutreachStatus } from '../../../common/types';

export class CreateOutreachDto {
  @ApiProperty({ description: 'Parent user ID' })
  @IsUUID()
  parentId: string;

  @ApiProperty({ description: 'Child athlete user ID' })
  @IsUUID()
  childAthleteId: string;

  // Same 2000 cap as chat messages; the body limit alone allowed 1 MB.
  @ApiProperty({ example: "Hi, we'd like to invite your son to our camp..." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
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
  @MaxLength(2000)
  text: string;
}
