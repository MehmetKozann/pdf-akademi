"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useApp } from "@/components/providers/app-providers";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/types/database";

const TOP_NAVIGATION = [
  { name: "Genel Bakış", href: "/panel", exact: true },
  { name: "PDF Yükle", href: "/panel/pdf-yukle", exact: false },
  { name: "Ders Notlarım", href: "/panel/ders-notlari", exact: false },
  { name: "Soru Bankam", href: "/panel/soru-bankasi", exact: false },
  { name: "Deneme Sınavlarım", href: "/panel/deneme-sinavlari", exact: false },
  { name: "Çalışma Geçmişim", href: "/panel/calisma-gecmisi", exact: false },
  { name: "Çalışma Sohbeti", href: "/panel/asistan", exact: false },
];

interface SearchResultState {
  documents: { id: string; title: string; page_count: number }[];
  chunks: {
    id: string;
    document_id: string;
    document_title: string;
    page_start: number;
    excerpt: string;
  }[];
  notes: { id: string; title: string }[];
  questions: { id: string; question_text: string; topic: string }[];
}

export function DashboardShell({
  children,
}: {
  user: UserProfile;
  aiConfigured: boolean;
  activeProvider: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { theme, setTheme } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultState | null>(
    null
  );

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(searchQuery.trim())}`
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } finally {
        setSearching(false);
      }
    }, 260);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen]);

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Hide chrome during active fullscreen exam mode (/coz)
  const isExamTakingPage = /^\/panel\/deneme-sinavlari\/[^/]+\/coz/.test(
    pathname
  );
  if (isExamTakingPage) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4EDE0] dark:bg-[#0B1120]">
      {/* Modern Minimal Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#14213D] text-[#F4EDE0] border-b border-white/10">
        <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Brand Wordmark */}
          <Link
            href="/panel"
            className="flex items-center gap-2 shrink-0 group"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF6B5B] transition-transform group-hover:scale-110" />
            <span className="font-bold text-lg tracking-tight text-white">
              Akademik<span className="text-[#FF6B5B]">AI</span>
            </span>
          </Link>

          {/* Desktop Horizontal Links */}
          <nav
            aria-label="Üst menü"
            className="hidden lg:flex items-center gap-1"
          >
            {TOP_NAVIGATION.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "whitespace-nowrap px-3 xl:px-3.5 py-1.5 rounded-full text-[13.5px] font-medium transition-colors",
                    active
                      ? "bg-[#FF6B5B] text-white"
                      : "text-[#F4EDE0]/75 hover:text-white hover:bg-white/8"
                  )}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Right Minimal Utilities */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="İçeriklerde ara"
              className="inline-flex items-center gap-2 rounded-full bg-white/8 hover:bg-white/14 border border-white/10 px-3 py-1.5 text-xs text-[#F4EDE0]/85 hover:text-white transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-[#F4EDE0]/75" />
              <span className="hidden sm:inline">Ara</span>
              <kbd className="hidden xl:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-[#F4EDE0]/70">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={
                theme === "dark" ? "Açık Temaya Geç" : "Koyu Temaya Geç"
              }
              aria-label="Temayı değiştir"
              className="p-2 rounded-full bg-white/8 hover:bg-white/14 border border-white/10 text-[#F4EDE0]/85 hover:text-white transition-colors"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lg:hidden p-2 rounded-full bg-white/8 hover:bg-white/14 border border-white/10 text-[#F4EDE0]"
              aria-label={mobileMenuOpen ? "Menüyü kapat" : "Menüyü aç"}
            >
              {mobileMenuOpen ? (
                <X className="w-4 h-4" />
              ) : (
                <Menu className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Clean Top-Down Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-white/10 bg-[#14213D] px-4 py-3">
            <nav className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-w-7xl mx-auto">
              {TOP_NAVIGATION.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors",
                      active
                        ? "bg-[#FF6B5B] text-white"
                        : "text-[#F4EDE0]/80 hover:bg-white/8 hover:text-white"
                    )}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      {/* Workspace Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
        {children}
      </main>

      {/* Global Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4">
          <div
            className="fixed inset-0 bg-[#14213D]/60 backdrop-blur-xs"
            onClick={() => setSearchOpen(false)}
          />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-[#14213D]/15 dark:border-slate-800 bg-white dark:bg-[#14213D] shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-white/10">
              <Search className="w-5 h-5 text-[#FF6B5B]" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="PDF içeriğinde, kavramlarda, ders notlarında veya sorularda ara..."
                className="flex-1 bg-transparent text-sm text-[#14213D] dark:text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-4 space-y-5">
              {searchQuery.trim().length < 2 ? (
                <p className="text-center text-sm text-slate-500 dark:text-[#F4EDE0]/60 py-8">
                  Aramak istediğiniz kavramı, formülü veya konuyu yazın (en az 2 karakter).
                </p>
              ) : searching ? (
                <p className="text-center text-sm text-slate-500 dark:text-[#F4EDE0]/60 py-8">
                  Belgeler ve içerikler taranıyor...
                </p>
              ) : searchResults ? (
                <>
                  {searchResults.documents.length === 0 &&
                    searchResults.chunks.length === 0 &&
                    searchResults.notes.length === 0 &&
                    searchResults.questions.length === 0 && (
                      <p className="text-center text-sm text-slate-500 dark:text-[#F4EDE0]/60 py-8">
                        &ldquo;{searchQuery}&rdquo; ile eşleşen içerik bulunamadı.
                      </p>
                    )}

                  {searchResults.documents.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        PDF Belgeleri
                      </h4>
                      <div className="space-y-1.5">
                        {searchResults.documents.map((d) => (
                          <Link
                            key={d.id}
                            href={`/panel/belgeler/${d.id}`}
                            onClick={() => setSearchOpen(false)}
                            className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-[#F4EDE0] dark:hover:bg-white/10 text-sm"
                          >
                            <span className="font-medium">{d.title}</span>
                            <span className="text-xs text-slate-500 dark:text-[#F4EDE0]/60">
                              {d.page_count} sayfa
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults.chunks.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        Belge İçi Eşleşen Sayfalar
                      </h4>
                      <div className="space-y-2">
                        {searchResults.chunks.map((c) => (
                          <Link
                            key={c.id}
                            href={`/panel/belgeler/${c.document_id}`}
                            onClick={() => setSearchOpen(false)}
                            className="block rounded-xl border border-slate-100 dark:border-white/10 p-3 hover:border-[#FF6B5B] transition-colors"
                          >
                            <div className="flex items-center justify-between text-xs font-semibold text-[#14213D] dark:text-[#FF6B5B] mb-1">
                              <span>{c.document_title}</span>
                              <span>Sayfa {c.page_start}</span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                              {c.excerpt}
                            </p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults.notes.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        Ders Notları
                      </h4>
                      <div className="space-y-1.5">
                        {searchResults.notes.map((n) => (
                          <Link
                            key={n.id}
                            href={`/panel/ders-notlari/${n.id}`}
                            onClick={() => setSearchOpen(false)}
                            className="block rounded-xl px-3 py-2 hover:bg-[#F4EDE0] dark:hover:bg-white/10 text-sm font-medium"
                          >
                            {n.title}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults.questions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        Soru Bankası Eşleşmeleri
                      </h4>
                      <div className="space-y-1.5">
                        {searchResults.questions.map((q) => (
                          <Link
                            key={q.id}
                            href="/panel/soru-bankasi"
                            onClick={() => setSearchOpen(false)}
                            className="block rounded-xl px-3 py-2 hover:bg-[#F4EDE0] dark:hover:bg-white/10 text-sm"
                          >
                            <span className="text-xs font-semibold text-[#FF6B5B] mr-2">
                              [{q.topic}]
                            </span>
                            <span className="line-clamp-1">
                              {q.question_text}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
