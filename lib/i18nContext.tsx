'use client';

import { createContext, useContext, useState } from 'react';
import { translations } from './i18n';
import type { UILang, TKey } from './i18n';

type LangCtxValue = { lang: UILang; setLang: (l: UILang) => void; t: (key: TKey) => string };

const LangCtx = createContext<LangCtxValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => translations.en[key],
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<UILang>('en');
  const t = (key: TKey): string => translations[lang][key];
  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}
