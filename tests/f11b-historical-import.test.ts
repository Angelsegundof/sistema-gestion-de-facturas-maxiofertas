import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { runLocalMigrations } from "@/lib/db";
import { runHistoricalMigration } from "../scripts/import_historical_data";

describe("FASE 11B.2 — Controlled Historical Import and Reconciliation", () => {
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(async () => {
    pglite = new PGlite();
    await pglite.waitReady;
    await runLocalMigrations(pglite);
    db = drizzle(pglite, { schema });
  });

  it("should provision OSORNO and COPIAPO bodegas and import historical data with financial reconciliation", async () => {
    const summary = await runHistoricalMigration("historico_facturacion.xlsx", db);

    expect(summary.totalRowsRead).toBe(9266);
    expect(summary.importedRequests).toBeGreaterThan(8000);
    expect(summary.rejectedRows).toBeGreaterThan(900);
    expect(summary.duplicateRowsOmitted).toBeGreaterThanOrEqual(9);

    // Verify Bodegas in DB (must have 16)
    const allWarehouses = await db.select().from(schema.warehouses);
    expect(allWarehouses.length).toBe(16);

    const osorno = allWarehouses.find((w) => w.code === "OSORNO");
    const copiapo = allWarehouses.find((w) => w.code === "COPIAPO");
    expect(osorno).toBeDefined();
    expect(osorno?.name).toBe("Bodega Osorno");
    expect(copiapo).toBeDefined();
    expect(copiapo?.name).toBe("Bodega Copiapó");

    // Verify Documents have Google Drive provider
    const sampleDoc = await db.select().from(schema.documents).limit(1);
    expect(sampleDoc[0].storageProvider).toBe("GOOGLE_DRIVE");

    // Verify Financial Reconciliation
    expect(summary.totalGrossImportedCLP).toBeGreaterThan(600_000_000);
    const totalReconciled = summary.totalGrossImportedCLP + summary.totalGrossRejectedCLP + summary.totalGrossDuplicatesOmittedCLP;
    expect(totalReconciled).toBeGreaterThan(700_000_000);
  }, 180000);
});
