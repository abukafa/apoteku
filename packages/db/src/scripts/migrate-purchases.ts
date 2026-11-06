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

async function runPurchaseMigration() {
  console.log("==================================================================");
  console.log("📦 [APOTEKU ETL] MIGRATING PURCHASE INVOICES (FAKTUR PEMBELIAN PBF)");
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

  const supplierMap = new Map<string, string>();
  const branchMap = new Map<string, string>();
  const locationMap = new Map<string, string>();
  const productMap = new Map<string, string>();

  for (const c of crosswalks) {
    if (c.sourceTable === "SUPPLIER") supplierMap.set(c.legacyKey, c.entityId);
    else if (c.sourceTable === "CABANG") branchMap.set(c.legacyKey, c.entityId);
    else if (c.sourceTable === "LOKASI") locationMap.set(c.legacyKey, c.entityId);
    else if (c.sourceTable === "BARANG") productMap.set(c.legacyKey, c.entityId);
  }

  const defaultBranchId = Array.from(branchMap.values())[0];
  const defaultLocationId = Array.from(locationMap.values())[0];
  const defaultSupplierId = Array.from(supplierMap.values())[0];

  console.log(`  Lookups ready: ${supplierMap.size} suppliers, ${branchMap.size} branches, ${locationMap.size} locations, ${productMap.size} products.`);

  // 3. Load Invoices and Items
  console.log("\nCleaning any existing purchase migration data for clean rerun...");
  await queryClient`DELETE FROM purchase_invoice_items WHERE invoice_id IN (SELECT id FROM purchase_invoices WHERE tenant_id = ${tenantId});`;
  await queryClient`DELETE FROM purchase_invoices WHERE tenant_id = ${tenantId};`;
  await queryClient`DELETE FROM legacy_id_map WHERE tenant_id = ${tenantId} AND source_table = 'PEMBELIAN';`;

  console.log("\nReading PEMBELIAN.csv & DETAILPEMBELIAN.csv...");
  const purchaseRows = parseCsv<any>("PEMBELIAN.csv");
  const itemRows = parseCsv<any>("DETAILPEMBELIAN.csv");
  console.log(`  Found ${purchaseRows.length} purchase invoices and ${itemRows.length} detail line items.`);

  // Group items by ID_PEMBELIAN
  const itemsByPurchaseId = new Map<string, any[]>();
  for (const item of itemRows) {
    if (!item.ID_PEMBELIAN) continue;
    const pid = String(item.ID_PEMBELIAN).trim();
    if (!itemsByPurchaseId.has(pid)) {
      itemsByPurchaseId.set(pid, []);
    }
    itemsByPurchaseId.get(pid)!.push(item);
  }

  // 4. Batch Insertion
  console.log("\nInserting purchase invoices and line items into PostgreSQL...");
  let invoiceCount = 0;
  let itemCount = 0;

  const INVOICE_BATCH = 200;
  for (let i = 0; i < purchaseRows.length; i += INVOICE_BATCH) {
    const chunk = purchaseRows.slice(i, i + INVOICE_BATCH);

    const invoiceInserts: any[] = [];
    const itemInserts: any[] = [];
    const crosswalkInserts: any[] = [];

    for (const p of chunk) {
      if (!p.ID_PEMBELIAN) continue;
      const legacyId = String(p.ID_PEMBELIAN).trim();
      const invoiceId = randomUUID();

      const branchId = branchMap.get(String(p.ID_CABANG).trim()) || defaultBranchId;
      const supplierId = supplierMap.get(String(p.ID_SUPPLIER).trim()) || defaultSupplierId;

      const rawInvoiceNum = (p.NOMOR_BUKTI || p.NOMORREF || `PB-${legacyId}`).trim();
      const invoiceNumber = rawInvoiceNum || `PB-${legacyId}`;
      const recDate = p.TANGGAL ? p.TANGGAL.split(" ")[0] : "2022-01-01";
      const dueDate = p.TANGGAL_TEMPO ? p.TANGGAL_TEMPO.split(" ")[0] : recDate;

      invoiceInserts.push({
        id: invoiceId,
        tenantId,
        branchId,
        supplierId,
        legacyIdPembelian: parseInt(legacyId, 10),
        invoiceNumber,
        receiveDate: recDate,
        invoiceDate: recDate,
        dueDate: dueDate,
        isCredit: p.IS_KREDIT === "Y",
        subtotal: String(parseFloat(p.C_JUMLAH1 || "0")),
        discountAmount: String(parseFloat(p.DISC_TOTAL || "0")),
        taxAmount: String(parseFloat(p.C_JUMLAHPAJAK || "0")),
        grandTotal: String(parseFloat(p.C_JUMLAH2 || p.C_JUMLAH1 || "0")),
        paidAmount: String(parseFloat(p.BAYAR || "0")),
        isPaidOff: p.LUNAS === "Y",
        createdAt: p.TANGGAL ? new Date(p.TANGGAL) : new Date()
      });

      crosswalkInserts.push({
        tenantId,
        sourceDatabase: "GAMPANGAPOTEKZ.FDB",
        sourceTable: "PEMBELIAN",
        legacyKey: legacyId,
        entityType: "purchase_invoice",
        entityId: invoiceId
      });

      // Prepare items for this invoice
      const detailItems = itemsByPurchaseId.get(legacyId) || [];
      let lineNo = 1;

      for (const it of detailItems) {
        const prodUuid = productMap.get(String(it.ID_BARANG).trim());
        if (!prodUuid) continue; // Skip unmapped items

        const locUuid = locationMap.get(String(it.ID_LOKASI).trim()) || defaultLocationId;
        const qty = parseFloat(it.QTY || "1");
        const factor = parseFloat(it.ISI || "1");
        const price = parseFloat(it.HARGABELI || "0");
        const disc = parseFloat(it.DISC || "0");
        const subtotal = parseFloat(it.C_JUMLAH1 || String(qty * price));

        itemInserts.push({
          id: randomUUID(),
          invoiceId,
          productId: prodUuid,
          locationId: locUuid,
          batchId: null,
          lineNo: lineNo++,
          unitName: it.SATUAN_PEMBELIAN || "PCS",
          conversionFactor: String(factor),
          qty: String(qty),
          qtyBase: String(qty * factor),
          buyPrice: String(price),
          discountPercent: String(disc),
          discountAmount: "0",
          subtotal: String(subtotal)
        });
      }
    }

    // Insert invoices
    if (invoiceInserts.length > 0) {
      await db.insert(schema.purchaseInvoices).values(invoiceInserts).onConflictDoNothing();
      invoiceCount += invoiceInserts.length;
    }

    // Insert items in smaller chunks of 500
    if (itemInserts.length > 0) {
      const ITEM_CHUNK = 500;
      for (let j = 0; j < itemInserts.length; j += ITEM_CHUNK) {
        const sub = itemInserts.slice(j, j + ITEM_CHUNK);
        await db.insert(schema.purchaseInvoiceItems).values(sub).onConflictDoNothing();
      }
      itemCount += itemInserts.length;
    }

    // Insert crosswalk
    if (crosswalkInserts.length > 0) {
      await db.insert(schema.legacyIdMap).values(crosswalkInserts).onConflictDoNothing();
    }

    if ((i + INVOICE_BATCH) % 1000 === 0 || i + INVOICE_BATCH >= purchaseRows.length) {
      console.log(`  Processed ${Math.min(i + INVOICE_BATCH, purchaseRows.length)} / ${purchaseRows.length} invoices...`);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n==================================================================");
  console.log(`✅ [APOTEKU ETL] PURCHASE MIGRATION FINISHED IN ${durationSec}s`);
  console.log(`   - Invoices Imported : ${invoiceCount}`);
  console.log(`   - Line Items        : ${itemCount}`);
  console.log("==================================================================");
  process.exit(0);
}

runPurchaseMigration().catch((err) => {
  console.error("Purchase migration failed:", err);
  process.exit(1);
});
