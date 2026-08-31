import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { rateLimits } from "../db/schema";

interface RateLimitCheckResult {
  limited: boolean;
  retryAfterMs: number;
}

export const TRUSTED_EXCLUDED_IPS = new Set(["200.28.138.101", "127.0.0.1", "::1"]);

class DistributedRateLimiter {
  private memoryFallback: Map<string, { count: number; resetAt: number }> = new Map();

  private isTrustedKey(key: string): boolean {
    if (key.startsWith("ip:")) {
      const ip = key.replace("ip:", "").trim();
      return TRUSTED_EXCLUDED_IPS.has(ip);
    }
    return false;
  }

  async isRateLimited(
    key: string,
    maxAttempts = 5,
    windowMs = 15 * 60 * 1000
  ): Promise<RateLimitCheckResult> {
    if (this.isTrustedKey(key)) {
      return { limited: false, retryAfterMs: 0 };
    }

    const db = getDb();
    const now = new Date();

    if (db) {
      try {
        const records = await db
          .select()
          .from(rateLimits)
          .where(eq(rateLimits.key, key))
          .limit(1);

        if (records.length === 0) {
          return { limited: false, retryAfterMs: 0 };
        }

        const record = records[0];
        if (now.getTime() > record.resetAt.getTime()) {
          return { limited: false, retryAfterMs: 0 };
        }

        if (record.count >= maxAttempts) {
          const retryAfterMs = Math.max(0, record.resetAt.getTime() - now.getTime());
          return { limited: true, retryAfterMs };
        }

        return { limited: false, retryAfterMs: 0 };
      } catch (err) {
        console.warn("Database rate-limiter check failed, falling back to memory:", err);
      }
    }

    // In-memory fallback
    const entry = this.memoryFallback.get(key);
    if (!entry || Date.now() > entry.resetAt) {
      return { limited: false, retryAfterMs: 0 };
    }
    if (entry.count >= maxAttempts) {
      return { limited: true, retryAfterMs: Math.max(0, entry.resetAt - Date.now()) };
    }
    return { limited: false, retryAfterMs: 0 };
  }

  async recordAttempt(key: string, windowMs = 15 * 60 * 1000): Promise<void> {
    if (this.isTrustedKey(key)) return;

    const db = getDb();
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);

    if (db) {
      try {
        const records = await db
          .select()
          .from(rateLimits)
          .where(eq(rateLimits.key, key))
          .limit(1);

        if (records.length === 0 || now.getTime() > records[0].resetAt.getTime()) {
          await db
            .insert(rateLimits)
            .values({
              key,
              count: 1,
              lastAttemptAt: now,
              resetAt,
            })
            .onConflictDoUpdate({
              target: rateLimits.key,
              set: {
                count: 1,
                lastAttemptAt: now,
                resetAt,
              },
            });
        } else {
          await db
            .update(rateLimits)
            .set({
              count: records[0].count + 1,
              lastAttemptAt: now,
            })
            .where(eq(rateLimits.key, key));
        }
      } catch (err) {
        console.warn("Database rate-limiter record failed, falling back to memory:", err);
      }
    }

    // Update in-memory fallback
    const entry = this.memoryFallback.get(key);
    if (!entry || Date.now() > entry.resetAt) {
      this.memoryFallback.set(key, { count: 1, resetAt: Date.now() + windowMs });
    } else {
      entry.count += 1;
    }
  }

  async reset(key: string): Promise<void> {
    this.memoryFallback.delete(key);
    const db = getDb();
    if (db) {
      try {
        await db.delete(rateLimits).where(eq(rateLimits.key, key));
      } catch (err) {
        console.warn("Database rate-limiter reset failed:", err);
      }
    }
  }
}

export const authRateLimiter = new DistributedRateLimiter();
