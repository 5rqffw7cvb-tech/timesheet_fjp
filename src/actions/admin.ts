"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  budgets, monthlyReports, users, projects, workTypes,
  monthSettings, holidays, orgSettings, auditLogs, companies,
  projectAssignments, projectRates,
} from "@/db/schema";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { ymd } from "@/lib/dates";
import { normalizeBillingCurrency } from "@/lib/currency";

export interface ActionResult { ok: boolean; error?: string; message?: string; id?: string }

const fail = (error: string): ActionResult => ({ ok: false, error });

/* ─────────────────────────── Budget ─────────────────────────── */

export async function setBudgetAction(
  userId: string,
  projectId: string,
  year: number,
  month: number,
  hours: number,
  unitPriceMm?: number,
): Promise<ActionResult> {
  await requireAdmin();
  if (!Number.isFinite(hours) || hours < 0 || hours > 9999) return fail("Invalid hours");
  if (unitPriceMm != null && (!Number.isFinite(unitPriceMm) || unitPriceMm < 0 || unitPriceMm > 1_000_000_000)) {
    return fail("Invalid unit price");
  }

  const normalizedRate = unitPriceMm == null ? null : Math.round(unitPriceMm * 100) / 100;
  const effectiveFrom = ymd(year, month, 1);

  if (hours === 0 && (normalizedRate == null || normalizedRate === 0)) {
    await db.delete(budgets).where(and(
      eq(budgets.userId, userId), eq(budgets.projectId, projectId),
      eq(budgets.year, year), eq(budgets.month, month),
    ));
  } else {
    await db.insert(budgets)
      .values({
        userId,
        projectId,
        year,
        month,
        hours: hours.toFixed(2),
        unitPriceMm: normalizedRate == null ? null : normalizedRate.toFixed(2),
      })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.projectId, budgets.year, budgets.month],
        set: {
          hours: hours.toFixed(2),
          unitPriceMm: normalizedRate == null ? null : normalizedRate.toFixed(2),
          updatedAt: new Date(),
        },
      });
    await db.insert(projectAssignments)
      .values({ userId, projectId })
      .onConflictDoNothing({ target: [projectAssignments.userId, projectAssignments.projectId] });

    if (normalizedRate != null && normalizedRate > 0) {
      await db.insert(projectRates)
        .values({
          userId,
          projectId,
          effectiveFrom,
          unitPriceMm: normalizedRate.toFixed(2),
        })
        .onConflictDoUpdate({
          target: [projectRates.userId, projectRates.projectId, projectRates.effectiveFrom],
          set: { unitPriceMm: normalizedRate.toFixed(2), updatedAt: new Date() },
        });
    }
  }
  revalidatePath("/admin/budgets");
  revalidatePath("/admin");
  return { ok: true };
}

/** Chép toàn bộ budget của một tháng sang tháng khác. */
export async function copyBudgetsAction(
  fromYear: number, fromMonth: number, toYear: number, toMonth: number,
): Promise<ActionResult> {
  await requireAdmin();
  const src = await db.select().from(budgets)
    .where(and(eq(budgets.year, fromYear), eq(budgets.month, fromMonth)));
  if (src.length === 0) return fail("The source month has no budgets.");

  for (const b of src) {
    await db.insert(budgets)
      .values({
        userId: b.userId,
        projectId: b.projectId,
        year: toYear,
        month: toMonth,
        hours: b.hours,
        unitPriceMm: b.unitPriceMm,
      })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.projectId, budgets.year, budgets.month],
        set: { hours: b.hours, unitPriceMm: b.unitPriceMm, updatedAt: new Date() },
      });
  }
  revalidatePath("/admin/budgets");
  return { ok: true, message: `Copied ${src.length} budget rows.` };
}

/* ─────────────────────── Duyệt / chốt sổ ─────────────────────── */

export async function reviewReportAction(
  userId: string, year: number, month: number,
  decision: "APPROVED" | "REJECTED", note: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const [report] = await db.select().from(monthlyReports).where(and(
    eq(monthlyReports.userId, userId),
    eq(monthlyReports.year, year),
    eq(monthlyReports.month, month),
  )).limit(1);
  if (!report) return fail("The member has not submitted this month.");
  if (decision === "REJECTED" && !note.trim()) {
    return fail("Please provide a reason so the member knows what to fix.");
  }

  await db.update(monthlyReports).set({
    status: decision,
    reviewedAt: new Date(),
    reviewerId: admin.id,
    reviewNote: note.trim() || null,
    updatedAt: new Date(),
  }).where(eq(monthlyReports.id, report.id));

  await db.insert(auditLogs).values({
    actorId: admin.id, action: `REVIEW_${decision}`,
    target: `${userId}:${year}-${month}`, detail: note.slice(0, 300) || null,
  });
  revalidatePath("/admin/approvals");
  revalidatePath("/admin");
  return { ok: true, message: decision === "APPROVED" ? "Approved." : "Returned to the member." };
}

/** Mở lại tháng đã chốt để sửa. */
export async function reopenReportAction(
  userId: string, year: number, month: number, note: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const [report] = await db.select().from(monthlyReports).where(and(
    eq(monthlyReports.userId, userId),
    eq(monthlyReports.year, year),
    eq(monthlyReports.month, month),
  )).limit(1);
  if (!report) return fail("Report period not found.");

  await db.update(monthlyReports).set({
    status: "DRAFT", submittedAt: null, reviewedAt: null,
    reviewNote: note.trim() || "Management reopened this for editing", updatedAt: new Date(),
  }).where(eq(monthlyReports.id, report.id));

  await db.insert(auditLogs).values({
    actorId: admin.id, action: "REOPEN", target: `${userId}:${year}-${month}`,
  });
  revalidatePath("/admin/approvals");
  return { ok: true, message: "Reopened." };
}

export async function bulkApproveAction(
  year: number, month: number, userIds: string[],
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (userIds.length === 0) return fail("No members selected.");
  let n = 0;
  for (const userId of userIds) {
    const res = await reviewReportAction(userId, year, month, "APPROVED", "");
    if (res.ok) n++;
  }
  await db.insert(auditLogs).values({
    actorId: admin.id, action: "BULK_APPROVE", target: `${year}-${month}`, detail: String(n),
  });
  return { ok: true, message: `Approved ${n} members.` };
}

/* ─────────────────────────── Thành viên ─────────────────────────── */

const memberSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9._-]+$/, "Use lowercase letters, numbers, and . _ - only"),
  fullName: z.string().min(1).max(120),
  displayName: z.string().max(60).optional(),
  employeeCode: z.string().max(30).optional(),
  roleTitle: z.string().max(60).optional(),
  location: z.string().max(30).optional(),
  billingUnitPrice: z.coerce.number().min(0).max(1_000_000_000).default(0),
  billingFactor: z.coerce.number().min(0.1).max(10).default(1),
  companyId: z.string().optional(),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export async function createMemberAction(input: unknown, password: string): Promise<ActionResult> {
  await requireAdmin();
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (password.length < 8) return fail("Initial password must be at least 8 characters.");

  const [dup] = await db.select({ id: users.id }).from(users)
    .where(eq(users.username, parsed.data.username)).limit(1);
  if (dup) return fail("Username already exists.");

  const [created] = await db.insert(users).values({
    ...parsed.data,
    displayName: parsed.data.displayName || null,
    employeeCode: parsed.data.employeeCode || null,
    roleTitle: parsed.data.roleTitle || null,
    location: parsed.data.location || null,
    billingUnitPrice: parsed.data.billingUnitPrice.toFixed(2),
    billingFactor: parsed.data.billingFactor.toFixed(2),
    companyId: parsed.data.companyId || null,
    passwordHash: await hashPassword(password),
    mustChangePw: true,
  }).returning({ id: users.id });
  revalidatePath("/admin/members");
  return { ok: true, id: created?.id, message: "Account created." };
}

export async function updateMemberAction(id: string, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const [dup] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.username, parsed.data.username), sql`${users.id} <> ${id}`)).limit(1);
  if (dup) return fail("This username is already used by another account.");

  await db.update(users).set({
    ...parsed.data,
    displayName: parsed.data.displayName || null,
    employeeCode: parsed.data.employeeCode || null,
    roleTitle: parsed.data.roleTitle || null,
    location: parsed.data.location || null,
    billingUnitPrice: parsed.data.billingUnitPrice.toFixed(2),
    billingFactor: parsed.data.billingFactor.toFixed(2),
    companyId: parsed.data.companyId || null,
    updatedAt: new Date(),
  }).where(eq(users.id, id));
  revalidatePath("/admin/members");
  return { ok: true, message: "Saved." };
}

export async function toggleMemberAction(id: string, isActive: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (admin.id === id && !isActive) return fail("You cannot disable your own account.");
  await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, id));
  revalidatePath("/admin/members");
  return { ok: true };
}

export async function resetPasswordAction(id: string, password: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (password.length < 8) return fail("Password must be at least 8 characters.");
  await db.update(users).set({
    passwordHash: await hashPassword(password), mustChangePw: true, updatedAt: new Date(),
  }).where(eq(users.id, id));
  await db.insert(auditLogs).values({ actorId: admin.id, action: "RESET_PASSWORD", target: id });
  revalidatePath("/admin/members");
  return { ok: true, message: "Password reset. The member must change it at next sign-in." };
}

export async function syncMemberProjectAssignmentsAction(
  userId: string, projectIds: string[],
): Promise<ActionResult> {
  await requireAdmin();
  const uniqueIds = [...new Set(projectIds.filter(Boolean))];

  const existing = await db.select({ projectId: projectAssignments.projectId })
    .from(projectAssignments)
    .where(eq(projectAssignments.userId, userId));
  const existingSet = new Set(existing.map((r) => r.projectId));
  const addIds = uniqueIds.filter((id) => !existingSet.has(id));
  const removeIds = [...existingSet].filter((id) => !uniqueIds.includes(id));

  if (addIds.length) {
    await db.insert(projectAssignments).values(addIds.map((projectId) => ({ userId, projectId })));
  }
  if (removeIds.length) {
    await db.delete(projectAssignments).where(and(
      eq(projectAssignments.userId, userId),
      inArray(projectAssignments.projectId, removeIds),
    ));
  }

  revalidatePath("/admin/members");
  revalidatePath("/timesheet");
  return { ok: true, message: "Member projects synchronized." };
}

/* ─────────────────────────── Master ─────────────────────────── */

export async function upsertProjectAction(
  id: string | null,
  data: {
    systemCode: string; systemName: string; code: string; name: string; isActive: boolean;
    clientCompany: string; orgUnit: string; workplace: string; workName: string;
  },
): Promise<ActionResult> {
  await requireAdmin();
  if (!data.code.trim() || !data.name.trim()) return fail("Project code or name is missing.");

  if (id) {
    await db.update(projects).set({ ...data }).where(eq(projects.id, id));
  } else {
    const [dup] = await db.select({ id: projects.id }).from(projects)
      .where(eq(projects.code, data.code)).limit(1);
    if (dup) return fail("Project code already exists.");
    await db.insert(projects).values(data);
  }
  revalidatePath("/admin/masters");
  return { ok: true, message: "Project saved." };
}

export async function upsertWorkTypeAction(
  id: string | null,
  data: { code: string; name: string; category: string; note: string; isActive: boolean },
): Promise<ActionResult> {
  await requireAdmin();
  if (!data.code.trim() || !data.name.trim()) return fail("Work type code or name is missing.");
  const payload = { ...data, note: data.note || null };
  if (id) {
    await db.update(workTypes).set(payload).where(eq(workTypes.id, id));
  } else {
    const [dup] = await db.select({ id: workTypes.id }).from(workTypes)
      .where(eq(workTypes.code, data.code)).limit(1);
    if (dup) return fail("Work type code already exists.");
    await db.insert(workTypes).values(payload);
  }
  revalidatePath("/admin/masters");
  return { ok: true, message: "Work type saved." };
}

/* ─────────────────────────── Cấu hình ─────────────────────────── */

export async function setMonthSettingAction(
  year: number, month: number, workingDays: number,
): Promise<ActionResult> {
  await requireAdmin();
  if (workingDays < 0 || workingDays > 31) return fail("Working days must be between 0 and 31.");
  await db.insert(monthSettings).values({ year, month, workingDays })
    .onConflictDoUpdate({
      target: [monthSettings.year, monthSettings.month], set: { workingDays },
    });
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true, message: "Working days saved." };
}

export async function addHolidayAction(date: string, name: string): Promise<ActionResult> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Invalid date.");
  await db.insert(holidays).values({ date, name: name.trim() || "公休" })
    .onConflictDoUpdate({ target: holidays.date, set: { name: name.trim() || "公休" } });
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function removeHolidayAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(holidays).where(eq(holidays.id, id));
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function updateOrgSettingAction(data: {
  billingCurrency: string;
}): Promise<ActionResult> {
  await requireAdmin();
  const payload = { billingCurrency: normalizeBillingCurrency(data.billingCurrency) };
  await db.insert(orgSettings).values({ id: "default", ...payload })
    .onConflictDoUpdate({ target: orgSettings.id, set: { ...payload, updatedAt: new Date() } });
  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved." };
}

export async function upsertCompanyAction(
  id: string | null, code: string, name: string,
): Promise<ActionResult> {
  await requireAdmin();
  if (!code.trim() || !name.trim()) return fail("Company code or name is missing.");
  if (id) await db.update(companies).set({ code, name }).where(eq(companies.id, id));
  else await db.insert(companies).values({ code, name }).onConflictDoNothing();
  revalidatePath("/admin/settings");
  return { ok: true };
}
