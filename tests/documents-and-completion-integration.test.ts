import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/lib/db/schema";
import {
  validatePdfBuffer,
  generateInvoiceStorageKey,
  uploadInvoiceDocumentService,
  completeInvoiceRequestService,
  getInvoiceDocumentAccessService,
  MAX_PDF_SIZE_BYTES,
} from "../src/lib/services/invoice-documents";
import { SanitizedUser } from "../src/domain/types";

describe("Fase 7: R2, Documentos y Finalizaci?n de Factura (Integration)", () => {
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

  // Valid PDF dummy buffer starting with %PDF-1.4
  const createValidPdfBuffer = (content: string = "Dummy PDF Content"): Buffer => {
    const header = "%PDF-1.4\n%????\n";
    const body = `1 0 obj\n<< /Title (${content}) >>\nendobj\n`;
    const trailer = "%%EOF\n";
    return Buffer.from(header + body + trailer, "utf-8");
  };

  beforeEach(async () => {
    pg = new PGlite();
    db = drizzle(pg, { schema });

    // Apply all migrations in order
    const migrations = [
      "0000_cheerful_giant_girl.sql",
      "0001_sharp_reptil.sql",
      "0002_concerned_molly_hayes.sql",
      "0003_rapid_boomerang.sql",
      "0004_wet_mulholland_black.sql",
      "0005_uneven_lady_bullseye.sql",
      "0006_shallow_skaar.sql",
    ];

    for (const mFile of migrations) {
      const sqlContent = readMigration(mFile);
      for (const statement of sqlContent.split("--> statement-breakpoint").filter((s) => s.trim())) {
        await pg.exec(statement);
      }
    }

    // Seed Warehouses
    await pg.exec(`
      INSERT INTO warehouses (id, code, name, active)
      VALUES
        ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'NORTE', 'Bodega Norte', true),
        ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'SUR', 'Bodega Sur', true);
    `);

    // Seed Users
    await pg.exec(`
      INSERT INTO users (id, email, name, password_hash, role, warehouse_id, active)
      VALUES
        ('a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'ejecutor@maxiofertas.cl', 'Ejecutor Principal', 'hash', 'INVOICE_EXECUTOR', NULL, true),
        ('a2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'otro.ejecutor@maxiofertas.cl', 'Otro Ejecutor', 'hash', 'INVOICE_EXECUTOR', NULL, true),
        ('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'bodega.norte@maxiofertas.cl', 'Usuario Bodega Norte', 'hash', 'WAREHOUSE_USER', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', true),
        ('b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'bodega.sur@maxiofertas.cl', 'Usuario Bodega Sur', 'hash', 'WAREHOUSE_USER', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', true);
    `);

    // Seed Customer
    await pg.exec(`
      INSERT INTO customers (id, rut_canonical, rut_display, legal_name, business_activity, active)
      VALUES
        ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', '76432109K', '76.432.109-K', 'Comercializadora Ejemplo SPA', 'Venta al por mayor', true);
    `);
  });

  describe("1. Validaciones de Archivo PDF", () => {
    it("Acepta archivo PDF con firma %PDF v?lida y tama?o <= 2MB", () => {
      const buf = createValidPdfBuffer("Factura 101");
      const res = validatePdfBuffer(buf, buf.length, "application/pdf");
      expect(res.valid).toBe(true);
    });

    it("Rechaza archivo no PDF (sin magic bytes %PDF)", () => {
      const textBuf = Buffer.from("<html><body>Not a PDF</body></html>", "utf-8");
      const res = validatePdfBuffer(textBuf, textBuf.length, "application/pdf");
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("firma v?lida de documento PDF");
    });

    it("Rechaza archivo mayor a 2 MB", () => {
      const oversize = MAX_PDF_SIZE_BYTES + 10;
      const buf = Buffer.alloc(oversize);
      buf[0] = 0x25;
      buf[1] = 0x50;
      buf[2] = 0x44;
      buf[3] = 0x46; // %PDF
      const res = validatePdfBuffer(buf, oversize, "application/pdf");
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("supera el tama?o m?ximo permitido de 2 MB");
    });

    it("Rechaza archivo vac?o", () => {
      const emptyBuf = Buffer.alloc(0);
      const res = validatePdfBuffer(emptyBuf, 0, "application/pdf");
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("est? vac?o");
    });

    it("Genera storage key determin?stica e inmune a path traversal", () => {
      const fixedDate = new Date("2026-08-20T12:00:00Z");
      const key = generateInvoiceStorageKey(
        "FAC-2026-000184",
        "../../etc/passwd_76.432.109-K",
        fixedDate
      );
      expect(key).toBe("facturas/2026/08/FAC-2026-000184/FAC-2026-000184_76432109K.pdf");
      expect(key).not.toContain("..");
      expect(key).not.toContain("passwd");
    });
  });

  describe("2. Carga, Reemplazo y Almacenamiento en R2 + PostgreSQL", () => {
    it("Permite cargar PDF a una solicitud IN_PROGRESS asignada al ejecutor", async () => {
      await pg.exec(`
        INSERT INTO invoice_requests (
          id, request_number, warehouse_id, customer_id, requested_by, assigned_to,
          status, customer_rut_snapshot, customer_legal_name_snapshot,
          customer_business_activity_snapshot, expected_gross_total, sii_gross_total,
          gross_difference, reconciliation_status
        ) VALUES (
          '11111111-1111-1111-1111-111111111111', 'FAC-2026-000001', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'IN_PROGRESS', '76.432.109-K',
          'Comercializadora Ejemplo SPA', 'Venta al por mayor', 68000, 68000, 0, 'MATCH'
        );
      `);

      const pdfBuf = createValidPdfBuffer("Factura 001");
      const doc = await uploadInvoiceDocumentService(
        executorUser,
        "11111111-1111-1111-1111-111111111111",
        {
          buffer: pdfBuf,
          fileName: "factura-001.pdf",
          mimeType: "application/pdf",
          fileSize: pdfBuf.length,
        },
        undefined,
        db
      );

      expect(doc.id).toBeDefined();
      expect(doc.documentType).toBe("INVOICE");
      expect(doc.storageProvider).toBe("R2");
      expect(doc.fileName).toBe("factura-001.pdf");
      expect(doc.storageKey).toContain("FAC-2026-000001");
      expect(doc.accessUrl).toBeDefined();

      // Verify DB persistence
      const docRows = await pg.query("SELECT * FROM documents WHERE invoice_request_id = '11111111-1111-1111-1111-111111111111';");
      expect(docRows.rows).toHaveLength(1);
    });

    it("Permite reemplazar un documento previo antes de que la factura sea finalizada", async () => {
      await pg.exec(`
        INSERT INTO invoice_requests (
          id, request_number, warehouse_id, customer_id, requested_by, assigned_to,
          status, customer_rut_snapshot, customer_legal_name_snapshot,
          customer_business_activity_snapshot, expected_gross_total, sii_gross_total,
          gross_difference, reconciliation_status
        ) VALUES (
          '22222222-2222-2222-2222-222222222222', 'FAC-2026-000002', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'IN_PROGRESS', '76.432.109-K',
          'Comercializadora Ejemplo SPA', 'Venta al por mayor', 68000, 68000, 0, 'MATCH'
        );
      `);

      const pdf1 = createValidPdfBuffer("Factura Original");
      await uploadInvoiceDocumentService(
        executorUser,
        "22222222-2222-2222-2222-222222222222",
        {
          buffer: pdf1,
          fileName: "factura_original.pdf",
          mimeType: "application/pdf",
          fileSize: pdf1.length,
        },
        undefined,
        db
      );

      // Reemplazo
      const pdf2 = createValidPdfBuffer("Factura Reemplazada");
      const doc2 = await uploadInvoiceDocumentService(
        executorUser,
        "22222222-2222-2222-2222-222222222222",
        {
          buffer: pdf2,
          fileName: "factura_reemplazada.pdf",
          mimeType: "application/pdf",
          fileSize: pdf2.length,
        },
        undefined,
        db
      );

      expect(doc2.fileName).toBe("factura_reemplazada.pdf");

      // Verify only 1 active document exists in DB (not duplicated)
      const docRows = await pg.query("SELECT * FROM documents WHERE invoice_request_id = '22222222-2222-2222-2222-222222222222';");
      expect(docRows.rows).toHaveLength(1);
    });

    it("Impide que un ejecutor no asignado suba documentos (IDOR / Ownership)", async () => {
      await pg.exec(`
        INSERT INTO invoice_requests (
          id, request_number, warehouse_id, customer_id, requested_by, assigned_to,
          status, customer_rut_snapshot, customer_legal_name_snapshot,
          customer_business_activity_snapshot, expected_gross_total
        ) VALUES (
          '33333333-3333-3333-3333-333333333333', 'FAC-2026-000003', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'IN_PROGRESS', '76.432.109-K',
          'Comercializadora Ejemplo SPA', 'Venta al por mayor', 68000
        );
      `);

      const pdf = createValidPdfBuffer("Test");
      await expect(
        uploadInvoiceDocumentService(
          otherExecutorUser,
          "33333333-3333-3333-3333-333333333333",
          {
            buffer: pdf,
            fileName: "test.pdf",
            mimeType: "application/pdf",
            fileSize: pdf.length,
          },
          undefined,
          db
        )
      ).rejects.toThrow("FORBIDDEN: No puedes cargar documentos a una solicitud asignada a otro ejecutor.");
    });
  });

  describe("3. Finalizaci?n de Factura y Reglas de Negocio", () => {
    it("Permite finalizar factura con MATCH y PDF cargado", async () => {
      await pg.exec(`
        INSERT INTO invoice_requests (
          id, request_number, warehouse_id, customer_id, requested_by, assigned_to,
          status, customer_rut_snapshot, customer_legal_name_snapshot,
          customer_business_activity_snapshot, expected_gross_total, sii_gross_total,
          gross_difference, reconciliation_status
        ) VALUES (
          '44444444-4444-4444-4444-444444444444', 'FAC-2026-000004', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'IN_PROGRESS', '76.432.109-K',
          'Comercializadora Ejemplo SPA', 'Venta al por mayor', 68000, 68000, 0, 'MATCH'
        );
      `);

      const pdf = createValidPdfBuffer("Factura 004");
      await uploadInvoiceDocumentService(
        executorUser,
        "44444444-4444-4444-4444-444444444444",
        {
          buffer: pdf,
          fileName: "factura_004.pdf",
          mimeType: "application/pdf",
          fileSize: pdf.length,
        },
        undefined,
        db
      );

      const completed = await completeInvoiceRequestService(
        executorUser,
        "44444444-4444-4444-4444-444444444444",
        undefined,
        db
      );

      expect(completed.status).toBe("COMPLETED");
      expect(completed.completedAt).toBeDefined();
      expect(completed.document).toBeDefined();
      expect(completed.document?.fileName).toBe("factura_004.pdf");

      // Verify in DB
      const res = await pg.query<{ status: string; completed_at: string }>(
        "SELECT status, completed_at FROM invoice_requests WHERE id = '44444444-4444-4444-4444-444444444444';"
      );
      expect(res.rows[0].status).toBe("COMPLETED");
      expect(res.rows[0].completed_at).not.toBeNull();
    });

    it("Permite finalizar factura con ROUNDING_ACCEPTED y PDF cargado", async () => {
      await pg.exec(`
        INSERT INTO invoice_requests (
          id, request_number, warehouse_id, customer_id, requested_by, assigned_to,
          status, customer_rut_snapshot, customer_legal_name_snapshot,
          customer_business_activity_snapshot, expected_gross_total, sii_gross_total,
          gross_difference, reconciliation_status
        ) VALUES (
          '55555555-5555-5555-5555-555555555555', 'FAC-2026-000005', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'IN_PROGRESS', '76.432.109-K',
          'Comercializadora Ejemplo SPA', 'Venta al por mayor', 68000, 68001, 1, 'ROUNDING_ACCEPTED'
        );
      `);

      const pdf = createValidPdfBuffer("Factura 005");
      await uploadInvoiceDocumentService(
        executorUser,
        "55555555-5555-5555-5555-555555555555",
        {
          buffer: pdf,
          fileName: "factura_005.pdf",
          mimeType: "application/pdf",
          fileSize: pdf.length,
        },
        undefined,
        db
      );

      const completed = await completeInvoiceRequestService(
        executorUser,
        "55555555-5555-5555-5555-555555555555",
        undefined,
        db
      );
      expect(completed.status).toBe("COMPLETED");
    });

    it("Rechaza finalizar si la cuadratura es MISMATCH", async () => {
      await pg.exec(`
        INSERT INTO invoice_requests (
          id, request_number, warehouse_id, customer_id, requested_by, assigned_to,
          status, customer_rut_snapshot, customer_legal_name_snapshot,
          customer_business_activity_snapshot, expected_gross_total, sii_gross_total,
          gross_difference, reconciliation_status
        ) VALUES (
          '66666666-6666-6666-6666-666666666666', 'FAC-2026-000006', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'IN_PROGRESS', '76.432.109-K',
          'Comercializadora Ejemplo SPA', 'Venta al por mayor', 68000, 70000, 2000, 'MISMATCH'
        );
      `);

      const pdf = createValidPdfBuffer("Factura 006");
      await uploadInvoiceDocumentService(
        executorUser,
        "66666666-6666-6666-6666-666666666666",
        {
          buffer: pdf,
          fileName: "factura_006.pdf",
          mimeType: "application/pdf",
          fileSize: pdf.length,
        },
        undefined,
        db
      );

      await expect(
        completeInvoiceRequestService(
          executorUser,
          "66666666-6666-6666-6666-666666666666",
          undefined,
          db
        )
      ).rejects.toThrow("RECONCILIATION_MISMATCH");
    });

    it("Rechaza finalizar si no se ha cargado documento PDF", async () => {
      await pg.exec(`
        INSERT INTO invoice_requests (
          id, request_number, warehouse_id, customer_id, requested_by, assigned_to,
          status, customer_rut_snapshot, customer_legal_name_snapshot,
          customer_business_activity_snapshot, expected_gross_total, sii_gross_total,
          gross_difference, reconciliation_status
        ) VALUES (
          '77777777-7777-7777-7777-777777777777', 'FAC-2026-000007', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'IN_PROGRESS', '76.432.109-K',
          'Comercializadora Ejemplo SPA', 'Venta al por mayor', 68000, 68000, 0, 'MATCH'
        );
      `);

      await expect(
        completeInvoiceRequestService(
          executorUser,
          "77777777-7777-7777-7777-777777777777",
          undefined,
          db
        )
      ).rejects.toThrow("MISSING_DOCUMENT");
    });

    it("Rechaza finalizar si el usuario solicitante (WAREHOUSE_USER) intenta completar la factura", async () => {
      await expect(
        completeInvoiceRequestService(
          warehouseUserA,
          "77777777-7777-7777-7777-777777777777",
          undefined,
          db
        )
      ).rejects.toThrow("FORBIDDEN: No tienes permisos para finalizar facturas.");
    });

    it("Garantiza idempotencia en doble finalizaci?n sin duplicar registros", async () => {
      await pg.exec(`
        INSERT INTO invoice_requests (
          id, request_number, warehouse_id, customer_id, requested_by, assigned_to,
          status, customer_rut_snapshot, customer_legal_name_snapshot,
          customer_business_activity_snapshot, expected_gross_total, sii_gross_total,
          gross_difference, reconciliation_status
        ) VALUES (
          '88888888-8888-8888-8888-888888888888', 'FAC-2026-000008', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'IN_PROGRESS', '76.432.109-K',
          'Comercializadora Ejemplo SPA', 'Venta al por mayor', 68000, 68000, 0, 'MATCH'
        );
      `);

      const pdf = createValidPdfBuffer("Factura 008");
      await uploadInvoiceDocumentService(
        executorUser,
        "88888888-8888-8888-8888-888888888888",
        {
          buffer: pdf,
          fileName: "factura_008.pdf",
          mimeType: "application/pdf",
          fileSize: pdf.length,
        },
        undefined,
        db
      );

      const firstCall = await completeInvoiceRequestService(
        executorUser,
        "88888888-8888-8888-8888-888888888888",
        undefined,
        db
      );
      expect(firstCall.status).toBe("COMPLETED");

      const secondCall = await completeInvoiceRequestService(
        executorUser,
        "88888888-8888-8888-8888-888888888888",
        undefined,
        db
      );
      expect(secondCall.status).toBe("COMPLETED");
      expect(secondCall.id).toBe(firstCall.id);
    });

    it("Garantiza inmutabilidad del documento tras haber finalizado la factura", async () => {
      await pg.exec(`
        INSERT INTO invoice_requests (
          id, request_number, warehouse_id, customer_id, requested_by, assigned_to,
          status, customer_rut_snapshot, customer_legal_name_snapshot,
          customer_business_activity_snapshot, expected_gross_total, sii_gross_total,
          gross_difference, reconciliation_status
        ) VALUES (
          '99999999-9999-9999-9999-999999999999', 'FAC-2026-000009', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'IN_PROGRESS', '76.432.109-K',
          'Comercializadora Ejemplo SPA', 'Venta al por mayor', 68000, 68000, 0, 'MATCH'
        );
      `);

      const pdf = createValidPdfBuffer("Factura 009");
      await uploadInvoiceDocumentService(
        executorUser,
        "99999999-9999-9999-9999-999999999999",
        {
          buffer: pdf,
          fileName: "factura_009.pdf",
          mimeType: "application/pdf",
          fileSize: pdf.length,
        },
        undefined,
        db
      );

      await completeInvoiceRequestService(
        executorUser,
        "99999999-9999-9999-9999-999999999999",
        undefined,
        db
      );

      // Intento de reemplazar documento despu?s de finalizar
      const newPdf = createValidPdfBuffer("Nuevo intento");
      await expect(
        uploadInvoiceDocumentService(
          executorUser,
          "99999999-9999-9999-9999-999999999999",
          {
            buffer: newPdf,
            fileName: "nuevo.pdf",
            mimeType: "application/pdf",
            fileSize: newPdf.length,
          },
          undefined,
          db
        )
      ).rejects.toThrow("INMUTABLE");
    });
  });

  describe("4. Acceso a Documentos y Protección IDOR", () => {
    it("Permite al solicitante dueño acceder al documento de su solicitud", async () => {
      await pg.exec(`
        INSERT INTO invoice_requests (
          id, request_number, warehouse_id, customer_id, requested_by, assigned_to,
          status, customer_rut_snapshot, customer_legal_name_snapshot,
          customer_business_activity_snapshot, expected_gross_total, sii_gross_total,
          gross_difference, reconciliation_status
        ) VALUES (
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'FAC-2026-000010', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'IN_PROGRESS', '76.432.109-K',
          'Comercializadora Ejemplo SPA', 'Venta al por mayor', 68000, 68000, 0, 'MATCH'
        );
      `);

      const pdf = createValidPdfBuffer("Factura 010");
      const doc = await uploadInvoiceDocumentService(
        executorUser,
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        {
          buffer: pdf,
          fileName: "factura_010.pdf",
          mimeType: "application/pdf",
          fileSize: pdf.length,
        },
        undefined,
        db
      );

      await completeInvoiceRequestService(
        executorUser,
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        undefined,
        db
      );

      const access = await getInvoiceDocumentAccessService(
        warehouseUserA,
        {
          documentId: doc.id,
        },
        undefined,
        db
      );
      expect(access.accessUrl).toBeDefined();
      expect(access.document.id).toBe(doc.id);
    });

    it("Impide a un usuario de otra bodega acceder al documento (IDOR)", async () => {
      await pg.exec(`
        INSERT INTO invoice_requests (
          id, request_number, warehouse_id, customer_id, requested_by, assigned_to,
          status, customer_rut_snapshot, customer_legal_name_snapshot,
          customer_business_activity_snapshot, expected_gross_total, sii_gross_total,
          gross_difference, reconciliation_status
        ) VALUES (
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'FAC-2026-000011', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
          'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'IN_PROGRESS', '76.432.109-K',
          'Comercializadora Ejemplo SPA', 'Venta al por mayor', 68000, 68000, 0, 'MATCH'
        );
      `);

      const pdf = createValidPdfBuffer("Factura 011");
      const doc = await uploadInvoiceDocumentService(
        executorUser,
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        {
          buffer: pdf,
          fileName: "factura_011.pdf",
          mimeType: "application/pdf",
          fileSize: pdf.length,
        },
        undefined,
        db
      );

      await completeInvoiceRequestService(
        executorUser,
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        undefined,
        db
      );

      // warehouseUserB tries to access warehouseUserA's document
      await expect(
        getInvoiceDocumentAccessService(
          warehouseUserB,
          {
            documentId: doc.id,
          },
          undefined,
          db
        )
      ).rejects.toThrow("FORBIDDEN: No tienes permisos para acceder a este documento.");
    });
  });
});
