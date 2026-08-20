"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MonthNav from "@/components/MonthNav";
import {
  setMonthSettingAction, addHolidayAction, removeHolidayAction, updateOrgSettingAction,
} from "@/actions/admin";
import { BILLING_CURRENCIES, currencySymbol, type BillingCurrency } from "@/lib/currency";

export default function SettingsPanel({
  year, month, workingDays, suggestedWorkingDays, daysInMonth, org, holidays,
}: {
  year: number; month: number;
  workingDays: number; suggestedWorkingDays: number; daysInMonth: number;
  org: {
    clientCompany: string;
    orgUnit: string;
    workplace: string;
    workName: string;
    billingCurrency: BillingCurrency;
  };
  holidays: { id: string; date: string; name: string }[];
}) {
  const router = useRouter();
  const [wd, setWd] = useState(workingDays);
  const [orgForm, setOrgForm] = useState(org);
  const [hDate, setHDate] = useState(`${year}-${String(month).padStart(2, "0")}-01`);
  const [hName, setHName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setMsg(res.ok ? res.message ?? "Đã lưu." : res.error ?? "Lỗi");
      router.refresh();
    });

  const monthHolidays = holidays.filter((h) =>
    h.date.startsWith(`${year}-${String(month).padStart(2, "0")}`));

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <MonthNav year={year} month={month} />
        <h1 className="text-sm font-semibold text-slate-800">Cấu hình</h1>
        {msg && <span className="ml-auto text-xs text-slate-500">{msg}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">所定日数 — Số ngày làm việc quy định</h2>
            <span className="text-xs text-slate-400">ghi vào 月間集計シート!X4</span>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-end gap-3">
              <div className="w-32">
                <label className="label">所定日数</label>
                <input type="number" min={0} max={31} className="input num"
                       value={wd} onChange={(e) => setWd(Number(e.target.value) || 0)} />
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                <div className="text-xs text-slate-500">所定時間 = 所定日数 × 7.5</div>
                <div className="font-semibold num text-slate-700">{(wd * 7.5).toFixed(1)} h</div>
              </div>
              <button className="btn-primary" disabled={busy}
                      onClick={() => run(() => setMonthSettingAction(year, month, wd))}>
                Lưu
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Tháng này có {daysInMonth} ngày, trong đó {suggestedWorkingDays} ngày từ Thứ 2–Thứ 6
              (chưa trừ ngày lễ). Gợi ý: {Math.max(suggestedWorkingDays - monthHolidays.length, 0)} ngày.
              <button className="ml-2 text-brand-600 underline"
                      onClick={() => setWd(Math.max(suggestedWorkingDays - monthHolidays.length, 0))}>
                dùng gợi ý
              </button>
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">就業先 — Thông tin in trên 勤務報告書</h2>
          </div>
          <div className="grid gap-3 p-4">
            <F l="会社名"><input className="input" value={orgForm.clientCompany}
              onChange={(e) => setOrgForm({ ...orgForm, clientCompany: e.target.value })} /></F>
            <F l="組織単位"><input className="input" value={orgForm.orgUnit}
              onChange={(e) => setOrgForm({ ...orgForm, orgUnit: e.target.value })} /></F>
            <F l="就業場所"><input className="input" value={orgForm.workplace}
              onChange={(e) => setOrgForm({ ...orgForm, workplace: e.target.value })} /></F>
            <F l="就業した業務"><input className="input" value={orgForm.workName}
              onChange={(e) => setOrgForm({ ...orgForm, workName: e.target.value })} /></F>
            <F l="Đơn vị tiền tệ cho đơn giá">
              <select
                className="select"
                value={orgForm.billingCurrency}
                onChange={(e) => setOrgForm({ ...orgForm, billingCurrency: e.target.value as BillingCurrency })}
              >
                {BILLING_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c} ({currencySymbol(c)})</option>
                ))}
              </select>
            </F>
            <div className="flex justify-end">
              <button className="btn-primary" disabled={busy}
                      onClick={() => run(() => updateOrgSettingAction(orgForm))}>Lưu</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">公休 — Ngày nghỉ lễ năm {year}</h2>
          <span className="text-xs text-slate-400">
            Ngày lễ sẽ được đánh dấu 公休 ở cột 休日 của 勤務報告書
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
          <div>
            <label className="label">Ngày</label>
            <input type="date" className="input num w-44" value={hDate}
                   onChange={(e) => setHDate(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="label">Tên ngày lễ</label>
            <input className="input" placeholder="vd: 海の日" value={hName}
                   onChange={(e) => setHName(e.target.value)} />
          </div>
          <button className="btn-primary" disabled={busy}
                  onClick={() => run(async () => {
                    const r = await addHolidayAction(hDate, hName);
                    if (r.ok) setHName("");
                    return r;
                  })}>
            Thêm ngày nghỉ
          </button>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          {holidays.length === 0 && (
            <p className="text-sm text-slate-400">Chưa khai báo ngày nghỉ nào cho năm {year}.</p>
          )}
          {holidays.map((h) => (
            <span key={h.id}
                  className={`badge gap-2 ${h.date.startsWith(`${year}-${String(month).padStart(2, "0")}`)
                    ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
              <span className="num">{h.date}</span> {h.name}
              <button className="text-rose-500 hover:text-rose-700" disabled={busy}
                      onClick={() => run(() => removeHolidayAction(h.id))}>✕</button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function F({ l, children }: { l: string; children: React.ReactNode }) {
  return <div><label className="label">{l}</label>{children}</div>;
}
