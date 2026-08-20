import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { monthOverviewForPeriods } from "@/lib/adminData";
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
  await requireAdmin();

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
    return NextResponse.json({ error: "Thiếu hoặc sai tham số tháng. Dùng year/month hoặc months=YYYY-MM,YYYY-MM" }, { status: 400 });
  }

  const projectIds = projectIdsRaw
    ? projectIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  try {
    const rows = await monthOverviewForPeriods(
      periods,
      projectIds,
      scope === "all" ? "all" : "approved",
    );
    const targets = rows.filter((r) => {
      const hasData = r.usedHours > 0 || r.attendanceHours > 0;
      if (!hasData) return false;
      return true;
    });

    if (targets.length === 0) {
      return NextResponse.json(
        { error: scope === "all" ? "Không có thành viên nào có dữ liệu." : "Chưa có thành viên nào được chốt sổ." },
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
    const buffer = buildBillingWorkbookWithLabel(label, targets, currency);
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
