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

  async deleteCashMutation(mutationId: string) {
    const [mut] = await db
      .select({
        id: schema.cashMutations.id,
        refNumber: schema.cashMutations.refNumber,
        amount: schema.cashMutations.amount,
        type: schema.cashMutations.type,
        category: schema.cashMutations.category,
        description: schema.cashMutations.description
      })
      .from(schema.cashMutations)
      .where(eq(schema.cashMutations.id, mutationId))
      .limit(1);

    if (!mut) {
      throw new Error(`Data mutasi kas dengan ID "${mutationId}" tidak ditemukan`);
    }

    await db
      .delete(schema.cashMutations)
      .where(eq(schema.cashMutations.id, mutationId));

    return {
      success: true,
      message: `Mutasi kas "${mut.refNumber}" (${mut.category} - Rp ${Number(mut.amount).toLocaleString("id-ID")}) berhasil dihapus.`,
      data: {
        deletedId: mut.id,
        refNumber: mut.refNumber
      }
    };
  }

  async recordCashMutation(payload: {
    tenantId?: string;
    branchId?: string;
    type: "IN" | "OUT";
    category: string;
    account?: string;
    refNumber?: string;
    amount: number;
    description?: string;
    operator?: string;
    transactionDate?: Date;
  }) {
    const tenantId = await this.getTenantId(payload.tenantId);

    let branchId = payload.branchId;
    let branch = null;
    if (branchId && branchId !== "ALL") {
      const [found] = await db
        .select({ id: schema.branches.id, name: schema.branches.name })
        .from(schema.branches)
        .where(eq(schema.branches.id, branchId))
        .limit(1);
      branch = found;
    }

    if (!branch) {
      const [defaultBranch] = await db
        .select({ id: schema.branches.id, name: schema.branches.name })
        .from(schema.branches)
        .limit(1);
      branch = defaultBranch;
      branchId = defaultBranch?.id;
    }

    if (!branchId) {
      throw new Error("Tidak ada cabang yang valid di database");
    }

    const prefix = payload.type === "IN" ? "KSM" : "BOP";
    const refNumber =
      payload.refNumber ||
      `${prefix}-${new Date().toISOString().slice(2, 7).replace("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`;

    const [created] = await db
      .insert(schema.cashMutations)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        branchId,
        type: payload.type,
        category: payload.category,
        account: payload.account || "KAS_LACI",
        refNumber,
        amount: String(payload.amount),
        description: payload.description,
        operator: payload.operator || "Staf Keuangan",
        transactionDate: payload.transactionDate || new Date()
      })
      .returning();

    return {
      success: true,
      message: `Mutasi ${payload.type === "IN" ? "Kas Masuk" : "Kas Keluar"} ${refNumber} berhasil dicatat.`,
      data: {
        ...created,
        branchName: branch?.name || "Apotek Hafidz Farma",
        amount: Number(created.amount)
      }
    };
  }

  async recordQrisPayout(payload: {
    tenantId?: string;
    branchId?: string;
    amount: number;
    operator?: string;
  }) {
    const tenantId = await this.getTenantId(payload.tenantId);
    const amount = Number(payload.amount);
    const refNumber = `SET-${new Date().toISOString().slice(2, 7).replace("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`;

    let branchId = payload.branchId;
    let branch = null;
    if (branchId && branchId !== "ALL") {
      const [found] = await db
        .select({ id: schema.branches.id, name: schema.branches.name })
        .from(schema.branches)
        .where(eq(schema.branches.id, branchId))
        .limit(1);
      branch = found;
    }

    if (!branch) {
      const [defaultBranch] = await db
        .select({ id: schema.branches.id, name: schema.branches.name })
        .from(schema.branches)
        .limit(1);
      branch = defaultBranch;
      branchId = defaultBranch?.id;
    }

    if (!branchId) {
      throw new Error("Tidak ada cabang yang valid di database");
    }

    const [created] = await db
      .insert(schema.cashMutations)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        branchId,
        type: "IN",
        category: "Settlement QRIS",
        account: "BANK_BCA",
        refNumber,
        amount: String(amount),
        description: "Penarikan Dana QRIS (Xendit) ke Rekening BCA Apotek",
        operator: payload.operator || "Sistem Otomatis (Xendit)",
        transactionDate: new Date()
      })
      .returning();

    return {
      success: true,
      message: `Penarikan dana QRIS sebesar Rp ${amount.toLocaleString("id-ID")} berhasil disetorkan ke Rekening BCA.`,
      data: {
        ...created,
        branchName: branch?.name || "Apotek Hafidz Farma",
        amount: Number(created.amount)
      }
    };
  }

  async getCashflow(branchId?: string) {
    const debtSummary = await this.getDebtSummary(branchId);
    const recentDebtPayments = await this.getDebtPayments({ branchId, limit: 100 });

    // 1. Ambil mutasi kas kecil dari database
    const mutConditions = [];
    if (branchId && branchId !== "ALL") {
      mutConditions.push(eq(schema.cashMutations.branchId, branchId));
    }
    const mutations = await db
      .select({
        id: schema.cashMutations.id,
        branchId: schema.cashMutations.branchId,
        branchName: schema.branches.name,
        type: schema.cashMutations.type,
        category: schema.cashMutations.category,
        account: schema.cashMutations.account,
        refNumber: schema.cashMutations.refNumber,
        amount: schema.cashMutations.amount,
        description: schema.cashMutations.description,
        operator: schema.cashMutations.operator,
        transactionDate: schema.cashMutations.transactionDate
      })
      .from(schema.cashMutations)
      .leftJoin(schema.branches, eq(schema.cashMutations.branchId, schema.branches.id))
      .where(mutConditions.length > 0 ? and(...mutConditions) : undefined)
      .orderBy(desc(schema.cashMutations.transactionDate))
      .limit(100);

    // 2. Agregasi Penjualan POS Kasir
    let posCashTotal = 0;
    let posQrisTotal = 0;
    let posOtherNonCash = 0;
    try {
      const salesAgg = await db
        .select({
          cashSales: sql<number>`COALESCE(SUM(CASE WHEN ${schema.salesTransactions.paymentMethod} = 'CASH' THEN ${schema.salesTransactions.grandTotal} ELSE 0 END), 0)::numeric`,
          qrisSales: sql<number>`COALESCE(SUM(CASE WHEN ${schema.salesTransactions.paymentMethod} = 'QRIS' THEN ${schema.salesTransactions.grandTotal} ELSE 0 END), 0)::numeric`,
          otherNonCashSales: sql<number>`COALESCE(SUM(CASE WHEN ${schema.salesTransactions.paymentMethod} NOT IN ('CASH', 'QRIS') THEN ${schema.salesTransactions.grandTotal} ELSE 0 END), 0)::numeric`
        })
        .from(schema.salesTransactions)
        .where(
          branchId && branchId !== "ALL"
            ? eq(schema.salesTransactions.branchId, branchId)
            : undefined
        );

      posCashTotal = Number(salesAgg[0]?.cashSales || 0);
      posQrisTotal = Number(salesAgg[0]?.qrisSales || 0);
      posOtherNonCash = Number(salesAgg[0]?.otherNonCashSales || 0);
    } catch (_) {}

    // 3. Hitung QRIS Payouts yang sudah ditarik
    const totalQrisPaidOut = mutations
      .filter((m) => m.category === "Settlement QRIS" || (m.description && m.description.includes("QRIS")))
      .reduce((sum, m) => sum + Number(m.amount || 0), 0);
    const qrisBalance = Math.max(0, posQrisTotal - totalQrisPaidOut);

    // 4. Hitung Saldo Arus Kas per Akun
    let cashInLaci = 0;
    let cashOutLaci = 0;
    let cashInBrankas = 0;
    let cashOutBrankas = 0;
    let cashInBca = 0;
    let cashOutBca = 0;

    for (const m of mutations) {
      const amt = Number(m.amount || 0);
      const acc = (m.account || "KAS_LACI").toUpperCase();
      if (m.type === "IN") {
        if (acc.includes("BRANKAS")) cashInBrankas += amt;
        else if (acc.includes("BCA") || acc.includes("BANK")) cashInBca += amt;
        else cashInLaci += amt;
      } else {
        if (acc.includes("BRANKAS")) cashOutBrankas += amt;
        else if (acc.includes("BCA") || acc.includes("BANK")) cashOutBca += amt;
        else cashOutLaci += amt;
      }
    }

    const totalDebtPaidBca = recentDebtPayments.reduce((sum, p) => sum + p.amountPaid, 0);

    const kasLaci = Math.max(0, posCashTotal + cashInLaci - cashOutLaci);
    const kasBrankas = Math.max(0, cashInBrankas - cashOutBrankas);
    const bcaBalance = Math.max(0, posOtherNonCash + cashInBca - totalDebtPaidBca - cashOutBca);
    const totalKasBank = kasLaci + kasBrankas + bcaBalance;

    // 5. Susun Seluruh Entri Riwayat Kas (Entries)
    const combinedEntries: Array<{
      id: string;
      branchId: string;
      branchName: string;
      time: string;
      type: "IN" | "OUT";
      category: string;
      account: "KAS_LACI" | "KAS_BRANKAS" | "BANK_BCA";
      refNumber: string;
      amount: number;
      balance: number;
      operator: string;
      description: string;
    }> = [];

    // Tambah mutasi kas kecil
    for (const m of mutations) {
      const acc = (m.account || "KAS_LACI").toUpperCase();
      const normAcc: "KAS_LACI" | "KAS_BRANKAS" | "BANK_BCA" =
        acc.includes("BRANKAS") ? "KAS_BRANKAS" : acc.includes("BCA") || acc.includes("BANK") ? "BANK_BCA" : "KAS_LACI";

      combinedEntries.push({
        id: m.id,
        branchId: m.branchId,
        branchName: m.branchName || "Apotek Hafidz Farma",
        time: m.transactionDate ? new Date(m.transactionDate).toISOString().replace("T", " ").substring(0, 16) : "-",
        type: m.type as "IN" | "OUT",
        category: m.category,
        account: normAcc,
        refNumber: m.refNumber,
        amount: Number(m.amount),
        balance: 0,
        operator: m.operator || "Staf Keuangan",
        description: m.description || m.category
      });
    }

    // Tambah pembayaran hutang PBF
    for (const p of recentDebtPayments) {
      const method = (p.paymentMethod || "").toUpperCase();
      const normAcc: "KAS_LACI" | "KAS_BRANKAS" | "BANK_BCA" =
        method.includes("BCA") || method.includes("TRANSFER") ? "BANK_BCA" : "KAS_LACI";

      combinedEntries.push({
        id: `dp-${p.id}`,
        branchId: p.branchId || "1",
        branchName: p.branchName || "Apotek Hafidz Farma",
        time: p.paymentDate ? `${p.paymentDate} 10:00` : "-",
        type: "OUT",
        category: "Pelunasan PBF",
        account: normAcc,
        refNumber: p.paymentNumber,
        amount: p.amountPaid,
        balance: 0,
        operator: p.paidByName || "Bagian Keuangan",
        description: `Pelunasan Faktur ${p.invoiceNumber} (${p.supplierName})`
      });
    }

    // Urutkan berdasarkan waktu descending
    combinedEntries.sort((a, b) => (b.time > a.time ? 1 : -1));

    // Hitung running balance
    let cur = totalKasBank;
    for (let i = 0; i < combinedEntries.length; i++) {
      combinedEntries[i].balance = cur;
      if (combinedEntries[i].type === "IN") {
        cur -= combinedEntries[i].amount;
      } else {
        cur += combinedEntries[i].amount;
      }
    }

    return {
      kasLaci,
      kasBrankas,
      bcaBalance,
      qrisBalance,
      totalKasBank,
      totalDebt: debtSummary.totalRemainingDebt,
      entries: combinedEntries
    };
  }
}

export const financeService = new FinanceService();
