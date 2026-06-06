import api from "./api";

export interface SignedUploadResult {
  signedUrl: string;
  token: string;
  path: string;
  publicUrl: string;
}

export const uploadsService = {
  async getSignedUploadUrl(
    bucket: string,
    fileName: string,
  ): Promise<SignedUploadResult> {
    const { data } = await api.post("/uploads/signed-url", {
      bucket,
      fileName,
    });
    return data.data;
  },

  async deleteFile(bucket: string, path: string): Promise<void> {
    await api.delete("/uploads", { data: { bucket, path } });
  },

  async uploadFile(
    signedUrl: string,
    file: Blob | File,
    contentType: string,
  ): Promise<void> {
    await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });
  },
};
