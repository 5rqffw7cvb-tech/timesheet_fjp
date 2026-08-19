import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { users, companies, projects, projectAssignments } from "@/db/schema";
import MemberTable from "./MemberTable";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  await requireAdmin();
  const [rows, companyRows, projectRows, assignmentRows] = await Promise.all([
    db.select().from(users).orderBy(asc(users.role), asc(users.fullName)),
    db.select().from(companies).orderBy(asc(companies.name)),
    db.select().from(projects).where(eq(projects.isActive, true)).orderBy(asc(projects.sortOrder), asc(projects.code)),
    db.select().from(projectAssignments),
  ]);

  const assignedByUser: Record<string, string[]> = {};
  for (const row of assignmentRows) {
    assignedByUser[row.userId] = [...(assignedByUser[row.userId] ?? []), row.projectId];
  }

  return (
    <MemberTable
      members={rows.map((u) => ({
        id: u.id, username: u.username, fullName: u.fullName,
        displayName: u.displayName, employeeCode: u.employeeCode,
        roleTitle: u.roleTitle, location: u.location, role: u.role,
        isActive: u.isActive, companyId: u.companyId, mustChangePw: u.mustChangePw,
      }))}
      companies={companyRows.map((c) => ({ id: c.id, name: c.name }))}
      projects={projectRows.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
      assignedProjectIdsByUser={assignedByUser}
    />
  );
}
