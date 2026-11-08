import { browser } from "$app/environment";
import { localDb, type LocalPendingSale } from "@apoteku/db/client-indexeddb";
import { api } from "../services/api.js";
import { alertStore } from "./alertStore.svelte.js";

export class NetworkState {
  isOnline = $state(true);
  isSimulatedOffline = $state(false);
  isSyncing = $state(false);
  pendingCount = $state(0);
  lastSyncTime = $state<string | null>(null);
  syncMessage = $state("");

  effectiveOnline = $derived(this.isOnline && !this.isSimulatedOffline);

  constructor() {
    if (browser) {
      this.isOnline = navigator.onLine;

      window.addEventListener("online", () => {
        this.isOnline = true;
        this.syncPendingSales();
      });

      window.addEventListener("offline", () => {
        this.isOnline = false;
      });

      // Refresh pending count from Dexie
      this.refreshPendingCount();

      // Periodic sync check (every 30s)
      setInterval(() => {
        if (this.effectiveOnline && this.pendingCount > 0 && !this.isSyncing) {
          this.syncPendingSales();
        }
      }, 30000);
    }
  }

  async refreshPendingCount() {
    if (!browser) return;
    try {
      this.pendingCount = await localDb.pendingSales
        .where("synced")
        .equals(0)
        .count();
    } catch (err) {
      console.warn("Failed to query Dexie pendingSales count:", err);
    }
  }

  toggleOfflineSimulation() {
    this.isSimulatedOffline = !this.isSimulatedOffline;
    if (!this.isSimulatedOffline && this.isOnline) {
      this.syncPendingSales();
    }
  }

  async queueSale(sale: {
    id: string;
    invoiceNo: string;
    payload: any;
    createdAt?: string;
  }) {
    if (!browser) return;

    // Bersihkan proxy Svelte 5 / getter / non-clonable references agar aman disimpan di IndexedDB
    let cleanPayload: any;
    try {
      cleanPayload = JSON.parse(JSON.stringify(sale.payload));
    } catch (_) {
      cleanPayload = { ...sale.payload };
    }

    const pendingItem: LocalPendingSale = {
      id: sale.id,
      invoiceNo: sale.invoiceNo,
      payload: cleanPayload,
      createdAt: sale.createdAt || new Date().toISOString(),
      synced: 0,
      retryCount: 0,
      lastError: null
    };

    await localDb.pendingSales.put(pendingItem);

    // Potong stok lokal di IndexedDB secara instan (agar FEFO transaksi berikutnya akurat)
    if (cleanPayload?.items && Array.isArray(cleanPayload.items)) {
      try {
        for (const item of cleanPayload.items) {
          const multiplier = item.multiplier || 1;
          const totalQtyBase = (item.quantity || 1) * multiplier;

          // 1. Potong batch lokal yang dialokasikan FEFO
          if (item.batches && Array.isArray(item.batches)) {
            for (const b of item.batches) {
              if (b.batchId && b.batchId !== "batch-local-01") {
                const batchRecord = await localDb.batchStocks.where("batchId").equals(b.batchId).first();
                if (batchRecord) {
                  const newQty = Math.max(0, batchRecord.qtyBase - (b.quantity || 0));
                  await localDb.batchStocks.update(batchRecord.id, {
                    qtyBase: newQty,
                    updatedAt: new Date().toISOString()
                  });
                }
              }
            }
          }

          // 2. Potong saldo total stok cabang lokal
          if (item.productId) {
            const branchStock = await localDb.branchStocks.where("productId").equals(item.productId).first();
            if (branchStock) {
              const newTotal = Math.max(0, branchStock.totalQtyBase - totalQtyBase);
              await localDb.branchStocks.put({
                ...branchStock,
                totalQtyBase: newTotal,
                updatedAt: new Date().toISOString()
              });
            }
          }
        }
      } catch (stockDeductErr) {
        console.warn("[NetworkStore] Gagal memotong stok lokal Dexie:", stockDeductErr);
      }
    }

    await this.refreshPendingCount();

    // If online, immediately try to sync
    if (this.effectiveOnline) {
      this.syncPendingSales();
    }
  }

  async syncPendingSales(isManual = false) {
    if (!browser || this.isSyncing || !this.effectiveOnline) return;

    try {
      const unsynced = await localDb.pendingSales
        .where("synced")
        .equals(0)
        .toArray();

      if (unsynced.length === 0) {
        this.pendingCount = 0;
        this.syncMessage = "Semua transaksi tersinkron";
        if (isManual) {
          alertStore.toast({
            title: "Semua Tersinkron",
            message: "Seluruh nota kasir sudah tersinkronisasi rapi ke server.",
            type: "success",
            duration: 2500
          });
        }
        return;
      }

      this.isSyncing = true;
      this.syncMessage = "Menyinkronkan transaksi offline...";
      alertStore.toast({
        title: "Sinkronisasi POS",
        message: `Menyinkronkan ${unsynced.length} transaksi offline ke server...`,
        type: "info",
        isSpinning: true,
        duration: 2500
      });

      // Convert unsynced items to backend SyncSalesRequestPayload format
      const branchId =
        unsynced[0].payload.branchId || "01931818-8000-7000-8000-000000000002";
      const cashierShiftId =
        unsynced[0].payload.cashierShiftId ||
        "01931818-8000-7000-8000-000000000005";

      const transactions = unsynced.map((u) => {
        const p = u.payload;

        // Pecah (split) item per nomor batch hasil alokasi FEFO
        const trxItems: any[] = [];
        let seq = 1;

        for (const it of (p.items || [])) {
          const itemLocationId =
            it.locationId && !it.locationId.startsWith("01931818-8000")
              ? it.locationId
              : p.locationId && !p.locationId.startsWith("01931818-8000")
              ? p.locationId
              : null;
          const mult = it.multiplier || 1;
          const uPrice = it.unitPrice || 0;
          const dosage = it.dosageRules || it.dosage || null;
          const expectedTotalBase = (it.quantity || 1) * mult;

          if (
            it.batches &&
            it.batches.length === 1 &&
            (!it.batches[0].batchId || it.batches[0].batchId === "batch-local-01")
          ) {
            // Kasus single batch lokal/fallback: gunakan kuantitas utuh yang dibeli kasir
            trxItems.push({
              id:
                typeof crypto !== "undefined" && crypto.randomUUID
                  ? crypto.randomUUID()
                  : `01931818-a000-7000-8000-${String(seq++).padStart(12, "0")}`,
              productId: it.productId,
              batchId: null,
              locationId: itemLocationId,
              unitName: it.selectedUnit || "Tablet",
              conversionFactor: mult,
              qty: it.quantity || 1,
              qtyBase: expectedTotalBase,
              unitPrice: uPrice,
              discountPercent: it.discountPercent || 0,
              discountAmount: it.discountAmount || 0,
              subtotal: it.subtotal || Math.round((it.quantity || 1) * uPrice),
              dosageRules: dosage
            });
          } else if (it.batches && it.batches.length > 0) {
            let totalBatchQtyBase = 0;
            for (const b of it.batches) {
              const batchQtyBase = b.quantity || 0;
              if (batchQtyBase > 0) {
                totalBatchQtyBase += batchQtyBase;
                const itemQty = batchQtyBase / mult;
                const batchSubtotal = Math.round(itemQty * uPrice);
                trxItems.push({
                  id:
                    typeof crypto !== "undefined" && crypto.randomUUID
                      ? crypto.randomUUID()
                      : `01931818-a000-7000-8000-${String(seq++).padStart(12, "0")}`,
                  productId: it.productId,
                  batchId: b.batchId && b.batchId !== "batch-local-01" ? b.batchId : null,
                  locationId: itemLocationId,
                  unitName: it.selectedUnit || "Tablet",
                  conversionFactor: mult,
                  qty: itemQty,
                  qtyBase: batchQtyBase,
                  unitPrice: uPrice,
                  discountPercent: it.discountPercent || 0,
                  discountAmount: it.discountAmount || 0,
                  subtotal: batchSubtotal,
                  dosageRules: dosage
                });
              }
            }

            // Jika total batch masih di bawah kebutuhan kasir (stok batch habis / defisit offline),
            // tambahkan sisa kekurangan sebagai unbatched agar total QTY yang dibeli tetap utuh
            if (expectedTotalBase > totalBatchQtyBase) {
              const deficitBase = expectedTotalBase - totalBatchQtyBase;
              const deficitQty = deficitBase / mult;
              const deficitSubtotal = Math.round(deficitQty * uPrice);

              trxItems.push({
                id:
                  typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `01931818-a000-7000-8000-${String(seq++).padStart(12, "0")}`,
                productId: it.productId,
                batchId: null,
                locationId: itemLocationId,
                unitName: it.selectedUnit || "Tablet",
                conversionFactor: mult,
                qty: deficitQty,
                qtyBase: deficitBase,
                unitPrice: uPrice,
                discountPercent: it.discountPercent || 0,
                discountAmount: it.discountAmount || 0,
                subtotal: deficitSubtotal,
                dosageRules: dosage
              });
            }
          } else {
            const singleQtyBase = (it.quantity || 1) * mult;
            trxItems.push({
              id:
                typeof crypto !== "undefined" && crypto.randomUUID
                  ? crypto.randomUUID()
                  : `01931818-a000-7000-8000-${String(seq++).padStart(12, "0")}`,
              productId: it.productId,
              batchId: null,
              locationId: itemLocationId,
              unitName: it.selectedUnit || "Tablet",
              conversionFactor: mult,
              qty: it.quantity || 1,
              qtyBase: singleQtyBase,
              unitPrice: uPrice,
              discountPercent: it.discountPercent || 0,
              discountAmount: it.discountAmount || 0,
              subtotal: it.subtotal || (it.quantity || 1) * uPrice,
              dosageRules: dosage
            });
          }
        }

        return {
          id: u.id,
          invoiceNo: u.invoiceNo,
          cashierUserId:
            p.cashierId || "01931818-8000-7000-8000-000000000003",
          customerType: (p.customerType || "UMUM") as
            | "UMUM"
            | "RESEP"
            | "GROSIR"
            | "MEMBER"
            | "DELIVERY",
          customerId: p.customerId || null,
          patientName: p.patientName || p.customerName || null,
          doctorName: p.doctorName || null,
          paymentMethod: (p.paymentMethod || "CASH") as
            | "CASH"
            | "QRIS"
            | "EDC_DEBIT"
            | "EDC_CREDIT"
            | "TRANSFER"
            | "TEMPO",
          subtotal: Number(p.subtotal || 0),
          discountPercent: Number(p.discountPercent || 0),
          discountAmount: Number(p.invoiceDiscount || p.discountAmount || 0),
          taxPercent: Number(p.taxPercent || 11),
          taxAmount: Number(p.taxAmount || 0),
          tuslahAmount: Number(p.tuslahAmount || 0),
          embalaseAmount: Number(p.embalaseAmount || 0),
          grandTotal: Number(p.grandTotal || 0),
          paidAmount: Number(p.cashPaid || p.grandTotal || 0),
          changeAmount: Number(p.changeAmount || 0),
          createdAt: u.createdAt,
          items: trxItems
        };
      });

      await api.pos.syncSales({
        branchId,
        cashierShiftId,
        transactions
      });

      // Mark synced items in Dexie
      for (const item of unsynced) {
        await localDb.pendingSales.update(item.id, { synced: 1 });
      }
      await this.refreshPendingCount();
      this.lastSyncTime = new Date().toLocaleTimeString("id-ID");
      this.syncMessage = `${unsynced.length} transaksi offline berhasil disinkronkan!`;
      alertStore.toast({
        title: "Sinkronisasi Berhasil",
        message: `${unsynced.length} transaksi offline disinkronkan ke server.`,
        type: "success",
        duration: 3500
      });
    } catch (err: any) {
      console.warn("[NetworkStore] Sync error:", err);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        this.syncMessage = "Koneksi offline: Transaksi tersimpan aman di Lokal";
        alertStore.toast({
          title: "Mode Offline",
          message: "Koneksi terputus. Transaksi tersimpan aman di Lokal.",
          type: "warning",
          duration: 4000
        });
      } else {
        const errorDetail = err?.message || "Gagal menghubungi server";
        this.syncMessage = `Sinkron tertunda (${errorDetail}): Transaksi aman di lokal`;
        alertStore.toast({
          title: "Sinkron Tertunda",
          message: `Gagal menghubungi server (${errorDetail}). Transaksi aman di lokal.`,
          type: "warning",
          duration: 4500
        });
      }
    } finally {
      this.isSyncing = false;
      setTimeout(() => {
        this.syncMessage = "";
      }, 4000);
    }
  }
}

export const networkStore = new NetworkState();
