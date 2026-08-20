import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth";
import { verifyCsrfOrigin } from "@/lib/auth/csrf";
import { correctAndResubmitService } from "@/lib/services/invoice-queue";
import { ApiResponse, SanitizedInvoiceRequest } from "@/types";

const correctRequestSchema = z.object({
  customer: z.object({
    rut: z.string().min(3, "El RUT es obligatorio").max(20),
    legalName: z.string().min(2, "La raz?n social debe tener al menos 2 caracteres").max(200),
    businessActivity: z.string().min(2, "El giro debe tener al menos 2 caracteres").max(250),
    phone: z.string().max(50).optional().nullable(),
    email: z.string().email("Correo electr?nico inv?lido").max(320).optional().nullable(),
  }),
  items: z
    .array(
      z.object({
        description: z.string().min(1, "La descripci?n del producto es obligatoria").max(500),
        quantity: z.number().int("La cantidad debe ser entera").positive("La cantidad debe ser mayor a 0"),
        unitPriceGross: z.number().int("El precio debe ser entero").positive("El precio debe ser mayor a 0"),
      })
    )
    .min(1, "Debe incluir al menos un producto")
    .max(100, "No se pueden incluir m?s de 100 productos por solicitud"),
  notes: z.string().max(2000, "Las observaciones no pueden superar los 2.000 caracteres").optional().nullable(),
});

export async function PATCH(
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

  const csrfCheck = verifyCsrfOrigin(request);
  if (!csrfCheck.valid) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "CSRF_ERROR", message: csrfCheck.reason || "Error de validaci?n CSRF" } },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INVALID_JSON", message: "Cuerpo de solicitud inv?lido." } },
      { status: 400 }
    );
  }

  const parseResult = correctRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Los datos de correcci?n no son v?lidos.",
          details: { errors: parseResult.error.format() },
        },
      },
      { status: 422 }
    );
  }

  const { id } = await context.params;
  const ipAddress = request.headers.get("x-forwarded-for") || undefined;

  try {
    const updatedRequest = await correctAndResubmitService(
      currentUser,
      id,
      parseResult.data,
      ipAddress
    );

    return NextResponse.json<ApiResponse<{ request: SanitizedInvoiceRequest }>>(
      {
        success: true,
        data: {
          request: updatedRequest,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al corregir la solicitud";

    if (msg.startsWith("NOT_FOUND")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "REQUEST_NOT_FOUND", message: "La solicitud no existe." } },
        { status: 404 }
      );
    }

    if (msg.startsWith("FORBIDDEN")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "FORBIDDEN", message: msg.replace("FORBIDDEN: ", "") } },
        { status: 403 }
      );
    }

    if (msg.startsWith("INVALID_STATE")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "INVALID_STATE", message: msg.replace("INVALID_STATE: ", "") } },
        { status: 409 }
      );
    }

    if (msg.startsWith("INVALID_RUT")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "INVALID_RUT", message: "El RUT ingresado no es v?lido seg?n el algoritmo m?dulo 11." } },
        { status: 422 }
      );
    }

    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 }
    );
  }
}
