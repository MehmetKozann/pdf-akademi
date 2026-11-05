"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Clock,
  Loader2,
  Star,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { cn, formatDateTR } from "@/lib/utils";
import {
  STUDY_ACTIVITY_LABELS,
  type ExamAttempt,
  type StudyActivityType,
  type StudySession,
} from "@/types/database";

interface StatsResponse {
  counts: {
    totalDocuments: number;
    totalNotes: number;
    totalQuestions: number;
    favoriteQuestions: number;
    totalExams: number;
    completedExams: number;
    averageExamPercentage: number;
    totalStudyMinutes: number;
  };
  allSessions: StudySession[];
  completedAttempts: ExamAttempt[];
  topicPerformance: {
    topic: string;
    attempts: number;
    percentage: number;
  }[];
}

export default function StudyHistoryPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          setStats(await res.json());
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading || !stats) {
    return (
      <div className="py-20 text-center text-sm text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#FF6B5B]" />
        Çalışma geçmişiniz ve performans analizleriniz yükleniyor...
      </div>
    );
  }

  const filteredSessions =
    activityFilter === "all"
      ? stats.allSessions
      : stats.allSessions.filter((s) => s.activity_type === activityFilter);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#14213D] dark:text-white">
          Çalışma Geçmişim ve Performans İstatistikleri
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Çalışma sürenizi, konu bazlı başarı yüzdelerinizi ve deneme sınavı
          gelişiminizi takip edin.
        </p>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Toplam Çalışma Süresi</span>
            <Clock className="w-4 h-4 text-[#FF6B5B]" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#14213D] dark:text-white">
            {stats.counts.totalStudyMinutes} dk
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {stats.allSessions.length} çalışma oturumu
          </p>
        </div>

        <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Ortalama Sınav Başarısı</span>
            <Trophy className="w-4 h-4 text-[#FF6B5B]" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#FF6B5B]">
            %{stats.counts.averageExamPercentage}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {stats.counts.completedExams} tamamlanan sınav
          </p>
        </div>

        <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Üretilen Eğitim İçeriği</span>
            <TrendingUp className="w-4 h-4 text-[#FF6B5B]" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#14213D] dark:text-white">
            {stats.counts.totalNotes + stats.counts.totalQuestions}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {stats.counts.totalNotes} ders notu • {stats.counts.totalQuestions} soru
          </p>
        </div>

        <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Favori Sorular</span>
            <Star className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#14213D] dark:text-white">
            {stats.counts.favoriteQuestions}
          </div>
          <Link
            href="/panel/soru-bankasi"
            className="text-xs font-semibold text-[#FF6B5B] hover:underline mt-1 inline-block"
          >
            Soru Bankasına Git →
          </Link>
        </div>
      </div>

      {/* Topic-Based Performance & Completed Exams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 shadow-2xs">
          <h2 className="text-base font-bold flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-[#FF6B5B]" />
            Konu Bazlı Başarı Takibi
          </h2>

          {stats.topicPerformance.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              Konu bazlı performans verisi oluşması için en az bir deneme sınavı
              tamamlayın.
            </p>
          ) : (
            <div className="space-y-3.5">
              {stats.topicPerformance.map((tp) => (
                <div key={tp.topic}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {tp.topic}
                    </span>
                    <span className="font-bold text-[#14213D] dark:text-[#FF6B5B]">
                      %{tp.percentage}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        tp.percentage >= 75
                          ? "bg-emerald-500"
                          : tp.percentage >= 50
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      )}
                      style={{ width: `${Math.min(100, tp.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 shadow-2xs">
          <h2 className="text-base font-bold mb-4">
            Tamamlanan Deneme Sınavı Sonuçları
          </h2>

          {stats.completedAttempts.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              Henüz tamamlanmış deneme sınavınız bulunmuyor.
            </p>
          ) : (
            <div className="space-y-2.5">
              {stats.completedAttempts.map((att) => (
                <Link
                  key={att.id}
                  href={`/panel/deneme-sinavlari/${att.exam_id}/sonuc/${att.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-white/10 p-3.5 hover:border-[#FF6B5B] transition-colors"
                >
                  <div>
                    <div className="text-xs font-semibold text-[#14213D] dark:text-white">
                      Doğru: {att.correct_count} • Yanlış: {att.incorrect_count}{" "}
                      • Boş: {att.unanswered_count}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {formatDateTR(att.completed_at || att.created_at, true)}
                    </div>
                  </div>
                  <span className="rounded-lg bg-[#F4EDE0] dark:bg-white/10 px-3 py-1 text-xs font-bold text-[#14213D] dark:text-[#FF6B5B]">
                    %{att.success_percentage}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <h2 className="text-base font-bold">Tüm Çalışma Etkinlikleri</h2>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActivityFilter("all")}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold",
                activityFilter === "all"
                  ? "bg-[#14213D] dark:bg-[#FF6B5B] text-white"
                  : "bg-[#F4EDE0] dark:bg-white/10 text-[#14213D] dark:text-slate-300"
              )}
            >
              Tümü
            </button>
            {(
              Object.entries(STUDY_ACTIVITY_LABELS) as [
                StudyActivityType,
                string,
              ][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setActivityFilter(k)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold",
                  activityFilter === k
                    ? "bg-[#14213D] dark:bg-[#FF6B5B] text-white"
                    : "bg-[#F4EDE0] dark:bg-white/10 text-[#14213D] dark:text-slate-300"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredSessions.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">
            Bu kategoride kayıtlı etkinlik bulunmuyor.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {filteredSessions.map((s) => (
              <div
                key={s.id}
                className="py-3.5 flex items-center justify-between gap-4 text-xs sm:text-sm"
              >
                <div>
                  <span className="inline-block rounded-md bg-[#F4EDE0] dark:bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#14213D] dark:text-[#FF6B5B] mr-2">
                    {STUDY_ACTIVITY_LABELS[s.activity_type]}
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {s.title}
                  </span>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {formatDateTR(s.created_at, true)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

