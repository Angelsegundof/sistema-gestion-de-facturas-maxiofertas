export interface R2UploadOptions {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}

export interface R2DownloadOptions {
  key: string;
  expiresInSeconds?: number;
}

export interface R2StorageAdapter {
  isConfigured(): boolean;
  generatePresignedUploadUrl(options: R2UploadOptions): Promise<string>;
  generatePresignedDownloadUrl(options: R2DownloadOptions): Promise<string>;
}
