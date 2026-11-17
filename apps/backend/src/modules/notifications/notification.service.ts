import { db, schema } from "@apoteku/db/client";
import { eq, and, or, sql, desc, inArray, isNull, count } from "drizzle-orm";

export interface ListNotificationsParams {
  tenantId?: string;
  branchId?: string;
  userId?: string;
  role?: string;
  limit?: number;
  onlyUnread?: boolean;
  category?: string;
}

export const notificationService = {
  /**
   * Mengambil daftar notifikasi untuk pengguna tertentu (personal + broadcast role/cabang)
   */
  async listNotifications(params: ListNotificationsParams) {
    const {
      tenantId: rawTenantId,
      branchId: rawBranchId,
      userId,
      role = "ALL",
      limit = 30,
      onlyUnread = false,
      category
    } = params;

    // Resolve default tenant/branch jika belum ada di header
    let targetTenantId = rawTenantId;
    if (!targetTenantId) {
      const [firstTenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      targetTenantId = firstTenant?.id;
    }

    if (!targetTenantId) {
      return { notifications: [], unreadCount: 0 };
    }

    // Resolve branch
    let targetBranchId = rawBranchId;
    if (!targetBranchId && userId) {
      const [userRow] = await db
        .select({ branchId: schema.users.branchId })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (userRow?.branchId) targetBranchId = userRow.branchId;
    }

    // Build conditions for matching target audience:
    // 1. Direct to this user: userId = params.userId
    // 2. OR Broadcast: userId IS NULL AND (branchId IS NULL OR branchId = targetBranchId)
    //    AND (targetRole IS NULL OR targetRole = 'ALL' OR targetRole = role)
    const isSuperOrOwner = role === "SUPERADMIN" || role === "OWNER";
    const audienceConditions = [
      userId ? eq(schema.notifications.userId, userId) : sql`FALSE`,
      and(
        isNull(schema.notifications.userId),
        targetBranchId && !isSuperOrOwner
          ? or(isNull(schema.notifications.branchId), eq(schema.notifications.branchId, targetBranchId))
          : sql`TRUE`,
        role && !isSuperOrOwner
          ? or(
              isNull(schema.notifications.targetRole),
              eq(schema.notifications.targetRole, "ALL"),
              eq(schema.notifications.targetRole, role)
            )
          : sql`TRUE`
      )
    ];

    const whereConditions = [
      eq(schema.notifications.tenantId, targetTenantId),
      or(...audienceConditions)
    ];

    if (category && category !== "ALL") {
      whereConditions.push(eq(schema.notifications.category, category));
    }

    // Query notifications with left join on notification_reads to check per-user read status
    const rows = await db
      .select({
        id: schema.notifications.id,
        tenantId: schema.notifications.tenantId,
        branchId: schema.notifications.branchId,
        userId: schema.notifications.userId,
        targetRole: schema.notifications.targetRole,
        title: schema.notifications.title,
        message: schema.notifications.message,
        category: schema.notifications.category,
        type: schema.notifications.type,
        severity: schema.notifications.severity,
        actionUrl: schema.notifications.actionUrl,
        metadata: schema.notifications.metadata,
        isReadDirect: schema.notifications.isRead,
        readAtDirect: schema.notifications.readAt,
        hasReadReceipt: sql<boolean>`CASE WHEN ${schema.notificationReads.id} IS NOT NULL THEN TRUE ELSE FALSE END`,
        receiptReadAt: schema.notificationReads.readAt,
        createdAt: schema.notifications.createdAt
      })
      .from(schema.notifications)
      .leftJoin(
        schema.notificationReads,
        and(
          eq(schema.notificationReads.notificationId, schema.notifications.id),
          userId ? eq(schema.notificationReads.userId, userId) : sql`FALSE`
        )
      )
      .where(and(...whereConditions))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit);

    // Map to normalized notification items
    const formatted = rows.map((r) => {
      const isRead = r.userId ? r.isReadDirect : r.hasReadReceipt;
      const readAt = r.userId ? r.readAtDirect : (r.hasReadReceipt ? r.receiptReadAt : null);
      return {
        id: r.id,
        tenantId: r.tenantId,
        branchId: r.branchId,
        title: r.title,
        message: r.message,
        category: r.category,
        type: r.type,
        severity: r.severity,
        actionUrl: r.actionUrl || "/",
        metadata: r.metadata,
        unread: !isRead,
        readAt: readAt ? new Date(readAt).toISOString() : null,
        createdAt: new Date(r.createdAt).toISOString()
      };
    });

    const unreadCount = formatted.filter((item) => item.unread).length;

    const result = onlyUnread ? formatted.filter((item) => item.unread) : formatted;

    return {
      notifications: result,
      unreadCount
    };
  },

  /**
   * Menandai satu notifikasi sebagai telah dibaca
   */
  async markAsRead(notificationId: string, userId?: string) {
    const [notif] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, notificationId))
      .limit(1);

    if (!notif) return { success: false, error: "Notifikasi tidak ditemukan" };

    const now = new Date();

    if (notif.userId && userId && notif.userId === userId) {
      await db
        .update(schema.notifications)
        .set({ isRead: true, readAt: now })
        .where(eq(schema.notifications.id, notificationId));
    } else if (userId) {
      // Broadcast notification read tracking
      await db
        .insert(schema.notificationReads)
        .values({
          notificationId,
          userId,
          readAt: now
        })
        .onConflictDoNothing();
    } else {
      await db
        .update(schema.notifications)
        .set({ isRead: true, readAt: now })
        .where(eq(schema.notifications.id, notificationId));
    }

    return { success: true };
  },

  /**
   * Menandai semua notifikasi aktif sebagai telah dibaca
   */
  async markAllAsRead(params: {
    tenantId?: string;
    branchId?: string;
    userId?: string;
    role?: string;
  }) {
    const { tenantId, branchId, userId, role = "ALL" } = params;
    if (!userId) {
      return { success: false, error: "User ID diperlukan" };
    }

    // 1. Mark all direct user notifications as read
    await db
      .update(schema.notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.isRead, false)
        )
      );

    // 2. Query all unread broadcast notifications and insert receipt for this user
    const broadcastRows = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .leftJoin(
        schema.notificationReads,
        and(
          eq(schema.notificationReads.notificationId, schema.notifications.id),
          eq(schema.notificationReads.userId, userId)
        )
      )
      .where(
        and(
          tenantId ? eq(schema.notifications.tenantId, tenantId) : sql`TRUE`,
          isNull(schema.notifications.userId),
          branchId && role !== "SUPERADMIN" && role !== "OWNER"
            ? or(isNull(schema.notifications.branchId), eq(schema.notifications.branchId, branchId))
            : sql`TRUE`,
          role && role !== "SUPERADMIN" && role !== "OWNER"
            ? or(
                isNull(schema.notifications.targetRole),
                eq(schema.notifications.targetRole, "ALL"),
                eq(schema.notifications.targetRole, role)
              )
            : sql`TRUE`,
          isNull(schema.notificationReads.id) // belum pernah dibaca user ini
        )
      )
      .limit(100);

    if (broadcastRows.length > 0) {
      const now = new Date();
      const insertValues = broadcastRows.map((r) => ({
        notificationId: r.id,
        userId,
        readAt: now
      }));

      for (const val of insertValues) {
        await db.insert(schema.notificationReads).values(val).onConflictDoNothing();
      }
    }

    return { success: true };
  },

  /**
   * Menghapus satu notifikasi berdasarkan ID
   */
  async deleteNotification(notificationId: string) {
    await db.delete(schema.notifications).where(eq(schema.notifications.id, notificationId));
    return { success: true };
  },

  /**
   * Menghapus notifikasi yang sudah dibaca (agar tidak menumpuk)
   */
  async clearReadNotifications(params: {
    tenantId?: string;
    branchId?: string;
    userId?: string;
    role?: string;
  }) {
    const { tenantId, userId, role = "ALL" } = params;
    const isSuperOrOwner = role === "SUPERADMIN" || role === "OWNER";

    // 1. Hapus notifikasi personal yang sudah dibaca
    if (userId) {
      await db
        .delete(schema.notifications)
        .where(
          and(
            eq(schema.notifications.userId, userId),
            eq(schema.notifications.isRead, true)
          )
        );
    }

    // 2. Jika Superadmin atau Owner, bersihkan juga notifikasi broadcast yang sudah dibaca oleh user ini
    if (isSuperOrOwner && userId) {
      await db
        .delete(schema.notifications)
        .where(
          and(
            tenantId ? eq(schema.notifications.tenantId, tenantId) : sql`TRUE`,
            isNull(schema.notifications.userId),
            sql`EXISTS (SELECT 1 FROM notification_reads nr WHERE nr.notification_id = notifications.id AND nr.user_id = ${userId})`
          )
        );
    }

    return { success: true };
  },

  /**
   * Menghapus semua notifikasi (membersihkan seluruh inbox)
   */
  async clearAllNotifications(params: {
    tenantId?: string;
    branchId?: string;
    userId?: string;
    role?: string;
  }) {
    const { tenantId, userId, role = "ALL" } = params;
    const isSuperOrOwner = role === "SUPERADMIN" || role === "OWNER";

    if (isSuperOrOwner) {
      // Superadmin / Owner dapat membersihkan semua notifikasi tenant
      await db
        .delete(schema.notifications)
        .where(tenantId ? eq(schema.notifications.tenantId, tenantId) : sql`TRUE`);
    } else if (userId) {
      // User non-admin membersihkan notifikasi personal miliknya
      await db
        .delete(schema.notifications)
        .where(eq(schema.notifications.userId, userId));
    }

    return { success: true };
  },

  /**
   * Helper untuk membuat notifikasi kustom / event transaksi
   */
  async createNotification(data: {
    tenantId: string;
    branchId?: string;
    userId?: string;
    targetRole?: string;
    title: string;
    message: string;
    category: "INVENTORY" | "PROCUREMENT" | "FINANCE" | "SHIFT" | "COMPLIANCE" | "SYSTEM";
    type: string;
    severity?: "INFO" | "WARNING" | "DANGER" | "SUCCESS";
    actionUrl?: string;
    metadata?: Record<string, any>;
  }) {
    const [created] = await db
      .insert(schema.notifications)
      .values({
        tenantId: data.tenantId,
        branchId: data.branchId || null,
        userId: data.userId || null,
        targetRole: data.targetRole || "ALL",
        title: data.title,
        message: data.message,
        category: data.category,
        type: data.type,
        severity: data.severity || "INFO",
        actionUrl: data.actionUrl || null,
        metadata: data.metadata || null
      })
      .returning();

    return created;
  },

  /**
   * Pemindai Otomatis (Alert Scanner Engine):
   * Menyisir database dan membuat entri notifikasi operasional (idempotent, menghindari duplikasi 24 jam)
   */
  async syncSystemAlerts(rawTenantId?: string, rawBranchId?: string) {
    let tenantId = rawTenantId;
    if (!tenantId) {
      const [firstTenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      tenantId = firstTenant?.id;
    }
    if (!tenantId) return { synced: 0 };

    let branchId = rawBranchId;
    if (!branchId) {
      const [firstBranch] = await db.select({ id: schema.branches.id }).from(schema.branches).limit(1);
      branchId = firstBranch?.id;
    }

    let createdCount = 0;

    // ----------------------------------------------------
    // 0. AUTO-PURGE & AUTO-HEAL (Mencegah Penumpukan Data)
    // ----------------------------------------------------
    try {
      // A. Hapus otomatis notifikasi yang sudah dibaca > 7 hari, atau notifikasi lama > 30 hari
      await db.delete(schema.notifications).where(
        and(
          eq(schema.notifications.tenantId, tenantId),
          or(
            and(eq(schema.notifications.isRead, true), sql`${schema.notifications.readAt} < (NOW() - INTERVAL '7 days')`),
            sql`${schema.notifications.createdAt} < (NOW() - INTERVAL '30 days')`
          )
        )
      );

      // B. Auto-Heal: Hapus notifikasi LOW_STOCK jika produk sudah di-restock (stok saat ini sudah aman)
      await db.delete(schema.notifications).where(
        and(
          eq(schema.notifications.tenantId, tenantId),
          eq(schema.notifications.type, "LOW_STOCK"),
          sql`EXISTS (
            SELECT 1 FROM branch_stocks bs
            JOIN products p ON bs.product_id = p.id
            WHERE bs.branch_id = notifications.branch_id
              AND (notifications.metadata->>'productId')::uuid = p.id
              AND CAST(bs.total_qty_base AS numeric) > GREATEST(CAST(p.min_stock AS numeric), 15)
          )`
        )
      );

      // C. Auto-Heal: Hapus notifikasi PURCHASE_DUE jika faktur sudah lunas (isPaidOff = true)
      await db.delete(schema.notifications).where(
        and(
          eq(schema.notifications.tenantId, tenantId),
          eq(schema.notifications.type, "PURCHASE_DUE"),
          sql`EXISTS (
            SELECT 1 FROM purchase_invoices pi
            WHERE (notifications.metadata->>'invoiceId')::uuid = pi.id
              AND pi.is_paid_off = TRUE
          )`
        )
      );

      // D. Auto-Heal: Hapus notifikasi TRANSFER_IN jika surat jalan mutasi sudah selesai diterima
      await db.delete(schema.notifications).where(
        and(
          eq(schema.notifications.tenantId, tenantId),
          eq(schema.notifications.type, "TRANSFER_IN"),
          sql`EXISTS (
            SELECT 1 FROM stock_transfers st
            WHERE (notifications.metadata->>'transferId')::uuid = st.id
              AND st.status = 'COMPLETED'
          )`
        )
      );
    } catch (e) {
      console.warn("[Notifications] Error in auto-purge/heal:", e);
    }

    // ----------------------------------------------------
    // 1. SCAN: STOK KRITIS / MENIPIS
    // ----------------------------------------------------
    try {
      const lowStockProducts = await db
        .select({
          id: schema.products.id,
          name: schema.products.name,
          baseUnit: schema.products.baseUnit,
          minStock: schema.products.minStock,
          totalQty: schema.branchStocks.totalQtyBase
        })
        .from(schema.branchStocks)
        .innerJoin(schema.products, eq(schema.branchStocks.productId, schema.products.id))
        .where(
          and(
            branchId ? eq(schema.branchStocks.branchId, branchId) : sql`TRUE`,
            sql`CAST(${schema.branchStocks.totalQtyBase} AS numeric) <= GREATEST(CAST(${schema.products.minStock} AS numeric), 15)`
          )
        )
        .limit(5);

      for (const p of lowStockProducts) {
        const qtyNum = Math.round(Number(p.totalQty || 0));
        const minNum = Math.round(Number(p.minStock || 15));

        // Cek apakah alert stok untuk produk ini sudah dibuat dalam 24 jam terakhir
        const [existing] = await db
          .select({ id: schema.notifications.id })
          .from(schema.notifications)
          .where(
            and(
              eq(schema.notifications.tenantId, tenantId),
              eq(schema.notifications.type, "LOW_STOCK"),
              sql`(${schema.notifications.metadata}->>'productId') = ${p.id}`,
              sql`${schema.notifications.createdAt} >= (NOW() - INTERVAL '24 hours')`
            )
          )
          .limit(1);

        if (!existing) {
          const isZero = qtyNum <= 0;
          await db.insert(schema.notifications).values({
            tenantId,
            branchId: branchId || null,
            targetRole: "ALL",
            title: isZero ? `Stok Habis: ${p.name}` : `Stok Menipis: ${p.name}`,
            message: isZero
              ? `Stok saat ini 0 ${p.baseUnit}. Segera buat Surat Pesanan (SP) pengadaan ke PBF.`
              : `Sisa ${qtyNum} ${p.baseUnit} (Batas min. ${minNum} ${p.baseUnit}). Segera buat Surat Pesanan (SP).`,
            category: "INVENTORY",
            type: "LOW_STOCK",
            severity: isZero ? "DANGER" : "WARNING",
            actionUrl: "/stok",
            metadata: { productId: p.id, stock: qtyNum, minStock: minNum }
          });
          createdCount++;
        }
      }
    } catch (e) {
      console.warn("[Notifications] Error scanning low stock:", e);
    }

    // ----------------------------------------------------
    // 2. SCAN: BATCH OBAT MENDEKATI KADALUWARSA (ED <= 60 HARI)
    // ----------------------------------------------------
    try {
      const expiringBatches = await db
        .select({
          productId: schema.products.id,
          productName: schema.products.name,
          baseUnit: schema.products.baseUnit,
          batchNo: schema.productBatches.batchNo,
          expiredDate: schema.productBatches.expiredDate,
          qty: schema.branchBatchStocks.qtyBase
        })
        .from(schema.branchBatchStocks)
        .innerJoin(schema.products, eq(schema.branchBatchStocks.productId, schema.products.id))
        .innerJoin(schema.productBatches, eq(schema.branchBatchStocks.batchId, schema.productBatches.id))
        .where(
          and(
            branchId ? eq(schema.branchBatchStocks.branchId, branchId) : sql`TRUE`,
            sql`${schema.productBatches.expiredDate} IS NOT NULL`,
            sql`CAST(${schema.branchBatchStocks.qtyBase} AS numeric) > 0`,
            sql`${schema.productBatches.expiredDate} <= (CURRENT_DATE + INTERVAL '60 days')`
          )
        )
        .orderBy(schema.productBatches.expiredDate)
        .limit(4);

      for (const b of expiringBatches) {
        const batchIdentifier = b.batchNo || "UNKNOWN";
        const [existing] = await db
          .select({ id: schema.notifications.id })
          .from(schema.notifications)
          .where(
            and(
              eq(schema.notifications.tenantId, tenantId),
              eq(schema.notifications.type, "EXPIRY_ALERT"),
              sql`(${schema.notifications.metadata}->>'batchNo') = ${batchIdentifier}`,
              sql`${schema.notifications.createdAt} >= (NOW() - INTERVAL '24 hours')`
            )
          )
          .limit(1);

        if (!existing) {
          const expDateFormatted = b.expiredDate
            ? new Date(b.expiredDate).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric"
              })
            : "-";
          const qtyVal = Math.round(Number(b.qty || 0));

          await db.insert(schema.notifications).values({
            tenantId,
            branchId: branchId || null,
            targetRole: "ALL",
            title: `Mendekati ED: ${b.productName}`,
            message: `Batch ${batchIdentifier} jatuh tempo ED pada ${expDateFormatted} (Sisa ${qtyVal} ${b.baseUnit}). Prioritaskan penjualan FEFO!`,
            category: "INVENTORY",
            type: "EXPIRY_ALERT",
            severity: "WARNING",
            actionUrl: "/stok",
            metadata: { productId: b.productId, batchNo: batchIdentifier, expiredDate: b.expiredDate }
          });
          createdCount++;
        }
      }
    } catch (e) {
      console.warn("[Notifications] Error scanning expiring batches:", e);
    }

    // ----------------------------------------------------
    // 3. SCAN: FAKTUR PEMBELIAN JATUH TEMPO (H-3 S/D OVERDUE)
    // ----------------------------------------------------
    try {
      const dueInvoices = await db
        .select({
          id: schema.purchaseInvoices.id,
          invoiceNumber: schema.purchaseInvoices.invoiceNumber,
          dueDate: schema.purchaseInvoices.dueDate,
          grandTotal: schema.purchaseInvoices.grandTotal,
          supplierName: schema.suppliers.name
        })
        .from(schema.purchaseInvoices)
        .leftJoin(schema.suppliers, eq(schema.purchaseInvoices.supplierId, schema.suppliers.id))
        .where(
          and(
            eq(schema.purchaseInvoices.tenantId, tenantId),
            eq(schema.purchaseInvoices.isPaidOff, false),
            sql`${schema.purchaseInvoices.dueDate} <= (CURRENT_DATE + INTERVAL '3 days')`
          )
        )
        .orderBy(schema.purchaseInvoices.dueDate)
        .limit(3);

      for (const inv of dueInvoices) {
        const [existing] = await db
          .select({ id: schema.notifications.id })
          .from(schema.notifications)
          .where(
            and(
              eq(schema.notifications.tenantId, tenantId),
              eq(schema.notifications.type, "PURCHASE_DUE"),
              sql`(${schema.notifications.metadata}->>'invoiceId') = ${inv.id}`,
              sql`${schema.notifications.createdAt} >= (NOW() - INTERVAL '24 hours')`
            )
          )
          .limit(1);

        if (!existing) {
          const totalRp = Number(inv.grandTotal || 0).toLocaleString("id-ID");
          const dueDateFormatted = new Date(inv.dueDate).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric"
          });
          const isOverdue = new Date(inv.dueDate) < new Date();

          await db.insert(schema.notifications).values({
            tenantId,
            branchId: branchId || null,
            targetRole: "ALL",
            title: isOverdue ? `Faktur Lewat Jatuh Tempo: ${inv.invoiceNumber}` : `Faktur PBF Jatuh Tempo: ${inv.invoiceNumber}`,
            message: `Tagihan ${inv.supplierName || "PBF"} sebesar Rp ${totalRp} jatuh tempo pada ${dueDateFormatted}.`,
            category: "PROCUREMENT",
            type: "PURCHASE_DUE",
            severity: isOverdue ? "DANGER" : "WARNING",
            actionUrl: "/pembelian",
            metadata: { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, dueDate: inv.dueDate }
          });
          createdCount++;
        }
      }
    } catch (e) {
      console.warn("[Notifications] Error scanning due purchase invoices:", e);
    }

    // ----------------------------------------------------
    // 4. SCAN: MUTASI ANTAR-CABANG MASUK (TRANSFER IN PENDING)
    // ----------------------------------------------------
    try {
      if (branchId) {
        const pendingTransfers = await db
          .select({
            id: schema.stockTransfers.id,
            transferNumber: schema.stockTransfers.transferNumber,
            sourceBranchName: schema.branches.name
          })
          .from(schema.stockTransfers)
          .leftJoin(schema.branches, eq(schema.stockTransfers.sourceBranchId, schema.branches.id))
          .where(
            and(
              eq(schema.stockTransfers.destBranchId, branchId),
              inArray(schema.stockTransfers.status, ["PENDING", "IN_TRANSIT"])
            )
          )
          .limit(2);

        for (const tr of pendingTransfers) {
          const [existing] = await db
            .select({ id: schema.notifications.id })
            .from(schema.notifications)
            .where(
              and(
                eq(schema.notifications.tenantId, tenantId),
                eq(schema.notifications.type, "TRANSFER_IN"),
                sql`(${schema.notifications.metadata}->>'transferId') = ${tr.id}`,
                sql`${schema.notifications.createdAt} >= (NOW() - INTERVAL '24 hours')`
              )
            )
            .limit(1);

          if (!existing) {
            await db.insert(schema.notifications).values({
              tenantId,
              branchId,
              targetRole: "ALL",
              title: `Mutasi Masuk: ${tr.transferNumber}`,
              message: `Pengiriman stok dari ${tr.sourceBranchName || "Cabang Asal"} sedang menunggu verifikasi penerimaan barang.`,
              category: "INVENTORY",
              type: "TRANSFER_IN",
              severity: "INFO",
              actionUrl: "/pengiriman",
              metadata: { transferId: tr.id, transferNumber: tr.transferNumber }
            });
            createdCount++;
          }
        }
      }
    } catch (e) {
      console.warn("[Notifications] Error scanning transfers:", e);
    }

    return { synced: createdCount };
  }
};
