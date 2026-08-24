"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertProjectAction, upsertWorkTypeAction } from "@/actions/admin";
import { useLocale } from "@/components/LocaleProvider";
import { sortRows, toggleSort, type SortState, containsText } from "@/lib/tableUi";

interface P { id: string; systemCode: string; systemName: string; code: string; name: string; isActive: boolean }
interface W { id: string; code: string; name: string; category: string; note: string; isActive: boolean }

export default function MastersPanel({ projects, workTypes }: { projects: P[]; workTypes: W[] }) {
  const [tab, setTab] = useState<"pj" | "wt">("pj");
  const [msg, setMsg] = useState<string | null>(null);
  const { t, locale } = useLocale();

  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-2 px-4 py-3">
        <button className={tab === "pj" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
                onClick={() => setTab("pj")}>{t("mastersProjectTitle")} ({projects.length})</button>
        <button className={tab === "wt" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
                onClick={() => setTab("wt")}>{t("mastersWorkTypeTitle")} ({workTypes.length})</button>
        <span className="ml-auto text-xs text-slate-500">
          {msg ?? (locale === "ja" ? "これらのコードは出力ファイルの PJ / 工種 シートにそのまま書き込まれます。" : "These codes are written directly into the PJ / Work type sheets of the export file.")}
        </span>
      </div>
      {tab === "pj"
        ? <ProjectTable rows={projects} onMsg={setMsg} />
        : <WorkTypeTable rows={workTypes} onMsg={setMsg} />}
    </div>
  );
}

function ProjectTable({ rows, onMsg }: { rows: P[]; onMsg: (m: string) => void }) {
  const router = useRouter();
  const [edit, setEdit] = useState<P | "new" | null>(null);
  const [busy, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "code", dir: "asc" });
  const blank: P = { id: "", systemCode: "", systemName: "", code: "", name: "", isActive: true };
  const [form, setForm] = useState<P>(blank);
  const { t, locale } = useLocale();

  const filtered = useMemo(() => {
    const needle = q.trim();
    const base = needle ? rows.filter((p) =>
      [p.systemCode, p.systemName, p.code, p.name].some((v) => containsText(v, needle))) : rows;
    return sortRows(base, sort, (p) => {
      if (sort.key === "systemCode") return p.systemCode;
      if (sort.key === "systemName") return p.systemName;
      if (sort.key === "name") return p.name;
      if (sort.key === "isActive") return p.isActive ? 1 : 0;
      return p.code;
    });
  }, [q, rows, sort]);

  function open(p: P | "new") {
    setEdit(p);
    setForm(p === "new" ? blank : p);
  }
  function save() {
    startTransition(async () => {
      const res = await upsertProjectAction(edit === "new" ? null : form.id, {
        systemCode: form.systemCode, systemName: form.systemName,
        code: form.code, name: form.name, isActive: form.isActive,
      });
      onMsg(res.ok ? res.message ?? (locale === "ja" ? "保存しました。" : "Saved.") : res.error ?? (locale === "ja" ? "エラー" : "Error"));
      if (res.ok) { setEdit(null); router.refresh(); }
    });
  }

  return (
    <>
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">{t("mastersProjectTitle")}</h2>
          <div className="flex items-center gap-2">
            <input className="input w-64" placeholder={t("mastersProjectSearchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-primary btn-sm" onClick={() => open("new")}>+ {t("add")}</button>
          </div>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th><button onClick={() => setSort(toggleSort(sort, "systemCode"))}>システムコード</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "systemName"))}>システム名称</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "code"))}>プロジェクトコード</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "name"))}>プロジェクト名称</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "isActive"))}>{t("membersStatus")}</button></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className={p.isActive ? "" : "opacity-50"}>
                <td className="num">{p.systemCode}</td>
                <td>{p.systemName}</td>
                <td className="num font-medium">{p.code}</td>
                <td>{p.name}</td>
                <td>{p.isActive
                  ? <span className="badge bg-emerald-100 text-emerald-700">{t("active")}</span>
                  : <span className="badge bg-slate-200 text-slate-600">{t("hidden")}</span>}</td>
                <td className="text-right">
                  <button className="btn-ghost btn-sm" onClick={() => open(p)}>{t("edit")}</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-slate-400">{t("noData")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{edit === "new" ? `${t("add")} ${locale === "ja" ? "PJ" : "project"}` : `${t("edit")}: ${form.name}`}</h2>
            <button className="btn-ghost btn-sm" onClick={() => setEdit(null)}>{t("close")}</button>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <F l="システムコード"><input className="input num" value={form.systemCode}
              onChange={(e) => setForm({ ...form, systemCode: e.target.value })} /></F>
            <F l="システム名称"><input className="input" value={form.systemName}
              onChange={(e) => setForm({ ...form, systemName: e.target.value })} /></F>
            <F l="プロジェクトコード *"><input className="input num" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })} /></F>
            <F l="プロジェクト名称 *"><input className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
            <F l={t("membersStatus")}>
              <select className="select" value={form.isActive ? "1" : "0"}
                      onChange={(e) => setForm({ ...form, isActive: e.target.value === "1" })}>
                <option value="1">{t("active")}</option><option value="0">{t("hidden")}</option>
              </select>
            </F>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <button className="btn-secondary" onClick={() => setEdit(null)}>{t("cancel")}</button>
            <button className="btn-primary" onClick={save} disabled={busy}>{t("save")}</button>
          </div>
        </div>
      )}
    </>
  );
}

function WorkTypeTable({ rows, onMsg }: { rows: W[]; onMsg: (m: string) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "code", dir: "asc" });
  const [edit, setEdit] = useState<W | "new" | null>(null);
  const [busy, startTransition] = useTransition();
  const blank: W = { id: "", code: "", name: "", category: "", note: "", isActive: true };
  const [form, setForm] = useState<W>(blank);
  const { t, locale } = useLocale();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = !s ? rows : rows.filter((w) =>
      w.code.includes(s) || w.name.toLowerCase().includes(s) || (w.note ?? "").toLowerCase().includes(s));
    return sortRows(base, sort, (w) => {
      if (sort.key === "name") return w.name;
      if (sort.key === "category") return w.category;
      if (sort.key === "isActive") return w.isActive ? 1 : 0;
      return w.code;
    });
  }, [rows, q, sort]);

  function open(w: W | "new") { setEdit(w); setForm(w === "new" ? blank : w); }
  function save() {
    startTransition(async () => {
      const res = await upsertWorkTypeAction(edit === "new" ? null : form.id, {
        code: form.code, name: form.name,
        category: form.category || form.name.split("：")[0],
        note: form.note, isActive: form.isActive,
      });
      onMsg(res.ok ? res.message ?? (locale === "ja" ? "保存しました。" : "Saved.") : res.error ?? (locale === "ja" ? "エラー" : "Error"));
      if (res.ok) { setEdit(null); router.refresh(); }
    });
  }

  return (
    <>
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">{t("mastersWorkTypeTitle")}</h2>
          <div className="flex items-center gap-2">
            <input className="input w-64" placeholder={t("mastersWorkTypeSearchPlaceholder")}
                   value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-primary btn-sm" onClick={() => open("new")}>+ {t("add")}</button>
          </div>
        </div>
        <div className="max-h-[640px] overflow-y-auto">
          <table className="data">
            <thead>
              <tr>
                <th><button onClick={() => setSort(toggleSort(sort, "code"))}>CD</button></th>
                <th><button onClick={() => setSort(toggleSort(sort, "name"))}>工種</button></th>
                <th><button onClick={() => setSort(toggleSort(sort, "category"))}>{locale === "ja" ? "分類" : "Category"}</button></th>
                <th>補足説明</th>
                <th><button onClick={() => setSort(toggleSort(sort, "isActive"))}>{t("membersStatus")}</button></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.id} className={w.isActive ? "" : "opacity-50"}>
                  <td className="num font-medium">{w.code}</td>
                  <td>{w.name}</td>
                  <td className="text-slate-500">{w.category}</td>
                  <td className="max-w-[440px] truncate text-xs text-slate-500" title={w.note}>{w.note}</td>
                  <td>
                    <div className="flex items-center justify-between gap-2">
                      <span>{w.isActive
                        ? <span className="badge bg-emerald-100 text-emerald-700">{t("active")}</span>
                        : <span className="badge bg-slate-200 text-slate-600">{t("hidden")}</span>}</span>
                      <button className="btn-ghost btn-sm" onClick={() => open(w)}>{t("edit")}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-400">{t("noData")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {edit && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{edit === "new" ? `${t("add")} 工種` : `${t("edit")}: ${form.name}`}</h2>
            <button className="btn-ghost btn-sm" onClick={() => setEdit(null)}>{t("close")}</button>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <F l="CD *"><input className="input num" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })} /></F>
            <F l="工種 *"><input className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
            <F l={locale === "ja" ? "分類" : "Category"}><input className="input" value={form.category} placeholder={locale === "ja" ? "： の前を自動使用" : "auto from text before ："}
              onChange={(e) => setForm({ ...form, category: e.target.value })} /></F>
            <F l={t("membersStatus")}>
              <select className="select" value={form.isActive ? "1" : "0"}
                      onChange={(e) => setForm({ ...form, isActive: e.target.value === "1" })}>
                <option value="1">{t("active")}</option><option value="0">{t("hidden")}</option>
              </select>
            </F>
            <div className="sm:col-span-2 lg:col-span-4">
              <F l="補足説明"><input className="input" value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })} /></F>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">{locale === "ja" ? "テンプレートの式は最初の82行の工種だけを参照します。新規追加より既存コードの修正を推奨します。" : "The template formulas only reference the first 82 work-type rows. Prefer editing existing codes instead of adding new ones."}</p>
            <div className="ml-auto flex gap-2">
              <button className="btn-secondary" onClick={() => setEdit(null)}>{t("cancel")}</button>
              <button className="btn-primary" onClick={save} disabled={busy}>{t("save")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function F({ l, children }: { l: string; children: React.ReactNode }) {
  return <div><label className="label">{l}</label>{children}</div>;
}
