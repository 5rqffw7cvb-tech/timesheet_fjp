import { NextResponse } from "next/server";
import { zipSync } from "fflate";
import { requireAdmin, currentUser } from "@/lib/auth";
import { buildMemberReport } from "@/lib/excel/exportData";
import { monthOverview } from "@/lib/adminData";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Tên file có ký tự tiếng Nhật -> cần RFC 5987 để trình duyệt nhận đúng. */
function contentDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  const userId = url.searchParams.get("user");
  const scope = url.searchParams.get("scope") ?? "approved";

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "Missing or invalid year/month parameters" }, { status: 400 });
  }

  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // member chỉ được tải file của chính mình
  if (me.role !== "ADMIN" && userId !== me.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    if (userId) {
      const out = await buildMemberReport(userId, year, month);
      return new NextResponse(new Uint8Array(out.buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": contentDisposition(out.fileName),
          "X-Export-Warnings": encodeURIComponent(JSON.stringify(out.warnings)),
        },
      });
    }

    await requireAdmin();
    const rows = await monthOverview(year, month);
    const targets = rows.filter((r) =>
      scope === "all" ? r.usedHours > 0 || r.attendanceHours > 0 : r.status === "APPROVED",
    );
    if (targets.length === 0) {
      return NextResponse.json(
        { error: scope === "all" ? "No members have data." : "No members have been approved." },
        { status: 404 },
      );
    }

    const files: Record<string, Uint8Array> = {};
    for (const t of targets) {
      const out = await buildMemberReport(t.userId, year, month);
      files[out.fileName] = out.buffer;
    }
    const zip = zipSync(files, { level: 6 });
    const zipName = `週報_${year}年${String(month).padStart(2, "0")}月.zip`;
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition(zipName),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
