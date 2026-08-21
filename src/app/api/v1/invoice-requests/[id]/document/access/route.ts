import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { requireAuth, AuthError } from "@/lib/auth";
import { getInvoiceDocumentAccessService } from "@/lib/services/invoice-documents";
import { r2Client, generateFallbackPdf } from "@/lib/r2/client";
import { ApiResponse, SanitizedDocument } from "@/types";

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
  const ipAddress = request.headers.get("x-forwarded-for") || undefined;
  const isStream = request.nextUrl.searchParams.get("stream") === "true";

  try {
    const result = await getInvoiceDocumentAccessService(
      currentUser,
      { requestId: id },
      ipAddress
    );

    if (isStream) {
      const db = getDb();
      const docRecord = db
        ? await db
            .select()
            .from(documents)
            .where(eq(documents.id, result.document.id))
            .limit(1)
        : [];

      const storageKey = docRecord[0]?.storageKey || `facturas/${result.document.id}.pdf`;
      const fileName = docRecord[0]?.fileName || result.document.fileName || "factura.pdf";
      const fileObj = await r2Client.getObject(storageKey);
      const pdfBytes = fileObj?.body || generateFallbackPdf(fileName);
      const uint8 = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
      const bodyBuffer = Buffer.from(uint8);

      return new NextResponse(bodyBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
          "Content-Length": bodyBuffer.byteLength.toString(),
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      });
    }

    return NextResponse.json<
      ApiResponse<{
        document: SanitizedDocument;
        accessUrl: string;
      }>
    >(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al obtener acceso al documento";

    if (msg.startsWith("NOT_FOUND")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "DOCUMENT_NOT_FOUND", message: "No se encontró el documento de factura para esta solicitud." } },
        { status: 404 }
      );
    }

    if (msg.startsWith("FORBIDDEN")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "FORBIDDEN", message: msg.replace("FORBIDDEN: ", "") } },
        { status: 403 }
      );
    }

    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 }
    );
  }
}
