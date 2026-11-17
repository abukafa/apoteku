<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import {
    Search,
    Bell,
    ChevronDown,
    Calendar,
    Menu,
    LogOut,
    User,
    Settings,
    Store,
    AlertTriangle,
    FileText,
    CalendarClock,
    CheckCheck
  } from "lucide-svelte";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { notificationStore } from "$lib/stores/notificationStore.svelte";

  interface Props {
    onToggleMobileMenu?: () => void;
  }

  let { onToggleMobileMenu }: Props = $props();

  let showProfileMenu = $state(false);
  let showNotificationMenu = $state(false);
  let formattedDate = $state("27 Okt 2025");
  let formattedTime = $state("10:24");

  let unreadCount = $derived(notificationStore.unreadCount);

  function markAllAsRead() {
    notificationStore.markAllAsRead();
  }

  function handleNotificationClick(id: string) {
    notificationStore.markAsRead(id);
    showNotificationMenu = false;
  }

  function getNotificationIcon(type: string) {
    switch (type) {
      case "LOW_STOCK":
        return AlertTriangle;
      case "EXPIRY_ALERT":
        return CalendarClock;
      case "PURCHASE_DUE":
      case "RECEIVABLE_DUE":
        return FileText;
      case "TRANSFER_IN":
        return Store;
      default:
        return Bell;
    }
  }

  function getNotificationColors(severity: string) {
    switch (severity) {
      case "DANGER":
        return {
          bg: "bg-red-50 text-[#df1c2d]",
          badge: "bg-red-100 text-red-700"
        };
      case "WARNING":
        return {
          bg: "bg-amber-50 text-amber-600",
          badge: "bg-amber-100 text-amber-700"
        };
      case "SUCCESS":
        return {
          bg: "bg-emerald-50 text-emerald-600",
          badge: "bg-emerald-100 text-emerald-700"
        };
      case "INFO":
      default:
        return {
          bg: "bg-blue-50 text-[#1d63d8]",
          badge: "bg-blue-100 text-blue-700"
        };
    }
  }

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
      case "GUEST":
        return "Tamu (Menunggu Akses)";
      default:
        return role || "Staff";
    }
  }

  function handleLogout() {
    showProfileMenu = false;
    authStore.clearSession();
    goto("/login", { replaceState: true });
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
    <!-- Notification Bell Dropdown -->
    <div class="relative">
      <button
        type="button"
        onclick={() => {
          showNotificationMenu = !showNotificationMenu;
          if (showNotificationMenu) showProfileMenu = false;
        }}
        class="relative p-2 text-slate-500 hover:text-brand-blue hover:bg-slate-50 rounded-xl transition-colors focus:outline-none {showNotificationMenu ? 'bg-slate-50 text-brand-blue' : ''}"
        aria-label="Notifikasi"
        aria-expanded={showNotificationMenu}
      >
        <Bell class="w-5 h-5" />
        {#if unreadCount > 0}
          <span class="absolute top-1 right-1 w-4 h-4 bg-[#df1c2d] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount}
          </span>
        {/if}
      </button>

      {#if showNotificationMenu}
        <div
          class="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in duration-150"
        >
          <!-- Dropdown Header -->
          <div class="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-800">Notifikasi & Pengingat</span>
              {#if unreadCount > 0}
                <span class="px-1.5 py-0.5 text-[10px] font-bold bg-red-50 text-[#df1c2d] rounded-full">
                  {unreadCount} Baru
                </span>
              {/if}
            </div>
            {#if unreadCount > 0}
              <button
                type="button"
                onclick={markAllAsRead}
                class="flex items-center gap-1 text-[11px] font-semibold text-[#1d63d8] hover:underline cursor-pointer"
              >
                <CheckCheck class="w-3.5 h-3.5" />
                <span>Tandai dibaca</span>
              </button>
            {/if}
          </div>

          <!-- Notification Items -->
          <div class="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {#if notificationStore.items.length === 0}
              <div class="px-4 py-6 text-center text-xs text-slate-400">
                {#if notificationStore.isLoading}
                  <div class="flex items-center justify-center gap-2">
                    <div class="w-3.5 h-3.5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div>
                    <span>Memuat notifikasi...</span>
                  </div>
                {:else}
                  Belum ada notifikasi atau pengingat operasional
                {/if}
              </div>
            {:else}
              {#each notificationStore.items as item (item.id)}
                {@const IconComp = getNotificationIcon(item.type)}
                {@const colors = getNotificationColors(item.severity)}
                <a
                  href={item.actionUrl || "/"}
                  onclick={() => handleNotificationClick(item.id)}
                  class="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors {item.unread ? 'bg-blue-50/30' : ''}"
                >
                  <div class="w-8 h-8 rounded-lg {colors.bg} flex items-center justify-center flex-shrink-0 mt-0.5">
                    <IconComp class="w-4 h-4" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                      <h4 class="text-xs {item.unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'} truncate">
                        {item.title}
                      </h4>
                      <span class="text-[10px] font-mono text-slate-400 flex-shrink-0">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                    <p class="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{item.message}</p>
                  </div>
                  {#if item.unread}
                    <span class="w-2 h-2 rounded-full bg-[#1d63d8] flex-shrink-0 mt-2"></span>
                  {/if}
                </a>
              {/each}
            {/if}
          </div>

          <!-- Dropdown Footer -->
          <div class="px-4 pt-2 pb-1 border-t border-slate-100 text-center">
            <a
              href="/"
              onclick={() => (showNotificationMenu = false)}
              class="block py-1 text-xs font-semibold text-[#1d63d8] hover:underline"
            >
              Lihat Semua Notifikasi
            </a>
          </div>
        </div>
      {/if}
    </div>

    <!-- User Profile Dropdown (Reaktif dengan authStore) -->
    <div class="relative">
      <button
        type="button"
        onclick={() => {
          showProfileMenu = !showProfileMenu;
          if (showProfileMenu) showNotificationMenu = false;
        }}
        class="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 py-1 px-2 rounded-xl transition-colors focus:outline-none"
      >
        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 text-white flex items-center justify-center font-bold text-xs ring-2 ring-blue-100 overflow-hidden">
          {#if authStore.user?.avatarUrl}
            <img
              src={authStore.user.avatarUrl}
              alt={authStore.user?.fullName || "User Avatar"}
              class="w-full h-full object-cover"
              onerror={(e) => ((e.currentTarget as HTMLElement).style.display = 'none')}
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
            href="/pengaturan?tab=profil"
            onclick={() => (showProfileMenu = false)}
            class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <User class="w-4 h-4 text-slate-400" />
            <span>Profil & PIN Saya</span>
          </a>
          {#if authStore.user?.role !== "GUEST"}
            <a
              href="/pengaturan"
              onclick={() => (showProfileMenu = false)}
              class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700 transition-colors"
            >
              <Settings class="w-4 h-4 text-slate-400" />
              <span>Pengaturan Apotek</span>
            </a>
          {/if}
          <div class="border-t border-slate-100 my-1"></div>
          <button
            type="button"
            onclick={handleLogout}
            class="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-[#df1c2d] transition-colors cursor-pointer"
          >
            <LogOut class="w-4 h-4 text-[#df1c2d]" />
            <span>Keluar / Ganti Akun</span>
          </button>
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
