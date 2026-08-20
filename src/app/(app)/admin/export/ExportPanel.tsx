"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MonthNav from "@/components/MonthNav";
import StatusBadge from "@/components/StatusBadge";
import type { OverviewRow } from "@/lib/adminData";
import { calcBilling } from "@/lib/billing";

export default function ExportPanel({
  year, month, rows, workingDays, selectedPeriods, selectedProjectIds, projects,
}: {
  year: number;
  month: number;
  rows: OverviewRow[];
  workingDays: number;
  selectedPeriods: string[];
  selectedProjectIds: string[];
  projects: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [months, setMonths] = useState<string[]>(selectedPeriods.length ? selectedPeriods : [`${year}-${String(month).padStart(2, "0")}`]);
  const [projectIds, setProjectIds] = useState<string[]>(selectedProjectIds);

  const approved = rows.filter((r) => r.status === "APPROVED");
  const withData = rows.filter((r) => r.usedHours > 0 || r.attendanceHours > 0);
  const billing = withData.map((r) => ({
    member: r,
    calc: calcBilling({
      actualHours: r.usedHours,
      factor: r.billingFactor,
      unitPrice: r.billingUnitPrice,
    }),
  }));
  const totals = billing.reduce(
    (a, b) => ({
      amount: a.amount + b.calc.adjustmentAmount,
      under: a.under + (b.calc.band === "UNDER" ? 1 : 0),
      over: a.over + (b.calc.band === "OVER" ? 1 : 0),
    }),
    { amount: 0, under: 0, over: 0 },
  );

  const monthChoices = buildMonthChoices(year, month, 18);
  const isWeeklyCompatible = months.length === 1 && projectIds.length === 0;

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

  function applyFilters() {
    if (months.length === 0) {
      setMsg("Vui lòng chọn ít nhất 1 tháng.");
      return;
    }
    const qs = new URLSearchParams();
    qs.set("year", String(year));
    qs.set("month", String(month));
    qs.set("months", months.join(","));
    if (projectIds.length) qs.set("projects", projectIds.join(","));
    router.push(`/admin/export?${qs.toString()}`);
  }

  function billingUrl(scope: "all" | "approved") {
    const qs = new URLSearchParams();
    qs.set("scope", scope);
    qs.set("months", months.join(","));
    if (projectIds.length) qs.set("projectIds", projectIds.join(","));
    return `/api/export/billing?${qs.toString()}`;
  }

  function toggleMonth(v: string) {
    setMonths((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  }

  function toggleProject(id: string) {
    setProjectIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="mb-3 text-sm font-semibold text-slate-700">Điều kiện report</div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-medium text-slate-500">Chọn 1 hoặc nhiều tháng</div>
            <div className="grid max-h-44 grid-cols-2 gap-2 overflow-y-auto rounded-md border border-slate-200 p-2">
              {monthChoices.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={months.includes(m)} onChange={() => toggleMonth(m)} />
                  <span className="num">{m}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-slate-500">Filter dự án (bỏ trống = tất cả)</div>
            <div className="max-h-44 overflow-y-auto rounded-md border border-slate-200 p-2">
              <div className="space-y-1">
                {projects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={projectIds.includes(p.id)} onChange={() => toggleProject(p.id)} />
                    <span className="num text-slate-500">{p.code}</span>
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={applyFilters}>Áp dụng bộ lọc</button>
          <button
            className="btn-secondary"
            onClick={() => {
              setMonths([`${year}-${String(month).padStart(2, "0")}`]);
              setProjectIds([]);
            }}
          >
            Reset
          </button>
          <span className="text-xs text-slate-500">Đang xem: {months.length} tháng, {projectIds.length || "tất cả"} project</span>
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <MonthNav year={year} month={month} />
        <span className="text-sm text-slate-500">
          Đã chốt {approved.length}/{rows.length} · 所定日数 {workingDays}
        </span>
        <div className="ml-auto flex gap-2">
          <button className="btn-secondary" disabled={busy !== null || withData.length === 0}
                  onClick={() => download(billingUrl("all"), "billing-all")}>
            {busy === "billing-all" ? "Đang tạo…" : "Tải Billing (all)"}
          </button>
          <button className="btn-secondary" disabled={busy !== null || approved.length === 0}
                  onClick={() => download(billingUrl("approved"), "billing-approved")}>
            {busy === "billing-approved" ? "Đang tạo…" : "Tải Billing (approved)"}
          </button>
          <button className="btn-secondary" disabled={busy !== null || withData.length === 0 || !isWeeklyCompatible}
                  onClick={() => download(`/api/export?year=${year}&month=${month}&scope=all`, "all")}>
            {busy === "all" ? "Đang tạo…" : `Tải tất cả có dữ liệu (${withData.length})`}
          </button>
          <button className="btn-primary" disabled={busy !== null || approved.length === 0 || !isWeeklyCompatible}
                  onClick={() => download(`/api/export?year=${year}&month=${month}&scope=approved`, "zip")}>
            {busy === "zip" ? "Đang tạo…" : `Tải ZIP đã chốt (${approved.length})`}
          </button>
        </div>
      </div>

      {msg && (
        <div className="card border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{msg}</div>
      )}

      {!isWeeklyCompatible && (
        <div className="card border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Chế độ nhiều tháng hoặc có filter project chỉ áp dụng cho Billing report. Nút xuất 週報 tuần sẽ chỉ hoạt động khi chọn đúng 1 tháng và không lọc project.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Member có dữ liệu" value={String(withData.length)} />
        <Metric label="Dưới ngưỡng 140h*công số" value={String(totals.under)} tone={totals.under ? "warn" : "ok"} />
        <Metric label="Vượt ngưỡng 180h*công số" value={String(totals.over)} tone={totals.over ? "warn" : "ok"} />
        <Metric label="Tổng tiền điều chỉnh" value={totals.amount.toLocaleString("en-US")} />
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Dashboard điều chỉnh theo rule 140/180</h2>
          <span className="text-xs text-slate-400">adjustment = (max(0, hours-180*f) - max(0, 140*f-hours)) / 180 * đơn giá</span>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Member</th><th className="text-right">Giờ</th><th className="text-right">Công số</th>
              <th className="text-right">Lower</th><th className="text-right">Upper</th><th className="text-right">Giờ thiếu</th>
              <th className="text-right">Giờ vượt</th><th className="text-right">Đơn giá</th><th className="text-right">Điều chỉnh</th>
            </tr>
          </thead>
          <tbody>
            {billing.map(({ member, calc }) => (
              <tr key={member.userId}>
                <td>
                  <div className="font-medium text-slate-700">{member.fullName}</div>
                  <div className="text-xs text-slate-400">{member.displayName || member.username}</div>
                </td>
                <td className="text-right num">{member.usedHours.toFixed(2)}</td>
                <td className="text-right num">{member.billingFactor.toFixed(2)}</td>
                <td className="text-right num">{calc.lowerHours.toFixed(2)}</td>
                <td className="text-right num">{calc.upperHours.toFixed(2)}</td>
                <td className="text-right num">{calc.shortageHours.toFixed(2)}</td>
                <td className="text-right num">{calc.overtimeHours.toFixed(2)}</td>
                <td className="text-right num">{member.billingUnitPrice.toLocaleString("en-US")}</td>
                <td className={`text-right num font-medium ${calc.adjustmentAmount < 0 ? "text-rose-600" : calc.adjustmentAmount > 0 ? "text-emerald-600" : "text-slate-500"}`}>
                  {calc.adjustmentAmount.toLocaleString("en-US")}
                </td>
              </tr>
            ))}
            {billing.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-slate-400">Không có dữ liệu trong tháng này.</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
                    <button className="btn-secondary btn-sm" disabled={busy !== null || empty || !isWeeklyCompatible}
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

function Metric({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-xl font-semibold num ${tone === "warn" ? "text-amber-600" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function buildMonthChoices(year: number, month: number, count: number) {
  const out: string[] = [];
  const d = new Date(year, month - 1, 1);
  for (let i = 0; i < count; i++) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}
