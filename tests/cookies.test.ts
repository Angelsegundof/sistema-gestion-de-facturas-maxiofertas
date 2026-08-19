import { describe, it, expect } from "vitest";
import {
  getSessionCookieOptions,
  getExpiredCookieOptions,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth/cookies";

describe("Security Cookies Configuration", () => {
  it("should configure session cookies with HttpOnly, SameSite, and 7-day maxAge", () => {
    const token = "secure_token_sample_123";
    const options = getSessionCookieOptions(token);

    expect(options.name).toBe(SESSION_COOKIE_NAME);
    expect(options.value).toBe(token);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(SESSION_DURATION_SECONDS);
  });

  it("should configure expired cookies with maxAge 0 to immediately clear sessions", () => {
    const options = getExpiredCookieOptions();

    expect(options.name).toBe(SESSION_COOKIE_NAME);
    expect(options.value).toBe("");
    expect(options.httpOnly).toBe(true);
    expect(options.maxAge).toBe(0);
  });
});
