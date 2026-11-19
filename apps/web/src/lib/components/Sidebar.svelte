<script lang="ts">
  import { page } from "$app/stores";
  import {
    LayoutDashboard,
    ShoppingCart,
    ShoppingBag,
    Package,
    FileText,
    RotateCcw,
    Users,
    Truck,
    ArrowLeftRight,
    Building2,
    CircleDollarSign,
    BarChart3,
    Settings,
    LogOut,
    Menu,
    X,
    Monitor,
    Receipt,
    Wifi,
    Cloud,
    ShieldCheck,
    ShieldAlert,
    User
  } from "lucide-svelte";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { tenantStore } from "$lib/stores/tenantStore.svelte";
  import {
    filterNavigationGroups,
    type PermissionKey,
    type UserRole as CoreUserRole
  } from "@apoteku/core";

  let { isMobileOpen = $bindable(false) } = $props();

  interface MenuItem {
    name: string;
    href: string;
    icon: any;
    permission?: PermissionKey;
    badge?: string;
    badgeVariant?: "offline" | "cloud" | "kiosk";
  }

  interface MenuGroup {
    title: string;
    type: "offline" | "online" | "first";
    typeLabel: string;
    items: MenuItem[];
  }

  const menuGroups: MenuGroup[] = [
    {
      title: "",
      type: "first",
      typeLabel: "",
      items: [
        {
          name: "Dashboard Utama",
          href: "/",
          permission: "dashboard:view",
          icon: LayoutDashboard
        },
      ]
    },
    {
      title: "OPERASIONAL",
      type: "offline",
      typeLabel: "OFFLINE-FIRST",
      items: [
        {
          name: "Kasir POS (Kiosk)",
          href: "/pos",
          permission: "pos:access",
          icon: Monitor,
          badge: "Kiosk",
          badgeVariant: "kiosk"
        },
        {
          name: "Riwayat Penjualan",
          href: "/penjualan",
          permission: "sales:read",
          icon: Receipt
        },
        {
          name: "Pelayanan & Resep",
          href: "/pelayanan",
          permission: "prescription:read",
          icon: FileText
        },
        {
          name: "Stok Obat Depo",
          href: "/stok",
          permission: "inventory:read",
          icon: Package
        }
      ]
    },
    {
      title: "LOGISTIK",
      type: "online",
      typeLabel: "ONLINE ERP",
      items: [
        {
          name: "Pembelian & PBF",
          href: "/pembelian",
          permission: "purchase:read",
          icon: ShoppingBag
        },
        {
          name: "Mutasi Antar Cabang",
          href: "/pengiriman",
          permission: "inventory:transfer",
          icon: ArrowLeftRight
        },
        {
          name: "Retur Barang",
          href: "/retur",
          permission: "returns:read",
          icon: RotateCcw
        },
        {
          name: "Distributor / PBF",
          href: "/supplier",
          permission: "supplier:manage",
          icon: Building2
        }
      ]
    },
    {
      title: "MANAJEMEN",
      type: "online",
      typeLabel: "BACK-OFFICE",
      items: [
        {
          name: "Pelanggan & Piutang",
          href: "/pelanggan",
          permission: "customer:read",
          icon: Users
        },
        {
          name: "Keuangan & Kas",
          href: "/keuangan",
          permission: "finance:read",
          icon: CircleDollarSign
        },
        {
          name: "Laporan & SIPNAP",
          href: "/laporan",
          permission: "reports:view",
          icon: BarChart3
        },
        {
          name: "Pengaturan Sistem",
          href: "/pengaturan",
          permission: "settings:tenant:edit",
          icon: Settings
        }
      ]
    }
  ];

  let userRole = $derived(
    (authStore.user?.role === "INVENTORY_STAFF"
      ? "INVENTORY"
      : authStore.user?.role || "GUEST") as CoreUserRole
  );

  let activeMenuGroups = $derived(
    filterNavigationGroups(userRole, menuGroups, authStore.user?.permissions)
  );

  function isActive(href: string) {
    if (href === "/") return $page.url.pathname === "/";
    return $page.url.pathname.startsWith(href) && href !== "/";
  }
</script>

<!-- BACKDROP FOR MOBILE -->
{#if isMobileOpen}
  <div
    class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
    onclick={() => (isMobileOpen = false)}
    role="presentation"
  ></div>
{/if}

<!-- SIDEBAR ASIDE -->
<aside
  class="fixed top-0 bottom-0 left-0 z-50 w-64 bg-gradient-to-b from-[#023075] via-[#2b5394] from-60% to-[#3f639b] text-white flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out lg:translate-x-0 {isMobileOpen ? 'translate-x-0' : '-translate-x-full'}"
>
  <!-- TOP: BRAND LOGO CONTAINER -->
  <div class="flex flex-col items-center flex-shrink-0">
    <!-- Brand Logo in curved white container matching mockup -->
    <div class="w-full flex items-center justify-center relative">
      <img
        src="/img/backdrop-logo.png"
        alt="Backdrop Logo"
        class="w-full h-full"
      />
      <img
        src={tenantStore.current.logoUrl || "/img/brand.png"}
        alt={tenantStore.current.name || "Hafidz Farma Apotek"}
        class="absolute h-32 w-auto object-contain max-w-[200px]"
      />
      <!-- Close button on mobile -->
      <button
        onclick={() => (isMobileOpen = false)}
        class="absolute top-2 right-2 text-slate-400 hover:text-slate-600 lg:hidden"
        aria-label="Tutup Menu"
      >
        <X class="w-5 h-5" />
      </button>
    </div>
  </div>

  <!-- MIDDLE: VERTICAL MENU ITEMS GROUPED -->
  <nav class="flex-1 px-3 py-3 overflow-y-auto space-y-4 no-scrollbar">
    {#if authStore.user?.role === "GUEST"}
      <div class="px-2 py-3 space-y-3">
        <a
          href="/pengaturan?tab=profil"
          onclick={() => (isMobileOpen = false)}
          class="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#df1c2d] to-[#073e92] text-white text-xs font-bold shadow-md cursor-pointer"
        >
          <User class="w-4 h-4" />
          <span>Profil & PIN Saya</span>
        </a>
      </div>
    {:else}
      {#each activeMenuGroups as group}
        <div class="space-y-1">
          <!-- GROUP SECTION HEADER -->
          <div class="flex items-center justify-between px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-300/80">
            {#if group.type !== "first"}
            <span class="flex items-center gap-1.5">
              {#if group.type === "offline"}
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
              {:else}
                <span class="w-1.5 h-1.5 rounded-full bg-sky-300"></span>
              {/if}
              {group.title}
            </span>
            <span class="text-[9px] px-1.5 py-0.5 rounded font-medium tracking-normal {group.type === 'offline' ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30' : 'bg-white/10 text-slate-300'}">
              {group.typeLabel}
            </span>
            {/if}
          </div>

          <!-- MENU ITEMS IN GROUP -->
          {#each group.items as item}
            {@const active = isActive(item.href)}
            <a
              href={item.href}
              onclick={() => (isMobileOpen = false)}
              class="flex items-center justify-between px-3.5 py-2.2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-150 {active
                ? 'bg-gradient-to-r from-[#df1c2d] from-60% to-[#073e92] text-white px-4 py-2 rounded-lg shadow-md'
                : 'text-slate-200/90 hover:bg-white/10 hover:text-white px-4 py-1'}"
            >
              <div class="flex items-center gap-3 min-w-0">
                <item.icon class="w-4 h-4 flex-shrink-0 {active ? 'text-white' : 'text-slate-300'}" />
                <span class="truncate">{item.name}</span>
              </div>
              {#if item.badge}
                <span class="ml-2 text-[9px] px-1.5 py-0.5 rounded-full uppercase font-bold tracking-wider {item.badgeVariant === 'kiosk' ? 'bg-amber-400 text-slate-900 shadow-sm' : 'bg-white/20 text-white'}">
                  {item.badge}
                </span>
              {/if}
            </a>
          {/each}
        </div>
      {/each}
    {/if}
  </nav>

  <!-- BOTTOM: SYSTEM STATUS PILL -->
  <div class="px-3 py-2.5 border-t border-white/10 bg-black/10 flex-shrink-0">
    <div class="flex items-center justify-between text-[11px] text-slate-300 px-2 py-1">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="font-medium text-slate-200">Apoteku Sync v2.2</span>
      </div>
      <span class="text-[10px] text-slate-400">Multi-Cabang</span>
    </div>
  </div>
</aside>
