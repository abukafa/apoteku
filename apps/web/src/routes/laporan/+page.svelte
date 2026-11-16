<script lang="ts">
  import { onMount } from "svelte";
  import {
    BarChart3,
    FileSpreadsheet,
    Printer,
    TrendingUp,
    ShieldAlert,
    PieChart,
    Eye,
    CheckCircle2,
    Store,
    X
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import { portal } from "$lib/actions/portal";
  import { api } from "$lib/services/api";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { tenantStore } from "$lib/stores/tenantStore.svelte";
  import { formatRupiah, calculateGrossMarginPercent } from "@apoteku/core";

  interface SalesShiftReportRow {
    id: string;
    date: string;
    branchId: string;
    branchName: string;
    shiftName: string;
    cashierName: string;
    trxCount: number;
    paymentChannel: "CASH" | "NON_CASH" | "RESEP";
    grossSales: number;
    cogsHpp: number;
    grossProfit: number;
    cashVariance: number;
  }

  interface SipnapReportRow {
    id: string;
    branchId: string;
    period: string;
    drugName: string;
    group: "NARKOTIKA" | "PSIKOTROPIKA" | "PREKURSOR";
    initialStock: number;
    receivedQty: number;
    supplier: string;
    spRef: string;
    dispensedQty: number;
    recipeCount: number;
    expiredOrDestroyedQty: number;
    finalStock: number;
    physicalStock: number;
    unit: string;
    verifiedBy: string;
  }

  interface ParetoReportRow {
    id: string;
    branchId: string;
    name: string;
    sku: string;
    category: "A" | "B" | "C";
    unitsSold: number;
    unit: string;
    totalRevenue: number;
    grossMarginPercent: number;
    revenueShare: number;
    cumulativeShare: number;
    currentStock: number;
  }

  // Pilihan Periode Otomatis (6 Bulan Berjalan)
  const now = new Date();
  const periodOptions = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const monthNames = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    return {
      value: `${y}-${m}`,
      label: `${monthNames[d.getMonth()]} ${y}`
    };
  });

  // Master Data & Filters
  let branches = $state<any[]>([]);
  let selectedBranchId = $state(authStore.user?.branchId || "ALL");
  let selectedPeriod = $state(periodOptions[0].value);
  let activeTab = $state<"penjualan" | "sipnap" | "pareto">("penjualan");

  // Table Filters (placed in top-right corner of DataTable)
  let salesChannelFilter = $state<"ALL" | "CASH" | "NON_CASH" | "RESEP">("ALL");
  let sipnapGroupFilter = $state<"ALL" | "NARKOTIKA" | "PSIKOTROPIKA" | "PREKURSOR">("ALL");
  let paretoClassFilter = $state<"ALL" | "A" | "B" | "C">("ALL");

  let salesSearchQuery = $state("");
  let sipnapSearchQuery = $state("");
  let paretoSearchQuery = $state("");

  // Modals
  let isPrintModalOpen = $state(false);
  let isSipnapDetailModalOpen = $state(false);
  let selectedSipnapRow = $state<SipnapReportRow | null>(null);

  // Live Records
  let salesShiftRecords = $state<SalesShiftReportRow[]>([]);
  let sipnapRecords = $state<SipnapReportRow[]>([]);
  let paretoRecords = $state<ParetoReportRow[]>([]);
  let isLoading = $state(false);

  async function loadReports() {
    isLoading = true;
    try {
      const [salesRes, sipRes, parRes] = await Promise.all([
        api.reports.getSalesShifts({ branchId: selectedBranchId, period: selectedPeriod }),
        api.reports.getSipnap({ branchId: selectedBranchId, period: selectedPeriod }),
        api.reports.getPareto({ branchId: selectedBranchId, period: selectedPeriod })
      ]);

      if (salesRes?.success && Array.isArray(salesRes.data)) {
        salesShiftRecords = salesRes.data;
      }
      if (sipRes?.success && Array.isArray(sipRes.data)) {
        sipnapRecords = sipRes.data;
      }
      if (parRes?.success && Array.isArray(parRes.data)) {
        paretoRecords = parRes.data;
      }
    } catch (err) {
      console.error("Load reports error:", err);
    } finally {
      isLoading = false;
    }
  }

  onMount(async () => {
    if (authStore.user?.branchId) {
      selectedBranchId = authStore.user.branchId;
    }
    try {
      const bRes = await api.erp.getBranches();
      if (bRes?.success && Array.isArray(bRes.data) && bRes.data.length > 0) {
        branches = bRes.data;
      }
    } catch (_) {}

    await loadReports();
  });

  // Re-fetch saat cabang atau periode berubah
  $effect(() => {
    const _b = selectedBranchId;
    const _p = selectedPeriod;
    loadReports();
  });

  // Branch-filtered arrays
  let branchSalesRecords = $derived(
    salesShiftRecords.filter(
      (r) => selectedBranchId === "ALL" || r.branchId === selectedBranchId
    )
  );

  let branchSipnapRecords = $derived(
    sipnapRecords.filter(
      (r) => selectedBranchId === "ALL" || r.branchId === selectedBranchId
    )
  );

  let branchParetoRecords = $derived(
    paretoRecords.filter(
      (r) => selectedBranchId === "ALL" || r.branchId === selectedBranchId
    )
  );

  // Table-filtered arrays
  let filteredSalesRecords = $derived(
    branchSalesRecords.filter((r) => {
      const matchChannel =
        salesChannelFilter === "ALL" || r.paymentChannel === salesChannelFilter;
      const q = salesSearchQuery.toLowerCase();
      const matchSearch =
        r.cashierName.toLowerCase().includes(q) ||
        r.shiftName.toLowerCase().includes(q) ||
        r.branchName.toLowerCase().includes(q);
      return matchChannel && matchSearch;
    })
  );

  let filteredSipnapRecords = $derived(
    branchSipnapRecords.filter((r) => {
      const matchGroup =
        sipnapGroupFilter === "ALL" || r.group === sipnapGroupFilter;
      const q = sipnapSearchQuery.toLowerCase();
      const matchSearch =
        r.drugName.toLowerCase().includes(q) ||
        r.supplier.toLowerCase().includes(q) ||
        r.spRef.toLowerCase().includes(q);
      return matchGroup && matchSearch;
    })
  );

  let filteredParetoRecords = $derived(
    branchParetoRecords.filter((r) => {
      const matchClass =
        paretoClassFilter === "ALL" || r.category === paretoClassFilter;
      const q = paretoSearchQuery.toLowerCase();
      const matchSearch =
        r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q);
      return matchClass && matchSearch;
    })
  );

  // Reactive Summary Metrics
  let totalGrossSales = $derived(
    branchSalesRecords.reduce((a, b) => a + b.grossSales, 0)
  );
  let totalGrossProfit = $derived(
    branchSalesRecords.reduce((a, b) => a + b.grossProfit, 0)
  );
  let averageMarginPercent = $derived(
    calculateGrossMarginPercent(totalGrossSales, totalGrossProfit).toFixed(1)
  );

  let totalCashSales = $derived(
    branchSalesRecords
      .filter((r) => r.paymentChannel === "CASH")
      .reduce((a, b) => a + b.grossSales, 0)
  );
  let totalNonCashSales = $derived(
    branchSalesRecords
      .filter((r) => r.paymentChannel === "NON_CASH")
      .reduce((a, b) => a + b.grossSales, 0)
  );
  let totalPrescriptionSales = $derived(
    branchSalesRecords
      .filter((r) => r.paymentChannel === "RESEP")
      .reduce((a, b) => a + b.grossSales, 0)
  );

  let classAItems = $derived(
    branchParetoRecords.filter((p) => p.category === "A")
  );
  let classAShareSum = $derived(
    classAItems.reduce((a, b) => a + b.revenueShare, 0).toFixed(1)
  );

  let selectedPeriodLabel = $derived(
    periodOptions.find((p) => p.value === selectedPeriod)?.label || selectedPeriod
  );

  function exportActiveReportCsv() {
    let csvContent = "";
    let filename = `laporan-${activeTab}-${selectedPeriod}.csv`;

    if (activeTab === "penjualan") {
      csvContent =
        "Tanggal,Cabang,Shift,Kasir,Kanal,Jml Transaksi,Omzet Bruto,HPP,Laba Kotor\n" +
        filteredSalesRecords
          .map(
            (r) =>
              `${r.date},"${r.branchName}","${r.shiftName}","${r.cashierName}",${r.paymentChannel},${r.trxCount},${r.grossSales},${r.cogsHpp},${r.grossProfit}`
          )
          .join("\n");
    } else if (activeTab === "sipnap") {
      csvContent =
        "Periode,Nama Obat,Golongan,Saldo Awal,Masuk PBF,Distributor,No SP,Keluar Resep,Jml Resep,Saldo Akhir,Satuan\n" +
        filteredSipnapRecords
          .map(
            (r) =>
              `${r.period},"${r.drugName}",${r.group},${r.initialStock},${r.receivedQty},"${r.supplier}",${r.spRef},${r.dispensedQty},${r.recipeCount},${r.finalStock},${r.unit}`
          )
          .join("\n");
    } else {
      csvContent =
        "SKU,Nama Produk,Kelas Pareto,Qty Terjual,Satuan,Omzet,Porsi Omzet (%),Kumulatif (%),Margin (%)\n" +
        filteredParetoRecords
          .map(
            (p) =>
              `${p.sku},"${p.name}",${p.category},${p.unitsSold},${p.unit},${p.totalRevenue},${p.revenueShare},${p.cumulativeShare},${p.grossMarginPercent}`
          )
          .join("\n");
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
</script>

<svelte:head>
  <title>Laporan &bull; Hafidz Farma</title>
  {#if isPrintModalOpen}
    <style>
      @media print {
        @page {
          size: A4 landscape;
          margin: 10mm;
        }
      }
    </style>
  {/if}
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Laporan Farmasi"
    subtitle="Penjualan, analitik, audit SIPNAP Kemenkes"
    icon={BarChart3}
    breadcrumbs={[{ label: "Laporan" }]}
  >
    {#snippet actions()}
      <div class="grid grid-rows-2 justify-items-end gap-2">
        <div class="flex justify-end gap-2">
          <!-- Period Selector -->
          <div class="w-44">
            <Select
              value={selectedPeriod}
              onchange={(val) => (selectedPeriod = val)}
              options={periodOptions}
            />
          </div>

          <button
            type="button"
            onclick={exportActiveReportCsv}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs"
          >
            <FileSpreadsheet class="w-4 h-4 text-emerald-600" />
            <span class="hidden sm:inline">Export </span>CSV
          </button>

          <button
            type="button"
            onclick={() => (isPrintModalOpen = true)}
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
          >
            <Printer class="w-4 h-4" />
            <span class="hidden sm:inline">Cetak Laporan </span>PDF
          </button>
        </div>
        
        <!-- Branch selector (for Superadmin/Owner) or locked badge (for Staff) -->
        {#if authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"}
          <div class="w-52">
            <Select
              value={selectedBranchId}
              onchange={(val) => (selectedBranchId = val)}
              options={[
                { value: "ALL", label: "Semua Cabang Apotek" },
                ...branches.map((b) => ({ value: b.id, label: b.name }))
              ]}
            />
          </div>
        {:else}
          <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs" title="Cabang Penugasan">
            <Store class="w-3.5 h-3.5 text-brand-blue" />
            <span>{authStore.user?.branchName || branches.find((b) => b.id === selectedBranchId)?.name || "Apotek Hafidz Farma Pusat"}</span>
          </div>
        {/if}
      </div>
    {/snippet}
  </PageHeader>

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Omzet Terpilih"
      value={formatRupiah(totalGrossSales, false)}
      subtext="Laba Kotor: {formatRupiah(totalGrossProfit)}"
      icon={BarChart3}
      variant="brand"
    />
    <MetricCard
      title="Kepatuhan SIPNAP"
      value="{branchSipnapRecords.length} Obat Klop"
      subtext="Saldo buku = fisik narkotika"
      icon={ShieldAlert}
      variant="success"
    />
    <MetricCard
      title="Produk Kategori A"
      value="{classAItems.length} Item ({classAShareSum}%)"
      subtext="Penyumbang utama omzet"
      icon={PieChart}
      variant="default"
    />
    <MetricCard
      title="Margin Rata-rata"
      value="{averageMarginPercent}%"
      subtext="Rasio laba kotor terhadap HPP"
      icon={TrendingUp}
      variant="warning"
    />
  </div>

  <!-- TAB NAVIGATION -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold overflow-x-auto no-scrollbar">
    <button
      type="button"
      onclick={() => (activeTab = "penjualan")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'penjualan' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Laporan Omzet & Shift Kasir ({branchSalesRecords.length})</span>
      {#if activeTab === "penjualan"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "sipnap")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'sipnap' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-1.5">
        <ShieldAlert class="w-4 h-4 text-rose-600" />
        <span>Laporan SIPNAP Kemenkes ({branchSipnapRecords.length})</span>
      </div>
      {#if activeTab === "sipnap"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "pareto")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'pareto' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-1.5">
        <PieChart class="w-4 h-4 text-amber-500" />
        <span>Analisis Pareto ABC ({branchParetoRecords.length})</span>
      </div>
      {#if activeTab === "pareto"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>
  </div>

  <!-- TAB 1: PENJUALAN & SHIFT KASIR -->
  {#if activeTab === "penjualan"}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div class="text-xs font-bold text-slate-500">Penjualan Tunai (Cash)</div>
        <div class="text-xl font-black text-brand-blue mt-1 font-mono">{formatRupiah(totalCashSales)}</div>
        <div class="text-[11px] text-slate-400 mt-1">Setoran laci kasir fisik</div>
      </div>
      <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div class="text-xs font-bold text-slate-500">Non-Tunai (QRIS & Tempo)</div>
        <div class="text-xl font-black text-emerald-600 mt-1 font-mono">{formatRupiah(totalNonCashSales)}</div>
        <div class="text-[11px] text-slate-400 mt-1">Settlement bank / piutang pelanggan</div>
      </div>
      <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div class="text-xs font-bold text-slate-500">Pelayanan Resep Dokter</div>
        <div class="text-xl font-black text-purple-700 mt-1 font-mono">{formatRupiah(totalPrescriptionSales)}</div>
        <div class="text-[11px] text-slate-400 mt-1">Termasuk jasa Tuslah & Embalase</div>
      </div>
    </div>

    <DataTable
      title="Omzet, HPP, & Laba Kotor per Shift Kasir"
      searchPlaceholder="Cari nama kasir, shift, atau cabang..."
      bind:searchValue={salesSearchQuery}
      totalCount={filteredSalesRecords.length}
    >
      {#snippet filters()}
        <div class="w-44 shrink-0">
          <Select
            value={salesChannelFilter}
            onchange={(val) => (salesChannelFilter = val as typeof salesChannelFilter)}
            options={[
              { value: "ALL", label: "Semua Kanal" },
              { value: "CASH", label: "Tunai (Cash)" },
              { value: "NON_CASH", label: "QRIS & Tempo" },
              { value: "RESEP", label: "Resep Dokter" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <th class="py-3 px-4">Tanggal & Shift</th>
        <th class="py-3 px-4">Kasir & Cabang</th>
        <th class="py-3 px-4 text-center">Kanal</th>
        <th class="py-3 px-4 text-center">Trx</th>
        <th class="py-3 px-4 text-right">Omzet Bruto</th>
        <th class="py-3 px-4 text-right">Modal (HPP)</th>
        <th class="py-3 px-4 text-right">Laba Kotor</th>
        <th class="py-3 px-4 text-center">Selisih Kas</th>
      {/snippet}

      {#snippet rows()}
        {#if filteredSalesRecords.length === 0}
          <tr>
            <td colspan="8" class="text-center py-10 text-slate-400 text-xs">
              {#if isLoading}
                Sedang memuat data penjualan...
              {:else}
                Belum ada data transaksi shift kasir pada periode ini.
              {/if}
            </td>
          </tr>
        {:else}
          {#each filteredSalesRecords as r}
            {@const marginPct = calculateGrossMarginPercent(r.grossSales, r.grossProfit).toFixed(1)}
            <tr class="hover:bg-blue-50/40 transition-colors">
              <td class="py-3.5 px-4">
                <div class="font-mono font-bold text-slate-900">{r.date}</div>
                <div class="text-[11px] text-slate-500">{r.shiftName}</div>
              </td>
              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-800">{r.cashierName}</div>
                <div class="text-[11px] text-slate-400">{r.branchName}</div>
              </td>
              <td class="py-3.5 px-4 text-center">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold {r.paymentChannel === 'RESEP' ? 'bg-purple-100 text-purple-700' : r.paymentChannel === 'NON_CASH' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}">
                  {r.paymentChannel}
                </span>
              </td>
              <td class="py-3.5 px-4 text-center font-mono font-bold text-slate-700">{r.trxCount}</td>
              <td class="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                {formatRupiah(r.grossSales)}
              </td>
              <td class="py-3.5 px-4 text-right font-mono text-slate-600">
                {formatRupiah(r.cogsHpp)}
              </td>
              <td class="py-3.5 px-4 text-right font-mono font-black text-emerald-600">
                {formatRupiah(r.grossProfit)}
                <div class="text-[10px] font-normal text-slate-400">Margin {marginPct}%</div>
              </td>
              <td class="py-3.5 px-4 text-center font-mono">
                {#if r.cashVariance === 0}
                  <Badge type="SUCCESS" label="KLOP" />
                {:else}
                  <span class="text-brand-red-600 font-bold text-xs">{formatRupiah(r.cashVariance)}</span>
                {/if}
              </td>
            </tr>
          {/each}
        {/if}
      {/snippet}
    </DataTable>

  <!-- TAB 2: SIPNAP KEMENKES -->
  {:else if activeTab === "sipnap"}
    <DataTable
      title="Mutasi Narkotika, Psikotropika, & Prekursor"
      searchPlaceholder="Cari nama obat, distributor PBF, atau nomor SP..."
      bind:searchValue={sipnapSearchQuery}
      totalCount={filteredSipnapRecords.length}
    >
      {#snippet filters()}
        <div class="w-44 shrink-0">
          <Select
            value={sipnapGroupFilter}
            onchange={(val) => (sipnapGroupFilter = val as typeof sipnapGroupFilter)}
            options={[
              { value: "ALL", label: "Semua Golongan" },
              { value: "NARKOTIKA", label: "Narkotika" },
              { value: "PSIKOTROPIKA", label: "Psikotropika" },
              { value: "PREKURSOR", label: "Prekursor" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <th class="py-3 px-4">Nama Obat</th>
        <th class="py-3 px-4">Golongan</th>
        <th class="py-3 px-4 text-right">Awal</th>
        <th class="py-3 px-4 text-right">Masuk</th>
        <th class="py-3 px-4">Distributor</th>
        <th class="py-3 px-4 text-right">Keluar</th>
        <th class="py-3 px-4 text-right">Saldo</th>
        <th class="py-3 px-4 text-center">Fisik</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if filteredSipnapRecords.length === 0}
          <tr>
            <td colspan="9" class="text-center py-10 text-slate-400 text-xs">
              {#if isLoading}
                Sedang memuat data SIPNAP...
              {:else}
                Tidak ada data obat terkontrol (Narkotika/Psikotropika/Prekursor) pada periode ini.
              {/if}
            </td>
          </tr>
        {:else}
          {#each filteredSipnapRecords as rec}
            {@const isBalanced =
              rec.initialStock + rec.receivedQty - rec.dispensedQty - rec.expiredOrDestroyedQty ===
                rec.finalStock && rec.finalStock === rec.physicalStock}
            <tr class="hover:bg-blue-50/40 transition-colors">
              <td class="py-3.5 px-4 font-bold text-slate-900">{rec.drugName}</td>
              <td class="py-3.5 px-4">
                <Badge
                  type={rec.group === "NARKOTIKA"
                    ? "NARKOTIKA"
                    : rec.group === "PSIKOTROPIKA"
                      ? "PSIKOTROPIKA"
                      : "WARNING"}
                  label={rec.group}
                />
              </td>
              <td class="py-3.5 px-4 text-right font-mono font-semibold">{rec.initialStock}</td>
              <td class="py-3.5 px-4 text-right font-mono font-bold text-emerald-600">
                +{rec.receivedQty}
              </td>
              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-700 text-xs">{rec.supplier}</div>
                <div class="font-mono text-[10px] text-brand-blue">{rec.spRef}</div>
              </td>
              <td class="py-3.5 px-4 text-right font-mono font-bold text-brand-red-600">
                -{rec.dispensedQty}
                <div class="text-[10px] font-sans font-normal text-slate-400">
                  {rec.recipeCount} Lembar Resep
                </div>
              </td>
              <td class="py-3.5 px-4 text-right font-mono font-black text-brand-blue">
                {rec.finalStock} {rec.unit}
              </td>
              <td class="py-3.5 px-4 text-center">
                {#if isBalanced}
                  <Badge type="SUCCESS" label="KLOP" />
                {:else}
                  <Badge type="DANGER" label="SELISIH" />
                {/if}
              </td>
              <td class="py-3.5 px-4 text-center">
                <button
                  type="button"
                  onclick={() => {
                    selectedSipnapRow = rec;
                    isSipnapDetailModalOpen = true;
                  }}
                  class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-brand-blue"
                  title="Detail Audit Kartu Stok SIPNAP"
                >
                  <Eye class="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          {/each}
        {/if}
      {/snippet}
    </DataTable>

  <!-- TAB 3: PARETO ABC -->
  {:else if activeTab === "pareto"}
    <DataTable
      title="Analisis Pareto ABC (Investasi & Perputaran Stok)"
      searchPlaceholder="Cari nama produk atau SKU..."
      bind:searchValue={paretoSearchQuery}
      totalCount={filteredParetoRecords.length}
    >
      {#snippet filters()}
        <div class="w-44 shrink-0">
          <Select
            value={paretoClassFilter}
            onchange={(val) => (paretoClassFilter = val as typeof paretoClassFilter)}
            options={[
              { value: "ALL", label: "Semua Kelas" },
              { value: "A", label: "Kelas A (80% Omzet)" },
              { value: "B", label: "Kelas B (15% Omzet)" },
              { value: "C", label: "Kelas C (5% Omzet)" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <th class="py-3 px-4">Produk</th>
        <th class="py-3 px-4 text-center">Kelas</th>
        <th class="py-3 px-4 text-center">Terjual</th>
        <th class="py-3 px-4 text-right">Omzet</th>
        <th class="py-3 px-4 text-right">Kumulatif</th>
        <th class="py-3 px-4 text-center">Margin</th>
        <th class="py-3 px-4">Rekomendasi</th>
      {/snippet}

      {#snippet rows()}
        {#if filteredParetoRecords.length === 0}
          <tr>
            <td colspan="7" class="text-center py-10 text-slate-400 text-xs">
              {#if isLoading}
                Sedang memuat data analisis Pareto...
              {:else}
                Belum ada data perputaran produk untuk analisis Pareto pada periode ini.
              {/if}
            </td>
          </tr>
        {:else}
          {#each filteredParetoRecords as p}
            <tr class="hover:bg-blue-50/40 transition-colors">
              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-900">{p.name}</div>
                <div class="font-mono text-[10px] text-slate-400">SKU: {p.sku} • Sisa Stok: {p.currentStock}</div>
              </td>
              <td class="py-3.5 px-4 text-center">
                <span class="px-3 py-1 rounded-full text-xs font-black {p.category === 'A' ? 'bg-red-100 text-brand-red-700' : p.category === 'B' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}">
                  Kelas {p.category}
                </span>
              </td>
              <td class="py-3.5 px-4 text-center font-bold font-mono">
                {p.unitsSold} {p.unit}
              </td>
              <td class="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                {formatRupiah(p.totalRevenue)}
              </td>
              <td class="py-3.5 px-4 text-right font-mono">
                <div class="font-bold text-brand-blue">{p.revenueShare}%</div>
                <div class="text-[10px] text-slate-400">Kumulatif: {p.cumulativeShare}%</div>
              </td>
              <td class="py-3.5 px-4 text-center font-mono font-bold text-emerald-600">
                {p.grossMarginPercent}%
              </td>
              <td class="py-3.5 px-4 text-xs">
                {#if p.category === "A"}
                  <span class="text-brand-red-600 font-semibold">Wajib Buffer Stock Tinggi (Zero Stock-Out)</span>
                {:else if p.category === "B"}
                  <span class="text-amber-700 font-semibold">Order Berkala sesuai Reorder Point (ROP)</span>
                {:else}
                  <span class="text-slate-500">Order Just-In-Time (Cegah Dead Stock)</span>
                {/if}
              </td>
            </tr>
          {/each}
        {/if}
      {/snippet}
    </DataTable>
  {/if}
</div>

<!-- MODAL DETAIL AUDIT SIPNAP -->
{#if isSipnapDetailModalOpen && selectedSipnapRow}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isSipnapDetailModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto text-xs">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <div class="font-bold text-rose-600 text-[11px]">{selectedSipnapRow.group} • Periode {selectedSipnapRow.period}</div>
          <div class="font-bold text-slate-900 text-sm">{selectedSipnapRow.drugName}</div>
        </div>
        <button
          onclick={() => (isSipnapDetailModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
        <div class="flex justify-between">
          <span class="text-slate-500">Saldo Awal Bulan:</span>
          <strong class="font-mono">{selectedSipnapRow.initialStock} {selectedSipnapRow.unit}</strong>
        </div>
        <div class="flex justify-between text-emerald-700">
          <span>Pemasukan PBF ({selectedSipnapRow.spRef}):</span>
          <strong class="font-mono">+{selectedSipnapRow.receivedQty} {selectedSipnapRow.unit}</strong>
        </div>
        <div class="flex justify-between text-brand-red-600">
          <span>Penyerahan Resep ({selectedSipnapRow.recipeCount} Resep):</span>
          <strong class="font-mono">-{selectedSipnapRow.dispensedQty} {selectedSipnapRow.unit}</strong>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Pemusnahan / Kadaluarsa (BAP):</span>
          <strong class="font-mono">{selectedSipnapRow.expiredOrDestroyedQty} {selectedSipnapRow.unit}</strong>
        </div>
        <div class="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm">
          <span>Saldo Akhir Buku = Fisik Lemari:</span>
          <span class="font-mono text-brand-blue">{selectedSipnapRow.finalStock} {selectedSipnapRow.unit}</span>
        </div>
      </div>

      <div class="text-[11px] text-slate-500">
        Diverifikasi oleh Apoteker PJ: <strong>{selectedSipnapRow.verifiedBy}</strong>
      </div>

      <div class="border-t border-slate-100 pt-3 flex justify-end">
        <button
          type="button"
          onclick={() => (isSipnapDetailModalOpen = false)}
          class="px-4 py-1.5 rounded-xl bg-brand-blue-700 text-white font-bold"
        >
          Tutup
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL PRATINJAU CETAK LAPORAN RESMI (FULL A4 LANDSCAPE) -->
{#if isPrintModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay print-active-sheet fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 sm:!p-6 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isPrintModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white rounded-2xl max-w-5xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-4 my-auto text-xs max-h-[92vh] overflow-y-auto scrollbar-minimalist print-sheet-card">
      <!-- KOP APOTEK RESMI -->
      <div class="border-b-2 border-slate-900 pb-3 text-center space-y-0.5">
        <div class="font-black text-base uppercase tracking-wider text-slate-900">{tenantStore.current.name}</div>
        <div class="text-[11px] text-slate-600">SIA: {tenantStore.current.siaNumber} &bull; {tenantStore.current.address}, {tenantStore.current.city} &bull; Telp: {tenantStore.current.phone}</div>
        <div class="text-[10px] text-slate-500 font-mono">Email: {tenantStore.current.email} &bull; Sistem Informasi Manajemen Farmasi Terpadu</div>
      </div>

      <!-- JUDUL LAPORAN & METADATA -->
      <div class="flex flex-col sm:flex-row sm:items-end justify-between border-b border-slate-200 pb-2 gap-2">
        <div>
          <div class="text-[10px] font-bold tracking-widest uppercase text-brand-blue">DOKUMEN LAPORAN RESMI</div>
          <h2 class="text-sm sm:text-base font-black text-slate-900 uppercase">
            {#if activeTab === "sipnap"}
              Laporan Mutasi Narkotika, Psikotropika, & Prekursor (SIPNAP Kemenkes)
            {:else if activeTab === "pareto"}
              Laporan Analisis Pareto Inventori ABC (Evaluasi Nilai Omzet & Stok)
            {:else}
              Laporan Rekapitulasi Penjualan, HPP, & Laba Kotor Shift Kasir
            {/if}
          </h2>
        </div>
        <div class="text-left sm:text-right text-[11px] text-slate-600 shrink-0 font-medium">
          <div><span class="text-slate-400">Periode:</span> <strong class="text-slate-900">{selectedPeriodLabel}</strong></div>
          <div><span class="text-slate-400">Cabang:</span> <strong class="text-slate-900">{selectedBranchId === "ALL" ? "Semua Cabang (Konsolidasi)" : (branches.find((b) => b.id === selectedBranchId)?.name || "Cabang Terpilih")}</strong></div>
          <div class="text-[10px] text-slate-400">Dicetak: {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
        </div>
      </div>

      <!-- RINGKASAN EKSEKUTIF -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px]">
        <div>
          <span class="text-slate-500 block text-[10px]">Total Omzet Bruto</span>
          <strong class="font-mono text-slate-900 text-xs">{formatRupiah(totalGrossSales)}</strong>
        </div>
        <div>
          <span class="text-slate-500 block text-[10px]">Total HPP / Modal</span>
          <strong class="font-mono text-slate-700 text-xs">{formatRupiah(totalGrossSales - totalGrossProfit)}</strong>
        </div>
        <div>
          <span class="text-slate-500 block text-[10px]">Laba Kotor (Margin)</span>
          <strong class="font-mono text-emerald-700 text-xs">{formatRupiah(totalGrossProfit)} ({averageMarginPercent}%)</strong>
        </div>
        <div>
          <span class="text-slate-500 block text-[10px]">Total Data Terfilter</span>
          <strong class="font-mono text-slate-900 text-xs">
            {#if activeTab === "sipnap"}
              {filteredSipnapRecords.length} Item SIPNAP
            {:else if activeTab === "pareto"}
              {filteredParetoRecords.length} SKU Analisis
            {:else}
              {filteredSalesRecords.length} Record Shift ({filteredSalesRecords.reduce((a, b) => a + b.trxCount, 0)} Trx)
            {/if}
          </strong>
        </div>
      </div>

      <!-- TABEL DATA LENGKAP LAPORAN (PRINTABLE FULL TABLE) -->
      <div class="border border-slate-200 rounded-xl overflow-hidden">
        <table class="w-full text-left border-collapse text-[11px]">
          {#if activeTab === "penjualan"}
            <thead class="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
              <tr>
                <th class="py-2 px-2.5 text-center w-8">No</th>
                <th class="py-2 px-2.5">Tanggal & Shift</th>
                <th class="py-2 px-2.5">Kasir & Cabang</th>
                <th class="py-2 px-2.5 text-center">Metode</th>
                <th class="py-2 px-2.5 text-center">Trx</th>
                <th class="py-2 px-2.5 text-right">Omzet Bruto</th>
                <th class="py-2 px-2.5 text-right">HPP (Modal)</th>
                <th class="py-2 px-2.5 text-right">Laba Kotor</th>
                <th class="py-2 px-2.5 text-center">Selisih Kas</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              {#if filteredSalesRecords.length === 0}
                <tr>
                  <td colspan="9" class="text-center py-6 text-slate-400">Tidak ada data shift kasir untuk filter ini.</td>
                </tr>
              {:else}
                {#each filteredSalesRecords as r, idx}
                  {@const marginPct = calculateGrossMarginPercent(r.grossSales, r.grossProfit).toFixed(1)}
                  <tr class="hover:bg-slate-50/50">
                    <td class="py-1.5 px-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td class="py-1.5 px-2.5">
                      <div class="font-mono font-bold text-slate-900">{r.date}</div>
                      <div class="text-[10px] text-slate-500">{r.shiftName}</div>
                    </td>
                    <td class="py-1.5 px-2.5">
                      <div class="font-bold text-slate-800">{r.cashierName}</div>
                      <div class="text-[10px] text-slate-400">{r.branchName}</div>
                    </td>
                    <td class="py-1.5 px-2.5 text-center font-bold text-[10px]">
                      <span class="px-1.5 py-0.5 rounded {r.paymentChannel === 'RESEP' ? 'bg-purple-100 text-purple-800' : r.paymentChannel === 'NON_CASH' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">
                        {r.paymentChannel}
                      </span>
                    </td>
                    <td class="py-1.5 px-2.5 text-center font-mono font-bold">{r.trxCount}</td>
                    <td class="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900">{formatRupiah(r.grossSales)}</td>
                    <td class="py-1.5 px-2.5 text-right font-mono text-slate-600">{formatRupiah(r.cogsHpp)}</td>
                    <td class="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-700">
                      {formatRupiah(r.grossProfit)}
                      <span class="text-[9px] font-normal text-slate-400 block">({marginPct}%)</span>
                    </td>
                    <td class="py-1.5 px-2.5 text-center font-mono">
                      {#if r.cashVariance === 0}
                        <span class="text-emerald-600 font-bold text-[10px]">KLOP</span>
                      {:else}
                        <span class="text-rose-600 font-bold text-[10px]">{formatRupiah(r.cashVariance)}</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
            <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
              <tr>
                <td colspan="4" class="py-2 px-2.5 text-right">TOTAL KESELURUHAN:</td>
                <td class="py-2 px-2.5 text-center font-mono">{filteredSalesRecords.reduce((a, b) => a + b.trxCount, 0)}</td>
                <td class="py-2 px-2.5 text-right font-mono">{formatRupiah(totalGrossSales)}</td>
                <td class="py-2 px-2.5 text-right font-mono text-slate-700">{formatRupiah(totalGrossSales - totalGrossProfit)}</td>
                <td class="py-2 px-2.5 text-right font-mono text-emerald-700">{formatRupiah(totalGrossProfit)}</td>
                <td class="py-2 px-2.5 text-center font-mono text-[10px] text-slate-600">Audit Klop</td>
              </tr>
            </tfoot>
          {:else if activeTab === "sipnap"}
            <thead class="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
              <tr>
                <th class="py-2 px-2.5 text-center w-8">No</th>
                <th class="py-2 px-2.5">Nama Obat & Sediaan</th>
                <th class="py-2 px-2.5 text-center">Golongan</th>
                <th class="py-2 px-2.5 text-right">Saldo Awal</th>
                <th class="py-2 px-2.5 text-right">Pemasukan PBF</th>
                <th class="py-2 px-2.5">Distributor & No. SP</th>
                <th class="py-2 px-2.5 text-right">Pengeluaran Resep</th>
                <th class="py-2 px-2.5 text-right">Saldo Akhir</th>
                <th class="py-2 px-2.5 text-center">Audit Fisik</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              {#if filteredSipnapRecords.length === 0}
                <tr>
                  <td colspan="9" class="text-center py-6 text-slate-400">Tidak ada data SIPNAP untuk filter ini.</td>
                </tr>
              {:else}
                {#each filteredSipnapRecords as r, idx}
                  <tr class="hover:bg-slate-50/50">
                    <td class="py-1.5 px-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td class="py-1.5 px-2.5 font-bold text-slate-900">{r.drugName}</td>
                    <td class="py-1.5 px-2.5 text-center">
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold {r.group === 'NARKOTIKA' ? 'bg-red-100 text-red-700' : r.group === 'PSIKOTROPIKA' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}">
                        {r.group}
                      </span>
                    </td>
                    <td class="py-1.5 px-2.5 text-right font-mono">{r.initialStock} {r.unit}</td>
                    <td class="py-1.5 px-2.5 text-right font-mono font-bold text-blue-700">+{r.receivedQty} {r.unit}</td>
                    <td class="py-1.5 px-2.5 text-[10px]">
                      <div class="font-bold text-slate-800">{r.supplier}</div>
                      <div class="text-slate-500 font-mono">{r.spRef}</div>
                    </td>
                    <td class="py-1.5 px-2.5 text-right font-mono font-bold text-rose-700">-{r.dispensedQty} {r.unit}</td>
                    <td class="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900">{r.finalStock} {r.unit}</td>
                    <td class="py-1.5 px-2.5 text-center font-bold text-[10px]">
                      {#if r.physicalStock === r.finalStock}
                        <span class="text-emerald-700">SESUAI ({r.physicalStock})</span>
                      {:else}
                        <span class="text-rose-700">SELISIH ({r.physicalStock - r.finalStock})</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
            <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
              <tr>
                <td colspan="7" class="py-2 px-2.5 text-right">TOTAL REGISTER SIPNAP TERAUDIT:</td>
                <td colspan="2" class="py-2 px-2.5 font-mono text-brand-blue">{filteredSipnapRecords.length} Item Obat Terverifikasi</td>
              </tr>
            </tfoot>
          {:else if activeTab === "pareto"}
            <thead class="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
              <tr>
                <th class="py-2 px-2.5 text-center w-12">Rank</th>
                <th class="py-2 px-2.5">Nama Produk & SKU</th>
                <th class="py-2 px-2.5 text-center">Kelas ABC</th>
                <th class="py-2 px-2.5 text-right">Qty Terjual</th>
                <th class="py-2 px-2.5 text-right">Nilai Omzet (Revenue)</th>
                <th class="py-2 px-2.5 text-right">Kontribusi</th>
                <th class="py-2 px-2.5 text-right">Kumulatif %</th>
                <th class="py-2 px-2.5 text-right">Stok Saat Ini</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              {#if filteredParetoRecords.length === 0}
                <tr>
                  <td colspan="8" class="text-center py-6 text-slate-400">Tidak ada data analisis Pareto untuk filter ini.</td>
                </tr>
              {:else}
                {#each filteredParetoRecords as r, idx}
                  <tr class="hover:bg-slate-50/50">
                    <td class="py-1.5 px-2.5 text-center font-mono font-bold text-slate-600">#{idx + 1}</td>
                    <td class="py-1.5 px-2.5">
                      <div class="font-bold text-slate-900">{r.name}</div>
                      <div class="text-[10px] text-slate-400 font-mono">SKU: {r.sku}</div>
                    </td>
                    <td class="py-1.5 px-2.5 text-center">
                      <span class="px-2 py-0.5 rounded text-[10px] font-black {r.category === 'A' ? 'bg-red-100 text-red-700 border border-red-200' : r.category === 'B' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
                        KELAS {r.category}
                      </span>
                    </td>
                    <td class="py-1.5 px-2.5 text-right font-mono">{r.unitsSold} {r.unit}</td>
                    <td class="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900">{formatRupiah(r.totalRevenue)}</td>
                    <td class="py-1.5 px-2.5 text-right font-mono">{r.revenueShare.toFixed(1)}%</td>
                    <td class="py-1.5 px-2.5 text-right font-mono font-bold text-blue-700">{r.cumulativeShare.toFixed(1)}%</td>
                    <td class="py-1.5 px-2.5 text-right font-mono font-bold">{r.currentStock} {r.unit}</td>
                  </tr>
                {/each}
              {/if}
            </tbody>
            <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
              <tr>
                <td colspan="4" class="py-2 px-2.5 text-right">TOTAL NILAI OMZET ANALISIS:</td>
                <td class="py-2 px-2.5 text-right font-mono text-brand-blue">{formatRupiah(filteredParetoRecords.reduce((a, b) => a + b.totalRevenue, 0))}</td>
                <td colspan="3" class="py-2 px-2.5 text-right text-[10px] text-slate-500 font-normal">Kaidah 80/20: Kelas A penyumbang omzet vital</td>
              </tr>
            </tfoot>
          {/if}
        </table>
      </div>

      <!-- KETERANGAN KEPATUHAN & TANDA TANGAN APOTEKER -->
      <div class="grid grid-cols-2 gap-4 items-end pt-3 text-[11px] text-slate-600 print-avoid-break">
        <div class="space-y-1 border-l-2 border-slate-300 pl-3">
          <div class="font-bold text-slate-800">Catatan Pelaporan & Kepatuhan Farmasi:</div>
          <div class="text-[10px] text-slate-500 leading-relaxed">
            1. Dokumen ini sah dan diterbitkan secara digital oleh Sistem ERP & POS {tenantStore.current.name}.<br />
            2. Pelaporan Narkotika/Psikotropika mengacu pada Permenkes No. 3/2015 dan terintegrasi SIPNAP Kemenkes.<br />
            3. Berita acara fisik dan kartu stok manual tersimpan di lemari khusus berpintu ganda.
          </div>
        </div>
        <div class="text-right space-y-1">
          <div>{tenantStore.current.city}, {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
          <div class="text-slate-500 text-[10px]">Apoteker Pengelola Apotek (APA),</div>
          <div class="h-14 flex items-center justify-end relative">
            {#if tenantStore.current.signatureUrl}
              <img src={tenantStore.current.signatureUrl} alt="TTD APA" class="h-12 w-auto object-contain" />
            {/if}
            {#if tenantStore.current.stampUrl}
              <img src={tenantStore.current.stampUrl} alt="Stempel Apotek" class="h-12 w-auto object-contain -ml-6 opacity-85" />
            {/if}
            {#if !tenantStore.current.signatureUrl && !tenantStore.current.stampUrl}
              <span class="text-[9px] text-slate-400 italic">(Tanda Tangan & Cap Apotek)</span>
            {/if}
          </div>
          <div class="font-bold text-slate-900 underline">{tenantStore.current.pharmacistName}</div>
          <div class="text-[10px] text-slate-500 font-mono">SIPA: {tenantStore.current.sipaNumber}</div>
        </div>
      </div>

      <!-- TOMBOL AKSI MODAL (DISEMBUNYIKAN SAAT CETAK) -->
      <div class="border-t border-slate-100 pt-3 flex justify-end gap-2 no-print">
        <button
          type="button"
          onclick={() => (isPrintModalOpen = false)}
          class="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 text-xs transition-colors"
        >
          Tutup
        </button>
        <button
          type="button"
          onclick={() => {
            window.print();
          }}
          class="px-4 py-1.5 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold inline-flex items-center gap-1.5 text-xs shadow-sm transition-colors"
        >
          <Printer class="w-3.5 h-3.5" />
          <span>Cetak Dokumen Resmi (A4 Landscape)</span>
        </button>
      </div>
    </div>
  </div>
{/if}
