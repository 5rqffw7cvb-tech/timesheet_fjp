"use client";

import { useRouter } from "next/navigation";
import { getLocaleCookieName } from "@/lib/locale";
import { useLocale } from "./LocaleProvider";
import type { Locale } from "@/lib/i18n";

export default function LocaleSwitcher() {
  const router = useRouter();
  const { locale, setLocale, t } = useLocale();

  function change(nextLocale: Locale) {
    if (nextLocale === locale) return;
    document.cookie = `${getLocaleCookieName()}=${nextLocale}; path=/; max-age=31536000`;
    setLocale(nextLocale);
    router.refresh();
  }

  return (
    <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5 text-xs">
      <button
        type="button"
        className={`rounded px-2 py-1 font-medium ${locale === "ja" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        onClick={() => change("ja")}
        aria-pressed={locale === "ja"}
      >
        {t("switchToJa")}
      </button>
      <button
        type="button"
        className={`rounded px-2 py-1 font-medium ${locale === "en" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        onClick={() => change("en")}
        aria-pressed={locale === "en"}
      >
        {t("switchToEn")}
      </button>
    </div>
  );
}
