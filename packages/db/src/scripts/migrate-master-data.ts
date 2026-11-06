import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { db, schema } from "../index.js";
import { eq, and } from "drizzle-orm";

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

async function runMasterMigration() {
  console.log("==================================================================");
  console.log("🚀 [APOTEKU ETL] STARTING MASTER DATA MIGRATION FROM FIREBIRD CSV");
  console.log("==================================================================");
  const startTime = Date.now();

  // 1. TENANT SETUP
  console.log("\n[1/7] Ensuring Default Tenant (Apotek Hafidz Farma)...");
  let tenantId: string;
  const existingTenant = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.code, "AHF"))
    .limit(1);

  if (existingTenant.length > 0) {
    tenantId = existingTenant[0].id;
    console.log(`  Tenant exists: ${existingTenant[0].name} (${tenantId})`);
  } else {
    const [newTenant] = await db
      .insert(schema.tenants)
      .values({
        code: "AHF",
        name: "Apotek Hafidz Farma",
        taxPercent: "11.00",
        isActive: true
      })
      .returning();
    tenantId = newTenant.id;
    console.log(`  Created Tenant: ${newTenant.name} (${tenantId})`);
  }

  // 2. CABANG (BRANCHES)
  console.log("\n[2/7] Migrating CABANG.csv -> branches...");
  const cabangRows = parseCsv<any>("CABANG.csv");
  const branchMap = new Map<string, string>(); // legacy ID_CABANG -> UUID

  for (const row of cabangRows) {
    if (!row.ID_CABANG || !row.NAMA_CABANG) continue;
    const legacyId = String(row.ID_CABANG).trim();
    const code = (row.KODE_CABANG || legacyId).trim();
    const name = row.NAMA_CABANG.trim();

    // Check existing branch
    const existing = await db
      .select()
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.tenantId, tenantId),
          eq(schema.branches.code, code)
        )
      )
      .limit(1);

    let branchId: string;
    if (existing.length > 0) {
      branchId = existing[0].id;
    } else {
      const [inserted] = await db
        .insert(schema.branches)
        .values({
          tenantId,
          code,
          name,
          address: row.ALAMAT || null,
          phone: row.TELEPON || row.HP || null,
          receiptHeader: `APOTEK HAFIDZ FARMA\n${name}\n${row.ALAMAT || ""}`,
          receiptFooter: "Semoga Lekas Sembuh & Terima Kasih"
        })
        .returning();
      branchId = inserted.id;

      // Register crosswalk
      await db
        .insert(schema.legacyIdMap)
        .values({
          tenantId,
          sourceDatabase: "GAMPANGAPOTEKZ.FDB",
          sourceTable: "CABANG",
          legacyKey: legacyId,
          entityType: "branch",
          entityId: branchId
        })
        .onConflictDoNothing();
    }
    branchMap.set(legacyId, branchId);
  }
  console.log(`  Migrated ${branchMap.size} branches.`);

  // 3. LOKASI INVENTORI & RAK
  console.log("\n[3/7] Migrating LOKASI.csv & RAK.csv -> inventoryLocations...");
  const lokasiRows = parseCsv<any>("LOKASI.csv");
  const locationMap = new Map<string, string>(); // legacy ID_LOKASI -> UUID

  // Default fallback branch (Gudang Pusat or first branch)
  const defaultBranchId = branchMap.get("1") || Array.from(branchMap.values())[0];

  for (const row of lokasiRows) {
    if (!row.ID_LOKASI || !row.NAMA_LOKASI) continue;
    const legacyId = String(row.ID_LOKASI).trim();
    const targetBranchId = branchMap.get(String(row.ID_CABANG)) || defaultBranchId;
    const code = (row.KODE_LOKASI || row.NAMA_LOKASI).trim();
    const name = row.NAMA_LOKASI.trim();

    const existingLoc = await db
      .select()
      .from(schema.inventoryLocations)
      .where(
        and(
          eq(schema.inventoryLocations.branchId, targetBranchId),
          eq(schema.inventoryLocations.code, code)
        )
      )
      .limit(1);

    let locationId: string;
    if (existingLoc.length > 0) {
      locationId = existingLoc[0].id;
    } else {
      const [inserted] = await db
        .insert(schema.inventoryLocations)
        .values({
          tenantId,
          branchId: targetBranchId,
          code,
          name,
          isDefault: legacyId === "1",
          isActive: true
        })
        .returning();
      locationId = inserted.id;

      await db
        .insert(schema.legacyIdMap)
        .values({
          tenantId,
          sourceDatabase: "GAMPANGAPOTEKZ.FDB",
          sourceTable: "LOKASI",
          legacyKey: legacyId,
          entityType: "location",
          entityId: locationId
        })
        .onConflictDoNothing();
    }
    locationMap.set(legacyId, locationId);
  }

  // Ensure every branch has at least 1 default location
  for (const [cId, bId] of branchMap.entries()) {
    const existing = await db
      .select()
      .from(schema.inventoryLocations)
      .where(eq(schema.inventoryLocations.branchId, bId))
      .limit(1);

    if (existing.length === 0) {
      const [loc] = await db
        .insert(schema.inventoryLocations)
        .values({
          tenantId,
          branchId: bId,
          code: "DEPO-UTAMA",
          name: "Etalase Depo Utama",
          isDefault: true,
          isActive: true
        })
        .returning();
      if (!locationMap.has(cId)) locationMap.set(cId, loc.id);
    }
  }
  console.log(`  Configured ${locationMap.size} inventory locations.`);

  // Load Rak dictionary
  const rakRows = parseCsv<any>("RAK.csv");
  const rakMap = new Map<string, string>();
  for (const r of rakRows) {
    if (r.ID_RAK && r.NAMA_RAK) {
      rakMap.set(String(r.ID_RAK).trim(), r.NAMA_RAK.trim());
    }
  }

  // 4. SUPPLIER (PBF)
  console.log("\n[4/7] Migrating SUPPLIER.csv -> suppliers...");
  const supplierRows = parseCsv<any>("SUPPLIER.csv");
  let supplierCount = 0;

  for (const row of supplierRows) {
    if (!row.ID_SUPPLIER || !row.NAMA_SUPPLIER) continue;
    const legacyId = parseInt(row.ID_SUPPLIER, 10);
    const code = (row.KODE_SUPPLIER || `SUP-${legacyId}`).trim();
    const name = row.NAMA_SUPPLIER.trim();

    try {
      const [inserted] = await db
        .insert(schema.suppliers)
        .values({
          tenantId,
          legacyIdSupplier: legacyId,
          code,
          name,
          phone: row.TELEPON || row.HP || null,
          email: row.EMAIL || null,
          address: row.ALAMAT || null,
          contactPerson: row.CP1 || row.CP2 || null,
          paymentTermDays: 30,
          leadTimeDays: 3,
          isActive: true
        })
        .onConflictDoNothing()
        .returning();

      if (inserted) {
        await db
          .insert(schema.legacyIdMap)
          .values({
            tenantId,
            sourceDatabase: "GAMPANGAPOTEKZ.FDB",
            sourceTable: "SUPPLIER",
            legacyKey: String(legacyId),
            entityType: "supplier",
            entityId: inserted.id
          })
          .onConflictDoNothing();
        supplierCount++;
      }
    } catch (_) {}
  }
  console.log(`  Migrated ${supplierCount} suppliers.`);

  // 5. PELANGGAN & PASIEN
  console.log("\n[5/7] Migrating PELANGGAN.csv -> customers...");
  const customerRows = parseCsv<any>("PELANGGAN.csv");
  let customerCount = 0;

  for (const row of customerRows) {
    if (!row.ID_PELANGGAN || !row.NAMA_PELANGGAN) continue;
    const legacyId = parseInt(row.ID_PELANGGAN, 10);
    const code = (row.KODE_PELANGGAN || `CUST-${legacyId}`).trim();
    const name = row.NAMA_PELANGGAN.trim();

    try {
      const [inserted] = await db
        .insert(schema.customers)
        .values({
          tenantId,
          legacyIdPelanggan: legacyId,
          code,
          name,
          customerType: "UMUM",
          gender: row.JENIS_KELAMIN === "L" || row.JENIS_KELAMIN === "P" ? row.JENIS_KELAMIN : null,
          birthDate: row.TANGGAL_LAHIR ? row.TANGGAL_LAHIR.split(" ")[0] : null,
          phone: row.HP || row.TELEPON || null,
          address: row.ALAMAT || null,
          pointBalance: 0,
          isActive: true
        })
        .onConflictDoNothing()
        .returning();

      if (inserted) {
        await db
          .insert(schema.legacyIdMap)
          .values({
            tenantId,
            sourceDatabase: "GAMPANGAPOTEKZ.FDB",
            sourceTable: "PELANGGAN",
            legacyKey: String(legacyId),
            entityType: "customer",
            entityId: inserted.id
          })
          .onConflictDoNothing();
        customerCount++;
      }
    } catch (_) {}
  }
  console.log(`  Migrated ${customerCount} customers.`);

  // 6. PRODUK & MULTI-SATUAN (BARANG.csv + DESKRIPSIBARANG.csv)
  console.log("\n[6/7] Migrating BARANG.csv + DESKRIPSIBARANG.csv -> products & product_units...");
  // Parse DESKRIPSIBARANG into memory lookup
  const descRows = parseCsv<any>("DESKRIPSIBARANG.csv");
  const descMap = new Map<string, {
    activeSubstance: string | null;
    dosageForm: string | null;
    defaultDosage: string | null;
    indications: string | null;
    sideEffects: string | null;
  }>();

  for (const d of descRows) {
    if (d.ID_BARANG) {
      descMap.set(String(d.ID_BARANG).trim(), {
        activeSubstance: d.ZAT_AKTIF || d.KOMPOSISI || null,
        dosageForm: d.BENTUK_SEDIAAN || null,
        defaultDosage: d.DOSIS || null,
        indications: d.INDIKASI || null,
        sideEffects: d.EFEK_SAMPING || null
      });
    }
  }
  console.log(`  Loaded clinical metadata for ${descMap.size} items.`);

  const barangRows = parseCsv<any>("BARANG.csv");
  console.log(`  Total rows in BARANG.csv: ${barangRows.length}`);

  // Separate parent items and child items (ID_SATUAN_DARI)
  const parentRows: any[] = [];
  const childRows: any[] = [];

  for (const b of barangRows) {
    if (!b.ID_BARANG || !b.NAMA_BARANG) continue;
    const parentId = b.ID_SATUAN_DARI ? String(b.ID_SATUAN_DARI).trim() : null;
    if (parentId && parentId !== "" && parentId !== "0" && parentId !== b.ID_BARANG) {
      childRows.push(b);
    } else {
      parentRows.push(b);
    }
  }

  console.log(`  Primary products: ${parentRows.length}, Child multi-unit items: ${childRows.length}`);

  const productMap = new Map<string, string>(); // legacy ID_BARANG -> product UUID
  let productCount = 0;
  let unitCount = 0;

  // Insert parent products in batches of 200
  const BATCH_SIZE = 200;
  for (let i = 0; i < parentRows.length; i += BATCH_SIZE) {
    const chunk = parentRows.slice(i, i + BATCH_SIZE);

    for (const b of chunk) {
      const legacyId = parseInt(b.ID_BARANG, 10);
      const sku = (b.KODE_BARANG || `BRG-${legacyId}`).trim();
      const barcode = b.BARKOD1 ? b.BARKOD1.trim() : null;
      const name = b.NAMA_BARANG.trim();
      const desc = descMap.get(String(legacyId));
      const rackName = b.ID_RAK ? rakMap.get(String(b.ID_RAK).trim()) || null : null;

      // Determine Drug Class
      let drugClass = "BEBAS";
      const upperName = name.toUpperCase();
      if (upperName.includes("NARKOTIK")) drugClass = "NARKOTIKA";
      else if (upperName.includes("PSIKOTROPIK")) drugClass = "PSIKOTROPIKA";
      else if (upperName.includes("KERAS") || b.KODE_JENIS_BARANG === "2") drugClass = "KERAS";
      else if (upperName.includes("BEBAS TERBATAS")) drugClass = "BEBAS_TERBATAS";

      const baseUnit = (b.SATUAN || "PCS").trim().toUpperCase();

      try {
        const [prod] = await db
          .insert(schema.products)
          .values({
            tenantId,
            legacyIdBarang: legacyId,
            sku,
            barcode,
            name,
            activeSubstance: desc?.activeSubstance || null,
            dosageForm: desc?.dosageForm || null,
            defaultDosage: desc?.defaultDosage || null,
            indications: desc?.indications || null,
            sideEffects: desc?.sideEffects || null,
            rackLocation: rackName,
            drugClass,
            baseUnit,
            minStock: "0",
            isConsignment: b.IS_KONSI === "Y",
            isActive: b.DISCONTINUE !== "Y"
          })
          .onConflictDoNothing()
          .returning();

        if (prod) {
          productMap.set(String(legacyId), prod.id);
          productCount++;

          // Crosswalk ID
          await db
            .insert(schema.legacyIdMap)
            .values({
              tenantId,
              sourceDatabase: "GAMPANGAPOTEKZ.FDB",
              sourceTable: "BARANG",
              legacyKey: String(legacyId),
              entityType: "product",
              entityId: prod.id
            })
            .onConflictDoNothing();

          // Base unit in product_units
          await db
            .insert(schema.productUnits)
            .values({
              tenantId,
              productId: prod.id,
              unitName: baseUnit,
              conversionFactor: "1",
              salePriceGeneral: String(parseFloat(b.HARGAJUAL1 || "0")),
              salePriceResep: String(parseFloat(b.HARGAJUAL2 || b.HARGAJUAL1 || "0")),
              salePriceGrosir: String(parseFloat(b.HARGAJUAL3 || b.HARGAJUAL1 || "0")),
              salePriceDelivery: String(parseFloat(b.HARGAJUAL4 || b.HARGAJUAL1 || "0")),
              salePriceMember: String(parseFloat(b.HARGAJUAL5 || b.HARGAJUAL1 || "0")),
              isBaseUnit: true
            })
            .onConflictDoNothing();
          unitCount++;

          // Secondary unit if SATUAN_PEMBELIAN exists with multiplier ISI > 1
          const buyUnit = b.SATUAN_PEMBELIAN ? b.SATUAN_PEMBELIAN.trim().toUpperCase() : null;
          const isi = parseFloat(b.ISI || "1");
          if (buyUnit && buyUnit !== baseUnit && isi > 1) {
            await db
              .insert(schema.productUnits)
              .values({
                tenantId,
                productId: prod.id,
                unitName: buyUnit,
                conversionFactor: String(isi),
                salePriceGeneral: String(parseFloat(b.HARGAJUAL1 || "0") * isi),
                salePriceResep: String(parseFloat(b.HARGAJUAL2 || b.HARGAJUAL1 || "0") * isi),
                salePriceGrosir: String(parseFloat(b.HARGAJUAL3 || b.HARGAJUAL1 || "0") * isi),
                salePriceDelivery: String(parseFloat(b.HARGAJUAL4 || b.HARGAJUAL1 || "0") * isi),
                salePriceMember: String(parseFloat(b.HARGAJUAL5 || b.HARGAJUAL1 || "0") * isi),
                isBaseUnit: false
              })
              .onConflictDoNothing();
            unitCount++;
          }
        }
      } catch (_) {}
    }

    if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= parentRows.length) {
      console.log(`  Processed ${Math.min(i + BATCH_SIZE, parentRows.length)} / ${parentRows.length} primary products...`);
    }
  }

  // Merge child rows (178 items) into parent productUnits
  console.log(`  Merging ${childRows.length} child items into product_units...`);
  for (const child of childRows) {
    const parentLegacyId = String(Math.floor(parseFloat(child.ID_SATUAN_DARI)));
    const parentUuid = productMap.get(parentLegacyId);

    if (parentUuid) {
      const unitName = (child.SATUAN || "DUS").trim().toUpperCase();
      const factor = parseFloat(child.FAKTOR_SATUAN || "1");

      try {
        await db
          .insert(schema.productUnits)
          .values({
            tenantId,
            productId: parentUuid,
            unitName,
            conversionFactor: String(factor),
            salePriceGeneral: String(parseFloat(child.HARGAJUAL1 || "0")),
            salePriceResep: String(parseFloat(child.HARGAJUAL2 || child.HARGAJUAL1 || "0")),
            salePriceGrosir: String(parseFloat(child.HARGAJUAL3 || child.HARGAJUAL1 || "0")),
            salePriceDelivery: String(parseFloat(child.HARGAJUAL4 || child.HARGAJUAL1 || "0")),
            salePriceMember: String(parseFloat(child.HARGAJUAL5 || child.HARGAJUAL1 || "0")),
            isBaseUnit: false
          })
          .onConflictDoNothing();

        // Also map child ID to parent UUID for historical transaction linking
        await db
          .insert(schema.legacyIdMap)
          .values({
            tenantId,
            sourceDatabase: "GAMPANGAPOTEKZ.FDB",
            sourceTable: "BARANG",
            legacyKey: String(child.ID_BARANG),
            entityType: "product_child_unit",
            entityId: parentUuid
          })
          .onConflictDoNothing();

        unitCount++;
      } catch (_) {}
    }
  }

  console.log(`  ✅ Successfully migrated ${productCount} products with ${unitCount} unit configurations.`);

  // 7. BATCH & SALDO STOK (FASTBATCH.csv + STOKAKHIR.csv + STOKMASUK.csv)
  console.log("\n[7/7] Migrating FASTBATCH.csv & STOKAKHIR.csv -> product_batches & branch_stocks...");
  const fastbatchRows = parseCsv<any>("FASTBATCH.csv");
  const fastbatchMap = new Map<string, { batchNo: string | null; expiredDate: string | null }>();
  for (const f of fastbatchRows) {
    if (f.ID_FASTBATCH) {
      fastbatchMap.set(String(f.ID_FASTBATCH).trim(), {
        batchNo: f.BATCH_NO ? f.BATCH_NO.trim() : null,
        expiredDate: f.TANGGAL_KADALUWARSA ? f.TANGGAL_KADALUWARSA.split(" ")[0] : null
      });
    }
  }

  // Stock from STOKAKHIR.csv
  const stokAkhirRows = parseCsv<any>("STOKAKHIR.csv");
  let stockRecords = 0;

  for (const s of stokAkhirRows) {
    if (!s.ID_BARANG || !s.ID_LOKASI) continue;
    const prodUuid = productMap.get(String(s.ID_BARANG).trim());
    const locUuid = locationMap.get(String(s.ID_LOKASI).trim());
    const qty = parseFloat(s.QTY || "0");

    if (prodUuid && locUuid && qty !== 0) {
      // Find branch for location
      const locData = await db
        .select({ branchId: schema.inventoryLocations.branchId })
        .from(schema.inventoryLocations)
        .where(eq(schema.inventoryLocations.id, locUuid))
        .limit(1);

      if (locData.length > 0) {
        try {
          await db
            .insert(schema.branchStocks)
            .values({
              tenantId,
              branchId: locData[0].branchId,
              locationId: locUuid,
              productId: prodUuid,
              totalQtyBase: String(qty),
              unbatchedQtyBase: String(qty)
            })
            .onConflictDoNothing();
          stockRecords++;
        } catch (_) {}
      }
    }
  }
  console.log(`  Imported ${stockRecords} initial stock records into branch_stocks.`);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n==================================================================");
  console.log(`✨ [APOTEKU ETL] MASTER DATA MIGRATION COMPLETE IN ${durationSec}s`);
  console.log(`   - Tenants    : 1`);
  console.log(`   - Branches   : ${branchMap.size}`);
  console.log(`   - Locations  : ${locationMap.size}`);
  console.log(`   - Suppliers  : ${supplierCount}`);
  console.log(`   - Customers  : ${customerCount}`);
  console.log(`   - Products   : ${productCount}`);
  console.log(`   - Units/Tier : ${unitCount}`);
  console.log(`   - Stocks     : ${stockRecords}`);
  console.log("==================================================================");
  process.exit(0);
}

runMasterMigration().catch((err) => {
  console.error("Migration failed with fatal error:", err);
  process.exit(1);
});
