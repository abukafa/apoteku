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
    if (loc) return loc.id;

    // Fallback to any location for that branch
    const [anyLoc] = await db
      .select({ id: schema.inventoryLocations.id })
      .from(schema.inventoryLocations)
      .where(eq(schema.inventoryLocations.branchId, branchId))
      .limit(1);
    return anyLoc ? anyLoc.id : null;
  }

  async recordCustomerReturn(payload: CustomerReturnPayload) {
    const tenantId = await this.getTenantId(payload.tenantId);
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomSeq = Math.floor(100 + Math.random() * 900);
    const returnNumber = `RET-JL-${dateStr}-${randomSeq}`;
    const returnId = crypto.randomUUID();

    // 1. Fetch branch info
    const [branch] = await db
      .select({ name: schema.branches.name })
      .from(schema.branches)
      .where(eq(schema.branches.id, payload.branchId))
      .limit(1);

    // 2. Check active cashier shift for this branch
    const [activeShift] = await db
      .select({
        id: schema.cashierShifts.id,
        shiftNumber: schema.cashierShifts.shiftNumber
      })
      .from(schema.cashierShifts)
      .where(
        and(
          eq(schema.cashierShifts.branchId, payload.branchId),
          eq(schema.cashierShifts.isOpen, true)
        )
      )
      .limit(1);

    // 3. Resolve product ID & Batch ID
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

    let validBatchId: string | null = null;
    if (validProductId && payload.batchNo) {
      const [b] = await db
        .select({ id: schema.productBatches.id })
        .from(schema.productBatches)
        .where(
          and(
            eq(schema.productBatches.productId, validProductId),
            eq(schema.productBatches.batchNo, payload.batchNo)
          )
        )
        .limit(1);
      if (b) validBatchId = b.id;
    }

    const locationId = await this.getDefaultLocation(payload.branchId);

    // Hitung konversi ke satuan dasar produk
    let conversionFactor = 1;
    if (validProductId && payload.unit) {
      const [unitRow] = await db
        .select({ conversionFactor: schema.productUnits.conversionFactor })
        .from(schema.productUnits)
        .where(
          and(
            eq(schema.productUnits.productId, validProductId),
            sql`LOWER(${schema.productUnits.unitName}) = LOWER(${payload.unit})`
          )
        )
        .limit(1);

      if (unitRow && unitRow.conversionFactor) {
        conversionFactor = Math.max(1, Number(unitRow.conversionFactor));
      }
    }
    const qtyBase = Math.round(Number(payload.qty) * conversionFactor * 1000000) / 1000000;

    // 4. Update Inventory: if LAYAK_JUAL, restore stock via stock_ledger & branch_stocks
    if (payload.stockDisposition === "LAYAK_JUAL" && validProductId && locationId) {
      await db.insert(schema.stockLedger).values({
        id: crypto.randomUUID(),
        tenantId,
        branchId: payload.branchId,
        productId: validProductId,
        batchId: validBatchId || undefined,
        locationId,
        mutationType: "ADJUSTMENT",
        quantityBase: String(qtyBase),
        costPerUnit: "0",
        referenceId: returnId,
        notes: `Retur Penjualan Pasien (${returnNumber}): ${payload.qty} ${payload.unit || "Satuan"} (${qtyBase} satuan dasar) - ${payload.reason || "Kondisi Layak Jual"}`,
        createdBy: crypto.randomUUID(),
        createdAt: now
      });

      // Update branch_stocks (increase stock by qtyBase)
      await db
        .update(schema.branchStocks)
        .set({
          totalQtyBase: sql`${schema.branchStocks.totalQtyBase} + ${qtyBase}`,
          updatedAt: now
        })
        .where(
          and(
            eq(schema.branchStocks.branchId, payload.branchId),
            eq(schema.branchStocks.productId, validProductId),
            eq(schema.branchStocks.locationId, locationId)
          )
        );

      // Update batch stock if batch is mapped
      if (validBatchId) {
        await db
          .update(schema.branchBatchStocks)
          .set({
            qtyBase: sql`${schema.branchBatchStocks.qtyBase} + ${qtyBase}`,
            updatedAt: now
          })
          .where(
            and(
              eq(schema.branchBatchStocks.branchId, payload.branchId),
              eq(schema.branchBatchStocks.productId, validProductId),
              eq(schema.branchBatchStocks.batchId, validBatchId),
              eq(schema.branchBatchStocks.locationId, locationId)
            )
          );
      }
    } else if (payload.stockDisposition === "KARANTINA" && validProductId && locationId) {
      // Audit trail BPOM: Catat penerimaan retur karantina di buku besar tanpa menambah stok jual aktif
      await db.insert(schema.stockLedger).values({
        id: crypto.randomUUID(),
        tenantId,
        branchId: payload.branchId,
        productId: validProductId,
        batchId: validBatchId || undefined,
        locationId,
        mutationType: "ADJUSTMENT",
        quantityBase: "0",
        costPerUnit: "0",
        referenceId: returnId,
        notes: `Retur Penjualan Pasien (${returnNumber}): ${payload.qty} ${payload.unit || "Satuan"} - Dipisahkan ke Rak Karantina (Stok Jual +0)`,
        createdBy: crypto.randomUUID(),
        createdAt: now
      });
    }

    // 5. Update Finance Cash Mutation if REFUND_TUNAI
    if (payload.compensationType === "REFUND_TUNAI" && payload.refundAmount > 0) {
      await db.insert(schema.cashMutations).values({
        id: crypto.randomUUID(),
        tenantId,
        branchId: payload.branchId,
        type: "OUT",
        category: "RETUR_PENJUALAN",
        account: "KAS_LACI",
        refNumber: returnNumber,
        amount: String(payload.refundAmount),
        description: `Refund tunai retur penjualan (${returnNumber}) struk ${payload.originalTrx || "PJ-UMUM"}: ${payload.reason || "Pengembalian barang"}`,
        operator: payload.cashier || "Kasir",
        transactionDate: now,
        createdAt: now
      });
    }

    // 6. Save persistent record in database customer_returns table
    await db.insert(schema.customerReturns).values({
      id: returnId,
      tenantId,
      branchId: payload.branchId,
      returnNumber,
      originalTrx: payload.originalTrx || "PJ-UMUM",
      customerName: payload.customerName,
      productId: validProductId || undefined,
      productName: payload.productName,
      batchNo: payload.batchNo || "BATCH-REG",
      qty: String(payload.qty),
      unit: payload.unit || "STRIP",
      refundAmount: String(payload.refundAmount),
      stockDisposition: payload.stockDisposition,
      compensationType: payload.compensationType,
      reason: payload.reason || "Retur transaksi konsumen",
      status: "APPROVED",
      cashier: payload.cashier || "apt. Hafidz Nurul",
      cashierShiftId: activeShift?.id || null,
      createdAt: now
    });

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
      cashier: payload.cashier || "apt. Hafidz Nurul",
      shiftNumber: activeShift?.shiftNumber || null
    };

    return {
      success: true,
      message: `Retur penjualan ${returnNumber} berhasil disimpan. ${
        payload.stockDisposition === "LAYAK_JUAL"
          ? "Stok obat telah dikembalikan ke persediaan cabang."
          : "Stok dipisahkan di karantina."
      }${
        payload.compensationType === "REFUND_TUNAI"
          ? ` Kas laci berkurang ${payload.refundAmount.toLocaleString("id-ID")}${
              activeShift ? ` (Tercatat pada Shift #${activeShift.shiftNumber})` : " (Peringatan: Tidak ada shift kasir aktif)"
            }.`
          : ""
      }`,
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

    let validBatchId: string | null = null;
    if (validProductId && payload.batchNo) {
      const [b] = await db
        .select({ id: schema.productBatches.id })
        .from(schema.productBatches)
        .where(
          and(
            eq(schema.productBatches.productId, validProductId),
            eq(schema.productBatches.batchNo, payload.batchNo)
          )
        )
        .limit(1);
      if (b) validBatchId = b.id;
    }

    const locationId = await this.getDefaultLocation(payload.branchId);

    // Hitung konversi ke satuan dasar produk
    let conversionFactor = 1;
    if (validProductId && payload.unit) {
      const [unitRow] = await db
        .select({ conversionFactor: schema.productUnits.conversionFactor })
        .from(schema.productUnits)
        .where(
          and(
            eq(schema.productUnits.productId, validProductId),
            sql`LOWER(${schema.productUnits.unitName}) = LOWER(${payload.unit})`
          )
        )
        .limit(1);

      if (unitRow && unitRow.conversionFactor) {
        conversionFactor = Math.max(1, Number(unitRow.conversionFactor));
      }
    }
    const qtyBase = Math.round(Number(payload.qty) * conversionFactor * 1000000) / 1000000;

    // Deduct stock via stock_ledger & branch_stocks for supplier return
    if (validProductId && locationId) {
      await db.insert(schema.stockLedger).values({
        id: crypto.randomUUID(),
        tenantId,
        branchId: payload.branchId,
        productId: validProductId,
        batchId: validBatchId || undefined,
        locationId,
        mutationType: "ADJUSTMENT",
        quantityBase: String(-Math.abs(qtyBase)),
        costPerUnit: "0",
        referenceId: returnId,
        notes: `Retur Pembelian ke PBF (${returnNumber}): ${payload.qty} ${payload.unit || "Satuan"} (${qtyBase} satuan dasar) - ${payload.reason || "Klaim Retur Obat Rusak/ED"}`,
        createdBy: crypto.randomUUID(),
        createdAt: now
      });

      // Deduct from branch_stocks
      await db
        .update(schema.branchStocks)
        .set({
          totalQtyBase: sql`GREATEST(0, ${schema.branchStocks.totalQtyBase} - ${qtyBase})`,
          updatedAt: now
        })
        .where(
          and(
            eq(schema.branchStocks.branchId, payload.branchId),
            eq(schema.branchStocks.productId, validProductId),
            eq(schema.branchStocks.locationId, locationId)
          )
        );

      if (validBatchId) {
        await db
          .update(schema.branchBatchStocks)
          .set({
            qtyBase: sql`GREATEST(0, ${schema.branchBatchStocks.qtyBase} - ${qtyBase})`,
            updatedAt: now
          })
          .where(
            and(
              eq(schema.branchBatchStocks.branchId, payload.branchId),
              eq(schema.branchBatchStocks.productId, validProductId),
              eq(schema.branchBatchStocks.batchId, validBatchId),
              eq(schema.branchBatchStocks.locationId, locationId)
            )
          );
      }
    }

    // Persist supplier return in database
    await db.insert(schema.supplierReturns).values({
      id: returnId,
      tenantId,
      branchId: payload.branchId,
      returnNumber,
      invoiceRef: payload.invoiceRef || "FP-PBF",
      supplierName: payload.supplierName,
      productId: validProductId || undefined,
      productName: payload.productName,
      batchNo: payload.batchNo || "BATCH-REG",
      qty: String(payload.qty),
      unit: payload.unit || "BOX",
      totalValue: String(payload.totalValue),
      settlementType: payload.settlementType,
      reason: payload.reason || "Klaim retur barang ke PBF",
      status: "SENT_TO_SUPPLIER",
      pic: payload.pic || "apt. Hafidz Nurul",
      createdAt: now
    });

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

    return {
      success: true,
      message: `Retur pembelian ${returnNumber} berhasil diajukan ke ${payload.supplierName}. Stok fisik telah dipotong dari persediaan cabang (STOCK_OUT).`,
      data: record
    };
  }

  async getCustomerReturns(branchId?: string, limit = 100) {
    const conditions = [];
    if (branchId && branchId !== "ALL") {
      conditions.push(eq(schema.customerReturns.branchId, branchId));
    }

    const rows = await db
      .select({
        id: schema.customerReturns.id,
        returnNumber: schema.customerReturns.returnNumber,
        branchId: schema.customerReturns.branchId,
        branchName: schema.branches.name,
        originalTrx: schema.customerReturns.originalTrx,
        customerName: schema.customerReturns.customerName,
        productId: schema.customerReturns.productId,
        productName: schema.customerReturns.productName,
        batchNo: schema.customerReturns.batchNo,
        qty: schema.customerReturns.qty,
        unit: schema.customerReturns.unit,
        refundAmount: schema.customerReturns.refundAmount,
        stockDisposition: schema.customerReturns.stockDisposition,
        compensationType: schema.customerReturns.compensationType,
        reason: schema.customerReturns.reason,
        status: schema.customerReturns.status,
        cashier: schema.customerReturns.cashier,
        cashierShiftId: schema.customerReturns.cashierShiftId,
        createdAt: schema.customerReturns.createdAt
      })
      .from(schema.customerReturns)
      .leftJoin(schema.branches, eq(schema.customerReturns.branchId, schema.branches.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.customerReturns.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      branchId: r.branchId,
      branchName: r.branchName || "Apotek Cabang",
      originalTrx: r.originalTrx,
      customerName: r.customerName,
      date: r.createdAt ? new Date(r.createdAt).toISOString().replace("T", " ").substring(0, 16) : "",
      productName: r.productName,
      batchNo: r.batchNo || "BATCH-REG",
      qty: Number(r.qty),
      unit: r.unit,
      refundAmount: Number(r.refundAmount),
      stockDisposition: r.stockDisposition as "LAYAK_JUAL" | "KARANTINA",
      compensationType: r.compensationType as "REFUND_TUNAI" | "TUKAR_BARANG",
      reason: r.reason || "",
      status: r.status as "PENDING" | "APPROVED",
      cashier: r.cashier || "Kasir",
      cashierShiftId: r.cashierShiftId
    }));
  }

  async getSupplierReturns(branchId?: string, limit = 100) {
    const conditions = [];
    if (branchId && branchId !== "ALL") {
      conditions.push(eq(schema.supplierReturns.branchId, branchId));
    }

    const rows = await db
      .select({
        id: schema.supplierReturns.id,
        returnNumber: schema.supplierReturns.returnNumber,
        branchId: schema.supplierReturns.branchId,
        branchName: schema.branches.name,
        invoiceRef: schema.supplierReturns.invoiceRef,
        supplierName: schema.supplierReturns.supplierName,
        productId: schema.supplierReturns.productId,
        productName: schema.supplierReturns.productName,
        batchNo: schema.supplierReturns.batchNo,
        qty: schema.supplierReturns.qty,
        unit: schema.supplierReturns.unit,
        totalValue: schema.supplierReturns.totalValue,
        settlementType: schema.supplierReturns.settlementType,
        creditNoteNo: schema.supplierReturns.creditNoteNo,
        reason: schema.supplierReturns.reason,
        status: schema.supplierReturns.status,
        pic: schema.supplierReturns.pic,
        createdAt: schema.supplierReturns.createdAt
      })
      .from(schema.supplierReturns)
      .leftJoin(schema.branches, eq(schema.supplierReturns.branchId, schema.branches.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.supplierReturns.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      branchId: r.branchId,
      branchName: r.branchName || "Apotek Cabang",
      invoiceRef: r.invoiceRef,
      supplierName: r.supplierName,
      date: r.createdAt ? new Date(r.createdAt).toISOString().replace("T", " ").substring(0, 16) : "",
      productName: r.productName,
      batchNo: r.batchNo || "BATCH-REG",
      qty: Number(r.qty),
      unit: r.unit,
      totalValue: Number(r.totalValue),
      settlementType: r.settlementType as "NOTA_KREDIT" | "TUKAR_BATCH",
      creditNoteNo: r.creditNoteNo || undefined,
      reason: r.reason || "",
      status: r.status as "QUARANTINED" | "SENT_TO_SUPPLIER" | "RESOLVED",
      pic: r.pic || "Apoteker"
    }));
  }

  async approveCustomerReturn(id: string) {
    const [existing] = await db
      .select()
      .from(schema.customerReturns)
      .where(eq(schema.customerReturns.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Data retur dengan ID ${id} tidak ditemukan`);
    }

    const [updated] = await db
      .update(schema.customerReturns)
      .set({ status: "APPROVED" })
      .where(eq(schema.customerReturns.id, id))
      .returning();

    return {
      success: true,
      message: `Retur penjualan ${updated.returnNumber} berhasil disetujui`,
      data: updated
    };
  }

  async resolveSupplierReturn(id: string, settlementType?: string, creditNoteNo?: string) {
    const [existing] = await db
      .select()
      .from(schema.supplierReturns)
      .where(eq(schema.supplierReturns.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Data retur dengan ID ${id} tidak ditemukan`);
    }

    const effectiveSettlement = settlementType || existing.settlementType || "NOTA_KREDIT";
    const effectiveCn = creditNoteNo || existing.creditNoteNo || `CN-${existing.returnNumber}`;

    const [updated] = await db
      .update(schema.supplierReturns)
      .set({
        status: "RESOLVED",
        settlementType: effectiveSettlement,
        creditNoteNo: effectiveCn
      })
      .where(eq(schema.supplierReturns.id, id))
      .returning();

    // 1. JIKA PENYELESAIAN BERUPA NOTA KREDIT (POTONG HUTANG / TAGIHAN PBF)
    if (effectiveSettlement === "NOTA_KREDIT" && Number(existing.totalValue) > 0 && existing.invoiceRef) {
      const [invoice] = await db
        .select()
        .from(schema.purchaseInvoices)
        .where(
          and(
            eq(schema.purchaseInvoices.branchId, existing.branchId),
            eq(schema.purchaseInvoices.invoiceNumber, existing.invoiceRef)
          )
        )
        .limit(1);

      if (invoice) {
        const existingPayment = await db
          .select()
          .from(schema.debtPayments)
          .where(
            and(
              eq(schema.debtPayments.purchaseInvoiceId, invoice.id),
              eq(schema.debtPayments.paymentNumber, effectiveCn)
            )
          )
          .limit(1);

        if (existingPayment.length === 0) {
          const returnAmount = Number(existing.totalValue);
          const currentPaid = Number(invoice.paidAmount || 0);
          const grandTotal = Number(invoice.grandTotal || 0);
          const newPaidAmount = currentPaid + returnAmount;
          const isPaidOff = newPaidAmount >= grandTotal;

          const [u] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);

          await db.insert(schema.debtPayments).values({
            id: crypto.randomUUID(),
            tenantId: existing.tenantId,
            branchId: existing.branchId,
            purchaseInvoiceId: invoice.id,
            paymentNumber: effectiveCn,
            paymentDate: new Date().toISOString().slice(0, 10),
            paymentMethod: "NOTA_KREDIT",
            amountPaid: String(returnAmount),
            receiptScanUrl: null,
            paidBy: u ? u.id : crypto.randomUUID(),
            createdAt: new Date()
          });

          await db
            .update(schema.purchaseInvoices)
            .set({
              paidAmount: String(newPaidAmount),
              isPaidOff
            })
            .where(eq(schema.purchaseInvoices.id, invoice.id));
        }
      }
    }
    // 2. JIKA PENYELESAIAN BERUPA TUKAR BATCH BARU (PENGGANTIAN STOK FISIK DARI PBF)
    else if (effectiveSettlement === "TUKAR_BATCH" && Number(existing.qty) > 0 && existing.productId) {
      let conversionFactor = 1;
      const [unitRow] = await db
        .select({ conversionFactor: schema.productUnits.conversionFactor })
        .from(schema.productUnits)
        .where(
          and(
            eq(schema.productUnits.productId, existing.productId),
            sql`LOWER(${schema.productUnits.unitName}) = LOWER(${existing.unit})`
          )
        )
        .limit(1);

      if (unitRow && unitRow.conversionFactor) {
        conversionFactor = Math.max(1, Number(unitRow.conversionFactor));
      }
      const qtyBase = Math.round(Number(existing.qty) * conversionFactor * 1000000) / 1000000;
      const locationId = await this.getDefaultLocation(existing.branchId);

      if (locationId) {
        await db.insert(schema.stockLedger).values({
          id: crypto.randomUUID(),
          tenantId: existing.tenantId,
          branchId: existing.branchId,
          productId: existing.productId,
          locationId,
          mutationType: "PURCHASE_RECEIPT",
          quantityBase: String(qtyBase),
          costPerUnit: "0",
          referenceId: existing.id,
          notes: `Penerimaan Barang Pengganti Retur PBF (${existing.returnNumber}): ${existing.qty} ${existing.unit} (${qtyBase} satuan dasar) - Tukar Batch Baru`,
          createdBy: crypto.randomUUID(),
          createdAt: new Date()
        });

        await db
          .update(schema.branchStocks)
          .set({
            totalQtyBase: sql`${schema.branchStocks.totalQtyBase} + ${qtyBase}`,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(schema.branchStocks.branchId, existing.branchId),
              eq(schema.branchStocks.productId, existing.productId),
              eq(schema.branchStocks.locationId, locationId)
            )
          );
      }
    }

    return {
      success: true,
      message: `Klaim retur ${updated.returnNumber} berhasil diselesaikan (${updated.settlementType}). ${
        effectiveSettlement === "NOTA_KREDIT"
          ? "Tagihan faktur pembelian telah dipotong otomatis via Nota Kredit."
          : "Stok pengganti telah dicatat ke inventori."
      }`,
      data: updated
    };
  }
}

export const returnsService = new ReturnsService();
