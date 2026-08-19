"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  budgets, monthlyReports, users, projects, workTypes,
  monthSettings, holidays, orgSettings, auditLogs, companies,
  projectAssignments,
} from "@/db/schema";
import { requireAdmin, hashPassword } from "@/lib/auth";

export interface ActionResult { ok: boolean; error?: string; message?: string; id?: string }

const fail = (error: string): ActionResult => ({ ok: false, error });

/* ─────────────────────────── Budget ─────────────────────────── */

export async function setBudgetAction(
  userId: string, projectId: string, year: number, month: number, hours: number,
): Promise<ActionResult> {
  await requireAdmin();
  if (!Number.isFinite(hours) || hours < 0 || hours > 9999) return fail("Số giờ không hợp lệ");

  if (hours === 0) {
    await db.delete(budgets).where(and(
      eq(budgets.userId, userId), eq(budgets.projectId, projectId),
      eq(budgets.year, year), eq(budgets.month, month),
    ));
  } else {
    await db.insert(budgets)
      .values({ userId, projectId, year, month, hours: hours.toFixed(2) })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.projectId, budgets.year, budgets.month],
        set: { hours: hours.toFixed(2), updatedAt: new Date() },
      });
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
  if (src.length === 0) return fail("Tháng nguồn chưa có budget nào.");

  for (const b of src) {
    await db.insert(budgets)
      .values({ userId: b.userId, projectId: b.projectId, year: toYear, month: toMonth, hours: b.hours })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.projectId, budgets.year, budgets.month],
        set: { hours: b.hours, updatedAt: new Date() },
      });
  }
  revalidatePath("/admin/budgets");
  return { ok: true, message: `Đã chép ${src.length} dòng budget.` };
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
  if (!report) return fail("Thành viên chưa nộp tháng này.");
  if (decision === "REJECTED" && !note.trim()) {
    return fail("Vui lòng ghi lý do trả lại để member biết cần sửa gì.");
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
  return { ok: true, message: decision === "APPROVED" ? "Đã chốt." : "Đã trả lại cho member." };
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
  if (!report) return fail("Không tìm thấy kỳ báo cáo.");

  await db.update(monthlyReports).set({
    status: "DRAFT", submittedAt: null, reviewedAt: null,
    reviewNote: note.trim() || "Quản lý mở lại để chỉnh sửa", updatedAt: new Date(),
  }).where(eq(monthlyReports.id, report.id));

  await db.insert(auditLogs).values({
    actorId: admin.id, action: "REOPEN", target: `${userId}:${year}-${month}`,
  });
  revalidatePath("/admin/approvals");
  return { ok: true, message: "Đã mở lại." };
}

export async function bulkApproveAction(
  year: number, month: number, userIds: string[],
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (userIds.length === 0) return fail("Chưa chọn thành viên nào.");
  let n = 0;
  for (const userId of userIds) {
    const res = await reviewReportAction(userId, year, month, "APPROVED", "");
    if (res.ok) n++;
  }
  await db.insert(auditLogs).values({
    actorId: admin.id, action: "BULK_APPROVE", target: `${year}-${month}`, detail: String(n),
  });
  return { ok: true, message: `Đã chốt ${n} thành viên.` };
}

/* ─────────────────────────── Thành viên ─────────────────────────── */

const memberSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9._-]+$/, "Chỉ dùng chữ thường, số, . _ -"),
  fullName: z.string().min(1).max(120),
  displayName: z.string().max(60).optional(),
  employeeCode: z.string().max(30).optional(),
  roleTitle: z.string().max(60).optional(),
  location: z.string().max(30).optional(),
  companyId: z.string().optional(),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export async function createMemberAction(input: unknown, password: string): Promise<ActionResult> {
  await requireAdmin();
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (password.length < 8) return fail("Mật khẩu khởi tạo phải có ít nhất 8 ký tự.");

  const [dup] = await db.select({ id: users.id }).from(users)
    .where(eq(users.username, parsed.data.username)).limit(1);
  if (dup) return fail("Tên đăng nhập đã tồn tại.");

  const [created] = await db.insert(users).values({
    ...parsed.data,
    displayName: parsed.data.displayName || null,
    employeeCode: parsed.data.employeeCode || null,
    roleTitle: parsed.data.roleTitle || null,
    location: parsed.data.location || null,
    companyId: parsed.data.companyId || null,
    passwordHash: await hashPassword(password),
    mustChangePw: true,
  }).returning({ id: users.id });
  revalidatePath("/admin/members");
  return { ok: true, id: created?.id, message: "Đã tạo tài khoản." };
}

export async function updateMemberAction(id: string, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const [dup] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.username, parsed.data.username), sql`${users.id} <> ${id}`)).limit(1);
  if (dup) return fail("Tên đăng nhập đã được dùng bởi tài khoản khác.");

  await db.update(users).set({
    ...parsed.data,
    displayName: parsed.data.displayName || null,
    employeeCode: parsed.data.employeeCode || null,
    roleTitle: parsed.data.roleTitle || null,
    location: parsed.data.location || null,
    companyId: parsed.data.companyId || null,
    updatedAt: new Date(),
  }).where(eq(users.id, id));
  revalidatePath("/admin/members");
  return { ok: true, message: "Đã lưu." };
}

export async function toggleMemberAction(id: string, isActive: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (admin.id === id && !isActive) return fail("Không thể tự vô hiệu hoá tài khoản của mình.");
  await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, id));
  revalidatePath("/admin/members");
  return { ok: true };
}

export async function resetPasswordAction(id: string, password: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (password.length < 8) return fail("Mật khẩu phải có ít nhất 8 ký tự.");
  await db.update(users).set({
    passwordHash: await hashPassword(password), mustChangePw: true, updatedAt: new Date(),
  }).where(eq(users.id, id));
  await db.insert(auditLogs).values({ actorId: admin.id, action: "RESET_PASSWORD", target: id });
  revalidatePath("/admin/members");
  return { ok: true, message: "Đã đặt lại mật khẩu. Member phải đổi ở lần đăng nhập kế tiếp." };
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
  return { ok: true, message: "Đã đồng bộ project của member." };
}

/* ─────────────────────────── Master ─────────────────────────── */

export async function upsertProjectAction(
  id: string | null,
  data: { systemCode: string; systemName: string; code: string; name: string; isActive: boolean },
): Promise<ActionResult> {
  await requireAdmin();
  if (!data.code.trim() || !data.name.trim()) return fail("Thiếu mã hoặc tên project.");

  if (id) {
    await db.update(projects).set({ ...data }).where(eq(projects.id, id));
  } else {
    const [dup] = await db.select({ id: projects.id }).from(projects)
      .where(eq(projects.code, data.code)).limit(1);
    if (dup) return fail("Mã project đã tồn tại.");
    await db.insert(projects).values(data);
  }
  revalidatePath("/admin/masters");
  return { ok: true, message: "Đã lưu project." };
}

export async function upsertWorkTypeAction(
  id: string | null,
  data: { code: string; name: string; category: string; note: string; isActive: boolean },
): Promise<ActionResult> {
  await requireAdmin();
  if (!data.code.trim() || !data.name.trim()) return fail("Thiếu mã hoặc tên 工種.");
  const payload = { ...data, note: data.note || null };
  if (id) {
    await db.update(workTypes).set(payload).where(eq(workTypes.id, id));
  } else {
    const [dup] = await db.select({ id: workTypes.id }).from(workTypes)
      .where(eq(workTypes.code, data.code)).limit(1);
    if (dup) return fail("Mã 工種 đã tồn tại.");
    await db.insert(workTypes).values(payload);
  }
  revalidatePath("/admin/masters");
  return { ok: true, message: "Đã lưu 工種." };
}

/* ─────────────────────────── Cấu hình ─────────────────────────── */

export async function setMonthSettingAction(
  year: number, month: number, workingDays: number,
): Promise<ActionResult> {
  await requireAdmin();
  if (workingDays < 0 || workingDays > 31) return fail("所定日数 phải trong khoảng 0–31.");
  await db.insert(monthSettings).values({ year, month, workingDays })
    .onConflictDoUpdate({
      target: [monthSettings.year, monthSettings.month], set: { workingDays },
    });
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true, message: "Đã lưu 所定日数." };
}

export async function addHolidayAction(date: string, name: string): Promise<ActionResult> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Ngày không hợp lệ.");
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
  clientCompany: string; orgUnit: string; workplace: string; workName: string;
}): Promise<ActionResult> {
  await requireAdmin();
  await db.insert(orgSettings).values({ id: "default", ...data })
    .onConflictDoUpdate({ target: orgSettings.id, set: { ...data, updatedAt: new Date() } });
  revalidatePath("/admin/settings");
  return { ok: true, message: "Đã lưu." };
}

export async function upsertCompanyAction(
  id: string | null, code: string, name: string,
): Promise<ActionResult> {
  await requireAdmin();
  if (!code.trim() || !name.trim()) return fail("Thiếu mã hoặc tên công ty.");
  if (id) await db.update(companies).set({ code, name }).where(eq(companies.id, id));
  else await db.insert(companies).values({ code, name }).onConflictDoNothing();
  revalidatePath("/admin/settings");
  return { ok: true };
}
