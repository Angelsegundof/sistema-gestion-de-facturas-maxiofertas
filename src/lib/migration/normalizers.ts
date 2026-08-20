import { validateRut, normalizeRut as canonicalizeRut, formatRut } from "@/lib/validation/rut";
import { calculateNetPrice, DEFAULT_VAT_RATE_PERCENT } from "@/domain/pricing";
import { InvoiceRequestStatus, SanitizedWarehouse } from "@/domain/types";

export function normalizeRut(raw?: string): {
  valid: boolean;
  canonical?: string;
  display?: string;
  error?: string;
} {
  if (!raw || !raw.trim()) {
    return { valid: false, error: "RUT vacío o no proporcionado" };
  }

  const cleaned = raw.trim();
  if (!validateRut(cleaned)) {
    return { valid: false, error: `RUT inválido: '${cleaned}'` };
  }

  const canonical = canonicalizeRut(cleaned);
  const display = formatRut(cleaned);

  return {
    valid: true,
    canonical,
    display,
  };
}

export function normalizeWarehouse(
  raw: string | undefined,
  warehouses: Array<{ id: string; code: string; name: string }>
): {
  valid: boolean;
  warehouseId?: string;
  warehouseCode?: string;
  warehouseName?: string;
  error?: string;
} {
  if (!raw || !raw.trim()) {
    return { valid: false, error: "Bodega vacía o no especificada" };
  }

  const clean = raw.trim().toLowerCase();

  // 1. Direct code or name exact match
  const directMatch = warehouses.find(
    (w) =>
      w.code.toLowerCase() === clean ||
      w.name.toLowerCase() === clean ||
      w.name.toLowerCase().includes(clean) ||
      clean.includes(w.code.toLowerCase())
  );
  if (directMatch) {
    return {
      valid: true,
      warehouseId: directMatch.id,
      warehouseCode: directMatch.code,
      warehouseName: directMatch.name,
    };
  }

  // 2. Alias normalization dictionary
  const aliasMap: Record<string, string> = {
    santiago: "CENTRAL",
    stgo: "CENTRAL",
    "stgo.": "CENTRAL",
    central: "CENTRAL",
    "bodega central": "CENTRAL",
    "stgo central": "CENTRAL",
    matriz: "CENTRAL",
    norte: "NORTE",
    "bodega norte": "NORTE",
    antofagasta: "NORTE",
    sur: "SUR",
    "bodega sur": "SUR",
    concepcion: "SUR",
    "concepción": "SUR",
    conce: "SUR",
  };

  const targetCode = aliasMap[clean];
  if (targetCode) {
    const matched = warehouses.find((w) => w.code.toUpperCase() === targetCode);
    if (matched) {
      return {
        valid: true,
        warehouseId: matched.id,
        warehouseCode: matched.code,
        warehouseName: matched.name,
      };
    }
  }

  // Fallback if there is only one active warehouse
  if (warehouses.length === 1) {
    return {
      valid: true,
      warehouseId: warehouses[0].id,
      warehouseCode: warehouses[0].code,
      warehouseName: warehouses[0].name,
    };
  }

  return {
    valid: false,
    error: `Bodega no reconocida o inexistente: '${raw.trim()}'`,
  };
}

export function normalizeStatus(raw?: string): {
  valid: boolean;
  status: InvoiceRequestStatus;
  warning?: string;
  error?: string;
} {
  if (!raw || !raw.trim()) {
    return { valid: true, status: "PENDING" };
  }

  const clean = raw.trim().toLowerCase();

  switch (clean) {
    case "pendiente":
    case "ingresada":
    case "nueva":
    case "creada":
    case "pending":
      return { valid: true, status: "PENDING" };

    case "en proceso":
    case "en gestion":
    case "en gestión":
    case "asignada":
    case "tomada":
    case "in_progress":
      return { valid: true, status: "IN_PROGRESS" };

    case "necesita corrección":
    case "necesita correccion":
    case "corregir":
    case "observada":
    case "con observaciones":
    case "needs_correction":
      return { valid: true, status: "NEEDS_CORRECTION" };

    case "realizada":
    case "facturada":
    case "completada":
    case "lista":
    case "emitida":
    case "ok":
    case "completed":
      return { valid: true, status: "COMPLETED" };

    case "anulada":
    case "cancelada":
    case "rechazada":
    case "cancelled":
      return { valid: true, status: "CANCELLED" };

    default:
      return {
        valid: true,
        status: "PENDING",
        warning: `Estado no tipado '${raw.trim()}', normalizado como PENDING`,
      };
  }
}

export function normalizeAmount(raw?: string | number): {
  valid: boolean;
  amount?: number;
  error?: string;
} {
  if (raw === undefined || raw === null || raw === "") {
    return { valid: false, error: "Monto bruto vacío o inexistente" };
  }

  if (typeof raw === "number") {
    if (isNaN(raw) || raw <= 0 || !Number.isInteger(raw)) {
      return { valid: false, error: `Monto inválido o no entero: ${raw}` };
    }
    return { valid: true, amount: raw };
  }

  const cleanStr = raw
    .trim()
    .replace(/\$/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");

  const parsed = Number(cleanStr);
  if (isNaN(parsed) || parsed <= 0) {
    return { valid: false, error: `Monto numérico no parseable: '${raw}'` };
  }

  const rounded = Math.round(parsed);
  return { valid: true, amount: rounded };
}

export function normalizeDate(raw?: string): {
  valid: boolean;
  date?: Date;
  error?: string;
} {
  if (!raw || !raw.trim()) {
    return { valid: false, error: "Fecha vacía o no proporcionada" };
  }

  const clean = raw.trim();

  // Try ISO format
  const isoDate = new Date(clean);
  if (!isNaN(isoDate.getTime()) && clean.includes("-") && clean.length >= 10) {
    return { valid: true, date: isoDate };
  }

  // Try Chilean format: DD/MM/YYYY or DD/MM/YYYY HH:mm[:ss]
  const slashMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    const year = parseInt(slashMatch[3], 10);
    const hours = slashMatch[4] ? parseInt(slashMatch[4], 10) : 0;
    const minutes = slashMatch[5] ? parseInt(slashMatch[5], 10) : 0;
    const seconds = slashMatch[6] ? parseInt(slashMatch[6], 10) : 0;

    const parsedDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    if (!isNaN(parsedDate.getTime())) {
      return { valid: true, date: parsedDate };
    }
  }

  return { valid: false, error: `Formato de fecha inválido o desconocido: '${clean}'` };
}
