export interface ShiftReconciliationParams {
  initialCash: number;
  cashSales: number;
  actualCash: number;
}

export interface ShiftReconciliationResult {
  expectedCash: number;
  cashDifference: number;
  status: "BALANCED" | "SURPLUS" | "DEFICIT";
  isDiscrepancy: boolean;
}

/**
 * Menghitung rekonsiliasi kas laci kasir (drawer cash)
 */
export function calculateCashierShiftReconciliation(
  params: ShiftReconciliationParams
): ShiftReconciliationResult {
  const initial = Number(params.initialCash) || 0;
  const sales = Number(params.cashSales) || 0;
  const actual = Number(params.actualCash) || 0;

  const expectedCash = initial + sales;
  const cashDifference = actual - expectedCash;

  let status: "BALANCED" | "SURPLUS" | "DEFICIT" = "BALANCED";
  if (cashDifference > 0) status = "SURPLUS";
  if (cashDifference < 0) status = "DEFICIT";

  return {
    expectedCash,
    cashDifference,
    status,
    isDiscrepancy: cashDifference !== 0
  };
}

