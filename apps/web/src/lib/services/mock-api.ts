import type { ActiveUser } from '../stores/authStore.svelte';
import { browser } from '$app/environment';
import { api } from './api.js';

export type PriceTier = 'general' | 'prescription' | 'wholesale' | 'delivery' | 'member';

export type DrugClass = 'OTC' | 'LIMITED_OTC' | 'ETHICAL' | 'NARCOTICS' | 'PSYCHOTROPIC';

export interface ProductPriceTiers {
  general: number;
  prescription: number;
  wholesale: number;
  delivery: number;
  member: number;
}

export interface ProductUnit {
  unit: string;
  multiplier: number;
  buyPrice?: number;
  isSellable?: boolean;
  isPurchaseUnit?: boolean;
  prices: ProductPriceTiers;
}

export interface ProductBatch {
  id: string;
  batchNumber: string;
  branchId: string;
  expiryDate: string;
  stock: number;
  buyPrice: number;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  genericName?: string;
  categoryId: string;
  categoryName: string;
  drugClass: DrugClass;
  requiresPrescription: boolean;
  isConsignment: boolean;
  manufacturer: string;
  description: string;
  indication: string;
  dosage: string;
  baseUnit: string;
  defaultPurchaseUnit?: string;
  referenceBuyPriceBase?: number;
  units: ProductUnit[];
  batches: ProductBatch[];
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  isCenter: boolean;
  phone: string;
  address: string;
  sia: string;
  sipa: string;
  pharmacistName: string;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  icon?: string;
  description?: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
  priceTier: PriceTier;
  loyaltyPoints: number;
}

export interface Doctor {
  id: string;
  code?: string;
  name: string;
  sip: string;
  hospital?: string;
  phone?: string;
  specialization?: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
  topDays: number;
  pbfLicense: string;
  isConsignment?: boolean;
}

export interface CashierShift {
  id: string;
  branchId: string;
  shiftName: string;
  cashierId: string;
  cashierName: string;
  startTime: string;
  startingCash: number;
  status: 'OPEN' | 'CLOSED';
}

export interface CartItemBatchAllocation {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
}

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  selectedUnit: string;
  multiplier: number;
  priceTier: PriceTier;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  discountAmount: number;
  subtotal: number;
  batches: CartItemBatchAllocation[];
}

export interface CheckoutPayload {
  branchId: string;
  cashierId: string;
  cashierName: string;
  customerId?: string;
  customerName?: string;
  doctorId?: string;
  doctorName?: string;
  paymentMethod: 'CASH' | 'QRIS' | 'DEBIT' | 'TRANSFER';
  items: CartItem[];
  subtotal: number;
  invoiceDiscount: number;
  taxAmount: number;
  roundingAmount: number;
  grandTotal: number;
  cashPaid: number;
  changeAmount: number;
  notes?: string;
}

export interface CheckoutResult {
  success: boolean;
  invoiceNumber: string;
  transactionTime: string;
  message: string;
  payload: CheckoutPayload;
}

// Simulasi network delay
const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-1", name: "Obat Bebas & Alkes", code: "BEBAS", description: "Obat bebas tanda hijau" },
  { id: "cat-2", name: "Obat Bebas Terbatas", code: "BEBAS_TERBATAS", description: "Obat bebas terbatas tanda biru" },
  { id: "cat-3", name: "Obat Keras", code: "KERAS", description: "Obat keras tanda merah lingkaran K" },
  { id: "cat-4", name: "Narkotika & Psikotropika", code: "NARKOTIKA", description: "Obat terkontrol regulasi Kemenkes" },
  { id: "cat-5", name: "Herbal & Suplemen", code: "HERBAL", description: "Jamu, herbal terstandar & fitofarmaka" }
];

const DEFAULT_DOCTORS: Doctor[] = [
  { id: "doc-1", name: "dr. Hendra Setiawan, Sp.PD", sip: "SIP.503/441/Dinkes/2024", specialization: "Spesialis Penyakit Dalam", phone: "081234567891" },
  { id: "doc-2", name: "dr. Anisa Rahmawati, Sp.A", sip: "SIP.503/442/Dinkes/2024", specialization: "Spesialis Anak", phone: "081234567892" },
  { id: "doc-3", name: "dr. Budi Santoso, Sp.JP", sip: "SIP.503/443/Dinkes/2024", specialization: "Spesialis Jantung & Pembuluh Darah", phone: "081234567893" },
  { id: "doc-4", name: "dr. Siti Nurhaliza", sip: "SIP.503/444/Dinkes/2024", specialization: "Dokter Umum", phone: "081234567894" }
];

class MockApiService {
  private products: Product[] = [];
  private branches: Branch[] = [];
  private categories: Category[] = DEFAULT_CATEGORIES;
  private customers: Customer[] = [];
  private doctors: Doctor[] = DEFAULT_DOCTORS;
  private suppliers: Supplier[] = [];
  private shifts: CashierShift[] = [];
  private users: ActiveUser[] = [];

  private isLoadedFromApi = false;
  private loadedBranchId: string | undefined = undefined;
  private isSuppliersLoaded = false;
  private loadPromise: Promise<void> | null = null;

  async ensureDataLoaded(branchId?: string): Promise<void> {
    while (this.loadPromise) {
      await this.loadPromise;
    }
    if (this.isLoadedFromApi && (!branchId || this.loadedBranchId === branchId)) return;

    this.loadPromise = (async () => {
      try {
        const res = await api.pos.getBootstrap(branchId, true);
        if (res?.success && res?.data) {
          const d = res.data;
          const activeBranchId = d.branch?.id || branchId || "1";

          const batchesByProductId = new Map<string, any[]>();
          for (const b of d.branchBatches || []) {
            const list = batchesByProductId.get(b.productId) || [];
            list.push(b);
            batchesByProductId.set(b.productId, list);
          }

          const stocksByProductId = new Map<string, any[]>();
          for (const s of d.branchStocks || []) {
            const list = stocksByProductId.get(s.productId) || [];
            list.push(s);
            stocksByProductId.set(s.productId, list);
          }

          if (Array.isArray(d.products) && d.products.length > 0) {
            this.products = d.products.map((p: any) => {
              const rawClass = String(p.drugClass || "BEBAS").toUpperCase();
              const categoryId =
                rawClass === "KERAS"
                  ? "cat-3"
                  : rawClass === "NARKOTIKA" || rawClass === "PSIKOTROPIKA"
                    ? "cat-4"
                    : rawClass === "BEBAS_TERBATAS"
                      ? "cat-2"
                      : "cat-1";
              const categoryName =
                rawClass === "KERAS"
                  ? "Obat Keras"
                  : rawClass === "NARKOTIKA" || rawClass === "PSIKOTROPIKA"
                    ? "Narkotika & Psikotropika"
                    : rawClass === "BEBAS_TERBATAS"
                      ? "Obat Bebas Terbatas"
                      : "Obat Bebas & Alkes";

              const mappedUnits: ProductUnit[] = (p.units || []).map((u: any) => ({
                unit: u.unitName,
                multiplier: Number(u.conversionFactor) || 1,
                buyPrice: Number(u.buyPrice || 0),
                isSellable: u.isSellable !== false,
                isPurchaseUnit: Boolean(u.isPurchaseUnit),
                prices: {
                  general: Math.round(Number(u.salePriceGeneral || 0)),
                  prescription: Math.round(Number(u.salePriceResep || u.salePriceGeneral || 0)),
                  wholesale: Math.round(Number(u.salePriceGrosir || u.salePriceGeneral || 0)),
                  delivery: Math.round(Number(u.salePriceDelivery || u.salePriceGeneral || 0)),
                  member: Math.round(Number(u.salePriceMember || u.salePriceGeneral || 0))
                }
              }));

              if (mappedUnits.length === 0) {
                mappedUnits.push({
                  unit: p.baseUnit || "PCS",
                  multiplier: 1,
                  buyPrice: Math.round(Number(p.referenceBuyPriceBase || 0)),
                  isSellable: true,
                  isPurchaseUnit: true,
                  prices: {
                    general: 0,
                    prescription: 0,
                    wholesale: 0,
                    delivery: 0,
                    member: 0
                  }
                });
              }

              const prodBatches = batchesByProductId.get(p.id) || [];
              let mappedBatches: ProductBatch[] = prodBatches.map((b: any) => ({
                id: b.batchId || b.id || `batch-${p.id}`,
                batchNumber: b.batchNo || "BATCH-REG",
                branchId: activeBranchId,
                expiryDate: b.expiredDate || "2027-12-31",
                stock: Number(b.qtyBase ?? 0),
                buyPrice: Number(b.buyPrice || 0)
              }));

              if (mappedBatches.length === 0) {
                const prodStocks = stocksByProductId.get(p.id) || [];
                const totalStock = prodStocks.reduce(
                  (acc: number, s: any) => acc + Number(s.totalQtyBase || s.unbatchedQtyBase || 0),
                  0
                );
                if (totalStock > 0) {
                  mappedBatches = [
                    {
                      id: `stock-${p.id}`,
                      batchNumber: "STOK-AKTIF",
                      branchId: activeBranchId,
                      expiryDate: "2027-12-31",
                      stock: totalStock,
                      buyPrice: 0
                    }
                  ];
                }
              }

              return {
                id: p.id,
                sku: p.sku || "",
                barcode: p.barcode || "",
                name: p.name,
                genericName: p.activeSubstance || undefined,
                categoryId,
                categoryName,
                drugClass: (rawClass === "KERAS"
                  ? "ETHICAL"
                  : rawClass === "NARKOTIKA"
                    ? "NARCOTICS"
                    : rawClass === "PSIKOTROPIKA"
                      ? "PSYCHOTROPIC"
                      : rawClass === "BEBAS_TERBATAS"
                        ? "LIMITED_OTC"
                        : "OTC") as DrugClass,
                requiresPrescription:
                  rawClass === "KERAS" || rawClass === "NARKOTIKA" || rawClass === "PSIKOTROPIKA",
                isConsignment: Boolean(p.isConsignment),
                manufacturer: "PBF Terdaftar",
                description: p.activeSubstance || p.name,
                indication: p.indication || "Sesuai anjuran medis",
                dosage: p.defaultDosage || "3x1 Sehari",
                baseUnit: p.baseUnit || "PCS",
                defaultPurchaseUnit: p.defaultPurchaseUnit || undefined,
                referenceBuyPriceBase: Number(p.referenceBuyPriceBase || 0),
                units: mappedUnits,
                batches: mappedBatches
              };
            });
          }
          if (Array.isArray(d.branches) && d.branches.length > 0) {
            this.branches = d.branches;
          }
          if (Array.isArray(d.customers) && d.customers.length > 0) {
            this.customers = d.customers;
          }
          this.isLoadedFromApi = true;
          this.loadedBranchId = branchId || activeBranchId;
        }
      } catch (err) {
        console.warn("[MockApi] Backend unavailable, continuing with offline/local fallback:", err);
      } finally {
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  async getUsers(): Promise<ActiveUser[]> {
    try {
      const res = await api.users.list();
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        this.users = res.data;
      }
    } catch (_) {}
    return [...this.users];
  }

  async getBranches(): Promise<Branch[]> {
    try {
      const res = await api.branches.list();
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        this.branches = res.data;
      }
    } catch (_) {}
    return [...this.branches];
  }

  async getUserByEmail(email: string): Promise<ActiveUser | null> {
    await delay(50);
    return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim()) || null;
  }

  async getUserById(id: string): Promise<ActiveUser | null> {
    await delay(40);
    return this.users.find((u) => u.id === id) || null;
  }

  async getCategories(): Promise<Category[]> {
    await delay(60);
    return [...this.categories];
  }

  async getCustomers(searchQuery?: string): Promise<Customer[]> {
    await this.ensureDataLoaded();
    if (!searchQuery) return [...this.customers];
    const q = searchQuery.toLowerCase().trim();
    return this.customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.phone.includes(q)
    );
  }

  async getDoctors(searchQuery?: string): Promise<Doctor[]> {
    await delay(100);
    if (!searchQuery) return [...this.doctors];
    const q = searchQuery.toLowerCase().trim();
    return this.doctors.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.sip.toLowerCase().includes(q) ||
        (d.hospital ? d.hospital.toLowerCase().includes(q) : false)
    );
  }

  async getSuppliers(searchQuery?: string): Promise<Supplier[]> {
    if (!this.isSuppliersLoaded) {
      try {
        const res = await api.erp.getSuppliers();
        if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
          this.suppliers = res.data;
          this.isSuppliersLoaded = true;
        }
      } catch (_) {}
    }
    if (!searchQuery) return [...this.suppliers];
    const q = searchQuery.toLowerCase().trim();
    return this.suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q)
    );
  }

  async getCurrentShift(branchId = '1'): Promise<CashierShift | null> {
    try {
      const res = await api.shift.getCurrent(branchId);
      if (res?.success && res.data) {
        const s = res.data;
        return {
          id: s.id,
          branchId: s.branchId,
          shiftName: `Shift ${s.shiftNumber}`,
          cashierId: s.userId || "usr-1",
          cashierName: s.cashierName || "Kasir Petugas",
          startTime: s.startTime,
          startingCash: Number(s.initialCash || 0),
          status: s.isOpen ? 'OPEN' : 'CLOSED'
        };
      }
    } catch (_) {}

    await delay(50);
    return (
      this.shifts.find((s) => s.branchId === branchId && s.status === 'OPEN') || null
    );
  }

  async openShift(branchId: string, startingCash: number, shiftNumber?: number, notes?: string): Promise<CashierShift> {
    try {
      const res = await api.shift.open({
        branchId,
        initialCash: startingCash,
        shiftNumber,
        notes
      });
      if (res?.success && res.data) {
        const s = res.data;
        const newShift: CashierShift = {
          id: s.id,
          branchId: s.branchId,
          shiftName: `Shift ${s.shiftNumber}`,
          cashierId: s.userId || "usr-1",
          cashierName: "Kasir Petugas",
          startTime: s.startTime,
          startingCash: Number(s.initialCash || 0),
          status: 'OPEN'
        };
        this.shifts.unshift(newShift);
        return newShift;
      }
    } catch (_) {}

    const newShift: CashierShift = {
      id: `shf-${Date.now()}`,
      branchId,
      shiftName: `Shift ${shiftNumber || 1}`,
      cashierId: "usr-1",
      cashierName: "Kasir Petugas",
      startTime: new Date().toISOString(),
      startingCash,
      status: 'OPEN'
    };
    this.shifts.unshift(newShift);
    return newShift;
  }

  async closeShift(shiftId: string, actualCash: number, notes?: string): Promise<void> {
    try {
      await api.shift.close({
        shiftId,
        actualCash,
        notes
      });
    } catch (_) {}

    const s = this.shifts.find((item) => item.id === shiftId);
    if (s) {
      s.status = 'CLOSED';
    }
  }

  async getProducts(): Promise<Product[]> {
    await this.ensureDataLoaded();
    return [...this.products];
  }

  async searchProducts(options?: {
    query?: string;
    categoryId?: string;
    branchId?: string;
  }): Promise<Product[]> {
    await this.ensureDataLoaded(options?.branchId);
    const branchId = options?.branchId;
    let result = this.products;

    if (options?.categoryId && options.categoryId !== 'cat-all') {
      result = result.filter((p) => p.categoryId === options.categoryId);
    }

    if (options?.query) {
      const q = options.query.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          (p.genericName && p.genericName.toLowerCase().includes(q))
      );
    }

    return result.map((p) => {
      const branchBatches = branchId
        ? p.batches.filter((b) => b.branchId === branchId)
        : p.batches;
      return {
        ...p,
        batches: branchBatches
      };
    });
  }

  async getProductByBarcode(barcode: string, branchId = '1'): Promise<Product | null> {
    await this.ensureDataLoaded(branchId);
    const trimmed = barcode.trim();
    const product = this.products.find(
      (p) => p.barcode === trimmed || p.sku === trimmed
    );
    if (!product) return null;

    const branchBatches = product.batches.filter((b) => b.branchId === branchId);
    return {
      ...product,
      batches: branchBatches
    };
  }

  async getProductById(id: string, branchId = '1'): Promise<Product | null> {
    await this.ensureDataLoaded(branchId);
    const product = this.products.find((p) => p.id === id);
    if (!product) return null;

    const branchBatches = product.batches.filter((b) => b.branchId === branchId);
    return {
      ...product,
      batches: branchBatches
    };
  }

  async checkoutSale(payload: CheckoutPayload): Promise<CheckoutResult> {
    await delay(100);

    // Generate Invoice Number format: INV/YYYYMMDD/{BRANCH}/{SEQ}
    const today = new Date();
    const ymd = today.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSeq = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV/${ymd}/${payload.branchId}/${randomSeq}`;

    // Kurangi stok di memory mock data
    for (const item of payload.items) {
      const product = this.products.find((p) => p.id === item.productId);
      if (product) {
        for (const alloc of item.batches) {
          const batch = product.batches.find((b) => b.id === alloc.batchId);
          if (batch) {
            batch.stock = Math.max(0, batch.stock - alloc.quantity);
          }
        }
      }
    }

    // Queue to networkStore for automatic synchronization to PostgreSQL database!
    if (browser) {
      try {
        const { networkStore } = await import("../stores/networkStore.svelte.js");
        await networkStore.queueSale({
          id: crypto.randomUUID(),
          invoiceNo: invoiceNumber,
          payload: {
            ...payload,
            branchId: payload.branchId
          }
        });
      } catch (e) {
        console.warn("Failed to queue sale to networkStore:", e);
      }
    }

    return {
      success: true,
      invoiceNumber,
      transactionTime: new Date().toISOString(),
      message: 'Transaksi kasir berhasil dicatat!',
      payload
    };
  }

  updateProductInMemory(product: any) {
    const idx = this.products.findIndex((p) => p.id === product.id);
    if (idx !== -1) {
      this.products[idx] = { ...this.products[idx], ...product };
    } else {
      this.products.unshift(product as Product);
    }
  }

  invalidateProductsCache() {
    this.isLoadedFromApi = false;
    this.loadPromise = null;
  }
}

export const mockApi = new MockApiService();
