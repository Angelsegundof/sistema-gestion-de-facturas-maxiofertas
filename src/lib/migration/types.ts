import { InvoiceRequestStatus } from "@/domain/types";

export interface RawLegacyRow {
  rowNumber: number;
  sourceRowId: string;
  timestamp?: string; // Marca temporal (Google Form)
  warehouse?: string; // Bodega / Sucursal
  customerRut?: string; // RUT Cliente
  customerLegalName?: string; // Razón Social / Nombre
  businessActivity?: string; // Giro
  customerPhone?: string; // Teléfono
  customerEmail?: string; // Email
  itemsDescription?: string; // Detalle productos
  grossTotal?: string | number; // Monto total / Bruto
  status?: string; // Estado
  notes?: string; // Observaciones
  invoiceUrl?: string; // Link Drive / URL
  completedAt?: string; // Fecha emisión
  executorName?: string; // Facturador / Ejecutor
  raw: Record<string, string>;
}

export interface SanitizedLegacyRow {
  rowNumber: number;
  sourceRowId: string;
  createdAt: Date;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  customerRutCanonical: string;
  customerRutDisplay: string;
  customerLegalName: string;
  businessActivity: string;
  customerPhone: string | null;
  customerEmail: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceGross: number;
    unitPriceNet: number;
    lineTotalGross: number;
    lineTotalNet: number;
  }>;
  expectedGrossTotal: number;
  status: InvoiceRequestStatus;
  notes: string | null;
  invoiceUrl: string | null;
  completedAt: Date | null;
  executorName: string | null;
  raw: Record<string, string>;
}

export type RowClassification = "VALID" | "WARNING" | "ERROR";

export interface RowValidationResult {
  rowNumber: number;
  sourceRowId: string;
  classification: RowClassification;
  errors: string[];
  warnings: string[];
  sanitized: SanitizedLegacyRow | null;
  isDuplicate?: boolean;
}

export interface MigrationReport {
  totalRowsRead: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  duplicateRows: number;
  skippedRows: number;
  customersDetected: number;
  totalGrossAmount: number;
  errorsByType: Record<string, number>;
  warningsByType: Record<string, number>;
  warehousesSummary: Record<string, { count: number; grossTotal: number }>;
  statusesSummary: Record<string, number>;
  rowResults: RowValidationResult[];
}

export interface MigrationOptions {
  batchSize?: number;
  dryRun?: boolean;
  systemUserId?: string;
}
