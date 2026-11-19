import { Elysia, t } from "elysia";
import { financeService } from "./finance.service.js";

export const financeRoutes = new Elysia({ prefix: "/api/finance" })
  .derive(({ headers }) => {
    const tenantId = (headers["x-tenant-id"] as string) || undefined;
    const branchId = (headers["x-branch-id"] as string) || undefined;
    const userId = (headers["x-user-id"] as string) || undefined;
    const userRole = (headers["x-user-role"] as string) || undefined;
    return { tenantId, branchId, userId, userRole };
  })
  // 1. GET DEBT PAYMENTS HISTORY
  .get(
    "/debt-payments",
    async ({ query, branchId, userRole }) => {
      try {
        const isMultiBranchUser = userRole === "OWNER" || userRole === "SUPERADMIN" || !branchId || branchId === "ALL";
        const targetBranch = isMultiBranchUser ? (query.branch_id || "ALL") : branchId;
        const limit = query.limit ? Number(query.limit) : 50;
        const data = await financeService.getDebtPayments({
          branchId: targetBranch,
          invoiceId: query.invoice_id,
          limit
        });
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      query: t.Object({
        branch_id: t.Optional(t.String()),
        invoice_id: t.Optional(t.String()),
        limit: t.Optional(t.Numeric())
      }),
      detail: {
        tags: ["Keuangan & Hutang"],
        summary: "Riwayat Pembayaran Pelunasan Hutang Faktur PBF"
      }
    }
  )

  // 2. GET DEBT SUMMARY (HUTANG JATUH TEMPO)
  .get(
    "/debt-summary",
    async ({ query, branchId, userRole }) => {
      try {
        const isMultiBranchUser = userRole === "OWNER" || userRole === "SUPERADMIN" || !branchId || branchId === "ALL";
        const targetBranch = isMultiBranchUser ? (query.branch_id || "ALL") : branchId;
        const data = await financeService.getDebtSummary(targetBranch);
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      query: t.Object({
        branch_id: t.Optional(t.String())
      }),
      detail: {
        tags: ["Keuangan & Hutang"],
        summary: "Ringkasan Total Hutang Dagang PBF"
      }
    }
  )

  // 2B. GET CASHFLOW & BANK BALANCE
  .get(
    "/cashflow",
    async ({ query, branchId, userRole }) => {
      try {
        const isMultiBranchUser = userRole === "OWNER" || userRole === "SUPERADMIN" || !branchId || branchId === "ALL";
        const targetBranch = isMultiBranchUser ? (query.branch_id || "ALL") : branchId;
        const data = await financeService.getCashflow(targetBranch);
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      query: t.Object({
        branch_id: t.Optional(t.String())
      }),
      detail: {
        tags: ["Keuangan & Hutang"],
        summary: "Arus Kas Masuk/Keluar & Saldo Kasir serta Rekening Bank"
      }
    }
  )

  // 2C. RECORD CASH MUTATION (KAS KECIL / BIAYA OPERASIONAL)
  .post(
    "/cash-mutations",
    async ({ body, tenantId, branchId }) => {
      try {
        const targetBranch = body.branchId || branchId;
        const res = await financeService.recordCashMutation({
          tenantId,
          branchId: targetBranch,
          type: body.type,
          category: body.category,
          account: body.account,
          refNumber: body.refNumber,
          amount: Number(body.amount),
          description: body.description,
          operator: body.operator
        });
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        branchId: t.Optional(t.String()),
        type: t.Union([t.Literal("IN"), t.Literal("OUT")]),
        category: t.String(),
        account: t.Optional(t.String()),
        refNumber: t.Optional(t.String()),
        amount: t.Number({ minimum: 1 }),
        description: t.Optional(t.String()),
        operator: t.Optional(t.String())
      }),
      detail: {
        tags: ["Keuangan & Hutang"],
        summary: "Catat Mutasi Kas Masuk / Kas Keluar (Buku Kas & Kas Kecil)"
      }
    }
  )

  // 2D. RECORD QRIS PAYOUT
  .post(
    "/qris-payout",
    async ({ body, tenantId, branchId }) => {
      try {
        const targetBranch = body.branchId || branchId;
        const res = await financeService.recordQrisPayout({
          tenantId,
          branchId: targetBranch,
          amount: Number(body.amount),
          operator: body.operator
        });
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        branchId: t.Optional(t.String()),
        amount: t.Number({ minimum: 1 }),
        operator: t.Optional(t.String())
      }),
      detail: {
        tags: ["Keuangan & Hutang"],
        summary: "Penarikan Dana / Settlement Saldo QRIS Xendit ke Rekening BCA"
      }
    }
  )

  // 3. RECORD DEBT PAYMENT
  .post(
    "/debt-payments",
    async ({ body, tenantId, branchId, userId }) => {
      try {
        const targetBranch = body.branchId || branchId;
        const res = await financeService.recordDebtPayment({
          tenantId,
          branchId: targetBranch,
          purchaseInvoiceId: body.purchaseInvoiceId,
          amountPaid: Number(body.amountPaid),
          paymentMethod: body.paymentMethod,
          paymentDate: body.paymentDate,
          paymentNumber: body.paymentNumber,
          receiptScanUrl: body.receiptScanUrl,
          paidBy: body.paidBy || userId
        });
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        purchaseInvoiceId: t.String(),
        branchId: t.Optional(t.String()),
        amountPaid: t.Number({ minimum: 1 }),
        paymentMethod: t.String(),
        paymentDate: t.Optional(t.String()),
        paymentNumber: t.Optional(t.String()),
        receiptScanUrl: t.Optional(t.String()),
        paidBy: t.Optional(t.String())
      }),
      detail: {
        tags: ["Keuangan & Hutang"],
        summary: "Catat Pelunasan Hutang Faktur Pembelian PBF"
      }
    }
  )

  // 4. DELETE / VOID DEBT PAYMENT (BATALKAN PEMBAYARAN HUTANG)
  .delete(
    "/debt-payments/:id",
    async ({ params }) => {
      try {
        const res = await financeService.deleteDebtPayment(params.id);
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      detail: {
        tags: ["Keuangan & Hutang"],
        summary: "Batalkan Pelunasan Hutang & Pulihkan Saldo Tagihan Faktur"
      }
    }
  )

  // 5. DELETE CASH MUTATION (HAPUS MUTASI KAS KECIL & OPERASIONAL)
  .delete(
    "/cash-mutations/:id",
    async ({ params }) => {
      try {
        const res = await financeService.deleteCashMutation(params.id);
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      detail: {
        tags: ["Keuangan & Hutang"],
        summary: "Hapus Entri Mutasi Kas Kecil & Operasional"
      }
    }
  );
