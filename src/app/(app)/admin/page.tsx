import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { monthOverview, monthWorkingDays } from "@/lib/adminData";
import { todayParts } from "@/lib/dates";
import MonthNav from "@/components/MonthNav";
import StatusBadge from "@/components/StatusBadge";
import BudgetBar from "@/components/BudgetBar";
import { calcBilling } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({
  searchParams,
}: { searchParams: Promise<{ year?: string; month?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const now = todayParts();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;

  const [rows, workingDays] = await Promise.all([
    monthOverview(year, month),
    monthWorkingDays(year, month),
  ]);

  const totals = rows.reduce(
    (a, r) => ({
      budget: a.budget + r.budgetHours,
      used: a.used + r.usedHours,
      submitted: a.submitted + (r.status !== "DRAFT" ? 1 : 0),
      approved: a.approved + (r.status === "APPROVED" ? 1 : 0),
    }),
    { budget: 0, used: 0, submitted: 0, approved: 0 },
  );

  const billingTotal = rows.reduce((s, r) => s + calcBilling({
    actualHours: r.usedHours,
    factor: r.billingFactor,
    unitPrice: r.billingUnitPrice,
  }).adjustmentAmount, 0);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <MonthNav year={year} month={month} />
        <Stat label="Thành viên" value={String(rows.length)} />
        <Stat label="Đã nộp" value={`${totals.submitted}/${rows.length}`} />
        <Stat label="Đã chốt" value={`${totals.approved}/${rows.length}`} />
        <Stat label="Tổng giờ" value={totals.used.toFixed(1)} sub={`/ ${totals.budget.toFixed(1)}h budget`} />
        <Stat label="Điều chỉnh billing" value={billingTotal.toLocaleString("en-US")} />
        <Stat label="所定日数" value={String(workingDays)} />
        <div className="ml-auto flex gap-2">
          <Link href={`/admin/budgets?year=${year}&month=${month}`} className="btn-secondary btn-sm">Set budget</Link>
          <Link href={`/admin/approvals?year=${year}&month=${month}`} className="btn-secondary btn-sm">Duyệt</Link>
          <Link href={`/admin/export?year=${year}&month=${month}`} className="btn-primary btn-sm">Xuất 週報</Link>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Tiến độ giờ so với budget</h2>
          <span className="text-xs text-slate-400">
            “Chênh lệch” = tổng giờ chi tiết − 就業時間 tính từ giờ vào/ra
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Thành viên</th>
                <th>Vai trò</th>
                <th className="text-right">Ngày công</th>
                <th className="text-right">就業時間</th>
                <th className="text-right">Giờ chi tiết</th>
                <th className="text-right">Chênh lệch</th>
                <th className="text-right">Budget</th>
                <th className="w-[190px]">Tiến độ</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
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
                    <td className={`text-right num ${
                      diff === 0 ? "text-slate-400" : Math.abs(diff) > 0.01 ? "text-amber-600" : ""}`}>
                      {r.usedHours || r.attendanceHours ? (diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)) : "—"}
                    </td>
                    <td className="text-right num text-slate-500">
                      {r.budgetHours ? r.budgetHours.toFixed(1) : "—"}
                    </td>
                    <td><BudgetBar used={r.usedHours} budget={r.budgetHours} /></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="text-right">
                      <Link href={`/admin/approvals?year=${year}&month=${month}&user=${r.userId}`}
                            className="btn-ghost btn-sm">Chi tiết</Link>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-slate-400">
                  Chưa có thành viên nào. Vào mục “Thành viên” để tạo.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">Chi tiết theo project</h2></div>
        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.filter((r) => r.byProject.length > 0).map((r) => (
            <div key={r.userId} className="rounded-md border border-slate-200 p-3">
              <div className="mb-2 text-sm font-medium text-slate-700">{r.fullName}</div>
              <div className="space-y-2">
                {r.byProject.map((p) => (
                  <div key={p.projectId}>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span className="truncate">{p.name}</span>
                      <span className="num shrink-0">{p.used.toFixed(1)}/{p.budget.toFixed(1)}h</span>
                    </div>
                    <BudgetBar used={p.used} budget={p.budget} compact />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-1.5">
      <div className="text-[11px] leading-tight text-slate-500">{label}</div>
      <div className="text-sm font-semibold leading-tight text-slate-800 num">
        {value}{sub && <span className="ml-1 text-xs font-normal text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}
