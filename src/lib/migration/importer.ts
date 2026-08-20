import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  warehouses,
  customers,
  users,
  invoiceRequests,
  invoiceRequestItems,
  documents,
  migrationRecords,
} from "@/lib/db/schema";
import { calculateNetPrice, DEFAULT_VAT_RATE_PERCENT } from "@/domain/pricing";
import {
  normalizeRut,
  normalizeWarehouse,
  normalizeStatus,
  normalizeAmount,
  normalizeDate,
} from "./normalizers";
import {
  RawLegacyRow,
  SanitizedLegacyRow,
  RowValidationResult,
  MigrationReport,
  MigrationOptions,
} from "./types";

/**
 * Robust CSV parser that supports both comma and semicolon delimiters,
 * handles escaped quotes, and multi-line fields.
 */
export function parseCsvRows(csvContent: string): Array<Record<string, string>> {
  const lines: string[] = [];
  let currentLine = "";
  let insideQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentLine += '"';
        i++; // skip next quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if ((char === "\r" || char === "\n") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      if (currentLine.trim().length > 0) {
        lines.push(currentLine);
      }
      currentLine = "";
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim().length > 0) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return [];

  // Determine delimiter from header
  const headerLine = lines[0];
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";

  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let curVal = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const next = line[i + 1];
      if (c === '"') {
        if (inQ && next === '"') {
          curVal += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === delimiter && !inQ) {
        values.push(curVal.trim());
        curVal = "";
      } else {
        curVal += c;
      }
    }
    values.push(curVal.trim());
    return values;
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, "").trim());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] || "";
    });
    rows.push(rowObj);
  }

  return rows;
}

export function mapRawRow(raw: Record<string, string>, index: number): RawLegacyRow {
  const rowNumber = index + 2; // 1-indexed, header is row 1
  const sourceRowId = `row_${rowNumber}`;

  const findKey = (...aliases: string[]): string | undefined => {
    for (const a of aliases) {
      const match = Object.keys(raw).find((k) => k.includes(a.toLowerCase()));
      if (match && raw[match] !== undefined) {
        return raw[match].trim();
      }
    }
    return undefined;
  };

  return {
    rowNumber,
    sourceRowId,
    timestamp: findKey("marca temporal", "timestamp", "fecha y hora", "fecha_solicitud", "fecha"),
    warehouse: findKey("bodega", "sucursal", "origen", "tienda"),
    customerRut: findKey("rut cliente", "rut_cliente", "rut"),
    customerLegalName: findKey("razon social", "razón social", "nombre cliente", "cliente", "nombre"),
    businessActivity: findKey("giro", "actividad comercial", "actividad"),
    customerPhone: findKey("telefono", "teléfono", "fono", "contacto"),
    customerEmail: findKey("email", "correo", "correo electrónico"),
    itemsDescription: findKey("detalle de productos", "detalle", "descripcion", "descripción", "items", "productos"),
    grossTotal: findKey("monto total", "total bruto", "monto", "total", "valor"),
    status: findKey("estado", "estado factura", "status"),
    notes: findKey("observaciones", "notas", "comentarios", "comentario"),
    invoiceUrl: findKey("enlace factura", "link drive", "url factura", "documento", "pdf", "link"),
    completedAt: findKey("fecha facturacion", "fecha facturación", "fecha emision", "fecha emisión", "fecha_emision"),
    executorName: findKey("facturador", "ejecutor", "responsable"),
    raw,
  };
}

export function validateLegacyRow(
  rawRow: RawLegacyRow,
  allWarehouses: Array<{ id: string; code: string; name: string }>,
  seenKeys: Set<string>
): RowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validate Date
  const dateRes = normalizeDate(rawRow.timestamp);
  if (!dateRes.valid || !dateRes.date) {
    errors.push(dateRes.error || "Fecha de solicitud inválida");
  }

  // 2. Validate Warehouse
  const whRes = normalizeWarehouse(rawRow.warehouse, allWarehouses);
  if (!whRes.valid || !whRes.warehouseId || !whRes.warehouseCode || !whRes.warehouseName) {
    errors.push(whRes.error || "Bodega no reconocida");
  }

  // 3. Validate RUT
  const rutRes = normalizeRut(rawRow.customerRut);
  if (!rutRes.valid || !rutRes.canonical || !rutRes.display) {
    errors.push(rutRes.error || "RUT de cliente inválido");
  }

  // 4. Validate Legal Name & Activity
  const legalName = (rawRow.customerLegalName || "").trim();
  if (!legalName) {
    errors.push("Razón social o nombre de cliente vacío");
  }

  const businessActivity = (rawRow.businessActivity || "").trim() || "Venta de Mercadería General";
  if (!rawRow.businessActivity) {
    warnings.push("Giro no especificado; asignado valor por defecto");
  }

  // 5. Validate Amount
  const amountRes = normalizeAmount(rawRow.grossTotal);
  if (!amountRes.valid || !amountRes.amount) {
    errors.push(amountRes.error || "Monto bruto inválido");
  }

  // 6. Validate Status
  const statusRes = normalizeStatus(rawRow.status);
  if (statusRes.warning) {
    warnings.push(statusRes.warning);
  }

  // 7. Completed At (if status completed)
  let completedAtDate: Date | null = null;
  if (rawRow.completedAt) {
    const compRes = normalizeDate(rawRow.completedAt);
    if (compRes.valid && compRes.date) {
      completedAtDate = compRes.date;
    }
  } else if (statusRes.status === "COMPLETED" && dateRes.date) {
    completedAtDate = dateRes.date;
  }

  // 8. Deduplication detection
  let isDuplicate = false;
  if (rutRes.canonical && whRes.warehouseCode && amountRes.amount && dateRes.date) {
    const dateKey = dateRes.date.toISOString().split("T")[0];
    const compositeKey = `${rutRes.canonical}|${whRes.warehouseCode}|${amountRes.amount}|${dateKey}`;
    if (seenKeys.has(compositeKey)) {
      isDuplicate = true;
      warnings.push(`Posible fila duplicada detectada (clave: ${compositeKey})`);
    } else {
      seenKeys.add(compositeKey);
    }
  }

  // Build items
  let sanitized: SanitizedLegacyRow | null = null;
  if (errors.length === 0 && dateRes.date && whRes.warehouseId && rutRes.canonical && amountRes.amount) {
    const grossTotal = amountRes.amount;
    const netTotal = calculateNetPrice(grossTotal, DEFAULT_VAT_RATE_PERCENT);
    const itemDesc = (rawRow.itemsDescription || "").trim() || "Productos según detalle histórico Google Sheets";

    sanitized = {
      rowNumber: rawRow.rowNumber,
      sourceRowId: rawRow.sourceRowId,
      createdAt: dateRes.date,
      warehouseId: whRes.warehouseId!,
      warehouseCode: whRes.warehouseCode!,
      warehouseName: whRes.warehouseName!,
      customerRutCanonical: rutRes.canonical,
      customerRutDisplay: rutRes.display!,
      customerLegalName: legalName,
      businessActivity,
      customerPhone: rawRow.customerPhone ? rawRow.customerPhone.trim() : null,
      customerEmail: rawRow.customerEmail ? rawRow.customerEmail.trim() : null,
      items: [
        {
          description: itemDesc,
          quantity: 1,
          unitPriceGross: grossTotal,
          unitPriceNet: netTotal,
          lineTotalGross: grossTotal,
          lineTotalNet: netTotal,
        },
      ],
      expectedGrossTotal: grossTotal,
      status: statusRes.status,
      notes: rawRow.notes ? rawRow.notes.trim() : null,
      invoiceUrl: rawRow.invoiceUrl ? rawRow.invoiceUrl.trim() : null,
      completedAt: completedAtDate,
      executorName: rawRow.executorName ? rawRow.executorName.trim() : null,
      raw: rawRow.raw,
    };
  }

  const classification = errors.length > 0 ? "ERROR" : warnings.length > 0 ? "WARNING" : "VALID";

  return {
    rowNumber: rawRow.rowNumber,
    sourceRowId: rawRow.sourceRowId,
    classification,
    errors,
    warnings,
    sanitized,
    isDuplicate,
  };
}

export async function runDryRun(
  csvContent: string,
  dbOverride?: unknown
): Promise<MigrationReport> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();

  let allWarehouses: Array<{ id: string; code: string; name: string }>;

  if (db) {
    // Fetch active warehouses from database
    allWarehouses = await db
      .select({
        id: warehouses.id,
        code: warehouses.code,
        name: warehouses.name,
      })
      .from(warehouses);
  } else {
    // Default known system warehouses for offline/standalone dry-run validation
    allWarehouses = [
      { id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01", code: "CENTRAL", name: "Santiago Central" },
      { id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02", code: "NORTE", name: "Bodega Norte" },
      { id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03", code: "SUR", name: "Bodega Sur" },
    ];
  }

  const rawRowsList = parseCsvRows(csvContent);
  const seenKeys = new Set<string>();

  const rowResults: RowValidationResult[] = [];
  const errorsByType: Record<string, number> = {};
  const warningsByType: Record<string, number> = {};
  const warehousesSummary: Record<string, { count: number; grossTotal: number }> = {};
  const statusesSummary: Record<string, number> = {};
  const detectedRuts = new Set<string>();

  let validRows = 0;
  let warningRows = 0;
  let errorRows = 0;
  let duplicateRows = 0;
  let totalGrossAmount = 0;

  for (let i = 0; i < rawRowsList.length; i++) {
    const rawRow = mapRawRow(rawRowsList[i], i);
    const result = validateLegacyRow(rawRow, allWarehouses, seenKeys);
    rowResults.push(result);

    if (result.classification === "VALID") {
      validRows++;
    } else if (result.classification === "WARNING") {
      warningRows++;
    } else {
      errorRows++;
    }

    if (result.isDuplicate) {
      duplicateRows++;
    }

    // Accumulate errors
    for (const err of result.errors) {
      const type = err.split(":")[0];
      errorsByType[type] = (errorsByType[type] || 0) + 1;
    }

    // Accumulate warnings
    for (const w of result.warnings) {
      const type = w.split(":")[0];
      warningsByType[type] = (warningsByType[type] || 0) + 1;
    }

    if (result.sanitized) {
      const s = result.sanitized;
      detectedRuts.add(s.customerRutCanonical);
      totalGrossAmount += s.expectedGrossTotal;

      if (!warehousesSummary[s.warehouseCode]) {
        warehousesSummary[s.warehouseCode] = { count: 0, grossTotal: 0 };
      }
      warehousesSummary[s.warehouseCode].count += 1;
      warehousesSummary[s.warehouseCode].grossTotal += s.expectedGrossTotal;

      statusesSummary[s.status] = (statusesSummary[s.status] || 0) + 1;
    }
  }

  return {
    totalRowsRead: rawRowsList.length,
    validRows,
    warningRows,
    errorRows,
    duplicateRows,
    skippedRows: errorRows,
    customersDetected: detectedRuts.size,
    totalGrossAmount,
    errorsByType,
    warningsByType,
    warehousesSummary,
    statusesSummary,
    rowResults,
  };
}

export async function executeLoad(
  csvContent: string,
  options: MigrationOptions = {},
  dbOverride?: unknown
): Promise<{
  report: MigrationReport;
  importedRequestsCount: number;
  createdCustomersCount: number;
  errors: string[];
}> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible para la carga.");
  }

  // 1. Run Dry-Run to validate and categorize all rows
  const report = await runDryRun(csvContent, db);

  // 2. Identify or create system legacy migration user
  let systemUser = (
    await db.select().from(users).where(eq(users.email, "admin@maxiofertas.cl")).limit(1)
  )[0];

  if (!systemUser) {
    const anyAdmin = (await db.select().from(users).limit(1))[0];
    if (anyAdmin) {
      systemUser = anyAdmin;
    } else {
      throw new Error("No existe un usuario administrador en el sistema para asociar la migración.");
    }
  }

  let importedRequestsCount = 0;
  let createdCustomersCount = 0;
  const loadErrors: string[] = [];

  // Filter rows that are importable (VALID or WARNING)
  const importableResults = report.rowResults.filter((r) => r.sanitized !== null);

  for (const item of importableResults) {
    const s = item.sanitized!;

    try {
      // A. Check idempotency: does a request with this legacySourceId already exist?
      const existingReq = await db
        .select({ id: invoiceRequests.id })
        .from(invoiceRequests)
        .where(
          and(
            eq(invoiceRequests.source, "GOOGLE_SHEETS_LEGACY"),
            eq(invoiceRequests.legacySourceId, s.sourceRowId)
          )
        )
        .limit(1);

      if (existingReq.length > 0) {
        // Already imported -> record skipped in migrationRecords and continue
        await db.insert(migrationRecords).values({
          source: "GOOGLE_SHEETS_LEGACY",
          sourceRowId: s.sourceRowId,
          entityType: "INVOICE_REQUEST",
          entityId: existingReq[0].id,
          status: "SKIPPED",
          errorMessage: "Registro previamente importado (idempotencia)",
          rawPayload: s.raw,
        });
        continue;
      }

      // B. Find or create Customer
      let customerId: string;
      const existingCust = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.rutCanonical, s.customerRutCanonical))
        .limit(1);

      if (existingCust.length > 0) {
        customerId = existingCust[0].id;
      } else {
        const [newCust] = await db
          .insert(customers)
          .values({
            rutCanonical: s.customerRutCanonical,
            rutDisplay: s.customerRutDisplay,
            legalName: s.customerLegalName,
            businessActivity: s.businessActivity,
            phone: s.customerPhone,
            email: s.customerEmail,
            active: true,
          })
          .returning();
        customerId = newCust.id;
        createdCustomersCount++;
      }

      // C. Generate Request Number (sequential format FAC-LEGACY-NNNNNN)
      const paddedNum = String(s.rowNumber).padStart(6, "0");
      const requestNumber = `FAC-LEGACY-${paddedNum}`;

      // D. Insert Invoice Request
      const [newReq] = await (db as any)
        .insert(invoiceRequests)
        .values({
          requestNumber,
          warehouseId: s.warehouseId,
          customerId,
          requestedBy: systemUser.id,
          assignedTo: s.status === "COMPLETED" ? systemUser.id : null,
          status: s.status,
          customerRutSnapshot: s.customerRutDisplay,
          customerLegalNameSnapshot: s.customerLegalName,
          customerBusinessActivitySnapshot: s.businessActivity,
          customerPhoneSnapshot: s.customerPhone,
          customerEmailSnapshot: s.customerEmail,
          expectedGrossTotal: s.expectedGrossTotal,
          siiGrossTotal: s.status === "COMPLETED" ? s.expectedGrossTotal : null,
          grossDifference: s.status === "COMPLETED" ? 0 : null,
          reconciliationStatus: s.status === "COMPLETED" ? "MATCH" : null,
          notes: s.notes,
          source: "GOOGLE_SHEETS_LEGACY",
          legacySourceId: s.sourceRowId,
          createdAt: s.createdAt,
          completedAt: s.completedAt,
        })
        .returning();

      // E. Insert Invoice Request Item
      const firstItem = s.items[0];
      await db.insert(invoiceRequestItems).values({
        invoiceRequestId: newReq.id,
        lineNumber: 1,
        description: firstItem.description,
        quantity: firstItem.quantity,
        unitPriceGross: firstItem.unitPriceGross,
        unitPriceNet: firstItem.unitPriceNet,
        lineTotalGross: firstItem.lineTotalGross,
        lineTotalNet: firstItem.lineTotalNet,
        vatRate: "19.00",
        createdAt: s.createdAt,
      });

      // F. If Drive invoice URL is present, insert Document
      if (s.invoiceUrl) {
        await db.insert(documents).values({
          documentType: "INVOICE",
          storageProvider: "GOOGLE_DRIVE",
          storageKey: s.invoiceUrl,
          fileName: `factura_legacy_${s.rowNumber}.pdf`,
          mimeType: "application/pdf",
          fileSize: 0,
          invoiceRequestId: newReq.id,
          isVoided: false,
          uploadedBy: systemUser.id,
          createdAt: s.completedAt || s.createdAt,
        });
      }

      // G. Record migration audit log
      await db.insert(migrationRecords).values({
        source: "GOOGLE_SHEETS_LEGACY",
        sourceRowId: s.sourceRowId,
        entityType: "INVOICE_REQUEST",
        entityId: newReq.id,
        status: "IMPORTED",
        rawPayload: s.raw,
      });

      importedRequestsCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      loadErrors.push(`Fila ${s.rowNumber}: ${msg}`);

      await db.insert(migrationRecords).values({
        source: "GOOGLE_SHEETS_LEGACY",
        sourceRowId: s.sourceRowId,
        entityType: "INVOICE_REQUEST",
        status: "FAILED",
        errorMessage: msg,
        rawPayload: s.raw,
      });
    }
  }

  return {
    report,
    importedRequestsCount,
    createdCustomersCount,
    errors: loadErrors,
  };
}
