import { Elysia, t } from "elysia";
import { notificationService } from "./notification.service.js";

export const notificationRoutes = new Elysia({ prefix: "/api/notifications" })
  .derive(({ headers }) => {
    const tenantId = (headers["x-tenant-id"] as string) || undefined;
    const branchId = (headers["x-branch-id"] as string) || undefined;
    const userId = (headers["x-user-id"] as string) || undefined;
    const role = (headers["x-user-role"] as string) || undefined;
    return { tenantId, branchId, userId, role };
  })

  // 1. GET LIST NOTIFIKASI
  .get(
    "",
    async ({ query, tenantId, branchId, userId, role }) => {
      try {
        const limit = query.limit ? Number(query.limit) : 25;
        const onlyUnread = query.unread === "true";
        const category = query.category || undefined;

        const result = await notificationService.listNotifications({
          tenantId,
          branchId,
          userId,
          role,
          limit,
          onlyUnread,
          category
        });

        return {
          success: true,
          data: result.notifications,
          unreadCount: result.unreadCount
        };
      } catch (err: any) {
        console.error("[Notifications] GET / error:", err);
        return {
          success: false,
          error: err?.message || "Gagal memuat notifikasi",
          data: [],
          unreadCount: 0
        };
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        unread: t.Optional(t.String()),
        category: t.Optional(t.String())
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Daftar Notifikasi Pengguna & Cabang"
      }
    }
  )

  // 2. TRIGGER PEMINDAIAN ALERT SISTEM (AUTO SYNC)
  .post(
    "/sync-alerts",
    async ({ tenantId, branchId }) => {
      try {
        const res = await notificationService.syncSystemAlerts(tenantId, branchId);
        return {
          success: true,
          synced: res.synced
        };
      } catch (err: any) {
        console.error("[Notifications] POST /sync-alerts error:", err);
        return { success: false, error: err?.message || "Gagal sinkronisasi alert" };
      }
    },
    {
      detail: {
        tags: ["Notifications"],
        summary: "Pindai & Buat Alert Operasional Otomatis"
      }
    }
  )

  // 3. TANDAI SATU NOTIFIKASI SUDAH DIBACA
  .patch(
    "/:id/read",
    async ({ params, userId }) => {
      try {
        const res = await notificationService.markAsRead(params.id, userId);
        return res;
      } catch (err: any) {
        console.error("[Notifications] PATCH /:id/read error:", err);
        return { success: false, error: err?.message || "Gagal menandai notifikasi dibaca" };
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Tandai Notifikasi Dibaca"
      }
    }
  )

  // 4. TANDAI SEMUA NOTIFIKASI SUDAH DIBACA
  .post(
    "/mark-all-read",
    async ({ tenantId, branchId, userId, role }) => {
      try {
        const res = await notificationService.markAllAsRead({
          tenantId,
          branchId,
          userId,
          role
        });
        return res;
      } catch (err: any) {
        console.error("[Notifications] POST /mark-all-read error:", err);
        return { success: false, error: err?.message || "Gagal menandai semua dibaca" };
      }
    },
    {
      detail: {
        tags: ["Notifications"],
        summary: "Tandai Semua Notifikasi Dibaca"
      }
    }
  )

  // 5. HAPUS SATU NOTIFIKASI
  .delete(
    "/:id",
    async ({ params }) => {
      try {
        const res = await notificationService.deleteNotification(params.id);
        return res;
      } catch (err: any) {
        console.error("[Notifications] DELETE /:id error:", err);
        return { success: false, error: err?.message || "Gagal menghapus notifikasi" };
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Hapus Notifikasi"
      }
    }
  )

  // 6. BERSIHKAN NOTIFIKASI YANG SUDAH DIBACA
  .post(
    "/clear-read",
    async ({ tenantId, branchId, userId, role }) => {
      try {
        const res = await notificationService.clearReadNotifications({
          tenantId,
          branchId,
          userId,
          role
        });
        return res;
      } catch (err: any) {
        console.error("[Notifications] POST /clear-read error:", err);
        return { success: false, error: err?.message || "Gagal membersihkan notifikasi terbaca" };
      }
    },
    {
      detail: {
        tags: ["Notifications"],
        summary: "Bersihkan Notifikasi Terbaca"
      }
    }
  )

  // 7. BERSIHKAN SEMUA NOTIFIKASI (CLEAR ALL)
  .post(
    "/clear-all",
    async ({ tenantId, branchId, userId, role }) => {
      try {
        const res = await notificationService.clearAllNotifications({
          tenantId,
          branchId,
          userId,
          role
        });
        return res;
      } catch (err: any) {
        console.error("[Notifications] POST /clear-all error:", err);
        return { success: false, error: err?.message || "Gagal membersihkan semua notifikasi" };
      }
    },
    {
      detail: {
        tags: ["Notifications"],
        summary: "Bersihkan Semua Notifikasi"
      }
    }
  );
