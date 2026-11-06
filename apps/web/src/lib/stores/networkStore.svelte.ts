import { browser } from "$app/environment";
import { localDb, type LocalPendingSale } from "@apoteku/db/client-indexeddb";
import { api } from "../services/api.js";

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
    const pendingItem: LocalPendingSale = {
      id: sale.id,
      invoiceNo: sale.invoiceNo,
      payload: sale.payload,
      createdAt: sale.createdAt || new Date().toISOString(),
      synced: 0,
      retryCount: 0,
      lastError: null
    };

    await localDb.pendingSales.put(pendingItem);
    await this.refreshPendingCount();

    // If online, immediately try to sync
    if (this.effectiveOnline) {
      this.syncPendingSales();
    }
  }

  async syncPendingSales() {
    if (!browser || this.isSyncing || !this.effectiveOnline) return;

    this.isSyncing = true;
    this.syncMessage = "Menyinkronkan transaksi offline...";

    try {
      const unsynced = await localDb.pendingSales
        .where("synced")
        .equals(0)
        .toArray();

      if (unsynced.length === 0) {
        this.pendingCount = 0;
        this.syncMessage = "Semua transaksi tersinkron";
        return;
      }

      // Convert unsynced items to backend SyncSalesRequestPayload format
      const branchId =
        unsynced[0].payload.branchId || "01931818-8000-7000-8000-000000000002";
      const cashierShiftId =
        unsynced[0].payload.cashierShiftId ||
        "01931818-8000-7000-8000-000000000005";

      const transactions = unsynced.map((u) => {
        const p = u.payload;
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
          patientName: p.customerName || null,
          doctorName: null,
          paymentMethod: (p.paymentMethod || "CASH") as
            | "CASH"
            | "QRIS"
            | "EDC_DEBIT"
            | "EDC_CREDIT"
            | "TRANSFER"
            | "TEMPO",
          subtotal: Number(p.subtotal || 0),
          discountPercent: 0,
          discountAmount: Number(p.invoiceDiscount || 0),
          taxPercent: 11,
          taxAmount: Number(p.taxAmount || 0),
          tuslahAmount: 0,
          embalaseAmount: 0,
          grandTotal: Number(p.grandTotal || 0),
          paidAmount: Number(p.cashPaid || p.grandTotal || 0),
          changeAmount: Number(p.changeAmount || 0),
          createdAt: u.createdAt,
          items: (p.items || []).map((item: any, idx: number) => ({
            id: `01931818-a000-7000-8000-${String(idx + 1).padStart(12, "0")}`,
            productId: item.productId,
            batchId: item.batches?.[0]?.batchId || null,
            locationId: "01931818-8000-7000-8000-000000000004",
            unitName: item.selectedUnit || "Tablet",
            conversionFactor: item.multiplier || 1,
            qty: item.quantity,
            qtyBase: item.quantity * (item.multiplier || 1),
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent || 0,
            discountAmount: item.discountAmount || 0,
            subtotal: item.subtotal || item.quantity * item.unitPrice,
            dosageRules: null
          }))
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
    } catch (err: any) {
      console.warn("[NetworkStore] Sync error:", err);
      this.syncMessage =
        "Koneksi terputus: Transaksi tersimpan aman di IndexedDB kasir";
    } finally {
      this.isSyncing = false;
      setTimeout(() => {
        this.syncMessage = "";
      }, 4000);
    }
  }
}

export const networkStore = new NetworkState();
