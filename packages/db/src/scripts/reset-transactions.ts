import { queryClient, db } from "../client.js";
import { sql } from "drizzle-orm";
import * as schema from "../schema/index.js";

async function main() {
  console.log("==================================================================");
  console.log("🧹 [Apoteku] SCRIPT PENGOSONGAN DATA TRANSAKSI & RESET DATA TESTING");
  console.log("==================================================================\n");

  // 1. Ambil daftar tabel di database publik
  const physicalTables = await queryClient`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  const tableList = physicalTables.map((t: any) => t.table_name);
  console.log(`📋 Ditemukan ${tableList.length} tabel di database public.\n`);

  // Tabel Master yang WAJIB dipertahankan (JANGAN DI-TRUNCATE!)
  const masterTables = new Set([
    "tenants",
    "branches",
    "inventory_locations",
    "users",
    "suppliers",
    "products",
    "product_units",
    "customers",
    "doctors",
    "legacy_id_map",
    "__drizzle_migrations"
  ]);

  // Tabel Transaksional, Inventori, Mutasi, dan Pelayanan yang HARUS dikosongkan
  const transactionTables = [
    // 1. Resep & Pelayanan Klinis
    "prescription_counselings",
    "prescription_profiles",
    "sales_compound_items",
    "sales_compounds",

    // 2. Transaksi Kasir & Penjualan
    "sales_transaction_items",
    "customer_returns",
    "sales_transactions",
    "cashier_shifts",

    // 3. Pengadaan & Pembelian PBF
    "debt_payments",
    "purchase_invoice_items",
    "purchase_invoices",
    "purchase_order_items",
    "purchase_orders",

    // 4. Konsinyasi
    "consignment_settlement_items",
    "consignment_settlements",
    "consignment_receipt_items",
    "consignment_receipts",

    // 5. Mutasi, Retur PBF, Opname & Kas
    "supplier_returns",
    "cash_mutations",
    "stock_transfer_items",
    "stock_transfers",
    "stock_adjustment_items",
    "stock_adjustments",

    // 6. Inventori & Audit Trail Mutasi Stok
    "stock_ledger",
    "branch_batch_stocks",
    "branch_stocks",
    "product_batches",

    // 7. Notifikasi
    "notification_reads",
    "notifications"
  ];

  // Filter hanya tabel yang benar-benar ada di database fisik
  const tablesToTruncate = transactionTables.filter((tbl) => tableList.includes(tbl));

  console.log("📊 STATUS SEBELUM RESET:");
  console.log("------------------------------------------------------------------");
  console.log("MASTER DATA (Akan dipertahankan):");
  for (const tbl of masterTables) {
    if (tableList.includes(tbl)) {
      const [{ count }] = await queryClient.unsafe(`SELECT count(*)::int as count FROM "${tbl}"`);
      console.log(`  ✓ ${tbl.padEnd(25)}: ${count.toLocaleString("id-ID")} baris`);
    }
  }

  console.log("\nTRANSACTION DATA (Akan dikosongkan):");
  for (const tbl of tablesToTruncate) {
    const [{ count }] = await queryClient.unsafe(`SELECT count(*)::int as count FROM "${tbl}"`);
    console.log(`  ✗ ${tbl.padEnd(30)}: ${count.toLocaleString("id-ID")} baris`);
  }

  console.log("\n🚀 Mengeksekusi TRUNCATE CASCADE...");

  // Eksekusi TRUNCATE semua tabel transaksi sekaligus dengan CASCADE
  const truncateSql = `TRUNCATE TABLE ${tablesToTruncate.map((t) => `"${t}"`).join(", ")} CASCADE;`;
  await queryClient.unsafe(truncateSql);
  console.log("✅ Berhasil mengosongkan seluruh tabel transaksi & stok.");

  // Reset saldo poin pelanggan kembali ke 0
  if (tableList.includes("customers")) {
    await queryClient.unsafe(`UPDATE "customers" SET "point_balance" = 0;`);
    console.log("✅ Reset point_balance seluruh pelanggan ke 0.");
  }

  // Bersihkan mapping legacy untuk purchase_invoice bila ada
  if (tableList.includes("legacy_id_map")) {
    const deletedLegacy = await queryClient.unsafe(
      `DELETE FROM "legacy_id_map" WHERE "entity_type" IN ('purchase_invoice', 'sale', 'purchase_order');`
    );
    console.log(`✅ Dibersihkan entri legacy_id_map transaksional.`);
  }

  console.log("\n==================================================================");
  console.log("🎉 VERIFIKASI HASIL AKHIR (DATABASE SIAP UNTUK TESTING / DEMO):");
  console.log("==================================================================");

  console.log("\nDATA MASTER:");
  for (const tbl of masterTables) {
    if (tableList.includes(tbl)) {
      const [{ count }] = await queryClient.unsafe(`SELECT count(*)::int as count FROM "${tbl}"`);
      console.log(`  ✓ ${tbl.padEnd(25)}: ${count.toLocaleString("id-ID")} baris`);
    }
  }

  console.log("\nDATA TRANSAKSI & STOK:");
  let totalTrxRemaining = 0;
  for (const tbl of tablesToTruncate) {
    const [{ count }] = await queryClient.unsafe(`SELECT count(*)::int as count FROM "${tbl}"`);
    totalTrxRemaining += count;
    console.log(`  - ${tbl.padEnd(30)}: ${count} baris`);
  }

  if (totalTrxRemaining === 0) {
    console.log("\n✨ SEMPURNA: Semua data transaksi, stok batch, kartu stok, kas, dan shift BERSIH 100%!");
  } else {
    console.warn(`\n⚠️ Perhatian: Masih ada ${totalTrxRemaining} baris yang tersisa.`);
  }

  await queryClient.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("❌ Terjadi kesalahan saat reset database:", err);
  await queryClient.end();
  process.exit(1);
});
