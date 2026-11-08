/**
 * Indonesian Rupiah (IDR) Currency Formatter & Parser
 */

export interface FormatRupiahOptions {
  /**
   * Sertakan simbol mata uang "Rp" di depan angka (default: true).
   * Jika false, hanya angka berformat pemisah ribuan titik (contoh: "150.000").
   */
  withSymbol?: boolean;

  /**
   * Jumlah digit desimal maksimum (default: 0).
   */
  maximumFractionDigits?: number;
}

export function formatRupiah(
  amount: number,
  optionsOrWithSymbol: boolean | FormatRupiahOptions = true
): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  const withSymbol =
    typeof optionsOrWithSymbol === "boolean"
      ? optionsOrWithSymbol
      : optionsOrWithSymbol?.withSymbol ?? true;

  const maximumFractionDigits =
    typeof optionsOrWithSymbol === "object" &&
    optionsOrWithSymbol?.maximumFractionDigits !== undefined
      ? optionsOrWithSymbol.maximumFractionDigits
      : 0;

  if (!withSymbol) {
    return new Intl.NumberFormat("id-ID", {
      maximumFractionDigits
    }).format(safeAmount);
  }

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits
  }).format(safeAmount);
}

export function parseRupiah(value: string | number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;

  // Remove non-numeric characters except minus sign
  const cleaned = value.replace(/[^0-9-]/g, "");
  const parsed = parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

