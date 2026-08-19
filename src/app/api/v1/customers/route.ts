import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, or, ilike, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import {
  requirePermission,
  verifyCsrfOrigin,
  logAuditEvent,
  AuthError,
} from "@/lib/auth";
import { formatRut, normalizeRut, validateRut } from "@/lib/validation/rut";
import { ApiResponse, SanitizedCustomer } from "@/types";

const createCustomerSchema = z.object({
  rut: z.string().min(1, "El RUT es requerido"),
  legalName: z.string().min(2, "La raz?n social debe tener al menos 2 caracteres").max(200),
  businessActivity: z.string().min(2, "El giro debe tener al menos 2 caracteres").max(250),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email("Correo electr?nico con formato inv?lido").max(320).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requirePermission("CUSTOMER_VIEW");
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "FORBIDDEN", message: "Acceso no autorizado" } },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() || "";

  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  let customerList;
  if (query) {
    const canonicalQuery = normalizeRut(query);
    customerList = await db
      .select()
      .from(customers)
      .where(
        or(
          eq(customers.rutCanonical, canonicalQuery),
          ilike(customers.legalName, `%${query}%`)
        )
      )
      .orderBy(desc(customers.createdAt))
      .limit(50);
  } else {
    customerList = await db
      .select()
      .from(customers)
      .orderBy(desc(customers.createdAt))
      .limit(50);
  }

  const sanitized: SanitizedCustomer[] = customerList.map((c) => ({
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
  }));

  return NextResponse.json<ApiResponse<{ customers: SanitizedCustomer[] }>>(
    {
      success: true,
      data: { customers: sanitized },
    },
    { status: 200 }
  );
}

export async function POST(request: NextRequest) {
  // 1. Verificaci?n CSRF / Same-Origin
  const csrfCheck = verifyCsrfOrigin(request);
  if (!csrfCheck.valid) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "CSRF_FORBIDDEN",
          message: csrfCheck.reason || "Petici?n no permitida por pol?tica de origen.",
        },
      },
      { status: 403 }
    );
  }

  // 2. Autorizaci?n
  let currentUser;
  try {
    currentUser = await requirePermission("CUSTOMER_CREATE");
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "FORBIDDEN", message: "Acceso no autorizado" } },
      { status: 403 }
    );
  }

  const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INVALID_BODY", message: "Cuerpo de solicitud inv?lido" } },
      { status: 400 }
    );
  }

  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Datos del cliente incompletos o con formato incorrecto.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 }
    );
  }

  const rawRut = parsed.data.rut.trim();
  if (!validateRut(rawRut)) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "INVALID_RUT",
          message: "El RUT ingresado no es v?lido.",
        },
      },
      { status: 400 }
    );
  }

  const canonicalRut = normalizeRut(rawRut);
  const displayRut = formatRut(rawRut);
  const normalizedEmail = parsed.data.email ? parsed.data.email.trim().toLowerCase() : null;
  const normalizedPhone = parsed.data.phone ? parsed.data.phone.trim() : null;

  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  // Safe concurrent insert with ON CONFLICT DO UPDATE (preserves single customer per canonical RUT)
  const [customer] = await db
    .insert(customers)
    .values({
      rutCanonical: canonicalRut,
      rutDisplay: displayRut,
      legalName: parsed.data.legalName.trim(),
      businessActivity: parsed.data.businessActivity.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      active: true,
    })
    .onConflictDoUpdate({
      target: customers.rutCanonical,
      set: {
        legalName: parsed.data.legalName.trim(),
        businessActivity: parsed.data.businessActivity.trim(),
        phone: normalizedPhone,
        email: normalizedEmail,
        updatedAt: new Date(),
      },
    })
    .returning();

  await logAuditEvent({
    userId: currentUser.id,
    action: "USER_CREATED", // CUSTOMER_CREATED
    entityType: "customers",
    entityId: customer.id,
    metadata: {
      actionType: "CUSTOMER_CREATED",
      rut: customer.rutCanonical,
      legalName: customer.legalName,
      createdBy: currentUser.email,
    },
    ipAddress,
  });

  const sanitized: SanitizedCustomer = {
    id: customer.id,
    rut: customer.rutDisplay,
    rutCanonical: customer.rutCanonical,
    legalName: customer.legalName,
    businessActivity: customer.businessActivity,
    phone: customer.phone,
    email: customer.email,
    active: customer.active,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };

  return NextResponse.json<ApiResponse<{ customer: SanitizedCustomer }>>(
    {
      success: true,
      data: { customer: sanitized },
    },
    { status: 201 }
  );
}
