import { describe, it, expect } from "vitest";
import { validatePasswordPolicy } from "@/lib/auth/password-policy";

describe("Password Policy Security Standard", () => {
  it("should reject passwords under 8 characters", () => {
    expect(validatePasswordPolicy("Short1!").valid).toBe(false);
    expect(validatePasswordPolicy("1234567").valid).toBe(false);
  });

  it("should reject trivial / easily guessable passwords", () => {
    expect(validatePasswordPolicy("12345678").valid).toBe(false);
    expect(validatePasswordPolicy("password").valid).toBe(false);
    expect(validatePasswordPolicy("admin123").valid).toBe(false);
    expect(validatePasswordPolicy("maxiofertas").valid).toBe(false);
    expect(validatePasswordPolicy("qwertyuiop").valid).toBe(false);
  });

  it("should reject passwords exceeding 128 characters (DoS protection)", () => {
    const longPassword = "a".repeat(129);
    expect(validatePasswordPolicy(longPassword).valid).toBe(false);
  });

  it("should accept compliant robust passwords", () => {
    expect(validatePasswordPolicy("Maxiofertas2026!Segura").valid).toBe(true);
    expect(validatePasswordPolicy("Empresa_Factura#9988").valid).toBe(true);
  });
});
