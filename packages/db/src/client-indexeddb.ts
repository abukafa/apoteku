import Dexie, { type Table } from "dexie";

export interface LocalProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  activeSubstance?: string | null;
  dosageForm?: string | null;
  defaultDosage?: string | null;
  rackLocation?: string | null;
  drugClass: string;
  baseUnit: string;
  defaultPurchaseUnit?: string | null;
  referenceBuyPriceBase?: number;
  isConsignment?: boolean;
  isActive: boolean;
  units: Array<{
    unitName: string;
    conversionFactor: number;
    buyPrice?: number;
    salePriceGeneral: number;
    salePriceResep: number;
    salePriceGrosir: number;
    salePriceDelivery: number;
    salePriceMember: number;
    isBaseUnit: boolean;
    isSellable?: boolean;
    isPurchaseUnit?: boolean;
  }>;
  updatedAt: string;
}

export interface LocalBranchStock {
  productId: string;
  locationId: string;
  totalQtyBase: number;
  unbatchedQtyBase: number;
  updatedAt: string;
}

export interface LocalBatchStock {
  id: string; // composite: `${locationId}_${productId}_${batchId}`
  productId: string;
  locationId: string;
  batchId: string;
  batchNo: string | null;
  expiredDate: string | null;
  qtyBase: number;
  buyPrice: number;
  updatedAt: string;
}

export interface LocalPendingSale {
  id: string; // UUIDv7
  invoiceNo: string;
  payload: any;
  createdAt: string;
  synced: 0 | 1; // 0 = Pending, 1 = Synced
  retryCount: number;
  lastError: string | null;
}

export interface LocalStaffAuth {
  userId: string;
  username: string;
  fullName: string;
  role: string;
  pinHash: string; // Hash PBKDF2 dari PIN kasir
  tokenPayload: {
    tenantId: string;
    branchId: string;
    exp: number;
  };
}

export class ApotekuDexieDB extends Dexie {
  products!: Table<LocalProduct, string>;
  branchStocks!: Table<LocalBranchStock, string>;
  batchStocks!: Table<LocalBatchStock, string>;
  pendingSales!: Table<LocalPendingSale, string>;
  staffAuth!: Table<LocalStaffAuth, string>;

  constructor() {
    super("ApotekuLocalDB");
    this.version(3).stores({
      products: "id, sku, barcode, name, activeSubstance, rackLocation, drugClass, isActive, updatedAt",
      branchStocks: "[locationId+productId], locationId, productId, totalQtyBase, updatedAt",
      batchStocks: "id, [locationId+productId], productId, locationId, batchId, batchNo, expiredDate, qtyBase, [locationId+productId+expiredDate]",
      pendingSales: "id, invoiceNo, createdAt, synced, retryCount",
      staffAuth: "userId, username",
    });
  }
}

export const localDb = new ApotekuDexieDB();
