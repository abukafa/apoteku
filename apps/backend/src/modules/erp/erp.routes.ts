import { Elysia, t } from "elysia";
import { db, schema } from "@apoteku/db";
import { desc, count, sql, eq, and } from "drizzle-orm";
import { generateOrderNumber, inferPurchaseOrderType, calculateDebtSettlement } from "@apoteku/core";
import { consignmentService } from "./consignment.service.js";

class ProductUnitValidationError extends Error {}

const roundIdr = (val: unknown): number => {
  const n = Number(val || 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

function normalizeProductUnitsInput(
  rawUnits: any[] | undefined,
  baseUnit: string,
  fallbackPrices: any = {},
  fallbackBuyPriceBase = 0
) {
  const inputList =
    Array.isArray(rawUnits) && rawUnits.length > 0
      ? rawUnits
      : [
          {
            unitName: baseUnit,
            conversionFactor: 1,
            buyPrice: roundIdr(fallbackBuyPriceBase),
            salePriceGeneral: fallbackPrices?.general || 0,
            salePriceResep: fallbackPrices?.prescription || fallbackPrices?.general || 0,
            salePriceGrosir: fallbackPrices?.wholesale || fallbackPrices?.general || 0,
            salePriceDelivery: fallbackPrices?.general || 0,
            salePriceMember: fallbackPrices?.wholesale || fallbackPrices?.general || 0,
            isBaseUnit: true,
            isSellable: true,
            isPurchaseUnit: true
          }
        ];

  const seenUnitNames = new Set<string>();
  const seenFactors = new Set<number>();
  const normalizedUnits: Array<{
    unitName: string;
    conversionFactor: number;
    buyPrice: number;
    salePriceGeneral: number;
    salePriceResep: number;
    salePriceGrosir: number;
    salePriceDelivery: number;
    salePriceMember: number;
    isBaseUnit: boolean;
    isSellable: boolean;
    isPurchaseUnit: boolean;
  }> = [];

  for (let i = 0; i < inputList.length; i++) {
    const u = inputList[i];
    const unitName = String(u.unitName || u.unit || (i === 0 ? baseUnit : `UNIT${i + 1}`))
      .trim()
      .toUpperCase();
    if (!unitName) continue;
    if (seenUnitNames.has(unitName)) {
      throw new ProductUnitValidationError(`Nama satuan "${unitName}" terduplikasi dalam 1 produk.`);
    }
    seenUnitNames.add(unitName);

    const factor = i === 0 ? 1 : Math.max(1, Number(u.conversionFactor ?? u.multiplier ?? 1));
    if (i > 0 && factor <= 1) {
      throw new ProductUnitValidationError(`Satuan kemasan "${unitName}" harus memiliki faktor konversi lebih dari 1.`);
    }
    const factorKey = Math.round(factor * 10000);
    if (seenFactors.has(factorKey)) {
      throw new ProductUnitValidationError(
        `Faktor konversi (${factor} ${baseUnit}) pada satuan "${unitName}" duplikat. Setiap satuan kemasan harus memiliki isi berbeda.`
      );
    }
    seenFactors.add(factorKey);

    const gen = roundIdr(u.salePriceGeneral ?? u.prices?.general);
    const resep = roundIdr(u.salePriceResep ?? u.prices?.prescription ?? gen);
    const grosir = roundIdr(u.salePriceGrosir ?? u.prices?.wholesale ?? gen);
    const deliv = roundIdr(u.salePriceDelivery ?? u.prices?.delivery ?? gen);
    const member = roundIdr(u.salePriceMember ?? u.prices?.member ?? grosir);
    const explicitBuy = Number(u.buyPrice);
    const buyPrice =
      Number.isFinite(explicitBuy) && explicitBuy >= 0
        ? Math.round(explicitBuy)
        : Math.round(Math.max(0, fallbackBuyPriceBase) * factor);

    normalizedUnits.push({
      unitName,
      conversionFactor: factor,
      buyPrice,
      salePriceGeneral: gen,
      salePriceResep: resep,
      salePriceGrosir: grosir,
      salePriceDelivery: deliv,
      salePriceMember: member,
      isBaseUnit: i === 0 || Boolean(u.isBaseUnit),
      isSellable: i === 0 ? true : u.isSellable !== false,
      isPurchaseUnit: Boolean(u.isPurchaseUnit)
    });
  }

  if (normalizedUnits.length > 0 && !normalizedUnits.some((u) => u.isPurchaseUnit)) {
    const defaultPurchaseIdx = normalizedUnits.length > 1 ? normalizedUnits.length - 1 : 0;
    normalizedUnits[defaultPurchaseIdx].isPurchaseUnit = true;
  }

  const primaryPurchaseUnit =
    normalizedUnits.find((u) => u.isPurchaseUnit) || normalizedUnits[normalizedUnits.length - 1];
  const baseUnitRow = normalizedUnits[0];
  const derivedRefBuyPriceBase =
    baseUnitRow && baseUnitRow.buyPrice > 0
      ? baseUnitRow.buyPrice
      : primaryPurchaseUnit && primaryPurchaseUnit.buyPrice > 0
        ? primaryPurchaseUnit.buyPrice / Math.max(1, primaryPurchaseUnit.conversionFactor)
        : Math.max(0, Number(fallbackBuyPriceBase || 0));

  return {
    normalizedUnits,
    defaultPurchaseUnit: primaryPurchaseUnit?.unitName || baseUnit,
    derivedRefBuyPriceBase
  };
}

export const erpRoutes = new Elysia({ prefix: "/api" })
  .derive(({ headers }) => {
    const tenantId = (headers["x-tenant-id"] as string) || undefined;
    const branchId = (headers["x-branch-id"] as string) || undefined;
    const userId = (headers["x-user-id"] as string) || undefined;
    const userRole = (headers["x-user-role"] as string) || undefined;
    return { tenantId, branchId, userId, userRole };
  })
  // 1. STATISTIK SISTEM & DASHBOARD
  .get("/stats", async () => {
    try {
      const [prodCount] = await db.select({ val: count() }).from(schema.products);
      const [unitCount] = await db.select({ val: count() }).from(schema.productUnits);
      const [custCount] = await db.select({ val: count() }).from(schema.customers);
      const [suppCount] = await db.select({ val: count() }).from(schema.suppliers);
      const [saleCount] = await db.select({ val: count() }).from(schema.salesTransactions);
      const [pbCount] = await db.select({ val: count() }).from(schema.purchaseInvoices);

      return {
        success: true,
        data: {
          totalProducts: Number(prodCount?.val || 0),
          totalUnits: Number(unitCount?.val || 0),
          totalCustomers: Number(custCount?.val || 0),
          totalSuppliers: Number(suppCount?.val || 0),
          totalSalesTransactions: Number(saleCount?.val || 0),
          totalPurchaseInvoices: Number(pbCount?.val || 0)
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 1A. DATA LENGKAP DASHBOARD (KPI, GRAFIK 7 HARI, STOK MENIPIS, NOTIFIKASI REAL-TIME)
  .get("/dashboard", async () => {
    try {
      const nowWib = new Date(Date.now() + 7 * 3600 * 1000);
      const todayStr = nowWib.toISOString().slice(0, 10);
      const yesterdayWib = new Date(Date.now() + 7 * 3600 * 1000 - 24 * 3600 * 1000);
      const yesterdayStr = yesterdayWib.toISOString().slice(0, 10);

      const [prodCount] = await db.select({ val: count() }).from(schema.products);
      const [custCount] = await db.select({ val: count() }).from(schema.customers);
      const [totalSalesTrx] = await db.select({ val: count() }).from(schema.salesTransactions);

      const [todaySales] = await db
        .select({
          totalAmount: sql<string>`COALESCE(SUM(CAST(${schema.salesTransactions.grandTotal} AS numeric)), 0)`,
          trxCount: count()
        })
        .from(schema.salesTransactions)
        .where(sql`TO_CHAR(${schema.salesTransactions.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') = ${todayStr}`);

      const [yesterdaySales] = await db
        .select({
          totalAmount: sql<string>`COALESCE(SUM(CAST(${schema.salesTransactions.grandTotal} AS numeric)), 0)`,
          trxCount: count()
        })
        .from(schema.salesTransactions)
        .where(sql`TO_CHAR(${schema.salesTransactions.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') = ${yesterdayStr}`);

      // 7 Hari Terakhir untuk grafik
      const sevenDays: Array<{ dateStr: string; label: string }> = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() + 7 * 3600 * 1000 - i * 24 * 3600 * 1000);
        const ds = d.toISOString().slice(0, 10);
        const dayNum = d.getUTCDate();
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
        const label = `${dayNum} ${monthNames[d.getUTCMonth()]}`;
        sevenDays.push({ dateStr: ds, label });
      }

      const sevenDaysStats = await db
        .select({
          dateStr: sql<string>`TO_CHAR(${schema.salesTransactions.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`,
          totalSales: sql<string>`COALESCE(SUM(CAST(${schema.salesTransactions.grandTotal} AS numeric)), 0)`,
          trxCount: count()
        })
        .from(schema.salesTransactions)
        .where(sql`TO_CHAR(${schema.salesTransactions.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') >= ${sevenDays[0].dateStr}`)
        .groupBy(sql`TO_CHAR(${schema.salesTransactions.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`);

      const sevenDaysMap = new Map<string, { totalSales: number; trxCount: number }>();
      for (const s of sevenDaysStats) {
        if (s.dateStr) {
          sevenDaysMap.set(s.dateStr, {
            totalSales: Number(s.totalSales || 0),
            trxCount: Number(s.trxCount || 0)
          });
        }
      }

      const chartData = sevenDays.map((d) => {
        const val = sevenDaysMap.get(d.dateStr) || { totalSales: 0, trxCount: 0 };
        return {
          date: d.dateStr,
          label: d.label,
          sales: val.totalSales,
          salesStr: Math.round(val.totalSales).toLocaleString("id-ID"),
          trxs: val.trxCount
        };
      });

      // Daftar stok menipis
      const lowStockItems = await db
        .select({
          id: schema.products.id,
          name: schema.products.name,
          baseUnit: schema.products.baseUnit,
          minStock: schema.products.minStock,
          currentStock: schema.branchStocks.totalQtyBase
        })
        .from(schema.branchStocks)
        .innerJoin(schema.products, eq(schema.branchStocks.productId, schema.products.id))
        .where(sql`CAST(${schema.branchStocks.totalQtyBase} AS numeric) <= GREATEST(CAST(${schema.products.minStock} AS numeric), 15)`)
        .orderBy(sql`CAST(${schema.branchStocks.totalQtyBase} AS numeric) ASC`)
        .limit(10);

      const formattedLowStock = lowStockItems.map((item) => ({
        id: item.id,
        name: item.name,
        stock: Math.round(Number(item.currentStock || 0)),
        minStock: Math.max(Math.round(Number(item.minStock || 0)), 10),
        unit: item.baseUnit
      }));

      const [lowStockCountRes] = await db
        .select({ val: count() })
        .from(schema.branchStocks)
        .innerJoin(schema.products, eq(schema.branchStocks.productId, schema.products.id))
        .where(sql`CAST(${schema.branchStocks.totalQtyBase} AS numeric) <= GREATEST(CAST(${schema.products.minStock} AS numeric), 15)`);

      // Notifikasi & Pengingat real
      const notifications: Array<{
        id: string;
        title: string;
        desc: string;
        time: string;
        type: "ALERT" | "PURCHASE" | "EXPIRY" | "RECEIVABLE";
      }> = [];

      // A. Batch Mendekati ED (< 90 hari)
      const expiringBatches = await db
        .select({
          productName: schema.products.name,
          batchNo: schema.productBatches.batchNo,
          expiredDate: schema.productBatches.expiredDate,
          qty: schema.branchBatchStocks.qtyBase
        })
        .from(schema.branchBatchStocks)
        .innerJoin(schema.products, eq(schema.branchBatchStocks.productId, schema.products.id))
        .innerJoin(schema.productBatches, eq(schema.branchBatchStocks.batchId, schema.productBatches.id))
        .where(sql`${schema.productBatches.expiredDate} IS NOT NULL AND CAST(${schema.branchBatchStocks.qtyBase} AS numeric) > 0 AND ${schema.productBatches.expiredDate} <= (CURRENT_DATE + INTERVAL '90 days')`)
        .orderBy(schema.productBatches.expiredDate)
        .limit(2);

      for (const b of expiringBatches) {
        const expDate = b.expiredDate ? new Date(b.expiredDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-";
        notifications.push({
          id: `exp-${b.batchNo || crypto.randomUUID()}`,
          title: `Mendekati ED: ${b.productName}`,
          desc: `Batch ${b.batchNo || "-"} &bull; ED: ${expDate} (Sisa ${Math.round(Number(b.qty || 0))})`,
          time: "ED Alert",
          type: "EXPIRY"
        });
      }

      // B. Stok Menipis
      for (const ls of formattedLowStock.slice(0, 2)) {
        notifications.push({
          id: `stock-${ls.id}`,
          title: `Stok ${ls.name} menipis`,
          desc: `Sisa ${ls.stock} ${ls.unit} (min. ${ls.minStock} ${ls.unit})`,
          time: "Stok Menipis",
          type: "ALERT"
        });
      }

      // C. Tagihan Hutang Pembelian PBF Belum Lunas
      const duePurchases = await db
        .select({
          invoiceNumber: schema.purchaseInvoices.invoiceNumber,
          supplierName: schema.suppliers.name,
          dueDate: schema.purchaseInvoices.dueDate,
          grandTotal: schema.purchaseInvoices.grandTotal,
          paidAmount: schema.purchaseInvoices.paidAmount
        })
        .from(schema.purchaseInvoices)
        .leftJoin(schema.suppliers, eq(schema.purchaseInvoices.supplierId, schema.suppliers.id))
        .where(eq(schema.purchaseInvoices.isPaidOff, false))
        .orderBy(schema.purchaseInvoices.dueDate)
        .limit(2);

      for (const dp of duePurchases) {
        const sisa = Number(dp.grandTotal || 0) - Number(dp.paidAmount || 0);
        const dueStr = dp.dueDate ? new Date(dp.dueDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-";
        notifications.push({
          id: `due-${dp.invoiceNumber}`,
          title: `Jatuh tempo faktur ${dp.supplierName || "PBF"}`,
          desc: `No. ${dp.invoiceNumber} &bull; Sisa Rp ${Math.round(sisa).toLocaleString("id-ID")} (Jatuh tempo: ${dueStr})`,
          time: "Hutang PBF",
          type: "PURCHASE"
        });
      }

      // D. Piutang Penjualan Pelanggan (Bon / Tempo)
      const unpaidReceivables = await db
        .select({
          invoiceNo: schema.salesTransactions.invoiceNo,
          patientName: schema.salesTransactions.patientName,
          grandTotal: schema.salesTransactions.grandTotal,
          paidAmount: schema.salesTransactions.paidAmount
        })
        .from(schema.salesTransactions)
        .where(sql`CAST(${schema.salesTransactions.grandTotal} AS numeric) > CAST(${schema.salesTransactions.paidAmount} AS numeric)`)
        .orderBy(desc(schema.salesTransactions.createdAt))
        .limit(1);

      for (const ur of unpaidReceivables) {
        const sisa = Number(ur.grandTotal || 0) - Number(ur.paidAmount || 0);
        notifications.push({
          id: `rec-${ur.invoiceNo}`,
          title: `Piutang Pelanggan: ${ur.patientName || "Pelanggan"}`,
          desc: `No. ${ur.invoiceNo} &bull; Sisa Rp ${Math.round(sisa).toLocaleString("id-ID")}`,
          time: "Piutang",
          type: "RECEIVABLE"
        });
      }

      return {
        success: true,
        data: {
          kpi: {
            todaySales: Number(todaySales?.totalAmount || 0),
            todayTrxCount: Number(todaySales?.trxCount || 0),
            yesterdaySales: Number(yesterdaySales?.totalAmount || 0),
            yesterdayTrxCount: Number(yesterdaySales?.trxCount || 0),
            totalProducts: Number(prodCount?.val || 0),
            totalCustomers: Number(custCount?.val || 0),
            totalSalesTransactions: Number(totalSalesTrx?.val || 0),
            lowStockCount: Number(lowStockCountRes?.val || 0)
          },
          chartData,
          lowStockItems: formattedLowStock,
          notifications
        }
      };
    } catch (err: any) {
      console.error("[ERP] /dashboard error:", err);
      return { success: false, error: err.message };
    }
  })

  // 1B. LIST CABANG APOTEK
  .get("/branches", async () => {
    try {
      const branches = await db
        .select()
        .from(schema.branches)
        .orderBy(schema.branches.name);

      return {
        success: true,
        data: branches.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          address: b.address || "",
          phone: b.phone || ""
        }))
      };
    } catch (err: any) {
      return { success: false, error: err.message, data: [] };
    }
  })

  // 1C. LIST PRODUK DENGAN SATUAN & HARGA
  .get("/products", async () => {
    try {
      const prods = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.isActive, true))
        .orderBy(schema.products.name)
        .limit(5000);

      const prodIds = prods.map((p) => p.id);
      const unitsMap = new Map<string, any[]>();

      if (prodIds.length > 0) {
        const units = await db
          .select()
          .from(schema.productUnits)
          .where(sql`${schema.productUnits.productId} IN ${prodIds}`);

        for (const u of units) {
          const list = unitsMap.get(u.productId) || [];
          list.push({
            id: u.id,
            unitName: u.unitName,
            conversionFactor: Number(u.conversionFactor),
            buyPrice: Number(u.buyPrice || 0),
            salePriceGeneral: Number(u.salePriceGeneral || 0),
            salePriceResep: Number(u.salePriceResep || 0),
            salePriceGrosir: Number(u.salePriceGrosir || 0),
            salePriceDelivery: Number(u.salePriceDelivery || 0),
            salePriceMember: Number(u.salePriceMember || 0),
            isBaseUnit: u.isBaseUnit,
            isSellable: Boolean(u.isSellable),
            isPurchaseUnit: Boolean(u.isPurchaseUnit)
          });
          unitsMap.set(u.productId, list);
        }
      }

      const latestPrices = await db
        .select({
          productId: schema.branchBatchStocks.productId,
          buyPrice: schema.branchBatchStocks.buyPrice
        })
        .from(schema.branchBatchStocks)
        .orderBy(desc(schema.branchBatchStocks.updatedAt));

      const priceMap = new Map<string, number>();
      for (const lp of latestPrices) {
        const bp = Number(lp.buyPrice || 0);
        if (!priceMap.has(lp.productId) && bp > 0) {
          priceMap.set(lp.productId, bp);
        }
      }

      return {
        success: true,
        data: prods.map((p) => {
          const uList = [...(unitsMap.get(p.id) || [])].sort(
            (a, b) => a.conversionFactor - b.conversionFactor
          );

          // Prioritas HPP per satuan dasar: batch terakhir > master referenceBuyPriceBase > unit.buyPrice/factor > 0
          const unitWithBuy = uList.find((u) => Number(u.buyPrice) > 0);
          const refBase = Number(p.referenceBuyPriceBase || 0);
          const batchBase = priceMap.get(p.id) || 0;
          const baseBuyPrice =
            batchBase > 0
              ? batchBase
              : refBase > 0
                ? refBase
                : unitWithBuy
                  ? Number(unitWithBuy.buyPrice) / Math.max(1, Number(unitWithBuy.conversionFactor))
                  : 0;

          const baseUnitsSource =
            uList.length > 0
              ? uList
              : [
                  {
                    id: undefined,
                    unitName: p.baseUnit,
                    conversionFactor: 1,
                    buyPrice: Math.round(baseBuyPrice),
                    salePriceGeneral: 0,
                    salePriceResep: 0,
                    salePriceGrosir: 0,
                    salePriceDelivery: 0,
                    salePriceMember: 0,
                    isBaseUnit: true,
                    isSellable: true,
                    isPurchaseUnit: true
                  }
                ];

          const formattedUnits = baseUnitsSource.map((u) => {
            const factor = Number(u.conversionFactor || 1);
            const masterUnitBuy = Number(u.buyPrice || 0);
            const estimatedBuyPrice =
              batchBase > 0
                ? Math.round(batchBase * factor)
                : masterUnitBuy > 0
                  ? Math.round(masterUnitBuy)
                  : baseBuyPrice > 0
                    ? Math.round(baseBuyPrice * factor)
                    : 0;
            return {
              id: u.id,
              unitName: u.unitName,
              conversionFactor: factor,
              isBaseUnit: Boolean(u.isBaseUnit),
              isSellable: u.isSellable !== false,
              isPurchaseUnit: Boolean(u.isPurchaseUnit),
              buyPrice: masterUnitBuy > 0 ? Math.round(masterUnitBuy) : estimatedBuyPrice,
              estimatedBuyPrice,
              salePriceGeneral: Number(u.salePriceGeneral || 0),
              salePriceResep: Number(u.salePriceResep || 0),
              salePriceGrosir: Number(u.salePriceGrosir || 0),
              salePriceDelivery: Number(u.salePriceDelivery || 0),
              salePriceMember: Number(u.salePriceMember || 0)
            };
          });

          const taggedPurchaseUnits = formattedUnits.filter((u) => u.isPurchaseUnit);
          const purchaseUnits =
            taggedPurchaseUnits.length > 0
              ? taggedPurchaseUnits
              : formattedUnits.filter((u) => u.conversionFactor > 1).length > 0
                ? formattedUnits.filter((u) => u.conversionFactor > 1)
                : formattedUnits;

          return {
            id: p.id,
            sku: p.sku,
            barcode: p.barcode || "",
            name: p.name,
            activeSubstance: p.activeSubstance || "",
            dosageForm: p.dosageForm || "",
            rackLocation: p.rackLocation || "",
            drugClass: p.drugClass,
            baseUnit: p.baseUnit,
            defaultPurchaseUnit: p.defaultPurchaseUnit || purchaseUnits[0]?.unitName || p.baseUnit,
            referenceBuyPriceBase: refBase,
            isConsignment: Boolean(p.isConsignment),
            buyPrice: Math.round(baseBuyPrice),
            units: formattedUnits,
            purchaseUnits
          };
        })
      };
    } catch (err: any) {
      return { success: false, error: err.message, data: [] };
    }
  })

  // 1D. TAMBAH MASTER PRODUK BARU
  .post("/products", async ({ body, set }: { body: any; set: any }) => {
    try {
      if (!body.name || !String(body.name).trim()) {
        set.status = 400;
        return { success: false, error: "Nama obat wajib diisi" };
      }
      const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      if (!tenant) throw new Error("Tenant aktif tidak ditemukan");

      let sku = (body.sku || "").trim();
      if (!sku) {
        sku = `SKU-${Date.now().toString().slice(-6)}`;
      }
      const [dupSku] = await db
        .select({ id: schema.products.id })
        .from(schema.products)
        .where(and(eq(schema.products.tenantId, tenant.id), eq(schema.products.sku, sku)))
        .limit(1);
      if (dupSku) {
        sku = `${sku}-${Date.now().toString().slice(-3)}`;
      }

      const baseUnit = String(body.baseUnit || body.units?.[0]?.unitName || "PCS").trim().toUpperCase();
      const rawRefBuy = Number(body.referenceBuyPriceBase ?? body.buyPrice ?? 0);
      const { normalizedUnits, defaultPurchaseUnit, derivedRefBuyPriceBase } = normalizeProductUnitsInput(
        body.units,
        baseUnit,
        body.unitPrices,
        rawRefBuy
      );

      const prodId = crypto.randomUUID();
      const now = new Date();

      const created = await db.transaction(async (tx) => {
        const [p] = await tx
          .insert(schema.products)
          .values({
            id: prodId,
            tenantId: tenant.id,
            sku,
            barcode: body.barcode ? String(body.barcode).trim() : null,
            name: String(body.name).trim(),
            activeSubstance: body.genericName || body.activeSubstance || null,
            dosageForm: body.dosageForm || null,
            drugClass: body.drugClass || "BEBAS",
            baseUnit,
            defaultPurchaseUnit: String(body.defaultPurchaseUnit || defaultPurchaseUnit).trim().toUpperCase(),
            referenceBuyPriceBase: String(derivedRefBuyPriceBase),
            isConsignment: Boolean(body.isConsignment),
            isActive: body.isActive ?? true,
            updatedAt: now
          })
          .returning();

        for (const u of normalizedUnits) {
          await tx.insert(schema.productUnits).values({
            id: crypto.randomUUID(),
            tenantId: tenant.id,
            productId: prodId,
            unitName: u.unitName,
            conversionFactor: String(u.conversionFactor),
            buyPrice: String(u.buyPrice),
            salePriceGeneral: String(u.salePriceGeneral),
            salePriceResep: String(u.salePriceResep),
            salePriceGrosir: String(u.salePriceGrosir),
            salePriceDelivery: String(u.salePriceDelivery),
            salePriceMember: String(u.salePriceMember),
            isBaseUnit: u.isBaseUnit,
            isSellable: u.isSellable,
            isPurchaseUnit: u.isPurchaseUnit
          });
        }

        const initStock = Number(body.initialStock || 0);
        if (initStock > 0) {
          let branchId = body.branchId;
          if (!branchId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId)) {
            const [b] = await tx.select({ id: schema.branches.id }).from(schema.branches).limit(1);
            branchId = b?.id;
          }
          if (branchId) {
            let [loc] = await tx
              .select({ id: schema.inventoryLocations.id })
              .from(schema.inventoryLocations)
              .where(eq(schema.inventoryLocations.branchId, branchId))
              .limit(1);
            if (!loc) {
              const newLocId = crypto.randomUUID();
              await tx.insert(schema.inventoryLocations).values({
                id: newLocId,
                tenantId: tenant.id,
                branchId,
                code: "DEPO-UTAMA",
                name: "Etalase Depo Utama",
                isDefault: true,
                isActive: true
              });
              loc = { id: newLocId };
            }

            const batchId = crypto.randomUUID();
            await tx.insert(schema.productBatches).values({
              id: batchId,
              tenantId: tenant.id,
              productId: prodId,
              batchNo: String(body.initialBatch || `BCH-${Date.now().toString().slice(-6)}`).trim().toUpperCase(),
              expiredDate: body.initialExpiry || "2028-01-01"
            });

            await tx.insert(schema.branchBatchStocks).values({
              id: crypto.randomUUID(),
              tenantId: tenant.id,
              branchId,
              locationId: loc.id,
              productId: prodId,
              batchId,
              qtyBase: String(initStock),
              buyPrice: String(derivedRefBuyPriceBase || Number(body.buyPrice || 0)),
              updatedAt: now
            });

            await tx.insert(schema.branchStocks).values({
              id: crypto.randomUUID(),
              tenantId: tenant.id,
              branchId,
              locationId: loc.id,
              productId: prodId,
              totalQtyBase: String(initStock),
              unbatchedQtyBase: "0",
              updatedAt: now
            });
          }
        }

        return p;
      });

      return {
        success: true,
        message: `Produk "${created.name}" berhasil ditambahkan ke database.`,
        data: {
          ...created,
          isConsignment: Boolean(created.isConsignment)
        }
      };
    } catch (err: any) {
      if (err instanceof ProductUnitValidationError) {
        set.status = 400;
      }
      return { success: false, error: err.message };
    }
  })

  // 1E. UPDATE MASTER PRODUK
  .put("/products/:id", async ({ params, body, set }: { params: { id: string }; body: any; set: any }) => {
    try {
      const [existing] = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.id, params.id))
        .limit(1);

      if (!existing) {
        set.status = 404;
        return { success: false, error: "Produk tidak ditemukan di database" };
      }

      const targetBaseUnit = String(body.baseUnit || body.units?.[0]?.unitName || existing.baseUnit)
        .trim()
        .toUpperCase();
      const rawRefBuy = Number(body.referenceBuyPriceBase ?? body.buyPrice ?? existing.referenceBuyPriceBase ?? 0);

      let unitMeta: ReturnType<typeof normalizeProductUnitsInput> | null = null;
      if (Array.isArray(body.units) && body.units.length > 0) {
        unitMeta = normalizeProductUnitsInput(body.units, targetBaseUnit, body.unitPrices, rawRefBuy);
      }

      const now = new Date();
      const updated = await db.transaction(async (tx) => {
        const updateFields: any = { updatedAt: now };
        if (body.name !== undefined) updateFields.name = String(body.name).trim();
        if (body.sku !== undefined) updateFields.sku = String(body.sku).trim();
        if (body.barcode !== undefined) updateFields.barcode = body.barcode ? String(body.barcode).trim() : null;
        if (body.genericName !== undefined || body.activeSubstance !== undefined) {
          updateFields.activeSubstance = body.genericName ?? body.activeSubstance ?? null;
        }
        if (body.drugClass !== undefined) updateFields.drugClass = body.drugClass;
        if (body.baseUnit !== undefined) updateFields.baseUnit = targetBaseUnit;
        if (body.isConsignment !== undefined) updateFields.isConsignment = Boolean(body.isConsignment);
        if (body.isActive !== undefined) updateFields.isActive = Boolean(body.isActive);
        if (unitMeta) {
          updateFields.defaultPurchaseUnit = String(
            body.defaultPurchaseUnit || unitMeta.defaultPurchaseUnit
          )
            .trim()
            .toUpperCase();
          updateFields.referenceBuyPriceBase = String(unitMeta.derivedRefBuyPriceBase);
        } else if (body.referenceBuyPriceBase !== undefined || body.buyPrice !== undefined) {
          updateFields.referenceBuyPriceBase = String(Math.max(0, rawRefBuy));
        }

        const [p] = await tx
          .update(schema.products)
          .set(updateFields)
          .where(eq(schema.products.id, params.id))
          .returning();

        if (unitMeta) {
          await tx
            .delete(schema.productUnits)
            .where(eq(schema.productUnits.productId, params.id));

          for (const u of unitMeta.normalizedUnits) {
            await tx.insert(schema.productUnits).values({
              id: crypto.randomUUID(),
              tenantId: existing.tenantId,
              productId: params.id,
              unitName: u.unitName,
              conversionFactor: String(u.conversionFactor),
              buyPrice: String(u.buyPrice),
              salePriceGeneral: String(u.salePriceGeneral),
              salePriceResep: String(u.salePriceResep),
              salePriceGrosir: String(u.salePriceGrosir),
              salePriceDelivery: String(u.salePriceDelivery),
              salePriceMember: String(u.salePriceMember),
              isBaseUnit: u.isBaseUnit,
              isSellable: u.isSellable,
              isPurchaseUnit: u.isPurchaseUnit
            });
          }
        }

        return p;
      });

      return {
        success: true,
        message: `Produk "${updated.name}" berhasil diperbarui.`,
        data: {
          ...updated,
          isConsignment: Boolean(updated.isConsignment)
        }
      };
    } catch (err: any) {
      if (err instanceof ProductUnitValidationError) {
        set.status = 400;
      }
      return { success: false, error: err.message };
    }
  })

  // 1F. HAPUS / NONAKTIFKAN PRODUK
  .delete("/products/:id", async ({ params }: { params: { id: string } }) => {
    try {
      const [existing] = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.id, params.id))
        .limit(1);

      if (!existing) {
        return { success: false, error: "Produk tidak ditemukan" };
      }

      const [saleRef] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.salesTransactionItems)
        .where(eq(schema.salesTransactionItems.productId, params.id));
      const [purRef] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.purchaseInvoiceItems)
        .where(eq(schema.purchaseInvoiceItems.productId, params.id));
      const [ksnRef] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.consignmentReceiptItems)
        .where(eq(schema.consignmentReceiptItems.productId, params.id));

      const hasHistory =
        Number(saleRef?.count || 0) + Number(purRef?.count || 0) + Number(ksnRef?.count || 0) > 0;

      if (hasHistory) {
        await db
          .update(schema.products)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(schema.products.id, params.id));

        return {
          success: true,
          action: "soft_deleted",
          message: `Produk "${existing.name}" dinonaktifkan karena sudah memiliki riwayat transaksi.`
        };
      }

      await db.delete(schema.products).where(eq(schema.products.id, params.id));
      return {
        success: true,
        action: "hard_deleted",
        message: `Produk "${existing.name}" berhasil dihapus.`
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 2. SUPPLIERS (PBF)
  .get("/suppliers", async () => {
    try {
      const suppliers = await db
        .select()
        .from(schema.suppliers)
        .orderBy(schema.suppliers.name)
        .limit(500);

      return {
        success: true,
        data: suppliers.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          phone: s.phone || "",
          email: s.email || "",
          address: s.address || "",
          topDays: s.paymentTermDays,
          paymentTermDays: s.paymentTermDays,
          contactPerson: s.contactPerson || "",
          pbfLicense: s.code,
          isConsignment: Boolean(s.isConsignment),
          isActive: s.isActive
        }))
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 2B. TAMBAH SUPPLIER (PBF) BARU
  .post("/suppliers", async ({ body }: { body: any }) => {
    try {
      if (!body.name || !body.name.trim()) {
        return { success: false, error: "Nama distributor / PBF wajib diisi" };
      }

      const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      if (!tenant) throw new Error("Tenant aktif tidak ditemukan");

      let code = (body.code || "").trim();
      if (!code) {
        const [countRow] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(schema.suppliers);
        code = `PBF-${String(Number(countRow?.count || 0) + 1).padStart(3, "0")}`;
      }

      const [existing] = await db
        .select({ id: schema.suppliers.id })
        .from(schema.suppliers)
        .where(and(eq(schema.suppliers.tenantId, tenant.id), eq(schema.suppliers.code, code)))
        .limit(1);

      if (existing) {
        code = `${code}-${Date.now().toString().slice(-4)}`;
      }

      const [created] = await db
        .insert(schema.suppliers)
        .values({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          code,
          name: body.name.trim(),
          phone: body.phone ? body.phone.trim() : null,
          email: body.email ? body.email.trim() : null,
          address: body.address ? body.address.trim() : null,
          contactPerson: body.contactPerson ? body.contactPerson.trim() : null,
          paymentTermDays: Number(body.paymentTermDays ?? body.topDays ?? 30),
          leadTimeDays: Number(body.leadTimeDays ?? 3),
          isConsignment: Boolean(body.isConsignment),
          isActive: body.isActive ?? true
        })
        .returning();

      return {
        success: true,
        message: `Distributor "${created.name}" berhasil ditambahkan`,
        data: {
          id: created.id,
          code: created.code,
          name: created.name,
          phone: created.phone || "",
          email: created.email || "",
          address: created.address || "",
          topDays: created.paymentTermDays,
          paymentTermDays: created.paymentTermDays,
          contactPerson: created.contactPerson || "",
          pbfLicense: created.code,
          isConsignment: Boolean(created.isConsignment),
          isActive: created.isActive
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 2C. UPDATE SUPPLIER (PBF)
  .put("/suppliers/:id", async ({ params, body }: { params: { id: string }; body: any }) => {
    try {
      const [supplier] = await db
        .select()
        .from(schema.suppliers)
        .where(eq(schema.suppliers.id, params.id))
        .limit(1);

      if (!supplier) {
        return { success: false, error: "Distributor tidak ditemukan" };
      }

      const updateData: any = {};
      if (body.name !== undefined) updateData.name = body.name.trim();
      if (body.code !== undefined) updateData.code = body.code.trim();
      if (body.phone !== undefined) updateData.phone = body.phone ? body.phone.trim() : null;
      if (body.email !== undefined) updateData.email = body.email ? body.email.trim() : null;
      if (body.address !== undefined) updateData.address = body.address ? body.address.trim() : null;
      if (body.contactPerson !== undefined) updateData.contactPerson = body.contactPerson ? body.contactPerson.trim() : null;
      if (body.paymentTermDays !== undefined || body.topDays !== undefined) {
        updateData.paymentTermDays = Number(body.paymentTermDays ?? body.topDays);
      }
      if (body.leadTimeDays !== undefined) updateData.leadTimeDays = Number(body.leadTimeDays);
      if (body.isConsignment !== undefined) updateData.isConsignment = Boolean(body.isConsignment);
      if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);

      const [updated] = await db
        .update(schema.suppliers)
        .set(updateData)
        .where(eq(schema.suppliers.id, params.id))
        .returning();

      return {
        success: true,
        message: `Distributor "${updated.name}" berhasil diperbarui`,
        data: {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          phone: updated.phone || "",
          email: updated.email || "",
          address: updated.address || "",
          topDays: updated.paymentTermDays,
          paymentTermDays: updated.paymentTermDays,
          contactPerson: updated.contactPerson || "",
          pbfLicense: updated.code,
          isConsignment: Boolean(updated.isConsignment),
          isActive: updated.isActive
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 2D. HAPUS / NONAKTIFKAN SUPPLIER (PBF)
  .delete("/suppliers/:id", async ({ params }: { params: { id: string } }) => {
    try {
      const [supplier] = await db
        .select()
        .from(schema.suppliers)
        .where(eq(schema.suppliers.id, params.id))
        .limit(1);

      if (!supplier) {
        return { success: false, error: "Distributor tidak ditemukan" };
      }

      const [invoiceUsage] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.purchaseInvoices)
        .where(eq(schema.purchaseInvoices.supplierId, params.id));

      const [poUsage] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.purchaseOrders)
        .where(eq(schema.purchaseOrders.supplierId, params.id));

      const [ksnUsage] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.consignmentReceipts)
        .where(eq(schema.consignmentReceipts.supplierId, params.id));

      const hasHistory =
        (Number(invoiceUsage?.count || 0) + Number(poUsage?.count || 0) + Number(ksnUsage?.count || 0)) > 0;

      if (hasHistory) {
        await db
          .update(schema.suppliers)
          .set({ isActive: false })
          .where(eq(schema.suppliers.id, params.id));

        return {
          success: true,
          action: "soft_deleted",
          message: `Distributor "${supplier.name}" dinonaktifkan karena memiliki riwayat transaksi faktur / SP.`
        };
      } else {
        await db
          .delete(schema.suppliers)
          .where(eq(schema.suppliers.id, params.id));

        return {
          success: true,
          action: "hard_deleted",
          message: `Distributor "${supplier.name}" berhasil dihapus permanen.`
        };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 3. CUSTOMERS (PELANGGAN & PASIEN)
  .get("/customers", async () => {
    try {
      const customers = await db
        .select()
        .from(schema.customers)
        .orderBy(schema.customers.name)
        .limit(1000);

      return {
        success: true,
        data: customers.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          phone: c.phone || "",
          address: c.address || "",
          customerType: c.customerType || "UMUM",
          priceTier: c.customerType === "MEMBER" ? "member" : "general",
          pointBalance: c.pointBalance || 0,
          loyaltyPoints: c.pointBalance || 0,
          isActive: c.isActive !== false,
          createdAt: c.createdAt
        }))
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 3A. BUKU PIUTANG / BON PASIEN (RECEIVABLES)
  .get("/customers/receivables", async () => {
    try {
      const unpaidSales = await db
        .select({
          id: schema.salesTransactions.id,
          invoiceRef: schema.salesTransactions.invoiceNo,
          customerId: schema.salesTransactions.customerId,
          patientName: schema.salesTransactions.patientName,
          customerName: schema.customers.name,
          customerCode: schema.customers.code,
          customerPhone: schema.customers.phone,
          grandTotal: schema.salesTransactions.grandTotal,
          paidAmount: schema.salesTransactions.paidAmount,
          createdAt: schema.salesTransactions.createdAt
        })
        .from(schema.salesTransactions)
        .leftJoin(schema.customers, eq(schema.salesTransactions.customerId, schema.customers.id))
        .where(sql`${schema.salesTransactions.grandTotal} > ${schema.salesTransactions.paidAmount}`)
        .orderBy(desc(schema.salesTransactions.createdAt));

      const mapped = unpaidSales.map((s) => {
        const total = Number(s.grandTotal);
        const paid = Number(s.paidAmount || 0);
        const debt = Math.max(0, total - paid);
        const saleDate = new Date(s.createdAt);
        const dueDate = new Date(saleDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        const isDueSoon = new Date().getTime() > dueDate.getTime() - 3 * 24 * 60 * 60 * 1000;

        return {
          id: s.id,
          transactionId: s.id,
          customerId: s.customerId,
          customerName: s.customerName || s.patientName || "Pelanggan Umum",
          code: s.customerCode || "-",
          phone: s.customerPhone || "-",
          invoiceRef: s.invoiceRef,
          totalDebt: debt,
          dueDate: dueDate.toISOString().slice(0, 10),
          status: isDueSoon ? "DUE_SOON" : "ACTIVE"
        };
      });

      return {
        success: true,
        data: mapped
      };
    } catch (err: any) {
      return { success: false, error: err.message, data: [] };
    }
  })

  // 3B. TERIMA BAYAR PIUTANG / BON PASIEN
  .post("/customers/receivables/pay", async ({ body }: { body: any }) => {
    try {
      const { transactionId, amountPaid, paymentMethod, operator } = body;
      const numAmount = Number(amountPaid);
      if (!transactionId || numAmount <= 0) {
        return { success: false, error: "ID transaksi dan nominal pembayaran wajib diisi" };
      }

      const [sale] = await db
        .select()
        .from(schema.salesTransactions)
        .where(eq(schema.salesTransactions.id, transactionId))
        .limit(1);

      if (!sale) {
        return { success: false, error: "Transaksi penjualan / bon tidak ditemukan" };
      }

      const currentPaid = Number(sale.paidAmount || 0);
      const settlement = calculateDebtSettlement(Number(sale.grandTotal), currentPaid, numAmount);

      await db
        .update(schema.salesTransactions)
        .set({
          paidAmount: String(settlement.newPaidAmount),
          changeAmount: String(Math.max(0, currentPaid + numAmount - Number(sale.grandTotal)))
        })
        .where(eq(schema.salesTransactions.id, transactionId));

      const acc = (paymentMethod || "KAS_TUNAI").toUpperCase().includes("BCA") ? "BANK_BCA" : "KAS_LACI";
      await db.insert(schema.cashMutations).values({
        id: crypto.randomUUID(),
        tenantId: sale.tenantId,
        branchId: sale.branchId,
        type: "IN",
        category: "Pelunasan Piutang Pasien",
        account: acc,
        refNumber: sale.invoiceNo,
        amount: String(numAmount),
        description: `Pelunasan piutang pasien nota ${sale.invoiceNo} (${sale.patientName || "Umum"})`,
        operator: operator || "Kasir",
        transactionDate: new Date(),
        createdAt: new Date()
      });

      return {
        success: true,
        message: `Pembayaran piutang nota ${sale.invoiceNo} sebesar Rp ${numAmount.toLocaleString("id-ID")} berhasil dicatat.`
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 3C. TAMBAH CUSTOMER BARU
  .post("/customers", async ({ body }: { body: any }) => {
    try {
      if (!body.name || !body.name.trim()) {
        return { success: false, error: "Nama pelanggan wajib diisi" };
      }

      const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      if (!tenant) throw new Error("Tenant aktif tidak ditemukan");

      let code = (body.code || "").trim().toUpperCase();
      if (!code) {
        const [countRow] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(schema.customers);
        code = `CUST-${String(Number(countRow?.count || 0) + 1).padStart(4, "0")}`;
        const [existingCode] = await db
          .select({ id: schema.customers.id })
          .from(schema.customers)
          .where(eq(schema.customers.code, code))
          .limit(1);
        if (existingCode) {
          code = `CUST-${Date.now().toString().slice(-6)}`;
        }
      }

      const rawType = String(body.customerType || (body.priceTier === "member" ? "MEMBER" : "UMUM")).toUpperCase();
      const customerType = ["MEMBER", "RESEP", "GROSIR"].includes(rawType) ? rawType : "UMUM";
      const pointBalance = Number(body.pointBalance ?? body.loyaltyPoints ?? 0);
      const isActive = body.isActive !== false;

      const [created] = await db
        .insert(schema.customers)
        .values({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          code,
          name: body.name.trim(),
          phone: body.phone ? body.phone.trim() : null,
          address: body.address ? body.address.trim() : null,
          customerType,
          pointBalance,
          isActive
        })
        .returning();

      return {
        success: true,
        message: `Pelanggan "${created.name}" berhasil ditambahkan`,
        data: {
          id: created.id,
          code: created.code,
          name: created.name,
          phone: created.phone || "",
          address: created.address || "",
          customerType: created.customerType,
          priceTier: created.customerType === "MEMBER" ? "member" : "general",
          pointBalance: created.pointBalance || 0,
          loyaltyPoints: created.pointBalance || 0,
          isActive: created.isActive !== false
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 3D. UPDATE CUSTOMER
  .put("/customers/:id", async ({ params, body }: { params: { id: string }; body: any }) => {
    try {
      const updateData: any = {};
      if (body.name !== undefined) updateData.name = body.name.trim();
      if (body.code !== undefined) updateData.code = body.code.trim().toUpperCase();
      if (body.phone !== undefined) updateData.phone = body.phone ? body.phone.trim() : null;
      if (body.address !== undefined) updateData.address = body.address ? body.address.trim() : null;
      if (body.customerType !== undefined) {
        const rawType = String(body.customerType).toUpperCase();
        updateData.customerType = ["MEMBER", "RESEP", "GROSIR"].includes(rawType) ? rawType : "UMUM";
      } else if (body.priceTier !== undefined) {
        updateData.customerType = body.priceTier === "member" ? "MEMBER" : "UMUM";
      }
      if (body.pointBalance !== undefined) {
        updateData.pointBalance = Number(body.pointBalance);
      } else if (body.loyaltyPoints !== undefined) {
        updateData.pointBalance = Number(body.loyaltyPoints);
      }
      if (body.isActive !== undefined) {
        updateData.isActive = Boolean(body.isActive);
      }

      const [updated] = await db
        .update(schema.customers)
        .set(updateData)
        .where(eq(schema.customers.id, params.id))
        .returning();

      if (!updated) {
        return { success: false, error: "Pelanggan tidak ditemukan" };
      }

      return {
        success: true,
        message: `Pelanggan "${updated.name}" berhasil diperbarui`,
        data: {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          phone: updated.phone || "",
          address: updated.address || "",
          customerType: updated.customerType,
          priceTier: updated.customerType === "MEMBER" ? "member" : "general",
          pointBalance: updated.pointBalance || 0,
          loyaltyPoints: updated.pointBalance || 0,
          isActive: updated.isActive !== false
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 3E. HAPUS CUSTOMER
  .delete("/customers/:id", async ({ params }: { params: { id: string } }) => {
    try {
      await db.delete(schema.customers).where(eq(schema.customers.id, params.id));
      return { success: true, message: "Pelanggan berhasil dihapus" };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 4. RIWAYAT PENJUALAN KASIR
  .get("/sales", async ({ query, branchId, userRole }) => {
    try {
      const isMultiBranchUser = userRole === "OWNER" || userRole === "SUPERADMIN" || !branchId || branchId === "ALL";
      const rawBranch = query.branch_id || (query as any).branchId;
      const targetBranch = isMultiBranchUser ? (rawBranch || "ALL") : branchId;
      const limit = Number(query.limit || 200);

      const conditions = [];
      if (targetBranch && targetBranch !== "ALL") {
        conditions.push(eq(schema.salesTransactions.branchId, targetBranch));
      }

      const salesData = await db
        .select({
          id: schema.salesTransactions.id,
          invoiceNo: schema.salesTransactions.invoiceNo,
          createdAt: schema.salesTransactions.createdAt,
          branchId: schema.salesTransactions.branchId,
          branchName: schema.branches.name,
          branchPhone: schema.branches.phone,
          customerType: schema.salesTransactions.customerType,
          customerId: schema.salesTransactions.customerId,
          customerName: schema.customers.name,
          patientName: schema.salesTransactions.patientName,
          doctorName: schema.salesTransactions.doctorName,
          cashierUserId: schema.salesTransactions.cashierUserId,
          cashierName: schema.users.fullName,
          shiftNumber: schema.cashierShifts.shiftNumber,
          paymentMethod: schema.salesTransactions.paymentMethod,
          subtotal: schema.salesTransactions.subtotal,
          discountAmount: schema.salesTransactions.discountAmount,
          taxAmount: schema.salesTransactions.taxAmount,
          tuslahAmount: schema.salesTransactions.tuslahAmount,
          embalaseAmount: schema.salesTransactions.embalaseAmount,
          grandTotal: schema.salesTransactions.grandTotal,
          paidAmount: schema.salesTransactions.paidAmount,
          changeAmount: schema.salesTransactions.changeAmount,
          status: schema.salesTransactions.status,
          voidReason: schema.salesTransactions.voidReason,
          voidedAt: schema.salesTransactions.voidedAt,
          voidedBy: schema.salesTransactions.voidedBy
        })
        .from(schema.salesTransactions)
        .leftJoin(
          schema.branches,
          eq(schema.salesTransactions.branchId, schema.branches.id)
        )
        .leftJoin(
          schema.customers,
          eq(schema.salesTransactions.customerId, schema.customers.id)
        )
        .leftJoin(
          schema.users,
          eq(schema.salesTransactions.cashierUserId, schema.users.id)
        )
        .leftJoin(
          schema.cashierShifts,
          eq(schema.salesTransactions.cashierShiftId, schema.cashierShifts.id)
        )
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.salesTransactions.createdAt))
        .limit(limit);

      // Fetch items for each transaction
      const saleIds = salesData.map((s) => s.id);
      const itemsBySaleId = new Map<string, any[]>();

      if (saleIds.length > 0) {
        const itemsData = await db
          .select({
            id: schema.salesTransactionItems.id,
            transactionId: schema.salesTransactionItems.transactionId,
            productId: schema.salesTransactionItems.productId,
            productName: schema.products.name,
            batchId: schema.salesTransactionItems.batchId,
            batchNo: schema.productBatches.batchNo,
            expDate: schema.productBatches.expiredDate,
            qty: schema.salesTransactionItems.qty,
            unitName: schema.salesTransactionItems.unitName,
            unitPrice: schema.salesTransactionItems.unitPrice,
            subtotal: schema.salesTransactionItems.subtotal,
            dosageRules: schema.salesTransactionItems.dosageRules
          })
          .from(schema.salesTransactionItems)
          .leftJoin(
            schema.products,
            eq(schema.salesTransactionItems.productId, schema.products.id)
          )
          .leftJoin(
            schema.productBatches,
            eq(schema.salesTransactionItems.batchId, schema.productBatches.id)
          )
          .where(sql`${schema.salesTransactionItems.transactionId} IN ${saleIds}`);

        for (const item of itemsData) {
          const list = itemsBySaleId.get(item.transactionId) || [];
          list.push({
            id: item.id,
            productId: item.productId,
            productName: item.productName || "Obat",
            batchNo: item.batchNo || "BATCH-REG",
            expDate: item.expDate || "-",
            qty: Number(item.qty),
            unit: item.unitName,
            price: Number(item.unitPrice),
            subtotal: Number(item.subtotal),
            dosageRules: item.dosageRules
          });
          itemsBySaleId.set(item.transactionId, list);
        }
      }

      return {
        success: true,
        data: salesData.map((s) => {
          const items = itemsBySaleId.get(s.id) || [];
          const paid = Number(s.paidAmount);
          const total = Number(s.grandTotal);
          let paymentStatus = "PAID";
          if (s.status === "VOID") {
            paymentStatus = "VOID";
          } else if (paid < total) {
            paymentStatus = paid > 0 ? "PARTIAL" : "UNPAID";
          }

          return {
            id: s.id,
            branchId: s.branchId,
            branchName: s.branchName || "Apotek Hafidz Farma",
            branchPhone: s.branchPhone || "",
            invoiceNo: s.invoiceNo,
            invoiceNumber: s.invoiceNo,
            status: s.status || "COMPLETED",
            voidReason: s.voidReason || null,
            voidedAt: s.voidedAt ? s.voidedAt.toISOString() : null,
            createdAt: s.createdAt.toLocaleString("id-ID", {
              dateStyle: "medium",
              timeStyle: "short"
            }),
            transactionTime: s.createdAt.toISOString(),
            cashierName: s.cashierName || "Kasir Utama",
            cashierShift:
              s.shiftNumber === 1
                ? "Shift Pagi"
                : s.shiftNumber === 2
                ? "Shift Siang"
                : "Shift Malam",
            customerName:
              s.customerName ||
              (s.customerType === "MEMBER" ? "Member Pasien" : "Pelanggan Umum"),
            patientName: s.patientName || null,
            doctorName: s.doctorName || null,
            transactionType: s.customerType || "UMUM",
            paymentMethod: s.paymentMethod,
            paymentStatus,
            subtotal: Number(s.subtotal),
            discountAmount: Number(s.discountAmount),
            taxAmount: Number(s.taxAmount),
            tuslahAmount: Number(s.tuslahAmount || 0),
            embalaseAmount: Number(s.embalaseAmount || 0),
            grandTotal: total,
            paidAmount: paid,
            changeAmount: Number(s.changeAmount),
            itemsCount: items.length,
            items
          };
        })
      };
    } catch (err: any) {
      console.error("[ERP] /sales error:", err);
      return { success: false, error: err.message, data: [] };
    }
  })

  // 4B. VOID / BATALKAN TRANSAKSI PENJUALAN KASIR (REVERSI STOK BATCH & MUTASI VOID)
  .post(
    "/sales/:id/void",
    async ({ params, body, userId, set }) => {
      try {
        const transactionId = params.id;
        const reason = (body?.reason || "Pembatalan transaksi kasir").trim();

        // 1. Ambil data transaksi penjualan
        const [trx] = await db
          .select()
          .from(schema.salesTransactions)
          .where(eq(schema.salesTransactions.id, transactionId))
          .limit(1);

        if (!trx) {
          set.status = 404;
          return { success: false, error: "Transaksi penjualan tidak ditemukan" };
        }

        if (trx.status === "VOID") {
          set.status = 400;
          return { success: false, error: "Transaksi ini sudah dibatalkan (VOID) sebelumnya" };
        }

        // 2. Ambil seluruh item transaksi untuk reversi stok
        const items = await db
          .select()
          .from(schema.salesTransactionItems)
          .where(eq(schema.salesTransactionItems.transactionId, transactionId));

        // 3. Reversi stok pada masing-masing batch & lokasi
        const now = new Date();
        for (const item of items) {
          const qtyToRestore = Number(item.qtyBase || 0);
          if (qtyToRestore <= 0) continue;

          if (item.locationId && trx.branchId) {
            // Restore branchBatchStocks jika ada batchId
            if (item.batchId) {
              await db
                .update(schema.branchBatchStocks)
                .set({
                  qtyBase: sql`${schema.branchBatchStocks.qtyBase} + ${qtyToRestore}`,
                  updatedAt: now
                })
                .where(
                  and(
                    eq(schema.branchBatchStocks.branchId, trx.branchId),
                    eq(schema.branchBatchStocks.productId, item.productId),
                    eq(schema.branchBatchStocks.batchId, item.batchId),
                    eq(schema.branchBatchStocks.locationId, item.locationId)
                  )
                );
            }

            // Restore branchStocks
            await db
              .update(schema.branchStocks)
              .set({
                totalQtyBase: sql`${schema.branchStocks.totalQtyBase} + ${qtyToRestore}`,
                updatedAt: now
              })
              .where(
                and(
                  eq(schema.branchStocks.branchId, trx.branchId),
                  eq(schema.branchStocks.productId, item.productId),
                  eq(schema.branchStocks.locationId, item.locationId)
                )
              );
          }

          // Catat audit trail di stockLedger
          try {
            const auditUser = (userId && typeof userId === "string" && userId.length > 10)
              ? userId
              : (trx.cashierUserId || crypto.randomUUID());

            await db.insert(schema.stockLedger).values({
              tenantId: trx.tenantId,
              branchId: trx.branchId,
              productId: item.productId,
              locationId: item.locationId || null,
              batchId: item.batchId || null,
              mutationType: "SALES_VOID",
              quantityBase: String(qtyToRestore),
              costPerUnit: String(item.unitPrice || 0),
              referenceId: trx.id,
              notes: `Void Penjualan Nota ${trx.invoiceNo}: ${reason}`,
              createdBy: auditUser,
              createdAt: now
            });
          } catch (_) {}
        }

        // 4. Update status transaksi menjadi VOID
        await db
          .update(schema.salesTransactions)
          .set({
            status: "VOID",
            voidReason: reason,
            voidedAt: now,
            voidedBy: userId || null
          })
          .where(eq(schema.salesTransactions.id, transactionId));

        return {
          success: true,
          message: `Transaksi nota ${trx.invoiceNo} berhasil dibatalkan (VOID). Saldo stok telah dipulihkan ke batch apotek.`
        };
      } catch (err: any) {
        set.status = 500;
        return { success: false, error: err.message || "Gagal membatalkan transaksi penjualan" };
      }
    },
    {
      body: t.Object({
        reason: t.Optional(t.String())
      }),
      detail: {
        tags: ["ERP & Sales"],
        summary: "Void / Batalkan Transaksi Penjualan Kasir"
      }
    }
  )

  // 5. FAKTUR PEMBELIAN PBF
  .get("/purchases", async ({ query }) => {
    try {
      const limit = Number(query.limit || 100);
      const purchases = await db
        .select({
          id: schema.purchaseInvoices.id,
          branchId: schema.purchaseInvoices.branchId,
          branchName: schema.branches.name,
          supplierId: schema.purchaseInvoices.supplierId,
          supplierName: schema.suppliers.name,
          purchaseOrderId: schema.purchaseInvoices.purchaseOrderId,
          poNumber: schema.purchaseOrders.poNumber,
          invoiceNumber: schema.purchaseInvoices.invoiceNumber,
          receiveDate: schema.purchaseInvoices.receiveDate,
          invoiceDate: schema.purchaseInvoices.invoiceDate,
          dueDate: schema.purchaseInvoices.dueDate,
          isCredit: schema.purchaseInvoices.isCredit,
          subtotal: schema.purchaseInvoices.subtotal,
          discountAmount: schema.purchaseInvoices.discountAmount,
          taxAmount: schema.purchaseInvoices.taxAmount,
          grandTotal: schema.purchaseInvoices.grandTotal,
          paidAmount: schema.purchaseInvoices.paidAmount,
          isPaidOff: schema.purchaseInvoices.isPaidOff
        })
        .from(schema.purchaseInvoices)
        .leftJoin(
          schema.suppliers,
          eq(schema.purchaseInvoices.supplierId, schema.suppliers.id)
        )
        .leftJoin(
          schema.branches,
          eq(schema.purchaseInvoices.branchId, schema.branches.id)
        )
        .leftJoin(
          schema.purchaseOrders,
          eq(schema.purchaseInvoices.purchaseOrderId, schema.purchaseOrders.id)
        )
        .orderBy(desc(schema.purchaseInvoices.receiveDate), desc(schema.purchaseInvoices.createdAt))
        .limit(limit);

      const invoiceIds = purchases.map((p) => p.id);
      const itemsCountMap = new Map<string, number>();

      if (invoiceIds.length > 0) {
        const itemCounts = await db
          .select({
            invoiceId: schema.purchaseInvoiceItems.invoiceId,
            cnt: count()
          })
          .from(schema.purchaseInvoiceItems)
          .where(sql`${schema.purchaseInvoiceItems.invoiceId} IN ${invoiceIds}`)
          .groupBy(schema.purchaseInvoiceItems.invoiceId);

        for (const ic of itemCounts) {
          itemsCountMap.set(ic.invoiceId, Number(ic.cnt));
        }
      }

      return {
        success: true,
        data: purchases.map((p) => ({
          id: p.id,
          invoiceNumber: p.invoiceNumber,
          poNumber: p.poNumber || (p.purchaseOrderId ? `SP-${p.invoiceNumber.slice(0, 6)}` : undefined),
          supplierId: p.supplierId,
          supplierName: p.supplierName || "PBF",
          branchId: p.branchId,
          branchName: p.branchName || "Apotek Hafidz Farma",
          invoiceDate: p.invoiceDate || p.receiveDate,
          receiveDate: p.receiveDate,
          dueDate: p.dueDate,
          isCredit: p.isCredit,
          subtotal: Number(p.subtotal),
          discountAmount: Number(p.discountAmount),
          taxAmount: Number(p.taxAmount),
          grandTotal: Number(p.grandTotal),
          totalAmount: Number(p.grandTotal),
          paidAmount: Number(p.paidAmount),
          isPaidOff: p.isPaidOff,
          itemsCount: itemsCountMap.get(p.id) || 1,
          taxPercent: 11,
          notes: "Faktur Pembelian PBF Terverifikasi"
        }))
      };
    } catch (err: any) {
      return { success: false, error: err.message, data: [] };
    }
  })

  // 5A-1. DETAIL 1 FAKTUR PEMBELIAN LENGKAP DENGAN ITEM ROWS & RIWAYAT PEMBAYARAN
  .get("/purchases/:id", async ({ params }) => {
    try {
      const [invoice] = await db
        .select({
          id: schema.purchaseInvoices.id,
          branchId: schema.purchaseInvoices.branchId,
          branchName: schema.branches.name,
          supplierId: schema.purchaseInvoices.supplierId,
          supplierName: schema.suppliers.name,
          purchaseOrderId: schema.purchaseInvoices.purchaseOrderId,
          poNumber: schema.purchaseOrders.poNumber,
          invoiceNumber: schema.purchaseInvoices.invoiceNumber,
          receiveDate: schema.purchaseInvoices.receiveDate,
          invoiceDate: schema.purchaseInvoices.invoiceDate,
          dueDate: schema.purchaseInvoices.dueDate,
          isCredit: schema.purchaseInvoices.isCredit,
          subtotal: schema.purchaseInvoices.subtotal,
          discountAmount: schema.purchaseInvoices.discountAmount,
          taxAmount: schema.purchaseInvoices.taxAmount,
          grandTotal: schema.purchaseInvoices.grandTotal,
          paidAmount: schema.purchaseInvoices.paidAmount,
          isPaidOff: schema.purchaseInvoices.isPaidOff
        })
        .from(schema.purchaseInvoices)
        .leftJoin(schema.suppliers, eq(schema.purchaseInvoices.supplierId, schema.suppliers.id))
        .leftJoin(schema.branches, eq(schema.purchaseInvoices.branchId, schema.branches.id))
        .leftJoin(schema.purchaseOrders, eq(schema.purchaseInvoices.purchaseOrderId, schema.purchaseOrders.id))
        .where(eq(schema.purchaseInvoices.id, params.id))
        .limit(1);

      if (!invoice) {
        return { success: false, error: "Faktur pembelian tidak ditemukan" };
      }

      const items = await db
        .select({
          id: schema.purchaseInvoiceItems.id,
          productId: schema.purchaseInvoiceItems.productId,
          productName: schema.products.name,
          batchNo: schema.productBatches.batchNo,
          expiredDate: schema.productBatches.expiredDate,
          unit: schema.purchaseInvoiceItems.unitName,
          qty: schema.purchaseInvoiceItems.qty,
          buyPrice: schema.purchaseInvoiceItems.buyPrice,
          disc1: schema.purchaseInvoiceItems.discountPercent,
          discountAmount: schema.purchaseInvoiceItems.discountAmount,
          subtotal: schema.purchaseInvoiceItems.subtotal
        })
        .from(schema.purchaseInvoiceItems)
        .leftJoin(schema.products, eq(schema.purchaseInvoiceItems.productId, schema.products.id))
        .leftJoin(schema.productBatches, eq(schema.purchaseInvoiceItems.batchId, schema.productBatches.id))
        .where(eq(schema.purchaseInvoiceItems.invoiceId, invoice.id))
        .orderBy(schema.purchaseInvoiceItems.lineNo);

      const payments = await db
        .select({
          id: schema.debtPayments.id,
          paymentNumber: schema.debtPayments.paymentNumber,
          paymentDate: schema.debtPayments.paymentDate,
          paymentMethod: schema.debtPayments.paymentMethod,
          amountPaid: schema.debtPayments.amountPaid
        })
        .from(schema.debtPayments)
        .where(eq(schema.debtPayments.purchaseInvoiceId, invoice.id))
        .orderBy(desc(schema.debtPayments.paymentDate));

      return {
        success: true,
        data: {
          ...invoice,
          subtotal: Number(invoice.subtotal),
          discountAmount: Number(invoice.discountAmount),
          taxAmount: Number(invoice.taxAmount),
          grandTotal: Number(invoice.grandTotal),
          totalAmount: Number(invoice.grandTotal),
          paidAmount: Number(invoice.paidAmount),
          itemsCount: items.length,
          taxPercent: 11,
          notes: "Faktur Pembelian PBF Terverifikasi",
          items: items.map((it) => ({
            productId: it.productId,
            productName: it.productName || "Obat",
            batchNo: it.batchNo || "BATCH",
            expiredDate: it.expiredDate || "-",
            unit: it.unit,
            qty: Number(it.qty),
            hna: Number(it.buyPrice),
            disc1: Number(it.disc1),
            disc2: 0,
            subtotal: Number(it.subtotal)
          })),
          payments: payments.map((p) => ({
            paymentNumber: p.paymentNumber,
            paymentDate: p.paymentDate,
            paymentMethod: p.paymentMethod,
            amountPaid: Number(p.amountPaid)
          }))
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 5A-2. BATALKAN / VOID FAKTUR PEMBELIAN (REVERSI STOK, PULIHKAN SP, & AUDIT TRAIL)
  .delete("/purchases/:id", async ({ params }) => {
    try {
      const [invoice] = await db
        .select()
        .from(schema.purchaseInvoices)
        .where(eq(schema.purchaseInvoices.id, params.id))
        .limit(1);

      if (!invoice) {
        return { success: false, error: "Faktur pembelian tidak ditemukan" };
      }

      const [paymentCount] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.debtPayments)
        .where(eq(schema.debtPayments.purchaseInvoiceId, invoice.id));

      if (Number(invoice.paidAmount) > 0 || Number(paymentCount?.count || 0) > 0) {
        return {
          success: false,
          error: "Faktur yang sudah memiliki riwayat pembayaran tidak dapat dihapus langsung. Batalkan pembayaran terlebih dahulu."
        };
      }

      const now = new Date();
      let restoredPoStatus: string | null = null;
      let restoredPoNumber: string | null = null;

      await db.transaction(async (tx) => {
        const items = await tx
          .select()
          .from(schema.purchaseInvoiceItems)
          .where(eq(schema.purchaseInvoiceItems.invoiceId, invoice.id));

        // 1. Validasi stok batch mencukupi sebelum menarik stok (cegah void faktur yang sudah terjual)
        for (const item of items) {
          const qtyBase = Number(item.qtyBase || 0);
          if (qtyBase <= 0) continue;

          if (item.batchId) {
            const [batchStock] = await tx
              .select()
              .from(schema.branchBatchStocks)
              .where(
                and(
                  eq(schema.branchBatchStocks.branchId, invoice.branchId),
                  eq(schema.branchBatchStocks.locationId, item.locationId),
                  eq(schema.branchBatchStocks.productId, item.productId),
                  eq(schema.branchBatchStocks.batchId, item.batchId)
                )
              )
              .limit(1);

            const availableBatch = Number(batchStock?.qtyBase || 0);
            if (!batchStock || availableBatch < qtyBase - 0.0001) {
              throw new Error(
                `Faktur ${invoice.invoiceNumber} tidak dapat dibatalkan karena sebagian stok batch dari faktur ini sudah berkurang atau terjual (tersedia ${availableBatch}, dibutuhkan ${qtyBase}).`
              );
            }
          }
        }

        // 2. Reversi stok fisik per item, tulis stock_ledger, dan sentuh updatedAt produk
        for (const item of items) {
          const qtyBase = Number(item.qtyBase || 0);
          if (item.batchId) {
            const [batchStock] = await tx
              .select()
              .from(schema.branchBatchStocks)
              .where(
                and(
                  eq(schema.branchBatchStocks.branchId, invoice.branchId),
                  eq(schema.branchBatchStocks.locationId, item.locationId),
                  eq(schema.branchBatchStocks.productId, item.productId),
                  eq(schema.branchBatchStocks.batchId, item.batchId)
                )
              )
              .limit(1);

            if (batchStock) {
              const newQty = Number(batchStock.qtyBase) - qtyBase;
              if (newQty <= 0.0001) {
                await tx
                  .delete(schema.branchBatchStocks)
                  .where(eq(schema.branchBatchStocks.id, batchStock.id));
              } else {
                await tx
                  .update(schema.branchBatchStocks)
                  .set({ qtyBase: String(newQty), updatedAt: now })
                  .where(eq(schema.branchBatchStocks.id, batchStock.id));
              }
            }
          }

          const [branchStock] = await tx
            .select()
            .from(schema.branchStocks)
            .where(
              and(
                eq(schema.branchStocks.locationId, item.locationId),
                eq(schema.branchStocks.productId, item.productId)
              )
            )
            .limit(1);

          if (branchStock) {
            const newTotal = Math.max(0, Number(branchStock.totalQtyBase) - qtyBase);
            await tx
              .update(schema.branchStocks)
              .set({ totalQtyBase: String(newTotal), updatedAt: now })
              .where(eq(schema.branchStocks.id, branchStock.id));
          }

          const voidFactor = Math.max(1, Number(item.conversionFactor || 1));
          const voidCostPerBase = Number(item.buyPrice || 0) / voidFactor;

          await tx.insert(schema.stockLedger).values({
            id: crypto.randomUUID(),
            tenantId: invoice.tenantId,
            branchId: invoice.branchId,
            locationId: item.locationId,
            productId: item.productId,
            batchId: item.batchId,
            mutationType: "PURCHASE_VOID",
            quantityBase: String(-qtyBase),
            costPerUnit: String(voidCostPerBase),
            referenceId: invoice.id,
            notes: `Pembatalan / Void Faktur Pembelian ${invoice.invoiceNumber}`,
            createdBy: invoice.receivedBy || invoice.tenantId,
            createdAt: now
          });

          await tx
            .update(schema.products)
            .set({ updatedAt: now })
            .where(eq(schema.products.id, item.productId));
        }

        // 3. Cari SP terkait (via purchaseOrderId atau fallback tag catatan faktur di purchase_order_items)
        let targetPoId = invoice.purchaseOrderId || null;
        if (!targetPoId) {
          const noteNeedle = `%[Faktur ${invoice.invoiceNumber}:%`;
          const [matchedPoItem] = await tx
            .select({ purchaseOrderId: schema.purchaseOrderItems.purchaseOrderId })
            .from(schema.purchaseOrderItems)
            .where(sql`${schema.purchaseOrderItems.notes} ILIKE ${noteNeedle}`)
            .limit(1);
          if (matchedPoItem) {
            targetPoId = matchedPoItem.purchaseOrderId;
          }
        }

        // 4. Hapus item faktur & header faktur
        await tx.delete(schema.purchaseInvoiceItems).where(eq(schema.purchaseInvoiceItems.invoiceId, invoice.id));
        await tx.delete(schema.purchaseInvoices).where(eq(schema.purchaseInvoices.id, invoice.id));

        // 5. Pulihkan qtyReceived, catatan, dan status Surat Pesanan (PO) terkait
        if (targetPoId) {
          const [poHeader] = await tx
            .select()
            .from(schema.purchaseOrders)
            .where(eq(schema.purchaseOrders.id, targetPoId))
            .limit(1);

          if (poHeader) {
            restoredPoNumber = poHeader.poNumber;
            const remainingInvoices = await tx
              .select({ id: schema.purchaseInvoices.id })
              .from(schema.purchaseInvoices)
              .where(eq(schema.purchaseInvoices.purchaseOrderId, targetPoId));

            const remainingQtyByProduct = new Map<string, number>();
            if (remainingInvoices.length > 0) {
              const remInvIds = remainingInvoices.map((r) => r.id);
              const remInvItems = await tx
                .select({
                  productId: schema.purchaseInvoiceItems.productId,
                  qty: schema.purchaseInvoiceItems.qty
                })
                .from(schema.purchaseInvoiceItems)
                .where(sql`${schema.purchaseInvoiceItems.invoiceId} IN ${remInvIds}`);

              for (const rit of remInvItems) {
                remainingQtyByProduct.set(
                  rit.productId,
                  (remainingQtyByProduct.get(rit.productId) || 0) + Number(rit.qty || 0)
                );
              }
            }

            const poItems = await tx
              .select()
              .from(schema.purchaseOrderItems)
              .where(eq(schema.purchaseOrderItems.purchaseOrderId, targetPoId))
              .orderBy(schema.purchaseOrderItems.lineNo);

            let allFulfilled = poItems.length > 0;
            let anyReceived = false;

            for (let idx = 0; idx < poItems.length; idx++) {
              const pit = poItems[idx];
              const ordered = Number(pit.qtyOrdered || 0);
              const availForProd = remainingQtyByProduct.get(pit.productId) || 0;
              const isLastRowForProd = !poItems.slice(idx + 1).some((x) => x.productId === pit.productId);
              const newReceived = isLastRowForProd ? availForProd : Math.min(ordered, availForProd);
              remainingQtyByProduct.set(pit.productId, Math.max(0, availForProd - newReceived));

              if (newReceived > 0) anyReceived = true;
              if (newReceived < ordered) allFulfilled = false;

              const cleanedNotes = (pit.notes || "")
                .split(" | ")
                .map((s) => s.trim())
                .filter((s) => s && !s.startsWith(`[Faktur ${invoice.invoiceNumber}:`))
                .join(" | ");

              await tx
                .update(schema.purchaseOrderItems)
                .set({
                  qtyReceived: String(newReceived),
                  notes: cleanedNotes || null
                })
                .where(eq(schema.purchaseOrderItems.id, pit.id));
            }

            restoredPoStatus = allFulfilled ? "RECEIVED" : anyReceived ? "PARTIAL" : "ORDERED";
            await tx
              .update(schema.purchaseOrders)
              .set({ status: restoredPoStatus })
              .where(eq(schema.purchaseOrders.id, targetPoId));
          }
        }
      });

      const poSuffix = restoredPoNumber
        ? ` dan status ${restoredPoNumber} dikembalikan ke ${restoredPoStatus}.`
        : ".";

      return {
        success: true,
        message: `Faktur Pembelian ${invoice.invoiceNumber} berhasil dibatalkan, stok ditarik kembali${poSuffix}`
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 5B. INPUT FAKTUR PEMBELIAN MASUK PBF (GOOD RECEIPT & AUTO-FILL STOK KELOMPOK C)
  .post("/purchases", async ({ body }: { body: any }) => {
    try {
      const isUuid = (val?: string) =>
        Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

      // 1. Resolve Tenant
      const [t] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      if (!t) throw new Error("Tenant aktif tidak ditemukan");
      const tenantId = t.id;

      // 2. Resolve Branch
      let branchId = isUuid(body.branchId) ? body.branchId : undefined;
      if (!branchId) {
        const [b] = await db
          .select({ id: schema.branches.id })
          .from(schema.branches)
          .where(eq(schema.branches.tenantId, tenantId))
          .limit(1);
        branchId = b ? b.id : crypto.randomUUID();
      }

      // 3. Resolve Location
      let locationId = isUuid(body.locationId) ? body.locationId : undefined;
      if (!locationId) {
        const [loc] = await db
          .select({ id: schema.inventoryLocations.id })
          .from(schema.inventoryLocations)
          .where(and(eq(schema.inventoryLocations.branchId, branchId), eq(schema.inventoryLocations.isDefault, true)))
          .limit(1);
        if (loc) {
          locationId = loc.id;
        } else {
          const [anyLoc] = await db
            .select({ id: schema.inventoryLocations.id })
            .from(schema.inventoryLocations)
            .where(eq(schema.inventoryLocations.branchId, branchId))
            .limit(1);
          if (anyLoc) {
            locationId = anyLoc.id;
          } else {
            locationId = crypto.randomUUID();
            await db.insert(schema.inventoryLocations).values({
              id: locationId,
              tenantId,
              branchId,
              code: "DEPO-UTAMA",
              name: "Etalase Depo Utama",
              isDefault: true,
              isActive: true
            });
          }
        }
      }

      // 4. Resolve Supplier
      let supplierId = isUuid(body.supplierId) ? body.supplierId : undefined;
      if (!supplierId && body.supplierName) {
        const [s] = await db
          .select({ id: schema.suppliers.id })
          .from(schema.suppliers)
          .where(sql`${schema.suppliers.name} ILIKE ${body.supplierName}`)
          .limit(1);
        if (s) supplierId = s.id;
      }
      if (!supplierId) {
        const [anySup] = await db.select({ id: schema.suppliers.id }).from(schema.suppliers).limit(1);
        supplierId = anySup ? anySup.id : crypto.randomUUID();
      }

      // 5. Resolve User (ReceivedBy)
      const [u] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
      const receivedBy = u ? u.id : crypto.randomUUID();

      const invoiceId = crypto.randomUUID();
      const invoiceNumber = (body.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`).trim().toUpperCase();
      const now = new Date();
      const receiveDate = body.receiveDate || now.toISOString().slice(0, 10);
      const invoiceDate = body.invoiceDate || receiveDate;
      const dueDate = body.dueDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const subtotal = Number(body.subtotal || 0);
      const discountAmount = Number(body.discountAmount || 0);
      const taxAmount = Number(body.taxAmount || 0);
      const grandTotal = Number(body.grandTotal || (subtotal - discountAmount + taxAmount));

      // Jalankan transaksi database atomik
      const result = await db.transaction(async (tx) => {
        // Resolve Surat Pesanan (PO) lebih awal agar purchaseOrderId pada faktur selalu terisi konsisten
        let targetPoId: string | null = null;
        if (body.purchaseOrderId && isUuid(body.purchaseOrderId)) {
          targetPoId = body.purchaseOrderId;
        } else if (body.poNumber && body.poNumber !== "NONE") {
          const [foundPo] = await tx
            .select({ id: schema.purchaseOrders.id })
            .from(schema.purchaseOrders)
            .where(
              and(
                eq(schema.purchaseOrders.tenantId, tenantId),
                eq(schema.purchaseOrders.poNumber, body.poNumber)
              )
            )
            .limit(1);
          if (foundPo) targetPoId = foundPo.id;
        }

        // A. Insert ke purchase_invoices
        const [createdInvoice] = await tx
          .insert(schema.purchaseInvoices)
          .values({
            id: invoiceId,
            tenantId,
            branchId,
            supplierId,
            purchaseOrderId: targetPoId,
            invoiceNumber,
            receiveDate,
            invoiceDate,
            dueDate,
            isCredit: body.isCredit ?? true,
            subtotal: String(subtotal),
            discountAmount: String(discountAmount),
            taxAmount: String(taxAmount),
            grandTotal: String(grandTotal),
            paidAmount: "0",
            isPaidOff: false,
            receivedBy
          })
          .returning();

        const rawItems = Array.isArray(body.items) ? body.items : [];
        let lineNo = 1;
        const insertedItems = [];

        for (const item of rawItems) {
          const isItemRejected = Boolean(item.isRejected || Number(item.qty || 0) <= 0);
          if (isItemRejected) {
            // Lewati pencatatan stok dan faktur hutang untuk barang yang ditolak / kosong
            continue;
          }

          // Resolve Product ID
          let productId = isUuid(item.productId) ? item.productId : undefined;
          if (!productId && item.productName) {
            const [p] = await tx
              .select({ id: schema.products.id })
              .from(schema.products)
              .where(sql`${schema.products.name} ILIKE ${item.productName}`)
              .limit(1);
            if (p) productId = p.id;
          }
          if (!productId) {
            const [firstP] = await tx.select({ id: schema.products.id }).from(schema.products).limit(1);
            if (!firstP) continue;
            productId = firstP.id;
          }

          const batchNo = (item.batchNo || item.batchNumber || `BCH-${Date.now().toString().slice(-4)}`).trim().toUpperCase();
          const expDate = item.expiredDate || item.expiryDate || "2027-12-31";
          const rawUnitName = String(item.unitName || item.unit || "").trim().toUpperCase();

          // Resolve authoritative conversionFactor dari product_units sesuai satuan faktur (mis. BOX = 100 TABLET)
          const prodUnits = await tx
            .select()
            .from(schema.productUnits)
            .where(eq(schema.productUnits.productId, productId));
          const matchedUnit =
            prodUnits.find((pu) => String(pu.unitName || "").trim().toUpperCase() === rawUnitName) ||
            prodUnits.find((pu) => pu.isBaseUnit) ||
            prodUnits[0];

          const unitName = matchedUnit?.unitName || rawUnitName || "BOX";
          const dbFactor = matchedUnit ? Number(matchedUnit.conversionFactor || 1) : 1;
          const conversionFactor = Math.max(
            1,
            dbFactor > 1 ? dbFactor : Number(item.conversionFactor || dbFactor || 1)
          );
          const qty = Number(item.qty || 1);
          const qtyBase =
            item.qtyBase && Number(item.qtyBase) >= qty * conversionFactor
              ? Number(item.qtyBase)
              : qty * conversionFactor;
          const buyPrice = Number(item.buyPrice || 0);
          const costPerBase = conversionFactor > 0 ? buyPrice / conversionFactor : buyPrice;
          const itemDiscountPercent = Number(item.discountPercent || 0);
          const itemDiscountAmount = Number(item.discountAmount || 0);
          const itemSubtotal = Number(item.subtotal || (qty * buyPrice - itemDiscountAmount));

          // B. Resolve or Insert into product_batches
          let batchId: string;
          const [existingBatch] = await tx
            .select({ id: schema.productBatches.id })
            .from(schema.productBatches)
            .where(
              and(
                eq(schema.productBatches.productId, productId),
                eq(schema.productBatches.batchNo, batchNo)
              )
            )
            .limit(1);

          if (existingBatch) {
            batchId = existingBatch.id;
          } else {
            batchId = crypto.randomUUID();
            await tx.insert(schema.productBatches).values({
              id: batchId,
              tenantId,
              productId,
              batchNo,
              expiredDate: expDate
            });
          }

          // C. Insert ke purchase_invoice_items (buyPrice = harga beli per unitName faktur)
          const itemId = crypto.randomUUID();
          await tx.insert(schema.purchaseInvoiceItems).values({
            id: itemId,
            invoiceId,
            productId,
            locationId,
            batchId,
            lineNo: lineNo++,
            unitName,
            conversionFactor: String(conversionFactor),
            qty: String(qty),
            qtyBase: String(qtyBase),
            buyPrice: String(buyPrice),
            discountPercent: String(itemDiscountPercent),
            discountAmount: String(itemDiscountAmount),
            subtotal: String(itemSubtotal)
          });

          // D. Update or Insert ke branch_batch_stocks (buyPrice = harga pokok per satuan dasar)
          const [existingBatchStock] = await tx
            .select({ id: schema.branchBatchStocks.id, qtyBase: schema.branchBatchStocks.qtyBase })
            .from(schema.branchBatchStocks)
            .where(
              and(
                eq(schema.branchBatchStocks.branchId, branchId),
                eq(schema.branchBatchStocks.locationId, locationId),
                eq(schema.branchBatchStocks.productId, productId),
                eq(schema.branchBatchStocks.batchId, batchId)
              )
            )
            .limit(1);

          if (existingBatchStock) {
            const newBatchQty = Number(existingBatchStock.qtyBase || 0) + qtyBase;
            await tx
              .update(schema.branchBatchStocks)
              .set({
                qtyBase: String(newBatchQty),
                buyPrice: String(costPerBase),
                updatedAt: new Date()
              })
              .where(eq(schema.branchBatchStocks.id, existingBatchStock.id));
          } else {
            await tx.insert(schema.branchBatchStocks).values({
              id: crypto.randomUUID(),
              tenantId,
              branchId,
              locationId,
              productId,
              batchId,
              qtyBase: String(qtyBase),
              buyPrice: String(costPerBase),
              updatedAt: new Date()
            });
          }

          // D2. Sinkronkan HNA referensi terbaru pada master produk & product_units
          if (costPerBase > 0) {
            await tx
              .update(schema.products)
              .set({
                referenceBuyPriceBase: String(costPerBase),
                updatedAt: new Date()
              })
              .where(eq(schema.products.id, productId));

            for (const pu of prodUnits) {
              const puFactor = Math.max(1, Number(pu.conversionFactor || 1));
              const updatedUnitBuy =
                String(pu.unitName || "").trim().toUpperCase() === unitName
                  ? Math.round(buyPrice)
                  : Math.round(costPerBase * puFactor);
              await tx
                .update(schema.productUnits)
                .set({ buyPrice: String(updatedUnitBuy) })
                .where(eq(schema.productUnits.id, pu.id));
            }
          }

          // E. Update or Insert ke branch_stocks (Saldo Total Stok per Produk di Lokasi)
          const [existingBranchStock] = await tx
            .select({ id: schema.branchStocks.id, totalQtyBase: schema.branchStocks.totalQtyBase })
            .from(schema.branchStocks)
            .where(
              and(
                eq(schema.branchStocks.locationId, locationId),
                eq(schema.branchStocks.productId, productId)
              )
            )
            .limit(1);

          if (existingBranchStock) {
            const newTotalQty = Number(existingBranchStock.totalQtyBase || 0) + qtyBase;
            await tx
              .update(schema.branchStocks)
              .set({
                totalQtyBase: String(newTotalQty),
                updatedAt: new Date()
              })
              .where(eq(schema.branchStocks.id, existingBranchStock.id));
          } else {
            await tx.insert(schema.branchStocks).values({
              id: crypto.randomUUID(),
              tenantId,
              branchId,
              locationId,
              productId,
              totalQtyBase: String(qtyBase),
              unbatchedQtyBase: "0",
              updatedAt: new Date()
            });
          }

          // F. Catat Buku Besar Audit Trail (stock_ledger)
          await tx.insert(schema.stockLedger).values({
            id: crypto.randomUUID(),
            tenantId,
            branchId,
            locationId,
            productId,
            batchId,
            mutationType: "PURCHASE_RECEIPT",
            quantityBase: String(qtyBase),
            costPerUnit: String(costPerBase),
            referenceId: invoiceId,
            notes: `Penerimaan Faktur ${invoiceNumber} dari PBF (${qty} ${unitName} = ${qtyBase} satuan dasar)`,
            createdBy: receivedBy,
            createdAt: now
          });

          // G. Auto-update Master Produk
          await tx
            .update(schema.products)
            .set({
              updatedAt: new Date()
            })
            .where(eq(schema.products.id, productId));

          insertedItems.push({
            productId,
            batchId,
            batchNo,
            qtyBase,
            buyPrice
          });
        }

        // H. Rekonsiliasi Pesanan (Discrepancy Resolution) jika terkait Surat Pesanan (PO)
        if (targetPoId) {
          const poItems = await tx
            .select()
            .from(schema.purchaseOrderItems)
            .where(eq(schema.purchaseOrderItems.purchaseOrderId, targetPoId));

          const discrepancies: string[] = [];

          for (const item of rawItems) {
            let matchingPoItem = null;
            if (item.poItemId && isUuid(item.poItemId)) {
              matchingPoItem = poItems.find((p) => p.id === item.poItemId);
            }
            if (!matchingPoItem && item.productId) {
              matchingPoItem = poItems.find((p) => p.productId === item.productId);
            }

            if (matchingPoItem) {
              const prevReceived = Number(matchingPoItem.qtyReceived || 0);
              const isItemRejected = Boolean(item.isRejected || Number(item.qty || 0) <= 0);
              const qtyAccepted = isItemRejected ? 0 : Number(item.qty || 0);
              const newReceived = prevReceived + qtyAccepted;
              const ordered = Number(matchingPoItem.qtyOrdered || 0);

              let noteAppend = "";
              if (isItemRejected) {
                const reason = item.discrepancyReason || "Ditolak saat pemeriksaan fisik";
                noteAppend = `[Faktur ${invoiceNumber}: Ditolak (${reason})]`;
                discrepancies.push(`${matchingPoItem.unitName}: Ditolak (${reason})`);
              } else if (newReceived < ordered) {
                const remaining = ordered - newReceived;
                noteAppend = `[Faktur ${invoiceNumber}: Terima ${qtyAccepted}/${ordered} (Sisa ${remaining})]`;
                discrepancies.push(`${matchingPoItem.unitName}: Kurang ${remaining}`);
              } else if (newReceived > ordered) {
                const bonus = newReceived - ordered;
                noteAppend = `[Faktur ${invoiceNumber}: Lebih kirim (+${bonus})]`;
              } else {
                noteAppend = `[Faktur ${invoiceNumber}: Lengkap (${newReceived}/${ordered})]`;
              }

              const existingNotes = matchingPoItem.notes || "";
              const updatedNotes = existingNotes ? `${existingNotes} | ${noteAppend}` : noteAppend;

              await tx
                .update(schema.purchaseOrderItems)
                .set({
                  qtyReceived: String(newReceived),
                  notes: updatedNotes
                })
                .where(eq(schema.purchaseOrderItems.id, matchingPoItem.id));
            }
          }

          // Periksa pemenuhan seluruh item SP
          const updatedPoItems = await tx
            .select({
              qtyOrdered: schema.purchaseOrderItems.qtyOrdered,
              qtyReceived: schema.purchaseOrderItems.qtyReceived
            })
            .from(schema.purchaseOrderItems)
            .where(eq(schema.purchaseOrderItems.purchaseOrderId, targetPoId));

          let allFulfilled = true;
          let anyReceived = false;

          for (const pit of updatedPoItems) {
            const ord = Number(pit.qtyOrdered || 0);
            const rcv = Number(pit.qtyReceived || 0);
            if (rcv > 0) anyReceived = true;
            if (rcv < ord) {
              allFulfilled = false;
            }
          }

          let poStatus = "ORDERED";
          if (allFulfilled && updatedPoItems.length > 0) {
            poStatus = "RECEIVED";
          } else if (anyReceived) {
            poStatus = "PARTIAL";
          }

          await tx
            .update(schema.purchaseOrders)
            .set({ status: poStatus })
            .where(eq(schema.purchaseOrders.id, targetPoId));
        }

        return {
          invoice: createdInvoice,
          itemsCount: insertedItems.length
        };
      });

      return {
        success: true,
        message: `Faktur Pembelian ${invoiceNumber} berhasil dicatat. Stok batch dan buku besar (stock_ledger) telah otomatis terisi.`,
        data: result
      };
    } catch (err: any) {
      console.error("[ERP POST /purchases error]:", err);
      return { success: false, error: err.message };
    }
  })

  // 6. SURAT PESANAN (PURCHASE ORDERS / SP)
  .get("/purchase-orders", async ({ query }) => {
    try {
      const limit = Number(query.limit || 100);
      const orders = await db
        .select({
          id: schema.purchaseOrders.id,
          poNumber: schema.purchaseOrders.poNumber,
          orderDate: schema.purchaseOrders.orderDate,
          status: schema.purchaseOrders.status,
          totalAmount: schema.purchaseOrders.totalAmount,
          notes: schema.purchaseOrders.notes,
          supplierName: schema.suppliers.name,
          supplierId: schema.suppliers.id,
          branchName: schema.branches.name,
          branchId: schema.branches.id
        })
        .from(schema.purchaseOrders)
        .leftJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
        .leftJoin(schema.branches, eq(schema.purchaseOrders.branchId, schema.branches.id))
        .orderBy(desc(schema.purchaseOrders.orderDate))
        .limit(limit);

      // Ambil seluruh items untuk PO yang ditemukan
      const orderIds = orders.map((o) => o.id);
      let itemsMap = new Map<string, any[]>();

      if (orderIds.length > 0) {
        const allItems = await db
          .select({
            id: schema.purchaseOrderItems.id,
            purchaseOrderId: schema.purchaseOrderItems.purchaseOrderId,
            productId: schema.purchaseOrderItems.productId,
            productName: schema.products.name,
            lineNo: schema.purchaseOrderItems.lineNo,
            unitName: schema.purchaseOrderItems.unitName,
            qtyOrdered: schema.purchaseOrderItems.qtyOrdered,
            qtyReceived: schema.purchaseOrderItems.qtyReceived,
            estimatedPrice: schema.purchaseOrderItems.estimatedPrice,
            subtotal: schema.purchaseOrderItems.subtotal,
            notes: schema.purchaseOrderItems.notes
          })
          .from(schema.purchaseOrderItems)
          .leftJoin(schema.products, eq(schema.purchaseOrderItems.productId, schema.products.id))
          .where(sql`${schema.purchaseOrderItems.purchaseOrderId} IN ${orderIds}`);

        for (const it of allItems) {
          const list = itemsMap.get(it.purchaseOrderId) || [];
          const ordered = Number(it.qtyOrdered || 0);
          const received = Number(it.qtyReceived || 0);
          list.push({
            id: it.id,
            productId: it.productId,
            productName: it.productName || "Obat Pesanan",
            unit: it.unitName,
            qty: ordered,
            qtyOrdered: ordered,
            qtyReceived: received,
            qtyRemaining: Math.max(0, ordered - received),
            estimatedHna: Number(it.estimatedPrice),
            subtotal: Number(it.subtotal),
            notes: it.notes || ""
          });
          itemsMap.set(it.purchaseOrderId, list);
        }
      }

      const [tenant] = await db.select().from(schema.tenants).limit(1);
      const defaultPharmacist = tenant?.pharmacistName || "apt. Ghina Nadhifah, S.Farm.";
      const defaultSipa = tenant?.sipaNumber || "500.16.7.2/0289/SIPA/DPMPTSP/II/2026";

      return {
        success: true,
        data: orders.map((o) => {
          const items = itemsMap.get(o.id) || [];
          const inferredType = inferPurchaseOrderType(o.poNumber, o.notes);

          return {
            id: o.id,
            orderNumber: o.poNumber,
            orderType: inferredType,
            supplierId: o.supplierId || "supp-1",
            supplierName: o.supplierName || "PT. Kimia Farma Trading & Distribution",
            branchId: o.branchId || "1",
            branchName: o.branchName || "Apotek Hafidz Farma 1",
            orderDate: o.orderDate,
            status: o.status,
            pharmacistName: defaultPharmacist,
            sipa: defaultSipa,
            totalItems: items.length > 0 ? items.length : 1,
            estimatedAmount: Number(o.totalAmount || 0),
            items
          };
        })
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 6B. GET DETAIL 1 SURAT PESANAN (UNTUK CETAK SP RESMI BPOM)
  .get("/purchase-orders/:id", async ({ params }) => {
    try {
      const [order] = await db
        .select({
          id: schema.purchaseOrders.id,
          poNumber: schema.purchaseOrders.poNumber,
          orderDate: schema.purchaseOrders.orderDate,
          status: schema.purchaseOrders.status,
          totalAmount: schema.purchaseOrders.totalAmount,
          notes: schema.purchaseOrders.notes,
          supplierName: schema.suppliers.name,
          supplierAddress: schema.suppliers.address,
          supplierPhone: schema.suppliers.phone,
          branchName: schema.branches.name,
          branchAddress: schema.branches.address
        })
        .from(schema.purchaseOrders)
        .leftJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
        .leftJoin(schema.branches, eq(schema.purchaseOrders.branchId, schema.branches.id))
        .where(eq(schema.purchaseOrders.id, params.id))
        .limit(1);

      if (!order) {
        return { success: false, error: "Surat Pesanan tidak ditemukan" };
      }

      const items = await db
        .select({
          id: schema.purchaseOrderItems.id,
          productId: schema.purchaseOrderItems.productId,
          productName: schema.products.name,
          lineNo: schema.purchaseOrderItems.lineNo,
          unitName: schema.purchaseOrderItems.unitName,
          qtyOrdered: schema.purchaseOrderItems.qtyOrdered,
          qtyReceived: schema.purchaseOrderItems.qtyReceived,
          estimatedPrice: schema.purchaseOrderItems.estimatedPrice,
          subtotal: schema.purchaseOrderItems.subtotal,
          notes: schema.purchaseOrderItems.notes
        })
        .from(schema.purchaseOrderItems)
        .leftJoin(schema.products, eq(schema.purchaseOrderItems.productId, schema.products.id))
        .where(eq(schema.purchaseOrderItems.purchaseOrderId, order.id))
        .orderBy(schema.purchaseOrderItems.lineNo);

      return {
        success: true,
        data: {
          ...order,
          items: items.map((it) => {
            const ord = Number(it.qtyOrdered || 0);
            const rcv = Number(it.qtyReceived || 0);
            return {
              id: it.id,
              productId: it.productId,
              productName: it.productName || "Obat",
              unit: it.unitName,
              qty: ord,
              qtyOrdered: ord,
              qtyReceived: rcv,
              qtyRemaining: Math.max(0, ord - rcv),
              estimatedHna: Number(it.estimatedPrice),
              subtotal: Number(it.subtotal),
              notes: it.notes || ""
            };
          })
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 7. BUAT SURAT PESANAN (PO) BARU BESERTA DETAIL ITEMS
  .post("/purchase-orders", async ({ body }: { body: any }) => {
    try {
      const isUuid = (val?: string) =>
        Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

      const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      if (!tenant) throw new Error("Tenant not found");

      // Resolve branch
      let branchId = isUuid(body.branchId) ? body.branchId : undefined;
      if (!branchId) {
        const [b] = await db.select({ id: schema.branches.id }).from(schema.branches).limit(1);
        branchId = b ? b.id : crypto.randomUUID();
      }

      // Resolve supplier
      let supplierId = isUuid(body.supplierId) ? body.supplierId : undefined;
      if (!supplierId && body.supplierName) {
        const [s] = await db
          .select({ id: schema.suppliers.id })
          .from(schema.suppliers)
          .where(sql`${schema.suppliers.name} ILIKE ${body.supplierName}`)
          .limit(1);
        if (s) supplierId = s.id;
      }
      if (!supplierId) {
        const [anySup] = await db.select({ id: schema.suppliers.id }).from(schema.suppliers).limit(1);
        supplierId = anySup ? anySup.id : crypto.randomUUID();
      }

      const [adminUser] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
      const createdBy = adminUser ? adminUser.id : crypto.randomUUID();
      const poId = crypto.randomUUID();

      let poNumber = (
        body.poNumber ||
        (body.orderType === "KONSINYASI"
          ? `SP-KSN-HF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
          : generateOrderNumber(body.orderType || "REGULER"))
      ).trim();
      let isDuplicate = true;
      let counter = 1;
      const basePoNumber = poNumber;

      while (isDuplicate) {
        const [existing] = await db
          .select({ id: schema.purchaseOrders.id })
          .from(schema.purchaseOrders)
          .where(and(eq(schema.purchaseOrders.tenantId, tenant.id), eq(schema.purchaseOrders.poNumber, poNumber)))
          .limit(1);

        if (!existing) {
          isDuplicate = false;
        } else {
          poNumber = `${basePoNumber}-${String(counter++).padStart(2, "0")}`;
        }
      }

      const orderDate = body.orderDate || new Date().toISOString().slice(0, 10);
      const rawItems = Array.isArray(body.items) ? body.items : [];

      const totalAmount = rawItems.reduce(
        (sum: number, it: any) => sum + (Number(it.qty || 1) * Number(it.estimatedHna || it.buyPrice || 0)),
        0
      );

      const result = await db.transaction(async (tx) => {
        // A. Insert PO Header
        const [createdOrder] = await tx
          .insert(schema.purchaseOrders)
          .values({
            id: poId,
            tenantId: tenant.id,
            branchId,
            supplierId,
            poNumber,
            orderDate,
            status: "ORDERED",
            totalAmount: String(body.totalAmount || totalAmount),
            notes: body.orderType || "REGULER",
            createdBy
          })
          .returning();

        // B. Insert PO Items
        let lineNo = 1;
        const insertedItems = [];

        for (const item of rawItems) {
          let productId = isUuid(item.productId) ? item.productId : undefined;
          if (!productId && item.productName) {
            const [p] = await tx
              .select({ id: schema.products.id })
              .from(schema.products)
              .where(sql`${schema.products.name} ILIKE ${item.productName}`)
              .limit(1);
            if (p) productId = p.id;
          }
          if (!productId) {
            const [firstP] = await tx.select({ id: schema.products.id }).from(schema.products).limit(1);
            if (!firstP) continue;
            productId = firstP.id;
          }

          const qty = Number(item.qty || 1);
          const price = Number(item.estimatedHna || item.buyPrice || 0);
          const itemSubtotal = qty * price;

          const [insertedItem] = await tx
            .insert(schema.purchaseOrderItems)
            .values({
              id: crypto.randomUUID(),
              purchaseOrderId: poId,
              productId,
              lineNo: lineNo++,
              unitName: item.unit || item.unitName || "BOX",
              qtyOrdered: String(qty),
              qtyReceived: "0",
              estimatedPrice: String(price),
              subtotal: String(itemSubtotal),
              notes: item.notes || null
            })
            .returning();

          insertedItems.push(insertedItem);
        }

        return {
          order: createdOrder,
          items: insertedItems
        };
      });

      return {
        success: true,
        message: `Surat Pesanan ${poNumber} berhasil diterbitkan dengan ${result.items.length} item obat.`,
        data: result
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 8. LIST KONSINYASI MASUK (TERINTEGRASI DENGAN STOK & PENJUALAN POS RIIL)
  .get("/consignments", async ({ query }) => {
    try {
      const list = await consignmentService.listConsignments(query?.branchId);
      return {
        success: true,
        data: list
      };
    } catch (err: any) {
      return { success: false, error: err.message, data: [] };
    }
  })

  // 8A. RIWAYAT SETORAN & RETUR KONSINYASI
  .get("/consignments/settlements", async ({ query }) => {
    try {
      const data = await consignmentService.listSettlements(query?.branchId);
      return {
        success: true,
        data
      };
    } catch (err: any) {
      return { success: false, error: err.message, data: [] };
    }
  })

  // 8B. PENERIMAAN KONSINYASI TITIPAN BARU (+ TAMBAH STOK BATCH & KARTU STOK)
  .post("/consignments", async ({ body }: { body: any }) => {
    try {
      const result = await consignmentService.createConsignment(body);
      return {
        success: true,
        message: `Penerimaan titipan konsinyasi ${result.receiptNumber} (${result.itemsCount} item) berhasil disimpan & stok jual langsung bertambah.`,
        data: result
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 8C. PENYETORAN BAGI HASIL & RETUR SISA KONSINYASI (+ CATAT KE /keuangan)
  .post("/consignments/:id/settle", async ({ params, body }: { params: { id: string }; body: any }) => {
    try {
      const result = await consignmentService.settleConsignment(params.id, body || {});
      return {
        success: true,
        message: `Setoran konsinyasi ${result.settlementNumber} berhasil dicatat (${result.soldQtySettled} terjual dibayar${result.returnedQty > 0 ? `, ${result.returnedQty} diretur` : ""}).`,
        data: result
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 8D. BATALKAN / HAPUS PENERIMAAN KONSINYASI (JIKA BELUM ADA PENJUALAN/SETORAN)
  .delete("/consignments/:id", async ({ params }: { params: { id: string } }) => {
    try {
      const result = await consignmentService.deleteConsignment(params.id);
      return {
        success: true,
        message: `Titipan konsinyasi ${result.receiptNumber} berhasil dibatalkan & saldo stok telah ditarik kembali.`
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
