import { requireAdmin } from "@/lib/auth";
import { carryForwardBudgets } from "@/lib/adminData";
import { loadMasters } from "@/lib/period";
import { todayParts, shiftMonth } from "@/lib/dates";
import { loadTimelineMembers, loadTimelineSlice, monthSequence } from "@/lib/budgetTimeline";
import BudgetTimeline from "./BudgetTimeline";
import { db } from "@/db";
import { orgSettings } from "@/db/schema";
import { normalizeBillingCurrency } from "@/lib/currency";

/** Số tháng nạp sẵn quanh tháng cơ sở; cuộn ngang sẽ nạp thêm. */
const MONTHS_BACK = 6;
const MONTHS_FORWARD = 6;

export const dynamic = "force-dynamic";

export default async function BudgetsPage({
  searchParams,
}: { searchParams: Promise<{ year?: string; month?: string; project?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const now = todayParts();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;

  const masters = await loadMasters();
  const projects = masters.projects.map((p) => ({ id: p.id, code: p.code, name: p.name }));
  const selected = projects.find((p) => p.id === sp.project) ?? projects[0];

  if (!selected) {
    return (
      <div className="card px-4 py-10 text-center text-sm text-slate-500">
        プロジェクトを追加すると入力できます。 / Add a project to start entering budgets.
      </div>
    );
  }

  // Tự kế thừa 工数 tháng trước cho tháng cơ sở trước khi đọc dữ liệu.
  await carryForwardBudgets(year, month);

  const months = monthSequence(
    shiftMonth(year, month, -MONTHS_BACK),
    MONTHS_BACK + 1 + MONTHS_FORWARD,
  );

  const [slice, memberData, orgRows] = await Promise.all([
    loadTimelineSlice(selected.id, months),
    loadTimelineMembers(selected.id),
    db.select().from(orgSettings).limit(1),
  ]);

  return (
    <BudgetTimeline
      key={`${selected.id}-${year}-${month}`}
      anchor={{ year, month }}
      projects={projects}
      projectId={selected.id}
      initialMonths={slice.months}
      initialCells={slice.cells}
      members={memberData.members}
      allMembers={memberData.allMembers}
      billingCurrency={normalizeBillingCurrency(orgRows[0]?.billingCurrency)}
    />
  );
}
