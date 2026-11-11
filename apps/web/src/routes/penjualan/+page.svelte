<script lang="ts">
  import {
    ShoppingCart,
    Store,
    ArrowUpRight,
    DollarSign,
    FileText,
    Calendar,
    Filter,
    Search,
    Printer,
    CheckCircle2,
    Clock,
    AlertCircle,
    Eye,
    X,
    Truck,
    Users,
    Stethoscope,
    ChevronRight,
    CreditCard,
    QrCode,
    Banknote,
    Download
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import ThermalReceiptSheet, {
    mapSaleToThermalReceipt,
    triggerThermalPrint,
    type ThermalReceiptData
  } from "$lib/components/ui/ThermalReceiptSheet.svelte";
  import { portal } from "$lib/actions/portal";
  import { onMount, onDestroy } from "svelte";
  import { api } from "$lib/services/api";
  import { alertStore } from "$lib/stores/alertStore.svelte";
  import { formatRupiah } from "@apoteku/core";

  // Reactive state
  let sales = $state<any[]>([]);
  let isLoading = $state(false);
  let summary = $state({
    totalSalesToday: 0,
    transactionsToday: 0,
    totalPrescriptions: 0,
    unpaidReceivables: 0,
    totalSalesMonth: 0,
    averageBasketSize: 0
  });

  let activeTab = $state<"SEMUA" | "UMUM" | "RESEP" | "GROSIR" | "TEMPO" | "DELIVERY">("SEMUA");
  let searchQuery = $state("");
  let selectedPaymentFilter = $state<string>("ALL");

  // Paginasi
  let currentPage = $state(1);
  let pageSize = $state(15);

  onMount(async () => {
    isLoading = true;
    try {
      const res = await api.erp.getSales(250);
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        sales = res.data;

        // Hitung metrik dinamis dari data transaksi API
        const totalRev = sales.reduce((acc, cur) => acc + (Number(cur.grandTotal) || 0), 0);
        const resepCount = sales.filter((s) => s.transactionType === "RESEP").length;
        const unpaidTempo = sales
          .filter((s) => s.paymentMethod === "TEMPO" || s.paymentStatus !== "PAID")
          .reduce(
            (acc, cur) =>
              acc + Math.max(0, (Number(cur.grandTotal) || 0) - (Number(cur.paidAmount) || 0)),
            0
          );

        summary.totalSalesToday = totalRev;
        summary.transactionsToday = sales.length;
        summary.totalPrescriptions = resepCount;
        summary.unpaidReceivables = unpaidTempo;
        summary.totalSalesMonth = totalRev;
        summary.averageBasketSize = sales.length > 0 ? Math.round(totalRev / sales.length) : 0;
      }
    } catch (e) {
      console.warn("[Penjualan] Gagal memuat data penjualan dari API:", e);
    } finally {
      isLoading = false;
    }
  });

  // Modal Detail State
  let selectedTransaction = $state<any | null>(null);
  let isDetailModalOpen = $state(false);

  // Filtered sales derived
  let filteredSales = $derived(
    sales.filter((item) => {
      // Tab filter
      if (activeTab !== "SEMUA" && item.transactionType !== activeTab) {
        return false;
      }
      // Payment filter
      if (selectedPaymentFilter !== "ALL" && item.paymentMethod !== selectedPaymentFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const matchesInvoice = (item.invoiceNo || item.invoiceNumber || "").toLowerCase().includes(query);
        const matchesCustomer = (item.customerName || "").toLowerCase().includes(query);
        const matchesPatient = item.patientName?.toLowerCase().includes(query) ?? false;
        const matchesCashier = (item.cashierName || "").toLowerCase().includes(query);
        return matchesInvoice || matchesCustomer || matchesPatient || matchesCashier;
      }
      return true;
    })
  );

  let totalPages = $derived(Math.max(1, Math.ceil(filteredSales.length / pageSize)));
  let paginatedSales = $derived(
    filteredSales.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );

  function handleTabChange(tab: typeof activeTab) {
    activeTab = tab;
    currentPage = 1;
  }

  // Total filtered nominal
  let totalFilteredNominal = $derived(
    filteredSales.reduce((acc, curr) => acc + (Number(curr.grandTotal) || 0), 0)
  );

  function openDetail(trx: any) {
    selectedTransaction = trx;
    isDetailModalOpen = true;
  }

  // State Cetak Ulang Struk Thermal ESC/POS
  let activeReprintReceipt = $state<ThermalReceiptData | null>(null);
  let cleanupPrintListener: (() => void) | null = null;

  onDestroy(() => {
    cleanupPrintListener?.();
  });

  async function handleReprintThermal(trx: any) {
    if (!trx) return;
    cleanupPrintListener?.();
    activeReprintReceipt = mapSaleToThermalReceipt(trx);
    cleanupPrintListener = await triggerThermalPrint(() => {
      activeReprintReceipt = null;
    });
  }
</script>

<svelte:head>
  <title>Penjualan &bull; Hafidz Farma</title>
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Riwayat Penjualan"
    subtitle="Monitoring transaksi kasir POS dan penjualan."
    icon={ShoppingCart}
    breadcrumbs={[{ label: "Penjualan" }]}
  >
    {#snippet actions()}
      <button
        type="button"
        onclick={() => alertStore.toast("Mengunduh rekapan data penjualan format CSV / Excel...", "info", "Ekspor Data")}
        class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs"
      >
        <Download class="w-4 h-4 text-slate-500" />
        <span class="hidden sm:inline">Ekspor CSV</span>
      </button>

      <!-- CTA BUTTON MENUJU KASIR POS STANDALONE FULLSCREEN -->
      <a
        href="/pos"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-md hover:shadow-lg active:scale-95 group"
      >
        <Store class="w-4 h-4 transition-transform group-hover:scale-110" />
        <span>Buka Kasir POS</span>
        <ArrowUpRight class="w-4 h-4 opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
      </a>
    {/snippet}
  </PageHeader>

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Penjualan Hari Ini"
      value={formatRupiah(summary.totalSalesToday)}
      subtext={`${summary.transactionsToday} Struk Transaksi Selesai`}
      icon={DollarSign}
      variant="brand"
    />
    <MetricCard
      title="Resep Dokter"
      value={`${summary.totalPrescriptions} Resep`}
      subtext="Klinis (Tuslah & Embalase)"
      icon={Stethoscope}
      variant="brand"
    />
    <MetricCard
      title="Piutang (Tempo)"
      value={formatRupiah(summary.unpaidReceivables)}
      subtext="Klinik, Bidan, & Pasien"
      icon={Clock}
      variant="warning"
    />
    <MetricCard
      title="Omzet Bulan Ini"
      value={formatRupiah(summary.totalSalesMonth)}
      subtext={`Rata-rata: ${formatRupiah(summary.averageBasketSize)}`}
      icon={ShoppingCart}
      variant="success"
    />
  </div>

  <!-- TAB NAVIGASI JENIS TRANSAKSI (DOKUMEN PLAN) -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold overflow-x-auto pb-1 no-scrollbar">
    <button
      type="button"
      onclick={() => handleTabChange("SEMUA")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'SEMUA' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <ShoppingCart class="w-4 h-4" />
        <span>Semua Transaksi</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] {activeTab === 'SEMUA' ? 'bg-brand-blue-50 text-brand-blue-700' : 'bg-slate-100 text-slate-500'}">
          {sales.length}
        </span>
      </div>
      {#if activeTab === "SEMUA"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => handleTabChange("UMUM")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'UMUM' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <Banknote class="w-4 h-4" />
        <span>Umum / OTC Bebas</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-500">
          {sales.filter((s) => s.transactionType === "UMUM").length}
        </span>
      </div>
      {#if activeTab === "UMUM"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => handleTabChange("RESEP")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'RESEP' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <Stethoscope class="w-4 h-4" />
        <span>Resep Dokter & Racikan</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-500">
          {sales.filter((s) => s.transactionType === "RESEP").length}
        </span>
      </div>
      {#if activeTab === "RESEP"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => handleTabChange("GROSIR")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'GROSIR' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <Users class="w-4 h-4" />
        <span>Grosir & Bidan</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-500">
          {sales.filter((s) => s.transactionType === "GROSIR").length}
        </span>
      </div>
      {#if activeTab === "GROSIR"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => handleTabChange("TEMPO")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'TEMPO' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <Clock class="w-4 h-4" />
        <span>Piutang / Kredit Tempo</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-500">
          {sales.filter((s) => s.transactionType === "TEMPO").length}
        </span>
      </div>
      {#if activeTab === "TEMPO"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => handleTabChange("DELIVERY")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'DELIVERY' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <Truck class="w-4 h-4" />
        <span>Layanan Antar / Delivery</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-500">
          {sales.filter((s) => s.transactionType === "DELIVERY").length}
        </span>
      </div>
      {#if activeTab === "DELIVERY"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>
  </div>

  <!-- DATA TABLE PENJUALAN -->
  <DataTable
    title="Buku Catatan Penjualan"
    searchPlaceholder="Cari nomor faktur nota, nama pelanggan/pasien, atau nama kasir..."
    bind:searchValue={searchQuery}
    totalCount={filteredSales.length}
    currentPage={currentPage}
    totalPages={totalPages}
    pageSize={pageSize}
    onPageChange={(p) => (currentPage = p)}
    onSearchChange={() => (currentPage = 1)}
  >
    {#snippet filters()}
      <!-- Filter Pembayaran -->
      <div class="flex items-center gap-1.5 text-xs">
        <Select
          bind:value={selectedPaymentFilter}
          onchange={() => (currentPage = 1)}
          size="sm"
          align="right"
          options={[
            { value: "ALL", label: "Semua Pembayaran" },
            { value: "CASH", label: "Tunai (Cash)" },
            { value: "QRIS", label: "QRIS Dinamis" },
            { value: "TRANSFER", label: "Transfer Bank" },
            { value: "DEBIT", label: "Kartu Debit" },
            { value: "TEMPO", label: "Kredit Tempo" }
          ]}
        />
      </div>
    {/snippet}

    {#snippet header()}
      <th class="py-3 px-4">Faktur</th>
      <th class="py-3 px-4">Waktu Sif</th>
      <th class="py-3 px-4">Pelanggan</th>
      <th class="py-3 px-4 text-center">Jenis</th>
      <th class="py-3 px-4 text-right">Total</th>
      <th class="py-3 px-4 text-center">Status</th>
      <th class="py-3 px-4 text-center">Aksi</th>
    {/snippet}

    {#snippet rows()}
      {#if filteredSales.length === 0}
        <tr>
          <td colspan="8" class="py-12 text-center text-xs text-slate-400">
            <div class="flex flex-col items-center justify-center gap-2">
              <ShoppingCart class="w-8 h-8 text-slate-300" />
              <span>Tidak ada transaksi penjualan yang cocok dengan filter pencarian.</span>
            </div>
          </td>
        </tr>
      {:else}
        {#each paginatedSales as trx}
        <tr class="hover:bg-blue-50/40 transition-colors">
          <!-- No Faktur -->
          <td class="py-3.5 px-4 max-w-[120px]">
            <div class="font-mono font-bold text-slate-900 truncate">{trx.invoiceNo}</div>
            <div class="text-[11px] text-slate-400 font-mono">{trx.itemsCount} Item</div>
          </td>

          <!-- Waktu & Sif -->
          <td class="py-3.5 px-4">
            <div class="font-medium text-slate-800 text-xs">{trx.createdAt}</div>
            <div class="text-[10px] text-slate-400">{trx.cashierShift}</div>
          </td>

          <!-- Pelanggan / Pasien -->
          <td class="py-3.5 px-4">
            <div class="font-bold text-slate-800">{trx.customerName}</div>
            {#if trx.patientName}
              <div class="text-[11px] text-brand-blue flex items-center gap-1 mt-0.5">
                <Stethoscope class="w-3 h-3 flex-shrink-0" />
                <span>{trx.patientName}</span>
              </div>
            {/if}
            {#if trx.doctorName}
              <div class="text-[10px] text-slate-400">R/ {trx.doctorName}</div>
            {/if}
          </td>

          <!-- Jenis Transaksi -->
          <td class="py-3.5 px-4 text-center">
            <div class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border border-slate-200 bg-white text-slate-700 shadow-2xs">
              {#if trx.paymentMethod === "CASH"}
                <Banknote class="w-3.5 h-3.5 text-emerald-600" />
                <span>Tunai</span>
              {:else if trx.paymentMethod === "QRIS"}
                <QrCode class="w-3.5 h-3.5 text-blue-600" />
                <span>QRIS</span>
              {:else if trx.paymentMethod === "TRANSFER"}
                <ArrowUpRight class="w-3.5 h-3.5 text-purple-600" />
                <span>Transfer</span>
              {:else if trx.paymentMethod === "DEBIT"}
                <CreditCard class="w-3.5 h-3.5 text-indigo-600" />
                <span>Debit</span>
              {:else}
                <Clock class="w-3.5 h-3.5 text-amber-600" />
                <span>Tempo</span>
              {/if}
            </div>
          </td>

          <!-- Grand Total -->
          <td class="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
            {formatRupiah(trx.grandTotal)}
          </td>

          <!-- Status Bayar -->
          <td class="py-3.5 px-4 text-center">
            {#if trx.paymentStatus === "PAID"}
              <Badge type="SUCCESS" label="LUNAS" />
            {:else if trx.paymentStatus === "PARTIAL"}
              <Badge type="WARNING" label="SEBAGIAN" />
            {:else}
              <Badge type="DANGER" label="BELUM LUNAS" />
            {/if}
          </td>

          <!-- Aksi -->
          <td class="py-3.5 px-4 text-center">
            <div class="flex items-center justify-center gap-1.5">
              <button
                type="button"
                onclick={() => openDetail(trx)}
                class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-brand-blue transition-colors"
                title="Lihat Rincian Faktur"
              >
                <Eye class="w-4 h-4" />
              </button>
              <button
                type="button"
                onclick={() => handleReprintThermal(trx)}
                class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-emerald-600 transition-colors"
                title="Cetak Ulang Struk Thermal ESC/POS"
              >
                <Printer class="w-4 h-4" />
              </button>
            </div>
          </td>
        </tr>
      {/each}
    {/if}
    {/snippet}
  </DataTable>
</div>

<!-- MODAL RINCIAN TRANSAKSI PENJUALAN (GLASSMORPHIC) -->
{#if isDetailModalOpen && selectedTransaction}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay print:!hidden fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isDetailModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <FileText class="w-5 h-5 text-brand-blue" />
          <div>
            <div>Rincian Nota Penjualan</div>
            <div class="font-mono text-xs text-brand-blue-700">{selectedTransaction.invoiceNo}</div>
          </div>
        </div>
        <button
          onclick={() => (isDetailModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Detail Info Bar -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
        <div>
          <span class="text-slate-400 block text-[10px]">Waktu Transaksi</span>
          <span class="font-semibold text-slate-800">{selectedTransaction.createdAt}</span>
        </div>
        <div>
          <span class="text-slate-400 block text-[10px]">Kasir Pelayan</span>
          <span class="font-semibold text-slate-800">{selectedTransaction.cashierName}</span>
        </div>
        <div>
          <span class="text-slate-400 block text-[10px]">Pelanggan</span>
          <span class="font-semibold text-slate-800">{selectedTransaction.customerName}</span>
        </div>
        <div>
          <span class="text-slate-400 block text-[10px]">Metode / Status</span>
          <span class="font-bold text-brand-blue">{selectedTransaction.paymentMethod} ({selectedTransaction.paymentStatus})</span>
        </div>
      </div>

      <!-- Resep Detail jika ada -->
      {#if selectedTransaction.patientName || selectedTransaction.doctorName}
        <div class="bg-blue-50/60 p-3 rounded-xl border border-blue-100 text-xs flex items-center justify-between">
          <div class="space-y-0.5">
            <div class="font-bold text-brand-navy-900 flex items-center gap-1.5">
              <Stethoscope class="w-4 h-4 text-brand-blue" />
              <span>Resep: {selectedTransaction.prescriptionNo || "Resep Dokter Langsung"}</span>
            </div>
            <div class="text-slate-600">Pasien: <strong>{selectedTransaction.patientName}</strong> &bull; Dokter: {selectedTransaction.doctorName}</div>
          </div>
          <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white text-brand-blue border border-blue-200">
            Dispensing Terverifikasi
          </span>
        </div>
      {/if}

      <!-- Item Table -->
      <div class="overflow-x-auto rounded-xl border border-slate-100">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
              <th class="py-2.5 px-3">Nama Produk / Obat</th>
              <th class="py-2.5 px-3">Batch & ED</th>
              <th class="py-2.5 px-3 text-center">Qty</th>
              <th class="py-2.5 px-3 text-right">Harga</th>
              <th class="py-2.5 px-3 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
            {#if !selectedTransaction.items || selectedTransaction.items.length === 0}
              <tr>
                <td colspan="5" class="py-6 text-center text-slate-400 italic">
                  Tidak ada rincian item obat yang tercatat pada nota transaksi ini.
                </td>
              </tr>
            {:else}
              {#each selectedTransaction.items as item}
                <tr>
                  <td class="py-2.5 px-3 font-semibold text-slate-900">{item.productName}</td>
                  <td class="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                    {item.batchNo} ({item.expDate})
                  </td>
                  <td class="py-2.5 px-3 text-center font-bold">{item.qty} {item.unit}</td>
                  <td class="py-2.5 px-3 text-right font-mono">{formatRupiah(item.price)}</td>
                  <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{formatRupiah(item.subtotal)}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>

      <!-- Financial Calculation Summary -->
      <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1.5 text-xs">
        <div class="flex justify-between text-slate-600">
          <span>Subtotal Barang:</span>
          <span class="font-mono font-bold">{formatRupiah(selectedTransaction.subtotal)}</span>
        </div>
        {#if selectedTransaction.discountAmount > 0}
          <div class="flex justify-between text-emerald-600 font-semibold">
            <span>Diskon Faktur:</span>
            <span class="font-mono">- {formatRupiah(selectedTransaction.discountAmount)}</span>
          </div>
        {/if}
        {#if selectedTransaction.tuslahAmount > 0}
          <div class="flex justify-between text-slate-600">
            <span>Jasa Farmasi / Tuslah Racikan:</span>
            <span class="font-mono font-bold">+{formatRupiah(selectedTransaction.tuslahAmount)}</span>
          </div>
        {/if}
        {#if selectedTransaction.embalaseAmount > 0}
          <div class="flex justify-between text-slate-600">
            <span>Wadah / Embalase / Ongkir:</span>
            <span class="font-mono font-bold">+{formatRupiah(selectedTransaction.embalaseAmount)}</span>
          </div>
        {/if}
        <div class="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-200">
          <span>GRAND TOTAL:</span>
          <span class="text-brand-blue-700 font-mono text-base">{formatRupiah(selectedTransaction.grandTotal)}</span>
        </div>
        <div class="flex justify-between text-slate-500 text-[11px] pt-1">
          <span>Uang Diterima: {formatRupiah(selectedTransaction.paidAmount)}</span>
          <span>Kembalian: {formatRupiah(selectedTransaction.changeAmount)}</span>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="border-t border-slate-100 pt-3 flex items-center justify-between">
        <button
          type="button"
          onclick={() => handleReprintThermal(selectedTransaction)}
          class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors"
        >
          <Printer class="w-4 h-4 text-emerald-600" />
          <span>Cetak Ulang Struk Kasir</span>
        </button>

        <button
          type="button"
          onclick={() => (isDetailModalOpen = false)}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm"
        >
          Tutup
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- KOMPONEN REUSABLE LEMBAR CETAK PRINTER TERMAL -->
<ThermalReceiptSheet receipt={activeReprintReceipt} />
