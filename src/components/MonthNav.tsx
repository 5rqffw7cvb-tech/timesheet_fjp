"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { shiftMonth } from "@/lib/dates";

export default function MonthNav({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(y: number, m: number) {
    const p = new URLSearchParams(params.toString());
    p.set("year", String(y));
    p.set("month", String(m));
    router.push(`${pathname}?${p.toString()}`);
  }

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  return (
    <div className="flex items-center gap-1">
      <button className="btn-secondary btn-sm" onClick={() => go(prev.year, prev.month)} aria-label="Tháng trước">‹</button>
      <div className="min-w-[128px] rounded-md border border-slate-300 bg-white px-3 py-1 text-center text-sm font-semibold text-slate-800 num">
        {year}年{String(month).padStart(2, "0")}月
      </div>
      <button className="btn-secondary btn-sm" onClick={() => go(next.year, next.month)} aria-label="Tháng sau">›</button>
    </div>
  );
}
