"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import BudgetBar from "@/components/BudgetBar";
import StatusBadge from "@/components/StatusBadge";
import { calcBillingByProjects } from "@/lib/billing";
import type { OverviewRow } from "@/lib/adminData";
import { containsText, sortRows, toggleSort, type SortState } from "@/lib/tableUi";
import { useLocale } from "@/components/LocaleProvider";

export default function AdminOverviewTable({ rows, year, month }: { rows: OverviewRow[]; year: number; month: number }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "fullName", dir: "asc" });
  const { t, locale } = useLocale();

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
        <h2 className="card-title">{t("dashboardProgressTitle")}</h2>
        <input className="input ml-auto w-64" placeholder={t("memberSearchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-slate-400">{t("dashboardProgressNote")}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th><button onClick={() => setSort(toggleSort(sort, "fullName"))}>{t("membersName")}</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "roleTitle"))}>{t("membersRole")}</button></th>
              <th className="text-right"><button onClick={() => setSort(toggleSort(sort, "daysLogged"))} className="text-right">{locale === "ja" ? "稼働日数" : "Days"}</button></th>
              <th className="text-right"><button onClick={() => setSort(toggleSort(sort, "attendanceHours"))} className="text-right">{t("timesheetAttendance")}</button></th>
              <th className="text-right"><button onClick={() => setSort(toggleSort(sort, "usedHours"))} className="text-right">{t("timesheetHours")}</button></th>
              <th className="text-right"><button onClick={() => setSort(toggleSort(sort, "diff"))} className="text-right">{t("timesheetDiff")}</button></th>
              <th className="text-right"><button onClick={() => setSort(toggleSort(sort, "budgetHours"))} className="text-right">{t("budgetTitle")}</button></th>
              <th className="w-[190px]">{locale === "ja" ? "進捗" : "Progress"}</th>
              <th><button onClick={() => setSort(toggleSort(sort, "status"))}>{t("membersStatus")}</button></th>
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
                    <Link href={`/admin/approvals?year=${year}&month=${month}&user=${r.userId}`} className="btn-ghost btn-sm">{locale === "ja" ? "詳細" : "Details"}</Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-slate-400">{t("noData")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
