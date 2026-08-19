"use client";

import { useState, useTransition } from "react";
import MonthNav from "@/components/MonthNav";
import { setBudgetAction, copyBudgetsAction } from "@/actions/admin";
import { shiftMonth } from "@/lib/dates";

interface Member {
  userId: string;
  fullName: string;
  roleTitle: string | null;
  used: Record<string, number>;
}

export default function BudgetGrid({
  year, month, members, projects, initial,
}: {
  year: number; month: number;
  members: Member[];
  projects: { id: string; code: string; name: string }[];
  initial: Record<string, number>;
}) {
  const [values, setValues] = useState<Record<string, number>>(initial);
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

  function saveAll() {
    startTransition(async () => {
      let n = 0;
      for (const key of dirty) {
        const [userId, projectId] = key.split("|");
        const res = await setBudgetAction(userId, projectId, year, month, values[key] ?? 0);
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
    const v = Number(prompt("Set cùng một số giờ cho tất cả thành viên ở project này:", "160"));
    if (!Number.isFinite(v)) return;
    for (const m of members) set(m.userId, projectId, v);
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <MonthNav year={year} month={month} />
        <span className="text-sm text-slate-500">Budget giờ theo thành viên × project</span>
        <div className="ml-auto flex items-center gap-2">
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
                          title="Điền cùng giá trị cho cả cột">
                    {p.name}
                    <div className="font-normal text-slate-400">{p.code}</div>
                  </button>
                </th>
              ))}
              <th className="text-right">Tổng budget</th>
              <th className="text-right">Đã dùng</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const totalBudget = visible.reduce((s, p) => s + (values[`${m.userId}|${p.id}`] ?? 0), 0);
              const totalUsed = visible.reduce((s, p) => s + (m.used[p.id] ?? 0), 0);
              return (
                <tr key={m.userId}>
                  <td>
                    <div className="font-medium text-slate-700">{m.fullName}</div>
                    <div className="text-xs text-slate-400">{m.roleTitle ?? "—"}</div>
                  </td>
                  {visible.map((p) => {
                    const key = `${m.userId}|${p.id}`;
                    const used = m.used[p.id] ?? 0;
                    const budget = values[key] ?? 0;
                    const over = budget > 0 && used > budget;
                    return (
                      <td key={p.id} className="text-right">
                        <input
                          type="number" min={0} step={0.5}
                          className={`input num w-24 text-right ${dirty.has(key) ? "border-brand-400 bg-brand-50" : ""}`}
                          value={budget === 0 ? "" : budget}
                          placeholder="0"
                          onChange={(e) => set(m.userId, p.id, Number(e.target.value) || 0)}
                        />
                        {used > 0 && (
                          <div className={`mt-0.5 text-[11px] num ${over ? "text-rose-600" : "text-slate-400"}`}>
                            dùng {used.toFixed(1)}h
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-right num font-semibold">{totalBudget ? totalBudget.toFixed(1) : "—"}</td>
                  <td className="text-right num text-slate-500">{totalUsed ? totalUsed.toFixed(1) : "—"}</td>
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
