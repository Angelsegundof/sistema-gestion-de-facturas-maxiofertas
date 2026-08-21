import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite, PgliteDatabase } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";
import { env } from "../validation/env";
import * as fs from "fs";
import * as path from "path";

// Global singleton for development / testing to avoid multiple instances across hot-reloads
declare global {
  var __localPgliteDb: PgliteDatabase<typeof schema> | undefined;
  var __localPgliteInstance: PGlite | undefined;
  var __localPgliteReadyPromise: Promise<void> | undefined;
}

export async function ensureDbReady(): Promise<void> {
  if (global.__localPgliteReadyPromise) {
    await global.__localPgliteReadyPromise;
  }
}

function initLocalPglite(): PgliteDatabase<typeof schema> {
  if (global.__localPgliteDb) {
    return global.__localPgliteDb;
  }

  // Use fast, lock-free in-memory PGlite for local development and tests
  const pglite = new PGlite();
  global.__localPgliteInstance = pglite;
  const localDb = drizzlePglite(pglite, { schema });
  global.__localPgliteDb = localDb;

  // Auto-run migrations and seed QA data on startup for development
  if (process.env.NODE_ENV === "development") {
    global.__localPgliteReadyPromise = (async () => {
      try {
        await runLocalMigrations(pglite);
        const { seedQa } = await import("./seed-qa");
        await seedQa(localDb);
      } catch (err) {
        console.error("[DEV DB INIT ERROR]", err);
      }
    })();
  }

  return localDb;
}

export async function runLocalMigrations(pgInstance: PGlite): Promise<void> {
  await pgInstance.waitReady;
  const migrationsDir = path.resolve(process.cwd(), "src/lib/db/migrations");
  const migrationFiles = [
    "0000_cheerful_giant_girl.sql",
    "0001_sharp_reptil.sql",
    "0002_concerned_molly_hayes.sql",
    "0003_rapid_boomerang.sql",
    "0004_wet_mulholland_black.sql",
    "0005_uneven_lady_bullseye.sql",
    "0006_shallow_skaar.sql",
    "0007_document_share_tokens.sql",
  ];

  for (const mFile of migrationFiles) {
    const fullPath = path.join(migrationsDir, mFile);
    if (fs.existsSync(fullPath)) {
      const sqlContent = fs.readFileSync(fullPath, "utf8");
      const statements = sqlContent
        .split("--> statement-breakpoint")
        .filter((s) => s.trim().length > 0);
      for (const statement of statements) {
        try {
          await pgInstance.exec(statement);
        } catch {
          // Statements might already exist
        }
      }
    }
  }
}

export type AppDatabase = NeonHttpDatabase<typeof schema> | PgliteDatabase<typeof schema>;

export function getDb(): AppDatabase | null {
  if (env.DATABASE_URL) {
    const sql = neon(env.DATABASE_URL);
    return drizzleNeon(sql, { schema });
  }

  // Strictly require DATABASE_URL in production
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  // In development / test, fallback gracefully to embedded local PostgreSQL (PGlite)
  return initLocalPglite();
}

export const db = getDb();
export * from "./schema";
