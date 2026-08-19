import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { env } from "../validation/env";

export function getDb() {
  if (!env.DATABASE_URL) {
    return null;
  }
  const sql = neon(env.DATABASE_URL);
  return drizzle(sql, { schema });
}

export const db = getDb();
export * from "./schema";
