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

  // 2B. GET CASHFLOW & BANK BALANCE
  .get(
    "/cashflow",
    async () => {
      try {
        const debtSummary = await financeService.getDebtSummary();

        // 1. Kas Laci & Penjualan Tunai
        const kasLaci = 15850000;
        const bcaBalance = 142500000;
        const mandiriBalance = 68750000;
        const totalKasBank = kasLaci + bcaBalance + mandiriBalance;

        // Transactions in/out
        const entries = [
          {
            id: "cf-1",
            date: new Date().toISOString().slice(0, 10),
            time: "10:30",
            category: "PENJUALAN_TUNAI",
            type: "IN",
            account: "KAS_KASIR",
            description: "Penerimaan Penjualan Kasir POS Shift Pagi",
            amount: 4850000
          },
          {
            id: "cf-2",
            date: new Date().toISOString().slice(0, 10),
            time: "09:15",
            category: "PENJUALAN_NON_TUNAI",
            type: "IN",
            account: "BANK_BCA",
            description: "Settlement QRIS & EDC Pasien Rawat Jalan",
            amount: 2150000
          },
          {
            id: "cf-3",
            date: new Date().toISOString().slice(0, 10),
            time: "11:45",
            category: "PELUNASAN_HUTANG",
            type: "OUT",
            account: "BANK_MANDIRI",
            description: "Pelunasan Faktur Jatuh Tempo PT. Kimia Farma TD",
            amount: 3500000
          },
          {
            id: "cf-4",
            date: new Date().toISOString().slice(0, 10),
            time: "13:00",
            category: "OPERASIONAL",
            type: "OUT",
            account: "KAS_KASIR",
            description: "Pembelian ATK, Plastik Klip & Thermal Paper Struk",
            amount: 175000
          }
        ];

        return {
          success: true,
          data: {
            kasLaci,
            bcaBalance,
            mandiriBalance,
            totalKasBank,
            totalDebt: debtSummary.totalRemainingDebt,
            entries
          }
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      detail: {
        tags: ["Keuangan & Hutang"],
        summary: "Arus Kas Masuk/Keluar & Saldo Kasir serta Rekening Bank"
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
