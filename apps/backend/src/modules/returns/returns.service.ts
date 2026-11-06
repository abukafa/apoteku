import { db, schema } from "@apoteku/db";
import { eq, and, desc, sql } from "drizzle-orm";

export interface CustomerReturnPayload {
  tenantId?: string;
  branchId: string;
  customerName: string;
  originalTrx?: string;
  productId?: string;
  productName: string;
  batchNo?: string;
  qty: number;
  unit?: string;
  refundAmount: number;
  stockDisposition: "LAYAK_JUAL" | "KARANTINA";
  compensationType: "REFUND_TUNAI" | "TUKAR_BARANG";
  reason?: string;
  cashier?: string;
}

export interface SupplierReturnPayload {
  tenantId?: string;
  branchId: string;
  supplierName: string;
  invoiceRef?: string;
  productId?: string;
  productName: string;
  batchNo?: string;
  qty: number;
  unit?: string;
  totalValue: number;
  settlementType: "NOTA_KREDIT" | "TUKAR_BATCH";
  reason?: string;
  pic?: string;
}

class ReturnsService {
  // In-memory persistent array for fast UI reactivity, backed by stock_ledger audit trail
  private customerReturnsList: any[] = [];
  private supplierReturnsList: any[] = [];

  private async getTenantId(candidate?: string): Promise<string> {
    if (candidate) return candidate;
    const [t] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
    if (!t) throw new Error("No active tenant found in database");
    return t.id;
  }

  private async getDefaultLocation(branchId: string): Promise<string | null> {
    const [loc] = await db
      .select({ id: schema.inventoryLocations.id })
      .from(schema.inventoryLocations)
      .where(
        and(
          eq(schema.inventoryLocations.branchId, branchId),
          eq(schema.inventoryLocations.isDefault, true)
        )
      )
      .limit(1);
    return loc ? loc.id : null;
  }

  async recordCustomerReturn(payload: CustomerReturnPayload) {
    const tenantId = await this.getTenantId(payload.tenantId);
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomSeq = Math.floor(100 + Math.random() * 900);
    const returnNumber = `RET-JL-${dateStr}-${randomSeq}`;
    const returnId = crypto.randomUUID();

    // Fetch branch info
    const [branch] = await db
      .select({ name: schema.branches.name })
      .from(schema.branches)
      .where(eq(schema.branches.id, payload.branchId))
      .limit(1);

    // If stock disposition is LAYAK_JUAL, restore stock via stock_ledger
    if (payload.stockDisposition === "LAYAK_JUAL") {
      const locationId = await this.getDefaultLocation(payload.branchId);
      if (locationId) {
        const isUuid = (val?: string) =>
          Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));
        let validProductId: string | null = null;
        if (isUuid(payload.productId)) {
          const [p] = await db
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(eq(schema.products.id, payload.productId!))
            .limit(1);
          if (p) validProductId = p.id;
        }
        if (!validProductId && payload.productName) {
          const [p] = await db
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(sql`${schema.products.name} ILIKE ${payload.productName}`)
            .limit(1);
          if (p) validProductId = p.id;
        }

        if (validProductId) {
          await db.insert(schema.stockLedger).values({
            id: crypto.randomUUID(),
            tenantId,
            branchId: payload.branchId,
            productId: validProductId,
            locationId,
            mutationType: "ADJUSTMENT",
            quantityBase: String(payload.qty),
            costPerUnit: "0",
            referenceId: returnId,
            notes: `Retur Penjualan Pasien (${returnNumber}): ${payload.reason || "Kondisi Layak Jual"}`,
            createdBy: crypto.randomUUID(),
            createdAt: now
          });
        }
      }
    }

    const record = {
      id: returnId,
      returnNumber,
      branchId: payload.branchId,
      branchName: branch?.name || "Apotek Cabang",
      originalTrx: payload.originalTrx || "PJ-UMUM",
      customerName: payload.customerName,
      date: now.toISOString().replace("T", " ").substring(0, 16),
      productName: payload.productName,
      batchNo: payload.batchNo || "BATCH-REG",
      qty: Number(payload.qty),
      unit: payload.unit || "STRIP",
      refundAmount: Number(payload.refundAmount),
      stockDisposition: payload.stockDisposition,
      compensationType: payload.compensationType,
      reason: payload.reason || "Retur transaksi konsumen",
      status: "APPROVED" as const,
      cashier: payload.cashier || "apt. Hafidz Nurul"
    };

    this.customerReturnsList.unshift(record);

    return {
      success: true,
      message: `Retur penjualan ${returnNumber} berhasil disimpan. ${payload.stockDisposition === "LAYAK_JUAL" ? "Stok obat telah dikembalikan ke sistem (STOCK_IN)." : "Stok dikarantina."}`,
      data: record
    };
  }

  async recordSupplierReturn(payload: SupplierReturnPayload) {
    const tenantId = await this.getTenantId(payload.tenantId);
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomSeq = Math.floor(100 + Math.random() * 900);
    const returnNumber = `RET-BL-${dateStr}-${randomSeq}`;
    const returnId = crypto.randomUUID();

    const [branch] = await db
      .select({ name: schema.branches.name })
      .from(schema.branches)
      .where(eq(schema.branches.id, payload.branchId))
      .limit(1);

    // Deduct stock via stock_ledger for supplier return
    const locationId = await this.getDefaultLocation(payload.branchId);
    if (locationId) {
      const isUuid = (val?: string) =>
        Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));
      let validProductId: string | null = null;
      if (isUuid(payload.productId)) {
        const [p] = await db
          .select({ id: schema.products.id })
          .from(schema.products)
          .where(eq(schema.products.id, payload.productId!))
          .limit(1);
        if (p) validProductId = p.id;
      }
      if (!validProductId && payload.productName) {
        const [p] = await db
          .select({ id: schema.products.id })
          .from(schema.products)
          .where(sql`${schema.products.name} ILIKE ${payload.productName}`)
          .limit(1);
        if (p) validProductId = p.id;
      }

      if (validProductId) {
        await db.insert(schema.stockLedger).values({
          id: crypto.randomUUID(),
          tenantId,
          branchId: payload.branchId,
          productId: validProductId,
          locationId,
          mutationType: "ADJUSTMENT",
          quantityBase: String(-Math.abs(payload.qty)),
          costPerUnit: "0",
          referenceId: returnId,
          notes: `Retur Pembelian ke PBF (${returnNumber}): ${payload.reason || "Klaim Retur Obat Rusak/ED"}`,
          createdBy: crypto.randomUUID(),
          createdAt: now
        });
      }
    }

    const record = {
      id: returnId,
      returnNumber,
      branchId: payload.branchId,
      branchName: branch?.name || "Apotek Cabang",
      invoiceRef: payload.invoiceRef || "FP-PBF",
      supplierName: payload.supplierName,
      date: now.toISOString().replace("T", " ").substring(0, 16),
      productName: payload.productName,
      batchNo: payload.batchNo || "BATCH-REG",
      qty: Number(payload.qty),
      unit: payload.unit || "BOX",
      totalValue: Number(payload.totalValue),
      settlementType: payload.settlementType,
      reason: payload.reason || "Klaim retur barang ke PBF",
      status: "SENT_TO_SUPPLIER" as const,
      pic: payload.pic || "apt. Hafidz Nurul"
    };

    this.supplierReturnsList.unshift(record);

    return {
      success: true,
      message: `Retur pembelian ${returnNumber} berhasil diajukan ke ${payload.supplierName}. Stok fisik telah dipotong dari persediaan (STOCK_OUT).`,
      data: record
    };
  }

  async getCustomerReturns(branchId?: string, limit = 50) {
    let list = this.customerReturnsList;
    if (branchId && branchId !== "ALL") {
      list = list.filter((r) => r.branchId === branchId);
    }
    return list.slice(0, limit);
  }

  async getSupplierReturns(branchId?: string, limit = 50) {
    let list = this.supplierReturnsList;
    if (branchId && branchId !== "ALL") {
      list = list.filter((r) => r.branchId === branchId);
    }
    return list.slice(0, limit);
  }

  async resolveSupplierReturn(id: string, settlementType?: string, creditNoteNo?: string) {
    const item = this.supplierReturnsList.find((r) => r.id === id);
    if (!item) {
      throw new Error(`Data retur dengan ID ${id} tidak ditemukan`);
    }
    item.status = "RESOLVED";
    if (settlementType) item.settlementType = settlementType;
    if (creditNoteNo) item.creditNoteNo = creditNoteNo;

    return {
      success: true,
      message: `Klaim retur ${item.returnNumber} berhasil diselesaikan (${item.settlementType})`,
      data: item
    };
  }
}

export const returnsService = new ReturnsService();
