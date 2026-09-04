import "server-only";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { budgets, projectAssignments, timeEntries } from "@/db/schema";
import { currentUser, requireUser } from "./auth";
import type { User } from "@/db/schema";

export type ManagerLevel = "NONE" | "PM" | "DM";

/**
 * Quyền xem các màn hình quản trị. Ngoài ADMIN (toàn quyền), member có
 * managerLevel PM/DM cũng vào được nhưng chỉ thấy project mình được assign:
 * PM chỉ xem (không thấy 単価/billing), DM xem được tiền và duyệt timesheet.
 * Mọi thao tác sửa master/budget/settings vẫn chỉ admin.
 */
export interface AdminView {
  user: User;
  isAdmin: boolean;
  managerLevel: ManagerLevel;
  /** 承認・差戻し・再オープン — admin hoặc DM. */
  canApprove: boolean;
  /** 単価・billing・調整額 — admin hoặc DM. */
  canSeeMoney: boolean;
  /** Sửa budget / master / cấu hình — chỉ admin. */
  canEdit: boolean;
  /** null = mọi project (admin); mảng = chỉ những project này. */
  projectIds: string[] | null;
}

const ADMIN_VIEW = (user: User): AdminView => ({
  user,
  isAdmin: true,
  managerLevel: "DM",
  canApprove: true,
  canSeeMoney: true,
  canEdit: true,
  projectIds: null,
});

async function managerView(user: User): Promise<AdminView | null> {
  const level = user.managerLevel as ManagerLevel;
  if (level !== "PM" && level !== "DM") return null;
  return {
    user,
    isAdmin: false,
    managerLevel: level,
    canApprove: level === "DM",
    canSeeMoney: level === "DM",
    canEdit: false,
    projectIds: await managerProjectIds(user.id),
  };
}

/** Dùng trong server action / route handler — trả null thay vì redirect. */
export async function currentAdminView(): Promise<AdminView | null> {
  const user = await currentUser();
  if (!user) return null;
  if (user.role === "ADMIN") return ADMIN_VIEW(user);
  return managerView(user);
}

/** Dùng trong page — chưa đăng nhập về /login, không có quyền về /timesheet. */
export async function requireAdminView(): Promise<AdminView> {
  const user = await requireUser();
  if (user.role === "ADMIN") return ADMIN_VIEW(user);
  const view = await managerView(user);
  if (!view) redirect("/timesheet");
  return view;
}

/** Project mà chính manager được assign vào. */
export async function managerProjectIds(userId: string): Promise<string[]> {
  const rows = await db.select({ projectId: projectAssignments.projectId })
    .from(projectAssignments).where(eq(projectAssignments.userId, userId));
  return [...new Set(rows.map((r) => r.projectId))];
}

/**
 * Member được coi là "thuộc" các project này: đang assign, có budget, hoặc
 * đã ghi giờ vào đó. Manager chỉ được xem đúng nhóm member này.
 */
export async function memberIdsForProjects(projectIds: string[]): Promise<string[]> {
  if (projectIds.length === 0) return [];
  const [assignRows, budgetRows, entryRows] = await Promise.all([
    db.select({ userId: projectAssignments.userId }).from(projectAssignments)
      .where(inArray(projectAssignments.projectId, projectIds))
      .groupBy(projectAssignments.userId),
    db.select({ userId: budgets.userId }).from(budgets)
      .where(inArray(budgets.projectId, projectIds))
      .groupBy(budgets.userId),
    db.select({ userId: timeEntries.userId }).from(timeEntries)
      .where(inArray(timeEntries.projectId, projectIds))
      .groupBy(timeEntries.userId),
  ]);
  return [...new Set([
    ...assignRows.map((r) => r.userId),
    ...budgetRows.map((r) => r.userId),
    ...entryRows.map((r) => r.userId),
  ])];
}

export function canViewProject(view: AdminView, projectId: string): boolean {
  return view.projectIds === null || view.projectIds.includes(projectId);
}

/** Giới hạn danh sách project theo quyền; admin giữ nguyên. */
export function scopeProjectIds(view: AdminView, requested: string[]): string[] {
  if (view.projectIds === null) return requested;
  if (requested.length === 0) return view.projectIds;
  return requested.filter((id) => view.projectIds!.includes(id));
}

export async function canViewMember(view: AdminView, userId: string): Promise<boolean> {
  if (view.projectIds === null) return true;
  if (userId === view.user.id) return true;
  const ids = await memberIdsForProjects(view.projectIds);
  return ids.includes(userId);
}
