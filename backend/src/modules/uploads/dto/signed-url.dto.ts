import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const UPLOAD_BUCKETS = ['avatars', 'photos', 'videos'] as const;
export type UploadBucket = (typeof UPLOAD_BUCKETS)[number];

export class SignedUrlDto {
  @ApiProperty({ enum: UPLOAD_BUCKETS })
  @IsIn(UPLOAD_BUCKETS)
  bucket: UploadBucket;

  @ApiProperty({ example: 'highlight-reel.mp4' })
  @IsString()
  @MaxLength(255)
  // Forbid path traversal & absolute paths.
  @Matches(/^[A-Za-z0-9._\-\s]+$/, {
    message: 'fileName must not contain path separators',
  })
  fileName: string;
}
