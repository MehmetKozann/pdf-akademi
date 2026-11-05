import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";
import { updateNoteSchema } from "@/lib/security/validation";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const note = await repository.getStudyNote(user.id, id);
  if (!note) {
    return NextResponse.json({ error: "Ders notu bulunamadı." }, { status: 404 });
  }
  const document = await repository.getDocument(user.id, note.document_id);
  return NextResponse.json({ note, document });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const body = await req.json();
  const parsed = updateNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Geçersiz güncelleme verisi." },
      { status: 400 }
    );
  }

  const updated = await repository.updateStudyNote(user.id, id, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "Ders notu bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ note: updated });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const deleted = await repository.deleteStudyNote(user.id, id);
  if (!deleted) {
    return NextResponse.json({ error: "Ders notu bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

