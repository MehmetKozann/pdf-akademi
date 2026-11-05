import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AIConfigurationError } from "@/lib/ai/provider";
import { generateQuestionsBatchWithAI } from "@/lib/ai/services";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";
import { checkRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { generateQuestionsSchema } from "@/lib/security/validation";
import { QUESTION_TYPE_LABELS } from "@/types/database";

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const sp = req.nextUrl.searchParams;
  const questions = await repository.listQuestions(user.id, {
    documentId: sp.get("documentId") || undefined,
    courseId: sp.get("courseId") || undefined,
    questionType: sp.get("questionType") || undefined,
    difficulty: sp.get("difficulty") || undefined,
    onlyFavorites: sp.get("favorites") === "true",
    bankId: sp.get("bankId") || undefined,
  });

  return NextResponse.json({ questions });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const rl = checkRateLimit({
    key: `questions:${user.id}`,
    limit: 15,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  try {
    const body = await req.json();
    const parsed = generateQuestionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Geçersiz soru üretim isteği." },
        { status: 400 }
      );
    }

    const doc = await repository.getDocument(user.id, parsed.data.documentId);
    if (!doc || doc.status !== "ready") {
      return NextResponse.json(
        { error: "Belge bulunamadı veya henüz analiz edilmedi." },
        { status: 404 }
      );
    }

    const existingQuestions = await repository.listQuestions(user.id, {
      documentId: doc.id,
      questionType: parsed.data.questionType,
    });

    const now = new Date().toISOString();
    const bankId = crypto.randomUUID();
    const bankTitle =
      parsed.data.bankTitle ||
      `${doc.title} — ${QUESTION_TYPE_LABELS[parsed.data.questionType]} (${parsed.data.count} Soru)`;

    const generated = await generateQuestionsBatchWithAI({
      user,
      document: doc,
      questionType: parsed.data.questionType,
      count: parsed.data.count,
      difficulty: parsed.data.difficulty,
      mcqOptionCount: parsed.data.mcqOptionCount,
      topics: parsed.data.topics,
      questionBankId: bankId,
      existingQuestionStems: existingQuestions.map((q) => q.question_text),
    });

    await repository.createQuestionBank({
      id: bankId,
      user_id: user.id,
      course_id: doc.course_id,
      document_id: doc.id,
      title: bankTitle,
      description: `${doc.title} belgesinden yapay zeka ile üretilen soru grubu.`,
      is_custom_collection: false,
      question_ids: generated.map((q) => q.id),
      created_at: now,
      updated_at: now,
    });

    const saved = await repository.saveQuestions(generated);

    await repository.logStudySession({
      user_id: user.id,
      document_id: doc.id,
      course_id: doc.course_id,
      activity_type: "question_practice",
      title: `${saved.length} adet ${QUESTION_TYPE_LABELS[parsed.data.questionType]} üretildi`,
      duration_minutes: 8,
      metadata: {
        question_type: parsed.data.questionType,
        count: saved.length,
      },
    });

    return NextResponse.json({ questions: saved }, { status: 201 });
  } catch (err) {
    const status = err instanceof AIConfigurationError ? 503 : 500;
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Sorular üretilirken hata oluştu.",
        needsAiConfig: err instanceof AIConfigurationError,
      },
      { status }
    );
  }
}

