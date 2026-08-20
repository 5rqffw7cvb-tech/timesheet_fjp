"use client";

import { useLocale } from "@/components/LocaleProvider";

const MAP: Record<string, { ja: string; en: string; cls: string }> = {
  DRAFT:     { ja: "入力中", en: "Draft", cls: "bg-slate-100 text-slate-600" },
  SUBMITTED: { ja: "承認待ち", en: "Pending", cls: "bg-amber-100 text-amber-700" },
  APPROVED:  { ja: "締め済み", en: "Approved", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED:  { ja: "差戻し", en: "Rejected", cls: "bg-rose-100 text-rose-700" },
};

export default function StatusBadge({ status }: { status: string }) {
  const { locale } = useLocale();
  const m = MAP[status] ?? MAP.DRAFT;
  return <span className={`badge ${m.cls}`}>{locale === "ja" ? m.ja : m.en}</span>;
}
