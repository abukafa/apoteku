<script lang="ts">
  import { onMount } from "svelte";
  import HeroBanner from "$lib/components/HeroBanner.svelte";
  import KpiCards from "$lib/components/KpiCards.svelte";
  import SalesChart from "$lib/components/SalesChart.svelte";
  import LowStockTable from "$lib/components/LowStockTable.svelte";
  import RecentTransactionsTable from "$lib/components/RecentTransactionsTable.svelte";
  import QuickMenuGrid from "$lib/components/QuickMenuGrid.svelte";
  import NotificationsCard from "$lib/components/NotificationsCard.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { api } from "$lib/services/api";

  let salesToday = $state("Rp 0");
  let salesTrend = $state("0% dari kemarin");
  let totalTransactions = $state("0");
  let transactionTrend = $state("Transaksi tercatat");
  let lowStockCount = $state("0 item");
  let customerCount = $state("0");
  let customerTrend = $state("Pelanggan terdaftar");

  let chartData = $state<any[]>([]);
  let lowStockItems = $state<any[]>([]);
  let notifications = $state<any[]>([]);
  let recentTransactions = $state<any[]>([]);

  onMount(async () => {
    try {
      const [dashRes, salesRes] = await Promise.all([
        api.erp.getDashboard(),
        api.erp.getSales(5)
      ]);

      if (dashRes?.success && dashRes.data) {
        const { kpi, chartData: chart, lowStockItems: lowStock, notifications: notifs } = dashRes.data;

        // KPI 1: Total Penjualan Hari Ini
        const todayVal = Number(kpi.todaySales || 0);
        const yestVal = Number(kpi.yesterdaySales || 0);
        salesToday = `Rp ${Math.round(todayVal).toLocaleString("id-ID")}`;

        if (yestVal > 0) {
          const diffPct = Math.round(((todayVal - yestVal) / yestVal) * 100);
          salesTrend = `${diffPct >= 0 ? "+" : ""}${diffPct}% dari kemarin`;
        } else if (todayVal > 0) {
          salesTrend = "+100% dari kemarin";
        } else {
          salesTrend = yestVal > 0 ? `Kemarin: Rp ${Math.round(yestVal).toLocaleString("id-ID")}` : "Belum ada penjualan";
        }

        // KPI 2: Jumlah Transaksi
        const todayTrx = Number(kpi.todayTrxCount || 0);
        const totalTrx = Number(kpi.totalSalesTransactions || 0);
        totalTransactions = todayTrx > 0 ? todayTrx.toLocaleString("id-ID") : totalTrx.toLocaleString("id-ID");
        transactionTrend = todayTrx > 0 ? `${todayTrx} transaksi hari ini` : `${totalTrx} transaksi tersimpan`;

        // KPI 3: Stok Menipis
        const lowCount = Number(kpi.lowStockCount || 0);
        lowStockCount = `${lowCount} item`;

        // KPI 4: Pelanggan
        const custVal = Number(kpi.totalCustomers || 0);
        customerCount = custVal.toLocaleString("id-ID");
        customerTrend = "Pelanggan terdaftar";

        // Grafik 7 Hari, Stok Menipis & Notifikasi
        if (Array.isArray(chart)) chartData = chart;
        if (Array.isArray(lowStock)) lowStockItems = lowStock;
        if (Array.isArray(notifs)) notifications = notifs;
      }

      if (salesRes?.success && Array.isArray(salesRes.data)) {
        recentTransactions = salesRes.data;
      }
    } catch (err) {
      console.error("Dashboard mount error:", err);
    }
  });
</script>

<svelte:head>
  <title>Dashboard &bull; Hafidz Farma</title>
</svelte:head>

<div class="space-y-6">
  <!-- 1. HERO BANNER -->
  <HeroBanner />

  <!-- 2. KPI 4 SUMMARY CARDS -->
  <KpiCards
    {salesToday}
    {salesTrend}
    {totalTransactions}
    {transactionTrend}
    {lowStockCount}
    newCustomers={customerCount}
    {customerTrend}
  />

  <!-- 3. MIDDLE ROW: 3 CARDS (CHART, LOW STOCK, RECENT TRANSACTIONS) -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
    <!-- Chart: Grafik Penjualan 7 Hari Terakhir (Span 4) -->
    <div class="lg:col-span-12 xl:col-span-4 flex min-h-0 flex-col">
      <SalesChart {chartData} />
    </div>

    <!-- Table: Stok Menipis (Span 3) -->
    <div class="lg:col-span-5 xl:col-span-3 relative flex min-h-0 flex-col">
      <LowStockTable items={lowStockItems} />
    </div>

    <!-- Table: Transaksi Terbaru (Span 5) -->
    <div class="lg:col-span-7 xl:col-span-5 relative flex min-h-0 flex-col">
      <RecentTransactionsTable {recentTransactions} />
    </div>
  </div>

  <!-- 4. BOTTOM ROW: 2 CARDS (MENU UTAMA & NOTIFIKASI) -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
    <!-- Menu Utama: 10 Icon Grid (Span 8) -->
    <div class="lg:col-span-7 xl:col-span-8 flex min-h-0 flex-col">
      <QuickMenuGrid />
    </div>

    <!-- Notifikasi & Pengingat (Span 4) -->
    <div class="lg:col-span-5 xl:col-span-4 relative flex min-h-0 flex-col">
      <NotificationsCard {notifications} />
    </div>
  </div>

  <!-- 5. FOOTER -->
  <Footer />
</div>
