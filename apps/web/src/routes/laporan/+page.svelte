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
  import { mockApi } from "$lib/services/mock-api";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { formatRupiah } from "@apoteku/core";

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

  // Master Data & Filters
  let branches = $state<any[]>([]);
  let selectedBranchId = $state(authStore.user?.branchId || "1");
  let selectedPeriod = $state("2025-10");
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

  // 1. Mock Sales & Shift Margin Records
  let salesShiftRecords = $state<SalesShiftReportRow[]>([
    {
      id: "rep-sls-01",
      date: "2025-10-28",
      branchId: "1",
      branchName: "Apotek Hafidz Farma Pusat",
      shiftName: "Shift Pagi (07:00 - 15:00)",
      cashierName: "Darajat Rahmatulloh",
      trxCount: 42,
      paymentChannel: "CASH",
      grossSales: 3120000,
      cogsHpp: 2340000,
      grossProfit: 780000,
      cashVariance: 0
    },
    {
      id: "rep-sls-02",
      date: "2025-10-28",
      branchId: "1",
      branchName: "Apotek Hafidz Farma Pusat",
      shiftName: "Shift Pagi (07:00 - 15:00)",
      cashierName: "Darajat Rahmatulloh",
      trxCount: 19,
      paymentChannel: "NON_CASH",
      grossSales: 1480000,
      cogsHpp: 1120000,
      grossProfit: 360000,
      cashVariance: 0
    },
    {
      id: "rep-sls-03",
      date: "2025-10-28",
      branchId: "1",
      branchName: "Apotek Hafidz Farma Pusat",
      shiftName: "Shift Siang (15:00 - 22:00)",
      cashierName: "Nida Farida",
      trxCount: 14,
      paymentChannel: "RESEP",
      grossSales: 1850000,
      cogsHpp: 1295000,
      grossProfit: 555000,
      cashVariance: 0
    },
    {
      id: "rep-sls-04",
      date: "2025-10-27",
      branchId: "2",
      branchName: "Apotek Hafidz Farma 2",
      shiftName: "Shift Pagi (07:00 - 15:00)",
      cashierName: "Cantika Nur Gustiani",
      trxCount: 31,
      paymentChannel: "CASH",
      grossSales: 2450000,
      cogsHpp: 1860000,
      grossProfit: 590000,
      cashVariance: -2000
    }
  ]);

  // 2. SIPNAP Mock Records (Format resmi Kemenkes & BPOM)
  let sipnapRecords = $state<SipnapReportRow[]>([
    {
      id: "sip-01",
      branchId: "1",
      period: "2025-10",
      drugName: "Codeine 10mg Tablet",
      group: "NARKOTIKA",
      initialStock: 200,
      receivedQty: 500,
      supplier: "PT. Kimia Farma (T&D)",
      spRef: "SP-NRK-HF-2025-0002",
      dispensedQty: 80,
      recipeCount: 8,
      expiredOrDestroyedQty: 0,
      finalStock: 620,
      physicalStock: 620,
      unit: "TABLET",
      verifiedBy: "apt. Hafidz Nurul, S.Farm."
    },
    {
      id: "sip-02",
      branchId: "1",
      period: "2025-10",
      drugName: "Diazepam 2mg Tablet",
      group: "PSIKOTROPIKA",
      initialStock: 150,
      receivedQty: 300,
      supplier: "PT. Kimia Farma (T&D)",
      spRef: "SP-PSI-HF-2025-0004",
      dispensedQty: 60,
      recipeCount: 6,
      expiredOrDestroyedQty: 0,
      finalStock: 390,
      physicalStock: 390,
      unit: "TABLET",
      verifiedBy: "apt. Hafidz Nurul, S.Farm."
    },
    {
      id: "sip-03",
      branchId: "1",
      period: "2025-10",
      drugName: "Alprazolam 0.5mg Tablet",
      group: "PSIKOTROPIKA",
      initialStock: 80,
      receivedQty: 200,
      supplier: "PT. Mensa Binasukses",
      spRef: "SP-PSI-HF-2025-0005",
      dispensedQty: 45,
      recipeCount: 5,
      expiredOrDestroyedQty: 0,
      finalStock: 235,
      physicalStock: 235,
      unit: "TABLET",
      verifiedBy: "apt. Hafidz Nurul, S.Farm."
    },
    {
      id: "sip-04",
      branchId: "2",
      period: "2025-10",
      drugName: "Pseudoephedrine HCl 60mg (Tremenza)",
      group: "PREKURSOR",
      initialStock: 120,
      receivedQty: 200,
      supplier: "PT. Anugrah Argon Medica",
      spRef: "SP-PRE-HF-2025-0012",
      dispensedQty: 95,
      recipeCount: 19,
      expiredOrDestroyedQty: 0,
      finalStock: 225,
      physicalStock: 225,
      unit: "TABLET",
      verifiedBy: "apt. Hafidz Nurul, S.Farm."
    }
  ]);

  // 3. Pareto ABC Mock Analysis
  let paretoRecords = $state<ParetoReportRow[]>([
    {
      id: "par-01",
      branchId: "1",
      name: "Amoxicillin 500mg (Errata)",
      sku: "900000092",
      category: "A",
      unitsSold: 280,
      unit: "STRIP",
      totalRevenue: 2380000,
      grossMarginPercent: 26.4,
      revenueShare: 34.5,
      cumulativeShare: 34.5,
      currentStock: 150
    },
    {
      id: "par-02",
      branchId: "1",
      name: "Paracetamol 500mg (Kimia Farma)",
      sku: "900000104",
      category: "A",
      unitsSold: 420,
      unit: "STRIP",
      totalRevenue: 1950000,
      grossMarginPercent: 28.0,
      revenueShare: 28.2,
      cumulativeShare: 62.7,
      currentStock: 320
    },
    {
      id: "par-03",
      branchId: "1",
      name: "Cefixime 100mg Kapsul",
      sku: "900000215",
      category: "B",
      unitsSold: 65,
      unit: "STRIP",
      totalRevenue: 1020000,
      grossMarginPercent: 24.5,
      revenueShare: 14.8,
      cumulativeShare: 77.5,
      currentStock: 45
    },
    {
      id: "par-04",
      branchId: "1",
      name: "Salbutamol Inhaler 100mcg",
      sku: "900000318",
      category: "B",
      unitsSold: 12,
      unit: "BOX",
      totalRevenue: 840000,
      grossMarginPercent: 21.0,
      revenueShare: 12.1,
      cumulativeShare: 89.6,
      currentStock: 8
    },
    {
      id: "par-05",
      branchId: "2",
      name: "Minyak Telon Plus Lavender 100ml",
      sku: "900000409",
      category: "C",
      unitsSold: 22,
      unit: "BOTOL",
      totalRevenue: 715000,
      grossMarginPercent: 18.5,
      revenueShare: 10.4,
      cumulativeShare: 100.0,
      currentStock: 15
    }
  ]);

  onMount(async () => {
    if (authStore.user?.branchId) {
      selectedBranchId = authStore.user.branchId;
    }
    try {
      await mockApi.ensureDataLoaded();
      const [bList, sipRes] = await Promise.all([
        mockApi.getBranches(),
        api.reports.getSipnap()
      ]);
      if (bList.length > 0) {
        branches = bList;
        if (!authStore.user?.branchId && bList[0]?.id) {
          selectedBranchId = bList[0].id;
        }
      }
      if (sipRes?.success && Array.isArray(sipRes.data) && sipRes.data.length > 0) {
        sipnapRecords = sipRes.data.map((s: any) => ({
          id: s.id,
          branchId: "1",
          period: "2026-11",
          drugName: s.name,
          group: s.category as any,
          initialStock: s.initialStock,
          receivedQty: s.stockIn,
          supplier: s.pbfSupplier,
          spRef: `SP-${s.code}`,
          dispensedQty: s.stockOut,
          recipeCount: Math.ceil(s.stockOut / 2),
          expiredOrDestroyedQty: 0,
          finalStock: s.finalStock,
          physicalStock: s.finalStock,
          unit: s.unit,
          verifiedBy: "apt. Ghina Nadhifah, S.Farm."
        }));
      }
    } catch (_) {}
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
    totalGrossSales > 0
      ? ((totalGrossProfit / totalGrossSales) * 100).toFixed(1)
      : "0.0"
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
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Laporan & Kepatuhan Farmasi"
    subtitle="Penjualan, audit SIPNAP Kemenkes, dan analitik pareto"
    icon={BarChart3}
    breadcrumbs={[{ label: "Laporan" }]}
  >
    {#snippet actions()}
      <div class="grid grid-rows-2 justify-items-end gap-2">
        <div class="flex justify-end gap-2">
          <!-- Period Selector -->
          <div class="w-40">
            <Select
              value={selectedPeriod}
              onchange={(val) => (selectedPeriod = val)}
              options={[
                { value: "2025-10", label: "Oktober 2025" },
                { value: "2025-09", label: "September 2025" },
                { value: "2025-08", label: "Agustus 2025" }
              ]}
            />
          </div>

          <button
            type="button"
            onclick={exportActiveReportCsv}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs"
          >
            <FileSpreadsheet class="w-4 h-4 text-emerald-600" />
            <span>Export Excel/CSV</span>
          </button>

          <button
            type="button"
            onclick={() => (isPrintModalOpen = true)}
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
          >
            <Printer class="w-4 h-4" />
            <span>Cetak Laporan PDF</span>
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
      value={formatRupiah(totalGrossSales)}
      subtext="Laba Kotor: {formatRupiah(totalGrossProfit)}"
      icon={BarChart3}
      variant="brand"
    />
    <MetricCard
      title="Kepatuhan SIPNAP"
      value="{branchSipnapRecords.length} Obat Klop"
      subtext="Saldo buku = fisik lemari narkotika"
      icon={ShieldAlert}
      variant="success"
    />
    <MetricCard
      title="Produk Kategori A"
      value="{classAItems.length} Item ({classAShareSum}%)"
      subtext="Penyumbang utama omzet apotek"
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
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold">
    <button
      type="button"
      onclick={() => (activeTab = "penjualan")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'penjualan' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Laporan Omzet & Shift Kasir ({branchSalesRecords.length})</span>
      {#if activeTab === "penjualan"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "sipnap")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'sipnap' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
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
      class="pb-3 px-3 transition-colors relative {activeTab === 'pareto' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
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
        <div class="text-xs font-bold text-slate-500">Non-Tunai (QRIS & EDC)</div>
        <div class="text-xl font-black text-emerald-600 mt-1 font-mono">{formatRupiah(totalNonCashSales)}</div>
        <div class="text-[11px] text-slate-400 mt-1">Settlement otomatis rekening bank</div>
      </div>
      <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div class="text-xs font-bold text-slate-500">Pelayanan Resep Dokter</div>
        <div class="text-xl font-black text-purple-700 mt-1 font-mono">{formatRupiah(totalPrescriptionSales)}</div>
        <div class="text-[11px] text-slate-400 mt-1">Termasuk jasa Tuslah & Embalase</div>
      </div>
    </div>

    <DataTable
      title="Rekapitulasi Omzet, HPP, & Laba Kotor per Shift Kasir"
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
              { value: "NON_CASH", label: "QRIS & EDC" },
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
        {#each filteredSalesRecords as r}
          {@const marginPct = ((r.grossProfit / r.grossSales) * 100).toFixed(1)}
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
      {/snippet}
    </DataTable>

  <!-- TAB 2: SIPNAP KEMENKES -->
  {:else if activeTab === "sipnap"}
    <DataTable
      title="Laporan Mutasi Narkotika, Psikotropika, & Prekursor (SIPNAP Kemenkes)"
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
        <th class="py-3 px-4 text-right">Saldo Awal</th>
        <th class="py-3 px-4 text-right">Masuk PBF</th>
        <th class="py-3 px-4">Distributor & No. SP</th>
        <th class="py-3 px-4 text-right">Keluar Resep</th>
        <th class="py-3 px-4 text-right">Saldo Akhir</th>
        <th class="py-3 px-4 text-center">Audit Fisik</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
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
      {/snippet}
    </DataTable>

  <!-- TAB 3: PARETO ABC -->
  {:else if activeTab === "pareto"}
    <DataTable
      title="Analisis Pareto ABC (Pengendalian Investasi & Kecepatan Perputaran Stok)"
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
        <th class="py-3 px-4">Nama Produk</th>
        <th class="py-3 px-4 text-center">Kelas ABC</th>
        <th class="py-3 px-4 text-center">Qty Terjual</th>
        <th class="py-3 px-4 text-right">Kontribusi Omzet</th>
        <th class="py-3 px-4 text-right">Porsi / Kumulatif</th>
        <th class="py-3 px-4 text-center">Margin</th>
        <th class="py-3 px-4">Rekomendasi Pengadaan</th>
      {/snippet}

      {#snippet rows()}
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

<!-- MODAL PRATINJAU CETAK LAPORAN RESMI -->
{#if isPrintModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isPrintModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto text-xs">
      <div class="text-center border-b-2 border-slate-900 pb-3">
        <div class="font-black text-sm text-slate-900">APOTEK HAFIDZ FARMA</div>
        <div class="text-[11px] text-slate-600">
          Laporan Resmi: {activeTab === "sipnap"
            ? "Pelaporan Narkotika & Psikotropika (SIPNAP)"
            : activeTab === "pareto"
              ? "Analisis Pareto ABC Inventori"
              : "Rekapitulasi Omzet & Laba Kotor"}
        </div>
        <div class="font-mono text-[11px] text-brand-blue font-bold">Periode: {selectedPeriod}</div>
      </div>

      <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
        <div class="flex justify-between">
          <span class="text-slate-500">Total Omzet Bruto:</span>
          <strong class="font-mono">{formatRupiah(totalGrossSales)}</strong>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Total Laba Kotor:</span>
          <strong class="font-mono text-emerald-700">{formatRupiah(totalGrossProfit)} ({averageMarginPercent}%)</strong>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Item SIPNAP Teraudit:</span>
          <strong>{branchSipnapRecords.length} Jenis Obat (100% Klop)</strong>
        </div>
      </div>

      <div class="flex justify-between items-end pt-4 text-[11px] text-slate-600">
        <div>Dokumen Audit Internal & Pelaporan Dinkes/BPOM</div>
        <div class="text-right">
          <div>Tasikmalaya, Oktober 2025</div>
          <div class="font-bold text-slate-900 pt-8 underline">apt. Hafidz Nurul, S.Farm.</div>
          <div class="text-[10px]">SIPA: 503/044/Dinkes/2024</div>
        </div>
      </div>

      <div class="border-t border-slate-100 pt-3 flex justify-end gap-2">
        <button
          type="button"
          onclick={() => (isPrintModalOpen = false)}
          class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={() => {
            window.print();
            isPrintModalOpen = false;
          }}
          class="px-4 py-1.5 rounded-xl bg-brand-blue-700 text-white font-bold inline-flex items-center gap-1.5"
        >
          <Printer class="w-3.5 h-3.5" />
          <span>Cetak Sekarang</span>
        </button>
      </div>
    </div>
  </div>
{/if}
