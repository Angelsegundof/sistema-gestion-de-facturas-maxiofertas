import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import {
  getStatisticsSummaryService,
  getStatisticsByWarehouseService,
  getMonthlyEvolutionService,
} from "../src/lib/services/statistics";
import { SanitizedUser } from "../src/domain/types";

describe("Fase 9: Estadísticas y Facturación Vigente (Integration)", () => {
  let pg: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  const adminUser: SanitizedUser = {
    id: "a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
    email: "admin@maxiofertas.cl",
    name: "Administrador General",
    role: "ADMIN",
    warehouseId: null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const managementUser: SanitizedUser = {
    id: "a2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
    email: "jefatura@maxiofertas.cl",
    name: "Jefatura Operaciones",
    role: "MANAGEMENT",
    warehouseId: null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const warehouseUserA: SanitizedUser = {
    id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
    email: "bodega.norte@maxiofertas.cl",
    name: "Usuario Bodega Norte",
    role: "WAREHOUSE_USER",
    warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const warehouseUserB: SanitizedUser = {
    id: "b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
    email: "bodega.sur@maxiofertas.cl",
    name: "Usuario Bodega Sur",
    role: "WAREHOUSE_USER",
    warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const readMigration = (fileName: string) => {
    const fullPath = path.resolve(__dirname, `../src/lib/db/migrations/${fileName}`);
    return fs.readFileSync(fullPath, "utf8");
  };

  beforeEach(async () => {
    pg = new PGlite();
    db = drizzle(pg, { schema });

    const migrations = [
      "0000_cheerful_giant_girl.sql",
      "0001_sharp_reptil.sql",
      "0002_concerned_molly_hayes.sql",
      "0003_rapid_boomerang.sql",
      "0004_wet_mulholland_black.sql",
      "0005_uneven_lady_bullseye.sql",
      "0006_shallow_skaar.sql",
    ];

    for (const m of migrations) {
      const sqlContent = readMigration(m);
      const statements = sqlContent.split("--> statement-breakpoint").filter((s) => s.trim().length > 0);
      for (const st of statements) {
        await pg.exec(st);
      }
    }

    // Seed Warehouses
    await db.insert(schema.warehouses).values([
      {
        id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
        code: "NORTE",
        name: "Bodega Norte",
        active: true,
      },
      {
        id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
        code: "SUR",
        name: "Bodega Sur",
        active: true,
      },
    ]);

    // Seed Users
    await db.insert(schema.users).values([
      {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        passwordHash: "hash",
        role: adminUser.role,
        warehouseId: null,
        active: true,
      },
      {
        id: managementUser.id,
        email: managementUser.email,
        name: managementUser.name,
        passwordHash: "hash",
        role: managementUser.role,
        warehouseId: null,
        active: true,
      },
      {
        id: warehouseUserA.id,
        email: warehouseUserA.email,
        name: warehouseUserA.name,
        passwordHash: "hash",
        role: warehouseUserA.role,
        warehouseId: warehouseUserA.warehouseId,
        active: true,
      },
      {
        id: warehouseUserB.id,
        email: warehouseUserB.email,
        name: warehouseUserB.name,
        passwordHash: "hash",
        role: warehouseUserB.role,
        warehouseId: warehouseUserB.warehouseId,
        active: true,
      },
    ]);

    // Seed Customer
    await db.insert(schema.customers).values({
      id: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      rutCanonical: "761234567",
      rutDisplay: "76.123.456-7",
      legalName: "Cliente Test SPA",
      businessActivity: "Venta Mayorista",
      active: true,
    });
  });

  it("Scenario 1 (Normal Invoice): Calculates active revenue from single completed valid invoice", async () => {
    const augustDate = new Date(Date.UTC(2026, 7, 15, 12, 0, 0)); // August 15, 2026

    const reqId = "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";
    await db.insert(schema.invoiceRequests).values({
      id: reqId,
      requestNumber: "FAC-2026-000001",
      warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      customerId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestedBy: warehouseUserA.id,
      status: "COMPLETED",
      customerRutSnapshot: "76.123.456-7",
      customerLegalNameSnapshot: "Cliente Test SPA",
      customerBusinessActivitySnapshot: "Giro",
      expectedGrossTotal: 100000,
      siiGrossTotal: 100000,
      reconciliationStatus: "MATCH",
      createdAt: augustDate,
      completedAt: augustDate,
    });

    await db.insert(schema.documents).values({
      id: "d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      documentType: "INVOICE",
      storageProvider: "R2",
      storageKey: "facturas/2026/08/FAC-2026-000001.pdf",
      fileName: "factura.pdf",
      mimeType: "application/pdf",
      fileSize: 10000,
      invoiceRequestId: reqId,
      isVoided: false,
      uploadedBy: adminUser.id,
      createdAt: augustDate,
    });

    const stats = await getStatisticsSummaryService(
      adminUser,
      { month: 8, year: 2026 },
      db
    );

    expect(stats.grossTotal).toBe(100000);
    expect(stats.invoiceCount).toBe(1);
    expect(stats.grossIssued).toBe(100000);
    expect(stats.creditNotesTotal).toBe(0);
    expect(stats.averageTicket).toBe(100000);
  });

  it("Scenario 2 (Voided Invoice by Credit Note): A voided invoice does NOT add to active revenue", async () => {
    const augustDate = new Date(Date.UTC(2026, 7, 15, 12, 0, 0));

    const reqId = "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";
    const origDocId = "d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";
    const cnDocId = "d2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02";
    const cnId = "c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";

    await db.insert(schema.invoiceRequests).values({
      id: reqId,
      requestNumber: "FAC-2026-000001",
      warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      customerId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestedBy: warehouseUserA.id,
      status: "COMPLETED",
      customerRutSnapshot: "76.123.456-7",
      customerLegalNameSnapshot: "Cliente Test SPA",
      customerBusinessActivitySnapshot: "Giro",
      expectedGrossTotal: 100000,
      siiGrossTotal: 100000,
      reconciliationStatus: "MATCH",
      createdAt: augustDate,
      completedAt: augustDate,
    });

    // Original document marked as VOIDED
    await db.insert(schema.documents).values({
      id: origDocId,
      documentType: "INVOICE",
      storageProvider: "R2",
      storageKey: "facturas/2026/08/FAC-2026-000001.pdf",
      fileName: "factura_anulada.pdf",
      mimeType: "application/pdf",
      fileSize: 10000,
      invoiceRequestId: reqId,
      isVoided: true,
      voidedAt: augustDate,
      uploadedBy: adminUser.id,
      createdAt: augustDate,
    });

    // Credit Note Document
    await db.insert(schema.documents).values({
      id: cnDocId,
      documentType: "CREDIT_NOTE",
      storageProvider: "R2",
      storageKey: "notas-credito/2026/08/FAC-2026-000001/nc.pdf",
      fileName: "nc.pdf",
      mimeType: "application/pdf",
      fileSize: 10000,
      invoiceRequestId: reqId,
      isVoided: false,
      uploadedBy: adminUser.id,
      createdAt: augustDate,
    });

    // Credit Note Record
    await db.insert(schema.creditNotes).values({
      id: cnId,
      rectificationId: "e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      invoiceRequestId: reqId,
      originalDocumentId: origDocId,
      grossTotal: 100000,
      issuedAt: augustDate,
      createdBy: adminUser.id,
      createdAt: augustDate,
    });

    const stats = await getStatisticsSummaryService(
      adminUser,
      { month: 8, year: 2026 },
      db
    );

    expect(stats.grossTotal).toBe(0); // Facturación vigente es 0
    expect(stats.invoiceCount).toBe(0); // Cantidad de facturas vigentes es 0
    expect(stats.creditNotesTotal).toBe(100000); // Notas de crédito suma 100.000
    expect(stats.creditNotesCount).toBe(1);
    expect(stats.grossIssued).toBe(100000); // Bruto emitido histórico conserva 100.000
  });

  it("Scenario 3 (Complete Rectification): Replaces voided invoice with new replacement invoice", async () => {
    const augustDate = new Date(Date.UTC(2026, 7, 20, 15, 0, 0));

    const reqId = "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";
    const origDocId = "d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";
    const cnDocId = "d2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02";
    const repDocId = "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a03";
    const cnId = "c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";
    const rectId = "e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";

    await db.insert(schema.invoiceRequests).values({
      id: reqId,
      requestNumber: "FAC-2026-000001",
      warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      customerId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestedBy: warehouseUserA.id,
      status: "COMPLETED",
      customerRutSnapshot: "76.123.456-7",
      customerLegalNameSnapshot: "Cliente Test SPA",
      customerBusinessActivitySnapshot: "Giro",
      expectedGrossTotal: 100000,
      siiGrossTotal: 100000,
      reconciliationStatus: "MATCH",
      createdAt: augustDate,
      completedAt: augustDate,
    });

    // 1. Original Doc (Voided)
    await db.insert(schema.documents).values({
      id: origDocId,
      documentType: "INVOICE",
      storageProvider: "R2",
      storageKey: "facturas/2026/08/FAC-2026-000001.pdf",
      fileName: "factura_anulada.pdf",
      mimeType: "application/pdf",
      fileSize: 10000,
      invoiceRequestId: reqId,
      isVoided: true,
      uploadedBy: adminUser.id,
      createdAt: augustDate,
    });

    // 2. Credit Note Doc & Record
    await db.insert(schema.documents).values({
      id: cnDocId,
      documentType: "CREDIT_NOTE",
      storageProvider: "R2",
      storageKey: "notas-credito/2026/08/FAC-2026-000001/nc.pdf",
      fileName: "nc.pdf",
      mimeType: "application/pdf",
      fileSize: 10000,
      invoiceRequestId: reqId,
      isVoided: false,
      uploadedBy: adminUser.id,
      createdAt: augustDate,
    });

    await db.insert(schema.creditNotes).values({
      id: cnId,
      rectificationId: rectId,
      invoiceRequestId: reqId,
      originalDocumentId: origDocId,
      grossTotal: 100000,
      issuedAt: augustDate,
      createdBy: adminUser.id,
      createdAt: augustDate,
    });

    // 3. Replacement Invoice Doc ($80.000)
    await db.insert(schema.documents).values({
      id: repDocId,
      documentType: "INVOICE",
      storageProvider: "R2",
      storageKey: "facturas/2026/08/FAC-2026-000001_v2.pdf",
      fileName: "factura_v2.pdf",
      mimeType: "application/pdf",
      fileSize: 10000,
      invoiceRequestId: reqId,
      isVoided: false,
      uploadedBy: adminUser.id,
      createdAt: augustDate,
    });

    // 4. Completed Rectification
    await db.insert(schema.rectifications).values({
      id: rectId,
      invoiceRequestId: reqId,
      originalInvoiceDocumentId: origDocId,
      requestedBy: warehouseUserA.id,
      reason: "PRICE",
      status: "COMPLETED",
      creditNoteId: cnId,
      creditNoteDocumentId: cnDocId,
      replacementInvoiceDocumentId: repDocId,
      siiGrossTotal: 80000,
      grossDifference: 0,
      reconciliationStatus: "MATCH",
      requestedAt: augustDate,
      completedAt: augustDate,
      createdAt: augustDate,
    });

    const stats = await getStatisticsSummaryService(
      managementUser,
      { month: 8, year: 2026 },
      db
    );

    expect(stats.grossIssued).toBe(180000); // 100.000 original + 80.000 reemplazo
    expect(stats.creditNotesTotal).toBe(100000); // 100.000 NC
    expect(stats.grossTotal).toBe(80000); // Facturación vigente = 80.000
    expect(stats.invoiceCount).toBe(1); // 1 factura vigente
    expect(stats.averageTicket).toBe(80000);
  });

  it("Scenario 4 (Two Active Invoices): Calculates sum, count and average ticket properly", async () => {
    const date = new Date(Date.UTC(2026, 7, 10));

    // Invoice A: $100.000
    await db.insert(schema.invoiceRequests).values({
      id: "f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestNumber: "FAC-2026-000001",
      warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      customerId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestedBy: warehouseUserA.id,
      status: "COMPLETED",
      customerRutSnapshot: "76.123.456-7",
      customerLegalNameSnapshot: "Cliente Test SPA",
      customerBusinessActivitySnapshot: "Giro",
      expectedGrossTotal: 100000,
      siiGrossTotal: 100000,
      createdAt: date,
      completedAt: date,
    });
    await db.insert(schema.documents).values({
      id: "d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      documentType: "INVOICE",
      storageProvider: "R2",
      storageKey: "facturas/2026/08/FAC-1.pdf",
      fileName: "f1.pdf",
      mimeType: "application/pdf",
      fileSize: 10000,
      invoiceRequestId: "f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      isVoided: false,
      uploadedBy: adminUser.id,
      createdAt: date,
    });

    // Invoice B: $50.000
    await db.insert(schema.invoiceRequests).values({
      id: "f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
      requestNumber: "FAC-2026-000002",
      warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
      customerId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestedBy: warehouseUserB.id,
      status: "COMPLETED",
      customerRutSnapshot: "76.123.456-7",
      customerLegalNameSnapshot: "Cliente Test SPA",
      customerBusinessActivitySnapshot: "Giro",
      expectedGrossTotal: 50000,
      siiGrossTotal: 50000,
      createdAt: date,
      completedAt: date,
    });
    await db.insert(schema.documents).values({
      id: "d2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
      documentType: "INVOICE",
      storageProvider: "R2",
      storageKey: "facturas/2026/08/FAC-2.pdf",
      fileName: "f2.pdf",
      mimeType: "application/pdf",
      fileSize: 10000,
      invoiceRequestId: "f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
      isVoided: false,
      uploadedBy: adminUser.id,
      createdAt: date,
    });

    const stats = await getStatisticsSummaryService(
      adminUser,
      { month: 8, year: 2026 },
      db
    );

    expect(stats.grossTotal).toBe(150000);
    expect(stats.invoiceCount).toBe(2);
    expect(stats.averageTicket).toBe(75000);
  });

  it("Scenario 5 (Different Periods): Preserves real emission timestamps across months without retroactive rewrite", async () => {
    const augustDate = new Date(Date.UTC(2026, 7, 31, 22, 0, 0)); // Aug 31
    const septDate = new Date(Date.UTC(2026, 8, 1, 10, 0, 0)); // Sept 1

    const reqId = "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";
    const origDocId = "d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";
    const cnDocId = "d2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02";
    const repDocId = "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a03";
    const cnId = "c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";
    const rectId = "e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";

    // Original invoice completed in August
    await db.insert(schema.invoiceRequests).values({
      id: reqId,
      requestNumber: "FAC-2026-000001",
      warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      customerId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestedBy: warehouseUserA.id,
      status: "COMPLETED",
      customerRutSnapshot: "76.123.456-7",
      customerLegalNameSnapshot: "Cliente Test SPA",
      customerBusinessActivitySnapshot: "Giro",
      expectedGrossTotal: 100000,
      siiGrossTotal: 100000,
      createdAt: augustDate,
      completedAt: augustDate,
    });

    await db.insert(schema.documents).values({
      id: origDocId,
      documentType: "INVOICE",
      storageProvider: "R2",
      storageKey: "facturas/2026/08/FAC-2026-000001.pdf",
      fileName: "factura_anulada.pdf",
      mimeType: "application/pdf",
      fileSize: 10000,
      invoiceRequestId: reqId,
      isVoided: true,
      voidedAt: septDate,
      uploadedBy: adminUser.id,
      createdAt: augustDate,
    });

    // Credit note issued in September
    await db.insert(schema.documents).values({
      id: cnDocId,
      documentType: "CREDIT_NOTE",
      storageProvider: "R2",
      storageKey: "notas-credito/2026/09/nc.pdf",
      fileName: "nc.pdf",
      mimeType: "application/pdf",
      fileSize: 10000,
      invoiceRequestId: reqId,
      isVoided: false,
      uploadedBy: adminUser.id,
      createdAt: septDate,
    });

    await db.insert(schema.creditNotes).values({
      id: cnId,
      rectificationId: rectId,
      invoiceRequestId: reqId,
      originalDocumentId: origDocId,
      grossTotal: 100000,
      issuedAt: septDate,
      createdBy: adminUser.id,
      createdAt: septDate,
    });

    // Replacement invoice completed in September ($80.000)
    await db.insert(schema.documents).values({
      id: repDocId,
      documentType: "INVOICE",
      storageProvider: "R2",
      storageKey: "facturas/2026/09/FAC-2026-000001_v2.pdf",
      fileName: "factura_v2.pdf",
      mimeType: "application/pdf",
      fileSize: 10000,
      invoiceRequestId: reqId,
      isVoided: false,
      uploadedBy: adminUser.id,
      createdAt: septDate,
    });

    await db.insert(schema.rectifications).values({
      id: rectId,
      invoiceRequestId: reqId,
      originalInvoiceDocumentId: origDocId,
      requestedBy: warehouseUserA.id,
      reason: "PRICE",
      status: "COMPLETED",
      creditNoteId: cnId,
      creditNoteDocumentId: cnDocId,
      replacementInvoiceDocumentId: repDocId,
      siiGrossTotal: 80000,
      requestedAt: septDate,
      completedAt: septDate,
      createdAt: septDate,
    });

    // 1. Check August stats: Original invoice is voided -> grossTotal is 0, but grossIssued is 100.000
    const augStats = await getStatisticsSummaryService(adminUser, { month: 8, year: 2026 }, db);
    expect(augStats.grossTotal).toBe(0);
    expect(augStats.grossIssued).toBe(100000);
    expect(augStats.creditNotesTotal).toBe(0);

    // 2. Check September stats: NC is 100.000, replacement invoice is 80.000
    const sepStats = await getStatisticsSummaryService(adminUser, { month: 9, year: 2026 }, db);
    expect(sepStats.grossTotal).toBe(80000);
    expect(sepStats.creditNotesTotal).toBe(100000);
    expect(sepStats.grossIssued).toBe(80000);
  });

  it("Scenario 6 (Warehouse Breakdown & Filter): Groups stats by warehouse with participation percentage", async () => {
    const date = new Date(Date.UTC(2026, 7, 10));

    // Bodega Norte: $100.000
    await db.insert(schema.invoiceRequests).values({
      id: "f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestNumber: "FAC-1",
      warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      customerId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestedBy: warehouseUserA.id,
      status: "COMPLETED",
      customerRutSnapshot: "76.123.456-7",
      customerLegalNameSnapshot: "Cliente Test SPA",
      customerBusinessActivitySnapshot: "Giro",
      expectedGrossTotal: 100000,
      createdAt: date,
      completedAt: date,
    });
    await db.insert(schema.documents).values({
      id: "d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      documentType: "INVOICE",
      storageProvider: "R2",
      storageKey: "facturas/1.pdf",
      fileName: "1.pdf",
      mimeType: "application/pdf",
      fileSize: 1000,
      invoiceRequestId: "f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      isVoided: false,
      uploadedBy: adminUser.id,
      createdAt: date,
    });

    // Bodega Sur: $50.000
    await db.insert(schema.invoiceRequests).values({
      id: "f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
      requestNumber: "FAC-2",
      warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
      customerId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestedBy: warehouseUserB.id,
      status: "COMPLETED",
      customerRutSnapshot: "76.123.456-7",
      customerLegalNameSnapshot: "Cliente Test SPA",
      customerBusinessActivitySnapshot: "Giro",
      expectedGrossTotal: 50000,
      createdAt: date,
      completedAt: date,
    });
    await db.insert(schema.documents).values({
      id: "d2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
      documentType: "INVOICE",
      storageProvider: "R2",
      storageKey: "facturas/2.pdf",
      fileName: "2.pdf",
      mimeType: "application/pdf",
      fileSize: 1000,
      invoiceRequestId: "f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
      isVoided: false,
      uploadedBy: adminUser.id,
      createdAt: date,
    });

    // Global by-warehouse
    const res = await getStatisticsByWarehouseService(
      managementUser,
      { month: 8, year: 2026 },
      db
    );

    expect(res.totalGross).toBe(150000);
    expect(res.warehouses).toHaveLength(2);

    const whNorte = res.warehouses.find((w) => w.warehouseCode === "NORTE");
    const whSur = res.warehouses.find((w) => w.warehouseCode === "SUR");

    expect(whNorte?.grossTotal).toBe(100000);
    expect(whNorte?.percentage).toBe(66.7);
    expect(whSur?.grossTotal).toBe(50000);
    expect(whSur?.percentage).toBe(33.3);

    // Filtered by Bodega Norte
    const filteredNorte = await getStatisticsSummaryService(
      adminUser,
      { month: 8, year: 2026, warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01" },
      db
    );
    expect(filteredNorte.grossTotal).toBe(100000);
    expect(filteredNorte.invoiceCount).toBe(1);
  });

  it("Scenario 7 (Exact Integer VAT & Net Math): Computes net and VAT without floating point errors", async () => {
    const date = new Date(Date.UTC(2026, 7, 10));

    // Gross $119.000 with standard 19% IVA -> Net is exactly $100.000, VAT is exactly $19.000
    await db.insert(schema.invoiceRequests).values({
      id: "f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestNumber: "FAC-119",
      warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      customerId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestedBy: warehouseUserA.id,
      status: "COMPLETED",
      customerRutSnapshot: "76.123.456-7",
      customerLegalNameSnapshot: "Cliente Test SPA",
      customerBusinessActivitySnapshot: "Giro",
      expectedGrossTotal: 119000,
      siiGrossTotal: 119000,
      createdAt: date,
      completedAt: date,
    });
    await db.insert(schema.documents).values({
      id: "d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      documentType: "INVOICE",
      storageProvider: "R2",
      storageKey: "facturas/119.pdf",
      fileName: "119.pdf",
      mimeType: "application/pdf",
      fileSize: 1000,
      invoiceRequestId: "f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      isVoided: false,
      uploadedBy: adminUser.id,
      createdAt: date,
    });

    const stats = await getStatisticsSummaryService(
      adminUser,
      { month: 8, year: 2026 },
      db
    );

    expect(stats.grossTotal).toBe(119000);
    expect(stats.netEstimated).toBe(100000);
    expect(stats.vatEstimated).toBe(19000);
  });

  it("Scenario 8 (Zero Invoices): Returns 0 without division by zero or NaN errors", async () => {
    const stats = await getStatisticsSummaryService(
      adminUser,
      { month: 1, year: 2025 }, // Empty month
      db
    );

    expect(stats.grossTotal).toBe(0);
    expect(stats.netEstimated).toBe(0);
    expect(stats.vatEstimated).toBe(0);
    expect(stats.invoiceCount).toBe(0);
    expect(stats.averageTicket).toBe(0);
    expect(stats.creditNotesTotal).toBe(0);
    expect(stats.creditNotesCount).toBe(0);
    expect(stats.grossIssued).toBe(0);
    expect(Number.isNaN(stats.averageTicket)).toBe(false);
  });

  it("Scenario 9 & 10 (Role Scope & IDOR Protection): Enforces warehouse scope and blocks cross-warehouse access", async () => {
    // Warehouse User A requesting stats of Bodega Sur -> Rejected with FORBIDDEN
    await expect(
      getStatisticsSummaryService(
        warehouseUserA,
        { month: 8, year: 2026, warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02" }, // Bodega Sur
        db
      )
    ).rejects.toThrow("FORBIDDEN");

    // Warehouse User A without warehouseId query -> Automatically scoped to Bodega Norte
    const userAStats = await getStatisticsSummaryService(
      warehouseUserA,
      { month: 8, year: 2026 },
      db
    );
    expect(userAStats).toBeDefined();
  });
});
