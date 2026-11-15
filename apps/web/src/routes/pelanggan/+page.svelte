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
    X,
    Edit3,
    Trash2
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import { portal } from "$lib/actions/portal";
  import { onMount } from "svelte";
  import { mockApi } from "$lib/services/mock-api";
  import { api } from "$lib/services/api";
  import { alertStore } from "$lib/stores/alertStore.svelte";
  import { formatRupiah } from "@apoteku/core";

  let customers = $state<any[]>([]);
  let activeTab = $state<"semua" | "piutang">("semua");
  let searchQuery = $state("");
  let successMessage = $state("");

  async function loadCustomers() {
    try {
      const res = await api.customers.list();
      if (res?.success && Array.isArray(res.data)) {
        customers = res.data;
      }
    } catch (e) {
      console.error("[Pelanggan] Gagal memuat daftar pelanggan dari API:", e);
    }
  }

  async function loadReceivables() {
    try {
      const res = await api.customers.getReceivables();
      if (res?.success && Array.isArray(res.data)) {
        debtCustomers = res.data;
      } else {
        debtCustomers = [];
      }
    } catch (e) {
      console.warn("[Pelanggan] Gagal memuat buku piutang:", e);
      debtCustomers = [];
    }
  }

  onMount(async () => {
    await Promise.all([loadCustomers(), loadReceivables()]);
  });

  // Customer Add / Edit State
  let isCustomerModalOpen = $state(false);
  let editingCustomerId = $state<string | null>(null);
  let isSavingCustomer = $state(false);
  let customerModalError = $state("");

  let customerForm = $state({
    name: "",
    code: "",
    phone: "",
    address: "",
    customerType: "UMUM",
    pointBalance: 0,
    isActive: true
  });

  function openAddCustomerModal() {
    editingCustomerId = null;
    customerModalError = "";
    customerForm = {
      name: "",
      code: "",
      phone: "",
      address: "",
      customerType: "UMUM",
      pointBalance: 0,
      isActive: true
    };
    isCustomerModalOpen = true;
  }

  function openEditCustomerModal(c: any) {
    editingCustomerId = c.id;
    customerModalError = "";
    const rawType = String(c.customerType || c.priceTier || "UMUM").toUpperCase();
    const customerType =
      rawType === "MEMBER" ? "MEMBER" :
      rawType === "PRESCRIPTION" || rawType === "RESEP" ? "RESEP" :
      rawType === "WHOLESALE" || rawType === "GROSIR" ? "GROSIR" : "UMUM";

    customerForm = {
      name: c.name || "",
      code: c.code || "",
      phone: c.phone || "",
      address: c.address || "",
      customerType,
      pointBalance: Number(c.pointBalance ?? c.loyaltyPoints ?? 0),
      isActive: c.isActive !== false
    };
    isCustomerModalOpen = true;
  }

  async function handleSaveCustomerSubmit() {
    customerModalError = "";
    if (!customerForm.name.trim()) {
      customerModalError = "Nama pelanggan wajib diisi.";
      return;
    }

    isSavingCustomer = true;
    try {
      if (editingCustomerId) {
        const res = await api.customers.update(editingCustomerId, {
          name: customerForm.name.trim(),
          code: customerForm.code.trim().toUpperCase() || undefined,
          phone: customerForm.phone.trim(),
          address: customerForm.address.trim(),
          customerType: customerForm.customerType,
          pointBalance: Number(customerForm.pointBalance || 0),
          isActive: customerForm.isActive
        });
        if (res?.success) {
          isCustomerModalOpen = false;
          await loadCustomers();
          successMessage = `Data pelanggan "${customerForm.name}" berhasil diperbarui!`;
          setTimeout(() => (successMessage = ""), 3000);
        } else {
          customerModalError = res?.error || "Gagal memperbarui data pelanggan.";
        }
      } else {
        const res = await api.customers.create({
          name: customerForm.name.trim(),
          code: customerForm.code.trim().toUpperCase() || undefined,
          phone: customerForm.phone.trim(),
          address: customerForm.address.trim(),
          customerType: customerForm.customerType,
          pointBalance: Number(customerForm.pointBalance || 0),
          isActive: customerForm.isActive
        });
        if (res?.success) {
          isCustomerModalOpen = false;
          await loadCustomers();
          successMessage = `Pelanggan baru "${customerForm.name}" berhasil didaftarkan!`;
          setTimeout(() => (successMessage = ""), 3000);
        } else {
          customerModalError = res?.error || "Gagal menambahkan pelanggan baru.";
        }
      }
    } catch (e: any) {
      customerModalError = e.message || "Terjadi kesalahan saat menyimpan pelanggan.";
    } finally {
      isSavingCustomer = false;
    }
  }

  async function handleDeleteCustomer(c: any) {
    const isConfirmed = await alertStore.confirm({
      type: "danger",
      title: "Hapus Data Pelanggan",
      message: `Apakah Anda yakin ingin menghapus data pelanggan "${c.name}"? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Ya, Hapus",
      cancelText: "Batal"
    });
    if (!isConfirmed) return;

    try {
      const res = await api.customers.delete(c.id);
      if (res?.success) {
        await loadCustomers();
        alertStore.toast(res.message || `Pelanggan "${c.name}" berhasil dihapus.`, "success");
      } else {
        alertStore.danger("Gagal Menghapus Pelanggan", res?.error || "Kesalahan server saat menghapus data.");
      }
    } catch (e: any) {
      alertStore.danger("Gagal Menghapus Pelanggan", e.message || "Terjadi kesalahan koneksi.");
    }
  }

  // Modals for Debt
  let isReceiveDebtPaymentOpen = $state(false);
  let selectedDebtCustomer = $state<any>(null);
  let debtPaymentAmount = $state(0);
  let debtPaymentMethod = $state("KAS_TUNAI");

  function openDebtPayment(debt: any) {
    selectedDebtCustomer = debt;
    debtPaymentAmount = debt.totalDebt;
    isReceiveDebtPaymentOpen = true;
  }

  async function handleSaveDebtPayment() {
    if (!selectedDebtCustomer || debtPaymentAmount <= 0) return;
    try {
      const res = await api.customers.payReceivable({
        transactionId: selectedDebtCustomer.transactionId || selectedDebtCustomer.id,
        amountPaid: debtPaymentAmount,
        paymentMethod: debtPaymentMethod,
        operator: "Kasir"
      });
      if (res?.success) {
        isReceiveDebtPaymentOpen = false;
        selectedDebtCustomer = null;
        await loadReceivables();
        alertStore.toast(res.message || "Pembayaran piutang berhasil dicatat.", "success");
      } else {
        alertStore.danger("Gagal Mencatat Pembayaran", res?.error || "Gagal mencatat pembayaran piutang.");
      }
    } catch (err: any) {
      alertStore.danger("Gagal Mencatat Pembayaran", err.message || "Terjadi kesalahan koneksi.");
    }
  }

  // Filtered (searches across all customers before pagination)
  const PAGE_SIZE = 25;
  let customerPage = $state(1);
  let debtPage = $state(1);

  let filteredCustomers = $derived(
    customers.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.code || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.phone || "").includes(searchQuery)
    )
  );

  let customerTotalPages = $derived(
    Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE))
  );
  let paginatedCustomers = $derived(
    filteredCustomers.slice((customerPage - 1) * PAGE_SIZE, customerPage * PAGE_SIZE)
  );

  let debtCustomers = $state<
    Array<{
      id: string;
      customerName: string;
      code: string;
      phone: string;
      invoiceRef: string;
      totalDebt: number;
      dueDate: string;
      status: string;
    }>
  >([]);

  let filteredDebtCustomers = $derived(
    debtCustomers.filter(
      (d) =>
        d.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.invoiceRef.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.code.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  let debtTotalPages = $derived(
    Math.max(1, Math.ceil(filteredDebtCustomers.length / PAGE_SIZE))
  );
  let paginatedDebtCustomers = $derived(
    filteredDebtCustomers.slice((debtPage - 1) * PAGE_SIZE, debtPage * PAGE_SIZE)
  );

  let activeMembersCount = $derived(
    customers.filter((c) => (c.customerType || c.priceTier || "").toLowerCase() === "member").length
  );

  let totalReceivables = $derived(
    debtCustomers.reduce((a, b) => a + b.totalDebt, 0)
  );

  let dueSoonReceivables = $derived(
    debtCustomers
      .filter((d) => d.status === "DUE_SOON")
      .reduce((a, b) => a + b.totalDebt, 0)
  );
</script>

<svelte:head>
  <title>Pelanggan &bull; Hafidz Farma</title>
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Pelanggan & Pasien"
    subtitle="Loyalitas member, data pasien, dan manajemen piutang"
    icon={Users}
    breadcrumbs={[{ label: "Pelanggan" }]}
  >
    {#snippet actions()}
      <button
        type="button"
        onclick={openAddCustomerModal}
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
      >
        <Plus class="w-4 h-4" />
        <span>Tambah Pelanggan Baru</span>
      </button>
    {/snippet}
  </PageHeader>

  {#if successMessage}
    <div class="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2">
      <CheckCircle2 class="w-4 h-4 text-emerald-600" />
      <span>{successMessage}</span>
    </div>
  {/if}

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
      value="{activeMembersCount} Pasien"
      subtext="Pemegang kartu loyalitas"
      icon={UserCheck}
      variant="default"
    />
    <MetricCard
      title="Piutang Berjalan"
      value={formatRupiah(totalReceivables)}
      subtext="{debtCustomers.length} Akun bon tempo"
      icon={CreditCard}
      variant="warning"
    />
    <MetricCard
      title="Jatuh Tempo"
      value={formatRupiah(dueSoonReceivables)}
      subtext={dueSoonReceivables > 0 ? "Segera jatuh tempo" : "Tidak ada piutang jatuh tempo"}
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
      currentPage={customerPage}
      totalPages={customerTotalPages}
      pageSize={PAGE_SIZE}
      onPageChange={(p) => (customerPage = p)}
    >
      {#snippet header()}
        <th class="py-3 px-4">Kode</th>
        <th class="py-3 px-4">Pelanggan</th>
        <th class="py-3 px-4">Kontak</th>
        <th class="py-3 px-4">Alamat</th>
        <th class="py-3 px-4">Tipe</th>
        <th class="py-3 px-4 text-center">Loyalitas</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if paginatedCustomers.length === 0}
          <tr>
            <td colspan="7" class="py-12 text-center text-xs text-slate-400">
              <div class="flex flex-col items-center justify-center gap-2">
                <Users class="w-8 h-8 text-slate-300" />
                <span>Tidak ada data pelanggan yang ditemukan.</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each paginatedCustomers as c}
            <tr class="hover:bg-blue-50/40 transition-colors">
              <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
                <span class="px-2 py-0.5 rounded-lg bg-slate-100 font-mono text-[11px]">
                  #{c.code || "-"}
                </span>
              </td>
              <td class="py-3.5 px-4 truncate max-w-[160px]">
                <div class="font-bold text-slate-800">{c.name}</div>
                {#if c.isActive === false}
                  <span class="inline-block px-1.5 py-0.2 rounded bg-red-100 text-red-700 text-[9px] font-bold">NONAKTIF</span>
                {/if}
              </td>
              <td class="py-3.5 px-4 font-mono text-slate-600 text-xs">
                {c.phone || "-"}
              </td>
              <td class="py-3.5 px-4 text-slate-500 text-xs max-w-xs truncate">
                {c.address || "-"}
              </td>
              <td class="py-3.5 px-4">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase {(c.customerType || c.priceTier || '').toUpperCase() === 'GROSIR' ? 'bg-purple-100 text-purple-700' : (c.customerType || c.priceTier || '').toUpperCase() === 'MEMBER' ? 'bg-emerald-100 text-emerald-700' : (c.customerType || c.priceTier || '').toUpperCase() === 'RESEP' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}">
                  {c.customerType || c.priceTier || "UMUM"}
                </span>
              </td>
              <td class="py-3.5 px-4 text-center font-black text-amber-600">
                {c.pointBalance ?? c.loyaltyPoints ?? 0} Poin
              </td>
              <td class="py-3.5 px-4 text-center">
                <div class="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onclick={() => openEditCustomerModal(c)}
                    class="p-1.5 rounded-lg border border-slate-200 hover:border-brand-blue hover:bg-blue-50 text-slate-600 hover:text-brand-blue text-[11px] font-bold transition-all cursor-pointer"
                    title="Edit Data Pelanggan"
                  >
                    <Edit3 class="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onclick={() => handleDeleteCustomer(c)}
                    class="p-1.5 rounded-lg border border-slate-200 hover:border-red-400 hover:bg-red-50 text-slate-400 hover:text-red-600 text-[11px] font-bold transition-all cursor-pointer"
                    title="Hapus Pelanggan"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        {/if}
      {/snippet}
    </DataTable>

  <!-- TAB 2: BUKU PIUTANG -->
  {:else if activeTab === "piutang"}
    <DataTable
      title="Buku Piutang & Bon Pelanggan"
      searchPlaceholder="Cari nama debitur atau nomor bon..."
      bind:searchValue={searchQuery}
      totalCount={filteredDebtCustomers.length}
      currentPage={debtPage}
      totalPages={debtTotalPages}
      pageSize={PAGE_SIZE}
      onPageChange={(p) => (debtPage = p)}
    >
      {#snippet header()}
        <th class="py-3 px-4">Bon</th>
        <th class="py-3 px-4">Pelanggan</th>
        <th class="py-3 px-4">Kontak</th>
        <th class="py-3 px-4">Tempo</th>
        <th class="py-3 px-4 text-right">Piutang</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if paginatedDebtCustomers.length === 0}
          <tr>
            <td colspan="7" class="py-12 text-center text-xs text-slate-400">
              <div class="flex flex-col items-center justify-center gap-2">
                <CreditCard class="w-8 h-8 text-slate-300" />
                <span class="font-medium text-slate-600">Tidak ada catatan piutang atau bon berjalan.</span>
                <span class="text-[11px] text-slate-400">Semua transaksi penjualan kasir saat ini telah lunas tercatat.</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each paginatedDebtCustomers as d}
            <tr class="hover:bg-blue-50/40 transition-colors">
              <td class="py-3.5 px-4 font-mono font-bold text-slate-900 max-w-[200px]">{d.invoiceRef}</td>
              <td class="py-3.5 px-4 font-bold text-slate-800 max-w-[160px]">{d.customerName}</td>
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
                    class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors cursor-pointer"
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
        {/if}
      {/snippet}
    </DataTable>
  {/if}
</div>

<!-- MODAL TAMBAH / EDIT PELANGGAN -->
{#if isCustomerModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isCustomerModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <Users class="w-5 h-5 text-brand-blue" />
          <span>{editingCustomerId ? "Edit Data Pelanggan / Pasien" : "Tambah Pelanggan / Pasien Baru"}</span>
        </div>
        <button
          onclick={() => (isCustomerModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      {#if customerModalError}
        <div class="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl">
          {customerModalError}
        </div>
      {/if}

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div class="sm:col-span-2">
          <label for="cust-name" class="font-bold text-slate-700 block mb-1">Nama Lengkap Pasien *</label>
          <input
            id="cust-name"
            type="text"
            bind:value={customerForm.name}
            placeholder="Contoh: Ibu Rina Marlina"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
          />
        </div>

        <div>
          <label for="cust-code" class="font-bold text-slate-700 block mb-1">Kode Member (Opsional)</label>
          <input
            id="cust-code"
            type="text"
            bind:value={customerForm.code}
            placeholder="Otomatis jika kosong"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono uppercase"
          />
        </div>

        <div>
          <label for="cust-phone" class="font-bold text-slate-700 block mb-1">Nomor WhatsApp / HP</label>
          <input
            id="cust-phone"
            type="tel"
            bind:value={customerForm.phone}
            placeholder="08xxxxxxxxxx"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
          />
        </div>

        <div>
          <label for="cust-tier" class="font-bold text-slate-700 block mb-1">Kategori Tingkat Harga</label>
          <select
            id="cust-tier"
            bind:value={customerForm.customerType}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 cursor-pointer"
          >
            <option value="UMUM">UMUM (Harga Reguler)</option>
            <option value="MEMBER">MEMBER (Diskon Khusus Pelanggan Setia)</option>
            <option value="RESEP">RESEP (Pasien Resep Dokter)</option>
            <option value="GROSIR">GROSIR (Bidan / Klinik / Partai Besar)</option>
          </select>
        </div>

        <div>
          <label for="cust-points" class="font-bold text-slate-700 block mb-1">Saldo Poin Loyalitas</label>
          <input
            id="cust-points"
            type="number"
            min="0"
            bind:value={customerForm.pointBalance}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
          />
        </div>

        <div class="sm:col-span-2">
          <label for="cust-addr" class="font-bold text-slate-700 block mb-1">Alamat Domisili</label>
          <input
            id="cust-addr"
            type="text"
            bind:value={customerForm.address}
            placeholder="Alamat domisili lengkap..."
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>

        <div class="sm:col-span-2 pt-2 border-t border-slate-100 flex items-center justify-between">
          <label class="inline-flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={customerForm.isActive}
              class="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
            />
            <span>Status Pelanggan Aktif</span>
          </label>
        </div>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isCustomerModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={isSavingCustomer}
          onclick={handleSaveCustomerSubmit}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm disabled:opacity-50 cursor-pointer"
        >
          {isSavingCustomer ? "Menyimpan..." : editingCustomerId ? "Simpan Perubahan" : "Simpan Pelanggan"}
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
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
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
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleSaveDebtPayment}
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm cursor-pointer"
        >
          Simpan & Cetak Kwitansi
        </button>
      </div>
    </div>
  </div>
{/if}


