/**
 * SIPNAP (Sistem Pelaporan Narkotika dan Psikotropika) Compliance & Classification
 * Standar Kementerian Kesehatan RI & Badan POM RI
 */

export type SipnapCategory = "NARKOTIKA" | "PSIKOTROPIKA" | "PREKURSOR";

/**
 * Daftar kata kunci zat aktif dan golongan resmi Narkotika
 */
export const NARCOTICS_KEYWORDS = [
  "codein",
  "kodein",
  "codikaf",
  "fentanil",
  "fentanyl",
  "morphin",
  "morfin",
  "petidin",
  "pethidine",
  "oksikodon",
  "oxycodone",
  "metadon",
  "methadone",
  "buprenorfin",
  "buprenorphine"
] as const;

/**
 * Daftar kata kunci zat aktif dan golongan resmi Psikotropika
 */
export const PSYCHOTROPIC_KEYWORDS = [
  "diazepam",
  "valisanbe",
  "alprazolam",
  "clonazepam",
  "klonazepam",
  "lorazepam",
  "clobazam",
  "klobazam",
  "nitrazepam",
  "phenobarbital",
  "fenobarbital",
  "midazolam",
  "estazolam",
  "zolpidem"
] as const;

/**
 * Daftar kata kunci zat aktif dan golongan resmi Prekursor Farmasi
 */
export const PRECURSOR_KEYWORDS = [
  "pseudoephedrine",
  "pseudoefedrin",
  "efedrin",
  "ephedrine",
  "ergotamin",
  "ergotamine",
  "ergometrin",
  "ergometrine",
  "potassium permanganate",
  "kalium permanganat",
  "norephedrine",
  "norefedrin",
  "rhinos",
  "tremenza",
  "actifed",
  "alco"
] as const;

export const CONTROLLED_SUBSTANCE_KEYWORDS = [
  "narkotika",
  "narcotics",
  "psikotropika",
  "psychotropic",
  "prekursor",
  "precursor",
  "oot",
  ...NARCOTICS_KEYWORDS,
  ...PSYCHOTROPIC_KEYWORDS,
  ...PRECURSOR_KEYWORDS
] as const;

export interface DrugClassificationInput {
  drugClass?: string | null;
  activeSubstance?: string | null;
  name?: string | null;
}

/**
 * Menentukan klasifikasi resmi SIPNAP (NARKOTIKA, PSIKOTROPIKA, PREKURSOR)
 * berdasarkan data golongan obat BPOM, nama zat aktif (komposisi), dan nama merek/dagang obat.
 * Mengembalikan `null` jika bukan termasuk obat yang wajib dilaporkan di SIPNAP.
 */
export function classifySipnapCategory(
  drug: DrugClassificationInput
): SipnapCategory | null {
  const cls = (drug.drugClass || "").toUpperCase();
  const sub = (drug.activeSubstance || "").toLowerCase();
  const name = (drug.name || "").toLowerCase();

  // 1. Cek Narkotika (Prioritas Tertinggi)
  if (
    cls.includes("NARKOTIKA") ||
    cls.includes("NARCOTIC") ||
    NARCOTICS_KEYWORDS.some((kw) => sub.includes(kw) || name.includes(kw))
  ) {
    return "NARKOTIKA";
  }

  // 2. Cek Psikotropika
  if (
    cls.includes("PSIKOTROPIKA") ||
    cls.includes("PSYCHOTROPIC") ||
    PSYCHOTROPIC_KEYWORDS.some((kw) => sub.includes(kw) || name.includes(kw))
  ) {
    return "PSIKOTROPIKA";
  }

  // 3. Cek Prekursor Farmasi
  if (
    cls.includes("PREKURSOR") ||
    cls.includes("PRECURSOR") ||
    PRECURSOR_KEYWORDS.some((kw) => sub.includes(kw) || name.includes(kw))
  ) {
    return "PREKURSOR";
  }

  return null;
}

/**
 * Mengecek apakah suatu obat termasuk golongan obat diawasi / terkontrol
 * (Narkotika, Psikotropika, Prekursor, atau Obat-Obat Tertentu / OOT)
 */
export function isControlledSubstance(drug: DrugClassificationInput): boolean {
  if (classifySipnapCategory(drug) !== null) return true;
  const cls = (drug.drugClass || "").toUpperCase();
  if (cls.includes("OOT") || cls.includes("OBAT-OBAT TERTENTU")) return true;
  return false;
}

export interface StockReconciliationParams {
  finalStock: number;
  receivedQty: number;
  dispensedQty: number;
  expiredOrDestroyedQty?: number;
}

/**
 * Menghitung saldo awal buku register SIPNAP secara akurat
 * Rumus Balik: Saldo Awal = Saldo Akhir - Pemasukan + Pengeluaran + Pemusnahan/ED
 */
export function calculateSipnapInitialStock(params: StockReconciliationParams): number {
  const finalStock = Math.round(params.finalStock || 0);
  const received = Math.round(params.receivedQty || 0);
  const dispensed = Math.round(params.dispensedQty || 0);
  const destroyed = Math.round(params.expiredOrDestroyedQty || 0);

  return Math.max(0, finalStock - received + dispensed + destroyed);
}
