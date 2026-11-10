import { db, schema } from "@apoteku/db";
import { eq, and, desc, sql } from "drizzle-orm";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(val?: string | null): val is string {
  return Boolean(val && UUID_REGEX.test(val));
}

export class ConsignmentService {
  private async resolveTenantId(txOrDb: any = db): Promise<string> {
    const [tenant] = await txOrDb.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
    if (!tenant) throw new Error("Tenant aktif tidak ditemukan");
    return tenant.id;
  }

  private async resolveBranchId(txOrDb: any, tenantId: string, candidate?: string): Promise<string> {
    if (isUuid(candidate)) {
      const [found] = await txOrDb
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(eq(schema.branches.id, candidate))
        .limit(1);
      if (found) return found.id;
    }
    const [b] = await txOrDb
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.tenantId, tenantId))
      .limit(1);
    if (!b) throw new Error("Cabang aktif tidak ditemukan");
    return b.id;
  }

  private async resolveLocationId(
    txOrDb: any,
    tenantId: string,
    branchId: string,
    candidate?: string
  ): Promise<string> {
    if (isUuid(candidate)) {
      const [found] = await txOrDb
        .select({ id: schema.inventoryLocations.id })
        .from(schema.inventoryLocations)
        .where(eq(schema.inventoryLocations.id, candidate))
        .limit(1);
      if (found) return found.id;
    }

    const [defLoc] = await txOrDb
      .select({ id: schema.inventoryLocations.id })
      .from(schema.inventoryLocations)
      .where(
        and(
          eq(schema.inventoryLocations.branchId, branchId),
          eq(schema.inventoryLocations.isDefault, true)
        )
      )
      .limit(1);
    if (defLoc) return defLoc.id;

    const [anyLoc] = await txOrDb
      .select({ id: schema.inventoryLocations.id })
      .from(schema.inventoryLocations)
      .where(eq(schema.inventoryLocations.branchId, branchId))
      .limit(1);
    if (anyLoc) return anyLoc.id;

    const newLocId = crypto.randomUUID();
    await txOrDb.insert(schema.inventoryLocations).values({
      id: newLocId,
      tenantId,
      branchId,
      code: "DEPO-UTAMA",
      name: "Etalase Depo Utama",
      isDefault: true,
      isActive: true
    });
    return newLocId;
  }

  private async resolveSupplierId(
    txOrDb: any,
    candidateId?: string,
    candidateName?: string
  ): Promise<string> {
    if (isUuid(candidateId)) {
      const [s] = await txOrDb
        .select({ id: schema.suppliers.id })
        .from(schema.suppliers)
        .where(eq(schema.suppliers.id, candidateId))
        .limit(1);
      if (s) return s.id;
    }
    if (candidateName) {
      const [s] = await txOrDb
        .select({ id: schema.suppliers.id })
        .from(schema.suppliers)
        .where(sql`${schema.suppliers.name} ILIKE ${candidateName}`)
        .limit(1);
      if (s) return s.id;
    }
    const [anySup] = await txOrDb.select({ id: schema.suppliers.id }).from(schema.suppliers).limit(1);
    if (!anySup) throw new Error("Supplier / vendor konsinyasi tidak ditemukan di master");
    return anySup.id;
  }

  private async resolveUserId(txOrDb: any, candidate?: string): Promise<string> {
    if (isUuid(candidate)) {
      const [u] = await txOrDb
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, candidate))
        .limit(1);
      if (u) return u.id;
    }
    const [u] = await txOrDb.select({ id: schema.users.id }).from(schema.users).limit(1);
    return u ? u.id : crypto.randomUUID();
  }

  private async resolveProductAndUnit(
    txOrDb: any,
    productId?: string,
    productName?: string,
    requestedUnitName?: string
  ) {
    let product: any = null;
    if (isUuid(productId)) {
      const [p] = await txOrDb
        .select()
        .from(schema.products)
        .where(eq(schema.products.id, productId))
        .limit(1);
      product = p;
    }
    if (!product && productName) {
      const [p] = await txOrDb
        .select()
        .from(schema.products)
        .where(sql`${schema.products.name} ILIKE ${productName}`)
        .limit(1);
      product = p;
    }
    if (!product) {
      throw new Error(`Produk "${productName || productId || "-"}" tidak ditemukan di master obat`);
    }

    const units = await txOrDb
      .select()
      .from(schema.productUnits)
      .where(eq(schema.productUnits.productId, product.id));

    const targetUnitUpper = (requestedUnitName || "").trim().toUpperCase();
    const matchedUnit =
      units.find((u: any) => String(u.unitName || "").trim().toUpperCase() === targetUnitUpper) ||
      units.find((u: any) => u.isBaseUnit) ||
      units[0];

    const unitName = matchedUnit?.unitName || targetUnitUpper || product.baseUnit || "PCS";
    const conversionFactor = Math.max(1, Number(matchedUnit?.conversionFactor || 1));
    const masterSalePrice = Number(matchedUnit?.salePriceGeneral || 0);

    return {
      product,
      unitName,
      conversionFactor,
      masterSalePrice
    };
  }

  /**
   * Pastikan setiap baris penerimaan konsinyasi memiliki batch tersendiri agar
   * perhitungan penjualan POS per batch tidak tercampur dengan pembelian reguler.
   */
  private async createIsolatedConsignmentBatch(
    tx: any,
    tenantId: string,
    productId: string,
    requestedBatchNo?: string,
    requestedExpDate?: string
  ): Promise<{ batchId: string; batchNo: string; expiredDate: string }> {
    const expiredDate = requestedExpDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedExpDate)
      ? requestedExpDate
      : "2027-12-31";
    const baseBatchNo =
      (requestedBatchNo || "").trim().toUpperCase() ||
      `KSN-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;

    let candidateNo = baseBatchNo;
    let attempt = 0;

    while (attempt < 20) {
      const [existing] = await tx
        .select({ id: schema.productBatches.id })
        .from(schema.productBatches)
        .where(
          and(
            eq(schema.productBatches.tenantId, tenantId),
            eq(schema.productBatches.productId, productId),
            eq(schema.productBatches.batchNo, candidateNo),
            eq(schema.productBatches.expiredDate, expiredDate)
          )
        )
        .limit(1);

      if (!existing) {
        const batchId = crypto.randomUUID();
        await tx.insert(schema.productBatches).values({
          id: batchId,
          tenantId,
          productId,
          batchNo: candidateNo,
          expiredDate
        });
        return { batchId, batchNo: candidateNo, expiredDate };
      }

      attempt++;
      candidateNo = `${baseBatchNo}-${String(attempt).padStart(2, "0")}`;
    }

    const fallbackNo = `${baseBatchNo}-${Date.now().toString().slice(-4)}`;
    const batchId = crypto.randomUUID();
    await tx.insert(schema.productBatches).values({
      id: batchId,
      tenantId,
      productId,
      batchNo: fallbackNo,
      expiredDate
    });
    return { batchId, batchNo: fallbackNo, expiredDate };
  }

  private async computeBatchMetrics(
    items: Array<{ branchId: string; locationId: string; productId: string; batchId: string }>
  ) {
    const batchIds = Array.from(new Set(items.map((i) => i.batchId).filter(Boolean)));
    const batchStockMap = new Map<string, number>();
    const posSoldMap = new Map<string, number>();
    const settledMap = new Map<
      string,
      { settledSoldQty: number; returnedQty: number; lostQty: number; totalPaid: number }
    >();

    if (batchIds.length === 0) {
      return { batchStockMap, posSoldMap, settledMap };
    }

    // 1. Sisa stok fisik real-time di branch_batch_stocks
    const stockRows = await db
      .select({
        branchId: schema.branchBatchStocks.branchId,
        locationId: schema.branchBatchStocks.locationId,
        productId: schema.branchBatchStocks.productId,
        batchId: schema.branchBatchStocks.batchId,
        qtyBase: schema.branchBatchStocks.qtyBase
      })
      .from(schema.branchBatchStocks)
      .where(sql`${schema.branchBatchStocks.batchId} IN ${batchIds}`);

    for (const s of stockRows) {
      const key = `${s.branchId}_${s.locationId}_${s.productId}_${s.batchId}`;
      batchStockMap.set(key, Number(s.qtyBase || 0));
    }

    // 2. Total penjualan POS riil per batch & cabang dari sales_transaction_items
    const salesRows = await db
      .select({
        branchId: schema.salesTransactions.branchId,
        batchId: schema.salesTransactionItems.batchId,
        totalSoldBase: sql<number>`COALESCE(SUM(${schema.salesTransactionItems.qtyBase}), 0)::numeric`
      })
      .from(schema.salesTransactionItems)
      .innerJoin(
        schema.salesTransactions,
        eq(schema.salesTransactionItems.transactionId, schema.salesTransactions.id)
      )
      .where(sql`${schema.salesTransactionItems.batchId} IN ${batchIds}`)
      .groupBy(schema.salesTransactions.branchId, schema.salesTransactionItems.batchId);

    for (const sr of salesRows) {
      if (!sr.batchId) continue;
      posSoldMap.set(`${sr.branchId}_${sr.batchId}`, Number(sr.totalSoldBase || 0));
    }

    // 3. Total sudah disetor / diretur / hilang dari consignment_settlement_items
    const settleRows = await db
      .select({
        branchId: schema.consignmentSettlements.branchId,
        batchId: schema.consignmentSettlementItems.batchId,
        soldQty: sql<number>`COALESCE(SUM(${schema.consignmentSettlementItems.soldQty}), 0)::numeric`,
        returnedQty: sql<number>`COALESCE(SUM(${schema.consignmentSettlementItems.returnedQty}), 0)::numeric`,
        lostQty: sql<number>`COALESCE(SUM(${schema.consignmentSettlementItems.lostQty}), 0)::numeric`,
        subtotalPayable: sql<number>`COALESCE(SUM(${schema.consignmentSettlementItems.subtotalPayable}), 0)::numeric`
      })
      .from(schema.consignmentSettlementItems)
      .innerJoin(
        schema.consignmentSettlements,
        eq(schema.consignmentSettlementItems.settlementId, schema.consignmentSettlements.id)
      )
      .where(sql`${schema.consignmentSettlementItems.batchId} IN ${batchIds}`)
      .groupBy(schema.consignmentSettlements.branchId, schema.consignmentSettlementItems.batchId);

    for (const st of settleRows) {
      if (!st.batchId) continue;
      settledMap.set(`${st.branchId}_${st.batchId}`, {
        settledSoldQty: Number(st.soldQty || 0),
        returnedQty: Number(st.returnedQty || 0),
        lostQty: Number(st.lostQty || 0),
        totalPaid: Number(st.subtotalPayable || 0)
      });
    }

    return { batchStockMap, posSoldMap, settledMap };
  }

  async listConsignments(branchId?: string) {
    const receipts = await db
      .select({
        id: schema.consignmentReceipts.id,
        receiptNumber: schema.consignmentReceipts.receiptNumber,
        branchId: schema.consignmentReceipts.branchId,
        branchName: schema.branches.name,
        locationId: schema.consignmentReceipts.locationId,
        supplierId: schema.consignmentReceipts.supplierId,
        supplierName: schema.suppliers.name,
        purchaseOrderId: schema.consignmentReceipts.purchaseOrderId,
        poNumber: schema.purchaseOrders.poNumber,
        receiptDate: schema.consignmentReceipts.receiptDate,
        notes: schema.consignmentReceipts.notes
      })
      .from(schema.consignmentReceipts)
      .leftJoin(schema.suppliers, eq(schema.consignmentReceipts.supplierId, schema.suppliers.id))
      .leftJoin(schema.branches, eq(schema.consignmentReceipts.branchId, schema.branches.id))
      .leftJoin(
        schema.purchaseOrders,
        eq(schema.consignmentReceipts.purchaseOrderId, schema.purchaseOrders.id)
      )
      .where(
        branchId && branchId !== "ALL" && isUuid(branchId)
          ? eq(schema.consignmentReceipts.branchId, branchId)
          : undefined
      )
      .orderBy(desc(schema.consignmentReceipts.receiptDate), desc(schema.consignmentReceipts.createdAt));

    const receiptIds = receipts.map((r) => r.id);
    if (receiptIds.length === 0) return [];

    const items = await db
      .select({
        id: schema.consignmentReceiptItems.id,
        receiptId: schema.consignmentReceiptItems.receiptId,
        productId: schema.consignmentReceiptItems.productId,
        productName: schema.products.name,
        baseUnit: schema.products.baseUnit,
        batchId: schema.consignmentReceiptItems.batchId,
        batchNo: schema.productBatches.batchNo,
        expiredDate: schema.productBatches.expiredDate,
        unitName: schema.consignmentReceiptItems.unitName,
        conversionFactor: schema.consignmentReceiptItems.conversionFactor,
        qtyReceived: schema.consignmentReceiptItems.qtyReceived,
        qtyBase: schema.consignmentReceiptItems.qtyBase,
        costPrice: schema.consignmentReceiptItems.costPrice,
        sellingPrice: schema.consignmentReceiptItems.sellingPrice,
        subtotalCost: schema.consignmentReceiptItems.subtotalCost
      })
      .from(schema.consignmentReceiptItems)
      .leftJoin(schema.products, eq(schema.consignmentReceiptItems.productId, schema.products.id))
      .leftJoin(
        schema.productBatches,
        eq(schema.consignmentReceiptItems.batchId, schema.productBatches.id)
      )
      .where(sql`${schema.consignmentReceiptItems.receiptId} IN ${receiptIds}`);

    const receiptMap = new Map<string, (typeof receipts)[number]>();
    for (const r of receipts) receiptMap.set(r.id, r);

    const metricInputs = items
      .map((it) => {
        const rec = receiptMap.get(it.receiptId);
        if (!rec) return null;
        return {
          branchId: rec.branchId,
          locationId: rec.locationId,
          productId: it.productId,
          batchId: it.batchId
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    const { batchStockMap, posSoldMap, settledMap } = await this.computeBatchMetrics(metricInputs);

    const list: any[] = [];
    for (const r of receipts) {
      const rItems = items.filter((it) => it.receiptId === r.id);
      for (const it of rItems) {
        const factor = Math.max(1, Number(it.conversionFactor || 1));
        const receivedUnitQty = Number(it.qtyReceived || 0);
        const receivedBase =
          Number(it.qtyBase || 0) > 0 ? Number(it.qtyBase) : receivedUnitQty * factor;
        const unitCost = Number(it.costPrice || 0);
        const costPerBase = unitCost / factor;
        const sellingUnit = Number(it.sellingPrice || 0) > 0 ? Number(it.sellingPrice) : Math.round(unitCost * 1.3);
        const sellingPerBase = sellingUnit / factor;

        const stockKey = `${r.branchId}_${r.locationId}_${it.productId}_${it.batchId}`;
        const posKey = `${r.branchId}_${it.batchId}`;

        const rawPosSold = posSoldMap.get(posKey) || 0;
        const settledInfo = settledMap.get(posKey) || {
          settledSoldQty: 0,
          returnedQty: 0,
          lostQty: 0,
          totalPaid: 0
        };

        const batchRemainingBase = batchStockMap.has(stockKey)
          ? Number(batchStockMap.get(stockKey) || 0)
          : Math.max(
              0,
              receivedBase - rawPosSold - settledInfo.returnedQty - settledInfo.lostQty
            );

        const soldBase = Math.min(receivedBase, rawPosSold);
        const unsettledSoldBase = Math.max(0, soldBase - settledInfo.settledSoldQty);
        const unsettledAmount = Math.round(unsettledSoldBase * costPerBase);
        const legacyMarkedSettled = (r.notes || "").includes("[SETTLED]");

        const isFullyClosed =
          legacyMarkedSettled ||
          (batchRemainingBase <= 0 &&
            unsettledSoldBase <= 0 &&
            (settledInfo.settledSoldQty > 0 || settledInfo.returnedQty > 0 || settledInfo.lostQty > 0));

        const status = isFullyClosed
          ? "SETTLED"
          : unsettledSoldBase > 0
            ? "READY_TO_SETTLE"
            : "ACTIVE";

        list.push({
          id: it.id,
          receiptId: r.id,
          receiptNumber: r.receiptNumber,
          purchaseOrderId: r.purchaseOrderId || null,
          poNumber: r.poNumber || null,
          branchId: r.branchId,
          branchName: r.branchName || "Apotek Hafidz Farma",
          locationId: r.locationId,
          supplierId: r.supplierId,
          supplierName: r.supplierName || "Vendor Titipan",
          date: r.receiptDate,
          productId: it.productId,
          productName: it.productName || "Obat Titipan",
          baseUnit: it.baseUnit || "PCS",
          unitName: it.unitName || it.baseUnit || "PCS",
          conversionFactor: factor,
          batchId: it.batchId,
          batchNo: it.batchNo || "KSN-BATCH",
          expiredDate: it.expiredDate || "2027-12-31",
          receivedUnitQty,
          receivedQty: receivedBase,
          soldQty: soldBase,
          settledQty: settledInfo.settledSoldQty,
          unsettledSoldQty: unsettledSoldBase,
          returnedQty: settledInfo.returnedQty,
          lostQty: settledInfo.lostQty,
          remainingQty: batchRemainingBase,
          unitPrice: costPerBase,
          unitCostInput: unitCost,
          sellingPrice: sellingPerBase,
          sellingPriceInput: sellingUnit,
          unsettledAmount: legacyMarkedSettled ? 0 : unsettledAmount,
          totalPaidAmount: settledInfo.totalPaid,
          status
        });
      }
    }

    return list;
  }

  async listSettlements(branchId?: string) {
    const settlements = await db
      .select({
        id: schema.consignmentSettlements.id,
        settlementNumber: schema.consignmentSettlements.settlementNumber,
        settlementDate: schema.consignmentSettlements.settlementDate,
        branchId: schema.consignmentSettlements.branchId,
        branchName: schema.branches.name,
        supplierId: schema.consignmentSettlements.supplierId,
        supplierName: schema.suppliers.name,
        totalSoldAmount: schema.consignmentSettlements.totalSoldAmount,
        discountAmount: schema.consignmentSettlements.discountAmount,
        totalPaidAmount: schema.consignmentSettlements.totalPaidAmount,
        paymentMethod: schema.consignmentSettlements.paymentMethod,
        notes: schema.consignmentSettlements.notes,
        createdAt: schema.consignmentSettlements.createdAt
      })
      .from(schema.consignmentSettlements)
      .leftJoin(schema.suppliers, eq(schema.consignmentSettlements.supplierId, schema.suppliers.id))
      .leftJoin(schema.branches, eq(schema.consignmentSettlements.branchId, schema.branches.id))
      .where(
        branchId && branchId !== "ALL" && isUuid(branchId)
          ? eq(schema.consignmentSettlements.branchId, branchId)
          : undefined
      )
      .orderBy(desc(schema.consignmentSettlements.settlementDate), desc(schema.consignmentSettlements.createdAt))
      .limit(100);

    const ids = settlements.map((s) => s.id);
    if (ids.length === 0) return [];

    const sItems = await db
      .select({
        id: schema.consignmentSettlementItems.id,
        settlementId: schema.consignmentSettlementItems.settlementId,
        productId: schema.consignmentSettlementItems.productId,
        productName: schema.products.name,
        baseUnit: schema.products.baseUnit,
        batchNo: schema.productBatches.batchNo,
        soldQty: schema.consignmentSettlementItems.soldQty,
        returnedQty: schema.consignmentSettlementItems.returnedQty,
        lostQty: schema.consignmentSettlementItems.lostQty,
        unitCost: schema.consignmentSettlementItems.unitCost,
        subtotalPayable: schema.consignmentSettlementItems.subtotalPayable
      })
      .from(schema.consignmentSettlementItems)
      .leftJoin(schema.products, eq(schema.consignmentSettlementItems.productId, schema.products.id))
      .leftJoin(schema.productBatches, eq(schema.consignmentSettlementItems.batchId, schema.productBatches.id))
      .where(sql`${schema.consignmentSettlementItems.settlementId} IN ${ids}`);

    const itemsBySettlement = new Map<string, any[]>();
    for (const it of sItems) {
      const arr = itemsBySettlement.get(it.settlementId) || [];
      arr.push({
        id: it.id,
        productId: it.productId,
        productName: it.productName || "Obat Konsinyasi",
        baseUnit: it.baseUnit || "PCS",
        batchNo: it.batchNo || "-",
        soldQty: Number(it.soldQty || 0),
        returnedQty: Number(it.returnedQty || 0),
        lostQty: Number(it.lostQty || 0),
        unitCost: Number(it.unitCost || 0),
        subtotalPayable: Number(it.subtotalPayable || 0)
      });
      itemsBySettlement.set(it.settlementId, arr);
    }

    return settlements.map((s) => ({
      id: s.id,
      settlementNumber: s.settlementNumber,
      settlementDate: s.settlementDate,
      branchId: s.branchId,
      branchName: s.branchName || "Apotek Hafidz Farma",
      supplierId: s.supplierId,
      supplierName: s.supplierName || "Vendor Konsinyasi",
      totalSoldAmount: Number(s.totalSoldAmount || 0),
      discountAmount: Number(s.discountAmount || 0),
      totalPaidAmount: Number(s.totalPaidAmount || 0),
      paymentMethod: s.paymentMethod,
      notes: s.notes || "",
      items: itemsBySettlement.get(s.id) || []
    }));
  }

  async createConsignment(body: any) {
    const rawItems =
      Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : [
            {
              poItemId: body.poItemId,
              productId: body.productId,
              productName: body.productName,
              unitName: body.unitName || body.unit,
              receivedQty: body.receivedQty ?? body.qty ?? 1,
              unitPrice: body.unitPrice ?? body.costPrice ?? 0,
              sellingPrice: body.sellingPrice ?? 0,
              batchNo: body.batchNo || body.batchNumber,
              expiredDate: body.expiredDate || body.expiryDate
            }
          ];

    if (rawItems.length === 0) {
      throw new Error("Minimal 1 item produk titipan konsinyasi wajib diisi");
    }

    return await db.transaction(async (tx) => {
      const tenantId = await this.resolveTenantId(tx);
      const branchId = await this.resolveBranchId(tx, tenantId, body.branchId);
      const locationId = await this.resolveLocationId(tx, tenantId, branchId, body.locationId);
      const supplierId = await this.resolveSupplierId(tx, body.supplierId, body.supplierName);
      const receivedBy = await this.resolveUserId(tx, body.receivedBy);

      // Resolve optional Purchase Order (SP Konsinyasi)
      let targetPoId: string | null = null;
      if (isUuid(body.purchaseOrderId)) {
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

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const receiptDate = body.date || dateStr;
      let receiptNumber =
        (body.receiptNumber || "").trim().toUpperCase() ||
        `KSN-${dateStr.slice(2).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Ensure unique receiptNumber
      const [dupReceipt] = await tx
        .select({ id: schema.consignmentReceipts.id })
        .from(schema.consignmentReceipts)
        .where(
          and(
            eq(schema.consignmentReceipts.tenantId, tenantId),
            eq(schema.consignmentReceipts.receiptNumber, receiptNumber)
          )
        )
        .limit(1);
      if (dupReceipt) {
        receiptNumber = `${receiptNumber}-${Date.now().toString().slice(-3)}`;
      }

      const receiptId = crypto.randomUUID();
      await tx.insert(schema.consignmentReceipts).values({
        id: receiptId,
        tenantId,
        branchId,
        supplierId,
        locationId,
        purchaseOrderId: targetPoId,
        receiptNumber,
        receiptDate,
        notes: body.notes || "Penerimaan barang titipan konsinyasi",
        receivedBy
      });

      const createdItems: any[] = [];
      let lineNo = 1;

      for (const rawItem of rawItems) {
        const qtyReceived = Number(rawItem.receivedQty ?? rawItem.qty ?? 0);
        if (qtyReceived <= 0) continue;

        const { product, unitName, conversionFactor, masterSalePrice } =
          await this.resolveProductAndUnit(
            tx,
            rawItem.productId,
            rawItem.productName,
            rawItem.unitName || rawItem.unit
          );

        const qtyBase = qtyReceived * conversionFactor;
        const unitCost = Number(rawItem.unitPrice ?? rawItem.costPrice ?? 0);
        const costPerBase = unitCost / conversionFactor;
        const sellingPrice =
          Number(rawItem.sellingPrice || 0) > 0
            ? Number(rawItem.sellingPrice)
            : masterSalePrice > 0
              ? masterSalePrice
              : Math.round(unitCost * 1.3);

        const { batchId, batchNo, expiredDate } = await this.createIsolatedConsignmentBatch(
          tx,
          tenantId,
          product.id,
          rawItem.batchNo || rawItem.batchNumber,
          rawItem.expiredDate || rawItem.expiryDate
        );

        const itemId = crypto.randomUUID();
        await tx.insert(schema.consignmentReceiptItems).values({
          id: itemId,
          receiptId,
          productId: product.id,
          batchId,
          lineNo: lineNo++,
          unitName,
          conversionFactor: String(conversionFactor),
          qtyReceived: String(qtyReceived),
          qtyBase: String(qtyBase),
          costPrice: String(unitCost),
          sellingPrice: String(sellingPrice),
          subtotalCost: String(qtyReceived * unitCost)
        });

        // Tambahkan stok fisik batch (branch_batch_stocks)
        await tx.insert(schema.branchBatchStocks).values({
          id: crypto.randomUUID(),
          tenantId,
          branchId,
          locationId,
          productId: product.id,
          batchId,
          qtyBase: String(qtyBase),
          buyPrice: String(costPerBase),
          updatedAt: now
        });

        // Tambahkan total saldo produk di cabang/lokasi (branch_stocks)
        const [existingBranchStock] = await tx
          .select({
            id: schema.branchStocks.id,
            totalQtyBase: schema.branchStocks.totalQtyBase
          })
          .from(schema.branchStocks)
          .where(
            and(
              eq(schema.branchStocks.locationId, locationId),
              eq(schema.branchStocks.productId, product.id)
            )
          )
          .limit(1);

        if (existingBranchStock) {
          await tx
            .update(schema.branchStocks)
            .set({
              totalQtyBase: String(Number(existingBranchStock.totalQtyBase || 0) + qtyBase),
              updatedAt: now
            })
            .where(eq(schema.branchStocks.id, existingBranchStock.id));
        } else {
          await tx.insert(schema.branchStocks).values({
            id: crypto.randomUUID(),
            tenantId,
            branchId,
            locationId,
            productId: product.id,
            totalQtyBase: String(qtyBase),
            unbatchedQtyBase: "0",
            updatedAt: now
          });
        }

        // Catat di stock_ledger sebagai CONSIGNMENT_IN
        await tx.insert(schema.stockLedger).values({
          id: crypto.randomUUID(),
          tenantId,
          branchId,
          locationId,
          productId: product.id,
          batchId,
          mutationType: "CONSIGNMENT_IN",
          quantityBase: String(qtyBase),
          costPerUnit: String(costPerBase),
          referenceId: receiptId,
          notes: `Penerimaan Konsinyasi ${receiptNumber} (${qtyReceived} ${unitName} = ${qtyBase} ${product.baseUnit})`,
          createdBy: receivedBy,
          createdAt: now
        });

        // Sentuh updatedAt produk agar delta-sync POS segera menyerap stok konsinyasi baru
        await tx
          .update(schema.products)
          .set({ updatedAt: now })
          .where(eq(schema.products.id, product.id));

        createdItems.push({
          id: itemId,
          productId: product.id,
          productName: product.name,
          unitName,
          conversionFactor,
          batchId,
          batchNo,
          expiredDate,
          receivedUnitQty: qtyReceived,
          receivedQty: qtyBase,
          unitPrice: costPerBase,
          sellingPrice: sellingPrice / conversionFactor
        });
      }

      if (createdItems.length === 0) {
        throw new Error("Tidak ada item konsinyasi valid dengan jumlah > 0");
      }

      // Sinkronkan status Surat Pesanan (jika terkait SP Konsinyasi)
      if (targetPoId) {
        const poItems = await tx
          .select()
          .from(schema.purchaseOrderItems)
          .where(eq(schema.purchaseOrderItems.purchaseOrderId, targetPoId));

        for (const cItem of createdItems) {
          const matchPoItem = poItems.find((p: any) => p.productId === cItem.productId);
          if (matchPoItem) {
            const newRec = Number(matchPoItem.qtyReceived || 0) + Number(cItem.receivedUnitQty || 0);
            await tx
              .update(schema.purchaseOrderItems)
              .set({ qtyReceived: String(newRec) })
              .where(eq(schema.purchaseOrderItems.id, matchPoItem.id));
          }
        }

        await tx
          .update(schema.purchaseOrders)
          .set({ status: "RECEIVED" })
          .where(eq(schema.purchaseOrders.id, targetPoId));
      }

      return {
        receiptId,
        receiptNumber,
        itemsCount: createdItems.length,
        items: createdItems
      };
    });
  }

  async settleConsignment(itemId: string, body: any = {}) {
    return await db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(schema.consignmentReceiptItems)
        .where(eq(schema.consignmentReceiptItems.id, itemId))
        .limit(1);

      if (!item) {
        throw new Error("Item titipan konsinyasi tidak ditemukan");
      }

      const [receipt] = await tx
        .select()
        .from(schema.consignmentReceipts)
        .where(eq(schema.consignmentReceipts.id, item.receiptId))
        .limit(1);

      if (!receipt) {
        throw new Error("Dokumen tanda terima konsinyasi tidak ditemukan");
      }

      const [product] = await tx
        .select({ id: schema.products.id, name: schema.products.name, baseUnit: schema.products.baseUnit })
        .from(schema.products)
        .where(eq(schema.products.id, item.productId))
        .limit(1);

      const [supplier] = await tx
        .select({ id: schema.suppliers.id, name: schema.suppliers.name })
        .from(schema.suppliers)
        .where(eq(schema.suppliers.id, receipt.supplierId))
        .limit(1);

      const factor = Math.max(1, Number(item.conversionFactor || 1));
      const receivedBase =
        Number(item.qtyBase || 0) > 0 ? Number(item.qtyBase) : Number(item.qtyReceived) * factor;
      const costPerBase = Number(item.costPrice || 0) / factor;

      // Hitung penjualan POS riil dan setoran sebelumnya pada batch ini
      const [posAgg] = await tx
        .select({
          totalSoldBase: sql<number>`COALESCE(SUM(${schema.salesTransactionItems.qtyBase}), 0)::numeric`
        })
        .from(schema.salesTransactionItems)
        .innerJoin(
          schema.salesTransactions,
          eq(schema.salesTransactionItems.transactionId, schema.salesTransactions.id)
        )
        .where(
          and(
            eq(schema.salesTransactions.branchId, receipt.branchId),
            eq(schema.salesTransactionItems.batchId, item.batchId)
          )
        );

      const [settledAgg] = await tx
        .select({
          settledSoldQty: sql<number>`COALESCE(SUM(${schema.consignmentSettlementItems.soldQty}), 0)::numeric`,
          returnedQty: sql<number>`COALESCE(SUM(${schema.consignmentSettlementItems.returnedQty}), 0)::numeric`,
          lostQty: sql<number>`COALESCE(SUM(${schema.consignmentSettlementItems.lostQty}), 0)::numeric`
        })
        .from(schema.consignmentSettlementItems)
        .innerJoin(
          schema.consignmentSettlements,
          eq(schema.consignmentSettlementItems.settlementId, schema.consignmentSettlements.id)
        )
        .where(
          and(
            eq(schema.consignmentSettlements.branchId, receipt.branchId),
            eq(schema.consignmentSettlementItems.batchId, item.batchId)
          )
        );

      const [batchStockRow] = await tx
        .select()
        .from(schema.branchBatchStocks)
        .where(
          and(
            eq(schema.branchBatchStocks.branchId, receipt.branchId),
            eq(schema.branchBatchStocks.locationId, receipt.locationId),
            eq(schema.branchBatchStocks.productId, item.productId),
            eq(schema.branchBatchStocks.batchId, item.batchId)
          )
        )
        .limit(1);

      const realPosSold = Math.min(receivedBase, Number(posAgg?.totalSoldBase || 0));
      const alreadySettledSold = Number(settledAgg?.settledSoldQty || 0);
      const maxUnsettledSold = Math.max(0, realPosSold - alreadySettledSold);
      const currentBatchStock = Number(batchStockRow?.qtyBase || 0);

      const soldQtyToSettle =
        body.soldQty !== undefined ? Math.max(0, Number(body.soldQty)) : maxUnsettledSold;
      const returnedQty = Math.max(0, Number(body.returnedQty || 0));
      const lostQty = Math.max(0, Number(body.lostQty || 0));
      const discountAmount = Math.max(0, Number(body.discountAmount || 0));

      if (soldQtyToSettle > maxUnsettledSold + 0.0001) {
        throw new Error(
          `Qty setor terjual (${soldQtyToSettle}) melebihi penjualan belum disetor (${maxUnsettledSold} ${product?.baseUnit || "unit"})`
        );
      }

      const stockDeduction = returnedQty + lostQty;
      if (stockDeduction > currentBatchStock + 0.0001) {
        throw new Error(
          `Qty retur/hilang (${stockDeduction}) melebihi sisa stok fisik batch saat ini (${currentBatchStock} ${product?.baseUnit || "unit"})`
        );
      }

      if (soldQtyToSettle <= 0 && returnedQty <= 0 && lostQty <= 0) {
        throw new Error(
          "Belum ada item terjual di POS maupun item yang diretur untuk diproses"
        );
      }

      const settledBy = await this.resolveUserId(tx, body.settledBy);
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const yyyymmdd = dateStr.replace(/-/g, "");
      const settlementNumber = `STL-${yyyymmdd}-${Math.floor(100 + Math.random() * 900)}`;
      const settlementId = crypto.randomUUID();

      const totalSoldAmount = Math.round((soldQtyToSettle + lostQty) * costPerBase);
      const totalPaidAmount = Math.max(0, totalSoldAmount - discountAmount);
      const paymentMethod = (body.paymentMethod || "KAS_KASIR").trim();

      // 1. Insert header consignment_settlements
      await tx.insert(schema.consignmentSettlements).values({
        id: settlementId,
        tenantId: receipt.tenantId,
        branchId: receipt.branchId,
        supplierId: receipt.supplierId,
        locationId: receipt.locationId,
        settlementNumber,
        settlementDate: body.settlementDate || dateStr,
        totalSoldAmount: String(totalSoldAmount),
        discountAmount: String(discountAmount),
        totalPaidAmount: String(totalPaidAmount),
        paymentMethod,
        notes:
          body.notes ||
          `Setor & rekonsiliasi titipan ${receipt.receiptNumber} (${product?.name || "Obat"})`,
        settledBy
      });

      // 2. Insert detail consignment_settlement_items
      await tx.insert(schema.consignmentSettlementItems).values({
        id: crypto.randomUUID(),
        settlementId,
        productId: item.productId,
        batchId: item.batchId,
        lineNo: 1,
        soldQty: String(soldQtyToSettle),
        returnedQty: String(returnedQty),
        lostQty: String(lostQty),
        unitCost: String(costPerBase),
        subtotalPayable: String(totalPaidAmount)
      });

      // 3. Potong stok fisik & tulis stock_ledger jika ada retur ke vendor atau barang hilang
      if (stockDeduction > 0) {
        if (batchStockRow) {
          const newBatchQty = Math.max(0, currentBatchStock - stockDeduction);
          await tx
            .update(schema.branchBatchStocks)
            .set({ qtyBase: String(newBatchQty), updatedAt: now })
            .where(eq(schema.branchBatchStocks.id, batchStockRow.id));
        }

        const [branchStockRow] = await tx
          .select()
          .from(schema.branchStocks)
          .where(
            and(
              eq(schema.branchStocks.locationId, receipt.locationId),
              eq(schema.branchStocks.productId, item.productId)
            )
          )
          .limit(1);

        if (branchStockRow) {
          const newTotalQty = Math.max(0, Number(branchStockRow.totalQtyBase || 0) - stockDeduction);
          await tx
            .update(schema.branchStocks)
            .set({ totalQtyBase: String(newTotalQty), updatedAt: now })
            .where(eq(schema.branchStocks.id, branchStockRow.id));
        }

        if (returnedQty > 0) {
          await tx.insert(schema.stockLedger).values({
            id: crypto.randomUUID(),
            tenantId: receipt.tenantId,
            branchId: receipt.branchId,
            locationId: receipt.locationId,
            productId: item.productId,
            batchId: item.batchId,
            mutationType: "CONSIGNMENT_RETURN",
            quantityBase: String(-returnedQty),
            costPerUnit: String(costPerBase),
            referenceId: settlementId,
            notes: `Retur Sisa Konsinyasi ${settlementNumber} (${receipt.receiptNumber}) ke ${supplier?.name || "Vendor"}`,
            createdBy: settledBy,
            createdAt: now
          });
        }

        if (lostQty > 0) {
          await tx.insert(schema.stockLedger).values({
            id: crypto.randomUUID(),
            tenantId: receipt.tenantId,
            branchId: receipt.branchId,
            locationId: receipt.locationId,
            productId: item.productId,
            batchId: item.batchId,
            mutationType: "ADJUSTMENT",
            quantityBase: String(-lostQty),
            costPerUnit: String(costPerBase),
            referenceId: settlementId,
            notes: `Selisih/Hilang Konsinyasi ${settlementNumber} (${receipt.receiptNumber})`,
            createdBy: settledBy,
            createdAt: now
          });
        }

        await tx
          .update(schema.products)
          .set({ updatedAt: now })
          .where(eq(schema.products.id, item.productId));
      }

      // 4. Catat Kas Keluar di cash_mutations (/keuangan) jika ada uang disetor
      if (totalPaidAmount > 0) {
        const upperMethod = paymentMethod.toUpperCase();
        const account =
          upperMethod.includes("BCA") || upperMethod.includes("TRANSFER") || upperMethod.includes("BANK")
            ? "BANK_BCA"
            : "KAS_LACI";

        await tx.insert(schema.cashMutations).values({
          id: crypto.randomUUID(),
          tenantId: receipt.tenantId,
          branchId: receipt.branchId,
          type: "OUT",
          category: "Setor Konsinyasi",
          account,
          refNumber: settlementNumber,
          amount: String(totalPaidAmount),
          description: `Setor Konsinyasi ${receipt.receiptNumber} (${supplier?.name || "Vendor"}) - ${product?.name || "Obat"} (${soldQtyToSettle + lostQty} ${product?.baseUnit || "unit"})`,
          operator: body.operator || "Staf Keuangan",
          transactionDate: now
        });
      }

      // 5. Tandai [SETTLED] pada notes receipt hanya jika seluruh stok batch habis dan semua terjual lunas
      const remainingAfterSettle = Math.max(0, currentBatchStock - stockDeduction);
      const unsettledAfterSettle = Math.max(0, maxUnsettledSold - soldQtyToSettle);
      if (remainingAfterSettle <= 0 && unsettledAfterSettle <= 0) {
        const currentNotes = receipt.notes || "";
        if (!currentNotes.includes("[SETTLED]")) {
          await tx
            .update(schema.consignmentReceipts)
            .set({
              notes: `${currentNotes} [SETTLED]`.trim()
            })
            .where(eq(schema.consignmentReceipts.id, receipt.id));
        }
      }

      return {
        settlementId,
        settlementNumber,
        receiptNumber: receipt.receiptNumber,
        soldQtySettled: soldQtyToSettle,
        returnedQty,
        lostQty,
        totalPaidAmount,
        remainingBatchStock: remainingAfterSettle,
        isFullyClosed: remainingAfterSettle <= 0 && unsettledAfterSettle <= 0
      };
    });
  }

  async deleteConsignment(idOrItemId: string) {
    return await db.transaction(async (tx) => {
      let receiptId = idOrItemId;
      const [directReceipt] = await tx
        .select()
        .from(schema.consignmentReceipts)
        .where(eq(schema.consignmentReceipts.id, idOrItemId))
        .limit(1);

      let receipt = directReceipt;
      if (!receipt) {
        const [itemRow] = await tx
          .select()
          .from(schema.consignmentReceiptItems)
          .where(eq(schema.consignmentReceiptItems.id, idOrItemId))
          .limit(1);
        if (itemRow) {
          receiptId = itemRow.receiptId;
          const [parent] = await tx
            .select()
            .from(schema.consignmentReceipts)
            .where(eq(schema.consignmentReceipts.id, receiptId))
            .limit(1);
          receipt = parent;
        }
      }

      if (!receipt) {
        throw new Error("Dokumen penerimaan konsinyasi tidak ditemukan");
      }

      const items = await tx
        .select()
        .from(schema.consignmentReceiptItems)
        .where(eq(schema.consignmentReceiptItems.receiptId, receipt.id));

      const batchIds = items.map((i) => i.batchId).filter(Boolean);
      if (batchIds.length > 0) {
        const [salesCount] = await tx
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(schema.salesTransactionItems)
          .where(sql`${schema.salesTransactionItems.batchId} IN ${batchIds}`);

        if (Number(salesCount?.count || 0) > 0) {
          throw new Error(
            "Titipan konsinyasi tidak dapat dihapus karena barang sudah memiliki riwayat penjualan di kasir POS."
          );
        }

        const [settleCount] = await tx
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(schema.consignmentSettlementItems)
          .where(sql`${schema.consignmentSettlementItems.batchId} IN ${batchIds}`);

        if (Number(settleCount?.count || 0) > 0) {
          throw new Error(
            "Titipan konsinyasi tidak dapat dihapus karena sudah memiliki riwayat setoran atau retur konsinyasi."
          );
        }
      }

      const userId = await this.resolveUserId(tx);
      const now = new Date();

      for (const it of items) {
        const factor = Math.max(1, Number(it.conversionFactor || 1));
        const qtyBase = Number(it.qtyBase || 0) > 0 ? Number(it.qtyBase) : Number(it.qtyReceived) * factor;
        const costPerBase = Number(it.costPrice || 0) / factor;

        const [bbs] = await tx
          .select()
          .from(schema.branchBatchStocks)
          .where(
            and(
              eq(schema.branchBatchStocks.branchId, receipt.branchId),
              eq(schema.branchBatchStocks.locationId, receipt.locationId),
              eq(schema.branchBatchStocks.productId, it.productId),
              eq(schema.branchBatchStocks.batchId, it.batchId)
            )
          )
          .limit(1);

        if (bbs) {
          const remaining = Number(bbs.qtyBase || 0);
          if (remaining < qtyBase - 0.0001) {
            throw new Error(
              "Stok fisik batch konsinyasi ini sudah berkurang akibat mutasi/opname sehingga tidak dapat dibatalkan."
            );
          }
          await tx
            .delete(schema.branchBatchStocks)
            .where(eq(schema.branchBatchStocks.id, bbs.id));
        }

        const [bs] = await tx
          .select()
          .from(schema.branchStocks)
          .where(
            and(
              eq(schema.branchStocks.locationId, receipt.locationId),
              eq(schema.branchStocks.productId, it.productId)
            )
          )
          .limit(1);

        if (bs) {
          const newTotal = Math.max(0, Number(bs.totalQtyBase || 0) - qtyBase);
          await tx
            .update(schema.branchStocks)
            .set({ totalQtyBase: String(newTotal), updatedAt: now })
            .where(eq(schema.branchStocks.id, bs.id));
        }

        await tx.insert(schema.stockLedger).values({
          id: crypto.randomUUID(),
          tenantId: receipt.tenantId,
          branchId: receipt.branchId,
          locationId: receipt.locationId,
          productId: it.productId,
          batchId: it.batchId,
          mutationType: "ADJUSTMENT",
          quantityBase: String(-qtyBase),
          costPerUnit: String(costPerBase),
          referenceId: receipt.id,
          notes: `Pembatalan Penerimaan Konsinyasi ${receipt.receiptNumber}`,
          createdBy: userId,
          createdAt: now
        });

        await tx
          .update(schema.products)
          .set({ updatedAt: now })
          .where(eq(schema.products.id, it.productId));
      }

      if (receipt.purchaseOrderId) {
        await tx
          .update(schema.purchaseOrders)
          .set({ status: "ORDERED" })
          .where(eq(schema.purchaseOrders.id, receipt.purchaseOrderId));
        await tx
          .update(schema.purchaseOrderItems)
          .set({ qtyReceived: "0" })
          .where(eq(schema.purchaseOrderItems.purchaseOrderId, receipt.purchaseOrderId));
      }

      await tx
        .delete(schema.consignmentReceipts)
        .where(eq(schema.consignmentReceipts.id, receipt.id));

      return {
        receiptNumber: receipt.receiptNumber
      };
    });
  }
}

export const consignmentService = new ConsignmentService();

