import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { ApiResponse, SanitizedUser } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessionResult = await getServerSession();

  if (!sessionResult || !sessionResult.user.active) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "No existe una sesi?n activa o el usuario est? deshabilitado.",
        },
      },
      { status: 401 }
    );
  }

  return NextResponse.json<ApiResponse<{ user: SanitizedUser }>>(
    {
      success: true,
      data: {
        user: sessionResult.user,
      },
    },
    { status: 200 }
  );
}
