import { requireAdmin } from "@/lib/auth";
import { monthOverview } from "@/lib/adminData";
import { loadMasters } from "@/lib/period";
import { todayParts } from "@/lib/dates";
import BudgetGrid from "./BudgetGrid";

export const dynamic = "force-dynamic";

export default async function BudgetsPage({
  searchParams,
}: { searchParams: Promise<{ year?: string; month?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const now = todayParts();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;

  const [rows, masters] = await Promise.all([monthOverview(year, month), loadMasters()]);

  const initial: Record<string, number> = {};
  for (const r of rows) for (const p of r.byProject) {
    if (p.budget > 0) initial[`${r.userId}|${p.projectId}`] = p.budget;
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
    />
  );
}
