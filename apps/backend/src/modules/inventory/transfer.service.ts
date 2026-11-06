import { db, schema } from "@apoteku/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export interface CreateTransferItemPayload {
  productId: string;
  productName?: string;
  batchNumber?: string;
  expiryDate?: string;
  qty: number;
  unit?: string;
}

export interface CreateTransferPayload {
  tenantId?: string;
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
  receivedBy?: string;
  receiptNotes?: string;
  items: ReceiveTransferItemPayload[];
}

class TransferService {
  private async getTenantId(candidate?: string): Promise<string> {
    if (candidate) return candidate;
    const [t] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
    if (!t) throw new Error("No active tenant found in database");
    return t.id;
  }

  private async getDefaultLocation(branchId: string, tenantId: string): Promise<string> {
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

    if (loc) return loc.id;

    // Fallback: any location of this branch
    const [anyLoc] = await db
      .select({ id: schema.inventoryLocations.id })
      .from(schema.inventoryLocations)
      .where(eq(schema.inventoryLocations.branchId, branchId))
      .limit(1);

    if (anyLoc) return anyLoc.id;

    // Create default location if none exists
    const newLocId = crypto.randomUUID();
    await db.insert(schema.inventoryLocations).values({
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
    productId: string,
    batchNo: string,
    tenantId: string,
    expiryDate?: string
  ): Promise<string> {
    const cleanBatchNo = (batchNo || "BATCH-REG").trim();
    const expDate = expiryDate || "2027-12-31";

    const [existing] = await db
      .select({ id: schema.productBatches.id })
      .from(schema.productBatches)
      .where(
        and(
          eq(schema.productBatches.productId, productId),
          eq(schema.productBatches.batchNo, cleanBatchNo)
        )
      )
      .limit(1);

    if (existing) return existing.id;

    const newBatchId = crypto.randomUUID();
    await db.insert(schema.productBatches).values({
      id: newBatchId,
      tenantId,
      productId,
      batchNo: cleanBatchNo,
      expiredDate: expDate
    });
    return newBatchId;
  }

  async getTransfers(branchId?: string, limit = 50) {
    let conditions = [];
    if (branchId && branchId !== "ALL") {
      conditions.push(
        sql`(${schema.stockTransfers.sourceBranchId} = ${branchId} OR ${schema.stockTransfers.destBranchId} = ${branchId})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const fromBranches = db
      .select({ id: schema.branches.id, name: schema.branches.name })
      .from(schema.branches)
      .as("from_branches");

    const toBranches = db
      .select({ id: schema.branches.id, name: schema.branches.name })
      .from(schema.branches)
      .as("to_branches");

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
        status: schema.stockTransfers.status,
        notes: schema.stockTransfers.notes,
        receiptNotes: schema.stockTransfers.receiptNotes
      })
      .from(schema.stockTransfers)
      .leftJoin(fromBranches, eq(schema.stockTransfers.sourceBranchId, fromBranches.id))
      .leftJoin(toBranches, eq(schema.stockTransfers.destBranchId, toBranches.id))
      .where(whereClause)
      .orderBy(desc(schema.stockTransfers.shippedAt))
      .limit(limit);

    if (transfers.length === 0) return [];

    const transferIds = transfers.map((t) => t.id);

    const allItems = await db
      .select({
        id: schema.stockTransferItems.id,
        transferId: schema.stockTransferItems.transferId,
        lineNo: schema.stockTransferItems.lineNo,
        productId: schema.stockTransferItems.productId,
        productName: schema.products.name,
        batchNumber: schema.productBatches.batchNo,
        qty: schema.stockTransferItems.qtySentBase,
        receivedQty: schema.stockTransferItems.qtyReceivedBase,
        discrepancyQty: schema.stockTransferItems.discrepancyQtyBase,
        discrepancyReason: schema.stockTransferItems.discrepancyReason,
        unit: schema.products.baseUnit
      })
      .from(schema.stockTransferItems)
      .leftJoin(schema.products, eq(schema.stockTransferItems.productId, schema.products.id))
      .leftJoin(schema.productBatches, eq(schema.stockTransferItems.batchId, schema.productBatches.id))
      .where(inArray(schema.stockTransferItems.transferId, transferIds))
      .orderBy(schema.stockTransferItems.lineNo);

    return transfers.map((t) => {
      const items = allItems.filter((i) => i.transferId === t.id);
      const isReceived = t.status === "RECEIVED" || t.status === "RECEIVED_DISCREPANCY";
      const rtbNo = isReceived ? `RTB-${t.transferNumber.slice(-7)}` : undefined;

      const dateStr = t.transferDate
        ? new Date(t.transferDate).toISOString().replace("T", " ").substring(0, 16)
        : "";
      const recDateStr = t.receivedDate
        ? new Date(t.receivedDate).toISOString().replace("T", " ").substring(0, 16)
        : undefined;

      return {
        id: t.id,
        transferNumber: t.transferNumber,
        receiptNumber: rtbNo,
        fromBranchId: t.fromBranchId,
        fromBranchName: t.fromBranchName || "Apotek Asal",
        toBranchId: t.toBranchId,
        toBranchName: t.toBranchName || "Apotek Tujuan",
        transferDate: dateStr,
        receivedDate: recDateStr,
        courierName: t.courierName || "Kurir Internal",
        operator: "apt. Hafidz Nurul",
        receivedBy: isReceived ? "apt. Rina Marlina" : undefined,
        status: t.status as "REQUESTED" | "IN_TRANSIT" | "RECEIVED" | "RECEIVED_DISCREPANCY",
        notes: t.notes || "",
        receiptNotes: t.receiptNotes || "",
        items: items.map((it) => ({
          productId: it.productId,
          productName: it.productName || "Obat",
          batchNumber: it.batchNumber || "BATCH-REG",
          qty: Number(it.qty),
          receivedQty: it.receivedQty !== null ? Number(it.receivedQty) : undefined,
          discrepancyQty: Number(it.discrepancyQty || 0),
          discrepancyReason: it.discrepancyReason || undefined,
          unit: it.unit || "STRIP",
          status: t.status as any
        }))
      };
    });
  }

  async createTransfer(payload: CreateTransferPayload) {
    const tenantId = await this.getTenantId(payload.tenantId);

    if (payload.fromBranchId === payload.toBranchId) {
      throw new Error("Cabang asal dan cabang tujuan tidak boleh sama");
    }

    const sourceLocationId = await this.getDefaultLocation(payload.fromBranchId, tenantId);
    const destLocationId = await this.getDefaultLocation(payload.toBranchId, tenantId);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomSeq = Math.floor(100 + Math.random() * 900);
    const transferNumber = payload.transferNumber || `RKB-${dateStr}-${randomSeq}`;
    const transferId = crypto.randomUUID();
    const status = payload.status || "IN_TRANSIT";
    const shippedBy = crypto.randomUUID();

    // 1. Insert Header
    await db.insert(schema.stockTransfers).values({
      id: transferId,
      tenantId,
      transferNumber,
      sourceBranchId: payload.fromBranchId,
      destBranchId: payload.toBranchId,
      sourceLocationId,
      destLocationId,
      status,
      trackingCourier: payload.courierName || "Kurir Internal",
      notes: payload.notes || "Pengiriman stok antar cabang",
      shippedBy,
      shippedAt: now
    });

    // 2. Insert Items & Mutations
    const itemsToInsert = [];
    const ledgerMutations = [];

    for (let idx = 0; idx < payload.items.length; idx++) {
      const it = payload.items[idx];
      const batchId = await this.getOrCreateBatch(
        it.productId,
        it.batchNumber || "BATCH-REG",
        tenantId,
        it.expiryDate
      );
      const qtySent = Number(it.qty) || 1;

      itemsToInsert.push({
        id: crypto.randomUUID(),
        transferId,
        productId: it.productId,
        batchId,
        lineNo: idx + 1,
        qtySentBase: String(qtySent),
        qtyReceivedBase: null,
        discrepancyQtyBase: "0",
        discrepancyReason: null,
        costPerUnit: "0"
      });

      // Stock Ledger (TRANSFER_OUT)
      ledgerMutations.push({
        id: crypto.randomUUID(),
        tenantId,
        branchId: payload.fromBranchId,
        productId: it.productId,
        locationId: sourceLocationId,
        batchId,
        mutationType: "TRANSFER_OUT",
        quantityBase: String(-qtySent),
        costPerUnit: "0",
        referenceId: transferId,
        notes: `Transfer Out via ${transferNumber}`,
        createdBy: shippedBy,
        createdAt: now
      });
    }

    if (itemsToInsert.length > 0) {
      await db.insert(schema.stockTransferItems).values(itemsToInsert);
      await db.insert(schema.stockLedger).values(ledgerMutations);
    }

    // Fetch branch names for response
    const [fromBranch] = await db
      .select({ name: schema.branches.name })
      .from(schema.branches)
      .where(eq(schema.branches.id, payload.fromBranchId))
      .limit(1);

    const [toBranch] = await db
      .select({ name: schema.branches.name })
      .from(schema.branches)
      .where(eq(schema.branches.id, payload.toBranchId))
      .limit(1);

    return {
      success: true,
      message: `Surat Jalan ${transferNumber} berhasil dibuat dan tercatat di database`,
      data: {
        id: transferId,
        transferNumber,
        fromBranchId: payload.fromBranchId,
        fromBranchName: fromBranch?.name || "Apotek Asal",
        toBranchId: payload.toBranchId,
        toBranchName: toBranch?.name || "Apotek Tujuan",
        transferDate: now.toISOString().replace("T", " ").substring(0, 16),
        courierName: payload.courierName || "Kurir Internal",
        operator: payload.operator || "apt. Hafidz Nurul",
        status,
        notes: payload.notes || "Pengiriman stok antar cabang",
        items: payload.items.map((it) => ({
          productId: it.productId,
          productName: it.productName || "Obat",
          batchNumber: it.batchNumber || "BATCH-REG",
          qty: it.qty,
          unit: it.unit || "STRIP",
          status
        }))
      }
    };
  }

  async receiveTransfer(payload: ReceiveTransferPayload) {
    const [transfer] = await db
      .select()
      .from(schema.stockTransfers)
      .where(eq(schema.stockTransfers.id, payload.transferId))
      .limit(1);

    if (!transfer) {
      throw new Error(`Transfer dengan ID ${payload.transferId} tidak ditemukan`);
    }

    if (transfer.status === "RECEIVED" || transfer.status === "RECEIVED_DISCREPANCY") {
      return {
        success: false,
        message: "Pengiriman ini sudah diverifikasi sebelumnya",
        data: transfer
      };
    }

    const items = await db
      .select()
      .from(schema.stockTransferItems)
      .where(eq(schema.stockTransferItems.transferId, payload.transferId));

    let anyDiff = false;
    const now = new Date();
    const receivedBy = crypto.randomUUID();
    const ledgerMutations = [];

    for (const line of items) {
      const match = payload.items.find((p) => p.lineNo === line.lineNo);
      const sentQty = Number(line.qtySentBase);
      const recQty = match ? Math.max(0, Number(match.qtyReceived)) : sentQty;
      const diff = recQty - sentQty;
      if (diff !== 0) anyDiff = true;

      await db
        .update(schema.stockTransferItems)
        .set({
          qtyReceivedBase: String(recQty),
          discrepancyQtyBase: String(diff),
          discrepancyReason: match?.discrepancyReason || (diff !== 0 ? "Selisih hitung fisik" : null)
        })
        .where(eq(schema.stockTransferItems.id, line.id));

      // Stock Ledger (TRANSFER_IN ke Cabang Tujuan)
      ledgerMutations.push({
        id: crypto.randomUUID(),
        tenantId: transfer.tenantId,
        branchId: transfer.destBranchId,
        productId: line.productId,
        locationId: transfer.destLocationId,
        batchId: line.batchId,
        mutationType: "TRANSFER_IN",
        quantityBase: String(recQty),
        costPerUnit: line.costPerUnit,
        referenceId: transfer.id,
        notes: `Transfer In dari ${transfer.transferNumber}`,
        createdBy: receivedBy,
        createdAt: now
      });
    }

    if (ledgerMutations.length > 0) {
      await db.insert(schema.stockLedger).values(ledgerMutations);
    }

    const finalStatus = anyDiff ? "RECEIVED_DISCREPANCY" : "RECEIVED";
    const rtbNo = `RTB-${transfer.transferNumber.slice(-7)}`;

    const [updated] = await db
      .update(schema.stockTransfers)
      .set({
        status: finalStatus,
        receivedAt: now,
        receivedBy,
        receiptNotes: payload.receiptNotes || (anyDiff ? "Diterima dengan selisih fisik" : "Diterima lengkap dan cocok")
      })
      .where(eq(schema.stockTransfers.id, transfer.id))
      .returning();

    return {
      success: true,
      message: anyDiff
        ? `Penerimaan ${rtbNo} berhasil diverifikasi dengan Status: DITERIMA SELISIH`
        : `Penerimaan ${rtbNo} berhasil diverifikasi 100% Cocok!`,
      data: {
        ...updated,
        receiptNumber: rtbNo,
        receivedDate: now.toISOString().replace("T", " ").substring(0, 16)
      }
    };
  }

  async dispatchTransfer(transferId: string, courierName?: string) {
    const [updated] = await db
      .update(schema.stockTransfers)
      .set({
        status: "IN_TRANSIT",
        shippedAt: new Date(),
        trackingCourier: courierName || "Kurir Internal Hafidz Farma"
      })
      .where(eq(schema.stockTransfers.id, transferId))
      .returning();

    return {
      success: true,
      message: `Surat jalan ${updated.transferNumber} telah diberangkatkan (Status: DI JALAN)`,
      data: updated
    };
  }
}

export const transferService = new TransferService();
