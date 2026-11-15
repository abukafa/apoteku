import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  numeric,
  index
} from "drizzle-orm/pg-core";
import { tenants, branches, cashierShifts } from "./auth.js";
import { products } from "./products.js";

// 1. RETUR PENJUALAN PASIEN / KONSUMEN (CUSTOMER RETURNS)
export const customerReturns = pgTable(
  "customer_returns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    returnNumber: varchar("return_number", { length: 100 }).notNull(),
    originalTrx: varchar("original_trx", { length: 100 }).default("PJ-UMUM").notNull(),
    customerName: varchar("customer_name", { length: 255 }).notNull(),
    productId: uuid("product_id").references(() => products.id),
    productName: varchar("product_name", { length: 255 }).notNull(),
    batchNo: varchar("batch_no", { length: 100 }),
    qty: numeric("qty", { precision: 24, scale: 8 }).notNull(),
    unit: varchar("unit", { length: 50 }).default("STRIP").notNull(),
    refundAmount: numeric("refund_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    stockDisposition: varchar("stock_disposition", { length: 50 }).default("KARANTINA").notNull(), // 'LAYAK_JUAL' | 'KARANTINA'
    compensationType: varchar("compensation_type", { length: 50 }).default("REFUND_TUNAI").notNull(), // 'REFUND_TUNAI' | 'TUKAR_BARANG'
    reason: text("reason"),
    status: varchar("status", { length: 50 }).default("APPROVED").notNull(), // 'PENDING' | 'APPROVED'
    cashier: varchar("cashier", { length: 255 }),
    cashierShiftId: uuid("cashier_shift_id").references(() => cashierShifts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    index("idx_customer_returns_branch").on(t.branchId, t.createdAt),
    index("idx_customer_returns_trx").on(t.originalTrx)
  ]
);

// 2. RETUR PEMBELIAN KE DISTRIBUTOR PBF (SUPPLIER RETURNS)
export const supplierReturns = pgTable(
  "supplier_returns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    returnNumber: varchar("return_number", { length: 100 }).notNull(),
    invoiceRef: varchar("invoice_ref", { length: 100 }).default("FP-PBF").notNull(),
    supplierName: varchar("supplier_name", { length: 255 }).notNull(),
    productId: uuid("product_id").references(() => products.id),
    productName: varchar("product_name", { length: 255 }).notNull(),
    batchNo: varchar("batch_no", { length: 100 }),
    qty: numeric("qty", { precision: 24, scale: 8 }).notNull(),
    unit: varchar("unit", { length: 50 }).default("BOX").notNull(),
    totalValue: numeric("total_value", { precision: 24, scale: 8 }).default("0").notNull(),
    settlementType: varchar("settlement_type", { length: 50 }).default("NOTA_KREDIT").notNull(), // 'NOTA_KREDIT' | 'TUKAR_BATCH'
    creditNoteNo: varchar("credit_note_no", { length: 100 }),
    reason: text("reason"),
    status: varchar("status", { length: 50 }).default("SENT_TO_SUPPLIER").notNull(), // 'QUARANTINED' | 'SENT_TO_SUPPLIER' | 'RESOLVED'
    pic: varchar("pic", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    index("idx_supplier_returns_branch").on(t.branchId, t.createdAt),
    index("idx_supplier_returns_inv").on(t.invoiceRef)
  ]
);
