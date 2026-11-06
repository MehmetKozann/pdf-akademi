"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Eye,
  FileText,
  FileUp,
  FolderPlus,
  HelpCircle,
  Loader2,
  ScanText,
  Trash2,
  X,
} from "lucide-react";
import { useApp } from "@/components/providers/app-providers";
import { cn, formatDateTR, formatFileSize } from "@/lib/utils";
import type { Course, DocumentRecord } from "@/types/database";

interface UploadQueueItem {
  id: string;
  fileName: string;
  fileSize: number;
  status: "uploading" | "done" | "error";
  progress: number;
  message?: string;
}

const COURSE_COLORS = [
  "#14213D",
  "#FF6B5B",
  "#0284C7",
  "#4F46E5",
  "#9333EA",
  "#16A34A",
];

export default function PdfUploadPage() {
  const { toast } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>("all");
  const [uploadCourseId, setUploadCourseId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);

  // Course creation modal state
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseCode, setNewCourseCode] = useState("");
  const [newCourseColor, setNewCourseColor] = useState("#14213D");
  const [creatingCourse, setCreatingCourse] = useState(false);

  // Quick preview modal
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, coursesRes] = await Promise.all([
        fetch("/api/documents"),
        fetch("/api/courses"),
      ]);
      if (docsRes.ok) {
        const d = await docsRes.json();
        setDocuments(d.documents || []);
      }
      if (coursesRes.ok) {
        const c = await coursesRes.json();
        setCourses(c.courses || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function processFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) => {
      const lower = f.name.toLowerCase();
      return (
        lower.endsWith(".pdf") ||
        lower.endsWith(".docx") ||
        lower.endsWith(".pptx")
      );
    });

    if (files.length === 0) {
      toast("Lütfen geçerli bir PDF (.pdf), Word (.docx) veya PowerPoint (.pptx) dosyası seçiniz.", "error");
      return;
    }

    for (const file of files) {
      const qId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setQueue((prev) => [
        {
          id: qId,
          fileName: file.name,
          fileSize: file.size,
          status: "uploading",
          progress: 25,
          message: "Belge yükleniyor ve metin/yapı analiz ediliyor...",
        },
        ...prev,
      ]);

      try {
        // Step 1: Ask backend for signed upload URL (Supabase direct upload) or local fallback
        const initRes = await fetch("/api/documents/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
          }),
        });

        if (!initRes.ok) {
          const errData = await initRes.json().catch(() => ({}));
          throw new Error(errData.error || "Yükleme başlatılamadı.");
        }

        const initData = await initRes.json();

        // Step 2: Upload binary
        if (initData.signedUrl) {
          // Direct upload to Supabase Storage (bypasses Vercel 4.5MB limit!)
          const uploadRes = await fetch(initData.signedUrl, {
            method: "PUT",
            headers: {
              "Content-Type": "application/pdf",
            },
            body: file,
          });

          if (!uploadRes.ok) {
            throw new Error("Dosya bulut depolama alanına yüklenemedi.");
          }

          setQueue((prev) =>
            prev.map((item) =>
              item.id === qId
                ? {
                    ...item,
                    progress: 60,
                    message: "Dosya yüklendi, yapay zeka metinleri analiz ediyor...",
                  }
                : item
            )
          );

          // Step 3: Trigger server processing and AI analysis
          const processRes = await fetch("/api/documents/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentId: initData.documentId,
              fileName: initData.safeFileName,
              fileSize: file.size,
              storagePath: initData.storagePath,
              courseId: uploadCourseId || null,
            }),
          });

          const procData = await processRes.json();
          if (!processRes.ok) {
            throw new Error(procData.error || "Belge analizi başarısız oldu.");
          }

          setQueue((prev) =>
            prev.map((item) =>
              item.id === qId
                ? {
                    ...item,
                    status: "done",
                    progress: 100,
                    message: `${procData.document.page_count} sayfa ve ${procData.chunkCount} anlamsal parça analiz edildi.`,
                  }
                : item
            )
          );
          setDocuments((prev) => [procData.document, ...prev]);
          toast(`"${procData.document.title}" başarıyla analiz edildi.`, "success");
        } else {
          // Direct fallback to /api/documents for local dev
          const formData = new FormData();
          formData.append("file", file);
          if (uploadCourseId) {
            formData.append("courseId", uploadCourseId);
          }

          const res = await fetch("/api/documents", {
            method: "POST",
            body: formData,
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "Yükleme başarısız oldu.");
          }

          setQueue((prev) =>
            prev.map((item) =>
              item.id === qId
                ? {
                    ...item,
                    status: "done",
                    progress: 100,
                    message: `${data.document.page_count} sayfa ve ${data.chunkCount} anlamsal parça analiz edildi.`,
                  }
                : item
            )
          );
          setDocuments((prev) => [data.document, ...prev]);
          toast(`"${data.document.title}" başarıyla analiz edildi.`, "success");
        }
      } catch (uploadError) {
        const errorMsg =
          uploadError instanceof Error
            ? uploadError.message
            : "Yükleme sırasında hata oluştu.";
        setQueue((prev) =>
          prev.map((item) =>
            item.id === qId
              ? {
                  ...item,
                  status: "error",
                  progress: 100,
                  message: errorMsg,
                }
              : item
          )
        );
        toast(errorMsg, "error");
      }
    }
  }

  async function handleCreateCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!newCourseName.trim()) return;
    setCreatingCourse(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCourseName,
          code: newCourseCode,
          color: newCourseColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Ders oluşturulamadı.", "error");
        return;
      }
      setCourses((prev) => [data.course, ...prev]);
      setUploadCourseId(data.course.id);
      setNewCourseName("");
      setNewCourseCode("");
      setCourseModalOpen(false);
      toast(`"${data.course.name}" dersi eklendi.`, "success");
    } finally {
      setCreatingCourse(false);
    }
  }

  async function handleDeleteDocument(doc: DocumentRecord) {
    if (
      !window.confirm(
        `"${doc.title}" belgesini ve ilişkili analiz verilerini silmek istediğinize emin misiniz?`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      toast("Belge silindi.", "info");
    } else {
      toast("Belge silinirken hata oluştu.", "error");
    }
  }

  async function handleCourseAssign(docId: string, courseId: string) {
    const res = await fetch(`/api/documents/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: courseId || null }),
    });
    if (res.ok) {
      const data = await res.json();
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? data.document : d))
      );
      toast("Ders ataması güncellendi.", "success");
    }
  }

  const filteredDocs =
    selectedCourseFilter === "all"
      ? documents
      : selectedCourseFilter === "unassigned"
      ? documents.filter((d) => !d.course_id)
      : documents.filter((d) => d.course_id === selectedCourseFilter);

  const courseMap = new Map(courses.map((c) => [c.id, c]));

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            PDF Yükle ve Belge Analizi
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Ders PDF&apos;lerinizi, sunumları ve taranmış notları yükleyin; yapay
            zeka metin, başlık, tanım ve formülleri çıkarsın.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCourseModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-[#14213D]/15 dark:border-slate-700 bg-white dark:bg-[#14213D] hover:border-[#FF6B5B] px-4 py-2.5 text-sm font-semibold text-[#14213D] dark:text-slate-200 shadow-2xs transition-colors shrink-0"
        >
          <FolderPlus className="w-4 h-4 text-[#FF6B5B]" />
          Yeni Ders / Klasör Ekle
        </button>
      </div>

      {/* Upload Dropzone Card */}
      <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Yüklenecek Belgelerin Dersi (İsteğe Bağlı):
          </label>
          <select
            value={uploadCourseId}
            onChange={(e) => setUploadCourseId(e.target.value)}
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950 px-3.5 py-2 text-sm text-[#14213D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5B] sm:w-72"
          >
            <option value="">Ders Seçilmedi (Genel Arşiv)</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} — ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (e.dataTransfer.files?.length) {
              processFiles(e.dataTransfer.files);
            }
          }}
          className={cn(
            "rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all",
            dragActive
              ? "border-[#FF6B5B] bg-[#FF6B5B]/8 dark:bg-[#FF6B5B]/15"
              : "border-[#14213D]/20 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950/60 hover:border-[#FF6B5B]"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                processFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />

          <div className="w-14 h-14 rounded-2xl bg-[#14213D] text-[#FF6B5B] flex items-center justify-center mx-auto mb-4 shadow-2xs">
            <FileUp className="w-7 h-7" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-[#14213D] dark:text-white">
            PDF, Word (.docx) ve PowerPoint (.pptx) belgelerinizi buraya sürükleyin
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-300 mt-1.5 max-w-md mx-auto">
            Ders slaytları, sunumlar ve notları aynı anda yükleyebilirsiniz.
            Yapay zeka başlıkları, slaytları ve kavramları otomatik çıkarır (Maks. 25 MB).
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF6B5B] hover:bg-[#E85646] text-white text-sm font-semibold px-5 py-2.5 shadow-2xs transition-colors"
          >
            Bilgisayardan Dosya Seç
          </button>
        </div>

        {/* Upload Progress Queue */}
        {queue.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Yükleme ve Analiz Durumu
              </span>
              <button
                type="button"
                onClick={() =>
                  setQueue((prev) =>
                    prev.filter((i) => i.status === "uploading")
                  )
                }
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Tamamlananları Temizle
              </button>
            </div>
            {queue.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.status === "uploading" ? (
                      <Loader2 className="w-4 h-4 text-[#FF6B5B] animate-spin shrink-0" />
                    ) : item.status === "done" ? (
                      <CheckCircle2 className="w-4 h-4 text-[#14213D] dark:text-[#FF6B5B] shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">
                      {item.fileName}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">
                      ({formatFileSize(item.fileSize)})
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-[#14213D] dark:text-[#FF6B5B]">
                    %{item.progress}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-300 rounded-full",
                      item.status === "error" ? "bg-red-500" : "bg-[#FF6B5B]"
                    )}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                {item.message && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                    {item.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Course Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedCourseFilter("all")}
          className={cn(
            "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors",
            selectedCourseFilter === "all"
              ? "bg-[#14213D] text-white"
              : "bg-white dark:bg-[#14213D] border border-[#14213D]/15 dark:border-slate-800 text-[#14213D] dark:text-slate-300"
          )}
        >
          Tüm Belgeler ({documents.length})
        </button>
        {courses.map((course) => {
          const count = documents.filter((d) => d.course_id === course.id).length;
          return (
            <button
              key={course.id}
              type="button"
              onClick={() => setSelectedCourseFilter(course.id)}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5",
                selectedCourseFilter === course.id
                  ? "bg-[#14213D] text-white"
                  : "bg-white dark:bg-[#14213D] border border-[#14213D]/15 dark:border-slate-800 text-[#14213D] dark:text-slate-300"
              )}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: course.color }}
              />
              {course.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Uploaded Documents List */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#FF6B5B]" />
          Belgeleriniz yükleniyor...
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-12 text-center">
          <FileText className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-[#14213D] dark:text-slate-200">
            Bu görünümde henüz PDF belgesi bulunmuyor
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Yukarıdaki alandan ders PDF&apos;lerinizi sürükleyip bırakarak başlayın.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDocs.map((doc) => {
            const course = doc.course_id ? courseMap.get(doc.course_id) : null;
            return (
              <div
                key={doc.id}
                className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-5 shadow-2xs flex flex-col justify-between gap-4 hover:border-[#FF6B5B] transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#F4EDE0] dark:bg-white/10 text-[#14213D] dark:text-[#FF6B5B] flex items-center justify-center shrink-0 mt-0.5">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/panel/belgeler/${doc.id}`}
                          className="text-base font-bold text-[#14213D] dark:text-white hover:text-[#FF6B5B] dark:hover:text-[#FF6B5B] line-clamp-1"
                        >
                          {doc.title}
                        </Link>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                          <span>{doc.page_count} Sayfa</span>
                          <span>•</span>
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span>•</span>
                          <span>{formatDateTR(doc.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteDocument(doc)}
                      title="Belgeyi Sil"
                      aria-label="Belgeyi Sil"
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Badges & Course Selector */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    {doc.ocr_applied && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#FF6B5B]/12 px-2 py-0.5 text-[11px] font-semibold text-[#FF6B5B]">
                        <ScanText className="w-3 h-3" />
                        OCR Uygulandı
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      {doc.extracted_metadata?.chapters?.length || 0} Bölüm
                    </span>
                    <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      {doc.extracted_metadata?.key_concepts?.length || 0} Kavram
                    </span>

                    <select
                      value={doc.course_id || ""}
                      onChange={(e) => handleCourseAssign(doc.id, e.target.value)}
                      aria-label="Ders seç"
                      className="ml-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300"
                      style={
                        course ? { borderColor: `${course.color}55` } : undefined
                      }
                    >
                      <option value="">Ders Ata...</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {doc.extracted_metadata?.summary && (
                    <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {doc.extracted_metadata.summary}
                    </p>
                  )}
                </div>

                {/* Action Footer */}
                <div className="pt-3 border-t border-slate-100 dark:border-white/10 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(doc)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-[#14213D] dark:text-slate-200 hover:border-[#FF6B5B]"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Önizle
                  </button>
                  <Link
                    href={`/panel/belgeler/${doc.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-[#14213D] dark:text-slate-200 hover:border-[#FF6B5B]"
                  >
                    Yapı Analizi
                  </Link>
                  <Link
                    href={`/panel/ders-notlari?documentId=${doc.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#F4EDE0] dark:bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#14213D] dark:text-[#F4EDE0] hover:bg-[#FF6B5B]/15"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-[#FF6B5B]" />
                    Not Üret
                  </Link>
                  <Link
                    href={`/panel/soru-bankasi?documentId=${doc.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#14213D] hover:bg-[#1E3158] dark:bg-[#FF6B5B] dark:hover:bg-[#E85646] px-3 py-1.5 text-xs font-semibold text-white ml-auto"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    Soru Üret
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Course Modal */}
      {courseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setCourseModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Yeni Ders Oluştur</h3>
              <button
                type="button"
                onClick={() => setCourseModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">
                  Ders Adı
                </label>
                <input
                  type="text"
                  required
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  placeholder="Örn: Veri Yapıları ve Algoritmalar"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">
                  Ders Kodu (İsteğe Bağlı)
                </label>
                <input
                  type="text"
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                  placeholder="Örn: BIL201"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">
                  Renk Etiketi
                </label>
                <div className="flex items-center gap-2.5">
                  {COURSE_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setNewCourseColor(col)}
                      className={cn(
                        "w-7 h-7 rounded-full border-2 transition-transform",
                        newCourseColor === col
                          ? "border-slate-900 dark:border-white scale-110"
                          : "border-transparent"
                      )}
                      style={{ backgroundColor: col }}
                      aria-label={`Renk ${col}`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setCourseModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={creatingCourse}
                  className="rounded-xl bg-[#14213D] hover:bg-[#1E3158] text-white px-5 py-2 text-sm font-semibold"
                >
                  {creatingCourse ? "Kaydediliyor..." : "Dersi Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick PDF Native Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setPreviewDoc(null)}
          />
          <div className="relative z-10 w-full max-w-5xl h-[85vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm sm:text-base">
                  {previewDoc.title}
                </h3>
                <p className="text-xs text-slate-500">
                  {previewDoc.page_count} Sayfa •{" "}
                  {formatFileSize(previewDoc.file_size)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/panel/belgeler/${previewDoc.id}`}
                  className="rounded-lg bg-[#14213D] text-white px-3 py-1.5 text-xs font-semibold"
                >
                  Tam Analiz Görünümü
                </Link>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <iframe
              src={`/api/documents/${previewDoc.id}/file`}
              title={previewDoc.title}
              className="w-full flex-1 bg-slate-100 dark:bg-slate-950"
            />
          </div>
        </div>
      )}
    </div>
  );
}

