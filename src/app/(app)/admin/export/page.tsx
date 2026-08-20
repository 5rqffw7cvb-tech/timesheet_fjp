import { requireAdmin } from "@/lib/auth";
import { monthOverviewForPeriods, monthWorkingDays } from "@/lib/adminData";
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
  await requireAdmin();
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
  const selectedProjectIds = (sp.projects ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [rows, workingDays, projectRows, orgRows] = await Promise.all([
    monthOverviewForPeriods(selectedPeriods, selectedProjectIds, "all"),
    monthWorkingDays(year, month),
    db.select({ id: projects.id, code: projects.code, name: projects.name })
      .from(projects)
      .where(eq(projects.isActive, true))
      .orderBy(asc(projects.sortOrder), asc(projects.code)),
    db.select().from(orgSettings).limit(1),
  ]);
  const billingCurrency = normalizeBillingCurrency(orgRows[0]?.billingCurrency);

  return (
    <ExportPanel
      year={year}
      month={month}
      rows={rows}
      workingDays={workingDays}
      selectedPeriods={selectedPeriods.map((p) => `${p.year}-${String(p.month).padStart(2, "0")}`)}
      selectedProjectIds={selectedProjectIds}
      projects={projectRows}
      billingCurrency={billingCurrency}
    />
  );
}
