import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import {
  requirePermission,
  verifyCsrfOrigin,
  logAuditEvent,
  AuthError,
} from "@/lib/auth";
import { normalizeRut } from "@/lib/validation/rut";
import { ApiResponse, SanitizedCustomer } from "@/types";

const updateCustomerSchema = z.object({
  legalName: z
    .string()
    .min(2, "La razón social debe tener al menos 2 caracteres")
    .max(200, "La razón social no puede exceder los 200 caracteres")
    .optional(),
  businessActivity: z
    .string()
    .min(2, "El giro debe tener al menos 2 caracteres")
    .max(250, "El giro no puede exceder los 250 caracteres")
    .optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z
    .string()
    .email("Correo electrónico con formato inválido")
    .max(320)
    .nullable()
    .optional()
    .or(z.literal("")),
  rut: z.string().optional(),
  rutCanonical: z.string().optional(),
  rutDisplay: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  const existingList = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);

  if (existingList.length === 0) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "CUSTOMER_NOT_FOUND", message: "Cliente no encontrado" } },
      { status: 404 }
    );
  }

  const c = existingList[0];
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
    { success: true, data: { customer: sanitized } },
    { status: 200 }
  );
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // 1. Verificación CSRF / Same-Origin
  const csrfCheck = verifyCsrfOrigin(request);
  if (!csrfCheck.valid) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "CSRF_FORBIDDEN",
          message: csrfCheck.reason || "Petición no permitida por política de origen.",
        },
      },
      { status: 403 }
    );
  }

  // 2. Autorización RBAC server-side
  let currentUser;
  try {
    currentUser = await requirePermission("CUSTOMER_MANAGE");
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

  const { id } = await context.params;
  const ipAddress =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";
  const userAgent = request.headers.get("user-agent") || undefined;

  let rawBody: any;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INVALID_BODY", message: "Cuerpo de solicitud inválido" } },
      { status: 400 }
    );
  }

  // 3. Obtener cliente actual desde base de datos
  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  const existingList = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);

  if (existingList.length === 0) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "CUSTOMER_NOT_FOUND", message: "Cliente no encontrado" } },
      { status: 404 }
    );
  }

  const existing = existingList[0];

  // 4. Verificación de inmutabilidad del RUT
  // Si el cliente envía un RUT diferente al existente, se rechaza tajantemente
  if (rawBody.rut !== undefined) {
    const incomingCanonical = normalizeRut(String(rawBody.rut));
    if (incomingCanonical && incomingCanonical !== existing.rutCanonical) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: {
            code: "RUT_IMMUTABLE",
            message:
              "El RUT es un identificador tributario inmutable y no puede modificarse desde la edición normal.",
          },
        },
        { status: 400 }
      );
    }
  }

  // 5. Validación de campos permitidos
  const parsed = updateCustomerSchema.safeParse(rawBody);
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

  const { legalName, businessActivity, phone, email } = parsed.data;

  // 6. Normalización según reglas del sistema
  const normalizedLegalName =
    legalName !== undefined
      ? legalName.trim().replace(/\s+/g, " ")
      : undefined;

  const normalizedBusinessActivity =
    businessActivity !== undefined
      ? businessActivity.trim().replace(/\s+/g, " ")
      : undefined;

  const normalizedPhone =
    phone !== undefined
      ? phone === null || phone.trim() === ""
        ? null
        : phone.trim().replace(/\s+/g, " ")
      : undefined;

  const normalizedEmail =
    email !== undefined
      ? email === null || email.trim() === ""
        ? null
        : email.trim().toLowerCase()
      : undefined;

  // 7. Calcular cambios before / after
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  if (normalizedLegalName !== undefined && normalizedLegalName !== existing.legalName) {
    changes.legal_name = {
      before: existing.legalName,
      after: normalizedLegalName,
    };
  }

  if (
    normalizedBusinessActivity !== undefined &&
    normalizedBusinessActivity !== existing.businessActivity
  ) {
    changes.business_activity = {
      before: existing.businessActivity,
      after: normalizedBusinessActivity,
    };
  }

  if (normalizedPhone !== undefined && normalizedPhone !== existing.phone) {
    changes.phone = {
      before: existing.phone,
      after: normalizedPhone,
    };
  }

  if (normalizedEmail !== undefined && normalizedEmail !== existing.email) {
    changes.email = {
      before: existing.email,
      after: normalizedEmail,
    };
  }

  // Si no hay cambios reales, retornar el cliente existente
  if (Object.keys(changes).length === 0) {
    const sanitized: SanitizedCustomer = {
      id: existing.id,
      rut: existing.rutDisplay,
      rutCanonical: existing.rutCanonical,
      legalName: existing.legalName,
      businessActivity: existing.businessActivity,
      phone: existing.phone,
      email: existing.email,
      active: existing.active,
      createdAt: existing.createdAt.toISOString(),
      updatedAt: existing.updatedAt.toISOString(),
    };
    return NextResponse.json<ApiResponse<{ customer: SanitizedCustomer }>>(
      { success: true, data: { customer: sanitized } },
      { status: 200 }
    );
  }

  // 8. Aplicar actualización en base de datos
  const updatePayload: Record<string, any> = {
    updatedAt: new Date(),
  };
  if (normalizedLegalName !== undefined) updatePayload.legalName = normalizedLegalName;
  if (normalizedBusinessActivity !== undefined) updatePayload.businessActivity = normalizedBusinessActivity;
  if (normalizedPhone !== undefined) updatePayload.phone = normalizedPhone;
  if (normalizedEmail !== undefined) updatePayload.email = normalizedEmail;

  const updatedRows = await db
    .update(customers)
    .set(updatePayload)
    .where(eq(customers.id, id))
    .returning();

  const updated = updatedRows[0];

  // 9. Registrar evento de auditoría obligatorio
  await logAuditEvent({
    userId: currentUser.id,
    action: "CUSTOMER_UPDATED",
    entityType: "customers",
    entityId: updated.id,
    metadata: {
      actorUserId: currentUser.id,
      actorRole: currentUser.role,
      actorEmail: currentUser.email,
      customerRut: updated.rutCanonical,
      customerRutDisplay: updated.rutDisplay,
      changes,
      userAgent,
    },
    ipAddress,
  });

  const sanitized: SanitizedCustomer = {
    id: updated.id,
    rut: updated.rutDisplay,
    rutCanonical: updated.rutCanonical,
    legalName: updated.legalName,
    businessActivity: updated.businessActivity,
    phone: updated.phone,
    email: updated.email,
    active: updated.active,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };

  return NextResponse.json<ApiResponse<{ customer: SanitizedCustomer }>>(
    {
      success: true,
      data: { customer: sanitized },
    },
    { status: 200 }
  );
}
