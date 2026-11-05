import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const data = await repository.getExamWithQuestions(user.id, id);
  if (!data) {
    return NextResponse.json({ error: "Sınav bulunamadı." }, { status: 404 });
  }

  const attempts = await repository.listExamAttempts(user.id, id);
  return NextResponse.json({ ...data, attempts });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const deleted = await repository.deleteExam(user.id, id);
  if (!deleted) {
    return NextResponse.json({ error: "Sınav bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

