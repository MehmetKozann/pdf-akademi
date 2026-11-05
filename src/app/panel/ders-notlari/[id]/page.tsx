"use client";

import React, { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Edit3,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Save,
  Send,
  X,
} from "lucide-react";
import { useApp } from "@/components/providers/app-providers";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { exportHtmlAsPdf } from "@/lib/export-pdf";
import { formatDateTR } from "@/lib/utils";
import {
  STUDY_NOTE_TYPE_LABELS,
  type ChatMessage,
  type DocumentRecord,
  type StudyNote,
} from "@/types/database";

export default function StudyNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useApp();
  const renderedRef = useRef<HTMLDivElement>(null);

  const [note, setNote] = useState<StudyNote | null>(null);
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editMarkdown, setEditMarkdown] = useState("");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Contextual Topic Q&A Drawer
  const [qaOpen, setQaOpen] = useState(false);
  const [qaInput, setQaInput] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [qaMessages, setQaMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/notes/${id}`);
        if (res.ok) {
          const data = await res.json();
          setNote(data.note);
          setDoc(data.document || null);
          setEditTitle(data.note.title);
          setEditMarkdown(data.note.content_markdown);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSaveEdit() {
    if (!note) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          content_markdown: editMarkdown,
        }),
      });
      const data = await res.json();
      if (res.ok && data.note) {
        setNote(data.note);
        setIsEditing(false);
        toast("Ders notundaki değişiklikler kaydedildi.", "success");
      } else {
        toast(data.error || "Not kaydedilemedi.", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (!note) return;
    await navigator.clipboard.writeText(note.content_markdown);
    setCopied(true);
    toast("Ders notu panoya kopyalandı.", "success");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadPdf() {
    if (!note) return;
    const html =
      renderedRef.current?.innerHTML ||
      `<pre>${note.content_markdown}</pre>`;
    exportHtmlAsPdf({
      title: note.title,
      subtitle: `${STUDY_NOTE_TYPE_LABELS[note.note_type]?.label || ""} ${
        doc ? `• Kaynak: ${doc.title}` : ""
      }`,
      bodyHtml: html,
    });
  }

  async function handleRegenerate() {
    if (!note) return;
    if (
      !window.confirm(
        "Bu ders notunu kaynak belgeden yeniden üretmek istiyor musunuz? Yeni bir ders notu kaydı oluşturulacaktır."
      )
    ) {
      return;
    }
    setRegenerating(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: note.document_id,
          noteType: note.note_type,
        }),
      });
      const data = await res.json();
      if (res.ok && data.note) {
        toast("Ders notu yeniden oluşturuldu!", "success");
        router.push(`/panel/ders-notlari/${data.note.id}`);
      } else {
        toast(data.error || "Yeniden oluşturma başarısız.", "error");
      }
    } finally {
      setRegenerating(false);
    }
  }

  async function handleAskTopicQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!note || !qaInput.trim()) return;
    const qText = qaInput.trim();
    setQaInput("");
    setQaLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: `note-${note.id}`,
          documentId: note.document_id,
          message: qText,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setQaMessages((prev) => [
          ...prev,
          data.userMessage,
          data.assistantMessage,
        ]);
      } else {
        toast(data.error || "Yanıt alınamadı.", "error");
      }
    } finally {
      setQaLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#FF6B5B]" />
        Ders notu yükleniyor...
      </div>
    );
  }

  if (!note) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-600 dark:text-slate-400 mb-3">
          Ders notu bulunamadı.
        </p>
        <Link
          href="/panel/ders-notlari"
          className="text-sm font-semibold text-[#FF6B5B] hover:underline"
        >
          Ders Notlarıma Dön
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-5 sm:p-6 shadow-2xs">
        <Link
          href="/panel/ders-notlari"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#FF6B5B] mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Ders Notlarıma Dön
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <span className="inline-block rounded-lg bg-[#F4EDE0] dark:bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-[#14213D] dark:text-[#FF6B5B] mb-2">
              {STUDY_NOTE_TYPE_LABELS[note.note_type]?.label}
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-[#14213D] dark:text-white">
              {note.title}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {doc ? `Kaynak: ${doc.title} • ` : ""}
              Son Güncelleme: {formatDateTR(note.updated_at, true)}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditing((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-[#14213D] dark:text-slate-200 hover:border-[#FF6B5B]"
            >
              <Edit3 className="w-3.5 h-3.5" />
              {isEditing ? "Önizlemeye Dön" : "Notu Düzenle"}
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-[#14213D] dark:text-slate-200 hover:border-[#FF6B5B]"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-[#FF6B5B]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? "Kopyalandı" : "Kopyala"}
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-[#14213D] dark:text-slate-200 hover:border-[#FF6B5B]"
            >
              <Download className="w-3.5 h-3.5" />
              PDF Olarak İndir
            </button>

            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-[#14213D] dark:text-slate-200 hover:border-[#FF6B5B]"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`}
              />
              Yeniden Üret
            </button>

            <button
              type="button"
              onClick={() => setQaOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#14213D] hover:bg-[#1E3158] dark:bg-[#FF6B5B] dark:hover:bg-[#E85646] text-white px-4 py-2 text-xs font-semibold"
            >
              <MessageSquareText className="w-3.5 h-3.5 text-[#FF6B5B] dark:text-white" />
              Bu Konu Hakkında YZ&apos;ye Sor
            </button>
          </div>
        </div>
      </div>

      {/* Main Content + Optional Contextual AI Q&A Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={qaOpen ? "lg:col-span-8" : "lg:col-span-12"}>
          {isEditing ? (
            <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">
                  Not Başlığı
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950 px-3.5 py-2 text-sm font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">
                  Not İçeriği (Markdown Formatı)
                </label>
                <textarea
                  rows={22}
                  value={editMarkdown}
                  onChange={(e) => setEditMarkdown(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950 p-4 font-mono text-xs sm:text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#FF6B5B]"
                />
              </div>

              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditTitle(note.title);
                    setEditMarkdown(note.content_markdown);
                    setIsEditing(false);
                  }}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveEdit}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#14213D] hover:bg-[#1E3158] dark:bg-[#FF6B5B] dark:hover:bg-[#E85646] text-white px-5 py-2 text-xs font-semibold"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 sm:p-10 shadow-2xs">
              <div ref={renderedRef}>
                <MarkdownViewer content={note.content_markdown} />
              </div>

              {/* Extra Structured Key Concepts & Formulas Cards if populated */}
              {(note.key_concepts?.length > 0 || note.formulas?.length > 0) && (
                <div className="mt-10 pt-8 border-t border-slate-200 dark:border-white/10 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {note.key_concepts?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-[#14213D] dark:text-[#FF6B5B] mb-3">
                        Hızlı Kavram Sözlüğü
                      </h3>
                      <div className="space-y-2.5">
                        {note.key_concepts.map((kc, i) => (
                          <div
                            key={i}
                            className="rounded-xl bg-[#FAF6EE] dark:bg-slate-950 p-3 text-xs"
                          >
                            <span className="font-bold text-[#14213D] dark:text-white">
                              {kc.term}:{" "}
                            </span>
                            <span className="text-slate-600 dark:text-slate-300">
                              {kc.definition}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {note.formulas?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-[#14213D] dark:text-[#FF6B5B] mb-3">
                        Önemli Formüller ve Kurallar
                      </h3>
                      <div className="space-y-2.5">
                        {note.formulas.map((fm, i) => (
                          <div
                            key={i}
                            className="rounded-xl bg-[#FAF6EE] dark:bg-slate-950 p-3 text-xs"
                          >
                            <div className="font-bold mb-1">{fm.name}</div>
                            <code className="block bg-white dark:bg-[#14213D] px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-[#14213D] dark:text-[#FF6B5B] mb-1">
                              {fm.expression}
                            </code>
                            <p className="text-slate-500">{fm.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Contextual AI Question Panel */}
        {qaOpen && (
          <div className="lg:col-span-4">
            <div className="sticky top-20 rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] shadow-sm flex flex-col h-[72vh]">
              <div className="px-4 py-3.5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold">Konu Soru-Cevap Asistanı</h3>
                  <p className="text-[11px] text-slate-500">
                    Kaynak belgeye dayalı açıklamalar
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQaOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {qaMessages.length === 0 ? (
                  <div className="text-xs text-slate-500 space-y-2">
                    <p>
                      Ders notunda anlamadığınız bir bölümü veya formülü sorun:
                    </p>
                    {[
                      "Bu konuyu daha basit bir örnekle anlatır mısın?",
                      "Bu konuyu sınavda klasik soru olarak nasıl sorabilirler?",
                      "En kritik 3 kavramı karşılaştırır mısın?",
                    ].map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => setQaInput(sample)}
                        className="block w-full text-left rounded-xl border border-slate-200 dark:border-white/10 p-2.5 hover:border-[#FF6B5B] text-slate-700 dark:text-slate-300"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                ) : (
                  qaMessages.map((m) => (
                    <div
                      key={m.id}
                      className={
                        m.role === "user"
                          ? "ml-6 rounded-xl bg-[#14213D] dark:bg-[#FF6B5B] text-white p-3 text-xs"
                          : "mr-2 rounded-xl bg-[#FAF6EE] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-xs"
                      }
                    >
                      {m.role === "assistant" ? (
                        <MarkdownViewer
                          content={m.content}
                          className="text-xs"
                        />
                      ) : (
                        m.content
                      )}
                    </div>
                  ))
                )}
                {qaLoading && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF6B5B]" />
                    Kaynak belge taranıyor...
                  </div>
                )}
              </div>

              <form
                onSubmit={handleAskTopicQuestion}
                className="p-3 border-t border-slate-200 dark:border-white/10 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  placeholder="Bu notla ilgili sorunuzu yazın..."
                  className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF6B5B]"
                />
                <button
                  type="submit"
                  disabled={qaLoading || !qaInput.trim()}
                  className="p-2 rounded-xl bg-[#FF6B5B] hover:bg-[#E85646] text-white disabled:opacity-50"
                  aria-label="Gönder"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

