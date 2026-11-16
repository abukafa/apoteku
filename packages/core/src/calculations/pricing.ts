/**
 * Multi-Unit Conversion & Pharmacy Pricing Calculations
 */

/**
 * Konversi kemasan ke satuan dasar (misal: 2 Strip @ 10 Tablet = 20 Tablet)
 */
export function convertPackageToBase(packageQty: number, conversionFactor: number): number {
  const safeQty = Math.max(0, packageQty || 0);
  const factor = Math.max(1, conversionFactor || 1);
  return safeQty * factor;
}

/**
 * Konversi satuan dasar ke kemasan dan sisa pecahan (misal: 25 Tablet dengan factor 10 = 2 Strip sisa 5 Tablet)
 */
export function convertBaseToPackage(
  baseQty: number,
  conversionFactor: number
): { packages: number; remainingBase: number } {
  const safeQty = Math.max(0, baseQty || 0);
  const factor = Math.max(1, conversionFactor || 1);
  const packages = Math.floor(safeQty / factor);
  const remainingBase = safeQty % factor;

  return { packages, remainingBase };
}

/**
 * Menghitung Harga Jual Apotek (HJA) berdasarkan HNA, PPN (default 11%), dan Margin %
 * Rumus: HNA * (1 + PPN%) * (1 + Margin%)
 */
export function calculateSellingPrice(
  hna: number,
  marginPercent: number,
  taxPercent: number = 11
): number {
  const safeHna = Math.max(0, hna || 0);
  const safeMargin = Math.max(0, marginPercent || 0);
  const safeTax = Math.max(0, taxPercent || 0);

  const priceWithTax = safeHna * (1 + safeTax / 100);
  const sellingPrice = priceWithTax * (1 + safeMargin / 100);

  return Math.round(sellingPrice);
}

/**
 * Menghitung Margin Keuntungan Riil (%) dari Harga Beli dan Harga Jual
 * Rumus: ((Harga Jual - Harga Beli) / Harga Jual) * 100
 */
export function calculateMarginPercent(buyPrice: number, sellPrice: number): number {
  if (sellPrice <= 0 || buyPrice < 0) return 0;
  const margin = ((sellPrice - buyPrice) / sellPrice) * 100;
  return Math.round(margin * 100) / 100;
}

/**
 * Menghitung Nilai Faktur per Item dengan Diskon Bertingkat (Disc 1 + Disc 2)
 */
export function calculateInvoiceLineNet(
  qty: number,
  unitPrice: number,
  disc1Percent: number = 0,
  disc2Percent: number = 0
): { bruto: number; discountAmount: number; netto: number } {
  const safeQty = Math.max(0, qty || 0);
  const safePrice = Math.max(0, unitPrice || 0);
  const d1 = Math.max(0, Math.min(100, disc1Percent || 0));
  const d2 = Math.max(0, Math.min(100, disc2Percent || 0));

  const bruto = safeQty * safePrice;
  const afterD1 = bruto * (1 - d1 / 100);
  const netto = Math.round(afterD1 * (1 - d2 / 100));
  const discountAmount = bruto - netto;

  return {
    bruto,
    discountAmount,
    netto
  };
}

/**
 * Menghitung Laba Kotor (Gross Profit)
 * Rumus: Omzet - HPP (Cost of Goods Sold)
 */
export function calculateGrossProfit(revenue: number, cost: number): number {
  return Math.round((Number(revenue) || 0) - (Number(cost) || 0));
}

/**
 * Menghitung Persentase Margin Laba Kotor (Gross Margin %)
 * Rumus: (Laba Kotor / Total Omzet) * 100
 */
export function calculateGrossMarginPercent(revenue: number, grossProfit: number): number {
  const rev = Number(revenue) || 0;
  const profit = Number(grossProfit) || 0;
  if (rev <= 0) return 0;
  return Math.round(((profit / rev) * 100) * 10) / 10;
}

/**
 * Menghitung pertumbuhan / trend periode berjalan dibanding periode sebelumnya (%)
 * Rumus: ((Nilai Saat Ini - Nilai Sebelumnya) / Nilai Sebelumnya) * 100
 */
export function calculateGrowthPercentage(current: number, previous: number): number | null {
  const prev = Number(previous) || 0;
  const curr = Number(current) || 0;
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}


