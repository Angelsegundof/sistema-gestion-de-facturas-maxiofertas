import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  
  // Database (PostgreSQL / Neon)
  DATABASE_URL: z.string().min(1).optional(),
  
  // Auth (Fase posterior)
  AUTH_SECRET: z.string().min(32).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  
  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  
  // Operational Parameters
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(5242880), // 5MB
  ROUNDING_TOLERANCE_CLP: z.coerce.number().default(2),
  DUPLICATE_WINDOW_HOURS: z.coerce.number().default(24),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return result.data;
}

export const env = validateEnv();
