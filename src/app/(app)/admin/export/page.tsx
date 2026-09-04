import { requireAdminView, memberIdsForProjects, scopeProjectIds } from "@/lib/access";
import { monthOverviewForPeriods, monthWorkingDays, stripMoney } from "@/lib/adminData";
import { todayParts } from "@/lib/dates";
import ExportPanel from "./ExportPanel";
import { db } from "@/db";
import { orgSettings, projects } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { normalizeBillingCurrency } from "@/lib/currency";

export const dynamic = "force-dynamic";

export default async function ExportPage({
  searchParams,
}: { searchParams: Promise<{ year?: string; month?: string; months?: string; projects?: string }> }) {
  const view = await requireAdminView();
  const sp = await searchParams;
  const now = todayParts();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;
  const months = (sp.months ?? "").trim();
  const selectedPeriods = months
    ? months.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
        const m = /^(\d{4})-(\d{2})$/.exec(s);
        if (!m) return null;
        return { year: Number(m[1]), month: Number(m[2]) };
      }).filter((x): x is { year: number; month: number } => !!x && x.month >= 1 && x.month <= 12)
    : [{ year, month }];
  const requestedProjectIds = (sp.projects ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // PM/DM: luôn bị bó vào các project họ được assign, kể cả khi URL ghi khác.
  const selectedProjectIds = scopeProjectIds(view, requestedProjectIds);

  const [allRows, workingDays, projectRows, orgRows, scopedMemberIds] = await Promise.all([
    monthOverviewForPeriods(selectedPeriods, selectedProjectIds, "all"),
    monthWorkingDays(year, month),
    db.select({ id: projects.id, code: projects.code, name: projects.name })
      .from(projects)
      .where(eq(projects.isActive, true))
      .orderBy(asc(projects.sortOrder), asc(projects.code)),
    db.select().from(orgSettings).limit(1),
    view.projectIds ? memberIdsForProjects(view.projectIds) : Promise.resolve(null),
  ]);
  const scoped = scopedMemberIds
    ? allRows.filter((r) => scopedMemberIds.includes(r.userId))
    : allRows;
  const rows = view.canSeeMoney ? scoped : stripMoney(scoped);
  const visibleProjects = projectRows.filter(
    (p) => view.projectIds === null || view.projectIds.includes(p.id),
  );
  const billingCurrency = normalizeBillingCurrency(orgRows[0]?.billingCurrency);

  return (
    <ExportPanel
      year={year}
      month={month}
      rows={rows}
      workingDays={workingDays}
      selectedPeriods={selectedPeriods.map((p) => `${p.year}-${String(p.month).padStart(2, "0")}`)}
      selectedProjectIds={selectedProjectIds}
      projects={visibleProjects}
      billingCurrency={billingCurrency}
      canSeeMoney={view.canSeeMoney}
    />
  );
}
