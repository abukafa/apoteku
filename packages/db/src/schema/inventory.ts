import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  numeric,
  date,
  uniqueIndex,
  index
} from "drizzle-orm/pg-core";
import { tenants, branches, inventoryLocations } from "./auth.js";
import { products, productBatches } from "./products.js";

// 3. INVENTORI BATCH & SALDO CABANG
export const branchStocks = pgTable(
  "branch_stocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    totalQtyBase: numeric("total_qty_base", { precision: 24, scale: 8 }).default("0").notNull(),
    unbatchedQtyBase: numeric("unbatched_qty_base", { precision: 24, scale: 8 }).default("0").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_location_product_stock").on(t.locationId, t.productId)
  ]
);

export const branchBatchStocks = pgTable(
  "branch_batch_stocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    batchId: uuid("batch_id")
      .references(() => productBatches.id, { onDelete: "cascade" })
      .notNull(),
    qtyBase: numeric("qty_base", { precision: 24, scale: 8 }).default("0").notNull(),
    buyPrice: numeric("buy_price", { precision: 24, scale: 8 }).default("0").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_location_product_batch_stock").on(t.locationId, t.productId, t.batchId),
    index("idx_fefo_lookup").on(t.branchId, t.locationId, t.productId, t.qtyBase)
  ]
);

// 4. DOUBLE-ENTRY STOCK LEDGER (AUDIT TRAIL RESMI MUTASI BPOM)
export const stockLedger = pgTable(
  "stock_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id").references(() => inventoryLocations.id),
    batchId: uuid("batch_id").references(() => productBatches.id),
    mutationType: varchar("mutation_type", { length: 50 }).notNull(), // 'POS_SALE' | 'PURCHASE_RECEIPT' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'ADJUSTMENT' | 'DEFICIT_OVERSELL'
    quantityBase: numeric("quantity_base", { precision: 24, scale: 8 }).notNull(),
    costPerUnit: numeric("cost_per_unit", { precision: 24, scale: 8 }).default("0").notNull(),
    referenceId: uuid("reference_id").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    index("idx_stock_ledger_audit").on(t.branchId, t.productId, t.createdAt)
  ]
);

// 10. MUTASI STOK ANTAR-CABANG
export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    transferNumber: varchar("transfer_number", { length: 100 }).notNull(),
    sourceBranchId: uuid("source_branch_id")
      .references(() => branches.id)
      .notNull(),
    destBranchId: uuid("dest_branch_id")
      .references(() => branches.id)
      .notNull(),
    sourceLocationId: uuid("source_location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    destLocationId: uuid("dest_location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    status: varchar("status", { length: 50 }).default("DISPATCHED").notNull(),
    trackingCourier: varchar("tracking_courier", { length: 100 }),
    notes: text("notes"),
    receiptNotes: text("receipt_notes"),
    shippedBy: uuid("shipped_by").notNull(),
    receivedBy: uuid("received_by"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }).defaultNow().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
  },
  (t) => [
    uniqueIndex("uq_transfer_number").on(t.tenantId, t.transferNumber),
    index("idx_transfer_status").on(t.destBranchId, t.status)
  ]
);

export const stockTransferItems = pgTable(
  "stock_transfer_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transferId: uuid("transfer_id")
      .references(() => stockTransfers.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    batchId: uuid("batch_id")
      .references(() => productBatches.id)
      .notNull(),
    lineNo: integer("line_no").notNull(),
    qtySentBase: numeric("qty_sent_base", { precision: 24, scale: 8 }).notNull(),
    qtyReceivedBase: numeric("qty_received_base", { precision: 24, scale: 8 }),
    discrepancyQtyBase: numeric("discrepancy_qty_base", { precision: 24, scale: 8 }).default("0").notNull(),
    discrepancyReason: text("discrepancy_reason"),
    costPerUnit: numeric("cost_per_unit", { precision: 24, scale: 8 }).default("0").notNull()
  },
  (t) => [
    uniqueIndex("uq_transfer_line").on(t.transferId, t.lineNo)
  ]
);

// 11. STOK OPNAME & PENYESUAIAN FISIK
export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id")
      .references(() => inventoryLocations.id)
      .notNull(),
    adjustmentNumber: varchar("adjustment_number", { length: 100 }).notNull(),
    adjustmentDate: date("adjustment_date").notNull(),
    reason: text("reason").notNull(),
    status: varchar("status", { length: 50 }).default("COMMITTED").notNull(),
    performedBy: uuid("performed_by").notNull(),
    approvedBy: uuid("approved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_adjustment_number").on(t.tenantId, t.adjustmentNumber)
  ]
);

export const stockAdjustmentItems = pgTable(
  "stock_adjustment_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adjustmentId: uuid("adjustment_id")
      .references(() => stockAdjustments.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    batchId: uuid("batch_id").references(() => productBatches.id),
    lineNo: integer("line_no").notNull(),
    systemQtyBase: numeric("system_qty_base", { precision: 24, scale: 8 }).notNull(),
    actualQtyBase: numeric("actual_qty_base", { precision: 24, scale: 8 }).notNull(),
    differenceQtyBase: numeric("difference_qty_base", { precision: 24, scale: 8 }).notNull(),
    costPerUnit: numeric("cost_per_unit", { precision: 24, scale: 8 }).default("0").notNull(),
    notes: text("notes")
  },
  (t) => [
    uniqueIndex("uq_adjustment_line").on(t.adjustmentId, t.lineNo)
  ]
);
