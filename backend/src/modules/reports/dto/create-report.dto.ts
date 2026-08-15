import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** What is being reported. Mirrors the CHECK constraint in migration 041. */
export enum ReportTargetType {
  USER = 'user',
  POST = 'post',
  COMMENT = 'comment',
  MESSAGE = 'message',
}

/**
 * Fixed list rather than free text: a reporter picking from a list gives
 * moderation something sortable, and it keeps the flow to two taps. `other`
 * exists so nobody is forced into a wrong category, and `details` carries the
 * explanation.
 */
export enum ReportReason {
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  FAKE_PROFILE = 'fake_profile',
  UNDERAGE = 'underage',
  OTHER = 'other',
}

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType, example: ReportTargetType.USER })
  @IsEnum(ReportTargetType)
  targetType!: ReportTargetType;

  /**
   * The offending item. Omitted for a whole-user report, where reportedUserId
   * is the subject on its own.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetId?: string;

  /** The person the report is about. */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  reportedUserId!: string;

  @ApiProperty({ enum: ReportReason, example: ReportReason.HARASSMENT })
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @ApiPropertyOptional({ example: 'Kept messaging after I asked them to stop' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}
