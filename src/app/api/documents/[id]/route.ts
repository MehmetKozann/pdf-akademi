import { NextRequest, NextResponse } from "next/server";
import { enrichDocumentMetadataWithAI } from "@/lib/ai/services";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const document = await repository.getDocument(user.id, id);
  if (!document) {
    return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
  }

  const pages = await repository.getDocumentPages(user.id, id);
  return NextResponse.json({ document, pages });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const existing = await repository.getDocument(user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
  }

  const body = (await req.json()) as {
    title?: string;
    course_id?: string | null;
    reanalyze?: boolean;
  };

  if (body.reanalyze) {
    const chunks = await repository.getDocumentChunks(user.id, id);
    const refreshed = await enrichDocumentMetadataWithAI({
      chunks,
      pageCount: existing.page_count,
      baseMetadata: existing.extracted_metadata,
      user,
    });
    const updated = await repository.updateDocument(user.id, id, {
      extracted_metadata: refreshed,
    });
    return NextResponse.json({ document: updated });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) {
    patch.title = body.title.trim().slice(0, 180);
  }
  if (body.course_id !== undefined) {
    patch.course_id = body.course_id || null;
  }

  const updated = await repository.updateDocument(user.id, id, patch);
  return NextResponse.json({ document: updated });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const deleted = await repository.deleteDocument(user.id, id);
  if (!deleted) {
    return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

