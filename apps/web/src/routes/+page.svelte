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

  let totalTransactions = $state("125.402");
  let customerCount = $state("366");

  onMount(async () => {
    try {
      const res = await api.erp.getStats();
      if (res?.success && res.data) {
        if (res.data.totalSalesTransactions) {
          totalTransactions = Number(res.data.totalSalesTransactions).toLocaleString("id-ID");
        }
        if (res.data.totalCustomers) {
          customerCount = Number(res.data.totalCustomers).toLocaleString("id-ID");
        }
      }
    } catch (_) {}
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
    salesToday="Rp 4.850.000"
    salesTrend="12% dari kemarin"
    {totalTransactions}
    transactionTrend="Historis & POS Aktif"
    lowStockCount="5 item"
    newCustomers={customerCount}
    customerTrend="Pelanggan terdaftar"
  />

  <!-- 3. MIDDLE ROW: 3 CARDS (CHART, LOW STOCK, RECENT TRANSACTIONS) -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
    <!-- Chart: Grafik Penjualan 7 Hari Terakhir (Span 4) -->
    <div class="lg:col-span-12 xl:col-span-4 flex min-h-0 flex-col">
      <SalesChart />
    </div>

    <!-- Table: Stok Menipis (Span 3) -->
    <div class="lg:col-span-5 xl:col-span-3 relative flex min-h-0 flex-col">
      <LowStockTable />
    </div>

    <!-- Table: Transaksi Terbaru (Span 5) -->
    <div class="lg:col-span-7 xl:col-span-5 relative flex min-h-0 flex-col">
      <RecentTransactionsTable />
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
      <NotificationsCard />
    </div>
  </div>

  <!-- 5. FOOTER -->
  <Footer />
</div>
