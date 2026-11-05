"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckSquare,
  ClipboardCheck,
  Clock,
  Loader2,
  Play,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import { useApp } from "@/components/providers/app-providers";
import { cn, formatDateTR } from "@/lib/utils";
import {
  DIFFICULTY_LABELS,
  type DocumentRecord,
  type Exam,
  type ExamAttempt,
  type ExamDifficulty,
} from "@/types/database";

function PracticeExamsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDocId = searchParams.get("documentId") || "";
  const { toast } = useApp();

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  // Exam Configuration Builder State
  const [selectedDocId, setSelectedDocId] = useState(initialDocId);
  const [title, setTitle] = useState("");
  const [examType, setExamType] = useState("Üniversite Vize / Final Simülasyonu");
  const [difficulty, setDifficulty] = useState<ExamDifficulty>("mixed");
  const [durationMinutes, setDurationMinutes] = useState(40);
  const [mcqOptionCount, setMcqOptionCount] = useState<4 | 5>(5);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [immediateAnswers, setImmediateAnswers] = useState(false);
  const [includeExplanations, setIncludeExplanations] = useState(true);

  const [distMcq, setDistMcq] = useState(6);
  const [distClassical, setDistClassical] = useState(2);
  const [distTf, setDistTf] = useState(2);
  const [distFill, setDistFill] = useState(0);
  const [distMatching, setDistMatching] = useState(0);

  const [creating, setCreating] = useState(false);
  const [startingExamId, setStartingExamId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, examsRes] = await Promise.all([
        fetch("/api/documents"),
        fetch("/api/exams"),
      ]);
      if (docsRes.ok) {
        const d = await docsRes.json();
        const ready = (d.documents || []).filter(
          (doc: DocumentRecord) => doc.status === "ready"
        );
        setDocuments(ready);
        if (!selectedDocId && ready.length > 0) {
          setSelectedDocId(initialDocId || ready[0].id);
        }
      }
      if (examsRes.ok) {
        const e = await examsRes.json();
        setExams(e.exams || []);
        setAttempts(e.attempts || []);
      }
    } finally {
      setLoading(false);
    }
  }, [initialDocId, selectedDocId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeDoc = documents.find((d) => d.id === selectedDocId);
  const availableChapters =
    activeDoc?.extracted_metadata?.chapters?.map((c) => c.title) || [];

  const totalQuestions =
    distMcq + distClassical + distTf + distFill + distMatching;

  function applyPreset(preset: "standard" | "university_full" | "quick_test") {
    if (preset === "standard") {
      setDistMcq(6);
      setDistClassical(2);
      setDistTf(2);
      setDistFill(0);
      setDistMatching(0);
      setDurationMinutes(35);
    } else if (preset === "university_full") {
      setDistMcq(10);
      setDistClassical(4);
      setDistTf(4);
      setDistFill(2);
      setDistMatching(0);
      setDurationMinutes(60);
    } else {
      setDistMcq(8);
      setDistClassical(0);
      setDistTf(2);
      setDistFill(0);
      setDistMatching(0);
      setDurationMinutes(20);
    }
  }

  function toggleTopic(t: string) {
    setSelectedTopics((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  async function handleCreateExam(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDocId) {
      toast("Lütfen bir kaynak PDF belgesi seçiniz.", "error");
      return;
    }
    if (totalQuestions < 1) {
      toast("En az 1 soru içeren bir dağılım belirleyiniz.", "error");
      return;
    }

    setCreating(true);
    try {
      const computedTitle =
        title.trim() ||
        `${activeDoc?.title || "Ders"} — ${examType} (${totalQuestions} Soru)`;

      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: selectedDocId,
          title: computedTitle,
          examType,
          difficulty,
          durationMinutes,
          topics: selectedTopics,
          mcqOptionCount,
          immediateAnswers,
          includeExplanations,
          distribution: {
            multiple_choice: distMcq,
            classical: distClassical,
            true_false: distTf,
            fill_blank: distFill,
            matching: distMatching,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Deneme sınavı oluşturulamadı.", "error");
        return;
      }

      toast("Deneme sınavı başarıyla hazırlandı! Sınava yönlendiriliyorsunuz...", "success");
      await handleStartExam(data.exam.id, true);
    } finally {
      setCreating(false);
    }
  }

  async function handleStartExam(examId: string, forceNew = false) {
    setStartingExamId(examId);
    try {
      const res = await fetch(`/api/exams/${examId}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceNew }),
      });
      const data = await res.json();
      if (res.ok && data.attempt) {
        router.push(
          `/panel/deneme-sinavlari/${examId}/coz?attemptId=${data.attempt.id}`
        );
      } else {
        toast(data.error || "Sınav oturumu başlatılamadı.", "error");
      }
    } finally {
      setStartingExamId(null);
    }
  }

  async function handleDeleteExam(examId: string) {
    if (!window.confirm("Bu deneme sınavını silmek istediğinize emin misiniz?")) {
      return;
    }
    const res = await fetch(`/api/exams/${examId}`, { method: "DELETE" });
    if (res.ok) {
      setExams((prev) => prev.filter((e) => e.id !== examId));
      toast("Deneme sınavı silindi.", "info");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Deneme Sınavı Yapılandırıcı ve Sınav Merkezi
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Soru dağılımını, zorluk düzeyini, süreyi ve kapsanacak bölümleri
          belirleyerek gerçekçi üniversite sınavı simülasyonu oluşturun.
        </p>
      </div>

      {/* Exam Builder Form */}
      <form
        onSubmit={handleCreateExam}
        className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 shadow-2xs space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-white/10 pb-4">
          <h2 className="text-base font-bold">Yeni Deneme Sınavı Yapılandır</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">Hızlı Şablonlar:</span>
            <button
              type="button"
              onClick={() => applyPreset("standard")}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 font-medium hover:border-[#FF6B5B]"
            >
              Dengeli Karma (10 Soru)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("university_full")}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 font-medium hover:border-[#FF6B5B]"
            >
              Kapsamlı Vize/Final (20 Soru)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("quick_test")}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 font-medium hover:border-[#FF6B5B]"
            >
              Hızlı Test (10 Soru)
            </button>
          </div>
        </div>

        {/* Row 1: Document, Title, Exam Type */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Kaynak PDF Belgesi
            </label>
            {documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-2.5 text-xs text-slate-500 flex items-center justify-between">
                <span>Hazır PDF yok</span>
                <Link
                  href="/panel/pdf-yukle"
                  className="font-semibold text-[#FF6B5B]"
                >
                  PDF Yükle →
                </Link>
              </div>
            ) : (
              <select
                value={selectedDocId}
                onChange={(e) => {
                  setSelectedDocId(e.target.value);
                  setSelectedTopics([]);
                }}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
              >
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title} ({doc.page_count} sayfa)
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Sınav Türü
            </label>
            <select
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
            >
              <option value="Üniversite Vize Simülasyonu">
                Üniversite Vize Simülasyonu
              </option>
              <option value="Üniversite Final Simülasyonu">
                Üniversite Final Simülasyonu
              </option>
              <option value="Konu Tarama Sınavı">Konu Tarama Sınavı</option>
              <option value="Klasik Ağırlıklı Akademik Sınav">
                Klasik Ağırlıklı Akademik Sınav
              </option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Özel Sınav Adı (İsteğe Bağlı)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Otomatik adlandırılır..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
            />
          </div>
        </div>

        {/* Row 2: Question Distribution */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Soru Dağılımı
            </label>
            <span className="text-xs font-bold text-[#FF6B5B]">
              Toplam Soru: {totalQuestions}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              {
                label: "Çoktan Seçmeli",
                val: distMcq,
                set: setDistMcq,
                max: 30,
              },
              {
                label: "Klasik (Açık Uçlu)",
                val: distClassical,
                set: setDistClassical,
                max: 15,
              },
              {
                label: "Doğru / Yanlış",
                val: distTf,
                set: setDistTf,
                max: 20,
              },
              {
                label: "Boşluk Doldurma",
                val: distFill,
                set: setDistFill,
                max: 15,
              },
              {
                label: "Eşleştirme",
                val: distMatching,
                set: setDistMatching,
                max: 8,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-[#14213D]/10 dark:border-slate-800 bg-[#FAF6EE] dark:bg-slate-950 p-3"
              >
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  {item.label}
                </span>
                <input
                  type="number"
                  min={0}
                  max={item.max}
                  value={item.val}
                  onChange={(e) =>
                    item.set(
                      Math.max(0, Math.min(item.max, Number(e.target.value)))
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm font-bold text-slate-900 dark:text-white"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Row 3: Difficulty, Duration, MCQ Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Zorluk Düzeyi
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as ExamDifficulty)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
            >
              <option value="mixed">Karma (Kolay + Orta + Zor)</option>
              <option value="easy">Kolay</option>
              <option value="medium">Orta</option>
              <option value="hard">Zor</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Sınav Süresi (Dakika)
            </label>
            <input
              type="number"
              min={5}
              max={240}
              value={durationMinutes}
              onChange={(e) =>
                setDurationMinutes(
                  Math.max(5, Math.min(240, Number(e.target.value)))
                )
              }
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Test Şık Sayısı
            </label>
            <select
              value={mcqOptionCount}
              onChange={(e) =>
                setMcqOptionCount(Number(e.target.value) as 4 | 5)
              }
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
            >
              <option value={5}>5 Seçenekli (A-E)</option>
              <option value={4}>4 Seçenekli (A-D)</option>
            </select>
          </div>
        </div>

        {/* Chapters / Topics Selection */}
        {availableChapters.length > 0 && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Kapsanacak Bölümler (Seçilmezse Tüm Bölümler Kapsanır)
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedTopics([])}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors",
                  selectedTopics.length === 0
                    ? "bg-[#14213D] dark:bg-[#FF6B5B] text-white border-[#14213D] dark:border-[#FF6B5B]"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                )}
              >
                Tüm Bölümler
              </button>
              {availableChapters.map((ch) => {
                const active = selectedTopics.includes(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => toggleTopic(ch)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
                      active
                        ? "bg-[#FF6B5B]/12 border-[#FF6B5B] text-[#14213D] dark:text-[#FF6B5B]"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                    )}
                  >
                    {ch}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Options & Submit */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-700 dark:text-slate-300">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={immediateAnswers}
                onChange={(e) => setImmediateAnswers(e.target.checked)}
                className="rounded accent-[#FF6B5B]"
              />
              <span>Sınav Esnasında Cevabı Anında Göster (Çalışma Modu)</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeExplanations}
                onChange={(e) => setIncludeExplanations(e.target.checked)}
                className="rounded accent-[#FF6B5B]"
              />
              <span>Detaylı Çözüm Açıklamalarını Dahil Et</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={creating || documents.length === 0 || totalQuestions < 1}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF6B5B] hover:bg-[#E85646] disabled:opacity-60 text-white font-semibold px-6 py-3 text-sm shadow-xs transition-colors shrink-0"
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sınav Hazırlanıyor ({totalQuestions} Soru)...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Sınavı Oluştur ve Başlat
              </>
            )}
          </button>
        </div>
      </form>

      {/* Created Practice Exams List */}
      <div>
        <h2 className="text-lg font-bold text-[#14213D] dark:text-white mb-4">
          Deneme Sınavlarım ({exams.length})
        </h2>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[#FF6B5B]" />
            Sınavlar yükleniyor...
          </div>
        ) : exams.length === 0 ? (
          <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-10 text-center">
            <ClipboardCheck className="w-9 h-9 text-slate-300 dark:text-slate-700 mx-auto mb-2.5" />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Henüz oluşturulmuş bir deneme sınavınız bulunmuyor.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exams.map((exam) => {
              const examAttempts = attempts.filter(
                (a) => a.exam_id === exam.id
              );
              const lastCompleted = examAttempts.find(
                (a) => a.status === "completed"
              );
              const activeInProgress = examAttempts.find(
                (a) => a.status === "in_progress"
              );

              return (
                <div
                  key={exam.id}
                  className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-5 shadow-2xs flex flex-col justify-between gap-4 hover:border-[#FF6B5B] transition-colors"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-lg bg-[#F4EDE0] dark:bg-white/10 px-2.5 py-1 text-xs font-semibold text-[#14213D] dark:text-[#FF6B5B]">
                        {exam.exam_type}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteExam(exam.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600"
                        aria-label="Sınavı Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <h3 className="mt-3 text-base font-bold text-[#14213D] dark:text-white">
                      {exam.title}
                    </h3>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <CheckSquare className="w-3.5 h-3.5" />
                        {exam.total_questions} Soru
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {exam.duration_minutes} Dakika
                      </span>
                      <span>Zorluk: {DIFFICULTY_LABELS[exam.difficulty]}</span>
                      <span>• {formatDateTR(exam.created_at)}</span>
                    </div>

                    {lastCompleted && (
                      <div className="mt-3 rounded-xl bg-[#FAF6EE] dark:bg-slate-950 border border-[#14213D]/15 dark:border-slate-800 px-3.5 py-2.5 flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#14213D] dark:text-[#F4EDE0]">
                          <Trophy className="w-4 h-4 text-[#FF6B5B]" />
                          Son Başarı: %{lastCompleted.success_percentage} (
                          {lastCompleted.total_score} / {lastCompleted.max_score})
                        </span>
                        <Link
                          href={`/panel/deneme-sinavlari/${exam.id}/sonuc/${lastCompleted.id}`}
                          className="font-bold text-[#FF6B5B] hover:underline"
                        >
                          Sonuç Analizi →
                        </Link>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-end gap-2.5">
                    {activeInProgress ? (
                      <button
                        type="button"
                        disabled={startingExamId === exam.id}
                        onClick={() => handleStartExam(exam.id, false)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-xs font-semibold"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Yarım Kalan Sınava Devam Et
                      </button>
                    ) : null}

                    <button
                      type="button"
                      disabled={startingExamId === exam.id}
                      onClick={() => handleStartExam(exam.id, true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#14213D] hover:bg-[#1E3158] dark:bg-[#FF6B5B] dark:hover:bg-[#E85646] text-white px-4 py-2 text-xs font-semibold"
                    >
                      {startingExamId === exam.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      {lastCompleted ? "Tekrar Çöz" : "Sınava Başla"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PracticeExamsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-slate-500">
          Yükleniyor...
        </div>
      }
    >
      <PracticeExamsContent />
    </Suspense>
  );
}

