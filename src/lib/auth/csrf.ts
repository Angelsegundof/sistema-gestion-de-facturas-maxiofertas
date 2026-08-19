import { NextRequest } from "next/server";

export interface CsrfValidationResult {
  valid: boolean;
  reason?: string;
}

export function verifyCsrfOrigin(request: NextRequest): CsrfValidationResult {
  const method = request.method.toUpperCase();
  // Safe read-only HTTP methods
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return { valid: true };
  }

  // 1. Check Sec-Fetch-Site header (modern browsers)
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    return {
      valid: false,
      reason: "Petici?n cross-site denegada por pol?tica de seguridad CSRF.",
    };
  }

  // 2. Check Origin header
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");

  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      const cleanHost = host.split(":")[0].toLowerCase();
      const cleanOriginHost = originUrl.hostname.toLowerCase();

      if (cleanOriginHost !== cleanHost && !origin.includes(cleanHost)) {
        return {
          valid: false,
          reason: `Origen no autorizado (${originUrl.hostname} no coincide con ${cleanHost}).`,
        };
      }
    } catch {
      return {
        valid: false,
        reason: "Encabezado Origin con formato inv?lido.",
      };
    }
  }

  return { valid: true };
}
