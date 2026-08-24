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
    return { error: "Please enter your username and password." };
  }

  const [user] = await db.select().from(users)
    .where(eq(users.username, username)).limit(1);

  // so sánh giả để thời gian phản hồi không tiết lộ username có tồn tại hay không
  const hash = user?.passwordHash ?? "$2a$11$" + "0".repeat(53);
  const valid = await verifyPassword(password, hash);

  if (!user || !valid) {
    return { error: "Incorrect username or password." };
  }
  if (!user.isActive) {
    return { error: "This account has been disabled. Contact an administrator." };
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
    return { error: "The current password is incorrect." };
  }
  if (next.length < 8) return { error: "The new password must be at least 8 characters." };
  if (!/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) {
    return { error: "The new password must contain letters and numbers." };
  }
  if (next !== confirm) return { error: "Password confirmation does not match." };
  if (next === current) return { error: "The new password must differ from the current password." };

  await db.update(users)
    .set({ passwordHash: await hashPassword(next), mustChangePw: false, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await db.insert(auditLogs).values({
    actorId: user.id, action: "CHANGE_PASSWORD", target: user.username,
  });

  redirect(user.role === "ADMIN" ? "/admin" : "/timesheet");
}
