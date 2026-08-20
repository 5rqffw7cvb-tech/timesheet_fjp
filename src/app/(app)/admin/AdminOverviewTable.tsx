"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import BudgetBar from "@/components/BudgetBar";
import StatusBadge from "@/components/StatusBadge";
import { calcBillingByProjects } from "@/lib/billing";
import type { OverviewRow } from "@/lib/adminData";
import { containsText, sortRows, toggleSort, type SortState } from "@/lib/tableUi";

export default function AdminOverviewTable({ rows, year, month }: { rows: OverviewRow[]; year: number; month: number }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "fullName", dir: "asc" });

  const filtered = useMemo(() => {
    const needle = q.trim();
    const base = needle
      ? rows.filter((r) => [r.fullName, r.username, r.displayName, r.roleTitle, r.status, r.memberNote, r.reviewNote]
        .some((v) => containsText(v, needle)))
      : rows;
    return sortRows(base, sort, (r) => {
      if (sort.key === "roleTitle") return r.roleTitle ?? "";
      if (sort.key === "daysLogged") return r.daysLogged;
      if (sort.key === "attendanceHours") return r.attendanceHours;
      if (sort.key === "usedHours") return r.usedHours;
      if (sort.key === "diff") return r.usedHours - r.attendanceHours;
      if (sort.key === "budgetHours") return r.budgetHours;
      if (sort.key === "status") return r.status;
      return r.fullName;
    });
  }, [rows, q, sort]);

  return (
    <div className="card overflow-hidden">
      <div className="card-header flex flex-wrap items-center gap-2">
        <h2 className="card-title">Tiến độ giờ so với budget</h2>
        <input className="input ml-auto w-64" placeholder="Tìm member…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-slate-400">“Chênh lệch” = tổng giờ chi tiết − 就業時間 tính từ giờ vào/ra</span>
      </div>
      <div className="overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th><button onClick={() => setSort(toggleSort(sort, "fullName"))}>Thành viên</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "roleTitle"))}>Vai trò</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "daysLogged"))} className="text-right">Ngày công</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "attendanceHours"))} className="text-right">就業時間</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "usedHours"))} className="text-right">Giờ chi tiết</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "diff"))} className="text-right">Chênh lệch</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "budgetHours"))} className="text-right">Budget</button></th>
              <th className="w-[190px]">Tiến độ</th>
              <th><button onClick={() => setSort(toggleSort(sort, "status"))}>Trạng thái</button></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const diff = Math.round((r.usedHours - r.attendanceHours) * 100) / 100;
              return (
                <tr key={r.userId}>
                  <td>
                    <div className="font-medium text-slate-700">{r.fullName}</div>
                    <div className="text-xs text-slate-400">{r.displayName || r.username}</div>
                  </td>
                  <td className="text-slate-500">{r.roleTitle ?? "—"}</td>
                  <td className="text-right num">{r.daysLogged || "—"}</td>
                  <td className="text-right num">{r.attendanceHours ? r.attendanceHours.toFixed(1) : "—"}</td>
                  <td className="text-right num font-medium">{r.usedHours ? r.usedHours.toFixed(1) : "—"}</td>
                  <td className={`text-right num ${diff === 0 ? "text-slate-400" : Math.abs(diff) > 0.01 ? "text-amber-600" : ""}`}>
                    {r.usedHours || r.attendanceHours ? (diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)) : "—"}
                  </td>
                  <td className="text-right num text-slate-500">
                    {r.budgetHours ? r.budgetHours.toFixed(1) : "—"}
                  </td>
                  <td><BudgetBar used={r.usedHours} budget={r.budgetHours} /></td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="text-right">
                    <Link href={`/admin/approvals?year=${year}&month=${month}&user=${r.userId}`} className="btn-ghost btn-sm">Chi tiết</Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-slate-400">Không có member nào khớp bộ lọc.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
