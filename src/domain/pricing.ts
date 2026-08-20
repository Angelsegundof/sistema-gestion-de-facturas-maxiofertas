/**
 * Dominio de precios y c?lculos tributarios oficiales (v1.1)
 * Regla: El solicitante ingresa exclusivamente precios BRUTOS (IVA incluido).
 * El c?lculo de neto para SII utiliza ROUND_HALF_UP a cero decimales.
 */

export const DEFAULT_VAT_RATE_PERCENT = 19.0;

/**
 * Calcula el precio unitario neto para el SII a partir del precio unitario bruto (IVA incluido).
 * F?rmula: unitPriceNet = ROUND_HALF_UP(unitPriceGross / (1 + vatRate / 100))
 */
export function calculateNetPrice(
  unitPriceGross: number,
  vatRatePercent: number = DEFAULT_VAT_RATE_PERCENT
): number {
  if (unitPriceGross <= 0 || !Number.isInteger(unitPriceGross)) {
    throw new Error("El precio bruto unitario debe ser un entero positivo.");
  }
  const divisor = 1 + vatRatePercent / 100;
  return Math.round(unitPriceGross / divisor);
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
 * Calcula los totales de una l?nea de producto.
 */
export function calculateLineItem(
  item: { description: string; quantity: number; unitPriceGross: number },
  lineNumber: number,
  vatRatePercent: number = DEFAULT_VAT_RATE_PERCENT
): CalculatedItem {
  if (!item.description || item.description.trim().length === 0) {
    throw new Error(`La descripci?n del producto en la l?nea ${lineNumber} es requerida.`);
  }
  if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
    throw new Error(`La cantidad en la l?nea ${lineNumber} debe ser un entero positivo.`);
  }
  if (item.unitPriceGross <= 0 || !Number.isInteger(item.unitPriceGross)) {
    throw new Error(`El precio bruto en la l?nea ${lineNumber} debe ser un entero positivo.`);
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
 * Calcula y valida todos los totales de una solicitud a partir de sus l?neas.
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
    throw new Error("La solicitud no puede superar las 100 l?neas de productos.");
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

/**
 * Formatea un monto en pesos chilenos (CLP) con puntos como separador de miles.
 * Ejemplo: 28000 -> "$28.000", 1250000 -> "$1.250.000"
 */
export function formatCLP(amount: number): string {
  const rounded = Math.round(amount);
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$${formatted}`;
}
