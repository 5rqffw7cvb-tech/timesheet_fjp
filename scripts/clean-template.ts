/**
 * Tạo template sạch từ file 週報 gốc: xoá hết dữ liệu cá nhân + số giờ mẫu,
 * giữ nguyên toàn bộ format, công thức và các sheet master.
 * Chạy: npx tsx scripts/clean-template.ts <file-goc.xlsx> <file-template.xlsx>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { XlsxTemplate, type CellValue } from "../src/lib/excel/xlsx";

const DAY_COLS = ["I", "K", "M", "O", "Q", "S", "U"];
const src = process.argv[2] ?? "templates/weekly-report-template.xlsx";
const dst = process.argv[3] ?? "templates/weekly-report-template.xlsx";

const wb = XlsxTemplate.load(new Uint8Array(readFileSync(src)));

for (let w = 1; w <= 6; w++) {
  const clear: Record<string, CellValue> = {};
  for (const col of DAY_COLS) {
    for (const row of [10, 11, 12, 58]) clear[`${col}${row}`] = null;
  }
  for (let i = 1; i <= 20; i++) {
    const pr = 15 + (i - 1) * 2;
    const ar = pr + 1;
    clear[`B${ar}`] = null;
    clear[`D${ar}`] = null;
    clear[`E${pr}`] = null;
    clear[`E${ar}`] = null;
    for (const col of DAY_COLS) { clear[`${col}${pr}`] = null; clear[`${col}${ar}`] = null; }
  }
  for (const r of [61, 62, 63, 64, 65, 68, 69, 70, 71, 72, 75, 76, 77, 78, 79]) {
    clear[`B${r}`] = null; clear[`J${r}`] = null;
  }
  wb.setMany(`${w}週`, clear);
}

// header + thông tin cá nhân
wb.setMany("1週", { B3: null, C3: null, C6: null, C7: null, D7: null });

// 月間集計シート: danh sách mã project và 所定日数
const agg: Record<string, CellValue> = { X4: null };
for (let i = 0; i < 20; i++) agg[`I${4 + i}`] = null;
wb.setMany("月間集計シート", agg);

// 勤務報告書: cột 公休 / 休暇 / 備考
const rep: Record<string, CellValue> = {};
for (let d = 1; d <= 31; d++) { rep[`U${8 + d}`] = null; rep[`F${8 + d}`] = null; rep[`N${8 + d}`] = null; }
wb.setMany("勤務報告書", rep);

writeFileSync(dst, wb.save());
console.log(`Đã tạo template sạch: ${dst}`);
