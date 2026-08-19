"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MonthNav from "@/components/MonthNav";
import StatusBadge from "@/components/StatusBadge";
import BudgetBar from "@/components/BudgetBar";
import { reviewReportAction, reopenReportAction, bulkApproveAction } from "@/actions/admin";
import type { OverviewRow } from "@/lib/adminData";
import type { MonthData } from "@/lib/period";
import { WEEKDAY_VI, minToHHMM } from "@/lib/dates";

export default function ApprovalPanel({
  year, month, rows, selectedId, detail,
}: {
  year: number; month: number;
  rows: OverviewRow[];
  selectedId: string | null;
  detail: MonthData | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const selected = rows.find((r) => r.userId === selectedId) ?? null;
  const pending = rows.filter((r) => r.status === "SUBMITTED");

  function select(userId: string) {
    router.push(`/admin/approvals?year=${year}&month=${month}&user=${userId}`);
  }

  function decide(decision: "APPROVED" | "REJECTED") {
    if (!selected) return;
    startTransition(async () => {
      const res = await reviewReportAction(selected.userId, year, month, decision, note);
      setMsg(res.ok ? res.message ?? "Xong" : res.error ?? "Lỗi");
      if (res.ok) { setNote(""); router.refresh(); }
    });
  }

  function reopen() {
    if (!selected) return;
    if (!confirm("Mở lại tháng này để member sửa?")) return;
    startTransition(async () => {
      const res = await reopenReportAction(selected.userId, year, month, note);
      setMsg(res.ok ? res.message ?? "Đã mở lại" : res.error ?? "Lỗi");
      router.refresh();
    });
  }

  function approveChecked() {
    startTransition(async () => {
      const res = await bulkApproveAction(year, month, [...checked]);
      setMsg(res.ok ? res.message ?? "Xong" : res.error ?? "Lỗi");
      setChecked(new Set());
      router.refresh();
    });
  }

  const diff = selected
    ? Math.round((selected.usedHours - selected.attendanceHours) * 100) / 100
    : 0;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <MonthNav year={year} month={month} />
        <span className="text-sm text-slate-500">
          {pending.length > 0
            ? `${pending.length} thành viên đang chờ duyệt`
            : "Không có ai chờ duyệt"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
          <button className="btn-success" disabled={busy || checked.size === 0}
                  onClick={approveChecked}>
            Chốt {checked.size > 0 ? `${checked.size} mục đã chọn` : "hàng loạt"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">Thành viên</h2>
            <button className="btn-ghost btn-sm"
                    onClick={() => setChecked(new Set(pending.map((p) => p.userId)))}>
              Chọn hết đang chờ
            </button>
          </div>
          <div className="max-h-[640px] overflow-y-auto">
            {rows.map((r) => (
              <div key={r.userId}
                   className={`flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm
                     ${r.userId === selectedId ? "bg-brand-50" : "hover:bg-slate-50"}`}>
                <input type="checkbox" className="h-4 w-4 accent-brand-600"
                       disabled={r.status !== "SUBMITTED"}
                       checked={checked.has(r.userId)}
                       onChange={(e) => setChecked((s) => {
                         const n = new Set(s);
                         e.target.checked ? n.add(r.userId) : n.delete(r.userId);
                         return n;
                       })} />
                <button className="flex-1 text-left" onClick={() => select(r.userId)}>
                  <div className="font-medium text-slate-700">{r.fullName}</div>
                  <div className="text-xs text-slate-400 num">
                    {r.usedHours.toFixed(1)}h / {r.budgetHours ? `${r.budgetHours.toFixed(1)}h` : "—"}
                  </div>
                </button>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {!selected && (
            <div className="card p-8 text-center text-slate-400">Chọn một thành viên để xem chi tiết.</div>
          )}

          {selected && (
            <>
              <div className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">{selected.fullName}</h2>
                    <p className="text-xs text-slate-400">
                      {selected.roleTitle ?? "—"} · {selected.username}
                      {selected.submittedAt && ` · nộp lúc ${new Date(selected.submittedAt).toLocaleString("vi-VN")}`}
                    </p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                <div className="grid gap-3 p-4 sm:grid-cols-4">
                  <Metric label="就業時間 (giờ vào/ra)" value={`${selected.attendanceHours.toFixed(1)}h`} />
                  <Metric label="Giờ chi tiết công việc" value={`${selected.usedHours.toFixed(1)}h`} />
                  <Metric label="Chênh lệch"
                          value={`${diff > 0 ? "+" : ""}${diff.toFixed(1)}h`}
                          tone={Math.abs(diff) > 0.01 ? "warn" : "ok"} />
                  <Metric label="Số ngày có công" value={String(selected.daysLogged)} />
                </div>

                <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {selected.byProject.map((p) => (
                    <div key={p.projectId}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="truncate text-slate-600">{p.name}</span>
                        <span className="num text-slate-400">{p.code}</span>
                      </div>
                      <BudgetBar used={p.used} budget={p.budget} />
                    </div>
                  ))}
                </div>

                {selected.memberNote && (
                  <div className="border-t border-slate-100 px-4 py-2 text-sm text-slate-600">
                    <strong>Ghi chú của member:</strong> {selected.memberNote}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                  <input className="input flex-1" placeholder="Nhận xét / lý do trả lại"
                         value={note} onChange={(e) => setNote(e.target.value)} />
                  {selected.status === "APPROVED" ? (
                    <button className="btn-secondary" onClick={reopen} disabled={busy}>Mở lại để sửa</button>
                  ) : (
                    <>
                      <button className="btn-danger" onClick={() => decide("REJECTED")} disabled={busy}>
                        Trả lại
                      </button>
                      <button className="btn-success" onClick={() => decide("APPROVED")} disabled={busy}>
                        Chốt sổ
                      </button>
                    </>
                  )}
                </div>
              </div>

              {detail && <DayTable detail={detail} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold num ${
        tone === "warn" ? "text-amber-600" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function DayTable({ detail }: { detail: MonthData }) {
  const days = detail.days.filter((d) => d.entries.length > 0 || d.startMin != null);
  return (
    <div className="card overflow-hidden">
      <div className="card-header">
        <h2 className="card-title">Chi tiết từng ngày</h2>
        <span className="text-xs text-slate-400">{days.length} ngày có dữ liệu</span>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Ngày</th><th>始業</th><th>終業</th><th className="text-right">休憩</th>
              <th className="text-right">就業</th><th>Công việc</th>
              <th className="text-right">Giờ</th><th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const diff = Math.round((d.entryHours - d.attendanceHours) * 100) / 100;
              return (
                <tr key={d.date} className={d.isWeekend ? "bg-slate-50/70" : ""}>
                  <td className="whitespace-nowrap num">
                    {String(d.day).padStart(2, "0")} <span className="text-slate-400">{WEEKDAY_VI[d.weekday]}</span>
                  </td>
                  <td className="num">{minToHHMM(d.startMin) || "—"}</td>
                  <td className="num">{minToHHMM(d.endMin) || "—"}</td>
                  <td className="text-right num">{d.startMin != null ? `${d.breakMin}′` : "—"}</td>
                  <td className="text-right num">{d.attendanceHours ? d.attendanceHours.toFixed(2) : "—"}</td>
                  <td>
                    <div className="space-y-0.5">
                      {d.entries.map((e) => (
                        <div key={e.id} className="text-xs text-slate-600">
                          {e.description || <span className="text-slate-400">(không mô tả)</span>}
                          {e.isPlan && <span className="ml-1 text-brand-500">[予定]</span>}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className={`text-right num ${Math.abs(diff) > 0.01 ? "text-amber-600" : ""}`}>
                    {d.entryHours ? d.entryHours.toFixed(2) : "—"}
                  </td>
                  <td className="text-xs text-slate-500">{d.leaveNote ?? d.remark ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
