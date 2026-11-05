"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BookOpenCheck,
  FileText,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/components/providers/app-providers";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { cn, formatRelativeTR } from "@/lib/utils";
import type { ChatMessage, Course, DocumentRecord } from "@/types/database";

const SUGGESTED_QUESTIONS = [
  "Bu konuyu daha basit anlatır mısın?",
  "Bu bölümün önemli noktaları neler?",
  "Bana bu konudan 5 soru sor.",
  "Bu formülü örnekle açıkla.",
  "Bu konuyu sınavda nasıl sorabilirler?",
  "Anlamadığım bölümü tekrar açıkla.",
];

interface ChatSessionSummary {
  session_id: string;
  document_id: string | null;
  last_message: string;
  updated_at: string;
  message_count: number;
}

function StudyAssistantInner() {
  const searchParams = useSearchParams();
  const initialDocId = searchParams.get("documentId") || "";
  const { toast } = useApp();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>(
    () => `chat-${Date.now()}`
  );
  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocId);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/chat");
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions || []);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const [docsRes, coursesRes] = await Promise.all([
        fetch("/api/documents"),
        fetch("/api/courses"),
      ]);
      if (docsRes.ok) {
        const d = await docsRes.json();
        setDocuments(
          (d.documents || []).filter(
            (doc: DocumentRecord) => doc.status === "ready"
          )
        );
      }
      if (coursesRes.ok) {
        const c = await coursesRes.json();
        setCourses(c.courses || []);
      }
      await loadSessions();
    }
    init();
  }, [loadSessions]);

  async function selectSession(sess: ChatSessionSummary) {
    setActiveSessionId(sess.session_id);
    if (sess.document_id) setSelectedDocId(sess.document_id);
    const res = await fetch(
      `/api/chat?sessionId=${encodeURIComponent(sess.session_id)}`
    );
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages || []);
    }
  }

  function startNewSession() {
    setActiveSessionId(`chat-${Date.now()}`);
    setMessages([]);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSend(customText?: string) {
    const text = (customText ?? input).trim();
    if (!text || sending) return;

    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          documentId: selectedDocId || null,
          courseId: selectedCourseId || null,
          message: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Yanıt alınamadı.", "error");
        return;
      }

      setMessages((prev) => [
        ...prev,
        data.userMessage,
        data.assistantMessage,
      ]);
      await loadSessions();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-8.5rem)] min-h-[580px]">
      {/* Left Sidebar: Scope & Past Sessions */}
      <div className="lg:col-span-4 xl:col-span-3 rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-4 flex flex-col gap-4 overflow-hidden">
        <button
          type="button"
          onClick={startNewSession}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#14213D] hover:bg-[#1E3158] dark:bg-[#FF6B5B] dark:hover:bg-[#E85646] text-white text-xs font-semibold py-2.5 px-4 shadow-2xs transition-colors"
        >
          <MessageSquarePlus className="w-4 h-4 text-[#FF6B5B] dark:text-white" />
          Yeni Çalışma Sohbeti
        </button>

        <div className="space-y-2.5 border-b border-slate-100 dark:border-white/10 pb-4">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Kaynak Belge Kapsamı
          </label>
          <select
            value={selectedDocId}
            onChange={(e) => {
              setSelectedDocId(e.target.value);
              if (e.target.value) setSelectedCourseId("");
            }}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950 px-3 py-2 text-xs"
          >
            <option value="">Tüm Yüklenen PDF Belgelerim</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({d.page_count} syf)
              </option>
            ))}
          </select>

          {!selectedDocId && courses.length > 0 && (
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950 px-3 py-2 text-xs"
            >
              <option value="">Tüm Dersler</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  Ders: {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Önceki Sohbetler
          </div>
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              Henüz kayıtlı bir çalışma sohbetiniz yok.
            </p>
          ) : (
            sessions.map((s) => (
              <button
                key={s.session_id}
                type="button"
                onClick={() => selectSession(s)}
                className={cn(
                  "w-full text-left rounded-xl p-2.5 text-xs transition-colors",
                  activeSessionId === s.session_id
                    ? "bg-[#F4EDE0] dark:bg-white/10 text-[#14213D] dark:text-[#FF6B5B] font-semibold"
                    : "hover:bg-[#FAF6EE] dark:hover:bg-white/5 text-slate-700 dark:text-slate-300"
                )}
              >
                <div className="line-clamp-1">{s.last_message}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {formatRelativeTR(s.updated_at)} • {s.message_count} mesaj
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Panel */}
      <div className="lg:col-span-8 xl:col-span-9 rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] flex flex-col overflow-hidden shadow-2xs">
        {/* Chat Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#F4EDE0] dark:bg-white/10 text-[#14213D] dark:text-[#FF6B5B] flex items-center justify-center">
              <BookOpenCheck className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#14213D] dark:text-white">
                YZ Çalışma Asistanı (Belgeye Dayalı RAG)
              </h1>
              <p className="text-[11px] text-slate-500">
                Yanıtlar sayfa referanslarıyla doğrulanır; belgede olmayan konular açıkça belirtilir.
              </p>
            </div>
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center py-6">
              <div className="w-12 h-12 rounded-2xl bg-[#14213D] text-[#FF6B5B] flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-[#14213D] dark:text-white">
                Ders Belgeleriniz Hakkında Soru Sorun
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1.5 mb-6">
                Yüklediğiniz PDF kaynaklarını birincil referans olarak kullanan
                yapay zeka asistanınızla konuları pekiştirin.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleSend(q)}
                    className="text-left rounded-xl border border-[#14213D]/10 dark:border-white/10 bg-[#FAF6EE] dark:bg-slate-950 hover:border-[#FF6B5B] px-3.5 py-2.5 text-xs font-medium text-[#14213D] dark:text-slate-300 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col",
                  m.role === "user" ? "items-end" : "items-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-3xl rounded-2xl px-4 py-3.5 text-sm",
                    m.role === "user"
                      ? "bg-[#14213D] dark:bg-[#FF6B5B] text-white"
                      : "bg-[#FAF6EE] dark:bg-slate-950 border border-[#14213D]/10 dark:border-slate-800"
                  )}
                >
                  {m.role === "assistant" ? (
                    <>
                      <MarkdownViewer content={m.content} />

                      {m.has_external_knowledge && (
                        <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                          Not: Bu yanıtta belge içeriğine ek olarak genel
                          akademik açıklama yer almaktadır.
                        </div>
                      )}

                      {m.citations?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800">
                          <div className="text-[11px] font-semibold text-slate-400 mb-1.5">
                            Kullanılan Kaynak Bölümler:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {m.citations.map((cit, idx) => (
                              <Link
                                key={idx}
                                href={`/panel/belgeler/${cit.document_id}`}
                                className="inline-flex items-center gap-1 rounded-lg bg-white dark:bg-[#14213D] border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-medium text-[#14213D] dark:text-[#FF6B5B] hover:border-[#FF6B5B]"
                              >
                                <FileText className="w-3 h-3 text-[#FF6B5B]" />
                                {cit.document_title} • Sayfa {cit.page_start}
                                {cit.page_end !== cit.page_start
                                  ? `-${cit.page_end}`
                                  : ""}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex items-center gap-2.5 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-[#FF6B5B]" />
              Belge parçaları inceleniyor ve sayfa referanslı yanıt hazırlanıyor...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-4 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#14213D] flex items-center gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Belgenizle ilgili bir soru sorun (Örn: 2. bölümdeki formülü örnekle açıkla)..."
            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#FAF6EE] dark:bg-slate-950 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B5B]"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF6B5B] hover:bg-[#E85646] disabled:opacity-50 text-white font-semibold px-5 py-3 text-sm transition-colors"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Gönder</span>
          </button>
        </form>
      </div>
    </div>
  );
}

export default function StudyAssistantPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-slate-500">
          Yükleniyor...
        </div>
      }
    >
      <StudyAssistantInner />
    </Suspense>
  );
}

