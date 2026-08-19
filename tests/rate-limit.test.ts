import { describe, it, expect, beforeEach } from "vitest";
import { authRateLimiter } from "@/lib/auth/rate-limit";

describe("Authentication Rate Limiting", () => {
  beforeEach(async () => {
    await authRateLimiter.reset("test-ip-123");
  });

  it("should permit attempts under the threshold and block after 5 failed attempts", async () => {
    const key = "test-ip-123";

    for (let i = 0; i < 4; i++) {
      await authRateLimiter.recordAttempt(key, 60000);
      const check = await authRateLimiter.isRateLimited(key, 5, 60000);
      expect(check.limited).toBe(false);
    }

    // 5th attempt triggers rate limit
    await authRateLimiter.recordAttempt(key, 60000);
    const checkBlocked = await authRateLimiter.isRateLimited(key, 5, 60000);
    expect(checkBlocked.limited).toBe(true);
    expect(checkBlocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("should allow reset upon successful login", async () => {
    const key = "test-ip-123";
    for (let i = 0; i < 5; i++) {
      await authRateLimiter.recordAttempt(key, 60000);
    }
    const checkBefore = await authRateLimiter.isRateLimited(key, 5, 60000);
    expect(checkBefore.limited).toBe(true);

    await authRateLimiter.reset(key);
    const checkAfter = await authRateLimiter.isRateLimited(key, 5, 60000);
    expect(checkAfter.limited).toBe(false);
  });
});
