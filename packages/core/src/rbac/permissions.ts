export const PERMISSION_KEYS = [
  // Dashboard & Ringkasan Utama
  "dashboard:view",

  // POS & Kasir Terminal
  "pos:access",
  "pos:checkout",
  "pos:shift:open",
  "pos:shift:close",

  // Penjualan & Resep
  "sales:read",
  "sales:refund",
  "sales:void",
  "prescription:read",
  "prescription:create",
  "prescription:verify",
  "prescription:compound",

  // Inventori, Stok & Depo
  "inventory:read",
  "inventory:adjust",
  "inventory:opname",
  "inventory:transfer",
  "inventory:fefo",

  // Pengadaan & Pembelian PBF
  "purchase:read",
  "purchase:order:create",
  "purchase:invoice:receive",
  "supplier:manage",

  // Retur Barang
  "returns:read",
  "returns:customer:process",
  "returns:supplier:process",

  // Pelanggan & Piutang
  "customer:read",
  "customer:manage",

  // Keuangan & Kas
  "finance:read",
  "finance:cashflow:manage",
  "finance:debt:pay",
  "finance:receivable:collect",

  // Laporan & Kepatuhan Regulasi
  "reports:view",
  "reports:sales:view",
  "reports:inventory:view",
  "reports:financial:view",
  "reports:sipnap:export",

  // Pengaturan Sistem & Master Tenant
  "settings:view",
  "settings:tenant:edit",
  "settings:users:manage",
  "settings:devices:manage"
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number] | "*";

export type PermissionCategory =
  | "DASHBOARD"
  | "POS"
  | "SALES"
  | "INVENTORY"
  | "PURCHASE"
  | "RETURNS"
  | "CUSTOMER"
  | "FINANCE"
  | "REPORTS"
  | "SETTINGS";

export interface PermissionDefinition {
  key: (typeof PERMISSION_KEYS)[number];
  label: string;
  description: string;
  category: PermissionCategory;
  categoryLabel: string;
  isHighRisk?: boolean;
  nonDelegable?: boolean; // Khusus Owner & Superadmin mutlak, tidak dapat didelegasikan ke staf biasa
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // Dashboard
  {
    key: "dashboard:view",
    label: "Lihat Dashboard Utama",
    description: "Melihat grafik ringkasan omset dan analitik apotek",
    category: "DASHBOARD",
    categoryLabel: "Dashboard & Ringkasan"
  },

  // POS & Kasir
  {
    key: "pos:access",
    label: "Akses Terminal POS",
    description: "Membuka layar kasir Kiosk POS",
    category: "POS",
    categoryLabel: "Kasir & Terminal POS"
  },
  {
    key: "pos:checkout",
    label: "Proses Transaksi Kasir",
    description: "Menerima bayar dan mencetak struk belanja",
    category: "POS",
    categoryLabel: "Kasir & Terminal POS"
  },
  {
    key: "pos:shift:open",
    label: "Buka Shift Kasir",
    description: "Memulai shift kerja dan input kas awal laci",
    category: "POS",
    categoryLabel: "Kasir & Terminal POS"
  },
  {
    key: "pos:shift:close",
    label: "Tutup Shift & Rekonsiliasi",
    description: "Menghitung fisik kas dan menutup buku kasir",
    category: "POS",
    categoryLabel: "Kasir & Terminal POS"
  },

  // Penjualan & Resep
  {
    key: "sales:read",
    label: "Riwayat Penjualan",
    description: "Melihat daftar nota dan riwayat transaksi penjualan",
    category: "SALES",
    categoryLabel: "Penjualan & Resep"
  },
  {
    key: "sales:refund",
    label: "Refund / Retur Pembeli",
    description: "Mengembalikan uang kepada pembeli",
    category: "SALES",
    categoryLabel: "Penjualan & Resep"
  },
  {
    key: "sales:void",
    label: "Batalkan Transaksi (Void)",
    description: "Membatalkan nota yang sudah lunas (risiko manipulasi kas)",
    category: "SALES",
    categoryLabel: "Penjualan & Resep",
    isHighRisk: true
  },
  {
    key: "prescription:read",
    label: "Lihat Antrean Resep",
    description: "Melihat foto lembar resep dan antrean peracikan",
    category: "SALES",
    categoryLabel: "Penjualan & Resep"
  },
  {
    key: "prescription:create",
    label: "Input Resep Baru",
    description: "Mendaftarkan resep baru dari dokter",
    category: "SALES",
    categoryLabel: "Penjualan & Resep"
  },
  {
    key: "prescription:verify",
    label: "Skrining Klinis Apoteker",
    description: "Validasi keabsahan resep & dosis obat keras",
    category: "SALES",
    categoryLabel: "Penjualan & Resep"
  },
  {
    key: "prescription:compound",
    label: "Racik Obat (Compounding)",
    description: "Menghitung bahan baku racikan puyer/kapsul/salep",
    category: "SALES",
    categoryLabel: "Penjualan & Resep"
  },

  // Inventori & Stok
  {
    key: "inventory:read",
    label: "Katalog & Stok Depo",
    description: "Melihat daftar obat, sisa stok, dan rak",
    category: "INVENTORY",
    categoryLabel: "Inventori & Stok"
  },
  {
    key: "inventory:adjust",
    label: "Koreksi Stok Manual",
    description: "Mengubah angka stok fisik obat (risiko kehilangan stok)",
    category: "INVENTORY",
    categoryLabel: "Inventori & Stok",
    isHighRisk: true
  },
  {
    key: "inventory:opname",
    label: "Sesi Stok Opname",
    description: "Menjalankan audit stok opname periodik",
    category: "INVENTORY",
    categoryLabel: "Inventori & Stok"
  },
  {
    key: "inventory:transfer",
    label: "Mutasi Antar Cabang",
    description: "Kirim atau terima mutasi transfer antar-cabang",
    category: "INVENTORY",
    categoryLabel: "Inventori & Stok"
  },
  {
    key: "inventory:fefo",
    label: "Alokasi Batch FEFO",
    description: "Rekomendasi alokasi batch terdekat kadaluwarsa",
    category: "INVENTORY",
    categoryLabel: "Inventori & Stok"
  },

  // Pengadaan & Pembelian
  {
    key: "purchase:read",
    label: "Daftar Pembelian PBF",
    description: "Melihat riwayat faktur masuk dan PO pembelian",
    category: "PURCHASE",
    categoryLabel: "Pengadaan & PBF"
  },
  {
    key: "purchase:order:create",
    label: "Terbitkan Surat Pesanan (SP)",
    description: "Membuat Surat Pesanan resmi apotek ke distributor",
    category: "PURCHASE",
    categoryLabel: "Pengadaan & PBF"
  },
  {
    key: "purchase:invoice:receive",
    label: "Terima Faktur & Barang",
    description: "Input batch & ED obat dari faktur datang",
    category: "PURCHASE",
    categoryLabel: "Pengadaan & PBF"
  },
  {
    key: "supplier:manage",
    label: "Kelola Master PBF",
    description: "Tambah/edit data distributor rekanan apotek",
    category: "PURCHASE",
    categoryLabel: "Pengadaan & PBF"
  },

  // Retur
  {
    key: "returns:read",
    label: "Daftar Histori Retur",
    description: "Melihat riwayat retur pembeli dan supplier",
    category: "RETURNS",
    categoryLabel: "Retur Barang"
  },
  {
    key: "returns:customer:process",
    label: "Proses Retur Pembeli",
    description: "Menerima barang kembali dari pasien",
    category: "RETURNS",
    categoryLabel: "Retur Barang"
  },
  {
    key: "returns:supplier:process",
    label: "Proses Retur ke PBF",
    description: "Mengembalikan obat rusak/ED ke distributor",
    category: "RETURNS",
    categoryLabel: "Retur Barang"
  },

  // Pelanggan
  {
    key: "customer:read",
    label: "Buku Pelanggan & Pasien",
    description: "Melihat data member, kontak, dan riwayat",
    category: "CUSTOMER",
    categoryLabel: "Pelanggan & Piutang"
  },
  {
    key: "customer:manage",
    label: "Kelola Data Pelanggan",
    description: "Tambah/edit data member dan batas piutang",
    category: "CUSTOMER",
    categoryLabel: "Pelanggan & Piutang"
  },

  // Keuangan & Kas
  {
    key: "finance:read",
    label: "Buku Kas & Tagihan",
    description: "Melihat saldo kas, rekening, dan tagihan jatuh tempo",
    category: "FINANCE",
    categoryLabel: "Keuangan & Kas",
    isHighRisk: true
  },
  {
    key: "finance:debt:pay",
    label: "Bayar Hutang Faktur PBF",
    description: "Mencatat pengeluaran uang bayar faktur obat",
    category: "FINANCE",
    categoryLabel: "Keuangan & Kas",
    isHighRisk: true
  },
  {
    key: "finance:cashflow:manage",
    label: "Beban Operasional Kas",
    description: "Catat pengeluaran listrik, gaji, dan biaya toko",
    category: "FINANCE",
    categoryLabel: "Keuangan & Kas",
    isHighRisk: true
  },
  {
    key: "finance:receivable:collect",
    label: "Terima Setoran Piutang",
    description: "Catat penerimaan piutang dari pelanggan/instansi",
    category: "FINANCE",
    categoryLabel: "Keuangan & Kas"
  },

  // Laporan & Regulasi
  {
    key: "reports:view",
    label: "Menu Laporan Analitik",
    description: "Melihat halaman laporan dan statistik umum",
    category: "REPORTS",
    categoryLabel: "Laporan & Regulasi"
  },
  {
    key: "reports:sales:view",
    label: "Laporan Omset Penjualan",
    description: "Rekap penjualan per kasir, shift, dan produk pareto",
    category: "REPORTS",
    categoryLabel: "Laporan & Regulasi"
  },
  {
    key: "reports:inventory:view",
    label: "Laporan Nilai Persediaan",
    description: "Evaluasi nilai total aset obat dan HPP gudang",
    category: "REPORTS",
    categoryLabel: "Laporan & Regulasi"
  },
  {
    key: "reports:financial:view",
    label: "Laba Rugi & Finansial",
    description: "Melihat buku laporan laba bersih privat Owner",
    category: "REPORTS",
    categoryLabel: "Laporan & Regulasi",
    isHighRisk: true
  },
  {
    key: "reports:sipnap:export",
    label: "Ekspor SIPNAP Kemenkes",
    description: "Download laporan Narkotika & Psikotropika resmi",
    category: "REPORTS",
    categoryLabel: "Laporan & Regulasi"
  },

  // Pengaturan
  {
    key: "settings:view",
    label: "Lihat Pengaturan Apotek",
    description: "Membuka halaman konfigurasi sistem",
    category: "SETTINGS",
    categoryLabel: "Pengaturan Sistem"
  },
  {
    key: "settings:tenant:edit",
    label: "Edit Profil & Legal Apotek",
    description: "Ubah logo, SIA, SIPA, alamat, dan nomor rekening (Hak Prerogatif Owner)",
    category: "SETTINGS",
    categoryLabel: "Pengaturan Sistem",
    isHighRisk: true,
    nonDelegable: true
  },
  {
    key: "settings:users:manage",
    label: "Kelola Pegawai & Hak Akses",
    description: "Wewenang mutlak Owner & Superadmin (Tidak dapat didelegasikan ke staf)",
    category: "SETTINGS",
    categoryLabel: "Pengaturan Sistem",
    isHighRisk: true,
    nonDelegable: true
  },
  {
    key: "settings:devices:manage",
    label: "Konfigurasi Printer POS",
    description: "Atur printer thermal ESC/POS dan trigger laci uang",
    category: "SETTINGS",
    categoryLabel: "Pengaturan Sistem"
  }
];

