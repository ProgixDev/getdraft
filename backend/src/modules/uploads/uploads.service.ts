import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { UploadBucket } from './dto/signed-url.dto';

@Injectable()
export class UploadsService {
  constructor(private supabaseService: SupabaseService) {}

  async getSignedUploadUrl(
    userId: string,
    bucket: UploadBucket,
    fileName: string,
  ) {
    const supabase = this.supabaseService.getAdminClient();

    const safeName = fileName.replace(/[^A-Za-z0-9._\-]/g, '_');
    const filePath = `${userId}/${Date.now()}-${safeName}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(filePath);

    if (error) throw new BadRequestException(error.message);

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(filePath);

    return {
      signedUrl: data.signedUrl,
      token: data.token,
      path: filePath,
      publicUrl,
    };
  }

  async deleteFile(userId: string, bucket: UploadBucket, path: string) {
    if (!path.startsWith(`${userId}/`)) {
      throw new ForbiddenException('Cannot delete files owned by another user');
    }

    const supabase = this.supabaseService.getAdminClient();

    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) throw new BadRequestException(error.message);
  }
}
