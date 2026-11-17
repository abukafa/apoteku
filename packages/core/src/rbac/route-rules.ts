import type { UserRole } from "./roles.js";
import type { PermissionKey } from "./permissions.js";

export interface RouteRule {
  pathPrefix: string;
  exact?: boolean;
  requiredPermission: PermissionKey;
  description: string;
}

/**
 * Aturan Akses Rute Halaman Web
 * Menghubungkan URL Frontend dengan kunci izin yang disyaratkan.
 */
export const ROUTE_ACCESS_RULES: RouteRule[] = [
  { pathPrefix: "/pos", requiredPermission: "pos:access", description: "Kasir POS Terminal Kiosk" },
  { pathPrefix: "/penjualan", requiredPermission: "sales:read", description: "Riwayat Penjualan & Transaksi" },
  { pathPrefix: "/pelayanan", requiredPermission: "prescription:read", description: "Pelayanan Resep & Peracikan" },
  { pathPrefix: "/stok", requiredPermission: "inventory:read", description: "Master Stok & Lokasi Depo" },
  { pathPrefix: "/pembelian", requiredPermission: "purchase:read", description: "Pengadaan, PO & Faktur PBF" },
  { pathPrefix: "/pengiriman", requiredPermission: "inventory:transfer", description: "Mutasi & Transfer Antar Cabang" },
  { pathPrefix: "/retur", requiredPermission: "returns:read", description: "Retur Pelanggan & Supplier" },
  { pathPrefix: "/supplier", requiredPermission: "supplier:manage", description: "Master Distributor & PBF" },
  { pathPrefix: "/pelanggan", requiredPermission: "customer:read", description: "Buku Pelanggan & Piutang" },
  { pathPrefix: "/keuangan", requiredPermission: "finance:read", description: "Buku Kas & Pelunasan Hutang" },
  { pathPrefix: "/laporan", requiredPermission: "reports:view", description: "Laporan Bisnis & SIPNAP" },
  { pathPrefix: "/pengaturan", requiredPermission: "settings:view", description: "Pengaturan Sistem Apotek" },
  { pathPrefix: "/", exact: true, requiredPermission: "dashboard:view", description: "Dashboard Utama" }
];

/**
 * Rute Default saat pertama kali login / saat diarahkan dari rute terlarang
 */
export const ROLE_DEFAULT_ROUTES: Record<UserRole, string> = {
  SUPERADMIN: "/",
  OWNER: "/",
  PHARMACIST: "/",
  CASHIER: "/pos",
  INVENTORY: "/stok",
  FINANCE: "/keuangan",
  GUEST: "/pengaturan?tab=profil"
};
