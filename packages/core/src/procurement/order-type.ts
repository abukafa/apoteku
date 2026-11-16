/**
 * Standar Klasifikasi & Penomoran Surat Pesanan (SP) Pembelian PBF
 * Sesuai Regulasi BPOM RI & Praktik Distribusi Farmasi
 */

export type PurchaseOrderType =
  | "REGULER"
  | "NARKOTIKA"
  | "PSIKOTROPIKA"
  | "PREKURSOR"
  | "OOT"
  | "KONSINYASI";

/**
 * Mendapatkan kode singkatan prefix Surat Pesanan untuk penomoran resmi
 */
export function getPurchaseOrderPrefix(type: PurchaseOrderType | string): string {
  const t = (type || "").toUpperCase().trim();
  switch (t) {
    case "NARKOTIKA":
    case "NAR":
    case "NKT":
      return "NAR";
    case "PSIKOTROPIKA":
    case "PSI":
      return "PSI";
    case "PREKURSOR":
    case "PRE":
    case "PRK":
      return "PRE";
    case "OOT":
    case "OBAT-OBAT TERTENTU":
      return "OOT";
    case "KONSINYASI":
    case "KSN":
      return "KSN";
    default:
      return "REG";
  }
}

/**
 * Menginferensi jenis Surat Pesanan dari nomor SP atau catatan dokumen
 */
export function inferPurchaseOrderType(
  poNumber?: string | null,
  notes?: string | null
): PurchaseOrderType {
  const po = (poNumber || "").toUpperCase();
  const note = (notes || "").toUpperCase();

  if (po.includes("-NAR-") || po.includes("-NKT-") || note.includes("NARKOTIKA")) {
    return "NARKOTIKA";
  }
  if (po.includes("-PSI-") || note.includes("PSIKOTROPIKA")) {
    return "PSIKOTROPIKA";
  }
  if (po.includes("-PRE-") || po.includes("-PRK-") || note.includes("PREKURSOR")) {
    return "PREKURSOR";
  }
  if (po.includes("-OOT-") || note.includes("OOT") || note.includes("OBAT TERTENTU")) {
    return "OOT";
  }
  if (po.includes("-KSN-") || note.includes("KONSINYASI")) {
    return "KONSINYASI";
  }

  return "REGULER";
}

export interface PurchaseOrderFormatOptions {
  type?: PurchaseOrderType | string;
  sequence: number | string;
  year?: number;
  branchCode?: string; // default: "HF" (Hafidz Farma)
}

/**
 * Menerbitkan nomor Surat Pesanan terstandarisasi
 * Contoh: SP-PSI-HF-2026-0001 atau SP-REG-HF-2026-0012
 */
export function formatPurchaseOrderNumber(
  options: PurchaseOrderFormatOptions
): string {
  const prefix = getPurchaseOrderPrefix(options.type || "REGULER");
  const branch = (options.branchCode || "HF").toUpperCase();
  const year = options.year || new Date().getFullYear();
  const seqStr = String(options.sequence).padStart(4, "0");

  return `SP-${prefix}-${branch}-${year}-${seqStr}`;
}
