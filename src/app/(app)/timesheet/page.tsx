import { requireUser } from "@/lib/auth";
import { activeMembers, loadMasters, loadMonth, monthRange } from "@/lib/period";
import { todayParts } from "@/lib/dates";
import TimesheetEditor from "./TimesheetEditor";

export const dynamic = "force-dynamic";

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; user?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = todayParts();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;
  const isAdmin = user.role === "ADMIN";

  // Admin không tự chấm công nên không có timesheet của riêng mình — chọn
  // xem/sửa timesheet của member qua ?user=<id>, mặc định là member đầu
  // tiên. Member thường chỉ xem được của chính mình dù cố truyền query khác.
  const members = isAdmin ? await activeMembers() : [];
  const requestedUserId = isAdmin ? sp.user : undefined;
  const viewingUser = isAdmin
    ? (members.find((m) => m.id === requestedUserId) ?? members[0] ?? null)
    : user;
  const viewingUserId = viewingUser?.id ?? user.id;

  const [data, masters] = await Promise.all([
    loadMonth(viewingUserId, year, month),
    loadMasters(viewingUserId, monthRange(year, month)),
  ]);

  return (
    <TimesheetEditor
      key={`${viewingUserId}-${year}-${month}`}
      data={data}
      projects={masters.projects}
      workTypes={masters.workTypes}
      viewingUserId={viewingUserId}
      viewingUserName={viewingUser?.fullName ?? user.fullName}
      isAdmin={isAdmin}
      members={isAdmin ? members.map((m) => ({ id: m.id, fullName: m.fullName, roleTitle: m.roleTitle })) : undefined}
    />
  );
}
