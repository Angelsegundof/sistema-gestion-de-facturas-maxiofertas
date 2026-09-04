import { eq, and, gte, ne, sql, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  invoiceRequests,
  invoiceRequestItems,
  customers,
  warehouses,
  InvoiceRequest,
  InvoiceRequestItem,
  Customer,
} from "@/lib/db/schema";
import { calculateRequestTotals } from "@/domain/pricing";
import { formatRut, normalizeRut, validateRut } from "@/lib/validation/rut";
import { logAuditEvent } from "@/lib/auth/audit";
import { hasPermission } from "@/domain/permissions";
import {
  DuplicateCandidate,
  SanitizedInvoiceRequest,
  SanitizedInvoiceRequestItem,
  SanitizedUser,
} from "@/domain/types";

export interface CreateInvoiceRequestInput {
  customer: {
    rut: string;
    legalName: string;
    businessActivity: string;
    phone?: string | null;
    email?: string | null;
  };
  warehouseId?: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceGross: number;
  }>;
  notes?: string | null;
  duplicateOverride?: boolean;
}

export async function generateRequestNumber(db: unknown): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `FAC-${year}-`;

  try {
    const seqResult = await (db as { execute: (q: unknown) => Promise<{ rows?: Array<{ seq?: unknown }> }> }).execute(
      sql`SELECT nextval('invoice_request_seq') as seq;`
    );
    const seqVal = seqResult?.rows?.[0]?.seq;
    if (seqVal !== undefined && seqVal !== null) {
      const num = Number(seqVal);
      return `${prefix}${num.toString().padStart(6, "0")}`;
    }
  } catch {
    // Fallback using count of current year
  }

  const countResult = await (db as NonNullable<ReturnType<typeof getDb>>)
    .select({ count: sql<number>`count(*)::int` })
    .from(invoiceRequests)
    .where(sql`${invoiceRequests.requestNumber} LIKE ${prefix + "%"}`);

  const nextCount = (countResult[0]?.count || 0) + 1;
  return `${prefix}${nextCount.toString().padStart(6, "0")}`;
}

export async function findDuplicateCandidate(
  db: unknown,
  params: {
    canonicalRut: string;
    warehouseId: string;
    expectedGrossTotal: number;
    windowHours?: number;
  }
): Promise<DuplicateCandidate | null> {
  const windowHours = params.windowHours || 24;
  const since = new Date(Date.now() - windowHours * 3600 * 1000);

  const candidates: InvoiceRequest[] = await (db as NonNullable<ReturnType<typeof getDb>>)
    .select()
    .from(invoiceRequests)
    .where(
      and(
        sql`REPLACE(REPLACE(REPLACE(UPPER(${invoiceRequests.customerRutSnapshot}), '.', ''), '-', ''), ' ', '') = ${params.canonicalRut}`,
        eq(invoiceRequests.warehouseId, params.warehouseId),
        eq(invoiceRequests.expectedGrossTotal, params.expectedGrossTotal),
        ne(invoiceRequests.status, "CANCELLED"),
        gte(invoiceRequests.createdAt, since)
      )
    )
    .orderBy(desc(invoiceRequests.createdAt))
    .limit(1);

  if (candidates.length === 0) {
    return null;
  }

  const c = candidates[0];
  return {
    id: c.id,
    requestNumber: c.requestNumber,
    createdAt: c.createdAt.toISOString(),
    grossTotal: c.expectedGrossTotal,
    status: c.status,
    customerLegalName: c.customerLegalNameSnapshot,
    customerRut: c.customerRutSnapshot,
  };
}

export async function createInvoiceRequestService(
  currentUser: SanitizedUser,
  input: CreateInvoiceRequestInput,
  options: {
    ipAddress?: string;
    idempotencyKey?: string | null;
  } = {}
): Promise<
  | { success: true; request: SanitizedInvoiceRequest }
  | { success: false; duplicateCandidate: DuplicateCandidate }
> {
  const db = getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  // 1. Resolver Bodega autorizada server-side
  let targetWarehouseId = currentUser.warehouseId;
  if (currentUser.role === "ADMIN" && input.warehouseId) {
    targetWarehouseId = input.warehouseId;
  }

  if (!targetWarehouseId) {
    throw new Error("El usuario no tiene una bodega asignada para emitir solicitudes.");
  }

  const warehouseCheck = await db
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.id, targetWarehouseId), eq(warehouses.active, true)))
    .limit(1);

  if (warehouseCheck.length === 0) {
    throw new Error("La bodega seleccionada no existe o se encuentra inactiva.");
  }

  // 2. Validar y normalizar RUT del cliente
  const rawRut = input.customer.rut.trim();
  if (!validateRut(rawRut)) {
    throw new Error("El RUT del cliente no es válido según el algoritmo módulo 11.");
  }

  const canonicalRut = normalizeRut(rawRut);
  const displayRut = formatRut(rawRut);
  const normalizedEmail = input.customer.email ? input.customer.email.trim().toLowerCase() : null;
  const normalizedPhone = input.customer.phone ? input.customer.phone.trim() : null;

  // 3. Calcular precios y totales de forma determin?stica
  const calculatedTotals = calculateRequestTotals(input.items);

  // 4. Idempotency Check (Aislado estrictamente por usuario)
  if (options.idempotencyKey) {
    const existingReqList: InvoiceRequest[] = await db
      .select()
      .from(invoiceRequests)
      .where(
        and(
          eq(invoiceRequests.requestedBy, currentUser.id),
          eq(invoiceRequests.idempotencyKey, options.idempotencyKey)
        )
      )
      .limit(1);

    if (existingReqList.length > 0) {
      const existing = existingReqList[0];

      // Validar coincidencia de payload
      const existingCanonicalRut = normalizeRut(existing.customerRutSnapshot);
      const isPayloadMatching =
        existingCanonicalRut === canonicalRut &&
        existing.expectedGrossTotal === calculatedTotals.expectedGrossTotal &&
        existing.warehouseId === targetWarehouseId;

      if (!isPayloadMatching) {
        throw new Error(
          `IDEMPOTENCY_PAYLOAD_MISMATCH: La clave de idempotencia '${options.idempotencyKey}' ya fue utilizada con datos de solicitud diferentes.`
        );
      }

      const itemsList: InvoiceRequestItem[] = await db
        .select()
        .from(invoiceRequestItems)
        .where(eq(invoiceRequestItems.invoiceRequestId, existing.id))
        .orderBy(invoiceRequestItems.lineNumber);

      return {
        success: true,
        request: sanitizeInvoiceRequest(existing, itemsList),
      };
    }
  }

  // 5. Detecci?n de duplicados
  const candidate = await findDuplicateCandidate(db, {
    canonicalRut,
    warehouseId: targetWarehouseId,
    expectedGrossTotal: calculatedTotals.expectedGrossTotal,
  });

  if (candidate && !input.duplicateOverride) {
    // Registrar advertencia en auditoría
    await logAuditEvent({
      userId: currentUser.id,
      action: "DUPLICATE_WARNING_SHOWN",
      entityType: "invoice_requests",
      entityId: candidate.id,
      metadata: {
        candidateRequestNumber: candidate.requestNumber,
        customerRut: canonicalRut,
        expectedGrossTotal: calculatedTotals.expectedGrossTotal,
      },
      ipAddress: options.ipAddress,
    });

    return {
      success: false,
      duplicateCandidate: candidate,
    };
  }

  // 6. Resolver / Insertar cliente maestro de forma segura (sin sobrescribir)
  let customerId: string;
  const existingCustomer: Customer[] = await db
    .select()
    .from(customers)
    .where(eq(customers.rutCanonical, canonicalRut))
    .limit(1);

  if (existingCustomer.length > 0) {
    customerId = existingCustomer[0].id;
  } else {
    const insertedCustomers: Customer[] = await db
      .insert(customers)
      .values({
        rutCanonical: canonicalRut,
        rutDisplay: displayRut,
        legalName: input.customer.legalName.trim(),
        businessActivity: input.customer.businessActivity.trim(),
        phone: normalizedPhone,
        email: normalizedEmail,
        active: true,
      })
      .onConflictDoNothing({ target: customers.rutCanonical })
      .returning();

    if (insertedCustomers.length > 0) {
      customerId = insertedCustomers[0].id;
    } else {
      const fetched: Customer[] = await db
        .select()
        .from(customers)
        .where(eq(customers.rutCanonical, canonicalRut))
        .limit(1);
      customerId = fetched[0].id;
    }
  }

  // 7. Generar número de solicitud ?nico
  const requestNumber = await generateRequestNumber(db);

  // 8. Insertar solicitud de factura con snapshots inmutables
  const insertedRequests: InvoiceRequest[] = await db
    .insert(invoiceRequests)
    .values({
      requestNumber,
      warehouseId: targetWarehouseId,
      customerId,
      requestedBy: currentUser.id,
      status: "PENDING",
      customerRutSnapshot: displayRut,
      customerLegalNameSnapshot: input.customer.legalName.trim(),
      customerBusinessActivitySnapshot: input.customer.businessActivity.trim(),
      customerPhoneSnapshot: normalizedPhone,
      customerEmailSnapshot: normalizedEmail,
      expectedGrossTotal: calculatedTotals.expectedGrossTotal,
      notes: input.notes ? input.notes.trim() : null,
      duplicateWarning: !!candidate,
      duplicateOverride: !!(candidate && input.duplicateOverride),
      duplicateOf: candidate ? candidate.id : null,
      source: "NATIVE",
      idempotencyKey: options.idempotencyKey || null,
    })
    .returning();

  const newRequest = insertedRequests[0];

  // 9. Insertar líneas estructuradas
  const itemsToInsert = calculatedTotals.items.map((item) => ({
    invoiceRequestId: newRequest.id,
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

  // 10. Auditoría de creación y override
  if (candidate && input.duplicateOverride) {
    await logAuditEvent({
      userId: currentUser.id,
      action: "DUPLICATE_OVERRIDE",
      entityType: "invoice_requests",
      entityId: newRequest.id,
      metadata: {
        requestNumber: newRequest.requestNumber,
        duplicateOf: candidate.id,
        candidateRequestNumber: candidate.requestNumber,
      },
      ipAddress: options.ipAddress,
    });
  }

  await logAuditEvent({
    userId: currentUser.id,
    action: "REQUEST_CREATED",
    entityType: "invoice_requests",
    entityId: newRequest.id,
    metadata: {
      requestNumber: newRequest.requestNumber,
      warehouseId: newRequest.warehouseId,
      expectedGrossTotal: newRequest.expectedGrossTotal,
      itemsCount: insertedItems.length,
      duplicateOverride: newRequest.duplicateOverride,
    },
    ipAddress: options.ipAddress,
  });

  return {
    success: true,
    request: sanitizeInvoiceRequest(newRequest, insertedItems),
  };
}

export interface UpdatePendingInvoiceRequestInput {
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

export async function updatePendingInvoiceRequestService(
  currentUser: SanitizedUser,
  requestId: string,
  input: UpdatePendingInvoiceRequestInput,
  options: {
    ipAddress?: string;
  } = {}
): Promise<SanitizedInvoiceRequest> {
  const db = getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  // 1. Verificar permisos RBAC
  if (!hasPermission(currentUser.role, "REQUEST_EDIT_PENDING")) {
    throw new Error("FORBIDDEN: No tienes permisos para modificar solicitudes de facturación.");
  }

  // 2. Verificar existencia y estado PENDING
  const existingReqList: InvoiceRequest[] = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, requestId))
    .limit(1);

  if (existingReqList.length === 0) {
    throw new Error("NOT_FOUND: La solicitud no existe.");
  }

  const targetReq = existingReqList[0];

  // 2.1 Verificar ownership / IDOR para usuarios de bodega (solicitantes)
  if (currentUser.role === "WAREHOUSE_USER") {
    const isOwner = targetReq.requestedBy === currentUser.id;
    const isSameWarehouse = currentUser.warehouseId && targetReq.warehouseId === currentUser.warehouseId;
    if (!isOwner && !isSameWarehouse) {
      throw new Error("FORBIDDEN: No tienes permisos para modificar solicitudes de otros usuarios o bodegas.");
    }
  }

  if (targetReq.status !== "PENDING") {
    throw new Error(
      "CONFLICT_STATE: Esta solicitud ya comenzó a ser procesada y no puede modificarse. Actualiza la página para continuar."
    );
  }

  // 3. Validar y normalizar RUT del cliente
  const rawRut = input.customer.rut.trim();
  if (!validateRut(rawRut)) {
    throw new Error("VALIDATION_ERROR: El RUT del cliente no es válido según el algoritmo módulo 11.");
  }

  const canonicalRut = normalizeRut(rawRut);
  const displayRut = formatRut(rawRut);
  const normalizedEmail = input.customer.email ? input.customer.email.trim().toLowerCase() : null;
  const normalizedPhone = input.customer.phone ? input.customer.phone.trim() : null;

  // 4. Validar items y calcular precios determinísticamente
  if (!input.items || input.items.length === 0) {
    throw new Error("VALIDATION_ERROR: Debe incluir al menos un producto.");
  }

  for (const it of input.items) {
    if (!it.description || !it.description.trim()) {
      throw new Error("VALIDATION_ERROR: La descripción del producto es obligatoria.");
    }
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
      throw new Error("VALIDATION_ERROR: La cantidad debe ser un entero positivo.");
    }
    if (!Number.isInteger(it.unitPriceGross) || it.unitPriceGross <= 0) {
      throw new Error("VALIDATION_ERROR: El precio unitario bruto debe ser un entero positivo.");
    }
  }

  const calculatedTotals = calculateRequestTotals(input.items);

  // 5. Buscar o crear cliente sin duplicar
  let customerId: string;
  const existingCustomers: Customer[] = await db
    .select()
    .from(customers)
    .where(eq(customers.rutCanonical, canonicalRut))
    .limit(1);

  if (existingCustomers.length > 0) {
    customerId = existingCustomers[0].id;
    // Actualizar datos del cliente si se proporcionan
    await db
      .update(customers)
      .set({
        legalName: input.customer.legalName.trim(),
        businessActivity: input.customer.businessActivity.trim(),
        phone: normalizedPhone || existingCustomers[0].phone,
        email: normalizedEmail || existingCustomers[0].email,
        updatedAt: sql`NOW()`,
      })
      .where(eq(customers.id, customerId));
  } else {
    const insertedCustomers: Customer[] = await db
      .insert(customers)
      .values({
        rutCanonical: canonicalRut,
        rutDisplay: displayRut,
        legalName: input.customer.legalName.trim(),
        businessActivity: input.customer.businessActivity.trim(),
        phone: normalizedPhone,
        email: normalizedEmail,
        active: true,
      })
      .onConflictDoNothing({ target: customers.rutCanonical })
      .returning();

    if (insertedCustomers.length > 0) {
      customerId = insertedCustomers[0].id;
    } else {
      const fetched: Customer[] = await db
        .select()
        .from(customers)
        .where(eq(customers.rutCanonical, canonicalRut))
        .limit(1);
      customerId = fetched[0].id;
    }
  }

  // 6. Actualización atómica server-side (WHERE id = ? AND status = 'PENDING')
  const updatedReqList: InvoiceRequest[] = await db
    .update(invoiceRequests)
    .set({
      customerId,
      customerRutSnapshot: displayRut,
      customerLegalNameSnapshot: input.customer.legalName.trim(),
      customerBusinessActivitySnapshot: input.customer.businessActivity.trim(),
      customerPhoneSnapshot: normalizedPhone,
      customerEmailSnapshot: normalizedEmail,
      expectedGrossTotal: calculatedTotals.expectedGrossTotal,
      notes: input.notes ? input.notes.trim() : null,
      updatedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(invoiceRequests.id, requestId),
        eq(invoiceRequests.status, "PENDING")
      )
    )
    .returning();

  if (updatedReqList.length === 0) {
    throw new Error(
      "CONFLICT_STATE: Esta solicitud ya comenzó a ser procesada y no puede modificarse. Actualiza la página para continuar."
    );
  }

  const updatedReq = updatedReqList[0];

  // 7. Reemplazar líneas estructuradas de productos
  await db
    .delete(invoiceRequestItems)
    .where(eq(invoiceRequestItems.invoiceRequestId, updatedReq.id));

  const itemsToInsert = calculatedTotals.items.map((item) => ({
    invoiceRequestId: updatedReq.id,
    lineNumber: item.lineNumber,
    description: item.description,
    quantity: item.quantity,
    unitPriceGross: item.unitPriceGross,
    unitPriceNet: item.unitPriceNet,
    lineTotalGross: item.lineTotalGross,
    lineTotalNet: item.lineTotalNet,
    vatRate: "19.00",
  }));

  const insertedItems = await db
    .insert(invoiceRequestItems)
    .values(itemsToInsert)
    .returning();

  // 8. Registro de auditoría
  await logAuditEvent({
    userId: currentUser.id,
    action: currentUser.role === "WAREHOUSE_USER" ? "INVOICE_REQUEST_UPDATED_BY_REQUESTER" : "INVOICE_REQUEST_UPDATED_WHILE_PENDING",
    entityType: "invoice_requests",
    entityId: updatedReq.id,
    metadata: {
      requestNumber: updatedReq.requestNumber,
      actorRole: currentUser.role,
      previousGrossTotal: targetReq.expectedGrossTotal,
      newGrossTotal: updatedReq.expectedGrossTotal,
      previousCustomerRut: targetReq.customerRutSnapshot,
      newCustomerRut: displayRut,
      itemsCount: insertedItems.length,
    },
    ipAddress: options.ipAddress,
  });

  return sanitizeInvoiceRequest(updatedReq, insertedItems);
}

export function sanitizeInvoiceRequest(
  r: InvoiceRequest,
  items?: InvoiceRequestItem[]
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
    customerDeliveryStatus: r.customerDeliveryStatus || "PENDING",
    customerSentAt: r.customerSentAt ? r.customerSentAt.toISOString() : null,
    customerSentBy: r.customerSentBy || null,
    items: sanitizedItems,
  };
}
