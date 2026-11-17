import type { PermissionKey } from "./permissions.js";

export interface ApiRule {
  pathPrefix: string;
  method?: string; // Optional: GET, POST, PUT, DELETE, PATCH
  requiredPermission: PermissionKey;
  description: string;
}

/**
 * Aturan Akses Endpoint API REST Backend
 */
export const API_ACCESS_RULES: ApiRule[] = [
  // POS & Kasir
  { pathPrefix: "/pos/bootstrap", requiredPermission: "pos:access", description: "Bootstrap data POS offline" },
  { pathPrefix: "/pos/sync-sales", method: "POST", requiredPermission: "pos:checkout", description: "Sinkronisasi penjualan kasir" },
  { pathPrefix: "/pos/transactions", method: "POST", requiredPermission: "pos:checkout", description: "Submit transaksi penjualan" },
  { pathPrefix: "/shifts/open", method: "POST", requiredPermission: "pos:shift:open", description: "Buka shift kasir" },
  { pathPrefix: "/shifts/close", method: "POST", requiredPermission: "pos:shift:close", description: "Tutup shift kasir" },
  { pathPrefix: "/shifts/reconcile", requiredPermission: "pos:shift:close", description: "Rekonsiliasi shift kasir" },
  { pathPrefix: "/shifts", requiredPermission: "pos:shift:open", description: "Informasi shift kasir" },

  // Resep & Pelayanan
  { pathPrefix: "/prescriptions", method: "POST", requiredPermission: "prescription:create", description: "Buat resep dokter" },
  { pathPrefix: "/prescriptions", requiredPermission: "prescription:read", description: "Baca data resep dokter" },

  // Inventori & Opname & Transfer
  { pathPrefix: "/inventory/transfers", method: "POST", requiredPermission: "inventory:transfer", description: "Buat transfer antar cabang" },
  { pathPrefix: "/inventory/transfers", requiredPermission: "inventory:read", description: "Daftar transfer antar cabang" },
  { pathPrefix: "/inventory/opname", method: "POST", requiredPermission: "inventory:adjust", description: "Simpan rekonsiliasi opname" },
  { pathPrefix: "/inventory/opname", requiredPermission: "inventory:read", description: "Daftar riwayat opname" },

  // Pengadaan & ERP
  { pathPrefix: "/erp/orders", method: "POST", requiredPermission: "purchase:order:create", description: "Buat Surat Pesanan (PO)" },
  { pathPrefix: "/erp/orders", requiredPermission: "purchase:read", description: "Baca daftar order pembelian" },
  { pathPrefix: "/erp/consignments", requiredPermission: "inventory:read", description: "Data konsinyasi barang" },

  // Retur
  { pathPrefix: "/returns/customer", method: "POST", requiredPermission: "returns:customer:process", description: "Input retur pelanggan" },
  { pathPrefix: "/returns/supplier", method: "POST", requiredPermission: "returns:supplier:process", description: "Input retur supplier" },
  { pathPrefix: "/returns", requiredPermission: "returns:read", description: "Daftar riwayat retur" },

  // Keuangan & Kas
  { pathPrefix: "/finance/debt/pay", method: "POST", requiredPermission: "finance:debt:pay", description: "Bayar hutang faktur PBF" },
  { pathPrefix: "/finance/debt", requiredPermission: "finance:read", description: "Daftar hutang jatuh tempo" },
  { pathPrefix: "/finance/cashflow", requiredPermission: "finance:cashflow:manage", description: "Catat kas masuk/keluar" },

  // Laporan & SIPNAP
  { pathPrefix: "/reports/sipnap", requiredPermission: "reports:sipnap:export", description: "Ekspor laporan resmi SIPNAP" },
  { pathPrefix: "/reports", requiredPermission: "reports:view", description: "Akses laporan analitik" },

  // Notifikasi
  { pathPrefix: "/notifications", requiredPermission: "dashboard:view", description: "Notifikasi operasional" },

  // Pengaturan & Manajemen Staf (Hak Akses Mutlak Owner & Superadmin)
  { pathPrefix: "/users", requiredPermission: "settings:users:manage", description: "Manajemen Staf & Hak Akses" },
  { pathPrefix: "/api/users", requiredPermission: "settings:users:manage", description: "Manajemen Staf & Hak Akses" }
];

/**
 * Daftar rute API publik yang dikecualikan dari guard RBAC
 */
export const PUBLIC_API_PREFIXES = [
  "/health",
  "/swagger",
  "/auth",
  "/media/stream",
  "/uploads"
];
