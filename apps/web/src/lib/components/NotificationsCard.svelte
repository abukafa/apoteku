<script lang="ts">
  import { Bell, ArrowRight, AlertTriangle, FileText, CalendarClock } from "lucide-svelte";

  const notifications = [
    {
      title: "Stok Amoxicillin 500 mg menipis",
      desc: "Sisa 5 item (min. 10)",
      time: "10:12",
      icon: AlertTriangle,
      iconBg: "bg-red-50 text-[#df1c2d]"
    },
    {
      title: "Faktur Pembelian dari PBF Kimia Farma",
      desc: "No. FPB-2025-0478 sudah diterima",
      time: "09:45",
      icon: FileText,
      iconBg: "bg-blue-50 text-[#1d63d8]"
    },
    {
      title: "Jatuh tempo penagihan",
      desc: "PT. Mitra Sehat (2 hari lagi)",
      time: "08:30",
      icon: CalendarClock,
      iconBg: "bg-amber-50 text-amber-600"
    }
  ];
</script>

<div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between">
  <!-- HEADER -->
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <div class="relative">
        <Bell class="w-4 h-4 text-[#0c2e7a]" />
        <span class="absolute -top-1 -right-1 w-2 h-2 bg-[#df1c2d] rounded-full"></span>
      </div>
      <h3 class="text-sm font-bold text-slate-800">Notifikasi & Pengingat</h3>
    </div>
    <a href="#notifikasi" class="text-xs font-semibold text-[#1d63d8] hover:underline flex items-center gap-1">
      Lihat Semua <ArrowRight class="w-3 h-3" />
    </a>
  </div>

  <!-- NOTIFICATIONS LIST -->
  <div class="space-y-3">
    {#each notifications as item}
      <div class="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
        <div class="w-8 h-8 rounded-lg {item.iconBg} flex items-center justify-center flex-shrink-0">
          <item.icon class="w-4 h-4" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <h4 class="text-xs font-bold text-slate-800 truncate">{item.title}</h4>
            <span class="text-[10px] font-mono text-slate-400 flex-shrink-0">{item.time}</span>
          </div>
          <p class="text-[11px] text-slate-500 mt-0.5 truncate">{item.desc}</p>
        </div>
      </div>
    {/each}
  </div>
</div>
