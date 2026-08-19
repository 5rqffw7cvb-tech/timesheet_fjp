import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signSession, verifySession, type SessionPayload } from "./jwt";

export const SESSION_COOKIE = "ts_session";
const SESSION_DAYS = 7;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 11);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user: {
  id: string;
  username: string;
  role: "ADMIN" | "MEMBER";
  fullName: string;
}) {
  const token = await signSession({
    sub: user.id,
    username: user.username,
    role: user.role,
    name: user.fullName,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Lấy user hiện tại từ DB (đã kiểm tra còn active). */
export async function currentUser() {
  const session = await getSession();
  if (!session) return null;
  const [row] = await db.select().from(users).where(eq(users.id, session.sub)).limit(1);
  if (!row || !row.isActive) return null;
  return row;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/timesheet");
  return user;
}
