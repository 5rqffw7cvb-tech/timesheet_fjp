"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { getMessage, normalizeLocale, type Locale } from "@/lib/i18n";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: Parameters<typeof getMessage>[1], params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(normalizeLocale(initialLocale));
  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale: setLocaleState,
    t: (key, params) => getMessage(locale, key, params),
  }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used within LocaleProvider");
  return value;
}
