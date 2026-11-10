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
import { tenants, branches, inventoryLocations } from "./auth.js";
import { products, productBatches } from "./products.js";

// 9. PENGADAAN & PEMBELIAN PBF
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    legacyIdSupplier: integer("legacy_id_supplier"),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 100 }),
    address: text("address"),
    contactPerson: varchar("contact_person", { length: 100 }),
    paymentTermDays: integer("payment_term_days").default(30).notNull(),
    leadTimeDays: integer("lead_time_days").default(3).notNull(),
    isConsignment: boolean("is_consignment").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_supplier_tenant_code").on(t.tenantId, t.code),
    index("idx_supplier_search").on(t.tenantId, t.name)
  ]
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    poNumber: varchar("po_number", { length: 100 }).notNull(),
    status: varchar("status", { length: 50 }).default("ORDERED").notNull(),
    orderDate: date("order_date").notNull(),
    expectedDeliveryDate: date("expected_delivery_date"),
    totalAmount: numeric("total_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_po_tenant_number").on(t.tenantId, t.poNumber)
  ]
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseOrderId: uuid("purchase_order_id")
      .references(() => purchaseOrders.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    lineNo: integer("line_no").notNull(),
    unitName: varchar("unit_name", { length: 50 }).notNull(),
    qtyOrdered: numeric("qty_ordered", { precision: 24, scale: 8 }).notNull(),
    qtyReceived: numeric("qty_received", { precision: 24, scale: 8 }).default("0").notNull(),
    estimatedPrice: numeric("estimated_price", { precision: 24, scale: 8 }).default("0").notNull(),
    subtotal: numeric("subtotal", { precision: 24, scale: 8 }).default("0").notNull(),
    notes: text("notes")
  },
  (t) => [
    uniqueIndex("uq_po_item_line").on(t.purchaseOrderId, t.lineNo),
    index("idx_po_item_product").on(t.productId)
  ]
);

export const purchaseInvoices = pgTable(
  "purchase_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
    legacyIdPembelian: integer("legacy_id_pembelian"),
    invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(),
    receiveDate: date("receive_date").notNull(),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date").notNull(),
    isCredit: boolean("is_credit").default(true).notNull(),
    subtotal: numeric("subtotal", { precision: 24, scale: 8 }).notNull(),
    discountAmount: numeric("discount_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    taxAmount: numeric("tax_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    grandTotal: numeric("grand_total", { precision: 24, scale: 8 }).notNull(),
    paidAmount: numeric("paid_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    isPaidOff: boolean("is_paid_off").default(false).notNull(),
    invoiceScanUrl: text("invoice_scan_url"),
    receivedBy: uuid("received_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_purchase_invoice_legacy").on(t.tenantId, t.legacyIdPembelian),
    index("idx_supplier_invoice").on(t.tenantId, t.supplierId, t.invoiceNumber),
    index("idx_purchase_due_date").on(t.branchId, t.dueDate, t.isPaidOff)
  ]
);

export const purchaseInvoiceItems = pgTable(
  "purchase_invoice_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .references(() => purchaseInvoices.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    locationId: uuid("location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    batchId: uuid("batch_id").references(() => productBatches.id),
    lineNo: integer("line_no").notNull(),
    unitName: varchar("unit_name", { length: 50 }).notNull(),
    conversionFactor: numeric("conversion_factor", { precision: 24, scale: 8 }).notNull(),
    qty: numeric("qty", { precision: 24, scale: 8 }).notNull(),
    qtyBase: numeric("qty_base", { precision: 24, scale: 8 }).notNull(),
    buyPrice: numeric("buy_price", { precision: 24, scale: 8 }).notNull(),
    discountPercent: numeric("discount_percent", { precision: 24, scale: 8 }).default("0").notNull(),
    discountAmount: numeric("discount_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    subtotal: numeric("subtotal", { precision: 24, scale: 8 }).notNull()
  },
  (t) => [
    uniqueIndex("uq_purchase_line").on(t.invoiceId, t.lineNo)
  ]
);

export const debtPayments = pgTable(
  "debt_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    purchaseInvoiceId: uuid("purchase_invoice_id")
      .references(() => purchaseInvoices.id, { onDelete: "cascade" })
      .notNull(),
    paymentNumber: varchar("payment_number", { length: 100 }).notNull(),
    paymentDate: date("payment_date").notNull(),
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 24, scale: 8 }).notNull(),
    receiptScanUrl: text("receipt_scan_url"),
    paidBy: uuid("paid_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    index("idx_debt_payment_invoice").on(t.purchaseInvoiceId)
  ]
);

// 12. KONSINYASI (CONSIGNMENT)
export const consignmentReceipts = pgTable(
  "consignment_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    locationId: uuid("location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
    receiptNumber: varchar("receipt_number", { length: 100 }).notNull(),
    receiptDate: date("receipt_date").notNull(),
    notes: text("notes"),
    receivedBy: uuid("received_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_consignment_receipt").on(t.tenantId, t.receiptNumber),
    index("idx_consignment_receipt_supplier").on(t.branchId, t.supplierId)
  ]
);

export const consignmentReceiptItems = pgTable(
  "consignment_receipt_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptId: uuid("receipt_id")
      .references(() => consignmentReceipts.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    batchId: uuid("batch_id")
      .references(() => productBatches.id)
      .notNull(),
    lineNo: integer("line_no").notNull(),
    unitName: varchar("unit_name", { length: 50 }).default("PCS").notNull(),
    conversionFactor: numeric("conversion_factor", { precision: 24, scale: 8 }).default("1").notNull(),
    qtyReceived: numeric("qty_received", { precision: 24, scale: 8 }).notNull(),
    qtyBase: numeric("qty_base", { precision: 24, scale: 8 }).default("0").notNull(),
    costPrice: numeric("cost_price", { precision: 24, scale: 8 }).notNull(),
    sellingPrice: numeric("selling_price", { precision: 24, scale: 8 }).default("0").notNull(),
    subtotalCost: numeric("subtotal_cost", { precision: 24, scale: 8 }).notNull()
  },
  (t) => [
    uniqueIndex("uq_consignment_receipt_line").on(t.receiptId, t.lineNo)
  ]
);

export const consignmentSettlements = pgTable(
  "consignment_settlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    locationId: uuid("location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    settlementNumber: varchar("settlement_number", { length: 100 }).notNull(),
    settlementDate: date("settlement_date").notNull(),
    totalSoldAmount: numeric("total_sold_amount", { precision: 24, scale: 8 }).notNull(),
    discountAmount: numeric("discount_amount", { precision: 24, scale: 8 }).default("0").notNull(),
    totalPaidAmount: numeric("total_paid_amount", { precision: 24, scale: 8 }).notNull(),
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
    notes: text("notes"),
    settledBy: uuid("settled_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_consignment_settlement").on(t.tenantId, t.settlementNumber)
  ]
);

export const consignmentSettlementItems = pgTable(
  "consignment_settlement_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    settlementId: uuid("settlement_id")
      .references(() => consignmentSettlements.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    batchId: uuid("batch_id").references(() => productBatches.id),
    lineNo: integer("line_no").notNull(),
    soldQty: numeric("sold_qty", { precision: 24, scale: 8 }).notNull(),
    returnedQty: numeric("returned_qty", { precision: 24, scale: 8 }).default("0").notNull(),
    lostQty: numeric("lost_qty", { precision: 24, scale: 8 }).default("0").notNull(),
    unitCost: numeric("unit_cost", { precision: 24, scale: 8 }).notNull(),
    subtotalPayable: numeric("subtotal_payable", { precision: 24, scale: 8 }).notNull()
  },
  (t) => [
    uniqueIndex("uq_consignment_settlement_line").on(t.settlementId, t.lineNo)
  ]
);

// 13. MUTASI KAS KECIL & OPERASIONAL APOTEK (CASH MUTATIONS)
export const cashMutations = pgTable(
  "cash_mutations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    type: varchar("type", { length: 10 }).notNull(), // 'IN' | 'OUT'
    category: varchar("category", { length: 100 }).notNull(),
    account: varchar("account", { length: 50 }).default("KAS_LACI").notNull(), // 'KAS_LACI' | 'KAS_BRANKAS' | 'BANK_BCA'
    refNumber: varchar("ref_number", { length: 100 }).notNull(),
    amount: numeric("amount", { precision: 24, scale: 8 }).notNull(),
    description: text("description"),
    operator: varchar("operator", { length: 100 }),
    transactionDate: timestamp("transaction_date", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    index("idx_cash_mutation_branch").on(t.branchId, t.transactionDate),
    index("idx_cash_mutation_tenant").on(t.tenantId)
  ]
);
