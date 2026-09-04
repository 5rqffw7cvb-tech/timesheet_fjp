import { NextResponse } from "next/server";
import { currentAdminView, memberIdsForProjects, scopeProjectIds } from "@/lib/access";
import { monthOverviewByPeriod } from "@/lib/adminData";
import { buildBillingWorkbookWithLabel, billingFileName } from "@/lib/excel/billingReport";
import { db } from "@/db";
import { orgSettings } from "@/db/schema";
import { normalizeBillingCurrency } from "@/lib/currency";

export const dynamic = "force-dynamic";

function contentDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(req: Request) {
  // Billing = dữ liệu tiền -> chỉ admin và DM; PM không được tải.
  const view = await currentAdminView();
  if (!view?.canSeeMoney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  const monthsRaw = (url.searchParams.get("months") ?? "").trim();
  const projectIdsRaw = (url.searchParams.get("projectIds") ?? "").trim();
  const scope = url.searchParams.get("scope") ?? "approved";

  const periods = monthsRaw
    ? monthsRaw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
        const m = /^(\d{4})-(\d{2})$/.exec(s);
        if (!m) return null;
        return { year: Number(m[1]), month: Number(m[2]) };
      }).filter((x): x is { year: number; month: number } => !!x && x.month >= 1 && x.month <= 12)
    : (year && month && month >= 1 && month <= 12 ? [{ year, month }] : []);

  if (periods.length === 0) {
    return NextResponse.json({ error: "Missing or invalid month parameters. Use year/month or months=YYYY-MM,YYYY-MM" }, { status: 400 });
  }

  const projectIds = scopeProjectIds(
    view,
    projectIdsRaw ? projectIdsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [],
  );

  try {
    const rawPeriods = await monthOverviewByPeriod(
      periods,
      projectIds,
      scope === "all" ? "all" : "approved",
    );
    // DM chỉ được xuất member thuộc project mình phụ trách.
    const allowedIds = view.projectIds ? await memberIdsForProjects(view.projectIds) : null;
    const periodsData = allowedIds === null
      ? rawPeriods
      : rawPeriods.map((p) => ({ ...p, rows: p.rows.filter((r) => allowedIds.includes(r.userId)) }));
    const hasAnyData = periodsData.some((p) => p.rows.some((r) => r.usedHours > 0 || r.attendanceHours > 0));

    if (!hasAnyData) {
      return NextResponse.json(
        { error: scope === "all" ? "No members have data." : "No members have been approved." },
        { status: 404 },
      );
    }

    const sorted = [...periods].sort((a, b) => (a.year - b.year) || (a.month - b.month));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const label = sorted.length === 1
      ? `${first.year}年${String(first.month).padStart(2, "0")}月`
      : `${first.year}年${String(first.month).padStart(2, "0")}月_${last.year}年${String(last.month).padStart(2, "0")}月`;

    const [org] = await db.select().from(orgSettings).limit(1);
    const currency = normalizeBillingCurrency(org?.billingCurrency);
    const buffer = await buildBillingWorkbookWithLabel(label, periodsData, currency);
    const fileName = billingFileName(first.year, first.month).replace(
      `${first.year}年${String(first.month).padStart(2, "0")}月`,
      label,
    );

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition(fileName),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
