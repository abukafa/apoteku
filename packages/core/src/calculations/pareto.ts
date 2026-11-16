/**
 * Analisis Pareto ABC (Metode 80/20) Pengendalian Persediaan Farmasi
 * Mengklasifikasikan obat berdasarkan kontribusi nilai penjualan kumulatif
 */

export type ParetoCategory = "A" | "B" | "C";

export interface ParetoThresholds {
  classAThreshold?: number; // default: 80%
  classBThreshold?: number; // default: 95%
}

/**
 * Menentukan kategori ABC berdasarkan persentase kumulatif omzet
 * Kelas A: 0% - 80% (Paling berpengaruh terhadap omzet apotek)
 * Kelas B: 80% - 95% (Pengaruh moderat)
 * Kelas C: 95% - 100% (Slow moving / kontribusi omzet kecil)
 */
export function calculateParetoCategory(
  cumulativePercent: number,
  thresholds: ParetoThresholds = {}
): ParetoCategory {
  const classA = thresholds.classAThreshold ?? 80;
  const classB = thresholds.classBThreshold ?? 95;

  if (cumulativePercent <= classA) return "A";
  if (cumulativePercent <= classB) return "B";
  return "C";
}

export interface ParetoInputItem {
  id: string;
  name?: string;
  sku?: string;
  revenue: number;
  cost?: number;
  unitsSold?: number;
  [key: string]: any;
}

export interface ParetoAnalyzedItem<T extends ParetoInputItem> {
  item: T;
  revenueShare: number;       // % share terhadap total omzet (misal 14.5%)
  cumulativeShare: number;    // % kumulatif (misal 65.2%)
  category: ParetoCategory;   // "A" | "B" | "C"
  grossProfit: number;
  grossMarginPercent: number; // % margin keuntungan
}

export interface ParetoAnalysisResult<T extends ParetoInputItem> {
  totalRevenue: number;
  totalItems: number;
  classACount: number;
  classBCount: number;
  classCCount: number;
  classARevenue: number;
  classBRevenue: number;
  classCRevenue: number;
  items: ParetoAnalyzedItem<T>[];
}

/**
 * Menghitung distribusi analisis Pareto ABC untuk daftar produk terjual
 */
export function calculateParetoDistribution<T extends ParetoInputItem>(
  items: T[],
  thresholds: ParetoThresholds = {}
): ParetoAnalysisResult<T> {
  if (!items || items.length === 0) {
    return {
      totalRevenue: 0,
      totalItems: 0,
      classACount: 0,
      classBCount: 0,
      classCCount: 0,
      classARevenue: 0,
      classBRevenue: 0,
      classCRevenue: 0,
      items: []
    };
  }

  // 1. Urutkan item dari omzet terbesar ke terkecil
  const sorted = [...items].sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0));

  // 2. Hitung total omzet keseluruhan
  const totalRevenue = sorted.reduce((sum, it) => sum + Math.max(0, Number(it.revenue) || 0), 0);

  let runningCumulative = 0;
  let classACount = 0;
  let classBCount = 0;
  let classCCount = 0;
  let classARevenue = 0;
  let classBRevenue = 0;
  let classCRevenue = 0;

  const analyzedItems: ParetoAnalyzedItem<T>[] = sorted.map((item) => {
    const rev = Math.max(0, Number(item.revenue) || 0);
    const cost = Math.max(0, Number(item.cost) || 0);
    const profit = Math.round(rev - cost);
    const margin = rev > 0 ? Math.round(((profit / rev) * 100) * 10) / 10 : 0;

    const share = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
    runningCumulative += share;
    const roundedCumulative = Math.min(100, Math.round(runningCumulative * 10) / 10);
    const roundedShare = Math.round(share * 10) / 10;

    const category = calculateParetoCategory(roundedCumulative, thresholds);

    if (category === "A") {
      classACount++;
      classARevenue += rev;
    } else if (category === "B") {
      classBCount++;
      classBRevenue += rev;
    } else {
      classCCount++;
      classCRevenue += rev;
    }

    return {
      item,
      revenueShare: roundedShare,
      cumulativeShare: roundedCumulative,
      category,
      grossProfit: profit,
      grossMarginPercent: margin
    };
  });

  return {
    totalRevenue: Math.round(totalRevenue),
    totalItems: items.length,
    classACount,
    classBCount,
    classCCount,
    classARevenue: Math.round(classARevenue),
    classBRevenue: Math.round(classBRevenue),
    classCRevenue: Math.round(classCRevenue),
    items: analyzedItems
  };
}
