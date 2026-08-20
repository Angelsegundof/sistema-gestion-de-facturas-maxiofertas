/**
 * Dominio de precios y c?lculos tributarios oficiales (v1.1)
 * Regla: El solicitante ingresa exclusivamente precios BRUTOS (IVA incluido).
 * El c?lculo de neto para SII utiliza ROUND_HALF_UP a cero decimales.
 */

import { ReconciliationStatus } from "./types";

export const DEFAULT_VAT_RATE_PERCENT = 19;

/**
 * Calcula el precio unitario neto para el SII a partir del precio unitario bruto (IVA incluido)
 * mediante aritmética entera exacta con redondeo simétrico al entero más cercano (ROUND_HALF_UP).
 *
 * Fórmula matemática exacta:
 *   net = round(gross * 100 / (100 + vatRate))
 *
 * En aritmética entera exacta para enteros positivos:
 *   divisor = 100n + BigInt(vatRatePercent)
 *   net = (BigInt(gross) * 100n + (divisor / 2n)) / divisor
 */
export function calculateNetPrice(
  unitPriceGross: number,
  vatRatePercent: number = DEFAULT_VAT_RATE_PERCENT
): number {
  if (
    typeof unitPriceGross !== "number" ||
    !Number.isSafeInteger(unitPriceGross) ||
    unitPriceGross <= 0
  ) {
    throw new Error("El precio bruto unitario debe ser un entero positivo seguro.");
  }
  if (
    typeof vatRatePercent !== "number" ||
    !Number.isSafeInteger(vatRatePercent) ||
    vatRatePercent < 0
  ) {
    throw new Error("La tasa de IVA debe ser un entero positivo seguro.");
  }

  const grossBig = BigInt(unitPriceGross);
  const vatBig = BigInt(vatRatePercent);
  const divisorBig = 100n + vatBig;

  // Exact integer ROUND_HALF_UP: adding half the divisor (119 / 2 = 59) before integer division
  const netBig = (grossBig * 100n + divisorBig / 2n) / divisorBig;

  const result = Number(netBig);
  if (!Number.isSafeInteger(result)) {
    throw new Error("El resultado del cálculo neto supera el rango de enteros seguros.");
  }
  return result;
}

export interface CalculatedItem {
  lineNumber: number;
  description: string;
  quantity: number;
  unitPriceGross: number;
  unitPriceNet: number;
  lineTotalGross: number;
  lineTotalNet: number;
  vatRate: number;
}

export interface RequestTotals {
  items: CalculatedItem[];
  expectedGrossTotal: number;
  expectedNetTotal: number;
  calculatedVatTotal: number;
}

/**
 * Calcula los totales de una línea de producto.
 */
export function calculateLineItem(
  item: { description: string; quantity: number; unitPriceGross: number },
  lineNumber: number,
  vatRatePercent: number = DEFAULT_VAT_RATE_PERCENT
): CalculatedItem {
  if (!item.description || item.description.trim().length === 0) {
    throw new Error(`La descripción del producto en la línea ${lineNumber} es requerida.`);
  }
  if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
    throw new Error(`La cantidad en la línea ${lineNumber} debe ser un entero positivo.`);
  }
  if (item.unitPriceGross <= 0 || !Number.isInteger(item.unitPriceGross)) {
    throw new Error(`El precio bruto en la línea ${lineNumber} debe ser un entero positivo.`);
  }

  const unitPriceGross = item.unitPriceGross;
  const unitPriceNet = calculateNetPrice(unitPriceGross, vatRatePercent);
  const lineTotalGross = item.quantity * unitPriceGross;
  const lineTotalNet = item.quantity * unitPriceNet;

  return {
    lineNumber,
    description: item.description.trim(),
    quantity: item.quantity,
    unitPriceGross,
    unitPriceNet,
    lineTotalGross,
    lineTotalNet,
    vatRate: vatRatePercent,
  };
}

/**
 * Calcula y valida todos los totales de una solicitud a partir de sus líneas.
 * El servidor siempre recalcula los valores sin confiar en totales enviados por cliente.
 */
export function calculateRequestTotals(
  rawItems: Array<{ description: string; quantity: number; unitPriceGross: number }>,
  vatRatePercent: number = DEFAULT_VAT_RATE_PERCENT
): RequestTotals {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("La solicitud debe contener al menos un producto.");
  }
  if (rawItems.length > 100) {
    throw new Error("La solicitud no puede superar las 100 líneas de productos.");
  }

  const calculatedItems: CalculatedItem[] = [];
  let expectedGrossTotal = 0;
  let expectedNetTotal = 0;

  for (let i = 0; i < rawItems.length; i++) {
    const calculated = calculateLineItem(rawItems[i], i + 1, vatRatePercent);
    calculatedItems.push(calculated);
    expectedGrossTotal += calculated.lineTotalGross;
    expectedNetTotal += calculated.lineTotalNet;
  }

  if (expectedGrossTotal <= 0) {
    throw new Error("El total bruto esperado debe ser mayor a cero.");
  }

  return {
    items: calculatedItems,
    expectedGrossTotal,
    expectedNetTotal,
    calculatedVatTotal: expectedGrossTotal - expectedNetTotal,
  };
}

export interface ReconciliationResult {
  expectedGrossTotal: number;
  siiGrossTotal: number;
  grossDifference: number;
  status: ReconciliationStatus;
  canProceed: boolean;
  message: string;
}

/**
 * Eval?a la cuadratura del SII contra el total solicitado.
 * Reglas:
 * - grossDifference = siiGrossTotal - expectedGrossTotal
 * - Si grossDifference === 0 -> MATCH (canProceed: true)
 * - Si ABS(grossDifference) <= 2 -> ROUNDING_ACCEPTED (canProceed: true)
 * - Si ABS(grossDifference) > 2 -> MISMATCH (canProceed: false)
 */
export function calculateReconciliation(
  expectedGrossTotal: number,
  siiGrossTotal: number
): ReconciliationResult {
  if (!Number.isInteger(expectedGrossTotal) || expectedGrossTotal <= 0) {
    throw new Error("El total solicitado esperado debe ser un entero positivo.");
  }
  if (!Number.isInteger(siiGrossTotal) || siiGrossTotal <= 0) {
    throw new Error("El total mostrado por el SII debe ser un entero positivo.");
  }

  const grossDifference = siiGrossTotal - expectedGrossTotal;
  const absDiff = Math.abs(grossDifference);

  if (grossDifference === 0) {
    return {
      expectedGrossTotal,
      siiGrossTotal,
      grossDifference: 0,
      status: "MATCH",
      canProceed: true,
      message: "Los valores coinciden exactamente.",
    };
  }

  if (absDiff <= 2) {
    return {
      expectedGrossTotal,
      siiGrossTotal,
      grossDifference,
      status: "ROUNDING_ACCEPTED",
      canProceed: true,
      message: `Diferencia de redondeo aceptada (${grossDifference > 0 ? `+${grossDifference}` : grossDifference} CLP).`,
    };
  }

  return {
    expectedGrossTotal,
    siiGrossTotal,
    grossDifference,
    status: "MISMATCH",
    canProceed: false,
    message: `Los valores no coinciden (diferencia de ${grossDifference > 0 ? `+${grossDifference}` : grossDifference} CLP). Revisa los precios netos ingresados en el SII antes de continuar.`,
  };
}

/**
 * Formatea un monto en pesos chilenos (CLP) con puntos como separador de miles.
 * Ejemplo: 28000 -> "$28.000", 1250000 -> "$1.250.000"
 */
export function formatCLP(amount: number): string {
  const rounded = Math.round(amount);
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$${formatted}`;
}
