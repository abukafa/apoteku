import type { UserRole } from "./roles.js";
import type { PermissionKey } from "./permissions.js";

/**
 * Matriks Hak Akses Sentral (Single Source of Truth)
 * Menetapkan hak akses default untuk masing-masing peran operasional apotek.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly PermissionKey[]> = {
  // SUPERADMIN: Akses penuh tanpa batas ke seluruh fitur & sistem
  SUPERADMIN: ["*"],

  // OWNER: Pemilik Apotek (Akses penuh ke bisnis, laporan laba rugi, audit, keuangan, inventori, dan pengaturan)
  OWNER: [
    "dashboard:view",
    "pos:access",
    "pos:checkout",
    "sales:read",
    "sales:refund",
    "sales:void",
    "prescription:read",
    "prescription:verify",
    "inventory:read",
    "inventory:adjust",
    "inventory:opname",
    "inventory:transfer",
    "inventory:fefo",
    "purchase:read",
    "purchase:order:create",
    "purchase:invoice:receive",
    "supplier:manage",
    "returns:read",
    "returns:customer:process",
    "returns:supplier:process",
    "customer:read",
    "customer:manage",
    "finance:read",
    "finance:cashflow:manage",
    "finance:debt:pay",
    "finance:receivable:collect",
    "reports:view",
    "reports:sales:view",
    "reports:inventory:view",
    "reports:financial:view",
    "reports:sipnap:export",
    "settings:view",
    "settings:tenant:edit",
    "settings:users:manage",
    "settings:devices:manage"
  ],

  // PHARMACIST: Apoteker Penanggung Jawab (APA / TTK)
  // Fokus: Pelayanan & Resep, Stok Depo, Pengadaan/PBF, Retur, dan Pelaporan SIPNAP Kemenkes.
  // Dibatasi dari Buku Kas umum / Laba Rugi privat Owner dan Pengaturan Tenant global.
  PHARMACIST: [
    "dashboard:view",
    "pos:access",
    "pos:checkout",
    "sales:read",
    "sales:refund",
    "prescription:read",
    "prescription:create",
    "prescription:verify",
    "prescription:compound",
    "inventory:read",
    "inventory:adjust",
    "inventory:opname",
    "inventory:transfer",
    "inventory:fefo",
    "purchase:read",
    "purchase:order:create",
    "purchase:invoice:receive",
    "supplier:manage",
    "returns:read",
    "returns:customer:process",
    "returns:supplier:process",
    "customer:read",
    "reports:view",
    "reports:sales:view",
    "reports:inventory:view",
    "reports:sipnap:export",
    "settings:view"
  ],

  // CASHIER: Kasir Operasional Cabang
  // Fokus: Terminal Kasir POS Kiosk, Transaksi Penjualan, Retur Pelanggan, Tutup Shift Kasir, dan Profil & PIN Saya.
  // Dibatasi dari menu Laporan Finansial, Pembelian PBF, Mutasi, dan Pengaturan Sistem Apotek.
  CASHIER: [
    "pos:access",
    "pos:checkout",
    "pos:shift:open",
    "pos:shift:close",
    "sales:read",
    "sales:refund",
    "returns:read",
    "returns:customer:process",
    "customer:read",
    "settings:view"
  ],

  // INVENTORY: Staf Logistik & Gudang
  // Fokus: Stok Obat, Stok Opname, Mutasi Antar Cabang, Pembelian PBF, Retur Supplier, dan Profil & PIN Saya.
  // Dibatasi dari Kasir POS dan Buku Kas Keuangan.
  INVENTORY: [
    "dashboard:view",
    "inventory:read",
    "inventory:adjust",
    "inventory:opname",
    "inventory:transfer",
    "inventory:fefo",
    "purchase:read",
    "purchase:order:create",
    "purchase:invoice:receive",
    "supplier:manage",
    "returns:read",
    "returns:supplier:process",
    "reports:view",
    "reports:inventory:view",
    "settings:view"
  ],

  // FINANCE: Staf Keuangan & Akuntansi
  // Fokus: Pelunasan Hutang PBF, Piutang Pelanggan, Buku Kas, Laporan Keuangan & Laba Rugi, dan Profil & PIN Saya.
  // Dibatasi dari transaksi Kasir POS dan Peracikan Resep.
  FINANCE: [
    "dashboard:view",
    "sales:read",
    "purchase:read",
    "supplier:manage",
    "customer:read",
    "customer:manage",
    "finance:read",
    "finance:cashflow:manage",
    "finance:debt:pay",
    "finance:receivable:collect",
    "reports:view",
    "reports:sales:view",
    "reports:financial:view",
    "settings:view"
  ],

  // GUEST: Pengguna Baru / Tamu
  // Hanya memiliki akses melihat profil pengaturan akun
  GUEST: ["settings:view"]
};
