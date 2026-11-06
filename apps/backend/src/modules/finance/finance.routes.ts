import { Elysia, t } from "elysia";
import { financeService } from "./finance.service.js";

export const financeRoutes = new Elysia({ prefix: "/api/finance" })
  .derive(({ headers }) => {
    const tenantId = (headers["x-tenant-id"] as string) || undefined;
    const branchId = (headers["x-branch-id"] as string) || undefined;
    const userId = (headers["x-user-id"] as string) || undefined;
    return { tenantId, branchId, userId };
  })
  // 1. GET DEBT PAYMENTS HISTORY
  .get(
    "/debt-payments",
    async ({ query, branchId }) => {
      try {
        const targetBranch = query.branch_id || branchId;
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
    async ({ query, branchId }) => {
      try {
        const targetBranch = query.branch_id || branchId;
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
  );
