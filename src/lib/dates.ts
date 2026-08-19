/** Tiện ích ngày tháng — mọi thứ chạy theo lịch địa phương của tháng đang xử lý,
 *  không dùng UTC để tránh lệch ngày. */

export const WEEKDAY_JA = ["月", "火", "水", "木", "金", "土", "日"] as const;
export const WEEKDAY_VI = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

/** yyyy-mm-dd */
export type DateStr = string;

export function ymd(year: number, month: number, day: number): DateStr {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseYmd(s: DateStr): { year: number; month: number; day: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { year: y, month: m, day: d };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 0 = Thứ 2 … 6 = Chủ nhật */
export function mondayIndex(year: number, month: number, day: number): number {
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
}

/** Số thứ tự tuần trong tháng (1-6), theo đúng cách bố trí sheet 1週~6週. */
export function weekOfMonth(year: number, month: number, day: number): number {
  const offset = mondayIndex(year, month, 1);
  return Math.floor((day - 1 + offset) / 7) + 1;
}

/** Số tuần (sheet) cần dùng cho tháng: 4, 5 hoặc 6. */
export function weekCount(year: number, month: number): number {
  return weekOfMonth(year, month, daysInMonth(year, month));
}

export interface WeekBlock {
  index: number;                 // 1..6
  days: (number | null)[];       // 7 phần tử, index 0 = Thứ 2; null = không thuộc tháng
}

export function weekBlocks(year: number, month: number): WeekBlock[] {
  const total = daysInMonth(year, month);
  const offset = mondayIndex(year, month, 1);
  const blocks: WeekBlock[] = [];
  for (let w = 1; w <= weekCount(year, month); w++) {
    const days: (number | null)[] = Array(7).fill(null);
    for (let d = 1; d <= total; d++) {
      const pos = d - 1 + offset;
      if (Math.floor(pos / 7) + 1 === w) days[pos % 7] = d;
    }
    blocks.push({ index: w, days });
  }
  return blocks;
}

export function isWeekend(year: number, month: number, day: number): boolean {
  const i = mondayIndex(year, month, day);
  return i === 5 || i === 6;
}

/* ───────────────── giờ ↔ phút ───────────────── */

export function minToHHMM(min: number | null | undefined): string {
  if (min == null) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMin(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 47 || mi > 59) return null;
  return h * 60 + mi;
}

/** Giờ làm thực tế của một ngày = 終業 − 始業 − 休憩 (đơn vị: giờ, 2 số lẻ). */
export function workedHours(
  startMin: number | null,
  endMin: number | null,
  breakMin: number,
): number {
  if (startMin == null || endMin == null) return 0;
  let span = endMin - startMin;
  if (span < 0) span += 24 * 60; // ca qua đêm
  const net = span - (breakMin ?? 0);
  return net > 0 ? Math.round((net / 60) * 100) / 100 : 0;
}

/** Excel lưu thời gian là phân số của một ngày. */
export function minToExcelTime(min: number): number {
  return min / 1440;
}

export function hoursToExcelTime(hours: number): number {
  return hours / 24;
}

export function monthLabel(year: number, month: number): string {
  return `${year}年${String(month).padStart(2, "0")}月`;
}

export function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function todayParts() {
  const n = new Date();
  return { year: n.getFullYear(), month: n.getMonth() + 1, day: n.getDate() };
}
