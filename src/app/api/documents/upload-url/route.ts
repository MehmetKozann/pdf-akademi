import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/config/server-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeFileName } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  try {
    const { fileName, fileSize } = await req.json();

    if (!fileName || !fileSize) {
      return NextResponse.json(
        { error: "Dosya adı ve boyutu gereklidir." },
        { status: 400 }
      );
    }

    if (!fileName.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Yalnızca PDF dosyaları desteklenmektedir." },
        { status: 400 }
      );
    }

    if (fileSize > 26_214_400) {
      return NextResponse.json(
        { error: "Dosya boyutu 25 MB sınırını aşıyor." },
        { status: 400 }
      );
    }

    const documentId = crypto.randomUUID();
    const safeFileName = sanitizeFileName(fileName);
    const storagePath = `${user.id}/${documentId}.pdf`;

    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUploadUrl(storagePath);

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message || "Yükleme bağlantısı oluşturulamadı." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        documentId,
        storagePath,
        safeFileName,
        signedUrl: data.signedUrl,
        token: data.token,
      });
    }

    return NextResponse.json({
      documentId,
      storagePath,
      safeFileName,
      direct: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sunucu hatası" },
      { status: 500 }
    );
  }
}
