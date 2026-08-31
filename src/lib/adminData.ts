import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  budgets, dayLogs, monthlyReports, projects, projectAssignments, projectRates, timeEntries, users, monthSettings,
} from "@/db/schema";
import { daysInMonth, ymd, workedHours } from "./dates";
import { defaultWorkingDays, monthRange } from "./period";

const HOURS_PER_CONG = 180;
/** 1日の所定労働時間 — 代休を実働扱いにする際の換算に使う。 */
const HOURS_PER_DAY = 7.5;

/**
 * Member×project vẫn đang trong khoảng Assigned period của tháng này nhưng
 * chưa có budget row cho tháng này -> tự copy 工数(quota) từ tháng gần nhất
 * (đã từng nhập) trong cùng khoảng assign, để admin không phải bấm "Copy
 * previous month" thủ công cho từng người mới join / từng tháng mới. Đơn giá
 * đã tự "kế thừa" theo effectiveFrom qua projectRates rồi nên chỉ cần lo phần
 * 工数 ở đây. Idempotent — chỉ insert khi chưa có row cho tháng này.
 */
export async function carryForwardBudgets(year: number, month: number): Promise<number> {
  const { first, last } = monthRange(year, month);
  const period = year * 12 + month;

  const activeAssignments = await db.select({
    userId: projectAssignments.userId,
    projectId: projectAssignments.projectId,
    startDate: projectAssignments.startDate,
  }).from(projectAssignments)
    .where(and(
      or(isNull(projectAssignments.startDate), lte(projectAssignments.startDate, last)),
      or(isNull(projectAssignments.endDate), gte(projectAssignments.endDate, first)),
    ));
  if (activeAssignments.length === 0) return 0;

  const userIds = [...new Set(activeAssignments.map((a) => a.userId))];
  const [existingThisMonth, priorBudgets] = await Promise.all([
    db.select({ userId: budgets.userId, projectId: budgets.projectId })
      .from(budgets).where(and(eq(budgets.year, year), eq(budgets.month, month))),
    db.select().from(budgets).where(inArray(budgets.userId, userIds)),
  ]);
  const existingSet = new Set(existingThisMonth.map((r) => `${r.userId}|${r.projectId}`));

  const latestByPair = new Map<string, typeof priorBudgets[number]>();
  for (const b of priorBudgets) {
    const p = b.year * 12 + b.month;
    if (p >= period) continue;
    const key = `${b.userId}|${b.projectId}`;
    const cur = latestByPair.get(key);
    if (!cur || p > cur.year * 12 + cur.month) latestByPair.set(key, b);
  }

  let copied = 0;
  for (const a of activeAssignments) {
    const key = `${a.userId}|${a.projectId}`;
    if (existingSet.has(key)) continue;
    const prior = latestByPair.get(key);
    if (!prior) continue;
    // assign có thể đã kết thúc rồi mở lại với startDate mới -> không lôi số cũ từ đợt assign trước
    if (a.startDate && ymd(prior.year, prior.month, 1) < a.startDate) continue;
    await db.insert(budgets)
      .values({ userId: a.userId, projectId: a.projectId, year, month, hours: prior.hours, unitPriceMm: prior.unitPriceMm })
      .onConflictDoNothing({ target: [budgets.userId, budgets.projectId, budgets.year, budgets.month] });
    copied++;
  }
  return copied;
}

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
  /**
   * 代休 (SUB_OFF) — bù cho tháng trước đã đi làm T7/CN. Vẫn tính vào giờ
   * thực để chốt billing (không bị coi là nghỉ trừ giờ), quy đổi theo
   * HOURS_PER_DAY vì ngày đó member không chấm công/nhập work details.
   * Đã được cộng sẵn vào usedHours; tách riêng ra đây để filterOverviewRows
   * cộng lại đúng khi lọc theo project (không tính theo tỷ lệ project).
   */
  subOffHours: number;
  attendanceHours: number;   // tổng 就業時間 tính từ giờ vào/ra
  daysLogged: number;
  byProject: {
    projectId: string;
    code: string;
    name: string;
    budget: number;
    used: number;
    unitPriceMm: number;
  }[];
}

export async function monthOverview(year: number, month: number): Promise<OverviewRow[]> {
  const first = ymd(year, month, 1);
  const last = ymd(year, month, daysInMonth(year, month));

  const [memberRows, budgetRows, entryRows, logRows, reportRows, rateRows] = await Promise.all([
    db.select().from(users)
      .where(and(eq(users.isActive, true), eq(users.role, "MEMBER")))
      .orderBy(asc(users.fullName)),
    db.select({
      userId: budgets.userId, projectId: budgets.projectId,
      hours: budgets.hours, unitPriceMm: budgets.unitPriceMm,
      code: projects.code, name: projects.name,
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
    db.select({
      userId: projectRates.userId,
      projectId: projectRates.projectId,
      effectiveFrom: projectRates.effectiveFrom,
      unitPriceMm: projectRates.unitPriceMm,
    }).from(projectRates)
      .where(lte(projectRates.effectiveFrom, last)),
  ]);

  const latestRateByUserProject = new Map<string, { effectiveFrom: string; unitPriceMm: number }>();
  for (const r of rateRows) {
    const key = `${r.userId}|${r.projectId}`;
    const current = latestRateByUserProject.get(key);
    if (!current || r.effectiveFrom > current.effectiveFrom) {
      latestRateByUserProject.set(key, {
        effectiveFrom: r.effectiveFrom,
        unitPriceMm: Number(r.unitPriceMm),
      });
    }
  }

  const reportByUser = new Map(reportRows.map((r) => [r.userId, r]));
  const attendanceByUser = new Map<string, { hours: number; days: number }>();
  const subOffDaysByUser = new Map<string, number>();
  for (const l of logRows) {
    const h = workedHours(l.startMin, l.endMin, l.breakMin);
    const cur = attendanceByUser.get(l.userId) ?? { hours: 0, days: 0 };
    cur.hours += h;
    if (h > 0) cur.days += 1;
    attendanceByUser.set(l.userId, cur);
    // Nhận theo cả 2 cách nhập: chọn 日区分=代休 (đúng chuẩn) hoặc chỉ gõ
    // "代休" vào ô 勤務欄/休暇 (free text) — member/admin có thể chỉ quen dùng 1 trong 2.
    const isSubOff = l.dayType === "SUB_OFF" || (l.leaveNote?.includes("代休") ?? false);
    if (isSubOff) subOffDaysByUser.set(l.userId, (subOffDaysByUser.get(l.userId) ?? 0) + 1);
  }

  const projectMap = new Map<string, Map<string, {
    projectId: string; code: string; name: string; budget: number; used: number; unitPriceMm: number;
  }>>();
  const touch = (userId: string, projectId: string, code: string, name: string) => {
    if (!projectMap.has(userId)) projectMap.set(userId, new Map());
    const m = projectMap.get(userId)!;
    if (!m.has(projectId)) {
      const rk = `${userId}|${projectId}`;
      m.set(projectId, {
        projectId,
        code,
        name,
        budget: 0,
        used: 0,
        unitPriceMm: latestRateByUserProject.get(rk)?.unitPriceMm ?? 0,
      });
    }
    return m.get(projectId)!;
  };
  for (const b of budgetRows) {
    const p = touch(b.userId, b.projectId, b.code, b.name);
    p.budget = Number(b.hours);
    if (b.unitPriceMm != null) p.unitPriceMm = Number(b.unitPriceMm);
  }
  for (const e of entryRows) touch(e.userId, e.projectId, e.code, e.name).used = Number(e.hours);

  return memberRows.map((u) => {
    const per = [...(projectMap.get(u.id)?.values() ?? [])]
      .sort((a, b) => a.code.localeCompare(b.code));
    const att = attendanceByUser.get(u.id) ?? { hours: 0, days: 0 };
    const report = reportByUser.get(u.id);
    const subOffHours = round2((subOffDaysByUser.get(u.id) ?? 0) * HOURS_PER_DAY);
    const budgetHours = round2(per.reduce((s, p) => s + p.budget, 0));
    // Factor dùng cho 下限/上限 (140h・180h * factor) = tổng 工数 đã assign tháng
    // này quy đổi ra 人月 (1.0 = 180h), không phải số cố định nhập tay nữa —
    // assign 0.5 + 0.7 ở 2 project thì factor tháng đó = 1.2. Member chưa có
    // budget nào tháng này thì fallback về billingFactor tĩnh (mặc định 1).
    const billingFactor = budgetHours > 0
      ? round2(budgetHours / HOURS_PER_CONG)
      : Number(u.billingFactor ?? 1);
    return {
      userId: u.id,
      fullName: u.fullName,
      displayName: u.displayName,
      username: u.username,
      roleTitle: u.roleTitle,
      billingUnitPrice: Number(u.billingUnitPrice ?? 0),
      billingFactor,
      status: report?.status ?? "DRAFT",
      submittedAt: report?.submittedAt ?? null,
      memberNote: report?.memberNote ?? null,
      reviewNote: report?.reviewNote ?? null,
      budgetHours,
      usedHours: round2(per.reduce((s, p) => s + p.used, 0) + subOffHours),
      subOffHours,
      attendanceHours: round2(att.hours),
      daysLogged: att.days,
      byProject: per.map((p) => ({
        ...p,
        budget: round2(p.budget),
        used: round2(p.used),
        unitPriceMm: round2(p.unitPriceMm),
      })),
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

function uniquePeriodsOf(periods: PeriodKey[]): PeriodKey[] {
  return [...new Map(
    periods
      .filter((p) => p.year > 0 && p.month >= 1 && p.month <= 12)
      .map((p) => [`${p.year}-${p.month}`, p]),
  ).values()];
}

/**
 * Lọc theo project + scope cho MỘT tháng, không cộng dồn với tháng khác.
 * billingFactor khi có lọc project phải tính lại từ đúng 工数 đã lọc (không
 * dùng factor tính trên toàn bộ project của monthOverview) — nếu không, lọc
 * theo project sẽ không làm thay đổi 下限/上限 hiển thị dù dữ liệu đã khác.
 */
function filterOverviewRows(rows: OverviewRow[], filterSet: Set<string> | null, scope: "all" | "approved"): OverviewRow[] {
  return rows
    .filter((row) => scope !== "approved" || row.status === "APPROVED")
    .map((row) => {
      const byProject = filterSet ? row.byProject.filter((p) => filterSet.has(p.projectId)) : row.byProject;
      // 代休 không gắn với project cụ thể nào -> giữ nguyên khi lọc theo
      // project, không chia theo tỷ lệ như hours thực đã làm.
      const usedHours = round2(byProject.reduce((s, p) => s + p.used, 0) + row.subOffHours);
      const budgetHours = round2(byProject.reduce((s, p) => s + p.budget, 0));
      const billingFactor = filterSet
        ? (budgetHours > 0 ? round2(budgetHours / HOURS_PER_CONG) : 0)
        : row.billingFactor;
      return { ...row, byProject, usedHours, budgetHours, billingFactor };
    });
}

export interface PeriodOverview {
  period: PeriodKey;
  rows: OverviewRow[];
}

/**
 * Giữ riêng từng tháng (không cộng dồn) — dùng cho billing, vì 下限/上限 phải
 * tính theo factor của ĐÚNG tháng đó rồi mới cộng adjustment lại; gộp nhiều
 * tháng thành 1 factor trước khi tính sẽ làm sai kết quả khi 1 tháng thiếu
 * giờ còn tháng khác dư giờ (bù trừ lẫn nhau, khác thực tế từng tháng).
 */
export async function monthOverviewByPeriod(
  periods: PeriodKey[],
  projectIds?: string[],
  scope: "all" | "approved" = "all",
): Promise<PeriodOverview[]> {
  const uniquePeriods = uniquePeriodsOf(periods);
  if (uniquePeriods.length === 0) return [];

  const filterSet = projectIds?.length ? new Set(projectIds) : null;
  const maps = await Promise.all(uniquePeriods.map((p) => monthOverview(p.year, p.month)));

  return uniquePeriods.map((period, i) => ({
    period,
    rows: filterOverviewRows(maps[i], filterSet, scope),
  }));
}

export async function monthOverviewForPeriods(
  periods: PeriodKey[],
  projectIds?: string[],
  scope: "all" | "approved" = "all",
): Promise<OverviewRow[]> {
  const perPeriod = await monthOverviewByPeriod(periods, projectIds, scope);
  if (perPeriod.length === 0) return [];

  const combined = new Map<string, OverviewRow>();

  for (const { rows } of perPeriod) {
    for (const row of rows) {
      if (!combined.has(row.userId)) {
        combined.set(row.userId, {
          ...row,
          byProject: [],
          budgetHours: 0,
          usedHours: 0,
          subOffHours: 0,
          attendanceHours: 0,
          daysLogged: 0,
          billingFactor: 0,
        });
      }

      const acc = combined.get(row.userId)!;
      acc.attendanceHours = round2(acc.attendanceHours + row.attendanceHours);
      acc.daysLogged += row.daysLogged;
      acc.usedHours = round2(acc.usedHours + row.usedHours);
      acc.subOffHours = round2(acc.subOffHours + row.subOffHours);
      acc.budgetHours = round2(acc.budgetHours + row.budgetHours);
      acc.billingFactor = round2(acc.billingFactor + row.billingFactor);

      const projectMap = new Map(acc.byProject.map((p) => [p.projectId, p]));
      for (const p of row.byProject) {
        const current = projectMap.get(p.projectId);
        if (current) {
          const prevUsed = current.used;
          const nextUsed = round2(current.used + p.used);
          const weightedRate = nextUsed > 0
            ? round2(((current.unitPriceMm * prevUsed) + (p.unitPriceMm * p.used)) / nextUsed)
            : current.unitPriceMm || p.unitPriceMm;
          current.budget = round2(current.budget + p.budget);
          current.used = nextUsed;
          current.unitPriceMm = weightedRate;
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
