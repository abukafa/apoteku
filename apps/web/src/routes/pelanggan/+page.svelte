<script lang="ts">
  import {
    Users,
    Plus,
    UserCheck,
    CreditCard,
    Phone,
    MapPin,
    AlertCircle,
    CheckCircle2,
    Calendar,
    Search,
    DollarSign,
    X
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import customersData from "$lib/mocks/customers.json";
  import { portal } from "$lib/actions/portal";

  let customers = $state(customersData);
  let activeTab = $state<"semua" | "piutang">("semua");
  let searchQuery = $state("");

  // Modals
  let isAddCustomerModalOpen = $state(false);
  let isReceiveDebtPaymentOpen = $state(false);
  let selectedDebtCustomer = $state<any>(null);
  let debtPaymentAmount = $state(0);
  let debtPaymentMethod = $state("KAS_TUNAI");

  function openDebtPayment(debt: any) {
    selectedDebtCustomer = debt;
    debtPaymentAmount = debt.totalDebt;
    isReceiveDebtPaymentOpen = true;
  }

  function handleSaveDebtPayment() {
    if (!selectedDebtCustomer || debtPaymentAmount <= 0) return;
    selectedDebtCustomer.totalDebt = Math.max(0, selectedDebtCustomer.totalDebt - debtPaymentAmount);
    if (selectedDebtCustomer.totalDebt === 0) {
      selectedDebtCustomer.status = "PAID";
    }
    isReceiveDebtPaymentOpen = false;
    selectedDebtCustomer = null;
  }

  function formatRupiah(num: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(num);
  }

  // Filtered
  let filteredCustomers = $derived(
    customers.filter((c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
    )
  );

  // Mock Piutang Customers
  let debtCustomers = $state([
    {
      id: "deb-01",
      customerName: "Klinik Pratama Sehat (Bidan Lilis)",
      code: "CUST-004",
      phone: "081322334455",
      invoiceRef: "BON-2025-1020-01",
      totalDebt: 3200000,
      dueDate: "2025-11-20",
      status: "CURRENT"
    },
    {
      id: "deb-02",
      customerName: "Bapak Rudi Hartono (Pasien Kronis)",
      code: "CUST-002",
      phone: "081298765432",
      invoiceRef: "BON-2025-1015-08",
      totalDebt: 450000,
      dueDate: "2025-10-30",
      status: "DUE_SOON"
    }
  ]);

  let totalReceivables = $derived(
    debtCustomers.reduce((a, b) => a + b.totalDebt, 0)
  );
</script>

<svelte:head>
  <title>Pelanggan &bull; Hafidz Farma</title>
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Pelanggan & Pasien"
    subtitle="Loyalitas member, dan manajemen piutang"
    icon={Users}
    breadcrumbs={[{ label: "Pelanggan" }]}
  >
    {#snippet actions()}
      <button
        type="button"
        onclick={() => (isAddCustomerModalOpen = true)}
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
      >
        <Plus class="w-4 h-4" />
        <span>Tambah Pelanggan Baru</span>
      </button>
    {/snippet}
  </PageHeader>

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Total Pelanggan"
      value="{customers.length} Orang"
      subtext="Pasien umum, resep & klinik"
      icon={Users}
      variant="brand"
    />
    <MetricCard
      title="Member Aktif"
      value="2 Pasien"
      subtext="Pemegang kartu loyalitas"
      icon={UserCheck}
      variant="default"
    />
    <MetricCard
      title="Piutang Berjalan"
      value={formatRupiah(totalReceivables)}
      subtext="2 Akun bon tempo"
      icon={CreditCard}
      variant="warning"
    />
    <MetricCard
      title="Jatuh Tempo"
      value="Rp 450.000"
      subtext="Jatuh tempo 3 hari lagi"
      icon={AlertCircle}
      variant="danger"
    />
  </div>

  <!-- TAB NAVIGATION -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold">
    <button
      type="button"
      onclick={() => (activeTab = "semua")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'semua' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Direktori Pelanggan ({customers.length})</span>
      {#if activeTab === "semua"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "piutang")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'piutang' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Buku Piutang & Bon ({debtCustomers.length})</span>
      {#if activeTab === "piutang"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>
  </div>

  <!-- TAB 1: DIREKTORI PELANGGAN -->
  {#if activeTab === "semua"}
    <DataTable
      title="Daftar Pelanggan & Pasien"
      searchPlaceholder="Cari nama pelanggan, kode member, atau nomor telepon..."
      bind:searchValue={searchQuery}
      totalCount={filteredCustomers.length}
    >
      {#snippet header()}
        <th class="py-3 px-4">Kode</th>
        <th class="py-3 px-4">Nama Pelanggan</th>
        <th class="py-3 px-4">Kontak</th>
        <th class="py-3 px-4">Alamat Domisili</th>
        <th class="py-3 px-4">Tingkat</th>
        <th class="py-3 px-4 text-center">Loyalitas</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#each filteredCustomers as c}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono font-bold text-slate-900">{c.code}</td>
            <td class="py-3.5 px-4">
              <div class="font-bold text-slate-800">{c.name}</div>
            </td>
            <td class="py-3.5 px-4 font-mono text-slate-600 text-xs">
              {c.phone}
            </td>
            <td class="py-3.5 px-4 text-slate-500 text-xs max-w-xs truncate">
              {c.address}
            </td>
            <td class="py-3.5 px-4">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase {c.priceTier === 'wholesale' ? 'bg-purple-100 text-purple-700' : c.priceTier === 'member' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}">
                {c.priceTier}
              </span>
            </td>
            <td class="py-3.5 px-4 text-center font-black text-amber-600">
              {c.loyaltyPoints} Poin
            </td>
            <td class="py-3.5 px-4 text-center">
              <button
                type="button"
                onclick={() => alert(`Buka riwayat transaksi untuk ${c.name}`)}
                class="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-brand-blue hover:bg-blue-50 text-slate-600 hover:text-brand-blue text-[11px] font-bold transition-all"
              >
                Riwayat Medis
              </button>
            </td>
          </tr>
        {/each}
      {/snippet}
    </DataTable>

  <!-- TAB 2: BUKU PIUTANG -->
  {:else if activeTab === "piutang"}
    <DataTable
      title="Buku Piutang & Kartu Bon Pelanggan"
      searchPlaceholder="Cari nama debitur atau nomor bon..."
      bind:searchValue={searchQuery}
      totalCount={debtCustomers.length}
    >
      {#snippet header()}
        <th class="py-3 px-4">No. Bon / Tagihan</th>
        <th class="py-3 px-4">Nama Pelanggan</th>
        <th class="py-3 px-4">Kontak</th>
        <th class="py-3 px-4">Jatuh Tempo</th>
        <th class="py-3 px-4 text-right">Saldo Piutang</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#each debtCustomers as d}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono font-bold text-slate-900">{d.invoiceRef}</td>
            <td class="py-3.5 px-4 font-bold text-slate-800">{d.customerName}</td>
            <td class="py-3.5 px-4 font-mono text-slate-600 text-xs">{d.phone}</td>
            <td class="py-3.5 px-4 font-mono {d.status === 'DUE_SOON' ? 'text-brand-red-600 font-bold' : 'text-slate-600'}">
              {d.dueDate}
            </td>
            <td class="py-3.5 px-4 text-right font-mono font-black text-brand-blue">
              {formatRupiah(d.totalDebt)}
            </td>
            <td class="py-3.5 px-4 text-center">
              {#if d.status === "DUE_SOON"}
                <Badge type="DANGER" label="JATUH TEMPO" />
              {:else}
                <Badge type="WARNING" label="BERJALAN" />
              {/if}
            </td>
            <td class="py-3.5 px-4 text-center">
              {#if d.totalDebt > 0}
                <button
                  type="button"
                  onclick={() => openDebtPayment(d)}
                  class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors"
                >
                  Terima Bayar
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

<!-- MODAL TAMBAH PELANGGAN -->
{#if isAddCustomerModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isAddCustomerModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <Users class="w-5 h-5 text-brand-blue" />
          <span>Tambah Pelanggan / Pasien Baru</span>
        </div>
        <button
          onclick={() => (isAddCustomerModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div class="col-span-2">
          <label for="cust-name" class="font-bold text-slate-700 block mb-1">Nama Lengkap Pasien</label>
          <input
            id="cust-name"
            type="text"
            placeholder="Contoh: Ibu Rina Marlina"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium"
          />
        </div>
        <div>
          <label for="cust-phone" class="font-bold text-slate-700 block mb-1">Nomor WhatsApp / HP</label>
          <input
            id="cust-phone"
            type="tel"
            placeholder="08123456789"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
          />
        </div>
        <div>
          <label for="cust-tier" class="font-bold text-slate-700 block mb-1">Kategori Tingkat Harga</label>
          <Select
            id="cust-tier"
            options={[
              { value: "general", label: "Umum (Reguler)" },
              { value: "member", label: "Member Card (Diskon 5%)" },
              { value: "prescription", label: "Pasien Resep Dokter" },
              { value: "wholesale", label: "Grosir / Bidan / Klinik" }
            ]}
          />
        </div>
        <div class="col-span-2">
          <label for="cust-addr" class="font-bold text-slate-700 block mb-1">Alamat Lengkap</label>
          <input
            id="cust-addr"
            type="text"
            placeholder="Kp. Sukaluyu No. 12, Tasikmalaya"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isAddCustomerModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={() => {
            isAddCustomerModalOpen = false;
            alert("Data pelanggan baru berhasil disimpan!");
          }}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm"
        >
          Simpan Pelanggan
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL TERIMA PEMBAYARAN PIUTANG PASIEN -->
{#if isReceiveDebtPaymentOpen && selectedDebtCustomer}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isReceiveDebtPaymentOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <CreditCard class="w-5 h-5 text-brand-blue" />
          <span>Penerimaan Pembayaran Piutang Pasien</span>
        </div>
        <button
          onclick={() => (isReceiveDebtPaymentOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
          <div class="text-slate-500 text-[11px]">Nama Pasien / Debitur:</div>
          <div class="font-bold text-slate-900 text-sm">{selectedDebtCustomer.customerName}</div>
          <div class="font-mono text-slate-600 text-xs">No. Bon: {selectedDebtCustomer.invoiceRef}</div>
          <div class="flex justify-between pt-2 border-t border-slate-200 font-bold">
            <span class="text-slate-500">Saldo Piutang:</span>
            <span class="text-brand-red-600 font-mono">{formatRupiah(selectedDebtCustomer.totalDebt)}</span>
          </div>
        </div>

        <div>
          <label for="pay-meth" class="font-bold text-slate-700 block mb-1">Metode Penerimaan</label>
          <Select
            id="pay-meth"
            bind:value={debtPaymentMethod}
            options={[
              "KAS_TUNAI (Tunai Kasir)",
              "TRANSFER_BCA (Rekening BCA Apotek)",
              "QRIS_DINAMIS (Scan QRIS Kasir)"
            ]}
          />
        </div>

        <div>
          <label for="debt-pay-amount" class="font-bold text-slate-700 block mb-1">Nominal Diterima (Rp)</label>
          <input
            id="debt-pay-amount"
            type="number"
            bind:value={debtPaymentAmount}
            max={selectedDebtCustomer.totalDebt}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 text-sm"
          />
        </div>
      </div>

      <div class="border-t border-slate-100 pt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isReceiveDebtPaymentOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleSaveDebtPayment}
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
        >
          Simpan & Cetak Kwitansi
        </button>
      </div>
    </div>
  </div>
{/if}
