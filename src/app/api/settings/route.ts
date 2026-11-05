import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/session";
import { getPublicSystemStatus } from "@/lib/config/server-config";
import { repository } from "@/lib/db/repository";
import { settingsUpdateSchema } from "@/lib/security/validation";

export async function GET() {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  return NextResponse.json({
    user,
    system: getPublicSystemStatus(),
  });
}

export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const body = await req.json();
  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Geçersiz ayar verisi." },
      { status: 400 }
    );
  }

  const updatedUser = await repository.updateUser(user.id, {
    ...(parsed.data.full_name !== undefined
      ? { full_name: parsed.data.full_name }
      : {}),
    ...(parsed.data.university !== undefined
      ? { university: parsed.data.university }
      : {}),
    ...(parsed.data.department !== undefined
      ? { department: parsed.data.department }
      : {}),
    ...(parsed.data.theme_preference !== undefined
      ? { theme_preference: parsed.data.theme_preference }
      : {}),
    ...(parsed.data.ai_preferences !== undefined
      ? { ai_preferences: parsed.data.ai_preferences }
      : {}),
  });

  return NextResponse.json({
    user: updatedUser ?? user,
    system: getPublicSystemStatus(),
  });
}

