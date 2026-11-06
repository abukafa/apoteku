import { Elysia, t } from "elysia";
import { prescriptionService } from "./prescription.service.js";

export const prescriptionRoutes = new Elysia({ prefix: "/api/prescriptions" })
  .derive(({ headers }) => {
    const tenantId = (headers["x-tenant-id"] as string) || undefined;
    const branchId = (headers["x-branch-id"] as string) || undefined;
    return { tenantId, branchId };
  })
  // 1. GET ALL PRESCRIPTIONS
  .get(
    "",
    async ({ query, branchId }) => {
      try {
        const targetBranch = query.branch_id || branchId;
        const limit = query.limit ? Number(query.limit) : 50;
        const data = await prescriptionService.getPrescriptions(targetBranch, limit);
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
        tags: ["Pelayanan Resep"],
        summary: "Daftar Resep Dokter & Racikan"
      }
    }
  )

  // 2. CREATE NEW PRESCRIPTION (RACIKAN / NON-RACIKAN)
  .post(
    "",
    async ({ body, tenantId, branchId }) => {
      try {
        const targetBranch = body.branchId || branchId;
        const res = await prescriptionService.createPrescription({
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
        doctorName: t.String(),
        patientName: t.String(),
        type: t.Union([t.Literal("RACIKAN"), t.Literal("NON_RACIKAN")]),
        compoundForm: t.Optional(t.String()),
        compoundQty: t.Optional(t.Number()),
        etiketType: t.Optional(t.Union([t.Literal("PUTIH"), t.Literal("BIRU")])),
        signa: t.String(),
        instruction: t.Optional(t.String()),
        budDate: t.Optional(t.String()),
        tuslah: t.Optional(t.Number()),
        embalase: t.Optional(t.Number()),
        notes: t.Optional(t.String()),
        prescriptionImageUrl: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            productId: t.String(),
            productName: t.Optional(t.String()),
            qty: t.Number(),
            unit: t.Optional(t.String()),
            unitPrice: t.Number(),
            dosageNote: t.Optional(t.String())
          })
        )
      }),
      detail: {
        tags: ["Pelayanan Resep"],
        summary: "Simpan Resep Dokter & Komposisi Racikan ke Database"
      }
    }
  );
