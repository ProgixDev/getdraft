import { IsIn, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UPLOAD_BUCKETS } from './signed-url.dto';
import type { UploadBucket } from './signed-url.dto';

export class DeleteFileDto {
  @ApiProperty({ enum: UPLOAD_BUCKETS })
  @IsIn(UPLOAD_BUCKETS as unknown as string[])
  bucket: UploadBucket;

  @ApiProperty({ example: '<userId>/1735659383928-photo.jpg' })
  @IsString()
  @MaxLength(512)
  path: string;
}
