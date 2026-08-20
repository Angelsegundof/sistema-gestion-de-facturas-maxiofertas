import { eq, and, sql, desc, asc, count } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  invoiceRequests,
  invoiceRequestItems,
  requestCorrections,
  rectifications,
  warehouses,
  users,
  InvoiceRequest,
  InvoiceRequestItem,
  RequestCorrection,
  RequestCorrectionReason,
  InvoiceRequestStatus,
} from "@/lib/db/schema";
import {
  calculateRequestTotals,
  calculateReconciliation,
  ReconciliationResult,
} from "@/domain/pricing";
import { formatRut, normalizeRut, validateRut } from "@/lib/validation/rut";
import { logAuditEvent } from "@/lib/auth/audit";
import {
  AgeIndicator,
  AgeCategory,
  QueueSummaryCounters,
  SanitizedInvoiceRequest,
  SanitizedInvoiceRequestItem,
  SanitizedRequestCorrection,
  SanitizedUser,
} from "@/domain/types";

export function computeAgeIndicator(createdAt: Date | string): AgeIndicator {
  const createdDate = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - createdDate.getTime());
  const minutesElapsed = Math.floor(diffMs / (60 * 1000));

  let displayAge: string;
  let category: AgeCategory;

  if (minutesElapsed < 30) {
    displayAge = `${minutesElapsed} min`;
    category = "under_30m";
  } else if (minutesElapsed < 60) {
    displayAge = `${minutesElapsed} min`;
    category = "30_60m";
  } else {
    const hours = Math.floor(minutesElapsed / 60);
    const remainingMins = minutesElapsed % 60;
    displayAge = remainingMins > 0 ? `${hours} h ${remainingMins} min` : `${hours} h`;
    category = hours >= 2 ? "over_2h" : "1_2h";
  }

  return {
    minutesElapsed,
    displayAge,
    category,
  };
}

export async function getQueueCountersService(): Promise<QueueSummaryCounters> {
  const db = getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [pendingRes] = await db
    .select({ count: count() })
    .from(invoiceRequests)
    .where(eq(invoiceRequests.status, "PENDING"));

  const [inProgressRes] = await db
    .select({ count: count() })
    .from(invoiceRequests)
    .where(eq(invoiceRequests.status, "IN_PROGRESS"));

  const [needsCorrectionRes] = await db
    .select({ count: count() })
    .from(invoiceRequests)
    .where(eq(invoiceRequests.status, "NEEDS_CORRECTION"));

  const [completedTodayRes] = await db
    .select({ count: count() })
    .from(invoiceRequests)
    .where(
      and(
        eq(invoiceRequests.status, "COMPLETED"),
        sql`${invoiceRequests.completedAt} >= ${todayStart}`
      )
    );

  const [changesRequestedRes] = await db
    .select({ count: count() })
    .from(rectifications)
    .where(
      sql`${rectifications.status} IN ('REQUESTED', 'IN_PROGRESS', 'CREDIT_NOTE_REGISTERED', 'NEW_INVOICE_PENDING')`
    );

  return {
    pendingCount: pendingRes?.count || 0,
    inProgressCount: inProgressRes?.count || 0,
    needsCorrectionCount: needsCorrectionRes?.count || 0,
    changesRequestedCount: changesRequestedRes?.count || 0,
    completedTodayCount: completedTodayRes?.count || 0,
  };
}

export async function getQueueRequestsService(params: {
  status?: InvoiceRequestStatus;
  warehouseId?: string;
  assignedTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ requests: SanitizedInvoiceRequest[]; total: number; page: number; pageSize: number }> {
  const db = getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  const status = params.status || "PENDING";
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 25));
  const offset = (page - 1) * pageSize;

  const conditions = [eq(invoiceRequests.status, status)];

  if (params.warehouseId) {
    conditions.push(eq(invoiceRequests.warehouseId, params.warehouseId));
  }

  if (params.assignedTo) {
    conditions.push(eq(invoiceRequests.assignedTo, params.assignedTo));
  }

  if (params.search && params.search.trim()) {
    const term = `%${params.search.trim().toLowerCase()}%`;
    conditions.push(
      sql`(
        LOWER(${invoiceRequests.requestNumber}) LIKE ${term} OR
        LOWER(${invoiceRequests.customerRutSnapshot}) LIKE ${term} OR
        LOWER(${invoiceRequests.customerLegalNameSnapshot}) LIKE ${term}
      )`
    );
  }

  // Priority Rule: PENDING queue MUST be ordered created_at ASC (Oldest first)
  const orderClauses =
    status === "PENDING"
      ? [asc(invoiceRequests.createdAt), asc(invoiceRequests.id)]
      : [desc(invoiceRequests.createdAt), asc(invoiceRequests.id)];

  const [totalRes] = await db
    .select({ count: count() })
    .from(invoiceRequests)
    .where(and(...conditions));

  const rows = await db
    .select({
      request: invoiceRequests,
      warehouseName: warehouses.name,
      warehouseCode: warehouses.code,
      requesterName: users.name,
    })
    .from(invoiceRequests)
    .leftJoin(warehouses, eq(invoiceRequests.warehouseId, warehouses.id))
    .leftJoin(users, eq(invoiceRequests.requestedBy, users.id))
    .where(and(...conditions))
    .orderBy(...orderClauses)
    .limit(pageSize)
    .offset(offset);

  const requests: SanitizedInvoiceRequest[] = rows.map((r) => {
    const req = r.request;
    const sanitized = sanitizeQueueInvoiceRequest(req);
    sanitized.requesterName = r.requesterName || "Solicitante";
    if (r.warehouseName && r.warehouseCode) {
      sanitized.warehouse = {
        id: req.warehouseId,
        name: r.warehouseName,
        code: r.warehouseCode,
        active: true,
        createdAt: req.createdAt.toISOString(),
        updatedAt: req.updatedAt.toISOString(),
      };
    }
    return sanitized;
  });

  return {
    requests,
    total: totalRes?.count || 0,
    page,
    pageSize,
  };
}

export async function claimInvoiceRequestService(
  currentUser: SanitizedUser,
  requestId: string,
  ipAddress?: string
): Promise<SanitizedInvoiceRequest> {
  const db = getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  if (currentUser.role !== "INVOICE_EXECUTOR" && currentUser.role !== "ADMIN") {
    throw new Error("FORBIDDEN: No tienes permisos para tomar solicitudes de facturaci?n.");
  }

  // Atomic claim: Only exactly 1 winner will get rows affected = 1
  const updatedList: InvoiceRequest[] = await db
    .update(invoiceRequests)
    .set({
      status: "IN_PROGRESS",
      assignedTo: currentUser.id,
      assignedAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(invoiceRequests.id, requestId),
        eq(invoiceRequests.status, "PENDING"),
        sql`${invoiceRequests.assignedTo} IS NULL`
      )
    )
    .returning();

  if (updatedList.length === 0) {
    // Determine exact reason for conflict
    const existingReq = await db
      .select({
        request: invoiceRequests,
        assignedUserName: users.name,
      })
      .from(invoiceRequests)
      .leftJoin(users, eq(invoiceRequests.assignedTo, users.id))
      .where(eq(invoiceRequests.id, requestId))
      .limit(1);

    if (existingReq.length === 0) {
      throw new Error("NOT_FOUND: La solicitud especificada no existe.");
    }

    const current = existingReq[0];
    if (current.request.status !== "PENDING") {
      throw new Error(
        `REQUEST_NOT_PENDING: La solicitud ${current.request.requestNumber} ya no est? pendiente (estado actual: ${current.request.status}).`
      );
    }

    const assignedToName = current.assignedUserName || "otro ejecutor";
    throw new Error(
      `REQUEST_ALREADY_CLAIMED: Esta solicitud ya est? siendo gestionada por ${assignedToName}.`
    );
  }

  const claimed = updatedList[0];

  await logAuditEvent({
    userId: currentUser.id,
    action: "REQUEST_ASSIGNED",
    entityType: "invoice_requests",
    entityId: claimed.id,
    metadata: {
      requestNumber: claimed.requestNumber,
      assignedTo: currentUser.id,
      executorName: currentUser.name,
    },
    ipAddress,
  });

  const itemsList = await db
    .select()
    .from(invoiceRequestItems)
    .where(eq(invoiceRequestItems.invoiceRequestId, claimed.id))
    .orderBy(invoiceRequestItems.lineNumber);

  return sanitizeQueueInvoiceRequest(claimed, itemsList);
}

export async function requestCorrectionService(
  currentUser: SanitizedUser,
  requestId: string,
  input: {
    reason: RequestCorrectionReason;
    comment?: string | null;
  },
  ipAddress?: string
): Promise<SanitizedInvoiceRequest> {
  const db = getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  if (currentUser.role !== "INVOICE_EXECUTOR" && currentUser.role !== "ADMIN") {
    throw new Error("FORBIDDEN: No tienes permisos para observar solicitudes.");
  }

  const existingReqList: InvoiceRequest[] = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, requestId))
    .limit(1);

  if (existingReqList.length === 0) {
    throw new Error("NOT_FOUND: La solicitud no existe.");
  }

  const targetReq = existingReqList[0];

  if (targetReq.status !== "IN_PROGRESS") {
    throw new Error("INVALID_STATE: Solo una solicitud en proceso puede ser enviada a correcci?n.");
  }

  // IDOR Protection: Executor can only observe requests assigned to themselves (unless ADMIN)
  if (currentUser.role === "INVOICE_EXECUTOR" && targetReq.assignedTo !== currentUser.id) {
    throw new Error("FORBIDDEN: No puedes observar una solicitud asignada a otro ejecutor.");
  }

  if (input.reason === "OTHER" && (!input.comment || !input.comment.trim())) {
    throw new Error("VALIDATION_ERROR: El comentario es obligatorio cuando el motivo es 'Otro'.");
  }

  // Release assignment and transition to NEEDS_CORRECTION
  const updatedReqList: InvoiceRequest[] = await db
    .update(invoiceRequests)
    .set({
      status: "NEEDS_CORRECTION",
      assignedTo: null,
      assignedAt: null,
      updatedAt: sql`NOW()`,
    })
    .where(eq(invoiceRequests.id, requestId))
    .returning();

  const updatedReq = updatedReqList[0];

  // Insert structured correction history
  await db.insert(requestCorrections).values({
    invoiceRequestId: requestId,
    reason: input.reason,
    comment: input.comment ? input.comment.trim() : null,
    requestedBy: currentUser.id,
  });

  await logAuditEvent({
    userId: currentUser.id,
    action: "REQUEST_CORRECTION_REQUESTED",
    entityType: "invoice_requests",
    entityId: updatedReq.id,
    metadata: {
      requestNumber: updatedReq.requestNumber,
      reason: input.reason,
      comment: input.comment,
    },
    ipAddress,
  });

  return sanitizeQueueInvoiceRequest(updatedReq);
}

export interface CorrectInvoiceRequestInput {
  customer: {
    rut: string;
    legalName: string;
    businessActivity: string;
    phone?: string | null;
    email?: string | null;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPriceGross: number;
  }>;
  notes?: string | null;
}

export async function correctAndResubmitService(
  currentUser: SanitizedUser,
  requestId: string,
  input: CorrectInvoiceRequestInput,
  ipAddress?: string
): Promise<SanitizedInvoiceRequest> {
  const db = getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  const existingReqList: InvoiceRequest[] = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, requestId))
    .limit(1);

  if (existingReqList.length === 0) {
    throw new Error("NOT_FOUND: La solicitud no existe.");
  }

  const targetReq = existingReqList[0];

  if (targetReq.status !== "NEEDS_CORRECTION") {
    throw new Error("INVALID_STATE: La solicitud no se encuentra en estado de correcci?n.");
  }

  // IDOR Protection: Warehouse user can ONLY correct their own requests (unless ADMIN)
  if (currentUser.role === "WAREHOUSE_USER" && targetReq.requestedBy !== currentUser.id) {
    throw new Error("FORBIDDEN: No tienes permisos para modificar esta solicitud.");
  }

  // Validate RUT & customer fields
  const rawRut = input.customer.rut.trim();
  if (!validateRut(rawRut)) {
    throw new Error("INVALID_RUT: El RUT ingresado no es v?lido.");
  }

  const displayRut = formatRut(rawRut);
  const normalizedEmail = input.customer.email ? input.customer.email.trim().toLowerCase() : null;
  const normalizedPhone = input.customer.phone ? input.customer.phone.trim() : null;

  // Recalculate items and totals deterministically
  const calculatedTotals = calculateRequestTotals(input.items);

  // Update request snapshot fields and return to PENDING
  const updatedReqList: InvoiceRequest[] = await db
    .update(invoiceRequests)
    .set({
      customerRutSnapshot: displayRut,
      customerLegalNameSnapshot: input.customer.legalName.trim(),
      customerBusinessActivitySnapshot: input.customer.businessActivity.trim(),
      customerPhoneSnapshot: normalizedPhone,
      customerEmailSnapshot: normalizedEmail,
      expectedGrossTotal: calculatedTotals.expectedGrossTotal,
      notes: input.notes ? input.notes.trim() : null,
      status: "PENDING",
      assignedTo: null,
      assignedAt: null,
      updatedAt: sql`NOW()`,
    })
    .where(eq(invoiceRequests.id, requestId))
    .returning();

  const updatedReq = updatedReqList[0];

  // Replace structured items
  await db
    .delete(invoiceRequestItems)
    .where(eq(invoiceRequestItems.invoiceRequestId, requestId));

  const itemsToInsert = calculatedTotals.items.map((item) => ({
    invoiceRequestId: requestId,
    lineNumber: item.lineNumber,
    description: item.description,
    quantity: item.quantity,
    unitPriceGross: item.unitPriceGross,
    unitPriceNet: item.unitPriceNet,
    lineTotalGross: item.lineTotalGross,
    lineTotalNet: item.lineTotalNet,
    vatRate: item.vatRate.toFixed(2),
  }));

  const insertedItems: InvoiceRequestItem[] = await db
    .insert(invoiceRequestItems)
    .values(itemsToInsert)
    .returning();

  // Mark latest correction as resolved
  await db
    .update(requestCorrections)
    .set({
      resolvedBy: currentUser.id,
      resolvedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(requestCorrections.invoiceRequestId, requestId),
        sql`${requestCorrections.resolvedAt} IS NULL`
      )
    );

  await logAuditEvent({
    userId: currentUser.id,
    action: "REQUEST_RESUBMITTED",
    entityType: "invoice_requests",
    entityId: updatedReq.id,
    metadata: {
      requestNumber: updatedReq.requestNumber,
      expectedGrossTotal: updatedReq.expectedGrossTotal,
      itemsCount: insertedItems.length,
    },
    ipAddress,
  });

  return sanitizeQueueInvoiceRequest(updatedReq, insertedItems);
}

export async function reassignInvoiceRequestService(
  currentUser: SanitizedUser,
  requestId: string,
  input: { assignedTo: string; reason: string },
  ipAddress?: string
): Promise<SanitizedInvoiceRequest> {
  const db = getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  if (currentUser.role !== "ADMIN") {
    throw new Error("FORBIDDEN: Solo administradores pueden reasignar solicitudes.");
  }

  const targetUser = await db
    .select()
    .from(users)
    .where(and(eq(users.id, input.assignedTo), eq(users.active, true)))
    .limit(1);

  if (targetUser.length === 0) {
    throw new Error("NOT_FOUND: El usuario ejecutor destino no existe o est? inactivo.");
  }

  const updatedReqList: InvoiceRequest[] = await db
    .update(invoiceRequests)
    .set({
      assignedTo: input.assignedTo,
      assignedAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(eq(invoiceRequests.id, requestId))
    .returning();

  if (updatedReqList.length === 0) {
    throw new Error("NOT_FOUND: La solicitud no existe.");
  }

  const updatedReq = updatedReqList[0];

  await logAuditEvent({
    userId: currentUser.id,
    action: "REQUEST_REASSIGNED",
    entityType: "invoice_requests",
    entityId: updatedReq.id,
    metadata: {
      requestNumber: updatedReq.requestNumber,
      newAssignedTo: input.assignedTo,
      reason: input.reason,
    },
    ipAddress,
  });

  return sanitizeQueueInvoiceRequest(updatedReq);
}

export interface ReconcileInvoiceRequestInput {
  siiGrossTotal: number;
}

export async function reconcileInvoiceRequestService(
  currentUser: SanitizedUser,
  requestId: string,
  input: ReconcileInvoiceRequestInput,
  ipAddress?: string
): Promise<{
  request: SanitizedInvoiceRequest;
  reconciliation: ReconciliationResult;
}> {
  const db = getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  if (currentUser.role !== "INVOICE_EXECUTOR" && currentUser.role !== "ADMIN") {
    throw new Error("FORBIDDEN: No tienes permisos para conciliar montos del SII.");
  }

  if (!Number.isInteger(input.siiGrossTotal) || input.siiGrossTotal <= 0) {
    throw new Error("VALIDATION_ERROR: El monto del SII debe ser un entero positivo.");
  }

  const existingReqList: InvoiceRequest[] = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, requestId))
    .limit(1);

  if (existingReqList.length === 0) {
    throw new Error("NOT_FOUND: La solicitud no existe.");
  }

  const targetReq = existingReqList[0];

  if (targetReq.status !== "IN_PROGRESS") {
    throw new Error("INVALID_STATE: Solo una solicitud en proceso puede ser conciliada con el SII.");
  }

  // IDOR / Ownership Protection: Executor can only reconcile requests assigned to themselves (unless ADMIN)
  if (currentUser.role === "INVOICE_EXECUTOR" && targetReq.assignedTo !== currentUser.id) {
    throw new Error("FORBIDDEN: No puedes conciliar una solicitud asignada a otro ejecutor.");
  }

  // Calculate reconciliation deterministically
  const reconciliation = calculateReconciliation(
    targetReq.expectedGrossTotal,
    input.siiGrossTotal
  );

  // Persist reconciliation state in PostgreSQL
  const updatedList: InvoiceRequest[] = await db
    .update(invoiceRequests)
    .set({
      siiGrossTotal: reconciliation.siiGrossTotal,
      grossDifference: reconciliation.grossDifference,
      reconciliationStatus: reconciliation.status,
      updatedAt: sql`NOW()`,
    })
    .where(eq(invoiceRequests.id, requestId))
    .returning();

  const updatedReq = updatedList[0];

  const itemsList = await db
    .select()
    .from(invoiceRequestItems)
    .where(eq(invoiceRequestItems.invoiceRequestId, targetReq.id))
    .orderBy(invoiceRequestItems.lineNumber);

  await logAuditEvent({
    userId: currentUser.id,
    action: "REQUEST_RECONCILED",
    entityType: "invoice_requests",
    entityId: updatedReq.id,
    metadata: {
      requestNumber: updatedReq.requestNumber,
      expectedGrossTotal: reconciliation.expectedGrossTotal,
      siiGrossTotal: reconciliation.siiGrossTotal,
      grossDifference: reconciliation.grossDifference,
      reconciliationStatus: reconciliation.status,
      canProceed: reconciliation.canProceed,
    },
    ipAddress,
  });

  return {
    request: sanitizeQueueInvoiceRequest(updatedReq, itemsList),
    reconciliation,
  };
}

export function sanitizeQueueInvoiceRequest(
  r: InvoiceRequest,
  items?: InvoiceRequestItem[],
  corrections?: RequestCorrection[]
): SanitizedInvoiceRequest {
  const sanitizedItems: SanitizedInvoiceRequestItem[] = (items || []).map((i) => ({
    id: i.id,
    invoiceRequestId: i.invoiceRequestId,
    lineNumber: i.lineNumber,
    description: i.description,
    quantity: i.quantity,
    unitPriceGross: i.unitPriceGross,
    unitPriceNet: i.unitPriceNet,
    lineTotalGross: i.lineTotalGross,
    lineTotalNet: i.lineTotalNet,
    vatRate: i.vatRate,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }));

  const sanitizedCorrections: SanitizedRequestCorrection[] = (corrections || []).map((c) => ({
    id: c.id,
    invoiceRequestId: c.invoiceRequestId,
    reason: c.reason,
    comment: c.comment,
    requestedBy: c.requestedBy,
    resolvedBy: c.resolvedBy,
    createdAt: c.createdAt.toISOString(),
    resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
  }));

  return {
    id: r.id,
    requestNumber: r.requestNumber,
    warehouseId: r.warehouseId,
    customerId: r.customerId,
    requestedBy: r.requestedBy,
    assignedTo: r.assignedTo,
    status: r.status,
    customerRutSnapshot: r.customerRutSnapshot,
    customerLegalNameSnapshot: r.customerLegalNameSnapshot,
    customerBusinessActivitySnapshot: r.customerBusinessActivitySnapshot,
    customerPhoneSnapshot: r.customerPhoneSnapshot,
    customerEmailSnapshot: r.customerEmailSnapshot,
    expectedGrossTotal: r.expectedGrossTotal,
    siiGrossTotal: r.siiGrossTotal,
    grossDifference: r.grossDifference,
    reconciliationStatus: r.reconciliationStatus,
    notes: r.notes,
    duplicateWarning: r.duplicateWarning,
    duplicateOverride: r.duplicateOverride,
    duplicateOf: r.duplicateOf,
    source: r.source,
    idempotencyKey: r.idempotencyKey,
    createdAt: r.createdAt.toISOString(),
    assignedAt: r.assignedAt ? r.assignedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    updatedAt: r.updatedAt.toISOString(),
    age: computeAgeIndicator(r.createdAt),
    items: sanitizedItems,
    corrections: sanitizedCorrections,
  };
}
