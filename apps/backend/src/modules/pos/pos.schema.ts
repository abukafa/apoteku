import { t } from "elysia";

export const BootstrapQuerySchema = t.Object({
  branch_id: t.Optional(t.String({ description: "Target Branch UUID" }))
});

export const SyncSalesBodySchema = t.Object({
  branchId: t.String(),
  cashierShiftId: t.Nullable(t.String()),
  transactions: t.Array(
    t.Object({
      id: t.String({ description: "Offline Client Transaction UUIDv7" }),
      invoiceNo: t.String(),
      cashierUserId: t.Nullable(t.String()),
      customerType: t.Union([
        t.Literal("UMUM"),
        t.Literal("RESEP"),
        t.Literal("GROSIR"),
        t.Literal("MEMBER"),
        t.Literal("DELIVERY")
      ]),
      customerId: t.Nullable(t.String()),
      patientName: t.Nullable(t.String()),
      doctorName: t.Nullable(t.String()),
      paymentMethod: t.Union([
        t.Literal("CASH"),
        t.Literal("QRIS"),
        t.Literal("EDC_DEBIT"),
        t.Literal("EDC_CREDIT"),
        t.Literal("TRANSFER"),
        t.Literal("TEMPO")
      ]),
      subtotal: t.Number(),
      discountPercent: t.Number(),
      discountAmount: t.Number(),
      taxPercent: t.Number(),
      taxAmount: t.Number(),
      tuslahAmount: t.Number(),
      embalaseAmount: t.Number(),
      grandTotal: t.Number(),
      paidAmount: t.Number(),
      changeAmount: t.Number(),
      createdAt: t.String(),
      items: t.Array(
        t.Object({
          id: t.String({ description: "Transaction Item UUIDv7" }),
          productId: t.String(),
          batchId: t.Nullable(t.String()),
          locationId: t.Nullable(t.String()),
          unitName: t.String(),
          conversionFactor: t.Number(),
          qty: t.Number(),
          qtyBase: t.Number(),
          unitPrice: t.Number(),
          discountPercent: t.Number(),
          discountAmount: t.Number(),
          subtotal: t.Number(),
          dosageRules: t.Nullable(t.String())
        })
      )
    })
  )
});

export const DeltaSyncQuerySchema = t.Object({
  branch_id: t.Optional(t.String()),
  since: t.Optional(t.String())
});

export const OpenShiftBodySchema = t.Object({
  branchId: t.String({ description: "Branch UUID" }),
  initialCash: t.Number({ description: "Modal awal laci kasir" }),
  shiftNumber: t.Optional(t.Number({ description: "Nomor shift (1=Pagi, 2=Siang, 3=Malam)" })),
  notes: t.Optional(t.String({ description: "Catatan serah terima kasir" }))
});

export const CloseShiftBodySchema = t.Object({
  actualCash: t.Number({ description: "Hitungan fisik uang tunai di laci" }),
  notes: t.Optional(t.String({ description: "Catatan penutupan / penjelasan selisih kas" }))
});

export const ActiveShiftQuerySchema = t.Object({
  branch_id: t.Optional(t.String())
});
