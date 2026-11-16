<script lang="ts">
  import { Bell, ArrowRight, AlertTriangle, FileText, CalendarClock } from "lucide-svelte";

  interface NotificationItem {
    id: string;
    title: string;
    desc: string;
    time: string;
    type: "ALERT" | "PURCHASE" | "EXPIRY" | "RECEIVABLE";
  }

  interface Props {
    notifications?: NotificationItem[];
  }

  let { notifications = [] }: Props = $props();

  function getIcon(type: string) {
    switch (type) {
      case "ALERT":
        return AlertTriangle;
      case "EXPIRY":
        return CalendarClock;
      case "PURCHASE":
      case "RECEIVABLE":
      default:
        return FileText;
    }
  }

  function getIconBg(type: string) {
    switch (type) {
      case "ALERT":
        return "bg-red-50 text-[#df1c2d]";
      case "EXPIRY":
        return "bg-amber-50 text-amber-600";
      case "PURCHASE":
        return "bg-blue-50 text-[#1d63d8]";
      case "RECEIVABLE":
        return "bg-emerald-50 text-emerald-600";
      default:
        return "bg-slate-50 text-slate-600";
    }
  }
</script>

<div class="min-h-0 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col lg:absolute lg:inset-0">
  <!-- HEADER -->
  <div class="flex shrink-0 items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <div class="relative">
        <Bell class="w-4 h-4 text-[#0c2e7a]" />
        {#if notifications.length > 0}
          <span class="absolute -top-1 -right-1 w-2 h-2 bg-[#df1c2d] rounded-full"></span>
        {/if}
      </div>
      <h3 class="text-sm font-bold text-slate-800">Notifikasi & Pengingat</h3>
    </div>
    <a href="/laporan" class="text-[11px] font-semibold text-[#1d63d8] hover:underline flex items-center gap-1">
      Lihat <ArrowRight class="w-3 h-3" />
    </a>
  </div>

  <!-- NOTIFICATIONS LIST -->
  <div class="flex-1 min-h-0 overflow-y-auto space-y-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {#if notifications.length === 0}
      <div class="h-full flex flex-col items-center justify-center text-center p-4">
        <p class="text-xs text-slate-400 font-medium">Tidak ada notifikasi atau jatuh tempo yang mendesak.</p>
      </div>
    {:else}
      {#each notifications as item}
        {@const IconComp = getIcon(item.type)}
        <div class="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
          <div class="w-8 h-8 rounded-lg {getIconBg(item.type)} flex items-center justify-center flex-shrink-0">
            <IconComp class="w-4 h-4" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <h4 class="text-xs font-bold text-slate-800 truncate">{item.title}</h4>
              <span class="text-[10px] font-semibold text-slate-400 flex-shrink-0">{item.time}</span>
            </div>
            <p class="text-[11px] text-slate-500 mt-0.5 truncate">{@html item.desc}</p>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
