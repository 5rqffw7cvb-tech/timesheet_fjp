"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MonthNav from "@/components/MonthNav";
import StatusBadge from "@/components/StatusBadge";
import BudgetBar from "@/components/BudgetBar";
import { useLocale } from "@/components/LocaleProvider";
import { reviewReportAction, reopenReportAction, bulkApproveAction } from "@/actions/admin";
import type { OverviewRow } from "@/lib/adminData";
import type { MonthData } from "@/lib/period";
import { WEEKDAY_VI, minToHHMM } from "@/lib/dates";
import { sortRows, toggleSort, type SortState, containsText } from "@/lib/tableUi";

export default function ApprovalPanel({
  year, month, rows, selectedId, detail,
}: {
  year: number; month: number;
  rows: OverviewRow[];
  selectedId: string | null;
  detail: MonthData | null;
}) {
  const router = useRouter();
  const { t, locale } = useLocale();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "fullName", dir: "asc" });

  const filteredRows = sortRows(
    (q.trim()
      ? rows.filter((r) => [r.fullName, r.username, r.roleTitle, r.status, r.memberNote, r.reviewNote]
        .some((v) => containsText(v, q)))
      : rows),
    sort,
    (r) => {
      if (sort.key === "username") return r.username;
      if (sort.key === "roleTitle") return r.roleTitle ?? "";
      if (sort.key === "status") return r.status;
      if (sort.key === "usedHours") return r.usedHours;
      if (sort.key === "budgetHours") return r.budgetHours;
      return r.fullName;
    },
  );

  const selected = filteredRows.find((r) => r.userId === selectedId) ?? rows.find((r) => r.userId === selectedId) ?? null;
  const pending = filteredRows.filter((r) => r.status === "SUBMITTED");

  function select(userId: string) {
    router.push(`/admin/approvals?year=${year}&month=${month}&user=${userId}`);
  }

  function decide(decision: "APPROVED" | "REJECTED") {
    if (!selected) return;
    startTransition(async () => {
      const res = await reviewReportAction(selected.userId, year, month, decision, note);
      setMsg(res.ok ? (res.message ?? (locale === "ja" ? "処理しました。" : "Done.")) : res.error ?? (locale === "ja" ? "エラー" : "Error"));
      if (res.ok) { setNote(""); router.refresh(); }
    });
  }

  function reopen() {
    if (!selected) return;
    if (!confirm(locale === "ja" ? "この月を再編集可能にしますか？" : "Reopen this month for editing?")) return;
    startTransition(async () => {
      const res = await reopenReportAction(selected.userId, year, month, note);
      setMsg(res.ok ? (res.message ?? (locale === "ja" ? "再オープンしました。" : "Reopened.")) : res.error ?? (locale === "ja" ? "エラー" : "Error"));
      router.refresh();
    });
  }

  function approveChecked() {
    startTransition(async () => {
      const res = await bulkApproveAction(year, month, [...checked]);
      setMsg(res.ok ? (res.message ?? (locale === "ja" ? "処理しました。" : "Done.")) : res.error ?? (locale === "ja" ? "エラー" : "Error"));
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
            ? t("approvalWaiting", { count: pending.length })
            : t("approvalNoneWaiting")}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input className="input w-64" placeholder={t("approvalSearchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
          <button className="btn-success" disabled={busy || checked.size === 0}
                  onClick={approveChecked}>
            {locale === "ja" ? "一括締め" : "Approve"} {checked.size > 0 ? `(${checked.size})` : ""}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">{t("approvalMemberTitle")}</h2>
            <button className="btn-ghost btn-sm"
                    onClick={() => setChecked(new Set(pending.map((p) => p.userId)))}>
              {t("approvalSelectAll")}
            </button>
          </div>
          <div className="max-h-[640px] overflow-y-auto">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th><button onClick={() => setSort(toggleSort(sort, "fullName"))}>{t("membersTitle")}</button></th>
                  <th><button onClick={() => setSort(toggleSort(sort, "usedHours"))} className="text-right">{t("timesheetHours")}</button></th>
                  <th><button onClick={() => setSort(toggleSort(sort, "status"))}>{t("membersStatus")}</button></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.userId} className={r.userId === selectedId ? "bg-brand-50" : ""}>
                    <td>
                      <input type="checkbox" className="h-4 w-4 accent-brand-600"
                             disabled={r.status !== "SUBMITTED"}
                             checked={checked.has(r.userId)}
                             onChange={(e) => setChecked((s) => {
                               const n = new Set(s);
                               e.target.checked ? n.add(r.userId) : n.delete(r.userId);
                               return n;
                             })} />
                    </td>
                    <td>
                      <button className="text-left" onClick={() => select(r.userId)}>
                        <div className="font-medium text-slate-700">{r.fullName}</div>
                        <div className="text-xs text-slate-400">{r.username}</div>
                      </button>
                    </td>
                    <td className="text-right num">{r.usedHours.toFixed(1)}h / {r.budgetHours ? `${r.budgetHours.toFixed(1)}h` : "—"}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-slate-400">{t("noData")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          {!selected && (
            <div className="card p-8 text-center text-slate-400">{locale === "ja" ? "メンバーを選択すると詳細が表示されます。" : "Select a member to view details."}</div>
          )}

          {selected && (
            <>
              <div className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">{selected.fullName}</h2>
                    <p className="text-xs text-slate-400">
                      {selected.roleTitle ?? "—"} · {selected.username}
                      {selected.submittedAt && ` · ${locale === "ja" ? "提出" : "submitted"} ${new Date(selected.submittedAt).toLocaleString(locale === "ja" ? "ja-JP" : "en-US")}`}
                    </p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                <div className="grid gap-3 p-4 sm:grid-cols-4">
                    <Metric label={t("timesheetAttendance")} value={`${selected.attendanceHours.toFixed(1)}h`} />
                    <Metric label={t("timesheetHours")} value={`${selected.usedHours.toFixed(1)}h`} />
                    <Metric label={t("timesheetDiff")}
                          value={`${diff > 0 ? "+" : ""}${diff.toFixed(1)}h`}
                          tone={Math.abs(diff) > 0.01 ? "warn" : "ok"} />
                    <Metric label={locale === "ja" ? "稼働日数" : "Days"} value={String(selected.daysLogged)} />
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
                    <strong>{locale === "ja" ? "メンバー備考:" : "Member note:"}</strong> {selected.memberNote}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                  <input className="input flex-1" placeholder={t("approvalNotesPlaceholder")}
                         value={note} onChange={(e) => setNote(e.target.value)} />
                  {selected.status === "APPROVED" ? (
                    <button className="btn-secondary" onClick={reopen} disabled={busy}>{t("statusOpen")}</button>
                  ) : (
                    <>
                      <button className="btn-danger" onClick={() => decide("REJECTED")} disabled={busy}>
                        {t("statusRejected")}
                      </button>
                      <button className="btn-success" onClick={() => decide("APPROVED")} disabled={busy}>
                        {t("statusClosed")}
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
  const { t, locale } = useLocale();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "date", dir: "asc" });
  const days = sortRows(
    (q.trim()
      ? detail.days.filter((d) => [d.date, d.leaveNote, d.remark, d.holidayName, d.entries.map((e) => e.description).join(" ")]
        .some((v) => containsText(v, q)) && (d.entries.length > 0 || d.startMin != null))
      : detail.days.filter((d) => d.entries.length > 0 || d.startMin != null)),
    sort,
    (d) => {
      if (sort.key === "day") return d.day;
      if (sort.key === "attendanceHours") return d.attendanceHours;
      if (sort.key === "entryHours") return d.entryHours;
      return d.date;
    },
  );
  return (
    <div className="card overflow-hidden">
      <div className="card-header">
        <h2 className="card-title">{t("approvalDayDetail")}</h2>
        <span className="text-xs text-slate-400">{locale === "ja" ? `${days.length}日分のデータ` : `${days.length} days with data`}</span>
      </div>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <input className="input w-64" placeholder={t("dateSearchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="data">
          <thead>
            <tr>
              <th><button onClick={() => setSort(toggleSort(sort, "day"))}>{locale === "ja" ? "日付" : "Day"}</button></th>
              <th>{t("timesheetStart")}</th><th>{t("timesheetEnd")}</th><th className="text-right">{t("timesheetBreak")}</th>
              <th><button onClick={() => setSort(toggleSort(sort, "attendanceHours"))} className="text-right">{t("timesheetAttendance")}</button></th>
              <th>{t("timesheetWorkDetails")}</th>
              <th><button onClick={() => setSort(toggleSort(sort, "entryHours"))} className="text-right">{t("timesheetHours")}</button></th><th>{t("timesheetTypeLabel")}</th>
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
                          {e.description || <span className="text-slate-400">{locale === "ja" ? "(説明なし)" : "(no description)"}</span>}
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
            {days.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-slate-400">{t("noData")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
