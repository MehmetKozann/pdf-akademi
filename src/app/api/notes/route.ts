import { NextRequest, NextResponse } from "next/server";
import { AIConfigurationError } from "@/lib/ai/provider";
import { generateStudyNoteWithAI } from "@/lib/ai/services";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";
import { checkRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { generateNoteSchema } from "@/lib/security/validation";

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const documentId = req.nextUrl.searchParams.get("documentId") || undefined;
  const notes = await repository.listStudyNotes(user.id, documentId);
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const rl = checkRateLimit({
    key: `notes:${user.id}`,
    limit: 12,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  try {
    const body = await req.json();
    const parsed = generateNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Geçersiz ders notu isteği." },
        { status: 400 }
      );
    }

    const doc = await repository.getDocument(user.id, parsed.data.documentId);
    if (!doc || doc.status !== "ready") {
      return NextResponse.json(
        { error: "Seçilen PDF belgesi bulunamadı veya henüz analiz edilmedi." },
        { status: 404 }
      );
    }

    const note = await generateStudyNoteWithAI({
      user,
      document: doc,
      noteType: parsed.data.noteType,
      customTitle: parsed.data.customTitle,
      focusTopic: parsed.data.focusTopic,
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    const status = err instanceof AIConfigurationError ? 503 : 500;
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Ders notu üretilirken hata oluştu.",
        needsAiConfig: err instanceof AIConfigurationError,
      },
      { status }
    );
  }
}

