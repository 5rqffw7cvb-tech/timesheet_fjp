"use client";

import { useMemo, useState } from "react";
import type { Project, WorkType } from "@/db/schema";
import { minToHHMM, hhmmToMin, WEEKDAY_JA, WEEKDAY_VI, workedHours } from "@/lib/dates";
import type { DayData } from "@/lib/period";
import { containsText, sortRows, toggleSort, type SortState } from "@/lib/tableUi";
import { useLocale } from "@/components/LocaleProvider";

/**
 * Một dòng công việc mang cả 2 giá trị 実績(actualHours) và 予定(planHours)
 * cho cùng project × 工種 × nội dung — vì template Excel週報 cần cả 2 cột
 * (dòng 予定 và dòng 実績) cho mỗi tổ hợp project × 工種, không phải chọn 1
 * trong 2. Khi lưu, mỗi giá trị > 0 sẽ tách thành 1 bản ghi time_entries
 * (isPlan tương ứng) — xem TimesheetEditor.tsx.
 */
export interface DraftEntry {
  key: string;
  projectId: string;
  workTypeId: string;
  description: string;
  actualHours: number;
  planHours: number;
}

export interface DayDraft {
  startMin: number | null;
  endMin: number | null;
  breakMin: number;
  dayType: DayData["dayType"];
  leaveNote: string | null;
  remark: string | null;
  entries: DraftEntry[];
}

const DAY_TYPES: { value: DayData["dayType"]; ja: string; en: string }[] = [
  { value: "WORK", ja: "勤務日", en: "Working day" },
  { value: "PUBLIC_OFF", ja: "公休", en: "Public holiday" },
  { value: "SUB_OFF", ja: "代休", en: "Substitute holiday" },
  { value: "HOLIDAY_WORK", ja: "公出", en: "Holiday work" },
];

const LEAVE_PRESETS = [
  "", "全休", "午前休", "午後休", "有給休暇", "特別休暇", "慶弔休暇", "病気欠勤",
];

export default function DayEditor({
  day, draft, projects, workTypes, readOnly, onChange, onSave, onClear, onCopyPrev, canCopyPrev,
}: {
  day: DayData;
  draft: DayDraft;
  projects: Project[];
  workTypes: WorkType[];
  readOnly: boolean;
  onChange: (next: DayDraft) => void;
  onSave: () => Promise<void> | void;
  onClear: () => void;
  onCopyPrev: () => void;
  canCopyPrev: boolean;
}) {
  const { t, locale } = useLocale();
  const groupedWorkTypes = useMemo(() => {
    const map = new Map<string, WorkType[]>();
    for (const w of workTypes) {
      const list = map.get(w.category) ?? [];
      list.push(w);
      map.set(w.category, list);
    }
    return [...map.entries()];
  }, [workTypes]);

  const attendance = workedHours(draft.startMin, draft.endMin, draft.breakMin);
  const entryTotal = draft.entries.reduce((s, e) => s + e.actualHours, 0);
  const diff = Math.round((entryTotal - attendance) * 100) / 100;
  const hasActualEntries = draft.entries.some((e) => e.actualHours > 0);
  const noEntriesWarning = attendance > 0 && !hasActualEntries;
  const mismatchWarning = attendance > 0 && hasActualEntries && diff !== 0;
  const hasWarning = noEntriesWarning || mismatchWarning;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "project", dir: "asc" });

  const patch = (p: Partial<DayDraft>) => onChange({ ...draft, ...p });

  function updateEntry(key: string, p: Partial<DraftEntry>) {
    patch({ entries: draft.entries.map((e) => (e.key === key ? { ...e, ...p } : e)) });
  }
  function addEntry() {
    const last = draft.entries[draft.entries.length - 1];
    const defaultProjectId = last?.projectId || projects[0]?.id || "";
    const defaultWorkTypeId = last?.workTypeId || workTypes[0]?.id || "";
    patch({
      entries: [...draft.entries, {
        key: Math.random().toString(36).slice(2),
        projectId: defaultProjectId,
        workTypeId: defaultWorkTypeId,
        description: "",
        actualHours: 0,
        planHours: 0,
      }],
    });
  }
  function removeEntry(key: string) {
    patch({ entries: draft.entries.filter((e) => e.key !== key) });
  }

  const filteredEntries = useMemo(() => {
    const needle = q.trim();
    const base = needle
      ? draft.entries.filter((e) => [e.description, e.projectId, e.workTypeId, String(e.actualHours), String(e.planHours)]
        .some((v) => containsText(v, needle)))
      : draft.entries;
    return sortRows(base, sort, (e) => {
      if (sort.key === "project") return projects.find((p) => p.id === e.projectId)?.name ?? e.projectId;
      if (sort.key === "workType") return workTypes.find((w) => w.id === e.workTypeId)?.name ?? e.workTypeId;
      if (sort.key === "actualHours") return e.actualHours;
      if (sort.key === "planHours") return e.planHours;
      return e.description;
    });
  }, [draft.entries, q, sort, projects, workTypes]);

  const dateObj = new Date(day.date + "T00:00:00");
  const dateLabel = `${(locale === "ja" ? WEEKDAY_JA : WEEKDAY_VI)[day.weekday]} · ${String(day.day).padStart(2, "0")}/${String(dateObj.getMonth() + 1).padStart(2, "0")}/${dateObj.getFullYear()}`;
  const weekdayLabel = locale === "ja" ? WEEKDAY_JA[day.weekday] : WEEKDAY_VI[day.weekday];

  return (
    <div className="card flex h-full flex-col">
      <div className="card-header">
        <div className="flex items-baseline gap-2">
          <h2 className="card-title">{dateLabel}</h2>
          <span className="text-xs text-slate-400">({weekdayLabel}{locale === "ja" ? "曜" : ""})</span>
          {day.isHoliday && (
            <span className="badge bg-rose-100 text-rose-700">{day.holidayName || (locale === "ja" ? "祝日" : "Holiday")}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary btn-sm" onClick={onCopyPrev}
                  disabled={readOnly || !canCopyPrev}
                  title={locale === "ja" ? "前営業日の時刻と作業明細をコピー" : "Copy time and work lines from the previous working day"}>
            {locale === "ja" ? "前日コピー" : "Copy previous day"}
          </button>
          <button className="btn-primary btn-sm" onClick={() => { void onSave(); }}
                  disabled={readOnly}>
            {t("save")}
          </button>
          <button className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50"
                  onClick={onClear} disabled={readOnly}>
            {locale === "ja" ? "日をクリア" : "Clear day"}
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* giờ vào / ra / nghỉ */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <label className="label">{t("timesheetStart")}</label>
            <input type="time" className="input num" disabled={readOnly}
                   value={minToHHMM(draft.startMin)}
                   onChange={(e) => patch({ startMin: hhmmToMin(e.target.value) })} />
          </div>
          <div>
            <label className="label">{t("timesheetEnd")}</label>
            <input type="time" className="input num" disabled={readOnly}
                   value={minToHHMM(draft.endMin)}
                   onChange={(e) => patch({ endMin: hhmmToMin(e.target.value) })} />
          </div>
          <div>
            <label className="label">{t("timesheetBreak")}</label>
            <input type="number" min={0} max={600} step={15} className="input num"
                   disabled={readOnly} value={draft.breakMin}
                   onChange={(e) => patch({ breakMin: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="label">就業時間</label>
            <div className="input num flex items-center bg-slate-50 font-semibold text-slate-700">
              {attendance.toFixed(2)} h
            </div>
          </div>
          <div>
            <label className="label">{t("timesheetDayType")}</label>
            <select className="select" disabled={readOnly} value={draft.dayType}
                    onChange={(e) => patch({ dayType: e.target.value as DayData["dayType"] })}>
              {DAY_TYPES.map((t) => <option key={t.value} value={t.value}>{locale === "ja" ? t.ja : t.en}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
                 <label className="label">{locale === "ja" ? "勤務欄 / 休暇" : "Leave note"}</label>
            <input className="input" list="leave-presets" disabled={readOnly}
                   placeholder={locale === "ja" ? "入力: 午前休、遅刻30分…" : "e.g. morning leave, 30 min late…"}
                   value={draft.leaveNote ?? ""}
                   onChange={(e) => patch({ leaveNote: e.target.value || null })} />
            <datalist id="leave-presets">
              {LEAVE_PRESETS.filter(Boolean).map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div>
            <label className="label">{t("timesheetNoteLabel")}</label>
            <input className="input" disabled={readOnly}
                   value={draft.remark ?? ""}
                   onChange={(e) => patch({ remark: e.target.value || null })} />
          </div>
        </div>

        {/* các dòng công việc */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("timesheetWorkDetails")}
            </h3>
            <div className="flex items-center gap-1.5 text-xs num">
              <span className="text-slate-500">{locale === "ja" ? "合計" : "Total"}</span>
              <span className="font-semibold text-slate-700">{entryTotal.toFixed(2)}h</span>
              {attendance > 0 && !hasWarning && (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckIcon className="h-3.5 w-3.5" />
                  {locale === "ja" ? "就業時間と一致" : "Matches attendance"}
                </span>
              )}
            </div>
          </div>

          {hasWarning && (
            <div
              role="alert"
              className={`mb-2 flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed ${
                noEntriesWarning
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-amber-300 bg-amber-50 text-amber-700"
              }`}
            >
              <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                {noEntriesWarning ? (
                  locale === "ja" ? (
                    <>就業時間が <b className="num">{attendance.toFixed(2)}h</b> 入力されていますが、作業明細が1件も入力されていません。下の表に業務内容を追加してください。</>
                  ) : (
                    <>Attendance is recorded as <b className="num">{attendance.toFixed(2)}h</b>, but no work-detail rows have been entered yet. Add at least one row below.</>
                  )
                ) : locale === "ja" ? (
                  <>作業明細の合計 <b className="num">{entryTotal.toFixed(2)}h</b> が就業時間 <b className="num">{attendance.toFixed(2)}h</b> と一致しません（差分 <b className="num">{diff > 0 ? "+" : ""}{diff.toFixed(2)}h</b>）。工数の入力をご確認ください。</>
                ) : (
                  <>Work-detail total <b className="num">{entryTotal.toFixed(2)}h</b> doesn&apos;t match attendance <b className="num">{attendance.toFixed(2)}h</b> (diff <b className="num">{diff > 0 ? "+" : ""}{diff.toFixed(2)}h</b>). Please double-check the hours entered.</>
                )}
              </div>
            </div>
          )}

          <div
            className={`overflow-x-auto rounded-md border transition-colors ${
              noEntriesWarning
                ? "border-rose-300 ring-1 ring-rose-100"
                : mismatchWarning
                ? "border-amber-300 ring-1 ring-amber-100"
                : "border-slate-200"
            }`}
          >
            <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
              <input className="input w-64" placeholder={t("lineSearchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex items-start gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] leading-snug text-slate-500">
              <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                {locale === "ja"
                  ? <>週報エクセルには <b className="font-medium text-slate-600">実績</b>（当日やった時間）と <b className="font-medium text-slate-600">予定</b>（見込みの時間）の両方が必要です。1行につき両方の欄を入力してください（どちらか一方だけでも構いません）。</>
                  : <>The weekly report needs both <b className="font-medium text-slate-600">Actual</b> (hours really worked) and <b className="font-medium text-slate-600">Planned</b> (forecast hours) per line. Fill in both columns for each row (either one alone is fine too).</>}
              </span>
            </div>
            <table className="data">
              <thead>
                <tr>
                  <th className="w-[170px]"><button onClick={() => setSort(toggleSort(sort, "project"))}>{t("timesheetProject")}</button></th>
                  <th className="w-[230px]"><button onClick={() => setSort(toggleSort(sort, "workType"))}>{t("timesheetWorkType")}</button></th>
                  <th>{t("timesheetDescription")}</th>
                  <th className="w-[86px] text-right"><button onClick={() => setSort(toggleSort(sort, "actualHours"))} className="text-right">{locale === "ja" ? "実績(h)" : "Actual (h)"}</button></th>
                  <th className="w-[86px] text-right"><button onClick={() => setSort(toggleSort(sort, "planHours"))} className="text-right">{locale === "ja" ? "予定(h)" : "Planned (h)"}</button></th>
                  <th className="w-[44px]"></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                      {t("timesheetNoMatchingRows")}
                    </td>
                  </tr>
                )}
                {filteredEntries.map((e) => (
                  <tr key={e.key}>
                    <td>
                      <select className="select" disabled={readOnly} value={e.projectId}
                              onChange={(ev) => updateEntry(e.key, { projectId: ev.target.value })}>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select className="select" disabled={readOnly} value={e.workTypeId}
                              onChange={(ev) => updateEntry(e.key, { workTypeId: ev.target.value })}>
                        {groupedWorkTypes.map(([cat, list]) => (
                          <optgroup key={cat} label={cat}>
                            {list.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="input" disabled={readOnly} value={e.description}
                             placeholder={locale === "ja" ? "主な作業内容" : "Brief task description"}
                             onChange={(ev) => updateEntry(e.key, { description: ev.target.value })} />
                    </td>
                    <td>
                      <div className="relative">
                        <input type="number" min={0} max={24} step={0.25}
                               className="input num pr-5 text-right" disabled={readOnly}
                               value={e.actualHours === 0 ? "" : e.actualHours} placeholder="0"
                               title={locale === "ja" ? "実績：実際に作業した時間" : "Actual: hours really worked"}
                               onChange={(ev) => updateEntry(e.key, { actualHours: Number(ev.target.value) || 0 })} />
                        <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-xs text-slate-400">h</span>
                      </div>
                    </td>
                    <td>
                      <div className="relative">
                        <input type="number" min={0} max={24} step={0.25}
                               className="input num pr-5 text-right" disabled={readOnly}
                               value={e.planHours === 0 ? "" : e.planHours} placeholder="0"
                               title={locale === "ja" ? "予定：見込みの時間" : "Planned: forecast hours"}
                               onChange={(ev) => updateEntry(e.key, { planHours: Number(ev.target.value) || 0 })} />
                        <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-xs text-slate-400">h</span>
                      </div>
                    </td>
                    <td className="text-center">
                      <button className="btn-ghost btn-sm text-rose-500 hover:bg-rose-50"
                              disabled={readOnly} onClick={() => removeEntry(e.key)} title={locale === "ja" ? "行を削除" : "Delete row"}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn-secondary btn-sm mt-2" onClick={addEntry} disabled={readOnly}>
            + {t("timesheetAddLine")}
          </button>
        </div>
      </div>
    </div>
  );
}

function WarningIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.166 2.357-1.166 3.03 0l6.28 10.875c.673 1.167-.169 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
    </svg>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.6a1 1 0 0 1-1.427.007l-3.5-3.5a1 1 0 1 1 1.414-1.414l2.79 2.79 6.797-6.89a1 1 0 0 1 1.42-.007Z" clipRule="evenodd" />
    </svg>
  );
}

function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path fillRule="evenodd" d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a1 1 0 0 0 0 2h.25v3H9a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2h-.25v-4A1 1 0 0 0 10.75 9H9Z" clipRule="evenodd" />
    </svg>
  );
}
