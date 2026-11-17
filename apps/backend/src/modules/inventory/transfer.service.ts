import { db, schema } from "@apoteku/db";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { generateTransferNumber } from "@apoteku/core";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(val?: string | null): val is string {
  return Boolean(val && UUID_REGEX.test(val.trim()));
}

function roundQty(val: number): number {
  return Math.round(val * 10000) / 10000;
}

export interface CreateTransferItemPayload {
  productId: string;
  productName?: string;
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string;
  locationId?: string;
  qty: number;
  unit?: string;
}

export interface CreateTransferPayload {
  tenantId?: string;
  userId?: string;
  transferNumber?: string;
  fromBranchId: string;
  toBranchId: string;
  courierName?: string;
  operator?: string;
  notes?: string;
  status?: "REQUESTED" | "IN_TRANSIT";
  items: CreateTransferItemPayload[];
}

export interface ReceiveTransferItemPayload {
  lineNo: number;
  qtyReceived: number;
  discrepancyReason?: string;
}

export interface ReceiveTransferPayload {
  transferId: string;
  userId?: string;
  receivedBy?: string;
  receiptNotes?: string;
  items: ReceiveTransferItemPayload[];
}

class TransferService {
  private async resolveTenantId(txOrDb: any, candidate?: string): Promise<string> {
    if (isUuid(candidate)) {
      const [found] = await txOrDb
        .select({ id: schema.tenants.id })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, candidate.trim()))
        .limit(1);
      if (found) return found.id;
    }
    const [t] = await txOrDb.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
    if (!t) throw new Error("Tenant aktif tidak ditemukan di database");
    return t.id;
  }

  private async resolveBranch(
    txOrDb: any,
    tenantId: string,
    branchKey: string
  ): Promise<{ id: string; name: string; code: string }> {
    const clean = (branchKey || "").trim();
    if (!clean) {
      throw new Error("ID cabang tidak boleh kosong");
    }

    if (isUuid(clean)) {
      const [found] = await txOrDb
        .select({
          id: schema.branches.id,
          name: schema.branches.name,
          code: schema.branches.code
        })
        .from(schema.branches)
        .where(eq(schema.branches.id, clean))
        .limit(1);
      if (found) return found;
    }

    const [byCode] = await txOrDb
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
        code: schema.branches.code
      })
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.tenantId, tenantId),
          eq(sql`LOWER(${schema.branches.code})`, clean.toLowerCase())
        )
      )
      .limit(1);

    if (byCode) return byCode;

    throw new Error(`Cabang "${branchKey}" tidak ditemukan`);
  }

  private async resolveOptionalBranchId(
    txOrDb: any,
    tenantId: string,
    branchKey?: string
  ): Promise<string | undefined> {
    const clean = (branchKey || "").trim();
    if (!clean || clean === "ALL") return undefined;
    try {
      const branch = await this.resolveBranch(txOrDb, tenantId, clean);
      return branch.id;
    } catch {
      return undefined;
    }
  }

  private async resolveUser(
    txOrDb: any,
    tenantId: string,
    candidateUserId?: string,
    candidateName?: string
  ): Promise<{ id: string; fullName: string }> {
    if (isUuid(candidateUserId)) {
      const [u] = await txOrDb
        .select({ id: schema.users.id, fullName: schema.users.fullName })
        .from(schema.users)
        .where(eq(schema.users.id, candidateUserId.trim()))
        .limit(1);
      if (u) return u;
    }

    if (candidateName && candidateName.trim()) {
      const [uByName] = await txOrDb
        .select({ id: schema.users.id, fullName: schema.users.fullName })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.tenantId, tenantId),
            eq(sql`LOWER(${schema.users.fullName})`, candidateName.trim().toLowerCase())
          )
        )
        .limit(1);
      if (uByName) return uByName;
    }

    const [firstUser] = await txOrDb
      .select({ id: schema.users.id, fullName: schema.users.fullName })
      .from(schema.users)
      .where(eq(schema.users.tenantId, tenantId))
      .limit(1);

    if (firstUser) {
      return {
        id: firstUser.id,
        fullName: candidateName?.trim() || firstUser.fullName
      };
    }

    return {
      id: crypto.randomUUID(),
      fullName: candidateName?.trim() || "Petugas Apotek"
    };
  }

  private async getDefaultLocation(
    txOrDb: any,
    branchId: string,
    tenantId: string
  ): Promise<string> {
    const [loc] = await txOrDb
      .select({ id: schema.inventoryLocations.id })
      .from(schema.inventoryLocations)
      .where(
        and(
          eq(schema.inventoryLocations.branchId, branchId),
          eq(schema.inventoryLocations.isDefault, true)
        )
      )
      .limit(1);

    if (loc) return loc.id;

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

  private async getOrCreateBatch(
    txOrDb: any,
    productId: string,
    batchNo: string,
    tenantId: string,
    expiryDate?: string
  ): Promise<string> {
    const cleanBatchNo = (batchNo || "STOK-UMUM").trim();
    const expDate = expiryDate || "2099-12-31";

    const [existing] = await txOrDb
      .select({ id: schema.productBatches.id })
      .from(schema.productBatches)
      .where(
        and(
          eq(schema.productBatches.tenantId, tenantId),
          eq(schema.productBatches.productId, productId),
          eq(schema.productBatches.batchNo, cleanBatchNo)
        )
      )
      .limit(1);

    if (existing) return existing.id;

    const newBatchId = crypto.randomUUID();
    await txOrDb.insert(schema.productBatches).values({
      id: newBatchId,
      tenantId,
      productId,
      batchNo: cleanBatchNo,
      expiredDate: expDate
    });
    return newBatchId;
  }

  /**
   * Ambil daftar obat yang benar-benar tersedia (stok > 0) pada cabang tertentu,
   * lengkap dengan rincian batch (urut FEFO) dan daftar satuan resmi produk.
   */
  async getBranchProducts(branchKey: string, tenantCandidate?: string) {
    const tenantId = await this.resolveTenantId(db, tenantCandidate);
    const branchId = await this.resolveOptionalBranchId(db, tenantId, branchKey);
    if (!branchId) return [];

    // 1. Ambil seluruh batch dengan stok > 0 di cabang ini (urut FEFO)
    const batchRows = await db
      .select({
        productId: schema.branchBatchStocks.productId,
        locationId: schema.branchBatchStocks.locationId,
        locationName: schema.inventoryLocations.name,
        batchId: schema.branchBatchStocks.batchId,
        batchNo: schema.productBatches.batchNo,
        expiredDate: schema.productBatches.expiredDate,
        qtyBase: schema.branchBatchStocks.qtyBase,
        buyPrice: schema.branchBatchStocks.buyPrice
      })
      .from(schema.branchBatchStocks)
      .leftJoin(
        schema.productBatches,
        eq(schema.branchBatchStocks.batchId, schema.productBatches.id)
      )
      .leftJoin(
        schema.inventoryLocations,
        eq(schema.branchBatchStocks.locationId, schema.inventoryLocations.id)
      )
      .where(
        and(
          eq(schema.branchBatchStocks.branchId, branchId),
          sql`${schema.branchBatchStocks.qtyBase} > 0`
        )
      )
      .orderBy(sql`${schema.productBatches.expiredDate} ASC NULLS LAST`, asc(schema.productBatches.batchNo));

    // 2. Cek jika ada stok unbatched (mis. hasil migrasi awal di branch_stocks)
    const unbatchedRows = await db
      .select({
        productId: schema.branchStocks.productId,
        locationId: schema.branchStocks.locationId,
        locationName: schema.inventoryLocations.name,
        unbatchedQtyBase: schema.branchStocks.unbatchedQtyBase,
        totalQtyBase: schema.branchStocks.totalQtyBase
      })
      .from(schema.branchStocks)
      .leftJoin(
        schema.inventoryLocations,
        eq(schema.branchStocks.locationId, schema.inventoryLocations.id)
      )
      .where(
        and(
          eq(schema.branchStocks.branchId, branchId),
          sql`${schema.branchStocks.unbatchedQtyBase} > 0`
        )
      );

    const batchesByProduct = new Map<string, any[]>();
    for (const b of batchRows) {
      const stockBase = roundQty(Number(b.qtyBase || 0));
      if (stockBase <= 0) continue;
      const list = batchesByProduct.get(b.productId) || [];
      list.push({
        batchId: b.batchId,
        locationId: b.locationId,
        locationName: b.locationName || "Gudang Cabang",
        batchNumber: b.batchNo || "BATCH-REG",
        expiryDate: b.expiredDate || null,
        stockBase,
        buyPrice: Number(b.buyPrice || 0),
        isUnbatched: false
      });
      batchesByProduct.set(b.productId, list);
    }

    for (const u of unbatchedRows) {
      const unbatched = roundQty(Number(u.unbatchedQtyBase || 0));
      if (unbatched <= 0) continue;
      const list = batchesByProduct.get(u.productId) || [];
      list.push({
        batchId: "UNBATCHED",
        locationId: u.locationId,
        locationName: u.locationName || "Gudang Cabang",
        batchNumber: "STOK-UMUM",
        expiryDate: null,
        stockBase: unbatched,
        buyPrice: 0,
        isUnbatched: true
      });
      batchesByProduct.set(u.productId, list);
    }

    const productIds = Array.from(batchesByProduct.keys());
    if (productIds.length === 0) return [];

    const [prodRows, unitRows] = await Promise.all([
      db
        .select()
        .from(schema.products)
        .where(and(inArray(schema.products.id, productIds), eq(schema.products.isActive, true)))
        .orderBy(asc(schema.products.name)),
      db
        .select()
        .from(schema.productUnits)
        .where(inArray(schema.productUnits.productId, productIds))
        .orderBy(asc(schema.productUnits.conversionFactor))
    ]);

    const unitsByProduct = new Map<string, any[]>();
    for (const u of unitRows) {
      const list = unitsByProduct.get(u.productId) || [];
      list.push({
        id: u.id,
        unitName: String(u.unitName || "").trim().toUpperCase(),
        conversionFactor: Math.max(1, Number(u.conversionFactor || 1)),
        isBaseUnit: Boolean(u.isBaseUnit),
        isSellable: u.isSellable !== false,
        isPurchaseUnit: Boolean(u.isPurchaseUnit),
        buyPrice: Number(u.buyPrice || 0),
        salePriceGeneral: Number(u.salePriceGeneral || 0),
        salePriceResep: Number(u.salePriceResep || 0)
      });
      unitsByProduct.set(u.productId, list);
    }

    return prodRows
      .map((p) => {
        const batches = batchesByProduct.get(p.id) || [];
        const totalStockBase = roundQty(
          batches.reduce((sum, b) => sum + Number(b.stockBase || 0), 0)
        );
        if (totalStockBase <= 0) return null;

        const baseUnit = String(p.baseUnit || "PCS").trim().toUpperCase();
        const rawUnits = unitsByProduct.get(p.id) || [];
        const units =
          rawUnits.length > 0
            ? rawUnits
            : [
                {
                  id: undefined,
                  unitName: baseUnit,
                  conversionFactor: 1,
                  isBaseUnit: true,
                  isSellable: true,
                  isPurchaseUnit: true,
                  buyPrice: Number(p.referenceBuyPriceBase || 0),
                  salePriceGeneral: 0,
                  salePriceResep: 0
                }
              ];

        // Pastikan baseUnit selalu tersedia dalam daftar satuan
        if (!units.some((u) => u.unitName === baseUnit)) {
          units.unshift({
            id: undefined,
            unitName: baseUnit,
            conversionFactor: 1,
            isBaseUnit: true,
            isSellable: true,
            isPurchaseUnit: false,
            buyPrice: Number(p.referenceBuyPriceBase || 0),
            salePriceGeneral: 0,
            salePriceResep: 0
          });
        }

        return {
          id: p.id,
          sku: p.sku,
          barcode: p.barcode || "",
          name: p.name,
          activeSubstance: p.activeSubstance || "",
          baseUnit,
          defaultPurchaseUnit: p.defaultPurchaseUnit || baseUnit,
          referenceBuyPriceBase: Number(p.referenceBuyPriceBase || 0),
          totalStockBase,
          units,
          batches
        };
      })
      .filter(Boolean);
  }

  private async formatTransferDocs(transferRows: any[]) {
    if (transferRows.length === 0) return [];

    const transferIds = transferRows.map((t) => t.id);

    const allItems = await db
      .select({
        id: schema.stockTransferItems.id,
        transferId: schema.stockTransferItems.transferId,
        lineNo: schema.stockTransferItems.lineNo,
        productId: schema.stockTransferItems.productId,
        productName: schema.products.name,
        sku: schema.products.sku,
        batchId: schema.stockTransferItems.batchId,
        batchNumber: schema.productBatches.batchNo,
        expiryDate: schema.productBatches.expiredDate,
        qty: schema.stockTransferItems.qtySentBase,
        receivedQty: schema.stockTransferItems.qtyReceivedBase,
        discrepancyQty: schema.stockTransferItems.discrepancyQtyBase,
        discrepancyReason: schema.stockTransferItems.discrepancyReason,
        costPerUnit: schema.stockTransferItems.costPerUnit,
        unit: schema.products.baseUnit
      })
      .from(schema.stockTransferItems)
      .leftJoin(schema.products, eq(schema.stockTransferItems.productId, schema.products.id))
      .leftJoin(schema.productBatches, eq(schema.stockTransferItems.batchId, schema.productBatches.id))
      .where(inArray(schema.stockTransferItems.transferId, transferIds))
      .orderBy(schema.stockTransferItems.lineNo);

    const itemProductIds = Array.from(new Set(allItems.map((i) => i.productId).filter(Boolean)));
    const unitsByProduct = new Map<string, Array<{ unitName: string; conversionFactor: number; isBaseUnit: boolean }>>();

    if (itemProductIds.length > 0) {
      const unitRows = await db
        .select({
          productId: schema.productUnits.productId,
          unitName: schema.productUnits.unitName,
          conversionFactor: schema.productUnits.conversionFactor,
          isBaseUnit: schema.productUnits.isBaseUnit
        })
        .from(schema.productUnits)
        .where(inArray(schema.productUnits.productId, itemProductIds))
        .orderBy(asc(schema.productUnits.conversionFactor));

      for (const u of unitRows) {
        const list = unitsByProduct.get(u.productId) || [];
        list.push({
          unitName: String(u.unitName || "").trim().toUpperCase(),
          conversionFactor: Math.max(1, Number(u.conversionFactor || 1)),
          isBaseUnit: Boolean(u.isBaseUnit)
        });
        unitsByProduct.set(u.productId, list);
      }
    }

    return transferRows.map((t) => {
      const items = allItems.filter((i) => i.transferId === t.id);
      const normalizedStatus = (t.status === "DISPATCHED" ? "IN_TRANSIT" : t.status) as
        | "REQUESTED"
        | "IN_TRANSIT"
        | "RECEIVED"
        | "RECEIVED_DISCREPANCY";
      const isReceived = normalizedStatus === "RECEIVED" || normalizedStatus === "RECEIVED_DISCREPANCY";
      const rtbNo = isReceived ? `RTB-${t.transferNumber.replace(/^(RKB|SJL)[-/]/, "")}` : undefined;

      const dateStr = t.transferDate ? new Date(t.transferDate).toISOString() : "";
      const recDateStr = t.receivedDate ? new Date(t.receivedDate).toISOString() : undefined;

      return {
        id: t.id,
        transferNumber: t.transferNumber,
        receiptNumber: rtbNo,
        fromBranchId: t.fromBranchId,
        fromBranchName: t.fromBranchName || "Cabang Asal",
        toBranchId: t.toBranchId,
        toBranchName: t.toBranchName || "Cabang Tujuan",
        transferDate: dateStr,
        receivedDate: recDateStr,
        courierName: t.courierName || "",
        operator: t.shipperName || "Petugas Pengirim",
        receivedBy: isReceived ? (t.receiverName || "Petugas Penerima") : undefined,
        status: normalizedStatus,
        notes: t.notes || "",
        receiptNotes: t.receiptNotes || "",
        items: items.map((it) => {
          const baseUnit = String(it.unit || "PCS").trim().toUpperCase();
          const prodUnits = unitsByProduct.get(it.productId) || [
            { unitName: baseUnit, conversionFactor: 1, isBaseUnit: true }
          ];
          return {
            lineNo: it.lineNo,
            productId: it.productId,
            productName: it.productName || "Obat",
            sku: it.sku || "",
            batchId: it.batchId,
            batchNumber: it.batchNumber || "BATCH-REG",
            expiryDate: it.expiryDate || null,
            qty: Number(it.qty),
            receivedQty: it.receivedQty !== null ? Number(it.receivedQty) : undefined,
            discrepancyQty: Number(it.discrepancyQty || 0),
            discrepancyReason: it.discrepancyReason || undefined,
            costPerUnit: Number(it.costPerUnit || 0),
            unit: baseUnit,
            units: prodUnits,
            status: normalizedStatus
          };
        })
      };
    });
  }

  private async getTransferByIdFormatted(transferId: string) {
    const fromBranches = db
      .select({ id: schema.branches.id, name: schema.branches.name })
      .from(schema.branches)
      .as("from_branches");

    const toBranches = db
      .select({ id: schema.branches.id, name: schema.branches.name })
      .from(schema.branches)
      .as("to_branches");

    const shipperUsers = db
      .select({ id: schema.users.id, fullName: schema.users.fullName })
      .from(schema.users)
      .as("shipper_users");

    const receiverUsers = db
      .select({ id: schema.users.id, fullName: schema.users.fullName })
      .from(schema.users)
      .as("receiver_users");

    const rows = await db
      .select({
        id: schema.stockTransfers.id,
        transferNumber: schema.stockTransfers.transferNumber,
        fromBranchId: schema.stockTransfers.sourceBranchId,
        fromBranchName: fromBranches.name,
        toBranchId: schema.stockTransfers.destBranchId,
        toBranchName: toBranches.name,
        transferDate: schema.stockTransfers.shippedAt,
        receivedDate: schema.stockTransfers.receivedAt,
        courierName: schema.stockTransfers.trackingCourier,
        shipperName: shipperUsers.fullName,
        receiverName: receiverUsers.fullName,
        status: schema.stockTransfers.status,
        notes: schema.stockTransfers.notes,
        receiptNotes: schema.stockTransfers.receiptNotes
      })
      .from(schema.stockTransfers)
      .leftJoin(fromBranches, eq(schema.stockTransfers.sourceBranchId, fromBranches.id))
      .leftJoin(toBranches, eq(schema.stockTransfers.destBranchId, toBranches.id))
      .leftJoin(shipperUsers, eq(schema.stockTransfers.shippedBy, shipperUsers.id))
      .leftJoin(receiverUsers, eq(schema.stockTransfers.receivedBy, receiverUsers.id))
      .where(eq(schema.stockTransfers.id, transferId))
      .limit(1);

    const formatted = await this.formatTransferDocs(rows);
    return formatted[0] || null;
  }

  async getTransfers(branchId?: string, limit = 50, tenantCandidate?: string) {
    const tenantId = await this.resolveTenantId(db, tenantCandidate);
    const resolvedBranchId = await this.resolveOptionalBranchId(db, tenantId, branchId);

    const conditions = [eq(schema.stockTransfers.tenantId, tenantId)];
    if (resolvedBranchId) {
      conditions.push(
        sql`(${schema.stockTransfers.sourceBranchId} = ${resolvedBranchId} OR ${schema.stockTransfers.destBranchId} = ${resolvedBranchId})`
      );
    }

    const fromBranches = db
      .select({ id: schema.branches.id, name: schema.branches.name })
      .from(schema.branches)
      .as("from_branches");

    const toBranches = db
      .select({ id: schema.branches.id, name: schema.branches.name })
      .from(schema.branches)
      .as("to_branches");

    const shipperUsers = db
      .select({ id: schema.users.id, fullName: schema.users.fullName })
      .from(schema.users)
      .as("shipper_users");

    const receiverUsers = db
      .select({ id: schema.users.id, fullName: schema.users.fullName })
      .from(schema.users)
      .as("receiver_users");

    const transfers = await db
      .select({
        id: schema.stockTransfers.id,
        transferNumber: schema.stockTransfers.transferNumber,
        fromBranchId: schema.stockTransfers.sourceBranchId,
        fromBranchName: fromBranches.name,
        toBranchId: schema.stockTransfers.destBranchId,
        toBranchName: toBranches.name,
        transferDate: schema.stockTransfers.shippedAt,
        receivedDate: schema.stockTransfers.receivedAt,
        courierName: schema.stockTransfers.trackingCourier,
        shipperName: shipperUsers.fullName,
        receiverName: receiverUsers.fullName,
        status: schema.stockTransfers.status,
        notes: schema.stockTransfers.notes,
        receiptNotes: schema.stockTransfers.receiptNotes
      })
      .from(schema.stockTransfers)
      .leftJoin(fromBranches, eq(schema.stockTransfers.sourceBranchId, fromBranches.id))
      .leftJoin(toBranches, eq(schema.stockTransfers.destBranchId, toBranches.id))
      .leftJoin(shipperUsers, eq(schema.stockTransfers.shippedBy, shipperUsers.id))
      .leftJoin(receiverUsers, eq(schema.stockTransfers.receivedBy, receiverUsers.id))
      .where(and(...conditions))
      .orderBy(desc(schema.stockTransfers.shippedAt))
      .limit(limit);

    return await this.formatTransferDocs(transfers);
  }

  /**
   * Memotong stok cabang asal secara atomik (validasi tersedia -> potong batch -> potong branch_stocks)
   */
  private async deductSourceStockForItem(
    tx: any,
    params: {
      tenantId: string;
      sourceBranchId: string;
      defaultSourceLocationId: string;
      product: typeof schema.products.$inferSelect;
      qtyBaseNeeded: number;
      preferredBatchId?: string;
      preferredBatchNo?: string;
      preferredLocationId?: string;
    }
  ): Promise<
    Array<{
      locationId: string;
      batchId: string;
      qtyBase: number;
      costPerUnit: number;
    }>
  > {
    const {
      tenantId,
      sourceBranchId,
      defaultSourceLocationId,
      product,
      qtyBaseNeeded,
      preferredBatchId,
      preferredBatchNo,
      preferredLocationId
    } = params;

    const now = new Date();
    const refBuyPrice = Number(product.referenceBuyPriceBase || 0);
    const allocations: Array<{
      locationId: string;
      batchId: string;
      qtyBase: number;
      costPerUnit: number;
    }> = [];

    const deductBranchTotal = async (locId: string, deductQty: number, deductUnbatched = false) => {
      const [bs] = await tx
        .select()
        .from(schema.branchStocks)
        .where(
          and(
            eq(schema.branchStocks.branchId, sourceBranchId),
            eq(schema.branchStocks.locationId, locId),
            eq(schema.branchStocks.productId, product.id)
          )
        )
        .limit(1);

      if (bs) {
        const newTotal = roundQty(Math.max(0, Number(bs.totalQtyBase || 0) - deductQty));
        const newUnbatched = deductUnbatched
          ? roundQty(Math.max(0, Number(bs.unbatchedQtyBase || 0) - deductQty))
          : Number(bs.unbatchedQtyBase || 0);
        await tx
          .update(schema.branchStocks)
          .set({
            totalQtyBase: String(newTotal),
            unbatchedQtyBase: String(newUnbatched),
            updatedAt: now
          })
          .where(eq(schema.branchStocks.id, bs.id));
      }
    };

    // Mode 1: Batch spesifik (UUID)
    if (isUuid(preferredBatchId)) {
      const candidates = await tx
        .select({
          id: schema.branchBatchStocks.id,
          locationId: schema.branchBatchStocks.locationId,
          batchId: schema.branchBatchStocks.batchId,
          qtyBase: schema.branchBatchStocks.qtyBase,
          buyPrice: schema.branchBatchStocks.buyPrice,
          batchNo: schema.productBatches.batchNo
        })
        .from(schema.branchBatchStocks)
        .leftJoin(
          schema.productBatches,
          eq(schema.branchBatchStocks.batchId, schema.productBatches.id)
        )
        .where(
          and(
            eq(schema.branchBatchStocks.branchId, sourceBranchId),
            eq(schema.branchBatchStocks.productId, product.id),
            eq(schema.branchBatchStocks.batchId, preferredBatchId),
            sql`${schema.branchBatchStocks.qtyBase} > 0`
          )
        )
        .orderBy(desc(schema.branchBatchStocks.qtyBase));

      const sortedCandidates = isUuid(preferredLocationId)
        ? [...candidates].sort((a, b) =>
            a.locationId === preferredLocationId ? -1 : b.locationId === preferredLocationId ? 1 : 0
          )
        : candidates;

      const totalBatchAvail = roundQty(
        sortedCandidates.reduce((sum: number, c: any) => sum + Number(c.qtyBase || 0), 0)
      );
      if (totalBatchAvail + 1e-6 < qtyBaseNeeded) {
        const batchLabel = sortedCandidates[0]?.batchNo || preferredBatchNo || preferredBatchId;
        throw new Error(
          `Stok ${product.name} (Batch ${batchLabel}) di cabang pengirim tidak mencukupi. Tersedia ${totalBatchAvail} ${product.baseUnit}, diminta ${qtyBaseNeeded} ${product.baseUnit}.`
        );
      }

      let rem = qtyBaseNeeded;
      for (const c of sortedCandidates) {
        if (rem <= 0) break;
        const avail = roundQty(Number(c.qtyBase || 0));
        if (avail <= 0) continue;
        const take = roundQty(Math.min(avail, rem));
        const newQty = roundQty(avail - take);

        await tx
          .update(schema.branchBatchStocks)
          .set({ qtyBase: String(newQty), updatedAt: now })
          .where(eq(schema.branchBatchStocks.id, c.id));

        await deductBranchTotal(c.locationId, take, false);

        allocations.push({
          locationId: c.locationId,
          batchId: c.batchId,
          qtyBase: take,
          costPerUnit: Number(c.buyPrice || 0) || refBuyPrice
        });
        rem = roundQty(rem - take);
      }

      return allocations;
    }

    // Mode 2: Stok unbatched eksplisit
    if (preferredBatchId === "UNBATCHED") {
      const unbatchedRows = await tx
        .select()
        .from(schema.branchStocks)
        .where(
          and(
            eq(schema.branchStocks.branchId, sourceBranchId),
            eq(schema.branchStocks.productId, product.id),
            sql`${schema.branchStocks.unbatchedQtyBase} > 0`
          )
        )
        .orderBy(desc(schema.branchStocks.unbatchedQtyBase));

      const totalUnbatched = roundQty(
        unbatchedRows.reduce((sum: number, r: any) => sum + Number(r.unbatchedQtyBase || 0), 0)
      );
      if (totalUnbatched + 1e-6 < qtyBaseNeeded) {
        throw new Error(
          `Stok ${product.name} (STOK-UMUM) di cabang pengirim tidak mencukupi. Tersedia ${totalUnbatched} ${product.baseUnit}, diminta ${qtyBaseNeeded} ${product.baseUnit}.`
        );
      }

      const fallbackBatchId = await this.getOrCreateBatch(
        tx,
        product.id,
        "STOK-UMUM",
        tenantId,
        "2099-12-31"
      );

      let rem = qtyBaseNeeded;
      for (const row of unbatchedRows) {
        if (rem <= 0) break;
        const avail = roundQty(Number(row.unbatchedQtyBase || 0));
        if (avail <= 0) continue;
        const take = roundQty(Math.min(avail, rem));
        await deductBranchTotal(row.locationId, take, true);
        allocations.push({
          locationId: row.locationId,
          batchId: fallbackBatchId,
          qtyBase: take,
          costPerUnit: refBuyPrice
        });
        rem = roundQty(rem - take);
      }
      return allocations;
    }

    // Mode 3: AUTO FEFO (urutkan berdasarkan expiredDate ASC) + cek stok unbatched jika masih sisa
    const fefoCandidates = await tx
      .select({
        id: schema.branchBatchStocks.id,
        locationId: schema.branchBatchStocks.locationId,
        batchId: schema.branchBatchStocks.batchId,
        qtyBase: schema.branchBatchStocks.qtyBase,
        buyPrice: schema.branchBatchStocks.buyPrice,
        batchNo: schema.productBatches.batchNo,
        expiredDate: schema.productBatches.expiredDate
      })
      .from(schema.branchBatchStocks)
      .leftJoin(
        schema.productBatches,
        eq(schema.branchBatchStocks.batchId, schema.productBatches.id)
      )
      .where(
        and(
          eq(schema.branchBatchStocks.branchId, sourceBranchId),
          eq(schema.branchBatchStocks.productId, product.id),
          sql`${schema.branchBatchStocks.qtyBase} > 0`
        )
      )
      .orderBy(
        sql`${schema.productBatches.expiredDate} ASC NULLS LAST`,
        asc(schema.branchBatchStocks.updatedAt)
      );

    // Jika caller menyebut batchNumber tertentu, prioritaskan batch tersebut terlebih dulu
    const prioritizedCandidates = preferredBatchNo
      ? [...fefoCandidates].sort((a, b) => {
          const aMatch = (a.batchNo || "").toUpperCase() === preferredBatchNo.trim().toUpperCase() ? 0 : 1;
          const bMatch = (b.batchNo || "").toUpperCase() === preferredBatchNo.trim().toUpperCase() ? 0 : 1;
          return aMatch - bMatch;
        })
      : fefoCandidates;

    const unbatchedRows = await tx
      .select()
      .from(schema.branchStocks)
      .where(
        and(
          eq(schema.branchStocks.branchId, sourceBranchId),
          eq(schema.branchStocks.productId, product.id),
          sql`${schema.branchStocks.unbatchedQtyBase} > 0`
        )
      );

    const totalBatched = prioritizedCandidates.reduce(
      (sum: number, c: any) => sum + Number(c.qtyBase || 0),
      0
    );
    const totalUnbatched = unbatchedRows.reduce(
      (sum: number, r: any) => sum + Number(r.unbatchedQtyBase || 0),
      0
    );
    const totalAvail = roundQty(totalBatched + totalUnbatched);

    if (totalAvail + 1e-6 < qtyBaseNeeded) {
      throw new Error(
        `Stok ${product.name} di cabang pengirim tidak mencukupi. Tersedia ${totalAvail} ${product.baseUnit}, diminta ${qtyBaseNeeded} ${product.baseUnit}.`
      );
    }

    let rem = qtyBaseNeeded;
    for (const c of prioritizedCandidates) {
      if (rem <= 0) break;
      const avail = roundQty(Number(c.qtyBase || 0));
      if (avail <= 0) continue;
      const take = roundQty(Math.min(avail, rem));
      const newQty = roundQty(avail - take);

      await tx
        .update(schema.branchBatchStocks)
        .set({ qtyBase: String(newQty), updatedAt: now })
        .where(eq(schema.branchBatchStocks.id, c.id));

      await deductBranchTotal(c.locationId, take, false);

      allocations.push({
        locationId: c.locationId,
        batchId: c.batchId,
        qtyBase: take,
        costPerUnit: Number(c.buyPrice || 0) || refBuyPrice
      });
      rem = roundQty(rem - take);
    }

    if (rem > 0) {
      const fallbackBatchId = await this.getOrCreateBatch(
        tx,
        product.id,
        "STOK-UMUM",
        tenantId,
        "2099-12-31"
      );
      for (const row of unbatchedRows) {
        if (rem <= 0) break;
        const avail = roundQty(Number(row.unbatchedQtyBase || 0));
        if (avail <= 0) continue;
        const take = roundQty(Math.min(avail, rem));
        await deductBranchTotal(row.locationId || defaultSourceLocationId, take, true);
        allocations.push({
          locationId: row.locationId || defaultSourceLocationId,
          batchId: fallbackBatchId,
          qtyBase: take,
          costPerUnit: refBuyPrice
        });
        rem = roundQty(rem - take);
      }
    }

    return allocations;
  }

  async createTransfer(payload: CreateTransferPayload) {
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error("Daftar item pengiriman tidak boleh kosong");
    }

    const resultId = await db.transaction(async (tx) => {
      const tenantId = await this.resolveTenantId(tx, payload.tenantId);
      const fromBranch = await this.resolveBranch(tx, tenantId, payload.fromBranchId);
      const toBranch = await this.resolveBranch(tx, tenantId, payload.toBranchId);

      if (fromBranch.id === toBranch.id) {
        throw new Error("Cabang asal dan cabang tujuan tidak boleh sama");
      }

      const sourceLocationId = await this.getDefaultLocation(tx, fromBranch.id, tenantId);
      const destLocationId = await this.getDefaultLocation(tx, toBranch.id, tenantId);
      const shipper = await this.resolveUser(tx, tenantId, payload.userId, payload.operator);

      const now = new Date();
      const randomSeq = Math.floor(100 + Math.random() * 900);
      const transferNumber = payload.transferNumber || generateTransferNumber(randomSeq, now);
      const transferId = crypto.randomUUID();
      const status = payload.status || "IN_TRANSIT";

      await tx.insert(schema.stockTransfers).values({
        id: transferId,
        tenantId,
        transferNumber,
        sourceBranchId: fromBranch.id,
        destBranchId: toBranch.id,
        sourceLocationId,
        destLocationId,
        status,
        trackingCourier: (payload.courierName || "").trim() || "Kurir Internal",
        notes: (payload.notes || "").trim() || "Pengiriman stok antar cabang",
        shippedBy: shipper.id,
        shippedAt: now
      });

      const itemsToInsert: any[] = [];
      const ledgerMutations: any[] = [];
      let lineNo = 1;

      for (const it of payload.items) {
        if (!isUuid(it.productId)) {
          throw new Error("ID produk tidak valid");
        }
        const [product] = await tx
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, it.productId))
          .limit(1);

        if (!product) {
          throw new Error(`Produk dengan ID ${it.productId} tidak ditemukan`);
        }

        const prodUnits = await tx
          .select()
          .from(schema.productUnits)
          .where(eq(schema.productUnits.productId, product.id));

        const requestedUnit = String(it.unit || product.baseUnit || "").trim().toUpperCase();
        const baseUnitUpper = String(product.baseUnit || "PCS").trim().toUpperCase();
        const matchedUnit = prodUnits.find(
          (u: any) => String(u.unitName || "").trim().toUpperCase() === requestedUnit
        );

        let conversionFactor = 1;
        let unitLabel = baseUnitUpper;
        if (matchedUnit) {
          conversionFactor = Math.max(1, Number(matchedUnit.conversionFactor || 1));
          unitLabel = String(matchedUnit.unitName || baseUnitUpper).trim().toUpperCase();
        } else if (requestedUnit && requestedUnit !== baseUnitUpper) {
          throw new Error(`Satuan "${requestedUnit}" tidak terdaftar pada produk ${product.name}`);
        }

        const inputQty = Number(it.qty);
        if (!Number.isFinite(inputQty) || inputQty <= 0) {
          throw new Error(`Jumlah pengiriman untuk ${product.name} harus lebih dari 0`);
        }

        const qtySentBase = roundQty(inputQty * conversionFactor);

        if (status === "IN_TRANSIT") {
          const allocations = await this.deductSourceStockForItem(tx, {
            tenantId,
            sourceBranchId: fromBranch.id,
            defaultSourceLocationId: sourceLocationId,
            product,
            qtyBaseNeeded: qtySentBase,
            preferredBatchId: it.batchId,
            preferredBatchNo: it.batchNumber,
            preferredLocationId: it.locationId
          });

          for (const alloc of allocations) {
            itemsToInsert.push({
              id: crypto.randomUUID(),
              transferId,
              productId: product.id,
              batchId: alloc.batchId,
              lineNo: lineNo++,
              qtySentBase: String(alloc.qtyBase),
              qtyReceivedBase: null,
              discrepancyQtyBase: "0",
              discrepancyReason: null,
              costPerUnit: String(alloc.costPerUnit)
            });

            ledgerMutations.push({
              id: crypto.randomUUID(),
              tenantId,
              branchId: fromBranch.id,
              productId: product.id,
              locationId: alloc.locationId,
              batchId: alloc.batchId,
              mutationType: "TRANSFER_OUT",
              quantityBase: String(-alloc.qtyBase),
              costPerUnit: String(alloc.costPerUnit),
              referenceId: transferId,
              notes: `Transfer Out via ${transferNumber} (${inputQty} ${unitLabel} = ${qtySentBase} ${baseUnitUpper}) ke ${toBranch.name}`,
              createdBy: shipper.id,
              createdAt: now
            });
          }

          await tx
            .update(schema.products)
            .set({ updatedAt: now })
            .where(eq(schema.products.id, product.id));
        } else {
          // Status REQUESTED: belum memotong stok hingga disetujui & diberangkatkan (dispatch)
          let batchId: string;
          if (isUuid(it.batchId)) {
            batchId = it.batchId;
          } else {
            const [existingBatch] = await tx
              .select({ id: schema.productBatches.id })
              .from(schema.productBatches)
              .where(eq(schema.productBatches.productId, product.id))
              .limit(1);
            batchId = existingBatch
              ? existingBatch.id
              : await this.getOrCreateBatch(
                  tx,
                  product.id,
                  it.batchNumber || "BATCH-REQ",
                  tenantId,
                  it.expiryDate
                );
          }

          itemsToInsert.push({
            id: crypto.randomUUID(),
            transferId,
            productId: product.id,
            batchId,
            lineNo: lineNo++,
            qtySentBase: String(qtySentBase),
            qtyReceivedBase: null,
            discrepancyQtyBase: "0",
            discrepancyReason: null,
            costPerUnit: String(Number(product.referenceBuyPriceBase || 0))
          });
        }
      }

      if (itemsToInsert.length > 0) {
        await tx.insert(schema.stockTransferItems).values(itemsToInsert);
      }
      if (ledgerMutations.length > 0) {
        await tx.insert(schema.stockLedger).values(ledgerMutations);
      }

      return {
        transferId,
        transferNumber,
        status,
        fromBranchName: fromBranch.name,
        toBranchName: toBranch.name
      };
    });

    const formatted = await this.getTransferByIdFormatted(resultId.transferId);

    return {
      success: true,
      message:
        resultId.status === "IN_TRANSIT"
          ? `Surat Jalan ${resultId.transferNumber} berhasil diterbitkan dan stok ${resultId.fromBranchName} telah dipotong`
          : `Permintaan mutasi ${resultId.transferNumber} berhasil diajukan ke ${resultId.fromBranchName}`,
      data: formatted
    };
  }

  async receiveTransfer(payload: ReceiveTransferPayload) {
    if (!isUuid(payload.transferId)) {
      throw new Error("ID surat jalan tidak valid");
    }

    const txResult = await db.transaction(async (tx) => {
      const [transfer] = await tx
        .select()
        .from(schema.stockTransfers)
        .where(eq(schema.stockTransfers.id, payload.transferId))
        .limit(1);

      if (!transfer) {
        throw new Error(`Surat jalan dengan ID ${payload.transferId} tidak ditemukan`);
      }

      if (transfer.status === "RECEIVED" || transfer.status === "RECEIVED_DISCREPANCY") {
        return { alreadyReceived: true, transfer };
      }

      if (transfer.status === "REQUESTED") {
        throw new Error(
          `Surat jalan ${transfer.transferNumber} masih berstatus DIMINTA dan belum diberangkatkan oleh cabang pengirim`
        );
      }

      const receiver = await this.resolveUser(
        tx,
        transfer.tenantId,
        payload.userId,
        payload.receivedBy
      );

      const destLocationId =
        transfer.destLocationId ||
        (await this.getDefaultLocation(tx, transfer.destBranchId, transfer.tenantId));

      const items = await tx
        .select()
        .from(schema.stockTransferItems)
        .where(eq(schema.stockTransferItems.transferId, transfer.id))
        .orderBy(asc(schema.stockTransferItems.lineNo));

      if (items.length === 0) {
        throw new Error("Surat jalan tidak memiliki daftar item obat");
      }

      let anyDiff = false;
      const now = new Date();
      const ledgerMutations: any[] = [];

      for (const line of items) {
        const match = payload.items.find((p) => p.lineNo === line.lineNo);
        const sentQty = roundQty(Number(line.qtySentBase));
        const recQty = match ? roundQty(Math.max(0, Number(match.qtyReceived))) : sentQty;
        const diff = roundQty(recQty - sentQty);
        if (diff !== 0) anyDiff = true;

        await tx
          .update(schema.stockTransferItems)
          .set({
            qtyReceivedBase: String(recQty),
            discrepancyQtyBase: String(diff),
            discrepancyReason:
              diff !== 0
                ? match?.discrepancyReason?.trim() || "Selisih hitung fisik saat penerimaan"
                : null
          })
          .where(eq(schema.stockTransferItems.id, line.id));

        const itemCost = Number(line.costPerUnit || 0);

        // Tambahkan stok fisik ke cabang tujuan (branch_batch_stocks & branch_stocks)
        if (recQty > 0) {
          const [existingBatchStock] = await tx
            .select()
            .from(schema.branchBatchStocks)
            .where(
              and(
                eq(schema.branchBatchStocks.branchId, transfer.destBranchId),
                eq(schema.branchBatchStocks.locationId, destLocationId),
                eq(schema.branchBatchStocks.productId, line.productId),
                eq(schema.branchBatchStocks.batchId, line.batchId)
              )
            )
            .limit(1);

          if (existingBatchStock) {
            const newBatchQty = roundQty(Number(existingBatchStock.qtyBase || 0) + recQty);
            await tx
              .update(schema.branchBatchStocks)
              .set({
                qtyBase: String(newBatchQty),
                buyPrice: itemCost > 0 ? String(itemCost) : existingBatchStock.buyPrice,
                updatedAt: now
              })
              .where(eq(schema.branchBatchStocks.id, existingBatchStock.id));
          } else {
            await tx.insert(schema.branchBatchStocks).values({
              id: crypto.randomUUID(),
              tenantId: transfer.tenantId,
              branchId: transfer.destBranchId,
              locationId: destLocationId,
              productId: line.productId,
              batchId: line.batchId,
              qtyBase: String(recQty),
              buyPrice: String(itemCost),
              updatedAt: now
            });
          }

          const [existingBranchStock] = await tx
            .select()
            .from(schema.branchStocks)
            .where(
              and(
                eq(schema.branchStocks.locationId, destLocationId),
                eq(schema.branchStocks.productId, line.productId)
              )
            )
            .limit(1);

          if (existingBranchStock) {
            const newTotal = roundQty(Number(existingBranchStock.totalQtyBase || 0) + recQty);
            await tx
              .update(schema.branchStocks)
              .set({
                totalQtyBase: String(newTotal),
                updatedAt: now
              })
              .where(eq(schema.branchStocks.id, existingBranchStock.id));
          } else {
            await tx.insert(schema.branchStocks).values({
              id: crypto.randomUUID(),
              tenantId: transfer.tenantId,
              branchId: transfer.destBranchId,
              locationId: destLocationId,
              productId: line.productId,
              totalQtyBase: String(recQty),
              unbatchedQtyBase: "0",
              updatedAt: now
            });
          }

          await tx
            .update(schema.products)
            .set({ updatedAt: now })
            .where(eq(schema.products.id, line.productId));
        }

        // Catat di stock_ledger cabang tujuan (TRANSFER_IN)
        ledgerMutations.push({
          id: crypto.randomUUID(),
          tenantId: transfer.tenantId,
          branchId: transfer.destBranchId,
          productId: line.productId,
          locationId: destLocationId,
          batchId: line.batchId,
          mutationType: "TRANSFER_IN",
          quantityBase: String(recQty),
          costPerUnit: String(itemCost),
          referenceId: transfer.id,
          notes: `Transfer In dari ${transfer.transferNumber}${diff !== 0 ? ` (Selisih ${diff > 0 ? `+${diff}` : diff})` : ""}`,
          createdBy: receiver.id,
          createdAt: now
        });
      }

      if (ledgerMutations.length > 0) {
        await tx.insert(schema.stockLedger).values(ledgerMutations);
      }

      const finalStatus = anyDiff ? "RECEIVED_DISCREPANCY" : "RECEIVED";
      const rtbNo = `RTB-${transfer.transferNumber.replace(/^(RKB|SJL)[-/]/, "")}`;

      await tx
        .update(schema.stockTransfers)
        .set({
          status: finalStatus,
          receivedAt: now,
          receivedBy: receiver.id,
          receiptNotes:
            (payload.receiptNotes || "").trim() ||
            (anyDiff ? "Diterima dengan selisih fisik" : "Diterima lengkap dan cocok")
        })
        .where(eq(schema.stockTransfers.id, transfer.id));

      return {
        alreadyReceived: false,
        anyDiff,
        rtbNo,
        transferId: transfer.id
      };
    });

    if (txResult.alreadyReceived || !txResult.transferId) {
      return {
        success: false,
        error: "Pengiriman ini sudah diverifikasi sebelumnya",
        message: "Pengiriman ini sudah diverifikasi sebelumnya"
      };
    }

    const formatted = await this.getTransferByIdFormatted(txResult.transferId);

    return {
      success: true,
      message: txResult.anyDiff
        ? `Penerimaan ${txResult.rtbNo} berhasil diverifikasi dengan Status: DITERIMA SELISIH`
        : `Penerimaan ${txResult.rtbNo} berhasil diverifikasi 100% Cocok!`,
      data: formatted
    };
  }

  async dispatchTransfer(
    transferId: string,
    courierName?: string,
    userId?: string,
    operatorName?: string
  ) {
    if (!isUuid(transferId)) {
      throw new Error("ID surat jalan tidak valid");
    }

    const dispatched = await db.transaction(async (tx) => {
      const [transfer] = await tx
        .select()
        .from(schema.stockTransfers)
        .where(eq(schema.stockTransfers.id, transferId))
        .limit(1);

      if (!transfer) {
        throw new Error(`Surat jalan dengan ID ${transferId} tidak ditemukan`);
      }

      if (transfer.status !== "REQUESTED") {
        throw new Error(
          `Surat jalan ${transfer.transferNumber} sudah berstatus ${transfer.status}`
        );
      }

      const shipper = await this.resolveUser(tx, transfer.tenantId, userId, operatorName);
      const now = new Date();
      const items = await tx
        .select()
        .from(schema.stockTransferItems)
        .where(eq(schema.stockTransferItems.transferId, transfer.id))
        .orderBy(asc(schema.stockTransferItems.lineNo));

      const rebuiltItems: any[] = [];
      const ledgerMutations: any[] = [];
      let lineNo = 1;

      for (const line of items) {
        const [product] = await tx
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, line.productId))
          .limit(1);

        if (!product) {
          throw new Error("Produk pada surat jalan tidak ditemukan");
        }

        const qtySentBase = roundQty(Number(line.qtySentBase));
        // Coba batch dari baris permintaan dulu jika tersedia di cabang pengirim, jika tidak pakai FEFO cabang pengirim
        const [hasLineBatch] = await tx
          .select({ qtyBase: schema.branchBatchStocks.qtyBase })
          .from(schema.branchBatchStocks)
          .where(
            and(
              eq(schema.branchBatchStocks.branchId, transfer.sourceBranchId),
              eq(schema.branchBatchStocks.productId, line.productId),
              eq(schema.branchBatchStocks.batchId, line.batchId),
              sql`${schema.branchBatchStocks.qtyBase} >= ${qtySentBase}`
            )
          )
          .limit(1);

        const allocations = await this.deductSourceStockForItem(tx, {
          tenantId: transfer.tenantId,
          sourceBranchId: transfer.sourceBranchId,
          defaultSourceLocationId: transfer.sourceLocationId,
          product,
          qtyBaseNeeded: qtySentBase,
          preferredBatchId: hasLineBatch ? line.batchId : undefined
        });

        for (const alloc of allocations) {
          rebuiltItems.push({
            id: crypto.randomUUID(),
            transferId: transfer.id,
            productId: line.productId,
            batchId: alloc.batchId,
            lineNo: lineNo++,
            qtySentBase: String(alloc.qtyBase),
            qtyReceivedBase: null,
            discrepancyQtyBase: "0",
            discrepancyReason: null,
            costPerUnit: String(alloc.costPerUnit)
          });

          ledgerMutations.push({
            id: crypto.randomUUID(),
            tenantId: transfer.tenantId,
            branchId: transfer.sourceBranchId,
            productId: line.productId,
            locationId: alloc.locationId,
            batchId: alloc.batchId,
            mutationType: "TRANSFER_OUT",
            quantityBase: String(-alloc.qtyBase),
            costPerUnit: String(alloc.costPerUnit),
            referenceId: transfer.id,
            notes: `Transfer Out via ${transfer.transferNumber} (Dispatch permintaan)`,
            createdBy: shipper.id,
            createdAt: now
          });
        }

        await tx
          .update(schema.products)
          .set({ updatedAt: now })
          .where(eq(schema.products.id, line.productId));
      }

      await tx
        .delete(schema.stockTransferItems)
        .where(eq(schema.stockTransferItems.transferId, transfer.id));
      if (rebuiltItems.length > 0) {
        await tx.insert(schema.stockTransferItems).values(rebuiltItems);
      }
      if (ledgerMutations.length > 0) {
        await tx.insert(schema.stockLedger).values(ledgerMutations);
      }

      await tx
        .update(schema.stockTransfers)
        .set({
          status: "IN_TRANSIT",
          shippedAt: now,
          shippedBy: shipper.id,
          trackingCourier: (courierName || "").trim() || transfer.trackingCourier || "Kurir Internal"
        })
        .where(eq(schema.stockTransfers.id, transfer.id));

      return transfer;
    });

    const formatted = await this.getTransferByIdFormatted(dispatched.id);

    return {
      success: true,
      message: `Surat jalan ${dispatched.transferNumber} telah diberangkatkan & stok cabang pengirim dipotong`,
      data: formatted
    };
  }
}

export const transferService = new TransferService();
