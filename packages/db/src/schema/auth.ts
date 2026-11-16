import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  uniqueIndex,
  index
} from "drizzle-orm/pg-core";

// 1. TENANTS & CABANG
export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  legalName: varchar("legal_name", { length: 255 }),
  tagline: varchar("tagline", { length: 255 }),
  logoUrl: text("logo_url"),

  // Data Apoteker & Legal Perizinan
  pharmacistName: varchar("pharmacist_name", { length: 255 }),
  responsiblePerson: varchar("responsible_person", { length: 255 }),
  sipaNumber: varchar("sipa_number", { length: 100 }),
  sipaExpiry: varchar("sipa_expiry", { length: 50 }),
  siaNumber: varchar("sia_number", { length: 100 }),
  nib: varchar("nib", { length: 100 }),
  npwp: varchar("npwp", { length: 50 }),

  // Kontak & Lokasi Domisili
  address: text("address"),
  city: varchar("city", { length: 100 }),
  province: varchar("province", { length: 100 }),
  postalCode: varchar("postal_code", { length: 20 }),
  phone: varchar("phone", { length: 50 }),
  whatsapp: varchar("whatsapp", { length: 50 }),
  email: varchar("email", { length: 100 }),
  website: varchar("website", { length: 100 }),

  // Rekening Bank
  bankName: varchar("bank_name", { length: 100 }),
  bankAccountNumber: varchar("bank_account_number", { length: 100 }),
  bankAccountHolder: varchar("bank_account_holder", { length: 255 }),
  bankAccounts: text("bank_accounts"),

  // Percetakan Dokumen & Legalitas Cetak
  signatureUrl: text("signature_url"),
  stampUrl: text("stamp_url"),
  receiptHeader: text("receipt_header"),
  receiptFooter: text("receipt_footer"),

  taxPercent: numeric("tax_percent", { precision: 5, scale: 2 }).default("11.00").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    address: text("address"),
    phone: varchar("phone", { length: 50 }),
    receiptHeader: text("receipt_header"),
    receiptFooter: text("receipt_footer"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_branch_tenant_code").on(t.tenantId, t.code)
  ]
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "set null" }),
    username: varchar("username", { length: 100 }).notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    role: varchar("role", { length: 50 }).notNull(), // 'SUPERADMIN' | 'OWNER' | 'PHARMACIST' | 'CASHIER' | 'INVENTORY' | 'FINANCE'
    pin: varchar("pin", { length: 20 }),
    passwordHash: text("password_hash"),
    avatarUrl: text("avatar_url"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_user_tenant_username").on(t.tenantId, t.username),
    index("idx_user_branch").on(t.branchId)
  ]
);

export const inventoryLocations = pgTable(
  "inventory_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull()
  },
  (t) => [
    uniqueIndex("uq_location_branch_code").on(t.branchId, t.code)
  ]
);

export const legacyIdMap = pgTable(
  "legacy_id_map",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    sourceDatabase: varchar("source_database", { length: 255 }).notNull(),
    sourceTable: varchar("source_table", { length: 100 }).notNull(),
    legacyKey: varchar("legacy_key", { length: 255 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: uuid("entity_id").notNull()
  },
  (t) => [
    uniqueIndex("uq_legacy_source_key").on(
      t.tenantId,
      t.sourceDatabase,
      t.sourceTable,
      t.legacyKey
    ),
    index("idx_legacy_entity").on(
      t.tenantId,
      t.entityType,
      t.entityId
    )
  ]
);

export const cashierShifts = pgTable(
  "cashier_shifts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id").notNull(),
    shiftNumber: integer("shift_number").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).defaultNow().notNull(),
    endTime: timestamp("end_time", { withTimezone: true }),
    initialCash: numeric("initial_cash", { precision: 24, scale: 8 }).notNull(),
    expectedCash: numeric("expected_cash", { precision: 24, scale: 8 }).default("0").notNull(),
    actualCash: numeric("actual_cash", { precision: 24, scale: 8 }).default("0").notNull(),
    cashDifference: numeric("cash_difference", { precision: 24, scale: 8 }).default("0").notNull(),
    totalNonCash: numeric("total_non_cash", { precision: 24, scale: 8 }).default("0").notNull(),
    totalSales: numeric("total_sales", { precision: 24, scale: 8 }).default("0").notNull(),
    notes: text("notes"),
    isOpen: boolean("is_open").default(true).notNull()
  },
  (t) => [
    index("idx_shift_branch_date").on(t.branchId, t.startTime)
  ]
);
