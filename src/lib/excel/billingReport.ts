import * as XLSX from "xlsx";
import type { OverviewRow } from "@/lib/adminData";
import { calcBillingByProjects } from "@/lib/billing";
import { currencySymbol, type BillingCurrency } from "@/lib/currency";

export function buildBillingWorkbook(year: number, month: number, rows: OverviewRow[]) {
  const title = `${year}/${String(month).padStart(2, "0")} Customer Billing`;
  return buildWorkbookCore(title, rows, "JPY");
}

export function buildBillingWorkbookWithLabel(
  periodLabel: string,
  rows: OverviewRow[],
  currency: BillingCurrency,
) {
  return buildWorkbookCore(`${periodLabel} Customer Billing`, rows, currency);
}

function buildWorkbookCore(title: string, rows: OverviewRow[], currency: BillingCurrency) {
  const wb = XLSX.utils.book_new();
  const moneyUnit = currencySymbol(currency);

  const summary: any[][] = [
    [title],
    ["Rule", "< 140h * factor: deduct", "> 180h * factor: charge", "140h~180h: no adjustment"],
    ["Note", `If unit price (${moneyUnit}/MM) = 0, adjustment amount will be 0`],
    [],
    ["No", "Member", "Factor", `Unit Price (${moneyUnit}/MM)`, "Actual Hours", "Lower Bound", "Upper Bound", "Shortage Hours", "Overtime Hours", "Adjustment Hours", "Adjustment MM", `Adjustment Amount (${moneyUnit})`, "Status"],
  ];

  const startRow = 6;
  let sumActual = 0;
  let sumShortage = 0;
  let sumOvertime = 0;
  let sumAdjustHours = 0;
  let sumAdjustMm = 0;
  let sumAmount = 0;

  rows.forEach((row, i) => {
    const excelRow = startRow + i;
    const b = calcBillingByProjects(
      row.usedHours,
      row.billingFactor,
      row.byProject.map((p) => ({ projectId: p.projectId, hours: p.used, unitPriceMm: p.unitPriceMm })),
      row.billingUnitPrice,
    );

    sumActual += row.usedHours;
    sumShortage += b.shortageHours;
    sumOvertime += b.overtimeHours;
    sumAdjustHours += b.adjustmentHours;
    sumAdjustMm += b.adjustmentMm;
    sumAmount += b.adjustmentAmount;

    summary.push([
      i + 1,
      row.fullName,
      row.billingFactor,
      b.weightedUnitPrice,
      row.usedHours,
      formulaNumber(`140*C${excelRow}`, b.lowerHours),
      formulaNumber(`180*C${excelRow}`, b.upperHours),
      formulaNumber(`MAX(0,F${excelRow}-E${excelRow})`, b.shortageHours),
      formulaNumber(`MAX(0,E${excelRow}-G${excelRow})`, b.overtimeHours),
      formulaNumber(`I${excelRow}-H${excelRow}`, b.adjustmentHours),
      formulaNumber(`J${excelRow}/180`, b.adjustmentMm),
      formulaNumber(`K${excelRow}*D${excelRow}`, b.adjustmentAmount),
      row.status,
    ]);
  });

  const totalRow = startRow + rows.length;
  summary.push([
    "TOTAL",
    "",
    "",
    "",
    formulaNumber(`SUM(E${startRow}:E${totalRow - 1})`, round2(sumActual)),
    "",
    "",
    formulaNumber(`SUM(H${startRow}:H${totalRow - 1})`, round2(sumShortage)),
    formulaNumber(`SUM(I${startRow}:I${totalRow - 1})`, round2(sumOvertime)),
    formulaNumber(`SUM(J${startRow}:J${totalRow - 1})`, round2(sumAdjustHours)),
    formulaNumber(`SUM(K${startRow}:K${totalRow - 1})`, round4(sumAdjustMm)),
    formulaNumber(`SUM(L${startRow}:L${totalRow - 1})`, round0(sumAmount)),
    "",
  ]);

  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1["!cols"] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 15 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, ws1, "稼働情報");

  const detail: any[][] = [[
    "No",
    "Member",
    "Project Code",
    "Project Name",
    "Budget Hours",
    "Used Hours",
    "Diff (Used-Budget)",
  ]];

  let idx = 1;
  for (const row of rows) {
    for (const p of row.byProject) {
      const excelRow = detail.length + 1;
      const diff = round2(p.used - p.budget);
      detail.push([
        idx++,
        row.fullName,
        p.code,
        p.name,
        p.budget,
        p.used,
        formulaNumber(`F${excelRow}-E${excelRow}`, diff),
      ]);
    }
  }

  if (detail.length === 1) {
    detail.push(["", "", "", "No project data", "", "", ""]);
  }

  const ws2 = XLSX.utils.aoa_to_sheet(detail);
  ws2["!cols"] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 14 },
    { wch: 32 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, ws2, "契約工数");

  const summaryStats = rows.reduce(
    (acc, r) => {
      const b = calcBillingByProjects(
        r.usedHours,
        r.billingFactor,
        r.byProject.map((p) => ({ projectId: p.projectId, hours: p.used, unitPriceMm: p.unitPriceMm })),
        r.billingUnitPrice,
      );
      return {
        under: acc.under + (b.band === "UNDER" ? 1 : 0),
        over: acc.over + (b.band === "OVER" ? 1 : 0),
        amount: acc.amount + b.adjustmentAmount,
        missingPrice: acc.missingPrice + (b.weightedUnitPrice > 0 ? 0 : 1),
      };
    },
    { under: 0, over: 0, amount: 0, missingPrice: 0 },
  );

  XLSX.utils.sheet_add_aoa(ws1, [
    ["Members under lower bound", summaryStats.under],
    ["Members over upper bound", summaryStats.over],
    ["Members with unit price = 0", summaryStats.missingPrice],
    ["Total adjustment amount", round0(summaryStats.amount)],
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
