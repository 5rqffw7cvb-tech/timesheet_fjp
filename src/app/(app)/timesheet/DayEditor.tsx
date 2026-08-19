"use client";

import { useMemo } from "react";
import type { Project, WorkType } from "@/db/schema";
import { minToHHMM, hhmmToMin, WEEKDAY_JA, WEEKDAY_VI, workedHours } from "@/lib/dates";
import type { DayData, EntryData } from "@/lib/period";

export interface DraftEntry extends Omit<EntryData, "id"> { key: string }

export interface DayDraft {
  startMin: number | null;
  endMin: number | null;
  breakMin: number;
  dayType: DayData["dayType"];
  leaveNote: string | null;
  remark: string | null;
  entries: DraftEntry[];
}

const DAY_TYPES: { value: DayData["dayType"]; label: string }[] = [
  { value: "WORK", label: "Ngày làm việc" },
  { value: "PUBLIC_OFF", label: "公休 — Nghỉ theo lịch" },
  { value: "SUB_OFF", label: "代休 — Nghỉ bù" },
  { value: "HOLIDAY_WORK", label: "公出 — Đi làm ngày nghỉ" },
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
  const entryTotal = draft.entries.reduce((s, e) => s + (e.isPlan ? 0 : e.hours), 0);
  const diff = Math.round((entryTotal - attendance) * 100) / 100;

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
        hours: 0,
        isPlan: false,
      }],
    });
  }
  function removeEntry(key: string) {
    patch({ entries: draft.entries.filter((e) => e.key !== key) });
  }

  const dateObj = new Date(day.date + "T00:00:00");
  const dateLabel = `${WEEKDAY_VI[day.weekday]} · ${String(day.day).padStart(2, "0")}/${String(dateObj.getMonth() + 1).padStart(2, "0")}/${dateObj.getFullYear()}`;

  return (
    <div className="card flex h-full flex-col">
      <div className="card-header">
        <div className="flex items-baseline gap-2">
          <h2 className="card-title">{dateLabel}</h2>
          <span className="text-xs text-slate-400">({WEEKDAY_JA[day.weekday]}曜)</span>
          {day.isHoliday && (
            <span className="badge bg-rose-100 text-rose-700">{day.holidayName || "Ngày lễ"}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary btn-sm" onClick={onCopyPrev}
                  disabled={readOnly || !canCopyPrev}
                  title="Chép giờ và các dòng công việc từ ngày làm việc trước">
            Chép ngày trước
          </button>
          <button className="btn-primary btn-sm" onClick={() => { void onSave(); }}
                  disabled={readOnly}>
            Lưu
          </button>
          <button className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50"
                  onClick={onClear} disabled={readOnly}>
            Xoá ngày
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* giờ vào / ra / nghỉ */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <label className="label">始業 — Giờ vào</label>
            <input type="time" className="input num" disabled={readOnly}
                   value={minToHHMM(draft.startMin)}
                   onChange={(e) => patch({ startMin: hhmmToMin(e.target.value) })} />
          </div>
          <div>
            <label className="label">終業 — Giờ ra</label>
            <input type="time" className="input num" disabled={readOnly}
                   value={minToHHMM(draft.endMin)}
                   onChange={(e) => patch({ endMin: hhmmToMin(e.target.value) })} />
          </div>
          <div>
            <label className="label">休憩 — Nghỉ (phút)</label>
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
            <label className="label">Loại ngày</label>
            <select className="select" disabled={readOnly} value={draft.dayType}
                    onChange={(e) => patch({ dayType: e.target.value as DayData["dayType"] })}>
              {DAY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">勤務欄 / 休暇 — Ghi chú nghỉ</label>
            <input className="input" list="leave-presets" disabled={readOnly}
                   placeholder="vd: 午前休, 遅刻30分…"
                   value={draft.leaveNote ?? ""}
                   onChange={(e) => patch({ leaveNote: e.target.value || null })} />
            <datalist id="leave-presets">
              {LEAVE_PRESETS.filter(Boolean).map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div>
            <label className="label">備考 — Ghi chú cho 勤務報告書</label>
            <input className="input" disabled={readOnly}
                   value={draft.remark ?? ""}
                   onChange={(e) => patch({ remark: e.target.value || null })} />
          </div>
        </div>

        {/* các dòng công việc */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Chi tiết công việc
            </h3>
            <div className="text-xs num">
              <span className="text-slate-500">Tổng dòng: </span>
              <span className="font-semibold text-slate-700">{entryTotal.toFixed(2)}h</span>
              {attendance > 0 && (
                <span className={`ml-2 ${diff === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                  {diff === 0 ? "khớp 就業時間" : `lệch ${diff > 0 ? "+" : ""}${diff.toFixed(2)}h`}
                </span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="data">
              <thead>
                <tr>
                  <th className="w-[190px]">プロジェクト</th>
                  <th className="w-[260px]">工種</th>
                  <th>主な作業内容</th>
                  <th className="w-[84px] text-right">Giờ</th>
                  <th className="w-[74px]">予定</th>
                  <th className="w-[44px]"></th>
                </tr>
              </thead>
              <tbody>
                {draft.entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                      Chưa có dòng nào. Bấm “Thêm dòng” để bắt đầu.
                    </td>
                  </tr>
                )}
                {draft.entries.map((e) => (
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
                             placeholder="Mô tả ngắn công việc"
                             onChange={(ev) => updateEntry(e.key, { description: ev.target.value })} />
                    </td>
                    <td>
                      <input type="number" min={0} max={24} step={0.25}
                             className="input num text-right" disabled={readOnly}
                             value={e.hours === 0 ? "" : e.hours} placeholder="0"
                             onChange={(ev) => updateEntry(e.key, { hours: Number(ev.target.value) || 0 })} />
                    </td>
                    <td className="text-center">
                      <input type="checkbox" className="h-4 w-4 accent-brand-600"
                             disabled={readOnly} checked={e.isPlan}
                             title="Đánh dấu là 予定 (kế hoạch), không tính vào tổng thực tế"
                             onChange={(ev) => updateEntry(e.key, { isPlan: ev.target.checked })} />
                    </td>
                    <td className="text-center">
                      <button className="btn-ghost btn-sm text-rose-500 hover:bg-rose-50"
                              disabled={readOnly} onClick={() => removeEntry(e.key)} title="Xoá dòng">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn-secondary btn-sm mt-2" onClick={addEntry} disabled={readOnly}>
            + Thêm dòng
          </button>
        </div>
      </div>
    </div>
  );
}
