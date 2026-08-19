"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import {
  createSession, destroySession, hashPassword, verifyPassword, requireUser,
} from "@/lib/auth";

export interface FormState {
  error?: string;
  ok?: string;
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!username || !password) {
    return { error: "Vui lòng nhập tên đăng nhập và mật khẩu." };
  }

  const [user] = await db.select().from(users)
    .where(eq(users.username, username)).limit(1);

  // so sánh giả để thời gian phản hồi không tiết lộ username có tồn tại hay không
  const hash = user?.passwordHash ?? "$2a$11$" + "0".repeat(53);
  const valid = await verifyPassword(password, hash);

  if (!user || !valid) {
    return { error: "Tên đăng nhập hoặc mật khẩu không đúng." };
  }
  if (!user.isActive) {
    return { error: "Tài khoản đã bị vô hiệu hoá. Liên hệ quản trị viên." };
  }

  await createSession(user);
  await db.insert(auditLogs).values({
    actorId: user.id, action: "LOGIN", target: user.username,
  });

  if (user.mustChangePw) redirect("/change-password");
  redirect(next && next.startsWith("/") ? next : user.role === "ADMIN" ? "/admin" : "/timesheet");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!(await verifyPassword(current, user.passwordHash))) {
    return { error: "Mật khẩu hiện tại không đúng." };
  }
  if (next.length < 8) return { error: "Mật khẩu mới phải có ít nhất 8 ký tự." };
  if (!/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) {
    return { error: "Mật khẩu mới phải có cả chữ và số." };
  }
  if (next !== confirm) return { error: "Xác nhận mật khẩu không khớp." };
  if (next === current) return { error: "Mật khẩu mới phải khác mật khẩu hiện tại." };

  await db.update(users)
    .set({ passwordHash: await hashPassword(next), mustChangePw: false, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await db.insert(auditLogs).values({
    actorId: user.id, action: "CHANGE_PASSWORD", target: user.username,
  });

  redirect(user.role === "ADMIN" ? "/admin" : "/timesheet");
}
