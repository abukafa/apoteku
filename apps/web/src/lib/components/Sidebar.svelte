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
    Menu,
    X
  } from "lucide-svelte";

  let { isMobileOpen = $bindable(false) } = $props();

  const menuItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Penjualan", href: "/pos", icon: ShoppingCart },
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
  class="fixed top-0 bottom-0 left-0 z-50 w-64 bg-gradient-to-b from-[#0e2a6d] via-[#0c245e] to-[#081a44] text-white flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out lg:translate-x-0 {isMobileOpen ? 'translate-x-0' : '-translate-x-full'}"
>
  <!-- TOP: BRAND LOGO CONTAINER -->
  <div class="p-4 flex flex-col items-center">
    <!-- Brand Logo in curved white container matching mockup -->
    <div class="w-full bg-white rounded-2xl py-3 px-4 shadow-md flex items-center justify-center relative">
      <img
        src="/img/brand.png"
        alt="Hafidz Farma Apotek"
        class="h-14 w-auto object-contain"
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
          ? 'bg-[#df1c2d] text-white shadow-md shadow-red-900/30 font-bold'
          : 'text-slate-200/90 hover:bg-white/10 hover:text-white'}"
      >
        <item.icon class="w-4 h-4 flex-shrink-0 {active ? 'text-white' : 'text-slate-300'}" />
        <span class="truncate">{item.name}</span>
      </a>
    {/each}
  </nav>

  <!-- BOTTOM: FAMILY BADGE & SLOGAN -->
  <div class="p-4 pt-2 flex flex-col items-center border-t border-white/10 text-center">
    <div class="w-16 h-16 mb-1.5 flex items-center justify-center">
      <img
        src="/img/heart.png"
        alt="Keluarga Hafidz Farma"
        class="w-full h-full object-contain drop-shadow"
      />
    </div>
    <div class="font-script text-white text-base tracking-wide italic leading-tight">
      Ikhtiar sehat keluarga
    </div>
  </div>
</aside>
