import ExcelJS from "exceljs";
import type { OverviewRow, PeriodOverview } from "@/lib/adminData";
import { calcBillingByProjects } from "@/lib/billing";
import { currencySymbol, type BillingCurrency } from "@/lib/currency";

/**
 * File này dùng exceljs (không phải "xlsx") vì cần tô màu/border/freeze pane
 * thật sự cho một bảng tính TẠO MỚI — bản "xlsx" (SheetJS) miễn phí ghi được
 * number format nhưng bỏ qua toàn bộ style khi ghi file mới (đã test thực tế
 * bằng cách unzip file xuất ra: font/fill không được lưu). 週報 vẫn dùng
 * XlsxTemplate riêng vì đó là patch trực tiếp lên template có sẵn.
 */

const HEADER_FILL = "FF1E293B";  // slate-800
const HEADER_FONT = "FFFFFFFF";
const TOTAL_FILL = "FFCBD5E1";    // slate-300
const BORDER_COLOR = "FFCBD5E1";
const POSITIVE_COLOR = "FF15803D"; // emerald-700
const NEGATIVE_COLOR = "FFB91C1C"; // rose-700
const NOTE_COLOR = "FF64748B";     // slate-500

const thinBorder = { style: "thin" as const, color: { argb: BORDER_COLOR } };
const allBorders = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

export async function buildBillingWorkbook(year: number, month: number, rows: OverviewRow[]) {
  const title = `${year}/${String(month).padStart(2, "0")} Customer Billing`;
  return buildWorkbookCore(title, [{ period: { year, month }, rows }], "JPY");
}

export async function buildBillingWorkbookWithLabel(
  periodLabel: string,
  periodsData: PeriodOverview[],
  currency: BillingCurrency,
) {
  return buildWorkbookCore(`${periodLabel} Customer Billing`, periodsData, currency);
}

function periodLabel(p: { year: number; month: number }) {
  return `${p.year}/${String(p.month).padStart(2, "0")}`;
}

/**
 * Mỗi tháng được lọc theo project (nếu có) và tính billing RIÊNG (factor,
 * 下限/上限, adjustment tính theo đúng dữ liệu tháng đó) rồi mới cộng lại
 * thành TOTAL — không gộp nhiều tháng thành 1 factor trước khi tính, vì làm
 * vậy sẽ bù trừ tháng thiếu giờ với tháng dư giờ, sai với thực tế từng
 * tháng. Xuất theo từng dòng/tháng (không có dòng subtotal xen giữa) để
 * khách hàng so sánh trực tiếp với file estimation của họ (cũng ghi theo
 * từng tháng), và để dòng TOTAL cộng bằng công thức SUM liên tục.
 */
async function buildWorkbookCore(title: string, periodsData: PeriodOverview[], currency: BillingCurrency) {
  const moneyUnit = currencySymbol(currency);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Timesheet";
  wb.created = new Date();

  interface Line { month: string; row: OverviewRow; calc: ReturnType<typeof calcBillingByProjects> }
  const byMember = new Map<string, { fullName: string; lines: Line[] }>();

  for (const { period, rows } of periodsData) {
    for (const row of rows) {
      if (row.usedHours <= 0 && row.attendanceHours <= 0) continue;
      const calc = calcBillingByProjects(
        row.usedHours,
        row.billingFactor,
        row.byProject.map((p) => ({ projectId: p.projectId, hours: p.used, unitPriceMm: p.unitPriceMm })),
        row.billingUnitPrice,
      );
      if (!byMember.has(row.userId)) byMember.set(row.userId, { fullName: row.fullName, lines: [] });
      byMember.get(row.userId)!.lines.push({ month: periodLabel(period), row, calc });
    }
  }
  const members = [...byMember.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));

  /* ─────────────────────────── Sheet 1: 稼働情報 ─────────────────────────── */

  const ws = wb.addWorksheet("稼働情報", { views: [{ state: "frozen", ySplit: 5 }] });
  const cols = [
    { key: "no", width: 6 },
    { key: "month", width: 10 },
    { key: "member", width: 24 },
    { key: "factor", width: 9 },
    { key: "unitPrice", width: 14 },
    { key: "actual", width: 11 },
    { key: "lower", width: 11 },
    { key: "upper", width: 11 },
    { key: "shortage", width: 11 },
    { key: "overtime", width: 11 },
    { key: "adjustHours", width: 12 },
    { key: "adjustMm", width: 11 },
    { key: "adjustAmount", width: 16 },
    { key: "status", width: 12 },
  ];
  ws.columns = cols;
  const colCount = cols.length;

  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14 };
  ws.getRow(1).height = 22;

  ws.mergeCells(2, 1, 2, colCount);
  ws.getCell(2, 1).value = "Rule: < 140h × factor → deduct  /  > 180h × factor → charge  /  140h〜180h → no adjustment";
  ws.getCell(2, 1).font = { italic: true, color: { argb: NOTE_COLOR } };

  ws.mergeCells(3, 1, 3, colCount);
  ws.getCell(3, 1).value = `Note: if unit price (${moneyUnit}/MM) = 0, adjustment amount = 0. Each month is calculated separately using that month's own factor, then summed per member — compare directly against the customer's month-by-month estimation file.`;
  ws.getCell(3, 1).font = { italic: true, color: { argb: NOTE_COLOR }, size: 10 };
  ws.getRow(3).height = 26;
  ws.getCell(3, 1).alignment = { wrapText: true, vertical: "top" };

  const headerRow = ws.getRow(5);
  headerRow.values = [
    "No", "Month", "Member", "Factor", `Unit Price (${moneyUnit}/MM)`, "Actual Hours",
    "Lower Bound", "Upper Bound", "Shortage Hours", "Overtime Hours",
    "Adjustment Hours", "Adjustment MM", `Adjustment Amount (${moneyUnit})`, "Status",
  ];
  styleHeaderRow(headerRow, colCount);
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: colCount } };

  const hourFmt = '0.00"h"';
  const moneyFmt = `#,##0"${moneyUnit}"`;

  let no = 1;
  let rowIdx = 6;
  let sumActual = 0, sumShortage = 0, sumOvertime = 0, sumAdjustHours = 0, sumAdjustMm = 0, sumAmount = 0;
  let countUnder = 0, countOver = 0, countMissingPrice = 0;

  const dataStart = rowIdx;

  for (const member of members) {
    member.lines.sort((a, b) => a.month.localeCompare(b.month));

    for (const line of member.lines) {
      const { row, calc, month } = line;
      const r = ws.getRow(rowIdx);
      r.getCell(1).value = no++;
      r.getCell(2).value = month;
      r.getCell(3).value = row.fullName;
      r.getCell(4).value = row.billingFactor;
      r.getCell(5).value = calc.weightedUnitPrice;
      r.getCell(6).value = row.usedHours;
      r.getCell(7).value = { formula: `140*D${rowIdx}`, result: calc.lowerHours };
      r.getCell(8).value = { formula: `180*D${rowIdx}`, result: calc.upperHours };
      r.getCell(9).value = { formula: `MAX(0,G${rowIdx}-F${rowIdx})`, result: calc.shortageHours };
      r.getCell(10).value = { formula: `MAX(0,F${rowIdx}-H${rowIdx})`, result: calc.overtimeHours };
      r.getCell(11).value = { formula: `J${rowIdx}-I${rowIdx}`, result: calc.adjustmentHours };
      r.getCell(12).value = { formula: `K${rowIdx}/180`, result: calc.adjustmentMm };
      r.getCell(13).value = { formula: `L${rowIdx}*E${rowIdx}`, result: calc.adjustmentAmount };
      r.getCell(14).value = row.status;

      r.getCell(4).numFmt = "0.00";
      r.getCell(5).numFmt = moneyFmt;
      for (const c of [6, 7, 8, 9, 10, 11]) r.getCell(c).numFmt = hourFmt;
      r.getCell(12).numFmt = "0.0000";
      r.getCell(13).numFmt = moneyFmt;
      r.getCell(13).font = { color: { argb: calc.adjustmentAmount < 0 ? NEGATIVE_COLOR : calc.adjustmentAmount > 0 ? POSITIVE_COLOR : undefined }, bold: calc.adjustmentAmount !== 0 };
      applyRowBorder(r, colCount);

      sumActual += row.usedHours;
      sumShortage += calc.shortageHours;
      sumOvertime += calc.overtimeHours;
      sumAdjustHours += calc.adjustmentHours;
      sumAdjustMm += calc.adjustmentMm;
      sumAmount += calc.adjustmentAmount;
      if (calc.band === "UNDER") countUnder++;
      else if (calc.band === "OVER") countOver++;
      if (calc.weightedUnitPrice <= 0) countMissingPrice++;
      rowIdx++;
    }
  }

  const dataEnd = rowIdx - 1;
  const totalRow = ws.getRow(rowIdx);
  totalRow.getCell(1).value = "TOTAL";
  if (dataEnd >= dataStart) {
    totalRow.getCell(6).value = { formula: `SUM(F${dataStart}:F${dataEnd})`, result: round2(sumActual) };
    totalRow.getCell(9).value = { formula: `SUM(I${dataStart}:I${dataEnd})`, result: round2(sumShortage) };
    totalRow.getCell(10).value = { formula: `SUM(J${dataStart}:J${dataEnd})`, result: round2(sumOvertime) };
    totalRow.getCell(11).value = { formula: `SUM(K${dataStart}:K${dataEnd})`, result: round2(sumAdjustHours) };
    totalRow.getCell(12).value = { formula: `SUM(L${dataStart}:L${dataEnd})`, result: round4(sumAdjustMm) };
    totalRow.getCell(13).value = { formula: `SUM(M${dataStart}:M${dataEnd})`, result: round0(sumAmount) };
  }
  totalRow.getCell(6).numFmt = hourFmt;
  for (const c of [9, 10, 11]) totalRow.getCell(c).numFmt = hourFmt;
  totalRow.getCell(12).numFmt = "0.0000";
  totalRow.getCell(13).numFmt = moneyFmt;
  for (let c = 1; c <= colCount; c++) {
    totalRow.getCell(c).font = { bold: true };
    totalRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
    totalRow.getCell(c).border = { ...allBorders, top: { style: "double", color: { argb: BORDER_COLOR } } };
  }

  // Bảng thống kê nhỏ bên phải
  const statCol = colCount + 2;
  const stats: [string, number][] = [
    ["Members under lower bound", countUnder],
    ["Members over upper bound", countOver],
    ["Members with unit price = 0", countMissingPrice],
    ["Total adjustment amount", round0(sumAmount)],
  ];
  stats.forEach(([label, value], i) => {
    const r = 2 + i;
    ws.getCell(r, statCol).value = label;
    ws.getCell(r, statCol).font = { bold: true, size: 10 };
    ws.getCell(r, statCol + 1).value = value;
    if (label === "Total adjustment amount") ws.getCell(r, statCol + 1).numFmt = moneyFmt;
  });
  ws.getColumn(statCol).width = 28;
  ws.getColumn(statCol + 1).width = 14;

  /* ─────────────────────────── Sheet 2: 契約工数 ─────────────────────────── */

  const ws2 = wb.addWorksheet("契約工数", { views: [{ state: "frozen", ySplit: 1 }] });
  ws2.columns = [
    { key: "no", width: 6 },
    { key: "month", width: 10 },
    { key: "member", width: 24 },
    { key: "code", width: 14 },
    { key: "name", width: 32 },
    { key: "budget", width: 12 },
    { key: "used", width: 12 },
    { key: "diff", width: 14 },
  ];
  const headerRow2 = ws2.getRow(1);
  headerRow2.values = ["No", "Month", "Member", "Project Code", "Project Name", "Budget Hours", "Used Hours", "Diff (Used-Budget)"];
  styleHeaderRow(headerRow2, 8);
  ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };

  let idx = 1;
  let dRow = 2;
  for (const { period, rows } of periodsData) {
    for (const row of rows) {
      for (const p of row.byProject) {
        const r = ws2.getRow(dRow);
        const diff = round2(p.used - p.budget);
        r.getCell(1).value = idx++;
        r.getCell(2).value = periodLabel(period);
        r.getCell(3).value = row.fullName;
        r.getCell(4).value = p.code;
        r.getCell(5).value = p.name;
        r.getCell(6).value = p.budget;
        r.getCell(7).value = p.used;
        r.getCell(8).value = { formula: `G${dRow}-F${dRow}`, result: diff };
        r.getCell(6).numFmt = hourFmt;
        r.getCell(7).numFmt = hourFmt;
        r.getCell(8).numFmt = hourFmt;
        r.getCell(8).font = { color: { argb: diff < 0 ? NEGATIVE_COLOR : diff > 0 ? POSITIVE_COLOR : undefined } };
        applyRowBorder(r, 8);
        dRow++;
      }
    }
  }
  if (dRow === 2) {
    ws2.getCell(2, 5).value = "No project data";
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

function styleHeaderRow(row: ExcelJS.Row, colCount: number) {
  row.height = 20;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = allBorders;
  }
}

function applyRowBorder(row: ExcelJS.Row, colCount: number) {
  for (let c = 1; c <= colCount; c++) row.getCell(c).border = allBorders;
}

function round0(n: number) {
  return Math.round(n);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

export function billingFileName(year: number, month: number) {
  return `稼働情報_${year}年${String(month).padStart(2, "0")}月.xlsx`;
}
