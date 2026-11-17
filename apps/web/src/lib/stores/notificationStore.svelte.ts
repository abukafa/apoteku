import { api } from "$lib/services/api";

export interface AppNotification {
  id: string;
  tenantId: string;
  branchId?: string | null;
  title: string;
  message: string;
  category: "INVENTORY" | "PROCUREMENT" | "FINANCE" | "SHIFT" | "COMPLIANCE" | "SYSTEM";
  type: string;
  severity: "INFO" | "WARNING" | "DANGER" | "SUCCESS";
  actionUrl: string;
  metadata?: Record<string, any> | null;
  unread: boolean;
  readAt?: string | null;
  createdAt: string;
}

const STORAGE_KEY = "apoteku_cached_notifications";

class NotificationStore {
  items = $state<AppNotification[]>([]);
  isLoading = $state(false);
  lastSyncAt = $state<number>(0);
  private pollingTimer: any = null;

  unreadCount = $derived(this.items.filter((item) => item.unread).length);

  constructor() {
    this.loadFromCache();
  }

  private loadFromCache() {
    if (typeof window === "undefined") return;
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          this.items = parsed;
        }
      }
    } catch {
      // Ignore cache parsing error
    }
  }

  private saveToCache() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch {
      // Ignore storage error
    }
  }

  /**
   * Mengambil daftar notifikasi dari API backend
   */
  async fetchNotifications(isBackground = false) {
    if (!isBackground) this.isLoading = true;

    try {
      // Auto-trigger sync alerts jika belum pernah disinkronkan dalam 3 menit
      const now = Date.now();
      if (now - this.lastSyncAt > 3 * 60 * 1000) {
        this.lastSyncAt = now;
        api.notifications.syncAlerts().catch(() => null);
      }

      const res = await api.notifications.list({ limit: 30 });
      if (res?.success && Array.isArray(res.data)) {
        this.items = res.data;
        this.saveToCache();
      }
    } catch (err) {
      console.warn("[NotificationStore] Failed to fetch notifications:", err);
    } finally {
      if (!isBackground) this.isLoading = false;
    }
  }

  /**
   * Menandai 1 notifikasi sebagai sudah dibaca (Optimistic UI)
   */
  async markAsRead(id: string) {
    const item = this.items.find((n) => n.id === id);
    if (!item || !item.unread) return;

    // Optimistic local update
    this.items = this.items.map((n) =>
      n.id === id ? { ...n, unread: false, readAt: new Date().toISOString() } : n
    );
    this.saveToCache();

    try {
      await api.notifications.markAsRead(id);
    } catch (err) {
      console.warn("[NotificationStore] Failed to mark as read:", err);
    }
  }

  /**
   * Menandai semua notifikasi aktif sebagai sudah dibaca (Optimistic UI)
   */
  async markAllAsRead() {
    const hasUnread = this.items.some((n) => n.unread);
    if (!hasUnread) return;

    const now = new Date().toISOString();
    this.items = this.items.map((n) => ({ ...n, unread: false, readAt: now }));
    this.saveToCache();

    try {
      await api.notifications.markAllRead();
    } catch (err) {
      console.warn("[NotificationStore] Failed to mark all as read:", err);
    }
  }

  /**
   * Menghapus notifikasi
   */
  async deleteNotification(id: string) {
    this.items = this.items.filter((n) => n.id !== id);
    this.saveToCache();

    try {
      await api.notifications.delete(id);
    } catch (err) {
      console.warn("[NotificationStore] Failed to delete notification:", err);
    }
  }

  /**
   * Menghapus seluruh notifikasi yang sudah dibaca (Optimistic UI)
   */
  async clearReadNotifications() {
    this.items = this.items.filter((n) => n.unread);
    this.saveToCache();

    try {
      await api.notifications.clearRead();
    } catch (err) {
      console.warn("[NotificationStore] Failed to clear read notifications:", err);
    }
  }

  /**
   * Menghapus semua notifikasi dari inbox (Optimistic UI)
   */
  async clearAllNotifications() {
    this.items = [];
    this.saveToCache();

    try {
      await api.notifications.clearAll();
    } catch (err) {
      console.warn("[NotificationStore] Failed to clear all notifications:", err);
    }
  }

  /**
   * Memulai background polling interval cerdas (hanya saat window visible)
   */
  startPolling(intervalMs = 60000) {
    if (typeof window === "undefined") return;
    this.stopPolling();

    this.pollingTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        this.fetchNotifications(true);
      }
    }, intervalMs);
  }

  stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }
}

export const notificationStore = new NotificationStore();
