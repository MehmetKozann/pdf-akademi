"use client";

import React, {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  Send,
} from "lucide-react";
import { useApp } from "@/components/providers/app-providers";
import { cn, formatDurationSeconds } from "@/lib/utils";
import {
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  type Exam,
  type ExamAnswer,
  type ExamAttempt,
  type ExamQuestionItem,
} from "@/types/database";

function InteractiveExamInner({ examId }: { examId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const attemptIdParam = searchParams.get("attemptId") || "";
  const { toast } = useApp();

  const [exam, setExam] = useState<Exam | null>(null);
  const [items, setItems] = useState<ExamQuestionItem[]>([]);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [markedReview, setMarkedReview] = useState<Record<string, boolean>>({});
  const [immediateRevealed, setImmediateRevealed] = useState<
    Record<string, boolean>
  >({});

  const [remainingSeconds, setRemainingSeconds] = useState(2400);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [autoSaveState, setAutoSaveState] = useState<
    "idle" | "saving" | "saved"
  >("idle");
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const autoSubmitTriggered = useRef(false);

  // Initialize attempt & load questions
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        let activeAttemptId = attemptIdParam;
        if (!activeAttemptId) {
          const createRes = await fetch(`/api/exams/${examId}/attempts`, {
            method: "POST",
          });
          const createData = await createRes.json();
          if (!createRes.ok || !createData.attempt) {
            toast("Sınav oturumu başlatılamadı.", "error");
            router.push("/panel/deneme-sinavlari");
            return;
          }
          activeAttemptId = createData.attempt.id;
        }

        const res = await fetch(
          `/api/exams/${examId}/attempts/${activeAttemptId}`
        );
        if (!res.ok) {
          toast("Sınav verileri alınamadı.", "error");
          router.push("/panel/deneme-sinavlari");
          return;
        }
        const data = await res.json();
        if (data.attempt.status === "completed") {
          router.replace(
            `/panel/deneme-sinavlari/${examId}/sonuc/${data.attempt.id}`
          );
          return;
        }

        setExam(data.exam);
        setItems(data.items || []);
        setAttempt(data.attempt);

        const ansMap: Record<string, string> = {};
        const revMap: Record<string, boolean> = {};
        for (const a of (data.answers || []) as ExamAnswer[]) {
          ansMap[a.question_id] = a.user_answer || "";
          revMap[a.question_id] = Boolean(a.is_marked_for_review);
        }
        setAnswers(ansMap);
        setMarkedReview(revMap);

        const totalAllowedSec = (data.exam.duration_minutes || 40) * 60;
        const spent = Number(data.attempt.time_spent_seconds) || 0;
        setElapsedSeconds(spent);
        setRemainingSeconds(Math.max(10, totalAllowedSec - spent));
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [attemptIdParam, examId, router, toast]);

  const submitExam = useCallback(async () => {
    if (!attempt || !exam || submitting) return;
    setSubmitting(true);
    setConfirmSubmitOpen(false);

    try {
      const payloadAnswers = items
        .filter((item) => item.question)
        .map((item) => ({
          questionId: item.question!.id,
          examQuestionId: item.id,
          userAnswer: answers[item.question!.id] || "",
          isMarkedForReview: Boolean(markedReview[item.question!.id]),
        }));

      const res = await fetch(
        `/api/exams/${exam.id}/attempts/${attempt.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timeSpentSeconds: elapsedSeconds,
            answers: payloadAnswers,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Sınav gönderilirken hata oluştu.", "error");
        setSubmitting(false);
        return;
      }

      toast(
        "Sınavınız tamamlandı ve cevaplarınız değerlendirildi!",
        "success"
      );
      router.replace(
        `/panel/deneme-sinavlari/${exam.id}/sonuc/${attempt.id}`
      );
    } catch {
      toast("Ağ hatası oluştu. Lütfen tekrar deneyin.", "error");
      setSubmitting(false);
    }
  }, [
    answers,
    attempt,
    elapsedSeconds,
    exam,
    items,
    markedReview,
    router,
    submitting,
    toast,
  ]);

  // Live countdown timer
  useEffect(() => {
    if (loading || !attempt || submitting) return;
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
      setRemainingSeconds((rem) => {
        if (rem <= 1) {
          clearInterval(timer);
          if (!autoSubmitTriggered.current) {
            autoSubmitTriggered.current = true;
            submitExam();
          }
          return 0;
        }
        return rem - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [loading, attempt, submitting, submitExam]);

  // Auto-save current question answer to backend (debounced)
  const persistAnswer = useCallback(
    async (
      qId: string,
      eqId: string,
      val: string,
      reviewFlag: boolean,
      spent: number
    ) => {
      if (!attempt || !exam) return;
      setAutoSaveState("saving");
      try {
        await fetch(`/api/exams/${exam.id}/attempts/${attempt.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: qId,
            examQuestionId: eqId,
            userAnswer: val,
            isMarkedForReview: reviewFlag,
            timeSpentSeconds: spent,
          }),
        });
        setAutoSaveState("saved");
      } catch {
        setAutoSaveState("idle");
      }
    },
    [attempt, exam]
  );

  const currentItem = items[currentIndex];
  const currentQuestion = currentItem?.question;

  function updateAnswerValue(val: string) {
    if (!currentQuestion || !currentItem) return;
    const qId = currentQuestion.id;
    setAnswers((prev) => ({ ...prev, [qId]: val }));
    persistAnswer(
      qId,
      currentItem.id,
      val,
      Boolean(markedReview[qId]),
      elapsedSeconds
    );
  }

  function toggleMarkForReview() {
    if (!currentQuestion || !currentItem) return;
    const qId = currentQuestion.id;
    const nextVal = !markedReview[qId];
    setMarkedReview((prev) => ({ ...prev, [qId]: nextVal }));
    persistAnswer(
      qId,
      currentItem.id,
      answers[qId] || "",
      nextVal,
      elapsedSeconds
    );
  }

  // Shuffled right-hand options for matching questions
  const matchingRightOptions = useMemo(() => {
    if (
      !currentQuestion ||
      currentQuestion.question_type !== "matching" ||
      !currentQuestion.matching_pairs
    ) {
      return [];
    }
    return [...currentQuestion.matching_pairs.map((p) => p.right)].sort(
      (a, b) => a.localeCompare(b, "tr")
    );
  }, [currentQuestion]);

  if (loading || !exam || !currentQuestion) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4EDE0] dark:bg-[#0B1120] text-sm text-slate-500">
        <Loader2 className="w-7 h-7 animate-spin text-[#FF6B5B] mb-3" />
        Sınav ortamı hazırlanıyor...
      </div>
    );
  }

  const answeredCount = items.filter((i) => {
    const q = i.question;
    return q && (answers[q.id] || "").trim().length > 0;
  }).length;
  const unansweredCount = items.length - answeredCount;
  const reviewCount = Object.values(markedReview).filter(Boolean).length;
  const progressPercent = Math.round((answeredCount / items.length) * 100);

  const currentAns = answers[currentQuestion.id] || "";
  let parsedMatchingAns: Record<string, string> = {};
  if (currentQuestion.question_type === "matching" && currentAns) {
    try {
      parsedMatchingAns = JSON.parse(currentAns);
    } catch {
      parsedMatchingAns = {};
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4EDE0] dark:bg-[#0B1120] text-[#14213D] dark:text-slate-100">
      {/* Sticky Exam Top Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#14213D] text-white px-4 sm:px-6 h-16 flex items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/panel/deneme-sinavlari"
            className="text-xs font-semibold text-[#F4EDE0]/75 hover:text-white shrink-0"
          >
            ← Çıkış
          </Link>
          <div className="h-4 w-px bg-white/15" />
          <div className="min-w-0">
            <h1 className="text-sm font-bold truncate">{exam.title}</h1>
            <p className="text-[11px] text-[#F4EDE0]/70">
              {answeredCount} / {items.length} soru cevaplandı (%{progressPercent})
              {autoSaveState === "saving" && " • Kaydediliyor..."}
              {autoSaveState === "saved" && " • Otomatik kaydedildi"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Countdown Timer */}
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 font-mono text-sm font-bold border",
              remainingSeconds < 300
                ? "bg-red-500/20 border-red-400 text-red-200 animate-pulse"
                : "bg-white/10 border-white/15 text-[#F4EDE0]"
            )}
          >
            <Clock className="w-4 h-4 text-[#FF6B5B]" />
            {formatDurationSeconds(remainingSeconds)}
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={() => setConfirmSubmitOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF6B5B] hover:bg-[#E85646] text-white text-xs sm:text-sm font-semibold px-4 py-2.5 shadow-2xs transition-colors"
          >
            <Send className="w-4 h-4" />
            Sınavı Bitir
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-[#14213D]/15 dark:bg-slate-800">
        <div
          className="h-full bg-[#FF6B5B] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main Split Grid: Question Workspace + Question Palette */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Question Card (8 cols) */}
        <div className="lg:col-span-8 flex flex-col justify-between rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 sm:p-8 shadow-2xs">
          <div className="space-y-6">
            {/* Question Metadata Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-white/10 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-[#14213D] dark:bg-[#FF6B5B] text-white px-3 py-1 text-xs font-bold">
                  Soru {currentIndex + 1} / {items.length}
                </span>
                <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                  {QUESTION_TYPE_LABELS[currentQuestion.question_type]}
                </span>
                <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                  {DIFFICULTY_LABELS[currentQuestion.difficulty]} •{" "}
                  {currentItem.points} Puan
                </span>
              </div>

              <button
                type="button"
                onClick={toggleMarkForReview}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition-colors",
                  markedReview[currentQuestion.id]
                    ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-700 dark:text-amber-300"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-300"
                )}
              >
                <Bookmark
                  className={cn(
                    "w-3.5 h-3.5",
                    markedReview[currentQuestion.id] &&
                      "fill-amber-500 text-amber-500"
                  )}
                />
                {markedReview[currentQuestion.id]
                  ? "Gözden Geçirilecek"
                  : "Gözden Geçir İşaretle"}
              </button>
            </div>

            {/* Question Stem */}
            <div className="text-base sm:text-lg font-semibold leading-relaxed text-slate-900 dark:text-white">
              {currentQuestion.question_text}
            </div>

            {/* Answer Controls per Question Type */}
            {currentQuestion.question_type === "multiple_choice" && (
              <div className="space-y-2.5">
                {currentQuestion.options.map((opt) => {
                  const selected = currentAns === opt.label;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => updateAnswerValue(opt.label)}
                      className={cn(
                        "w-full text-left rounded-xl border p-4 text-sm flex items-start gap-3.5 transition-all",
                        selected
                          ? "border-[#FF6B5B] bg-[#FF6B5B]/8 dark:bg-[#FF6B5B]/15 ring-1 ring-[#FF6B5B]"
                          : "border-slate-200 dark:border-white/10 hover:border-[#FF6B5B]"
                      )}
                    >
                      <span
                        className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                          selected
                            ? "bg-[#FF6B5B] text-white"
                            : "bg-[#F4EDE0] dark:bg-white/10 text-[#14213D] dark:text-slate-300"
                        )}
                      >
                        {opt.label}
                      </span>
                      <span className="pt-0.5 leading-relaxed">{opt.text}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {currentQuestion.question_type === "true_false" && (
              <div className="grid grid-cols-2 gap-4 max-w-md">
                {["Doğru", "Yanlış"].map((val) => {
                  const selected = currentAns === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => updateAnswerValue(val)}
                      className={cn(
                        "rounded-xl border py-4 px-5 text-sm font-bold transition-all",
                        selected
                          ? "border-[#FF6B5B] bg-[#FF6B5B] text-white shadow-xs"
                          : "border-slate-200 dark:border-white/10 hover:border-[#FF6B5B]"
                      )}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            )}

            {currentQuestion.question_type === "fill_blank" && (
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
                  Cevabınız
                </label>
                <input
                  type="text"
                  value={currentAns}
                  onChange={(e) => updateAnswerValue(e.target.value)}
                  placeholder="Boşluğa gelmesi gereken ifadeyi yazınız..."
                  className="w-full max-w-xl rounded-xl border border-slate-300 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B5B]"
                />
              </div>
            )}

            {currentQuestion.question_type === "classical" && (
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
                  Açık Uçlu Cevabınız (Yapay Zeka Rubrik Değerlendirmesine Tabi Tutulacaktır)
                </label>
                <textarea
                  rows={8}
                  value={currentAns}
                  onChange={(e) => updateAnswerValue(e.target.value)}
                  placeholder="Akademik cevabınızı, tanımları ve örnekleri ile birlikte detaylıca yazınız..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950 p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#FF6B5B]"
                />
              </div>
            )}

            {currentQuestion.question_type === "matching" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Her terim için karşılık gelen doğru açıklamayı seçiniz:
                </p>
                {currentQuestion.matching_pairs.map((pair, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#FAF6EE] dark:bg-slate-950 p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center"
                  >
                    <div className="text-sm font-semibold">{pair.left}</div>
                    <select
                      value={parsedMatchingAns[pair.left] || ""}
                      onChange={(e) => {
                        const nextObj = {
                          ...parsedMatchingAns,
                          [pair.left]: e.target.value,
                        };
                        updateAnswerValue(JSON.stringify(nextObj));
                      }}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#14213D] px-3 py-2 text-xs"
                    >
                      <option value="">Eşleşme seçiniz...</option>
                      {matchingRightOptions.map((opt, oIdx) => (
                        <option key={oIdx} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* Immediate Answer Mode (if configured on exam) */}
            {exam.config?.immediate_answers && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setImmediateRevealed((prev) => ({
                      ...prev,
                      [currentQuestion.id]: !prev[currentQuestion.id],
                    }))
                  }
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF6B5B] hover:underline"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {immediateRevealed[currentQuestion.id]
                    ? "Anlık Cevabı Gizle"
                    : "Anlık Cevabı ve Açıklamayı Gör"}
                </button>
                {immediateRevealed[currentQuestion.id] && (
                  <div className="mt-2 rounded-xl bg-[#FAF6EE] dark:bg-slate-950 border border-[#FF6B5B]/40 p-4 text-xs space-y-1.5">
                    {currentQuestion.correct_answer && (
                      <div className="font-bold text-[#14213D] dark:text-[#FF6B5B]">
                        Doğru Cevap: {currentQuestion.correct_answer}
                      </div>
                    )}
                    {currentQuestion.model_answer && (
                      <div>
                        <strong>Model Cevap:</strong>{" "}
                        {currentQuestion.model_answer}
                      </div>
                    )}
                    <p className="text-slate-600 dark:text-slate-300">
                      {currentQuestion.explanation}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Prev / Next Navigation */}
          <div className="mt-8 pt-5 border-t border-slate-100 dark:border-white/10 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs sm:text-sm font-semibold disabled:opacity-40 hover:border-[#FF6B5B]"
            >
              <ArrowLeft className="w-4 h-4" />
              Önceki Soru
            </button>

            {currentIndex < items.length - 1 ? (
              <button
                type="button"
                onClick={() =>
                  setCurrentIndex((i) => Math.min(items.length - 1, i + 1))
                }
                className="inline-flex items-center gap-2 rounded-xl bg-[#14213D] hover:bg-[#1E3158] dark:bg-[#FF6B5B] dark:hover:bg-[#E85646] text-white px-5 py-2.5 text-xs sm:text-sm font-semibold"
              >
                Sonraki Soru
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF6B5B] hover:bg-[#E85646] text-white px-5 py-2.5 text-xs sm:text-sm font-semibold"
              >
                <CheckCircle2 className="w-4 h-4" />
                Sınavı Tamamla
              </button>
            )}
          </div>
        </div>

        {/* Question Navigator Palette (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-5 shadow-2xs">
            <h2 className="text-sm font-bold mb-3">Soru Gezgini</h2>
            <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-5 gap-2">
              {items.map((item, idx) => {
                const q = item.question;
                const hasAns = q && (answers[q.id] || "").trim().length > 0;
                const isMarked = q && markedReview[q.id];
                const isCurrent = idx === currentIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={cn(
                      "h-10 rounded-xl text-xs font-bold border transition-all",
                      isCurrent && "ring-2 ring-[#FF6B5B] ring-offset-1",
                      isMarked
                        ? "bg-amber-100 dark:bg-amber-950/60 border-amber-400 text-amber-800 dark:text-amber-300"
                        : hasAns
                        ? "bg-[#14213D] dark:bg-[#FF6B5B] border-[#14213D] dark:border-[#FF6B5B] text-white"
                        : "bg-[#FAF6EE] dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                    )}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/10 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#14213D] dark:bg-[#FF6B5B]" />
                Cevaplandı ({answeredCount})
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-400" />
                İşaretli ({reviewCount})
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded border border-slate-300 bg-[#FAF6EE]" />
                Boş ({unansweredCount})
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal Before Submitting */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#14213D]/60 backdrop-blur-xs"
            onClick={() => setConfirmSubmitOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#14213D]/15 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">
                  Sınavı Teslim Etmek İstiyor musunuz?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Teslim ettikten sonra cevaplarınız kilitlenecek ve klasik
                  sorularınız dahil tüm sınavınız puanlanacaktır.
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-[#FAF6EE] dark:bg-slate-950 p-3.5 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="font-bold text-base text-[#14213D] dark:text-[#FF6B5B]">
                  {answeredCount}
                </div>
                <div className="text-slate-500">Cevaplanan</div>
              </div>
              <div>
                <div className="font-bold text-base text-slate-700 dark:text-slate-300">
                  {unansweredCount}
                </div>
                <div className="text-slate-500">Boş Bırakılan</div>
              </div>
              <div>
                <div className="font-bold text-base text-amber-600">
                  {reviewCount}
                </div>
                <div className="text-slate-500">Gözden Geçir</div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Sınava Dön
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={submitExam}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF6B5B] hover:bg-[#E85646] text-white px-5 py-2 text-xs font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Değerlendiriliyor...
                  </>
                ) : (
                  "Evet, Sınavı Bitir ve Değerlendir"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Grading Overlay while AI evaluates classical answers */}
      {submitting && (
        <div className="fixed inset-0 z-50 bg-[#14213D]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="rounded-2xl bg-white dark:bg-[#14213D] p-8 max-w-sm w-full text-center space-y-3 shadow-2xl">
            <Loader2 className="w-9 h-9 animate-spin text-[#FF6B5B] mx-auto" />
            <h3 className="font-bold text-base">
              Sınavınız Değerlendiriliyor...
            </h3>
            <p className="text-xs text-slate-500">
              Cevaplarınız kontrol ediliyor, klasik cevaplarınız rubriğe göre
              puanlanıyor ve konu analiziniz hazırlanıyor.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InteractiveExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          Yükleniyor...
        </div>
      }
    >
      <InteractiveExamInner examId={id} />
    </Suspense>
  );
}

