import Link from "next/link";
import { requireAdminView, memberIdsForProjects } from "@/lib/access";
import { monthOverview, monthWorkingDays, scopeRowsToProjects, stripMoney } from "@/lib/adminData";
import { todayParts } from "@/lib/dates";
import MonthNav from "@/components/MonthNav";
import { calcBillingByProjects } from "@/lib/billing";
import AdminOverviewTable from "./AdminOverviewTable";
import { getLocale } from "@/lib/requestLocale";
import { getMessage, formatNumber } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({
  searchParams,
}: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const view = await requireAdminView();
  const sp = await searchParams;
  const now = todayParts();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;
  const locale = await getLocale();

  const [allRows, workingDays, scopedMemberIds] = await Promise.all([
    monthOverview(year, month),
    monthWorkingDays(year, month),
    view.projectIds ? memberIdsForProjects(view.projectIds) : Promise.resolve(null),
  ]);
  const rows = scopeRowsToProjects(allRows, view.projectIds, scopedMemberIds);

  const totals = rows.reduce(
    (a, r) => ({
      budget: a.budget + r.budgetHours,
      used: a.used + r.usedHours,
      submitted: a.submitted + (r.status !== "DRAFT" ? 1 : 0),
      approved: a.approved + (r.status === "APPROVED" ? 1 : 0),
    }),
    { budget: 0, used: 0, submitted: 0, approved: 0 },
  );

  const billingTotal = rows.reduce((s, r) => s + calcBillingByProjects(
    r.usedHours,
    r.billingFactor,
    r.byProject.map((p) => ({ projectId: p.projectId, hours: p.used, unitPriceMm: p.unitPriceMm })),
    r.billingUnitPrice,
  ).adjustmentAmount, 0);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <MonthNav year={year} month={month} />
        <Stat label={getMessage(locale, "dashboardMemberCount")} value={String(rows.length)} />
        <Stat label={getMessage(locale, "dashboardSubmitted")} value={`${totals.submitted}/${rows.length}`} />
        <Stat label={getMessage(locale, "dashboardApproved")} value={`${totals.approved}/${rows.length}`} />
        <Stat label={getMessage(locale, "dashboardTotalHours")} value={totals.used.toFixed(1)} sub={` / ${totals.budget.toFixed(1)}h`} />
        {view.canSeeMoney && (
          <Stat label={getMessage(locale, "dashboardBillingAdjust")} value={formatNumber(locale, billingTotal)} />
        )}
        <Stat label={getMessage(locale, "dashboardWorkingDays")} value={String(workingDays)} />
        <div className="ml-auto flex gap-2">
          <Link href={`/admin/budgets?year=${year}&month=${month}`} className="btn-secondary btn-sm">{getMessage(locale, "budgetTitle")}</Link>
          <Link href={`/admin/approvals?year=${year}&month=${month}`} className="btn-secondary btn-sm">{getMessage(locale, "approvalsTitle")}</Link>
          <Link href={`/admin/export?year=${year}&month=${month}`} className="btn-primary btn-sm">{getMessage(locale, "exportTitle")}</Link>
        </div>
      </div>

      <AdminOverviewTable rows={view.canSeeMoney ? rows : stripMoney(rows)} year={year} month={month} />
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
