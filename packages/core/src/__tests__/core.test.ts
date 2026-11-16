import { describe, expect, it } from "bun:test";
import { calculateCartTotals } from "../calculations/totals.js";
import { selectFefoBatches, type BatchCandidate } from "../fefo/selection.js";
import { formatRupiah, parseRupiah } from "../formatters/currency.js";
import {
  convertPackageToBase,
  convertBaseToPackage,
  calculateSellingPrice,
  calculateMarginPercent,
  calculateInvoiceLineNet,
  calculateGrossProfit,
  calculateGrossMarginPercent,
  calculateGrowthPercentage
} from "../calculations/pricing.js";
import {
  calculateStockDifference,
  calculateReorderPoint
} from "../calculations/inventory.js";
import {
  calculateDebtSettlement,
  calculateDebtVoidReversal
} from "../calculations/debt.js";
import {
  evaluateExpiryStatus,
  sisaHari,
  getExpiryColorLevel,
  formatSisaHariLabel
} from "../validators/expiry.js";
import {
  generateOrderNumber,
  generateAdjustmentNumber,
  generateDebtPaymentNumber,
  generateTransferNumber
} from "../generators/doc-numbers.js";
import { calculateCashierShiftReconciliation } from "../calculations/shift.js";
import {
  classifySipnapCategory,
  isControlledSubstance,
  calculateSipnapInitialStock
} from "../compliance/sipnap.js";
import {
  calculateParetoCategory,
  calculateParetoDistribution
} from "../calculations/pareto.js";
import {
  inferPurchaseOrderType,
  getPurchaseOrderPrefix,
  formatPurchaseOrderNumber
} from "../procurement/order-type.js";
import {
  formatPackHint,
  breakDownToPacks
} from "../formatters/packs.js";

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

  it("formats numbers without Rp symbol when withSymbol is false", () => {
    // Via boolean argument
    const withoutSymbolBool = formatRupiah(150000, false);
    expect(withoutSymbolBool).toBe("150.000");
    expect(withoutSymbolBool).not.toContain("Rp");

    // Via options object
    const withoutSymbolObj = formatRupiah(2750000, { withSymbol: false });
    expect(withoutSymbolObj).toBe("2.750.000");
    expect(withoutSymbolObj).not.toContain("Rp");
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
  it("classifies expiry states and color levels dynamically", () => {
    const ref = new Date("2026-06-01");

    // Overdue (expired in May 2026)
    const overdue = evaluateExpiryStatus("2026-05-15", 90, ref);
    expect(overdue.status).toBe("OVERDUE");
    expect(overdue.isExpired).toBe(true);
    expect(overdue.sisaHari).toBe(-17);
    expect(overdue.level).toBe("red");
    expect(overdue.label).toBe("Sudah ED 17 hari lalu");

    // Due Soon & critical red (expires in July 2026 -> 30 days <= 90/3)
    const dueSoonCritical = evaluateExpiryStatus("2026-07-01", 90, ref);
    expect(dueSoonCritical.status).toBe("DUE_SOON");
    expect(dueSoonCritical.isDueSoon).toBe(true);
    expect(dueSoonCritical.isCritical).toBe(true);
    expect(dueSoonCritical.sisaHari).toBe(30);
    expect(dueSoonCritical.level).toBe("red");
    expect(dueSoonCritical.label).toBe("30 hari lagi");

    // Due Soon & warning yellow (45 days -> > 30 and <= 90)
    const dueSoonYellow = evaluateExpiryStatus("2026-07-16", 90, ref);
    expect(dueSoonYellow.status).toBe("DUE_SOON");
    expect(dueSoonYellow.isCritical).toBe(false);
    expect(dueSoonYellow.sisaHari).toBe(45);
    expect(dueSoonYellow.level).toBe("yellow");

    // Safe (expires in 2028)
    const safe = evaluateExpiryStatus("2028-12-31", 90, ref);
    expect(safe.status).toBe("SAFE");
    expect(safe.isExpired).toBe(false);
    expect(safe.level).toBe("green");
  });

  it("computes sisaHari = ED - today accurately across thresholds", () => {
    expect(sisaHari("2026-11-11", "2026-11-11")).toBe(0);
    expect(sisaHari("2026-12-01", "2026-11-11")).toBe(20);
    expect(sisaHari("2026-11-01", "2026-11-11")).toBe(-10);

    // Dynamic threshold = 180 hari -> red <= 60, yellow 61..180, green > 180
    expect(getExpiryColorLevel(60, 180)).toBe("red");
    expect(getExpiryColorLevel(61, 180)).toBe("yellow");
    expect(getExpiryColorLevel(180, 180)).toBe("yellow");
    expect(getExpiryColorLevel(181, 180)).toBe("green");

    expect(formatSisaHariLabel(0)).toBe("ED Hari Ini");
    expect(formatSisaHariLabel(120)).toBe("120 hari lagi (~4 bln)");
    expect(formatSisaHariLabel(415)).toBe("415 hari lagi (~1.1 thn)");
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

  it("handles petty cash in/out and refunds accurately", () => {
    const res = calculateCashierShiftReconciliation({
      initialCash: 200000,
      cashSales: 1000000,
      cashRefunds: 50000,
      pettyCashIn: 100000,
      pettyCashOut: 150000,
      actualCash: 1100000
    });
    // Expected: 200.000 + 1.000.000 - 50.000 + 100.000 - 150.000 = 1.100.000
    expect(res.expectedCash).toBe(1100000);
    expect(res.cashDifference).toBe(0);
    expect(res.status).toBe("BALANCED");
    expect(res.isDiscrepancy).toBe(false);
  });
});

describe("SIPNAP compliance & controlled substance classification", () => {
  it("classifies narcotics based on class, substance or name", () => {
    expect(classifySipnapCategory({ drugClass: "NARKOTIKA", name: "Obat X" })).toBe("NARKOTIKA");
    expect(classifySipnapCategory({ activeSubstance: "Codeine HCl 10mg", name: "Codikaf" })).toBe("NARKOTIKA");
    expect(classifySipnapCategory({ name: "Fentanyl Injeksi" })).toBe("NARKOTIKA");
  });

  it("classifies psychotropics based on class, substance or name", () => {
    expect(classifySipnapCategory({ drugClass: "PSIKOTROPIKA", name: "Obat Y" })).toBe("PSIKOTROPIKA");
    expect(classifySipnapCategory({ activeSubstance: "Diazepam 2mg", name: "Valisanbe" })).toBe("PSIKOTROPIKA");
    expect(classifySipnapCategory({ name: "Alprazolam 0.5mg" })).toBe("PSIKOTROPIKA");
  });

  it("classifies precursors accurately", () => {
    expect(classifySipnapCategory({ drugClass: "PREKURSOR", name: "Obat Z" })).toBe("PREKURSOR");
    expect(classifySipnapCategory({ activeSubstance: "Pseudoephedrine HCl", name: "Rhinos SR" })).toBe("PREKURSOR");
    expect(classifySipnapCategory({ name: "Tremenza Sirup" })).toBe("PREKURSOR");
  });

  it("returns null and false for regular OTC drugs", () => {
    expect(classifySipnapCategory({ drugClass: "OBAT_BEBAS", name: "Paracetamol 500mg" })).toBeNull();
    expect(isControlledSubstance({ drugClass: "OBAT_BEBAS", name: "Paracetamol 500mg" })).toBe(false);
  });

  it("calculates SIPNAP initial stock backwards from real transaction flows", () => {
    // Saldo Akhir: 60, Masuk: 50, Keluar: 15 -> Saldo Awal = 60 - 50 + 15 = 25
    const initStock = calculateSipnapInitialStock({
      finalStock: 60,
      receivedQty: 50,
      dispensedQty: 15
    });
    expect(initStock).toBe(25);
  });
});

describe("Pareto ABC 80/20 inventory analysis", () => {
  it("classifies items into A, B, and C categories based on revenue contribution", () => {
    const rawItems = [
      { id: "1", name: "Product A1", revenue: 5000000, cost: 4000000 },
      { id: "2", name: "Product A2", revenue: 3000000, cost: 2400000 },
      { id: "3", name: "Product B1", revenue: 1500000, cost: 1200000 },
      { id: "4", name: "Product C1", revenue: 500000, cost: 400000 }
    ];
    // Total: 10.000.000
    // A1: 50% (cum 50%) -> A
    // A2: 30% (cum 80%) -> A
    // B1: 15% (cum 95%) -> B
    // C1: 5% (cum 100%) -> C

    const result = calculateParetoDistribution(rawItems);
    expect(result.totalRevenue).toBe(10000000);
    expect(result.classACount).toBe(2);
    expect(result.classBCount).toBe(1);
    expect(result.classCCount).toBe(1);

    expect(result.items[0].item.id).toBe("1");
    expect(result.items[0].category).toBe("A");
    expect(result.items[0].revenueShare).toBe(50);
    expect(result.items[0].cumulativeShare).toBe(50);

    expect(result.items[1].item.id).toBe("2");
    expect(result.items[1].category).toBe("A");
    expect(result.items[1].cumulativeShare).toBe(80);

    expect(result.items[2].item.id).toBe("3");
    expect(result.items[2].category).toBe("B");
    expect(result.items[2].cumulativeShare).toBe(95);

    expect(result.items[3].item.id).toBe("4");
    expect(result.items[3].category).toBe("C");
    expect(result.items[3].cumulativeShare).toBe(100);
  });
});

describe("procurement order type & number formatting", () => {
  it("infers purchase order type from PO number and notes", () => {
    expect(inferPurchaseOrderType("SP-NAR-HF-2026-0001")).toBe("NARKOTIKA");
    expect(inferPurchaseOrderType("SP-PSI-HF-2026-0001")).toBe("PSIKOTROPIKA");
    expect(inferPurchaseOrderType("SP-PRE-HF-2026-0001")).toBe("PREKURSOR");
    expect(inferPurchaseOrderType("SP-OOT-HF-2026-0001")).toBe("OOT");
    expect(inferPurchaseOrderType("SP-KSN-HF-2026-0001")).toBe("KONSINYASI");
    expect(inferPurchaseOrderType("SP-REG-HF-2026-0001")).toBe("REGULER");
  });

  it("formats standardized purchase order numbers", () => {
    const formatted = formatPurchaseOrderNumber({
      type: "PSIKOTROPIKA",
      branchCode: "HF",
      year: 2026,
      sequence: 1
    });
    expect(formatted).toBe("SP-PSI-HF-2026-0001");
  });
});

describe("multi-unit packaging formatters", () => {
  it("formats pack hints for multi-unit items", () => {
    const units = [
      { unitName: "Tablet", conversionFactor: 1 },
      { unitName: "Strip", conversionFactor: 10 },
      { unitName: "Box", conversionFactor: 100 }
    ];

    expect(formatPackHint(25, "Tablet", units)).toBe("2 Strip + 5 Tablet");
    expect(formatPackHint(100, "Tablet", units)).toBe("1 Box");
    expect(formatPackHint(120, "Tablet", units)).toBe("1 Box + 20 Tablet");
    expect(formatPackHint(5, "Tablet", units)).toBe("");
  });

  it("breaks down quantities into packaging hierarchy", () => {
    const units = [
      { unitName: "Tablet", conversionFactor: 1 },
      { unitName: "Strip", conversionFactor: 10 },
      { unitName: "Box", conversionFactor: 100 }
    ];

    const breakdown = breakDownToPacks(125, "Tablet", units);
    expect(breakdown).toEqual([
      { unitName: "Box", count: 1, conversionFactor: 100 },
      { unitName: "Strip", count: 2, conversionFactor: 10 },
      { unitName: "Tablet", count: 5, conversionFactor: 1 }
    ]);
  });
});

describe("financial metrics & margin calculations", () => {
  it("calculates gross profit and margin percentages accurately", () => {
    expect(calculateGrossProfit(1000000, 750000)).toBe(250000);
    expect(calculateGrossMarginPercent(1000000, 250000)).toBe(25.0);
    expect(calculateGrossMarginPercent(0, 0)).toBe(0);
  });

  it("calculates growth percentage comparison", () => {
    expect(calculateGrowthPercentage(120, 100)).toBe(20);
    expect(calculateGrowthPercentage(80, 100)).toBe(-20);
    expect(calculateGrowthPercentage(100, 0)).toBeNull();
  });
});

