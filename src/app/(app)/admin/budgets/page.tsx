import { requireAdminView } from "@/lib/access";
import { carryForwardBudgets } from "@/lib/adminData";
import { loadMasters } from "@/lib/period";
import { todayParts, shiftMonth } from "@/lib/dates";
import {
  loadTimelineMembers, loadTimelineSlice, monthSequence, stripMemberMoney, stripTimelineMoney,
} from "@/lib/budgetTimeline";
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
  const view = await requireAdminView();
  const sp = await searchParams;
  const now = todayParts();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;

  const masters = await loadMasters();
  // PM/DM chỉ thấy project mình được assign.
  const projects = masters.projects
    .filter((p) => view.projectIds === null || view.projectIds.includes(p.id))
    .map((p) => ({ id: p.id, code: p.code, name: p.name }));
  const selected = projects.find((p) => p.id === sp.project) ?? projects[0];

  if (!selected) {
    return (
      <div className="card px-4 py-10 text-center text-sm text-slate-500">
        {view.isAdmin
          ? "プロジェクトを追加すると入力できます。 / Add a project to start entering budgets."
          : "担当プロジェクトがありません。 / You are not assigned to any project."}
      </div>
    );
  }

  // Tự kế thừa 工数 tháng trước cho tháng cơ sở trước khi đọc dữ liệu.
  // Đây là thao tác ghi -> chỉ chạy khi người xem có quyền sửa.
  if (view.canEdit) await carryForwardBudgets(year, month);

  const months = monthSequence(
    shiftMonth(year, month, -MONTHS_BACK),
    MONTHS_BACK + 1 + MONTHS_FORWARD,
  );

  const [rawSlice, memberData, orgRows] = await Promise.all([
    loadTimelineSlice(selected.id, months),
    loadTimelineMembers(selected.id),
    db.select().from(orgSettings).limit(1),
  ]);
  const slice = view.canSeeMoney ? rawSlice : stripTimelineMoney(rawSlice);
  const members = view.canSeeMoney ? memberData.members : stripMemberMoney(memberData.members);

  return (
    <BudgetTimeline
      key={`${selected.id}-${year}-${month}`}
      anchor={{ year, month }}
      projects={projects}
      projectId={selected.id}
      initialMonths={slice.months}
      initialCells={slice.cells}
      members={members}
      allMembers={memberData.allMembers}
      billingCurrency={normalizeBillingCurrency(orgRows[0]?.billingCurrency)}
      canEdit={view.canEdit}
      canSeeMoney={view.canSeeMoney}
    />
  );
}
