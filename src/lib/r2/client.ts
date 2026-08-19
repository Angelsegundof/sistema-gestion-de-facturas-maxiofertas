import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../validation/env";
import { R2DownloadOptions, R2StorageAdapter, R2UploadOptions } from "./types";

class CloudflareR2Client implements R2StorageAdapter {
  private client: S3Client | null = null;
  private bucket: string | null = null;

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

  async generatePresignedUploadUrl(options: R2UploadOptions): Promise<string> {
    if (!this.client || !this.bucket) {
      throw new Error("R2 storage client is not configured");
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
      throw new Error("R2 storage client is not configured");
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
