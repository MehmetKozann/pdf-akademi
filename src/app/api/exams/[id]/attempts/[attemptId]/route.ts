import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { evaluateClassicalAnswerWithAI } from "@/lib/ai/services";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";
import { saveExamAnswerSchema } from "@/lib/security/validation";
import { normalizeTurkish } from "@/lib/utils";
import type { TopicPerformanceItem } from "@/types/database";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string; attemptId: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id: examId, attemptId } = await context.params;
  const [examData, attemptData] = await Promise.all([
    repository.getExamWithQuestions(user.id, examId),
    repository.getExamAttemptWithAnswers(user.id, attemptId),
  ]);

  if (!examData || !attemptData || attemptData.attempt.exam_id !== examId) {
    return NextResponse.json(
      { error: "Sınav oturumu bulunamadı." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    exam: examData.exam,
    items: examData.items,
    attempt: attemptData.attempt,
    answers: attemptData.answers,
  });
}

// Auto-save student answer & mark-for-review state during interactive exam
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string; attemptId: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id: examId, attemptId } = await context.params;
  const attemptData = await repository.getExamAttemptWithAnswers(
    user.id,
    attemptId
  );
  if (!attemptData || attemptData.attempt.exam_id !== examId) {
    return NextResponse.json(
      { error: "Sınav oturumu bulunamadı." },
      { status: 404 }
    );
  }

  if (attemptData.attempt.status === "completed") {
    return NextResponse.json(
      { error: "Tamamlanmış sınavda değişiklik yapılamaz." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const parsed = saveExamAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Geçersiz cevap verisi." },
      { status: 400 }
    );
  }

  const existingAns = attemptData.answers.find(
    (a) => a.question_id === parsed.data.questionId
  );

  const savedAnswer = await repository.upsertExamAnswer({
    id: existingAns?.id || crypto.randomUUID(),
    attempt_id: attemptId,
    exam_question_id: parsed.data.examQuestionId,
    question_id: parsed.data.questionId,
    user_id: user.id,
    user_answer: parsed.data.userAnswer,
    is_marked_for_review:
      parsed.data.isMarkedForReview ??
      existingAns?.is_marked_for_review ??
      false,
    is_correct: null,
    score_awarded: 0,
    max_points: existingAns?.max_points || 10,
    ai_evaluation: null,
    updated_at: new Date().toISOString(),
  });

  if (typeof parsed.data.timeSpentSeconds === "number") {
    await repository.updateExamAttempt(user.id, attemptId, {
      time_spent_seconds: parsed.data.timeSpentSeconds,
    });
  }

  return NextResponse.json({ answer: savedAnswer });
}

// Submit & Grade Exam (Objective Grading + AI Classical Rubric Grading + Weak Topic Analysis)
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; attemptId: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id: examId, attemptId } = await context.params;
  const [examData, attemptData] = await Promise.all([
    repository.getExamWithQuestions(user.id, examId),
    repository.getExamAttemptWithAnswers(user.id, attemptId),
  ]);

  if (!examData || !attemptData || attemptData.attempt.exam_id !== examId) {
    return NextResponse.json(
      { error: "Sınav oturumu bulunamadı." },
      { status: 404 }
    );
  }

  let timeSpentSeconds = attemptData.attempt.time_spent_seconds;
  try {
    const body = (await req.json()) as {
      timeSpentSeconds?: number;
      answers?: {
        questionId: string;
        examQuestionId: string;
        userAnswer: string;
        isMarkedForReview?: boolean;
      }[];
    };
    if (typeof body.timeSpentSeconds === "number") {
      timeSpentSeconds = body.timeSpentSeconds;
    }
    if (Array.isArray(body.answers)) {
      for (const ans of body.answers) {
        await repository.upsertExamAnswer({
          id: crypto.randomUUID(),
          attempt_id: attemptId,
          exam_question_id: ans.examQuestionId,
          question_id: ans.questionId,
          user_id: user.id,
          user_answer: ans.userAnswer || "",
          is_marked_for_review: Boolean(ans.isMarkedForReview),
          is_correct: null,
          score_awarded: 0,
          max_points: 10,
          ai_evaluation: null,
          updated_at: new Date().toISOString(),
        });
      }
    }
  } catch {
    // Proceed with already auto-saved answers
  }

  const refreshed = await repository.getExamAttemptWithAnswers(
    user.id,
    attemptId
  );
  const answerMap = new Map(
    (refreshed?.answers ?? []).map((a) => [a.question_id, a])
  );

  let totalScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  const topicStats = new Map<
    string,
    { total: number; correct: number; earned: number; max: number }
  >();

  for (const item of examData.items) {
    const q = item.question;
    if (!q) continue;

    const maxPts = Number(item.points) || 10;
    maxScore += maxPts;

    const topicKey = q.topic || "Genel Konular";
    const tStat = topicStats.get(topicKey) ?? {
      total: 0,
      correct: 0,
      earned: 0,
      max: 0,
    };
    tStat.total += 1;
    tStat.max += maxPts;

    const existing = answerMap.get(q.id);
    const rawUserAns = (existing?.user_answer || "").trim();

    if (!rawUserAns) {
      unansweredCount += 1;
      await repository.upsertExamAnswer({
        id: existing?.id || crypto.randomUUID(),
        attempt_id: attemptId,
        exam_question_id: item.id,
        question_id: q.id,
        user_id: user.id,
        user_answer: "",
        is_marked_for_review: existing?.is_marked_for_review ?? false,
        is_correct: null,
        score_awarded: 0,
        max_points: maxPts,
        ai_evaluation: null,
        updated_at: new Date().toISOString(),
      });
      topicStats.set(topicKey, tStat);
      continue;
    }

    if (q.question_type === "classical") {
      const evalResult = await evaluateClassicalAnswerWithAI({
        user,
        question: q,
        studentAnswer: rawUserAns,
        maxPoints: maxPts,
      });

      const isConsideredCorrect = evalResult.evaluation.score_ratio >= 0.6;
      if (isConsideredCorrect) correctCount += 1;
      else incorrectCount += 1;

      totalScore += evalResult.scoreAwarded;
      tStat.earned += evalResult.scoreAwarded;
      if (isConsideredCorrect) tStat.correct += 1;

      await repository.upsertExamAnswer({
        id: existing?.id || crypto.randomUUID(),
        attempt_id: attemptId,
        exam_question_id: item.id,
        question_id: q.id,
        user_id: user.id,
        user_answer: rawUserAns,
        is_marked_for_review: existing?.is_marked_for_review ?? false,
        is_correct: isConsideredCorrect,
        score_awarded: evalResult.scoreAwarded,
        max_points: maxPts,
        ai_evaluation: evalResult.evaluation,
        updated_at: new Date().toISOString(),
      });
    } else if (q.question_type === "matching") {
      // Student matching answer stored as JSON Record<left, selectedRight>
      let pairHits = 0;
      const totalPairs = Math.max(1, q.matching_pairs.length);
      try {
        const userPairs = JSON.parse(rawUserAns) as Record<string, string>;
        for (const pair of q.matching_pairs) {
          if (
            normalizeTurkish(userPairs[pair.left] || "") ===
            normalizeTurkish(pair.right)
          ) {
            pairHits += 1;
          }
        }
      } catch {
        pairHits = 0;
      }
      const ratio = pairHits / totalPairs;
      const earned = Number((ratio * maxPts).toFixed(2));
      const isFullOrMostlyCorrect = ratio >= 0.75;

      if (isFullOrMostlyCorrect) {
        correctCount += 1;
        tStat.correct += 1;
      } else {
        incorrectCount += 1;
      }
      totalScore += earned;
      tStat.earned += earned;

      await repository.upsertExamAnswer({
        id: existing?.id || crypto.randomUUID(),
        attempt_id: attemptId,
        exam_question_id: item.id,
        question_id: q.id,
        user_id: user.id,
        user_answer: rawUserAns,
        is_marked_for_review: existing?.is_marked_for_review ?? false,
        is_correct: isFullOrMostlyCorrect,
        score_awarded: earned,
        max_points: maxPts,
        ai_evaluation: null,
        updated_at: new Date().toISOString(),
      });
    } else {
      // Objective single-answer types: multiple_choice, true_false, fill_blank
      const normUser = normalizeTurkish(rawUserAns);
      const normCorrect = normalizeTurkish(q.correct_answer);
      const isCorrect =
        q.question_type === "multiple_choice"
          ? normUser.charAt(0) === normCorrect.charAt(0)
          : normUser === normCorrect ||
            (q.question_type === "fill_blank" &&
              normCorrect.length >= 4 &&
              (normUser.includes(normCorrect) ||
                normCorrect.includes(normUser)));

      const earned = isCorrect ? maxPts : 0;
      if (isCorrect) {
        correctCount += 1;
        tStat.correct += 1;
      } else {
        incorrectCount += 1;
      }
      totalScore += earned;
      tStat.earned += earned;

      await repository.upsertExamAnswer({
        id: existing?.id || crypto.randomUUID(),
        attempt_id: attemptId,
        exam_question_id: item.id,
        question_id: q.id,
        user_id: user.id,
        user_answer: rawUserAns,
        is_marked_for_review: existing?.is_marked_for_review ?? false,
        is_correct: isCorrect,
        score_awarded: earned,
        max_points: maxPts,
        ai_evaluation: null,
        updated_at: new Date().toISOString(),
      });
    }

    topicStats.set(topicKey, tStat);
  }

  const safeMax = maxScore > 0 ? maxScore : 100;
  const successPercentage = Number(((totalScore / safeMax) * 100).toFixed(1));

  const topicBreakdown: TopicPerformanceItem[] = Array.from(
    topicStats.entries()
  ).map(([topic, s]) => ({
    topic,
    total: s.total,
    correct: s.correct,
    score_earned: Number(s.earned.toFixed(2)),
    max_score: Number(s.max.toFixed(2)),
    percentage: s.max > 0 ? Number(((s.earned / s.max) * 100).toFixed(1)) : 0,
  }));

  const weakTopics = topicBreakdown
    .filter((t) => t.percentage < 65)
    .sort((a, b) => a.percentage - b.percentage)
    .map((t) => t.topic);

  const recommendedTopics =
    weakTopics.length > 0
      ? weakTopics
      : topicBreakdown
          .filter((t) => t.percentage < 85)
          .sort((a, b) => a.percentage - b.percentage)
          .map((t) => t.topic);

  let aiFeedback = "";
  if (successPercentage >= 85) {
    aiFeedback =
      "Tebrikler! Belgedeki konulara yüksek düzeyde hakimsiniz. Eksik kalan ince detayları gözden geçirerek tam puana ulaşabilirsiniz.";
  } else if (successPercentage >= 65) {
    aiFeedback =
      "İyi bir temel oluşturdunuz. Özellikle zayıf olarak işaretlenen alt başlıklardaki tanımları ve örnek soruları tekrar etmeniz başarınızı hızla artıracaktır.";
  } else {
    aiFeedback =
      "Bu sınavda zorlandığınız konular tespit edildi. Önerilen konularda 'Sınav Odaklı Ders Notu' oluşturup bölüm özetlerini tekrar çalıştıktan sonra yeni bir deneme çözmeniz önerilir.";
  }

  const completedAttempt = await repository.updateExamAttempt(
    user.id,
    attemptId,
    {
      status: "completed",
      completed_at: new Date().toISOString(),
      time_spent_seconds: timeSpentSeconds,
      total_score: Number(totalScore.toFixed(2)),
      max_score: Number(safeMax.toFixed(2)),
      correct_count: correctCount,
      incorrect_count: incorrectCount,
      unanswered_count: unansweredCount,
      success_percentage: successPercentage,
      weak_topics: weakTopics,
      recommended_topics: recommendedTopics,
      topic_breakdown: topicBreakdown,
      ai_feedback: aiFeedback,
    }
  );

  await repository.logStudySession({
    user_id: user.id,
    document_id: examData.exam.document_id,
    course_id: examData.exam.course_id,
    activity_type: "exam_attempt",
    title: `"${examData.exam.title}" tamamlandı (%${successPercentage} başarı)`,
    duration_minutes: Math.max(1, Math.round(timeSpentSeconds / 60)),
    metadata: {
      exam_id: examId,
      attempt_id: attemptId,
      success_percentage: successPercentage,
    },
  });

  const finalAnswers = await repository.getExamAttemptWithAnswers(
    user.id,
    attemptId
  );

  return NextResponse.json({
    attempt: completedAttempt,
    answers: finalAnswers?.answers ?? [],
  });
}

