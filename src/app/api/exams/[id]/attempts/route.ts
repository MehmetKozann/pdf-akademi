import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id: examId } = await context.params;
  const examData = await repository.getExamWithQuestions(user.id, examId);
  if (!examData) {
    return NextResponse.json({ error: "Sınav bulunamadı." }, { status: 404 });
  }

  let forceNew = false;
  try {
    const body = (await req.json()) as { forceNew?: boolean };
    forceNew = Boolean(body?.forceNew);
  } catch {
    // Empty body allowed
  }

  if (!forceNew) {
    const existing = await repository.listExamAttempts(user.id, examId);
    const inProgress = existing.find((a) => a.status === "in_progress");
    if (inProgress) {
      return NextResponse.json({ attempt: inProgress });
    }
  }

  const maxScore = Number(
    examData.items.reduce((acc, item) => acc + Number(item.points), 0).toFixed(2)
  );
  const now = new Date().toISOString();

  const attempt = await repository.createExamAttempt({
    id: crypto.randomUUID(),
    exam_id: examId,
    user_id: user.id,
    status: "in_progress",
    started_at: now,
    completed_at: null,
    time_spent_seconds: 0,
    total_score: 0,
    max_score: maxScore || 100,
    correct_count: 0,
    incorrect_count: 0,
    unanswered_count: examData.items.length,
    success_percentage: 0,
    weak_topics: [],
    recommended_topics: [],
    topic_breakdown: [],
    ai_feedback: "",
    created_at: now,
  });

  return NextResponse.json({ attempt }, { status: 201 });
}

