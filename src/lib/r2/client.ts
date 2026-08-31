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
    this.ensureInitialized();
  }

  private ensureInitialized(): boolean {
    if (this.client && this.bucket) {
      return true;
    }

    const accountId =
      process.env.CLOUDFLARE_R2_ACCOUNT_ID ||
      process.env.R2_ACCOUNT_ID ||
      env.CLOUDFLARE_R2_ACCOUNT_ID ||
      env.R2_ACCOUNT_ID;
    const accessKeyId =
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
      process.env.R2_ACCESS_KEY_ID ||
      env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
      env.R2_ACCESS_KEY_ID;
    const secretAccessKey =
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
      process.env.R2_SECRET_ACCESS_KEY ||
      env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
      env.R2_SECRET_ACCESS_KEY;
    const bucket =
      process.env.CLOUDFLARE_R2_BUCKET_NAME ||
      process.env.R2_BUCKET ||
      env.CLOUDFLARE_R2_BUCKET_NAME ||
      env.R2_BUCKET;

    if (accountId && accessKeyId && secretAccessKey && bucket) {
      this.bucket = bucket;
      this.client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      return true;
    }

    return false;
  }

  isConfigured(): boolean {
    return this.ensureInitialized();
  }

  async putObject(options: R2PutObjectOptions): Promise<void> {
    const isReady = this.ensureInitialized();
    if (!isReady || !this.client || !this.bucket) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "Cloudflare R2 is not configured in production environment. Refusing in-memory fallback."
        );
      }
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

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: options.key,
        Body: options.body,
        ContentType: options.contentType,
      });

      await this.client.send(command);
    } catch (err: any) {
      console.error("[R2 PutObject Error]:", {
        bucket: this.bucket,
        key: options.key,
        message: err?.message,
        code: err?.Code || err?.name,
      });
      throw err;
    }
  }

  async getObject(key: string): Promise<R2ObjectData | null> {
    const isReady = this.ensureInitialized();
    if (!isReady || !this.client || !this.bucket) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "Cloudflare R2 is not configured in production environment. Refusing in-memory fallback."
        );
      }
      let item = this.mockStore.get(key);
      if (!item) {
        // Generate valid synthetic PDF for QA/testing environment
        const fallbackPdf = generateFallbackPdf(key);
        item = {
          body: fallbackPdf,
          contentType: "application/pdf",
        };
        this.mockStore.set(key, item);
      }
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
    } catch (err) {
      console.error("[R2 GetObject Error]:", key, err);
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const isReady = this.ensureInitialized();
    if (!isReady || !this.client || !this.bucket) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "Cloudflare R2 is not configured in production environment. Refusing in-memory fallback."
        );
      }
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
      console.error("[R2 DeleteObject Error]:", key, error);
    }
  }

  async generatePresignedUploadUrl(options: R2UploadOptions): Promise<string> {
    const isReady = this.ensureInitialized();
    if (!isReady || !this.client || !this.bucket) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "Cloudflare R2 is not configured in production environment. Refusing mock URL generation."
        );
      }
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

  async generatePresignedDownloadUrl(
    keyOrOptions: string | R2DownloadOptions,
    expiresInSeconds: number = 900
  ): Promise<string> {
    const key = typeof keyOrOptions === "string" ? keyOrOptions : keyOrOptions.key;
    const expires = typeof keyOrOptions === "string" ? expiresInSeconds : keyOrOptions.expiresInSeconds || 900;

    const isReady = this.ensureInitialized();
    if (!isReady || !this.client || !this.bucket) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "Cloudflare R2 is not configured in production environment. Refusing mock URL generation."
        );
      }
      return `https://mock-r2.local/download/${encodeURIComponent(key)}?token=mock_download_token`;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expires,
    });
  }
}

export function generateFallbackPdf(filename = "documento"): Uint8Array {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 170 >>
stream
BT
/F1 16 Tf
50 720 Td
(Maxiofertas - Factura Electronica) Tj
0 -25 Td
/F1 11 Tf
(Documento Oficial emitido en Sistema de Gestion de Facturas.) Tj
0 -20 Td
/F1 10 Tf
(Referencia: ${filename}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000234 00000 n 
0000000456 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
533
%%EOF
`;
  return Buffer.from(content, "utf8");
}

export const r2Client = new CloudflareR2Client();
