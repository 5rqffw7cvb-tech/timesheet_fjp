import * as XLSX from "xlsx";
import type { OverviewRow } from "@/lib/adminData";
import { calcBilling } from "@/lib/billing";

export function buildBillingWorkbook(year: number, month: number, rows: OverviewRow[]) {
  const wb = XLSX.utils.book_new();

  const title = `${year}/${String(month).padStart(2, "0")} Customer Billing`;
  const summary: any[][] = [
    [title],
    ["Rule", "< 140h * factor: deduct", "> 180h * factor: charge", "140h~180h: no adjustment"],
    [],
    ["No", "Member", "Factor", "Unit Price", "Actual Hours", "Lower Bound", "Upper Bound", "Shortage Hours", "Overtime Hours", "Adjustment Hours", "Adjustment MM", "Adjustment Amount", "Status"],
  ];

  const startRow = 5;
  rows.forEach((row, i) => {
    const excelRow = startRow + i;
    summary.push([
      i + 1,
      row.fullName,
      row.billingFactor,
      row.billingUnitPrice,
      row.usedHours,
      { f: `140*C${excelRow}` },
      { f: `180*C${excelRow}` },
      { f: `MAX(0,F${excelRow}-E${excelRow})` },
      { f: `MAX(0,E${excelRow}-G${excelRow})` },
      { f: `I${excelRow}-H${excelRow}` },
      { f: `J${excelRow}/180` },
      { f: `K${excelRow}*D${excelRow}` },
      row.status,
    ]);
  });

  const totalRow = startRow + rows.length;
  summary.push([
    "TOTAL",
    "",
    "",
    "",
    { f: `SUM(E${startRow}:E${totalRow - 1})` },
    "",
    "",
    { f: `SUM(H${startRow}:H${totalRow - 1})` },
    { f: `SUM(I${startRow}:I${totalRow - 1})` },
    { f: `SUM(J${startRow}:J${totalRow - 1})` },
    { f: `SUM(K${startRow}:K${totalRow - 1})` },
    { f: `SUM(L${startRow}:L${totalRow - 1})` },
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
      detail.push([
        idx++,
        row.fullName,
        p.code,
        p.name,
        p.budget,
        p.used,
        { f: `F${excelRow}-E${excelRow}` },
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
      const b = calcBilling({
        actualHours: r.usedHours,
        factor: r.billingFactor,
        unitPrice: r.billingUnitPrice,
      });
      return {
        under: acc.under + (b.band === "UNDER" ? 1 : 0),
        over: acc.over + (b.band === "OVER" ? 1 : 0),
        amount: acc.amount + b.adjustmentAmount,
      };
    },
    { under: 0, over: 0, amount: 0 },
  );

  XLSX.utils.sheet_add_aoa(ws1, [
    ["Members under lower bound", summaryStats.under],
    ["Members over upper bound", summaryStats.over],
    ["Total adjustment amount", summaryStats.amount],
  ], { origin: "O4" });

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
}

export function billingFileName(year: number, month: number) {
  return `稼働情報_${year}年${String(month).padStart(2, "0")}月.xlsx`;
}
