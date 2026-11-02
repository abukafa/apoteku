import branchesData from '../mocks/branches.json';
import categoriesData from '../mocks/categories.json';
import customersData from '../mocks/customers.json';
import doctorsData from '../mocks/doctors.json';
import productsData from '../mocks/products.json';
import shiftsData from '../mocks/cashier-shifts.json';
import suppliersData from '../mocks/suppliers.json';

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

  async getBranches(): Promise<Branch[]> {
    await delay(80);
    return [...this.branches];
  }

  async getCategories(): Promise<Category[]> {
    await delay(60);
    return [...this.categories];
  }

  async getCustomers(searchQuery?: string): Promise<Customer[]> {
    await delay(100);
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
    await delay(100);
    if (!searchQuery) return [...this.suppliers];
    const q = searchQuery.toLowerCase().trim();
    return this.suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q)
    );
  }

  async getCurrentShift(branchId = '1'): Promise<CashierShift | null> {
    await delay(50);
    return (
      this.shifts.find((s) => s.branchId === branchId && s.status === 'OPEN') || null
    );
  }

  async searchProducts(options?: {
    query?: string;
    categoryId?: string;
    branchId?: string;
  }): Promise<Product[]> {
    await delay(150);
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
    await delay(80);
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
    await delay(60);
    const product = this.products.find((p) => p.id === id);
    if (!product) return null;

    return {
      ...product,
      batches: product.batches.filter((b) => b.branchId === branchId)
    };
  }

  async checkoutSale(payload: CheckoutPayload): Promise<CheckoutResult> {
    await delay(300);

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
