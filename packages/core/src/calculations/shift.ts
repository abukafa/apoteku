export interface ShiftReconciliationParams {
  initialCash: number;
  cashSales: number;
  actualCash: number;
  cashRefunds?: number;
  pettyCashIn?: number;
  pettyCashOut?: number;
}

export interface ShiftReconciliationResult {
  expectedCash: number;
  cashDifference: number;
  status: "BALANCED" | "SURPLUS" | "DEFICIT";
  isDiscrepancy: boolean;
}

/**
 * Menghitung rekonsiliasi kas laci kasir (drawer cash)
 * Rumus: Kas Yang Diharapkan = Modal Awal + Penjualan Tunai - Retur/Refund Tunai + Kas Masuk Laci - Kas Keluar Laci
 */
export function calculateCashierShiftReconciliation(
  params: ShiftReconciliationParams
): ShiftReconciliationResult {
  const initial = Number(params.initialCash) || 0;
  const sales = Number(params.cashSales) || 0;
  const actual = Number(params.actualCash) || 0;
  const refunds = Number(params.cashRefunds) || 0;
  const inMut = Number(params.pettyCashIn) || 0;
  const outMut = Number(params.pettyCashOut) || 0;

  const expectedCash = Math.round(initial + sales - refunds + inMut - outMut);
  const cashDifference = Math.round(actual - expectedCash);

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

/**
 * Menentukan nama label shift kerja (Pagi, Siang, Malam, Lembur, atau kustom)
 */
export function resolveShiftName(shiftNumber: number, notes?: string | null): string {
  if (notes && notes.startsWith("[")) {
    const match = notes.match(/^\[(.*?)\]/);
    if (match && match[1]) {
      const cleaned = match[1]
        .replace(/\s*\(\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}(?:\s*WIB)?\)/gi, "")
        .trim();
      return cleaned || match[1];
    }
  }
  if (shiftNumber === 1) return "Pagi";
  if (shiftNumber === 2) return "Siang";
  if (shiftNumber === 3) return "Malam";
  if (shiftNumber === 4) return "Lembur";
  return `Shift ${shiftNumber}`;
}

