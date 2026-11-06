<script lang="ts">
  import {
    Building2,
    Plus,
    Phone,
    MapPin,
    AlertCircle,
    CheckCircle2,
    Clock,
    Search,
    DollarSign,
    Truck,
    X
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import suppliersData from "$lib/mocks/suppliers.json";
  import { portal } from "$lib/actions/portal";
  import { onMount } from "svelte";
  import { mockApi } from "$lib/services/mock-api";

  let suppliers = $state(suppliersData);
  let activeTab = $state<"semua" | "hutang">("semua");
  let searchQuery = $state("");

  onMount(async () => {
    try {
      const live = await mockApi.getSuppliers();
      if (live && live.length > 0) {
        suppliers = live as any;
      }
    } catch (_) {}
  });

  // Modals
  let isAddSupplierModalOpen = $state(false);
  let isPayPbfDebtModalOpen = $state(false);
  let selectedPbfDebt = $state<any>(null);
  let pbfPaymentAmount = $state(0);
  let pbfPaymentMethod = $state("TRANSFER_BCA");

  function openPayPbfDebt(d: any) {
    selectedPbfDebt = d;
    pbfPaymentAmount = d.totalDebt;
    isPayPbfDebtModalOpen = true;
  }

  function handleSavePbfPayment() {
    if (!selectedPbfDebt || pbfPaymentAmount <= 0) return;
    selectedPbfDebt.totalDebt = Math.max(0, selectedPbfDebt.totalDebt - pbfPaymentAmount);
    if (selectedPbfDebt.totalDebt === 0) {
      selectedPbfDebt.status = "PAID";
    }
    isPayPbfDebtModalOpen = false;
    selectedPbfDebt = null;
  }

  function formatRupiah(num: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(num);
  }

  // Filtered
  let filteredSuppliers = $derived(
    suppliers.filter((s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.phone.includes(searchQuery)
    )
  );

  // Mock Hutang Dagang PBF
  let pbfDebts = $state([
    {
      id: "deb-pbf-01",
      supplierName: "PT. Mensa Binasukses (MBS)",
      code: "SUP-002",
      invoiceRef: "FP-MBS-2025-1042",
      totalDebt: 8750000,
      dueDate: "2025-11-04",
      status: "DUE_SOON",
      daysLeft: 2
    },
    {
      id: "deb-pbf-02",
      supplierName: "PT. Anugrah Argon Medica (AAM)",
      code: "SUP-003",
      invoiceRef: "FP-AAM-2025-3312",
      totalDebt: 5400000,
      dueDate: "2025-10-15",
      status: "OVERDUE",
      daysLeft: -12
    },
    {
      id: "deb-pbf-03",
      supplierName: "PT. Enseval Putera Megatrading",
      code: "SUP-004",
      invoiceRef: "FP-ENS-2025-0455",
      totalDebt: 3200000,
      dueDate: "2025-11-28",
      status: "CURRENT",
      daysLeft: 26
    }
  ]);

  let totalPayables = $derived(pbfDebts.reduce((a, b) => a + b.totalDebt, 0));
</script>

<svelte:head>
  <title>Supplier & Distributor PBF | Apoteku.com</title>
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Supplier & Distributor PBF"
    subtitle="Pedagang besar farmasi dan kontrol hutang dagang apotek"
    icon={Building2}
    breadcrumbs={[{ label: "Supplier / PBF" }]}
  >
    {#snippet actions()}
      <button
        type="button"
        onclick={() => (isAddSupplierModalOpen = true)}
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
      >
        <Plus class="w-4 h-4" />
        <span>Tambah PBF Baru</span>
      </button>
    {/snippet}
  </PageHeader>

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Total PBF Rekanan"
      value="{suppliers.length} Distributor"
      subtext="Izin edar resmi terverifikasi"
      icon={Building2}
      variant="brand"
    />
    <MetricCard
      title="Hutang Dagang"
      value={formatRupiah(totalPayables)}
      subtext="3 Faktur belum lunas"
      icon={Clock}
      variant="warning"
    />
    <MetricCard
      title="Jatuh Tempo"
      value="2 Hari Lagi"
      subtext="PT. Mensa Binasukses"
      icon={AlertCircle}
      variant="danger"
    />
    <MetricCard
      title="Kepatuhan Bayar"
      value="96% Ontime"
      subtext="Menjaga reputasi kredit apotek"
      icon={CheckCircle2}
      variant="success"
    />
  </div>

  <!-- TAB NAVIGATION -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold">
    <button
      type="button"
      onclick={() => (activeTab = "semua")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'semua' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Direktori PBF ({suppliers.length})</span>
      {#if activeTab === "semua"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "hutang")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'hutang' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Buku Hutang Faktur ({pbfDebts.length})</span>
      {#if activeTab === "hutang"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>
  </div>

  <!-- TAB 1: DIREKTORI PBF -->
  {#if activeTab === "semua"}
    <DataTable
      title="Daftar Distributor PBF Rekanan"
      searchPlaceholder="Cari nama distributor, kode PBF, atau kontak..."
      bind:searchValue={searchQuery}
      totalCount={filteredSuppliers.length}
    >
      {#snippet header()}
        <th class="py-3 px-4">Kode</th>
        <th class="py-3 px-4">Nama Distributor PBF</th>
        <th class="py-3 px-4">Kontak</th>
        <th class="py-3 px-4">Alamat Gudang / Depo</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#each filteredSuppliers as s}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono font-bold text-slate-900">{s.code}</td>
            <td class="py-3.5 px-4">
              <div class="font-bold text-slate-900">{s.name}</div>
            </td>
            <td class="py-3.5 px-4 font-mono text-slate-600 text-xs">{s.phone}</td>
            <td class="py-3.5 px-4 text-slate-500 text-xs max-w-xs truncate">{s.address}</td>
            <td class="py-3.5 px-4 text-center">
              <Badge type="SUCCESS" label="AKTIF" />
            </td>
            <td class="py-3.5 px-4 text-center">
              <a
                href="/pembelian"
                class="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-brand-blue hover:bg-blue-50 text-slate-600 hover:text-brand-blue text-[11px] font-bold transition-all inline-block"
              >
                + Buat SP
              </a>
            </td>
          </tr>
        {/each}
      {/snippet}
    </DataTable>

  <!-- TAB 2: BUKU HUTANG FAKTUR -->
  {:else if activeTab === "hutang"}
    <DataTable
      title="Buku Hutang Faktur Distributor PBF"
      searchPlaceholder="Cari nama PBF atau nomor faktur..."
      bind:searchValue={searchQuery}
      totalCount={pbfDebts.length}
    >
      {#snippet header()}
        <th class="py-3 px-4">No. Faktur PBF</th>
        <th class="py-3 px-4">Distributor PBF</th>
        <th class="py-3 px-4">Jatuh Tempo (TOP)</th>
        <th class="py-3 px-4 text-right">Saldo Hutang</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#each pbfDebts as d}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono font-bold text-slate-900">{d.invoiceRef}</td>
            <td class="py-3.5 px-4 font-bold text-slate-800">{d.supplierName}</td>
            <td class="py-3.5 px-4 font-mono {d.status === 'OVERDUE' ? 'text-brand-red-600 font-bold' : d.status === 'DUE_SOON' ? 'text-amber-600 font-bold' : 'text-slate-600'}">
              {d.dueDate} ({d.daysLeft > 0 ? `${d.daysLeft} hari lagi` : 'Lewat tempo'})
            </td>
            <td class="py-3.5 px-4 text-right font-mono font-black text-brand-red-600">
              {formatRupiah(d.totalDebt)}
            </td>
            <td class="py-3.5 px-4 text-center">
              {#if d.status === "OVERDUE"}
                <Badge type="DANGER" label="LEWAT TEMPO" />
              {:else if d.status === "DUE_SOON"}
                <Badge type="WARNING" label="H-2 JATUH TEMPO" />
              {:else}
                <Badge type="INFO" label="BERJALAN" />
              {/if}
            </td>
            <td class="py-3.5 px-4 text-center">
              {#if d.totalDebt > 0}
                <button
                  type="button"
                  onclick={() => openPayPbfDebt(d)}
                  class="px-2.5 py-1 rounded-lg bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-[11px] transition-colors"
                >
                  Bayar Hutang
                </button>
              {:else}
                <span class="text-emerald-600 font-bold text-[11px] flex items-center justify-center gap-1">
                  <CheckCircle2 class="w-3.5 h-3.5" /> Lunas
                </span>
              {/if}
            </td>
          </tr>
        {/each}
      {/snippet}
    </DataTable>
  {/if}
</div>

<!-- MODAL TAMBAH PBF -->
{#if isAddSupplierModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isAddSupplierModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <Building2 class="w-5 h-5 text-brand-blue" />
          <span>Tambah Distributor / PBF Baru</span>
        </div>
        <button
          onclick={() => (isAddSupplierModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div class="col-span-2">
          <label for="sup-name" class="font-bold text-slate-700 block mb-1">Nama Perusahaan PBF</label>
          <input
            id="sup-name"
            type="text"
            placeholder="Contoh: PT. Parit Padang Global"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium"
          />
        </div>
        <div>
          <label for="sup-phone" class="font-bold text-slate-700 block mb-1">Telepon / Sales Rep</label>
          <input
            id="sup-phone"
            type="tel"
            placeholder="(0265) 334455"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
          />
        </div>
        <div>
          <label for="sup-term" class="font-bold text-slate-700 block mb-1">Termin Pembayaran Default</label>
          <Select
            id="sup-term"
            options={[
              "30 Hari (1 Bulan TOP)",
              "14 Hari (2 Minggu TOP)",
              "COD (Bayar Tunai / Cek Saat Terima)",
              "60 Hari (2 Bulan TOP)"
            ]}
          />
        </div>
        <div class="col-span-2">
          <label for="sup-addr" class="font-bold text-slate-700 block mb-1">Alamat Kantor / Depo Distribusi</label>
          <input
            id="sup-addr"
            type="text"
            placeholder="Jl. Perintis Kemerdekaan No. 88, Tasikmalaya"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isAddSupplierModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={() => {
            isAddSupplierModalOpen = false;
            alert("Distributor PBF baru berhasil ditambahkan!");
          }}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm"
        >
          Simpan PBF
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL PELUNASAN HUTANG PBF -->
{#if isPayPbfDebtModalOpen && selectedPbfDebt}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isPayPbfDebtModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <Truck class="w-5 h-5 text-brand-blue" />
          <span>Pembayaran Hutang PBF</span>
        </div>
        <button
          onclick={() => (isPayPbfDebtModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
          <div class="text-slate-500 text-[11px]">Distributor Dituju:</div>
          <div class="font-bold text-slate-900 text-sm">{selectedPbfDebt.supplierName}</div>
          <div class="font-mono text-slate-600 text-xs">Faktur Ref: {selectedPbfDebt.invoiceRef}</div>
          <div class="flex justify-between pt-2 border-t border-slate-200 font-bold">
            <span class="text-slate-500">Sisa Tagihan:</span>
            <span class="text-brand-red-600 font-mono">{formatRupiah(selectedPbfDebt.totalDebt)}</span>
          </div>
        </div>

        <div>
          <label for="pbf-pay-meth" class="font-bold text-slate-700 block mb-1">Metode Pembayaran</label>
          <Select
            id="pbf-pay-meth"
            bind:value={pbfPaymentMethod}
            options={[
              "TRANSFER_BCA (Rekening BCA Apotek)",
              "TRANSFER_MANDIRI (Rekening Mandiri)",
              "BILYET_GIRO (Giro Bank)",
              "KAS_KASIR (Kas Operasional)"
            ]}
          />
        </div>

        <div>
          <label for="pbf-pay-amount" class="font-bold text-slate-700 block mb-1">Nominal Pembayaran (Rp)</label>
          <input
            id="pbf-pay-amount"
            type="number"
            bind:value={pbfPaymentAmount}
            max={selectedPbfDebt.totalDebt}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 text-sm"
          />
        </div>
      </div>

      <div class="border-t border-slate-100 pt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isPayPbfDebtModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleSavePbfPayment}
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
        >
          Konfirmasi Bayar
        </button>
      </div>
    </div>
  </div>
{/if}
