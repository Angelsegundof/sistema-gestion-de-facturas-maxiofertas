interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class MemoryRateLimiter {
  private attempts: Map<string, RateLimitEntry> = new Map();

  isRateLimited(key: string, maxAttempts = 5, windowMs = 15 * 60 * 1000): { limited: boolean; retryAfterMs: number } {
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry || now > entry.resetAt) {
      return { limited: false, retryAfterMs: 0 };
    }

    if (entry.count >= maxAttempts) {
      return { limited: true, retryAfterMs: entry.resetAt - now };
    }

    return { limited: false, retryAfterMs: 0 };
  }

  recordAttempt(key: string, windowMs = 15 * 60 * 1000): void {
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry || now > entry.resetAt) {
      this.attempts.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      entry.count += 1;
    }
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

export const authRateLimiter = new MemoryRateLimiter();
