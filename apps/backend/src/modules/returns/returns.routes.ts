import { Elysia, t } from "elysia";
import { returnsService } from "./returns.service.js";

export const returnsRoutes = new Elysia({ prefix: "/api/returns" })
  .derive(({ headers }) => {
    const tenantId = (headers["x-tenant-id"] as string) || undefined;
    const branchId = (headers["x-branch-id"] as string) || undefined;
    const userId = (headers["x-user-id"] as string) || undefined;
    return { tenantId, branchId, userId };
  })
  // 1. GET CUSTOMER RETURNS
  .get(
    "/customer",
    async ({ query, branchId }) => {
      try {
        const targetBranch = query.branch_id || branchId;
        const limit = query.limit ? Number(query.limit) : 50;
        const data = await returnsService.getCustomerReturns(targetBranch, limit);
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      query: t.Object({
        branch_id: t.Optional(t.String()),
        limit: t.Optional(t.Numeric())
      }),
      detail: {
        tags: ["Retur"],
        summary: "Daftar Retur Penjualan Pasien / Konsumen"
      }
    }
  )

  // 2. CREATE CUSTOMER RETURN
  .post(
    "/customer",
    async ({ body, tenantId, branchId }) => {
      try {
        const targetBranch = body.branchId || branchId;
        if (!targetBranch) throw new Error("branchId is required");
        const res = await returnsService.recordCustomerReturn({
          ...body,
          tenantId,
          branchId: targetBranch
        });
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        branchId: t.Optional(t.String()),
        customerName: t.String(),
        originalTrx: t.Optional(t.String()),
        productId: t.Optional(t.String()),
        productName: t.String(),
        batchNo: t.Optional(t.String()),
        qty: t.Number({ minimum: 1 }),
        unit: t.Optional(t.String()),
        refundAmount: t.Number({ minimum: 0 }),
        stockDisposition: t.Union([t.Literal("LAYAK_JUAL"), t.Literal("KARANTINA")]),
        compensationType: t.Union([t.Literal("REFUND_TUNAI"), t.Literal("TUKAR_BARANG")]),
        reason: t.Optional(t.String()),
        cashier: t.Optional(t.String())
      }),
      detail: {
        tags: ["Retur"],
        summary: "Input Retur Penjualan Pasien"
      }
    }
  )

  // 3. GET SUPPLIER RETURNS
  .get(
    "/supplier",
    async ({ query, branchId }) => {
      try {
        const targetBranch = query.branch_id || branchId;
        const limit = query.limit ? Number(query.limit) : 50;
        const data = await returnsService.getSupplierReturns(targetBranch, limit);
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      query: t.Object({
        branch_id: t.Optional(t.String()),
        limit: t.Optional(t.Numeric())
      }),
      detail: {
        tags: ["Retur"],
        summary: "Daftar Retur Pembelian ke Distributor PBF"
      }
    }
  )

  // 4. CREATE SUPPLIER RETURN
  .post(
    "/supplier",
    async ({ body, tenantId, branchId }) => {
      try {
        const targetBranch = body.branchId || branchId;
        if (!targetBranch) throw new Error("branchId is required");
        const res = await returnsService.recordSupplierReturn({
          ...body,
          tenantId,
          branchId: targetBranch
        });
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        branchId: t.Optional(t.String()),
        supplierName: t.String(),
        invoiceRef: t.Optional(t.String()),
        productId: t.Optional(t.String()),
        productName: t.String(),
        batchNo: t.Optional(t.String()),
        qty: t.Number({ minimum: 1 }),
        unit: t.Optional(t.String()),
        totalValue: t.Number({ minimum: 0 }),
        settlementType: t.Union([t.Literal("NOTA_KREDIT"), t.Literal("TUKAR_BATCH")]),
        reason: t.Optional(t.String()),
        pic: t.Optional(t.String())
      }),
      detail: {
        tags: ["Retur"],
        summary: "Input Retur Pembelian ke Distributor PBF"
      }
    }
  )

  // 5. RESOLVE SUPPLIER RETURN
  .post(
    "/supplier/:id/resolve",
    async ({ params, body }) => {
      try {
        const res = await returnsService.resolveSupplierReturn(
          params.id,
          body?.settlementType,
          body?.creditNoteNo
        );
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      body: t.Optional(
        t.Object({
          settlementType: t.Optional(t.String()),
          creditNoteNo: t.Optional(t.String())
        })
      ),
      detail: {
        tags: ["Retur"],
        summary: "Selesaikan Klaim Retur PBF (Nota Kredit / Tukar Batch)"
      }
    }
  );
