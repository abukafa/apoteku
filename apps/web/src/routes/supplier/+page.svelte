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
  import { formatRupiah } from "@apoteku/core";

  let suppliers = $state<any[]>([]);
  let activeTab = $state<"semua" | "hutang" | "riwayat">("semua");
  let searchQuery = $state("");

  const PAGE_SIZE = 25;
  let supplierPage = $state(1);
  let debtPage = $state(1);
  let paymentPage = $state(1);

  let pbfDebts = $state<
    Array<{
      id: string;
      supplierName: string;
      code: string;
      invoiceRef: string;
      totalDebt: number;
      dueDate: string;
      status: "OVERDUE" | "DUE_SOON" | "CURRENT" | "PAID";
      daysLeft: number;
    }>
  >([]);

  let debtPayments = $state<
    Array<{
      id: string;
      paymentNumber: string;
      paymentDate: string;
      paymentMethod: string;
      amountPaid: number;
      invoiceNumber?: string;
      supplierName?: string;
      branchName?: string;
    }>
  >([]);

  // Feedback banner
  let supplierFeedback = $state<{ type: 'success' | 'error'; message: string } | null>(null);

  // Supplier Form state
  let isSupplierModalOpen = $state(false);
  let editingSupplierId = $state<string | null>(null);
  let isSavingSupplier = $state(false);

  let supplierForm = $state({
    code: "",
    name: "",
    phone: "",
    email: "",
    address: "",
    contactPerson: "",
    paymentTermDays: 30,
    isActive: true
  });

  function openAddSupplierModal() {
    editingSupplierId = null;
    supplierForm = {
      code: `PBF-${Date.now().toString().slice(-4)}`,
      name: "",
      phone: "",
      email: "",
      address: "",
      contactPerson: "",
      paymentTermDays: 30,
      isActive: true
    };
    isSupplierModalOpen = true;
  }

  function openEditSupplierModal(s: any) {
    editingSupplierId = s.id;
    supplierForm = {
      code: s.code || "",
      name: s.name || "",
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      contactPerson: s.contactPerson || "",
      paymentTermDays: Number(s.paymentTermDays ?? 30),
      isActive: s.isActive ?? true
    };
    isSupplierModalOpen = true;
  }

  async function handleSaveSupplier() {
    if (!supplierForm.name.trim()) {
      alert("Nama PBF wajib diisi");
      return;
    }
    isSavingSupplier = true;
    try {
      if (editingSupplierId) {
        const res = await api.suppliers.update(editingSupplierId, supplierForm);
        if (res?.success) {
          const idx = suppliers.findIndex(x => x.id === editingSupplierId);
          if (idx !== -1) {
            suppliers[idx] = { ...suppliers[idx], ...res.data };
          }
          supplierFeedback = { type: 'success', message: `Distributor "${res.data.name}" berhasil diperbarui!` };
        } else {
          alert(res?.error || "Gagal memperbarui supplier");
        }
      } else {
        const res = await api.suppliers.create(supplierForm);
        if (res?.success) {
          suppliers = [res.data, ...suppliers];
          supplierFeedback = { type: 'success', message: `Distributor "${res.data.name}" berhasil ditambahkan!` };
        } else {
          alert(res?.error || "Gagal menambahkan supplier");
        }
      }
      isSupplierModalOpen = false;
      setTimeout(() => { supplierFeedback = null; }, 4000);
    } catch (err: any) {
      alert(err?.message || "Terjadi kesalahan saat menyimpan supplier");
    } finally {
      isSavingSupplier = false;
    }
  }

  async function handleDeleteSupplier(s: any) {
    const confirmed = confirm(`Yakin ingin menghapus atau menonaktifkan distributor "${s.name}"?`);
    if (!confirmed) return;
    try {
      const res = await api.suppliers.delete(s.id);
      if (res?.success) {
        if (res.action === 'soft_deleted') {
          const idx = suppliers.findIndex(x => x.id === s.id);
          if (idx !== -1) suppliers[idx].isActive = false;
          supplierFeedback = { type: 'success', message: `Distributor "${s.name}" dinonaktifkan (karena memiliki riwayat faktur/PO).` };
        } else {
          suppliers = suppliers.filter(x => x.id !== s.id);
          supplierFeedback = { type: 'success', message: `Distributor "${s.name}" berhasil dihapus permanen!` };
        }
        setTimeout(() => { supplierFeedback = null; }, 4000);
      } else {
        alert(res?.error || "Gagal menghapus supplier");
      }
    } catch (err: any) {
      alert(err?.message || "Terjadi kesalahan saat menghapus supplier");
    }
  }

  async function loadDebts() {
    try {
      const [purchasesRes, payRes] = await Promise.all([
        api.erp.getPurchases(200).catch(() => null),
        api.finance.getDebtPayments({ limit: 100 }).catch(() => null)
      ]);

      if (purchasesRes?.success && Array.isArray(purchasesRes.data)) {
        const now = Date.now();
        pbfDebts = purchasesRes.data
          .filter((inv: any) => !inv.isPaidOff && (Number(inv.grandTotal || 0) - Number(inv.paidAmount || 0)) > 0)
          .map((inv: any) => {
            const dueStr = inv.dueDate
              ? String(inv.dueDate).slice(0, 10)
              : String(inv.receiveDate || inv.invoiceDate || "").slice(0, 10);
            const dueMs = dueStr ? new Date(dueStr).getTime() : now;
            const daysLeft = Math.ceil((dueMs - now) / (1000 * 60 * 60 * 24));
            const status =
              daysLeft < 0 ? "OVERDUE" : daysLeft <= 7 ? "DUE_SOON" : "CURRENT";
            const totalRemaining = Math.max(0, Number(inv.grandTotal || 0) - Number(inv.paidAmount || 0));
            return {
              id: inv.id,
              supplierName: inv.supplierName || "PBF Terdaftar",
              code: inv.supplierId || "-",
              invoiceRef: inv.invoiceNumber || inv.invoiceNo || "-",
              totalDebt: totalRemaining,
              grandTotal: Number(inv.grandTotal || 0),
              paidAmount: Number(inv.paidAmount || 0),
              dueDate: dueStr || "-",
              status,
              daysLeft
            };
          });
      }

      if (payRes?.success && Array.isArray(payRes.data)) {
        debtPayments = payRes.data;
      }
    } catch (_) {}
  }

  onMount(async () => {
    try {
      await mockApi.ensureDataLoaded();
      const [liveSuppliersRes] = await Promise.all([
        api.suppliers.list().catch(() => null),
        loadDebts()
      ]);
      if (liveSuppliersRes?.success && Array.isArray(liveSuppliersRes.data) && liveSuppliersRes.data.length > 0) {
        suppliers = liveSuppliersRes.data;
      } else {
        const fallback = await mockApi.getSuppliers();
        if (fallback && fallback.length > 0) suppliers = fallback as any;
      }
    } catch (_) {}
  });

  // Modals Pelunasan Hutang
  let isPayPbfDebtModalOpen = $state(false);
  let selectedPbfDebt = $state<any>(null);
  let pbfPaymentAmount = $state(0);
  let pbfPaymentMethod = $state("TRANSFER_BCA");
  let pbfPaymentRef = $state("");
  let isSavingPayment = $state(false);

  function openPayPbfDebt(d: any) {
    selectedPbfDebt = d;
    pbfPaymentAmount = d.totalDebt;
    pbfPaymentRef = "";
    pbfPaymentMethod = "TRANSFER_BCA";
    isPayPbfDebtModalOpen = true;
  }

  async function handleSavePbfPayment() {
    if (!selectedPbfDebt || pbfPaymentAmount <= 0) {
      alert("Nominal pembayaran harus lebih besar dari Rp 0");
      return;
    }
    if (pbfPaymentAmount > selectedPbfDebt.totalDebt) {
      alert(`Nominal pembayaran (${formatRupiah(pbfPaymentAmount)}) tidak boleh melebihi sisa tagihan (${formatRupiah(selectedPbfDebt.totalDebt)})`);
      return;
    }

    isSavingPayment = true;
    try {
      const res = await api.finance.recordDebtPayment({
        purchaseInvoiceId: selectedPbfDebt.id,
        amountPaid: Number(pbfPaymentAmount),
        paymentMethod: pbfPaymentMethod,
        paymentNumber: pbfPaymentRef.trim() || undefined
      });

      if (res?.success) {
        const paidNum = res.data?.payment?.paymentNumber || "RLH";
        const isLunas = res.data?.invoice?.isPaidOff ?? (pbfPaymentAmount >= selectedPbfDebt.totalDebt);

        selectedPbfDebt.totalDebt = Math.max(0, selectedPbfDebt.totalDebt - pbfPaymentAmount);
        if (isLunas) {
          selectedPbfDebt.status = "PAID";
        }

        supplierFeedback = {
          type: "success",
          message: `Pelunasan hutang (${paidNum}) faktur ${selectedPbfDebt.invoiceRef} sebesar ${formatRupiah(pbfPaymentAmount)} berhasil dicatat! Status Faktur: ${isLunas ? "LUNAS (PAID)" : "SEBAGIAN (PARTIAL)"}.`
        };

        isPayPbfDebtModalOpen = false;
        selectedPbfDebt = null;

        // Muat ulang data hutang terbaru dari database
        await loadDebts();
        setTimeout(() => {
          supplierFeedback = null;
        }, 5000);
      } else {
        alert(res?.error || "Gagal mencatat pelunasan hutang");
      }
    } catch (err: any) {
      alert(err?.message || "Terjadi kesalahan saat memproses pembayaran");
    } finally {
      isSavingPayment = false;
    }
  }

  let isDeletingPaymentId = $state<string | null>(null);

  async function handleDeleteDebtPayment(p: any) {
    const confirmed = confirm(
      `Yakin ingin membatalkan pembayaran ${p.paymentNumber || "ini"} sebesar ${formatRupiah(p.amountPaid)}?\n\n` +
      `Sisa tagihan faktur ${p.invoiceNumber || ""} akan dikembalikan dan status faktur akan dipulihkan.`
    );
    if (!confirmed) return;

    isDeletingPaymentId = p.id;
    try {
      const res = await api.finance.deleteDebtPayment(p.id);
      if (res?.success) {
        supplierFeedback = {
          type: "success",
          message: res.message || `Bukti pembayaran ${p.paymentNumber} berhasil dibatalkan. Tagihan faktur dipulihkan.`
        };
        await loadDebts();
        setTimeout(() => {
          supplierFeedback = null;
        }, 5000);
      } else {
        alert(res?.error || "Gagal membatalkan pembayaran hutang");
      }
    } catch (err: any) {
      alert(err?.message || "Terjadi kesalahan saat membatalkan pembayaran hutang");
    } finally {
      isDeletingPaymentId = null;
    }
  }

  // Filtered (searches across all 241 suppliers before pagination)
  let filteredSuppliers = $derived(
    suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.phone.includes(searchQuery)
    )
  );

  let supplierTotalPages = $derived(
    Math.max(1, Math.ceil(filteredSuppliers.length / PAGE_SIZE))
  );
  let paginatedSuppliers = $derived(
    filteredSuppliers.slice((supplierPage - 1) * PAGE_SIZE, supplierPage * PAGE_SIZE)
  );

  let filteredPbfDebts = $derived(
    pbfDebts.filter(
      (d) =>
        d.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.invoiceRef.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  let debtTotalPages = $derived(
    Math.max(1, Math.ceil(filteredPbfDebts.length / PAGE_SIZE))
  );
  let paginatedPbfDebts = $derived(
    filteredPbfDebts.slice((debtPage - 1) * PAGE_SIZE, debtPage * PAGE_SIZE)
  );

  let totalPayables = $derived(pbfDebts.reduce((a, b) => a + b.totalDebt, 0));
  let overdueOrDueSoonDebts = $derived(
    pbfDebts.filter((d) => d.status === "OVERDUE" || d.status === "DUE_SOON")
  );

  let filteredDebtPayments = $derived(
    debtPayments.filter(
      (p) =>
        (p.paymentNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.supplierName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.invoiceNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.paymentMethod || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  let paymentTotalPages = $derived(
    Math.max(1, Math.ceil(filteredDebtPayments.length / PAGE_SIZE))
  );
  let paginatedDebtPayments = $derived(
    filteredDebtPayments.slice((paymentPage - 1) * PAGE_SIZE, paymentPage * PAGE_SIZE)
  );
</script>

<svelte:head>
  <title>Supplier & Distributor PBF | Apoteku.com</title>
</svelte:head>

<div class="space-y-6">
  {#if supplierFeedback}
    <div
      class="p-4 rounded-xl text-xs font-semibold flex items-center justify-between border animate-in fade-in duration-200 {supplierFeedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}"
    >
      <div class="flex items-center gap-2">
        {#if supplierFeedback.type === 'success'}
          <CheckCircle2 class="w-4 h-4 text-emerald-600" />
        {:else}
          <AlertCircle class="w-4 h-4 text-rose-600" />
        {/if}
        <span>{supplierFeedback.message}</span>
      </div>
      <button
        type="button"
        onclick={() => (supplierFeedback = null)}
        class="text-slate-400 hover:text-slate-600"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  {/if}

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
        onclick={openAddSupplierModal}
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
      subtext="{pbfDebts.length} Faktur belum lunas"
      icon={Clock}
      variant="warning"
    />
    <MetricCard
      title="Jatuh Tempo"
      value="{overdueOrDueSoonDebts.length} Faktur"
      subtext={overdueOrDueSoonDebts[0]?.supplierName || "Tidak ada faktur lewat tempo"}
      icon={AlertCircle}
      variant="danger"
    />
    <MetricCard
      title="Status Faktur"
      value={pbfDebts.length === 0 ? "100% Lunas" : `${pbfDebts.length} Aktif`}
      subtext="Monitoring kewajiban PBF"
      icon={CheckCircle2}
      variant="success"
    />
  </div>

  <!-- TAB NAVIGATION -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold overflow-x-auto no-scrollbar">
    <button
      type="button"
      onclick={() => (activeTab = "semua")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'semua' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Direktori PBF ({suppliers.length})</span>
      {#if activeTab === "semua"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "hutang")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'hutang' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Buku Hutang Faktur ({pbfDebts.length})</span>
      {#if activeTab === "hutang"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "riwayat")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'riwayat' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Riwayat Pembayaran Hutang ({debtPayments.length})</span>
      {#if activeTab === "riwayat"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>
  </div>

  <!-- TAB 1: DIREKTORI PBF -->
  {#if activeTab === "semua"}
    <DataTable
      title="Daftar Distributor PBF"
      searchPlaceholder="Cari nama distributor, kode PBF, atau kontak..."
      bind:searchValue={searchQuery}
      totalCount={filteredSuppliers.length}
      currentPage={supplierPage}
      totalPages={supplierTotalPages}
      pageSize={PAGE_SIZE}
      onPageChange={(p) => (supplierPage = p)}
    >
      {#snippet header()}
        <th class="py-3 px-4">Kode</th>
        <th class="py-3 px-4">Distributor</th>
        <th class="py-3 px-4">Kontak</th>
        <th class="py-3 px-4">Alamat</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if paginatedSuppliers.length === 0}
          <tr>
            <td colspan="6" class="py-12 text-center text-xs text-slate-400">
              <div class="flex flex-col items-center justify-center gap-2">
                <Building2 class="w-8 h-8 text-slate-300" />
                <span>Tidak ada data distributor PBF yang ditemukan.</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each paginatedSuppliers as s}
            <tr class="hover:bg-blue-50/40 transition-colors">
              <td class="py-3.5 px-4 font-mono font-bold text-slate-900">{s.code}</td>
              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-900">{s.name}</div>
              </td>
              <td class="py-3.5 px-4 font-mono text-slate-600 text-xs">{s.phone}</td>
              <td class="py-3.5 px-4 text-slate-500 text-xs max-w-xs truncate">{s.address}</td>
              <td class="py-3.5 px-4 text-center">
                {#if s.isActive === false}
                  <Badge type="WARNING" label="NONAKTIF" />
                {:else}
                  <Badge type="SUCCESS" label="AKTIF" />
                {/if}
              </td>
              <td class="py-3.5 px-4 text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onclick={() => openEditSupplierModal(s)}
                    class="p-1 rounded-lg border border-slate-200 hover:border-brand-blue hover:bg-blue-50 text-slate-500 hover:text-brand-blue transition-colors"
                    title="Edit Data PBF"
                    aria-label="Edit {s.name}"
                  >
                    <Edit3 class="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onclick={() => handleDeleteSupplier(s)}
                    class="p-1 rounded-lg border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Hapus / Nonaktifkan PBF"
                    aria-label="Hapus {s.name}"
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

  <!-- TAB 2: BUKU HUTANG FAKTUR -->
  {:else if activeTab === "hutang"}
    <DataTable
      title="Buku Hutang PBF"
      searchPlaceholder="Cari nama PBF atau nomor faktur..."
      bind:searchValue={searchQuery}
      totalCount={filteredPbfDebts.length}
      currentPage={debtPage}
      totalPages={debtTotalPages}
      pageSize={PAGE_SIZE}
      onPageChange={(p) => (debtPage = p)}
    >
      {#snippet header()}
        <th class="py-3 px-4">Faktur</th>
        <th class="py-3 px-4">Distributor</th>
        <th class="py-3 px-4">Tempo</th>
        <th class="py-3 px-4 text-right">Hutang</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#each paginatedPbfDebts as d}
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

  <!-- TAB 3: RIWAYAT PEMBAYARAN HUTANG -->
  {:else if activeTab === "riwayat"}
    <DataTable
      title="Riwayat Pembayaran PBF"
      searchPlaceholder="Cari nomor bukti kas keluar, faktur, distributor, atau metode bayar..."
      bind:searchValue={searchQuery}
      totalCount={filteredDebtPayments.length}
      currentPage={paymentPage}
      totalPages={paymentTotalPages}
      pageSize={PAGE_SIZE}
      onPageChange={(p) => (paymentPage = p)}
    >
      {#snippet header()}
        <th class="py-3 px-4">Dokumen</th>
        <th class="py-3 px-4">Tanggal</th>
        <th class="py-3 px-4">Distributor</th>
        <th class="py-3 px-4">Faktur</th>
        <th class="py-3 px-4">Metode</th>
        <th class="py-3 px-4 text-right">Nominal</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if paginatedDebtPayments.length === 0}
          <tr>
            <td colspan="8" class="py-12 text-center text-xs text-slate-400">
              <div class="flex flex-col items-center justify-center gap-2">
                <Clock class="w-8 h-8 text-slate-300" />
                <span>Belum ada riwayat pembayaran hutang yang tercatat.</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each paginatedDebtPayments as p}
            <tr class="hover:bg-blue-50/40 transition-colors">
              <td class="py-3.5 px-4 font-mono font-bold text-brand-blue-700">
                {p.paymentNumber || "-"}
              </td>
              <td class="py-3.5 px-4 text-xs font-mono text-slate-600">
                {p.paymentDate ? String(p.paymentDate).slice(0, 10) : "-"}
              </td>
              <td class="py-3.5 px-4 font-bold text-slate-900">
                {p.supplierName || "-"}
              </td>
              <td class="py-3.5 px-4 font-mono text-slate-700 text-xs font-semibold">
                {p.invoiceNumber || "-"}
              </td>
              <td class="py-3.5 px-4 text-xs text-slate-600 font-mono">
                {p.paymentMethod || "KAS_OPERASIONAL"}
              </td>
              <td class="py-3.5 px-4 text-right font-mono font-black text-emerald-600">
                {formatRupiah(Number(p.amountPaid || 0))}
              </td>
              <td class="py-3.5 px-4 text-center">
                <Badge type="SUCCESS" label="TERCATAT" />
              </td>
              <td class="py-3.5 px-4 text-center">
                <button
                  type="button"
                  onclick={() => handleDeleteDebtPayment(p)}
                  disabled={isDeletingPaymentId === p.id}
                  class="p-1 rounded-lg border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-50"
                  title="Batalkan Pembayaran (Pulihkan Saldo Faktur)"
                  aria-label="Batalkan pembayaran {p.paymentNumber}"
                >
                  {#if isDeletingPaymentId === p.id}
                    <div class="w-3.5 h-3.5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                  {:else}
                    <Trash2 class="w-3.5 h-3.5" />
                  {/if}
                </button>
              </td>
            </tr>
          {/each}
        {/if}
      {/snippet}
    </DataTable>
  {/if}
</div>

<!-- MODAL TAMBAH / EDIT PBF -->
{#if isSupplierModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isSupplierModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <Building2 class="w-5 h-5 text-brand-blue" />
          <span>{editingSupplierId ? "Edit Distributor PBF" : "Tambah Distributor / PBF Baru"}</span>
        </div>
        <button
          onclick={() => (isSupplierModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div class="col-span-2 sm:col-span-1">
          <label for="sup-code" class="font-bold text-slate-700 block mb-1">Kode Distributor</label>
          <input
            id="sup-code"
            type="text"
            bind:value={supplierForm.code}
            placeholder="PBF-001"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
          />
        </div>
        <div class="col-span-2 sm:col-span-1">
          <label for="sup-term" class="font-bold text-slate-700 block mb-1">Termin TOP (Hari)</label>
          <input
            id="sup-term"
            type="number"
            min="0"
            max="180"
            bind:value={supplierForm.paymentTermDays}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
          />
        </div>
        <div class="col-span-2">
          <label for="sup-name" class="font-bold text-slate-700 block mb-1">Nama Perusahaan PBF *</label>
          <input
            id="sup-name"
            type="text"
            bind:value={supplierForm.name}
            placeholder="Contoh: PT. Parit Padang Global"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium"
            required
          />
        </div>
        <div>
          <label for="sup-phone" class="font-bold text-slate-700 block mb-1">No. Telepon / Sales Rep</label>
          <input
            id="sup-phone"
            type="tel"
            bind:value={supplierForm.phone}
            placeholder="(0265) 334455 / 08123456789"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
          />
        </div>
        <div>
          <label for="sup-email" class="font-bold text-slate-700 block mb-1">Email Resmi (Opsional)</label>
          <input
            id="sup-email"
            type="email"
            bind:value={supplierForm.email}
            placeholder="order@distributor.com"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
          />
        </div>
        <div class="col-span-2">
          <label for="sup-pic" class="font-bold text-slate-700 block mb-1">Contact Person / Nama Sales</label>
          <input
            id="sup-pic"
            type="text"
            bind:value={supplierForm.contactPerson}
            placeholder="Bapak Hendra (Sales Representative)"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>
        <div class="col-span-2">
          <label for="sup-addr" class="font-bold text-slate-700 block mb-1">Alamat Kantor / Depo Distribusi</label>
          <input
            id="sup-addr"
            type="text"
            bind:value={supplierForm.address}
            placeholder="Jl. Perintis Kemerdekaan No. 88, Tasikmalaya"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>
        <div class="col-span-2 flex items-center gap-2 pt-1">
          <input
            id="sup-active"
            type="checkbox"
            bind:checked={supplierForm.isActive}
            class="w-4 h-4 rounded text-brand-blue"
          />
          <label for="sup-active" class="font-semibold text-slate-700 select-none cursor-pointer">
            Status Aktif (dapat dipilih untuk pemesanan & faktur)
          </label>
        </div>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isSupplierModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
          disabled={isSavingSupplier}
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleSaveSupplier}
          disabled={isSavingSupplier}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {#if isSavingSupplier}
            <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Menyimpan...</span>
          {:else}
            <span>{editingSupplierId ? "Simpan Perubahan" : "Simpan Distributor"}</span>
          {/if}
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
          <label for="pbf-pay-meth" class="font-bold text-slate-700 block mb-1">Metode / Akun Pengeluaran Kas-Bank</label>
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
          <div class="flex items-center justify-between mb-1">
            <label for="pbf-pay-amount" class="font-bold text-slate-700">Nominal Pembayaran (Rp)</label>
            <button
              type="button"
              onclick={() => (pbfPaymentAmount = selectedPbfDebt.totalDebt)}
              class="text-[10px] font-bold text-brand-blue hover:underline"
            >
              Bayar Lunas Penuh
            </button>
          </div>
          <input
            id="pbf-pay-amount"
            type="number"
            min="1"
            max={selectedPbfDebt.totalDebt}
            bind:value={pbfPaymentAmount}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 text-sm"
          />
          {#if pbfPaymentAmount < selectedPbfDebt.totalDebt && pbfPaymentAmount > 0}
            <div class="text-[10px] text-amber-600 mt-1 font-medium">
              Sisa tagihan setelah pembayaran: {formatRupiah(selectedPbfDebt.totalDebt - pbfPaymentAmount)} (Status: SEBAGIAN/PARTIAL)
            </div>
          {/if}
        </div>

        <div>
          <label for="pbf-pay-ref" class="font-bold text-slate-700 block mb-1">No. Bukti / Referensi Bank (Opsional)</label>
          <input
            id="pbf-pay-ref"
            type="text"
            bind:value={pbfPaymentRef}
            placeholder="Contoh: TF-BCA-99821 atau No. Warkat Giro"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-xs"
          />
        </div>
      </div>

      <div class="border-t border-slate-100 pt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isPayPbfDebtModalOpen = false)}
          disabled={isSavingPayment}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleSavePbfPayment}
          disabled={isSavingPayment}
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {#if isSavingPayment}
            <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Memproses...</span>
          {:else}
            <span>Konfirmasi Bayar</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
