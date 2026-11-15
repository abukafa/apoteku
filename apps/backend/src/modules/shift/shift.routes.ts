import { Elysia, t } from "elysia";
import { shiftService } from "./shift.service.js";

export const shiftRoutes = new Elysia({ prefix: "/api/shifts" })
  .derive(({ headers }) => {
    const tenantId = (headers["x-tenant-id"] as string) || undefined;
    const branchId = (headers["x-branch-id"] as string) || undefined;
    const userId = (headers["x-user-id"] as string) || undefined;
    return { tenantId, branchId, userId };
  })
  // 1. GET ALL SHIFTS WITH FILTERS
  .get(
    "",
    async ({ query, branchId }) => {
      try {
        const targetBranch = query.branch_id || (query as any).branchId || branchId;
        const status = query.status as "ALL" | "OPEN" | "CLOSED" | undefined;
        const limit = query.limit ? Number(query.limit) : 50;
        const data = await shiftService.getShifts({
          branchId: targetBranch,
          status,
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
        branchId: t.Optional(t.String()),
        status: t.Optional(t.Union([t.Literal("ALL"), t.Literal("OPEN"), t.Literal("CLOSED")])),
        limit: t.Optional(t.Numeric())
      }),
      detail: {
        tags: ["Shift"],
        summary: "Daftar Riwayat Shift Kasir"
      }
    }
  )

  // 2. GET CURRENT ACTIVE SHIFT
  .get(
    "/current",
    async ({ query, branchId, tenantId }) => {
      try {
        const targetBranch = query.branch_id || (query as any).branchId || branchId;
        if (!targetBranch) {
          return { success: false, error: "branch_id is required" };
        }
        const data = await shiftService.getCurrentShift(targetBranch, tenantId);
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      query: t.Object({
        branch_id: t.Optional(t.String()),
        branchId: t.Optional(t.String())
      }),
      detail: {
        tags: ["Shift"],
        summary: "Ambil Shift Kasir yang Sedang Terbuka"
      }
    }
  )

  // 3. OPEN NEW SHIFT
  .post(
    "/open",
    async ({ body, tenantId, branchId, userId }) => {
      try {
        const targetBranch = body.branchId || branchId;
        if (!targetBranch) {
          return { success: false, error: "branchId is required" };
        }
        const res = await shiftService.openShift({
          tenantId,
          branchId: targetBranch,
          userId: body.userId || userId,
          initialCash: Number(body.initialCash || 0),
          shiftNumber: body.shiftNumber,
          notes: body.notes
        });
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        branchId: t.Optional(t.String()),
        userId: t.Optional(t.String()),
        initialCash: t.Number({ minimum: 0 }),
        shiftNumber: t.Optional(t.Number()),
        notes: t.Optional(t.String())
      }),
      detail: {
        tags: ["Shift"],
        summary: "Buka Shift Kasir Baru (Input Modal Awal)"
      }
    }
  )

  // 4. CLOSE SHIFT (RECONCILIATION)
  .post(
    "/close",
    async ({ body }) => {
      try {
        const res = await shiftService.closeShift({
          shiftId: body.shiftId,
          actualCash: Number(body.actualCash || 0),
          notes: body.notes
        });
        return res;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        shiftId: t.String(),
        actualCash: t.Number({ minimum: 0 }),
        notes: t.Optional(t.String())
      }),
      detail: {
        tags: ["Shift"],
        summary: "Tutup Shift Kasir & Rekonsiliasi Kas Fisik vs Sistem"
      }
    }
  );
