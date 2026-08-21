import { NextRequest, NextResponse } from "next/server";
import { resolveSharedDocumentService } from "@/lib/services/document-share";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const ipAddress = request.headers.get("x-forwarded-for") || undefined;

  try {
    const result = await resolveSharedDocumentService(token, ipAddress);

    if (result.status === "SUPERSEDED") {
      // Redirect to informative page showing that invoice was superseded
      const supersededUrl = new URL(`/f/${encodeURIComponent(token)}/reemplazada`, request.nextUrl.origin);
      return NextResponse.redirect(supersededUrl);
    }

    // Active invoice: Redirect to secure short-lived presigned R2 URL
    return NextResponse.redirect(result.accessUrl, { status: 302 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Enlace no válido";

    if (msg.startsWith("REVOKED") || msg.startsWith("EXPIRED")) {
      return new NextResponse(
        `<!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Enlace no disponible - Maxiofertas</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-slate-50 min-h-screen flex items-center justify-center p-4 text-slate-800">
          <div class="max-w-md w-full bg-white rounded-2xl p-6 shadow-sm border border-slate-200 text-center space-y-3">
            <div class="h-12 w-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xl mx-auto">
              ⏳
            </div>
            <h1 class="text-base font-bold text-slate-900">Enlace no disponible</h1>
            <p class="text-xs text-slate-600">Este enlace de factura ha expirado o ya no está activo. Si necesitas consultar tu documento tributario, contacta al emisor.</p>
          </div>
        </body>
        </html>`,
        {
          status: 410,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }

    return new NextResponse(
      `<!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Documento no encontrado - Maxiofertas</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-slate-50 min-h-screen flex items-center justify-center p-4 text-slate-800">
        <div class="max-w-md w-full bg-white rounded-2xl p-6 shadow-sm border border-slate-200 text-center space-y-3">
          <div class="h-12 w-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xl mx-auto">
            ✕
          </div>
          <h1 class="text-base font-bold text-slate-900">Factura no encontrada</h1>
          <p class="text-xs text-slate-600">El enlace proporcionado no es válido o el documento ya no existe.</p>
        </div>
      </body>
      </html>`,
      {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
}
