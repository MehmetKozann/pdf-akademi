"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  FolderPlus,
  HelpCircle,
  Loader2,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useApp } from "@/components/providers/app-providers";
import { cn } from "@/lib/utils";
import {
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  type ClassicalAIEvaluation,
  type DocumentRecord,
  type ExamDifficulty,
  type Question,
  type QuestionBank,
  type QuestionType,
} from "@/types/database";

function QuestionBankContent() {
  const searchParams = useSearchParams();
  const initialDocId = searchParams.get("documentId") || "";
  const { toast } = useApp();

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(true);

  // Generator state
  const [genDocId, setGenDocId] = useState(initialDocId);
  const [genType, setGenType] = useState<QuestionType>("multiple_choice");
  const [genCount, setGenCount] = useState(5);
  const [genDifficulty, setGenDifficulty] = useState<ExamDifficulty>("mixed");
  const [genOptionCount, setGenOptionCount] = useState<4 | 5>(5);
  const [genTopics, setGenTopics] = useState("");
  const [generating, setGenerating] = useState(false);

  // Filter state
  const [filterDocId, setFilterDocId] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterDifficulty, setFilterDifficulty] = useState<string>("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState<string>("");

  // Interactive practice & answer reveal per question
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [practiceInputs, setPracticeInputs] = useState<Record<string, string>>(
    {}
  );
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const [evaluations, setEvaluations] = useState<
    Record<string, { scoreAwarded: number; evaluation: ClassicalAIEvaluation }>
  >({});

  // Custom Collection Modal
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [newCollectionTitle, setNewCollectionTitle] = useState("");
  const [newCollectionDesc, setNewCollectionDesc] = useState("");

  const loadQuestions = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filterDocId) qs.set("documentId", filterDocId);
    if (filterType) qs.set("questionType", filterType);
    if (filterDifficulty) qs.set("difficulty", filterDifficulty);
    if (onlyFavorites) qs.set("favorites", "true");
    if (selectedBankId) qs.set("bankId", selectedBankId);

    const res = await fetch(`/api/questions?${qs.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setQuestions(data.questions || []);
    }
  }, [filterDocId, filterType, filterDifficulty, onlyFavorites, selectedBankId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [docsRes, banksRes] = await Promise.all([
          fetch("/api/documents"),
          fetch("/api/question-banks"),
        ]);
        if (docsRes.ok) {
          const d = await docsRes.json();
          const ready = (d.documents || []).filter(
            (doc: DocumentRecord) => doc.status === "ready"
          );
          setDocuments(ready);
          if (!genDocId && ready.length > 0) {
            setGenDocId(initialDocId || ready[0].id);
          }
        }
        if (banksRes.ok) {
          const b = await banksRes.json();
          setBanks(b.banks || []);
        }
        await loadQuestions();
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [genDocId, initialDocId, loadQuestions]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!genDocId) {
      toast("Lütfen kaynak bir PDF belgesi seçiniz.", "error");
      return;
    }
    setGenerating(true);
    try {
      const topicsArr = genTopics
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: genDocId,
          questionType: genType,
          count: genCount,
          difficulty: genDifficulty,
          mcqOptionCount: genOptionCount,
          topics: topicsArr,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Soru üretilemedi.", "error");
        return;
      }
      toast(`${data.questions.length} yeni soru başarıyla üretildi!`, "success");
      await loadQuestions();
    } finally {
      setGenerating(false);
    }
  }

  async function handleToggleFavorite(qId: string) {
    const res = await fetch(`/api/questions/${qId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toggleFavorite: true }),
    });
    if (res.ok) {
      const data = await res.json();
      setQuestions((prev) =>
        prev.map((q) => (q.id === qId ? data.question : q))
      );
    }
  }

  async function handleEvaluateClassical(qId: string) {
    const studentText = practiceInputs[qId]?.trim();
    if (!studentText) {
      toast("Lütfen değerlendirme için önce cevabınızı yazın.", "error");
      return;
    }
    setEvaluatingId(qId);
    try {
      const res = await fetch(`/api/questions/${qId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluateAnswer: studentText }),
      });
      const data = await res.json();
      if (res.ok) {
        setEvaluations((prev) => ({ ...prev, [qId]: data }));
        setRevealedIds((prev) => ({ ...prev, [qId]: true }));
        toast("Cevabınız rubriğe göre değerlendirildi.", "success");
      } else {
        toast(data.error || "Değerlendirme başarısız.", "error");
      }
    } finally {
      setEvaluatingId(null);
    }
  }

  async function handleDeleteQuestion(qId: string) {
    const res = await fetch(`/api/questions/${qId}`, { method: "DELETE" });
    if (res.ok) {
      setQuestions((prev) => prev.filter((q) => q.id !== qId));
      toast("Soru silindi.", "info");
    }
  }

  async function handleCreateCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!newCollectionTitle.trim()) return;
    const res = await fetch("/api/question-banks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newCollectionTitle,
        description: newCollectionDesc,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setBanks((prev) => [data.bank, ...prev]);
      setNewCollectionTitle("");
      setNewCollectionDesc("");
      setCollectionModalOpen(false);
      toast("Özel soru koleksiyonu oluşturuldu.", "success");
    }
  }

  async function handleAddToCollection(bankId: string, questionId: string) {
    if (!bankId) return;
    const res = await fetch(`/api/question-banks/${bankId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addQuestionId: questionId }),
    });
    if (res.ok) {
      const data = await res.json();
      setBanks((prev) =>
        prev.map((b) => (b.id === bankId ? data.bank : b))
      );
      toast("Soru koleksiyona eklendi.", "success");
    }
  }

  const customCollections = banks.filter((b) => b.is_custom_collection);
  const docMap = new Map(documents.map((d) => [d.id, d.title]));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#14213D] dark:text-white">
            YZ Soru Bankası ve Soru Üretici
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Yalnızca yüklediğiniz PDF belgelerine dayalı klasik, çoktan seçmeli,
            doğru/yanlış, boşluk doldurma ve eşleştirme soruları üretin.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollectionModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-[#14213D]/15 dark:border-slate-700 bg-white dark:bg-[#14213D] hover:border-[#FF6B5B] px-4 py-2.5 text-sm font-semibold text-[#14213D] dark:text-slate-200 shrink-0"
        >
          <FolderPlus className="w-4 h-4 text-[#FF6B5B]" />
          Özel Koleksiyon Oluştur
        </button>
      </div>

      {/* Question Generator Form */}
      <form
        onSubmit={handleGenerate}
        className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 shadow-2xs space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Kaynak PDF Belgesi
            </label>
            {documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-2.5 text-xs text-slate-500 flex items-center justify-between">
                <span>Henüz hazır bir PDF belgeniz yok.</span>
                <Link
                  href="/panel/pdf-yukle"
                  className="font-semibold text-[#FF6B5B] hover:underline"
                >
                  PDF Yükle →
                </Link>
              </div>
            ) : (
              <select
                value={genDocId}
                onChange={(e) => setGenDocId(e.target.value)}
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
              Soru Tipi
            </label>
            <select
              value={genType}
              onChange={(e) => setGenType(e.target.value as QuestionType)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
            >
              {(
                Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]
              ).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Zorluk Seviyesi
            </label>
            <select
              value={genDifficulty}
              onChange={(e) =>
                setGenDifficulty(e.target.value as ExamDifficulty)
              }
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
            >
              {(
                Object.entries(DIFFICULTY_LABELS) as [ExamDifficulty, string][]
              ).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Üretilecek Soru Sayısı ({genCount})
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={genCount}
              onChange={(e) =>
                setGenCount(Math.max(1, Math.min(20, Number(e.target.value))))
              }
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
            />
          </div>

          {genType === "multiple_choice" ? (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Şık Sayısı
              </label>
              <select
                value={genOptionCount}
                onChange={(e) =>
                  setGenOptionCount(Number(e.target.value) as 4 | 5)
                }
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
              >
                <option value={4}>4 Seçenekli (A - D)</option>
                <option value={5}>5 Seçenekli (A - E)</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Konu Odağı (İsteğe Bağlı)
              </label>
              <input
                type="text"
                value={genTopics}
                onChange={(e) => setGenTopics(e.target.value)}
                placeholder="Örn: Ağaç yapıları, Sıralama"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={generating || documents.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#14213D] hover:bg-[#1E3158] dark:bg-[#FF6B5B] dark:hover:bg-[#E85646] disabled:opacity-60 text-white font-semibold py-2.5 px-5 text-sm shadow-xs transition-colors"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sorular Üretiliyor...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-[#FF6B5B] dark:text-white" />
                Soruları Üret
              </>
            )}
          </button>
        </div>
      </form>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <select
          value={filterDocId}
          onChange={(e) => setFilterDocId(e.target.value)}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium"
        >
          <option value="">Tüm Belgeler</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium"
        >
          <option value="">Tüm Soru Tipleri</option>
          {(
            Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]
          ).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>

        <select
          value={filterDifficulty}
          onChange={(e) => setFilterDifficulty(e.target.value)}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium"
        >
          <option value="">Tüm Zorluklar</option>
          <option value="easy">Kolay</option>
          <option value="medium">Orta</option>
          <option value="hard">Zor</option>
        </select>

        {customCollections.length > 0 && (
          <select
            value={selectedBankId}
            onChange={(e) => setSelectedBankId(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium"
          >
            <option value="">Tüm Koleksiyonlar</option>
            {customCollections.map((c) => (
              <option key={c.id} value={c.id}>
                Koleksiyon: {c.title} ({c.question_ids.length})
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setOnlyFavorites((prev) => !prev)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold border transition-colors",
            onlyFavorites
              ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-700 dark:text-amber-300"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
          )}
        >
          <Star
            className={cn(
              "w-3.5 h-3.5",
              onlyFavorites && "fill-amber-500 text-amber-500"
            )}
          />
          Favori Sorularım
        </button>
      </div>

      {/* Question Cards */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#FF6B5B]" />
          Soru bankası yükleniyor...
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-12 text-center">
          <HelpCircle className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2.5" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Seçili filtrelere uygun soru bulunamadı.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q, index) => {
            const revealed = Boolean(revealedIds[q.id]);
            const userInput = practiceInputs[q.id] || "";
            const evalData = evaluations[q.id];

            return (
              <div
                key={q.id}
                className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-5 sm:p-6 shadow-2xs space-y-4"
              >
                {/* Card Top Meta */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-[#F4EDE0] dark:bg-white/10 px-2.5 py-1 text-xs font-semibold text-[#14213D] dark:text-[#FF6B5B]">
                      #{index + 1} • {QUESTION_TYPE_LABELS[q.question_type]}
                    </span>
                    <span
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs font-semibold",
                        q.difficulty === "easy"
                          ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                          : q.difficulty === "medium"
                          ? "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300"
                          : "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300"
                      )}
                    >
                      {DIFFICULTY_LABELS[q.difficulty]}
                    </span>
                    <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300">
                      Konu: {q.topic}
                    </span>
                    {q.source_pages?.length > 0 && (
                      <span className="text-xs text-slate-400">
                        Kaynak: Sayfa {q.source_pages.join(", ")} (
                        {docMap.get(q.document_id) || "PDF"})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {customCollections.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddToCollection(e.target.value, q.id);
                            e.target.value = "";
                          }
                        }}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-[11px]"
                      >
                        <option value="">+ Koleksiyona Ekle</option>
                        {customCollections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      onClick={() => handleToggleFavorite(q.id)}
                      title="Favorilere Ekle / Çıkar"
                      className="p-2 rounded-lg text-slate-400 hover:text-amber-500"
                    >
                      <Star
                        className={cn(
                          "w-4 h-4",
                          q.is_favorite && "fill-amber-500 text-amber-500"
                        )}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(q.id)}
                      title="Soruyu Sil"
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Question Stem */}
                <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white leading-relaxed">
                  {q.question_text}
                </p>

                {/* Type-Specific Interactive Area */}
                {q.question_type === "multiple_choice" && (
                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const chosen = userInput === opt.label;
                      const isCorrectOpt =
                        opt.label.toUpperCase() ===
                        q.correct_answer.toUpperCase();
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => {
                            setPracticeInputs((prev) => ({
                              ...prev,
                              [q.id]: opt.label,
                            }));
                            setRevealedIds((prev) => ({
                              ...prev,
                              [q.id]: true,
                            }));
                          }}
                          className={cn(
                            "w-full text-left rounded-xl border px-4 py-2.5 text-sm flex items-start gap-3 transition-colors",
                            revealed && isCorrectOpt
                              ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30"
                              : revealed && chosen && !isCorrectOpt
                              ? "border-red-400 bg-red-50/70 dark:bg-red-950/30"
                              : chosen
                              ? "border-[#FF6B5B] bg-[#FF6B5B]/8"
                              : "border-slate-200 dark:border-white/10 hover:border-[#FF6B5B]"
                          )}
                        >
                          <span className="font-bold text-[#14213D] dark:text-[#FF6B5B] shrink-0">
                            {opt.label})
                          </span>
                          <span>{opt.text}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {q.question_type === "true_false" && (
                  <div className="flex items-center gap-3">
                    {["Doğru", "Yanlış"].map((choice) => {
                      const chosen = userInput === choice;
                      const isRight = q.correct_answer === choice;
                      return (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => {
                            setPracticeInputs((prev) => ({
                              ...prev,
                              [q.id]: choice,
                            }));
                            setRevealedIds((prev) => ({
                              ...prev,
                              [q.id]: true,
                            }));
                          }}
                          className={cn(
                            "px-5 py-2 rounded-xl border text-sm font-semibold transition-colors",
                            revealed && isRight
                              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                              : revealed && chosen && !isRight
                              ? "border-red-400 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                              : "border-slate-200 dark:border-white/10 hover:border-[#FF6B5B]"
                          )}
                        >
                          {choice}
                        </button>
                      );
                    })}
                  </div>
                )}

                {q.question_type === "fill_blank" && (
                  <div className="flex flex-col sm:flex-row gap-2.5 max-w-lg">
                    <input
                      type="text"
                      value={userInput}
                      onChange={(e) =>
                        setPracticeInputs((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      placeholder="Boşluğa gelecek kavramı yazın..."
                      className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950 px-3.5 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedIds((prev) => ({ ...prev, [q.id]: true }))
                      }
                      className="rounded-xl bg-[#14213D] dark:bg-[#FF6B5B] text-white px-4 py-2 text-xs font-semibold"
                    >
                      Kontrol Et
                    </button>
                  </div>
                )}

                {q.question_type === "matching" &&
                  q.matching_pairs?.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {q.matching_pairs.map((pair, pIdx) => (
                        <div
                          key={pIdx}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#FAF6EE] dark:bg-slate-950 p-3 text-xs flex items-center justify-between gap-3"
                        >
                          <span className="font-semibold text-[#14213D] dark:text-white">
                            {pair.left}
                          </span>
                          <span className="text-slate-400">↔</span>
                          <span className="text-slate-600 dark:text-slate-300 text-right">
                            {revealed ? pair.right : "Cevabı Göster ile Açılır"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                {q.question_type === "classical" && (
                  <div className="space-y-2.5">
                    <textarea
                      rows={3}
                      value={userInput}
                      onChange={(e) =>
                        setPracticeInputs((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      placeholder="Kendi cevabınızı buraya yazarak yapay zeka rubrik değerlendirmesi alabilirsiniz..."
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950 p-3 text-sm"
                    />
                    <button
                      type="button"
                      disabled={evaluatingId === q.id}
                      onClick={() => handleEvaluateClassical(q.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#F4EDE0] dark:bg-white/10 text-[#14213D] dark:text-[#FF6B5B] px-3.5 py-2 text-xs font-semibold hover:bg-[#FF6B5B]/15"
                    >
                      {evaluatingId === q.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Rubriğe Göre Değerlendiriliyor...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-[#FF6B5B]" />
                          Cevabımı YZ Rubriği ile Değerlendir
                        </>
                      )}
                    </button>

                    {evalData && (
                      <div className="rounded-xl border border-[#FF6B5B]/40 bg-[#FF6B5B]/8 dark:bg-[#FF6B5B]/15 p-4 text-xs space-y-2">
                        <div className="font-bold text-[#14213D] dark:text-[#FF6B5B] flex items-center justify-between">
                          <span>YZ Değerlendirme Sonucu</span>
                          <span>Puan: {evalData.scoreAwarded} / 10</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">
                          {evalData.evaluation.feedback}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Answer & Explanation Reveal Toggle */}
                <div className="pt-2 border-t border-slate-100 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() =>
                      setRevealedIds((prev) => ({
                        ...prev,
                        [q.id]: !prev[q.id],
                      }))
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF6B5B] hover:underline"
                  >
                    {revealed ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        Çözümü ve Cevap Anahtarını Gizle
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Cevap Anahtarını ve Detaylı Açıklamayı Göster
                      </>
                    )}
                  </button>

                  {revealed && (
                    <div className="mt-3 rounded-xl bg-[#FAF6EE] dark:bg-slate-950 border border-[#14213D]/10 dark:border-slate-800 p-4 space-y-3 text-xs sm:text-sm">
                      {q.correct_answer && q.question_type !== "classical" && (
                        <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          Doğru Cevap: {q.correct_answer}
                        </div>
                      )}

                      {q.model_answer && (
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white mb-1">
                            Örnek Model Cevap:
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                            {q.model_answer}
                          </p>
                        </div>
                      )}

                      {q.expected_points?.length > 0 && (
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white mb-1">
                            Cevapta Beklenen Kilit Noktalar:
                          </div>
                          <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                            {q.expected_points.map((pt, i) => (
                              <li key={i}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {q.grading_rubric?.length > 0 && (
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white mb-1">
                            Puanlama Rubriği:
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.grading_rubric.map((r, i) => (
                              <div
                                key={i}
                                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-xs"
                              >
                                <span className="font-semibold">
                                  {r.criterion} ({r.points}p):{" "}
                                </span>
                                <span className="text-slate-500">
                                  {r.description}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {q.explanation && (
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white mb-0.5">
                            Açıklama:
                          </div>
                          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                            {q.explanation}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom Collection Modal */}
      {collectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setCollectionModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">
                Özel Soru Koleksiyonu Oluştur
              </h3>
              <button
                type="button"
                onClick={() => setCollectionModalOpen(false)}
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateCollection} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">
                  Koleksiyon Başlığı
                </label>
                <input
                  type="text"
                  required
                  value={newCollectionTitle}
                  onChange={(e) => setNewCollectionTitle(e.target.value)}
                  placeholder="Örn: Vize Öncesi Zor Klasik Sorular"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">
                  Açıklama (İsteğe Bağlı)
                </label>
                <input
                  type="text"
                  value={newCollectionDesc}
                  onChange={(e) => setNewCollectionDesc(e.target.value)}
                  placeholder="Bu koleksiyonun amacı..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCollectionModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#14213D] dark:bg-[#FF6B5B] text-white px-4 py-2 text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuestionBankPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-slate-500">
          Yükleniyor...
        </div>
      }
    >
      <QuestionBankContent />
    </Suspense>
  );
}

