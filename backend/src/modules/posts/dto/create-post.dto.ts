import { IsString, IsIn, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePostDto {
  @ApiProperty({ enum: ['post', 'reel'] })
  @IsIn(['post', 'reel'])
  kind: 'post' | 'reel';

  @ApiProperty({ example: 'https://.../posts/<user>/abc.jpg' })
  @IsString()
  @IsUrl({ require_protocol: true })
  mediaUrl: string;

  @ApiProperty({ enum: ['image', 'video'] })
  @IsIn(['image', 'video'])
  mediaType: 'image' | 'video';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  thumbnailUrl?: string;

  @ApiPropertyOptional({ example: 'Quarterback drills, 6am.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  caption?: string;
}
