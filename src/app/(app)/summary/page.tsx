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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-header"><h2 className="card-title">Theo project</h2></div>
          <div className="space-y-3 p-4">
            {data.budgets.length === 0 && <p className="text-sm text-slate-400">Chưa có dữ liệu.</p>}
            {data.budgets.map((b) => (
              <div key={b.projectId}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-slate-700">{b.projectName}</span>
                  <span className="num text-slate-400">{b.projectCode}</span>
                </div>
                <BudgetBar used={b.usedHours} budget={b.budgetHours} />
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2 className="card-title">Theo tuần (khớp với sheet 1週～6週)</h2></div>
          <table className="data">
            <thead><tr><th>Tuần</th><th className="text-right">Giờ</th><th>Tỷ trọng</th></tr></thead>
            <tbody>
              {[...weekTotals.entries()].sort((a, b) => a[0] - b[0]).map(([w, h]) => (
                <tr key={w}>
                  <td>{w}週</td>
                  <td className="text-right num font-medium">{h ? h.toFixed(1) : "—"}</td>
                  <td>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-brand-500"
                           style={{ width: `${data.totalHours ? (h / data.totalHours) * 100 : 0}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Theo 工種</h2>
          <span className="text-xs text-slate-400">đúng cách khách hàng tổng hợp trong 月間集計シート</span>
        </div>
        <table className="data">
          <thead>
            <tr><th>CD</th><th>工種</th><th>プロジェクト</th><th className="text-right">Giờ</th><th className="text-right">%</th></tr>
          </thead>
          <tbody>
            {byType.map((t) => {
              const h = Number(t.hours);
              return (
                <tr key={`${t.code}-${t.projectName}`}>
                  <td className="num">{t.code}</td>
                  <td>{t.name}</td>
                  <td className="text-slate-500">{t.projectName}</td>
                  <td className="text-right num font-medium">{h.toFixed(2)}</td>
                  <td className="text-right num text-slate-500">
                    {data.totalHours ? ((h / data.totalHours) * 100).toFixed(1) : "0"}%
                  </td>
                </tr>
              );
            })}
            {byType.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400">Chưa nhập giờ nào trong tháng này.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header"><h2 className="card-title">Bảng chấm công</h2></div>
        <div className="max-h-[520px] overflow-y-auto">
          <table className="data">
            <thead>
              <tr><th>Ngày</th><th>始業</th><th>終業</th><th className="text-right">休憩</th>
                  <th className="text-right">就業時間</th><th className="text-right">Giờ chi tiết</th><th>Ghi chú</th></tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.date} className={d.isWeekend || d.isHoliday ? "bg-slate-50/70" : ""}>
                  <td className="whitespace-nowrap num">
                    {String(d.day).padStart(2, "0")}{" "}
                    <span className={d.isWeekend || d.isHoliday ? "text-rose-400" : "text-slate-400"}>
                      {WEEKDAY_VI[d.weekday]}
                    </span>
                  </td>
                  <td className="num">{minToHHMM(d.startMin) || "—"}</td>
                  <td className="num">{minToHHMM(d.endMin) || "—"}</td>
                  <td className="text-right num">{d.startMin != null ? `${d.breakMin}′` : "—"}</td>
                  <td className="text-right num">{d.attendanceHours ? d.attendanceHours.toFixed(2) : "—"}</td>
                  <td className="text-right num font-medium">{d.entryHours ? d.entryHours.toFixed(2) : "—"}</td>
                  <td className="text-xs text-slate-500">
                    {d.holidayName ?? d.leaveNote ?? d.remark ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
