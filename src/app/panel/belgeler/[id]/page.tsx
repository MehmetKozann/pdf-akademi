"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ClipboardCheck,
  FileText,
  GitBranch,
  HelpCircle,
  Layers,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Sigma,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/components/providers/app-providers";
import { cn, formatFileSize } from "@/lib/utils";
import type { DocumentPage, DocumentRecord } from "@/types/database";

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { toast } = useApp();

  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "structure" | "definitions" | "formulas" | "pages" | "pdf"
  >("structure");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/documents/${id}`);
        if (res.ok) {
          const data = await res.json();
          setDoc(data.document);
          setPages(data.pages || []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleReanalyzeWithAI() {
    setReanalyzing(true);
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reanalyze: true }),
      });
      const data = await res.json();
      if (res.ok && data.document) {
        setDoc(data.document);
        toast("Belge yapısı yapay zeka ile yeniden analiz edildi.", "success");
      } else {
        toast(data.error || "Analiz güncellenemedi.", "error");
      }
    } finally {
      setReanalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#FF6B5B]" />
        Belge analiz verileri yükleniyor...
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Aradığınız belge bulunamadı veya erişim yetkiniz yok.
        </p>
        <Link
          href="/panel/pdf-yukle"
          className="text-sm font-semibold text-[#FF6B5B] hover:underline"
        >
          PDF Yükleme Sayfasına Dön
        </Link>
      </div>
    );
  }

  const meta = doc.extracted_metadata;

  return (
    <div className="space-y-6">
      {/* Header & Action Toolbar */}
      <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 shadow-2xs">
        <Link
          href="/panel/pdf-yukle"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#FF6B5B] mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Belgelere Dön
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <h1 className="text-2xl font-bold text-[#14213D] dark:text-white">
              {doc.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 mt-1.5">
              <span>{doc.file_name}</span>
              <span>•</span>
              <span>{doc.page_count} Sayfa</span>
              <span>•</span>
              <span>{formatFileSize(doc.file_size)}</span>
              {doc.ocr_applied && (
                <span className="rounded-md bg-[#FF6B5B]/12 px-2 py-0.5 text-[#FF6B5B] font-semibold">
                  OCR Destekli
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleReanalyzeWithAI}
              disabled={reanalyzing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-[#14213D] dark:text-slate-200 hover:border-[#FF6B5B]"
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", reanalyzing && "animate-spin")}
              />
              YZ Yapı Analizini Yenile
            </button>
            <Link
              href={`/panel/ders-notlari?documentId=${doc.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#F4EDE0] dark:bg-white/10 text-[#14213D] dark:text-[#F4EDE0] px-3.5 py-2 text-xs font-semibold hover:bg-[#FF6B5B]/15"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#FF6B5B]" />
              Ders Notu Üret
            </Link>
            <Link
              href={`/panel/soru-bankasi?documentId=${doc.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#F4EDE0] dark:bg-white/10 text-[#14213D] dark:text-[#F4EDE0] px-3.5 py-2 text-xs font-semibold hover:bg-[#FF6B5B]/15"
            >
              <HelpCircle className="w-3.5 h-3.5 text-[#FF6B5B]" />
              Soru Üret
            </Link>
            <Link
              href={`/panel/deneme-sinavlari?documentId=${doc.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#14213D] hover:bg-[#1E3158] dark:bg-[#FF6B5B] dark:hover:bg-[#E85646] text-white px-4 py-2 text-xs font-semibold"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              Deneme Sınavı Oluştur
            </Link>
            <Link
              href={`/panel/asistan?documentId=${doc.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#FF6B5B] text-[#14213D] dark:text-[#FF6B5B] px-3.5 py-2 text-xs font-semibold hover:bg-[#FF6B5B]/10"
            >
              <MessageSquareText className="w-3.5 h-3.5 text-[#FF6B5B]" />
              Belgeyle Sohbet Et
            </Link>
          </div>
        </div>

        {meta.summary && (
          <div className="mt-5 rounded-xl bg-[#FAF6EE] dark:bg-slate-950 border border-[#14213D]/10 dark:border-slate-800 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#14213D] dark:text-[#FF6B5B] mb-1">
              <Sparkles className="w-3.5 h-3.5 text-[#FF6B5B]" />
              Belge Özeti ve Kapsamı
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {meta.summary}
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          {
            id: "structure" as const,
            label: `Bölümler & Kavramlar (${meta.chapters?.length || 0})`,
            icon: Layers,
          },
          {
            id: "definitions" as const,
            label: `Önemli Tanımlar (${meta.definitions?.length || 0})`,
            icon: BookOpen,
          },
          {
            id: "formulas" as const,
            label: `Formüller & Bağıntılar (${meta.formulas?.length || 0})`,
            icon: Sigma,
          },
          {
            id: "pages" as const,
            label: `Çıkarılan Sayfa Metinleri (${pages.length})`,
            icon: FileText,
          },
          {
            id: "pdf" as const,
            label: "Orijinal PDF Önizleme",
            icon: FileText,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors",
              activeTab === tab.id
                ? "bg-[#14213D] dark:bg-[#FF6B5B] text-white"
                : "bg-white dark:bg-[#14213D] border border-[#14213D]/15 dark:border-slate-800 text-[#14213D] dark:text-slate-300 hover:border-[#FF6B5B]"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {activeTab === "structure" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 space-y-4">
            <h2 className="text-base font-bold text-[#14213D] dark:text-white">
              Tespit Edilen Bölümler ve Konu Akışı
            </h2>
            {meta.chapters?.length ? (
              <div className="space-y-3">
                {meta.chapters.map((ch, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200/80 dark:border-white/10 p-4 flex items-start justify-between gap-4"
                  >
                    <div>
                      <span className="text-xs font-semibold text-[#FF6B5B]">
                        Bölüm {idx + 1}
                      </span>
                      <h3 className="font-semibold text-sm text-[#14213D] dark:text-white mt-0.5">
                        {ch.title}
                      </h3>
                      {ch.summary && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                          {ch.summary}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-lg bg-[#F4EDE0] dark:bg-white/10 px-2.5 py-1 text-xs font-medium text-[#14213D] dark:text-slate-200">
                      Sayfa {ch.page_start}
                      {ch.page_end !== ch.page_start ? `–${ch.page_end}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Bölüm başlığı bulunamadı.</p>
            )}

            {meta.concept_relations?.length > 0 && (
              <div className="pt-4">
                <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
                  <GitBranch className="w-4 h-4 text-[#FF6B5B]" />
                  Kavramlar Arası İlişkiler
                </h3>
                <div className="space-y-2">
                  {meta.concept_relations.map((rel, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl bg-[#FAF6EE] dark:bg-slate-950 p-3 text-xs flex flex-wrap items-center gap-2"
                    >
                      <span className="font-semibold text-[#14213D] dark:text-white">
                        {rel.source}
                      </span>
                      <span className="text-[#FF6B5B] font-medium">
                        → ({rel.relation}) →
                      </span>
                      <span className="font-semibold text-[#14213D] dark:text-white">
                        {rel.target}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6">
              <h2 className="text-base font-bold mb-3">Anahtar Kavramlar</h2>
              <div className="flex flex-wrap gap-2">
                {(meta.key_concepts || []).map((concept, i) => (
                  <span
                    key={i}
                    className="rounded-lg bg-[#F4EDE0] dark:bg-white/10 px-2.5 py-1 text-xs font-medium text-[#14213D] dark:text-[#F4EDE0]"
                  >
                    {concept}
                  </span>
                ))}
              </div>
            </div>

            {meta.important_topics?.length > 0 && (
              <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6">
                <h2 className="text-base font-bold mb-3">
                  Sınav Değeri Taşıyan Önemli Konular
                </h2>
                <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                  {meta.important_topics.map((t, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B5B] mt-1.5 shrink-0" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "definitions" && (
        <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6">
          <h2 className="text-base font-bold mb-4">
            Belgede Tespit Edilen Önemli Tanımlar
          </h2>
          {meta.definitions?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {meta.definitions.map((d, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[#14213D]/10 dark:border-slate-800 p-4 bg-[#FAF6EE] dark:bg-slate-950"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h3 className="font-bold text-sm text-[#14213D] dark:text-[#FF6B5B]">
                      {d.term}
                    </h3>
                    <span className="text-[11px] font-medium text-slate-400">
                      Sayfa {d.page}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {d.definition}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Henüz yapılandırılmış tanım çıkarılmadı. YZ Yapı Analizini Yenile
              butonuyla derin kavramsal analiz çalıştırabilirsiniz.
            </p>
          )}
        </div>
      )}

      {activeTab === "formulas" && (
        <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6">
          <h2 className="text-base font-bold mb-4">
            Formüller, Kurallar ve Matematiksel Bağıntılar
          </h2>
          {meta.formulas?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {meta.formulas.map((f, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[#14213D]/10 dark:border-slate-800 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{f.name}</span>
                    <span className="text-xs text-slate-400">
                      Sayfa {f.page}
                    </span>
                  </div>
                  <div className="rounded-lg bg-[#FAF6EE] dark:bg-slate-950 px-3 py-2 font-mono text-xs text-[#14213D] dark:text-[#FF6B5B] mb-2 overflow-x-auto">
                    {f.expression}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Bu belgede açık matematiksel formül tespit edilmedi.
            </p>
          )}
        </div>
      )}

      {activeTab === "pages" && (
        <div className="space-y-4">
          {pages.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-5"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2.5 mb-3">
                <span className="text-xs font-bold text-[#FF6B5B]">
                  Sayfa {p.page_number}
                </span>
                <span className="text-xs text-slate-400">
                  {p.word_count} kelime {p.has_ocr ? "• OCR" : ""}
                </span>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {p.text_content || "(Bu sayfada metin katmanı bulunamadı.)"}
              </pre>
            </div>
          ))}
        </div>
      )}

      {activeTab === "pdf" && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden h-[78vh]">
          <iframe
            src={`/api/documents/${doc.id}/file`}
            title={doc.title}
            className="w-full h-full"
          />
        </div>
      )}
    </div>
  );
}

