export interface BillingInput {
  actualHours: number;
  factor: number;
  unitPrice: number;
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
