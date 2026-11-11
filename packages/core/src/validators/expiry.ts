/**
 * Drug Expiry Date (ED) Evaluation & Alerting
 */

export type ExpiryColorLevel = "red" | "yellow" | "green";

export interface ExpiryEvaluationResult {
  daysLeft: number;
  sisaHari: number;
  criticalDaysThreshold: number;
  status: "OVERDUE" | "DUE_SOON" | "SAFE";
  level: ExpiryColorLevel;
  isExpired: boolean;
  isCritical: boolean;
  isDueSoon: boolean;
  label: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const UNKNOWN_EXPIRY_DAYS = 9999;

function toCalendarDayUtcMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;

  if (typeof value === "string") {
    const isoMatch = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  }

  if (Number.isNaN(value.getTime())) return null;

  // Date yang dibuat dari string ISO (mis. new Date("2026-06-01")) tepat di 00:00:00Z
  if (
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  ) {
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }

  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
}

/**
 * Menghitung sisa hari menuju tanggal kedaluwarsa: sisaHari = ED - today.
 * Nilai negatif menandakan obat sudah melewati ED.
 */
export function sisaHari(
  expiredDate: string | Date | null | undefined,
  today: string | Date = new Date()
): number {
  const expDayMs = toCalendarDayUtcMs(expiredDate);
  const todayDayMs = toCalendarDayUtcMs(today);

  if (expDayMs === null || todayDayMs === null) {
    return UNKNOWN_EXPIRY_DAYS;
  }

  return Math.round((expDayMs - todayDayMs) / MS_PER_DAY);
}

/**
 * Menentukan level warna peringatan ED secara dinamis berdasarkan batas hari:
 * - "red"    jika sisaHari <= daysLeft / 3 (termasuk sudah ED <= 0)
 * - "yellow" jika sisaHari <= daysLeft
 * - "green"  jika sisaHari > daysLeft
 */
export function getExpiryColorLevel(
  remainingDays: number,
  warningDaysThreshold: number = 90
): ExpiryColorLevel {
  const threshold = Math.max(1, Number(warningDaysThreshold) || 90);
  const criticalThreshold = threshold / 3;

  if (remainingDays <= criticalThreshold) return "red";
  if (remainingDays <= threshold) return "yellow";
  return "green";
}

/**
 * Memformat keterangan durasi sisa masa simpan menuju ED untuk ditampilkan di UI.
 */
export function formatSisaHariLabel(remainingDays: number): string {
  if (!Number.isFinite(remainingDays) || remainingDays >= UNKNOWN_EXPIRY_DAYS) {
    return "ED belum ditentukan";
  }
  if (remainingDays < 0) {
    return `Sudah ED ${Math.abs(remainingDays)} hari lalu`;
  }
  if (remainingDays === 0) {
    return "ED Hari Ini";
  }
  if (remainingDays === 1) {
    return "1 hari lagi";
  }
  if (remainingDays < 60) {
    return `${remainingDays} hari lagi`;
  }
  if (remainingDays < 365) {
    return `${remainingDays} hari lagi (~${Math.round(remainingDays / 30)} bln)`;
  }
  const years = (remainingDays / 365).toFixed(1).replace(/\.0$/, "");
  return `${remainingDays} hari lagi (~${years} thn)`;
}

/**
 * Mengevaluasi sisa masa simpan obat berdasarkan tanggal kedaluwarsa
 * @param expiredDate Tanggal ED (string YYYY-MM-DD atau Date)
 * @param warningDaysThreshold Batas hari peringatan (default: 90 hari / 3 bulan untuk defekta apotek)
 * @param referenceDate Tanggal acuan (default: hari ini)
 */
export function evaluateExpiryStatus(
  expiredDate: string | Date | null | undefined,
  warningDaysThreshold: number = 90,
  referenceDate: string | Date = new Date()
): ExpiryEvaluationResult {
  const threshold = Math.max(1, Number(warningDaysThreshold) || 90);
  const criticalDaysThreshold = threshold / 3;
  const remainingDays = sisaHari(expiredDate, referenceDate);

  if (remainingDays >= UNKNOWN_EXPIRY_DAYS) {
    return {
      daysLeft: UNKNOWN_EXPIRY_DAYS,
      sisaHari: UNKNOWN_EXPIRY_DAYS,
      criticalDaysThreshold,
      status: "SAFE",
      level: "green",
      isExpired: false,
      isCritical: false,
      isDueSoon: false,
      label: formatSisaHariLabel(UNKNOWN_EXPIRY_DAYS)
    };
  }

  const isExpired = remainingDays <= 0;
  const isCritical = !isExpired && remainingDays <= criticalDaysThreshold;
  const isDueSoon = !isExpired && remainingDays <= threshold;
  const level = getExpiryColorLevel(remainingDays, threshold);

  const status: "OVERDUE" | "DUE_SOON" | "SAFE" = isExpired
    ? "OVERDUE"
    : isDueSoon
      ? "DUE_SOON"
      : "SAFE";

  return {
    daysLeft: remainingDays,
    sisaHari: remainingDays,
    criticalDaysThreshold,
    status,
    level,
    isExpired,
    isCritical,
    isDueSoon,
    label: formatSisaHariLabel(remainingDays)
  };
}

