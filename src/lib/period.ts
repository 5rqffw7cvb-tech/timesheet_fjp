import { and, asc, eq, gte, lte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  budgets, dayLogs, monthlyReports, projects, timeEntries, workTypes,
  monthSettings, holidays, users, projectAssignments,
} from "@/db/schema";
import { daysInMonth, ymd, mondayIndex, workedHours } from "./dates";

export interface MonthRange {
  year: number;
  month: number;
  first: string;
  last: string;
}

export function monthRange(year: number, month: number): MonthRange {
  return {
    year, month,
    first: ymd(year, month, 1),
    last: ymd(year, month, daysInMonth(year, month)),
  };
}

export interface DayData {
  day: number;
  date: string;
  weekday: number;          // 0 = Thứ 2
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  startMin: number | null;
  endMin: number | null;
  breakMin: number;
  dayType: "WORK" | "PUBLIC_OFF" | "SUB_OFF" | "HOLIDAY_WORK";
  leaveNote: string | null;
  remark: string | null;
  attendanceHours: number;   // 就業時間 tính từ giờ vào/ra
  entries: EntryData[];
  entryHours: number;        // tổng giờ các dòng công việc
}

export interface EntryData {
  id: string;
  projectId: string;
  workTypeId: string;
  description: string;
  hours: number;
  isPlan: boolean;
}

export interface BudgetData {
  projectId: string;
  projectCode: string;
  projectName: string;
  budgetHours: number;
  usedHours: number;
}

export interface MonthData {
  year: number;
  month: number;
  days: DayData[];
  budgets: BudgetData[];
  totalBudget: number;
  totalHours: number;
  report: {
    status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
    submittedAt: Date | null;
    reviewedAt: Date | null;
    reviewNote: string | null;
    memberNote: string | null;
  };
  workingDays: number;
  locked: boolean;
}

export async function loadMonth(
  userId: string,
  year: number,
  month: number,
): Promise<MonthData> {
  const { first, last } = monthRange(year, month);

  const [logRows, entryRows, budgetRows, reportRows, settingRows, holidayRows] =
    await Promise.all([
      db.select().from(dayLogs)
        .where(and(eq(dayLogs.userId, userId), gte(dayLogs.date, first), lte(dayLogs.date, last))),
      db.select().from(timeEntries)
        .where(and(eq(timeEntries.userId, userId), gte(timeEntries.date, first), lte(timeEntries.date, last)))
        .orderBy(asc(timeEntries.createdAt)),
      db.select({
        projectId: budgets.projectId,
        hours: budgets.hours,
        code: projects.code,
        name: projects.name,
      })
        .from(budgets)
        .innerJoin(projects, eq(projects.id, budgets.projectId))
        .where(and(eq(budgets.userId, userId), eq(budgets.year, year), eq(budgets.month, month))),
      db.select().from(monthlyReports)
        .where(and(eq(monthlyReports.userId, userId), eq(monthlyReports.year, year), eq(monthlyReports.month, month)))
        .limit(1),
      db.select().from(monthSettings)
        .where(and(eq(monthSettings.year, year), eq(monthSettings.month, month))).limit(1),
      db.select().from(holidays)
        .where(and(gte(holidays.date, first), lte(holidays.date, last))),
    ]);

  const logByDate = new Map(logRows.map((r) => [r.date, r]));
  const holidayByDate = new Map(holidayRows.map((h) => [h.date, h]));
  const entriesByDate = new Map<string, EntryData[]>();
  for (const e of entryRows) {
    const list = entriesByDate.get(e.date) ?? [];
    list.push({
      id: e.id,
      projectId: e.projectId,
      workTypeId: e.workTypeId,
      description: e.description,
      hours: Number(e.hours),
      isPlan: e.isPlan,
    });
    entriesByDate.set(e.date, list);
  }

  const total = daysInMonth(year, month);
  const days: DayData[] = [];
  const usedByProject = new Map<string, number>();

  for (let d = 1; d <= total; d++) {
    const date = ymd(year, month, d);
    const log = logByDate.get(date);
    const wd = mondayIndex(year, month, d);
    const entries = entriesByDate.get(date) ?? [];
    let entryHours = 0;
    for (const e of entries) {
      if (e.isPlan) continue;
      entryHours += e.hours;
      usedByProject.set(e.projectId, (usedByProject.get(e.projectId) ?? 0) + e.hours);
    }
    const hol = holidayByDate.get(date);
    days.push({
      day: d,
      date,
      weekday: wd,
      isWeekend: wd >= 5,
      isHoliday: !!hol,
      holidayName: hol?.name,
      startMin: log?.startMin ?? null,
      endMin: log?.endMin ?? null,
      breakMin: log?.breakMin ?? 60,
      dayType: log?.dayType ?? "WORK",
      leaveNote: log?.leaveNote ?? null,
      remark: log?.remark ?? null,
      attendanceHours: workedHours(log?.startMin ?? null, log?.endMin ?? null, log?.breakMin ?? 60),
      entries,
      entryHours: Math.round(entryHours * 100) / 100,
    });
  }

  const budgetList: BudgetData[] = budgetRows.map((b) => ({
    projectId: b.projectId,
    projectCode: b.code,
    projectName: b.name,
    budgetHours: Number(b.hours),
    usedHours: Math.round((usedByProject.get(b.projectId) ?? 0) * 100) / 100,
  }));

  // project đã ghi giờ nhưng chưa được cấp budget
  const budgetIds = new Set(budgetList.map((b) => b.projectId));
  const extraIds = [...usedByProject.keys()].filter((id) => !budgetIds.has(id));
  if (extraIds.length) {
    const extras = await db.select().from(projects).where(inArray(projects.id, extraIds));
    for (const p of extras) {
      budgetList.push({
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        budgetHours: 0,
        usedHours: Math.round((usedByProject.get(p.id) ?? 0) * 100) / 100,
      });
    }
  }

  const report = reportRows[0];
  const status = report?.status ?? "DRAFT";

  return {
    year, month, days,
    budgets: budgetList.sort((a, b) => a.projectCode.localeCompare(b.projectCode)),
    totalBudget: budgetList.reduce((s, b) => s + b.budgetHours, 0),
    totalHours: Math.round(budgetList.reduce((s, b) => s + b.usedHours, 0) * 100) / 100,
    report: {
      status,
      submittedAt: report?.submittedAt ?? null,
      reviewedAt: report?.reviewedAt ?? null,
      reviewNote: report?.reviewNote ?? null,
      memberNote: report?.memberNote ?? null,
    },
    workingDays: settingRows[0]?.workingDays ?? defaultWorkingDays(year, month),
    locked: status === "SUBMITTED" || status === "APPROVED",
  };
}

/** Số ngày làm việc mặc định = số ngày trong tháng trừ T7/CN và ngày lễ đã khai báo. */
export function defaultWorkingDays(year: number, month: number): number {
  const total = daysInMonth(year, month);
  let n = 0;
  for (let d = 1; d <= total; d++) if (mondayIndex(year, month, d) < 5) n++;
  return n;
}

export async function loadMasters(userId?: string) {
  const projectQuery = userId
    ? db.select({
        id: projects.id,
        systemCode: projects.systemCode,
        systemName: projects.systemName,
        code: projects.code,
        name: projects.name,
        startDate: projects.startDate,
        endDate: projects.endDate,
        isActive: projects.isActive,
        sortOrder: projects.sortOrder,
        createdAt: projects.createdAt,
      })
        .from(projectAssignments)
        .innerJoin(projects, eq(projects.id, projectAssignments.projectId))
        .where(and(eq(projectAssignments.userId, userId), eq(projects.isActive, true)))
        .orderBy(asc(projects.sortOrder), asc(projects.code))
    : db.select().from(projects).where(eq(projects.isActive, true))
        .orderBy(asc(projects.sortOrder), asc(projects.code));

  const [projectRows, workTypeRows] = await Promise.all([
    projectQuery,
    db.select().from(workTypes).where(eq(workTypes.isActive, true))
      .orderBy(asc(workTypes.sortOrder), asc(workTypes.code)),
  ]);
  return { projects: projectRows, workTypes: workTypeRows };
}

export async function ensureReport(userId: string, year: number, month: number) {
  const [row] = await db.select().from(monthlyReports)
    .where(and(eq(monthlyReports.userId, userId), eq(monthlyReports.year, year), eq(monthlyReports.month, month)))
    .limit(1);
  if (row) return row;
  const [created] = await db.insert(monthlyReports)
    .values({ userId, year, month, status: "DRAFT" })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await db.select().from(monthlyReports)
    .where(and(eq(monthlyReports.userId, userId), eq(monthlyReports.year, year), eq(monthlyReports.month, month)))
    .limit(1);
  return again;
}

export async function activeMembers() {
  return db.select().from(users)
    .where(and(eq(users.isActive, true), eq(users.role, "MEMBER")))
    .orderBy(asc(users.fullName));
}
