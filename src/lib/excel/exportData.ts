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

export interface ExportProjectOption {
  id: string;
  code: string;
  name: string;
}

export type BuildMemberReportResult =
  | { ok: true; outcome: ExportOutcome }
  | { ok: false; needsProjectSelection: true; projects: ExportProjectOption[] }
  | { ok: false; needsProjectSelection?: false; error: string };

/**
 * Member có thể làm nhiều project trong tháng, nhưng 会社名/組織単位/就業場所/
 * 就業した業務 in trên 勤務報告書 lại khác nhau theo từng project (xem
 * `projects` table). Vì vậy file xuất ra luôn ứng với đúng 1 project:
 * - Nếu member chỉ có 1 project trong tháng -> tự động dùng project đó.
 * - Nếu có nhiều project mà không truyền `projectId` -> trả về danh sách để
 *   caller hỏi lại người dùng (popup chọn project), 作業明細 sẽ được lọc
 *   theo project đã chọn.
 */
export async function buildMemberReport(
  userId: string, year: number, month: number, projectId?: string,
): Promise<BuildMemberReportResult> {
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
  if (!row) return { ok: false, error: "Member not found." };
  const user = row.u;
  const projectById = new Map(projectRows.map((p) => [p.id, p]));

  /* ── xác định project sẽ xuất ── */
  const distinctProjectIds = [...new Set(entryRows.map((r) => r.e.projectId))];
  let effectiveProjectId = projectId;
  if (!effectiveProjectId) {
    if (distinctProjectIds.length > 1) {
      return {
        ok: false,
        needsProjectSelection: true,
        projects: distinctProjectIds
          .map((id) => projectById.get(id))
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => ({ id: p.id, code: p.code, name: p.name }))
          .sort((a, b) => a.code.localeCompare(b.code)),
      };
    }
    effectiveProjectId = distinctProjectIds[0];
  }
  const isMultiProject = distinctProjectIds.length > 1;
  const scopedEntryRows = effectiveProjectId
    ? entryRows.filter((r) => r.e.projectId === effectiveProjectId)
    : entryRows;
  const project = effectiveProjectId ? projectById.get(effectiveProjectId) : undefined;

  /*
   * Member làm nhiều project trong ngày -> 始業/終業 (giờ vào/ra) là MỘT mốc
   * chung cho cả ngày, không tách riêng theo project được. Nếu xuất nguyên
   * giờ vào/ra đó cho từng file project thì 就業時間 (giờ vào/ra − nghỉ) sẽ
   * hiện FULL cả ngày ở mọi file, trong khi 作業明細 chỉ liệt kê đúng phần
   * việc của project đó -> sai lệch, nhìn như member khai nhiều giờ hơn thực
   * tế làm cho project này. Với export theo project (isMultiProject), giữ
   * nguyên giờ vào/ra thật (dữ kiện vật lý), nhưng cộng thêm phần giờ đã
   * làm cho project KHÁC trong ngày vào cột nghỉ/外出時間 — nhờ vậy 就業時間
   * tính ra đúng bằng tổng giờ thực tế đã khai cho riêng project đang xuất.
   */
  const scopedActualMinByDay = new Map<number, number>();
  if (isMultiProject && effectiveProjectId) {
    for (const { e } of scopedEntryRows) {
      if (e.isPlan) continue;
      const day = parseYmd(e.date).day;
      scopedActualMinByDay.set(day, (scopedActualMinByDay.get(day) ?? 0) + Math.round(Number(e.hours) * 60));
    }
  }

  /* ── ngày ── */
  const days: ExportDay[] = logRows.map((l) => {
    const day = parseYmd(l.date).day;
    const startMin = l.dayType === "PUBLIC_OFF" ? null : l.startMin;
    const endMin = l.dayType === "PUBLIC_OFF" ? null : l.endMin;
    let breakMin = l.breakMin;
    if (isMultiProject && effectiveProjectId && startMin != null && endMin != null) {
      let span = endMin - startMin;
      if (span < 0) span += 24 * 60; // ca qua đêm
      const scopedMin = scopedActualMinByDay.get(day) ?? 0;
      breakMin = Math.max(0, span - scopedMin);
    }
    return { day, startMin, endMin, breakMin, attendanceNote: l.leaveNote };
  });

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

  for (const { e, projectCode, workTypeName } of scopedEntryRows) {
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
    clientCompany: project?.clientCompany ?? "",
    orgUnit: project?.orgUnit ?? "",
    workplace: project?.workplace ?? "",
    workName: project?.workName ?? "",
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
    ok: true,
    outcome: {
      fileName: reportFileName(
        data.companyName,
        user.displayName || user.username,
        year, month,
        isMultiProject ? project?.code : undefined,
      ),
      buffer,
      warnings,
      totalHours: round2(totalHours),
    },
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
