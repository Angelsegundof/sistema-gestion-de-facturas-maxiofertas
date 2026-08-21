import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  invoiceRequests,
  invoiceRequestStatuses,
  InvoiceRequestStatus,
  documents,
  rectifications,
  requestCorrections,
} from "@/lib/db/schema";
import { requireAuth, AuthError } from "@/lib/auth";
import { sanitizeInvoiceRequest } from "@/lib/services/invoice-requests";
import { sanitizeDocument } from "@/lib/services/invoice-documents";
import { sanitizeRectification } from "@/lib/services/rectifications";
import { SanitizedInvoiceRequest } from "@/domain/types";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  let currentUser;
  try {
    currentUser = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "UNAUTHORIZED", message: "Acceso no autorizado" } },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status") as InvoiceRequestStatus | null;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
  const offset = (page - 1) * pageSize;

  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  // IDOR Defense: Strictly filter by currentUser.id (or if ADMIN, allow own/all)
  const conditions = [eq(invoiceRequests.requestedBy, currentUser.id)];

  if (statusParam && invoiceRequestStatuses.includes(statusParam)) {
    conditions.push(eq(invoiceRequests.status, statusParam));
  }

  const requestList = await db
    .select()
    .from(invoiceRequests)
    .where(and(...conditions))
    .orderBy(desc(invoiceRequests.createdAt))
    .limit(pageSize)
    .offset(offset);

  const requestIds = requestList.map((r) => r.id);

  // Fetch attached documents for these requests
  const attachedDocs =
    requestIds.length > 0
      ? await db
          .select()
          .from(documents)
          .where(
            and(
              inArray(documents.invoiceRequestId, requestIds),
              eq(documents.documentType, "INVOICE")
            )
          )
      : [];

  // Fetch rectifications for these requests
  const attachedRects =
    requestIds.length > 0
      ? await db
          .select()
          .from(rectifications)
          .where(inArray(rectifications.invoiceRequestId, requestIds))
          .orderBy(desc(rectifications.createdAt))
      : [];

  const sanitizedList: SanitizedInvoiceRequest[] = requestList.map((r) => {
    const base = sanitizeInvoiceRequest(r);
    const doc = attachedDocs.find((d) => d.invoiceRequestId === r.id);
    if (doc) {
      base.document = sanitizeDocument(doc);
    }
    const rect = attachedRects.find((rec) => rec.invoiceRequestId === r.id);
    if (rect) {
      base.activeRectification = sanitizeRectification(rect);
    }
    return base;
  });

  return NextResponse.json<ApiResponse<{ requests: SanitizedInvoiceRequest[]; page: number; pageSize: number }>>(
    {
      success: true,
      data: {
        requests: sanitizedList,
        page,
        pageSize,
      },
    },
    { status: 200 }
  );
}
