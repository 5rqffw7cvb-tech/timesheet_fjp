import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { users, companies } from "@/db/schema";
import MemberTable from "./MemberTable";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  await requireAdmin();
  const [rows, companyRows] = await Promise.all([
    db.select().from(users).orderBy(asc(users.role), asc(users.fullName)),
    db.select().from(companies).orderBy(asc(companies.name)),
  ]);

  return (
    <MemberTable
      members={rows.map((u) => ({
        id: u.id, username: u.username, fullName: u.fullName,
        displayName: u.displayName, employeeCode: u.employeeCode,
        roleTitle: u.roleTitle, location: u.location, role: u.role,
        managerLevel: u.managerLevel,
        billingUnitPrice: Number(u.billingUnitPrice ?? 0),
        billingFactor: Number(u.billingFactor ?? 1),
        isActive: u.isActive, companyId: u.companyId, mustChangePw: u.mustChangePw,
      }))}
      companies={companyRows.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
