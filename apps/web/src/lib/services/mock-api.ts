import branchesData from '../mocks/branches.json';
import categoriesData from '../mocks/categories.json';
import customersData from '../mocks/customers.json';
import doctorsData from '../mocks/doctors.json';
import productsData from '../mocks/products.json';
import shiftsData from '../mocks/cashier-shifts.json';
import suppliersData from '../mocks/suppliers.json';
import usersData from '../mocks/users.json';
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
  code: string;
  name: string;
  sip: string;
  hospital: string;
  phone: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
  topDays: number;
  pbfLicense: string;
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

class MockApiService {
  private products: Product[] = productsData as unknown as Product[];
  private branches: Branch[] = branchesData;
  private categories: Category[] = categoriesData;
  private customers: Customer[] = customersData as unknown as Customer[];
  private doctors: Doctor[] = doctorsData;
  private suppliers: Supplier[] = suppliersData;
  private shifts: CashierShift[] = shiftsData as unknown as CashierShift[];
  private users: ActiveUser[] = usersData as unknown as ActiveUser[];

  private isLoadedFromApi = false;
  private isSuppliersLoaded = false;
  private loadPromise: Promise<void> | null = null;

  async ensureDataLoaded(branchId?: string): Promise<void> {
    if (this.isLoadedFromApi) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const res = await api.pos.getBootstrap(branchId);
        if (res?.success && res?.data) {
          const d = res.data;
          if (Array.isArray(d.products) && d.products.length > 0) {
            this.products = d.products.map((p: any) => ({
              id: p.id,
              sku: p.sku || "",
              barcode: p.barcode || "",
              name: p.name,
              genericName: p.activeSubstance || undefined,
              categoryId: "cat-1",
              categoryName: "Obat Bebas & Alkes",
              drugClass: (p.drugClass === "KERAS" ? "ETHICAL" : p.drugClass === "NARKOTIKA" ? "NARCOTICS" : p.drugClass === "PSIKOTROPIKA" ? "PSYCHOTROPIC" : p.drugClass === "BEBAS_TERBATAS" ? "LIMITED_OTC" : "OTC") as any,
              requiresPrescription: p.drugClass === "KERAS" || p.drugClass === "NARKOTIKA" || p.drugClass === "PSIKOTROPIKA",
              isConsignment: false,
              manufacturer: "PBF Terdaftar",
              description: p.activeSubstance || p.name,
              indication: p.indication || "Sesuai anjuran medis",
              dosage: p.defaultDosage || "3x1 Sehari",
              baseUnit: p.baseUnit || "PCS",
              units: (p.units || []).map((u: any) => ({
                unit: u.unitName,
                multiplier: Number(u.conversionFactor) || 1,
                prices: {
                  general: Number(u.salePriceGeneral || 0),
                  prescription: Number(u.salePriceResep || u.salePriceGeneral || 0),
                  wholesale: Number(u.salePriceGrosir || u.salePriceGeneral || 0),
                  delivery: Number(u.salePriceDelivery || u.salePriceGeneral || 0),
                  member: Number(u.salePriceMember || u.salePriceGeneral || 0)
                }
              })),
              batches: (d.branchBatches || [])
                .filter((b: any) => b.productId === p.id)
                .map((b: any) => ({
                  id: b.batchId || b.id || "batch-default",
                  batchNumber: b.batchNo || "BATCH-REG",
                  branchId: branchId || d.branch?.id || "1",
                  expiryDate: b.expiredDate || "2027-12-31",
                  stock: Number(b.qtyBase || 100),
                  buyPrice: Number(b.buyPrice || 0)
                }))
            }));
          }
          if (Array.isArray(d.branches) && d.branches.length > 0) {
            this.branches = d.branches;
          }
          if (Array.isArray(d.customers) && d.customers.length > 0) {
            this.customers = d.customers;
          }
          this.isLoadedFromApi = true;
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
    await delay(60);
    return [...this.users];
  }

  async getUserByEmail(email: string): Promise<ActiveUser | null> {
    await delay(50);
    return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim()) || null;
  }

  async getUserById(id: string): Promise<ActiveUser | null> {
    await delay(40);
    return this.users.find((u) => u.id === id) || null;
  }

  async getBranches(): Promise<Branch[]> {
    await this.ensureDataLoaded();
    return [...this.branches];
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
        d.hospital.toLowerCase().includes(q)
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
    await delay(50);
    const branchId = options?.branchId || '1';
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
      // Filter batches to the requested branch
      const branchBatches = p.batches.filter((b) => b.branchId === branchId);
      return {
        ...p,
        batches: branchBatches
      };
    });
  }

  async getProductByBarcode(barcode: string, branchId = '1'): Promise<Product | null> {
    await this.ensureDataLoaded(branchId);
    await delay(30);
    const trimmed = barcode.trim();
    const product = this.products.find(
      (p) => p.barcode === trimmed || p.sku === trimmed
    );
    if (!product) return null;

    return {
      ...product,
      batches: product.batches.filter((b) => b.branchId === branchId)
    };
  }

  async getProductById(id: string, branchId = '1'): Promise<Product | null> {
    await this.ensureDataLoaded(branchId);
    await delay(30);
    const product = this.products.find((p) => p.id === id);
    if (!product) return null;

    return {
      ...product,
      batches: product.batches.filter((b) => b.branchId === branchId)
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
}

export const mockApi = new MockApiService();
