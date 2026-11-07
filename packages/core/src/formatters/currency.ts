/**
 * Indonesian Rupiah (IDR) Currency Formatter & Parser
 */

export function formatRupiah(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
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

