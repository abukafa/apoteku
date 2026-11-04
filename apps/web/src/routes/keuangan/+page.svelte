<script lang="ts">
  import {
    CircleDollarSign,
    Plus,
    ArrowUpRight,
    ArrowDownLeft,
    Wallet,
    CreditCard,
    TrendingUp,
    Calendar,
    Download,
    Search,
    Clock,
    X
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import { portal } from "$lib/actions/portal";

  let activeTab = $state<"buku_kas" | "arus_kas">("buku_kas");
  let searchQuery = $state("");
  let isAddExpenseModalOpen = $state(false);

  // QRIS Payment Gateway Settlement State
  let qrisBalance = $state(3420000);
  let isPayoutModalOpen = $state(false);
  let payoutSuccess = $state("");
  let payoutAmount = $state(3420000);

  function handlePayoutSubmit() {
    if (payoutAmount <= 0) return;
    const amount = payoutAmount;
    qrisBalance = Math.max(0, qrisBalance - amount);

    cashEntries = [
      {
        id: `csh-${Date.now()}`,
        time: "Hari ini, Baru saja",
        type: "IN",
        category: "Settlement QRIS",
        refNumber: `SET-${Date.now().toString().slice(-6)}`,
        amount: amount,
        balance: currentBalance + amount,
        operator: "Sistem Otomatis (Xendit)",
        description: "Penarikan Dana QRIS ke Rekening BCA Apotek"
      },
      ...cashEntries
    ];

    payoutSuccess = `Penarikan ${formatRupiah(amount)} berhasil diproses!`;
    setTimeout(() => {
      payoutSuccess = "";
      isPayoutModalOpen = false;
    }, 2000);
  }

  function formatRupiah(num: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(num);
  }

  // Cash Ledger Entries
  let cashEntries = $state([
    {
      id: "csh-001",
      time: "2025-10-27 10:12",
      type: "IN",
      category: "POS Kasir",
      refNumber: "PJ-1025-0287",
      amount: 125000,
      balance: 4850000,
      operator: "Nida Farida",
      description: "Penjualan OTC Tunai"
    },
    {
      id: "csh-002",
      time: "2025-10-27 09:48",
      type: "IN",
      category: "QRIS",
      refNumber: "PJ-1025-0286",
      amount: 86500,
      balance: 4725000,
      operator: "Nida Farida",
      description: "Pembayaran QRIS Kasir"
    },
    {
      id: "csh-003",
      time: "2025-10-27 08:30",
      type: "OUT",
      category: "Operasional",
      refNumber: "BOP-1027-01",
      amount: 150000,
      balance: 4638500,
      operator: "Erwin Noval Mufid",
      description: "Pembelian kantong kresek & lakban packing"
    },
    {
      id: "csh-004",
      time: "2025-10-27 07:00",
      type: "IN",
      category: "Modal Kasir",
      refNumber: "SFT-1027-01",
      amount: 500000,
      balance: 500000,
      operator: "Nida Farida",
      description: "Kas awal laci kasir Shift Pagi"
    }
  ]);

  let totalCashIn = $derived(
    cashEntries.filter((e) => e.type === "IN").reduce((a, b) => a + b.amount, 0)
  );
  let totalCashOut = $derived(
    cashEntries.filter((e) => e.type === "OUT").reduce((a, b) => a + b.amount, 0)
  );
  let currentBalance = $derived(cashEntries[0]?.balance || 4850000);
</script>

<svelte:head>
  <title>Keuangan &bull; Hafidz Farma</title>
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Keuangan & Arus Kas"
    subtitle="Operasional harian, kasir, beban, dan rekonsiliasi kas"
    icon={CircleDollarSign}
    breadcrumbs={[{ label: "Keuangan" }]}
  >
    {#snippet actions()}
      <button
        type="button"
        onclick={() => (isAddExpenseModalOpen = true)}
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
      >
        <Plus class="w-4 h-4" />
        <span>Catat Pengeluaran Kas Kecil</span>
      </button>
    {/snippet}
  </PageHeader>

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Saldo Kas Fisik"
      value={formatRupiah(currentBalance)}
      subtext="Kas di laci kasir & brankas"
      icon={Wallet}
      variant="brand"
    />
    <MetricCard
      title="Penerimaan Kasir"
      value={formatRupiah(totalCashIn)}
      subtext="Dari 28 transaksi penjualan"
      icon={ArrowUpRight}
      variant="success"
    />
    <MetricCard
      title="Operasional"
      value={formatRupiah(totalCashOut)}
      subtext="Beban kas kecil harian"
      icon={ArrowDownLeft}
      variant="warning"
    />
    <MetricCard
      title="Arus Kas (Net)"
      value={formatRupiah(totalCashIn - totalCashOut)}
      subtext="Margin surplus hari ini"
      icon={TrendingUp}
      variant="default"
    />
  </div>

  <!-- QRIS & PAYMENT GATEWAY SETTLEMENT WIDGET -->
  <div class="bg-gradient-to-r from-[#0c2e7a] to-[#1d63d8] text-white rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
    <div class="space-y-1">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="text-[11px] font-bold uppercase tracking-wider text-blue-100">Settlement Saldo QRIS (Xendit)</span>
      </div>
      <div class="text-xl sm:text-2xl font-black font-mono">
        {formatRupiah(qrisBalance)}
      </div>
      <div class="text-xs text-blue-100/80">
        Rekening Tujuan: <strong>BCA 0541238910</strong> (Apotek Hafidz Farma) • Auto-sweep setiap 23:00 WIB
      </div>
    </div>

    <button
      type="button"
      onclick={() => {
        payoutAmount = qrisBalance;
        isPayoutModalOpen = true;
      }}
      disabled={qrisBalance <= 0}
      class="px-4 py-2 rounded-xl bg-white hover:bg-blue-50 text-[#0c2e7a] font-bold text-xs shadow-md transition-all disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
    >
      <ArrowDownLeft class="w-4 h-4 text-emerald-600" />
      <span>Tarik Dana Sekarang</span>
    </button>
  </div>

  <!-- DATA TABLE BUKU KAS -->
  <DataTable
    title="Buku Kas Operasional Harian"
    searchPlaceholder="Cari keterangan, nomor referensi atau kategori..."
    bind:searchValue={searchQuery}
    totalCount={cashEntries.length}
  >
    {#snippet header()}
      <th class="py-3 px-4">Waktu</th>
      <th class="py-3 px-4">Referensi</th>
      <th class="py-3 px-4">Kategori</th>
      <th class="py-3 px-4">Keterangan Transaksi</th>
      <th class="py-3 px-4 text-right">Masuk</th>
      <th class="py-3 px-4 text-right">Keluar</th>
      <th class="py-3 px-4 text-right">Saldo</th>
      <th class="py-3 px-4 text-center">Petugas</th>
    {/snippet}

    {#snippet rows()}
      {#each cashEntries as entry}
        <tr class="hover:bg-blue-50/40 transition-colors">
          <td class="py-3.5 px-4 font-mono text-slate-500 text-[11px]">{entry.time}</td>
          <td class="py-3.5 px-4 font-mono font-bold text-brand-blue">{entry.refNumber}</td>
          <td class="py-3.5 px-4">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold {entry.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-brand-red-700'}">
              {entry.category}
            </span>
          </td>
          <td class="py-3.5 px-4 text-slate-700 text-xs">{entry.description}</td>
          <td class="py-3.5 px-4 text-right font-mono font-bold text-emerald-600">
            {entry.type === "IN" ? formatRupiah(entry.amount) : "-"}
          </td>
          <td class="py-3.5 px-4 text-right font-mono font-bold text-brand-red-600">
            {entry.type === "OUT" ? formatRupiah(entry.amount) : "-"}
          </td>
          <td class="py-3.5 px-4 text-right font-mono font-black text-slate-900">
            {formatRupiah(entry.balance)}
          </td>
          <td class="py-3.5 px-4 text-center text-slate-600 font-semibold">{entry.operator}</td>
        </tr>
      {/each}
    {/snippet}
  </DataTable>
</div>

<!-- MODAL CATAT PENGELUARAN -->
{#if isAddExpenseModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isAddExpenseModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <ArrowDownLeft class="w-5 h-5 text-brand-red-600" />
          <span>Catat Pengeluaran Kas Kecil</span>
        </div>
        <button
          onclick={() => (isAddExpenseModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label for="exp-cat" class="font-bold text-slate-700 block mb-1">Kategori Pengeluaran</label>
          <Select
            id="exp-cat"
            options={[
              "Perlengkapan Apotek (Kresek, Kertas Struk, Alat Tulis)",
              "Kebersihan & Sanitasi",
              "Listrik, Air & Internet",
              "Biaya Angkut / Ekspedisi",
              "Konsumsi Staf & Lembur"
            ]}
          />
        </div>
        <div>
          <label for="exp-amount" class="font-bold text-slate-700 block mb-1">Nominal Biaya (Rp)</label>
          <input
            id="exp-amount"
            type="number"
            placeholder="50000"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-brand-red-600"
          />
        </div>
        <div>
          <label for="exp-desc" class="font-bold text-slate-700 block mb-1">Keterangan Lengkap</label>
          <textarea
            id="exp-desc"
            rows="2"
            placeholder="Contoh: Beli 5 roll kertas thermal 80mm kasir..."
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          ></textarea>
        </div>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isAddExpenseModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={() => {
            isAddExpenseModalOpen = false;
            alert("Pengeluaran kas kecil berhasil dicatat di buku kas!");
          }}
          class="px-4 py-2 rounded-xl bg-brand-red-600 hover:bg-brand-red-700 text-white font-bold text-xs shadow-sm"
        >
          Simpan Pengeluaran
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL TARIK DANA / PAYOUT QRIS -->
{#if isPayoutModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isPayoutModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <CreditCard class="w-5 h-5 text-brand-blue" />
          <span>Penarikan Dana QRIS (Payout)</span>
        </div>
        <button
          onclick={() => (isPayoutModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      {#if payoutSuccess}
        <div class="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200 flex items-center gap-2">
          <span>{payoutSuccess}</span>
        </div>
      {:else}
        <div class="space-y-3 text-xs">
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5">
            <div class="text-slate-500 text-[11px]">Rekening Bank Tujuan:</div>
            <div class="font-bold text-slate-800 text-sm">Bank Central Asia (BCA)</div>
            <div class="font-mono text-slate-700">No. Rek: <strong>0541238910</strong></div>
            <div class="text-[11px] text-slate-500">A/N: Apotek Hafidz Farma</div>
          </div>

          <div>
            <label for="payout-amount" class="font-bold text-slate-700 block mb-1">Nominal Penarikan (Rp)</label>
            <input
              id="payout-amount"
              type="number"
              bind:value={payoutAmount}
              max={qrisBalance}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 text-sm"
            />
            <div class="text-[10px] text-slate-400 mt-1">Maksimal penarikan: {formatRupiah(qrisBalance)} (Bebas biaya admin)</div>
          </div>
        </div>

        <div class="border-t border-slate-100 pt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onclick={() => (isPayoutModalOpen = false)}
            class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            onclick={handlePayoutSubmit}
            class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
          >
            Proses Penarikan Dana
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
