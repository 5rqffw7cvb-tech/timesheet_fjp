/**
 * Đổ dữ liệu từ DB vào template 週報_FPTジャパン_〇〇_〇〇〇〇年〇〇月.xlsx
 *
 * Chỉ ghi vào các ô nhập của 6 sheet tuần (1週～6週) + vài ô cấu hình.
 * 月間集計シート và 勤務報告書 hoàn toàn là công thức tham chiếu sang các sheet
 * tuần, nên Excel tự tính lại khi mở file — không cần ghi gì vào đó.
 */
import { XlsxTemplate, type CellValue } from "./xlsx";
import { daysInMonth, mondayIndex, weekCount } from "../dates";

/** Cột của 7 ngày trong tuần trên sheet tuần: 月 火 水 木 金 土 日 */
export const DAY_COLS = ["I", "K", "M", "O", "Q", "S", "U"] as const;
/** Cột thứ 2 của mỗi vùng merge (I:J, K:L, …) */
const DAY_COLS_2 = ["J", "L", "N", "P", "R", "T", "V"] as const;

const ROW_START = 10;   // 始業
const ROW_END = 11;     // 終業
const ROW_BREAK = 12;   // 休憩・外出時間
const ROW_ATTEND = 58;  // 勤務欄
const MAX_ITEMS = 20;   // sheet tuần chứa tối đa 20 dòng công việc
const MAX_WEEKS = 6;

export const MAX_TASK_ROWS = MAX_ITEMS;
/** 月間集計シート chỉ có 20 ô nhập mã project (I4:I23) */
export const MAX_PROJECT_CODES = 20;

const planRow = (i: number) => 15 + (i - 1) * 2;
const actRow = (i: number) => 16 + (i - 1) * 2;

/* ────────────────────────── kiểu dữ liệu vào ────────────────────────── */

export interface ExportTaskRow {
  projectCode: string;
  workTypeName: string;
  planDescription: string;
  actualDescription: string;
  /** 7 phần tử, index 0 = Thứ 2. Đơn vị: giờ. */
  planHours: number[];
  actualHours: number[];
}

export interface ExportDay {
  /** ngày trong tháng (1..31) */
  day: number;
  startMin: number | null;
  endMin: number | null;
  breakMin: number;
  attendanceNote: string | null;   // 全休 / 午前休 / 遅刻30分 …
}

export interface ExportWeek {
  index: number;                   // 1..6
  rows: ExportTaskRow[];
  internalIssue?: string;
  internalAction?: string;
  externalIssue?: string;
  otherNote?: string;
}

export interface ExportMasterProject {
  systemCode: string;
  systemName: string;
  code: string;
  name: string;
}

export interface ExportMasterWorkType {
  code: string;
  name: string;
  note?: string | null;
}

export interface WeeklyReportData {
  year: number;
  month: number;
  companyName: string;      // 会社名  (C6)
  memberName: string;       // 氏名    (C7)
  roleTitle: string;        // 役割    (D7)
  workingDays: number;      // 所定日数 (月間集計シート!X4)
  /** Thông tin theo project — in tại 勤務報告書!F3〜F6. */
  clientCompany: string;    // 会社名   (勤務報告書!F3)
  orgUnit: string;          // 組織単位 (勤務報告書!F4)
  workplace: string;        // 就業場所 (勤務報告書!F5)
  workName: string;         // 就業した業務 (勤務報告書!F6)
  days: ExportDay[];
  weeks: ExportWeek[];
  projectCodes: string[];   // 月間集計シート!I4:I23
  /** ngày nghỉ lễ trong tháng -> cột 公休 của 勤務報告書 */
  publicHolidays: number[];
  /** ngày nghỉ phép -> cột 休暇 của 勤務報告書 */
  leaves: { day: number; label: string }[];
  /** ghi chú -> cột 備考 của 勤務報告書 */
  remarks: { day: number; text: string }[];
  masterProjects?: ExportMasterProject[];
  masterWorkTypes?: ExportMasterWorkType[];
}

export interface BuildResult {
  buffer: Uint8Array;
  warnings: string[];
}

/* ────────────────────────── build ────────────────────────── */

const hoursToDayFraction = (h: number) => (h > 0 ? h / 24 : null);
const minToDayFraction = (m: number | null) => (m == null ? null : m / 1440);

export function buildWeeklyReport(
  template: Uint8Array,
  data: WeeklyReportData,
): BuildResult {
  const warnings: string[] = [];
  const wb = XlsxTemplate.load(template);
  const sheetOf = (w: number) => `${w}週`;

  /* 1. Xoá sạch dữ liệu mẫu còn sót trong template */
  for (let w = 1; w <= MAX_WEEKS; w++) {
    const sheet = sheetOf(w);
    const clear: Record<string, CellValue> = {};
    for (const col of DAY_COLS) {
      clear[`${col}${ROW_START}`] = null;
      clear[`${col}${ROW_END}`] = null;
      clear[`${col}${ROW_BREAK}`] = null;
      clear[`${col}${ROW_ATTEND}`] = null;
    }
    for (let i = 1; i <= MAX_ITEMS; i++) {
      const pr = planRow(i);
      const ar = actRow(i);
      clear[`B${ar}`] = null;
      clear[`D${ar}`] = null;
      clear[`E${pr}`] = null;
      clear[`E${ar}`] = null;
      for (const col of DAY_COLS) {
        clear[`${col}${pr}`] = null;
        clear[`${col}${ar}`] = null;
      }
    }
    for (const r of [61, 62, 63, 64, 65, 68, 69, 70, 71, 72, 75, 76, 77, 78, 79]) {
      clear[`B${r}`] = null;
      clear[`J${r}`] = null;
    }
    wb.setMany(sheet, clear);
  }

  /*
   * 2. Header. Bản thân 2週〜6週, 月間集計シート, 勤務報告書 đều lấy company/tên/
   * năm/tháng qua công thức tham chiếu (trực tiếp hoặc gián tiếp qua nhiều
   * lớp) về đúng 4 ô này trên 1週 — Excel chỉ tính lại công thức đó khi mở ở
   * chế độ chỉnh sửa đầy đủ. Ở 保護ビュー (Protected View), Excel KHÔNG tính
   * lại trước khi người dùng bấm "編集を有効にする", nên các ô công thức đó
   * vẫn hiện giá trị đã cache sẵn trong file mẫu (VD tên cũ, hoặc rỗng) —
   * xem 就業報告書!N6. Để hiển thị đúng ngay cả khi chưa bấm gì, ghi thẳng
   * giá trị thật (không qua công thức) vào từng nơi lặp lại này.
   */
  wb.setMany("1週", {
    B3: data.year,
    C3: data.month,
    C6: data.companyName,
    C7: data.memberName,
    D7: data.roleTitle || null,
  });
  for (let w = 2; w <= MAX_WEEKS; w++) {
    wb.setMany(sheetOf(w), {
      B3: data.year,
      C3: data.month,
      C6: data.companyName,
      C7: data.memberName,
    });
  }
  wb.setMany("月間集計シート", {
    B29: data.companyName,
    C29: data.memberName,
  });
  wb.setMany("勤務報告書", {
    N5: data.companyName,
    N6: data.memberName,
  });

  /* 3. Giờ vào / ra / nghỉ + 勤務欄 theo từng ngày */
  const total = daysInMonth(data.year, data.month);
  const offset = mondayIndex(data.year, data.month, 1);
  const dayMap = new Map(data.days.map((d) => [d.day, d]));

  for (let day = 1; day <= total; day++) {
    const pos = day - 1 + offset;
    const week = Math.floor(pos / 7) + 1;
    const col = DAY_COLS[pos % 7];
    const info = dayMap.get(day);
    if (!info) continue;
    const sheet = sheetOf(week);
    wb.setMany(sheet, {
      [`${col}${ROW_START}`]: minToDayFraction(info.startMin),
      [`${col}${ROW_END}`]: minToDayFraction(info.endMin),
      [`${col}${ROW_BREAK}`]: info.startMin == null ? null : minToDayFraction(info.breakMin),
      [`${col}${ROW_ATTEND}`]: info.attendanceNote || null,
    });
  }

  /* 4. Các dòng công việc của từng tuần */
  const usedWeeks = weekCount(data.year, data.month);
  for (const week of data.weeks) {
    if (week.index > usedWeeks) continue;
    const sheet = sheetOf(week.index);
    const rows = week.rows.slice(0, MAX_ITEMS);
    if (week.rows.length > MAX_ITEMS) {
      warnings.push(
        `Week ${week.index}: ${week.rows.length} project×工種 combinations, template only holds ${MAX_ITEMS}. ${week.rows.length - MAX_ITEMS} row(s) were skipped.`,
      );
    }

    const mergeRefs: string[] = [];
    rows.forEach((row, idx) => {
      const i = idx + 1;
      const pr = planRow(i);
      const ar = actRow(i);
      const values: Record<string, CellValue> = {
        [`B${ar}`]: Number.isFinite(Number(row.projectCode))
          ? Number(row.projectCode)
          : row.projectCode,
        [`D${ar}`]: row.workTypeName,
        [`E${pr}`]: row.planDescription || null,
        [`E${ar}`]: row.actualDescription || null,
      };
      for (let d = 0; d < 7; d++) {
        values[`${DAY_COLS[d]}${pr}`] = hoursToDayFraction(row.planHours[d] ?? 0);
        values[`${DAY_COLS[d]}${ar}`] = hoursToDayFraction(row.actualHours[d] ?? 0);
        mergeRefs.push(`${DAY_COLS[d]}${pr}:${DAY_COLS_2[d]}${pr}`);
      }
      wb.setMany(sheet, values);
    });
    wb.merge(sheet, mergeRefs);

    const notes: Record<string, CellValue> = {};
    if (week.internalIssue) notes.B61 = week.internalIssue;
    if (week.internalAction) notes.J61 = week.internalAction;
    if (week.externalIssue) notes.B68 = week.externalIssue;
    if (week.otherNote) notes.B75 = week.otherNote;
    if (Object.keys(notes).length) wb.setMany(sheet, notes);
  }

  /* 5. 月間集計シート — danh sách mã project cần tổng hợp + 所定日数 */
  const codes = [...new Set(data.projectCodes)];
  if (codes.length > MAX_PROJECT_CODES) {
    warnings.push(
      `This month uses ${codes.length} projects, but 月間集計シート can only aggregate ${MAX_PROJECT_CODES}.`,
    );
  }
  const agg: Record<string, CellValue> = { X4: data.workingDays || null };
  for (let i = 0; i < MAX_PROJECT_CODES; i++) {
    const code = codes[i];
    agg[`I${4 + i}`] = code == null ? null
      : Number.isFinite(Number(code)) ? Number(code) : code;
  }
  wb.setMany("月間集計シート", agg);

  /* 6. 勤務報告書 — 就業先情報 (会社名/組織単位/就業場所/就業した業務) + 公休 / 休暇 / 備考 */
  wb.setMany("勤務報告書", {
    F3: data.clientCompany || null,
    F4: data.orgUnit || null,
    F5: data.workplace || null,
    F6: data.workName || null,
  });

  const report: Record<string, CellValue> = {};
  for (let day = 1; day <= 31; day++) {
    report[`U${8 + day}`] = null;
    report[`F${8 + day}`] = null;
    report[`N${8 + day}`] = null;
  }
  for (const day of data.publicHolidays) report[`U${8 + day}`] = "公休";
  for (const l of data.leaves) report[`F${8 + l.day}`] = l.label;
  for (const r of data.remarks) report[`N${8 + r.day}`] = r.text;
  wb.setMany("勤務報告書", report);

  /* 7. Đồng bộ master PJ / 工種 để công thức INDEX-MATCH trong template khớp */
  if (data.masterProjects?.length) {
    const rows = data.masterProjects;
    const values: Record<string, CellValue> = {};
    // sheet PJ: dòng 1 trống, dòng 2 là header, dữ liệu bắt đầu từ dòng 3
    rows.forEach((p, i) => {
      const r = i + 3;
      values[`A${r}`] = numOrText(p.systemCode);
      values[`B${r}`] = p.systemName;
      values[`C${r}`] = numOrText(p.code);
      values[`D${r}`] = p.name;
    });
    wb.setMany("PJ", values);
  }
  if (data.masterWorkTypes?.length) {
    const rows = data.masterWorkTypes;
    if (rows.length > 82) {
      warnings.push(
        `Master 工種 has ${rows.length} rows, but the template formula only looks up to row 83 (82 codes). Extra codes won't resolve コード.`,
      );
    }
    const values: Record<string, CellValue> = {};
    rows.slice(0, 82).forEach((w, i) => {
      const r = i + 2;
      values[`A${r}`] = numOrText(w.code);
      values[`B${r}`] = w.name;
      values[`C${r}`] = w.note ?? null;
    });
    wb.setMany("工種", values);
  }

  return { buffer: wb.save(), warnings };
}

function numOrText(v: string): CellValue {
  return Number.isFinite(Number(v)) && v.trim() !== "" ? Number(v) : v;
}

/**
 * 週報_FPTジャパン_ThienLN1_2026年07月.xlsx
 * projectCode chỉ thêm khi member có nhiều project trong tháng, để phân biệt
 * các file xuất riêng cho từng project.
 */
export function reportFileName(
  companyName: string,
  memberKey: string,
  year: number,
  month: number,
  projectCode?: string,
): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_").trim();
  const suffix = projectCode ? `_${safe(projectCode)}` : "";
  return `週報_${safe(companyName)}_${safe(memberKey)}_${year}年${String(month).padStart(2, "0")}月${suffix}.xlsx`;
}
