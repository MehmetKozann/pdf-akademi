"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useApp } from "@/components/providers/app-providers";
import { cn, formatDateTR } from "@/lib/utils";
import {
  STUDY_NOTE_TYPE_LABELS,
  type DocumentRecord,
  type StudyNote,
  type StudyNoteType,
} from "@/types/database";

function StudyNotesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDocId = searchParams.get("documentId") || "";
  const { toast } = useApp();

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDocId, setSelectedDocId] = useState(initialDocId);
  const [selectedType, setSelectedType] =
    useState<StudyNoteType>("comprehensive");
  const [focusTopic, setFocusTopic] = useState("");
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, notesRes] = await Promise.all([
        fetch("/api/documents"),
        fetch("/api/notes"),
      ]);
      if (docsRes.ok) {
        const d = await docsRes.json();
        const readyDocs = (d.documents || []).filter(
          (doc: DocumentRecord) => doc.status === "ready"
        );
        setDocuments(readyDocs);
        if (!selectedDocId && readyDocs.length > 0) {
          setSelectedDocId(initialDocId || readyDocs[0].id);
        }
      }
      if (notesRes.ok) {
        const n = await notesRes.json();
        setNotes(n.notes || []);
      }
    } finally {
      setLoading(false);
    }
  }, [initialDocId, selectedDocId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDocId) {
      toast("Lütfen önce bir PDF belgesi seçiniz.", "error");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: selectedDocId,
          noteType: selectedType,
          focusTopic: focusTopic.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Ders notu oluşturulamadı.", "error");
        return;
      }
      toast("Ders notunuz başarıyla oluşturuldu!", "success");
      router.push(`/panel/ders-notlari/${data.note.id}`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (!window.confirm("Bu ders notunu silmek istediğinize emin misiniz?")) {
      return;
    }
    const res = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast("Ders notu silindi.", "info");
    }
  }

  const docMap = new Map(documents.map((d) => [d.id, d.title]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          YZ Ders Notu Üretici
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Yüklediğiniz PDF belgelerinden yüzeysel özetler değil; tanımlar,
          örnekler, tablolar ve bölüm özetleri içeren kapsamlı çalışma notları oluşturun.
        </p>
      </div>

      {/* Generator Card */}
      <form
        onSubmit={handleGenerate}
        className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 shadow-2xs space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              1. Kaynak PDF Belgesi Seçin
            </label>
            {documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-3 text-xs text-slate-500 flex items-center justify-between">
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
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950 px-3.5 py-2.5 text-sm text-[#14213D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5B]"
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
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Özel Konu / Bölüm Odağı (İsteğe Bağlı)
            </label>
            <input
              type="text"
              value={focusTopic}
              onChange={(e) => setFocusTopic(e.target.value)}
              placeholder="Tüm belge yerine belirli bir konuya odaklanmak için yazın..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950 px-3.5 py-2.5 text-sm text-[#14213D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5B]"
            />
          </div>
        </div>

        {/* 7 Note Type Selector */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            2. Ders Notu Formatını Seçin
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(
              Object.entries(STUDY_NOTE_TYPE_LABELS) as [
                StudyNoteType,
                { label: string; description: string },
              ][]
            ).map(([key, meta]) => {
              const active = selectedType === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedType(key)}
                  className={cn(
                    "text-left rounded-xl border p-4 transition-all",
                    active
                      ? "border-[#FF6B5B] bg-[#FF6B5B]/8 dark:bg-[#FF6B5B]/15 ring-1 ring-[#FF6B5B]"
                      : "border-[#14213D]/10 dark:border-slate-800 hover:border-[#FF6B5B]/60 bg-[#FAF6EE] dark:bg-slate-950"
                  )}
                >
                  <div className="font-semibold text-sm text-[#14213D] dark:text-white">
                    {meta.label}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {meta.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={generating || documents.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-[#14213D] hover:bg-[#1E3158] dark:bg-[#FF6B5B] dark:hover:bg-[#E85646] disabled:opacity-60 text-white font-semibold px-6 py-3 text-sm shadow-xs transition-colors"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Yapay Zeka Ders Notunu Hazırlıyor...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-[#FF6B5B] dark:text-white" />
                Ders Notunu Oluştur
              </>
            )}
          </button>
        </div>
      </form>

      {/* Saved Study Notes List */}
      <div>
        <h2 className="text-lg font-bold text-[#14213D] dark:text-white mb-4">
          Kayıtlı Ders Notlarım ({notes.length})
        </h2>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[#FF6B5B]" />
            Ders notları yükleniyor...
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-10 text-center">
            <BookOpen className="w-9 h-9 text-slate-300 dark:text-slate-700 mx-auto mb-2.5" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Henüz oluşturulmuş bir ders notunuz bulunmuyor.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {notes.map((note) => (
              <div
                key={note.id}
                className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-5 shadow-2xs flex flex-col justify-between gap-4 hover:border-[#FF6B5B] transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex items-center rounded-lg bg-[#F4EDE0] dark:bg-white/10 px-2.5 py-1 text-xs font-semibold text-[#14213D] dark:text-[#FF6B5B]">
                      {STUDY_NOTE_TYPE_LABELS[note.note_type]?.label ||
                        note.note_type}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(note.id)}
                      aria-label="Notu sil"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <Link
                    href={`/panel/ders-notlari/${note.id}`}
                    className="block mt-3 text-base font-bold text-[#14213D] dark:text-white hover:text-[#FF6B5B]"
                  >
                    {note.title}
                  </Link>

                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span className="truncate">
                      {docMap.get(note.document_id) || "Kaynak Belge"}
                    </span>
                    <span>•</span>
                    <span>{formatDateTR(note.created_at)}</span>
                  </div>

                  <p className="mt-3 text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                    {note.content_markdown
                      .slice(0, 450)
                      .replace(/-{4,}/g, " ")
                      .replace(/[#>*`|]/g, "")
                      .slice(0, 220)}
                    ...
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    {note.is_edited ? "Düzenlendi" : "YZ Tarafından Üretildi"}
                  </span>
                  <Link
                    href={`/panel/ders-notlari/${note.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF6B5B] hover:underline"
                  >
                    Notu Aç ve Çalış
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudyNotesPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-slate-500">
          Yükleniyor...
        </div>
      }
    >
      <StudyNotesContent />
    </Suspense>
  );
}

