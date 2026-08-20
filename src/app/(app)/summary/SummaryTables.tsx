"use client";

import { useMemo, useState } from "react";
import BudgetBar from "@/components/BudgetBar";
import StatusBadge from "@/components/StatusBadge";
import { useLocale } from "@/components/LocaleProvider";
import { WEEKDAY_JA, WEEKDAY_VI, minToHHMM } from "@/lib/dates";
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
  const { t, locale } = useLocale();
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
        <h2 className="card-title">{t("summaryWeekTitle")}</h2>
        <span className="text-xs text-slate-400">{locale === "ja" ? "見出しクリックで並び替え" : "Click headers to sort"}</span>
        <input className="input ml-auto w-56" placeholder={locale === "ja" ? "週 / 時間を検索…" : "Search week / hours…"} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <table className="data">
        <thead><tr><th><button onClick={() => setSort(toggleSort(sort, "week"))}>{locale === "ja" ? "週" : "Week"}</button></th><th><button onClick={() => setSort(toggleSort(sort, "hours"))} className="text-right">{t("timesheetHours")}</button></th><th>{locale === "ja" ? "割合" : "Share"}</th></tr></thead>
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
  const { t, locale } = useLocale();
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
        <h2 className="card-title">{t("summaryTypeTitle")}</h2>
        <span className="text-xs text-slate-400">{locale === "ja" ? "月間集計シートと同じ集計単位" : "Matches the monthly summary sheet"}</span>
        <input className="input ml-auto w-64" placeholder={locale === "ja" ? "工種 / プロジェクトを検索…" : "Search work type / project…"} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <table className="data">
        <thead>
          <tr>
            <th><button onClick={() => setSort(toggleSort(sort, "code"))}>CD</button></th>
            <th><button onClick={() => setSort(toggleSort(sort, "name"))}>工種</button></th>
            <th><button onClick={() => setSort(toggleSort(sort, "projectName"))}>プロジェクト</button></th>
            <th><button onClick={() => setSort(toggleSort(sort, "hours"))} className="text-right">{t("timesheetHours")}</button></th>
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
          {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">{t("summaryTableNoData")}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceTable({ data, year, month }: { data: MonthData; year: number; month: number }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "date", dir: "asc" });
  const { t, locale } = useLocale();
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
        <h2 className="card-title">{t("summaryAttendanceTitle")}</h2>
        <span className="text-xs text-slate-400">{year}/{String(month).padStart(2, "0")}</span>
        <input className="input ml-auto w-64" placeholder={t("dateSearchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="max-h-[520px] overflow-y-auto">
        <table className="data">
          <thead>
            <tr>
              <th><button onClick={() => setSort(toggleSort(sort, "day"))}>{locale === "ja" ? "日付" : "Day"}</button></th>
              <th>{t("timesheetStart")}</th><th>{t("timesheetEnd")}</th><th className="text-right">{t("timesheetBreak")}</th>
              <th><button onClick={() => setSort(toggleSort(sort, "attendanceHours"))} className="text-right">就業時間</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "entryHours"))} className="text-right">{t("timesheetHours")}</button></th>
              <th>{t("timesheetTypeLabel")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const diff = Math.round((d.entryHours - d.attendanceHours) * 100) / 100;
              return (
                <tr key={d.date} className={d.isWeekend || d.isHoliday ? "bg-slate-50/70" : ""}>
                  <td className="whitespace-nowrap num">
                    {String(d.day).padStart(2, "0")} <span className={d.isWeekend || d.isHoliday ? "text-rose-400" : "text-slate-400"}>{locale === "ja" ? WEEKDAY_JA[d.weekday] : WEEKDAY_VI[d.weekday]}</span>
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
            {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400">{t("noData")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
