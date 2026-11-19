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

  // Penjualan & Void
  { pathPrefix: "/sales", method: "POST", requiredPermission: "sales:void", description: "Batalkan transaksi penjualan kasir (Void)" },
  { pathPrefix: "/sales", requiredPermission: "sales:read", description: "Baca riwayat transaksi penjualan" },

  // Resep & Pelayanan
  { pathPrefix: "/prescriptions", method: "PATCH", requiredPermission: "prescription:verify", description: "Skrining klinis apoteker" },
  { pathPrefix: "/prescriptions", method: "POST", requiredPermission: "prescription:create", description: "Buat resep dokter" },
  { pathPrefix: "/prescriptions", requiredPermission: "prescription:read", description: "Baca data resep dokter" },

  // Inventori & Opname & Transfer
  { pathPrefix: "/inventory/transfers", method: "POST", requiredPermission: "inventory:transfer", description: "Buat atau proses transfer antar cabang" },
  { pathPrefix: "/inventory/transfers", requiredPermission: "inventory:read", description: "Daftar transfer antar cabang" },
  { pathPrefix: "/inventory/opname", method: "POST", requiredPermission: "inventory:opname", description: "Simpan rekonsiliasi opname" },
  { pathPrefix: "/inventory/opname", requiredPermission: "inventory:opname", description: "Daftar riwayat opname" },
  { pathPrefix: "/inventory/ledger", requiredPermission: "inventory:read", description: "Audit kartu stok obat" },
  { pathPrefix: "/products", method: "POST", requiredPermission: "inventory:adjust", description: "Tambah produk baru" },
  { pathPrefix: "/products", method: "PUT", requiredPermission: "inventory:adjust", description: "Update produk master" },
  { pathPrefix: "/products", method: "DELETE", requiredPermission: "inventory:adjust", description: "Hapus produk" },
  { pathPrefix: "/products", requiredPermission: "inventory:read", description: "Katalog produk dan stok" },

  // Pengadaan & Pembelian PBF
  { pathPrefix: "/purchase-orders", method: "POST", requiredPermission: "purchase:order:create", description: "Buat Surat Pesanan (SP)" },
  { pathPrefix: "/purchase-orders", requiredPermission: "purchase:read", description: "Baca daftar Surat Pesanan (SP)" },
  { pathPrefix: "/purchases", method: "POST", requiredPermission: "purchase:invoice:receive", description: "Input faktur pembelian & stok masuk" },
  { pathPrefix: "/purchases", method: "DELETE", requiredPermission: "purchase:invoice:receive", description: "Hapus atau batalkan faktur pembelian" },
  { pathPrefix: "/purchases", requiredPermission: "purchase:read", description: "Baca daftar faktur pembelian PBF" },
  { pathPrefix: "/suppliers", method: "POST", requiredPermission: "supplier:manage", description: "Tambah distributor PBF" },
  { pathPrefix: "/suppliers", method: "PUT", requiredPermission: "supplier:manage", description: "Edit data distributor PBF" },
  { pathPrefix: "/suppliers", method: "DELETE", requiredPermission: "supplier:manage", description: "Hapus distributor PBF" },
  { pathPrefix: "/suppliers", requiredPermission: "purchase:read", description: "Baca daftar distributor PBF" },
  { pathPrefix: "/consignments", method: "POST", requiredPermission: "purchase:invoice:receive", description: "Input titipan konsinyasi" },
  { pathPrefix: "/consignments", method: "DELETE", requiredPermission: "purchase:invoice:receive", description: "Batalkan titipan konsinyasi" },
  { pathPrefix: "/consignments", requiredPermission: "inventory:read", description: "Data konsinyasi barang" },

  // Retur
  { pathPrefix: "/returns/customer", method: "POST", requiredPermission: "returns:customer:process", description: "Input atau setujui retur pelanggan" },
  { pathPrefix: "/returns/supplier", method: "POST", requiredPermission: "returns:supplier:process", description: "Input atau selesaikan retur supplier PBF" },
  { pathPrefix: "/returns", requiredPermission: "returns:read", description: "Daftar riwayat retur" },

  // Pelanggan & Piutang
  { pathPrefix: "/customers/receivables/pay", method: "POST", requiredPermission: "finance:receivable:collect", description: "Penerimaan pembayaran piutang pelanggan" },
  { pathPrefix: "/customers/receivables", requiredPermission: "customer:read", description: "Buku piutang pelanggan" },
  { pathPrefix: "/customers", method: "POST", requiredPermission: "customer:manage", description: "Tambah pelanggan baru" },
  { pathPrefix: "/customers", method: "PUT", requiredPermission: "customer:manage", description: "Edit data pelanggan" },
  { pathPrefix: "/customers", method: "DELETE", requiredPermission: "customer:manage", description: "Hapus pelanggan" },
  { pathPrefix: "/customers", requiredPermission: "customer:read", description: "Baca direktori pelanggan" },

  // Keuangan & Kas
  { pathPrefix: "/finance/debt/pay", method: "POST", requiredPermission: "finance:debt:pay", description: "Bayar hutang faktur PBF" },
  { pathPrefix: "/finance/debt", requiredPermission: "finance:read", description: "Daftar hutang jatuh tempo" },
  { pathPrefix: "/finance/cashflow", method: "POST", requiredPermission: "finance:cashflow:manage", description: "Catat kas masuk/keluar" },
  { pathPrefix: "/finance", requiredPermission: "finance:read", description: "Buku kas dan keuangan" },

  // Laporan & SIPNAP
  { pathPrefix: "/reports/financial", requiredPermission: "reports:financial:view", description: "Laporan laba rugi & finansial privat Owner" },
  { pathPrefix: "/reports/sales-shifts", requiredPermission: "reports:sales:view", description: "Laporan omzet penjualan & shift kasir" },
  { pathPrefix: "/reports/pareto", requiredPermission: "reports:inventory:view", description: "Analisis pareto perputaran inventori" },
  { pathPrefix: "/reports/sipnap", requiredPermission: "reports:sipnap:export", description: "Ekspor laporan resmi SIPNAP" },
  { pathPrefix: "/reports", requiredPermission: "reports:view", description: "Akses laporan analitik" },

  // Notifikasi
  { pathPrefix: "/notifications", requiredPermission: "dashboard:view", description: "Notifikasi operasional" },

  // Pengaturan, Tenant & Manajemen Staf (Hak Akses Mutlak Owner & Superadmin)
  { pathPrefix: "/users", method: "POST", requiredPermission: "settings:users:manage", description: "Tambah staf baru" },
  { pathPrefix: "/users", method: "PUT", requiredPermission: "settings:users:manage", description: "Update profil staf" },
  { pathPrefix: "/users", method: "DELETE", requiredPermission: "settings:users:manage", description: "Hapus staf" },
  { pathPrefix: "/users", requiredPermission: "settings:users:manage", description: "Daftar pegawai dan hak akses" },
  { pathPrefix: "/tenant", method: "PUT", requiredPermission: "settings:tenant:edit", description: "Perbarui profil dan legal apotek" },
  { pathPrefix: "/branches", method: "POST", requiredPermission: "settings:tenant:edit", description: "Tambah cabang baru" },
  { pathPrefix: "/branches", method: "PUT", requiredPermission: "settings:tenant:edit", description: "Edit data cabang" },
  { pathPrefix: "/inventory-locations", method: "POST", requiredPermission: "settings:tenant:edit", description: "Tambah lokasi inventori cabang" },
  { pathPrefix: "/inventory-locations", method: "PUT", requiredPermission: "settings:tenant:edit", description: "Update lokasi inventori cabang" }
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
