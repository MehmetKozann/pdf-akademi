import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AIConfigurationError } from "@/lib/ai/provider";
import { generateQuestionsBatchWithAI } from "@/lib/ai/services";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";
import { checkRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { createExamSchema } from "@/lib/security/validation";
import type {
  Exam,
  ExamQuestionItem,
  Question,
  QuestionType,
} from "@/types/database";

export async function GET() {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const [exams, attempts] = await Promise.all([
    repository.listExams(user.id),
    repository.listExamAttempts(user.id),
  ]);

  return NextResponse.json({ exams, attempts });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const rl = checkRateLimit({
    key: `exams:${user.id}`,
    limit: 8,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  try {
    const body = await req.json();
    const parsed = createExamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Geçersiz sınav yapılandırması." },
        { status: 400 }
      );
    }

    const dist = parsed.data.distribution;
    const totalRequested =
      dist.multiple_choice +
      dist.classical +
      dist.true_false +
      dist.fill_blank +
      dist.matching;

    if (totalRequested < 1 || totalRequested > 60) {
      return NextResponse.json(
        {
          error:
            "Toplam soru sayısı en az 1, en fazla 60 olmalıdır. Lütfen soru dağılımını kontrol ediniz.",
        },
        { status: 400 }
      );
    }

    const doc = await repository.getDocument(user.id, parsed.data.documentId);
    if (!doc || doc.status !== "ready") {
      return NextResponse.json(
        { error: "Seçilen PDF belgesi bulunamadı veya henüz hazır değil." },
        { status: 404 }
      );
    }

    const typeBatches: { type: QuestionType; count: number }[] = (
      [
        { type: "multiple_choice" as const, count: dist.multiple_choice },
        { type: "classical" as const, count: dist.classical },
        { type: "true_false" as const, count: dist.true_false },
        { type: "fill_blank" as const, count: dist.fill_blank },
        { type: "matching" as const, count: dist.matching },
      ] as { type: QuestionType; count: number }[]
    ).filter((b) => b.count > 0);

    const allGeneratedQuestions: Question[] = [];

    // Generate each requested question type according to exact configured count
    // Split large batches (>15) into sub-batches for reliable JSON generation
    for (const batch of typeBatches) {
      let remaining = batch.count;
      while (remaining > 0) {
        const chunkCount = Math.min(12, remaining);
        const generated = await generateQuestionsBatchWithAI({
          user,
          document: doc,
          questionType: batch.type,
          count: chunkCount,
          difficulty: parsed.data.difficulty,
          mcqOptionCount: parsed.data.mcqOptionCount,
          topics: parsed.data.topics,
          existingQuestionStems: allGeneratedQuestions.map(
            (q) => q.question_text
          ),
        });
        allGeneratedQuestions.push(...generated);
        remaining -= chunkCount;
      }
    }

    if (allGeneratedQuestions.length === 0) {
      return NextResponse.json(
        { error: "Sınav soruları üretilemedi. Lütfen tekrar deneyiniz." },
        { status: 500 }
      );
    }

    await repository.saveQuestions(allGeneratedQuestions);

    const examId = crypto.randomUUID();
    const now = new Date().toISOString();
    const equalPoints = Number(
      (100 / allGeneratedQuestions.length).toFixed(2)
    );

    const examQuestions: ExamQuestionItem[] = allGeneratedQuestions.map(
      (q, idx) => ({
        id: crypto.randomUUID(),
        exam_id: examId,
        question_id: q.id,
        user_id: user.id,
        order_index: idx + 1,
        points: equalPoints,
      })
    );

    const exam: Exam = {
      id: examId,
      user_id: user.id,
      course_id: doc.course_id,
      document_id: doc.id,
      title: parsed.data.title,
      description: `${doc.title} belgesinden oluşturulan ${allGeneratedQuestions.length} soruluk deneme sınavı.`,
      exam_type: parsed.data.examType,
      difficulty: parsed.data.difficulty,
      duration_minutes: parsed.data.durationMinutes,
      total_questions: allGeneratedQuestions.length,
      config: {
        question_distribution: dist,
        topics: parsed.data.topics,
        immediate_answers: parsed.data.immediateAnswers,
        include_explanations: parsed.data.includeExplanations,
        mcq_option_count: parsed.data.mcqOptionCount,
      },
      status: "ready",
      created_at: now,
    };

    await repository.createExam(exam, examQuestions);

    return NextResponse.json({ exam }, { status: 201 });
  } catch (err) {
    const status = err instanceof AIConfigurationError ? 503 : 500;
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Deneme sınavı oluşturulurken hata oluştu.",
        needsAiConfig: err instanceof AIConfigurationError,
      },
      { status }
    );
  }
}

