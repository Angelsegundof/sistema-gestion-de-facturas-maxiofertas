import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
} from "@/lib/auth/crypto";

describe("Auth Cryptography", () => {
  it("should securely hash and verify passwords with bcrypt", async () => {
    const password = "SuperSecurePassword2026!";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.startsWith("$2")).toBe(true);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword("WrongPassword123", hash);
    expect(isInvalid).toBe(false);
  });

  it("should generate cryptographically random 64-char hex session tokens", () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(token1).toHaveLength(64);
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
  });

  it("should generate consistent SHA-256 token hashes for database indexing", () => {
    const rawToken = "sample_raw_token_value_12345";
    const hash1 = hashToken(rawToken);
    const hash2 = hashToken(rawToken);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });
});
