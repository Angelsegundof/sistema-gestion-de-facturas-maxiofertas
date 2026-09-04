import { eq } from "drizzle-orm";
import { getDb, ensureDbReady } from "@/lib/db";
import { invoiceRequests, InvoiceRequest } from "@/lib/db/schema";
import { SanitizedUser, SanitizedInvoiceRequest, CustomerDeliveryStatus } from "@/domain/types";
import { logAuditEvent } from "@/lib/auth/audit";
import { sanitizeInvoiceRequest } from "@/lib/services/invoice-requests";

export interface UpdateCustomerDeliveryStatusOptions {
  ipAddress?: string;
  userAgent?: string;
  dbOverride?: any;
}

export async function updateCustomerDeliveryStatusService(
  currentUser: SanitizedUser,
  invoiceRequestId: string,
  deliveryStatus: "PENDING" | "SENT",
  options: UpdateCustomerDeliveryStatusOptions = {}
): Promise<SanitizedInvoiceRequest> {
  await ensureDbReady();
  const db = options.dbOverride || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  // 1. Fetch invoice request
  const fetched = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, invoiceRequestId))
    .limit(1);

  if (fetched.length === 0) {
    throw new Error("NOT_FOUND: La solicitud de factura especificada no existe.");
  }

  const targetReq: InvoiceRequest = fetched[0];

  // 2. Validate RBAC and Ownership / Warehouse scope
  if (currentUser.role === "WAREHOUSE_USER") {
    const isOwner = targetReq.requestedBy === currentUser.id;
    const isSameWarehouse = !!currentUser.warehouseId && targetReq.warehouseId === currentUser.warehouseId;
    if (!isOwner && !isSameWarehouse) {
      throw new Error("FORBIDDEN: No tienes permisos para modificar el estado de entrega de esta factura.");
    }
  } else if (currentUser.role === "INVOICE_EXECUTOR") {
    throw new Error("FORBIDDEN: Los ejecutores de facturación no gestionan el estado de entrega al cliente.");
  } else if (currentUser.role !== "ADMIN" && currentUser.role !== "MANAGEMENT") {
    throw new Error("FORBIDDEN: Rol no autorizado.");
  }

  // 3. Validate that the invoice request is COMPLETED
  if (targetReq.status !== "COMPLETED") {
    throw new Error("CONFLICT: La factura debe estar emitida antes de marcarse como enviada al cliente.");
  }

  const currentDeliveryStatus = (targetReq.customerDeliveryStatus as CustomerDeliveryStatus) || "PENDING";

  // 4. Idempotency Check
  if (currentDeliveryStatus === deliveryStatus) {
    return sanitizeInvoiceRequest(targetReq);
  }

  // 5. Update delivery status
  const now = new Date();
  const updateValues =
    deliveryStatus === "SENT"
      ? {
          customerDeliveryStatus: "SENT" as CustomerDeliveryStatus,
          customerSentAt: now,
          customerSentBy: currentUser.id,
          updatedAt: now,
        }
      : {
          customerDeliveryStatus: "PENDING" as CustomerDeliveryStatus,
          customerSentAt: null,
          customerSentBy: null,
          updatedAt: now,
        };

  const updatedRows = await db
    .update(invoiceRequests)
    .set(updateValues)
    .where(eq(invoiceRequests.id, invoiceRequestId))
    .returning();

  const updatedReq = updatedRows[0];

  // 6. Log Audit Event
  const auditAction = deliveryStatus === "SENT" ? "INVOICE_MARKED_AS_SENT" : "INVOICE_MARKED_AS_NOT_SENT";
  await logAuditEvent({
    userId: currentUser.id,
    action: auditAction,
    entityType: "INVOICE_REQUEST",
    entityId: targetReq.id,
    metadata: {
      deliveryFrom: currentDeliveryStatus,
      deliveryTo: deliveryStatus,
      requestNumber: targetReq.requestNumber,
      warehouseId: targetReq.warehouseId,
      userAgent: options.userAgent,
    },
    ipAddress: options.ipAddress,
    dbOverride: options.dbOverride,
  });

  return sanitizeInvoiceRequest(updatedReq);
}
