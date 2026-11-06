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
import { tenants } from "./auth.js";

// 2. MASTER PRODUK & MULTI-SATUAN
export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    legacyIdBarang: integer("legacy_id_barang"),
    sku: varchar("sku", { length: 50 }).notNull(),
    barcode: varchar("barcode", { length: 100 }),
    name: varchar("name", { length: 255 }).notNull(),
    activeSubstance: text("active_substance"),
    dosageForm: varchar("dosage_form", { length: 100 }),
    defaultDosage: text("default_dosage"),
    indications: text("indications"),
    sideEffects: text("side_effects"),
    rackLocation: varchar("rack_location", { length: 50 }),
    drugClass: varchar("drug_class", { length: 50 }).default("BEBAS").notNull(),
    baseUnit: varchar("base_unit", { length: 50 }).notNull(),
    minStock: numeric("min_stock", { precision: 24, scale: 8 }).default("0").notNull(),
    isConsignment: boolean("is_consignment").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_product_tenant_sku").on(t.tenantId, t.sku),
    index("idx_products_search").on(t.tenantId, t.name, t.barcode),
    index("idx_products_substance").on(t.tenantId, t.activeSubstance),
    index("idx_products_rack").on(t.tenantId, t.rackLocation)
  ]
);

export const productUnits = pgTable(
  "product_units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    unitName: varchar("unit_name", { length: 50 }).notNull(),
    conversionFactor: numeric("conversion_factor", { precision: 24, scale: 8 }).notNull(),
    salePriceGeneral: numeric("sale_price_general", { precision: 24, scale: 8 }).default("0").notNull(),
    salePriceResep: numeric("sale_price_resep", { precision: 24, scale: 8 }).default("0").notNull(),
    salePriceGrosir: numeric("sale_price_grosir", { precision: 24, scale: 8 }).default("0").notNull(),
    salePriceDelivery: numeric("sale_price_delivery", { precision: 24, scale: 8 }).default("0").notNull(),
    salePriceMember: numeric("sale_price_member", { precision: 24, scale: 8 }).default("0").notNull(),
    isBaseUnit: boolean("is_base_unit").default(false).notNull()
  },
  (t) => [
    uniqueIndex("uq_product_unit").on(t.productId, t.unitName)
  ]
);

export const productBatches = pgTable(
  "product_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    legacyIdFastbatch: integer("legacy_id_fastbatch"),
    batchNo: varchar("batch_no", { length: 100 }),
    expiredDate: date("expired_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_product_batch").on(
      t.tenantId,
      t.productId,
      t.batchNo,
      t.expiredDate
    ),
    index("idx_product_legacy_fastbatch").on(
      t.tenantId,
      t.legacyIdFastbatch
    )
  ]
);
