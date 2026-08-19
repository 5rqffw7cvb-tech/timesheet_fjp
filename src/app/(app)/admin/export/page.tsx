import { requireAdmin } from "@/lib/auth";
import { monthOverview, monthWorkingDays } from "@/lib/adminData";
import { todayParts } from "@/lib/dates";
import ExportPanel from "./ExportPanel";

export const dynamic = "force-dynamic";

export default async function ExportPage({
  searchParams,
}: { searchParams: Promise<{ year?: string; month?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const now = todayParts();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;

  const [rows, workingDays] = await Promise.all([
    monthOverview(year, month),
    monthWorkingDays(year, month),
  ]);

  return <ExportPanel year={year} month={month} rows={rows} workingDays={workingDays} />;
}
