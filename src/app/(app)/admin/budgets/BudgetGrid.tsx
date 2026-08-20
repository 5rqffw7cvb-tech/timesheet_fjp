"use client";

import { useState, useTransition } from "react";
import MonthNav from "@/components/MonthNav";
import { setBudgetAction, copyBudgetsAction } from "@/actions/admin";
import { shiftMonth } from "@/lib/dates";

const HOURS_PER_CONG = 180;

interface Member {
  userId: string;
  fullName: string;
  roleTitle: string | null;
  used: Record<string, number>;
}

export default function BudgetGrid({
  year, month, members, projects, initial, initialRates,
}: {
  year: number; month: number;
  members: Member[];
  projects: { id: string; code: string; name: string }[];
  initial: Record<string, number>;
  initialRates: Record<string, number>;
}) {
  const [values, setValues] = useState<Record<string, number>>(initial);
  const [rates, setRates] = useState<Record<string, number>>(initialRates);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const shown = projects.filter(
    (p) => members.some((m) => values[`${m.userId}|${p.id}`] || m.used[p.id]),
  );
  const [extra, setExtra] = useState<string[]>([]);
  const visible = [...shown, ...projects.filter((p) => extra.includes(p.id) && !shown.includes(p))];

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
        else { setMsg(res.error ?? "Lỗi"); return; }
      }
      setDirty(new Set());
      setMsg(`Đã lưu ${n} ô.`);
    });
  }

  function copyPrev() {
    const prev = shiftMonth(year, month, -1);
    startTransition(async () => {
      const res = await copyBudgetsAction(prev.year, prev.month, year, month);
      setMsg(res.ok ? (res.message ?? "Đã chép.") : res.error ?? "Lỗi");
      if (res.ok) location.reload();
    });
  }

  function fillColumn(projectId: string) {
    const v = Number(prompt("Set cùng một số công cho tất cả thành viên ở project này:", "1.0"));
    if (!Number.isFinite(v)) return;
    for (const m of members) set(m.userId, projectId, v);
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <MonthNav year={year} month={month} />
        <span className="text-sm text-slate-500">Budget công + đơn giá theo thành viên × project (1.0 = 180h)</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Nếu nhập &gt; 0 thì project này sẽ được assign cho member
          </span>
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
          <select className="select w-56" value="" onChange={(e) => {
            if (e.target.value) setExtra((s) => [...s, e.target.value]);
          }}>
            <option value="">+ Thêm project vào bảng…</option>
            {projects.filter((p) => !visible.some((v) => v.id === p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
          <button className="btn-secondary btn-sm" onClick={copyPrev} disabled={busy}>
            Chép từ tháng trước
          </button>
          <button className="btn-primary" onClick={saveAll} disabled={busy || dirty.size === 0}>
            {busy ? "Đang lưu…" : `Lưu${dirty.size ? ` (${dirty.size})` : ""}`}
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th className="min-w-[200px]">Thành viên</th>
              {visible.map((p) => (
                <th key={p.id} className="text-right">
                  <button className="hover:text-brand-600" onClick={() => fillColumn(p.id)}
                          title="Điền cùng số công cho cả cột">
                    {p.name}
                    <div className="font-normal text-slate-400">{p.code}</div>
                  </button>
                </th>
              ))}
              <th className="text-right">Tổng budget (công)</th>
              <th className="text-right">Đã dùng (công)</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
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
                            placeholder="công"
                            onChange={(e) => set(m.userId, p.id, Number(e.target.value) || 0)}
                          />
                          <input
                            type="number" min={0} step={1000}
                            className={`input num w-24 text-right ${dirty.has(key) ? "border-brand-400 bg-brand-50" : ""}`}
                            value={rate === 0 ? "" : rate}
                            placeholder="đơn giá"
                            onChange={(e) => setRate(m.userId, p.id, Number(e.target.value) || 0)}
                          />
                        </div>
                        {used > 0 && (
                          <div className={`mt-0.5 text-[11px] num ${over ? "text-rose-600" : "text-slate-400"}`}>
                            dùng {usedCong.toFixed(2)} công ({used.toFixed(1)}h)
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
                Chọn một project ở ô “Thêm project vào bảng” để bắt đầu set budget.
              </td></tr>
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
