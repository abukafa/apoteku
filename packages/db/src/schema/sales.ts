import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  date,
  uniqueIndex,
  index
} from "drizzle-orm/pg-core";
import { tenants, branches, inventoryLocations, cashierShifts } from "./auth.js";
import { products, productBatches } from "./products.js";

// 5. PELANGGAN, PASIEN & MEMBER
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    legacyIdPelanggan: integer("legacy_id_pelanggan"),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    customerType: varchar("customer_type", { length: 50 }).default("UMUM").notNull(),
    gender: varchar("gender", { length: 10 }),
    birthDate: date("birth_date"),
    phone: varchar("phone", { length: 50 }),
    address: text("address"),
    pointBalance: integer("point_balance").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_customer_tenant_code").on(t.tenantId, t.code),
    index("idx_customer_search").on(t.tenantId, t.name, t.phone)
  ]
);

// 7. TRANSAKSI PENJUALAN KASIR
export const salesTransactions = pgTable(
  "sales_transactions",
  {
    id: uuid("id").primaryKey(), // Generated as UUIDv7 on client/server
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    legacyIdPenjualan: integer("legacy_id_penjualan"),
    cashierShiftId: uuid("cashier_shift_id").references(() => cashierShifts.id),
    invoiceNo: varchar("invoice_no", { length: 100 }).notNull(),
    cashierUserId: uuid("cashier_user_id"),
    customerId: uuid("customer_id").references(() => customers.id),
    customerType: varchar("customer_type", { length: 50 }).default("UMUM").notNull(),
    patientName: varchar("patient_name", { length: 255 }),
    doctorName: varchar("doctor_name", { length: 255 }),
    prescriptionImageUrl: text("prescription_image_url"),
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
    subtotal: numeric("subtotal", { precision: 24, scale: 8 }).notNull(),
    discountPercent: numeric("discount_percent", { precision: 24, scale: 8 }).default("0").notNull(),
    discountAmount: numeric("discount_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    taxPercent: numeric("tax_percent", { precision: 24, scale: 8 }).default("0").notNull(),
    taxAmount: numeric("tax_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    tuslahAmount: numeric("tuslah_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    embalaseAmount: numeric("embalase_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    grandTotal: numeric("grand_total", { precision: 24, scale: 8 }).notNull(),
    paidAmount: numeric("paid_amount", { precision: 24, scale: 8 }).notNull(),
    changeAmount: numeric("change_amount", { precision: 24, scale: 8 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_sales_invoice").on(t.tenantId, t.invoiceNo),
    uniqueIndex("uq_sales_legacy").on(t.tenantId, t.legacyIdPenjualan),
    index("idx_sales_created").on(t.branchId, t.createdAt)
  ]
);

export const salesTransactionItems = pgTable(
  "sales_transaction_items",
  {
    id: uuid("id").primaryKey(),
    transactionId: uuid("transaction_id")
      .references(() => salesTransactions.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    lineNo: integer("line_no").notNull(),
    locationId: uuid("location_id").references(() => inventoryLocations.id),
    batchId: uuid("batch_id").references(() => productBatches.id),
    unitName: varchar("unit_name", { length: 50 }).notNull(),
    conversionFactor: numeric("conversion_factor", { precision: 24, scale: 8 }).notNull(),
    qty: numeric("qty", { precision: 24, scale: 8 }).notNull(),
    qtyBase: numeric("qty_base", { precision: 24, scale: 8 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 24, scale: 8 }).notNull(),
    discountPercent: numeric("discount_percent", { precision: 24, scale: 8 }).default("0").notNull(),
    discountAmount: numeric("discount_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    subtotal: numeric("subtotal", { precision: 24, scale: 8 }).notNull(),
    dosageRules: text("dosage_rules")
  },
  (t) => [
    uniqueIndex("uq_sales_transaction_line").on(t.transactionId, t.lineNo)
  ]
);

// 8. RESEP RACIKAN & KOMPOSISI BAHAN
export const salesCompounds = pgTable(
  "sales_compounds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    transactionId: uuid("transaction_id")
      .references(() => salesTransactions.id, { onDelete: "cascade" })
      .notNull(),
    compoundName: varchar("compound_name", { length: 255 }).notNull(),
    dosageForm: varchar("dosage_form", { length: 50 }).default("PUYER").notNull(),
    quantity: numeric("quantity", { precision: 24, scale: 8 }).notNull(),
    tuslahAmount: numeric("tuslah_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    embalaseAmount: numeric("embalase_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    subtotal: numeric("subtotal", { precision: 24, scale: 8 }).notNull(),
    dosageRules: text("dosage_rules")
  },
  (t) => [
    index("idx_compound_trx").on(t.transactionId)
  ]
);

export const salesCompoundItems = pgTable(
  "sales_compound_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    compoundId: uuid("compound_id")
      .references(() => salesCompounds.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    locationId: uuid("location_id").references(() => inventoryLocations.id),
    batchId: uuid("batch_id").references(() => productBatches.id),
    lineNo: integer("line_no").notNull(),
    qtyBase: numeric("qty_base", { precision: 24, scale: 8 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 24, scale: 8 }).notNull(),
    costPrice: numeric("cost_price", { precision: 24, scale: 8 }).default("0").notNull(),
    subtotal: numeric("subtotal", { precision: 24, scale: 8 }).notNull()
  },
  (t) => [
    uniqueIndex("uq_compound_item_line").on(t.compoundId, t.lineNo),
    index("idx_compound_product").on(t.compoundId, t.productId)
  ]
);
