import { z } from "zod";

const emptyStringToUndefined = (schema: z.ZodTypeAny) =>
  z.preprocess((val) => {
    if (typeof val === "string" && val.trim() === "") {
      return undefined;
    }
    return val;
  }, schema);

const urlString = (defaultVal?: string) =>
  z.preprocess((val) => {
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) return undefined;
      if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
        return `https://${trimmed}`;
      }
      return trimmed;
    }
    return val;
  }, defaultVal ? z.string().url().default(defaultVal) : z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // App URLs (supports NEXT_PUBLIC_APP_URL and APP_BASE_URL)
  NEXT_PUBLIC_APP_URL: urlString("https://facturas.maxiofertas.cl"),
  APP_BASE_URL: urlString(),
  NEXT_PUBLIC_APP_ENV: emptyStringToUndefined(z.enum(["development", "test", "production"]).optional()),

  // Database (PostgreSQL / Neon)
  DATABASE_URL: emptyStringToUndefined(z.string().min(1).optional()),

  // Auth / Session Secrets
  AUTH_SECRET: emptyStringToUndefined(z.string().min(16).optional()),
  JWT_SECRET: emptyStringToUndefined(z.string().min(16).optional()),
  SESSION_SECRET: emptyStringToUndefined(z.string().min(16).optional()),
  GOOGLE_CLIENT_ID: emptyStringToUndefined(z.string().optional()),
  GOOGLE_CLIENT_SECRET: emptyStringToUndefined(z.string().optional()),

  // Cloudflare R2 (supports both R2_* and CLOUDFLARE_R2_* conventions)
  R2_ACCOUNT_ID: emptyStringToUndefined(z.string().optional()),
  CLOUDFLARE_R2_ACCOUNT_ID: emptyStringToUndefined(z.string().optional()),
  R2_ACCESS_KEY_ID: emptyStringToUndefined(z.string().optional()),
  CLOUDFLARE_R2_ACCESS_KEY_ID: emptyStringToUndefined(z.string().optional()),
  R2_SECRET_ACCESS_KEY: emptyStringToUndefined(z.string().optional()),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: emptyStringToUndefined(z.string().optional()),
  R2_BUCKET: emptyStringToUndefined(z.string().optional()),
  CLOUDFLARE_R2_BUCKET_NAME: emptyStringToUndefined(z.string().optional()),

  // Operational Parameters
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(5242880), // 5MB
  ROUNDING_TOLERANCE_CLP: z.coerce.number().default(2),
  DUPLICATE_WINDOW_HOURS: z.coerce.number().default(24),
});

export type RawEnv = z.infer<typeof envSchema>;

export interface Env extends RawEnv {
  R2_ACCOUNT_ID?: string;
  CLOUDFLARE_R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  CLOUDFLARE_R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  CLOUDFLARE_R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  CLOUDFLARE_R2_BUCKET_NAME?: string;
  NEXT_PUBLIC_APP_URL: string;
  APP_BASE_URL?: string;
}

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errorMap = result.error.flatten().fieldErrors;
    console.error("❌ Invalid environment variables detected:");
    for (const [key, errors] of Object.entries(errorMap)) {
      console.error(`  - ${key}: ${errors?.join(", ")}`);
    }
    throw new Error("Invalid environment variables");
  }

  const rawData = result.data;
  const accountId = rawData.R2_ACCOUNT_ID || rawData.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = rawData.R2_ACCESS_KEY_ID || rawData.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = rawData.R2_SECRET_ACCESS_KEY || rawData.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = rawData.R2_BUCKET || rawData.CLOUDFLARE_R2_BUCKET_NAME;
  const appUrl = rawData.APP_BASE_URL || rawData.NEXT_PUBLIC_APP_URL || "https://facturas.maxiofertas.cl";

  return {
    ...rawData,
    R2_ACCOUNT_ID: accountId,
    CLOUDFLARE_R2_ACCOUNT_ID: accountId,
    R2_ACCESS_KEY_ID: accessKeyId,
    CLOUDFLARE_R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: secretAccessKey,
    R2_BUCKET: bucket,
    CLOUDFLARE_R2_BUCKET_NAME: bucket,
    NEXT_PUBLIC_APP_URL: appUrl,
    APP_BASE_URL: appUrl,
  };
}

export const env = validateEnv();
