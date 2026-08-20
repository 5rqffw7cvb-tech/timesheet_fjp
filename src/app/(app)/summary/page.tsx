import { and, eq, gte, lte, sql, asc } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { timeEntries, projects, workTypes } from "@/db/schema";
import { loadMonth } from "@/lib/period";
import { todayParts, ymd, daysInMonth, WEEKDAY_VI, minToHHMM, weekOfMonth } from "@/lib/dates";
import MonthNav from "@/components/MonthNav";
import StatusBadge from "@/components/StatusBadge";
import BudgetBar from "@/components/BudgetBar";
import DownloadButton from "./DownloadButton";
import SummaryTables from "./SummaryTables";

export const dynamic = "force-dynamic";

export default async function SummaryPage({
  searchParams,
}: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = todayParts();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;

  const first = ymd(year, month, 1);
  const last = ymd(year, month, daysInMonth(year, month));

  const [data, byType] = await Promise.all([
    loadMonth(user.id, year, month),
    db.select({
      code: workTypes.code, name: workTypes.name, category: workTypes.category,
      projectName: projects.name,
      hours: sql<string>`sum(${timeEntries.hours})`,
    }).from(timeEntries)
      .innerJoin(workTypes, eq(workTypes.id, timeEntries.workTypeId))
      .innerJoin(projects, eq(projects.id, timeEntries.projectId))
      .where(and(
        eq(timeEntries.userId, user.id), eq(timeEntries.isPlan, false),
        gte(timeEntries.date, first), lte(timeEntries.date, last),
      ))
      .groupBy(workTypes.code, workTypes.name, workTypes.category, projects.name)
      .orderBy(asc(workTypes.code)),
  ]);

  const attendanceTotal = data.days.reduce((s, d) => s + d.attendanceHours, 0);
  const diff = Math.round((data.totalHours - attendanceTotal) * 100) / 100;

  const weekTotals = new Map<number, number>();
  for (const d of data.days) {
    const w = weekOfMonth(year, month, d.day);
    weekTotals.set(w, (weekTotals.get(w) ?? 0) + d.entryHours);
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <MonthNav year={year} month={month} />
        <Stat label="Tổng giờ công việc" value={`${data.totalHours.toFixed(1)}h`} />
        <Stat label="就業時間 (giờ vào/ra)" value={`${attendanceTotal.toFixed(1)}h`} />
        <Stat label="Chênh lệch" value={`${diff > 0 ? "+" : ""}${diff.toFixed(1)}h`}
              tone={Math.abs(diff) > 0.01 ? "warn" : "ok"} />
        <Stat label="Budget" value={data.totalBudget ? `${data.totalBudget.toFixed(1)}h` : "—"} />
        <StatusBadge status={data.report.status} />
        <div className="ml-auto">
          <DownloadButton year={year} month={month} userId={user.id} />
        </div>
      </div>

      {Math.abs(diff) > 0.01 && (
        <div className="card border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tổng giờ các dòng công việc lệch {diff > 0 ? "+" : ""}{diff.toFixed(2)}h so với 就業時間 tính
          từ giờ vào/ra. Quản lý sẽ nhìn thấy chênh lệch này khi duyệt — nên rà lại trước khi nộp.
        </div>
      )}

      <SummaryTables data={data} byType={byType as any} year={year} month={month} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-1.5">
      <div className="text-[11px] leading-tight text-slate-500">{label}</div>
      <div className={`text-sm font-semibold leading-tight num ${
        tone === "warn" ? "text-amber-600" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}
