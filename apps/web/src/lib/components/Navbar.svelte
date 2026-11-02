<script lang="ts">
  import { onMount } from "svelte";
  import {
    Search,
    Bell,
    ChevronDown,
    Calendar,
    Menu
  } from "lucide-svelte";

  interface Props {
    onToggleMobileMenu?: () => void;
  }

  let { onToggleMobileMenu }: Props = $props();

  let formattedDate = $state("27 Okt 2025");
  let formattedTime = $state("10:24");

  onMount(() => {
    const updateDateTime = () => {
      const now = new Date();
      formattedDate = now.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
      formattedTime = now.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit"
      }).replace(".", ":");
    };
    updateDateTime();
    const timer = setInterval(updateDateTime, 1000);
    return () => clearInterval(timer);
  });
</script>

<header class="bg-white border-b border-surface-border sticky top-0 z-30 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4 shadow-sm">
  <!-- LEFT: Mobile Menu Button & Search Bar -->
  <div class="flex items-center gap-3 flex-1 max-w-xl">
    <button
      onclick={() => onToggleMobileMenu?.()}
      class="lg:hidden p-2 text-slate-600 hover:text-brand-blue hover:bg-slate-100 rounded-lg transition-colors"
      aria-label="Buka Menu"
    >
      <Menu class="w-5 h-5" />
    </button>

    <!-- Search Input matching mockup -->
    <div class="relative w-full">
      <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        placeholder="Cari obat, pelanggan, transaksi, atau menu..."
        class="w-full bg-[#f4f7fb] pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-transparent focus:border-brand-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue-500/20 text-slate-700 placeholder-slate-400 transition-all"
      />
    </div>
  </div>

  <!-- RIGHT: Notification, Profile, Date/Time -->
  <div class="flex items-center gap-3 sm:gap-4">
    <!-- Notification Bell with Red Badge "3" -->
    <button
      class="relative p-2 text-slate-500 hover:text-brand-blue hover:bg-slate-50 rounded-xl transition-colors"
      aria-label="Notifikasi"
    >
      <Bell class="w-5 h-5" />
      <span class="absolute top-1 right-1 w-4 h-4 bg-[#df1c2d] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
        3
      </span>
    </button>

    <!-- User Profile Dropdown: Darajat Rahmatulloh, Admin -->
    <div class="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 py-1 px-2 rounded-xl transition-colors">
      <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 text-white flex items-center justify-center font-bold text-xs ring-2 ring-blue-100 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=120&h=120&q=80"
          alt="Darajat Rahmatulloh"
          class="w-full h-full object-cover"
        />
      </div>
      <div class="hidden md:block text-left">
        <div class="text-xs font-bold text-slate-800 leading-tight">Darajat Rahmatulloh</div>
        <div class="text-[10px] text-slate-500 font-medium">Admin</div>
      </div>
      <ChevronDown class="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
    </div>

    <!-- Live Date & Time Widget matching mockup -->
    <div class="hidden lg:flex items-center gap-2 pl-3 border-l border-slate-200 text-slate-700">
      <Calendar class="w-4 h-4 text-slate-500" />
      <div class="text-left text-xs font-bold leading-tight font-mono">
        <div>{formattedDate}</div>
        <div class="text-[11px] font-medium text-slate-500">{formattedTime}</div>
      </div>
    </div>
  </div>
</header>
