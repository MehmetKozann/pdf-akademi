import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/session";
import { getPublicSystemStatus } from "@/lib/config/server-config";
import { repository } from "@/lib/db/repository";

export async function GET() {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const [documents, notes, questions, exams, attempts, sessions, courses] =
    await Promise.all([
      repository.listDocuments(user.id),
      repository.listStudyNotes(user.id),
      repository.listQuestions(user.id),
      repository.listExams(user.id),
      repository.listExamAttempts(user.id),
      repository.listStudySessions(user.id, 40),
      repository.listCourses(user.id),
    ]);

  const completedAttempts = attempts.filter((a) => a.status === "completed");
  const averageScore =
    completedAttempts.length > 0
      ? Number(
          (
            completedAttempts.reduce(
              (acc, a) => acc + Number(a.success_percentage),
              0
            ) / completedAttempts.length
          ).toFixed(1)
        )
      : 0;

  // Aggregate topic performance across all completed exam attempts
  const topicAgg = new Map<
    string,
    { earned: number; max: number; attempts: number }
  >();
  for (const att of completedAttempts) {
    for (const tb of att.topic_breakdown || []) {
      const cur = topicAgg.get(tb.topic) ?? { earned: 0, max: 0, attempts: 0 };
      cur.earned += tb.score_earned;
      cur.max += tb.max_score;
      cur.attempts += 1;
      topicAgg.set(tb.topic, cur);
    }
  }

  const topicPerformance = Array.from(topicAgg.entries())
    .map(([topic, val]) => ({
      topic,
      attempts: val.attempts,
      percentage:
        val.max > 0 ? Number(((val.earned / val.max) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => a.percentage - b.percentage);

  const totalStudyMinutes = sessions.reduce(
    (sum, s) => sum + (Number(s.duration_minutes) || 0),
    0
  );

  return NextResponse.json({
    counts: {
      totalDocuments: documents.length,
      totalNotes: notes.length,
      totalQuestions: questions.length,
      favoriteQuestions: questions.filter((q) => q.is_favorite).length,
      totalExams: exams.length,
      completedExams: completedAttempts.length,
      averageExamPercentage: averageScore,
      totalStudyMinutes,
      totalCourses: courses.length,
    },
    recentDocuments: documents.slice(0, 6),
    recentSessions: sessions.slice(0, 12),
    allSessions: sessions,
    completedAttempts: completedAttempts.slice(0, 15),
    topicPerformance,
    courses,
    system: getPublicSystemStatus(),
  });
}

