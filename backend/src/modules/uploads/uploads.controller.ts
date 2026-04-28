import { Controller, Post, Delete, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @Post('signed-url')
  @ApiOperation({ summary: 'Get a signed URL for file upload' })
  getSignedUrl(
    @CurrentUser('id') userId: string,
    @Body() body: { bucket: string; fileName: string },
  ) {
    return this.uploadsService.getSignedUploadUrl(
      userId,
      body.bucket,
      body.fileName,
    );
  }

  @Delete()
  @ApiOperation({ summary: 'Delete a file from storage' })
  deleteFile(@Body() body: { bucket: string; path: string }) {
    return this.uploadsService.deleteFile(body.bucket, body.path);
  }
}
