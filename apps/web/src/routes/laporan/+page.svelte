<script lang="ts">
  import {
    BarChart3,
    Calendar,
    Download,
    FileSpreadsheet,
    Printer,
    TrendingUp,
    ShieldAlert,
    PieChart,
    Layers,
    Filter
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";

  let activeTab = $state<"penjualan" | "sipnap" | "pareto">("penjualan");

  function formatRupiah(num: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(num);
  }

  // SIPNAP Mock Records (Format resmi Kemenkes)
  let sipnapRecords = $state([
    {
      id: "sip-01",
      drugName: "Codeine 10mg Tablet",
      group: "NARKOTIKA",
      initialStock: 200,
      receivedQty: 500,
      supplier: "PT. Kimia Farma (T&D)",
      dispensedQty: 80,
      finalStock: 620,
      unit: "TABLET"
    },
    {
      id: "sip-02",
      drugName: "Diazepam 2mg Tablet",
      group: "PSIKOTROPIKA",
      initialStock: 150,
      receivedQty: 300,
      supplier: "PT. Kimia Farma (T&D)",
      dispensedQty: 60,
      finalStock: 390,
      unit: "TABLET"
    },
    {
      id: "sip-03",
      drugName: "Alprazolam 0.5mg Tablet",
      group: "PSIKOTROPIKA",
      initialStock: 80,
      receivedQty: 200,
      supplier: "PT. Mensa Binasukses",
      dispensedQty: 45,
      finalStock: 235,
      unit: "TABLET"
    }
  ]);

  // Pareto ABC Mock Analysis
  let paretoRecords = $state([
    {
      name: "Amoxicillin 500mg",
      category: "A",
      revenueShare: 34.5,
      unitsSold: 280,
      totalRevenue: 2380000
    },
    {
      name: "Paracetamol 500mg",
      category: "A",
      revenueShare: 28.2,
      unitsSold: 420,
      totalRevenue: 1950000
    },
    {
      name: "Cefixime 100mg",
      category: "B",
      revenueShare: 14.8,
      unitsSold: 65,
      totalRevenue: 1020000
    },
    {
      name: "Salbutamol Inhaler",
      category: "B",
      revenueShare: 12.1,
      unitsSold: 12,
      totalRevenue: 840000
    },
    {
      name: "Minyak Telon Plus",
      category: "C",
      revenueShare: 10.4,
      unitsSold: 22,
      totalRevenue: 715000
    }
  ]);
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
      <button
        type="button"
        onclick={() => alert("Mengunduh laporan dalam format Microsoft Excel (.xlsx)...")}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs"
      >
        <FileSpreadsheet class="w-4 h-4 text-emerald-600" />
        <span>Export Excel</span>
      </button>

      <button
        type="button"
        onclick={() => alert("Membuka dialog cetak PDF resmi untuk Dinas Kesehatan / BPOM...")}
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
      >
        <Printer class="w-4 h-4" />
        <span>Cetak Laporan PDF</span>
      </button>
    {/snippet}
  </PageHeader>

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Omzet Bulan Ini"
      value="124.500.000"
      subtext="+14.8% dari bulan lalu"
      icon={BarChart3}
      variant="brand"
    />
    <MetricCard
      title="Kepatuhan SIPNAP"
      value="100% Valid"
      subtext="Saldo klop dengan fisik"
      icon={ShieldAlert}
      variant="success"
    />
    <MetricCard
      title="Produk Kategori A"
      value="2 Item (62.7%)"
      subtext="Fokus ketersediaan stok utama"
      icon={PieChart}
      variant="default"
    />
    <MetricCard
      title="Margin Rata-rata"
      value="24.5%"
      subtext="Rasio profitabilitas apotek"
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
      <span>Laporan Omzet & Penjualan</span>
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
        <span>Laporan SIPNAP (Kemenkes / BPOM)</span>
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
        <span>Analisis Pareto ABC (Fast/Slow Moving)</span>
      </div>
      {#if activeTab === "pareto"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>
  </div>

  <!-- TAB 1: PENJUALAN REKAP -->
  {#if activeTab === "penjualan"}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Rekapitulasi Penjualan Harian & Kasir (Oktober 2025)</h3>
          <p class="text-xs text-slate-500 mt-0.5">Dikelompokkan berdasarkan shift kasir dan kanal pembayaran</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="p-4 rounded-xl bg-blue-50/50 border border-blue-100">
          <div class="text-xs font-bold text-slate-500">Penjualan Tunai (Cash)</div>
          <div class="text-xl font-black text-brand-blue mt-1">Rp 3.120.000</div>
          <div class="text-[11px] text-slate-400 mt-1">64.3% dari total harian</div>
        </div>
        <div class="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
          <div class="text-xs font-bold text-slate-500">Non-Tunai (QRIS & EDC)</div>
          <div class="text-xl font-black text-emerald-600 mt-1">Rp 1.480.000</div>
          <div class="text-[11px] text-slate-400 mt-1">30.5% dari total harian</div>
        </div>
        <div class="p-4 rounded-xl bg-purple-50/50 border border-purple-100">
          <div class="text-xs font-bold text-slate-500">Resep Dokter & Asuransi</div>
          <div class="text-xl font-black text-purple-700 mt-1">Rp 250.000</div>
          <div class="text-[11px] text-slate-400 mt-1">5.2% dari total harian</div>
        </div>
      </div>
    </div>

  <!-- TAB 2: SIPNAP KEMENKES -->
  {:else if activeTab === "sipnap"}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Laporan Resmi SIPNAP (Sistem Informasi Pelaporan Narkotika & Psikotropika)</h3>
          <p class="text-xs text-slate-500 mt-0.5">Format baku pelaporan bulanan ke Kemenkes RI dan Badan POM</p>
        </div>
        <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
          Periode: Oktober 2025
        </span>
      </div>

      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-100">
              <th class="py-3 px-4">Nama Obat</th>
              <th class="py-3 px-4">Golongan</th>
              <th class="py-3 px-4 text-right">Saldo Awal</th>
              <th class="py-3 px-4 text-right">PBF</th>
              <th class="py-3 px-4">Distributor</th>
              <th class="py-3 px-4 text-right">Resep</th>
              <th class="py-3 px-4 text-right">Saldo Akhir</th>
              <th class="py-3 px-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
            {#each sipnapRecords as rec}
              <tr class="hover:bg-slate-50/50">
                <td class="py-3.5 px-4 font-bold text-slate-900">{rec.drugName}</td>
                <td class="py-3.5 px-4">
                  <Badge type={rec.group === 'NARKOTIKA' ? 'NARKOTIKA' : 'PSIKOTROPIKA'} />
                </td>
                <td class="py-3.5 px-4 text-right font-mono font-semibold">{rec.initialStock}</td>
                <td class="py-3.5 px-4 text-right font-mono font-bold text-emerald-600">+{rec.receivedQty}</td>
                <td class="py-3.5 px-4 text-slate-600 text-[11px]">{rec.supplier}</td>
                <td class="py-3.5 px-4 text-right font-mono font-bold text-brand-red-600">-{rec.dispensedQty}</td>
                <td class="py-3.5 px-4 text-right font-mono font-black text-brand-blue">{rec.finalStock} {rec.unit}</td>
                <td class="py-3.5 px-4 text-center">
                  <span class="text-emerald-600 font-bold text-[11px]">✓ Rekonsiliasi Klop</span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

  <!-- TAB 3: PARETO ABC -->
  {:else if activeTab === "pareto"}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Analisis Pareto ABC (Pengendalian Investasi Stok Obat)</h3>
          <p class="text-xs text-slate-500 mt-0.5">Kategori A: 80% omzet (pengawasan ketat) | Kategori B: 15% | Kategori C: 5% (dead stock watch)</p>
        </div>
      </div>

      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-100">
              <th class="py-3 px-4">Nama Produk</th>
              <th class="py-3 px-4 text-center">Kategori Pareto</th>
              <th class="py-3 px-4 text-center">Qty Terjual</th>
              <th class="py-3 px-4 text-right">Kontribusi Omzet</th>
              <th class="py-3 px-4 text-right">Persentase</th>
              <th class="py-3 px-4">Rekomendasi Apoteker</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
            {#each paretoRecords as p}
              <tr class="hover:bg-slate-50/50">
                <td class="py-3.5 px-4 font-bold text-slate-900">{p.name}</td>
                <td class="py-3.5 px-4 text-center">
                  <span class="px-3 py-1 rounded-full text-xs font-black {p.category === 'A' ? 'bg-red-100 text-brand-red-700' : p.category === 'B' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}">
                    Kelas {p.category}
                  </span>
                </td>
                <td class="py-3.5 px-4 text-center font-bold font-mono">{p.unitsSold} Unit</td>
                <td class="py-3.5 px-4 text-right font-mono font-bold text-slate-900">{formatRupiah(p.totalRevenue)}</td>
                <td class="py-3.5 px-4 text-right font-mono font-bold text-brand-blue">{p.revenueShare}%</td>
                <td class="py-3.5 px-4 text-xs text-slate-500">
                  {#if p.category === "A"}
                    <span class="text-brand-red-600 font-semibold">Wajib selalu ada stok aman (Buffer stock tinggi)</span>
                  {:else if p.category === "B"}
                    <span class="text-amber-700 font-semibold">Pemesanan berkala dua mingguan</span>
                  {:else}
                    <span class="text-slate-500">Order sesuai kebutuhan resep saja (Just-in-Time)</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
