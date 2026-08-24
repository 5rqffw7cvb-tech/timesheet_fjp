"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MonthNav from "@/components/MonthNav";
import StatusBadge from "@/components/StatusBadge";
import type { OverviewRow } from "@/lib/adminData";
import { calcBillingByProjects } from "@/lib/billing";
import { currencySymbol, type BillingCurrency } from "@/lib/currency";
import { sortRows, toggleSort, type SortState, containsText } from "@/lib/tableUi";
import { useLocale } from "@/components/LocaleProvider";

export default function ExportPanel({
  year, month, rows, workingDays, selectedPeriods, selectedProjectIds, projects, billingCurrency,
}: {
  year: number;
  month: number;
  rows: OverviewRow[];
  workingDays: number;
  selectedPeriods: string[];
  selectedProjectIds: string[];
  projects: { id: string; code: string; name: string }[];
  billingCurrency: BillingCurrency;
}) {
  const moneyUnit = currencySymbol(billingCurrency);
  const router = useRouter();
  const { t, locale } = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [monthPopupOpen, setMonthPopupOpen] = useState(false);
  const [months, setMonths] = useState<string[]>(selectedPeriods.length ? selectedPeriods : [`${year}-${String(month).padStart(2, "0")}`]);
  const [projectId, setProjectId] = useState<string>(selectedProjectIds[0] ?? "");
  const [q, setQ] = useState("");
  const [billingSort, setBillingSort] = useState<SortState>({ key: "fullName", dir: "asc" });
  const [fileSort, setFileSort] = useState<SortState>({ key: "fullName", dir: "asc" });

  const approved = rows.filter((r) => r.status === "APPROVED");
  const withData = rows.filter((r) => r.usedHours > 0 || r.attendanceHours > 0);
  const filteredRows = q.trim()
    ? rows.filter((r) => [r.fullName, r.username, r.displayName, r.roleTitle, r.status, r.memberNote, r.reviewNote]
      .some((v) => containsText(v, q)))
    : rows;
  const filteredBilling = sortRows(
    withData.filter((r) => !q.trim() || [r.fullName, r.username, r.displayName, r.roleTitle, r.status].some((v) => containsText(v, q))),
    billingSort,
    (r) => {
      if (billingSort.key === "usedHours") return r.usedHours;
      if (billingSort.key === "amount") return calcBillingByProjects(
        r.usedHours,
        r.billingFactor,
        r.byProject.map((p) => ({ projectId: p.projectId, hours: p.used, unitPriceMm: p.unitPriceMm })),
        r.billingUnitPrice,
      ).adjustmentAmount;
      if (billingSort.key === "status") return r.status;
      return r.fullName;
    },
  ).map((r) => ({
    member: r,
    calc: calcBillingByProjects(
      r.usedHours,
      r.billingFactor,
      r.byProject.map((p) => ({ projectId: p.projectId, hours: p.used, unitPriceMm: p.unitPriceMm })),
      r.billingUnitPrice,
    ),
  }));
  const filteredFiles = sortRows(
    filteredRows,
    fileSort,
    (r) => {
      if (fileSort.key === "usedHours") return r.usedHours;
      if (fileSort.key === "attendanceHours") return r.attendanceHours;
      if (fileSort.key === "status") return r.status;
      return r.fullName;
    },
  );
  const totals = filteredBilling.reduce(
    (a, b) => ({
      amount: a.amount + b.calc.adjustmentAmount,
      under: a.under + (b.calc.band === "UNDER" ? 1 : 0),
      over: a.over + (b.calc.band === "OVER" ? 1 : 0),
    }),
    { amount: 0, under: 0, over: 0 },
  );

  const monthChoices = buildMonthChoices(year, month, 18);
  const recentMonthChoices = monthChoices.slice(0, 6);
  const extendedMonthChoices = monthChoices.slice(6);
  const isWeeklyCompatible = months.length === 1 && !projectId;

  async function download(url: string, key: string) {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: locale === "ja" ? "不明なエラー" : "Unknown error" }));
        setMsg(j.error ?? (locale === "ja" ? "ファイル出力に失敗しました" : "Export failed"));
        return;
      }
      const warnHeader = res.headers.get("X-Export-Warnings");
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const m = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const name = m ? decodeURIComponent(m[1]) : "export.xlsx";
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);

      if (warnHeader) {
        const warnings: string[] = JSON.parse(decodeURIComponent(warnHeader));
        if (warnings.length) setMsg(`${locale === "ja" ? "警告: " : "Warnings: "}${warnings.join(" · ")}`);
      }
    } finally {
      setBusy(null);
    }
  }

  function applyFilters() {
    if (months.length === 0) {
      setMsg(locale === "ja" ? "少なくとも1か月を選択してください。" : "Please select at least one month.");
      return;
    }
    const qs = new URLSearchParams();
    qs.set("year", String(year));
    qs.set("month", String(month));
    qs.set("months", months.join(","));
    if (projectId) qs.set("projects", projectId);
    router.push(`/admin/export?${qs.toString()}`);
    setFilterOpen(false);
  }

  function billingUrl(scope: "all" | "approved") {
    const qs = new URLSearchParams();
    qs.set("scope", scope);
    qs.set("months", months.join(","));
    if (projectId) qs.set("projectIds", projectId);
    return `/api/export/billing?${qs.toString()}`;
  }

  function toggleMonth(v: string) {
    setMonths((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-3 px-4 py-3">
        <button className="btn-secondary" onClick={() => setFilterOpen(true)}>{t("filterButton")}</button>
        <span className="text-sm text-slate-500">
          {locale === "ja" ? `表示中: ${months.length}か月 · ${projectId ? "1 PJ" : "全PJ"}` : `Showing: ${months.length} months · ${projectId ? "1 project" : "all projects"}`}
        </span>
        <input className="input ml-auto w-64" placeholder={t("memberSearchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {filterOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={() => setFilterOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-full max-w-sm overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">{locale === "ja" ? "出力条件" : "Report filters"}</h2>
              <button className="btn-ghost btn-sm" onClick={() => setFilterOpen(false)}>{t("close")}</button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500">{t("projectSelection")}</div>
                <select
                  className="select"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">{t("all")}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-slate-500">{t("exportRecentMonths")}</div>
                <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-2">
                  {recentMonthChoices.map((m) => (
                    <label key={m} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={months.includes(m)} onChange={() => toggleMonth(m)} />
                      <span className="num">{m}</span>
                    </label>
                  ))}
                </div>
                <button className="btn-ghost btn-sm mt-2" onClick={() => setMonthPopupOpen(true)}>
                  {t("exportMoreMonths")}
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
              <button className="btn-primary" onClick={applyFilters}>{t("filterButton")}</button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setMonths([`${year}-${String(month).padStart(2, "0")}`]);
                  setProjectId("");
                }}
              >
                Reset
              </button>
            </div>
          </aside>
        </>
      )}

      {monthPopupOpen && (
        <>
          <div className="fixed inset-0 z-[60] bg-slate-900/50" onClick={() => setMonthPopupOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-[70] w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">{t("monthSelection")}</h3>
              <button className="btn-ghost btn-sm" onClick={() => setMonthPopupOpen(false)}>{t("close")}</button>
            </div>
            <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto rounded-md border border-slate-200 p-2">
              {extendedMonthChoices.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={months.includes(m)} onChange={() => toggleMonth(m)} />
                  <span className="num">{m}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button className="btn-primary" onClick={() => setMonthPopupOpen(false)}>{locale === "ja" ? "完了" : "Done"}</button>
            </div>
          </div>
        </>
      )}

      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <MonthNav year={year} month={month} />
          <span className="text-sm text-slate-500">{locale === "ja" ? `承認済み ${approved.length}/${rows.length} · 所定日数 ${workingDays}` : `Approved ${approved.length}/${rows.length} · working days ${workingDays}`}</span>
        <div className="ml-auto flex gap-2">
          <button className="btn-secondary" disabled={busy !== null || withData.length === 0}
                  onClick={() => download(billingUrl("all"), "billing-all")}>
            {busy === "billing-all" ? t("loading") : `${t("downloadBilling")} (${t("all")})`}
          </button>
          <button className="btn-secondary" disabled={busy !== null || approved.length === 0}
                  onClick={() => download(billingUrl("approved"), "billing-approved")}>
            {busy === "billing-approved" ? t("loading") : `${t("downloadBilling")} (${t("statusApproved")})`}
          </button>
          <button className="btn-secondary" disabled={busy !== null || withData.length === 0 || !isWeeklyCompatible}
                  onClick={() => download(`/api/export?year=${year}&month=${month}&scope=all`, "all")}>
            {busy === "all" ? t("loading") : (locale === "ja" ? `データあり全件ダウンロード (${withData.length})` : `Download all with data (${withData.length})`)}
          </button>
          <button className="btn-primary" disabled={busy !== null || approved.length === 0 || !isWeeklyCompatible}
                  onClick={() => download(`/api/export?year=${year}&month=${month}&scope=approved`, "zip")}>
            {busy === "zip" ? t("loading") : (locale === "ja" ? `締め済みZIP (${approved.length})` : `Download approved ZIP (${approved.length})`)}
          </button>
        </div>
      </div>

      {msg && (
        <div className="card border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{msg}</div>
      )}

      {!isWeeklyCompatible && (
        <div className="card border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {locale === "ja"
            ? "複数月またはPJフィルタはBilling report専用です。週報出力は1か月・PJ未指定のときのみ有効です。"
            : "Multi-month or project filter only applies to Billing reports. Weekly report export works only for one month with no project filter."}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label={locale === "ja" ? "データありメンバー" : "Members with data"} value={String(withData.length)} />
        <Metric label={locale === "ja" ? "140h×係数未満" : "Under 140h×factor"} value={String(totals.under)} tone={totals.under ? "warn" : "ok"} />
        <Metric label={locale === "ja" ? "180h×係数超過" : "Over 180h×factor"} value={String(totals.over)} tone={totals.over ? "warn" : "ok"} />
        <Metric label={`${locale === "ja" ? "調整金額" : "Adjustment total"} (${moneyUnit})`} value={totals.amount.toLocaleString(locale === "ja" ? "ja-JP" : "en-US")} />
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">{locale === "ja" ? "140/180ルールの調整ダッシュボード" : "140/180 adjustment dashboard"}</h2>
          <span className="text-xs text-slate-400">adjustment = (max(0, hours-180*f) - max(0, 140*f-hours)) / 180 * {locale === "ja" ? "単価" : "unit price"} ({moneyUnit}/MM)</span>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th><button onClick={() => setBillingSort(toggleSort(billingSort, "fullName"))}>{t("membersTitle")}</button></th>
              <th><button className="text-right" onClick={() => setBillingSort(toggleSort(billingSort, "usedHours"))}>{t("timesheetHours")}</button></th><th className="text-right">{t("membersFactor")}</th>
              <th className="text-right">Lower</th><th className="text-right">Upper</th><th className="text-right">{locale === "ja" ? "不足" : "Short"}</th>
              <th className="text-right">{locale === "ja" ? "超過" : "Over"}</th><th className="text-right">{locale === "ja" ? "平均単価" : "Avg price"} ({moneyUnit})</th><th><button className="text-right" onClick={() => setBillingSort(toggleSort(billingSort, "amount"))}>{locale === "ja" ? "調整額" : "Adjustment"} ({moneyUnit})</button></th>
            </tr>
          </thead>
          <tbody>
            {filteredBilling.map(({ member, calc }) => (
              <tr key={member.userId}>
                <td>
                  <div className="font-medium text-slate-700">{member.fullName}</div>
                  <div className="text-xs text-slate-400">{member.displayName || member.username}</div>
                </td>
                <td className="text-right num">{member.usedHours.toFixed(2)}</td>
                <td className="text-right num">{member.billingFactor.toFixed(2)}</td>
                <td className="text-right num">{calc.lowerHours.toFixed(2)}</td>
                <td className="text-right num">{calc.upperHours.toFixed(2)}</td>
                <td className="text-right num">{calc.shortageHours.toFixed(2)}</td>
                <td className="text-right num">{calc.overtimeHours.toFixed(2)}</td>
                <td className="text-right num">{calc.weightedUnitPrice.toLocaleString("en-US")}</td>
                <td className={`text-right num font-medium ${calc.adjustmentAmount < 0 ? "text-rose-600" : calc.adjustmentAmount > 0 ? "text-emerald-600" : "text-slate-500"}`}>
                  {calc.adjustmentAmount.toLocaleString("en-US")}
                </td>
              </tr>
            ))}
            {filteredBilling.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-slate-400">{t("noData")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">{t("exportFilesTitle")}</h2>
          <span className="text-xs text-slate-400">{t("exportFilesNote")}</span>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th><button onClick={() => setFileSort(toggleSort(fileSort, "fullName"))}>{t("membersTitle")}</button></th><th>{locale === "ja" ? "ファイル名" : "File name"}</th>
              <th><button className="text-right" onClick={() => setFileSort(toggleSort(fileSort, "usedHours"))}>{t("timesheetHours")}</button></th><th><button className="text-right" onClick={() => setFileSort(toggleSort(fileSort, "attendanceHours"))}>{t("timesheetAttendance")}</button></th>
              <th><button onClick={() => setFileSort(toggleSort(fileSort, "status"))}>{t("membersStatus")}</button></th><th></th>
            </tr>
          </thead>
          <tbody>
            {filteredFiles.map((r) => {
              const fileName = `週報_FPTジャパン_${r.displayName || r.username}_${year}年${String(month).padStart(2, "0")}月.xlsx`;
              const empty = r.usedHours === 0 && r.attendanceHours === 0;
              return (
                <tr key={r.userId} className={empty ? "opacity-50" : ""}>
                  <td className="font-medium text-slate-700">{r.fullName}</td>
                  <td className="text-xs text-slate-500">{fileName}</td>
                  <td className="text-right num">{r.usedHours ? r.usedHours.toFixed(1) : "—"}</td>
                  <td className="text-right num">{r.attendanceHours ? r.attendanceHours.toFixed(1) : "—"}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="text-right">
                    <button className="btn-secondary btn-sm" disabled={busy !== null || empty || !isWeeklyCompatible}
                            onClick={() => download(`/api/export?year=${year}&month=${month}&user=${r.userId}`, r.userId)}>
                      {busy === r.userId ? "…" : t("downloadFile")}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredFiles.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-slate-400">{t("exportNoFiles")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card p-4 text-sm text-slate-600">
        <h3 className="mb-2 font-semibold text-slate-700">{locale === "ja" ? "顧客送付時の注意" : "Notes before sending to the customer"}</h3>
        <ul className="list-inside list-disc space-y-1 text-slate-600">
          <li>{locale === "ja"
            ? "出力ファイルは元テンプレートの形式を100%維持します：週次シート6枚、月間集計シート、勤務報告書、各マスターシート。"
            : "The exported file keeps 100% of the original template format: 6 weekly sheets, 月間集計シート, 勤務報告書, and the master sheets."}</li>
          <li>{locale === "ja"
            ? "アプリが書き込むのは週次シート6枚の入力セルのみです。月間集計と勤務報告書は数式のままで、Excelで開くと自動計算されます。"
            : "The app only writes into the input cells of the 6 weekly sheets; 月間集計 and 勤務報告書 remain formulas and recalculate automatically when opened in Excel."}</li>
          <li>{locale === "ja"
            ? <>セル <span className="num">月間集計シート!X4</span>（所定日数）は設定画面の値を使用します。送付前に必ず確認してください。</>
            : <>Cell <span className="num">月間集計シート!X4</span> (所定日数) comes from the Settings page. Double-check it before sending.</>}</li>
          <li>{locale === "ja"
            ? "各週次シートは最大20行の作業行しか持てません。1週間にproject×工種の組み合わせが20を超える場合、出力時に警告が表示されます。"
            : "Each weekly sheet holds at most 20 work rows. If a week has more than 20 project×工種 combinations, the app warns you on export."}</li>
        </ul>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-xl font-semibold num ${tone === "warn" ? "text-amber-600" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function buildMonthChoices(year: number, month: number, count: number) {
  const out: string[] = [];
  const d = new Date(year, month - 1, 1);
  for (let i = 0; i < count; i++) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}
