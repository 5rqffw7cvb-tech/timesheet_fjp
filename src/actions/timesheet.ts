"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  dayLogs, timeEntries, monthlyReports, auditLogs,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureReport } from "@/lib/period";
import { parseYmd } from "@/lib/dates";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

const daySchema = z.object({
  date: dateSchema,
  startMin: z.number().int().min(0).max(2879).nullable(),
  endMin: z.number().int().min(0).max(2879).nullable(),
  breakMin: z.number().int().min(0).max(600),
  dayType: z.enum(["WORK", "PUBLIC_OFF", "SUB_OFF", "HOLIDAY_WORK"]),
  leaveNote: z.string().max(120).nullable(),
  remark: z.string().max(200).nullable(),
});

const entrySchema = z.object({
  projectId: z.string().min(1),
  workTypeId: z.string().min(1),
  description: z.string().max(300).default(""),
  hours: z.number().min(0).max(24),
  isPlan: z.boolean().default(false),
});

const saveSchema = z.object({
  day: daySchema,
  entries: z.array(entrySchema).max(40),
});

export interface SaveResult { ok: boolean; error?: string }

/** Chặn sửa khi tháng đã nộp hoặc đã chốt. */
async function assertEditable(userId: string, year: number, month: number) {
  const [report] = await db.select().from(monthlyReports)
    .where(and(
      eq(monthlyReports.userId, userId),
      eq(monthlyReports.year, year),
      eq(monthlyReports.month, month),
    )).limit(1);
  if (report && (report.status === "SUBMITTED" || report.status === "APPROVED")) {
    throw new Error(
      report.status === "APPROVED"
        ? "This month is closed and cannot be edited."
        : "This month is awaiting approval. Withdraw it before editing.",
    );
  }
}

export async function saveDayAction(input: unknown): Promise<SaveResult> {
  const user = await requireUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const { day, entries } = parsed.data;
  const { year, month } = parseYmd(day.date);

  try {
    await assertEditable(user.id, year, month);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const hasDayInfo =
    day.startMin != null || day.endMin != null || day.dayType !== "WORK" ||
    !!day.leaveNote || !!day.remark;

  await db.transaction(async (tx) => {
    if (hasDayInfo) {
      await tx.insert(dayLogs).values({
        userId: user.id,
        date: day.date,
        startMin: day.startMin,
        endMin: day.endMin,
        breakMin: day.breakMin,
        dayType: day.dayType,
        leaveNote: day.leaveNote,
        remark: day.remark,
      }).onConflictDoUpdate({
        target: [dayLogs.userId, dayLogs.date],
        set: {
          startMin: day.startMin, endMin: day.endMin, breakMin: day.breakMin,
          dayType: day.dayType, leaveNote: day.leaveNote, remark: day.remark,
          updatedAt: new Date(),
        },
      });
    } else {
      await tx.delete(dayLogs)
        .where(and(eq(dayLogs.userId, user.id), eq(dayLogs.date, day.date)));
    }

    await tx.delete(timeEntries)
      .where(and(eq(timeEntries.userId, user.id), eq(timeEntries.date, day.date)));

    const rows = entries
      .filter((e) => e.hours > 0)
      .map((e) => ({
        userId: user.id,
        date: day.date,
        projectId: e.projectId,
        workTypeId: e.workTypeId,
        description: e.description ?? "",
        hours: e.hours.toFixed(2),
        isPlan: e.isPlan ?? false,
      }));
    if (rows.length) await tx.insert(timeEntries).values(rows);
  });

  await ensureReport(user.id, year, month);
  revalidatePath("/timesheet");
  return { ok: true };
}

/** Chép giờ vào/ra + các dòng công việc của một ngày sang ngày khác. */
export async function copyDayAction(
  fromDate: string, toDate: string,
): Promise<SaveResult> {
  const user = await requireUser();
  if (!dateSchema.safeParse(fromDate).success || !dateSchema.safeParse(toDate).success) {
    return { ok: false, error: "Invalid date" };
  }
  const { year, month } = parseYmd(toDate);
  try {
    await assertEditable(user.id, year, month);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const [srcLog] = await db.select().from(dayLogs)
    .where(and(eq(dayLogs.userId, user.id), eq(dayLogs.date, fromDate))).limit(1);
  const srcEntries = await db.select().from(timeEntries)
    .where(and(eq(timeEntries.userId, user.id), eq(timeEntries.date, fromDate)));

  if (!srcLog && srcEntries.length === 0) {
    return { ok: false, error: "The source day has no data to copy." };
  }

  await db.transaction(async (tx) => {
    if (srcLog) {
      await tx.insert(dayLogs).values({
        userId: user.id, date: toDate,
        startMin: srcLog.startMin, endMin: srcLog.endMin, breakMin: srcLog.breakMin,
        dayType: srcLog.dayType, leaveNote: srcLog.leaveNote, remark: srcLog.remark,
      }).onConflictDoUpdate({
        target: [dayLogs.userId, dayLogs.date],
        set: {
          startMin: srcLog.startMin, endMin: srcLog.endMin, breakMin: srcLog.breakMin,
          dayType: srcLog.dayType, updatedAt: new Date(),
        },
      });
    }
    await tx.delete(timeEntries)
      .where(and(eq(timeEntries.userId, user.id), eq(timeEntries.date, toDate)));
    if (srcEntries.length) {
      await tx.insert(timeEntries).values(srcEntries.map((e) => ({
        userId: user.id, date: toDate, projectId: e.projectId,
        workTypeId: e.workTypeId, description: e.description,
        hours: e.hours, isPlan: e.isPlan,
      })));
    }
  });

  await ensureReport(user.id, year, month);
  revalidatePath("/timesheet");
  return { ok: true };
}

export async function submitMonthAction(
  year: number, month: number, note: string,
): Promise<SaveResult> {
  const user = await requireUser();
  const report = await ensureReport(user.id, year, month);
  if (!report) return { ok: false, error: "Report period not found." };
  if (report.status === "APPROVED") {
    return { ok: false, error: "This month is closed." };
  }
  await db.update(monthlyReports).set({
    status: "SUBMITTED",
    submittedAt: new Date(),
    memberNote: note?.slice(0, 500) || null,
    reviewNote: null,
    updatedAt: new Date(),
  }).where(eq(monthlyReports.id, report.id));

  await db.insert(auditLogs).values({
    actorId: user.id, action: "SUBMIT_MONTH", target: `${year}-${month}`,
  });
  revalidatePath("/timesheet");
  return { ok: true };
}

export async function withdrawMonthAction(
  year: number, month: number,
): Promise<SaveResult> {
  const user = await requireUser();
  const report = await ensureReport(user.id, year, month);
  if (!report) return { ok: false, error: "Report period not found." };
  if (report.status === "APPROVED") {
    return { ok: false, error: "This month is closed; contact an administrator to reopen it." };
  }
  await db.update(monthlyReports)
    .set({ status: "DRAFT", submittedAt: null, updatedAt: new Date() })
    .where(eq(monthlyReports.id, report.id));
  revalidatePath("/timesheet");
  return { ok: true };
}

/** Xoá sạch dữ liệu của một ngày. */
export async function clearDayAction(date: string): Promise<SaveResult> {
  const user = await requireUser();
  if (!dateSchema.safeParse(date).success) return { ok: false, error: "Invalid date" };
  const { year, month } = parseYmd(date);
  try {
    await assertEditable(user.id, year, month);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  await db.transaction(async (tx) => {
    await tx.delete(timeEntries)
      .where(and(eq(timeEntries.userId, user.id), eq(timeEntries.date, date)));
    await tx.delete(dayLogs)
      .where(and(eq(dayLogs.userId, user.id), eq(dayLogs.date, date)));
  });
  revalidatePath("/timesheet");
  return { ok: true };
}

/** Điền nhanh giờ vào/ra chuẩn cho toàn bộ ngày làm việc còn trống trong tháng. */
export async function fillWorkdaysAction(
  year: number, month: number,
  startMin: number, endMin: number, breakMin: number,
): Promise<SaveResult & { filled?: number }> {
  const user = await requireUser();
  try {
    await assertEditable(user.id, year, month);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { daysInMonth, mondayIndex, ymd } = await import("@/lib/dates");
  const total = daysInMonth(year, month);
  const existing = new Set(
    (await db.select({ d: dayLogs.date }).from(dayLogs)
      .where(eq(dayLogs.userId, user.id))).map((r) => r.d),
  );

  const rows = [];
  for (let d = 1; d <= total; d++) {
    if (mondayIndex(year, month, d) >= 5) continue;
    const date = ymd(year, month, d);
    if (existing.has(date)) continue;
    rows.push({ userId: user.id, date, startMin, endMin, breakMin, dayType: "WORK" as const });
  }
  if (rows.length) await db.insert(dayLogs).values(rows).onConflictDoNothing();
  await ensureReport(user.id, year, month);
  revalidatePath("/timesheet");
  return { ok: true, filled: rows.length };
}
