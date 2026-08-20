"use client";

import { useMemo, useState } from "react";
import BudgetBar from "@/components/BudgetBar";
import StatusBadge from "@/components/StatusBadge";
import { WEEKDAY_VI, minToHHMM } from "@/lib/dates";
import { containsText, sortRows, toggleSort, type SortState } from "@/lib/tableUi";
import type { MonthData } from "@/lib/period";

export default function SummaryTables({
  data,
  byType,
  year,
  month,
}: {
  data: MonthData;
  byType: Array<{ code: string; name: string; category: string; projectName: string; hours: string }>;
  year: number;
  month: number;
}) {
  return (
    <div className="space-y-4">
      <WeekTable data={data} />
      <TypeTable data={data} byType={byType} />
      <AttendanceTable data={data} year={year} month={month} />
    </div>
  );
}

function WeekTable({ data }: { data: MonthData }) {
  const [sort, setSort] = useState<SortState>({ key: "week", dir: "asc" });
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const totals = new Map<number, number>();
    for (const d of data.days) {
      const week = d.weekday + 1;
      totals.set(week, (totals.get(week) ?? 0) + d.entryHours);
    }
    const base = [...totals.entries()].map(([week, hours]) => ({ week, hours }));
    const needle = q.trim();
    return needle ? base.filter((row) => [row.week, row.hours].some((v) => containsText(v, needle))) : base;
  }, [data.days, q]);
  const sorted = sortRows(rows, sort, (row) => {
    if (sort.key === "hours") return row.hours;
    return row.week;
  });

  return (
    <div className="card overflow-hidden">
      <div className="card-header flex flex-wrap items-center gap-2">
        <h2 className="card-title">Theo tuần (khớp với sheet 1週～6週)</h2>
        <span className="text-xs text-slate-400">Sort trực tiếp bằng tiêu đề bảng</span>
        <input className="input ml-auto w-56" placeholder="Lọc tuần / giờ…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <table className="data">
        <thead><tr><th><button onClick={() => setSort(toggleSort(sort, "week"))}>Tuần</button></th><th><button onClick={() => setSort(toggleSort(sort, "hours"))} className="text-right">Giờ</button></th><th>Tỷ trọng</th></tr></thead>
        <tbody>
          {sorted.map(({ week, hours }) => (
            <tr key={week}>
              <td>{week}週</td>
              <td className="text-right num font-medium">{hours ? hours.toFixed(1) : "—"}</td>
              <td>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${data.totalHours ? (hours / data.totalHours) * 100 : 0}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TypeTable({ data, byType }: { data: MonthData; byType: Array<{ code: string; name: string; category: string; projectName: string; hours: string }> }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "code", dir: "asc" });
  const rows = useMemo(() => {
    const needle = q.trim();
    const base = needle ? byType.filter((t) => [t.code, t.name, t.category, t.projectName].some((v) => containsText(v, needle))) : byType;
    return sortRows(base, sort, (t) => {
      if (sort.key === "name") return t.name;
      if (sort.key === "category") return t.category;
      if (sort.key === "projectName") return t.projectName;
      if (sort.key === "hours") return Number(t.hours);
      return t.code;
    });
  }, [byType, q, sort]);

  return (
    <div className="card overflow-hidden">
      <div className="card-header flex flex-wrap items-center gap-2">
        <h2 className="card-title">Theo 工種</h2>
        <span className="text-xs text-slate-400">đúng cách khách hàng tổng hợp trong 月間集計シート</span>
        <input className="input ml-auto w-64" placeholder="Tìm 工種 / project…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <table className="data">
        <thead>
          <tr>
            <th><button onClick={() => setSort(toggleSort(sort, "code"))}>CD</button></th>
            <th><button onClick={() => setSort(toggleSort(sort, "name"))}>工種</button></th>
            <th><button onClick={() => setSort(toggleSort(sort, "projectName"))}>プロジェクト</button></th>
            <th><button onClick={() => setSort(toggleSort(sort, "hours"))} className="text-right">Giờ</button></th>
            <th className="text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const h = Number(t.hours);
            return (
              <tr key={`${t.code}-${t.projectName}`}>
                <td className="num">{t.code}</td>
                <td>{t.name}</td>
                <td className="text-slate-500">{t.projectName}</td>
                <td className="text-right num font-medium">{h.toFixed(2)}</td>
                <td className="text-right num text-slate-500">{data.totalHours ? ((h / data.totalHours) * 100).toFixed(1) : "0"}%</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">Chưa nhập giờ nào trong tháng này.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceTable({ data, year, month }: { data: MonthData; year: number; month: number }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "date", dir: "asc" });
  const rows = useMemo(() => {
    const needle = q.trim();
    const base = needle
      ? data.days.filter((d) => [d.date, d.leaveNote, d.remark, d.holidayName, d.entries.map((e) => e.description).join(" ")].some((v) => containsText(v, needle)))
      : data.days;
    return sortRows(base, sort, (d) => {
      if (sort.key === "attendanceHours") return d.attendanceHours;
      if (sort.key === "entryHours") return d.entryHours;
      if (sort.key === "day") return d.day;
      return d.date;
    });
  }, [data.days, q, sort]);

  return (
    <div className="card overflow-hidden">
      <div className="card-header flex flex-wrap items-center gap-2">
        <h2 className="card-title">Bảng chấm công</h2>
        <span className="text-xs text-slate-400">{year}/{String(month).padStart(2, "0")}</span>
        <input className="input ml-auto w-64" placeholder="Tìm ngày / ghi chú…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="max-h-[520px] overflow-y-auto">
        <table className="data">
          <thead>
            <tr>
              <th><button onClick={() => setSort(toggleSort(sort, "day"))}>Ngày</button></th>
              <th>始業</th><th>終業</th><th className="text-right">休憩</th>
              <th><button onClick={() => setSort(toggleSort(sort, "attendanceHours"))} className="text-right">就業時間</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "entryHours"))} className="text-right">Giờ chi tiết</button></th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const diff = Math.round((d.entryHours - d.attendanceHours) * 100) / 100;
              return (
                <tr key={d.date} className={d.isWeekend || d.isHoliday ? "bg-slate-50/70" : ""}>
                  <td className="whitespace-nowrap num">
                    {String(d.day).padStart(2, "0")} <span className={d.isWeekend || d.isHoliday ? "text-rose-400" : "text-slate-400"}>{WEEKDAY_VI[d.weekday]}</span>
                  </td>
                  <td className="num">{minToHHMM(d.startMin) || "—"}</td>
                  <td className="num">{minToHHMM(d.endMin) || "—"}</td>
                  <td className="text-right num">{d.startMin != null ? `${d.breakMin}′` : "—"}</td>
                  <td className="text-right num">{d.attendanceHours ? d.attendanceHours.toFixed(2) : "—"}</td>
                  <td className={`text-right num ${Math.abs(diff) > 0.01 ? "text-amber-600" : ""}`}>{d.entryHours ? d.entryHours.toFixed(2) : "—"}</td>
                  <td className="text-xs text-slate-500">{d.holidayName ?? d.leaveNote ?? d.remark ?? ""}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400">Không có ngày nào khớp bộ lọc.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
