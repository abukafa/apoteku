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
  import SortableTh from "$lib/components/ui/SortableTh.svelte";
  import { compareTableValues, type SortDirection, type SortState } from "$lib/components/ui/DataTable.types";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import { portal } from "$lib/actions/portal";
  import { onMount } from "svelte";
  import { api } from "$lib/services/api";
  import { alertStore } from "$lib/stores/alertStore.svelte";
  import { formatRupiah, calculateDebtSettlement } from "@apoteku/core";

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
    isConsignment: false,
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
      isConsignment: false,
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
      isConsignment: Boolean(s.isConsignment),
      isActive: s.isActive ?? true
    };
    isSupplierModalOpen = true;
  }

  async function handleSaveSupplier() {
    if (!supplierForm.name.trim()) {
      alertStore.warning("Validasi Distributor", "Nama distributor / PBF wajib diisi.");
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
          alertStore.toast(`Distributor "${res.data.name}" berhasil diperbarui!`, "success");
        } else {
          alertStore.danger("Gagal Memperbarui Distributor", res?.error || "Gagal memperbarui distributor");
        }
      } else {
        const res = await api.suppliers.create(supplierForm);
        if (res?.success) {
          suppliers = [res.data, ...suppliers];
          alertStore.toast(`Distributor "${res.data.name}" berhasil ditambahkan!`, "success");
        } else {
          alertStore.danger("Gagal Menambahkan Distributor", res?.error || "Gagal menambahkan distributor");
        }
      }
      isSupplierModalOpen = false;
    } catch (err: any) {
      alertStore.danger("Terjadi Kesalahan", err?.message || "Terjadi kesalahan saat menyimpan distributor");
    } finally {
      isSavingSupplier = false;
    }
  }

  async function handleDeleteSupplier(s: any) {
    const isConfirmed = await alertStore.confirm({
      type: "danger",
      title: "Hapus / Nonaktifkan Distributor",
      message: `Apakah Anda yakin ingin menghapus atau menonaktifkan distributor "${s.name}"?`,
      confirmText: "Ya, Lanjutkan",
      cancelText: "Batal"
    });
    if (!isConfirmed) return;

    try {
      const res = await api.suppliers.delete(s.id);
      if (res?.success) {
        if (res.action === 'soft_deleted') {
          const idx = suppliers.findIndex(x => x.id === s.id);
          if (idx !== -1) suppliers[idx].isActive = false;
          alertStore.toast(`Distributor "${s.name}" dinonaktifkan (memiliki riwayat transaksi).`, "info");
        } else {
          suppliers = suppliers.filter(x => x.id !== s.id);
          alertStore.toast(`Distributor "${s.name}" berhasil dihapus permanen!`, "success");
        }
      } else {
        alertStore.danger("Gagal Menghapus Distributor", res?.error || "Gagal menghapus distributor");
      }
    } catch (err: any) {
      alertStore.danger("Terjadi Kesalahan", err?.message || "Terjadi kesalahan saat menghapus distributor");
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
      const [liveSuppliersRes] = await Promise.all([
        api.suppliers.list().catch(() => null),
        loadDebts()
      ]);
      if (liveSuppliersRes?.success && Array.isArray(liveSuppliersRes.data)) {
        suppliers = liveSuppliersRes.data;
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
      alertStore.warning("Nominal Tidak Valid", "Nominal pembayaran hutang harus lebih besar dari Rp 0.");
      return;
    }
    if (pbfPaymentAmount > selectedPbfDebt.totalDebt) {
      alertStore.danger(
        "Nominal Melebihi Tagihan",
        `Nominal pembayaran (${formatRupiah(pbfPaymentAmount)}) tidak boleh melebihi sisa tagihan faktur (${formatRupiah(selectedPbfDebt.totalDebt)}).`
      );
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

        alertStore.toast(
          `Pelunasan hutang (${paidNum}) faktur ${selectedPbfDebt.invoiceRef} sebesar ${formatRupiah(pbfPaymentAmount)} berhasil dicatat! Status: ${isLunas ? "LUNAS (PAID)" : "SEBAGIAN (PARTIAL)"}.`,
          "success",
          "Pembayaran Tercatat",
          5000
        );

        isPayPbfDebtModalOpen = false;
        selectedPbfDebt = null;

        // Muat ulang data hutang terbaru dari database
        await loadDebts();
      } else {
        alertStore.danger("Gagal Mencatat Pelunasan", res?.error || "Gagal mencatat pelunasan hutang");
      }
    } catch (err: any) {
      alertStore.danger("Terjadi Kesalahan", err?.message || "Terjadi kesalahan saat memproses pembayaran");
    } finally {
      isSavingPayment = false;
    }
  }

  let isDeletingPaymentId = $state<string | null>(null);

  async function handleDeleteDebtPayment(p: any) {
    const isConfirmed = await alertStore.confirm({
      type: "danger",
      title: "Batalkan Pembayaran Hutang",
      message: `Yakin ingin membatalkan pembayaran ${p.paymentNumber || "ini"} sebesar ${formatRupiah(p.amountPaid)}? Sisa tagihan faktur ${p.invoiceNumber || ""} akan dikembalikan dan status faktur akan dipulihkan.`,
      confirmText: "Ya, Batalkan Pembayaran",
      cancelText: "Kembali"
    });
    if (!isConfirmed) return;

    isDeletingPaymentId = p.id;
    try {
      const res = await api.finance.deleteDebtPayment(p.id);
      if (res?.success) {
        alertStore.toast(
          res.message || `Bukti pembayaran ${p.paymentNumber} berhasil dibatalkan. Tagihan faktur dipulihkan.`,
          "success",
          "Pembatalan Berhasil"
        );
        await loadDebts();
      } else {
        alertStore.danger("Gagal Membatalkan Pembayaran", res?.error || "Gagal membatalkan pembayaran hutang");
      }
    } catch (err: any) {
      alertStore.danger("Terjadi Kesalahan", err?.message || "Terjadi kesalahan saat membatalkan pembayaran hutang");
    } finally {
      isDeletingPaymentId = null;
    }
  }

  let supplierTypeFilter = $state<"ALL" | "REGULAR" | "CONSIGNMENT">("ALL");

  // Filtered (searches across all suppliers before pagination)
  let filteredSuppliers = $derived(
    suppliers.filter((s) => {
      const matchSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.phone || "").includes(searchQuery);
      const matchType =
        supplierTypeFilter === "ALL" ||
        (supplierTypeFilter === "CONSIGNMENT" && Boolean(s.isConsignment)) ||
        (supplierTypeFilter === "REGULAR" && !s.isConsignment);
      return matchSearch && matchType;
    })
  );

  // Tab 1 Sorting State
  let supplierSortKey = $state<string>("name");
  let supplierSortDirection = $state<SortDirection>("asc");

  function handleSupplierSort(state: SortState) {
    supplierSortKey = state.key;
    supplierSortDirection = state.direction;
    supplierPage = 1;
  }

  let sortedSuppliers = $derived.by(() => {
    if (!supplierSortKey || !supplierSortDirection) return filteredSuppliers;
    const copy = [...filteredSuppliers];
    return copy.sort((a, b) => {
      let valA: any;
      let valB: any;
      let type: "string" | "number" | "boolean" = "string";

      switch (supplierSortKey) {
        case "code":
          valA = a.code;
          valB = b.code;
          break;
        case "name":
          valA = a.name;
          valB = b.name;
          break;
        case "phone":
          valA = a.phone;
          valB = b.phone;
          break;
        case "address":
          valA = a.address;
          valB = b.address;
          break;
        case "isActive":
          valA = a.isActive !== false;
          valB = b.isActive !== false;
          type = "boolean";
          break;
        default:
          valA = (a as Record<string, any>)[supplierSortKey];
          valB = (b as Record<string, any>)[supplierSortKey];
      }
      return compareTableValues(valA, valB, supplierSortDirection, type);
    });
  });

  let supplierTotalPages = $derived(
    Math.max(1, Math.ceil(sortedSuppliers.length / PAGE_SIZE))
  );
  let paginatedSuppliers = $derived(
    sortedSuppliers.slice((supplierPage - 1) * PAGE_SIZE, supplierPage * PAGE_SIZE)
  );

  let filteredPbfDebts = $derived(
    pbfDebts.filter(
      (d) =>
        d.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.invoiceRef.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  // Tab 2 Sorting State
  let debtSortKey = $state<string>("dueDate");
  let debtSortDirection = $state<SortDirection>("asc");

  function handleDebtSort(state: SortState) {
    debtSortKey = state.key;
    debtSortDirection = state.direction;
    debtPage = 1;
  }

  let sortedPbfDebts = $derived.by(() => {
    if (!debtSortKey || !debtSortDirection) return filteredPbfDebts;
    const copy = [...filteredPbfDebts];
    return copy.sort((a, b) => {
      let valA: any;
      let valB: any;
      let type: "string" | "number" | "date" = "string";

      switch (debtSortKey) {
        case "invoiceRef":
          valA = a.invoiceRef;
          valB = b.invoiceRef;
          break;
        case "supplierName":
          valA = a.supplierName;
          valB = b.supplierName;
          break;
        case "dueDate":
          valA = a.dueDate;
          valB = b.dueDate;
          type = "date";
          break;
        case "totalDebt":
          valA = Number(a.totalDebt || 0);
          valB = Number(b.totalDebt || 0);
          type = "number";
          break;
        case "status":
          valA = a.daysLeft;
          valB = b.daysLeft;
          type = "number";
          break;
        default:
          valA = (a as Record<string, any>)[debtSortKey];
          valB = (b as Record<string, any>)[debtSortKey];
      }
      return compareTableValues(valA, valB, debtSortDirection, type);
    });
  });

  let debtTotalPages = $derived(
    Math.max(1, Math.ceil(sortedPbfDebts.length / PAGE_SIZE))
  );
  let paginatedPbfDebts = $derived(
    sortedPbfDebts.slice((debtPage - 1) * PAGE_SIZE, debtPage * PAGE_SIZE)
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

  // Tab 3 Sorting State
  let paymentSortKey = $state<string>("paymentDate");
  let paymentSortDirection = $state<SortDirection>("desc");

  function handlePaymentSort(state: SortState) {
    paymentSortKey = state.key;
    paymentSortDirection = state.direction;
    paymentPage = 1;
  }

  let sortedDebtPayments = $derived.by(() => {
    if (!paymentSortKey || !paymentSortDirection) return filteredDebtPayments;
    const copy = [...filteredDebtPayments];
    return copy.sort((a, b) => {
      let valA: any;
      let valB: any;
      let type: "string" | "number" | "date" = "string";

      switch (paymentSortKey) {
        case "paymentNumber":
          valA = a.paymentNumber;
          valB = b.paymentNumber;
          break;
        case "paymentDate":
          valA = a.paymentDate;
          valB = b.paymentDate;
          type = "date";
          break;
        case "supplierName":
          valA = a.supplierName;
          valB = b.supplierName;
          break;
        case "invoiceNumber":
          valA = a.invoiceNumber;
          valB = b.invoiceNumber;
          break;
        case "paymentMethod":
          valA = a.paymentMethod;
          valB = b.paymentMethod;
          break;
        case "amountPaid":
          valA = Number(a.amountPaid || 0);
          valB = Number(b.amountPaid || 0);
          type = "number";
          break;
        default:
          valA = (a as Record<string, any>)[paymentSortKey];
          valB = (b as Record<string, any>)[paymentSortKey];
      }
      return compareTableValues(valA, valB, paymentSortDirection, type);
    });
  });

  let paymentTotalPages = $derived(
    Math.max(1, Math.ceil(sortedDebtPayments.length / PAGE_SIZE))
  );
  let paginatedDebtPayments = $derived(
    sortedDebtPayments.slice((paymentPage - 1) * PAGE_SIZE, paymentPage * PAGE_SIZE)
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
      subtitle="Database rekanan PBF, kontak logistik, dan jenis kerjasama vendor"
      searchPlaceholder="Cari nama distributor, kode PBF, atau kontak..."
      bind:searchValue={searchQuery}
      totalCount={sortedSuppliers.length}
      currentPage={supplierPage}
      totalPages={supplierTotalPages}
      pageSize={PAGE_SIZE}
      onPageChange={(p) => (supplierPage = p)}
      emptyText="Tidak ada data distributor PBF yang ditemukan."
      emptyIcon={Building2}
    >
      {#snippet titleContent()}
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-blue-50 text-[#1d63d8] flex items-center justify-center font-bold">
            <Building2 class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Daftar Distributor PBF</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#1d63d8] border border-blue-200/60">
                {sortedSuppliers.length} Distributor
              </span>
            </h3>
            <p class="text-[11px] text-slate-500 font-medium">Database rekanan PBF, kontak logistik, dan jenis kerjasama vendor</p>
          </div>
        </div>
      {/snippet}

      {#snippet filters()}
        <div class="w-48 shrink-0">
          <Select
            value={supplierTypeFilter}
            onchange={(val) => {
              supplierTypeFilter = val as typeof supplierTypeFilter;
              supplierPage = 1;
            }}
            size="sm"
            options={[
              { value: "ALL", label: "Semua Tipe Vendor" },
              { value: "REGULAR", label: "PBF Reguler (Faktur)" },
              { value: "CONSIGNMENT", label: "Vendor Konsinyasi (Titip)" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <SortableTh key="code" label="Kode" sortKey={supplierSortKey} sortDirection={supplierSortDirection} onsort={handleSupplierSort} />
        <SortableTh key="name" label="Distributor" sortKey={supplierSortKey} sortDirection={supplierSortDirection} onsort={handleSupplierSort} />
        <SortableTh key="phone" label="Kontak" sortKey={supplierSortKey} sortDirection={supplierSortDirection} onsort={handleSupplierSort} />
        <SortableTh key="address" label="Alamat" sortKey={supplierSortKey} sortDirection={supplierSortDirection} onsort={handleSupplierSort} />
        <SortableTh key="isActive" label="Status" align="center" sortKey={supplierSortKey} sortDirection={supplierSortDirection} onsort={handleSupplierSort} />
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
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-bold text-slate-900">{s.name}</span>
                  {#if s.isConsignment}
                    <span class="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200 font-bold text-[10px]">
                      KONSINYASI
                    </span>
                  {/if}
                </div>
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
      subtitle="Daftar faktur pembelian tempo dengan status jatuh tempo dan pembayaran"
      searchPlaceholder="Cari nama PBF atau nomor faktur..."
      bind:searchValue={searchQuery}
      totalCount={sortedPbfDebts.length}
      currentPage={debtPage}
      totalPages={debtTotalPages}
      pageSize={PAGE_SIZE}
      onPageChange={(p) => (debtPage = p)}
      emptyText="Tidak ada tagihan hutang PBF yang aktif."
      emptyIcon={Clock}
    >
      {#snippet titleContent()}
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Buku Hutang PBF</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                {sortedPbfDebts.length} Faktur Tagihan
              </span>
            </h3>
            <p class="text-[11px] text-slate-500 font-medium">Daftar faktur pembelian tempo dengan status jatuh tempo dan pembayaran</p>
          </div>
        </div>
      {/snippet}

      {#snippet header()}
        <SortableTh key="invoiceRef" label="Faktur" sortKey={debtSortKey} sortDirection={debtSortDirection} onsort={handleDebtSort} />
        <SortableTh key="supplierName" label="Distributor" sortKey={debtSortKey} sortDirection={debtSortDirection} onsort={handleDebtSort} />
        <SortableTh key="dueDate" label="Tempo" dataType="date" sortKey={debtSortKey} sortDirection={debtSortDirection} onsort={handleDebtSort} />
        <SortableTh key="totalDebt" label="Hutang" dataType="currency" align="right" sortKey={debtSortKey} sortDirection={debtSortDirection} onsort={handleDebtSort} />
        <SortableTh key="status" label="Status" align="center" sortKey={debtSortKey} sortDirection={debtSortDirection} onsort={handleDebtSort} />
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if paginatedPbfDebts.length === 0}
          <tr>
            <td colspan="6" class="py-12 text-center text-xs text-slate-400">
              <div class="flex flex-col items-center justify-center gap-2">
                <Clock class="w-8 h-8 text-slate-300" />
                <span>Tidak ada tagihan hutang PBF yang aktif.</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each paginatedPbfDebts as d}
            <tr class="hover:bg-blue-50/40 transition-colors">
              <td class="py-3.5 px-4 font-mono font-bold text-slate-900">{d.invoiceRef}</td>
              <td class="py-3.5 px-4 font-bold text-slate-800">{d.supplierName}</td>
              <td class="py-3.5 px-4 font-mono">
                <div class="font-bold {d.status === 'OVERDUE' ? 'text-brand-red-600' : d.status === 'DUE_SOON' ? 'text-amber-600' : 'text-slate-800'}">
                  {d.dueDate}
                </div>
                <div class="text-[10px] {d.status === 'OVERDUE' ? 'text-brand-red-600 font-semibold' : d.status === 'DUE_SOON' ? 'text-amber-600 font-semibold' : 'text-slate-400'}">
                  {d.daysLeft < 0 ? `Lewat ${Math.abs(d.daysLeft)} hari` : d.daysLeft === 0 ? 'Jatuh tempo hari ini' : `${d.daysLeft} hari lagi`}
                </div>
              </td>
              <td class="py-3.5 px-4 text-right font-mono font-black text-brand-red-600">
                {formatRupiah(d.totalDebt)}
              </td>
              <td class="py-3.5 px-4 text-center">
                {#if d.status === "OVERDUE"}
                  <Badge type="DANGER" label={`LEWAT ${Math.abs(d.daysLeft)} HARI`} />
                {:else if d.status === "DUE_SOON"}
                  <Badge type="WARNING" label={d.daysLeft === 0 ? "HARI INI" : `H-${d.daysLeft} TEMPO`} />
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
        {/if}
      {/snippet}
    </DataTable>

  <!-- TAB 3: RIWAYAT PEMBAYARAN HUTANG -->
  {:else if activeTab === "riwayat"}
    <DataTable
      title="Riwayat Pembayaran PBF"
      subtitle="Log transaksi pelunasan hutang dan bukti pengeluaran kas/bank"
      searchPlaceholder="Cari nomor bukti kas keluar, faktur, distributor, atau metode bayar..."
      bind:searchValue={searchQuery}
      totalCount={sortedDebtPayments.length}
      currentPage={paymentPage}
      totalPages={paymentTotalPages}
      pageSize={PAGE_SIZE}
      onPageChange={(p) => (paymentPage = p)}
      emptyText="Belum ada riwayat pembayaran hutang yang tercatat."
      emptyIcon={Clock}
    >
      {#snippet titleContent()}
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Clock class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Riwayat Pembayaran PBF</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                {sortedDebtPayments.length} Pembayaran
              </span>
            </h3>
            <p class="text-[11px] text-slate-500 font-medium">Log transaksi pelunasan hutang dan bukti pengeluaran kas/bank</p>
          </div>
        </div>
      {/snippet}

      {#snippet header()}
        <SortableTh key="paymentNumber" label="Dokumen" sortKey={paymentSortKey} sortDirection={paymentSortDirection} onsort={handlePaymentSort} />
        <SortableTh key="paymentDate" label="Tanggal" dataType="date" sortKey={paymentSortKey} sortDirection={paymentSortDirection} onsort={handlePaymentSort} />
        <SortableTh key="supplierName" label="Distributor" sortKey={paymentSortKey} sortDirection={paymentSortDirection} onsort={handlePaymentSort} />
        <SortableTh key="invoiceNumber" label="Faktur" sortKey={paymentSortKey} sortDirection={paymentSortDirection} onsort={handlePaymentSort} />
        <SortableTh key="paymentMethod" label="Metode" sortKey={paymentSortKey} sortDirection={paymentSortDirection} onsort={handlePaymentSort} />
        <SortableTh key="amountPaid" label="Nominal" dataType="currency" align="right" sortKey={paymentSortKey} sortDirection={paymentSortDirection} onsort={handlePaymentSort} />
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
        <div class="col-span-2 bg-purple-50/70 border border-purple-200 rounded-xl p-3 flex items-start gap-2.5">
          <input
            id="sup-consign"
            type="checkbox"
            bind:checked={supplierForm.isConsignment}
            class="w-4 h-4 rounded text-purple-600 mt-0.5"
          />
          <label for="sup-consign" class="select-none cursor-pointer">
            <div class="font-bold text-purple-900">Vendor / Mitra Konsinyasi (Titip Jual)</div>
            <div class="text-[11px] text-purple-700 mt-0.5">
              Tandai jika vendor ini menitipkan barang secara konsinyasi (pembayaran bagi hasil sesuai barang laku, bukan faktur hutang PBF langsung).
            </div>
          </label>
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
          {#if selectedPbfDebt && pbfPaymentAmount > 0}
            {@const settlement = calculateDebtSettlement(selectedPbfDebt.totalDebt, 0, pbfPaymentAmount)}
            <div class="text-[10px] mt-1 font-medium {settlement.isPaidOff ? 'text-emerald-600' : 'text-amber-600'}">
              Sisa tagihan setelah pembayaran: {formatRupiah(settlement.remainingDebt)} (Status: {settlement.isPaidOff ? 'LUNAS' : 'SEBAGIAN/PARTIAL'})
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
