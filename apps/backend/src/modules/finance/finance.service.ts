import { db, schema } from "@apoteku/db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import {
  calculateDebtSettlement,
  calculateDebtVoidReversal,
  generateDebtPaymentNumber,
  formatRupiah
} from "@apoteku/core";

export interface RecordDebtPaymentPayload {
  tenantId?: string;
  purchaseInvoiceId: string;
  branchId?: string;
  amountPaid: number;
  paymentMethod: string;
  paymentDate?: string;
  paymentNumber?: string;
  receiptScanUrl?: string;
  paidBy?: string;
}

class FinanceService {
  private async getTenantId(candidate?: string): Promise<string> {
    if (candidate) return candidate;
    const [t] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
    if (!t) throw new Error("No active tenant found in database");
    return t.id;
  }

  async recordDebtPayment(payload: RecordDebtPaymentPayload) {
    const tenantId = await this.getTenantId(payload.tenantId);

    const isUuid = (val?: string) =>
      Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

    const numericLegacyId = Number(payload.purchaseInvoiceId);
    const invoiceCondition = isUuid(payload.purchaseInvoiceId)
      ? eq(schema.purchaseInvoices.id, payload.purchaseInvoiceId)
      : !isNaN(numericLegacyId) && numericLegacyId > 0
        ? or(
            eq(schema.purchaseInvoices.invoiceNumber, payload.purchaseInvoiceId),
            eq(schema.purchaseInvoices.legacyIdPembelian, numericLegacyId)
          )
        : eq(schema.purchaseInvoices.invoiceNumber, payload.purchaseInvoiceId);

    const [invoice] = await db
      .select({
        id: schema.purchaseInvoices.id,
        invoiceNumber: schema.purchaseInvoices.invoiceNumber,
        branchId: schema.purchaseInvoices.branchId,
        supplierId: schema.purchaseInvoices.supplierId,
        grandTotal: schema.purchaseInvoices.grandTotal,
        paidAmount: schema.purchaseInvoices.paidAmount,
        isPaidOff: schema.purchaseInvoices.isPaidOff,
        supplierName: schema.suppliers.name
      })
      .from(schema.purchaseInvoices)
      .leftJoin(schema.suppliers, eq(schema.purchaseInvoices.supplierId, schema.suppliers.id))
      .where(invoiceCondition)
      .limit(1);

    if (!invoice) {
      throw new Error(`Faktur Pembelian dengan referensi ${payload.purchaseInvoiceId} tidak ditemukan`);
    }

    const currentPaid = Number(invoice.paidAmount || 0);
    const grandTotal = Number(invoice.grandTotal || 0);
    const paymentAmount = Number(payload.amountPaid || 0);

    if (paymentAmount <= 0) {
      throw new Error("Nominal pembayaran harus lebih besar dari 0");
    }

    const settlement = calculateDebtSettlement(grandTotal, currentPaid, paymentAmount);
    const now = new Date();
    const paymentNumber = payload.paymentNumber || generateDebtPaymentNumber(undefined, now);
    const paymentId = crypto.randomUUID();
    const paymentDateStr = payload.paymentDate || now.toISOString().slice(0, 10);

    // Pastikan paidBy & branchId valid dengan relasi foreign key
    let paidBy = isUuid(payload.paidBy) ? (payload.paidBy as string) : undefined;
    if (!paidBy) {
      const [u] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
      paidBy = u ? u.id : crypto.randomUUID();
    }

    let branchId = (isUuid(payload.branchId) ? payload.branchId : invoice.branchId) || undefined;
    if (!branchId) {
      const [b] = await db.select({ id: schema.branches.id }).from(schema.branches).limit(1);
      branchId = b ? b.id : crypto.randomUUID();
    }

    // 1. Insert into debt_payments
    const [createdPayment] = await db
      .insert(schema.debtPayments)
      .values({
        id: paymentId,
        tenantId,
        branchId,
        purchaseInvoiceId: invoice.id,
        paymentNumber,
        paymentDate: paymentDateStr,
        paymentMethod: payload.paymentMethod || "TRANSFER",
        amountPaid: String(paymentAmount),
        receiptScanUrl: payload.receiptScanUrl || null,
        paidBy
      })
      .returning();

    // 2. Update purchase_invoices
    await db
      .update(schema.purchaseInvoices)
      .set({
        paidAmount: String(settlement.newPaidAmount),
        isPaidOff: settlement.isPaidOff
      })
      .where(eq(schema.purchaseInvoices.id, invoice.id));

    return {
      success: true,
      message: `Pelunasan hutang ${paymentNumber} berhasil dicatat. Status Faktur: ${settlement.isPaidOff ? "LUNAS (PAID)" : "SEBAGIAN (PARTIAL)"}`,
      data: {
        payment: {
          id: createdPayment.id,
          paymentNumber: createdPayment.paymentNumber,
          paymentDate: createdPayment.paymentDate,
          paymentMethod: createdPayment.paymentMethod,
          amountPaid: Number(createdPayment.amountPaid),
          receiptScanUrl: createdPayment.receiptScanUrl
        },
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          supplierName: invoice.supplierName,
          grandTotal,
          previousPaid: currentPaid,
          newPaidAmount: settlement.newPaidAmount,
          remainingDebt: settlement.remainingDebt,
          isPaidOff: settlement.isPaidOff
        }
      }
    };
  }

  async getDebtPayments(params: { branchId?: string; invoiceId?: string; limit?: number } = {}) {
    const limit = Math.min(params.limit || 50, 100);
    let conditions = [];

    if (params.branchId && params.branchId !== "ALL") {
      conditions.push(eq(schema.debtPayments.branchId, params.branchId));
    }
    if (params.invoiceId) {
      conditions.push(eq(schema.debtPayments.purchaseInvoiceId, params.invoiceId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const payments = await db
      .select({
        id: schema.debtPayments.id,
        paymentNumber: schema.debtPayments.paymentNumber,
        paymentDate: schema.debtPayments.paymentDate,
        paymentMethod: schema.debtPayments.paymentMethod,
        amountPaid: schema.debtPayments.amountPaid,
        receiptScanUrl: schema.debtPayments.receiptScanUrl,
        createdAt: schema.debtPayments.createdAt,
        invoiceNumber: schema.purchaseInvoices.invoiceNumber,
        supplierName: schema.suppliers.name,
        branchName: schema.branches.name
      })
      .from(schema.debtPayments)
      .leftJoin(
        schema.purchaseInvoices,
        eq(schema.debtPayments.purchaseInvoiceId, schema.purchaseInvoices.id)
      )
      .leftJoin(schema.suppliers, eq(schema.purchaseInvoices.supplierId, schema.suppliers.id))
      .leftJoin(schema.branches, eq(schema.debtPayments.branchId, schema.branches.id))
      .where(whereClause)
      .orderBy(desc(schema.debtPayments.createdAt))
      .limit(limit);

    return payments.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      paymentDate: p.paymentDate,
      paymentMethod: p.paymentMethod,
      amountPaid: Number(p.amountPaid),
      receiptScanUrl: p.receiptScanUrl,
      invoiceNumber: p.invoiceNumber || "-",
      supplierName: p.supplierName || "Distributor PBF",
      branchName: p.branchName || "Cabang"
    }));
  }

  async getDebtSummary(branchId?: string) {
    let conditions = [];
    if (branchId && branchId !== "ALL") {
      conditions.push(eq(schema.purchaseInvoices.branchId, branchId));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [agg] = await db
      .select({
        totalInvoices: sql<number>`COUNT(*)::int`,
        totalGrandTotal: sql<number>`COALESCE(SUM(${schema.purchaseInvoices.grandTotal}), 0)::numeric`,
        totalPaid: sql<number>`COALESCE(SUM(${schema.purchaseInvoices.paidAmount}), 0)::numeric`,
        unpaidCount: sql<number>`COUNT(*) FILTER (WHERE ${schema.purchaseInvoices.isPaidOff} = false)::int`,
        paidOffCount: sql<number>`COUNT(*) FILTER (WHERE ${schema.purchaseInvoices.isPaidOff} = true)::int`
      })
      .from(schema.purchaseInvoices)
      .where(whereClause);

    const grand = Number(agg?.totalGrandTotal || 0);
    const paid = Number(agg?.totalPaid || 0);
    const unpaid = Math.max(0, grand - paid);

    return {
      totalInvoices: agg?.totalInvoices || 0,
      totalPurchases: grand,
      totalPaid: paid,
      totalRemainingDebt: unpaid,
      unpaidInvoicesCount: agg?.unpaidCount || 0,
      paidOffInvoicesCount: agg?.paidOffCount || 0
    };
  }

  async deleteDebtPayment(paymentId: string) {
    const [payment] = await db
      .select({
        id: schema.debtPayments.id,
        paymentNumber: schema.debtPayments.paymentNumber,
        amountPaid: schema.debtPayments.amountPaid,
        purchaseInvoiceId: schema.debtPayments.purchaseInvoiceId
      })
      .from(schema.debtPayments)
      .where(eq(schema.debtPayments.id, paymentId))
      .limit(1);

    if (!payment) {
      throw new Error(`Data pembayaran dengan ID "${paymentId}" tidak ditemukan`);
    }

    const [invoice] = await db
      .select({
        id: schema.purchaseInvoices.id,
        invoiceNumber: schema.purchaseInvoices.invoiceNumber,
        grandTotal: schema.purchaseInvoices.grandTotal,
        paidAmount: schema.purchaseInvoices.paidAmount,
        isPaidOff: schema.purchaseInvoices.isPaidOff
      })
      .from(schema.purchaseInvoices)
      .where(eq(schema.purchaseInvoices.id, payment.purchaseInvoiceId))
      .limit(1);

    const paymentAmount = Number(payment.amountPaid || 0);

    return await db.transaction(async (tx) => {
      let restoredInvoice = null;

      if (invoice) {
        const currentPaid = Number(invoice.paidAmount || 0);
        const grandTotal = Number(invoice.grandTotal || 0);
        const reversal = calculateDebtVoidReversal(grandTotal, currentPaid, paymentAmount);

        await tx
          .update(schema.purchaseInvoices)
          .set({
            paidAmount: String(reversal.newPaidAmount),
            isPaidOff: reversal.isPaidOff
          })
          .where(eq(schema.purchaseInvoices.id, invoice.id));

        restoredInvoice = {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          grandTotal,
          previousPaid: currentPaid,
          newPaidAmount: reversal.newPaidAmount,
          remainingDebt: reversal.remainingDebt,
          isPaidOff: reversal.isPaidOff
        };
      }

      await tx
        .delete(schema.debtPayments)
        .where(eq(schema.debtPayments.id, payment.id));

      return {
        success: true,
        message: `Bukti pembayaran ${payment.paymentNumber} sebesar ${formatRupiah(paymentAmount)} berhasil dibatalkan. Saldo tagihan faktur telah dipulihkan.`,
        data: {
          deletedPaymentId: payment.id,
          paymentNumber: payment.paymentNumber,
          restoredInvoice
        }
      };
    });
  }
}

export const financeService = new FinanceService();
