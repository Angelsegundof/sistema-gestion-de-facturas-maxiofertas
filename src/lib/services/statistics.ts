import { eq, and, sql, gte, lte, asc, desc, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  invoiceRequests,
  documents,
  creditNotes,
  rectifications,
  warehouses,
  users,
} from "@/lib/db/schema";
import { calculateNetPrice, DEFAULT_VAT_RATE_PERCENT } from "@/domain/pricing";
import { getChileDayBounds, getChileMonthBounds, getChileCurrentYearMonth } from "@/lib/utils/dates";
import {
  SanitizedUser,
  StatisticsSummary,
  WarehouseStatistics,
  MonthlyEvolutionItem,
  StatisticsPeriod,
  ExecutorPerformanceItem,
  ExecutorStatisticsResponse,
} from "@/domain/types";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const MONTH_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export interface StatisticsFilterParams {
  month?: number;
  year?: number;
  warehouseId?: string;
  startDate?: string;
  endDate?: string;
}

export function resolvePeriod(params: StatisticsFilterParams): {
  startDate: Date;
  endDate: Date;
  month: number;
  year: number;
  label: string;
} {
  const now = new Date();
  const year = params.year || now.getFullYear();
  const month = params.month || now.getMonth() + 1;

  let startDate: Date;
  let endDate: Date;

  if (params.startDate && params.endDate) {
    startDate = new Date(params.startDate);
    endDate = new Date(params.endDate);
  } else {
    // 1st day of month 00:00:00.000 UTC
    startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    // Last day of month 23:59:59.999 UTC
    endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  }

  const label = `${MONTH_NAMES[month - 1] || "Mes"} ${year}`;

  return {
    startDate,
    endDate,
    month,
    year,
    label,
  };
}

/**
 * Ensures authorized warehouse scope and enforces IDOR protection.
 */
export function enforceWarehouseScope(
  currentUser: SanitizedUser,
  requestedWarehouseId?: string
): string | undefined {
  if (currentUser.role === "WAREHOUSE_USER") {
    if (!currentUser.warehouseId) {
      throw new Error("FORBIDDEN: Usuario de bodega sin bodega asignada.");
    }
    if (requestedWarehouseId && requestedWarehouseId !== currentUser.warehouseId) {
      throw new Error("FORBIDDEN: No tienes permisos para consultar estadísticas de otra bodega.");
    }
    return currentUser.warehouseId;
  }

  return requestedWarehouseId || undefined;
}

export async function getStatisticsSummaryService(
  currentUser: SanitizedUser,
  params: StatisticsFilterParams,
  dbOverride?: unknown
): Promise<StatisticsSummary> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  const effectiveWarehouseId = enforceWarehouseScope(currentUser, params.warehouseId);
  const periodInfo = resolvePeriod(params);
  const { startDate, endDate, month, year, label } = periodInfo;

  // 1. FACTURACIÓN VIGENTE (Active / Valid Non-Voided Invoices)
  // A. Original Invoices completed in period and not voided (excluding replacement docs)
  const origConditions = [
    eq(documents.documentType, "INVOICE"),
    eq(documents.isVoided, false),
    isNull(rectifications.id),
    eq(invoiceRequests.status, "COMPLETED"),
    gte(invoiceRequests.completedAt, startDate),
    lte(invoiceRequests.completedAt, endDate),
  ];
  if (effectiveWarehouseId) {
    origConditions.push(eq(invoiceRequests.warehouseId, effectiveWarehouseId));
  }

  const validOriginalInvoices = await db
    .select({
      id: invoiceRequests.id,
      grossTotal: sql<number>`COALESCE(${invoiceRequests.siiGrossTotal}, ${invoiceRequests.expectedGrossTotal})`,
    })
    .from(documents)
    .innerJoin(invoiceRequests, eq(documents.invoiceRequestId, invoiceRequests.id))
    .leftJoin(rectifications, eq(rectifications.replacementInvoiceDocumentId, documents.id))
    .where(and(...origConditions));

  // B. Replacement Invoices on completed rectifications in period and not voided
  const repConditions = [
    eq(rectifications.status, "COMPLETED"),
    gte(rectifications.completedAt, startDate),
    lte(rectifications.completedAt, endDate),
    eq(documents.documentType, "INVOICE"),
    eq(documents.isVoided, false),
  ];
  if (effectiveWarehouseId) {
    repConditions.push(eq(invoiceRequests.warehouseId, effectiveWarehouseId));
  }

  const validReplacementInvoices = await db
    .select({
      id: rectifications.id,
      grossTotal: sql<number>`COALESCE(${rectifications.siiGrossTotal}, ${invoiceRequests.expectedGrossTotal})`,
    })
    .from(rectifications)
    .innerJoin(invoiceRequests, eq(rectifications.invoiceRequestId, invoiceRequests.id))
    .innerJoin(documents, eq(rectifications.replacementInvoiceDocumentId, documents.id))
    .where(and(...repConditions));

  const totalValidGross =
    validOriginalInvoices.reduce((sum, i) => sum + Number(i.grossTotal), 0) +
    validReplacementInvoices.reduce((sum, i) => sum + Number(i.grossTotal), 0);

  const activeInvoiceCount = validOriginalInvoices.length + validReplacementInvoices.length;

  // 2. FACTURACIÓN BRUTA EMITIDA (Gross Issued - including voided)
  const origIssuedConditions = [
    eq(invoiceRequests.status, "COMPLETED"),
    gte(invoiceRequests.completedAt, startDate),
    lte(invoiceRequests.completedAt, endDate),
  ];
  if (effectiveWarehouseId) {
    origIssuedConditions.push(eq(invoiceRequests.warehouseId, effectiveWarehouseId));
  }

  const allOrigCompleted = await db
    .select({
      grossTotal: sql<number>`COALESCE(${invoiceRequests.siiGrossTotal}, ${invoiceRequests.expectedGrossTotal})`,
    })
    .from(invoiceRequests)
    .where(and(...origIssuedConditions));

  const repIssuedConditions = [
    eq(rectifications.status, "COMPLETED"),
    gte(rectifications.completedAt, startDate),
    lte(rectifications.completedAt, endDate),
  ];
  if (effectiveWarehouseId) {
    repIssuedConditions.push(eq(invoiceRequests.warehouseId, effectiveWarehouseId));
  }

  const allRepCompleted = await db
    .select({
      grossTotal: sql<number>`COALESCE(${rectifications.siiGrossTotal}, ${invoiceRequests.expectedGrossTotal})`,
    })
    .from(rectifications)
    .innerJoin(invoiceRequests, eq(rectifications.invoiceRequestId, invoiceRequests.id))
    .where(and(...repIssuedConditions));

  const grossIssued =
    allOrigCompleted.reduce((sum, i) => sum + Number(i.grossTotal), 0) +
    allRepCompleted.reduce((sum, i) => sum + Number(i.grossTotal), 0);

  // 3. NOTAS DE CRÉDITO (Credit Notes in period)
  const cnConditions = [
    gte(creditNotes.issuedAt, startDate),
    lte(creditNotes.issuedAt, endDate),
  ];
  if (effectiveWarehouseId) {
    cnConditions.push(eq(invoiceRequests.warehouseId, effectiveWarehouseId));
  }

  const creditNotesInPeriod = await db
    .select({
      id: creditNotes.id,
      grossTotal: creditNotes.grossTotal,
    })
    .from(creditNotes)
    .innerJoin(invoiceRequests, eq(creditNotes.invoiceRequestId, invoiceRequests.id))
    .where(and(...cnConditions));

  const creditNotesTotal = creditNotesInPeriod.reduce((sum, cn) => sum + Number(cn.grossTotal), 0);
  const creditNotesCount = creditNotesInPeriod.length;

  // 4. NETO ESTIMADO & IVA DÉBITO ESTIMADO (Exact Integer Arithmetic)
  const netEstimated = totalValidGross > 0 ? calculateNetPrice(totalValidGross, DEFAULT_VAT_RATE_PERCENT) : 0;
  const vatEstimated = totalValidGross - netEstimated;

  // 5. TICKET PROMEDIO
  const averageTicket = activeInvoiceCount > 0 ? Math.round(totalValidGross / activeInvoiceCount) : 0;

  // 6. OPERATIONAL METRICS
  const reqConditions = [
    gte(invoiceRequests.createdAt, startDate),
    lte(invoiceRequests.createdAt, endDate),
  ];
  if (effectiveWarehouseId) {
    reqConditions.push(eq(invoiceRequests.warehouseId, effectiveWarehouseId));
  }

  const periodRequests = await db
    .select({
      status: invoiceRequests.status,
      createdAt: invoiceRequests.createdAt,
      completedAt: invoiceRequests.completedAt,
    })
    .from(invoiceRequests)
    .where(and(...reqConditions));

  let pending = 0;
  let inProgress = 0;
  let needsCorrection = 0;
  let completed = 0;
  let cancelled = 0;
  let totalResolutionMinutes = 0;
  let completedForResolution = 0;

  for (const r of periodRequests) {
    if (r.status === "PENDING") pending++;
    else if (r.status === "IN_PROGRESS") inProgress++;
    else if (r.status === "NEEDS_CORRECTION") needsCorrection++;
    else if (r.status === "COMPLETED") {
      completed++;
      if (r.completedAt) {
        const diffMs = r.completedAt.getTime() - r.createdAt.getTime();
        const diffMin = Math.max(0, Math.round(diffMs / 60000));
        totalResolutionMinutes += diffMin;
        completedForResolution++;
      }
    } else if (r.status === "CANCELLED") cancelled++;
  }

  const averageResolutionMinutes =
    completedForResolution > 0 ? Math.round(totalResolutionMinutes / completedForResolution) : 0;

  // Rectifications operational metrics
  const rectConditions = [
    gte(rectifications.requestedAt, startDate),
    lte(rectifications.requestedAt, endDate),
  ];
  if (effectiveWarehouseId) {
    rectConditions.push(eq(invoiceRequests.warehouseId, effectiveWarehouseId));
  }

  const periodRects = await db
    .select({
      status: rectifications.status,
    })
    .from(rectifications)
    .innerJoin(invoiceRequests, eq(rectifications.invoiceRequestId, invoiceRequests.id))
    .where(and(...rectConditions));

  const changesRequested = periodRects.length;
  const changesCompleted = periodRects.filter((r) => r.status === "COMPLETED").length;

  const period: StatisticsPeriod = {
    month,
    year,
    label,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };

  return {
    period,
    grossIssued,
    creditNotesTotal,
    creditNotesCount,
    grossTotal: totalValidGross,
    netEstimated,
    vatEstimated,
    invoiceCount: activeInvoiceCount,
    averageTicket,
    operational: {
      totalRequests: periodRequests.length,
      pending,
      inProgress,
      needsCorrection,
      completed,
      cancelled,
      changesRequested,
      changesCompleted,
      averageResolutionMinutes,
    },
  };
}

export async function getStatisticsByWarehouseService(
  currentUser: SanitizedUser,
  params: StatisticsFilterParams,
  dbOverride?: unknown
): Promise<{
  warehouses: WarehouseStatistics[];
  totalGross: number;
}> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  const effectiveWarehouseId = enforceWarehouseScope(currentUser, params.warehouseId);
  const periodInfo = resolvePeriod(params);
  const { startDate, endDate } = periodInfo;

  // 1. Fetch Warehouses
  const warehouseConditions = [eq(warehouses.active, true)];
  if (effectiveWarehouseId) {
    warehouseConditions.push(eq(warehouses.id, effectiveWarehouseId));
  }

  const allWarehouses = await db
    .select()
    .from(warehouses)
    .where(and(...warehouseConditions))
    .orderBy(asc(warehouses.name));

  // 2. Fetch Valid Original Invoices in period (excluding replacement docs)
  const origConditions = [
    eq(documents.documentType, "INVOICE"),
    eq(documents.isVoided, false),
    isNull(rectifications.id),
    eq(invoiceRequests.status, "COMPLETED"),
    gte(invoiceRequests.completedAt, startDate),
    lte(invoiceRequests.completedAt, endDate),
  ];
  if (effectiveWarehouseId) {
    origConditions.push(eq(invoiceRequests.warehouseId, effectiveWarehouseId));
  }

  const validOriginals = await db
    .select({
      warehouseId: invoiceRequests.warehouseId,
      grossTotal: sql<number>`COALESCE(${invoiceRequests.siiGrossTotal}, ${invoiceRequests.expectedGrossTotal})`,
    })
    .from(documents)
    .innerJoin(invoiceRequests, eq(documents.invoiceRequestId, invoiceRequests.id))
    .leftJoin(rectifications, eq(rectifications.replacementInvoiceDocumentId, documents.id))
    .where(and(...origConditions));

  // 3. Fetch Valid Replacement Invoices in period
  const repConditions = [
    eq(rectifications.status, "COMPLETED"),
    gte(rectifications.completedAt, startDate),
    lte(rectifications.completedAt, endDate),
    eq(documents.documentType, "INVOICE"),
    eq(documents.isVoided, false),
  ];
  if (effectiveWarehouseId) {
    repConditions.push(eq(invoiceRequests.warehouseId, effectiveWarehouseId));
  }

  const validReplacements = await db
    .select({
      warehouseId: invoiceRequests.warehouseId,
      grossTotal: sql<number>`COALESCE(${rectifications.siiGrossTotal}, ${invoiceRequests.expectedGrossTotal})`,
    })
    .from(rectifications)
    .innerJoin(invoiceRequests, eq(rectifications.invoiceRequestId, invoiceRequests.id))
    .innerJoin(documents, eq(rectifications.replacementInvoiceDocumentId, documents.id))
    .where(and(...repConditions));

  // Group by warehouse
  const totalsByWh: Record<string, { grossTotal: number; count: number }> = {};

  for (const inv of validOriginals) {
    const whId = inv.warehouseId;
    if (!totalsByWh[whId]) totalsByWh[whId] = { grossTotal: 0, count: 0 };
    totalsByWh[whId].grossTotal += Number(inv.grossTotal);
    totalsByWh[whId].count += 1;
  }

  for (const inv of validReplacements) {
    const whId = inv.warehouseId;
    if (!totalsByWh[whId]) totalsByWh[whId] = { grossTotal: 0, count: 0 };
    totalsByWh[whId].grossTotal += Number(inv.grossTotal);
    totalsByWh[whId].count += 1;
  }

  const overallGross = Object.values(totalsByWh).reduce((sum, item) => sum + item.grossTotal, 0);

  const warehouseStats: WarehouseStatistics[] = allWarehouses.map((w) => {
    const whData = totalsByWh[w.id] || { grossTotal: 0, count: 0 };
    const grossTotal = whData.grossTotal;
    const invoiceCount = whData.count;
    const netEstimated = grossTotal > 0 ? calculateNetPrice(grossTotal, DEFAULT_VAT_RATE_PERCENT) : 0;
    const vatEstimated = grossTotal - netEstimated;
    const averageTicket = invoiceCount > 0 ? Math.round(grossTotal / invoiceCount) : 0;
    const percentage = overallGross > 0 ? Math.round((grossTotal / overallGross) * 1000) / 10 : 0;

    return {
      warehouseId: w.id,
      warehouseName: w.name,
      warehouseCode: w.code,
      grossTotal,
      netEstimated,
      vatEstimated,
      invoiceCount,
      averageTicket,
      percentage,
    };
  });

  return {
    warehouses: warehouseStats,
    totalGross: overallGross,
  };
}

export async function getMonthlyEvolutionService(
  currentUser: SanitizedUser,
  params: { months?: number; warehouseId?: string },
  dbOverride?: unknown
): Promise<{ history: MonthlyEvolutionItem[] }> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  const effectiveWarehouseId = enforceWarehouseScope(currentUser, params.warehouseId);
  const countMonths = Math.min(24, Math.max(1, params.months || 12));

  const history: MonthlyEvolutionItem[] = [];
  const now = new Date();

  // Iterate backwards from current month
  for (let i = countMonths - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;

    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // Valid Original (excluding replacement docs)
    const origConditions = [
      eq(documents.documentType, "INVOICE"),
      eq(documents.isVoided, false),
      isNull(rectifications.id),
      eq(invoiceRequests.status, "COMPLETED"),
      gte(invoiceRequests.completedAt, startDate),
      lte(invoiceRequests.completedAt, endDate),
    ];
    if (effectiveWarehouseId) {
      origConditions.push(eq(invoiceRequests.warehouseId, effectiveWarehouseId));
    }

    const validOriginals = await db
      .select({
        grossTotal: sql<number>`COALESCE(${invoiceRequests.siiGrossTotal}, ${invoiceRequests.expectedGrossTotal})`,
      })
      .from(documents)
      .innerJoin(invoiceRequests, eq(documents.invoiceRequestId, invoiceRequests.id))
      .leftJoin(rectifications, eq(rectifications.replacementInvoiceDocumentId, documents.id))
      .where(and(...origConditions));

    // Valid Replacement
    const repConditions = [
      eq(rectifications.status, "COMPLETED"),
      gte(rectifications.completedAt, startDate),
      lte(rectifications.completedAt, endDate),
      eq(documents.documentType, "INVOICE"),
      eq(documents.isVoided, false),
    ];
    if (effectiveWarehouseId) {
      repConditions.push(eq(invoiceRequests.warehouseId, effectiveWarehouseId));
    }

    const validReplacements = await db
      .select({
        grossTotal: sql<number>`COALESCE(${rectifications.siiGrossTotal}, ${invoiceRequests.expectedGrossTotal})`,
      })
      .from(rectifications)
      .innerJoin(invoiceRequests, eq(rectifications.invoiceRequestId, invoiceRequests.id))
      .innerJoin(documents, eq(rectifications.replacementInvoiceDocumentId, documents.id))
      .where(and(...repConditions));

    const grossTotal =
      validOriginals.reduce((sum, inv) => sum + Number(inv.grossTotal), 0) +
      validReplacements.reduce((sum, inv) => sum + Number(inv.grossTotal), 0);

    const invoiceCount = validOriginals.length + validReplacements.length;
    const netEstimated = grossTotal > 0 ? calculateNetPrice(grossTotal, DEFAULT_VAT_RATE_PERCENT) : 0;
    const vatEstimated = grossTotal - netEstimated;

    // Credit Notes in that month
    const cnConditions = [
      gte(creditNotes.issuedAt, startDate),
      lte(creditNotes.issuedAt, endDate),
    ];
    if (effectiveWarehouseId) {
      cnConditions.push(eq(invoiceRequests.warehouseId, effectiveWarehouseId));
    }

    const cns = await db
      .select({ grossTotal: creditNotes.grossTotal })
      .from(creditNotes)
      .innerJoin(invoiceRequests, eq(creditNotes.invoiceRequestId, invoiceRequests.id))
      .where(and(...cnConditions));

    const creditNotesTotal = cns.reduce((sum, cn) => sum + Number(cn.grossTotal), 0);

    const monthPadded = String(month).padStart(2, "0");
    const period = `${year}-${monthPadded}`;
    const label = `${MONTH_SHORT[month - 1]} ${year}`;

    history.push({
      period,
      label,
      year,
      month,
      grossTotal,
      netEstimated,
      vatEstimated,
      creditNotesTotal,
      invoiceCount,
    });
  }

  return { history };
}

/**
 * QA-012: Operational statistics per billing executor.
 * Strictly restricted to ADMIN and MANAGEMENT roles.
 */
export async function getExecutorStatisticsService(
  currentUser: SanitizedUser,
  params: StatisticsFilterParams = {},
  dbOverride?: unknown
): Promise<ExecutorStatisticsResponse> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  // Strict server-side RBAC: Only ADMIN and MANAGEMENT can view executor performance metrics
  if (currentUser.role !== "ADMIN" && currentUser.role !== "MANAGEMENT") {
    throw new Error("FORBIDDEN: Solo Administradores y Jefatura tienen acceso a las estadísticas de ejecutores.");
  }

  const { year: currentChileYear, month: currentChileMonth } = getChileCurrentYearMonth();
  const filterYear = params.year || currentChileYear;
  const filterMonth = params.month || currentChileMonth;

  const { startOfMonth: periodStart, endOfMonth: periodEnd } = getChileMonthBounds(filterYear, filterMonth);
  const { startOfMonth: currentMonthStart } = getChileMonthBounds(currentChileYear, currentChileMonth);

  // Period descriptor
  const period: StatisticsPeriod = {
    year: filterYear,
    month: filterMonth,
    label: `${MONTH_NAMES[filterMonth - 1] || "Mes"} ${filterYear}`,
    startDate: periodStart.toISOString(),
    endDate: periodEnd.toISOString(),
  };

  // Get all active executors (users with role INVOICE_EXECUTOR, or any user who has completed invoices)
  const allExecutors = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.role, "INVOICE_EXECUTOR"))
    .orderBy(asc(users.name));

  const executorList: ExecutorPerformanceItem[] = [];

  for (const exec of allExecutors) {
    // 1. Invoices in selected period
    // Regular invoices completed by executor
    const [periodRegularRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoiceRequests)
      .where(
        and(
          eq(invoiceRequests.assignedTo, exec.id),
          eq(invoiceRequests.status, "COMPLETED"),
          gte(invoiceRequests.completedAt, periodStart),
          lte(invoiceRequests.completedAt, periodEnd)
        )
      );

    // Replacement invoices completed by executor
    const [periodReplacementsRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(rectifications)
      .where(
        and(
          eq(rectifications.assignedTo, exec.id),
          eq(rectifications.status, "COMPLETED"),
          gte(rectifications.completedAt, periodStart),
          lte(rectifications.completedAt, periodEnd)
        )
      );

    const invoicesThisMonth = (periodRegularRes?.count || 0) + (periodReplacementsRes?.count || 0);

    // 2. Historical Total (all time completed)
    const [totalRegularRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoiceRequests)
      .where(
        and(
          eq(invoiceRequests.assignedTo, exec.id),
          eq(invoiceRequests.status, "COMPLETED")
        )
      );

    const [totalReplacementsRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(rectifications)
      .where(
        and(
          eq(rectifications.assignedTo, exec.id),
          eq(rectifications.status, "COMPLETED")
        )
      );

    const historicalTotal = (totalRegularRes?.count || 0) + (totalReplacementsRes?.count || 0);

    // 3. Historical Monthly Average
    const [minReqDateRes] = await db
      .select({ minDate: sql<Date | null>`min(${invoiceRequests.completedAt})` })
      .from(invoiceRequests)
      .where(
        and(
          eq(invoiceRequests.assignedTo, exec.id),
          eq(invoiceRequests.status, "COMPLETED")
        )
      );

    const [minRectDateRes] = await db
      .select({ minDate: sql<Date | null>`min(${rectifications.completedAt})` })
      .from(rectifications)
      .where(
        and(
          eq(rectifications.assignedTo, exec.id),
          eq(rectifications.status, "COMPLETED")
        )
      );

    const dates: Date[] = [];
    if (minReqDateRes?.minDate) dates.push(new Date(minReqDateRes.minDate));
    if (minRectDateRes?.minDate) dates.push(new Date(minRectDateRes.minDate));

    let historicalMonthlyAverage: number | null = null;

    if (dates.length > 0) {
      const earliestDate = new Date(Math.min(...dates.map((d) => d.getTime())));
      const chileDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
      }).format(earliestDate);
      const [eYear, eMonth] = chileDateStr.split("-").map(Number);

      // Closed months: full months strictly before current calendar month in Chile
      const closedMonthsCount = (currentChileYear - eYear) * 12 + (currentChileMonth - eMonth);

      if (closedMonthsCount > 0) {
        const [closedRegularRes] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(invoiceRequests)
          .where(
            and(
              eq(invoiceRequests.assignedTo, exec.id),
              eq(invoiceRequests.status, "COMPLETED"),
              sql`${invoiceRequests.completedAt} < ${currentMonthStart}`
            )
          );

        const [closedReplacementsRes] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(rectifications)
          .where(
            and(
              eq(rectifications.assignedTo, exec.id),
              eq(rectifications.status, "COMPLETED"),
              sql`${rectifications.completedAt} < ${currentMonthStart}`
            )
          );

        const closedTotal = (closedRegularRes?.count || 0) + (closedReplacementsRes?.count || 0);
        historicalMonthlyAverage = Math.round((closedTotal / closedMonthsCount) * 10) / 10;
      }
    }

    executorList.push({
      executorId: exec.id,
      executorName: exec.name,
      executorEmail: exec.email,
      invoicesThisMonth,
      historicalMonthlyAverage,
      historicalTotal,
      rectificationsCompleted: totalReplacementsRes?.count || 0,
    });
  }

  return {
    period,
    executors: executorList,
  };
}

