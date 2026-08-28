import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { eq, and, sql } from "drizzle-orm";
import { getDb, runLocalMigrations } from "../src/lib/db";
import {
  warehouses,
  customers,
  users,
  invoiceRequests,
  invoiceRequestItems,
  documents,
  migrationRecords,
  InvoiceRequestStatus,
} from "../src/lib/db/schema";
import { calculateNetPrice, DEFAULT_VAT_RATE_PERCENT } from "../src/domain/pricing";
import {
  normalizeRut,
  normalizeWarehouse,
  normalizeStatus,
  normalizeAmount,
} from "../src/lib/migration/normalizers";
import { logAuditEvent } from "../src/lib/auth/audit";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// 16 Real & Historical Warehouses
const WAREHOUSE_DEFINITIONS = [
  { code: "CENTRAL", name: "Santiago Central" },
  { code: "RANCAGUA", name: "Bodega Rancagua" },
  { code: "CASTRO", name: "Bodega Castro Chiloé" },
  { code: "CONCEPCION", name: "Bodega Concepción" },
  { code: "TEMUCO", name: "Bodega Temuco" },
  { code: "TALCA", name: "Bodega Talca" },
  { code: "VINA", name: "Bodega Viña del Mar" },
  { code: "ANTOFAGASTA", name: "Bodega Antofagasta" },
  { code: "CHILLAN", name: "Bodega Chillán" },
  { code: "PUERTO_MONTT", name: "Bodega Puerto Montt" },
  { code: "LOS_ANGELES", name: "Bodega Los Ángeles" },
  { code: "CURICO", name: "Bodega Curicó" },
  { code: "VALDIVIA", name: "Bodega Valdivia" },
  { code: "LA_SERENA", name: "Bodega La Serena" },
  { code: "OSORNO", name: "Bodega Osorno" },
  { code: "COPIAPO", name: "Bodega Copiapó" },
];

export interface HistoricalImportSummary {
  totalRowsRead: number;
  importedRequests: number;
  rejectedRows: number;
  duplicateRowsOmitted: number;
  uniqueCustomersCreated: number;
  uniqueCustomersReused: number;
  documentsPreserved: number;
  statusBreakdown: Record<string, number>;
  warehouseBreakdown: Record<string, number>;
  totalGrossImportedCLP: number;
  totalGrossCompletedCLP: number;
  totalGrossCancelledCLP: number;
  totalGrossRejectedCLP: number;
  totalGrossDuplicatesOmittedCLP: number;
  startTime: Date;
  endTime: Date;
  durationMs: number;
}

export async function runHistoricalMigration(
  xlsxPath = "historico_facturacion.xlsx",
  dbOverride?: any
): Promise<HistoricalImportSummary> {
  const startTime = new Date();
  const db = dbOverride || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible para migración histórica.");
  }

  if ((global as any).__localPgliteInstance) {
    await runLocalMigrations((global as any).__localPgliteInstance);
  }

  console.log("===============================================================");
  console.log("    INICIANDO MIGRACIÓN CONTROLADA DEL HISTÓRICO REAL          ");
  console.log("===============================================================");

  // 1. Ensure all 16 physical/historical warehouses exist in database
  console.log("1. Verificando y provisionando 16 bodegas (incluidas Osorno y Copiapó)...");
  const warehouseMap = new Map<string, { id: string; code: string; name: string }>();

  for (const whDef of WAREHOUSE_DEFINITIONS) {
    const existing = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.code, whDef.code))
      .limit(1);

    if (existing.length > 0) {
      warehouseMap.set(whDef.code, existing[0]);
      await db
        .update(warehouses)
        .set({ name: whDef.name, active: true, updatedAt: new Date() })
        .where(eq(warehouses.id, existing[0].id));
    } else {
      const [inserted] = await db
        .insert(warehouses)
        .values({
          code: whDef.code,
          name: whDef.name,
          active: true,
        })
        .returning();
      warehouseMap.set(whDef.code, inserted);
    }
  }

  const allWarehousesList = Array.from(warehouseMap.values());
  console.log(`✓ ${allWarehousesList.length} bodegas activas en base de datos.`);

  // 2. Load and parse the Excel file using python helper to export JSON
  console.log("2. Extrayendo registros de hoja 'Respuestas de formulario 1'...");
  const tempJsonPath = path.resolve(process.cwd(), ".data/temp_historical_rows.json");
  const scriptPath = path.resolve(process.cwd(), "scripts/extract_excel.py");
  const fullXlsxPath = path.resolve(process.cwd(), xlsxPath);

  execSync(`python "${scriptPath}" "${fullXlsxPath}" "${tempJsonPath}"`, { encoding: "utf8" });
  const rawRows: Array<any> = JSON.parse(fs.readFileSync(tempJsonPath, "utf8"));
  console.log(`✓ ${rawRows.length} registros cargados en memoria.`);

  // 3. Prepare User Cache (for requestedBy linkage)
  const allUsers = await db.select().from(users);
  let defaultAdminUser = allUsers.find((u: any) => u.role === "ADMIN" || u.email === "sistemasecuweb@gmail.com") || allUsers[0];
  if (!defaultAdminUser) {
    const [createdAdmin] = await db
      .insert(users)
      .values({
        email: "sistemasecuweb@gmail.com",
        name: "Angel Ferrer",
        passwordHash: "$2b$10$placeholderForMigrationAdminHash",
        role: "ADMIN",
        active: true,
      })
      .returning();
    defaultAdminUser = createdAdmin;
  }

  const warehouseUserMap = new Map<string, string>(); // warehouseId -> userId
  for (const u of allUsers) {
    if (u.warehouseId) {
      warehouseUserMap.set(u.warehouseId, u.id);
    }
  }

  // 4. Prepare Customer Cache
  const existingCustomers = await db.select().from(customers);
  const customerMap = new Map<string, string>(); // canonicalRut -> customerId
  for (const c of existingCustomers) {
    customerMap.set(c.rutCanonical, c.id);
  }

  // 5. Batch Import State
  const BATCH_SIZE = 500;
  let importedCount = 0;
  let rejectedCount = 0;
  let duplicateCount = 0;
  let customersCreatedCount = 0;
  let customersReusedCount = 0;
  let documentsCount = 0;

  const statusBreakdown: Record<string, number> = {
    COMPLETED: 0,
    PENDING: 0,
    IN_PROGRESS: 0,
    NEEDS_CORRECTION: 0,
    CANCELLED: 0,
  };

  const warehouseBreakdown: Record<string, number> = {};
  for (const wh of allWarehousesList) {
    warehouseBreakdown[wh.name] = 0;
  }

  let totalGrossImportedCLP = 0;
  let totalGrossCompletedCLP = 0;
  let totalGrossCancelledCLP = 0;
  let totalGrossRejectedCLP = 0;
  let totalGrossDuplicatesOmittedCLP = 0;

  const seenFingerprints = new Set<string>();

  // Deterministic counter for sequence numbering
  let sequenceIndex = 1;

  console.log(`3. Procesando ${rawRows.length} registros en lotes de ${BATCH_SIZE}...`);

  for (let b = 0; b < rawRows.length; b += BATCH_SIZE) {
    const batch = rawRows.slice(b, b + BATCH_SIZE);
    const batchNum = Math.floor(b / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rawRows.length / BATCH_SIZE);

    for (const item of batch) {
      const rowNum = item.rowNum;

      // Parse amount
      let amount = 0;
      if (item.totalGross !== null && item.totalGross !== undefined) {
        const normAmt = normalizeAmount(item.totalGross);
        amount = normAmt.amount || 0;
      }
      if (amount === 0 && item.price !== null && item.price !== undefined) {
        const normAmt = normalizeAmount(item.price);
        amount = normAmt.amount || 0;
      }

      // Parse date
      let requestDate: Date;
      if (item.timestamp) {
        requestDate = new Date(item.timestamp);
        if (isNaN(requestDate.getTime())) {
          requestDate = new Date("2024-12-10T12:00:00.000Z");
        }
      } else {
        requestDate = new Date("2024-12-10T12:00:00.000Z");
      }

      // Parse warehouse
      const whResult = normalizeWarehouse(item.bodega, allWarehousesList);
      let targetWarehouseId = whResult.warehouseId;
      let targetWarehouseName = whResult.warehouseName || "Santiago Central";
      if (!targetWarehouseId) {
        // Safe default fallback for empty/typo bodegas (Row 4 in analysis)
        targetWarehouseId = warehouseMap.get("CENTRAL")!.id;
        targetWarehouseName = "Santiago Central";
      }

      // Parse status
      const statusRes = normalizeStatus(item.status);
      const targetStatus: InvoiceRequestStatus = statusRes.status;

      // Validate RUT
      const rutRes = normalizeRut(item.rut);
      if (!rutRes.valid || !rutRes.canonical) {
        // Quarantined / Rejected test record
        rejectedCount++;
        totalGrossRejectedCLP += amount;

        await db.insert(migrationRecords).values({
          source: "GOOGLE_SHEETS_LEGACY",
          sourceRowId: String(rowNum),
          entityType: "invoice_requests",
          status: "FAILED",
          errorMessage: `RUT inválido o de prueba legacy: '${item.rut}' - ${rutRes.error}`,
          rawPayload: item,
        });
        continue;
      }

      const canonicalRut = rutRes.canonical;
      const displayRut = rutRes.display || canonicalRut;

      // Deduplication check
      const dateKey = requestDate.toISOString().slice(0, 10);
      const fingerprint = `${canonicalRut}|${targetWarehouseId}|${amount}|${dateKey}|${item.product.slice(0, 30)}`;
      if (seenFingerprints.has(fingerprint)) {
        duplicateCount++;
        totalGrossDuplicatesOmittedCLP += amount;

        await db.insert(migrationRecords).values({
          source: "GOOGLE_SHEETS_LEGACY",
          sourceRowId: String(rowNum),
          entityType: "invoice_requests",
          status: "SKIPPED",
          errorMessage: "Registro duplicado exacto en fuente histórica omitido.",
          rawPayload: item,
        });
        continue;
      }
      seenFingerprints.add(fingerprint);

      // Customer lookup / creation
      let customerId = customerMap.get(canonicalRut);
      const legalName = item.legalName.trim() || `Cliente ${displayRut}`;
      const businessActivity = item.businessActivity.trim() || "Giro comercial no especificado";
      const phone = item.phone ? String(item.phone).slice(0, 50) : null;
      const email = item.email && item.email.includes("@") ? item.email.trim().toLowerCase() : null;

      if (!customerId) {
        const [newCustomer] = await db
          .insert(customers)
          .values({
            rutCanonical: canonicalRut,
            rutDisplay: displayRut,
            legalName: legalName.slice(0, 200),
            businessActivity: businessActivity.slice(0, 250),
            phone: phone,
            email: email,
            active: true,
            createdAt: requestDate,
          })
          .onConflictDoUpdate({
            target: customers.rutCanonical,
            set: {
              legalName: legalName.slice(0, 200),
              updatedAt: requestDate,
            },
          })
          .returning();

        customerId = newCustomer.id;
        customerMap.set(canonicalRut, newCustomer.id);
        customersCreatedCount++;
      } else {
        customersReusedCount++;
      }

      // Generate request number: FAC-YYYY-NNNNNN
      const year = requestDate.getFullYear() || 2025;
      const requestNumber = `FAC-${year}-${String(sequenceIndex).padStart(6, "0")}`;
      sequenceIndex++;

      // Insert Invoice Request
      const isCompleted = targetStatus === "COMPLETED";
      const completedAt = isCompleted ? requestDate : null;

      const requestedById = (targetWarehouseId ? warehouseUserMap.get(targetWarehouseId) : undefined) || defaultAdminUser.id;

      const [newRequest] = await db
        .insert(invoiceRequests)
        .values({
          requestNumber: requestNumber,
          warehouseId: targetWarehouseId!,
          customerId: customerId!,
          requestedBy: requestedById,
          customerRutSnapshot: displayRut,
          customerLegalNameSnapshot: legalName.slice(0, 200),
          customerBusinessActivitySnapshot: businessActivity.slice(0, 250),
          expectedGrossTotal: amount,
          siiGrossTotal: isCompleted ? amount : null,
          grossDifference: isCompleted ? 0 : null,
          reconciliationStatus: isCompleted ? "MATCH" : null,
          status: targetStatus,
          source: "GOOGLE_SHEETS_LEGACY",
          notes: item.notes ? item.notes.slice(0, 2000) : null,
          createdAt: requestDate,
          completedAt: completedAt,
          updatedAt: completedAt || requestDate,
        })
        .returning();

      // Insert Request Item
      const netTotal = amount > 0 ? calculateNetPrice(amount, DEFAULT_VAT_RATE_PERCENT) : 0;

      await db.insert(invoiceRequestItems).values({
        invoiceRequestId: newRequest.id,
        lineNumber: 1,
        description: item.product.trim() ? item.product.trim().slice(0, 500) : "Productos varios según detalle",
        quantity: 1,
        unitPriceGross: amount,
        unitPriceNet: netTotal,
        lineTotalGross: amount,
        lineTotalNet: netTotal,
        vatRate: "19.00",
        createdAt: requestDate,
      });

      // Insert Google Drive Document if present
      if (item.documentUrl && (item.documentUrl.includes("drive.google.com") || item.documentUrl.includes("docs.google.com") || item.documentUrl.startsWith("http"))) {
        await db.insert(documents).values({
          invoiceRequestId: newRequest.id,
          documentType: "INVOICE",
          storageProvider: "GOOGLE_DRIVE",
          storageKey: item.documentUrl.slice(0, 1000),
          externalUrl: item.documentUrl.slice(0, 1000),
          fileName: `Factura_${requestNumber}.pdf`,
          fileSize: 0,
          mimeType: "application/pdf",
          uploadedBy: requestedById,
          createdAt: completedAt || requestDate,
        });
        documentsCount++;
      }

      if (isCompleted) {
        totalGrossCompletedCLP += amount;
      } else if (targetStatus === "CANCELLED") {
        totalGrossCancelledCLP += amount;
      }

      // Update counters
      importedCount++;
      totalGrossImportedCLP += amount;
      statusBreakdown[targetStatus]++;
      warehouseBreakdown[targetWarehouseName] = (warehouseBreakdown[targetWarehouseName] || 0) + 1;

      // Record migration record
      await db.insert(migrationRecords).values({
        source: "GOOGLE_SHEETS_LEGACY",
        sourceRowId: String(rowNum),
        entityType: "invoice_requests",
        entityId: newRequest.id,
        status: "IMPORTED",
        rawPayload: item,
      });
    }

    console.log(`  [Batch ${batchNum}/${totalBatches}] ${importedCount} importados, ${rejectedCount} rechazados, ${duplicateCount} duplicados...`);
  }

  // Cleanup temporary file
  if (fs.existsSync(tempJsonPath)) {
    fs.unlinkSync(tempJsonPath);
  }

  const endTime = new Date();
  const durationMs = endTime.getTime() - startTime.getTime();

  await logAuditEvent({
    action: "HISTORICAL_IMPORT_COMPLETED",
    entityType: "invoice_requests",
    metadata: {
      totalRows: rawRows.length,
      imported: importedCount,
      rejected: rejectedCount,
      duplicatesOmitted: duplicateCount,
      totalGrossCLP: totalGrossImportedCLP,
      durationMs: durationMs,
    },
  });

  console.log("===============================================================");
  console.log("    ✓ MIGRACIÓN HISTÓRICA COMPLETADA EXITOSAMENTE              ");
  console.log(`    Importadas: ${importedCount} | Rechazadas: ${rejectedCount} | Duplicados: ${duplicateCount}`);
  console.log(`    Monto Bruto Importado: $${totalGrossImportedCLP.toLocaleString("es-CL")} CLP`);
  console.log(`    Documentos Google Drive: ${documentsCount} preservados`);
  console.log(`    Duración: ${(durationMs / 1000).toFixed(1)} segundos`);
  console.log("===============================================================");

  return {
    totalRowsRead: rawRows.length,
    importedRequests: importedCount,
    rejectedRows: rejectedCount,
    duplicateRowsOmitted: duplicateCount,
    uniqueCustomersCreated: customersCreatedCount,
    uniqueCustomersReused: customersReusedCount,
    documentsPreserved: documentsCount,
    statusBreakdown: statusBreakdown,
    warehouseBreakdown: warehouseBreakdown,
    totalGrossImportedCLP: totalGrossImportedCLP,
    totalGrossCompletedCLP: totalGrossCompletedCLP,
    totalGrossCancelledCLP: totalGrossCancelledCLP,
    totalGrossRejectedCLP: totalGrossRejectedCLP,
    totalGrossDuplicatesOmittedCLP: totalGrossDuplicatesOmittedCLP,
    startTime: startTime,
    endTime: endTime,
    durationMs: durationMs,
  };
}

if (require.main === module) {
  runHistoricalMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[ERROR EN MIGRACIÓN HISTÓRICA]", err);
      process.exit(1);
    });
}
