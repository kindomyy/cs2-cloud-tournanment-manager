import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Phase } from "../arena/operations";
import {
  auditActionsByLang,
  phaseLabelsByLang,
  translateRound,
  translateSource,
} from "./common";
import { translateServerMessage, type Lang } from "./serverMessages";

export type { Lang } from "./serverMessages";
export const LANG_STORAGE_KEY = "kampus-arena-lang";

export function getStoredLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === "en" || saved === "tr") return saved;
  } catch {
    /* Storage may be unavailable in restricted contexts. */
  }
  return "tr";
}

export function langHeaders(): Record<string, string> {
  return { "Accept-Language": getStoredLang() };
}

type I18nValue = {
  lang: Lang;
  setLang: (next: Lang) => void;
  locale: "tr-TR" | "en-US";
  tzLabel: "TSİ" | "TRT";
  tx: (tr: string, en: string) => string;
  phaseLabel: (phase: Phase) => string;
  roundLabel: (round: string) => string;
  sourceLabel: (source?: string) => string;
  auditActionLabel: (action: string) => string;
  formatDateTime: (at: string | number) => string;
  formatTime: (at: string | number) => string;
  errText: (message: string) => string;
};

const Context = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getStoredLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* Ignore storage write failures. */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nValue>(() => {
    const locale = lang === "en" ? "en-US" : "tr-TR";
    const tzLabel = lang === "en" ? "TRT" : "TSİ";
    return {
      lang,
      setLang,
      locale,
      tzLabel,
      tx: (tr, en) => (lang === "en" ? en : tr),
      phaseLabel: (phase) => phaseLabelsByLang[lang][phase],
      roundLabel: (round) => translateRound(round, lang),
      sourceLabel: (source) => translateSource(source, lang),
      auditActionLabel: (action) => auditActionsByLang[lang][action] || action,
      formatDateTime: (at) =>
        `${new Date(at).toLocaleString(locale, { timeZone: "Europe/Istanbul" })} ${tzLabel}`,
      formatTime: (at) =>
        `${new Date(at).toLocaleTimeString(locale, { timeZone: "Europe/Istanbul" })} ${tzLabel}`,
      errText: (message) => translateServerMessage(message, lang),
    };
  }, [lang, setLang]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n() {
  const context = useContext(Context);
  if (!context) throw new Error("LanguageProvider gerekli.");
  return context;
}
