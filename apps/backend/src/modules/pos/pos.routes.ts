import { Elysia } from "elysia";
import { posService } from "./pos.service.js";
import {
  BootstrapQuerySchema,
  SyncSalesBodySchema,
  DeltaSyncQuerySchema
} from "./pos.schema.js";

export const posRoutes = new Elysia({ prefix: "/api/pos" })
  .derive(({ headers }) => {
    const tenantId =
      (headers["x-tenant-id"] as string) ||
      "01931818-8000-7000-8000-000000000001";
    const branchId =
      (headers["x-branch-id"] as string) ||
      "01931818-8000-7000-8000-000000000002";
    const userId =
      (headers["x-user-id"] as string) ||
      "01931818-8000-7000-8000-000000000003";

    return {
      tenant: {
        tenantId,
        branchId,
        userId
      }
    };
  })
  .get(
    "/bootstrap",
    async ({ tenant, query }) => {
      const targetBranchId = query.branch_id || tenant.branchId;
      return await posService.getBootstrap(tenant.tenantId, targetBranchId);
    },
    {
      query: BootstrapQuerySchema,
      detail: {
        tags: ["POS"],
        summary: "Initial Bootstrap POS Offline Data",
        description:
          "Mengunduh seluruh katalog produk, multi-satuan, dan saldo batch untuk di-cache di IndexedDB"
      }
    }
  )
  .post(
    "/sync-sales",
    async ({ tenant, body }) => {
      return await posService.syncSales(tenant.tenantId, body);
    },
    {
      body: SyncSalesBodySchema,
      detail: {
        tags: ["POS"],
        summary: "Up-Sync Penjualan Offline",
        description:
          "Sinkronisasi kumpulan transaksi penjualan offline secara idempotent dengan rekonsiliasi defisit oversell"
      }
    }
  )
  .get(
    "/sync-delta",
    async ({ tenant, query }) => {
      const targetBranchId = query.branch_id || tenant.branchId;
      return await posService.getDeltaSync(
        tenant.tenantId,
        targetBranchId,
        query.since
      );
    },
    {
      query: DeltaSyncQuerySchema,
      detail: {
        tags: ["POS"],
        summary: "Down-Sync Perubahan Data Delta",
        description:
          "Mengambil perubahan master obat dan inventori sejak sinkronisasi terakhir"
      }
    }
  );
