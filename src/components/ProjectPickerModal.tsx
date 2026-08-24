"use client";

import { useLocale } from "./LocaleProvider";

export interface ProjectOption {
  id: string;
  code: string;
  name: string;
}

/**
 * Member làm nhiều project trong tháng -> 会社名/組織単位/就業場所/就業した業務
 * in trên report khác nhau theo project, nên phải hỏi xuất cho project nào
 * trước khi tải file.
 */
export default function ProjectPickerModal({
  projects, onSelect, onCancel,
}: {
  projects: ProjectOption[];
  onSelect: (projectId: string) => void;
  onCancel: () => void;
}) {
  const { locale } = useLocale();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={onCancel}>
      <div className="card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h2 className="card-title">{locale === "ja" ? "対象プロジェクトを選択" : "Choose a project"}</h2>
          <button className="btn-ghost btn-sm" onClick={onCancel}>{locale === "ja" ? "閉じる" : "Close"}</button>
        </div>
        <div className="p-2 text-xs text-slate-500 px-4 pt-3">
          {locale === "ja"
            ? "この月は複数のプロジェクトで作業しています。会社名・就業場所などはプロジェクトごとに異なるため、出力するプロジェクトを1つ選んでください。"
            : "Multiple projects were worked on this month. Company name, workplace, etc. differ per project, so pick the one to export."}
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto p-3">
          {projects.map((p) => (
            <button
              key={p.id}
              className="flex w-full items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-300 hover:bg-brand-50"
              onClick={() => onSelect(p.id)}
            >
              <span className="num shrink-0 font-medium text-slate-700">{p.code}</span>
              <span className="truncate text-slate-600">{p.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
