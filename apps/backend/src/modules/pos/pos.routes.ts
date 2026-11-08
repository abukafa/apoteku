import { Elysia } from "elysia";
import { posService } from "./pos.service.js";
import {
  BootstrapQuerySchema,
  SyncSalesBodySchema,
  DeltaSyncQuerySchema,
  OpenShiftBodySchema,
  CloseShiftBodySchema,
  ActiveShiftQuerySchema
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
  )
  .get(
    "/shifts/active",
    async ({ tenant, query }) => {
      const targetBranchId = query.branch_id || tenant.branchId;
      return await posService.getActiveShift(tenant.tenantId, targetBranchId);
    },
    {
      query: ActiveShiftQuerySchema,
      detail: {
        tags: ["POS"],
        summary: "Ambil Shift Kasir Aktif & Rekapitulasi Kas",
        description:
          "Menghitung omzet tunai dan non-tunai pada shift kasir yang sedang berjalan"
      }
    }
  )
  .post(
    "/shifts/open",
    async ({ tenant, body }) => {
      return await posService.openShift(
        tenant.tenantId,
        body.branchId,
        tenant.userId,
        body.initialCash,
        body.shiftNumber || 1,
        body.notes
      );
    },
    {
      body: OpenShiftBodySchema,
      detail: {
        tags: ["POS"],
        summary: "Buka Shift Kasir Baru",
        description: "Mencatat modal awal laci kasir dan memulai sesi transaksi"
      }
    }
  )
  .post(
    "/shifts/:id/close",
    async ({ tenant, params, body }) => {
      return await posService.closeShift(
        tenant.tenantId,
        params.id,
        body.actualCash,
        body.notes
      );
    },
    {
      body: CloseShiftBodySchema,
      detail: {
        tags: ["POS"],
        summary: "Tutup Shift Kasir & Rekonsiliasi Kas Laci",
        description:
          "Mencatat fisik uang kasir, menghitung selisih kas (discrepancy), dan menutup shift"
      }
    }
  );
