import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fr } from './fr';
import { en } from './en';

export type Lang = 'fr' | 'en';
export type TKey = keyof typeof fr;
export const DICTS: Record<Lang, Record<TKey, string>> = { fr, en };

const STORAGE_KEY = 'bw.lang';

function initialLang(): Lang {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === 'fr' || s === 'en') return s;
  } catch {
    /* storage blocked */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function translate(lang: Lang, key: TKey | string, params?: Record<string, string | number>): string {
  const dict = DICTS[lang] as Record<string, string>;
  let s = dict[key] ?? (DICTS.en as Record<string, string>)[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, params?: Record<string, string | number>) => string;
  /** Translate a dynamic key (falls back to the key). */
  td: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo<I18nCtx>(
    () => ({
      lang,
      setLang,
      t: (k, p) => translate(lang, k, p),
      td: (k, p) => translate(lang, k, p),
      locale: lang === 'fr' ? 'fr-FR' : 'en-GB',
    }),
    [lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n outside provider');
  return c;
}

/** Picks the right language from a catalogue L10n object. */
export function useL10n() {
  const { lang } = useI18n();
  return (v: { fr: string; en: string }) => v[lang];
}
