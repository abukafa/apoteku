<script lang="ts">
  import { onMount } from "svelte";
  import {
    Search,
    Bell,
    ChevronDown,
    Calendar,
    Menu,
    LogOut,
    User,
    Settings,
    Store
  } from "lucide-svelte";
  import { authStore } from "$lib/stores/authStore.svelte";

  interface Props {
    onToggleMobileMenu?: () => void;
  }

  let { onToggleMobileMenu }: Props = $props();

  let showProfileMenu = $state(false);
  let formattedDate = $state("27 Okt 2025");
  let formattedTime = $state("10:24");

  let initials = $derived(
    authStore.user?.fullName
      ? authStore.user.fullName
          .split(" ")
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : "HF"
  );

  function formatRole(role?: string) {
    switch (role) {
      case "SUPERADMIN":
        return "Admin Sistem";
      case "OWNER":
        return "Pemilik Apotek";
      case "PHARMACIST":
        return "Apoteker PJ";
      case "CASHIER":
        return "Kasir Farmasi";
      case "INVENTORY_STAFF":
        return "Staf Gudang";
      default:
        return role || "Staff";
    }
  }

  function handleLogout() {
    showProfileMenu = false;
    authStore.clearSession();
  }

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

    <!-- User Profile Dropdown (Reaktif dengan authStore) -->
    <div class="relative">
      <button
        type="button"
        onclick={() => (showProfileMenu = !showProfileMenu)}
        class="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 py-1 px-2 rounded-xl transition-colors focus:outline-none"
      >
        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 text-white flex items-center justify-center font-bold text-xs ring-2 ring-blue-100 overflow-hidden">
          {#if authStore.user?.avatarUrl}
            <img
              src={authStore.user.avatarUrl}
              alt={authStore.user?.fullName || "User Avatar"}
              class="w-full h-full object-cover"
            />
          {:else}
            <span>{initials}</span>
          {/if}
        </div>
        <div class="hidden md:block text-left">
          <div class="text-xs font-bold text-slate-800 leading-tight">
            {authStore.user?.fullName || "Belum Masuk"}
          </div>
          <div class="text-[10px] text-slate-500 font-medium">
            {formatRole(authStore.user?.role)}
          </div>
        </div>
        <ChevronDown class="w-3.5 h-3.5 text-slate-400 hidden sm:block {showProfileMenu ? 'rotate-180' : ''} transition-transform" />
      </button>

      {#if showProfileMenu}
        <div
          class="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-50 text-xs font-semibold text-slate-700 animate-in fade-in duration-150"
        >
          <div class="px-3 py-2 border-b border-slate-100">
            <div class="font-bold text-slate-900 truncate">
              {authStore.user?.fullName || "Tamu"}
            </div>
            <div class="text-[10px] text-slate-500 font-normal truncate">
              {authStore.user?.email || "-"}
            </div>
            <div class="mt-1 flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-medium">
              <Store class="w-3 h-3 flex-shrink-0" />
              <span class="truncate">{authStore.user?.branchName || "Pusat"}</span>
            </div>
          </div>
          <a
            href="#profil"
            onclick={() => (showProfileMenu = false)}
            class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <User class="w-4 h-4 text-slate-400" />
            <span>Profil Saya</span>
          </a>
          <a
            href="#pengaturan"
            onclick={() => (showProfileMenu = false)}
            class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <Settings class="w-4 h-4 text-slate-400" />
            <span>Pengaturan Akun</span>
          </a>
          <div class="border-t border-slate-100 my-1"></div>
          <a
            href="/login"
            onclick={handleLogout}
            class="flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-[#df1c2d] transition-colors"
          >
            <LogOut class="w-4 h-4 text-[#df1c2d]" />
            <span>Keluar / Ganti Akun</span>
          </a>
        </div>
      {/if}
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
