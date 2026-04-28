import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';

@Injectable()
export class UploadsService {
  constructor(private supabaseService: SupabaseService) {}

  async getSignedUploadUrl(
    userId: string,
    bucket: string,
    fileName: string,
  ) {
    const supabase = this.supabaseService.getAdminClient();

    const validBuckets = ['avatars', 'photos', 'videos'];
    if (!validBuckets.includes(bucket)) {
      throw new BadRequestException(
        `Invalid bucket. Must be one of: ${validBuckets.join(', ')}`,
      );
    }

    const filePath = `${userId}/${Date.now()}-${fileName}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(filePath);

    if (error) throw new BadRequestException(error.message);

    // Also return the public URL for after upload
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

  async deleteFile(bucket: string, path: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) throw new BadRequestException(error.message);

    return { message: 'File deleted' };
  }
}
