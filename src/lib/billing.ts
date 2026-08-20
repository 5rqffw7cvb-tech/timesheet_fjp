export interface BillingInput {
  actualHours: number;
  factor: number;
  unitPrice: number;
}

export interface ProjectBillingInput {
  projectId: string;
  hours: number;
  unitPriceMm: number;
}

export interface BillingResult {
  lowerHours: number;
  upperHours: number;
  shortageHours: number;
  overtimeHours: number;
  adjustmentHours: number;
  adjustmentMm: number;
  adjustmentAmount: number;
  band: "UNDER" | "NORMAL" | "OVER";
  weightedUnitPrice: number;
  byProject: {
    projectId: string;
    hours: number;
    ratio: number;
    allocatedAdjustHours: number;
    allocatedAdjustMm: number;
    unitPriceMm: number;
    amount: number;
  }[];
}

export function calcBilling(input: BillingInput): BillingResult {
  const actual = Math.max(0, input.actualHours || 0);
  const factor = Math.max(0, input.factor || 0);
  const unitPrice = Math.max(0, input.unitPrice || 0);

  const lowerHours = round2(140 * factor);
  const upperHours = round2(180 * factor);

  const shortageHours = round2(Math.max(0, lowerHours - actual));
  const overtimeHours = round2(Math.max(0, actual - upperHours));
  const adjustmentHours = round2(overtimeHours - shortageHours);
  const adjustmentMm = round4(adjustmentHours / 180);
  const adjustmentAmount = round0(adjustmentMm * unitPrice);

  const band = actual < lowerHours ? "UNDER"
    : actual > upperHours ? "OVER"
    : "NORMAL";

  return {
    lowerHours,
    upperHours,
    shortageHours,
    overtimeHours,
    adjustmentHours,
    adjustmentMm,
    adjustmentAmount,
    band,
    weightedUnitPrice: unitPrice,
    byProject: [
      {
        projectId: "__ALL__",
        hours: actual,
        ratio: actual > 0 ? 1 : 0,
        allocatedAdjustHours: adjustmentHours,
        allocatedAdjustMm: adjustmentMm,
        unitPriceMm: unitPrice,
        amount: adjustmentAmount,
      },
    ],
  };
}

export function calcBillingByProjects(
  actualHours: number,
  factor: number,
  projects: ProjectBillingInput[],
  fallbackUnitPrice: number,
): BillingResult {
  const normalized = projects
    .map((p) => ({
      projectId: p.projectId,
      hours: Math.max(0, p.hours || 0),
      unitPriceMm: Math.max(0, p.unitPriceMm || 0),
    }))
    .filter((p) => p.hours > 0);

  const totalHours = round2(normalized.reduce((s, p) => s + p.hours, 0));
  const base = calcBilling({
    actualHours,
    factor,
    unitPrice: Math.max(0, fallbackUnitPrice || 0),
  });

  if (normalized.length === 0 || totalHours <= 0 || base.adjustmentHours === 0) {
    return {
      ...base,
      weightedUnitPrice: normalized.length === 0
        ? Math.max(0, fallbackUnitPrice || 0)
        : round2(
          normalized.reduce((s, p) => s + (p.unitPriceMm * p.hours), 0) / totalHours,
        ),
      byProject: normalized.map((p) => ({
        projectId: p.projectId,
        hours: p.hours,
        ratio: round4(totalHours > 0 ? p.hours / totalHours : 0),
        allocatedAdjustHours: 0,
        allocatedAdjustMm: 0,
        unitPriceMm: p.unitPriceMm,
        amount: 0,
      })),
    };
  }

  const byProject: BillingResult["byProject"] = [];
  let allocatedHours = 0;

  for (let i = 0; i < normalized.length; i++) {
    const p = normalized[i];
    const ratio = totalHours > 0 ? p.hours / totalHours : 0;
    const isLast = i === normalized.length - 1;
    const allocH = isLast
      ? round2(base.adjustmentHours - allocatedHours)
      : round2(base.adjustmentHours * ratio);
    allocatedHours = round2(allocatedHours + allocH);
    const allocMm = round4(allocH / 180);
    const amount = round0(allocMm * p.unitPriceMm);

    byProject.push({
      projectId: p.projectId,
      hours: p.hours,
      ratio: round4(ratio),
      allocatedAdjustHours: allocH,
      allocatedAdjustMm: allocMm,
      unitPriceMm: p.unitPriceMm,
      amount,
    });
  }

  const adjustmentAmount = byProject.reduce((s, p) => s + p.amount, 0);
  const weightedUnitPrice = round2(
    normalized.reduce((s, p) => s + (p.unitPriceMm * p.hours), 0) / totalHours,
  );

  return {
    ...base,
    weightedUnitPrice,
    adjustmentAmount,
    byProject,
  };
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
