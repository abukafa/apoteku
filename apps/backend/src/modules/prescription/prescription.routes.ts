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
    async ({ query, tenantId, branchId }) => {
      try {
        const targetBranch = query.branch_id || branchId;
        const limit = query.limit ? Number(query.limit) : 100;
        const data = await prescriptionService.getPrescriptions(tenantId, targetBranch, limit);
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
        allergyHistory: t.Optional(t.String()),
        initialStatus: t.Optional(t.Union([t.Literal("DRAFT"), t.Literal("VERIFIED")])),
        verifiedByName: t.Optional(t.String()),
        prescriptionImageUrl: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            productId: t.String(),
            productName: t.Optional(t.String()),
            qty: t.Number(),
            conversionFactor: t.Optional(t.Number()),
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
  )

  // 3. VERIFIKASI SKRINING KLINIS RESEP (DRAFT -> VERIFIED)
  .patch(
    "/:id/verify",
    async ({ params, body, tenantId }) => {
      try {
        return await prescriptionService.verifyPrescription(params.id, {
          ...body,
          tenantId
        });
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        adminComplete: t.Optional(t.Boolean()),
        doseVerified: t.Optional(t.Boolean()),
        noInteraction: t.Optional(t.Boolean()),
        allergyHistory: t.Optional(t.String()),
        verifiedByName: t.Optional(t.String())
      }),
      detail: {
        tags: ["Pelayanan Resep"],
        summary: "Verifikasi Skrining Klinis Resep (DRAFT -> VERIFIED)"
      }
    }
  )

  // 4. SERAHKAN OBAT & SIMPAN DOKUMENTASI PIO (VERIFIED -> DISPENSED)
  .post(
    "/:id/dispense",
    async ({ params, body, tenantId }) => {
      try {
        return await prescriptionService.dispensePrescription(params.id, {
          ...body,
          tenantId
        });
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        allergyNote: t.Optional(t.String()),
        pioPoints: t.String(),
        pharmacistName: t.String(),
        drugSummary: t.Optional(t.String()),
        signa: t.Optional(t.String())
      }),
      detail: {
        tags: ["Pelayanan Resep"],
        summary: "Selesaikan Resep & Simpan Log PIO Konseling Pasien"
      }
    }
  )

  // 5. DAFTAR LOG PIO & KONSELING
  .get(
    "/counselings",
    async ({ query, tenantId, branchId }) => {
      try {
        const targetBranch = query.branch_id || branchId;
        const limit = query.limit ? Number(query.limit) : 100;
        const data = await prescriptionService.getCounselings(tenantId, targetBranch, limit);
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
        summary: "Log Pelayanan Informasi Obat (PIO) & Konseling Pasien"
      }
    }
  )

  // 6. DAFTAR DOKTER PERUJUK
  .get(
    "/doctors",
    async ({ tenantId }) => {
      try {
        const data = await prescriptionService.getDoctors(tenantId);
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      detail: {
        tags: ["Pelayanan Resep"],
        summary: "Daftar Dokter Perujuk dari Database"
      }
    }
  )

  // 7. TAMBAH DOKTER PERUJUK BARU
  .post(
    "/doctors",
    async ({ body, tenantId }) => {
      try {
        return await prescriptionService.createDoctor({
          ...body,
          tenantId
        });
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        name: t.String(),
        sip: t.Optional(t.String()),
        specialization: t.Optional(t.String()),
        hospital: t.Optional(t.String()),
        phone: t.Optional(t.String())
      }),
      detail: {
        tags: ["Pelayanan Resep"],
        summary: "Simpan Dokter Perujuk Baru ke Database"
      }
    }
  );
