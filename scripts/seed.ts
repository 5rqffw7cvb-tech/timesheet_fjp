/**
 * Nạp dữ liệu master lấy từ file 週報 gốc + tạo tài khoản đăng nhập.
 * Chạy: npm run db:seed
 * Chạy lại nhiều lần được (idempotent) — không ghi đè mật khẩu đã đổi.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  companies, projects, workTypes, users, orgSettings,
} from "../src/db/schema";

interface Master {
  companies: { code: string; name: string; note: string | null }[];
  members: {
    employeeCode: string | null; companyName: string;
    roleTitle: string | null; fullName: string; location: string | null;
  }[];
  workTypes: { code: string; name: string; category: string; note: string | null }[];
  projects: {
    systemCode: string; systemName: string; code: string; name: string;
    startDate: string | null; endDate: string | null;
  }[];
  orgUnits: string[];
  workplace: string;
}

const master: Master = JSON.parse(
  readFileSync(resolve(process.cwd(), "seed/master.json"), "utf-8"),
);

/** "Nguyen Quoc Bao" -> "baonq" ; tên tiếng Nhật -> null */
function usernameFrom(fullName: string): string | null {
  const ascii = fullName
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^A-Za-z\s]/g, " ")
    .trim().split(/\s+/).filter(Boolean);
  if (ascii.length === 0) return null;
  const last = ascii[ascii.length - 1].toLowerCase();
  const initials = ascii.slice(0, -1).map((w) => w[0].toLowerCase()).join("");
  const u = (last + initials).replace(/[^a-z0-9]/g, "");
  return u.length >= 2 ? u : null;
}

/** "LE NHUT THIEN" -> "ThienLN" (dùng đặt tên file 週報) */
function displayNameFrom(fullName: string): string | null {
  const ascii = fullName
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z\s]/g, " ")
    .trim().split(/\s+/).filter(Boolean);
  if (ascii.length === 0) return null;
  const cap = (w: string) => w[0].toUpperCase() + w.slice(1).toLowerCase();
  const last = cap(ascii[ascii.length - 1]);
  const initials = ascii.slice(0, -1).map((w) => w[0].toUpperCase()).join("");
  return last + initials;
}

async function main() {
  const defaultPw = process.env.DEFAULT_MEMBER_PASSWORD || "Fpt@123456";
  const adminUser = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminPw = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";

  console.log("→ 会社名");
  for (const c of master.companies) {
    await db.insert(companies).values(c)
      .onConflictDoUpdate({ target: companies.code, set: { name: c.name } });
  }
  const companyRows = await db.select().from(companies);
  const companyByName = new Map(companyRows.map((c) => [c.name, c]));

  console.log("→ 工種 (%d)", master.workTypes.length);
  for (const [i, w] of master.workTypes.entries()) {
    await db.insert(workTypes).values({ ...w, sortOrder: i })
      .onConflictDoUpdate({
        target: workTypes.code,
        set: { name: w.name, note: w.note, category: w.category, sortOrder: i },
      });
  }

  console.log("→ PJ (%d)", master.projects.length);
  // 会社名/就業した業務 không có trong master.json -> giữ default của schema.
  // orgUnit/workplace chỉ áp cho project MỚI tạo (idempotent, không ghi đè
  // giá trị admin đã sửa riêng cho từng project).
  const orgUnit = master.orgUnits[1] ?? master.orgUnits[0] ?? "SI　開発部";
  for (const [i, p] of master.projects.entries()) {
    await db.insert(projects).values({ ...p, sortOrder: i, orgUnit, workplace: master.workplace })
      .onConflictDoUpdate({
        target: projects.code,
        set: { systemCode: p.systemCode, systemName: p.systemName, name: p.name },
      });
  }

  console.log("→ Cấu hình chung");
  await db.insert(orgSettings).values({ id: "default" }).onConflictDoNothing();

  console.log("→ Tài khoản");
  const created: { username: string; fullName: string; role: string }[] = [];

  const [existingAdmin] = await db.select().from(users)
    .where(eq(users.username, adminUser)).limit(1);
  if (!existingAdmin) {
    await db.insert(users).values({
      username: adminUser,
      passwordHash: await bcrypt.hash(adminPw, 11),
      fullName: "Quản trị viên",
      displayName: "Admin",
      role: "ADMIN",
      companyId: companyByName.get("FPTジャパン")?.id,
      mustChangePw: true,
    });
    created.push({ username: adminUser, fullName: "Quản trị viên", role: "ADMIN" });
  }

  const usedNames = new Set(
    (await db.select({ u: users.username }).from(users)).map((r) => r.u),
  );

  for (const [i, m] of master.members.entries()) {
    let username = usernameFrom(m.fullName) ?? `member${String(i + 1).padStart(2, "0")}`;
    if (usedNames.has(username)) {
      let n = 2;
      while (usedNames.has(`${username}${n}`)) n++;
      username = `${username}${n}`;
    }
    const [exists] = await db.select().from(users)
      .where(eq(users.fullName, m.fullName)).limit(1);
    if (exists) continue;

    usedNames.add(username);
    await db.insert(users).values({
      username,
      passwordHash: await bcrypt.hash(defaultPw, 11),
      fullName: m.fullName,
      displayName: displayNameFrom(m.fullName) ?? username,
      employeeCode: m.employeeCode,
      roleTitle: m.roleTitle,
      location: m.location,
      role: "MEMBER",
      companyId: companyByName.get(m.companyName)?.id,
      mustChangePw: true,
    });
    created.push({ username, fullName: m.fullName, role: "MEMBER" });
  }

  console.log("\n─────────── Tài khoản vừa tạo ───────────");
  if (created.length === 0) console.log("(không có — dữ liệu đã tồn tại)");
  for (const c of created) {
    const pw = c.role === "ADMIN" ? adminPw : defaultPw;
    console.log(`${c.role.padEnd(6)} ${c.username.padEnd(16)} ${pw.padEnd(14)} ${c.fullName}`);
  }
  console.log("─────────────────────────────────────────");
  console.log("Tất cả tài khoản đều bắt buộc đổi mật khẩu ở lần đăng nhập đầu.\n");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
