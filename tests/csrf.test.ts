import { describe, it, expect } from "vitest";
import { verifyCsrfOrigin } from "@/lib/auth/csrf";
import { NextRequest } from "next/server";

describe("CSRF & Same-Origin Defense", () => {
  it("should permit safe GET requests unconditionally", () => {
    const req = new NextRequest("http://localhost:3000/api/v1/auth/session", {
      method: "GET",
    });
    const result = verifyCsrfOrigin(req);
    expect(result.valid).toBe(true);
  });

  it("should reject cross-site mutating requests indicated by Sec-Fetch-Site", () => {
    const req = new NextRequest("http://localhost:3000/api/v1/auth/logout", {
      method: "POST",
      headers: {
        "sec-fetch-site": "cross-site",
        origin: "https://malicious-attacker-site.com",
      },
    });
    const result = verifyCsrfOrigin(req);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("cross-site");
  });

  it("should reject mutating requests with mismatched Origin header", () => {
    const req = new NextRequest("http://localhost:3000/api/v1/admin/users", {
      method: "POST",
      headers: {
        host: "maxiofertas-facturacion.vercel.app",
        origin: "https://evil-phishing-site.com",
      },
    });
    const result = verifyCsrfOrigin(req);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("no coincide");
  });

  it("should permit same-origin mutating requests", () => {
    const req = new NextRequest("http://localhost:3000/api/v1/auth/login", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    });
    const result = verifyCsrfOrigin(req);
    expect(result.valid).toBe(true);
  });
});
