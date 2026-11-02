<script lang="ts">
  import { onMount } from "svelte";
  import {
    Search,
    Bell,
    User,
    Clock,
    Activity,
    ShieldCheck,
    TrendingUp,
    AlertTriangle,
    Layers,
    ChevronRight
  } from "lucide-svelte";

  // Reactive state using Svelte 5 Runes
  let currentTime = $state("");
  let currentDate = $state("");

  const quickMenus = [
    { name: "Penjualan (POS)", icon: "/img/icon-penjualan.png", href: "#", color: "from-blue-500/10 to-blue-600/5", badge: "KASIR" },
    { name: "Pemesanan PO", icon: "/img/icon-pemesanan.png", href: "#", color: "from-cyan-500/10 to-cyan-600/5" },
    { name: "Pembelian PBF", icon: "/img/icon-pembelian.png", href: "#", color: "from-indigo-500/10 to-indigo-600/5" },
    { name: "Stok Obat & ED", icon: "/img/icon-obat.png", href: "#", color: "from-emerald-500/10 to-emerald-600/5", badge: "FEFO" },
    { name: "Retur Obat", icon: "/img/icon-return.png", href: "#", color: "from-amber-500/10 to-amber-600/5" },
    { name: "Data Pelanggan", icon: "/img/icon-pelanggan.png", href: "#", color: "from-purple-500/10 to-purple-600/5" },
    { name: "Supplier PBF", icon: "/img/icon-suplier.png", href: "#", color: "from-teal-500/10 to-teal-600/5" },
    { name: "Arus Kas & Bank", icon: "/img/icon-keuangan.png", href: "#", color: "from-rose-500/10 to-rose-600/5" },
    { name: "Laporan & PnL", icon: "/img/icon-laporan.png", href: "#", color: "from-blue-600/10 to-blue-700/5" },
    { name: "Pengaturan Cabang", icon: "/img/icon-pengaturan.png", href: "#", color: "from-slate-500/10 to-slate-600/5" },
  ];

  const kpis = [
    { title: "Omzet Hari Ini", value: "Rp 4.850.000", change: "+12.4% vs kemarin", trend: "up", color: "text-emerald-600" },
    { title: "Transaksi Kasir", value: "28 Trx", change: "Rata-rata Rp 173.200", trend: "up", color: "text-brand-blue-500" },
    { title: "Peringatan Stok Kritis", value: "5 Item", change: "Perlu re-order PBF", trend: "warning", color: "text-brand-red-500" },
    { title: "Pasien / Member Baru", value: "3 Pasien", change: "Terdaftar hari ini", trend: "up", color: "text-purple-600" },
  ];

  onMount(() => {
    const updateTime = () => {
      const now = new Date();
      currentTime = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      currentDate = now.toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  });
</script>

<svelte:head>
  <title>Apoteku.com — Sistem Apotek Hafidz Farma</title>
</svelte:head>

<!-- TOPBAR NAVIGATION -->
<header class="bg-white border-b border-surface-border sticky top-0 z-30 shadow-card">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
    <!-- Brand Logo -->
    <div class="flex items-center gap-3">
      <img src="/img/brand.png" alt="Apotek Hafidz Farma" class="h-10 w-auto object-contain" />
      <div class="hidden sm:block">
        <div class="text-xs font-bold text-brand-blue tracking-wide uppercase">Apoteku.com Cloud</div>
        <div class="text-[11px] text-slate-500 font-medium">Hafidz Farma Grup</div>
      </div>
    </div>

    <!-- Search Bar -->
    <div class="flex-1 max-w-md hidden md:block">
      <div class="relative">
        <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Cari obat, zat aktif, barcode, atau pelanggan..."
          class="w-full bg-surface-base pl-9 pr-4 py-1.5 text-sm rounded-lg border border-surface-border focus:outline-none focus:ring-2 focus:ring-brand-blue-500/20 focus:border-brand-blue-500 transition-colors"
        />
      </div>
    </div>

    <!-- User & Status Actions -->
    <div class="flex items-center gap-3">
      <!-- Clock -->
      <div class="hidden lg:flex items-center gap-2 px-3 py-1 bg-surface-base rounded-md border border-surface-border text-xs text-slate-600 font-mono">
        <Clock class="w-3.5 h-3.5 text-slate-400" />
        <span>{currentTime || "00:00:00"}</span>
      </div>

      <!-- Notifications -->
      <button class="relative p-2 text-slate-500 hover:text-brand-blue hover:bg-slate-100 rounded-lg transition-colors" aria-label="Notifikasi">
        <Bell class="w-5 h-5" />
        <span class="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-red rounded-full"></span>
      </button>

      <!-- Profile -->
      <div class="flex items-center gap-2 pl-2 border-l border-surface-border">
        <div class="w-8 h-8 rounded-full bg-brand-blue text-white flex items-center justify-center font-bold text-xs">
          HF
        </div>
        <div class="hidden sm:block text-left">
          <div class="text-xs font-semibold text-slate-800">Admin Pusat</div>
          <div class="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
            <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            Online
          </div>
        </div>
      </div>
    </div>
  </div>
</header>

<!-- MAIN CONTENT WRAPPER -->
<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

  <!-- HERO BANNER -->
  <div class="relative rounded-2xl overflow-hidden shadow-elevated border border-surface-border bg-brand-blue-900 text-white min-h-[170px] flex items-center">
    <img
      src="/img/banner.jfif"
      alt="Apotek Hafidz Farma Banner"
      class="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30"
    />
    <div class="relative z-10 p-6 sm:p-8 max-w-2xl">
      <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-semibold text-cyan-200 border border-white/20 mb-3">
        <ShieldCheck class="w-3.5 h-3.5" />
        Tahap 1: Monorepo & UI Shell Active (Svelte 5 Runes)
      </div>
      <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight">
        Apotek Hafidz Farma
      </h1>
      <p class="text-slate-200 text-sm mt-1">
        Sistem Operasional Apotek Tersentralisasi Multi-Cabang & POS Farmasi. Ikhtiar Sehat Keluarga.
      </p>
    </div>
  </div>

  <!-- KPI SUMMARY CARDS -->
  <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {#each kpis as kpi}
      <div class="bg-white p-4 rounded-xl border border-surface-border shadow-card hover:border-brand-blue-300 transition-all">
        <div class="text-xs font-medium text-slate-500">{kpi.title}</div>
        <div class="text-xl font-bold mt-1 text-slate-900">{kpi.value}</div>
        <div class="text-xs mt-1.5 font-medium {kpi.color} flex items-center gap-1">
          <Activity class="w-3 h-3" />
          <span>{kpi.change}</span>
        </div>
      </div>
    {/each}
  </section>

  <!-- QUICK ACTIONS 10 ICON MENU GRID -->
  <section class="space-y-3">
    <div class="flex items-center justify-between">
      <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
        <Layers class="w-4 h-4 text-brand-blue" />
        Menu Utama & Akses Cepat (POS & ERP)
      </h2>
      <span class="text-xs text-slate-500">10 Modul Terintegrasi</span>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {#each quickMenus as menu}
        <a
          href={menu.href}
          class="group relative bg-white rounded-xl p-4 border border-surface-border hover:border-brand-blue-500 hover:shadow-elevated transition-all flex flex-col items-center text-center bg-gradient-to-br {menu.color}"
        >
          {#if menu.badge}
            <span class="absolute top-2 right-2 bg-brand-blue text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
              {menu.badge}
            </span>
          {/if}
          <div class="w-14 h-14 rounded-xl flex items-center justify-center p-2 mb-2 group-hover:scale-105 transition-transform">
            <img src={menu.icon} alt={menu.name} class="w-full h-full object-contain drop-shadow" />
          </div>
          <span class="text-xs font-semibold text-slate-800 group-hover:text-brand-blue transition-colors line-clamp-1">
            {menu.name}
          </span>
          <span class="text-[10px] text-slate-500 mt-0.5 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
            Buka Modul <ChevronRight class="w-2.5 h-2.5" />
          </span>
        </a>
      {/each}
    </div>
  </section>

  <!-- WORKSPACE STATUS BANNER -->
  <section class="bg-brand-blue-50 rounded-xl p-4 border border-brand-blue-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-lg bg-brand-blue text-white flex items-center justify-center font-bold">
        T1
      </div>
      <div>
        <div class="text-sm font-bold text-brand-blue-900">Fondasi Monorepo & UI Shell Aktif</div>
        <div class="text-xs text-slate-600">
          Paket <code class="bg-white px-1.5 py-0.5 rounded text-brand-blue font-mono font-semibold">@apoteku/core</code> dan <code class="bg-white px-1.5 py-0.5 rounded text-brand-blue font-mono font-semibold">@apoteku/db</code> telah siap di-linking.
        </div>
      </div>
    </div>
    <div class="flex items-center gap-2 text-xs font-medium text-brand-blue-700 bg-white px-3 py-1.5 rounded-lg border border-brand-blue-200">
      <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
      Siap untuk Tahap 2: Mock Data Produk
    </div>
  </section>

</main>

<!-- FOOTER -->
<footer class="mt-auto border-t border-surface-border bg-white py-4 text-center text-xs text-slate-500">
  <div class="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
    <div>&copy; 2026 Hafidz Farma Grup. Seluruh hak cipta dilindungi undang-undang.</div>
    <div class="font-medium text-brand-blue">"Ikhtiar Sehat Keluarga"</div>
  </div>
</footer>
