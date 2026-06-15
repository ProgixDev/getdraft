import * as FileSystem from "expo-file-system/legacy";
import api from "./api";

export type UploadBucket = "avatars" | "photos" | "videos" | "posts";

export interface SignedUploadResult {
  signedUrl: string;
  token: string;
  path: string;
  publicUrl: string;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._\-\s]/g, "_").slice(-200) || "file";
}

export const uploadsService = {
  async getSignedUploadUrl(
    bucket: UploadBucket,
    fileName: string,
  ): Promise<SignedUploadResult> {
    const { data } = await api.post("/uploads/signed-url", {
      bucket,
      fileName: sanitizeFileName(fileName),
    });
    return data.data;
  },

  async deleteFile(bucket: UploadBucket, path: string): Promise<void> {
    await api.delete("/uploads", { data: { bucket, path } });
  },

  async uploadFile(
    signedUrl: string,
    file: Blob | File,
    contentType: string,
  ): Promise<void> {
    // Must throw on a failed PUT — otherwise callers (post-create, avatar
    // upload) proceed to persist a post/avatar that points at a URL whose
    // bytes never landed. Matches uploadBlob / uploadFromUri.
    const res = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  },

  /**
   * Web only — PUT a Blob directly to a signed URL. On native, prefer uploadFromUri.
   */
  async uploadBlob(
    signedUrl: string,
    file: Blob,
    contentType: string,
  ): Promise<void> {
    const res = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  },

  /**
   * Native upload from a `file://` URI (e.g. expo-image-picker result) using
   * FileSystem.uploadAsync — streams binary content without loading it into JS memory.
   */
  async uploadFromUri(
    signedUrl: string,
    fileUri: string,
    contentType: string,
  ): Promise<void> {
    const result = await FileSystem.uploadAsync(signedUrl, fileUri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": contentType },
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `Upload failed (${result.status}): ${result.body?.slice(0, 200) ?? ""}`,
      );
    }
  },

  /**
   * High-level helper: signed-URL + upload + return the public URL.
   */
  async uploadAsset(
    bucket: UploadBucket,
    fileUri: string,
    fileName: string,
    contentType: string,
  ): Promise<{ publicUrl: string; path: string }> {
    const signed = await this.getSignedUploadUrl(bucket, fileName);
    await this.uploadFromUri(signed.signedUrl, fileUri, contentType);
    return { publicUrl: signed.publicUrl, path: signed.path };
  },
};
