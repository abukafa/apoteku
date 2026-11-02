export interface BatchCandidate {
  batchId: string;
  batchNo: string | null;
  expiredDate: string | null; // ISO YYYY-MM-DD
  qtyBase: number;
}

export interface FefoAllocationResult {
  isFullyAllocated: boolean;
  allocatedQtyBase: number;
  remainingRequiredBase: number;
  batches: Array<{
    batchId: string;
    batchNo: string | null;
    expiredDate: string | null;
    allocatedQtyBase: number;
  }>;
}

/**
 * Memilih alokasi batch secara FEFO (First-Expired, First-Out)
 * Kandidat batch diasumsikan sudah diurutkan berdasarkan expiredDate asc.
 */
export function selectFefoBatches(
  availableBatches: BatchCandidate[],
  requiredQtyBase: number
): FefoAllocationResult {
  let remaining = requiredQtyBase;
  const allocations: FefoAllocationResult['batches'] = [];

  for (const batch of availableBatches) {
    if (remaining <= 0) break;
    if (batch.qtyBase <= 0) continue;

    const alloc = Math.min(batch.qtyBase, remaining);
    allocations.push({
      batchId: batch.batchId,
      batchNo: batch.batchNo,
      expiredDate: batch.expiredDate,
      allocatedQtyBase: alloc,
    });
    remaining -= alloc;
  }

  return {
    isFullyAllocated: remaining <= 0,
    allocatedQtyBase: requiredQtyBase - remaining,
    remainingRequiredBase: Math.max(0, remaining),
    batches: allocations,
  };
}
