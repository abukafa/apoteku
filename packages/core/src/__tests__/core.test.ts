import { describe, expect, it } from "bun:test";
import { calculateCartTotals } from "../calculations/totals.js";
import { selectFefoBatches, type BatchCandidate } from "../fefo/selection.js";

describe("calculateCartTotals", () => {
  it("calculates subtotal, discount, tax, and change accurately", () => {
    const result = calculateCartTotals(
      [
        { qty: 2, unitPrice: 10000, discountPercent: 10 }, // 20000 - 2000 = 18000
        { qty: 1, unitPrice: 5000, discountAmount: 500 } // 5000 - 500 = 4500
      ],
      {
        taxRatePercent: 11,
        tuslahAmount: 1000,
        embalaseAmount: 500,
        paidAmount: 30000
      }
    );

    expect(result.subtotal).toBe(25000);
    expect(result.totalDiscount).toBe(2500);
    expect(result.taxableAmount).toBe(22500);
    expect(result.taxAmount).toBe(2475); // Math.round(22500 * 0.11)
    expect(result.grandTotal).toBe(26475); // 22500 + 2475 + 1000 + 500
    expect(result.changeAmount).toBe(3525);
  });

  it("applies cash rounding step when configured", () => {
    const result = calculateCartTotals(
      [{ qty: 1, unitPrice: 10100 }],
      { taxRatePercent: 11, roundingStep: 100, paidAmount: 15000 }
    );

    // 10100 + 1111 = 11211 -> rounded to nearest 100 = 11200
    expect(result.grandTotal).toBe(11200);
    expect(result.roundingDifference).toBe(-11);
    expect(result.changeAmount).toBe(3800);
  });
});

describe("selectFefoBatches", () => {
  const candidates: BatchCandidate[] = [
    { batchId: "b1", batchNo: "BATCH-01", expiredDate: "2026-12-01", qtyBase: 10 },
    { batchId: "b2", batchNo: "BATCH-02", expiredDate: "2027-06-01", qtyBase: 25 },
    { batchId: "b3", batchNo: "BATCH-03", expiredDate: "2028-01-01", qtyBase: 50 }
  ];

  it("allocates across earliest expiring batches first", () => {
    const res = selectFefoBatches(candidates, 15);
    expect(res.isFullyAllocated).toBe(true);
    expect(res.allocatedQtyBase).toBe(15);
    expect(res.remainingRequiredBase).toBe(0);
    expect(res.batches).toEqual([
      { batchId: "b1", batchNo: "BATCH-01", expiredDate: "2026-12-01", allocatedQtyBase: 10 },
      { batchId: "b2", batchNo: "BATCH-02", expiredDate: "2027-06-01", allocatedQtyBase: 5 }
    ]);
  });

  it("reports partial allocation when total stock is insufficient", () => {
    const res = selectFefoBatches(candidates, 100);
    expect(res.isFullyAllocated).toBe(false);
    expect(res.allocatedQtyBase).toBe(85);
    expect(res.remainingRequiredBase).toBe(15);
    expect(res.batches.length).toBe(3);
  });
});

