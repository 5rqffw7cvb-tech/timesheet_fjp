const MAP: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: "Đang nhập",  cls: "bg-slate-100 text-slate-600" },
  SUBMITTED: { label: "Chờ duyệt",  cls: "bg-amber-100 text-amber-700" },
  APPROVED:  { label: "Đã chốt",    cls: "bg-emerald-100 text-emerald-700" },
  REJECTED:  { label: "Bị trả lại", cls: "bg-rose-100 text-rose-700" },
};

export default function StatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? MAP.DRAFT;
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}
