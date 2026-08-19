import { NextRequest, NextResponse } from "next/server";
import {
  getExpiredCookieOptions,
  logAuditEvent,
  revokeSession,
  validateSession,
  verifyCsrfOrigin,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { ApiResponse } from "@/types";

export async function POST(request: NextRequest) {
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

  const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const sessionData = await validateSession(token);
    if (sessionData) {
      await logAuditEvent({
        userId: sessionData.user.id,
        action: "LOGOUT",
        entityType: "sessions",
        entityId: sessionData.session.id,
        ipAddress,
      });
    }
    await revokeSession(token);
  }

  const response = NextResponse.json<ApiResponse<{ message: string }>>(
    {
      success: true,
      data: {
        message: "Sesi?n finalizada exitosamente.",
      },
    },
    { status: 200 }
  );

  const expiredOptions = getExpiredCookieOptions();
  response.cookies.set({
    name: expiredOptions.name,
    value: expiredOptions.value,
    httpOnly: expiredOptions.httpOnly,
    secure: expiredOptions.secure,
    sameSite: expiredOptions.sameSite,
    path: expiredOptions.path,
    maxAge: expiredOptions.maxAge,
  });

  return response;
}
