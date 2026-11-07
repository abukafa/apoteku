/**
 * Stock Opname & Inventory Control Calculations
 */

export interface StockDiscrepancyResult {
  systemQty: number;
  actualQty: number;
  differenceQty: number;
  costPerUnit: number;
  valueDifference: number;
  status: "LOSS" | "GAIN" | "MATCH";
}

/**
 * Menghitung selisih fisik stok opname dan nilai finansial selisih
 */
export function calculateStockDifference(
  systemQty: number,
  actualQty: number,
  costPerUnit: number = 0
): StockDiscrepancyResult {
  const sys = Number.isFinite(systemQty) ? systemQty : 0;
  const act = Math.max(0, Number.isFinite(actualQty) ? actualQty : 0);
  const cost = Math.max(0, Number.isFinite(costPerUnit) ? costPerUnit : 0);

  const differenceQty = act - sys;
  const valueDifference = Math.round(differenceQty * cost);

  const status: "LOSS" | "GAIN" | "MATCH" =
    differenceQty < 0 ? "LOSS" : differenceQty > 0 ? "GAIN" : "MATCH";

  return {
    systemQty: sys,
    actualQty: act,
    differenceQty,
    costPerUnit: cost,
    valueDifference,
    status
  };
}

/**
 * Menghitung Reorder Point (ROP) / Batas Minimum Stok untuk Pemesanan SP
 * Rumus: (Rata-rata Konsumsi Harian * Lead Time Hari) + Safety Stock
 */
export function calculateReorderPoint(
  avgDailyUsage: number,
  leadTimeDays: number,
  safetyStockDays: number = 2
): number {
  const usage = Math.max(0, avgDailyUsage || 0);
  const leadTime = Math.max(1, leadTimeDays || 1);
  const safetyDays = Math.max(0, safetyStockDays || 0);

  const leadTimeDemand = usage * leadTime;
  const safetyStock = usage * safetyDays;

  return Math.ceil(leadTimeDemand + safetyStock);
}

