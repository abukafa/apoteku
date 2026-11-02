<script lang="ts">
  import HeroBanner from "$lib/components/HeroBanner.svelte";
  import KpiCards from "$lib/components/KpiCards.svelte";
  import SalesChart from "$lib/components/SalesChart.svelte";
  import LowStockTable from "$lib/components/LowStockTable.svelte";
  import RecentTransactionsTable from "$lib/components/RecentTransactionsTable.svelte";
  import QuickMenuGrid from "$lib/components/QuickMenuGrid.svelte";
  import NotificationsCard from "$lib/components/NotificationsCard.svelte";
  import Footer from "$lib/components/Footer.svelte";
</script>

<svelte:head>
  <title>Dashboard — Hafidz Farma Apotek</title>
</svelte:head>

<div class="space-y-6">
  <!-- 1. HERO BANNER -->
  <HeroBanner />

  <!-- 2. KPI 4 SUMMARY CARDS -->
  <KpiCards
    salesToday="Rp 4.850.000"
    salesTrend="12% dari kemarin"
    totalTransactions="28"
    transactionTrend="8% dari kemarin"
    lowStockCount="5 item"
    newCustomers="3"
    customerTrend="50% dari kemarin"
  />

  <!-- 3. MIDDLE ROW: 3 CARDS (CHART, LOW STOCK, RECENT TRANSACTIONS) -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
    <!-- Chart: Grafik Penjualan 7 Hari Terakhir (Span 4) -->
    <div class="lg:col-span-12 xl:col-span-4 flex flex-col">
      <SalesChart />
    </div>

    <!-- Table: Stok Menipis (Span 3) -->
    <div class="lg:col-span-5 xl:col-span-3 flex flex-col">
      <LowStockTable />
    </div>

    <!-- Table: Transaksi Terbaru (Span 5) -->
    <div class="lg:col-span-7 xl:col-span-5 flex flex-col">
      <RecentTransactionsTable />
    </div>
  </div>

  <!-- 4. BOTTOM ROW: 2 CARDS (MENU UTAMA & NOTIFIKASI) -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
    <!-- Menu Utama: 10 Icon Grid (Span 8) -->
    <div class="lg:col-span-7 xl:col-span-8 flex flex-col">
      <QuickMenuGrid />
    </div>

    <!-- Notifikasi & Pengingat (Span 4) -->
    <div class="lg:col-span-5 xl:col-span-4 flex flex-col">
      <NotificationsCard />
    </div>
  </div>

  <!-- 5. FOOTER -->
  <Footer />
</div>
