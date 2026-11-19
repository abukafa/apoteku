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
    Download,
    Ban,
    RotateCcw
  } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import SortableTh from "$lib/components/ui/SortableTh.svelte";
  import { compareTableValues, type SortDirection, type SortState } from "$lib/components/ui/DataTable.types";
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
  import { authStore } from "$lib/stores/authStore.svelte";
  import { tenantStore } from "$lib/stores/tenantStore.svelte";
  import { formatRupiah } from "@apoteku/core";

  // Master Data & Branch Filter
  const canSelectBranch = $derived(authStore.canSelectBranch);
  let branches = $state<any[]>([]);
  let selectedBranchId = $state(authStore.isAllBranches ? "ALL" : (authStore.user?.branchId || "1"));

  // Reactive state
  let sales = $state<any[]>([]);
  let isLoading = $state(false);
  let summary = $state({
    totalSalesToday: 0,
    transactionsToday: 0,
    totalPrescriptions: 0,
    unpaidReceivables: 0,
    totalSalesMonth: 0,
    averageBasketSize: 0,
    cashInDrawer: 0
  });

  let activeTab = $state<"SEMUA" | "UMUM" | "RESEP" | "GROSIR" | "TEMPO" | "DELIVERY">("SEMUA");
  let searchQuery = $state("");
  let selectedPaymentFilter = $state<string>("ALL");

  // Paginasi
  let currentPage = $state(1);
  let pageSize = $state(15);

  async function loadSalesData(branchId?: string) {
    isLoading = true;
    try {
      const targetBranch = branchId ?? selectedBranchId ?? (authStore.isAllBranches ? "ALL" : authStore.user?.branchId);
      const [res, cfRes] = await Promise.all([
        api.erp.getSales(250, targetBranch),
        api.finance.getCashflow(targetBranch).catch(() => null)
      ]);
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

        // Penerimaan kas masuk tunai kasir (CASH, RESEP tunai, DP TEMPO)
        const netCashSales = sales.reduce((acc, cur) => {
          if (cur.paymentMethod === "QRIS" || cur.paymentMethod === "TRANSFER" || cur.paymentMethod === "DEBIT") {
            return acc;
          }
          const paid = Number(cur.paidAmount) || 0;
          const change = Number(cur.changeAmount) || 0;
          return acc + Math.max(0, paid - change);
        }, 0);

        // Saldo riil kas laci (memperhitungkan beban operasional/refund jika ada)
        const realKasLaci =
          cfRes?.success && cfRes.data?.kasLaci !== undefined
            ? Number(cfRes.data.kasLaci)
            : netCashSales;

        summary.totalSalesToday = totalRev;
        summary.transactionsToday = sales.length;
        summary.totalPrescriptions = resepCount;
        summary.unpaidReceivables = unpaidTempo;
        summary.totalSalesMonth = totalRev;
        summary.averageBasketSize = sales.length > 0 ? Math.round(totalRev / sales.length) : 0;
        summary.cashInDrawer = realKasLaci;
      } else {
        sales = [];
        summary.totalSalesToday = 0;
        summary.transactionsToday = 0;
        summary.totalPrescriptions = 0;
        summary.unpaidReceivables = 0;
        summary.totalSalesMonth = 0;
        summary.averageBasketSize = 0;
        summary.cashInDrawer =
          cfRes?.success && cfRes.data?.kasLaci !== undefined
            ? Number(cfRes.data.kasLaci)
            : 0;
      }
    } catch (e) {
      console.warn("[Penjualan] Gagal memuat data penjualan dari API:", e);
      sales = [];
    } finally {
      isLoading = false;
    }
  }

  onMount(async () => {
    try {
      const branchRes = await api.erp.getBranches().catch(() => null);
      const bList = branchRes?.data || (Array.isArray(branchRes) ? branchRes : []);
      if (bList.length > 0) {
        branches = bList;
        if (authStore.isAllBranches) {
          selectedBranchId = "ALL";
        } else if (!selectedBranchId || selectedBranchId === "ALL") {
          selectedBranchId = authStore.user?.branchId || bList[0].id;
        }

        const exists = selectedBranchId === "ALL" || bList.some((b: any) => b.id === selectedBranchId);
        if (!exists) {
          selectedBranchId = authStore.isAllBranches ? "ALL" : bList[0].id;
        }
      }
      await loadSalesData(selectedBranchId);
    } catch (e) {
      console.error("[Penjualan] Error onMount:", e);
      await loadSalesData(selectedBranchId);
    }
  });

  // Modal Detail State
  let selectedTransaction = $state<any | null>(null);
  let isDetailModalOpen = $state(false);

  // Filtered sales derived
  let filteredSales = $derived(
    sales.filter((item) => {
      // Branch filter check
      if (selectedBranchId !== "ALL" && item.branchId && item.branchId !== selectedBranchId) {
        return false;
      }
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
        const matchesBranch = (item.branchName || "").toLowerCase().includes(query);
        return matchesInvoice || matchesCustomer || matchesPatient || matchesCashier || matchesBranch;
      }
      return true;
    })
  );

  // Sorting state
  let sortKey = $state<string>("createdAt");
  let sortDirection = $state<SortDirection>("desc");

  function handleSort(state: SortState) {
    sortKey = state.key;
    sortDirection = state.direction;
    currentPage = 1;
  }

  let sortedSales = $derived.by(() => {
    if (!sortKey || !sortDirection) return filteredSales;
    const copy = [...filteredSales];
    return copy.sort((a, b) => {
      let valA: any;
      let valB: any;
      let type: "string" | "number" | "date" = "string";

      switch (sortKey) {
        case "invoiceNo":
          valA = a.invoiceNo || a.invoiceNumber;
          valB = b.invoiceNo || b.invoiceNumber;
          break;
        case "createdAt":
          valA = a.createdAt;
          valB = b.createdAt;
          type = "date";
          break;
        case "customerName":
          valA = a.customerName;
          valB = b.customerName;
          break;
        case "transactionType":
          valA = a.transactionType;
          valB = b.transactionType;
          break;
        case "grandTotal":
          valA = Number(a.grandTotal || 0);
          valB = Number(b.grandTotal || 0);
          type = "number";
          break;
        case "paymentStatus":
          valA = a.paymentStatus;
          valB = b.paymentStatus;
          break;
        default:
          valA = a[sortKey];
          valB = b[sortKey];
      }
      return compareTableValues(valA, valB, sortDirection, type);
    });
  });

  let totalPages = $derived(Math.max(1, Math.ceil(sortedSales.length / pageSize)));
  let paginatedSales = $derived(
    sortedSales.slice((currentPage - 1) * pageSize, currentPage * pageSize)
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

  // Hak Akses Fitur Khusus Penjualan
  const canVoidSale = $derived(authStore.can("sales:void"));
  const canRefund = $derived(authStore.can("sales:refund") || authStore.can("returns:customer:process"));

  // State Modal Void Transaksi
  let isVoidModalOpen = $state(false);
  let transactionToVoid = $state<any>(null);
  let voidReason = $state("");
  let isSubmittingVoid = $state(false);

  function openVoidModal(trx: any) {
    transactionToVoid = trx;
    voidReason = "";
    isVoidModalOpen = true;
  }

  async function handleConfirmVoid() {
    if (!transactionToVoid) return;
    if (!voidReason.trim()) {
      alertStore.toast("Alasan pembatalan (void) wajib diisi", "danger");
      return;
    }

    isSubmittingVoid = true;
    try {
      const res = await api.erp.voidSale(transactionToVoid.id, voidReason);
      if (res?.success) {
        alertStore.toast(res.message || "Nota penjualan berhasil dibatalkan (VOID)", "success");
        isVoidModalOpen = false;
        if (selectedTransaction?.id === transactionToVoid.id) {
          selectedTransaction = {
            ...selectedTransaction,
            status: "VOID",
            paymentStatus: "VOID",
            voidReason,
            voidedAt: new Date().toISOString()
          };
        }
        await loadSalesData(selectedBranchId);
      } else {
        alertStore.toast(res?.error || "Gagal membatalkan nota", "danger");
      }
    } catch (e: any) {
      alertStore.toast(e.message || "Terjadi kesalahan sistem", "danger");
    } finally {
      isSubmittingVoid = false;
    }
  }

  function handleGoToReturn(trx: any) {
    if (typeof window !== "undefined") {
      goto(`/retur?invoice=${encodeURIComponent(trx.invoiceNo || trx.invoiceNumber || "")}`);
    }
  }
</script>

<svelte:head>
  <title>Penjualan &bull; {tenantStore.current.name || "Hafidz Farma"}</title>
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
      <!-- Branch selector (for Multi-branch User) or locked badge (for Single Branch Staff) -->
      {#if authStore.canSelectBranch}
        <div class="w-56">
          <Select
            value={selectedBranchId}
            onchange={(val) => {
              selectedBranchId = val;
              currentPage = 1;
              loadSalesData(val);
            }}
            options={[
              { value: "ALL", label: "Semua Cabang Apotek" },
              ...branches.map((b) => ({ value: b.id, label: b.name }))
            ]}
          />
        </div>
      {:else}
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs" title="Cabang Penugasan">
          <Store class="w-3.5 h-3.5 text-brand-blue" />
          <span>{authStore.user?.branchName || branches.find((b) => b.id === selectedBranchId)?.name || (tenantStore.current.name ? `${tenantStore.current.name} Pusat` : "Apotek Hafidz Farma Pusat")}</span>
        </div>
      {/if}

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
      subtext={`Saldo Kasir: ${formatRupiah(summary.cashInDrawer)}`}
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
    subtitle="Monitoring transaksi kasir POS, resep klinik, dan delivery"
    searchPlaceholder="Cari nomor faktur nota, nama pelanggan/pasien, atau nama kasir..."
    bind:searchValue={searchQuery}
    totalCount={filteredSales.length}
    currentPage={currentPage}
    totalPages={totalPages}
    pageSize={pageSize}
    onPageChange={(p) => (currentPage = p)}
    onSearchChange={() => (currentPage = 1)}
    isLoading={isLoading}
    emptyText="Tidak ada transaksi penjualan yang cocok dengan filter pencarian."
    emptyIcon={ShoppingCart}
  >
    {#snippet titleContent()}
      <div class="flex items-center gap-2.5">
        <div class="w-9 h-9 rounded-xl bg-blue-50 text-[#1d63d8] flex items-center justify-center font-bold">
          <ShoppingCart class="w-5 h-5" />
        </div>
        <div>
          <h3 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Buku Catatan Penjualan</span>
            <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#1d63d8] border border-blue-200/60">
              {filteredSales.length} Transaksi
            </span>
          </h3>
          <p class="text-[11px] text-slate-500 font-medium">Monitoring transaksi kasir POS, resep klinik, dan delivery</p>
        </div>
      </div>
    {/snippet}

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
      <SortableTh key="invoiceNo" label="Faktur" {sortKey} {sortDirection} onsort={handleSort} />
      <SortableTh key="createdAt" label="Waktu & Sif" {sortKey} {sortDirection} onsort={handleSort} />
      <SortableTh key="customerName" label="Pelanggan / Pasien" {sortKey} {sortDirection} onsort={handleSort} />
      <SortableTh key="transactionType" label="Jenis" align="center" {sortKey} {sortDirection} onsort={handleSort} />
      <SortableTh key="grandTotal" label="Total" align="right" dataType="currency" {sortKey} {sortDirection} onsort={handleSort} />
      <SortableTh key="paymentStatus" label="Status" align="center" {sortKey} {sortDirection} onsort={handleSort} />
      <th class="py-3 px-4 text-center">Aksi</th>
    {/snippet}

    {#snippet rows()}
      {#each paginatedSales as trx}
        <tr class="hover:bg-blue-50/40 transition-colors">
          <!-- No Faktur -->
          <td class="py-3.5 px-4 max-w-[140px]">
            <div class="font-mono font-bold text-slate-900 truncate">{trx.invoiceNo}</div>
            <div class="text-[11px] text-slate-400 font-mono">{trx.itemsCount} Item</div>
            {#if (selectedBranchId === "ALL" || canSelectBranch) && trx.branchName}
              <div class="text-[10px] text-brand-blue font-semibold truncate flex items-center gap-1 mt-0.5" title={trx.branchName}>
                <Store class="w-3 h-3 flex-shrink-0" />
                <span>{trx.branchName}</span>
              </div>
            {/if}
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
            {#if trx.status === "VOID"}
              <Badge type="DANGER" label="DIBATALKAN (VOID)" />
            {:else if trx.paymentStatus === "PAID"}
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
                disabled={trx.status === "VOID"}
                class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={trx.status === "VOID" ? "Struk dibatalkan" : "Cetak Ulang Struk Thermal ESC/POS"}
              >
                <Printer class="w-4 h-4" />
              </button>
              {#if canRefund && trx.status !== "VOID"}
                <button
                  type="button"
                  onclick={() => handleGoToReturn(trx)}
                  class="p-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors"
                  title="Ajukan Retur / Refund Pembeli"
                >
                  <RotateCcw class="w-4 h-4" />
                </button>
              {/if}
              {#if canVoidSale && trx.status !== "VOID"}
                <button
                  type="button"
                  onclick={() => openVoidModal(trx)}
                  class="p-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                  title="Batalkan Nota (Void Transaksi)"
                >
                  <Ban class="w-4 h-4" />
                </button>
              {/if}
            </div>
          </td>
        </tr>
      {/each}
    {/snippet}

    {#snippet footerSummary()}
      <tr>
        <td colspan="4" class="py-3 px-4 text-slate-600 uppercase text-[11px] tracking-wider text-right font-semibold">
          Total Omzet Terfilter:
        </td>
        <td class="py-3 px-4 text-right font-black text-brand-blue font-mono text-sm">
          {formatRupiah(totalFilteredNominal)}
        </td>
        <td colspan="2"></td>
      </tr>
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
            <div class="flex items-center gap-2">
              <span>Rincian Nota Penjualan</span>
              {#if selectedTransaction.branchName}
                <span class="px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-brand-blue border border-blue-200 font-semibold">
                  {selectedTransaction.branchName}
                </span>
              {/if}
            </div>
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

      {#if selectedTransaction.status === "VOID"}
        <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2">
          <Ban class="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <div class="leading-relaxed">
            <div class="font-bold text-red-800">TRANSAKSI INI TELAH DIBATALKAN (VOID)</div>
            <div class="text-[11px] text-red-700 mt-0.5">
              Alasan: <strong>{selectedTransaction.voidReason || "Pembatalan transaksi kasir"}</strong><br />
              Waktu Pembatalan: {selectedTransaction.voidedAt ? new Date(selectedTransaction.voidedAt).toLocaleString("id-ID") : "-"}
            </div>
          </div>
        </div>
      {/if}

      <!-- Detail Info Bar -->
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
        <div>
          <span class="text-slate-400 block text-[10px]">Cabang</span>
          <span class="font-semibold text-slate-800 truncate block" title={selectedTransaction.branchName}>{selectedTransaction.branchName || "Pusat"}</span>
        </div>
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
      <div class="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onclick={() => handleReprintThermal(selectedTransaction)}
          disabled={selectedTransaction.status === "VOID"}
          class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Printer class="w-4 h-4 text-emerald-600" />
          <span>{selectedTransaction.status === "VOID" ? "Struk Telah Dibatalkan" : "Cetak Ulang Struk Kasir"}</span>
        </button>

        <div class="flex items-center gap-2">
          {#if canRefund && selectedTransaction.status !== "VOID"}
            <button
              type="button"
              onclick={() => {
                isDetailModalOpen = false;
                handleGoToReturn(selectedTransaction);
              }}
              class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-colors"
            >
              <RotateCcw class="w-4 h-4 text-amber-600" />
              <span>Refund / Retur</span>
            </button>
          {/if}

          {#if canVoidSale && selectedTransaction.status !== "VOID"}
            <button
              type="button"
              onclick={() => {
                isDetailModalOpen = false;
                openVoidModal(selectedTransaction);
              }}
              class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-colors"
            >
              <Ban class="w-4 h-4 text-red-600" />
              <span>Batalkan Nota (Void)</span>
            </button>
          {/if}

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
  </div>
{/if}

<!-- MODAL: VOID TRANSAKSI PENJUALAN KASIR -->
{#if isVoidModalOpen && transactionToVoid}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[110] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget && !isSubmittingVoid) isVoidModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-red-200 overflow-hidden animate-in fade-in zoom-in duration-150">
      <div class="p-4 bg-red-50 border-b border-red-100 flex items-center justify-between">
        <div class="flex items-center gap-2 text-red-900 font-bold text-sm">
          <Ban class="w-5 h-5 text-red-600" />
          <span>Batalkan Transaksi (Void Nota)</span>
        </div>
        <button
          onclick={() => (isVoidModalOpen = false)}
          disabled={isSubmittingVoid}
          class="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-5 space-y-4 text-xs">
        <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 leading-relaxed">
          <strong>Perhatian:</strong> Tindakan ini akan membatalkan nota <strong>{transactionToVoid.invoiceNo || transactionToVoid.invoiceNumber}</strong> ({formatRupiah(transactionToVoid.grandTotal)}). Seluruh stok obat pada nota ini akan otomatis <strong>dikembalikan ke batch rak apotek</strong>.
        </div>

        <div>
          <label for="void-reason" class="block font-bold text-slate-700 mb-1">
            Alasan Pembatalan Nota <span class="text-red-500">*</span>
          </label>
          <textarea
            id="void-reason"
            bind:value={voidReason}
            rows={3}
            placeholder="Contoh: Pelanggan salah pilih obat, salah input jumlah, salah metode bayar..."
            class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none"
          ></textarea>
        </div>
      </div>

      <div class="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isVoidModalOpen = false)}
          disabled={isSubmittingVoid}
          class="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleConfirmVoid}
          disabled={isSubmittingVoid || !voidReason.trim()}
          class="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
        >
          {#if isSubmittingVoid}
            <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Memproses Void...</span>
          {:else}
            <Ban class="w-4 h-4" />
            <span>Ya, Batalkan Nota</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- KOMPONEN REUSABLE LEMBAR CETAK PRINTER TERMAL -->
<ThermalReceiptSheet receipt={activeReprintReceipt} />
