import { describe, expect, it } from "bun:test";
import { calculateCartTotals } from "../calculations/totals.js";
import { selectFefoBatches, type BatchCandidate } from "../fefo/selection.js";
import { formatRupiah, parseRupiah } from "../formatters/currency.js";
import {
  convertPackageToBase,
  convertBaseToPackage,
  calculateSellingPrice,
  calculateMarginPercent,
  calculateInvoiceLineNet
} from "../calculations/pricing.js";
import {
  calculateStockDifference,
  calculateReorderPoint
} from "../calculations/inventory.js";
import {
  calculateDebtSettlement,
  calculateDebtVoidReversal
} from "../calculations/debt.js";
import { evaluateExpiryStatus } from "../validators/expiry.js";
import {
  generateOrderNumber,
  generateAdjustmentNumber,
  generateDebtPaymentNumber,
  generateTransferNumber
} from "../generators/doc-numbers.js";
import { calculateCashierShiftReconciliation } from "../calculations/shift.js";

describe("calculateCartTotals", () => {
  it("calculates subtotal, discount, tax, and change accurately", () => {
    const result = calculateCartTotals(
      [
        { qty: 2, unitPrice: 10000, discountPercent: 10 },
        { qty: 1, unitPrice: 5000, discountAmount: 500 }
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
    expect(result.taxAmount).toBe(2475);
    expect(result.grandTotal).toBe(26475);
    expect(result.changeAmount).toBe(3525);
  });

  it("applies cash rounding step when configured", () => {
    const result = calculateCartTotals(
      [{ qty: 1, unitPrice: 10100 }],
      { taxRatePercent: 11, roundingStep: 100, paidAmount: 15000 }
    );

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

describe("currency formatters & parsers", () => {
  it("formats numbers to Indonesian Rupiah currency format", () => {
    const str = formatRupiah(150000);
    expect(str).toContain("150.000");
    expect(str).toContain("Rp");
  });

  it("parses currency strings back to integers", () => {
    expect(parseRupiah("Rp 150.000")).toBe(150000);
    expect(parseRupiah("25.500")).toBe(25500);
    expect(parseRupiah(5000)).toBe(5000);
    expect(parseRupiah("")).toBe(0);
  });
});

describe("pricing & multi-unit calculations", () => {
  it("converts package units to base units accurately", () => {
    expect(convertPackageToBase(3, 10)).toBe(30);
    expect(convertPackageToBase(5, 1)).toBe(5);
  });

  it("converts base units to packages with remaining fraction", () => {
    const res = convertBaseToPackage(25, 10);
    expect(res.packages).toBe(2);
    expect(res.remainingBase).toBe(5);
  });

  it("calculates selling price with HNA, PPN, and margin accurately", () => {
    // HNA = 10.000, PPN = 11% (11.100), Margin = 20% (13.320)
    const price = calculateSellingPrice(10000, 20, 11);
    expect(price).toBe(13320);
  });

  it("calculates real margin percentage", () => {
    // Buy = 8.000, Sell = 10.000 -> Margin = (2000 / 10000) * 100 = 20%
    expect(calculateMarginPercent(8000, 10000)).toBe(20);
  });

  it("calculates compound discounts on invoice items", () => {
    // 10 items @ 10.000 = 100.000
    // Disc 1 (10%) = 90.000
    // Disc 2 (5%) = 85.500
    const res = calculateInvoiceLineNet(10, 10000, 10, 5);
    expect(res.bruto).toBe(100000);
    expect(res.netto).toBe(85500);
    expect(res.discountAmount).toBe(14500);
  });
});

describe("inventory calculations", () => {
  it("determines discrepancy status and value in stock opname", () => {
    // Fisik 8, Sistem 10 -> Selisih -2 (LOSS)
    const loss = calculateStockDifference(10, 8, 5000);
    expect(loss.differenceQty).toBe(-2);
    expect(loss.valueDifference).toBe(-10000);
    expect(loss.status).toBe("LOSS");

    // Fisik 12, Sistem 10 -> Selisih +2 (GAIN)
    const gain = calculateStockDifference(10, 12, 5000);
    expect(gain.differenceQty).toBe(2);
    expect(gain.valueDifference).toBe(10000);
    expect(gain.status).toBe("GAIN");

    // Cocok
    const match = calculateStockDifference(10, 10, 5000);
    expect(match.differenceQty).toBe(0);
    expect(match.status).toBe("MATCH");
  });

  it("calculates Reorder Point (ROP)", () => {
    // Usage 10/day, Lead time 3 days, Safety stock 2 days
    // ROP = (10 * 3) + (10 * 2) = 50
    expect(calculateReorderPoint(10, 3, 2)).toBe(50);
  });
});

describe("debt calculations", () => {
  it("calculates debt settlement with partial and full payment", () => {
    // Partial payment
    const partial = calculateDebtSettlement(1000000, 0, 400000);
    expect(partial.newPaidAmount).toBe(400000);
    expect(partial.remainingDebt).toBe(600000);
    expect(partial.isPaidOff).toBe(false);

    // Full payment
    const full = calculateDebtSettlement(1000000, 400000, 600000);
    expect(full.newPaidAmount).toBe(1000000);
    expect(full.remainingDebt).toBe(0);
    expect(full.isPaidOff).toBe(true);
  });

  it("calculates void reversal and restores invoice debt", () => {
    // Invoice 1.000.000 previously paid 1.000.000. Voiding 600.000.
    const res = calculateDebtVoidReversal(1000000, 1000000, 600000);
    expect(res.newPaidAmount).toBe(400000);
    expect(res.remainingDebt).toBe(600000);
    expect(res.isPaidOff).toBe(false);
  });
});

describe("expiry evaluation", () => {
  it("classifies expiry states correctly", () => {
    const ref = new Date("2026-06-01");

    // Overdue (expired in May 2026)
    const overdue = evaluateExpiryStatus("2026-05-15", 90, ref);
    expect(overdue.status).toBe("OVERDUE");
    expect(overdue.isExpired).toBe(true);

    // Due Soon (expires in July 2026 - within 90 days)
    const dueSoon = evaluateExpiryStatus("2026-07-01", 90, ref);
    expect(dueSoon.status).toBe("DUE_SOON");
    expect(dueSoon.isDueSoon).toBe(true);

    // Safe (expires in 2028)
    const safe = evaluateExpiryStatus("2028-12-31", 90, ref);
    expect(safe.status).toBe("SAFE");
    expect(safe.isExpired).toBe(false);
  });
});

describe("document number generators", () => {
  it("generates correct SP numbers by category", () => {
    const fixedDate = new Date("2026-03-15");
    expect(generateOrderNumber("REGULER", 101, fixedDate)).toBe("SP-2026-101");
    expect(generateOrderNumber("NARKOTIKA", 202, fixedDate)).toBe("SP-NKT-2026-202");
    expect(generateOrderNumber("PSIKOTROPIKA", 303, fixedDate)).toBe("SP-PSI-2026-303");
    expect(generateOrderNumber("PREKURSOR", 404, fixedDate)).toBe("SP-PRK-2026-404");
  });

  it("generates correct Adjustment (RJK), Payment (RLH), and Transfer (SJL) numbers", () => {
    const fixedDate = new Date("2026-11-05");
    expect(generateAdjustmentNumber(1234, fixedDate)).toBe("RJK-202611-1234");
    expect(generateDebtPaymentNumber(567, fixedDate)).toBe("RLH-20261105-567");
    expect(generateTransferNumber(7890, fixedDate)).toBe("SJL-202611-7890");
  });
});

describe("cashier shift reconciliation calculations", () => {
  it("determines balanced cash drawer accurately", () => {
    const res = calculateCashierShiftReconciliation({
      initialCash: 200000,
      cashSales: 1550000,
      actualCash: 1750000
    });
    expect(res.expectedCash).toBe(1750000);
    expect(res.cashDifference).toBe(0);
    expect(res.status).toBe("BALANCED");
    expect(res.isDiscrepancy).toBe(false);
  });

  it("identifies cash surplus in drawer", () => {
    const res = calculateCashierShiftReconciliation({
      initialCash: 100000,
      cashSales: 500000,
      actualCash: 620000
    });
    expect(res.expectedCash).toBe(600000);
    expect(res.cashDifference).toBe(20000);
    expect(res.status).toBe("SURPLUS");
    expect(res.isDiscrepancy).toBe(true);
  });

  it("identifies cash deficit (shortage) in drawer", () => {
    const res = calculateCashierShiftReconciliation({
      initialCash: 100000,
      cashSales: 500000,
      actualCash: 580000
    });
    expect(res.expectedCash).toBe(600000);
    expect(res.cashDifference).toBe(-20000);
    expect(res.status).toBe("DEFICIT");
    expect(res.isDiscrepancy).toBe(true);
  });
});
