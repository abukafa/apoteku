/**
 * Accounts Payable (Hutang Faktur Pembelian PBF) Calculations
 */

export interface DebtSettlementResult {
  grandTotal: number;
  previousPaid: number;
  paymentAmount: number;
  newPaidAmount: number;
  remainingDebt: number;
  isPaidOff: boolean;
}

export interface DebtVoidResult {
  grandTotal: number;
  previousPaid: number;
  voidAmount: number;
  newPaidAmount: number;
  remainingDebt: number;
  isPaidOff: boolean;
}

/**
 * Menghitung pelunasan hutang faktur pembelian
 */
export function calculateDebtSettlement(
  grandTotal: number,
  currentPaid: number,
  newPaymentAmount: number
): DebtSettlementResult {
  const total = Math.max(0, grandTotal || 0);
  const prev = Math.max(0, currentPaid || 0);
  const pay = Math.max(0, newPaymentAmount || 0);

  const newPaidAmount = Math.min(total, prev + pay);
  const remainingDebt = Math.max(0, total - newPaidAmount);
  const isPaidOff = newPaidAmount >= total;

  return {
    grandTotal: total,
    previousPaid: prev,
    paymentAmount: pay,
    newPaidAmount,
    remainingDebt,
    isPaidOff
  };
}

/**
 * Menghitung pembatalan / rollback (void) bukti pembayaran hutang
 */
export function calculateDebtVoidReversal(
  grandTotal: number,
  currentPaid: number,
  voidAmount: number
): DebtVoidResult {
  const total = Math.max(0, grandTotal || 0);
  const prev = Math.max(0, currentPaid || 0);
  const vAmount = Math.max(0, voidAmount || 0);

  const newPaidAmount = Math.max(0, prev - vAmount);
  const remainingDebt = Math.max(0, total - newPaidAmount);
  const isPaidOff = newPaidAmount >= total && total > 0;

  return {
    grandTotal: total,
    previousPaid: prev,
    voidAmount: vAmount,
    newPaidAmount,
    remainingDebt,
    isPaidOff
  };
}

