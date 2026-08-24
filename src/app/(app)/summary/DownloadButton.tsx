"use client";

import { useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import ProjectPickerModal, { type ProjectOption } from "@/components/ProjectPickerModal";

export default function DownloadButton({
  year, month, userId,
}: { year: number; month: number; userId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [projectChoices, setProjectChoices] = useState<ProjectOption[] | null>(null);
  const { locale } = useLocale();

  async function run(projectId?: string) {
    setBusy(true); setErr(null);
    try {
      const qs = new URLSearchParams({ year: String(year), month: String(month), user: userId });
      if (projectId) qs.set("project", projectId);
      const res = await fetch(`/api/export?${qs.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: locale === "ja" ? "ファイルを取得できません" : "Unable to download file" }));
        if (res.status === 409 && j.needsProjectSelection) {
          setProjectChoices(j.projects);
          return;
        }
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
      <button className="btn-secondary" onClick={() => run()} disabled={busy}>
        {busy ? (locale === "ja" ? "作成中…" : "Creating…") : (locale === "ja" ? "自分の週報をダウンロード" : "Download my weekly report")}
      </button>
      {projectChoices && (
        <ProjectPickerModal
          projects={projectChoices}
          onCancel={() => setProjectChoices(null)}
          onSelect={(projectId) => { setProjectChoices(null); void run(projectId); }}
        />
      )}
    </div>
  );
}
