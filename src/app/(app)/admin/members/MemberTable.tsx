"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMemberAction, updateMemberAction, toggleMemberAction, resetPasswordAction,
} from "@/actions/admin";
import { sortRows, toggleSort, type SortState, containsText } from "@/lib/tableUi";

interface Member {
  id: string; username: string; fullName: string; displayName: string | null;
  employeeCode: string | null; roleTitle: string | null; location: string | null;
  billingUnitPrice: number; billingFactor: number;
  role: "ADMIN" | "MEMBER"; isActive: boolean; companyId: string | null; mustChangePw: boolean;
}

const EMPTY: Omit<Member, "id" | "isActive" | "mustChangePw"> = {
  username: "", fullName: "", displayName: "", employeeCode: "",
  roleTitle: "", location: "日本", billingUnitPrice: 0, billingFactor: 1,
  role: "MEMBER", companyId: null,
};

export default function MemberTable({
  members, companies,
}: {
  members: Member[];
  companies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "fullName", dir: "asc" });

  const filteredMembers = useMemo(() => {
    const needle = q.trim();
    const base = needle
      ? members.filter((m) =>
        [m.fullName, m.username, m.displayName, m.employeeCode, m.roleTitle, m.location, m.companyId]
          .some((v) => containsText(v, needle)))
      : members;

    return sortRows(base, sort, (m) => {
      if (sort.key === "username") return m.username;
      if (sort.key === "displayName") return m.displayName ?? "";
      if (sort.key === "roleTitle") return m.roleTitle ?? "";
      if (sort.key === "employeeCode") return m.employeeCode ?? "";
      if (sort.key === "location") return m.location ?? "";
      if (sort.key === "role") return m.role;
      return m.fullName;
    });
  }, [members, q, sort]);

  function toggle(m: Member) {
    startTransition(async () => {
      const res = await toggleMemberAction(m.id, !m.isActive);
      setMsg(res.ok ? "Đã cập nhật." : res.error ?? "Lỗi");
      router.refresh();
    });
  }

  function reset(m: Member) {
    const pw = prompt(`Mật khẩu mới cho ${m.fullName}:`, "Fpt@123456");
    if (!pw) return;
    startTransition(async () => {
      const res = await resetPasswordAction(m.id, pw);
      setMsg(res.ok ? `${res.message} — mật khẩu: ${pw}` : res.error ?? "Lỗi");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-3 px-4 py-3">
        <h1 className="text-sm font-semibold text-slate-800">Thành viên</h1>
        <span className="text-sm text-slate-500">
          {members.filter((m) => m.isActive).length} đang hoạt động / {members.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input className="input w-64" placeholder="Tìm member…" value={q} onChange={(e) => setQ(e.target.value)} />
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
          <button className="btn-primary" onClick={() => setEditing("new")}>+ Thêm thành viên</button>
        </div>
      </div>

      {editing && (
        <MemberForm
          member={editing === "new" ? null : editing}
          companies={companies}
          onClose={() => setEditing(null)}
          onSaved={(m) => { setMsg(m); setEditing(null); router.refresh(); }}
        />
      )}

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th><button onClick={() => setSort(toggleSort(sort, "fullName"))}>Họ tên (氏名)</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "username"))}>Đăng nhập</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "displayName"))}>Tên file</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "roleTitle"))}>Vai trò</button></th>
              <th><button onClick={() => setSort(toggleSort(sort, "employeeCode"))}>支払先</button></th>
              <th>Đơn giá</th><th>Công số</th>
              <th><button onClick={() => setSort(toggleSort(sort, "location"))}>Nơi làm</button></th>
              <th>Quyền</th><th>Trạng thái</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((m) => (
              <tr key={m.id} className={m.isActive ? "" : "opacity-50"}>
                <td className="font-medium text-slate-700">{m.fullName}</td>
                <td className="num text-slate-600">{m.username}</td>
                <td className="num text-slate-500">{m.displayName ?? "—"}</td>
                <td className="text-slate-500">{m.roleTitle ?? "—"}</td>
                <td className="num text-slate-500">{m.employeeCode ?? "—"}</td>
                <td className="num text-slate-500">{m.billingUnitPrice ? m.billingUnitPrice.toLocaleString("en-US") : "—"}</td>
                <td className="num text-slate-500">{m.billingFactor.toFixed(2)}</td>
                <td className="text-slate-500">{m.location ?? "—"}</td>
                <td>
                  <span className={`badge ${m.role === "ADMIN"
                    ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600"}`}>
                    {m.role === "ADMIN" ? "Quản trị" : "Member"}
                  </span>
                </td>
                <td>
                  {m.mustChangePw && <span className="badge bg-amber-100 text-amber-700">chưa đổi MK</span>}
                  {!m.isActive && <span className="badge bg-slate-200 text-slate-600">đã khoá</span>}
                </td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn-ghost btn-sm" onClick={() => setEditing(m)}>Sửa</button>
                  <button className="btn-ghost btn-sm" onClick={() => reset(m)} disabled={busy}>Reset MK</button>
                  <button className="btn-ghost btn-sm text-rose-600" onClick={() => toggle(m)} disabled={busy}>
                    {m.isActive ? "Khoá" : "Mở"}
                  </button>
                </td>
              </tr>
            ))}
            {filteredMembers.length === 0 && (
              <tr><td colSpan={11} className="py-8 text-center text-slate-400">Không có member nào khớp bộ lọc.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemberForm({
  member, companies, onClose, onSaved,
}: {
  member: Member | null;
  companies: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    username: member?.username ?? EMPTY.username,
    fullName: member?.fullName ?? EMPTY.fullName,
    displayName: member?.displayName ?? "",
    employeeCode: member?.employeeCode ?? "",
    roleTitle: member?.roleTitle ?? "",
    location: member?.location ?? "日本",
    billingUnitPrice: member?.billingUnitPrice ?? 0,
    billingFactor: member?.billingFactor ?? 1,
    role: member?.role ?? ("MEMBER" as "ADMIN" | "MEMBER"),
    companyId: member?.companyId ?? companies[0]?.id ?? "",
  });
  const [password, setPassword] = useState("Fpt@123456");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));

  function save() {
    startTransition(async () => {
      const res = member
        ? await updateMemberAction(member.id, form)
        : await createMemberAction(form, password);
      if (res.ok) onSaved(member ? "Đã lưu." : `Đã tạo ${form.username} — mật khẩu: ${password}`);
      else setError(res.error ?? "Lỗi");
    });
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">{member ? `Sửa: ${member.fullName}` : "Thêm thành viên mới"}</h2>
        <button className="btn-ghost btn-sm" onClick={onClose}>Đóng</button>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="氏名 — Họ tên in ra Excel *">
          <input className="input" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </Field>
        <Field label="Tên đăng nhập *">
          <input className="input num" value={form.username}
                 onChange={(e) => set("username", e.target.value.toLowerCase())} />
        </Field>
        <Field label="Tên dùng đặt tên file (vd ThienLN1)">
          <input className="input num" value={form.displayName}
                 onChange={(e) => set("displayName", e.target.value)} />
        </Field>
        <Field label="支払先コード">
          <input className="input num" value={form.employeeCode}
                 onChange={(e) => set("employeeCode", e.target.value)} />
        </Field>
        <Field label="Vai trò (Front SE / BA / PM…)">
          <input className="input" value={form.roleTitle} onChange={(e) => set("roleTitle", e.target.value)} />
        </Field>
        <Field label="Đơn giá mặc định (/MM)">
          <input
            className="input num"
            type="number"
            min={0}
            step="1000"
            value={String(form.billingUnitPrice)}
            onChange={(e) => set("billingUnitPrice", e.target.value)}
          />
        </Field>
        <Field label="Công số">
          <input
            className="input num"
            type="number"
            min={0.1}
            max={10}
            step="0.01"
            value={String(form.billingFactor)}
            onChange={(e) => set("billingFactor", e.target.value)}
          />
        </Field>
        <Field label="Nơi làm việc">
          <select className="select" value={form.location} onChange={(e) => set("location", e.target.value)}>
            <option value="日本">日本</option>
            <option value="ベトナム">ベトナム</option>
          </select>
        </Field>
        <Field label="会社名">
          <select className="select" value={form.companyId} onChange={(e) => set("companyId", e.target.value)}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Quyền">
          <select className="select" value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Quản trị</option>
          </select>
        </Field>
        {!member && (
          <Field label="Mật khẩu khởi tạo">
            <input className="input num" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
      </div>
      {error && <p className="px-4 pb-2 text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
        <button className="btn-secondary" onClick={onClose}>Huỷ</button>
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
