<script lang="ts">
  import { Bell, ArrowRight, AlertTriangle, FileText, CalendarClock, Store, X } from "lucide-svelte";
  import { notificationStore } from "$lib/stores/notificationStore.svelte";

  interface NotificationItem {
    id: string;
    title: string;
    desc: string;
    time: string;
    type: string;
    actionUrl?: string;
  }

  interface Props {
    notifications?: NotificationItem[];
  }

  let { notifications }: Props = $props();

  let displayItems = $derived.by(() => {
    if (notifications && notifications.length > 0) {
      return notifications;
    }
    return notificationStore.items.slice(0, 10).map((n) => ({
      id: n.id,
      title: n.title,
      desc: n.message,
      time: formatRelativeTime(n.createdAt),
      type: n.type,
      actionUrl: n.actionUrl || "/"
    }));
  });

  function formatRelativeTime(dateStr?: string) {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / (60 * 1000));
      if (diffMins < 1) return "Baru saja";
      if (diffMins < 60) return `${diffMins}m lalu`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}j lalu`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}h lalu`;
      return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    } catch {
      return "";
    }
  }

  function getIcon(type: string) {
    switch (type) {
      case "LOW_STOCK":
      case "ALERT":
        return AlertTriangle;
      case "EXPIRY_ALERT":
      case "EXPIRY":
        return CalendarClock;
      case "TRANSFER_IN":
        return Store;
      case "PURCHASE_DUE":
      case "PURCHASE":
      case "RECEIVABLE_DUE":
      case "RECEIVABLE":
      default:
        return FileText;
    }
  }

  function getIconBg(type: string) {
    switch (type) {
      case "LOW_STOCK":
      case "ALERT":
        return "bg-red-50 text-[#df1c2d]";
      case "EXPIRY_ALERT":
      case "EXPIRY":
        return "bg-amber-50 text-amber-600";
      case "TRANSFER_IN":
        return "bg-blue-50 text-blue-600";
      case "PURCHASE_DUE":
      case "PURCHASE":
        return "bg-blue-50 text-[#1d63d8]";
      case "RECEIVABLE_DUE":
      case "RECEIVABLE":
        return "bg-emerald-50 text-emerald-600";
      default:
        return "bg-slate-50 text-slate-600";
    }
  }
</script>

<div class="min-h-0 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col lg:absolute lg:inset-0" id="notifikasi">
  <!-- HEADER -->
  <div class="flex shrink-0 items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <div class="relative">
        <Bell class="w-4 h-4 text-[#0c2e7a]" />
        {#if notificationStore.unreadCount > 0}
          <span class="absolute -top-1 -right-1 w-2 h-2 bg-[#df1c2d] rounded-full"></span>
        {/if}
      </div>
      <h3 class="text-sm font-bold text-slate-800">Notifikasi & Pengingat</h3>
    </div>
  </div>

  <!-- NOTIFICATIONS LIST -->
  <div class="flex-1 min-h-0 overflow-y-auto space-y-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {#if displayItems.length === 0}
      <div class="h-full flex flex-col items-center justify-center text-center p-4">
        <p class="text-xs text-slate-400 font-medium">Tidak ada notifikasi atau jatuh tempo yang mendesak.</p>
      </div>
    {:else}
      {#each displayItems as item (item.id)}
        {@const IconComp = getIcon(item.type)}
        <div class="relative group">
          <a
            href={item.actionUrl || "/"}
            onclick={() => notificationStore.markAsRead(item.id)}
            class="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors block pr-8"
          >
            <div class="w-8 h-8 rounded-lg {getIconBg(item.type)} flex items-center justify-center flex-shrink-0">
              <IconComp class="w-4 h-4" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <h4 class="text-xs font-bold text-slate-800 truncate">{item.title}</h4>
                <span class="text-[10px] font-semibold text-slate-400 flex-shrink-0">{item.time}</span>
              </div>
              <p class="text-[11px] text-slate-500 mt-0.5 truncate leading-relaxed">{@html item.desc}</p>
            </div>
          </a>

          <button
            type="button"
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              notificationStore.deleteNotification(item.id);
            }}
            class="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
            title="Hapus notifikasi ini"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      {/each}
    {/if}
  </div>
</div>
