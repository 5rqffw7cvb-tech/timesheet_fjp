import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  dayLogs, timeEntries, projects, workTypes, users, companies,
  monthSettings, holidays, monthlyReports,
} from "@/db/schema";
import { daysInMonth, mondayIndex, ymd, parseYmd } from "@/lib/dates";
import { defaultWorkingDays } from "@/lib/period";
import {
  buildWeeklyReport, reportFileName,
  type WeeklyReportData, type ExportWeek, type ExportTaskRow, type ExportDay,
} from "./weeklyReport";

let templateCache: Uint8Array | null = null;

export async function loadTemplate(): Promise<Uint8Array> {
  if (templateCache) return templateCache;
  const path = resolve(process.cwd(), "templates/weekly-report-template.xlsx");
  templateCache = new Uint8Array(await readFile(path));
  return templateCache;
}

export interface ExportOutcome {
  fileName: string;
  buffer: Uint8Array;
  warnings: string[];
  totalHours: number;
}

export async function buildMemberReport(
  userId: string, year: number, month: number,
): Promise<ExportOutcome> {
  const first = ymd(year, month, 1);
  const last = ymd(year, month, daysInMonth(year, month));

  const [userRows, logRows, entryRows, projectRows, workTypeRows, settingRows, holidayRows] =
    await Promise.all([
      db.select({
        u: users, companyName: companies.name,
      }).from(users)
        .leftJoin(companies, eq(companies.id, users.companyId))
        .where(eq(users.id, userId)).limit(1),
      db.select().from(dayLogs)
        .where(and(eq(dayLogs.userId, userId), gte(dayLogs.date, first), lte(dayLogs.date, last)))
        .orderBy(asc(dayLogs.date)),
      db.select({
        e: timeEntries, projectCode: projects.code, workTypeName: workTypes.name,
      }).from(timeEntries)
        .innerJoin(projects, eq(projects.id, timeEntries.projectId))
        .innerJoin(workTypes, eq(workTypes.id, timeEntries.workTypeId))
        .where(and(eq(timeEntries.userId, userId), gte(timeEntries.date, first), lte(timeEntries.date, last)))
        .orderBy(asc(timeEntries.date), asc(timeEntries.createdAt)),
      db.select().from(projects).orderBy(asc(projects.sortOrder), asc(projects.code)),
      db.select().from(workTypes).orderBy(asc(workTypes.sortOrder), asc(workTypes.code)),
      db.select().from(monthSettings)
        .where(and(eq(monthSettings.year, year), eq(monthSettings.month, month))).limit(1),
      db.select().from(holidays)
        .where(and(gte(holidays.date, first), lte(holidays.date, last))),
    ]);

  const row = userRows[0];
  if (!row) throw new Error("Không tìm thấy thành viên.");
  const user = row.u;

  /* ── ngày ── */
  const days: ExportDay[] = logRows.map((l) => ({
    day: parseYmd(l.date).day,
    startMin: l.dayType === "PUBLIC_OFF" ? null : l.startMin,
    endMin: l.dayType === "PUBLIC_OFF" ? null : l.endMin,
    breakMin: l.breakMin,
    attendanceNote: l.leaveNote,
  }));

  /* ── gom dòng công việc theo tuần × (project, 工種) ── */
  const offset = mondayIndex(year, month, 1);
  interface Acc {
    projectCode: string;
    workTypeName: string;
    planHours: number[];
    actualHours: number[];
    planDesc: Set<string>;
    actualDesc: Set<string>;
    firstSeen: number;
  }
  const weekMap = new Map<number, Map<string, Acc>>();
  const usedProjectCodes = new Set<string>();
  let totalHours = 0;
  let order = 0;

  for (const { e, projectCode, workTypeName } of entryRows) {
    const day = parseYmd(e.date).day;
    const pos = day - 1 + offset;
    const week = Math.floor(pos / 7) + 1;
    const col = pos % 7;
    const key = `${projectCode}|${workTypeName}`;

    if (!weekMap.has(week)) weekMap.set(week, new Map());
    const bucket = weekMap.get(week)!;
    let acc = bucket.get(key);
    if (!acc) {
      acc = {
        projectCode, workTypeName,
        planHours: Array(7).fill(0), actualHours: Array(7).fill(0),
        planDesc: new Set(), actualDesc: new Set(), firstSeen: order++,
      };
      bucket.set(key, acc);
    }
    const hours = Number(e.hours);
    if (e.isPlan) {
      acc.planHours[col] += hours;
      if (e.description) acc.planDesc.add(e.description);
    } else {
      acc.actualHours[col] += hours;
      if (e.description) acc.actualDesc.add(e.description);
      totalHours += hours;
    }
    usedProjectCodes.add(projectCode);
  }

  const weeks: ExportWeek[] = [...weekMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, bucket]) => ({
      index,
      rows: [...bucket.values()]
        .sort((a, b) => a.firstSeen - b.firstSeen)
        .map<ExportTaskRow>((a) => ({
          projectCode: a.projectCode,
          workTypeName: a.workTypeName,
          planDescription: [...a.planDesc].join("、"),
          actualDescription: [...a.actualDesc].join("、"),
          planHours: a.planHours.map(round2),
          actualHours: a.actualHours.map(round2),
        })),
    }));

  /* ── nghỉ lễ / nghỉ phép / ghi chú ── */
  const publicHolidays = holidayRows.map((h) => parseYmd(h.date).day);
  for (const l of logRows) {
    if (l.dayType === "PUBLIC_OFF") publicHolidays.push(parseYmd(l.date).day);
  }
  const leaves = logRows
    .filter((l) => l.leaveNote && /休暇|欠勤|全休/.test(l.leaveNote))
    .map((l) => ({ day: parseYmd(l.date).day, label: l.leaveNote! }));
  const remarks = logRows
    .filter((l) => l.remark)
    .map((l) => ({ day: parseYmd(l.date).day, text: l.remark! }));

  const data: WeeklyReportData = {
    year, month,
    companyName: row.companyName ?? "FPTジャパン",
    memberName: user.fullName,
    roleTitle: user.roleTitle ?? "",
    workingDays: settingRows[0]?.workingDays ?? defaultWorkingDays(year, month),
    days, weeks,
    projectCodes: [...usedProjectCodes],
    publicHolidays: [...new Set(publicHolidays)],
    leaves, remarks,
    masterProjects: projectRows.map((p) => ({
      systemCode: p.systemCode, systemName: p.systemName, code: p.code, name: p.name,
    })),
    masterWorkTypes: workTypeRows.map((w) => ({
      code: w.code, name: w.name, note: w.note,
    })),
  };

  const template = await loadTemplate();
  const { buffer, warnings } = buildWeeklyReport(template, data);

  return {
    fileName: reportFileName(
      data.companyName,
      user.displayName || user.username,
      year, month,
    ),
    buffer,
    warnings,
    totalHours: round2(totalHours),
  };
}

export async function approvedMemberIds(year: number, month: number) {
  const rows = await db.select({ userId: monthlyReports.userId })
    .from(monthlyReports)
    .where(and(
      eq(monthlyReports.year, year),
      eq(monthlyReports.month, month),
      eq(monthlyReports.status, "APPROVED"),
    ));
  return rows.map((r) => r.userId);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
