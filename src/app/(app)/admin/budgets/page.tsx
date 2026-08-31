import { requireAdmin } from "@/lib/auth";
import { monthOverview, carryForwardBudgets } from "@/lib/adminData";
import { loadMasters, defaultWorkingDays } from "@/lib/period";
import { todayParts, ymd, daysInMonth } from "@/lib/dates";
import BudgetGrid from "./BudgetGrid";
import { db } from "@/db";
import { orgSettings, projectRates, projectAssignments, monthSettings } from "@/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { normalizeBillingCurrency } from "@/lib/currency";

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

  // Tự kế thừa 工数 từ tháng gần nhất cho các assign còn hiệu lực tháng này
  // trước khi đọc dữ liệu — admin không cần bấm "Copy previous month" nữa.
  await carryForwardBudgets(year, month);

  const [rows, masters, rateRows, orgRows, assignmentRows, settingRows] = await Promise.all([
    monthOverview(year, month),
    loadMasters(),
    db.select({
      userId: projectRates.userId,
      projectId: projectRates.projectId,
      effectiveFrom: projectRates.effectiveFrom,
      unitPriceMm: projectRates.unitPriceMm,
    }).from(projectRates)
      .where(lte(projectRates.effectiveFrom, ymd(year, month, daysInMonth(year, month)))),
    db.select().from(orgSettings).limit(1),
    db.select({
      userId: projectAssignments.userId,
      projectId: projectAssignments.projectId,
      startDate: projectAssignments.startDate,
      endDate: projectAssignments.endDate,
    }).from(projectAssignments),
    db.select({ workingDays: monthSettings.workingDays }).from(monthSettings)
      .where(and(eq(monthSettings.year, year), eq(monthSettings.month, month))).limit(1),
  ]);
  const billingCurrency = normalizeBillingCurrency(orgRows[0]?.billingCurrency);
  // 所定日数 thay đổi theo từng tháng (tháng nhiều/ít ngày lễ) -> 標準時間 của
  // 1.0 工数 không phải hằng số cố định, phải tính lại theo tháng đang xem.
  const workingDays = settingRows[0]?.workingDays ?? defaultWorkingDays(year, month);
  const assignmentPeriods: Record<string, { startDate: string | null; endDate: string | null }> = {};
  for (const a of assignmentRows) {
    assignmentPeriods[`${a.userId}|${a.projectId}`] = { startDate: a.startDate, endDate: a.endDate };
  }

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
      initialPeriods={assignmentPeriods}
      billingCurrency={billingCurrency}
      workingDays={workingDays}
    />
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
