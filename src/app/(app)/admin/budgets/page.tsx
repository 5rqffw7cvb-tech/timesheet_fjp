import { requireAdmin } from "@/lib/auth";
import { monthOverview } from "@/lib/adminData";
import { loadMasters } from "@/lib/period";
import { todayParts, ymd, daysInMonth } from "@/lib/dates";
import BudgetGrid from "./BudgetGrid";
import { db } from "@/db";
import { projectRates } from "@/db/schema";
import { lte } from "drizzle-orm";

const HOURS_PER_CONG = 180;

export const dynamic = "force-dynamic";

export default async function BudgetsPage({
  searchParams,
}: { searchParams: Promise<{ year?: string; month?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const now = todayParts();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;

  const [rows, masters, rateRows] = await Promise.all([
    monthOverview(year, month),
    loadMasters(),
    db.select({
      userId: projectRates.userId,
      projectId: projectRates.projectId,
      effectiveFrom: projectRates.effectiveFrom,
      unitPriceMm: projectRates.unitPriceMm,
    }).from(projectRates)
      .where(lte(projectRates.effectiveFrom, ymd(year, month, daysInMonth(year, month)))),
  ]);

  const initial: Record<string, number> = {};
  const initialRates: Record<string, number> = {};
  for (const r of rows) for (const p of r.byProject) {
    if (p.budget > 0) initial[`${r.userId}|${p.projectId}`] = round2(p.budget / HOURS_PER_CONG);
    if (p.unitPriceMm > 0) initialRates[`${r.userId}|${p.projectId}`] = p.unitPriceMm;
  }

  const latestRateByKey = new Map<string, { effectiveFrom: string; unitPriceMm: number }>();
  for (const r of rateRows) {
    const key = `${r.userId}|${r.projectId}`;
    const current = latestRateByKey.get(key);
    if (!current || r.effectiveFrom > current.effectiveFrom) {
      latestRateByKey.set(key, {
        effectiveFrom: r.effectiveFrom,
        unitPriceMm: Number(r.unitPriceMm),
      });
    }
  }
  for (const [key, v] of latestRateByKey) {
    if (!initialRates[key] && v.unitPriceMm > 0) initialRates[key] = v.unitPriceMm;
  }

  return (
    <BudgetGrid
      key={`${year}-${month}`}
      year={year}
      month={month}
      members={rows.map((r) => ({
        userId: r.userId, fullName: r.fullName, roleTitle: r.roleTitle,
        used: Object.fromEntries(r.byProject.map((p) => [p.projectId, p.used])),
      }))}
      projects={masters.projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
      initial={initial}
      initialRates={initialRates}
    />
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
