import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../validation/env";
import {
  R2DownloadOptions,
  R2StorageAdapter,
  R2UploadOptions,
  R2PutObjectOptions,
  R2ObjectData,
} from "./types";

class CloudflareR2Client implements R2StorageAdapter {
  private client: S3Client | null = null;
  private bucket: string | null = null;
  // In-memory fallback store for test environments without real R2 credentials
  private mockStore: Map<string, { body: Uint8Array; contentType: string }> = new Map();

  constructor() {
    if (
      env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET
    ) {
      this.bucket = env.R2_BUCKET;
      this.client = new S3Client({
        region: "auto",
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });
    }
  }

  isConfigured(): boolean {
    return this.client !== null && this.bucket !== null;
  }

  async putObject(options: R2PutObjectOptions): Promise<void> {
    if (!this.client || !this.bucket) {
      // Use local memory fallback in test/dev when R2 credentials are not set
      const bodyBytes =
        options.body instanceof Uint8Array
          ? options.body
          : new Uint8Array(options.body);
      this.mockStore.set(options.key, {
        body: bodyBytes,
        contentType: options.contentType,
      });
      return;
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: options.key,
      Body: options.body,
      ContentType: options.contentType,
    });

    await this.client.send(command);
  }

  async getObject(key: string): Promise<R2ObjectData | null> {
    if (!this.client || !this.bucket) {
      const item = this.mockStore.get(key);
      if (!item) return null;
      return {
        body: item.body,
        contentType: item.contentType,
        contentLength: item.body.byteLength,
      };
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);
      if (!response.Body) return null;

      const byteArray = await response.Body.transformToByteArray();
      return {
        body: byteArray,
        contentType: response.ContentType || "application/octet-stream",
        contentLength: response.ContentLength || byteArray.byteLength,
      };
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    if (!this.client || !this.bucket) {
      this.mockStore.delete(key);
      return;
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
    } catch (error) {
      console.error("Error deleting object from R2:", error);
    }
  }

  async generatePresignedUploadUrl(options: R2UploadOptions): Promise<string> {
    if (!this.client || !this.bucket) {
      return `https://mock-r2.local/upload/${encodeURIComponent(options.key)}?token=mock_upload_token`;
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: options.key,
      ContentType: options.contentType,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: options.expiresInSeconds || 300, // default 5 minutes
    });
  }

  async generatePresignedDownloadUrl(options: R2DownloadOptions): Promise<string> {
    if (!this.client || !this.bucket) {
      return `https://mock-r2.local/download/${encodeURIComponent(options.key)}?token=mock_download_token`;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: options.key,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: options.expiresInSeconds || 900, // default 15 minutes
    });
  }
}

export const r2Client = new CloudflareR2Client();

