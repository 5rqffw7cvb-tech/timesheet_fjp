"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { Project, WorkType } from "@/db/schema";
import type { MonthData, DayData, EntryData } from "@/lib/period";
import { WEEKDAY_VI, WEEKDAY_JA, todayParts, ymd, workedHours } from "@/lib/dates";
import {
  saveDayAction, copyDayAction, clearDayAction,
  submitMonthAction, withdrawMonthAction, fillWorkdaysAction,
} from "@/actions/timesheet";
import DayEditor, { type DayDraft, type DraftEntry } from "./DayEditor";
import BudgetBar from "@/components/BudgetBar";
import StatusBadge from "@/components/StatusBadge";
import MonthNav from "@/components/MonthNav";
import { useLocale } from "@/components/LocaleProvider";

/**
 * DB lưu 実績 và 予定 thành 2 bản ghi time_entries riêng (isPlan khác nhau).
 * Gộp lại thành 1 dòng draft cho mỗi cặp project × 工種 × nội dung trùng nhau
 * (ghép theo thứ tự xuất hiện — không gộp nhầm 2 dòng thực tế trùng nhau).
 */
function toDraft(day: DayData): DayDraft {
  const buckets = new Map<string, { actual: EntryData[]; plan: EntryData[] }>();
  for (const e of day.entries) {
    const key = `${e.projectId}|${e.workTypeId}|${e.description}`;
    const b = buckets.get(key) ?? { actual: [], plan: [] };
    (e.isPlan ? b.plan : b.actual).push(e);
    buckets.set(key, b);
  }
  const entries: DraftEntry[] = [];
  for (const b of buckets.values()) {
    const n = Math.max(b.actual.length, b.plan.length);
    for (let i = 0; i < n; i++) {
      const a = b.actual[i];
      const p = b.plan[i];
      const base = (a ?? p)!;
      entries.push({
        key: base.id,
        projectId: base.projectId,
        workTypeId: base.workTypeId,
        description: base.description,
        actualHours: a?.hours ?? 0,
        planHours: p?.hours ?? 0,
      });
    }
  }
  return {
    startMin: day.startMin,
    endMin: day.endMin,
    breakMin: day.breakMin,
    dayType: day.dayType,
    leaveNote: day.leaveNote,
    remark: day.remark,
    entries,
  };
}

export default function TimesheetEditor({
  data, projects, workTypes,
}: {
  data: MonthData;
  projects: Project[];
  workTypes: WorkType[];
}) {
  const readOnly = data.locked;
  const { t, locale } = useLocale();
  const today = todayParts();

  const initialDay = useMemo(() => {
    if (today.year === data.year && today.month === data.month) return today.day;
    const firstWithout = data.days.find((d) => !d.isWeekend && d.entries.length === 0);
    return firstWithout?.day ?? 1;
  }, [data.year, data.month, data.days, today.year, today.month, today.day]);

  const [selected, setSelected] = useState(initialDay);
  const [drafts, setDrafts] = useState<Record<number, DayDraft>>(() =>
    Object.fromEntries(data.days.map((d) => [d.day, toDraft(d)])),
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setDrafts(Object.fromEntries(data.days.map((d) => [d.day, toDraft(d)])));
  }, [data.days]);

  const persist = useCallback(async (dayNum: number, draft: DayDraft) => {
    setSaveState("saving");
    const res = await saveDayAction({
      day: {
        date: ymd(data.year, data.month, dayNum),
        startMin: draft.startMin,
        endMin: draft.endMin,
        breakMin: draft.breakMin,
        dayType: draft.dayType,
        leaveNote: draft.leaveNote,
        remark: draft.remark,
      },
      // mỗi dòng draft có cả 実績 và 予定 -> tách lại thành tối đa 2 bản ghi
      // time_entries (isPlan khác nhau) đúng như DB đang lưu.
      entries: draft.entries
        .filter((e) => e.projectId && e.workTypeId)
        .flatMap((e) => {
          const rows: { projectId: string; workTypeId: string; description: string; hours: number; isPlan: boolean }[] = [];
          if (e.actualHours > 0) {
            rows.push({ projectId: e.projectId, workTypeId: e.workTypeId, description: e.description, hours: e.actualHours, isPlan: false });
          }
          if (e.planHours > 0) {
            rows.push({ projectId: e.projectId, workTypeId: e.workTypeId, description: e.description, hours: e.planHours, isPlan: true });
          }
          return rows;
        }),
    });
    if (res.ok) {
      setSaveState("saved");
      setErrorMsg(null);
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1600);
    } else {
      setSaveState("error");
      setErrorMsg(res.error ?? (locale === "ja" ? "保存に失敗しました。" : "Save failed"));
    }
  }, [data.year, data.month]);

  function handleChange(next: DayDraft) {
    setDrafts((prev) => ({ ...prev, [selected]: next }));
  }

  async function handleSave() {
    if (readOnly) return;
    await persist(selected, draft);
  }

  async function flushPending() {
    return;
  }

  async function selectDay(dayNum: number) {
    setSelected(dayNum);
  }

  const dayData = data.days.find((d) => d.day === selected)!;
  const draft = drafts[selected] ?? toDraft(dayData);

  const liveTotals = useMemo(() => {
    const byProject = new Map<string, number>();
    let total = 0;
    for (const [, d] of Object.entries(drafts)) {
      for (const e of d.entries) {
        total += e.actualHours;
        byProject.set(e.projectId, (byProject.get(e.projectId) ?? 0) + e.actualHours);
      }
    }
    return { total: Math.round(total * 100) / 100, byProject };
  }, [drafts]);

  const budgetRows = useMemo(() => {
    const rows = data.budgets.map((b) => ({
      ...b, usedHours: Math.round((liveTotals.byProject.get(b.projectId) ?? 0) * 100) / 100,
    }));
    for (const [pid, used] of liveTotals.byProject) {
      if (!rows.some((r) => r.projectId === pid)) {
        const p = projects.find((x) => x.id === pid);
        rows.push({
          projectId: pid,
          projectCode: p?.code ?? "?",
          projectName: p?.name ?? (locale === "ja" ? "(不明)" : "(unknown)"),
          budgetHours: 0,
          usedHours: Math.round(used * 100) / 100,
        });
      }
    }
    return rows;
  }, [data.budgets, liveTotals, projects]);

  async function handleCopyPrev() {
    const prev = [...data.days].reverse().find(
      (d) => d.day < selected && (d.entries.length > 0 || d.startMin != null),
    );
    if (!prev) return;
    await flushPending();
    startTransition(async () => {
      const res = await copyDayAction(prev.date, ymd(data.year, data.month, selected));
      if (!res.ok) { setSaveState("error"); setErrorMsg(res.error ?? null); }
    });
  }

  async function handleClear() {
    if (!confirm(locale === "ja" ? "この日のデータをすべて削除しますか？" : "Delete all data for this day?")) return;
    setDrafts((p) => ({
      ...p,
      [selected]: { startMin: null, endMin: null, breakMin: 60, dayType: "WORK", leaveNote: null, remark: null, entries: [] },
    }));
    startTransition(async () => {
      await clearDayAction(ymd(data.year, data.month, selected));
    });
  }

  const canCopyPrev = data.days.some(
    (d) => d.day < selected && (d.entries.length > 0 || d.startMin != null),
  );

  return (
    <div className="space-y-4">
      <Toolbar
        data={data}
        liveTotal={liveTotals.total}
        saveState={saveState}
        errorMsg={errorMsg}
        onBeforeAction={flushPending}
      />

      <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        <DayList
          data={data}
          drafts={drafts}
          selected={selected}
          onSelect={selectDay}
        />
        <DayEditor
          day={dayData}
          draft={draft}
          projects={projects}
          workTypes={workTypes}
          readOnly={readOnly}
          onChange={handleChange}
          onSave={handleSave}
          onClear={handleClear}
          onCopyPrev={handleCopyPrev}
          canCopyPrev={canCopyPrev}
        />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{locale === "ja" ? "プロジェクト別予算" : "Project budget"} — {data.year}年{String(data.month).padStart(2, "0")}月</h2>
          <span className="text-xs text-slate-500 num">
            {locale === "ja" ? "合計" : "Total"} {liveTotals.total.toFixed(1)}h / {data.totalBudget.toFixed(1)}h
          </span>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {budgetRows.length === 0 && (
            <p className="text-sm text-slate-400">
              {locale === "ja" ? "この月の予算はまだ設定されていません。" : "No budget has been set for this month."}
            </p>
          )}
          {budgetRows.map((b) => (
            <div key={b.projectId} className="rounded-md border border-slate-200 p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-slate-700" title={b.projectName}>
                  {b.projectName}
                </span>
                <span className="shrink-0 text-xs text-slate-400 num">{b.projectCode}</span>
              </div>
              <BudgetBar used={b.usedHours} budget={b.budgetHours} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Toolbar ─────────────────────────── */

function Toolbar({
  data, liveTotal, saveState, errorMsg, onBeforeAction,
}: {
  data: MonthData;
  liveTotal: number;
  saveState: string;
  errorMsg: string | null;
  onBeforeAction: () => Promise<void>;
}) {
  const { t, locale } = useLocale();
  const [note, setNote] = useState(data.report.memberNote ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showFill, setShowFill] = useState(false);

  async function submit() {
    if (!confirm(locale === "ja" ? "この月を管理者へ提出しますか？提出後は取り消すまで編集できません。" : "Submit this month to management? After submission you can't edit until you withdraw it.")) return;
    setBusy(true);
    await onBeforeAction();
    const res = await submitMonthAction(data.year, data.month, note);
    setBusy(false);
    setMsg(res.ok ? (locale === "ja" ? "提出しました。" : "Submitted.") : res.error ?? (locale === "ja" ? "エラー" : "Error"));
  }

  async function withdraw() {
    setBusy(true);
    const res = await withdrawMonthAction(data.year, data.month);
    setBusy(false);
    setMsg(res.ok ? (locale === "ja" ? "提出を取り消しました。再編集できます。" : "Withdrawn. You can edit again.") : res.error ?? (locale === "ja" ? "エラー" : "Error"));
  }

  const overBudget = data.totalBudget > 0 && liveTotal > data.totalBudget;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <MonthNav year={data.year} month={data.month} />

        <div className="flex items-baseline gap-1.5 rounded-md bg-slate-50 px-3 py-1.5">
          <span className="text-xs text-slate-500">{t("timesheetHours")}</span>
          <span className={`text-base font-semibold num ${overBudget ? "text-rose-600" : "text-slate-800"}`}>
            {liveTotal.toFixed(1)}
          </span>
          <span className="text-xs text-slate-400 num">
            / {data.totalBudget > 0 ? `${data.totalBudget.toFixed(1)}h` : (locale === "ja" ? "未設定" : "not set")}
          </span>
        </div>

        <div className="flex items-baseline gap-1.5 rounded-md bg-slate-50 px-3 py-1.5">
          <span className="text-xs text-slate-500">{t("dashboardWorkingDays")}</span>
          <span className="text-sm font-semibold text-slate-700 num">{data.workingDays}</span>
        </div>

        <StatusBadge status={data.report.status} />

        <div className="ml-auto flex items-center gap-2">
          <span className={`text-xs ${
            saveState === "error" ? "text-rose-600"
            : saveState === "saving" ? "text-slate-400" : "text-emerald-600"}`}>
            {saveState === "saving" ? t("saving")
              : saveState === "saved" ? (locale === "ja" ? "保存しました" : "Saved")
              : saveState === "error" ? (errorMsg ?? (locale === "ja" ? "保存エラー" : "Save error")) : ""}
          </span>

          {!data.locked && (
            <button className="btn-secondary btn-sm" onClick={() => setShowFill((v) => !v)}>
              {locale === "ja" ? "月をまとめて入力" : "Quick fill month"}
            </button>
          )}

          {data.report.status === "SUBMITTED" && (
            <button className="btn-secondary" onClick={withdraw} disabled={busy}>
              {locale === "ja" ? "提出取消" : "Withdraw"}
            </button>
          )}
          {(data.report.status === "DRAFT" || data.report.status === "REJECTED") && (
            <button className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? t("loading") : t("timesheetSubmit")}
            </button>
          )}
          {data.report.status === "APPROVED" && (
            <span className="text-xs text-emerald-600">{t("statusClosed")}</span>
          )}
        </div>
      </div>

      {showFill && !data.locked && <FillPanel data={data} onDone={() => setShowFill(false)} />}

      {(data.report.status === "DRAFT" || data.report.status === "REJECTED") && (
        <div className="border-t border-slate-200 px-4 py-2">
             <input className="input" placeholder={locale === "ja" ? "管理者向けのコメント（任意）" : "Note for management (optional)"}
                 value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}

      {data.report.status === "REJECTED" && data.report.reviewNote && (
        <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          <strong>{locale === "ja" ? "差戻し理由:" : "Rejection note:"}</strong> {data.report.reviewNote}
        </div>
      )}
      {msg && <div className="border-t border-slate-200 px-4 py-2 text-sm text-slate-600">{msg}</div>}
    </div>
  );
}

function FillPanel({ data, onDone }: { data: MonthData; onDone: () => void }) {
  const { t, locale } = useLocale();
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  const [brk, setBrk] = useState(60);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    const toMin = (s: string) => {
      const [h, m] = s.split(":").map(Number);
      return h * 60 + m;
    };
    const res = await fillWorkdaysAction(data.year, data.month, toMin(start), toMin(end), brk);
    setBusy(false);
    setMsg(res.ok ? (locale === "ja" ? `${res.filled ?? 0}日分を入力しました。` : `Filled ${res.filled ?? 0} days.`) : res.error ?? (locale === "ja" ? "エラー" : "Error"));
    if (res.ok) setTimeout(onDone, 1200);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
      <div>
        <label className="label">{t("timesheetStart")}</label>
        <input type="time" className="input num w-28" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      <div>
        <label className="label">{t("timesheetEnd")}</label>
        <input type="time" className="input num w-28" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <div>
        <label className="label">{t("timesheetBreak")}</label>
        <input type="number" className="input num w-24" value={brk}
               onChange={(e) => setBrk(Number(e.target.value) || 0)} />
      </div>
      <button className="btn-primary" onClick={run} disabled={busy}>
        {busy ? t("loading") : (locale === "ja" ? "平日の未入力日に一括入力" : "Fill empty Mon-Fri days")}
      </button>
      {msg && <span className="text-sm text-slate-600">{msg}</span>}
      <p className="w-full text-xs text-slate-500">
        {locale === "ja" ? "開始/終了時刻だけを未入力日に入れます。作業明細は作成せず、既存データは上書きしません。" : "Only fills start/end times for empty days. It does not create work lines or overwrite existing data."}
      </p>
    </div>
  );
}

/* ─────────────────────────── Danh sách ngày ─────────────────────────── */

function DayList({
  data, drafts, selected, onSelect,
}: {
  data: MonthData;
  drafts: Record<number, DayDraft>;
  selected: number;
  onSelect: (d: number) => void;
}) {
  const { locale } = useLocale();
  const today = todayParts();
  const isCurrentMonth = today.year === data.year && today.month === data.month;

  return (
    <div className="card overflow-hidden">
      <div className="card-header">
        <h2 className="card-title">{locale === "ja" ? "月内の日付" : "Days in month"}</h2>
        <span className="text-xs text-slate-400">{locale === "ja" ? "入力済み時間" : "entered hours"}</span>
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {data.days.map((d) => {
          const draft = drafts[d.day];
          const startMin = draft ? draft.startMin : d.startMin;
          const endMin = draft ? draft.endMin : d.endMin;
          const breakMin = draft ? draft.breakMin : d.breakMin;
          const attendance = draft ? workedHours(startMin, endMin, breakMin) : d.attendanceHours;
          const hours = draft ? draft.entries.reduce((s, e) => s + e.actualHours, 0) : d.entryHours;
          const hasEntries = draft ? draft.entries.some((e) => e.actualHours > 0) : d.entries.some((e) => !e.isPlan);
          const noEntriesWarning = attendance > 0 && !hasEntries;
          const mismatchWarning = attendance > 0 && hasEntries && Math.round((hours - attendance) * 100) / 100 !== 0;
          const hasWarning = noEntriesWarning || mismatchWarning;
          const on = d.day === selected;
          const isToday = isCurrentMonth && d.day === today.day;
          const off = d.isWeekend || d.isHoliday || draft?.dayType === "PUBLIC_OFF";
          const warningTitle = noEntriesWarning
            ? (locale === "ja" ? "就業時間はありますが作業明細が未入力です" : "Attendance recorded but no work-detail rows")
            : (locale === "ja" ? "作業明細の合計が就業時間と一致しません" : "Work-detail total doesn't match attendance");

          return (
            <button
              key={d.day}
              onClick={() => onSelect(d.day)}
              className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-1.5 text-left text-sm transition
                ${on ? "bg-brand-50 ring-1 ring-inset ring-brand-200" : "hover:bg-slate-50"}
                ${off && !on ? "bg-slate-50/60" : ""}
                ${hasWarning && !on ? (noEntriesWarning ? "bg-rose-50/60" : "bg-amber-50/60") : ""}`}
            >
              <span className={`w-7 shrink-0 text-right font-semibold num ${
                off ? "text-rose-400" : "text-slate-600"}`}>
                {String(d.day).padStart(2, "0")}
              </span>
              <span className={`w-6 shrink-0 text-xs ${off ? "text-rose-400" : "text-slate-400"}`}>
                {locale === "ja" ? WEEKDAY_JA[d.weekday] : WEEKDAY_VI[d.weekday]}
              </span>
              {isToday && <span className="badge bg-brand-600 px-1.5 py-0 text-[10px] text-white">{locale === "ja" ? "今日" : "today"}</span>}
              <span className="ml-auto flex items-center gap-2">
                {hasWarning && (
                  <span title={warningTitle} className={`shrink-0 ${noEntriesWarning ? "text-rose-500" : "text-amber-500"}`}>
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.166 2.357-1.166 3.03 0l6.28 10.875c.673 1.167-.169 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
                {draft?.leaveNote && (
                  <span className="max-w-[70px] truncate text-[11px] text-amber-600">{draft.leaveNote}</span>
                )}
                <span className={`w-12 text-right num ${
                  hours > 0 ? "font-medium text-slate-700" : "text-slate-300"}`}>
                  {hours > 0 ? hours.toFixed(1) : "–"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
