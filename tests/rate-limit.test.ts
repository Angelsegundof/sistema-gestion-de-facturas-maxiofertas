import { describe, it, expect, beforeEach } from "vitest";
import { authRateLimiter } from "@/lib/auth/rate-limit";

describe("Authentication Rate Limiting", () => {
  beforeEach(() => {
    authRateLimiter.reset("test-ip-123");
  });

  it("should permit attempts under the threshold and block after 5 failed attempts", () => {
    const key = "test-ip-123";

    for (let i = 0; i < 4; i++) {
      authRateLimiter.recordAttempt(key, 60000);
      const check = authRateLimiter.isRateLimited(key, 5, 60000);
      expect(check.limited).toBe(false);
    }

    // 5th attempt triggers rate limit
    authRateLimiter.recordAttempt(key, 60000);
    const checkBlocked = authRateLimiter.isRateLimited(key, 5, 60000);
    expect(checkBlocked.limited).toBe(true);
    expect(checkBlocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("should allow reset upon successful login", () => {
    const key = "test-ip-123";
    for (let i = 0; i < 5; i++) {
      authRateLimiter.recordAttempt(key, 60000);
    }
    expect(authRateLimiter.isRateLimited(key, 5, 60000).limited).toBe(true);

    authRateLimiter.reset(key);
    expect(authRateLimiter.isRateLimited(key, 5, 60000).limited).toBe(false);
  });
});
