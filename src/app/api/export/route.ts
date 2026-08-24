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
  const projectId = url.searchParams.get("project") || undefined;
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
      const result = await buildMemberReport(userId, year, month, projectId);
      if (!result.ok) {
        if (result.needsProjectSelection) {
          return NextResponse.json(
            { needsProjectSelection: true, projects: result.projects },
            { status: 409 },
          );
        }
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      const { outcome } = result;
      return new NextResponse(new Uint8Array(outcome.buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": contentDisposition(outcome.fileName),
          "X-Export-Warnings": encodeURIComponent(JSON.stringify(outcome.warnings)),
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

    // Member có nhiều project trong tháng -> tách thành 1 file/project (đã hỏi
    // trước qua popup ở export đơn lẻ; ở đây xuất hàng loạt nên tự tách hết).
    const files: Record<string, Uint8Array> = {};
    for (const t of targets) {
      const first = await buildMemberReport(t.userId, year, month);
      if (first.ok) {
        files[first.outcome.fileName] = first.outcome.buffer;
        continue;
      }
      if (!first.needsProjectSelection) continue;
      for (const p of first.projects) {
        const perProject = await buildMemberReport(t.userId, year, month, p.id);
        if (perProject.ok) files[perProject.outcome.fileName] = perProject.outcome.buffer;
      }
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
