import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  budgets, monthSettings, monthlyReports, projectAssignments, projectRates, timeEntries, users,
} from "@/db/schema";
import { daysInMonth, shiftMonth, ymd } from "./dates";
import { defaultWorkingDays } from "./period";

/** 1.0 工数 = 180h — cùng quy ước với adminData/BudgetGrid cũ. */
export const HOURS_PER_CONG = 180;
/** 1日の所定労働時間 — dùng để hiện 標準時間 của từng tháng trên header. */
const HOURS_PER_DAY = 7.5;

export type ReportStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export interface MonthKey {
  year: number;
  month: number;
}

export interface TimelineMonth extends MonthKey {
  /** "2026-09" — khoá dùng chung giữa server và client. */
  key: string;
  workingDays: number;
  standardHours: number;
}

export interface TimelineCell {
  /** 工数 đã cấp (budget hours ÷ 180). */
  effort: number;
  budgetHours: number;
  /** Đơn giá đã lưu riêng cho đúng tháng này (0 = chưa đặt). */
  unitPriceMm: number;
  /** 実績 — giờ thực tế (isPlan=false) member đã nhập cho project này. */
  actualHours: number;
  actualEffort: number;
  status: ReportStatus;
}

export interface TimelineMember {
  userId: string;
  fullName: string;
  roleTitle: string | null;
  /** Đã có row trong project_assignments (không chỉ do có giờ/budget lẻ). */
  assigned: boolean;
  startDate: string | null;
  endDate: string | null;
  /** Đơn giá gần nhất của member × project này (¥/MM). */
  unitPriceMm: number;
}

export interface TimelineSlice {
  months: TimelineMonth[];
  /** key = `${userId}|${monthKey}`; chỉ chứa ô thực sự có dữ liệu. */
  cells: Record<string, TimelineCell>;
}

/**
 * Bỏ đơn giá khỏi dữ liệu timeline trước khi gửi xuống client (PM không được
 * xem tiền) — ẩn ở UI thôi thì payload của trang vẫn còn số.
 */
export function stripTimelineMoney<T extends { cells: Record<string, TimelineCell> }>(slice: T): T {
  return {
    ...slice,
    cells: Object.fromEntries(
      Object.entries(slice.cells).map(([k, c]) => [k, { ...c, unitPriceMm: 0 }]),
    ),
  };
}

export function stripMemberMoney(members: TimelineMember[]): TimelineMember[] {
  return members.map((m) => ({ ...m, unitPriceMm: 0 }));
}

export function monthKeyOf(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** `count` tháng liên tiếp tính từ `start`. */
export function monthSequence(start: MonthKey, count: number): MonthKey[] {
  const out: MonthKey[] = [];
  for (let i = 0; i < count; i++) out.push(shiftMonth(start.year, start.month, i));
  return out;
}

function periodOf(m: MonthKey) {
  return m.year * 12 + m.month;
}

/**
 * Dữ liệu của MỘT project cho một dải tháng — mỗi lần timeline cuộn sang trái
 * / phải chỉ nạp thêm đúng phần tháng còn thiếu, không tải lại cả bảng.
 */
export async function loadTimelineSlice(
  projectId: string,
  months: MonthKey[],
): Promise<TimelineSlice> {
  if (months.length === 0) return { months: [], cells: {} };

  const sorted = [...months].sort((a, b) => periodOf(a) - periodOf(b));
  const head = sorted[0];
  const tail = sorted[sorted.length - 1];
  const first = ymd(head.year, head.month, 1);
  const last = ymd(tail.year, tail.month, daysInMonth(tail.year, tail.month));
  const from = periodOf(head);
  const to = periodOf(tail);

  const [budgetRows, entryRows, reportRows, settingRows] = await Promise.all([
    db.select({
      userId: budgets.userId,
      year: budgets.year,
      month: budgets.month,
      hours: budgets.hours,
      unitPriceMm: budgets.unitPriceMm,
    }).from(budgets)
      .where(and(
        eq(budgets.projectId, projectId),
        sql`(${budgets.year} * 12 + ${budgets.month}) between ${from} and ${to}`,
      )),
    db.select({
      userId: timeEntries.userId,
      ym: sql<string>`to_char(${timeEntries.date}, 'YYYY-MM')`,
      hours: sql<string>`sum(${timeEntries.hours})`,
    }).from(timeEntries)
      .where(and(
        eq(timeEntries.projectId, projectId),
        eq(timeEntries.isPlan, false),
        gte(timeEntries.date, first),
        lte(timeEntries.date, last),
      ))
      .groupBy(timeEntries.userId, sql`to_char(${timeEntries.date}, 'YYYY-MM')`),
    db.select({
      userId: monthlyReports.userId,
      year: monthlyReports.year,
      month: monthlyReports.month,
      status: monthlyReports.status,
    }).from(monthlyReports)
      .where(sql`(${monthlyReports.year} * 12 + ${monthlyReports.month}) between ${from} and ${to}`),
    db.select().from(monthSettings)
      .where(sql`(${monthSettings.year} * 12 + ${monthSettings.month}) between ${from} and ${to}`),
  ]);

  const workingDaysByKey = new Map(
    settingRows.map((s) => [monthKeyOf(s.year, s.month), s.workingDays]),
  );
  const timelineMonths: TimelineMonth[] = sorted.map((m) => {
    const key = monthKeyOf(m.year, m.month);
    const workingDays = workingDaysByKey.get(key) ?? defaultWorkingDays(m.year, m.month);
    return { ...m, key, workingDays, standardHours: round2(workingDays * HOURS_PER_DAY) };
  });

  const wanted = new Set(timelineMonths.map((m) => m.key));
  const cells: Record<string, TimelineCell> = {};
  const touch = (userId: string, monthKey: string) => {
    const k = `${userId}|${monthKey}`;
    if (!cells[k]) {
      cells[k] = {
        effort: 0, budgetHours: 0, unitPriceMm: 0,
        actualHours: 0, actualEffort: 0, status: "DRAFT",
      };
    }
    return cells[k];
  };

  for (const b of budgetRows) {
    const key = monthKeyOf(b.year, b.month);
    if (!wanted.has(key)) continue;
    const cell = touch(b.userId, key);
    cell.budgetHours = round2(Number(b.hours));
    cell.effort = round2(cell.budgetHours / HOURS_PER_CONG);
    cell.unitPriceMm = b.unitPriceMm == null ? 0 : round2(Number(b.unitPriceMm));
  }
  for (const e of entryRows) {
    if (!wanted.has(e.ym)) continue;
    const cell = touch(e.userId, e.ym);
    cell.actualHours = round2(Number(e.hours));
    cell.actualEffort = round2(cell.actualHours / HOURS_PER_CONG);
  }
  for (const r of reportRows) {
    const k = `${r.userId}|${monthKeyOf(r.year, r.month)}`;
    if (cells[k]) cells[k].status = r.status;
  }

  return { months: timelineMonths, cells };
}

export interface TimelineMembers {
  /** Member đang/đã dính tới project (assign, có budget, hoặc đã ghi giờ). */
  members: TimelineMember[];
  /** Toàn bộ member active — dùng cho dropdown "thêm メンバー" vào project. */
  allMembers: { userId: string; fullName: string; roleTitle: string | null }[];
}

/**
 * Danh sách dòng của timeline. Cố tình tính trên TOÀN BỘ lịch sử (không giới
 * hạn theo dải tháng đang xem) để số dòng không nhảy khi cuộn ngang.
 */
export async function loadTimelineMembers(projectId: string): Promise<TimelineMembers> {
  const [memberRows, assignmentRows, budgetRows, entryUserRows, rateRows] = await Promise.all([
    db.select({ id: users.id, fullName: users.fullName, roleTitle: users.roleTitle })
      .from(users)
      .where(and(eq(users.isActive, true), eq(users.role, "MEMBER")))
      .orderBy(asc(users.fullName)),
    db.select({
      userId: projectAssignments.userId,
      startDate: projectAssignments.startDate,
      endDate: projectAssignments.endDate,
    }).from(projectAssignments).where(eq(projectAssignments.projectId, projectId)),
    db.select({
      userId: budgets.userId, year: budgets.year, month: budgets.month, unitPriceMm: budgets.unitPriceMm,
    }).from(budgets).where(eq(budgets.projectId, projectId)),
    db.select({ userId: timeEntries.userId }).from(timeEntries)
      .where(eq(timeEntries.projectId, projectId))
      .groupBy(timeEntries.userId),
    db.select({
      userId: projectRates.userId,
      effectiveFrom: projectRates.effectiveFrom,
      unitPriceMm: projectRates.unitPriceMm,
    }).from(projectRates).where(eq(projectRates.projectId, projectId)),
  ]);

  const assignmentByUser = new Map(assignmentRows.map((a) => [a.userId, a]));
  const touched = new Set<string>([
    ...assignmentRows.map((a) => a.userId),
    ...budgetRows.map((b) => b.userId),
    ...entryUserRows.map((e) => e.userId),
  ]);

  // Đơn giá "hiện hành" = bản ghi có mốc hiệu lực mới nhất, lấy từ cả
  // project_rates lẫn đơn giá đã lưu kèm budget từng tháng.
  const latestRate = new Map<string, { at: string; value: number }>();
  const bump = (userId: string, at: string, raw: string | null) => {
    const value = raw == null ? 0 : round2(Number(raw));
    if (value <= 0) return;
    const cur = latestRate.get(userId);
    if (!cur || at > cur.at) latestRate.set(userId, { at, value });
  };
  for (const r of rateRows) bump(r.userId, r.effectiveFrom, r.unitPriceMm);
  for (const b of budgetRows) bump(b.userId, ymd(b.year, b.month, 1), b.unitPriceMm);

  return {
    members: memberRows.filter((u) => touched.has(u.id)).map((u) => {
      const assignment = assignmentByUser.get(u.id);
      return {
        userId: u.id,
        fullName: u.fullName,
        roleTitle: u.roleTitle,
        assigned: !!assignment,
        startDate: assignment?.startDate ?? null,
        endDate: assignment?.endDate ?? null,
        unitPriceMm: latestRate.get(u.id)?.value ?? 0,
      };
    }),
    allMembers: memberRows.map((u) => ({
      userId: u.id, fullName: u.fullName, roleTitle: u.roleTitle,
    })),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
