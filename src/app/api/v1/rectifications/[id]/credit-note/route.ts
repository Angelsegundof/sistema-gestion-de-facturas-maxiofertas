import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { verifyCsrfOrigin } from "@/lib/auth/csrf";
import { registerCreditNoteService } from "@/lib/services/rectifications";
import { ApiResponse, SanitizedCreditNote } from "@/types";

export async function POST(
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
      { success: false, error: { code: "CSRF_ERROR", message: csrfCheck.reason || "Error de validación CSRF" } },
      { status: 403 }
    );
  }

  if (currentUser.role !== "INVOICE_EXECUTOR" && currentUser.role !== "ADMIN") {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "FORBIDDEN", message: "No tienes permisos para registrar Notas de Crédito." } },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const ipAddress = request.headers.get("x-forwarded-for") || undefined;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INVALID_MULTIPART", message: "Se esperaba un formulario multipart/form-data válido." } },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  const folio = (formData.get("folio") as string) || undefined;

  if (!file) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "FILE_REQUIRED", message: "Debes seleccionar el archivo PDF de la Nota de Crédito." } },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    const creditNote = await registerCreditNoteService(
      currentUser,
      id,
      {
        buffer,
        fileName: file.name || "nota_credito.pdf",
        mimeType: file.type || "application/pdf",
        fileSize: buffer.length,
      },
      folio,
      ipAddress
    );

    return NextResponse.json<ApiResponse<{ creditNote: SanitizedCreditNote }>>(
      {
        success: true,
        data: {
          creditNote,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al registrar la Nota de Crédito";

    if (msg.startsWith("NOT_FOUND")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "NOT_FOUND", message: "La rectificación no existe." } },
        { status: 404 }
      );
    }

    if (msg.startsWith("FORBIDDEN")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "FORBIDDEN", message: msg.replace("FORBIDDEN: ", "") } },
        { status: 403 }
      );
    }

    if (msg.startsWith("VALIDATION_ERROR")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "VALIDATION_ERROR", message: msg.replace("VALIDATION_ERROR: ", "") } },
        { status: 422 }
      );
    }

    if (msg.startsWith("INVALID_STATE")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "INVALID_STATE", message: msg } },
        { status: 409 }
      );
    }

    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 }
    );
  }
}
