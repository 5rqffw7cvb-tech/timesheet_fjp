"use client";

import { Fragment, useCallback, useLayoutEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  loadBudgetTimelineAction, setBudgetAction, setAssignmentPeriodAction,
} from "@/actions/admin";
import { shiftMonth } from "@/lib/dates";
import { currencySymbol, type BillingCurrency } from "@/lib/currency";
import { containsText } from "@/lib/tableUi";
import { useLocale } from "@/components/LocaleProvider";
import type { MonthKey, TimelineCell, TimelineMember, TimelineMonth } from "@/lib/budgetTimeline";

const HOURS_PER_CONG = 180;
/** Bề rộng cố định của mỗi cột tháng — timeline cuộn ngang theo đơn vị này. */
const COL_W = 116;
const NAME_W = 260;
/** Mỗi lần chạm mép trái/phải thì nạp thêm bấy nhiêu tháng. */
const CHUNK = 6;
/** Khoảng cách tới mép (px) bắt đầu nạp thêm. */
const EDGE = 160;

interface Simple {
  userId: string;
  fullName: string;
  roleTitle: string | null;
}

const EMPTY_CELL: TimelineCell = {
  effort: 0, budgetHours: 0, unitPriceMm: 0,
  actualHours: 0, actualEffort: 0, status: "DRAFT",
};

/**
 * Budget theo dạng timeline: chọn 1 project ở dropdown, mỗi dòng là 1 member,
 * mỗi cột là 1 tháng. Ô nhập là 工数 dự kiến; khi tháng đó đã được 承認 thì
 * 実績 hiện ngay dưới ô — xanh nếu còn trong budget, đỏ nếu đã vượt.
 */
export default function BudgetTimeline({
  anchor, projects, projectId, initialMonths, initialCells, members, allMembers, billingCurrency,
  canEdit, canSeeMoney,
}: {
  anchor: MonthKey;
  projects: { id: string; code: string; name: string }[];
  projectId: string;
  initialMonths: TimelineMonth[];
  initialCells: Record<string, TimelineCell>;
  members: TimelineMember[];
  allMembers: Simple[];
  billingCurrency: BillingCurrency;
  /** false = PM/DM chỉ xem: mọi ô nhập chuyển thành text, không có nút lưu. */
  canEdit: boolean;
  /** false = PM: ẩn 単価. */
  canSeeMoney: boolean;
}) {
  const { t, locale } = useLocale();
  const ja = locale === "ja";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const moneyUnit = currencySymbol(billingCurrency);
  const anchorKey = monthKeyOf(anchor.year, anchor.month);

  const [months, setMonths] = useState<TimelineMonth[]>(initialMonths);
  const [cells, setCells] = useState<Record<string, TimelineCell>>(initialCells);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [rateEdits, setRateEdits] = useState<Record<string, number>>({});
  const [rateDirty, setRateDirty] = useState<Set<string>>(new Set());
  const [periods, setPeriods] = useState<Record<string, { startDate: string | null; endDate: string | null }>>(
    Object.fromEntries(members.map((m) => [m.userId, { startDate: m.startDate, endDate: m.endDate }])),
  );
  const [savingPeriod, setSavingPeriod] = useState<Set<string>>(new Set());
  const [extraMembers, setExtraMembers] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [loadingSide, setLoadingSide] = useState<"past" | "future" | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const prependWidth = useRef<number | null>(null);
  const didInit = useRef(false);

  /* ── dòng hiển thị ─────────────────────────────────────────── */
  const baseById = new Map(members.map((m) => [m.userId, m]));
  const simpleById = new Map(allMembers.map((m) => [m.userId, m]));
  const rows: TimelineMember[] = [
    ...members,
    ...extraMembers
      .filter((id) => !baseById.has(id) && simpleById.has(id))
      .map((id) => ({
        ...simpleById.get(id)!, assigned: false, startDate: null, endDate: null, unitPriceMm: 0,
      })),
  ].sort((a, b) => a.fullName.localeCompare(b.fullName));
  const visibleRows = q.trim()
    ? rows.filter((m) => [m.fullName, m.roleTitle].some((v) => containsText(v ?? null, q)))
    : rows;

  /* ── giá trị của một ô ─────────────────────────────────────── */
  function effortOf(userId: string, mKey: string) {
    const key = `${userId}|${mKey}`;
    return edits[key] ?? cells[key]?.effort ?? 0;
  }

  /**
   * Đơn giá gửi kèm khi lưu 1 ô: ưu tiên đơn giá đã lưu riêng cho đúng tháng
   * đó (không ghi đè lịch sử), chỉ khi tháng chưa có đơn giá mới dùng đơn giá
   * hiện hành của member.
   */
  function rateFor(userId: string, mKey: string) {
    const stored = cells[`${userId}|${mKey}`]?.unitPriceMm ?? 0;
    if (stored > 0) return stored;
    return rateEdits[userId] ?? baseById.get(userId)?.unitPriceMm ?? 0;
  }

  function setEffort(userId: string, mKey: string, v: number) {
    const key = `${userId}|${mKey}`;
    setEdits((s) => ({ ...s, [key]: v }));
    setDirty((s) => new Set(s).add(key));
  }

  function setRate(userId: string, v: number) {
    setRateEdits((s) => ({ ...s, [userId]: v }));
    setRateDirty((s) => new Set(s).add(userId));
  }

  function toggleExpand(userId: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  /* ── nạp thêm tháng khi cuộn ngang ─────────────────────────── */
  const extend = useCallback(async (side: "past" | "future") => {
    if (loadingRef.current || months.length === 0) return;
    loadingRef.current = true;
    setLoadingSide(side);
    const edge = side === "past" ? months[0] : months[months.length - 1];
    const start = side === "past"
      ? shiftMonth(edge.year, edge.month, -CHUNK)
      : shiftMonth(edge.year, edge.month, 1);
    const wanted: MonthKey[] = [];
    for (let i = 0; i < CHUNK; i++) wanted.push(shiftMonth(start.year, start.month, i));

    const res = await loadBudgetTimelineAction(projectId, wanted);
    if (res.ok) {
      setCells((c) => ({ ...c, ...res.cells }));
      setMonths((prev) => {
        const known = new Set(prev.map((m) => m.key));
        const fresh = res.months.filter((m) => !known.has(m.key));
        if (fresh.length === 0) return prev;
        if (side === "past") {
          // Ghi lại bề rộng cũ để giữ nguyên vị trí đang xem sau khi chèn.
          prependWidth.current = scrollRef.current?.scrollWidth ?? null;
          return [...fresh, ...prev];
        }
        return [...prev, ...fresh];
      });
    } else {
      setMsg(res.error);
    }
    loadingRef.current = false;
    setLoadingSide(null);
  }, [months, projectId]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollLeft < EDGE) void extend("past");
    else if (el.scrollWidth - el.clientWidth - el.scrollLeft < EDGE) void extend("future");
  }

  const scrollToAnchor = useCallback(() => {
    const el = scrollRef.current;
    const cell = el?.querySelector<HTMLElement>("[data-anchor='1']");
    if (!el || !cell) return;
    el.scrollLeft += cell.getBoundingClientRect().left - el.getBoundingClientRect().left - NAME_W - 8;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!didInit.current) {
      didInit.current = true;
      scrollToAnchor();
      return;
    }
    if (prependWidth.current != null) {
      el.scrollLeft += el.scrollWidth - prependWidth.current;
      prependWidth.current = null;
    }
  }, [months, scrollToAnchor]);

  /* ── lưu ───────────────────────────────────────────────────── */
  function saveAll() {
    startTransition(async () => {
      let n = 0;
      for (const key of dirty) {
        const [userId, mKey] = key.split("|");
        const [y, m] = mKey.split("-").map(Number);
        const hours = congToHours(edits[key] ?? 0);
        const res = await setBudgetAction(userId, projectId, y, m, hours, rateFor(userId, mKey));
        if (!res.ok) { setMsg(res.error ?? (ja ? "エラー" : "Error")); return; }
        n++;
      }
      // Đơn giá là giá trị "hiện hành" -> ghi vào tháng cơ sở đang chọn.
      for (const userId of rateDirty) {
        const hours = congToHours(effortOf(userId, anchorKey));
        const res = await setBudgetAction(
          userId, projectId, anchor.year, anchor.month, hours, rateEdits[userId] ?? 0,
        );
        if (!res.ok) { setMsg(res.error ?? (ja ? "エラー" : "Error")); return; }
        n++;
      }

      setCells((prev) => {
        const next = { ...prev };
        for (const key of dirty) {
          const effort = edits[key] ?? 0;
          const [userId, mKey] = key.split("|");
          next[key] = {
            ...(next[key] ?? EMPTY_CELL),
            effort,
            budgetHours: congToHours(effort),
            unitPriceMm: rateFor(userId, mKey),
          };
        }
        return next;
      });
      setDirty(new Set());
      setRateDirty(new Set());
      setMsg(ja ? `${n}件保存しました。` : `Saved ${n} cells.`);
      router.refresh();
    });
  }

  function savePeriod(userId: string, field: "startDate" | "endDate", value: string) {
    const current = periods[userId] ?? { startDate: null, endDate: null };
    const next = { ...current, [field]: value || null };
    setPeriods((s) => ({ ...s, [userId]: next }));
    setSavingPeriod((s) => new Set(s).add(userId));
    startTransition(async () => {
      const res = await setAssignmentPeriodAction(userId, projectId, next.startDate, next.endDate);
      setSavingPeriod((s) => { const n = new Set(s); n.delete(userId); return n; });
      if (!res.ok) setMsg(res.error ?? (ja ? "エラー" : "Error"));
    });
  }

  function selectProject(id: string) {
    const p = new URLSearchParams(params.toString());
    p.set("project", id);
    router.push(`${pathname}?${p.toString()}`);
  }

  const pendingCount = dirty.size + rateDirty.size;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <select
          className="select w-72 font-medium"
          value={projectId}
          onChange={(e) => selectProject(e.target.value)}
          aria-label={ja ? "プロジェクト" : "Project"}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </select>
        <button className="btn-secondary btn-sm" onClick={scrollToAnchor}>
          {ja ? `${anchor.year}年${String(anchor.month).padStart(2, "0")}月へ` : `Go to ${anchor.year}/${String(anchor.month).padStart(2, "0")}`}
        </button>
        <span className="text-xs text-slate-500">
          {canEdit
            ? (ja
              ? `月ごとの工数（0.5 / 1.0 / 1.2…）を入力。承認済みの月は実績を下に表示（実績 < 工数 は緑、超過は赤）。左右にスクロールすると過去・未来の月を読み込みます。`
              : `Enter the monthly effort (0.5 / 1.0 / 1.2…). Approved months show the actual below (green when actual < budget, red when over). Scroll sideways to load past / future months.`)
            : (ja
              ? `担当プロジェクトの工数と実績（承認済みの月のみ）。実績 < 工数 は緑、超過は赤。左右にスクロールすると過去・未来の月を読み込みます。`
              : `Effort and actuals (approved months only) for your projects. Green when actual < budget, red when over. Scroll sideways to load past / future months.`)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            className="input w-56"
            placeholder={ja ? "メンバーを検索…" : "Search members…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
          {canEdit ? (
            <button className="btn-primary" onClick={saveAll} disabled={busy || pendingCount === 0}>
              {busy ? t("saving") : `${t("save")}${pendingCount ? ` (${pendingCount})` : ""}`}
            </button>
          ) : (
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
              {ja ? "閲覧のみ" : "View only"}
            </span>
          )}
        </div>
      </div>

      <div className="card">
        <div ref={scrollRef} onScroll={onScroll} className="overflow-x-auto">
          <table className="data" style={{ minWidth: NAME_W + months.length * COL_W }}>
            <thead>
              <tr>
                <th
                  className="sticky left-0 top-0 z-30 border-r border-slate-200 bg-slate-100"
                  style={{ minWidth: NAME_W, width: NAME_W }}
                >
                  {t("membersTitle")}
                </th>
                {months.map((m) => {
                  const isAnchor = m.key === anchorKey;
                  return (
                    <th
                      key={m.key}
                      data-anchor={isAnchor ? "1" : undefined}
                      className={`text-center ${isAnchor ? "bg-brand-100 text-brand-800" : ""}`}
                      style={{ minWidth: COL_W, width: COL_W }}
                    >
                      <div className="num">{m.year}/{String(m.month).padStart(2, "0")}</div>
                      <div className="num text-[10px] font-normal text-slate-400">
                        {m.workingDays}d · {m.standardHours.toFixed(1)}h
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((m) => {
                const isOpen = expanded.has(m.userId);
                const period = periods[m.userId] ?? { startDate: m.startDate, endDate: m.endDate };
                const rate = rateEdits[m.userId] ?? m.unitPriceMm;
                return (
                  <Fragment key={m.userId}>
                    <tr>
                      <td className="sticky left-0 z-20 border-r border-slate-200 bg-white align-top" style={{ minWidth: NAME_W, width: NAME_W }}>
                        <div className="flex items-start gap-2">
                          <button
                            className="mt-0.5 text-slate-400 hover:text-slate-600"
                            onClick={() => toggleExpand(m.userId)}
                            aria-label={ja ? "詳細" : "Details"}
                          >
                            {isOpen ? "▾" : "▸"}
                          </button>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-700">{m.fullName}</span>
                              {!m.assigned && (
                                <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                  {ja ? "未アサイン" : "Not assigned"}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">{m.roleTitle ?? "—"}</div>
                          </div>
                        </div>
                        {isOpen && (
                          <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                            {canSeeMoney && (
                              <div>
                                <div className="label mb-1">
                                  {canEdit
                                    ? (ja ? `単価（${moneyUnit}/MM・${anchor.year}/${String(anchor.month).padStart(2, "0")}から適用）`
                                          : `Unit price (${moneyUnit}/MM, applies from ${anchor.year}/${String(anchor.month).padStart(2, "0")})`)
                                    : (ja ? `単価（${moneyUnit}/MM）` : `Unit price (${moneyUnit}/MM)`)}
                                </div>
                                {canEdit ? (
                                  <input
                                    type="number" min={0} step={1000}
                                    className={`input num w-40 text-right ${rateDirty.has(m.userId) ? "border-brand-400 bg-brand-50" : ""}`}
                                    value={rate === 0 ? "" : rate}
                                    placeholder={moneyUnit}
                                    onChange={(e) => setRate(m.userId, Number(e.target.value) || 0)}
                                  />
                                ) : (
                                  <div className="num text-sm text-slate-700">
                                    {rate > 0 ? rate.toLocaleString(ja ? "ja-JP" : "en-US") : "—"}
                                  </div>
                                )}
                              </div>
                            )}
                            <div>
                              <div className="label mb-1">
                                {ja ? "アサイン期間（空欄=無制限）" : "Assigned period (blank = no limit)"}
                              </div>
                              {canEdit ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="date"
                                    className="input w-[124px] text-xs"
                                    value={period.startDate ?? ""}
                                    onChange={(e) => savePeriod(m.userId, "startDate", e.target.value)}
                                  />
                                  <span className="text-slate-300">–</span>
                                  <input
                                    type="date"
                                    className="input w-[124px] text-xs"
                                    value={period.endDate ?? ""}
                                    onChange={(e) => savePeriod(m.userId, "endDate", e.target.value)}
                                  />
                                  {savingPeriod.has(m.userId) && (
                                    <span className="text-[10px] text-slate-400">{ja ? "保存中…" : "saving…"}</span>
                                  )}
                                </div>
                              ) : (
                                <div className="num text-sm text-slate-700">
                                  {period.startDate ?? "—"} – {period.endDate ?? (ja ? "継続中" : "ongoing")}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      {months.map((mo) => {
                        const key = `${m.userId}|${mo.key}`;
                        const cell = cells[key];
                        const effort = edits[key] ?? cell?.effort ?? 0;
                        const outside = isOutsidePeriod(mo, period);
                        return (
                          <td
                            key={mo.key}
                            className={`align-top ${mo.key === anchorKey ? "bg-brand-50/60" : outside ? "bg-slate-50/80" : ""}`}
                            style={{ minWidth: COL_W, width: COL_W }}
                          >
                            {canEdit ? (
                              <input
                                type="number" min={0} step={0.1}
                                className={`input num w-full text-right ${dirty.has(key) ? "border-brand-400 bg-brand-50" : ""}`}
                                value={effort === 0 ? "" : effort}
                                placeholder={ja ? "工数" : "effort"}
                                onChange={(e) => setEffort(m.userId, mo.key, Number(e.target.value) || 0)}
                              />
                            ) : (
                              <div className="num py-1.5 pr-1 text-right text-sm text-slate-700">
                                {effort > 0 ? effort.toFixed(2) : <span className="text-slate-300">—</span>}
                              </div>
                            )}
                            <ActualLine cell={cell} effort={effort} ja={ja} />
                          </td>
                        );
                      })}
                    </tr>
                  </Fragment>
                );
              })}

              {visibleRows.length === 0 && (
                <tr>
                  <td className="sticky left-0 z-20 border-r border-slate-200 bg-white" style={{ minWidth: NAME_W }}>
                    <span className="text-slate-400">{t("noData")}</span>
                  </td>
                  {months.map((mo) => <td key={mo.key} />)}
                </tr>
              )}

              <tr className="bg-slate-50 font-semibold">
                <td className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50" style={{ minWidth: NAME_W }}>
                  {ja ? "合計" : "Total"}
                </td>
                {months.map((mo) => {
                  let budget = 0;
                  let actual = 0;
                  for (const m of visibleRows) {
                    budget += effortOf(m.userId, mo.key);
                    const cell = cells[`${m.userId}|${mo.key}`];
                    if (cell?.status === "APPROVED") actual += cell.actualEffort;
                  }
                  return (
                    <td key={mo.key} className="text-right num" style={{ minWidth: COL_W }}>
                      <div>{budget > 0 ? round2(budget).toFixed(2) : "—"}</div>
                      <div className="text-[11px] font-normal text-slate-400">
                        {actual > 0 ? round2(actual).toFixed(2) : ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
          {canEdit && (
            <>
              <select
                className="select w-64"
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  setExtraMembers((s) => [...s, e.target.value]);
                  e.target.value = "";
                }}
              >
                <option value="">+ {ja ? "メンバーを追加" : "Add member"}</option>
                {allMembers
                  .filter((a) => !rows.some((r) => r.userId === a.userId))
                  .map((a) => <option key={a.userId} value={a.userId}>{a.fullName}</option>)}
              </select>
              <span>
                {ja
                  ? "工数 > 0 で保存するとこのPJにアサインされます。"
                  : "Saving an effort > 0 assigns the member to this project."}
              </span>
            </>
          )}
          <span className="ml-auto flex items-center gap-3">
            <span className="font-bold text-emerald-600">{ja ? "実績 < 工数" : "actual < budget"}</span>
            <span className="font-bold text-rose-600">{ja ? "実績 ≥ 工数" : "actual ≥ budget"}</span>
            {loadingSide && <span>{ja ? "読み込み中…" : "loading…"}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 実績 chỉ hiện khi tháng đó đã được 承認; chưa duyệt thì để trống. */
function ActualLine({ cell, effort, ja }: { cell?: TimelineCell; effort: number; ja: boolean }) {
  if (!cell) return <div className="h-4" />;
  if (cell.status !== "APPROVED") {
    return (
      <div className="h-4 text-right text-[10px] text-slate-300">
        {cell.status === "SUBMITTED" ? (ja ? "承認待ち" : "pending") : ""}
      </div>
    );
  }
  const actual = round2(cell.actualEffort);
  const budget = round2(effort);
  if (actual === 0 && budget === 0) return <div className="h-4" />;
  const under = actual < budget;
  return (
    <div
      className={`h-4 text-right num text-[11px] font-bold ${under ? "text-emerald-600" : "text-rose-600"}`}
      title={ja ? `実績 ${cell.actualHours.toFixed(1)}h` : `Actual ${cell.actualHours.toFixed(1)}h`}
    >
      {actual.toFixed(2)}
    </div>
  );
}

function isOutsidePeriod(m: TimelineMonth, period: { startDate: string | null; endDate: string | null }) {
  const first = `${m.key}-01`;
  const last = `${m.key}-31`;
  if (period.startDate && period.startDate > last) return true;
  if (period.endDate && period.endDate < first) return true;
  return false;
}

function monthKeyOf(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function congToHours(cong: number) {
  const normalized = Number.isFinite(cong) ? Math.max(0, cong) : 0;
  return round2(normalized * HOURS_PER_CONG);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
