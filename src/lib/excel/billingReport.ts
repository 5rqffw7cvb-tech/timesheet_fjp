import * as XLSX from "xlsx";
import type { OverviewRow, PeriodOverview } from "@/lib/adminData";
import { calcBillingByProjects } from "@/lib/billing";
import { currencySymbol, type BillingCurrency } from "@/lib/currency";

export function buildBillingWorkbook(year: number, month: number, rows: OverviewRow[]) {
  const title = `${year}/${String(month).padStart(2, "0")} Customer Billing`;
  return buildWorkbookCore(title, [{ period: { year, month }, rows }], "JPY");
}

export function buildBillingWorkbookWithLabel(
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
 * thành subtotal/total — không gộp nhiều tháng thành 1 factor trước khi
 * tính, vì làm vậy sẽ bù trừ tháng thiếu giờ với tháng dư giờ, sai với thực
 * tế từng tháng. Xuất theo từng dòng/tháng để khách hàng so sánh trực tiếp
 * với file estimation của họ (cũng ghi theo từng tháng).
 */
function buildWorkbookCore(title: string, periodsData: PeriodOverview[], currency: BillingCurrency) {
  const wb = XLSX.utils.book_new();
  const moneyUnit = currencySymbol(currency);
  const isMulti = periodsData.length > 1;

  const summary: any[][] = [
    [title],
    ["Rule", "< 140h * factor: deduct", "> 180h * factor: charge", "140h~180h: no adjustment"],
    ["Note", `If unit price (${moneyUnit}/MM) = 0, adjustment amount will be 0. Each month is calculated separately using that month's own factor, then summed per member — compare directly against the customer's month-by-month estimation file.`],
    [],
    ["No", "Month", "Member", "Factor", `Unit Price (${moneyUnit}/MM)`, "Actual Hours", "Lower Bound", "Upper Bound", "Shortage Hours", "Overtime Hours", "Adjustment Hours", "Adjustment MM", `Adjustment Amount (${moneyUnit})`, "Status"],
  ];

  const startRow = 6;

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

  let no = 1;
  let rowCursor = startRow;
  let sumActual = 0, sumShortage = 0, sumOvertime = 0, sumAdjustHours = 0, sumAdjustMm = 0, sumAmount = 0;
  let countUnder = 0, countOver = 0, countMissingPrice = 0;

  for (const member of members) {
    member.lines.sort((a, b) => a.month.localeCompare(b.month));
    const subtotalStart = rowCursor;

    for (const line of member.lines) {
      const { row, calc, month } = line;
      const excelRow = rowCursor;
      summary.push([
        no++,
        month,
        row.fullName,
        row.billingFactor,
        calc.weightedUnitPrice,
        row.usedHours,
        formulaNumber(`140*D${excelRow}`, calc.lowerHours),
        formulaNumber(`180*D${excelRow}`, calc.upperHours),
        formulaNumber(`MAX(0,G${excelRow}-F${excelRow})`, calc.shortageHours),
        formulaNumber(`MAX(0,F${excelRow}-H${excelRow})`, calc.overtimeHours),
        formulaNumber(`J${excelRow}-I${excelRow}`, calc.adjustmentHours),
        formulaNumber(`K${excelRow}/180`, calc.adjustmentMm),
        formulaNumber(`L${excelRow}*E${excelRow}`, calc.adjustmentAmount),
        row.status,
      ]);
      sumActual += row.usedHours;
      sumShortage += calc.shortageHours;
      sumOvertime += calc.overtimeHours;
      sumAdjustHours += calc.adjustmentHours;
      sumAdjustMm += calc.adjustmentMm;
      sumAmount += calc.adjustmentAmount;
      if (calc.band === "UNDER") countUnder++;
      else if (calc.band === "OVER") countOver++;
      if (calc.weightedUnitPrice <= 0) countMissingPrice++;
      rowCursor++;
    }

    if (isMulti && member.lines.length > 1) {
      const subtotalEnd = rowCursor - 1;
      summary.push([
        "",
        `${member.fullName} — subtotal`,
        "", "", "",
        formulaNumber(`SUM(F${subtotalStart}:F${subtotalEnd})`, round2(member.lines.reduce((s, l) => s + l.row.usedHours, 0))),
        "", "",
        formulaNumber(`SUM(I${subtotalStart}:I${subtotalEnd})`, round2(member.lines.reduce((s, l) => s + l.calc.shortageHours, 0))),
        formulaNumber(`SUM(J${subtotalStart}:J${subtotalEnd})`, round2(member.lines.reduce((s, l) => s + l.calc.overtimeHours, 0))),
        formulaNumber(`SUM(K${subtotalStart}:K${subtotalEnd})`, round2(member.lines.reduce((s, l) => s + l.calc.adjustmentHours, 0))),
        formulaNumber(`SUM(L${subtotalStart}:L${subtotalEnd})`, round4(member.lines.reduce((s, l) => s + l.calc.adjustmentMm, 0))),
        formulaNumber(`SUM(M${subtotalStart}:M${subtotalEnd})`, round0(member.lines.reduce((s, l) => s + l.calc.adjustmentAmount, 0))),
        "",
      ]);
      rowCursor++;
    }
  }

  // Subtotal rows nằm xen giữa nên không cộng bằng 1 formula SUM liên tục
  // được — ghi số tĩnh đã tính từ đúng các dòng theo tháng (không tính lại
  // subtotal) để tránh đếm trùng.
  summary.push([
    "TOTAL", "", "", "", "",
    round2(sumActual), "", "",
    round2(sumShortage),
    round2(sumOvertime),
    round2(sumAdjustHours),
    round4(sumAdjustMm),
    round0(sumAmount),
    "",
  ]);

  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1["!cols"] = [
    { wch: 6 }, { wch: 10 }, { wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, ws1, "稼働情報");

  const detail: any[][] = [[
    "No", "Month", "Member", "Project Code", "Project Name", "Budget Hours", "Used Hours", "Diff (Used-Budget)",
  ]];

  let idx = 1;
  for (const { period, rows } of periodsData) {
    for (const row of rows) {
      for (const p of row.byProject) {
        const excelRow = detail.length + 1;
        const diff = round2(p.used - p.budget);
        detail.push([
          idx++,
          periodLabel(period),
          row.fullName,
          p.code,
          p.name,
          p.budget,
          p.used,
          formulaNumber(`G${excelRow}-F${excelRow}`, diff),
        ]);
      }
    }
  }

  if (detail.length === 1) {
    detail.push(["", "", "", "", "No project data", "", "", ""]);
  }

  const ws2 = XLSX.utils.aoa_to_sheet(detail);
  ws2["!cols"] = [
    { wch: 6 }, { wch: 10 }, { wch: 24 }, { wch: 14 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, ws2, "契約工数");

  XLSX.utils.sheet_add_aoa(ws1, [
    ["Members under lower bound", countUnder],
    ["Members over upper bound", countOver],
    ["Members with unit price = 0", countMissingPrice],
    ["Total adjustment amount", round0(sumAmount)],
  ], { origin: "O4" });

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
}

function formulaNumber(formula: string, value: number) {
  return { t: "n", f: formula, v: value };
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
