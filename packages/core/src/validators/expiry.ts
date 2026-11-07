/**
 * Drug Expiry Date (ED) Evaluation & Alerting
 */

export interface ExpiryEvaluationResult {
  daysLeft: number;
  status: "OVERDUE" | "DUE_SOON" | "SAFE";
  isExpired: boolean;
  isDueSoon: boolean;
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
  if (!expiredDate) {
    return {
      daysLeft: 9999,
      status: "SAFE",
      isExpired: false,
      isDueSoon: false
    };
  }

  const expTime = new Date(expiredDate).getTime();
  const refTime = new Date(referenceDate).getTime();

  if (Number.isNaN(expTime) || Number.isNaN(refTime)) {
    return {
      daysLeft: 9999,
      status: "SAFE",
      isExpired: false,
      isDueSoon: false
    };
  }

  const diffMs = expTime - refTime;
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const isExpired = daysLeft <= 0;
  const isDueSoon = !isExpired && daysLeft <= warningDaysThreshold;

  const status: "OVERDUE" | "DUE_SOON" | "SAFE" = isExpired
    ? "OVERDUE"
    : isDueSoon
      ? "DUE_SOON"
      : "SAFE";

  return {
    daysLeft,
    status,
    isExpired,
    isDueSoon
  };
}

