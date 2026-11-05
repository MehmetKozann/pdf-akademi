"use client";

import React, { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Download,
  HelpCircle,
  Loader2,
  RotateCcw,
  Trophy,
  XCircle,
} from "lucide-react";
import { exportHtmlAsPdf } from "@/lib/export-pdf";
import { cn, formatDurationSeconds } from "@/lib/utils";
import {
  QUESTION_TYPE_LABELS,
  type Exam,
  type ExamAnswer,
  type ExamAttempt,
  type ExamQuestionItem,
} from "@/types/database";

export default function ExamResultPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const { id: examId, attemptId } = use(params);
  const reportRef = useRef<HTMLDivElement>(null);

  const [exam, setExam] = useState<Exam | null>(null);
  const [items, setItems] = useState<ExamQuestionItem[]>([]);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [answers, setAnswers] = useState<ExamAnswer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/exams/${examId}/attempts/${attemptId}`
        );
        if (res.ok) {
          const data = await res.json();
          setExam(data.exam);
          setItems(data.items || []);
          setAttempt(data.attempt);
          setAnswers(data.answers || []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [examId, attemptId]);

  function handleExportResultPdf() {
    if (!exam || !attempt) return;
    const html = reportRef.current?.innerHTML || "";
    exportHtmlAsPdf({
      title: `${exam.title} — Sınav Sonuç ve Analiz Raporu`,
      subtitle: `Başarı: %${attempt.success_percentage} • Puan: ${attempt.total_score}/${attempt.max_score} • Doğru: ${attempt.correct_count} | Yanlış: ${attempt.incorrect_count} | Boş: ${attempt.unanswered_count}`,
      bodyHtml: html,
    });
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#FF6B5B]" />
        Sınav sonuç raporunuz yükleniyor...
      </div>
    );
  }

  if (!exam || !attempt) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-600 dark:text-slate-400 mb-3">
          Sınav sonucu bulunamadı.
        </p>
        <Link
          href="/panel/deneme-sinavlari"
          className="text-sm font-semibold text-[#FF6B5B]"
        >
          Deneme Sınavlarıma Dön
        </Link>
      </div>
    );
  }

  const answerMap = new Map(answers.map((a) => [a.question_id, a]));

  return (
    <div className="space-y-8">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/panel/deneme-sinavlari"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#FF6B5B] mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Deneme Sınavlarıma Dön
          </Link>
          <h1 className="text-2xl font-bold text-[#14213D] dark:text-white">
            {exam.title} — Sonuç Analizi
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportResultPdf}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#14213D]/15 dark:border-slate-700 bg-white dark:bg-[#14213D] px-4 py-2.5 text-xs font-semibold hover:border-[#FF6B5B]"
          >
            <Download className="w-4 h-4" />
            Sonuç Raporunu PDF İndir
          </button>
          <Link
            href={`/panel/ders-notlari?documentId=${exam.document_id}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#14213D] hover:bg-[#1E3158] dark:bg-[#FF6B5B] dark:hover:bg-[#E85646] text-white px-4 py-2.5 text-xs font-semibold"
          >
            <BookOpen className="w-4 h-4" />
            Eksik Konular İçin Not Üret
          </Link>
        </div>
      </div>

      <div ref={reportRef} className="space-y-8">
        {/* Score Summary Banner */}
        <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 sm:p-8 shadow-2xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="rounded-xl bg-[#14213D] dark:bg-[#FF6B5B] p-4 text-center text-white">
              <Trophy className="w-5 h-5 text-[#FF6B5B] dark:text-white mx-auto mb-1" />
              <div className="text-2xl font-bold">
                %{attempt.success_percentage}
              </div>
              <div className="text-xs text-[#F4EDE0]/80 dark:text-white/80 mt-0.5">
                Başarı Oranı
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-4 text-center">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {attempt.total_score}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Toplam Puan (/{attempt.max_score})
              </div>
            </div>

            <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 p-4 text-center">
              <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {attempt.correct_count}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Doğru</div>
            </div>

            <div className="rounded-xl bg-rose-50/70 dark:bg-rose-950/30 p-4 text-center">
              <div className="text-2xl font-bold text-rose-700 dark:text-rose-400">
                {attempt.incorrect_count}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Yanlış</div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-4 text-center">
              <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                {attempt.unanswered_count}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Boş</div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-4 text-center">
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-white pt-0.5">
                {formatDurationSeconds(attempt.time_spent_seconds)}
              </div>
              <div className="text-xs text-slate-500 mt-1">Tamamlama Süresi</div>
            </div>
          </div>

          {attempt.ai_feedback && (
            <div className="mt-6 rounded-xl bg-[#FAF6EE] dark:bg-slate-950 border border-[#14213D]/10 dark:border-slate-800 p-4 text-sm text-slate-700 dark:text-slate-300">
              <strong className="text-[#14213D] dark:text-[#FF6B5B]">
                Akademik Değerlendirme:{" "}
              </strong>
              {attempt.ai_feedback}
            </div>
          )}
        </div>

        {/* Weak Topics & Topic Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 shadow-2xs space-y-4">
            <h2 className="text-base font-bold">
              Konu Bazlı Performans Dağılımı
            </h2>
            {attempt.topic_breakdown?.length ? (
              <div className="space-y-3.5">
                {attempt.topic_breakdown.map((tb) => (
                  <div key={tb.topic}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {tb.topic}
                      </span>
                      <span className="font-bold text-[#14213D] dark:text-[#FF6B5B]">
                        %{tb.percentage} ({tb.correct}/{tb.total} soru)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          tb.percentage >= 75
                            ? "bg-emerald-500"
                            : tb.percentage >= 50
                            ? "bg-amber-500"
                            : "bg-rose-500"
                        )}
                        style={{ width: `${Math.min(100, tb.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Konu verisi bulunmuyor.</p>
            )}
          </div>

          <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 shadow-2xs space-y-4">
            <h2 className="text-base font-bold flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-[#FF6B5B]" />
              Zayıf Konular ve Tekrar Çalışma Önerileri
            </h2>

            {attempt.weak_topics?.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  Aşağıdaki konularda başarı oranınız %65&apos;in altında kaldı.
                  Kaynak PDF&apos;ten bu bölümleri tekrar etmeniz önerilir:
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {attempt.weak_topics.map((wt) => (
                    <span
                      key={wt}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {wt}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 p-4 text-xs text-emerald-800 dark:text-emerald-300">
                Kritik düzeyde zayıf konu tespit edilmedi! Tüm konularda dengeli
                bir performans sergilediniz.
              </div>
            )}

            {attempt.recommended_topics?.length > 0 && (
              <div className="pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Pekiştirilmesi Önerilen Başlıklar
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {attempt.recommended_topics.map((rt) => (
                    <li key={rt} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B5B]" />
                      <span>{rt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Detailed Question-by-Question Review */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold">
            Detaylı Soru Çözümleri ve Rubrik Değerlendirmeleri
          </h2>

          {items.map((item, idx) => {
            const q = item.question;
            if (!q) return null;
            const ans = answerMap.get(q.id);
            const userText = ans?.user_answer || "";
            const isUnanswered = !userText.trim();

            return (
              <div
                key={item.id}
                className="card rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xs space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-xs rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1">
                      Soru {idx + 1} • {QUESTION_TYPE_LABELS[q.question_type]}
                    </span>
                    <span className="text-xs text-slate-500">
                      Konu: {q.topic}
                      {q.source_pages?.length
                        ? ` • Sayfa ${q.source_pages.join(", ")}`
                        : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isUnanswered ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        <HelpCircle className="w-3.5 h-3.5" />
                        Boş (0 / {item.points}p)
                      </span>
                    ) : ans?.is_correct ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Doğru ({ans.score_awarded} / {item.points}p)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                        <XCircle className="w-3.5 h-3.5" />
                        Geliştirilmeli ({ans?.score_awarded ?? 0} /{" "}
                        {item.points}p)
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-sm sm:text-base font-semibold">
                  {q.question_text}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3.5 border border-slate-200/70 dark:border-slate-800">
                    <div className="font-bold text-slate-500 mb-1">
                      Sizin Cevabınız:
                    </div>
                    <div className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                      {isUnanswered ? "(Boş bırakıldı)" : userText}
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#FAF6EE] dark:bg-slate-950 p-3.5 border border-[#14213D]/15 dark:border-slate-800">
                    <div className="font-bold text-[#14213D] dark:text-[#FF6B5B] mb-1">
                      Doğru / Örnek Model Cevap:
                    </div>
                    <div className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                      {q.question_type === "classical"
                        ? q.model_answer
                        : q.question_type === "matching"
                        ? q.matching_pairs
                            .map((p) => `${p.left} → ${p.right}`)
                            .join("\n")
                        : q.correct_answer}
                    </div>
                  </div>
                </div>

                {/* Classical AI Rubric Evaluation Details */}
                {ans?.ai_evaluation && (
                  <div className="rounded-xl border border-[#FF6B5B]/40 bg-[#FF6B5B]/8 dark:bg-[#FF6B5B]/15 p-4 text-xs space-y-2.5">
                    <div className="font-bold text-[#14213D] dark:text-[#FF6B5B]">
                      YZ Şeffaf Rubrik Değerlendirmesi
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">
                      {ans.ai_evaluation.feedback}
                    </p>
                    {ans.ai_evaluation.missing_points?.length > 0 && (
                      <div>
                        <span className="font-semibold text-rose-700 dark:text-rose-400">
                          Eksik Kalan Noktalar:{" "}
                        </span>
                        <span>
                          {ans.ai_evaluation.missing_points.join(" • ")}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {exam.config?.include_explanations !== false &&
                  q.explanation && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
                      <strong className="text-slate-800 dark:text-slate-200">
                        Açıklama:{" "}
                      </strong>
                      {q.explanation}
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

