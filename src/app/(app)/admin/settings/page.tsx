import { and, asc, eq, gte, lte } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { holidays, monthSettings, orgSettings } from "@/db/schema";
import { todayParts, ymd, daysInMonth } from "@/lib/dates";
import { defaultWorkingDays } from "@/lib/period";
import SettingsPanel from "./SettingsPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: { searchParams: Promise<{ year?: string; month?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const now = todayParts();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;

  const [orgRows, settingRows, holidayRows] = await Promise.all([
    db.select().from(orgSettings).where(eq(orgSettings.id, "default")).limit(1),
    db.select().from(monthSettings)
      .where(and(eq(monthSettings.year, year), eq(monthSettings.month, month))).limit(1),
    db.select().from(holidays)
      .where(and(
        gte(holidays.date, ymd(year, 1, 1)),
        lte(holidays.date, ymd(year, 12, 31)),
      ))
      .orderBy(asc(holidays.date)),
  ]);

  const org = orgRows[0] ?? {
    clientCompany: "横河ソリューションサービス株式会社",
    orgUnit: "SI　開発部",
    workplace: "〒105-0011東京都港区芝公園1丁目7-6",
    workName: "YOKO Portal 開発",
  };

  return (
    <SettingsPanel
      year={year} month={month}
      workingDays={settingRows[0]?.workingDays ?? defaultWorkingDays(year, month)}
      suggestedWorkingDays={defaultWorkingDays(year, month)}
      daysInMonth={daysInMonth(year, month)}
      org={{
        clientCompany: org.clientCompany, orgUnit: org.orgUnit,
        workplace: org.workplace, workName: org.workName,
      }}
      holidays={holidayRows.map((h) => ({ id: h.id, date: h.date, name: h.name }))}
    />
  );
}
