import { describe, it, expect, afterEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";
import { runLocalMigrations, getDb } from "@/lib/db";
import { r2Client } from "@/lib/r2/client";
import { GET as healthCheckGet } from "@/app/api/v1/health/route";
import { GET as healthCheckAliasGet } from "@/app/api/health/route";

describe("FASE 11A — Production Preparation & Hardening", () => {
  describe("1. Empty Database Migrations Integrity", () => {
    it("should build full database schema from zero on an empty PostgreSQL instance", async () => {
      // 1. Create fresh empty PGlite database
      const pglite = new PGlite();
      await pglite.waitReady;

      // 2. Run all sequential migrations
      await runLocalMigrations(pglite);
      const db = drizzle(pglite, { schema });

      // 3. Verify all tables exist and can be queried
      const tables = [
        "users",
        "warehouses",
        "customers",
        "sessions",
        "audit_logs",
        "rate_limits",
        "invoice_requests",
        "invoice_request_items",
        "request_corrections",
        "documents",
        "credit_notes",
        "rectifications",
        "migration_records",
        "document_share_tokens",
      ];

      for (const table of tables) {
        const result = await pglite.query(`SELECT COUNT(*) as count FROM "${table}"`);
        expect(result.rows).toBeDefined();
        const row = result.rows[0] as { count: string | number };
        expect(Number(row.count)).toBe(0);
      }

      // 4. Verify foreign key constraints are working
      await expect(
        db.insert(schema.users).values({
          email: "invalid-wh@maxiofertas.cl",
          name: "Invalid Warehouse User",
          passwordHash: "hash123",
          role: "WAREHOUSE_USER",
          warehouseId: "00000000-0000-0000-0000-000000000000", // Non-existent warehouse
        })
      ).rejects.toThrow();
    });
  });

  describe("2. Production Safeguards and Mock Bypasses Elimination", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    });

    it("should refuse fallback to PGlite when NODE_ENV is production and DATABASE_URL is missing", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      const prodDb = getDb();
      expect(prodDb).toBeNull();
    });

    it("should refuse in-memory fallback and mock presigned URLs when NODE_ENV is production and R2 is unconfigured", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      // Put object must throw
      await expect(
        r2Client.putObject({
          key: "test/doc.pdf",
          body: Buffer.from("test"),
          contentType: "application/pdf",
        })
      ).rejects.toThrow(/Cloudflare R2 is not configured in production/);

      // Presigned upload url must throw
      await expect(
        r2Client.generatePresignedUploadUrl({
          key: "test/upload.pdf",
          contentType: "application/pdf",
        })
      ).rejects.toThrow(/Cloudflare R2 is not configured in production/);

      // Presigned download url must throw
      await expect(
        r2Client.generatePresignedDownloadUrl("test/download.pdf")
      ).rejects.toThrow(/Cloudflare R2 is not configured in production/);
    });
  });

  describe("3. Health Check Endpoints", () => {
    it("should return ok status without exposing credentials or internal paths on /api/v1/health", async () => {
      const res = await healthCheckGet();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("ok");
      expect(body.data.service).toBe("maxiofertas-facturacion");
      expect(body.data.database).toBeDefined();

      // Must not expose internal credentials
      expect(JSON.stringify(body)).not.toContain("password");
      expect(JSON.stringify(body)).not.toContain("postgres://");
      expect(JSON.stringify(body)).not.toContain("AUTH_SECRET");
    });

    it("should return identical ok response on alias /api/health", async () => {
      const res = await healthCheckAliasGet();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("ok");
    });
  });
});
