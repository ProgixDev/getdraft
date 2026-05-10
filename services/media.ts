import * as ImagePicker from 'expo-image-picker';
import { uploadsService, UploadBucket } from './uploads';

type Kind = 'image' | 'video';

function inferContentType(mimeType: string | undefined, kind: Kind): string {
  if (mimeType) return mimeType;
  return kind === 'video' ? 'video/mp4' : 'image/jpeg';
}

function inferExtension(uri: string, mimeType: string | undefined, kind: Kind): string {
  const fromUri = uri.split('?')[0].split('.').pop();
  if (fromUri && fromUri.length <= 5 && /^[A-Za-z0-9]+$/.test(fromUri)) {
    return fromUri.toLowerCase();
  }
  if (mimeType?.includes('/')) return mimeType.split('/')[1];
  return kind === 'video' ? 'mp4' : 'jpg';
}

export interface PickAndUploadOptions {
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
  quality?: number;
}

/**
 * Launches the system picker, uploads each selected asset to Supabase Storage
 * via the backend's signed-URL endpoint, and returns the resulting public URLs.
 * Returns [] if the user cancels.
 */
export async function pickAndUploadMedia(
  kind: Kind,
  bucket: UploadBucket,
  options: PickAndUploadOptions = {},
): Promise<string[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Permission to access your photo library was denied.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === 'video' ? ['videos'] : ['images'],
    allowsMultipleSelection: options.allowsMultipleSelection ?? false,
    selectionLimit: options.selectionLimit ?? 1,
    quality: options.quality ?? 0.8,
  });

  if (result.canceled || !result.assets?.length) return [];

  const urls: string[] = [];
  for (const asset of result.assets) {
    const ext = inferExtension(asset.uri, asset.mimeType, kind);
    const fileName = `${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
    const contentType = inferContentType(asset.mimeType, kind);
    const { publicUrl } = await uploadsService.uploadAsset(
      bucket,
      asset.uri,
      fileName,
      contentType,
    );
    urls.push(publicUrl);
  }
  return urls;
}
