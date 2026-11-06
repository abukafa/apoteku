import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { db, schema, queryClient } from "../index.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const LEGACY_DIR = join(process.cwd(), "legacy_database");

function parseCsv<T>(filename: string): T[] {
  const filePath = join(LEGACY_DIR, filename);
  if (!existsSync(filePath)) {
    console.warn(`[WARN] File not found: ${filePath}`);
    return [];
  }
  const content = readFileSync(filePath, "utf-8");
  const parsed = Papa.parse<T>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  });
  return parsed.data;
}

function mapPaymentMethod(code: string | undefined): string {
  switch (String(code).trim()) {
    case "1":
      return "CASH";
    case "2":
      return "DEBIT";
    case "3":
      return "CREDIT";
    case "6":
      return "TRANSFER";
    case "7":
      return "QRIS";
    default:
      return "CASH";
  }
}

async function runSalesMigration() {
  console.log("==================================================================");
  console.log("💳 [APOTEKU ETL] MIGRATING SALES TRANSACTIONS (POS KASIR HISTORIS)");
  console.log("==================================================================");
  const startTime = Date.now();

  // 1. Fetch Tenant
  const [tenant] = await db.select().from(schema.tenants).limit(1);
  if (!tenant) {
    console.error("Tenant not found! Run migrate:master first.");
    process.exit(1);
  }
  const tenantId = tenant.id;

  // 2. Build Fast Crosswalk Lookups from legacy_id_map
  console.log("Loading crosswalk maps from legacy_id_map...");
  const crosswalks = await db
    .select({
      sourceTable: schema.legacyIdMap.sourceTable,
      legacyKey: schema.legacyIdMap.legacyKey,
      entityId: schema.legacyIdMap.entityId
    })
    .from(schema.legacyIdMap)
    .where(eq(schema.legacyIdMap.tenantId, tenantId));

  const branchMap = new Map<string, string>();
  const locationMap = new Map<string, string>();
  const customerMap = new Map<string, string>();
  const productMap = new Map<string, string>();

  for (const c of crosswalks) {
    if (c.sourceTable === "CABANG") branchMap.set(c.legacyKey, c.entityId);
    else if (c.sourceTable === "LOKASI") locationMap.set(c.legacyKey, c.entityId);
    else if (c.sourceTable === "PELANGGAN") customerMap.set(c.legacyKey, c.entityId);
    else if (c.sourceTable === "BARANG") productMap.set(c.legacyKey, c.entityId);
  }

  const defaultBranchId = Array.from(branchMap.values())[0];
  const defaultLocationId = Array.from(locationMap.values())[0];

  // 3. Load Unit & Conversion Factor Metadata from BARANG.csv
  console.log("Loading unit & conversion metadata from BARANG.csv...");
  const barangRows = parseCsv<any>("BARANG.csv");
  const unitInfoMap = new Map<string, { unitName: string; factor: string }>();
  for (const b of barangRows) {
    if (!b.ID_BARANG) continue;
    const key = String(b.ID_BARANG).trim();
    const unitName = (b.SATUAN || "PCS").trim().toUpperCase();
    const factor = String(parseFloat(b.FAKTOR_SATUAN || b.ISI || "1") || 1);
    unitInfoMap.set(key, { unitName, factor });
  }

  console.log(
    `  Lookups ready: ${branchMap.size} branches, ${locationMap.size} locations, ` +
      `${customerMap.size} customers, ${productMap.size} products, ${unitInfoMap.size} unit specs.`
  );

  // 4. Clean previous sales data for clean slate rerun
  console.log("\nCleaning any existing sales migration data for clean rerun...");
  await queryClient`DELETE FROM sales_transaction_items WHERE transaction_id IN (SELECT id FROM sales_transactions WHERE tenant_id = ${tenantId});`;
  await queryClient`DELETE FROM sales_transactions WHERE tenant_id = ${tenantId};`;

  // 5. Load Detail Items and Group by ID_PENJUALAN
  console.log("\nReading DETAILPENJUALAN.csv (335,760 rows)...");
  const detailStart = Date.now();
  const itemRows = parseCsv<any>("DETAILPENJUALAN.csv");
  console.log(`  Loaded ${itemRows.length} item rows in ${((Date.now() - detailStart) / 1000).toFixed(1)}s.`);

  console.log("Grouping detail line items by ID_PENJUALAN...");
  const itemsBySaleId = new Map<string, any[]>();
  for (const item of itemRows) {
    if (!item.ID_PENJUALAN) continue;
    const pid = String(item.ID_PENJUALAN).trim();
    let arr = itemsBySaleId.get(pid);
    if (!arr) {
      arr = [];
      itemsBySaleId.set(pid, arr);
    }
    arr.push(item);
  }
  console.log(`  Grouped into ${itemsBySaleId.size} unique transaction item buckets.`);

  // 6. Read PENJUALAN.csv
  console.log("\nReading PENJUALAN.csv (125,402 rows)...");
  const salesRows = parseCsv<any>("PENJUALAN.csv");
  console.log(`  Loaded ${salesRows.length} sales transaction headers.`);

  // 7. Stream Batch Insertion
  console.log("\nInserting sales transactions and line items into PostgreSQL in batches of 1,000...");
  let transactionCount = 0;
  let itemCount = 0;

  const BATCH_SIZE = 1000;
  const ITEM_CHUNK_SIZE = 500;

  for (let i = 0; i < salesRows.length; i += BATCH_SIZE) {
    const chunk = salesRows.slice(i, i + BATCH_SIZE);

    const transactionInserts: any[] = [];
    const itemInserts: any[] = [];

    for (const p of chunk) {
      if (!p.ID_PENJUALAN) continue;
      const legacyId = String(p.ID_PENJUALAN).trim();
      const transactionId = randomUUID();

      const branchId = branchMap.get(String(p.ID_CABANG).trim()) || defaultBranchId;
      const customerId = p.ID_PELANGGAN ? customerMap.get(String(p.ID_PELANGGAN).trim()) || null : null;
      const customerType = customerId ? "MEMBER" : "UMUM";

      const rawInvoiceNo = (p.NOMORREF || "").trim();
      const invoiceNo = rawInvoiceNo || `RJJ-${legacyId}`;

      const recDate = p.TANGGAL ? new Date(p.TANGGAL) : new Date();
      const grandTotalNum = parseFloat(p.C_JUMLAH2 || p.C_JUMLAH1 || "0");
      const paidAmountNum = parseFloat(p.BAYAR || p.INPUT_BAYAR || p.C_JUMLAH2 || "0");
      const changeAmountNum = Math.max(0, paidAmountNum - grandTotalNum);

      transactionInserts.push({
        id: transactionId,
        tenantId,
        branchId,
        legacyIdPenjualan: parseInt(legacyId, 10),
        cashierShiftId: null,
        cashierUserId: null,
        invoiceNo,
        customerId,
        customerType,
        patientName: null,
        doctorName: null,
        prescriptionImageUrl: null,
        paymentMethod: mapPaymentMethod(p.CARA_BAYAR),
        subtotal: String(parseFloat(p.C_JUMLAH1 || "0")),
        discountPercent: "0",
        discountAmount: String(parseFloat(p.DISC_TOTAL || "0")),
        taxPercent: "0",
        taxAmount: String(parseFloat(p.C_JUMLAHPAJAK || "0")),
        tuslahAmount: String(parseFloat(p.JUMLAH_R || "0")),
        embalaseAmount: String(parseFloat(p.JUMLAH_EMBALASE || "0")),
        grandTotal: String(grandTotalNum),
        paidAmount: String(paidAmountNum),
        changeAmount: String(changeAmountNum),
        createdAt: recDate,
        syncedAt: recDate
      });

      // Prepare items for this transaction
      const detailItems = itemsBySaleId.get(legacyId) || [];
      let lineNo = 1;

      for (const it of detailItems) {
        const legacyBarang = String(it.ID_BARANG).trim();
        const prodUuid = productMap.get(legacyBarang);
        if (!prodUuid) continue;

        const locUuid = locationMap.get(String(it.ID_LOKASI).trim()) || defaultLocationId;
        const unitSpec = unitInfoMap.get(legacyBarang) || { unitName: "PCS", factor: "1" };
        const factor = parseFloat(unitSpec.factor) || 1;

        const qty = parseFloat(it.QTY || "1");
        const price = parseFloat(it.HARGAJUAL || "0");
        const disc = parseFloat(it.DISC || "0");
        const subtotal = parseFloat(it.C_JUMLAH1 || String(qty * price));

        itemInserts.push({
          id: randomUUID(),
          transactionId,
          productId: prodUuid,
          lineNo: lineNo++,
          locationId: locUuid,
          batchId: null,
          unitName: unitSpec.unitName,
          conversionFactor: String(factor),
          qty: String(qty),
          qtyBase: String(qty * factor),
          unitPrice: String(price),
          discountPercent: String(disc),
          discountAmount: "0",
          subtotal: String(subtotal),
          dosageRules: null
        });
      }
    }

    // Insert sales transaction headers
    if (transactionInserts.length > 0) {
      await db.insert(schema.salesTransactions).values(transactionInserts);
      transactionCount += transactionInserts.length;
    }

    // Insert items in chunks
    if (itemInserts.length > 0) {
      for (let j = 0; j < itemInserts.length; j += ITEM_CHUNK_SIZE) {
        const sub = itemInserts.slice(j, j + ITEM_CHUNK_SIZE);
        await db.insert(schema.salesTransactionItems).values(sub);
      }
      itemCount += itemInserts.length;
    }

    if ((i + BATCH_SIZE) % 10000 === 0 || i + BATCH_SIZE >= salesRows.length) {
      const currentSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const percent = Math.min(100, Math.round(((i + BATCH_SIZE) / salesRows.length) * 100));
      console.log(
        `  Processed ${Math.min(i + BATCH_SIZE, salesRows.length)} / ${salesRows.length} transactions (${percent}%) - ` +
          `${itemCount} items inserted [${currentSec}s]`
      );
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n==================================================================");
  console.log(`✅ [APOTEKU ETL] SALES MIGRATION FINISHED IN ${durationSec}s`);
  console.log(`   - Transactions Imported : ${transactionCount}`);
  console.log(`   - Line Items Imported   : ${itemCount}`);
  console.log("==================================================================");
  await queryClient.end();
  process.exit(0);
}

runSalesMigration().catch(async (err) => {
  console.error("Sales migration failed:", err);
  await queryClient.end();
  process.exit(1);
});
