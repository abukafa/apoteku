import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { tenants, branches, users } from "./auth.js";

// 1. NOTIFICATIONS TABLE
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    branchId: uuid("branch_id").references(() => branches.id, {
      onDelete: "set null"
    }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade"
    }), // null jika broadcast
    targetRole: varchar("target_role", { length: 50 }), // 'ALL' | 'OWNER' | 'PHARMACIST' | 'CASHIER' | 'INVENTORY' | 'SUPERADMIN'

    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    category: varchar("category", { length: 50 }).notNull(), // 'INVENTORY' | 'PROCUREMENT' | 'FINANCE' | 'SHIFT' | 'COMPLIANCE' | 'SYSTEM'
    type: varchar("type", { length: 50 }).notNull(), // 'LOW_STOCK' | 'EXPIRY_ALERT' | 'PURCHASE_DUE' | 'RECEIVABLE_DUE' | 'TRANSFER_IN' | 'SHIFT_DISCREPANCY' | 'SIPNAP_DUE' | 'SYSTEM'
    severity: varchar("severity", { length: 20 }).default("INFO").notNull(), // 'INFO' | 'WARNING' | 'DANGER' | 'SUCCESS'
    actionUrl: varchar("action_url", { length: 255 }), // e.g. '/stok?filter=kritis', '/pembelian?tab=faktur'
    metadata: jsonb("metadata"), // detail referensi (misal: batchNo, productId, invoiceNumber)

    isRead: boolean("is_read").default(false).notNull(), // digunakan bila userId spesifik
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    index("idx_notif_tenant_user").on(t.tenantId, t.userId, t.isRead),
    index("idx_notif_tenant_role").on(t.tenantId, t.targetRole),
    index("idx_notif_branch_created").on(t.branchId, t.createdAt),
    index("idx_notif_category_type").on(t.category, t.type)
  ]
);

// 2. NOTIFICATION READS TABLE (Per-user read tracking untuk notifikasi broadcast)
export const notificationReads = pgTable(
  "notification_reads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notificationId: uuid("notification_id")
      .references(() => notifications.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("uq_notif_user_read").on(t.notificationId, t.userId),
    index("idx_notif_read_user").on(t.userId)
  ]
);
