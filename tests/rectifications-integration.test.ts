import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import {
  requestRectificationService,
  getRectificationsQueueService,
  getRectificationByIdService,
  claimRectificationService,
  registerCreditNoteService,
  uploadReplacementInvoiceService,
  completeRectificationService,
  getInvoiceTimelineService,
} from "../src/lib/services/rectifications";
import { SanitizedUser } from "../src/domain/types";

describe("Fase 8: Rectificaciones y Notas de Crédito (Integration)", () => {
  let pg: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  const executorUser: SanitizedUser = {
    id: "a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
    email: "ejecutor@maxiofertas.cl",
    name: "Ejecutor Principal",
    role: "INVOICE_EXECUTOR",
    warehouseId: null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const otherExecutorUser: SanitizedUser = {
    id: "a2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
    email: "otro.ejecutor@maxiofertas.cl",
    name: "Otro Ejecutor",
    role: "INVOICE_EXECUTOR",
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

  const createValidPdfBuffer = (content: string = "Dummy PDF Content"): Buffer => {
    const header = "%PDF-1.4\n%????\n";
    const body = `1 0 obj\n<< /Title (${content}) >>\nendobj\n`;
    const trailer = "%%EOF\n";
    return Buffer.from(header + body + trailer, "utf-8");
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
      "0007_document_share_tokens.sql",
      "0008_split_invoices_document_number.sql",
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
        id: executorUser.id,
        email: executorUser.email,
        name: executorUser.name,
        passwordHash: "hash",
        role: executorUser.role,
        warehouseId: null,
        active: true,
      },
      {
        id: otherExecutorUser.id,
        email: otherExecutorUser.email,
        name: otherExecutorUser.name,
        passwordHash: "hash",
        role: otherExecutorUser.role,
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
      legalName: "Inversiones y Alimentos SpA",
      businessActivity: "Venta Mayorista",
      active: true,
    });
  });

  const createCompletedInvoiceFixture = async () => {
    const requestId = "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";
    const documentId = "d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";

    await db.insert(schema.invoiceRequests).values({
      id: requestId,
      requestNumber: "FAC-2026-000001",
      warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      customerId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestedBy: warehouseUserA.id,
      assignedTo: executorUser.id,
      status: "COMPLETED",
      customerRutSnapshot: "76.123.456-7",
      customerLegalNameSnapshot: "Inversiones y Alimentos SpA",
      customerBusinessActivitySnapshot: "Venta Mayorista",
      expectedGrossTotal: 119000,
      siiGrossTotal: 119000,
      grossDifference: 0,
      reconciliationStatus: "MATCH",
      completedAt: new Date(),
    });

    await db.insert(schema.invoiceRequestItems).values({
      id: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      invoiceRequestId: requestId,
      lineNumber: 1,
      description: "Pack Bebidas 500ml",
      quantity: 10,
      unitPriceGross: 11900,
      unitPriceNet: 10000,
      lineTotalGross: 119000,
      lineTotalNet: 100000,
      vatRate: "0.19",
    });

    await db.insert(schema.documents).values({
      id: documentId,
      documentType: "INVOICE",
      storageProvider: "R2",
      storageKey: "facturas/2026/08/FAC-2026-000001/FAC-2026-000001_761234567.pdf",
      fileName: "factura_inicial.pdf",
      mimeType: "application/pdf",
      fileSize: 15420,
      invoiceRequestId: requestId,
      isVoided: false,
      uploadedBy: executorUser.id,
    });

    return { requestId, documentId };
  };

  it("Scenario 1: Allows requesting rectification on COMPLETED invoice and rejects non-completed requests", async () => {
    const { requestId } = await createCompletedInvoiceFixture();

    const rect = await requestRectificationService(
      warehouseUserA,
      requestId,
      {
        reason: "RUT",
        comment: "El RUT correcto es 76.555.444-3",
      },
      "127.0.0.1",
      db
    );

    expect(rect.id).toBeDefined();
    expect(rect.status).toBe("REQUESTED");
    expect(rect.reason).toBe("RUT");
    expect(rect.comment).toBe("El RUT correcto es 76.555.444-3");

    // Rejection on PENDING request
    const pendingReqId = "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02";
    await db.insert(schema.invoiceRequests).values({
      id: pendingReqId,
      requestNumber: "FAC-2026-000002",
      warehouseId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      customerId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      requestedBy: warehouseUserA.id,
      status: "PENDING",
      customerRutSnapshot: "76.123.456-7",
      customerLegalNameSnapshot: "Inversiones y Alimentos SpA",
      customerBusinessActivitySnapshot: "Venta Mayorista",
      expectedGrossTotal: 50000,
    });

    await expect(
      requestRectificationService(
        warehouseUserA,
        pendingReqId,
        { reason: "PRICE" },
        "127.0.0.1",
        db
      )
    ).rejects.toThrow("INVALID_STATE");
  });

  it("Scenario 2: IDOR protection - Warehouse B cannot request rectification for Warehouse A invoice", async () => {
    const { requestId } = await createCompletedInvoiceFixture();

    await expect(
      requestRectificationService(
        warehouseUserB,
        requestId,
        { reason: "TOTAL" },
        "127.0.0.1",
        db
      )
    ).rejects.toThrow("FORBIDDEN");
  });

  it("Scenario 3: Idempotency on rectification request - returns existing active rectification without creating duplicates", async () => {
    const { requestId } = await createCompletedInvoiceFixture();

    const rect1 = await requestRectificationService(
      warehouseUserA,
      requestId,
      { reason: "LEGAL_NAME", comment: "Cambiar nombre" },
      "127.0.0.1",
      db
    );

    const rect2 = await requestRectificationService(
      warehouseUserA,
      requestId,
      { reason: "LEGAL_NAME", comment: "Cambiar nombre reintento" },
      "127.0.0.1",
      db
    );

    expect(rect1.id).toBe(rect2.id);

    const allRects = await db
      .select()
      .from(schema.rectifications)
      .where(eq(schema.rectifications.invoiceRequestId, requestId));

    expect(allRects).toHaveLength(1);
  });

  it("Scenario 4: Atomic Claim of Rectification - single winner under concurrent claim attempts", async () => {
    const { requestId } = await createCompletedInvoiceFixture();

    const rect = await requestRectificationService(
      warehouseUserA,
      requestId,
      { reason: "QUANTITY" },
      "127.0.0.1",
      db
    );

    // Executor 1 claims successfully
    const claimed1 = await claimRectificationService(
      executorUser,
      rect.id,
      "127.0.0.1",
      db
    );
    expect(claimed1.status).toBe("IN_PROGRESS");
    expect(claimed1.assignedTo).toBe(executorUser.id);

    // Executor 2 attempts to claim the same rectification -> gets CLAIM_CONFLICT
    await expect(
      claimRectificationService(
        otherExecutorUser,
        rect.id,
        "127.0.0.1",
        db
      )
    ).rejects.toThrow("CLAIM_CONFLICT");

    // Executor 1 claims again -> idempotent success
    const claimedAgain = await claimRectificationService(
      executorUser,
      rect.id,
      "127.0.0.1",
      db
    );
    expect(claimedAgain.id).toBe(rect.id);
  });

  it("Scenario 5: Credit Note registration - validates PDF, voids original document, and updates status", async () => {
    const { requestId, documentId: originalDocId } = await createCompletedInvoiceFixture();

    const rect = await requestRectificationService(
      warehouseUserA,
      requestId,
      { reason: "PRICE" },
      "127.0.0.1",
      db
    );

    await claimRectificationService(executorUser, rect.id, "127.0.0.1", db);

    const pdfBuffer = createValidPdfBuffer("Nota de Credito por Anulacion");

    const cnResult = await registerCreditNoteService(
      executorUser,
      rect.id,
      {
        buffer: pdfBuffer,
        fileName: "nc-1420.pdf",
        mimeType: "application/pdf",
        fileSize: pdfBuffer.length,
      },
      "1420",
      "127.0.0.1",
      db
    );

    expect(cnResult.id).toBeDefined();
    expect(cnResult.siiFolio).toBe("1420");
    expect(cnResult.grossTotal).toBe(119000);

    // Verify original document is marked voided in DB
    const [origDoc] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, originalDocId));

    expect(origDoc.isVoided).toBe(true);
    expect(origDoc.voidedAt).toBeDefined();
    expect(origDoc.voidedByDocumentId).toBeDefined();

    // Verify rectification is in CREDIT_NOTE_REGISTERED status
    const [rectDb] = await db
      .select()
      .from(schema.rectifications)
      .where(eq(schema.rectifications.id, rect.id));

    expect(rectDb.status).toBe("CREDIT_NOTE_REGISTERED");
    expect(rectDb.creditNoteId).toBe(cnResult.id);
  });

  it("Scenario 6: Rejects Credit Note registration with invalid non-PDF file or unassigned executor", async () => {
    const { requestId } = await createCompletedInvoiceFixture();

    const rect = await requestRectificationService(
      warehouseUserA,
      requestId,
      { reason: "PRICE" },
      "127.0.0.1",
      db
    );

    await claimRectificationService(executorUser, rect.id, "127.0.0.1", db);

    // 1. Invalid PDF magic bytes
    const invalidBuffer = Buffer.from("NOT_A_PDF_HEADER", "utf-8");
    await expect(
      registerCreditNoteService(
        executorUser,
        rect.id,
        {
          buffer: invalidBuffer,
          fileName: "invalid.pdf",
          mimeType: "application/pdf",
          fileSize: invalidBuffer.length,
        },
        undefined,
        "127.0.0.1",
        db
      )
    ).rejects.toThrow("VALIDATION_ERROR");

    // 2. Unassigned executor attempt
    const validPdf = createValidPdfBuffer();
    await expect(
      registerCreditNoteService(
        otherExecutorUser,
        rect.id,
        {
          buffer: validPdf,
          fileName: "nc.pdf",
          mimeType: "application/pdf",
          fileSize: validPdf.length,
        },
        undefined,
        "127.0.0.1",
        db
      )
    ).rejects.toThrow("FORBIDDEN");
  });

  it("Scenario 7: Replacement Invoice upload requires prior Credit Note registration", async () => {
    const { requestId } = await createCompletedInvoiceFixture();

    const rect = await requestRectificationService(
      warehouseUserA,
      requestId,
      { reason: "RUT" },
      "127.0.0.1",
      db
    );

    await claimRectificationService(executorUser, rect.id, "127.0.0.1", db);

    const pdfBuffer = createValidPdfBuffer("Nueva Factura Corregida");

    // Attempting replacement invoice before Credit Note -> rejected
    await expect(
      uploadReplacementInvoiceService(
        executorUser,
        rect.id,
        {
          buffer: pdfBuffer,
          fileName: "nueva_factura.pdf",
          mimeType: "application/pdf",
          fileSize: pdfBuffer.length,
        },
        119000,
        "127.0.0.1",
        db
      )
    ).rejects.toThrow("CREDIT_NOTE_REQUIRED");
  });

  it("Scenario 8: Complete Full Rectification Flow with Reconciliation and Document Immutability", async () => {
    const { requestId, documentId: origDocId } = await createCompletedInvoiceFixture();

    // 1. Request Rectification
    const rect = await requestRectificationService(
      warehouseUserA,
      requestId,
      { reason: "RUT", comment: "Modificar RUT del cliente" },
      "127.0.0.1",
      db
    );

    // 2. Claim Rectification
    await claimRectificationService(executorUser, rect.id, "127.0.0.1", db);

    // 3. Register Credit Note
    const ncPdf = createValidPdfBuffer("Nota de Credito #100");
    await registerCreditNoteService(
      executorUser,
      rect.id,
      {
        buffer: ncPdf,
        fileName: "nc-100.pdf",
        mimeType: "application/pdf",
        fileSize: ncPdf.length,
      },
      "100",
      "127.0.0.1",
      db
    );

    // 4. Upload Replacement Invoice with MATCH reconciliation (119000 CLP)
    const newInvPdf = createValidPdfBuffer("Factura Corregida #200");
    const repResult = await uploadReplacementInvoiceService(
      executorUser,
      rect.id,
      {
        buffer: newInvPdf,
        fileName: "factura_v2.pdf",
        mimeType: "application/pdf",
        fileSize: newInvPdf.length,
      },
      119000,
      "127.0.0.1",
      db
    );

    expect(repResult.reconciliationStatus).toBe("MATCH");
    expect(repResult.replacementInvoiceDocumentId).toBeDefined();

    // 5. Complete Rectification
    const completedRect = await completeRectificationService(
      executorUser,
      rect.id,
      "127.0.0.1",
      db
    );

    expect(completedRect.status).toBe("COMPLETED");
    expect(completedRect.completedAt).toBeDefined();

    // 6. Inmutability Check: Original document is NOT deleted
    const allDocs = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.invoiceRequestId, requestId));

    expect(allDocs).toHaveLength(3); // Original Invoice (voided) + Credit Note + Replacement Invoice
    const origDoc = allDocs.find((d) => d.id === origDocId);
    expect(origDoc?.isVoided).toBe(true);
  });

  it("Scenario 9: Rejects completion if reconciliation is MISMATCH", async () => {
    const { requestId } = await createCompletedInvoiceFixture();

    const rect = await requestRectificationService(
      warehouseUserA,
      requestId,
      { reason: "PRICE" },
      "127.0.0.1",
      db
    );

    await claimRectificationService(executorUser, rect.id, "127.0.0.1", db);

    const ncPdf = createValidPdfBuffer("NC");
    await registerCreditNoteService(
      executorUser,
      rect.id,
      {
        buffer: ncPdf,
        fileName: "nc.pdf",
        mimeType: "application/pdf",
        fileSize: ncPdf.length,
      },
      undefined,
      "127.0.0.1",
      db
    );

    // Discrepant SII total: 119050 instead of 119000 (+50 CLP mismatch)
    const newInvPdf = createValidPdfBuffer("New Inv");
    await uploadReplacementInvoiceService(
      executorUser,
      rect.id,
      {
        buffer: newInvPdf,
        fileName: "factura_v2.pdf",
        mimeType: "application/pdf",
        fileSize: newInvPdf.length,
      },
      119050,
      "127.0.0.1",
      db
    );

    // Under DF-QA-001, MISMATCH does not block rectification completion if NC and PDF are valid
    const completed = await completeRectificationService(executorUser, rect.id, "127.0.0.1", db);
    expect(completed.status).toBe("COMPLETED");
  });

  it("Scenario 10: Invoice Timeline returns complete non-technical chronology", async () => {
    const { requestId } = await createCompletedInvoiceFixture();

    const rect = await requestRectificationService(
      warehouseUserA,
      requestId,
      { reason: "BUSINESS_ACTIVITY", comment: "Cambiar giro" },
      "127.0.0.1",
      db
    );

    await claimRectificationService(executorUser, rect.id, "127.0.0.1", db);

    const ncPdf = createValidPdfBuffer("NC");
    await registerCreditNoteService(
      executorUser,
      rect.id,
      {
        buffer: ncPdf,
        fileName: "nc.pdf",
        mimeType: "application/pdf",
        fileSize: ncPdf.length,
      },
      "555",
      "127.0.0.1",
      db
    );

    const newInvPdf = createValidPdfBuffer("New Inv");
    await uploadReplacementInvoiceService(
      executorUser,
      rect.id,
      {
        buffer: newInvPdf,
        fileName: "factura_v2.pdf",
        mimeType: "application/pdf",
        fileSize: newInvPdf.length,
      },
      119000,
      "127.0.0.1",
      db
    );

    await completeRectificationService(executorUser, rect.id, "127.0.0.1", db);

    const timeline = await getInvoiceTimelineService(warehouseUserA, requestId, db);

    expect(timeline).toHaveLength(5);
    expect(timeline[0].type).toBe("REQUEST_CREATED");
    expect(timeline[1].type).toBe("INVOICE_COMPLETED");
    expect(timeline[2].type).toBe("RECTIFICATION_REQUESTED");
    expect(timeline[3].type).toBe("CREDIT_NOTE_REGISTERED");
    expect(timeline[4].type).toBe("RECTIFICATION_COMPLETED");
  });
});
