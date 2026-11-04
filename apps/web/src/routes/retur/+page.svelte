<script lang="ts">
  import {
    RotateCcw,
    Plus,
    ShoppingCart,
    ShoppingBag,
    CheckCircle2,
    AlertCircle,
    Calendar,
    Search,
    Printer,
    DollarSign,
    X
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import { portal } from "$lib/actions/portal";

  // Tab State: "penjualan" (Customer return) | "pembelian" (Return to PBF)
  let activeTab = $state<"penjualan" | "pembelian">("penjualan");
  let searchQuery = $state("");

  // Modals
  let isAddReturModalOpen = $state(false);

  // Currency Formatter
  function formatRupiah(num: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(num);
  }

  // Mock Retur Penjualan
  let customerReturns = $state([
    {
      id: "ret-cust-001",
      returnNumber: "RET-JL-2025-001",
      originalTrx: "PJ-1025-0284",
      customerName: "Bapak Rudi Hartono",
      date: "2025-10-27 11:20",
      productName: "Paracetamol 500mg (1 Strip)",
      refundAmount: 6500,
      reason: "Kemasan blister sedikit sobek saat dibuka di rumah",
      status: "APPROVED",
      cashier: "Nida Farida"
    },
    {
      id: "ret-cust-002",
      returnNumber: "RET-JL-2025-002",
      originalTrx: "PJ-1025-0279",
      customerName: "Ibu Dewi Lestari",
      date: "2025-10-26 15:40",
      productName: "Salbutamol Inhaler (1 Can)",
      refundAmount: 135000,
      reason: "Salah dosis dokter, diresepkan ulang dengan dosis 200mcg",
      status: "APPROVED",
      cashier: "Cantika Nur Gustiani"
    }
  ]);

  // Mock Retur Pembelian (Ke PBF)
  let supplierReturns = $state([
    {
      id: "ret-sup-001",
      returnNumber: "RET-BL-2025-001",
      invoiceRef: "FP-KF-2025-0891",
      supplierName: "PT. Kimia Farma Trading & Distribution",
      date: "2025-10-24 14:00",
      productName: "Amoxicillin 500mg - Batch AMX24A01 (5 Box)",
      totalValue: 410000,
      reason: "ED < 6 bulan saat diterima dari kurir PBF",
      status: "SENT_TO_SUPPLIER",
      pic: "apt. Hafidz Nurul"
    }
  ]);

  let totalCustomerRefunds = $derived(
    customerReturns.reduce((a, b) => a + b.refundAmount, 0)
  );
  let totalSupplierCredit = $derived(
    supplierReturns.reduce((a, b) => a + b.totalValue, 0)
  );
</script>

<svelte:head>
  <title>Retur &bull; Hafidz Farma</title>
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Retur Transaksi"
    subtitle="Retur pelanggan dan distributor PBF"
    icon={RotateCcw}
    breadcrumbs={[{ label: "Retur" }]}
  >
    {#snippet actions()}
      <button
        type="button"
        onclick={() => (isAddReturModalOpen = true)}
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
      >
        <Plus class="w-4 h-4" />
        <span>Input Retur Baru</span>
      </button>
    {/snippet}
  </PageHeader>

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Retur Pelanggan"
      value={formatRupiah(totalCustomerRefunds)}
      subtext="{customerReturns.length} Transaksi dibatalkan/ditukar"
      icon={ShoppingCart}
      variant="warning"
    />
    <MetricCard
      title="Retur ke PBF"
      value={formatRupiah(totalSupplierCredit)}
      subtext="Nota kredit pengurang hutang"
      icon={ShoppingBag}
      variant="brand"
    />
    <MetricCard
      title="ED / Rusak"
      value="1 Klaim PBF"
      subtext="Dalam proses verifikasi distributor"
      icon={AlertCircle}
      variant="danger"
    />
    <MetricCard
      title="Karantina Stok"
      value="100% Tercatat"
      subtext="Stok retur dipisah di karantina"
      icon={CheckCircle2}
      variant="success"
    />
  </div>

  <!-- TAB NAVIGATION -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold">
    <button
      type="button"
      onclick={() => (activeTab = "penjualan")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'penjualan' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <ShoppingCart class="w-4 h-4" />
        <span>Retur Penjualan (Dari Pelanggan)</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">
          {customerReturns.length}
        </span>
      </div>
      {#if activeTab === "penjualan"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "pembelian")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'pembelian' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <ShoppingBag class="w-4 h-4" />
        <span>Retur Pembelian (Ke Distributor PBF)</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">
          {supplierReturns.length}
        </span>
      </div>
      {#if activeTab === "pembelian"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>
  </div>

  <!-- TAB 1: RETUR PENJUALAN -->
  {#if activeTab === "penjualan"}
    <DataTable
      title="Daftar Retur Penjualan Kasir"
      searchPlaceholder="Cari nomor retur atau nomor transaksi..."
      bind:searchValue={searchQuery}
      totalCount={customerReturns.length}
    >
      {#snippet header()}
        <th class="py-3 px-4">No. Retur</th>
        <th class="py-3 px-4">No. Struk</th>
        <th class="py-3 px-4">Pelanggan</th>
        <th class="py-3 px-4">Produk Diretur</th>
        <th class="py-3 px-4">Alasan Retur</th>
        <th class="py-3 px-4 text-right">Pengembalian</th>
        <th class="py-3 px-4 text-center">Status</th>
      {/snippet}

      {#snippet rows()}
        {#each customerReturns as r}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono font-bold text-slate-900">{r.returnNumber}</td>
            <td class="py-3.5 px-4 font-mono text-brand-blue font-semibold">{r.originalTrx}</td>
            <td class="py-3.5 px-4 font-bold text-slate-800">{r.customerName}</td>
            <td class="py-3.5 px-4 text-slate-700">{r.productName}</td>
            <td class="py-3.5 px-4 text-slate-500 text-[11px] max-w-xs">{r.reason}</td>
            <td class="py-3.5 px-4 text-right font-mono font-black text-brand-red-600">
              {formatRupiah(r.refundAmount)}
            </td>
            <td class="py-3.5 px-4 text-center">
              <Badge type="SUCCESS" label="DISETUJUI" />
            </td>
          </tr>
        {/each}
      {/snippet}
    </DataTable>

  <!-- TAB 2: RETUR PEMBELIAN KE PBF -->
  {:else if activeTab === "pembelian"}
    <DataTable
      title="Daftar Retur Pembelian ke Distributor PBF"
      searchPlaceholder="Cari nomor retur atau nama PBF..."
      bind:searchValue={searchQuery}
      totalCount={supplierReturns.length}
    >
      {#snippet header()}
        <th class="py-3 px-4">Retur Beli</th>
        <th class="py-3 px-4">Faktur PBF</th>
        <th class="py-3 px-4">Distributor</th>
        <th class="py-3 px-4">Produk & Batch</th>
        <th class="py-3 px-4">Alasan Klaim</th>
        <th class="py-3 px-4 text-right">Nilai</th>
        <th class="py-3 px-4 text-center">Status</th>
      {/snippet}

      {#snippet rows()}
        {#each supplierReturns as r}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono font-bold text-slate-900">{r.returnNumber}</td>
            <td class="py-3.5 px-4 font-mono text-brand-blue font-semibold">{r.invoiceRef}</td>
            <td class="py-3.5 px-4 font-bold text-slate-800">{r.supplierName}</td>
            <td class="py-3.5 px-4 text-slate-700">{r.productName}</td>
            <td class="py-3.5 px-4 text-slate-500 text-[11px] max-w-xs">{r.reason}</td>
            <td class="py-3.5 px-4 text-right font-mono font-black text-brand-blue">
              {formatRupiah(r.totalValue)}
            </td>
            <td class="py-3.5 px-4 text-center">
              <Badge type="WARNING" label="DIKIRIM KE PBF" />
            </td>
          </tr>
        {/each}
      {/snippet}
    </DataTable>
  {/if}
</div>

<!-- MODAL INPUT RETUR BARU -->
{#if isAddReturModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isAddReturModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <RotateCcw class="w-5 h-5 text-brand-red-600" />
          <span>Input Pengajuan Retur Baru</span>
        </div>
        <button
          onclick={() => (isAddReturModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label for="ret-type" class="font-bold text-slate-700 block mb-1">Jenis Retur</label>
          <Select
            id="ret-type"
            options={[
              "Retur Penjualan (Dari Pelanggan / Pasien)",
              "Retur Pembelian (Ke Distributor PBF)"
            ]}
          />
        </div>
        <div>
          <label for="ret-ref" class="font-bold text-slate-700 block mb-1">Nomor Struk / Faktur Referensi</label>
          <input
            id="ret-ref"
            type="text"
            placeholder="Contoh: PJ-1025-0287 atau FP-KF-2025-..."
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
          />
        </div>
        <div>
          <label for="ret-reason" class="font-bold text-slate-700 block mb-1">Alasan Pengembalian</label>
          <textarea
            id="ret-reason"
            rows="2"
            placeholder="Jelaskan alasan retur secara rinci..."
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          ></textarea>
        </div>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isAddReturModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={() => {
            isAddReturModalOpen = false;
            alert("Pengajuan retur berhasil dicatat dan dipindahkan ke karantina!");
          }}
          class="px-4 py-2 rounded-xl bg-brand-red-600 hover:bg-brand-red-700 text-white font-bold text-xs shadow-sm"
        >
          Konfirmasi Retur
        </button>
      </div>
    </div>
  </div>
{/if}
