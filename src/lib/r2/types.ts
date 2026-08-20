export interface R2UploadOptions {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}

export interface R2DownloadOptions {
  key: string;
  expiresInSeconds?: number;
}

export interface R2PutObjectOptions {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}

export interface R2ObjectData {
  body: Uint8Array;
  contentType: string;
  contentLength: number;
}

export interface R2StorageAdapter {
  isConfigured(): boolean;
  putObject(options: R2PutObjectOptions): Promise<void>;
  getObject(key: string): Promise<R2ObjectData | null>;
  deleteObject(key: string): Promise<void>;
  generatePresignedUploadUrl(options: R2UploadOptions): Promise<string>;
  generatePresignedDownloadUrl(options: R2DownloadOptions): Promise<string>;
}

