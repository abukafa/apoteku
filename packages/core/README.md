# @apoteku/core — Engine Aturan Bisnis & Helper Apotek

Paket `@apoteku/core` adalah pustaka inti (*domain core library*) yang bersifat **agregat, independen, dan murni (zero-dependency / pure TypeScript functions)**. 

Paket ini dirancang untuk menjamin konsistensi 100% antara antarmuka web, kasir offline (IndexedDB), dan API backend server dalam menghitung harga, mengelola stok, menerbitkan nomor dokumen, dan mengaudit transaksi farmasi di Indonesia.

---

## 📁 Struktur Direktori

```
packages/core/src/
├── calculations/
│   ├── totals.ts           # Total keranjang POS, diskon bertingkat, PPN 11%, pembulatan kas
│   ├── pricing.ts          # Konversi multisatuan, rumus HNA -> HJA, kalkulasi margin, diskon faktur
│   ├── inventory.ts        # Rekonsiliasi selisih stok opname & rumus Reorder Point (ROP)
│   └── debt.ts             # Pelunasan hutang faktur PBF & formula pemulihan saldo (void reversal)
├── validators/
│   └── expiry.ts           # Evaluasi sisa masa simpan obat & peringatan kedaluwarsa (ED)
├── generators/
│   └── doc-numbers.ts      # Standardisasi penomoran dokumen resmi farmasi (SP, Faktur, RJK, RLH, SJL)
├── formatters/
│   └── currency.ts         # Pemformat & parser mata uang Rupiah Indonesia (IDR)
├── fefo/
│   └── selection.ts        # Algoritma FEFO (First-Expired, First-Out)
└── hardware/
    └── escpos.ts           # Generator byte commands untuk printer kasir thermal ESC/POS
```

---

## 📖 Panduan API & Modul

### 1. `calculations/totals.ts` — Perhitungan Kasir POS
Menghitung total belanja dengan dukungan PPN 11%, tuslah (biaya racik), embalase (biaya wadah), dan pembulatan tunai khas Indonesia (misal: kelipatan Rp 100).

```ts
import { calculateCartTotals } from "@apoteku/core";

const summary = calculateCartTotals(
  [
    { qty: 2, unitPrice: 10000, discountPercent: 10 },
    { qty: 1, unitPrice: 5000, discountAmount: 500 }
  ],
  {
    taxRatePercent: 11,
    tuslahAmount: 1000,
    embalaseAmount: 500,
    roundingStep: 100,
    paidAmount: 30000
  }
);
// Output: grandTotal, totalDiscount, taxableAmount, taxAmount, changeAmount, roundingDifference
```

---

### 2. `calculations/pricing.ts` — Multisatuan & Harga Jual
* **`convertPackageToBase(packageQty, factor)`**: Mengonversi jumlah kemasan ke satuan dasar (contoh: 3 Strip @ 10 = 30 Tablet).
* **`convertBaseToPackage(baseQty, factor)`**: Mengonversi satuan dasar ke kemasan utuh beserta sisa pecahan (contoh: 25 Tablet @ 10 = 2 Strip sisa 5 Tablet).
* **`calculateSellingPrice(hna, marginPercent, taxPercent)`**: Menghitung Harga Jual Apotek (HJA).  
  $$\text{HJA} = \text{HNA} \times (1 + \text{PPN}\%) \times (1 + \text{Margin}\%)$$
* **`calculateMarginPercent(buyPrice, sellPrice)`**: Menghitung persentase margin keuntungan kotor.
* **`calculateInvoiceLineNet(qty, unitPrice, disc1, disc2)`**: Menghitung nilai faktur pembelian dengan diskon bertingkat PBF.

---

### 3. `calculations/inventory.ts` — Stok Opname & Reorder Point
* **`calculateStockDifference(systemQty, actualQty, costPerUnit)`**:  
  Menghitung selisih fisik vs sistem, nilai kerugian/keuntungan finansial (*value difference*), serta status selisih:
  * `LOSS`: Fisik < Sistem (Stok Hilang / Minus)
  * `GAIN`: Fisik > Sistem (Stok Lebih)
  * `MATCH`: Fisik == Sistem (Cocok 100%)
* **`calculateReorderPoint(avgDailyUsage, leadTimeDays, safetyStockDays)`**:  
  Menghitung batas minimum stok untuk menerbitkan Surat Pesanan (SP) baru.
  $$\text{ROP} = (\text{Pemakaian Harian} \times \text{Lead Time}) + (\text{Pemakaian Harian} \times \text{Safety Days})$$

---

### 4. `calculations/debt.ts` — Pelunasan Hutang & Void
* **`calculateDebtSettlement(grandTotal, currentPaid, paymentAmount)`**:  
  Menghitung sisa kewajiban hutang faktur dan menentukan apakah faktur telah lunas penuh (`isPaidOff = true`).
* **`calculateDebtVoidReversal(grandTotal, currentPaid, voidAmount)`**:  
  Menghitung pemulihan saldo tagihan ketika suatu bukti pembayaran kas dibatalkan atau dihapus.

---

### 5. `validators/expiry.ts` — Kontrol Kedaluwarsa Obat (ED)
Mengevaluasi sisa masa simpan obat berdasarkan tanggal kedaluwarsa dengan threshold peringatan dini (default: 90 hari):
* `OVERDUE`: Tanggal ED telah lewat (obat harus dikarantina).
* `DUE_SOON`: ED $\le 90$ hari lagi (masuk daftar defekta / diskon khusus).
* `SAFE`: Obat aman untuk didistribusikan.

---

### 6. `generators/doc-numbers.ts` — Standardisasi Dokumen Farmasi
Menerbitkan nomor dokumen baku:
* **Surat Pesanan:** `SP-2026-1001` (Reguler), `SP-NKT-2026-1002` (Narkotika), `SP-PSI-2026-1003` (Psikotropika), `SP-PRK-2026-1004` (Prekursor).
* **Rekonsiliasi Opname Fisik:** `RJK-202611-1005`
* **Kas Keluar Pelunasan Hutang:** `RLH-20261107-101`
* **Surat Jalan Mutasi Cabang:** `SJL-202611-1006`

---

### 7. `formatters/currency.ts` — Format Mata Uang
* **`formatRupiah(amount)`**: Mengonversi angka ke string Rupiah berstandar Indonesia (contoh: `150000` $\to$ `"Rp 150.000"`).
* **`parseRupiah(str)`**: Membersihkan dan mengonversi string Rupiah ke integer (contoh: `"Rp 150.000"` $\to$ `150000`).

---

### 8. `fefo/selection.ts` — Seleksi Batch Obat FEFO
Memilih alokasi batch tertua yang harus dikeluarkan terlebih dahulu sesuai regulasi BPOM.

---

## 🧪 Menjalankan Pengujian (Unit Tests)

Seluruh fungsi pada paket ini diuji menggunakan Bun Test Runner:

```bash
bun test
```

