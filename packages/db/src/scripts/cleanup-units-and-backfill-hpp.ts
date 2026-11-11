import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { db, queryClient, schema } from "../index.js";
import { eq, sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

function findBarangCsvPath(): string {
  const candidates = [
    resolve(process.cwd(), "docs/legacy_database/BARANG.csv"),
    resolve(process.cwd(), "../../docs/legacy_database/BARANG.csv"),
    resolve(process.cwd(), "legacy_database/BARANG.csv")
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`BARANG.csv tidak ditemukan di salah satu lokasi: ${candidates.join(", ")}`);
}

function roundRupiah(val: unknown): number {
  const n = Number(val || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

async function run() {
  console.log("==================================================================");
  console.log(`🧹 [APOTEKU] CLEANUP SATUAN GANDA & BACKFILL HPP (${APPLY ? "APPLY MODE" : "DRY-RUN"})`);
  console.log("==================================================================");

  const csvPath = findBarangCsvPath();
  const csvRows: any[] = Papa.parse(readFileSync(csvPath, "utf8"), {
    header: true,
    skipEmptyLines: true
  }).data;

  const csvById = new Map<string, any>();
  for (const r of csvRows) {
    if (r.ID_BARANG) {
      csvById.set(String(Math.floor(Number(r.ID_BARANG))), r);
    }
  }
  console.log(`Loaded ${csvRows.length} rows from BARANG.csv`);

  const allProds = await db.select().from(schema.products);
  const allUnits = await db.select().from(schema.productUnits);
  const childMaps = await db
    .select()
    .from(schema.legacyIdMap)
    .where(eq(schema.legacyIdMap.entityType, "product_child_unit"));

  const unitsByProd = new Map<string, typeof allUnits>();
  for (const u of allUnits) {
    const arr = unitsByProd.get(u.productId) || [];
    arr.push(u);
    unitsByProd.set(u.productId, arr);
  }

  const childCsvByProd = new Map<string, any[]>();
  for (const m of childMaps) {
    const c = csvById.get(String(Math.floor(Number(m.legacyKey))));
    if (!c) continue;
    const arr = childCsvByProd.get(m.entityId) || [];
    arr.push(c);
    childCsvByProd.set(m.entityId, arr);
  }

  const stats = {
    totalProducts: allProds.length,
    productsWithHppBackfill: 0,
    duplicateUnitsRemoved: 0,
    cat4NonSellableUnits: 0,
    unitsUpdated: 0,
    unitsMarkedPurchaseUnit: 0,
    unitsPriceRounded: 0
  };

  const deletedPreview: Array<{ product: string; deletedUnit: string; keptUnit: string; factor: number }> = [];
  const cat4Preview: Array<{ product: string; unit: string; factor: number; oldSalePrice: number; buyPrice: number }> = [];

  const toDeleteIds: string[] = [];
  const unitUpdates: Array<{
    id: string;
    buyPrice: string;
    isSellable: boolean;
    isPurchaseUnit: boolean;
    salePriceGeneral: string;
    salePriceResep: string;
    salePriceGrosir: string;
    salePriceDelivery: string;
    salePriceMember: string;
  }> = [];
  const productUpdates: Array<{
    id: string;
    referenceBuyPriceBase: string;
    defaultPurchaseUnit: string;
  }> = [];

  for (const prod of allProds) {
    const parentCsv = prod.legacyIdBarang ? csvById.get(String(prod.legacyIdBarang)) : undefined;
    const parentBuySat = (parentCsv?.SATUAN_PEMBELIAN || "").trim().toUpperCase();
    const parentIsi = Math.max(1, Number(parentCsv?.ISI || 1));
    const rawHppPack = Number(parentCsv?.HPP || 0);
    const rawHppSat = Number(parentCsv?.HPP_SATUAN || 0);
    const hppSatuanBase =
      rawHppSat > 0 ? rawHppSat : rawHppPack > 0 ? rawHppPack / parentIsi : Number(prod.referenceBuyPriceBase || 0);

    if (hppSatuanBase > 0) {
      stats.productsWithHppBackfill++;
    }

    const units = [...(unitsByProd.get(prod.id) || [])].sort(
      (a, b) =>
        Number(a.conversionFactor) - Number(b.conversionFactor) ||
        Number(b.isBaseUnit) - Number(a.isBaseUnit) ||
        a.unitName.localeCompare(b.unitName)
    );
    if (units.length === 0) continue;

    // Step 1: Deduplicate identical conversion factors within product
    const byFactor = new Map<number, typeof units>();
    for (const u of units) {
      const facKey = Math.round(Number(u.conversionFactor) * 10000);
      const grp = byFactor.get(facKey) || [];
      grp.push(u);
      byFactor.set(facKey, grp);
    }

    const prodDeleteIds = new Set<string>();
    for (const [, grp] of byFactor.entries()) {
      if (grp.length <= 1) continue;
      const keeper =
        grp.find((u) => u.isBaseUnit) ||
        (parentBuySat ? grp.find((u) => u.unitName.toUpperCase() === parentBuySat) : undefined) ||
        grp.find((u) => u.unitName.toUpperCase() !== "DUS") ||
        grp[0];

      for (const u of grp) {
        if (u.id !== keeper.id) {
          prodDeleteIds.add(u.id);
          toDeleteIds.push(u.id);
          stats.duplicateUnitsRemoved++;
          deletedPreview.push({
            product: prod.name,
            deletedUnit: u.unitName,
            keptUnit: keeper.unitName,
            factor: Number(u.conversionFactor)
          });
        }
      }
    }

    const survivingUnits = units.filter((u) => !prodDeleteIds.has(u.id));
    const baseUnit =
      survivingUnits.find((u) => u.isBaseUnit) ||
      survivingUnits.find((u) => Math.abs(Number(u.conversionFactor) - 1) < 0.0001) ||
      survivingUnits[0];

    // Step 2: Determine primary purchase unit (SP / Pembelian)
    const nonBaseUnits = survivingUnits.filter((u) => !u.isBaseUnit && Number(u.conversionFactor) > 1);
    let primaryPurchaseUnit =
      (parentBuySat && !(parentBuySat === prod.baseUnit.toUpperCase() && parentIsi > 1)
        ? survivingUnits.find((u) => u.unitName.toUpperCase() === parentBuySat)
        : undefined) ||
      (parentIsi > 1
        ? nonBaseUnits.find((u) => Math.abs(Number(u.conversionFactor) - parentIsi) < 0.0001)
        : undefined) ||
      (nonBaseUnits.length > 0 ? nonBaseUnits[nonBaseUnits.length - 1] : undefined) ||
      baseUnit;

    const childCsvList = childCsvByProd.get(prod.id) || [];

    for (const u of survivingUnits) {
      const factor = Math.max(1, Number(u.conversionFactor || 1));
      const matchedChildCsv = childCsvList.find(
        (c) =>
          (c.SATUAN || "DUS").trim().toUpperCase() === u.unitName.toUpperCase() &&
          Math.abs(Number(c.FAKTOR_SATUAN || 1) - factor) < 0.0001
      );

      const isSameAsBaseOrParentBuy =
        u.isBaseUnit ||
        (parentBuySat === u.unitName.toUpperCase() && Math.abs(parentIsi - factor) < 0.0001);

      const baseRetailPrice = Number(baseUnit?.salePriceGeneral || 0);
      const currentSaleGen = Number(u.salePriceGeneral || 0);
      const expectedRetailPrice = baseRetailPrice * factor;

      // Approved Option A: Category 4 (unique child unit priced strictly below retail * factor)
      const isCat4BuyOnly =
        Boolean(matchedChildCsv) &&
        !isSameAsBaseOrParentBuy &&
        factor > 1 &&
        expectedRetailPrice > 0 &&
        currentSaleGen < expectedRetailPrice - 1;

      const isSellable = isCat4BuyOnly ? false : true;
      const isPurchaseUnit = u.id === primaryPurchaseUnit?.id || isCat4BuyOnly;

      if (isCat4BuyOnly) {
        stats.cat4NonSellableUnits++;
        cat4Preview.push({
          product: prod.name,
          unit: u.unitName,
          factor,
          oldSalePrice: currentSaleGen,
          buyPrice: Math.round(hppSatuanBase * factor)
        });
      }
      if (isPurchaseUnit) {
        stats.unitsMarkedPurchaseUnit++;
      }

      const unitBuyPrice =
        hppSatuanBase > 0 ? Math.round(hppSatuanBase * factor) : Math.max(0, Math.round(Number(u.buyPrice || 0)));

      const rGen = roundRupiah(u.salePriceGeneral);
      const rResep = roundRupiah(u.salePriceResep);
      const rGrosir = roundRupiah(u.salePriceGrosir);
      const rDeliv = roundRupiah(u.salePriceDelivery);
      const rMember = roundRupiah(u.salePriceMember);

      if (
        Math.abs(Number(u.salePriceGeneral) - rGen) > 0.0001 ||
        Math.abs(Number(u.salePriceResep) - rResep) > 0.0001 ||
        Math.abs(Number(u.salePriceGrosir) - rGrosir) > 0.0001 ||
        Math.abs(Number(u.salePriceDelivery) - rDeliv) > 0.0001 ||
        Math.abs(Number(u.salePriceMember) - rMember) > 0.0001
      ) {
        stats.unitsPriceRounded++;
      }

      stats.unitsUpdated++;
      unitUpdates.push({
        id: u.id,
        buyPrice: String(unitBuyPrice),
        isSellable,
        isPurchaseUnit,
        salePriceGeneral: String(rGen),
        salePriceResep: String(rResep),
        salePriceGrosir: String(rGrosir),
        salePriceDelivery: String(rDeliv),
        salePriceMember: String(rMember)
      });
    }

    productUpdates.push({
      id: prod.id,
      referenceBuyPriceBase: String(hppSatuanBase > 0 ? Number(hppSatuanBase.toFixed(4)) : 0),
      defaultPurchaseUnit: primaryPurchaseUnit?.unitName || prod.baseUnit
    });
  }

  console.log("Summary Stats:", stats);
  console.log("Sample Deleted Duplicates (first 10):", deletedPreview.slice(0, 10));
  console.log("Sample Category 4 (set isSellable=false, first 10):", cat4Preview.slice(0, 10));

  if (!APPLY) {
    console.log("\n[DRY-RUN] Tidak ada perubahan ditulis ke PostgreSQL. Jalankan dengan --apply untuk eksekusi.");
    process.exit(0);
  }

  console.log("\n[APPLY] Memulai transaksi pembaruan database PostgreSQL...");
  const BATCH = 300;
  await db.transaction(async (tx) => {
    // 1. Delete duplicate conversion-factor units
    if (toDeleteIds.length > 0) {
      for (let i = 0; i < toDeleteIds.length; i += BATCH) {
        const chunk = toDeleteIds.slice(i, i + BATCH);
        await tx
          .delete(schema.productUnits)
          .where(sql`${schema.productUnits.id} IN ${chunk}`);
      }
      console.log(`  Deleted ${toDeleteIds.length} duplicate unit rows.`);
    }

    // 2. Bulk update products (referenceBuyPriceBase, defaultPurchaseUnit, updatedAt)
    for (let i = 0; i < productUpdates.length; i += BATCH) {
      const chunk = productUpdates.slice(i, i + BATCH);
      const valuesSql = sql.join(
        chunk.map((p) => sql`(${p.id}::uuid, ${p.referenceBuyPriceBase}::numeric, ${p.defaultPurchaseUnit}::varchar)`),
        sql`, `
      );
      await tx.execute(sql`
        UPDATE products AS p
        SET reference_buy_price_base = v.ref_buy,
            default_purchase_unit = v.def_unit,
            updated_at = NOW()
        FROM (VALUES ${valuesSql}) AS v(id, ref_buy, def_unit)
        WHERE p.id = v.id
      `);
    }
    console.log(`  Updated ${productUpdates.length} products with referenceBuyPriceBase & defaultPurchaseUnit.`);

    // 3. Bulk update surviving product_units
    for (let i = 0; i < unitUpdates.length; i += BATCH) {
      const chunk = unitUpdates.slice(i, i + BATCH);
      const valuesSql = sql.join(
        chunk.map(
          (u) =>
            sql`(${u.id}::uuid, ${u.buyPrice}::numeric, ${u.isSellable}::boolean, ${u.isPurchaseUnit}::boolean, ${u.salePriceGeneral}::numeric, ${u.salePriceResep}::numeric, ${u.salePriceGrosir}::numeric, ${u.salePriceDelivery}::numeric, ${u.salePriceMember}::numeric)`
        ),
        sql`, `
      );
      await tx.execute(sql`
        UPDATE product_units AS pu
        SET buy_price = v.buy_price,
            is_sellable = v.is_sellable,
            is_purchase_unit = v.is_purchase,
            sale_price_general = v.p_gen,
            sale_price_resep = v.p_res,
            sale_price_grosir = v.p_gro,
            sale_price_delivery = v.p_del,
            sale_price_member = v.p_mem
        FROM (VALUES ${valuesSql}) AS v(id, buy_price, is_sellable, is_purchase, p_gen, p_res, p_gro, p_del, p_mem)
        WHERE pu.id = v.id
      `);
    }
    console.log(`  Updated ${unitUpdates.length} product_units rows (buyPrice, flags, rounded sale prices).`);
  });

  // Post-verify duplicate factors = 0
  const dupCheck = await queryClient.unsafe(
    "SELECT product_id, conversion_factor, COUNT(*)::int as cnt FROM product_units GROUP BY product_id, conversion_factor HAVING COUNT(*) > 1"
  );
  const teraCheck = await queryClient.unsafe(
    "SELECT p.name, p.default_purchase_unit, p.reference_buy_price_base::float8 as ref_hpp_base, pu.unit_name, pu.conversion_factor::float8 as factor, pu.buy_price::float8 as buy_price, pu.sale_price_general::float8 as sale_gen, pu.is_base_unit, pu.is_sellable, pu.is_purchase_unit FROM product_units pu JOIN products p ON p.id = pu.product_id WHERE p.id = '6ab11fd9-5dcc-47f0-bd49-b8bef1945042' ORDER BY factor"
  );
  console.log("Post-cleanup duplicate groups:", dupCheck.length);
  console.log("Post-cleanup TERA F TAB:");
  console.table(teraCheck);
  process.exit(0);
}

run().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
