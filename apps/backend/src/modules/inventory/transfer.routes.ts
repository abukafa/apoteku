import { Elysia, t } from "elysia";
import { transferService } from "./transfer.service.js";

export const transferRoutes = new Elysia({ prefix: "/api/inventory/transfers" })
  .derive(({ headers }) => {
    const tenantId = (headers["x-tenant-id"] as string) || undefined;
    const branchId = (headers["x-branch-id"] as string) || undefined;
    const userId = (headers["x-user-id"] as string) || undefined;
    return { tenantId, branchId, userId };
  })
  // 0. GET AVAILABLE STOCKED PRODUCTS FOR A SPECIFIC BRANCH
  .get(
    "/branch-products",
    async ({ query, branchId, tenantId }) => {
      try {
        const targetBranch = query.branch_id || branchId;
        if (!targetBranch) {
          return { success: false, error: "Parameter branch_id wajib diisi", data: [] };
        }
        const data = await transferService.getBranchProducts(targetBranch, tenantId);
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: err.message, data: [] };
      }
    },
    {
      query: t.Object({
        branch_id: t.Optional(t.String())
      }),
      detail: {
        tags: ["Inventori Transfer"],
        summary: "Daftar Obat Beserta Batch & Satuan yang Tersedia di Cabang Tertentu"
      }
    }
  )

  // 1. GET ALL TRANSFERS
  .get(
    "",
    async ({ query, branchId, tenantId }) => {
      try {
        const targetBranch = query.branch_id || branchId;
        const limit = query.limit ? Number(query.limit) : 50;
        const data = await transferService.getTransfers(targetBranch, limit, tenantId);
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: err.message, data: [] };
      }
    },
    {
      query: t.Object({
        branch_id: t.Optional(t.String()),
        limit: t.Optional(t.Numeric())
      }),
      detail: {
        tags: ["Inventori Transfer"],
        summary: "Daftar Surat Jalan Mutasi Stok Antar Cabang"
      }
    }
  )

  // 2. CREATE NEW TRANSFER (RKB)
  .post(
    "",
    async ({ body, tenantId, userId }) => {
      try {
        const res = await transferService.createTransfer({
          ...body,
          tenantId,
          userId
        });
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        transferNumber: t.Optional(t.String()),
        fromBranchId: t.String(),
        toBranchId: t.String(),
        courierName: t.Optional(t.String()),
        operator: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        status: t.Optional(t.Union([t.Literal("REQUESTED"), t.Literal("IN_TRANSIT")])),
        items: t.Array(
          t.Object({
            productId: t.String(),
            productName: t.Optional(t.String()),
            batchId: t.Optional(t.String()),
            batchNumber: t.Optional(t.String()),
            expiryDate: t.Optional(t.String()),
            locationId: t.Optional(t.String()),
            qty: t.Number({ minimum: 0.0001 }),
            unit: t.Optional(t.String())
          })
        )
      }),
      detail: {
        tags: ["Inventori Transfer"],
        summary: "Terbitkan Surat Jalan Pengiriman Mutasi Antar Cabang"
      }
    }
  )

  // 3. RECEIVE & VERIFY TRANSFER (RTB)
  .post(
    "/:id/receive",
    async ({ params, body, userId }) => {
      try {
        const res = await transferService.receiveTransfer({
          transferId: params.id,
          userId,
          receivedBy: body.receivedBy,
          receiptNotes: body.receiptNotes,
          items: body.items
        });
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      body: t.Object({
        receivedBy: t.Optional(t.String()),
        receiptNotes: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            lineNo: t.Number(),
            qtyReceived: t.Number({ minimum: 0 }),
            discrepancyReason: t.Optional(t.String())
          })
        )
      }),
      detail: {
        tags: ["Inventori Transfer"],
        summary: "Verifikasi Penerimaan Fisik Surat Jalan di Cabang Tujuan"
      }
    }
  )

  // 4. DISPATCH REQUESTED TRANSFER
  .post(
    "/:id/dispatch",
    async ({ params, body, userId }) => {
      try {
        const res = await transferService.dispatchTransfer(
          params.id,
          body?.courierName,
          userId,
          body?.operator
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
          courierName: t.Optional(t.String()),
          operator: t.Optional(t.String())
        })
      ),
      detail: {
        tags: ["Inventori Transfer"],
        summary: "Berangkatkan Pengiriman Permintaan Transfer"
      }
    }
  );
