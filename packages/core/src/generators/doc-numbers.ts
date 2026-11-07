/**
 * Standard Pharmacy Document Number Generators
 */

/**
 * Menerbitkan nomor Surat Pesanan (SP) Resmi
 * Format: SP-[KATEGORI-]YYYY-XXXX
 */
export function generateOrderNumber(
  type: "REGULER" | "NARKOTIKA" | "PSIKOTROPIKA" | "PREKURSOR" = "REGULER",
  sequence?: number,
  date: Date = new Date()
): string {
  const year = date.getFullYear();
  const seq = sequence ?? Math.floor(1000 + Math.random() * 9000);
  const prefix =
    type === "NARKOTIKA"
      ? "SP-NKT"
      : type === "PSIKOTROPIKA"
        ? "SP-PSI"
        : type === "PREKURSOR"
          ? "SP-PRK"
          : "SP";

  return `${prefix}-${year}-${seq}`;
}

/**
 * Menerbitkan nomor Dokumen Rekonsiliasi Opname Fisik
 * Format: RJK-YYYYMM-XXXX
 */
export function generateAdjustmentNumber(
  sequence?: number,
  date: Date = new Date()
): string {
  const yyyymm = date.toISOString().slice(0, 7).replace("-", "");
  const seq = sequence ?? Math.floor(1000 + Math.random() * 9000);
  return `RJK-${yyyymm}-${seq}`;
}

/**
 * Menerbitkan nomor Bukti Pengeluaran Kas Pelunasan Hutang
 * Format: RLH-YYYYMMDD-XXX
 */
export function generateDebtPaymentNumber(
  sequence?: number,
  date: Date = new Date()
): string {
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = sequence ?? Math.floor(100 + Math.random() * 900);
  return `RLH-${yyyymmdd}-${seq}`;
}

/**
 * Menerbitkan nomor Surat Jalan Transfer Antar-Cabang
 * Format: SJL-YYYYMM-XXXX
 */
export function generateTransferNumber(
  sequence?: number,
  date: Date = new Date()
): string {
  const yyyymm = date.toISOString().slice(0, 7).replace("-", "");
  const seq = sequence ?? Math.floor(1000 + Math.random() * 9000);
  return `SJL-${yyyymm}-${seq}`;
}

