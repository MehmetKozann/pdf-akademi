import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const deleted = await repository.deleteCourse(user.id, id);
  if (!deleted) {
    return NextResponse.json({ error: "Ders bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

