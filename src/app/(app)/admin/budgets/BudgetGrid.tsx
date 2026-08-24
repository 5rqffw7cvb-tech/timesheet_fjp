"use client";

import { Fragment, useState, useTransition } from "react";
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

/**
 * Mỗi member gộp thành 1 dòng (không còn 1 cột/project) — click dòng để mở
 * rộng danh sách project riêng của member đó. Tránh cuộn ngang bất tận khi
 * tổ chức có nhiều project (nếu mỗi project là 1 cột thì 10 project = 20
 * input cột, không quản lý nổi).
 */
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [extraByMember, setExtraByMember] = useState<Record<string, string[]>>({});

  const projectById = new Map(projects.map((p) => [p.id, p]));

  function memberProjectIds(m: Member): string[] {
    const ids = new Set<string>(extraByMember[m.userId] ?? []);
    for (const p of projects) {
      if ((values[`${m.userId}|${p.id}`] ?? 0) > 0 || (m.used[p.id] ?? 0) > 0) ids.add(p.id);
    }
    return projects.filter((p) => ids.has(p.id)).map((p) => p.id);
  }

  const rowsData = members.map((m) => ({ m, pids: memberProjectIds(m) }));
  const filteredRows = sortRows(
    (q.trim()
      ? rowsData.filter(({ m, pids }) => [
          m.fullName, m.roleTitle,
          ...pids.map((id) => projectById.get(id)?.name),
          ...pids.map((id) => projectById.get(id)?.code),
        ].some((v) => containsText(v ?? null, q)))
      : rowsData),
    sort,
    ({ m, pids }) => {
      if (sort.key === "roleTitle") return m.roleTitle ?? "";
      if (sort.key === "totalBudget") return pids.reduce((s, id) => s + (values[`${m.userId}|${id}`] ?? 0), 0);
      if (sort.key === "totalUsed") return pids.reduce((s, id) => s + hoursToCong(m.used[id] ?? 0), 0);
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

  function toggleExpand(userId: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  function addProjectToMember(userId: string, projectId: string) {
    if (!projectId) return;
    setExtraByMember((s) => ({ ...s, [userId]: [...(s[userId] ?? []), projectId] }));
    setExpanded((s) => new Set(s).add(userId));
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
              <th className="w-6" />
              <th><button onClick={() => setSort(toggleSort(sort, "fullName"))} className="min-w-[200px] text-left">{t("membersTitle")}</button></th>
              <th className="text-right">{locale === "ja" ? "担当PJ数" : "Projects"}</th>
              <th className="text-right"><button onClick={() => setSort(toggleSort(sort, "totalBudget"))}>{locale === "ja" ? "合計予算(工数)" : "Total budget"}</button></th>
              <th className="text-right"><button onClick={() => setSort(toggleSort(sort, "totalUsed"))}>{locale === "ja" ? "使用済み(工数)" : "Used"}</button></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(({ m, pids }) => {
              const totalBudget = pids.reduce((s, id) => s + (values[`${m.userId}|${id}`] ?? 0), 0);
              const totalUsedCong = hoursToCong(pids.reduce((s, id) => s + (m.used[id] ?? 0), 0));
              const isOpen = expanded.has(m.userId);
              return (
                <Fragment key={m.userId}>
                  <tr className="cursor-pointer hover:bg-slate-50" onClick={() => toggleExpand(m.userId)}>
                    <td className="text-center text-slate-400">{isOpen ? "▾" : "▸"}</td>
                    <td>
                      <div className="font-medium text-slate-700">{m.fullName}</div>
                      <div className="text-xs text-slate-400">{m.roleTitle ?? "—"}</div>
                    </td>
                    <td className="text-right num text-slate-500">{pids.length || "—"}</td>
                    <td className="text-right num font-semibold">{totalBudget ? totalBudget.toFixed(2) : "—"}</td>
                    <td className="text-right num text-slate-500">{totalUsedCong ? totalUsedCong.toFixed(2) : "—"}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td />
                      <td colSpan={4} className="bg-slate-50 p-0">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-slate-400">
                              <th className="py-1 pl-3 text-left">{locale === "ja" ? "プロジェクト" : "Project"}</th>
                              <th className="text-right">{locale === "ja" ? "工数" : "hours"}</th>
                              <th className="text-right">{locale === "ja" ? "単価" : "unit price"}</th>
                              <th className="py-1 pr-3 text-right">{locale === "ja" ? "使用済み" : "used"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pids.map((pid) => {
                              const p = projectById.get(pid);
                              const key = `${m.userId}|${pid}`;
                              const used = m.used[pid] ?? 0;
                              const usedCong = hoursToCong(used);
                              const budget = values[key] ?? 0;
                              const rate = rates[key] ?? 0;
                              const over = budget > 0 && usedCong > budget;
                              return (
                                <tr key={pid} onClick={(e) => e.stopPropagation()}>
                                  <td className="py-1.5 pl-3">
                                    <div className="text-slate-700">{p?.name ?? pid}</div>
                                    <div className="text-xs text-slate-400">{p?.code}</div>
                                  </td>
                                  <td className="text-right">
                                    <input
                                      type="number" min={0} step={0.1}
                                      className={`input num w-24 text-right ${dirty.has(key) ? "border-brand-400 bg-brand-50" : ""}`}
                                      value={budget === 0 ? "" : budget}
                                      placeholder={locale === "ja" ? "工数" : "hours"}
                                      onChange={(e) => set(m.userId, pid, Number(e.target.value) || 0)}
                                    />
                                  </td>
                                  <td className="text-right">
                                    <input
                                      type="number" min={0} step={1000}
                                      className={`input num w-28 text-right ${dirty.has(key) ? "border-brand-400 bg-brand-50" : ""}`}
                                      value={rate === 0 ? "" : rate}
                                      placeholder={`${locale === "ja" ? "単価" : "unit price"} ${moneyUnit}`}
                                      onChange={(e) => setRate(m.userId, pid, Number(e.target.value) || 0)}
                                    />
                                  </td>
                                  <td className="py-1.5 pr-3 text-right">
                                    {used > 0
                                      ? <span className={`num text-[11px] ${over ? "text-rose-600" : "text-slate-400"}`}>
                                          {locale === "ja" ? `${usedCong.toFixed(2)}工数 (${used.toFixed(1)}h)` : `${usedCong.toFixed(2)} (${used.toFixed(1)}h)`}
                                        </span>
                                      : <span className="text-slate-300">—</span>}
                                  </td>
                                </tr>
                              );
                            })}
                            <tr onClick={(e) => e.stopPropagation()}>
                              <td colSpan={4} className="py-2 pl-3">
                                <select className="select w-64" value="" onChange={(e) => { addProjectToMember(m.userId, e.target.value); e.target.value = ""; }}>
                                  <option value="">+ {locale === "ja" ? "プロジェクトを追加" : "Add project"}</option>
                                  {projects.filter((p) => !pids.includes(p.id)).map((p) => (
                                    <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filteredRows.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400">{t("noData")}</td></tr>
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
