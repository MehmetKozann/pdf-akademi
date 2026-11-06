import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Clock,
  FileText,
  FileUp,
  HelpCircle,
  MessageSquareText,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";
import { formatFileSize, formatRelativeTR } from "@/lib/utils";
import { STUDY_ACTIVITY_LABELS } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const user = (await getCurrentUser())!;

  const [documents, notes, questions, attempts, sessions, courses] =
    await Promise.all([
      repository.listDocuments(user.id),
      repository.listStudyNotes(user.id),
      repository.listQuestions(user.id),
      repository.listExamAttempts(user.id),
      repository.listStudySessions(user.id, 8),
      repository.listCourses(user.id),
    ]);

  const completedAttempts = attempts.filter((a) => a.status === "completed");
  const avgScore =
    completedAttempts.length > 0
      ? Math.round(
          completedAttempts.reduce(
            (acc, a) => acc + Number(a.success_percentage),
            0
          ) / completedAttempts.length
        )
      : null;

  const courseMap = new Map(courses.map((c) => [c.id, c]));

  return (
    <div className="space-y-8">
      {/* Hoş Geldin Banner */}
      <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 sm:p-8 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#14213D] dark:text-[#F4EDE0] bg-[#F4EDE0] dark:bg-white/10 px-3 py-1 rounded-full mb-3">
            <Sparkles className="w-3.5 h-3.5 text-[#FF6B5B]" />
            Kişisel Akademik Çalışma Alanı
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#14213D] dark:text-white">
            Hoş Geldin, {user.full_name.split(" ")[0]}!
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl">
            {user.university || user.department
              ? `${[user.university, user.department].filter(Boolean).join(" • ")} — `
              : ""}
            Ders materyallerini yükleyerek sınava yönelik ders notları, soru bankaları ve tam kapsamlı deneme sınavları hazırlayabilirsin.
          </p>
        </div>

        {/* Quick Action Primary CTA */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            href="/panel/pdf-yukle"
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF6B5B] hover:bg-[#E85646] text-white text-sm font-semibold px-4 py-2.5 shadow-2xs transition-colors"
          >
            <FileUp className="w-4 h-4" />
            PDF Yükle
          </Link>
          <Link
            href="/panel/deneme-sinavlari"
            className="inline-flex items-center gap-2 rounded-xl bg-[#14213D] hover:bg-[#1E3158] dark:bg-white/10 dark:hover:bg-white/15 text-white text-sm font-semibold px-4 py-2.5 transition-colors"
          >
            <ClipboardCheck className="w-4 h-4 text-[#FF6B5B]" />
            Deneme Sınavı Başlat
          </Link>
        </div>
      </div>

      {/* 4 Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: "Toplam Yüklenen Belge",
            value: documents.length,
            sub: `${courses.length} kayıtlı ders`,
            icon: FileText,
            href: "/panel/pdf-yukle",
          },
          {
            label: "Oluşturulan Ders Notu",
            value: notes.length,
            sub: "7 farklı not formatı",
            icon: BookOpen,
            href: "/panel/ders-notlari",
          },
          {
            label: "Üretilen Soru Sayısı",
            value: questions.length,
            sub: `${questions.filter((q) => q.is_favorite).length} favori soru`,
            icon: HelpCircle,
            href: "/panel/soru-bankasi",
          },
          {
            label: "Tamamlanan Deneme Sınavı",
            value: completedAttempts.length,
            sub:
              avgScore !== null
                ? `Ortalama Başarı: %${avgScore}`
                : "Henüz sınav tamamlanmadı",
            icon: TrendingUp,
            href: "/panel/deneme-sinavlari",
          },
        ].map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-5 shadow-2xs hover:border-[#FF6B5B] transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-300">
                {stat.label}
              </span>
              <div className="w-9 h-9 rounded-xl bg-[#F4EDE0] dark:bg-white/10 text-[#14213D] dark:text-[#FF6B5B] flex items-center justify-center group-hover:bg-[#FF6B5B] group-hover:text-white transition-colors">
                <stat.icon className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-[#14213D] dark:text-white">
              {stat.value}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              {stat.sub}
            </p>
          </Link>
        ))}
      </div>

      {/* Quick Action Bar */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
          Hızlı İşlemler
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {[
            {
              title: "Ders Notu Üret",
              desc: "PDF'ten sınav odaklı veya kapsamlı not çıkar",
              href: "/panel/ders-notlari",
              icon: BookOpen,
            },
            {
              title: "Soru Bankası Oluştur",
              desc: "Klasik, çoktan seçmeli ve eşleştirme soruları üret",
              href: "/panel/soru-bankasi",
              icon: HelpCircle,
            },
            {
              title: "Deneme Sınavı Yapılandır",
              desc: "Zamanlayıcılı gerçek sınav simülasyonu başlat",
              href: "/panel/deneme-sinavlari",
              icon: ClipboardCheck,
            },
            {
              title: "YZ Çalışma Sohbeti",
              desc: "Belgeye sayfa referanslarıyla sorular sor",
              href: "/panel/asistan",
              icon: MessageSquareText,
            },
          ].map((act) => (
            <Link
              key={act.title}
              href={act.href}
              className="flex items-start gap-3.5 rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-4 hover:border-[#FF6B5B] hover:shadow-xs transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-[#F4EDE0] dark:bg-white/10 flex items-center justify-center text-[#14213D] dark:text-[#FF6B5B] shrink-0">
                <act.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#14213D] dark:text-white">
                  {act.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5 leading-snug">
                  {act.desc}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Documents & Recent Study Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Documents (2 cols) */}
        <div className="lg:col-span-2 rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-[#14213D] dark:text-white">
                Son Yüklenen Belgeler
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-300">
                Analiz edilen ders PDF&apos;leriniz ve sunumlarınız
              </p>
            </div>
            <Link
              href="/panel/pdf-yukle"
              className="text-xs font-semibold text-[#FF6B5B] hover:underline inline-flex items-center gap-1"
            >
              Tümünü Gör
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#14213D]/15 dark:border-slate-700 p-8 text-center">
              <FileUp className="w-8 h-8 text-slate-400 mx-auto mb-2.5" />
              <p className="text-sm font-medium text-[#14213D] dark:text-slate-200">
                Henüz bir PDF belgesi yüklemediniz
              </p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Ders notu ve soru üretmeye başlamak için ilk PDF dosyanızı yükleyin.
              </p>
              <Link
                href="/panel/pdf-yukle"
                className="inline-flex items-center gap-2 rounded-xl bg-[#14213D] hover:bg-[#1E3158] text-white text-xs font-semibold px-4 py-2"
              >
                <FileUp className="w-3.5 h-3.5" />
                İlk PDF&apos;i Yükle
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/10">
              {documents.slice(0, 5).map((doc) => {
                const course = doc.course_id
                  ? courseMap.get(doc.course_id)
                  : null;
                return (
                  <Link
                    key={doc.id}
                    href={`/panel/belgeler/${doc.id}`}
                    className="py-3.5 flex items-center justify-between gap-4 hover:bg-[#F4EDE0]/50 dark:hover:bg-white/5 -mx-3 px-3 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[#F4EDE0] dark:bg-white/10 text-[#14213D] dark:text-[#FF6B5B] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#14213D] dark:text-white truncate">
                          {doc.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span>{doc.page_count} sayfa</span>
                          <span>•</span>
                          <span>{formatFileSize(doc.file_size)}</span>
                          {course && (
                            <>
                              <span>•</span>
                              <span
                                className="font-medium"
                                style={{ color: course.color }}
                              >
                                {course.name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400 hidden sm:inline">
                        {formatRelativeTR(doc.created_at)}
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Study Sessions (1 col) */}
        <div className="rounded-2xl border border-[#14213D]/10 dark:border-slate-800 bg-white dark:bg-[#14213D] p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-[#14213D] dark:text-white">
                Son Çalışma Oturumları
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-300">
                Gerçekleştirdiğiniz son etkinlikler
              </p>
            </div>
            <Link
              href="/panel/calisma-gecmisi"
              className="text-xs font-semibold text-[#FF6B5B] hover:underline"
            >
              Geçmiş
            </Link>
          </div>

          {sessions.length === 0 ? (
            <div className="py-10 text-center">
              <Clock className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-500">
                Henüz çalışma etkinliği kaydedilmedi.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {sessions.slice(0, 6).map((s) => (
                <div
                  key={s.id}
                  className="flex items-start gap-3 text-xs border-b border-slate-100 dark:border-white/10 pb-3 last:border-0 last:pb-0"
                >
                  <span className="w-2 h-2 rounded-full bg-[#FF6B5B] mt-1.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 dark:text-slate-200 line-clamp-2">
                      {s.title}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <span>{STUDY_ACTIVITY_LABELS[s.activity_type]}</span>
                      <span>•</span>
                      <span>{formatRelativeTR(s.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

