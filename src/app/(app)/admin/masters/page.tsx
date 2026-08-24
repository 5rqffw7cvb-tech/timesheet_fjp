import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { projects, workTypes } from "@/db/schema";
import MastersPanel from "./MastersPanel";

export const dynamic = "force-dynamic";

export default async function MastersPage() {
  await requireAdmin();
  const [projectRows, workTypeRows] = await Promise.all([
    db.select().from(projects).orderBy(asc(projects.sortOrder), asc(projects.code)),
    db.select().from(workTypes).orderBy(asc(workTypes.sortOrder), asc(workTypes.code)),
  ]);
  return (
    <MastersPanel
      projects={projectRows.map((p) => ({
        id: p.id, systemCode: p.systemCode, systemName: p.systemName,
        code: p.code, name: p.name, isActive: p.isActive,
        clientCompany: p.clientCompany, orgUnit: p.orgUnit,
        workplace: p.workplace, workName: p.workName,
      }))}
      workTypes={workTypeRows.map((w) => ({
        id: w.id, code: w.code, name: w.name,
        category: w.category, note: w.note ?? "", isActive: w.isActive,
      }))}
    />
  );
}
