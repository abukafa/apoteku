# SOFTWARE REQUIREMENTS & PRODUCT SPECIFICATION (SRAS: SRS & PRD)

**Sistem Operasional Apotek Tersentralisasi Multi-Cabang & SaaS-Ready**
**Nama Produk:** Apoteku.com (Hafidz Farma)  
**Versi Dokumen:** 2.2.0 (Hardened Legacy Firebird FDB Full Compatibility Edition)  
**Tanggal Rilis Dokumen:** 31 Oktober 2026  
**Status:** Frozen Production Contracts (Zero-Ambiguity Engineering Blueprint — Verified against GAMPANGAPOTEKZ.FDB)

---

## 1. EXECUTIVE SUMMARY & PRODUCT CONTEXT (PRD)

### 1.1 Visi & Latar Belakang Produk

**Apoteku.com** adalah platform _Point-of-Sale_ (POS) dan Enterprise Resource Planning (ERP) farmasi multi-cabang yang mentransisikan sistem desktop warisan Firebird `GAMPANGAPOTEKZ.FDB` (169 tabel relasional) menuju arsitektur modern berbasis Progressive Web App (PWA) dengan basis data cloud PostgreSQL tersentralisasi. Sistem dirancang dengan paradigma **Pre-Multitenant**: dioptimalkan secara mendalam untuk operasional grup internal Hafidz Farma dengan isolasi cabang yang ketat, namun setiap entitas dan _query_ terikat secara kanonikal ke `tenant_id` dan dilindungi oleh PostgreSQL Row-Level Security (RLS) guna memudahkan konversi menjadi platform SaaS publik tanpa perombakan arsitektur.

### 1.2 Persona & Matriks Kebutuhan

| Persona                                            | Peran & Tanggung Jawab                                                                          | Kebutuhan Utama Sistem                                                                                                               | Kriteria Keberhasilan (SLA/KPI)                                                             |
| :------------------------------------------------- | :---------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| **Owner / Manajemen Pusat**<br>(_The Strategist_)  | Pemilik grup apotek, audit keuangan, ekspansi cabang, dan strategi pengadaan PBF.               | Dashboard konsolidasian real-time, monitoring margin laba kotor, analitik pareto fast/slow moving, dan pelacakan audit trail mutasi. | Akses analitik multi-cabang dalam waktu $< 1.5$ detik; laporan PnL konsolidasi instan.      |
| **Kasir & Staf Depo**<br>(_The Frontliner_)        | Pelayanan penjualan OTC, input resep dokter, penerimaan pembayaran, dan cetak struk/etiket.     | Pencarian obat instan ($< 1$ ms offline), kalkulasi multi-satuan presisi, eksekusi FEFO otomatis, mode offline 100% tanpa internet.  | Waktu transaksi per pelanggan $< 45$ detik; nol kegagalan transaksi saat internet terputus. |
| **Apoteker Penanggung Jawab**<br>(_The Custodian_) | Kendali mutu obat, verifikasi resep racikan, kepatuhan regulasi BPOM/Kemenkes, dan stok opname. | Kartu stok double-entry tak terhapuskan, pelaporan otomatis SIPNAP, sistem peringatan ED (30/60/90 hari), audit koreksi fisik.       | Rekonsiliasi selisih stok 100% terlacak ke ID pengguna dan bukti transaksi fisik.           |

---

## 2. KONTRAK API & STRUKTUR INTERFACE (BACKEND & POS CLIENT)

Seluruh payload API wajib mematuhi standar JSON strictly-typed yang didefinisikan menggunakan Elysia.js TypeBox (`t.*`) di backend dan di-mirror ke TypeScript Interface di sisi klien.

### 2.1 Endpoint 1: Initial Bootstrap POS (`GET /api/pos/bootstrap`)

Mengunduh seluruh katalog produk tenant aktif serta saldo inventori cabang yang sedang login.

```typescript
// Query Parameters: ?branch_id=uuid
export interface BootstrapRequestQuery {
  branch_id: string;
}

export interface BootstrapResponsePayload {
  success: boolean;
  timestamp: string; // ISO 8601 UTC
  data: {
    tenant: {
      id: string;
      name: string;
      taxPercent: number; // e.g. 11.00
    };
    branch: {
      id: string;
      code: string;
      name: string;
      address: string;
      phone: string;
      receiptHeader: string;
      receiptFooter: string;
    };
    cashierShifts: {
      id: string;
      shiftNumber: number;
      startTime: string;
      initialCash: number;
      isOpen: boolean;
    } | null;
    products: Array<{
      id: string;
      sku: string;
      barcode: string | null;
      name: string;
      activeSubstance: string | null; // e.g. "Paracetamol 500mg" (dari DESKRIPSIBARANG)
      dosageForm: string | null; // e.g. "Tablet", "Sirup"
      defaultDosage: string | null; // e.g. "3x1 Sehari Sesudah Makan"
      rackLocation: string | null; // e.g. "RAK-01" (dari RAK)
      drugClass:
        | "BEBAS"
        | "BEBAS_TERBATAS"
        | "KERAS"
        | "PSIKOTROPIKA"
        | "NARKOTIKA"
        | "ALKES"
        | "NON_OBAT";
      baseUnit: string;
      minStock: number;
      isActive: boolean;
      units: Array<{
        unitName: string;
        conversionFactor: number; // e.g., Box=100, Strip=10, Tablet=1
        salePriceGeneral: number; // Harga 1: Umum / OTC
        salePriceResep: number; // Harga 2: Resep Dokter
        salePriceGrosir: number; // Harga 3: Grosir / Qty Besar
        salePriceDelivery: number; // Harga 4: Online / Layanan Antar
        salePriceMember: number; // Harga 5: Member / BPJS / Asuransi
        isBaseUnit: boolean;
      }>;
    }>;
    branchStocks: Array<{
      productId: string;
      locationId: string;
      totalQtyBase: number;
      unbatchedQtyBase: number;
    }>;
    branchBatches: Array<{
      productId: string;
      locationId: string;
      batchId: string;
      batchNo: string | null;
      expiredDate: string | null; // YYYY-MM-DD; null bila data legacy tidak mencatat ED
      qtyBase: number;
      buyPrice: number;
    }>;
  };
}
```

### 2.2 Endpoint 2: Up-Sync Penjualan Offline (`POST /api/pos/sync-sales`)

Mengirim kumpulan transaksi penjualan lokal kasir yang tersimpan saat offline ke server PostgreSQL cloud.

```typescript
export interface SyncSalesRequestPayload {
  branchId: string;
  cashierShiftId: string;
  transactions: Array<{
    id: string; // UUIDv7 yang di-generate kasir offline
    invoiceNo: string; // e.g. "PJ-CB01-20261031-0042"
    cashierUserId: string; // ID staf kasir yang melayani
    customerType: "UMUM" | "RESEP" | "GROSIR" | "MEMBER" | "DELIVERY";
    customerId: string | null;
    patientName: string | null;
    doctorName: string | null;
    paymentMethod:
      | "CASH"
      | "QRIS"
      | "EDC_DEBIT"
      | "EDC_CREDIT"
      | "TRANSFER"
      | "TEMPO";
    subtotal: number;
    discountPercent: number;
    discountAmount: number;
    taxPercent: number;
    taxAmount: number;
    tuslahAmount: number; // Biaya peracikan resep
    embalaseAmount: number; // Biaya wadah/bungkus
    grandTotal: number;
    paidAmount: number;
    changeAmount: number;
    createdAt: string; // Waktu offline transaksi terjadi (ISO UTC)
    items: Array<{
      id: string; // UUIDv7
      productId: string;
      batchId: string | null; // null hanya untuk impor historis legacy; transaksi POS baru wajib memilih batch FEFO
      locationId: string;
      unitName: string;
      conversionFactor: number;
      qty: number;
      qtyBase: number; // qty * conversionFactor
      unitPrice: number;
      discountPercent: number;
      discountAmount: number;
      subtotal: number;
      dosageRules: string | null; // e.g., "3x1 Sehari Sesudah Makan"
    }>;
  }>;
}

export interface SyncSalesResponsePayload {
  success: boolean;
  processedCount: number;
  duplicateCount: number;
  failedCount: number;
  results: Array<{
    clientTransactionId: string;
    serverTransactionId: string;
    invoiceNo: string;
    status: "SYNCED" | "ALREADY_EXISTS" | "FAILED";
    errorMessage?: string;
  }>;
  inventoryAlerts: Array<{
    productId: string;
    locationId: string;
    batchId: string | null;
    remainingStock: number;
    isDeficit: boolean;
    message: string;
  }>;
}
```

> [!IMPORTANT]
> **Kebijakan Rekonsiliasi Defisit Stok Offline:** Server backend **tidak boleh menolak (_reject/rollback_)** transaksi penjualan fisik yang disinkronkan oleh kasir offline. Karena obat sudah diserahkan kepada pelanggan dan uang tunai sudah masuk ke laci, penolakan transaksi akan menyebabkan selisih kas fisik (_cash discrepancy_) dan hilangnya audit nota. Bila terjadi penjualan melebihi saldo batch (misal akibat multi-kasir offline menjual batch sama), server tetap meng-commit transaksi, memotong stok batch hingga 0, mencatat sisa minus ke `unbatched_qty_base`, menerbitkan audit mutasi `DEFICIT_OVERSELL` di `stock_ledger`, dan menyalakan flag `isDeficit: true` pada `inventoryAlerts` untuk diaudit Apoteker Penanggung Jawab (APA).

### 2.3 Endpoint 3: Down-Sync Perubahan Data Delta (`GET /api/pos/sync-delta`)

Polling perubahan master obat, penyesuaian harga, atau mutasi masuk yang dilakukan back-office.

```typescript
export interface DeltaSyncQuery {
  branch_id: string;
  since: string; // Timestamp ISO sinkronisasi terakhir klien
}

export interface DeltaSyncResponsePayload {
  success: boolean;
  serverTimestamp: string;
  updatedProducts: Array<{
    id: string;
    sku: string;
    barcode: string | null;
    name: string;
    activeSubstance: string | null;
    dosageForm: string | null;
    defaultDosage: string | null;
    rackLocation: string | null;
    drugClass: string;
    baseUnit: string;
    isActive: boolean;
    updatedAt: string;
    units: Array<{
      unitName: string;
      conversionFactor: number;
      salePriceGeneral: number;
      salePriceResep: number;
      salePriceGrosir: number;
      salePriceDelivery: number;
      salePriceMember: number;
      isBaseUnit: boolean;
    }>;
  }>;
  updatedStocks: Array<{
    productId: string;
    locationId: string;
    totalQtyBase: number;
    unbatchedQtyBase: number;
    updatedAt: string;
  }>;
  updatedBatches: Array<{
    productId: string;
    locationId: string;
    batchId: string;
    batchNo: string | null;
    expiredDate: string | null;
    qtyBase: number;
    updatedAt: string;
  }>;
  deletedProductIds: string[]; // Produk yang di-soft-delete
}
```

### 2.4 Endpoint 4: Upload Berkas Media Lokal (`POST /api/uploads`)

Menerima berkas gambar (resep dokter, faktur pembelian PBF, bukti transfer kasir) dan menyimpannya langsung ke sistem berkas lokal (_local filesystem_) tanpa perantara S3/MinIO.

```typescript
// Request: multipart/form-data
// Field: file (Binary), category ('prescriptions' | 'invoices' | 'receipts')
export interface UploadFileResponsePayload {
  success: boolean;
  data: {
    fileUrl: string; // e.g. "/storage/prescriptions/rx-01931a...jpg"
    fileName: string; // Nama file unik di disk
    fileSizeBytes: number;
    mimeType: string;
  };
}
```

---

## 3. SKEMA DATABASE LOKAL BROWSER (DEXIE.JS V4)

Aplikasi klien mengimplementasikan database lokal IndexedDB menggunakan wrapper **Dexie.js v4**. Seluruh tabel operasional diindeks untuk menjamin latensi pencarian di bawah 1 milidetik saat kasir offline.

```typescript
// packages/db/src/client-indexeddb.ts
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
  isActive: boolean;
  units: Array<{
    unitName: string;
    conversionFactor: number;
    salePriceGeneral: number;
    salePriceResep: number;
    salePriceGrosir: number;
    salePriceDelivery: number;
    salePriceMember: number;
    isBaseUnit: boolean;
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
  payload: any; // SyncSalesRequestPayload['transactions'][0]
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
      products:
        "id, sku, barcode, name, activeSubstance, rackLocation, drugClass, isActive, updatedAt",
      branchStocks:
        "[locationId+productId], locationId, productId, totalQtyBase, updatedAt",
      batchStocks:
        "id, [locationId+productId], productId, locationId, batchId, batchNo, expiredDate, qtyBase, [locationId+productId+expiredDate]",
      pendingSales: "id, invoiceNo, createdAt, synced, retryCount",
      staffAuth: "userId, username",
    });
  }
}

export const localDb = new ApotekuDexieDB();
```

---

## 4. MANAJEMEN STATE FRONTEND (SVELTE 5 RUNES CONTRACT)

Front-end SvelteKit mengadopsi fitur **Svelte 5 Runes** untuk reaktivitas murni tanpa dependensi eksternal, memisahkan logika antarmuka kasir ke dalam modul state terisolasi.

### 4.1 Cart State Store (`cartStore.svelte.ts`)

Mengatur keranjang kasir, konversi satuan dinamis, seleksi batch FEFO, dan perhitungan pajak/diskon real-time.

```typescript
// apps/web/src/lib/stores/cartStore.svelte.ts
import { localDb } from "@apoteku/db/client-indexeddb";
import { calculateCartTotals, selectFefoBatches } from "@apoteku/core";

export interface CartLineItem {
  id: string;
  productId: string;
  locationId: string;
  name: string;
  selectedUnit: string;
  conversionFactor: number;
  qty: number;
  qtyBase: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  subtotal: number;
  batchAllocations: Array<{
    batchId: string;
    batchNo: string | null;
    expiredDate: string | null;
    allocatedQtyBase: number;
  }>;
  dosageRules: string;
}

export class CartState {
  items = $state<CartLineItem[]>([]);
  customerType = $state<"UMUM" | "RESEP" | "GROSIR" | "MEMBER" | "DELIVERY">(
    "UMUM",
  );
  paymentMethod = $state<
    "CASH" | "QRIS" | "EDC_DEBIT" | "EDC_CREDIT" | "TRANSFER" | "TEMPO"
  >("CASH");
  patientName = $state<string>("");
  doctorName = $state<string>("");
  tuslahAmount = $state<number>(0);
  embalaseAmount = $state<number>(0);
  paidAmount = $state<number>(0);
  taxRatePercent = $state<number>(11);

  subtotal = $derived(
    this.items.reduce((acc, curr) => acc + curr.qty * curr.unitPrice, 0),
  );
  totalDiscount = $derived(
    this.items.reduce((acc, curr) => acc + curr.discountAmount, 0),
  );
  taxableAmount = $derived(Math.max(0, this.subtotal - this.totalDiscount));
  taxAmount = $derived(
    Math.round((this.taxableAmount * this.taxRatePercent) / 100),
  );
  grandTotal = $derived(
    this.taxableAmount +
      this.taxAmount +
      this.tuslahAmount +
      this.embalaseAmount,
  );
  changeAmount = $derived(Math.max(0, this.paidAmount - this.grandTotal));

  async addItem(
    product: any,
    locationId: string,
    requestedQty: number = 1,
    unitName?: string,
  ) {
    const selectedUnitObj = product.units.find((u: any) =>
      unitName ? u.unitName === unitName : u.isBaseUnit,
    );
    const unitPrice =
      this.customerType === "RESEP"
        ? selectedUnitObj.salePriceResep
        : this.customerType === "GROSIR"
          ? selectedUnitObj.salePriceGrosir
          : this.customerType === "DELIVERY"
            ? selectedUnitObj.salePriceDelivery ||
              selectedUnitObj.salePriceGeneral
            : this.customerType === "MEMBER"
              ? selectedUnitObj.salePriceMember ||
                selectedUnitObj.salePriceGeneral
              : selectedUnitObj.salePriceGeneral;

    const factor = selectedUnitObj.conversionFactor;
    const requiredQtyBase = requestedQty * factor;

    const availableBatches = await localDb.batchStocks
      .where("[locationId+productId]")
      .equals([locationId, product.id])
      .and((b) => b.qtyBase > 0 && b.batchNo !== null && b.expiredDate !== null)
      .sortBy("expiredDate");

    const allocation = selectFefoBatches(availableBatches, requiredQtyBase);

    const newItem: CartLineItem = {
      id: crypto.randomUUID(),
      productId: product.id,
      locationId,
      name: product.name,
      selectedUnit: selectedUnitObj.unitName,
      conversionFactor: factor,
      qty: requestedQty,
      qtyBase: requiredQtyBase,
      unitPrice,
      discountPercent: 0,
      discountAmount: 0,
      subtotal: requestedQty * unitPrice,
      batchAllocations: allocation.batches,
      dosageRules: "",
    };

    this.items.push(newItem);
  }

  removeItem(id: string) {
    this.items = this.items.filter((item) => item.id !== id);
  }

  clearCart() {
    this.items = [];
    this.patientName = "";
    this.doctorName = "";
    this.tuslahAmount = 0;
    this.embalaseAmount = 0;
    this.paidAmount = 0;
  }
}

export const cartStore = new CartState();
```

### 4.2 Auth State Store (`authStore.svelte.ts`)

```typescript
// apps/web/src/lib/stores/authStore.svelte.ts
export interface ActiveUser {
  id: string;
  username: string;
  fullName: string;
  role: "SUPERADMIN" | "OWNER" | "PHARMACIST" | "CASHIER" | "INVENTORY_STAFF";
  tenantId: string;
  branchId: string;
  branchName: string;
}

export class AuthState {
  user = $state<ActiveUser | null>(null);
  accessToken = $state<string | null>(null);
  refreshToken = $state<string | null>(null);
  isLockedOffline = $state<boolean>(false);

  isAuthenticated = $derived(this.user !== null);

  setUserSession(
    user: ActiveUser,
    tokens: { access: string; refresh: string },
  ) {
    this.user = user;
    this.accessToken = tokens.access;
    this.refreshToken = tokens.refresh;
    this.isLockedOffline = false;
  }

  lockScreen() {
    this.isLockedOffline = true;
  }

  unlockWithPin() {
    this.isLockedOffline = false;
  }

  clearSession() {
    this.user = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.isLockedOffline = false;
  }
}

export const authStore = new AuthState();
```

### 4.3 Network & Sync State Store (`networkStore.svelte.ts`)

```typescript
// apps/web/src/lib/stores/networkStore.svelte.ts
export class NetworkState {
  isOnline = $state<boolean>(navigator.onLine);
  pendingSyncCount = $state<number>(0);
  isSyncing = $state<boolean>(false);
  lastSyncTime = $state<Date | null>(null);

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => (this.isOnline = true));
      window.addEventListener("offline", () => (this.isOnline = false));
    }
  }

  setPendingCount(count: number) {
    this.pendingSyncCount = count;
  }
}

export const networkStore = new NetworkState();
```

---

## 5. INTEGRASI PERANGKAT KERAS (HARDWARE DRIVER CONTRACTS)

POS Apoteku.com berkomunikasi langsung dengan printer thermal kasir (58mm/80mm) dan cash drawer RJ11 menggunakan **Web Serial API** atau **Web USB API** tanpa perantara aplikasi pihak ketiga tambahan. Komunikasi data dikirim dalam bentuk _raw byte command array_ standar ESC/POS.

### 5.1 Spesifikasi Hardware POS

- **Baud Rate Serial:** `9600 bps` atau `115200 bps` (tergantung antarmuka hardware USB-to-Serial).
- **Buffer Chunk Size:** Maksimal 64 bytes per serial write packet guna menghindari _buffer overflow_ pada mikrokontroler printer kasir murah.
- **Paper Specifications:**
  - **Ukuran 58mm:** Lebar karakter 32 kolom (`ESC ! 0`).
  - **Ukuran 80mm:** Lebar karakter 48 kolom (`ESC ! 0`).

### 5.2 Standar Raw Command ESC/POS (Zero-Dependency Byte Array)

```typescript
// packages/core/src/hardware/escpos.ts

export const ESC_POS = {
  INIT: new Uint8Array([0x1b, 0x40]),
  ALIGN_LEFT: new Uint8Array([0x1b, 0x61, 0x00]),
  ALIGN_CENTER: new Uint8Array([0x1b, 0x61, 0x01]),
  ALIGN_RIGHT: new Uint8Array([0x1b, 0x61, 0x02]),
  BOLD_ON: new Uint8Array([0x1b, 0x45, 0x01]),
  BOLD_OFF: new Uint8Array([0x1b, 0x45, 0x00]),
  FONT_NORMAL: new Uint8Array([0x1b, 0x21, 0x00]),
  FONT_DOUBLE_HEIGHT: new Uint8Array([0x1b, 0x21, 0x10]),
  FEED_3_LINES: new Uint8Array([0x1b, 0x64, 0x03]),
  PARTIAL_CUT: new Uint8Array([0x1d, 0x56, 0x01]),
  OPEN_CASH_DRAWER: new Uint8Array([0x1b, 0x70, 0x00, 0x32, 0xfa]),
};

export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.append(ESC_POS.INIT);
  }

  append(bytes: Uint8Array) {
    this.buffer.push(...Array.from(bytes));
    return this;
  }

  text(str: string) {
    const encoder = new TextEncoder();
    this.buffer.push(...Array.from(encoder.encode(str)));
    return this;
  }

  line(str: string = "") {
    this.text(str + "\n");
    return this;
  }

  twoColumnRow(left: string, right: string, maxChars: number = 32) {
    const spaceLength = maxChars - (left.length + right.length);
    if (spaceLength > 0) {
      this.line(left + " ".repeat(spaceLength) + right);
    } else {
      this.line(left);
      this.line(" ".repeat(maxChars - right.length) + right);
    }
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}
```

### 5.3 Implementasi Web Serial Driver

```typescript
// apps/web/src/lib/hardware/serialPrinter.ts
import { EscPosBuilder, ESC_POS } from "@apoteku/core/hardware/escpos";

export async function printReceiptWebSerial(
  printData: Uint8Array,
): Promise<boolean> {
  if (!("serial" in navigator)) {
    throw new Error(
      "Web Serial API tidak didukung pada browser ini. Harap gunakan Chrome atau Edge.",
    );
  }

  let port: any = null;
  try {
    port = await (navigator as any).serial.requestPort();
    await port.open({
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
    });

    const writer = port.writable.getWriter();

    const CHUNK_SIZE = 64;
    for (let i = 0; i < printData.length; i += CHUNK_SIZE) {
      const chunk = printData.slice(i, i + CHUNK_SIZE);
      await writer.write(chunk);
      await new Promise((r) => setTimeout(r, 10));
    }

    writer.releaseLock();
    await port.close();
    return true;
  } catch (err) {
    console.error("Serial Printer Error:", err);
    if (port && port.readable) await port.close();
    return false;
  }
}
```

---

## 6. SISTEM DESAIN UI & TOKENS TAILWIND

```
+---------------------------------------------------------------------------------------------------+
|    BRAND HEADER   | Search Bar            |   Notifikasi   |   Profil Admin   |   Jam & Tanggal   |
+-------------------+-------------------------------------------------------------------------------+
|  NAV SIDEBAR      |  HERO BANNER: /img/banner.jfif                                                |
|  Width: 260px     +-------------------+-------------------+-------------------+-------------------+
|  bg-primary-900   | KPI 1: Omzet Hari | KPI 2: Transaksi  | KPI 3: Stok Kritis| KPI 4: Cust Baru  |
|                   | Rp 4.850.000      | 28 Trx            | 5 Item            | 3 Pasien          |
|  * Dashboard      +-------------------+-------------------+-------------------+-------------------+
|  * Penjualan      | GRAFIK TREN 7 HARI   | TABEL PERINGATAN STOK        | TRANSAKSI TERAKHIR      |
|  * Pembelian      | [ Chart Area ]       | Paracetamol 500mg - Sisa: 5  | 0287 | Rp 1200 | Tunai  |
|  * Stok Obat      |                      |                              |                         |
|  * Pengiriman     +---------------------------------------+---------------------------------------+
|  * Konsinyasi     | QUICK ACTIONS (10 ICON MENU GRID)     | NOTIFIKASI & PENGINGAT                |
|  * Pelanggan      | [POS] [PO Beli] [Stok] [Racikan]      | PT. Kimia Farma                       |
|  * Suplier        | [Retur] [Pasien] [PBF] [Arus Kas]     | Jatuh tempo 2 hari lagi (4.500.000)   |
|  * Keuangan       |                                                                               |
|  * Laporan        +-------------------------------------------------------------------------------+
|  * Pengaturan     | FOOTER: (c) 2026 Hafidz Farma. "Ikhtiar Sehat Keluarga"                       |
+-------------------+-------------------------------------------------------------------------------+

Referensi Design : mockup.jpeg
```

### 6.1 Konfigurasi Token Tailwind CSS (`tailwind.config.ts`)

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: {
            DEFAULT: "#0B409C",
            50: "#F0F5FF",
            100: "#E0EBFF",
            500: "#1D63D8",
            700: "#0B409C",
            900: "#072663",
          },
          cyan: {
            DEFAULT: "#0077B6",
            light: "#E6F4FA",
          },
          red: {
            DEFAULT: "#E63946",
            50: "#FFF1F2",
            500: "#E63946",
            700: "#BD1E2C",
          },
        },
        surface: {
          base: "#F4F7FC",
          card: "#FFFFFF",
          border: "#E2E8F0",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        card: "0 2px 10px rgba(11, 64, 156, 0.05)",
        elevated: "0 8px 24px rgba(11, 64, 156, 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

---

## 7. PROTOKOL KEAMANAN SESI & REKONSILIASI TOKEN OFFLINE

### 7.1 Lifecycle Token & State Machine Kasir

1. **Access Token (JWT):** Berlaku **15 menit**. Berisi payload: `{ userId, tenantId, branchId, role }`.
2. **Refresh Token:** Berlaku **7 hari**, disimpan di `HttpOnly, Secure, SameSite=Strict Cookie`.
3. **Local Encrypted Session (IndexedDB):** Berisi payload identitas kasir, waktu kedaluwarsa sesi luring (**maksimal 24 jam** sejak login terakhir), dan hash PBKDF2 dari PIN kasir.

```text
       [ KASIR ONLINE ]
              │ (Login Google OAuth Berhasil)
              ▼
    [ Terbitkan Token Server ]
    ├── Set HttpOnly Cookie (Refresh Token - 7 Hari)
    ├── Simpan Access Token di AuthStore (Memori 15 Menit)
    └── Simpan Hash PIN & Sesi di IndexedDB (Maksimal 24 Jam)
              │
    [ INTERNET PUTUS (OFFLINE) ]
              │
    ┌─────────┴────────────────────────────────────────┐
    │ Transaksi Berjalan Menggunakan Sesi Lokal        │
    │ Kasir Ganti Sif -> Verifikasi Hash PIN Offline   │
    │ Access Token JWT Kedaluwarsa di Background       │
    │ (Sesi kasir TIDAK DIBATALKAN / TIDAK DI-LOGOUT)  │
    └─────────┬────────────────────────────────────────┘
              │
    [ INTERNET TERSAMBUNG KEMBALI ]
              │
              ▼
    [ Request Silent-Refresh Otomatis ]
    POST /api/auth/refresh-session (Menggunakan HttpOnly Cookie)
              │
       ┌──────┴────────────────────────┐
   (Sukses 200 OK)               (Gagal / Refresh Token Expired)
       │                               │
       ▼                               ▼
Perbarui Access Token Baru     Kunci Layar Kasir dengan PIN Dialog
Kirim Payload Pending Sales    Minta Re-Autentikasi tanpa Hilangkan Draft
```

### 7.2 Handler Rekonsiliasi Otomatis (Interceptor)

```typescript
// apps/web/src/lib/api/httpClient.ts
import { authStore } from "$lib/stores/authStore.svelte";
import { networkStore } from "$lib/stores/networkStore.svelte";

export async function secureFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  if (!networkStore.isOnline) {
    throw new Error("OFFLINE_MODE");
  }

  let headers = new Headers(options.headers || {});
  if (authStore.accessToken) {
    headers.set("Authorization", `Bearer ${authStore.accessToken}`);
  }

  let response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    const refreshRes = await fetch("/api/auth/refresh", { method: "POST" });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      authStore.accessToken = data.accessToken;

      headers.set("Authorization", `Bearer ${data.accessToken}`);
      return fetch(url, { ...options, headers });
    } else {
      authStore.lockScreen();
      throw new Error("SESSION_EXPIRED");
    }
  }

  return response;
}
```

---

## 8. SPESIFIKASI PENYIMPANAN MEDIA (LOCAL FILESYSTEM MVP ENGINE)

Fase MVP Apoteku.com **meniadakan MinIO** untuk menghemat alokasi RAM server ($\approx 1\text{ GB}$). Berkas gambar fisik (scan resep dokter, faktur PBF, dan bukti pembayaran) disimpan langsung ke volume disk lokal backend via `Bun.write()`, dan disajikan ke browser klien melalui Caddy reverse-proxy atau plugin Elysia static.

### 8.1 Implementasi Layanan Unggah Backend (Bun Native File I/O)

```typescript
// apps/backend/src/modules/media/media.service.ts
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const UPLOAD_ROOT = process.env.UPLOAD_DIR || "/app/uploads";

// Pastikan subdirektori kategori dibuat saat inisialisasi
["prescriptions", "invoices", "receipts"].forEach((category) => {
  const dir = join(UPLOAD_ROOT, category);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

export class MediaService {
  static async saveUploadedFile(
    file: File,
    category: "prescriptions" | "invoices" | "receipts",
  ) {
    // Validasi MIME Type Keamanan
    const ALLOWED_MIME = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!ALLOWED_MIME.includes(file.type)) {
      throw new Error(
        "Tipe berkas tidak diizinkan. Hanya JPEG, PNG, WEBP, dan PDF.",
      );
    }

    // Maksimal Ukuran: 5 MB
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      throw new Error("Ukuran berkas melebihi batas maksimal 5 MB.");
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
    const uniqueFileName = `${crypto.randomUUID()}.${extension}`;
    const destinationPath = join(UPLOAD_ROOT, category, uniqueFileName);

    // Tulis ke filesystem lokal menggunakan Bun.write murni
    const arrayBuffer = await file.arrayBuffer();
    await Bun.write(destinationPath, arrayBuffer);

    // URL path yang disimpan ke tabel PostgreSQL
    const publicUrl = `/storage/${category}/${uniqueFileName}`;

    return {
      fileName: uniqueFileName,
      fileUrl: publicUrl,
      fileSizeBytes: file.size,
      mimeType: file.type,
    };
  }
}
```

### 8.2 Rute Elysia Penyajian Berkas Statis (`@elysiajs/static`)

```typescript
// apps/backend/src/index.ts
import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { mediaRoutes } from "./modules/media/media.routes";

const app = new Elysia()
  // Sajikan folder lokal /app/uploads di bawah path /storage
  .use(
    staticPlugin({
      assets: process.env.UPLOAD_DIR || "/app/uploads",
      prefix: "/storage",
      alwaysStatic: true,
    }),
  )
  .use(mediaRoutes)
  .listen(process.env.PORT || 3000);

console.log(`Backend Apoteku aktif di port ${app.server?.port}`);
```

### 8.3 Rencana Transisi & Kompensasi Operasional (Trade-Offs Analysis)

1. **Strategi Backup Folder Fisik:**  
   Karena berkas tersimpan di disk lokal host (`./uploads`), pencadangan database PostgreSQL (`pg_dump`) tidak mencakup foto fisik. Administrator wajib menyertakan folder `./uploads` dalam cron-job rsync berkala:
   ```bash
   # Crontab harian pencadangan media lokal ke server backup/NAS
   0 3 * * * rsync -avz --delete /opt/apoteku-system/uploads/ backup-user@remote-storage:/backups/apoteku-uploads/
   ```
2. **Kesesuaian Skema Database Saat Skalabilitas Cloud:**  
   Nilai yang disimpan di kolom database `prescription_image_url` atau `invoice_scan_url` adalah string URL relatif (`/storage/prescriptions/uuid.jpg`). Ketika sistem Apoteku.com beralih ke multi-server atau SaaS Cloudflare R2 / AWS S3 di kemudian hari, string URL di database **tidak perlu diubah**. Caddy atau API Gateway cukup mengalihkan rute `/storage/*` langsung ke bucket S3 publik.

---

## 9. STRUKTUR FOLDER FINAL & INTEGRASI MONOREPO

```text
apoteku-system/
├── uploads/                          # Host Volume Direktori Fisik Media Lokal
│   ├── prescriptions/                # Foto resep dokter
│   ├── invoices/                     # Faktur pembelian PBF
│   └── receipts/                     # Bukti struk/transfer kasir
│
├── apps/
│   ├── backend/                      # Bun + Elysia API Server
│   │   ├── src/
│   │   │   ├── middleware/
│   │   │   │   ├── tenantContext.ts  # Injeksi RLS & verifikasi JWT
│   │   │   │   └── rateLimiter.ts
│   │   │   ├── modules/
│   │   │   │   ├── pos/
│   │   │   │   │   ├── pos.routes.ts # /bootstrap, /sync-sales, /sync-delta
│   │   │   │   │   └── pos.service.ts
│   │   │   │   ├── media/
│   │   │   │   │   ├── media.routes.ts # POST /api/uploads
│   │   │   │   │   └── media.service.ts # Bun.write() File Manager
│   │   │   │   ├── inventory/
│   │   │   │   ├── procurement/
│   │   │   │   └── auth/
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── web/                          # SvelteKit PWA Front-Office & Back-Office
│       ├── src/
│       │   ├── lib/
│       │   │   ├── components/       # UI Primitives & Widgets
│       │   │   │   ├── Topbar.svelte
│       │   │   │   ├── Sidebar.svelte
│       │   │   │   ├── KpiCard.svelte
│       │   │   │   ├── PosReceiptModal.svelte
│       │   │   │   └── PinPadModal.svelte
│       │   │   ├── stores/           # Svelte 5 Runes Stores
│       │   │   │   ├── cartStore.svelte.ts
│       │   │   │   ├── authStore.svelte.ts
│       │   │   │   └── networkStore.svelte.ts
│       │   │   └── hardware/
│       │   │       ├── serialPrinter.ts
│       │   │       └── barcodeScanner.ts
│       │   ├── routes/
│       │   │   ├── (auth)/login/
│       │   │   ├── (pos)/pos/        # Shell POS Offline Khusus Kasir
│       │   │   │   ├── +page.svelte
│       │   │   │   └── +layout.svelte
│       │   │   └── (backoffice)/     # Shell Admin Cloud
│       │   │       ├── dashboard/
│       │   │       ├── inventory/
│       │   │       ├── procurement/
│       │   │       └── reports/
│       │   ├── service-worker.ts     # PWA Offline Shell Cache
│       │   └── app.html
│       ├── tailwind.config.ts        # Token Desain
│       └── package.json
│
├── packages/
│   ├── core/                         # Shared Isomorphic Business Domain
│   │   ├── src/
│   │   │   ├── calculations/         # Diskon, Tuslah, Pajak, Base Unit Conversion
│   │   │   ├── fefo/                 # Algoritma Seleksi Batch ED Terdekat
│   │   │   └── hardware/             # Raw Byte ESC/POS Driver Generator
│   │   └── package.json
│   │
│   └── db/                           # Drizzle ORM Skema & Migrasi PostgreSQL
│       ├── src/
│       │   ├── schema/               # Definisi Tabel Drizzle
│       │   │   ├── auth.ts
│       │   │   ├── products.ts
│       │   │   ├── inventory.ts
│       │   │   └── sales.ts
│       │   ├── client-indexeddb.ts   # Dexie.js v4 Skema Lokal Browser
│       │   └── index.ts
│       └── package.json
│
├── Caddyfile                         # Reverse Proxy & SSL Gateway
├── docker-compose.yml                # Single VPS: Caddy, Bun App Server, PostgreSQL
└── turbo.json
```

```text
Antarmuka web klien dibagi menjadi tiga kluster dengan siklus hidup (lifecycle), penyimpanan data lokal, dan dependensi jaringan yang terisolasi:

                                [ APOTEKU.COM FRONTEND ]
                                           │
    ┌──────────────────────────────────────┼──────────────────────────────────────┐
    ▼                                      ▼                                      ▼
[ PUBLIC / AUTH ]                   [ POS KASIR OFFLINE ]                 [ BACK-OFFICE / ADMIN ]
• /login (Google OAuth)             • /pos (Kasir Kilat & Barcode)        • /dashboard (KPI & Alert)
• /pos/pin-lock (PIN 6-digit)       • /pos/resep (Dispensing & Etiket)    • /inventory (Stok & Batch)
• /pos/select-branch (Sif Outlet)   • /pos/history (Struk & Retur)        • /procurement (PBF & Faktur)
                                    • /pos/shift (Tutup Kasir & Laci)     • /clinical (Pasien & Dokter)
                                    • /pos/pending (Queue Sync Monitor)   • /finance (Hutang & Arus Kas)
                                                                          • /reports (Konsolidasi Cabang)
                                                                          • /settings (Pengaturan Sistem)
```

| Parameter Teknis           | Kluster Public / Auth                | Kluster POS Kasir Offline                              | Kluster Back-Office / Admin                        |
| :------------------------- | :----------------------------------- | :----------------------------------------------------- | :------------------------------------------------- |
| **Peran Pengguna**         | Semua Staf, Kasir, Owner             | Kasir, Asisten Apoteker, Frontliner                    | Owner, Apoteker Penanggung Jawab (APA), Supervisor |
| **Konektivitas Jaringan**  | Semi-Online (PIN lokal saat offline) | **Full Offline-First (Toleran 100% Offline)**          | **Online-First (Wajib Koneksi Cloud)**             |
| **Sumber Data Utama**      | Cookie JWT / IndexedDB Salts         | **IndexedDB (Dexie.js)** + Cache Storage               | **PostgreSQL** via Elysia REST API                 |
| **Desain Layout Shell**    | Auth Shell (Minimalist Card)         | **Full-Screen Cashier Shell** (No Sidebar, Focus Scan) | **Executive Dashboard Shell** (Sidebar + Topbar)   |
| **Target Perangkat Keras** | Layar Sentuh / Mouse                 | Barcode Scanner, Printer Thermal ESC/POS, Laci RJ11    | Monitor Desktop/Laptop, Printer Laser A4           |

---

## 10. SKEMA POSTGRESQL PRODUCTION DENGAN DRIZZLE ORM

### 10.1 Kontrak Kompatibilitas Migrasi Firebird

Database legacy `GAMPANGAPOTEKZ.FDB` menggunakan Firebird ODS 11.2 / SQL Dialect 1. ID legacy pada tabel inti bertipe `INTEGER`, sedangkan kuantitas, faktor satuan, harga, dan HPP menggunakan `DOUBLE`. Karena data aktual memuat kuantitas pecahan dan harga dengan lebih dari dua angka desimal, skema PostgreSQL menggunakan `numeric(24, 8)` untuk nilai kuantitas, faktor, harga, biaya, dan nilai transaksi. Migrasi tidak boleh mengubahnya menjadi integer atau membulatkan ke dua desimal tanpa aturan bisnis, laporan selisih, dan persetujuan eksplisit. Kontrak JSON pada bagian 2 masih memakai `number`; implementasi backend dan POS harus memakai aritmetika desimal untuk perhitungan/persistensi dan tidak mengandalkan konversi floating-point JavaScript untuk menjamin presisi. Sebelum kontrak API dianggap presisi desimal end-to-end, ubah representasi nilai desimal pada payload menjadi string desimal.

Stok legacy berada pada tingkat lokasi/gudang, bukan hanya cabang. `branch_stocks` menyimpan agregat per lokasi dan produk; `total_qty_base` harus sama dengan jumlah kuantitas seluruh batch yang diketahui ditambah `unbatched_qty_base`. `unbatched_qty_base` memisahkan stok yang sumbernya tidak memiliki ID batch. `branch_batch_stocks` hanya menyimpan kuantitas dengan batch yang diketahui. Batch dan tanggal kedaluwarsa boleh `null` untuk mempertahankan fakta sumber; sistem tidak boleh membuat nomor batch atau tanggal ED palsu. Stok tanpa ED/batch tidak masuk alokasi FEFO otomatis sampai diidentifikasi melalui pemeriksaan stok dan harus ditampilkan terpisah sebagai stok yang belum dapat dialokasikan. Transaksi POS baru tetap wajib mengambil stok dari batch yang lolos aturan FEFO; `batch_id = null` hanya untuk impor historis.

Tabel `FASTBATCH` legacy (19.826 baris) bertindak sebagai kamus global pasangan `(BATCH_NO, ED)` dan tidak mengikat produk tertentu; analisis data riil membuktikan sebanyak 601 ID FASTBATCH digunakan bersama oleh beberapa produk berbeda (misalnya ID 16265 dipakai oleh 4 obat berbeda). Oleh karena itu, batasan unik batch di PostgreSQL adalah `(tenant_id, product_id, batch_no, expired_date)`. Skema PostgreSQL DILARANG menerapkan `uniqueIndex` pada `(tenant_id, legacy_id_fastbatch)` karena akan menyebabkan pelanggaran integritas data (_Unique Constraint Violation_) saat migrasi. Relasi ke batch legacy dipetakan secara non-unik atau dicatat melalui `legacy_id_map` dengan format kunci gabungan `${product_id}:${legacy_fastbatch_id}`.

Di database legacy `BARANG` (5.927 baris), terdapat 178 baris produk anak yang memegang satuan besar (DUS) dengan kolom `ID_SATUAN_DARI` menunjuk ID produk induk dan `FAKTOR_SATUAN`. Dalam migrasi ke PostgreSQL, baris anak ini dilebur menjadi entitas `product_units` di bawah produk induk yang sama, dan seluruh 5 tingkat harga jual legacy (`HARGAJUAL1` s/d `HARGAJUAL5` yang mencakup Umum, Resep, Grosir, Delivery, dan Member) dipetakan utuh ke kolom `sale_price_general`, `sale_price_resep`, `sale_price_grosir`, `sale_price_delivery`, dan `sale_price_member`.

Tabel `DESKRIPSIBARANG` (5.612 baris) dan `RAK` (18 rak) diintegrasikan langsung ke tabel `products` (`active_substance`, `dosage_form`, `default_dosage`, `indications`, `side_effects`, `rack_location`) guna mendukung pencarian obat generik serupa (substitusi) dan cetak etiket aturan pakai otomatis.

Tabel `legacy_id_map` menjadi crosswalk ID untuk seluruh entitas yang dimigrasikan, termasuk ID integer dan kunci gabungan seperti `DETAILPENJUALAN(ID_PENJUALAN, ITEMNO)`. `legacy_key` disimpan sebagai teks kanonis (contoh `123:2`), bersama nama database sumber dan tabel, sehingga ID UUID baru tidak menghilangkan kemampuan penelusuran ke sumber. Migrasi harus mempertahankan relasi foreign key legacy melalui crosswalk dan memeriksa jumlah baris serta total kuantitas/nilai sebelum dan sesudah pemindahan. Nilai sumber yang memiliki presisi lebih dari 8 desimal wajib masuk laporan pengecualian dan hanya boleh dinormalisasi dengan aturan pembulatan yang disetujui. Perubahan skema IndexedDB memerlukan upgrade versi; migrasi lokal harus mempertahankan `pendingSales`, mengosongkan dan mengunduh ulang `branchStocks`/`batchStocks` per lokasi, lalu memverifikasi jumlah stok sebelum POS kembali aktif. RLS untuk tabel bertenant harus diaktifkan dan diberi policy melalui migrasi SQL; keberadaan kolom `tenant_id` saja tidak mengaktifkan RLS. Foreign key untuk `customer_id`, pengguna, dan sif kasir harus ditambahkan saat tabel domain terkait didefinisikan sebelum skema ini dipakai di production.

```typescript
// packages/db/src/schema/production.ts
import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// 1. TENANTS & CABANG
export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    address: text("address"),
    phone: varchar("phone", { length: 50 }),
    receiptHeader: text("receipt_header"),
    receiptFooter: text("receipt_footer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    tenantCodeIdx: uniqueIndex("uq_branch_tenant_code").on(t.tenantId, t.code),
  }),
);

export const inventoryLocations = pgTable(
  "inventory_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (t) => ({
    locationCodeUq: uniqueIndex("uq_location_branch_code").on(
      t.branchId,
      t.code,
    ),
  }),
);

export const legacyIdMap = pgTable(
  "legacy_id_map",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    sourceDatabase: varchar("source_database", { length: 255 }).notNull(),
    sourceTable: varchar("source_table", { length: 100 }).notNull(),
    legacyKey: varchar("legacy_key", { length: 255 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: uuid("entity_id").notNull(),
  },
  (t) => ({
    sourceKeyUq: uniqueIndex("uq_legacy_source_key").on(
      t.tenantId,
      t.sourceDatabase,
      t.sourceTable,
      t.legacyKey,
    ),
    entityLookupIdx: index("idx_legacy_entity").on(
      t.tenantId,
      t.entityType,
      t.entityId,
    ),
  }),
);

// 2. MASTER PRODUK & MULTI-SATUAN
export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    legacyIdBarang: integer("legacy_id_barang"),
    sku: varchar("sku", { length: 50 }).notNull(),
    barcode: varchar("barcode", { length: 100 }),
    name: varchar("name", { length: 255 }).notNull(),
    activeSubstance: text("active_substance"), // Dari DESKRIPSIBARANG.ZAT_AKTIF (e.g. "Amlodipin 5mg")
    dosageForm: varchar("dosage_form", { length: 100 }), // Dari DESKRIPSIBARANG.BENTUK_SEDIAAN (e.g. "TABLET")
    defaultDosage: text("default_dosage"), // Dari DESKRIPSIBARANG.DOSIS (e.g. "3 x 1 tablet sehari")
    indications: text("indications"), // Dari DESKRIPSIBARANG.INDIKASI
    sideEffects: text("side_effects"), // Dari DESKRIPSIBARANG.EFEK_SAMPING
    rackLocation: varchar("rack_location", { length: 50 }), // Dari RAK fisik apotek
    drugClass: varchar("drug_class", { length: 50 }).default("BEBAS").notNull(),
    baseUnit: varchar("base_unit", { length: 50 }).notNull(),
    minStock: numeric("min_stock", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    isConsignment: boolean("is_consignment").default(false).notNull(), // Dari BARANG.IS_KONSI ('Y' / 'T')
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    tenantSkuIdx: uniqueIndex("uq_product_tenant_sku").on(t.tenantId, t.sku),
    searchIdx: index("idx_products_search").on(t.tenantId, t.name, t.barcode),
    substanceIdx: index("idx_products_substance").on(
      t.tenantId,
      t.activeSubstance,
    ),
    rackIdx: index("idx_products_rack").on(t.tenantId, t.rackLocation),
  }),
);

export const productUnits = pgTable(
  "product_units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    unitName: varchar("unit_name", { length: 50 }).notNull(),
    conversionFactor: numeric("conversion_factor", {
      precision: 24,
      scale: 8,
    }).notNull(), // Rasio ke Base Unit
    salePriceGeneral: numeric("sale_price_general", { precision: 24, scale: 8 })
      .default("0")
      .notNull(), // Harga 1: Umum / OTC
    salePriceResep: numeric("sale_price_resep", { precision: 24, scale: 8 })
      .default("0")
      .notNull(), // Harga 2: Resep Dokter
    salePriceGrosir: numeric("sale_price_grosir", { precision: 24, scale: 8 })
      .default("0")
      .notNull(), // Harga 3: Grosir / Partai Besar
    salePriceDelivery: numeric("sale_price_delivery", {
      precision: 24,
      scale: 8,
    })
      .default("0")
      .notNull(), // Harga 4: Layanan Antar / Delivery / Online
    salePriceMember: numeric("sale_price_member", { precision: 24, scale: 8 })
      .default("0")
      .notNull(), // Harga 5: Member / BPJS / Asuransi
    isBaseUnit: boolean("is_base_unit").default(false).notNull(),
  },
  (t) => ({
    productUnitUq: uniqueIndex("uq_product_unit").on(t.productId, t.unitName),
  }),
);

// 3. INVENTORI BATCH & SALDO CABANG
export const productBatches = pgTable(
  "product_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    legacyIdFastbatch: integer("legacy_id_fastbatch"),
    batchNo: varchar("batch_no", { length: 100 }),
    expiredDate: date("expired_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    batchLookupIdx: uniqueIndex("uq_product_batch").on(
      t.tenantId,
      t.productId,
      t.batchNo,
      t.expiredDate,
    ),
    legacyFastbatchIdx: index("idx_product_legacy_fastbatch").on(
      t.tenantId,
      t.legacyIdFastbatch,
    ),
  }),
);

export const branchStocks = pgTable(
  "branch_stocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    totalQtyBase: numeric("total_qty_base", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    unbatchedQtyBase: numeric("unbatched_qty_base", {
      precision: 24,
      scale: 8,
    })
      .default("0")
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    locationProductUq: uniqueIndex("uq_location_product_stock").on(
      t.locationId,
      t.productId,
    ),
  }),
);

export const branchBatchStocks = pgTable(
  "branch_batch_stocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    batchId: uuid("batch_id")
      .references(() => productBatches.id, { onDelete: "cascade" })
      .notNull(),
    qtyBase: numeric("qty_base", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    buyPrice: numeric("buy_price", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    locationProductBatchUq: uniqueIndex("uq_location_product_batch_stock").on(
      t.locationId,
      t.productId,
      t.batchId,
    ),
    fefoLookupIdx: index("idx_fefo_lookup").on(
      t.branchId,
      t.locationId,
      t.productId,
      t.qtyBase,
    ),
  }),
);

// 4. DOUBLE-ENTRY STOCK LEDGER (AUDIT TRAIL RESMI MUTASI BPOM)
export const stockLedger = pgTable(
  "stock_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id").references(() => inventoryLocations.id),
    batchId: uuid("batch_id").references(() => productBatches.id),
    mutationType: varchar("mutation_type", { length: 50 }).notNull(), // 'POS_SALE' | 'PURCHASE_RECEIPT' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'ADJUSTMENT'
    quantityBase: numeric("quantity_base", {
      precision: 24,
      scale: 8,
    }).notNull(),
    costPerUnit: numeric("cost_per_unit", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    referenceId: uuid("reference_id").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    auditIdx: index("idx_stock_ledger_audit").on(
      t.branchId,
      t.productId,
      t.createdAt,
    ),
  }),
);

// 5. PELANGGAN, PASIEN & MEMBER (Mewadahi 392 Baris PELANGGAN Legacy)
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    legacyIdPelanggan: integer("legacy_id_pelanggan"),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    customerType: varchar("customer_type", { length: 50 })
      .default("UMUM")
      .notNull(), // 'UMUM' | 'MEMBER' | 'ASURANSI' | 'PROLANIS'
    gender: varchar("gender", { length: 10 }), // 'L' | 'P'
    birthDate: date("birth_date"),
    phone: varchar("phone", { length: 50 }),
    address: text("address"),
    pointBalance: integer("point_balance").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    tenantCustomerCodeUq: uniqueIndex("uq_customer_tenant_code").on(
      t.tenantId,
      t.code,
    ),
    customerSearchIdx: index("idx_customer_search").on(
      t.tenantId,
      t.name,
      t.phone,
    ),
  }),
);

// 6. SHIFT KASIR & TUTUP KASIR (Mewadahi TUTUPKASIR Legacy)
export const cashierShifts = pgTable(
  "cashier_shifts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id").notNull(),
    shiftNumber: integer("shift_number").notNull(),
    startTime: timestamp("start_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
    endTime: timestamp("end_time", { withTimezone: true }),
    initialCash: numeric("initial_cash", { precision: 24, scale: 8 }).notNull(),
    expectedCash: numeric("expected_cash", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    actualCash: numeric("actual_cash", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    cashDifference: numeric("cash_difference", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    totalNonCash: numeric("total_non_cash", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    totalSales: numeric("total_sales", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    notes: text("notes"),
    isOpen: boolean("is_open").default(true).notNull(),
  },
  (t) => ({
    branchShiftDateIdx: index("idx_shift_branch_date").on(
      t.branchId,
      t.startTime,
    ),
  }),
);

// 7. TRANSAKSI PENJUALAN KASIR
export const salesTransactions = pgTable(
  "sales_transactions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    cashierShiftId: uuid("cashier_shift_id")
      .references(() => cashierShifts.id)
      .notNull(),
    invoiceNo: varchar("invoice_no", { length: 100 }).notNull(),
    cashierUserId: uuid("cashier_user_id").notNull(),
    customerId: uuid("customer_id").references(() => customers.id),
    customerType: varchar("customer_type", { length: 50 })
      .default("UMUM")
      .notNull(),
    patientName: varchar("patient_name", { length: 255 }),
    doctorName: varchar("doctor_name", { length: 255 }),
    prescriptionImageUrl: text("prescription_image_url"), // Disimpan dalam format string URL relatif e.g. "/storage/prescriptions/uuid.jpg"
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
    subtotal: numeric("subtotal", { precision: 24, scale: 8 }).notNull(),
    discountPercent: numeric("discount_percent", {
      precision: 24,
      scale: 8,
    })
      .default("0")
      .notNull(),
    discountAmount: numeric("discount_amount", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    taxPercent: numeric("tax_percent", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    taxAmount: numeric("tax_amount", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    tuslahAmount: numeric("tuslah_amount", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    embalaseAmount: numeric("embalase_amount", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    grandTotal: numeric("grand_total", { precision: 24, scale: 8 }).notNull(),
    paidAmount: numeric("paid_amount", { precision: 24, scale: 8 }).notNull(),
    changeAmount: numeric("change_amount", {
      precision: 24,
      scale: 8,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uqInvoice: uniqueIndex("uq_sales_invoice").on(t.tenantId, t.invoiceNo),
    dateRangeIdx: index("idx_sales_created").on(t.branchId, t.createdAt),
  }),
);

export const salesTransactionItems = pgTable(
  "sales_transaction_items",
  {
    id: uuid("id").primaryKey(),
    transactionId: uuid("transaction_id")
      .references(() => salesTransactions.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    lineNo: integer("line_no").notNull(),
    locationId: uuid("location_id").references(() => inventoryLocations.id),
    batchId: uuid("batch_id").references(() => productBatches.id),
    unitName: varchar("unit_name", { length: 50 }).notNull(),
    conversionFactor: numeric("conversion_factor", {
      precision: 24,
      scale: 8,
    }).notNull(),
    qty: numeric("qty", { precision: 24, scale: 8 }).notNull(),
    qtyBase: numeric("qty_base", { precision: 24, scale: 8 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 24, scale: 8 }).notNull(),
    discountPercent: numeric("discount_percent", {
      precision: 24,
      scale: 8,
    })
      .default("0")
      .notNull(),
    discountAmount: numeric("discount_amount", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    subtotal: numeric("subtotal", { precision: 24, scale: 8 }).notNull(),
    dosageRules: text("dosage_rules"),
  },
  (t) => ({
    transactionLineUq: uniqueIndex("uq_sales_transaction_line").on(
      t.transactionId,
      t.lineNo,
    ),
  }),
);

// 8. RESEP RACIKAN & KOMPOSISI BAHAN (Mewadahi PENJUALANRACIKAN & DETAILPENJUALANR Legacy)
export const salesCompounds = pgTable(
  "sales_compounds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    transactionId: uuid("transaction_id")
      .references(() => salesTransactions.id, { onDelete: "cascade" })
      .notNull(),
    compoundName: varchar("compound_name", { length: 255 }).notNull(), // e.g. "Puyer Batuk Pilek Anak"
    dosageForm: varchar("dosage_form", { length: 50 })
      .default("PUYER")
      .notNull(), // 'PUYER' | 'KAPSUL' | 'SALEP' | 'SIRUP'
    quantity: numeric("quantity", { precision: 24, scale: 8 }).notNull(), // Jumlah bungkus/kapsul
    tuslahAmount: numeric("tuslah_amount", { precision: 24, scale: 8 })
      .default("0")
      .notNull(), // Jasa racik
    embalaseAmount: numeric("embalase_amount", { precision: 24, scale: 8 })
      .default("0")
      .notNull(), // Wadah/kertas puyer
    subtotal: numeric("subtotal", { precision: 24, scale: 8 }).notNull(),
    dosageRules: text("dosage_rules"), // e.g. "3x1 Bungkus Sesudah Makan"
  },
  (t) => ({
    trxCompoundIdx: index("idx_compound_trx").on(t.transactionId),
  }),
);

export const salesCompoundItems = pgTable(
  "sales_compound_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    compoundId: uuid("compound_id")
      .references(() => salesCompounds.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    locationId: uuid("location_id").references(() => inventoryLocations.id),
    batchId: uuid("batch_id").references(() => productBatches.id),
    lineNo: integer("line_no").notNull(),
    qtyBase: numeric("qty_base", { precision: 24, scale: 8 }).notNull(), // Kuantitas bahan baku terambil
    unitPrice: numeric("unit_price", { precision: 24, scale: 8 }).notNull(),
    costPrice: numeric("cost_price", { precision: 24, scale: 8 })
      .default("0")
      .notNull(), // HPP bahan
    subtotal: numeric("subtotal", { precision: 24, scale: 8 }).notNull(),
  },
  (t) => ({
    compoundItemUq: uniqueIndex("uq_compound_item_line").on(
      t.compoundId,
      t.lineNo,
    ),
    compoundProductIdx: index("idx_compound_product").on(
      t.compoundId,
      t.productId,
    ),
  }),
);

// 9. PENGADAAN & PEMBELIAN PBF (Mewadahi 244 SUPPLIER, 7k PEMBELIAN, 52k DETAILPEMBELIAN)
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    legacyIdSupplier: integer("legacy_id_supplier"),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 100 }),
    address: text("address"),
    contactPerson: varchar("contact_person", { length: 100 }),
    paymentTermDays: integer("payment_term_days").default(30).notNull(), // Default tempo hari
    leadTimeDays: integer("lead_time_days").default(3).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    tenantSupplierCodeUq: uniqueIndex("uq_supplier_tenant_code").on(
      t.tenantId,
      t.code,
    ),
    supplierSearchIdx: index("idx_supplier_search").on(t.tenantId, t.name),
  }),
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    poNumber: varchar("po_number", { length: 100 }).notNull(), // e.g. "PO-202610-001"
    status: varchar("status", { length: 50 }).default("ORDERED").notNull(), // 'DRAFT' | 'ORDERED' | 'RECEIVED_PARTIAL' | 'RECEIVED_FULL' | 'CANCELLED'
    orderDate: date("order_date").notNull(),
    expectedDeliveryDate: date("expected_delivery_date"),
    totalAmount: numeric("total_amount", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uqPoNumber: uniqueIndex("uq_po_tenant_number").on(t.tenantId, t.poNumber),
  }),
);

export const purchaseInvoices = pgTable(
  "purchase_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    purchaseOrderId: uuid("purchase_order_id").references(
      () => purchaseOrders.id,
    ),
    legacyIdPembelian: integer("legacy_id_pembelian"),
    invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(), // Nomor Faktur PBF
    receiveDate: date("receive_date").notNull(),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date").notNull(), // Tanggal Jatuh Tempo Hutang
    isCredit: boolean("is_credit").default(true).notNull(),
    subtotal: numeric("subtotal", { precision: 24, scale: 8 }).notNull(),
    discountAmount: numeric("discount_amount", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    taxAmount: numeric("tax_amount", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    grandTotal: numeric("grand_total", { precision: 24, scale: 8 }).notNull(),
    paidAmount: numeric("paid_amount", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    isPaidOff: boolean("is_paid_off").default(false).notNull(),
    invoiceScanUrl: text("invoice_scan_url"),
    receivedBy: uuid("received_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uqSupplierInvoice: uniqueIndex("uq_supplier_invoice").on(
      t.tenantId,
      t.supplierId,
      t.invoiceNumber,
    ),
    dueDateIdx: index("idx_purchase_due_date").on(
      t.branchId,
      t.dueDate,
      t.isPaidOff,
    ),
  }),
);

export const purchaseInvoiceItems = pgTable(
  "purchase_invoice_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .references(() => purchaseInvoices.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    locationId: uuid("location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    batchId: uuid("batch_id")
      .references(() => productBatches.id)
      .notNull(),
    lineNo: integer("line_no").notNull(),
    unitName: varchar("unit_name", { length: 50 }).notNull(),
    conversionFactor: numeric("conversion_factor", {
      precision: 24,
      scale: 8,
    }).notNull(),
    qty: numeric("qty", { precision: 24, scale: 8 }).notNull(),
    qtyBase: numeric("qty_base", { precision: 24, scale: 8 }).notNull(),
    buyPrice: numeric("buy_price", { precision: 24, scale: 8 }).notNull(),
    discountPercent: numeric("discount_percent", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    discountAmount: numeric("discount_amount", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    subtotal: numeric("subtotal", { precision: 24, scale: 8 }).notNull(),
  },
  (t) => ({
    purchaseLineUq: uniqueIndex("uq_purchase_line").on(t.invoiceId, t.lineNo),
  }),
);

export const debtPayments = pgTable(
  "debt_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    purchaseInvoiceId: uuid("purchase_invoice_id")
      .references(() => purchaseInvoices.id, { onDelete: "cascade" })
      .notNull(),
    paymentNumber: varchar("payment_number", { length: 100 }).notNull(), // e.g. "RLH-0000001"
    paymentDate: date("payment_date").notNull(),
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(), // 'TRANSFER' | 'CASH' | 'GIRO'
    amountPaid: numeric("amount_paid", { precision: 24, scale: 8 }).notNull(),
    receiptScanUrl: text("receipt_scan_url"),
    paidBy: uuid("paid_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    paymentInvoiceIdx: index("idx_debt_payment_invoice").on(
      t.purchaseInvoiceId,
    ),
  }),
);

// 10. MUTASI STOK ANTAR-CABANG (Mewadahi 3.189 Pengiriman & 1.352 Penerimaan RKB/RTB Legacy)
export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    transferNumber: varchar("transfer_number", { length: 100 }).notNull(), // e.g. "RKB-4.0000001"
    sourceBranchId: uuid("source_branch_id")
      .references(() => branches.id)
      .notNull(),
    destBranchId: uuid("dest_branch_id")
      .references(() => branches.id)
      .notNull(),
    sourceLocationId: uuid("source_location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    destLocationId: uuid("dest_location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    status: varchar("status", { length: 50 }).default("DISPATCHED").notNull(), // 'DRAFT' | 'DISPATCHED' | 'RECEIVED' | 'RECEIVED_DISCREPANCY' | 'CANCELLED'
    trackingCourier: varchar("tracking_courier", { length: 100 }), // Driver/kurir internal outlet
    notes: text("notes"),
    receiptNotes: text("receipt_notes"),
    shippedBy: uuid("shipped_by").notNull(),
    receivedBy: uuid("received_by"),
    shippedAt: timestamp("shipped_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
  },
  (t) => ({
    uqTransferNumber: uniqueIndex("uq_transfer_number").on(
      t.tenantId,
      t.transferNumber,
    ),
    transferStatusIdx: index("idx_transfer_status").on(
      t.destBranchId,
      t.status,
    ),
  }),
);

export const stockTransferItems = pgTable(
  "stock_transfer_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transferId: uuid("transfer_id")
      .references(() => stockTransfers.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    batchId: uuid("batch_id")
      .references(() => productBatches.id)
      .notNull(),
    lineNo: integer("line_no").notNull(),
    qtySentBase: numeric("qty_sent_base", {
      precision: 24,
      scale: 8,
    }).notNull(), // Kuantitas dikirim asal
    qtyReceivedBase: numeric("qty_received_base", { precision: 24, scale: 8 }), // Kuantitas diterima tujuan
    discrepancyQtyBase: numeric("discrepancy_qty_base", {
      precision: 24,
      scale: 8,
    })
      .default("0")
      .notNull(), // Selisih kirim vs terima
    discrepancyReason: text("discrepancy_reason"), // e.g. "Pecah/rusak di perjalanan", "Kurang kirim"
    costPerUnit: numeric("cost_per_unit", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
  },
  (t) => ({
    transferLineUq: uniqueIndex("uq_transfer_line").on(t.transferId, t.lineNo),
  }),
);

// 11. STOK OPNAME & PENYESUAIAN FISIK (Mewadahi 81.254 KOREKSI & 160.713 DETAILKOREKSI)
export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    adjustmentNumber: varchar("adjustment_number", { length: 100 }).notNull(), // e.g. "RJK-0076430"
    adjustmentDate: date("adjustment_date").notNull(),
    reason: text("reason").notNull(), // 'STOCK_OPNAME' | 'DAMAGED' | 'EXPIRED' | 'DISCREPANCY'
    status: varchar("status", { length: 50 }).default("COMMITTED").notNull(), // 'DRAFT' | 'COMMITTED'
    performedBy: uuid("performed_by").notNull(),
    approvedBy: uuid("approved_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uqAdjustmentNumber: uniqueIndex("uq_adjustment_number").on(
      t.tenantId,
      t.adjustmentNumber,
    ),
  }),
);

export const stockAdjustmentItems = pgTable(
  "stock_adjustment_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adjustmentId: uuid("adjustment_id")
      .references(() => stockAdjustments.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    batchId: uuid("batch_id").references(() => productBatches.id),
    lineNo: integer("line_no").notNull(),
    systemQtyBase: numeric("system_qty_base", {
      precision: 24,
      scale: 8,
    }).notNull(),
    actualQtyBase: numeric("actual_qty_base", {
      precision: 24,
      scale: 8,
    }).notNull(),
    differenceQtyBase: numeric("difference_qty_base", {
      precision: 24,
      scale: 8,
    }).notNull(), // actual - system
    costPerUnit: numeric("cost_per_unit", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    notes: text("notes"),
  },
  (t) => ({
    adjustmentLineUq: uniqueIndex("uq_adjustment_line").on(
      t.adjustmentId,
      t.lineNo,
    ),
  }),
);

// 12. KONSINYASI (CONSIGNMENT) (Mewadahi 349 KONSISETOR & 27 KONSITARIK Legacy)
export const consignmentReceipts = pgTable(
  "consignment_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    locationId: uuid("location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    receiptNumber: varchar("receipt_number", { length: 100 }).notNull(), // e.g. "RKS-0000001" (Konsi Setor)
    receiptDate: date("receipt_date").notNull(),
    notes: text("notes"),
    receivedBy: uuid("received_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uqConsignmentReceipt: uniqueIndex("uq_consignment_receipt").on(
      t.tenantId,
      t.receiptNumber,
    ),
    consignmentSupplierIdx: index("idx_consignment_receipt_supplier").on(
      t.branchId,
      t.supplierId,
    ),
  }),
);

export const consignmentReceiptItems = pgTable(
  "consignment_receipt_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptId: uuid("receipt_id")
      .references(() => consignmentReceipts.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    batchId: uuid("batch_id")
      .references(() => productBatches.id)
      .notNull(),
    lineNo: integer("line_no").notNull(),
    qtyReceived: numeric("qty_received", { precision: 24, scale: 8 }).notNull(),
    costPrice: numeric("cost_price", { precision: 24, scale: 8 }).notNull(), // HPP titipan
    subtotalCost: numeric("subtotal_cost", {
      precision: 24,
      scale: 8,
    }).notNull(),
  },
  (t) => ({
    consignmentReceiptLineUq: uniqueIndex("uq_consignment_receipt_line").on(
      t.receiptId,
      t.lineNo,
    ),
  }),
);

export const consignmentSettlements = pgTable(
  "consignment_settlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    locationId: uuid("location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    settlementNumber: varchar("settlement_number", { length: 100 }).notNull(), // e.g. "RKT-0000001" (Konsi Tarik)
    settlementDate: date("settlement_date").notNull(),
    totalSoldAmount: numeric("total_sold_amount", {
      precision: 24,
      scale: 8,
    }).notNull(), // Nilai barang laku
    discountAmount: numeric("discount_amount", { precision: 24, scale: 8 })
      .default("0")
      .notNull(),
    totalPaidAmount: numeric("total_paid_amount", {
      precision: 24,
      scale: 8,
    }).notNull(), // Total dibayar ke supplier
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(), // 'CASH' | 'TRANSFER'
    notes: text("notes"),
    settledBy: uuid("settled_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uqConsignmentSettlement: uniqueIndex("uq_consignment_settlement").on(
      t.tenantId,
      t.settlementNumber,
    ),
  }),
);

export const consignmentSettlementItems = pgTable(
  "consignment_settlement_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    settlementId: uuid("settlement_id")
      .references(() => consignmentSettlements.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    batchId: uuid("batch_id").references(() => productBatches.id),
    lineNo: integer("line_no").notNull(),
    soldQty: numeric("sold_qty", { precision: 24, scale: 8 }).notNull(), // Kuantitas laku (QTY_JUAL)
    returnedQty: numeric("returned_qty", { precision: 24, scale: 8 })
      .default("0")
      .notNull(), // Kuantitas ditarik supplier (QTY_TARIK)
    lostQty: numeric("lost_qty", { precision: 24, scale: 8 })
      .default("0")
      .notNull(), // Kuantitas rusak/hilang (QTY_HILANG)
    unitCost: numeric("unit_cost", { precision: 24, scale: 8 }).notNull(), // HPP per satuan
    subtotalPayable: numeric("subtotal_payable", {
      precision: 24,
      scale: 8,
    }).notNull(), // soldQty * unitCost
  },
  (t) => ({
    consignmentSettlementLineUq: uniqueIndex(
      "uq_consignment_settlement_line",
    ).on(t.settlementId, t.lineNo),
  }),
);
```

---

## 11. SPESIFIKASI DEPLOYMENT SINGLE VPS DOCKERIZED (MINIO-FREE)

Layanan berjalan di atas satu VPS (2 vCPU, 4 GB RAM, Ubuntu 24.04 LTS). Penghapusan MinIO membebaskan $\approx 1\text{ GB}$ memori RAM yang dialokasikan ulang untuk ketahanan koneksi pool PostgreSQL dan kecepatan I/O file statis.

```yaml
# docker-compose.yml
version: "3.8"

services:
  caddy:
    image: caddy:2-alpine
    container_name: apoteku_gateway
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./uploads:/var/www/uploads:ro # Akses read-only Caddy ke media fisik lokal
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - apoteku_net

  app_server:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: apoteku_backend
    restart: always
    environment:
      - PORT=3000
      - DATABASE_URL=postgres://apoteku_user:SecureP4ssw0rd@postgres:5432/apoteku_prod
      - UPLOAD_DIR=/app/uploads
      - JWT_SECRET=SuperSecureJWTRandomKey256BitEngine
    volumes:
      # Mount folder lokal host ke dalam container backend agar berkas persisten saat container rebuild
      - ./uploads:/app/uploads
    depends_on:
      - postgres
    networks:
      - apoteku_net

  postgres:
    image: postgres:16-alpine
    container_name: apoteku_db
    restart: always
    environment:
      POSTGRES_USER: apoteku_user
      POSTGRES_PASSWORD: SecureP4ssw0rd
      POSTGRES_DB: apoteku_prod
    command: >
      postgres -c shared_buffers=1024MB
               -c effective_cache_size=3072MB
               -c work_mem=16MB
               -c maintenance_work_mem=256MB
               -c max_connections=150
               -c checkpoint_completion_target=0.9
               -c wal_buffers=16MB
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks:
      - apoteku_net

volumes:
  pg_data:
  caddy_data:
  caddy_config:

networks:
  apoteku_net:
    driver: bridge
```

```caddy
# Caddyfile
app.apoteku.com {
    encode gzip zstd

    # Opsi A: Caddy bertindak sebagai file server langsung untuk path /storage/*
    handle /storage/* {
        uri strip_prefix /storage
        root * /var/www/uploads
        file_server
    }

    # API and Sync Endpoints to Bun + Elysia
    handle /api/* {
        reverse_proxy app_server:3000
    }

    # SvelteKit PWA Client Static & SSR Web
    handle {
        reverse_proxy app_server:3000
    }
}
```
