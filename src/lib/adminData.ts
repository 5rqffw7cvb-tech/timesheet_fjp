import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  budgets, dayLogs, monthlyReports, projects, timeEntries, users, monthSettings,
} from "@/db/schema";
import { daysInMonth, ymd, workedHours } from "./dates";
import { defaultWorkingDays } from "./period";

export interface OverviewRow {
  userId: string;
  fullName: string;
  displayName: string | null;
  username: string;
  roleTitle: string | null;
  billingUnitPrice: number;
  billingFactor: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  submittedAt: Date | null;
  memberNote: string | null;
  reviewNote: string | null;
  budgetHours: number;
  usedHours: number;
  attendanceHours: number;   // tổng 就業時間 tính từ giờ vào/ra
  daysLogged: number;
  byProject: { projectId: string; code: string; name: string; budget: number; used: number }[];
}

export async function monthOverview(year: number, month: number): Promise<OverviewRow[]> {
  const first = ymd(year, month, 1);
  const last = ymd(year, month, daysInMonth(year, month));

  const [memberRows, budgetRows, entryRows, logRows, reportRows] = await Promise.all([
    db.select().from(users)
      .where(and(eq(users.isActive, true), eq(users.role, "MEMBER")))
      .orderBy(asc(users.fullName)),
    db.select({
      userId: budgets.userId, projectId: budgets.projectId,
      hours: budgets.hours, code: projects.code, name: projects.name,
    }).from(budgets)
      .innerJoin(projects, eq(projects.id, budgets.projectId))
      .where(and(eq(budgets.year, year), eq(budgets.month, month))),
    db.select({
      userId: timeEntries.userId, projectId: timeEntries.projectId,
      code: projects.code, name: projects.name,
      hours: sql<string>`sum(${timeEntries.hours})`,
    }).from(timeEntries)
      .innerJoin(projects, eq(projects.id, timeEntries.projectId))
      .where(and(
        gte(timeEntries.date, first), lte(timeEntries.date, last),
        eq(timeEntries.isPlan, false),
      ))
      .groupBy(timeEntries.userId, timeEntries.projectId, projects.code, projects.name),
    db.select().from(dayLogs).where(and(gte(dayLogs.date, first), lte(dayLogs.date, last))),
    db.select().from(monthlyReports)
      .where(and(eq(monthlyReports.year, year), eq(monthlyReports.month, month))),
  ]);

  const reportByUser = new Map(reportRows.map((r) => [r.userId, r]));
  const attendanceByUser = new Map<string, { hours: number; days: number }>();
  for (const l of logRows) {
    const h = workedHours(l.startMin, l.endMin, l.breakMin);
    const cur = attendanceByUser.get(l.userId) ?? { hours: 0, days: 0 };
    cur.hours += h;
    if (h > 0) cur.days += 1;
    attendanceByUser.set(l.userId, cur);
  }

  const projectMap = new Map<string, Map<string, {
    projectId: string; code: string; name: string; budget: number; used: number;
  }>>();
  const touch = (userId: string, projectId: string, code: string, name: string) => {
    if (!projectMap.has(userId)) projectMap.set(userId, new Map());
    const m = projectMap.get(userId)!;
    if (!m.has(projectId)) m.set(projectId, { projectId, code, name, budget: 0, used: 0 });
    return m.get(projectId)!;
  };
  for (const b of budgetRows) touch(b.userId, b.projectId, b.code, b.name).budget = Number(b.hours);
  for (const e of entryRows) touch(e.userId, e.projectId, e.code, e.name).used = Number(e.hours);

  return memberRows.map((u) => {
    const per = [...(projectMap.get(u.id)?.values() ?? [])]
      .sort((a, b) => a.code.localeCompare(b.code));
    const att = attendanceByUser.get(u.id) ?? { hours: 0, days: 0 };
    const report = reportByUser.get(u.id);
    return {
      userId: u.id,
      fullName: u.fullName,
      displayName: u.displayName,
      username: u.username,
      roleTitle: u.roleTitle,
      billingUnitPrice: Number(u.billingUnitPrice ?? 0),
      billingFactor: Number(u.billingFactor ?? 1),
      status: report?.status ?? "DRAFT",
      submittedAt: report?.submittedAt ?? null,
      memberNote: report?.memberNote ?? null,
      reviewNote: report?.reviewNote ?? null,
      budgetHours: round2(per.reduce((s, p) => s + p.budget, 0)),
      usedHours: round2(per.reduce((s, p) => s + p.used, 0)),
      attendanceHours: round2(att.hours),
      daysLogged: att.days,
      byProject: per.map((p) => ({ ...p, budget: round2(p.budget), used: round2(p.used) })),
    };
  });
}

export async function monthWorkingDays(year: number, month: number) {
  const [row] = await db.select().from(monthSettings)
    .where(and(eq(monthSettings.year, year), eq(monthSettings.month, month))).limit(1);
  return row?.workingDays ?? defaultWorkingDays(year, month);
}

export interface PeriodKey {
  year: number;
  month: number;
}

export async function monthOverviewForPeriods(
  periods: PeriodKey[],
  projectIds?: string[],
  scope: "all" | "approved" = "all",
): Promise<OverviewRow[]> {
  const uniquePeriods = [...new Map(
    periods
      .filter((p) => p.year > 0 && p.month >= 1 && p.month <= 12)
      .map((p) => [`${p.year}-${p.month}`, p]),
  ).values()];

  if (uniquePeriods.length === 0) return [];

  const filterSet = projectIds?.length ? new Set(projectIds) : null;
  const maps = await Promise.all(uniquePeriods.map((p) => monthOverview(p.year, p.month)));

  const combined = new Map<string, OverviewRow>();

  for (const rows of maps) {
    for (const row of rows) {
      if (scope === "approved" && row.status !== "APPROVED") continue;

      const byProject = filterSet
        ? row.byProject.filter((p) => filterSet.has(p.projectId))
        : row.byProject;
      const usedHours = round2(byProject.reduce((s, p) => s + p.used, 0));
      const budgetHours = round2(byProject.reduce((s, p) => s + p.budget, 0));

      if (!combined.has(row.userId)) {
        combined.set(row.userId, {
          ...row,
          byProject: [],
          budgetHours: 0,
          usedHours: 0,
          attendanceHours: 0,
          daysLogged: 0,
        });
      }

      const acc = combined.get(row.userId)!;
      acc.attendanceHours = round2(acc.attendanceHours + row.attendanceHours);
      acc.daysLogged += row.daysLogged;
      acc.usedHours = round2(acc.usedHours + usedHours);
      acc.budgetHours = round2(acc.budgetHours + budgetHours);

      const projectMap = new Map(acc.byProject.map((p) => [p.projectId, p]));
      for (const p of byProject) {
        const current = projectMap.get(p.projectId);
        if (current) {
          current.budget = round2(current.budget + p.budget);
          current.used = round2(current.used + p.used);
        } else {
          projectMap.set(p.projectId, { ...p });
        }
      }
      acc.byProject = [...projectMap.values()].sort((a, b) => a.code.localeCompare(b.code));

      if (row.status === "REJECTED") acc.status = "REJECTED";
      else if (row.status === "SUBMITTED" && acc.status !== "REJECTED") acc.status = "SUBMITTED";
      else if (row.status === "DRAFT" && acc.status === "APPROVED") acc.status = "DRAFT";
    }
  }

  return [...combined.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function round2(n: number) { return Math.round(n * 100) / 100; }
