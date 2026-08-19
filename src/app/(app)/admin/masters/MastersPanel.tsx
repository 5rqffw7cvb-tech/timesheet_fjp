"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertProjectAction, upsertWorkTypeAction } from "@/actions/admin";

interface P { id: string; systemCode: string; systemName: string; code: string; name: string; isActive: boolean }
interface W { id: string; code: string; name: string; category: string; note: string; isActive: boolean }

export default function MastersPanel({ projects, workTypes }: { projects: P[]; workTypes: W[] }) {
  const [tab, setTab] = useState<"pj" | "wt">("pj");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-2 px-4 py-3">
        <button className={tab === "pj" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
                onClick={() => setTab("pj")}>PJ — Project ({projects.length})</button>
        <button className={tab === "wt" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
                onClick={() => setTab("wt")}>工種 — Loại công việc ({workTypes.length})</button>
        <span className="ml-auto text-xs text-slate-500">
          {msg ?? "Các mã này được ghi thẳng vào sheet PJ / 工種 của file xuất ra."}
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
  const blank: P = { id: "", systemCode: "", systemName: "", code: "", name: "", isActive: true };
  const [form, setForm] = useState<P>(blank);

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
      onMsg(res.ok ? res.message ?? "Đã lưu." : res.error ?? "Lỗi");
      if (res.ok) { setEdit(null); router.refresh(); }
    });
  }

  return (
    <>
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Danh sách project</h2>
          <button className="btn-primary btn-sm" onClick={() => open("new")}>+ Thêm project</button>
        </div>
        <table className="data">
          <thead>
            <tr><th>システムコード</th><th>システム名称</th><th>プロジェクトコード</th>
                <th>プロジェクト名称</th><th>Trạng thái</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={p.isActive ? "" : "opacity-50"}>
                <td className="num">{p.systemCode}</td>
                <td>{p.systemName}</td>
                <td className="num font-medium">{p.code}</td>
                <td>{p.name}</td>
                <td>{p.isActive
                  ? <span className="badge bg-emerald-100 text-emerald-700">đang dùng</span>
                  : <span className="badge bg-slate-200 text-slate-600">ẩn</span>}</td>
                <td className="text-right">
                  <button className="btn-ghost btn-sm" onClick={() => open(p)}>Sửa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{edit === "new" ? "Thêm project" : `Sửa: ${form.name}`}</h2>
            <button className="btn-ghost btn-sm" onClick={() => setEdit(null)}>Đóng</button>
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
            <F l="Trạng thái">
              <select className="select" value={form.isActive ? "1" : "0"}
                      onChange={(e) => setForm({ ...form, isActive: e.target.value === "1" })}>
                <option value="1">Đang dùng</option><option value="0">Ẩn khỏi danh sách chọn</option>
              </select>
            </F>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <button className="btn-secondary" onClick={() => setEdit(null)}>Huỷ</button>
            <button className="btn-primary" onClick={save} disabled={busy}>Lưu</button>
          </div>
        </div>
      )}
    </>
  );
}

function WorkTypeTable({ rows, onMsg }: { rows: W[]; onMsg: (m: string) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<W | "new" | null>(null);
  const [busy, startTransition] = useTransition();
  const blank: W = { id: "", code: "", name: "", category: "", note: "", isActive: true };
  const [form, setForm] = useState<W>(blank);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((w) =>
      w.code.includes(s) || w.name.toLowerCase().includes(s) || (w.note ?? "").toLowerCase().includes(s));
  }, [rows, q]);

  function open(w: W | "new") { setEdit(w); setForm(w === "new" ? blank : w); }
  function save() {
    startTransition(async () => {
      const res = await upsertWorkTypeAction(edit === "new" ? null : form.id, {
        code: form.code, name: form.name,
        category: form.category || form.name.split("：")[0],
        note: form.note, isActive: form.isActive,
      });
      onMsg(res.ok ? res.message ?? "Đã lưu." : res.error ?? "Lỗi");
      if (res.ok) { setEdit(null); router.refresh(); }
    });
  }

  return (
    <>
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Danh sách 工種</h2>
          <div className="flex items-center gap-2">
            <input className="input w-64" placeholder="Tìm theo mã hoặc tên…"
                   value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-primary btn-sm" onClick={() => open("new")}>+ Thêm 工種</button>
          </div>
        </div>
        <div className="max-h-[640px] overflow-y-auto">
          <table className="data">
            <thead>
              <tr><th>CD</th><th>工種</th><th>Nhóm</th><th>補足説明</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.id} className={w.isActive ? "" : "opacity-50"}>
                  <td className="num font-medium">{w.code}</td>
                  <td>{w.name}</td>
                  <td className="text-slate-500">{w.category}</td>
                  <td className="max-w-[440px] truncate text-xs text-slate-500" title={w.note}>{w.note}</td>
                  <td className="text-right">
                    <button className="btn-ghost btn-sm" onClick={() => open(w)}>Sửa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {edit && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{edit === "new" ? "Thêm 工種" : `Sửa: ${form.name}`}</h2>
            <button className="btn-ghost btn-sm" onClick={() => setEdit(null)}>Đóng</button>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <F l="CD *"><input className="input num" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })} /></F>
            <F l="工種 *"><input className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
            <F l="Nhóm"><input className="input" value={form.category} placeholder="tự lấy phần trước dấu ："
              onChange={(e) => setForm({ ...form, category: e.target.value })} /></F>
            <F l="Trạng thái">
              <select className="select" value={form.isActive ? "1" : "0"}
                      onChange={(e) => setForm({ ...form, isActive: e.target.value === "1" })}>
                <option value="1">Đang dùng</option><option value="0">Ẩn</option>
              </select>
            </F>
            <div className="sm:col-span-2 lg:col-span-4">
              <F l="補足説明"><input className="input" value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })} /></F>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">
              Lưu ý: công thức trong template chỉ dò 82 dòng 工種 đầu tiên. Nên sửa mã có sẵn thay vì thêm mới.
            </p>
            <div className="ml-auto flex gap-2">
              <button className="btn-secondary" onClick={() => setEdit(null)}>Huỷ</button>
              <button className="btn-primary" onClick={save} disabled={busy}>Lưu</button>
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
