import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  uniqueIndex,
  index
} from "drizzle-orm/pg-core";
import { tenants, branches } from "./auth.js";
import { salesTransactions } from "./sales.js";

// DOKTER PERUJUK / PENULIS RESEP
export const doctors = pgTable(
  "doctors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    sip: varchar("sip", { length: 120 }),
    specialization: varchar("specialization", { length: 150 }),
    hospital: varchar("hospital", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [index("idx_doctors_tenant_name").on(t.tenantId, t.name)]
);

// STATUS WORKFLOW KLINIS, SKRINING & ETIKET RESEP
export const prescriptionProfiles = pgTable(
  "prescription_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    transactionId: uuid("transaction_id")
      .references(() => salesTransactions.id, { onDelete: "cascade" })
      .notNull(),
    prescriptionType: varchar("prescription_type", { length: 30 }).default("NON_RACIKAN").notNull(),
    compoundForm: varchar("compound_form", { length: 50 }),
    compoundQty: integer("compound_qty"),
    etiketType: varchar("etiket_type", { length: 20 }).default("PUTIH").notNull(),
    signa: text("signa"),
    instruction: text("instruction"),
    budDate: varchar("bud_date", { length: 50 }),
    notes: text("notes"),
    status: varchar("status", { length: 30 }).default("DRAFT").notNull(),
    adminComplete: boolean("admin_complete").default(false).notNull(),
    doseVerified: boolean("dose_verified").default(false).notNull(),
    noInteraction: boolean("no_interaction").default(false).notNull(),
    allergyHistory: text("allergy_history"),
    verifiedByName: varchar("verified_by_name", { length: 255 }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    dispensedAt: timestamp("dispensed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_prescription_profile_trx").on(t.transactionId),
    index("idx_prescription_profile_status").on(t.tenantId, t.status)
  ]
);

// LOG PELAYANAN INFORMASI OBAT (PIO) & KONSELING PASIEN
export const prescriptionCounselings = pgTable(
  "prescription_counselings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" })
      .notNull(),
    transactionId: uuid("transaction_id").references(() => salesTransactions.id, {
      onDelete: "cascade"
    }),
    recipeNumber: varchar("recipe_number", { length: 100 }).notNull(),
    patientName: varchar("patient_name", { length: 255 }).notNull(),
    doctorName: varchar("doctor_name", { length: 255 }),
    drugSummary: text("drug_summary").notNull(),
    signa: text("signa"),
    allergyNote: text("allergy_note"),
    pioPoints: text("pio_points").notNull(),
    pharmacistName: varchar("pharmacist_name", { length: 255 }).notNull(),
    counseledAt: timestamp("counseled_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    index("idx_counselings_branch_time").on(t.branchId, t.counseledAt),
    index("idx_counselings_trx").on(t.transactionId)
  ]
);

