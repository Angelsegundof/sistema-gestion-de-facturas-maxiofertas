import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { requireAuth, AuthError } from "@/lib/auth";
import { normalizeRut, validateRut } from "@/lib/validation/rut";
import { ApiResponse, SanitizedCustomer } from "@/types";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ rut: string }> }
) {
  try {
    await requireAuth();
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

  const { rut } = await context.params;
  const rawRut = decodeURIComponent(rut || "").trim();

  if (!validateRut(rawRut)) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "INVALID_RUT",
          message: "El RUT ingresado no es v?lido seg?n el algoritmo m?dulo 11.",
        },
      },
      { status: 400 }
    );
  }

  const canonicalRut = normalizeRut(rawRut);
  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  const customerList = await db
    .select()
    .from(customers)
    .where(and(eq(customers.rutCanonical, canonicalRut), eq(customers.active, true)))
    .limit(1);

  if (customerList.length === 0) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "CUSTOMER_NOT_FOUND",
          message: "Cliente no encontrado.",
        },
      },
      { status: 404 }
    );
  }

  const c = customerList[0];
  const sanitized: SanitizedCustomer = {
    id: c.id,
    rut: c.rutDisplay,
    rutCanonical: c.rutCanonical,
    legalName: c.legalName,
    businessActivity: c.businessActivity,
    phone: c.phone,
    email: c.email,
    active: c.active,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };

  return NextResponse.json<ApiResponse<{ customer: SanitizedCustomer }>>(
    {
      success: true,
      data: { customer: sanitized },
    },
    { status: 200 }
  );
}
