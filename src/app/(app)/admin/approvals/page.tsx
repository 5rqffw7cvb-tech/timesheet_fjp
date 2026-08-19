import { requireAdmin } from "@/lib/auth";
import { monthOverview } from "@/lib/adminData";
import { loadMonth } from "@/lib/period";
import { todayParts } from "@/lib/dates";
import ApprovalPanel from "./ApprovalPanel";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({
  searchParams,
}: { searchParams: Promise<{ year?: string; month?: string; user?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const now = todayParts();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;

  const rows = await monthOverview(year, month);
  const selectedId = sp.user && rows.some((r) => r.userId === sp.user)
    ? sp.user
    : rows.find((r) => r.status === "SUBMITTED")?.userId ?? rows[0]?.userId;

  const detail = selectedId ? await loadMonth(selectedId, year, month) : null;

  return (
    <ApprovalPanel
      year={year} month={month} rows={rows}
      selectedId={selectedId ?? null}
      detail={detail}
    />
  );
}
