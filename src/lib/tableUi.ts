export type SortDir = "asc" | "desc";

export interface SortState {
  key: string;
  dir: SortDir;
}

export function toggleSort(state: SortState, key: string): SortState {
  if (state.key !== key) return { key, dir: "asc" };
  return { key, dir: state.dir === "asc" ? "desc" : "asc" };
}

export function compareText(a: string | number | boolean | null | undefined, b: string | number | boolean | null | undefined) {
  const av = normalizeValue(a);
  const bv = normalizeValue(b);
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
}

export function compareNumber(a: number | null | undefined, b: number | null | undefined) {
  const av = a ?? 0;
  const bv = b ?? 0;
  return av - bv;
}

export function containsText(haystack: string | number | boolean | null | undefined, needle: string) {
  const s = normalizeValue(haystack);
  return s.includes(needle.trim().toLowerCase());
}

export function sortRows<T>(rows: T[], state: SortState, getter: (row: T) => string | number | boolean | null | undefined) {
  const factor = state.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => compare(getter(a), getter(b)) * factor);
}

function compare(a: string | number | boolean | null | undefined, b: string | number | boolean | null | undefined) {
  const av = normalizeValue(a);
  const bv = normalizeValue(b);
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
}

function normalizeValue(v: string | number | boolean | null | undefined) {
  if (v == null) return "";
  return String(v).trim().toLowerCase();
}
