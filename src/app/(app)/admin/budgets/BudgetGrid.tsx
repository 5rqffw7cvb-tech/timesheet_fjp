"use client";

import { useState, useTransition } from "react";
import MonthNav from "@/components/MonthNav";
import { setBudgetAction, copyBudgetsAction } from "@/actions/admin";
import { shiftMonth } from "@/lib/dates";
import { currencySymbol, type BillingCurrency } from "@/lib/currency";
import { sortRows, toggleSort, type SortState, containsText } from "@/lib/tableUi";
import { useLocale } from "@/components/LocaleProvider";

const HOURS_PER_CONG = 180;

interface Member {
  userId: string;
  fullName: string;
  roleTitle: string | null;
  used: Record<string, number>;
}

export default function BudgetGrid({
  year, month, members, projects, initial, initialRates, billingCurrency,
}: {
  year: number; month: number;
  members: Member[];
  projects: { id: string; code: string; name: string }[];
  initial: Record<string, number>;
  initialRates: Record<string, number>;
  billingCurrency: BillingCurrency;
}) {
  const moneyUnit = currencySymbol(billingCurrency);
  const { t, locale } = useLocale();
  const [values, setValues] = useState<Record<string, number>>(initial);
  const [rates, setRates] = useState<Record<string, number>>(initialRates);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "fullName", dir: "asc" });

  const shown = projects.filter(
    (p) => members.some((m) => values[`${m.userId}|${p.id}`] || m.used[p.id]),
  );
  const [extra, setExtra] = useState<string[]>([]);
  const visible = [...shown, ...projects.filter((p) => extra.includes(p.id) && !shown.includes(p))];
  const filteredMembers = sortRows(
    (q.trim()
      ? members.filter((m) => [m.fullName, m.roleTitle, ...visible.map((p) => p.name), ...visible.map((p) => p.code)]
        .some((v) => containsText(v, q)))
      : members),
    sort,
    (m) => {
      if (sort.key === "roleTitle") return m.roleTitle ?? "";
      if (sort.key === "totalBudget") return visible.reduce((s, p) => s + (values[`${m.userId}|${p.id}`] ?? 0), 0);
      if (sort.key === "totalUsed") return visible.reduce((s, p) => s + hoursToCong(m.used[p.id] ?? 0), 0);
      return m.fullName;
    },
  );

  function set(userId: string, projectId: string, v: number) {
    const key = `${userId}|${projectId}`;
    setValues((s) => ({ ...s, [key]: v }));
    setDirty((s) => new Set(s).add(key));
  }

  function setRate(userId: string, projectId: string, v: number) {
    const key = `${userId}|${projectId}`;
    setRates((s) => ({ ...s, [key]: v }));
    setDirty((s) => new Set(s).add(key));
  }

  function saveAll() {
    startTransition(async () => {
      let n = 0;
      for (const key of dirty) {
        const [userId, projectId] = key.split("|");
        const hours = congToHours(values[key] ?? 0);
        const unitPriceMm = rates[key] ?? 0;
        const res = await setBudgetAction(userId, projectId, year, month, hours, unitPriceMm);
        if (res.ok) n++;
        else { setMsg(res.error ?? (locale === "ja" ? "エラー" : "Error")); return; }
      }
      setDirty(new Set());
      setMsg(locale === "ja" ? `${n}件保存しました。` : `Saved ${n} cells.`);
    });
  }

  function copyPrev() {
    const prev = shiftMonth(year, month, -1);
    startTransition(async () => {
      const res = await copyBudgetsAction(prev.year, prev.month, year, month);
      setMsg(res.ok ? (res.message ?? (locale === "ja" ? "コピーしました。" : "Copied.")) : res.error ?? (locale === "ja" ? "エラー" : "Error"));
      if (res.ok) location.reload();
    });
  }

  function fillColumn(projectId: string) {
    const v = Number(prompt(locale === "ja" ? "このプロジェクトの全メンバーに同じ工数を設定:" : "Set the same budget for all members in this project:", "1.0"));
    if (!Number.isFinite(v)) return;
    for (const m of members) set(m.userId, projectId, v);
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <MonthNav year={year} month={month} />
        <span className="text-sm text-slate-500">{locale === "ja" ? `工数予算と単価をメンバー×PJで管理します（1.0 = 180h、単価 ${moneyUnit}/MM）` : `Manage budget and unit price per member × project (1.0 = 180h, unit price ${moneyUnit}/MM)`}</span>
        <div className="ml-auto flex items-center gap-2">
          <input className="input w-64" placeholder={t("budgetSearchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
            {locale === "ja" ? "0より大きい値を入れるとこのPJがメンバーに割り当てられます" : "If the value is > 0, the project is assigned to the member."}
          </span>
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
          <select className="select w-56" value="" onChange={(e) => {
            if (e.target.value) setExtra((s) => [...s, e.target.value]);
          }}>
            <option value="">+ {t("add")}</option>
            {projects.filter((p) => !visible.some((v) => v.id === p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
          <button className="btn-secondary btn-sm" onClick={copyPrev} disabled={busy}>
            {locale === "ja" ? "前月からコピー" : "Copy previous month"}
          </button>
          <button className="btn-primary" onClick={saveAll} disabled={busy || dirty.size === 0}>
            {busy ? t("saving") : `${t("save")}${dirty.size ? ` (${dirty.size})` : ""}`}
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th><button onClick={() => setSort(toggleSort(sort, "fullName"))} className="min-w-[200px] text-left">{t("membersTitle")}</button></th>
              {visible.map((p) => (
                <th key={p.id} className="text-right">
                  <button className="hover:text-brand-600" onClick={() => fillColumn(p.id)}
                            title={locale === "ja" ? "列全体に同じ工数を入力" : "Fill the same value for the whole column"}>
                    {p.name}
                    <div className="font-normal text-slate-400">{p.code}</div>
                  </button>
                </th>
              ))}
              <th className="text-right">{locale === "ja" ? "合計予算(工数)" : "Total budget"}</th>
              <th className="text-right">{locale === "ja" ? "使用済み(工数)" : "Used"}</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((m) => {
              const totalBudget = visible.reduce((s, p) => s + (values[`${m.userId}|${p.id}`] ?? 0), 0);
              const totalUsedHours = visible.reduce((s, p) => s + (m.used[p.id] ?? 0), 0);
              const totalUsedCong = hoursToCong(totalUsedHours);
              return (
                <tr key={m.userId}>
                  <td>
                    <div className="font-medium text-slate-700">{m.fullName}</div>
                    <div className="text-xs text-slate-400">{m.roleTitle ?? "—"}</div>
                  </td>
                  {visible.map((p) => {
                    const key = `${m.userId}|${p.id}`;
                    const used = m.used[p.id] ?? 0;
                    const usedCong = hoursToCong(used);
                    const budget = values[key] ?? 0;
                    const rate = rates[key] ?? 0;
                    const over = budget > 0 && usedCong > budget;
                    return (
                      <td key={p.id} className="text-right">
                        <div className="space-y-1">
                          <input
                            type="number" min={0} step={0.1}
                            className={`input num w-24 text-right ${dirty.has(key) ? "border-brand-400 bg-brand-50" : ""}`}
                            value={budget === 0 ? "" : budget}
                            placeholder={locale === "ja" ? "工数" : "hours"}
                            onChange={(e) => set(m.userId, p.id, Number(e.target.value) || 0)}
                          />
                          <input
                            type="number" min={0} step={1000}
                            className={`input num w-24 text-right ${dirty.has(key) ? "border-brand-400 bg-brand-50" : ""}`}
                            value={rate === 0 ? "" : rate}
                            placeholder={`${locale === "ja" ? "単価" : "unit price"} ${moneyUnit}`}
                            onChange={(e) => setRate(m.userId, p.id, Number(e.target.value) || 0)}
                          />
                        </div>
                        {used > 0 && (
                          <div className={`mt-0.5 text-[11px] num ${over ? "text-rose-600" : "text-slate-400"}`}>
                            {locale === "ja" ? `使用 ${usedCong.toFixed(2)}工数 (${used.toFixed(1)}h)` : `used ${usedCong.toFixed(2)} (${used.toFixed(1)}h)`}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-right num font-semibold">{totalBudget ? totalBudget.toFixed(2) : "—"}</td>
                  <td className="text-right num text-slate-500">{totalUsedCong ? totalUsedCong.toFixed(2) : "—"}</td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={3} className="py-8 text-center text-slate-400">
                {locale === "ja" ? "上部の追加からPJを選ぶと予算設定を開始できます。" : "Select a project above to start setting budgets."}
              </td></tr>
            )}
            {filteredMembers.length === 0 && visible.length > 0 && (
              <tr><td colSpan={visible.length + 3} className="py-8 text-center text-slate-400">{t("noData")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function congToHours(cong: number) {
  const normalized = Number.isFinite(cong) ? Math.max(0, cong) : 0;
  return round2(normalized * HOURS_PER_CONG);
}

function hoursToCong(hours: number) {
  const normalized = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  return round2(normalized / HOURS_PER_CONG);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
