import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import {
  normalizeRut,
  normalizeWarehouse,
  normalizeStatus,
  normalizeAmount,
  normalizeDate,
} from "../src/lib/migration/normalizers";
import { runDryRun, executeLoad, parseCsvRows } from "../src/lib/migration/importer";

describe("Fase 10: Migración Histórica ETL (Integration & Unit)", () => {
  let pg: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

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
      "0007_document_share_tokens.sql",
      "0008_split_invoices_document_number.sql",
      "0009_customer_delivery_status.sql",
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
        code: "CENTRAL",
        name: "Santiago Central",
        active: true,
      },
      {
        id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
        code: "NORTE",
        name: "Bodega Norte",
        active: true,
      },
      {
        id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03",
        code: "SUR",
        name: "Bodega Sur",
        active: true,
      },
    ]);

    // Seed Admin User
    await db.insert(schema.users).values({
      id: "a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
      email: "admin@maxiofertas.cl",
      name: "Administrador General",
      passwordHash: "hash",
      role: "ADMIN",
      warehouseId: null,
      active: true,
    });
  });

  describe("1. Normalizadores Unitarios", () => {
    it("RUT: Normaliza y valida correctamente", () => {
      const r1 = normalizeRut("76.123.456-0");
      expect(r1.valid).toBe(true);
      expect(r1.canonical).toBe("761234560");
      expect(r1.display).toBe("76.123.456-0");

      const r2 = normalizeRut("76432109-K");
      expect(r2.valid).toBe(true);
      expect(r2.canonical).toBe("76432109K");

      const invalid = normalizeRut("11.111.111-9");
      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("RUT inválido");
    });

    it("Bodegas: Mapea alias de Santiago, Norte, Sur y rechaza desconocidas", () => {
      const whList = [
        { id: "1", code: "CENTRAL", name: "Santiago Central" },
        { id: "2", code: "NORTE", name: "Bodega Norte" },
        { id: "3", code: "SUR", name: "Bodega Sur" },
      ];

      expect(normalizeWarehouse("Santiago", whList).warehouseCode).toBe("CENTRAL");
      expect(normalizeWarehouse("STGO", whList).warehouseCode).toBe("CENTRAL");
      expect(normalizeWarehouse("Bodega Central", whList).warehouseCode).toBe("CENTRAL");
      expect(normalizeWarehouse("Bodega Norte", whList).warehouseCode).toBe("NORTE");
      expect(normalizeWarehouse("Concepción", whList).warehouseCode).toBe("SUR");

      const unk = normalizeWarehouse("Rancagua", whList);
      expect(unk.valid).toBe(false);
      expect(unk.error).toContain("Bodega no reconocida");
    });

    it("Estados: Mapea estados históricos a estados tipados de dominio", () => {
      expect(normalizeStatus("Pendiente").status).toBe("PENDING");
      expect(normalizeStatus("Realizada").status).toBe("COMPLETED");
      expect(normalizeStatus("Facturada").status).toBe("COMPLETED");
      expect(normalizeStatus("En Proceso").status).toBe("IN_PROGRESS");
      expect(normalizeStatus("Necesita Corrección").status).toBe("NEEDS_CORRECTION");
      expect(normalizeStatus("Anulada").status).toBe("CANCELLED");

      const unk = normalizeStatus("Estado Raro");
      expect(unk.valid).toBe(true);
      expect(unk.status).toBe("PENDING");
      expect(unk.warning).toBeDefined();
    });

    it("Montos: Convierte cadenas con formato moneda chileno a enteros exactos", () => {
      expect(normalizeAmount("$125.000").amount).toBe(125000);
      expect(normalizeAmount("125000").amount).toBe(125000);
      expect(normalizeAmount("$ 1.250.000").amount).toBe(1250000);
      expect(normalizeAmount("50000,00").amount).toBe(50000);

      expect(normalizeAmount("-5000").valid).toBe(false);
      expect(normalizeAmount("gratis").valid).toBe(false);
    });

    it("Fechas: Parsea formato chileno DD/MM/YYYY y formato ISO", () => {
      const d1 = normalizeDate("15/08/2026 14:30:00");
      expect(d1.valid).toBe(true);
      expect(d1.date?.getUTCFullYear()).toBe(2026);
      expect(d1.date?.getUTCMonth()).toBe(7); // August (0-indexed)
      expect(d1.date?.getUTCDate()).toBe(15);

      const d2 = normalizeDate("2026-08-15T14:30:00.000Z");
      expect(d2.valid).toBe(true);
      expect(d2.date?.getUTCDate()).toBe(15);

      expect(normalizeDate("fecha-invalida").valid).toBe(false);
    });
  });

  describe("2. Dry-Run Engine & Report", () => {
    it("Ejecuta Dry-Run sin modificar la base de datos (Read-Only Guarantee)", async () => {
      const sampleCsv = `Marca temporal,Bodega,RUT Cliente,Razón Social,Giro,Teléfono,Email,Detalle de Productos,Monto Total,Estado,Observaciones,Enlace Factura,Fecha Facturación,Facturador
15/08/2026 10:30:00,Santiago,76.123.456-0,Comercial Santa Fe SPA,Distribuidora,+56911223344,contacto@santafe.cl,Pack Aceite,$125.000,Realizada,Despacho urgente,https://drive.google.com/file/d/1A2B/view,15/08/2026 11:00:00,Juan Pérez
16/08/2026 09:20:00,Bodega Norte,77.987.654-3,Minera del Norte Ltda.,Servicios Mineros,,facturas@minera.cl,Insumos,$250.000,Realizada,,https://drive.google.com/file/d/2B3C/view,16/08/2026 10:00:00,Ana Gómez
17/08/2026 10:00:00,Bodega Inexistente,76.123.456-0,Cliente Test,,,,,100000,Pendiente,,,,
18/08/2026 11:00:00,Santiago,11.111.111-9,RUT Corrupto,Giro,,,$50.000,Pendiente,,,,`;

      const report = await runDryRun(sampleCsv, db);

      expect(report.totalRowsRead).toBe(4);
      expect(report.validRows).toBe(2);
      expect(report.errorRows).toBe(2);
      expect(report.customersDetected).toBe(2);
      expect(report.totalGrossAmount).toBe(375000); // 125.000 + 250.000

      // Verify zero modifications in database
      const existingReqs = await db.select().from(schema.invoiceRequests);
      const existingCusts = await db.select().from(schema.customers);
      const existingDocs = await db.select().from(schema.documents);
      const existingMigRecs = await db.select().from(schema.migrationRecords);

      expect(existingReqs.length).toBe(0);
      expect(existingCusts.length).toBe(0);
      expect(existingDocs.length).toBe(0);
      expect(existingMigRecs.length).toBe(0);
    });

    it("Detecta duplicados y los reporta en el informe", async () => {
      const duplicateCsv = `Marca temporal,Bodega,RUT Cliente,Razón Social,Giro,Monto Total,Estado
15/08/2026 10:30:00,Santiago,76.123.456-0,Cliente Test,Giro,$100.000,Realizada
15/08/2026 10:30:00,Santiago,76.123.456-0,Cliente Test,Giro,$100.000,Realizada`;

      const report = await runDryRun(duplicateCsv, db);
      expect(report.totalRowsRead).toBe(2);
      expect(report.duplicateRows).toBe(1);
    });
  });

  describe("3. Carga e Idempotencia en PostgreSQL", () => {
    it("Carga solicitudes históricas, reutiliza clientes y preserva enlaces Google Drive", async () => {
      const csv = `Marca temporal,Bodega,RUT Cliente,Razón Social,Giro,Teléfono,Email,Detalle de Productos,Monto Total,Estado,Observaciones,Enlace Factura,Fecha Facturación,Facturador
15/08/2026 10:30:00,Santiago,76.123.456-0,Comercial Santa Fe SPA,Distribuidora,+56911223344,contacto@santafe.cl,Pack Aceite,$125.000,Realizada,Despacho urgente,https://drive.google.com/file/d/1A2B/view,15/08/2026 11:00:00,Juan Pérez
16/08/2026 09:20:00,Bodega Norte,76.123.456-0,Comercial Santa Fe SPA,Distribuidora,+56911223344,contacto@santafe.cl,Insumos,$50.000,Pendiente,Sin factura,,,`;

      const loadResult = await executeLoad(csv, {}, db);
      expect(loadResult.importedRequestsCount).toBe(2);
      expect(loadResult.createdCustomersCount).toBe(1); // 1 single customer created and reused for 2 requests

      // Verify requests in DB
      const requestsInDb = await db.select().from(schema.invoiceRequests);
      expect(requestsInDb.length).toBe(2);
      expect(requestsInDb[0].source).toBe("GOOGLE_SHEETS_LEGACY");
      expect(requestsInDb[0].legacySourceId).toBe("row_2");
      expect(requestsInDb[1].source).toBe("GOOGLE_SHEETS_LEGACY");
      expect(requestsInDb[1].legacySourceId).toBe("row_3");

      // Verify items in DB
      const itemsInDb = await db.select().from(schema.invoiceRequestItems);
      expect(itemsInDb.length).toBe(2);
      expect(itemsInDb[0].unitPriceGross).toBe(125000);
      expect(itemsInDb[0].unitPriceNet).toBe(105042); // exact net: round(125000 * 100 / 119)

      // Verify document in DB (Google Drive storage provider)
      const docsInDb = await db.select().from(schema.documents);
      expect(docsInDb.length).toBe(1);
      expect(docsInDb[0].storageProvider).toBe("GOOGLE_DRIVE");
      expect(docsInDb[0].storageKey).toBe("https://drive.google.com/file/d/1A2B/view");

      // Verify audit records
      const migRecs = await db.select().from(schema.migrationRecords);
      expect(migRecs.length).toBe(2);
      expect(migRecs[0].status).toBe("IMPORTED");
    });

    it("Idempotencia: Ejecutar la carga dos veces no duplica solicitudes ni clientes", async () => {
      const csv = `Marca temporal,Bodega,RUT Cliente,Razón Social,Giro,Monto Total,Estado
15/08/2026 10:30:00,Santiago,76.123.456-0,Cliente Test,Giro,$100.000,Realizada`;

      // First run
      const firstRun = await executeLoad(csv, {}, db);
      expect(firstRun.importedRequestsCount).toBe(1);
      expect(firstRun.createdCustomersCount).toBe(1);

      // Second run
      const secondRun = await executeLoad(csv, {}, db);
      expect(secondRun.importedRequestsCount).toBe(0); // 0 new requests
      expect(secondRun.createdCustomersCount).toBe(0); // 0 new customers

      // DB still has exactly 1 request
      const reqs = await db.select().from(schema.invoiceRequests);
      expect(reqs.length).toBe(1);

      // Migration records shows SKIPPED on second attempt
      const skippedRecs = await db
        .select()
        .from(schema.migrationRecords)
        .where(eq(schema.migrationRecords.status, "SKIPPED"));
      expect(skippedRecs.length).toBe(1);
    });
  });
});
