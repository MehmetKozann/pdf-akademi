"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import type { ThemePreference } from "@/types/database";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface AppContextValue {
  theme: ThemePreference;
  setTheme: (next: ThemePreference) => void;
  toast: (message: string, type?: ToastType) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("light");
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const applyDomTheme = useCallback((pref: ThemePreference) => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const shouldDark =
      pref === "dark" || (pref === "system" && prefersDark);
    root.classList.toggle("dark", shouldDark);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(
      "akademik_ai_theme"
    ) as ThemePreference | null;
    const initial: ThemePreference =
      stored === "dark" || stored === "system" ? stored : "light";
    setThemeState(initial);
    applyDomTheme(initial);
  }, [applyDomTheme]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setThemeState(next);
      localStorage.setItem("akademik_ai_theme", next);
      applyDomTheme(next);
    },
    [applyDomTheme]
  );

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <AppContext.Provider value={{ theme, setTheme, toast }}>
      {children}

      {/* Notification Toast Stack */}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-[calc(100vw-2.5rem)] pointer-events-none"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-[#14213D]/15 dark:border-slate-800 bg-white dark:bg-[#14213D] px-4 py-3.5 shadow-lg transition-all duration-200"
          >
            {item.type === "success" && (
              <CheckCircle2 className="w-5 h-5 text-[#FF6B5B] shrink-0 mt-0.5" />
            )}
            {item.type === "error" && (
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            )}
            {item.type === "info" && (
              <Info className="w-5 h-5 text-[#14213D] dark:text-[#FF6B5B] shrink-0 mt-0.5" />
            )}
            <p className="text-sm text-slate-800 dark:text-slate-100 flex-1 leading-snug">
              {item.message}
            </p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Bildirimi kapat"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used inside AppProviders");
  }
  return ctx;
}

