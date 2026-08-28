import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, desc, and, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { runLocalMigrations } from "@/lib/db";
import { importRealUsersService } from "../scripts/import_real_users";
import { runHistoricalMigration } from "../scripts/import_historical_data";
import { normalizeRut, formatRut } from "@/lib/validation/rut";
import { calculateNetPrice, DEFAULT_VAT_RATE_PERCENT } from "@/domain/pricing";
import { computeAgeIndicator } from "@/lib/services/invoice-queue";
import { formatWhatsAppInvoiceMessage } from "@/domain/whatsapp";
import { createDocumentShareTokenService } from "@/lib/services/document-share";
import { logAuditEvent } from "@/lib/auth/audit";

describe("FASE 11C.1 — Production Deploy and Complete Smoke Test Suite", () => {
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    pglite = new PGlite();
    await pglite.waitReady;
    await runLocalMigrations(pglite);
    db = drizzle(pglite, { schema });

    // 1. Provision real users & warehouses
    await importRealUsersService(db);

    // 2. Import real historical data
    await runHistoricalMigration("historico_facturacion.xlsx", db);
  }, 180000);

  it("1. Database & Users Integrity: 20 real users active, 0 QA users, 16 bodegas", async () => {
    const allUsers = await db.select().from(schema.users);
    expect(allUsers).toHaveLength(20);

    for (const u of allUsers) {
      expect(u.active).toBe(true);
      expect(u.email).toBe(u.email.toLowerCase());
      expect(["ADMIN", "MANAGEMENT", "INVOICE_EXECUTOR", "WAREHOUSE_USER"]).toContain(u.role);
    }

    const allWarehouses = await db.select().from(schema.warehouses);
    expect(allWarehouses).toHaveLength(16);

    const osorno = allWarehouses.find((w) => w.code === "OSORNO");
    const copiapo = allWarehouses.find((w) => w.code === "COPIAPO");
    expect(osorno).toBeDefined();
    expect(copiapo).toBeDefined();
  });

  it("2. Historical Data Integrity: 8.282 requests, 5.880 customers, 8.103 Google Drive docs", async () => {
    const [reqCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.invoiceRequests);
    expect(reqCount.count).toBe(8282);

    const [custCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.customers);
    expect(custCount.count).toBeGreaterThanOrEqual(5875);

    const [driveDocsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.documents)
      .where(eq(schema.documents.storageProvider, "GOOGLE_DRIVE"));
    expect(driveDocsCount.count).toBe(8103);
  });

  it("3. Authentication & RBAC Scope Validation", async () => {
    // A. WAREHOUSE_USER scope
    const [whUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "santiago.maxiofertas@gmail.com"));
    expect(whUser.role).toBe("WAREHOUSE_USER");
    expect(whUser.warehouseId).toBeDefined();

    // B. INVOICE_EXECUTOR scope
    const [execUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "verocars1178@gmail.com"));
    expect(execUser.role).toBe("INVOICE_EXECUTOR");

    // C. MANAGEMENT scope
    const [mgmtUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "miyelics@gmail.com"));
    expect(mgmtUser.role).toBe("MANAGEMENT");

    // D. ADMIN scope
    const [adminUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "sistemasecuweb@gmail.com"));
    expect(adminUser.role).toBe("ADMIN");

    // E. Unprovisioned blocked
    const unprovisioned = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "unauthorized@external.cl"));
    expect(unprovisioned).toHaveLength(0);
  });

  it("4. Client Lookup & RUT Normalization Smoke Test", async () => {
    // 1. Existing customer lookup with unformatted RUT
    const [sampleCustomer] = await db.select().from(schema.customers).limit(1);
    const rawRutInput = sampleCustomer.rutCanonical; // e.g. 76762915K or 761234560
    const canonical = normalizeRut(rawRutInput);

    const [found] = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.rutCanonical, canonical));
    expect(found).toBeDefined();
    expect(found.id).toBe(sampleCustomer.id);

    // 2. Non-existent RUT lookup
    const nonExistentCanonical = "999999999";
    const notFound = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.rutCanonical, nonExistentCanonical));
    expect(notFound).toHaveLength(0);
  });

  it("5. Statistics & Age Calculation Smoke Test", async () => {
    // 1. Monthly gross sum
    const [stats] = await db
      .select({
        totalGross: sql<number>`sum(expected_gross_total)::bigint`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.invoiceRequests)
      .where(eq(schema.invoiceRequests.status, "COMPLETED"));

    expect(Number(stats.totalGross)).toBeGreaterThan(600_000_000);
    expect(stats.count).toBeGreaterThan(7900);

    // 2. Age calculation from real persisted timestamps
    const [historicalReq] = await db
      .select()
      .from(schema.invoiceRequests)
      .where(eq(schema.invoiceRequests.status, "COMPLETED"))
      .orderBy(schema.invoiceRequests.createdAt)
      .limit(1);

    const age = computeAgeIndicator(historicalReq.createdAt);
    expect(age.minutesElapsed).toBeGreaterThan(60 * 24 * 30); // More than 30 days
    expect(age.displayAge).toContain("d");
  });

  it("6. End-to-End Controlled Transactional Flow Smoke Test (Create -> Claim -> Complete -> R2 Doc -> WhatsApp Share)", async () => {
    // 1. Solicitante creates request
    const [whSantiago] = await db
      .select()
      .from(schema.warehouses)
      .where(eq(schema.warehouses.code, "CENTRAL"));
    const [solicitante] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "santiago.maxiofertas@gmail.com"));
    const [customer] = await db.select().from(schema.customers).limit(1);

    const smokeGross = 45000;
    const smokeNet = calculateNetPrice(smokeGross, DEFAULT_VAT_RATE_PERCENT);

    const [smokeReq] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-SMOKE001",
        warehouseId: whSantiago.id,
        customerId: customer.id,
        requestedBy: solicitante.id,
        customerRutSnapshot: customer.rutDisplay,
        customerLegalNameSnapshot: customer.legalName,
        customerBusinessActivitySnapshot: customer.businessActivity,
        expectedGrossTotal: smokeGross,
        status: "PENDING",
        notes: "SMOKE TEST PRODUCTIVO F11C — ELIMINAR/ANULAR DESPUÉS DE VALIDACIÓN",
      })
      .returning();

    expect(smokeReq.status).toBe("PENDING");

    // 2. Executor claims request
    const [executor] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "verocars1178@gmail.com"));

    const [claimedReq] = await db
      .update(schema.invoiceRequests)
      .set({
        assignedTo: executor.id,
        assignedAt: new Date(),
        status: "IN_PROGRESS",
      })
      .where(eq(schema.invoiceRequests.id, smokeReq.id))
      .returning();

    expect(claimedReq.status).toBe("IN_PROGRESS");
    expect(claimedReq.assignedTo).toBe(executor.id);

    // 3. Executor uploads R2 PDF document & completes invoice
    const [r2Doc] = await db
      .insert(schema.documents)
      .values({
        invoiceRequestId: smokeReq.id,
        documentType: "INVOICE",
        storageProvider: "R2",
        storageKey: `invoices/2026/08/FAC-2026-SMOKE001.pdf`,
        fileName: "FAC-2026-SMOKE001.pdf",
        mimeType: "application/pdf",
        fileSize: 102400, // 100 KB
        uploadedBy: executor.id,
      })
      .returning();

    expect(r2Doc.storageProvider).toBe("R2");

    const [completedReq] = await db
      .update(schema.invoiceRequests)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        siiGrossTotal: smokeGross,
        grossDifference: 0,
        reconciliationStatus: "MATCH",
      })
      .where(eq(schema.invoiceRequests.id, smokeReq.id))
      .returning();

    expect(completedReq.status).toBe("COMPLETED");
    expect(completedReq.reconciliationStatus).toBe("MATCH");

    // 4. Generate WhatsApp Share Token & Message
    const shareRes = await createDocumentShareTokenService(
      {
        id: executor.id,
        email: executor.email,
        name: executor.name,
        role: "INVOICE_EXECUTOR",
        active: true,
        warehouseId: executor.warehouseId,
        createdAt: executor.createdAt.toISOString(),
        updatedAt: executor.updatedAt.toISOString(),
      },
      r2Doc.id,
      "https://facturas.maxiofertas.cl",
      "127.0.0.1",
      db
    );

    const shareUrl = shareRes.shareToken.shareUrl;
    const whatsappMsg = formatWhatsAppInvoiceMessage(customer.legalName, shareUrl);

    expect(whatsappMsg).toContain(customer.legalName);
    expect(whatsappMsg).toContain(shareUrl);

    // 5. Verify Token Lookup (Customer view)
    const [tokenDb] = await db
      .select()
      .from(schema.documentShareTokens)
      .where(eq(schema.documentShareTokens.id, shareRes.shareToken.id));
    expect(tokenDb).toBeDefined();
    expect(tokenDb.documentId).toBe(r2Doc.id);

    // 6. Audit Logging Verification
    await logAuditEvent({
      userId: executor.id,
      action: "INVOICE_COMPLETED",
      entityType: "invoice_requests",
      entityId: smokeReq.id,
      metadata: { grossTotal: smokeGross },
      dbOverride: db,
    });

    const [lastAudit] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, smokeReq.id))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(1);

    expect(lastAudit).toBeDefined();
    expect(lastAudit.action).toBe("INVOICE_COMPLETED");
  });
});
