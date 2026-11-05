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
  const doc = await repository.getDocument(user.id, id);
  if (!doc) {
    return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
  }

  const pdfBuffer = await repository.downloadPdfBinary(
    user.id,
    doc.storage_path
  );
  if (!pdfBuffer) {
    return NextResponse.json(
      { error: "PDF dosyası depolama alanında bulunamadı." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(
        doc.file_name
      )}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

