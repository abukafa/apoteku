export interface CartItemCalculationInput {
  qty: number;
  unitPrice: number;
  discountPercent?: number;
  discountAmount?: number;
}

export interface CartCalculationOptions {
  taxRatePercent?: number;
  tuslahAmount?: number;
  embalaseAmount?: number;
  paidAmount?: number;
  roundingStep?: number; // e.g. 50 or 100 for Indonesian cash rounding
}

export function calculateCartTotals(
  items: CartItemCalculationInput[],
  options: CartCalculationOptions = {}
) {
  const taxRate = options.taxRatePercent ?? 11;
  const tuslah = options.tuslahAmount ?? 0;
  const embalase = options.embalaseAmount ?? 0;
  const paid = options.paidAmount ?? 0;

  const subtotal = items.reduce((acc, curr) => acc + curr.qty * curr.unitPrice, 0);
  const totalDiscount = items.reduce((acc, curr) => {
    if (curr.discountAmount && curr.discountAmount > 0) {
      return acc + curr.discountAmount;
    }
    if (curr.discountPercent && curr.discountPercent > 0) {
      return acc + (curr.qty * curr.unitPrice * curr.discountPercent) / 100;
    }
    return acc;
  }, 0);

  const taxableAmount = Math.max(0, subtotal - totalDiscount);
  const taxAmount = Math.round((taxableAmount * taxRate) / 100);
  const rawGrandTotal = taxableAmount + taxAmount + tuslah + embalase;

  // Rounding if requested
  const grandTotal = options.roundingStep && options.roundingStep > 0
    ? Math.round(rawGrandTotal / options.roundingStep) * options.roundingStep
    : rawGrandTotal;

  const roundingDifference = grandTotal - rawGrandTotal;
  const changeAmount = Math.max(0, paid - grandTotal);

  return {
    subtotal,
    totalDiscount,
    taxableAmount,
    taxAmount,
    tuslahAmount: tuslah,
    embalaseAmount: embalase,
    grandTotal,
    roundingDifference,
    changeAmount,
  };
}
