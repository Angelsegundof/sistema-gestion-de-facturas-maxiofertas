import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  invoiceRequests,
  invoiceRequestItems,
} from "@/lib/db/schema";
import { requireAuth, AuthError } from "@/lib/auth";
import { sanitizeInvoiceRequest } from "@/lib/services/invoice-requests";
import { ApiResponse, SanitizedInvoiceRequest } from "@/types";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  const requestList = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, id))
    .limit(1);

  if (requestList.length === 0) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "REQUEST_NOT_FOUND",
          message: "La solicitud de factura especificada no existe.",
        },
      },
      { status: 404 }
    );
  }

  const targetReq = requestList[0];

  // IDOR Protection: WAREHOUSE_USER can ONLY access requests created by themselves
  if (currentUser.role === "WAREHOUSE_USER" && targetReq.requestedBy !== currentUser.id) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "REQUEST_NOT_FOUND",
          message: "La solicitud de factura especificada no existe o no tiene permisos para consultarla.",
        },
      },
      { status: 404 }
    );
  }

  const itemsList = await db
    .select()
    .from(invoiceRequestItems)
    .where(eq(invoiceRequestItems.invoiceRequestId, targetReq.id))
    .orderBy(invoiceRequestItems.lineNumber);

  const sanitized = sanitizeInvoiceRequest(targetReq, itemsList);

  return NextResponse.json<ApiResponse<{ request: SanitizedInvoiceRequest }>>(
    {
      success: true,
      data: {
        request: sanitized,
      },
    },
    { status: 200 }
  );
}
