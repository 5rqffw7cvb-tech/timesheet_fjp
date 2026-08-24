import { requireUser } from "@/lib/auth";
import { loadMasters, loadMonth, monthRange } from "@/lib/period";
import { todayParts } from "@/lib/dates";
import TimesheetEditor from "./TimesheetEditor";

export const dynamic = "force-dynamic";

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = todayParts();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;

  const [data, masters] = await Promise.all([
    loadMonth(user.id, year, month),
    loadMasters(user.id, monthRange(year, month)),
  ]);

  return (
    <TimesheetEditor
      key={`${year}-${month}`}
      data={data}
      projects={masters.projects}
      workTypes={masters.workTypes}
    />
  );
}
