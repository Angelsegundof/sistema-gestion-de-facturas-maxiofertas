import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { createDocumentShareTokenService, resolveSharedDocumentService } from "@/lib/services/document-share";
import { getQueueCountersService } from "@/lib/services/invoice-queue";
import { getStatisticsSummaryService } from "@/lib/services/statistics";
import { hasPermission } from "@/domain/permissions";
import { SanitizedUser } from "@/domain/types";
import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";

describe("Phase 10.1D QA Adjustments Integration Tests (Real PostgreSQL)", () => {
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let warehouseUserA: SanitizedUser;
  let warehouseUserB: SanitizedUser;
  let executorUser: SanitizedUser;
  let managementUser: SanitizedUser;
  let adminUser: SanitizedUser;
  let warehouseA: schema.Warehouse;
  let warehouseB: schema.Warehouse;
  let customerA: schema.Customer;

  beforeEach(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema });

    const migrations = [
      "0000_cheerful_giant_girl.sql",
      "0001_sharp_reptil.sql",
      "0002_concerned_molly_hayes.sql",
      "0003_rapid_boomerang.sql",
      "0004_wet_mulholland_black.sql",
      "0005_uneven_lady_bullseye.sql",
      "0006_shallow_skaar.sql",
      "0007_document_share_tokens.sql",
    ];

    for (const file of migrations) {
      const sqlContent = fs.readFileSync(
        path.resolve(__dirname, `../src/lib/db/migrations/${file}`),
        "utf8"
      );
      for (const st of sqlContent.split("--> statement-breakpoint").filter((s) => s.trim())) {
        await pglite.exec(st);
      }
    }

    // Insert Warehouses
    const [whA, whB] = await db
      .insert(schema.warehouses)
      .values([
        { code: "STGO-CENTRAL", name: "Bodega Santiago Central", active: true },
        { code: "ANTOF-NORTE", name: "Bodega Norte Antofagasta", active: true },
      ])
      .returning();
    warehouseA = whA;
    warehouseB = whB;

    // Insert Customer
    const [cust] = await db
      .insert(schema.customers)
      .values({
        rutDisplay: "76.123.456-0",
        rutCanonical: "76123456-0",
        legalName: "Empresa de Prueba SpA",
        businessActivity: "Venta Mayorista",
      })
      .returning();
    customerA = cust;

    // Insert Users
    const insertedUsers = await db
      .insert(schema.users)
      .values([
        {
          email: "solicitante.a@maxiofertas.cl",
          name: "Solicitante Central",
          passwordHash: "hash",
          role: "WAREHOUSE_USER",
          warehouseId: warehouseA.id,
          active: true,
        },
        {
          email: "solicitante.b@maxiofertas.cl",
          name: "Solicitante Norte",
          passwordHash: "hash",
          role: "WAREHOUSE_USER",
          warehouseId: warehouseB.id,
          active: true,
        },
        {
          email: "ejecutor@maxiofertas.cl",
          name: "Ejecutor Facturacion",
          passwordHash: "hash",
          role: "INVOICE_EXECUTOR",
          active: true,
        },
        {
          email: "jefatura@maxiofertas.cl",
          name: "Jefatura Operaciones",
          passwordHash: "hash",
          role: "MANAGEMENT",
          active: true,
        },
        {
          email: "admin@maxiofertas.cl",
          name: "Administrador General",
          passwordHash: "hash",
          role: "ADMIN",
          active: true,
        },
      ])
      .returning();

    warehouseUserA = {
      id: insertedUsers[0].id,
      email: insertedUsers[0].email,
      name: insertedUsers[0].name,
      role: insertedUsers[0].role,
      warehouseId: insertedUsers[0].warehouseId,
      active: insertedUsers[0].active,
      createdAt: insertedUsers[0].createdAt.toISOString(),
      updatedAt: insertedUsers[0].updatedAt.toISOString(),
    };

    warehouseUserB = {
      id: insertedUsers[1].id,
      email: insertedUsers[1].email,
      name: insertedUsers[1].name,
      role: insertedUsers[1].role,
      warehouseId: insertedUsers[1].warehouseId,
      active: insertedUsers[1].active,
      createdAt: insertedUsers[1].createdAt.toISOString(),
      updatedAt: insertedUsers[1].updatedAt.toISOString(),
    };

    executorUser = {
      id: insertedUsers[2].id,
      email: insertedUsers[2].email,
      name: insertedUsers[2].name,
      role: insertedUsers[2].role,
      warehouseId: null,
      active: insertedUsers[2].active,
      createdAt: insertedUsers[2].createdAt.toISOString(),
      updatedAt: insertedUsers[2].updatedAt.toISOString(),
    };

    managementUser = {
      id: insertedUsers[3].id,
      email: insertedUsers[3].email,
      name: insertedUsers[3].name,
      role: insertedUsers[3].role,
      warehouseId: null,
      active: insertedUsers[3].active,
      createdAt: insertedUsers[3].createdAt.toISOString(),
      updatedAt: insertedUsers[3].updatedAt.toISOString(),
    };

    adminUser = {
      id: insertedUsers[4].id,
      email: insertedUsers[4].email,
      name: insertedUsers[4].name,
      role: insertedUsers[4].role,
      warehouseId: null,
      active: insertedUsers[4].active,
      createdAt: insertedUsers[4].createdAt.toISOString(),
      updatedAt: insertedUsers[4].updatedAt.toISOString(),
    };
  });

  describe("QA-007: Document Share Tokens & Controlled Public Links", () => {
    it("should generate cryptographically secure share link and store only SHA-256 hash in DB", async () => {
      // 1. Create completed invoice & document
      const [req] = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-2026-000501",
          warehouseId: warehouseA.id,
          customerId: customerA.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: "76.123.456-0",
          customerLegalNameSnapshot: "Cliente QA Central",
          customerBusinessActivitySnapshot: "Comercial",
          expectedGrossTotal: 150000,
        })
        .returning();

      const [doc] = await db
        .insert(schema.documents)
        .values({
          invoiceRequestId: req.id,
          documentType: "INVOICE",
          storageProvider: "R2",
          storageKey: "invoices/FAC-2026-000501.pdf",
          fileName: "factura_501.pdf",
          mimeType: "application/pdf",
          fileSize: 10240,
          uploadedBy: executorUser.id,
        })
        .returning();

      // 2. Generate share token as Requester
      const result = await createDocumentShareTokenService(
        warehouseUserA,
        doc.id,
        "https://facturacion.maxiofertas.cl",
        "127.0.0.1",
        db
      );

      expect(result.rawToken).toBeDefined();
      expect(result.rawToken.length).toBe(64); // 32 bytes hex
      expect(result.shareToken.shareUrl).toBe(`https://facturacion.maxiofertas.cl/f/${result.rawToken}`);

      // Verify that database stores the hash and NOT the raw token
      const rows = await db
        .select()
        .from(schema.documentShareTokens)
        .where(eq(schema.documentShareTokens.id, result.shareToken.id));

      expect(rows).toHaveLength(1);
      const expectedHash = crypto.createHash("sha256").update(result.rawToken).digest("hex");
      expect(rows[0].tokenHash).toBe(expectedHash);
      expect(rows[0].tokenHash).not.toBe(result.rawToken);
    });

    it("should resolve active valid share token without authentication and provide short-lived access", async () => {
      const [req] = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-2026-000502",
          warehouseId: warehouseA.id,
          customerId: customerA.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: "76.123.456-0",
          customerLegalNameSnapshot: "Cliente Activo",
          customerBusinessActivitySnapshot: "Comercial",
          expectedGrossTotal: 85000,
        })
        .returning();

      const [doc] = await db
        .insert(schema.documents)
        .values({
          invoiceRequestId: req.id,
          documentType: "INVOICE",
          storageProvider: "R2",
          storageKey: "invoices/FAC-2026-000502.pdf",
          fileName: "factura_502.pdf",
          mimeType: "application/pdf",
          fileSize: 15360,
          uploadedBy: executorUser.id,
        })
        .returning();

      const { rawToken } = await createDocumentShareTokenService(
        warehouseUserA,
        doc.id,
        undefined,
        "127.0.0.1",
        db
      );

      const resolved = await resolveSharedDocumentService(rawToken, "127.0.0.1", db);
      expect(resolved.status).toBe("ACTIVE");
      if (resolved.status === "ACTIVE") {
        expect(resolved.document.id).toBe(doc.id);
        expect(resolved.accessUrl).toBeDefined();
        expect(resolved.invoiceRequest.requestNumber).toBe("FAC-2026-000502");
      }
    });

    it("should safely reject non-existent or invalid share tokens", async () => {
      const bogusToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      await expect(
        resolveSharedDocumentService(bogusToken, "127.0.0.1", db)
      ).rejects.toThrow("NOT_FOUND");
    });

    it("should recognize when a shared document was superseded / voided by a credit note", async () => {
      const [req] = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-2026-000503",
          warehouseId: warehouseA.id,
          customerId: customerA.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: "76.123.456-0",
          customerLegalNameSnapshot: "Cliente Rectificado",
          customerBusinessActivitySnapshot: "Comercial",
          expectedGrossTotal: 100000,
        })
        .returning();

      const [voidedDoc] = await db
        .insert(schema.documents)
        .values({
          invoiceRequestId: req.id,
          documentType: "INVOICE",
          storageProvider: "R2",
          storageKey: "invoices/FAC-2026-000503_v1.pdf",
          fileName: "factura_v1.pdf",
          mimeType: "application/pdf",
          fileSize: 10240,
          isVoided: true,
          uploadedBy: executorUser.id,
        })
        .returning();

      const { rawToken } = await createDocumentShareTokenService(
        warehouseUserA,
        voidedDoc.id,
        undefined,
        "127.0.0.1",
        db
      );

      const resolved = await resolveSharedDocumentService(rawToken, "127.0.0.1", db);
      expect(resolved.status).toBe("SUPERSEDED");
      expect(resolved.document.isVoided).toBe(true);
    });

    it("should enforce IDOR when creating share token (Requester B cannot generate link for Requester A)", async () => {
      const [req] = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-2026-000504",
          warehouseId: warehouseA.id,
          customerId: customerA.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: "76.123.456-0",
          customerLegalNameSnapshot: "Cliente Privado",
          customerBusinessActivitySnapshot: "Comercial",
          expectedGrossTotal: 100000,
        })
        .returning();

      const [doc] = await db
        .insert(schema.documents)
        .values({
          invoiceRequestId: req.id,
          documentType: "INVOICE",
          storageProvider: "R2",
          storageKey: "invoices/FAC-2026-000504.pdf",
          fileName: "factura_504.pdf",
          mimeType: "application/pdf",
          fileSize: 10240,
          uploadedBy: executorUser.id,
        })
        .returning();

      await expect(
        createDocumentShareTokenService(warehouseUserB, doc.id, undefined, "127.0.0.1", db)
      ).rejects.toThrow("FORBIDDEN");
    });
  });

  describe("QA-008: Warehouse Filter & Synchronized Operational Counters", () => {
    beforeEach(async () => {
      // Create 2 PENDING requests for Warehouse A
      await db.insert(schema.invoiceRequests).values([
        {
          requestNumber: "FAC-2026-000601",
          warehouseId: warehouseA.id,
          customerId: customerA.id,
          requestedBy: warehouseUserA.id,
          status: "PENDING",
          customerRutSnapshot: "76.123.456-0",
          customerLegalNameSnapshot: "Cliente A1",
          customerBusinessActivitySnapshot: "Comercial",
          expectedGrossTotal: 10000,
        },
        {
          requestNumber: "FAC-2026-000602",
          warehouseId: warehouseA.id,
          customerId: customerA.id,
          requestedBy: warehouseUserA.id,
          status: "PENDING",
          customerRutSnapshot: "76.123.456-0",
          customerLegalNameSnapshot: "Cliente A2",
          customerBusinessActivitySnapshot: "Comercial",
          expectedGrossTotal: 20000,
        },
      ]);

      // Create 1 PENDING request and 1 IN_PROGRESS request for Warehouse B
      await db.insert(schema.invoiceRequests).values([
        {
          requestNumber: "FAC-2026-000603",
          warehouseId: warehouseB.id,
          customerId: customerA.id,
          requestedBy: warehouseUserB.id,
          status: "PENDING",
          customerRutSnapshot: "77.123.456-0",
          customerLegalNameSnapshot: "Cliente B1",
          customerBusinessActivitySnapshot: "Minero",
          expectedGrossTotal: 50000,
        },
        {
          requestNumber: "FAC-2026-000604",
          warehouseId: warehouseB.id,
          customerId: customerA.id,
          requestedBy: warehouseUserB.id,
          status: "IN_PROGRESS",
          assignedTo: executorUser.id,
          customerRutSnapshot: "77.123.456-0",
          customerLegalNameSnapshot: "Cliente B2",
          customerBusinessActivitySnapshot: "Minero",
          expectedGrossTotal: 80000,
        },
      ]);
    });

    it("should calculate global counters when no warehouse filter is provided", async () => {
      const globalCounters = await getQueueCountersService(undefined, db);
      expect(globalCounters.pendingCount).toBe(3); // 2 from A + 1 from B
      expect(globalCounters.inProgressCount).toBe(1); // 1 from B
    });

    it("should filter counters accurately when warehouse A is specified", async () => {
      const countersA = await getQueueCountersService(warehouseA.id, db);
      expect(countersA.pendingCount).toBe(2);
      expect(countersA.inProgressCount).toBe(0);
    });

    it("should filter counters accurately when warehouse B is specified", async () => {
      const countersB = await getQueueCountersService(warehouseB.id, db);
      expect(countersB.pendingCount).toBe(1);
      expect(countersB.inProgressCount).toBe(1);
    });
  });

  describe("QA-009: Statistics Access for Management and Admin", () => {
    it("should allow MANAGEMENT and ADMIN to fetch statistics summary", async () => {
      const summaryMgmt = await getStatisticsSummaryService(
        managementUser,
        {
          month: 8,
          year: 2026,
        },
        db
      );
      expect(summaryMgmt).toBeDefined();
      expect(summaryMgmt.grossTotal).toBeDefined();

      const summaryAdmin = await getStatisticsSummaryService(
        adminUser,
        {
          month: 8,
          year: 2026,
        },
        db
      );
      expect(summaryAdmin).toBeDefined();
      expect(summaryAdmin.period.month).toBe(8);
    });

    it("should deny WAREHOUSE_USER from accessing statistics via permission check", () => {
      expect(hasPermission(warehouseUserA.role, "STATS_VIEW")).toBe(false);
      expect(hasPermission(managementUser.role, "STATS_VIEW")).toBe(true);
      expect(hasPermission(adminUser.role, "STATS_VIEW")).toBe(true);
    });
  });
});
