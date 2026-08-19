"use client";

import { useState } from "react";

export default function DownloadButton({
  year, month, userId,
}: { year: number; month: number; userId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/export?year=${year}&month=${month}&user=${userId}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "Không tải được file" }));
        setErr(j.error); return;
      }
      const d = res.headers.get("Content-Disposition") ?? "";
      const m = /filename\*=UTF-8''([^;]+)/.exec(d);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = m ? decodeURIComponent(m[1]) : "週報.xlsx";
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-2">
      {err && <span className="text-xs text-rose-600">{err}</span>}
      <button className="btn-secondary" onClick={run} disabled={busy}>
        {busy ? "Đang tạo…" : "Tải 週報 của tôi"}
      </button>
    </div>
  );
}
