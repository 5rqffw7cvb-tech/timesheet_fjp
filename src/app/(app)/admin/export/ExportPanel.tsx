"use client";

import { useState } from "react";
import MonthNav from "@/components/MonthNav";
import StatusBadge from "@/components/StatusBadge";
import type { OverviewRow } from "@/lib/adminData";

export default function ExportPanel({
  year, month, rows, workingDays,
}: {
  year: number; month: number; rows: OverviewRow[]; workingDays: number;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const approved = rows.filter((r) => r.status === "APPROVED");
  const withData = rows.filter((r) => r.usedHours > 0 || r.attendanceHours > 0);

  async function download(url: string, key: string) {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "Lỗi không xác định" }));
        setMsg(j.error ?? "Xuất file thất bại");
        return;
      }
      const warnHeader = res.headers.get("X-Export-Warnings");
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const m = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const name = m ? decodeURIComponent(m[1]) : "export.xlsx";
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);

      if (warnHeader) {
        const warnings: string[] = JSON.parse(decodeURIComponent(warnHeader));
        if (warnings.length) setMsg("Cảnh báo: " + warnings.join(" · "));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <MonthNav year={year} month={month} />
        <span className="text-sm text-slate-500">
          Đã chốt {approved.length}/{rows.length} · 所定日数 {workingDays}
        </span>
        <div className="ml-auto flex gap-2">
          <button className="btn-secondary" disabled={busy !== null || withData.length === 0}
                  onClick={() => download(`/api/export?year=${year}&month=${month}&scope=all`, "all")}>
            {busy === "all" ? "Đang tạo…" : `Tải tất cả có dữ liệu (${withData.length})`}
          </button>
          <button className="btn-primary" disabled={busy !== null || approved.length === 0}
                  onClick={() => download(`/api/export?year=${year}&month=${month}&scope=approved`, "zip")}>
            {busy === "zip" ? "Đang tạo…" : `Tải ZIP đã chốt (${approved.length})`}
          </button>
        </div>
      </div>

      {msg && (
        <div className="card border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{msg}</div>
      )}

      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Danh sách file sẽ xuất</h2>
          <span className="text-xs text-slate-400">
            Mỗi file dùng đúng template 週報 gốc — mở bằng Excel là ra 月間集計 và 勤務報告書
          </span>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Thành viên</th><th>Tên file</th>
              <th className="text-right">Giờ</th><th className="text-right">就業時間</th>
              <th>Trạng thái</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const fileName = `週報_FPTジャパン_${r.displayName || r.username}_${year}年${String(month).padStart(2, "0")}月.xlsx`;
              const empty = r.usedHours === 0 && r.attendanceHours === 0;
              return (
                <tr key={r.userId} className={empty ? "opacity-50" : ""}>
                  <td className="font-medium text-slate-700">{r.fullName}</td>
                  <td className="text-xs text-slate-500">{fileName}</td>
                  <td className="text-right num">{r.usedHours ? r.usedHours.toFixed(1) : "—"}</td>
                  <td className="text-right num">{r.attendanceHours ? r.attendanceHours.toFixed(1) : "—"}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="text-right">
                    <button className="btn-secondary btn-sm" disabled={busy !== null || empty}
                            onClick={() => download(`/api/export?year=${year}&month=${month}&user=${r.userId}`, r.userId)}>
                      {busy === r.userId ? "…" : "Tải file"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card p-4 text-sm text-slate-600">
        <h3 className="mb-2 font-semibold text-slate-700">Lưu ý khi gửi cho khách hàng</h3>
        <ul className="list-inside list-disc space-y-1 text-slate-600">
          <li>File xuất ra giữ nguyên 100% format của template gốc: 6 sheet tuần, 月間集計シート, 勤務報告書 và các sheet master.</li>
          <li>App chỉ ghi vào ô nhập của 6 sheet tuần; 月間集計 và 勤務報告書 vẫn là công thức và tự tính khi mở bằng Excel.</li>
          <li>Ô <span className="num">月間集計シート!X4</span> (所定日数) lấy từ mục Cấu hình. Kiểm tra lại trước khi gửi.</li>
          <li>Mỗi sheet tuần chứa tối đa 20 dòng công việc. Nếu một tuần có nhiều hơn 20 tổ hợp project × 工種, app sẽ báo cảnh báo khi xuất.</li>
        </ul>
      </div>
    </div>
  );
}
