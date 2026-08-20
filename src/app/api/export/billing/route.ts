import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { monthOverview } from "@/lib/adminData";
import { buildBillingWorkbook, billingFileName } from "@/lib/excel/billingReport";

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
  const scope = url.searchParams.get("scope") ?? "approved";

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "Thiếu hoặc sai tham số year/month" }, { status: 400 });
  }

  try {
    const rows = await monthOverview(year, month);
    const targets = rows.filter((r) => {
      const hasData = r.usedHours > 0 || r.attendanceHours > 0;
      if (!hasData) return false;
      return scope === "all" ? true : r.status === "APPROVED";
    });

    if (targets.length === 0) {
      return NextResponse.json(
        { error: scope === "all" ? "Không có thành viên nào có dữ liệu." : "Chưa có thành viên nào được chốt sổ." },
        { status: 404 },
      );
    }

    const buffer = buildBillingWorkbook(year, month, targets);
    const fileName = billingFileName(year, month);

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
