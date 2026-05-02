import {
  Controller,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { SignedUrlDto } from './dto/signed-url.dto';
import { DeleteFileDto } from './dto/delete-file.dto';
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
    @Body() dto: SignedUrlDto,
  ) {
    return this.uploadsService.getSignedUploadUrl(
      userId,
      dto.bucket,
      dto.fileName,
    );
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an uploaded file owned by the current user' })
  async deleteFile(
    @CurrentUser('id') userId: string,
    @Body() dto: DeleteFileDto,
  ) {
    await this.uploadsService.deleteFile(userId, dto.bucket, dto.path);
  }
}
