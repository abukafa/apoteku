<script lang="ts">
  import { page } from "$app/state";
  import {
    LayoutDashboard,
    ShoppingCart,
    ShoppingBag,
    Package,
    FileText,
    RotateCcw,
    Users,
    Truck,
    CircleDollarSign,
    BarChart3,
    Settings,
    LogOut,
    Menu,
    X
  } from "lucide-svelte";

  let { isMobileOpen = $bindable(false) } = $props();

  const menuItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Penjualan (POS)", href: "/pos", icon: ShoppingCart },
    { name: "Pembelian", href: "#pembelian", icon: ShoppingBag },
    { name: "Stok Obat", href: "#stok", icon: Package },
    { name: "Pelayanan Kefarmasian", href: "#pelayanan", icon: FileText },
    { name: "Retur", href: "#retur", icon: RotateCcw },
    { name: "Pelanggan", href: "#pelanggan", icon: Users },
    { name: "Supplier / PBF", href: "#supplier", icon: Truck },
    { name: "Keuangan", href: "#keuangan", icon: CircleDollarSign },
    { name: "Laporan", href: "#laporan", icon: BarChart3 },
    { name: "Pengaturan", href: "#pengaturan", icon: Settings }
  ];

  function isActive(href: string) {
    if (href === "/") return page.url.pathname === "/";
    return page.url.pathname.startsWith(href) && href !== "/";
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
  class="fixed top-0 bottom-0 left-0 z-50 w-64 bg-gradient-to-b from-[#023075] via-[#2b5394]  from-60% to-[#3f639b] text-white flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out lg:translate-x-0 {isMobileOpen ? 'translate-x-0' : '-translate-x-full'}"
>
  <!-- TOP: BRAND LOGO CONTAINER -->
  <div class="flex flex-col items-center">
    <!-- Brand Logo in curved white container matching mockup -->
    <div class="w-full flex items-center justify-center relative">
      <img
        src="/img/backdrop-logo.png"
        alt="Backdrop Logo"
        class="w-full h-full"
      />
      <img
        src="/img/brand.png"
        alt="Hafidz Farma Apotek"
        class="absolute h-32 w-auto object-contain"
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

  <!-- MIDDLE: VERTICAL MENU ITEMS -->
  <nav class="flex-1 px-3 py-2 overflow-y-auto space-y-1 scrollbar-thin">
    {#each menuItems as item}
      {@const active = isActive(item.href)}
      <a
        href={item.href}
        onclick={() => (isMobileOpen = false)}
        class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-150 {active
          ? 'bg-gradient-to-r from-[#df1c2d] from-60% to-[#073e92] text-white px-4 py-2 rounded-lg'
          : 'text-slate-200/90 hover:bg-white/10 hover:text-white'}"
      >
        <item.icon class="w-4 h-4 flex-shrink-0 {active ? 'text-white' : 'text-slate-300'}" />
        <span class="truncate">{item.name}</span>
      </a>
    {/each}
  </nav>
</aside>
