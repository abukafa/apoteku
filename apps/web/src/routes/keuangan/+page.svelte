<script lang="ts">
  import { onMount } from "svelte";
  import {
    CircleDollarSign,
    Plus,
    ArrowUpRight,
    ArrowDownLeft,
    Wallet,
    CreditCard,
    TrendingUp,
    TrendingDown,
    CheckCircle2,
    Lock,
    Eye,
    Store,
    X,
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
  import { api } from "$lib/services/api";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { alertStore } from "$lib/stores/alertStore.svelte";
  import { tenantStore } from "$lib/stores/tenantStore.svelte";
  import { formatRupiah, calculateCashierShiftReconciliation } from "@apoteku/core";

  interface CashLedgerEntry {
    id: string;
    branchId: string;
    branchName: string;
    time: string;
    type: "IN" | "OUT";
    category: string;
    account: "KAS_LACI" | "KAS_BRANKAS" | "BANK_BCA";
    refNumber: string;
    amount: number;
    balance: number;
    operator: string;
    description: string;
  }

  interface CashierShiftRecord {
    id: string;
    shiftCode: string;
    branchId: string;
    branchName: string;
    cashierName: string;
    shiftLabel: string;
    startTime: string;
    endTime: string;
    initialCash: number;
    expectedCash: number;
    actualCash: number;
    cashDifference: number;
    totalNonCash: number;
    totalSales: number;
    pettyCashOut?: number;
    pettyCashIn?: number;
    cashRefunds?: number;
    isOpen: boolean;
    notes: string;
  }

  // Master Data & Filters
  const canSelectBranch = $derived(authStore.canSelectBranch);
  const canManageCashflow = $derived(authStore.can("finance:cashflow:manage"));
  let branches = $state<any[]>([]);
  let selectedBranchId = $state(authStore.isAllBranches ? "ALL" : (authStore.user?.branchId || "1"));
  let activeTab = $state<"buku_kas" | "rekonsiliasi_shift">("buku_kas");

  let ledgerTypeFilter = $state<"ALL" | "IN" | "OUT">("ALL");
  let shiftStatusFilter = $state<"ALL" | "OPEN" | "CLOSED">("ALL");
  let searchQuery = $state("");
  let shiftSearchQuery = $state("");
  let isLoading = $state(false);

  // Modals State
  let isAddExpenseModalOpen = $state(false);
  let isCloseShiftModalOpen = $state(false);
  let selectedShiftForClose = $state<CashierShiftRecord | null>(null);
  let actualCountedCashInput = $state(0);
  let closeShiftNotes = $state("");
  let closeShiftRecon = $derived.by(() => {
    if (!selectedShiftForClose) return null;
    return calculateCashierShiftReconciliation({
      initialCash: selectedShiftForClose.initialCash,
      cashSales: selectedShiftForClose.expectedCash - selectedShiftForClose.initialCash,
      actualCash: Number(actualCountedCashInput),
      cashRefunds: 0,
      pettyCashIn: 0,
      pettyCashOut: 0
    });
  });
  let isSubmittingExpense = $state(false);
  let isSubmittingPayout = $state(false);
  let isClosingShift = $state(false);

  // Financial Balances from Backend
  let qrisBalance = $state(0);
  let totalKasBank = $state(0);
  let kasLaci = $state(0);
  let kasBrankas = $state(0);
  let bcaBalance = $state(0);
  let totalDebt = $state(0);

  let isPayoutModalOpen = $state(false);
  let payoutSuccess = $state("");
  let payoutAmount = $state(0);

  // Cash Ledger Entries (Real database via API)
  let cashEntries = $state<CashLedgerEntry[]>([]);

  // Cashier Shift Reconciliation Records (Real database via API)
  let shiftRecords = $state<CashierShiftRecord[]>([]);

  // Form Catat Mutasi Kas Kecil State
  let expenseForm = $state({
    branchId: authStore.user?.branchId || "1",
    type: "OUT" as "IN" | "OUT",
    category: "Perlengkapan",
    account: "KAS_LACI" as "KAS_LACI" | "KAS_BRANKAS" | "BANK_BCA",
    amount: 50000,
    operator: authStore.user?.fullName || "Staf Keuangan",
    description: ""
  });

  async function loadFinanceData(branchId?: string) {
    isLoading = true;
    try {
      const targetBranch = branchId ?? selectedBranchId ?? (authStore.isAllBranches ? "ALL" : authStore.user?.branchId);
      const [shiftRes, cfRes] = await Promise.all([
        api.shift.list({ branchId: targetBranch }),
        api.finance.getCashflow(targetBranch)
      ]);

      if (shiftRes?.success && Array.isArray(shiftRes.data)) {
        shiftRecords = shiftRes.data;
      }

      if (cfRes?.success && cfRes.data) {
        const d = cfRes.data;
        qrisBalance = Number(d.qrisBalance || 0);
        payoutAmount = qrisBalance;
        kasLaci = Number(d.kasLaci || 0);
        kasBrankas = Number(d.kasBrankas || 0);
        bcaBalance = Number(d.bcaBalance || 0);
        totalKasBank = Number(d.totalKasBank || 0);
        totalDebt = Number(d.totalDebt || 0);
        if (Array.isArray(d.entries)) {
          cashEntries = d.entries;
        }
      }
    } catch (err) {
      console.error("Gagal memuat data keuangan:", err);
    } finally {
      isLoading = false;
    }
  }

  onMount(async () => {
    if (authStore.user?.fullName) {
      expenseForm.operator = authStore.user.fullName;
    }
    try {
      const bRes = await api.erp.getBranches();
      const bList = bRes?.data || (Array.isArray(bRes) ? bRes : []);
      if (bList.length > 0) {
        branches = bList;
        if (authStore.isAllBranches) {
          selectedBranchId = "ALL";
        } else if (!selectedBranchId || selectedBranchId === "ALL") {
          selectedBranchId = authStore.user?.branchId || bList[0].id;
        }

        const exists = selectedBranchId === "ALL" || bList.some((b: any) => b.id === selectedBranchId);
        if (!exists) {
          selectedBranchId = authStore.isAllBranches ? "ALL" : bList[0].id;
        }
        expenseForm.branchId = selectedBranchId === "ALL" ? bList[0].id : selectedBranchId;
      }
      await loadFinanceData(selectedBranchId);
    } catch (err) {
      console.error("Error onMount keuangan:", err);
    }
  });

  // Branch-filtered arrays
  let branchCashEntries = $derived(
    cashEntries.filter(
      (e) => selectedBranchId === "ALL" || e.branchId === selectedBranchId
    )
  );

  let branchShiftRecords = $derived(
    shiftRecords.filter(
      (s) => selectedBranchId === "ALL" || s.branchId === selectedBranchId
    )
  );

  // Table-filtered arrays
  let filteredCashEntries = $derived(
    branchCashEntries.filter((e) => {
      const matchType =
        ledgerTypeFilter === "ALL" || e.type === ledgerTypeFilter;
      const q = searchQuery.toLowerCase();
      const matchSearch =
        e.refNumber.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.operator.toLowerCase().includes(q);
      return matchType && matchSearch;
    })
  );

  let filteredShiftRecords = $derived(
    branchShiftRecords.filter((s) => {
      const matchStatus =
        shiftStatusFilter === "ALL" ||
        (shiftStatusFilter === "OPEN" ? s.isOpen : !s.isOpen);
      const q = shiftSearchQuery.toLowerCase();
      const matchSearch =
        s.shiftCode.toLowerCase().includes(q) ||
        s.cashierName.toLowerCase().includes(q) ||
        s.shiftLabel.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    })
  );

  // Reactive Metrics
  let totalCashIn = $derived(
    branchCashEntries
      .filter((e) => e.type === "IN")
      .reduce((a, b) => a + b.amount, 0)
  );
  let totalCashOut = $derived(
    branchCashEntries
      .filter((e) => e.type === "OUT")
      .reduce((a, b) => a + b.amount, 0)
  );
  let currentBalance = $derived(kasLaci + bcaBalance);

  // Pagination & Sorting State
  const PAGE_SIZE = 25;
  let cashPage = $state(1);
  let shiftPage = $state(1);

  // Sorting state untuk Tab 1: Arus Kas
  let cashSortKey = $state<string>("time");
  let cashSortDirection = $state<SortDirection>("desc");

  function handleCashSort(state: SortState) {
    cashSortKey = state.key;
    cashSortDirection = state.direction;
    cashPage = 1;
  }

  let sortedCashEntries = $derived.by(() => {
    if (!cashSortKey || !cashSortDirection) return filteredCashEntries;
    const copy = [...filteredCashEntries];
    return copy.sort((a, b) => {
      let valA: any;
      let valB: any;
      let type: "string" | "number" | "date" = "string";

      switch (cashSortKey) {
        case "time":
          valA = a.time;
          valB = b.time;
          type = "date";
          break;
        case "refNumber":
          valA = a.refNumber;
          valB = b.refNumber;
          break;
        case "account":
          valA = a.account;
          valB = b.account;
          break;
        case "description":
          valA = a.description;
          valB = b.description;
          break;
        case "in":
          valA = a.type === "IN" ? a.amount : 0;
          valB = b.type === "IN" ? b.amount : 0;
          type = "number";
          break;
        case "out":
          valA = a.type === "OUT" ? a.amount : 0;
          valB = b.type === "OUT" ? b.amount : 0;
          type = "number";
          break;
        case "operator":
          valA = a.operator;
          valB = b.operator;
          break;
        default:
          valA = (a as Record<string, any>)[cashSortKey];
          valB = (b as Record<string, any>)[cashSortKey];
      }
      return compareTableValues(valA, valB, cashSortDirection, type);
    });
  });

  let cashTotalPages = $derived(
    Math.max(1, Math.ceil(sortedCashEntries.length / PAGE_SIZE))
  );
  let paginatedCashEntries = $derived(
    sortedCashEntries.slice((cashPage - 1) * PAGE_SIZE, cashPage * PAGE_SIZE)
  );

  // Sorting state untuk Tab 2: Rekonsiliasi Shift
  let shiftSortKey = $state<string>("shiftCode");
  let shiftSortDirection = $state<SortDirection>("desc");

  function handleShiftSort(state: SortState) {
    shiftSortKey = state.key;
    shiftSortDirection = state.direction;
    shiftPage = 1;
  }

  let sortedShiftRecords = $derived.by(() => {
    if (!shiftSortKey || !shiftSortDirection) return filteredShiftRecords;
    const copy = [...filteredShiftRecords];
    return copy.sort((a, b) => {
      let valA: any;
      let valB: any;
      let type: "string" | "number" | "boolean" = "string";

      switch (shiftSortKey) {
        case "shiftCode":
          valA = a.shiftCode;
          valB = b.shiftCode;
          break;
        case "cashierName":
          valA = a.cashierName;
          valB = b.cashierName;
          break;
        case "initialCash":
          valA = a.initialCash;
          valB = b.initialCash;
          type = "number";
          break;
        case "expectedCash":
          valA = a.expectedCash;
          valB = b.expectedCash;
          type = "number";
          break;
        case "actualCash":
          valA = a.actualCash;
          valB = b.actualCash;
          type = "number";
          break;
        case "totalNonCash":
          valA = a.totalNonCash;
          valB = b.totalNonCash;
          type = "number";
          break;
        case "cashDifference":
          valA = a.cashDifference;
          valB = b.cashDifference;
          type = "number";
          break;
        case "isOpen":
          valA = a.isOpen;
          valB = b.isOpen;
          type = "boolean";
          break;
        default:
          valA = (a as Record<string, any>)[shiftSortKey];
          valB = (b as Record<string, any>)[shiftSortKey];
      }
      return compareTableValues(valA, valB, shiftSortDirection, type);
    });
  });

  let shiftTotalPages = $derived(
    Math.max(1, Math.ceil(sortedShiftRecords.length / PAGE_SIZE))
  );
  let paginatedShiftRecords = $derived(
    sortedShiftRecords.slice((shiftPage - 1) * PAGE_SIZE, shiftPage * PAGE_SIZE)
  );

  async function handleSaveExpense() {
    if (!canManageCashflow) {
      alertStore.danger("Akses Ditolak", "Anda tidak memiliki wewenang mengelola arus kas (finance:cashflow:manage).");
      return;
    }
    if (!expenseForm.amount || expenseForm.amount <= 0) return;
    isSubmittingExpense = true;
    try {
      const amt = Number(expenseForm.amount);
      const res = await api.finance.recordCashMutation({
        branchId: expenseForm.branchId,
        type: expenseForm.type,
        category: expenseForm.category,
        account: expenseForm.account,
        amount: amt,
        description:
          expenseForm.description.trim() ||
          `${expenseForm.category} (${expenseForm.account})`,
        operator: authStore.user?.fullName || expenseForm.operator
      });

      if (res?.success) {
        await loadFinanceData(selectedBranchId);
        expenseForm.description = "";
        isAddExpenseModalOpen = false;
      } else {
        alert(res?.error || "Gagal menyimpan mutasi kas");
      }
    } catch (err: any) {
      alert("Terjadi kesalahan: " + (err?.message || err));
    } finally {
      isSubmittingExpense = false;
    }
  }

  async function handlePayoutSubmit() {
    if (!canManageCashflow) {
      alertStore.danger("Akses Ditolak", "Anda tidak memiliki wewenang mengelola arus kas (finance:cashflow:manage).");
      return;
    }
    if (payoutAmount <= 0) return;
    isSubmittingPayout = true;
    try {
      const targetBranch =
        selectedBranchId && selectedBranchId !== "ALL"
          ? selectedBranchId
          : branches[0]?.id;
      const res = await api.finance.recordQrisPayout({
        branchId: targetBranch,
        amount: payoutAmount,
        operator: authStore.user?.fullName || "Staf Keuangan"
      });

      if (res?.success) {
        payoutSuccess = `Penarikan ${formatRupiah(payoutAmount)} berhasil diproses!`;
        await loadFinanceData(selectedBranchId);
        setTimeout(() => {
          payoutSuccess = "";
          isPayoutModalOpen = false;
        }, 1500);
      } else {
        alert(res?.error || "Gagal memproses penarikan QRIS");
      }
    } catch (err: any) {
      alert("Terjadi kesalahan: " + (err?.message || err));
    } finally {
      isSubmittingPayout = false;
    }
  }

  function openCloseShiftModal(shift: CashierShiftRecord) {
    selectedShiftForClose = shift;
    actualCountedCashInput = shift.expectedCash;
    closeShiftNotes = "Setoran fisik laci kasir sesuai";
    isCloseShiftModalOpen = true;
  }

  async function handleConfirmCloseShift() {
    if (!selectedShiftForClose) return;
    isClosingShift = true;
    try {
      const res = await api.shift.close({
        shiftId: selectedShiftForClose.id,
        actualCash: Number(actualCountedCashInput),
        notes: closeShiftNotes
      });

      if (res?.success) {
        await loadFinanceData(selectedBranchId);
        isCloseShiftModalOpen = false;
        selectedShiftForClose = null;
      } else {
        alert(res?.error || "Gagal menutup shift");
      }
    } catch (err: any) {
      alert("Terjadi kesalahan: " + (err?.message || err));
    } finally {
      isClosingShift = false;
    }
  }

  let deletingEntryId = $state<string | null>(null);

  async function handleDeleteEntry(entry: CashLedgerEntry) {
    if (authStore.user?.role !== "SUPERADMIN" && authStore.user?.role !== "OWNER") {
      alertStore.danger("Akses Ditolak", "Hanya Superuser dan Owner yang berhak menghapus entri buku kas.");
      return;
    }

    const isDebtPayment = entry.id.startsWith("dp-");
    const title = isDebtPayment ? "Batalkan Pembayaran Hutang" : "Hapus Mutasi Kas";
    const message = isDebtPayment
      ? `Yakin ingin membatalkan transaksi pelunasan "${entry.refNumber}" (${entry.description}) senilai ${formatRupiah(entry.amount)}? Saldo sisa tagihan faktur PBF akan dikembalikan secara otomatis.`
      : `Yakin ingin menghapus entri mutasi kas "${entry.refNumber}" (${entry.description || entry.category}) senilai ${formatRupiah(entry.amount)}? Saldo kas akan dihitung ulang secara otomatis.`;

    const isConfirmed = await alertStore.confirm({
      type: "danger",
      title,
      message,
      confirmText: isDebtPayment ? "Ya, Batalkan Pembayaran" : "Ya, Hapus Mutasi",
      cancelText: "Batal"
    });

    if (!isConfirmed) return;

    deletingEntryId = entry.id;
    try {
      let res;
      if (isDebtPayment) {
        const debtPaymentId = entry.id.replace("dp-", "");
        res = await api.finance.deleteDebtPayment(debtPaymentId);
      } else {
        res = await api.finance.deleteCashMutation(entry.id);
      }

      if (res?.success) {
        alertStore.toast(
          res.message || `Transaksi ${entry.refNumber} berhasil dihapus.`,
          "success",
          "Berhasil Dihapus"
        );
        await loadFinanceData(selectedBranchId);
      } else {
        alertStore.danger("Gagal Menghapus Transaksi", res?.error || "Gagal menghapus entri kas");
      }
    } catch (err: any) {
      alertStore.danger("Terjadi Kesalahan", err?.message || "Terjadi kesalahan saat menghapus entri");
    } finally {
      deletingEntryId = null;
    }
  }
</script>

<svelte:head>
  <title>Keuangan &bull; {tenantStore.current.name || "Hafidz Farma"}</title>
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
      <!-- Branch selector (for Multi-branch User) or locked badge (for Single Branch Staff) -->
      {#if authStore.canSelectBranch}
        <div class="w-56">
          <Select
            value={selectedBranchId}
            onchange={(val) => {
              selectedBranchId = val;
              loadFinanceData(val);
            }}
            options={[
              { value: "ALL", label: "Semua Cabang Apotek" },
              ...branches.map((b) => ({ value: b.id, label: b.name }))
            ]}
          />
        </div>
      {:else}
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs" title="Cabang Penugasan">
          <Store class="w-3.5 h-3.5 text-brand-blue" />
          <span>{authStore.user?.branchName || branches.find((b) => b.id === selectedBranchId)?.name || (tenantStore.current.name ? `${tenantStore.current.name} Pusat` : "Apotek Hafidz Farma Pusat")}</span>
        </div>
      {/if}

      {#if canManageCashflow}
        <button
          type="button"
          onclick={() => (isAddExpenseModalOpen = true)}
          class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
        >
          <Plus class="w-4 h-4" />
          <span>Catat Mutasi Kas Kecil</span>
        </button>
      {/if}
    {/snippet}
  </PageHeader>

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Saldo Kas & Bank"
      value={formatRupiah(currentBalance, false)}
      subtext={bcaBalance > 0
        ? `Laci: ${formatRupiah(kasLaci)} • Bank: ${formatRupiah(bcaBalance)}`
        : `Saldo Kasir: ${formatRupiah(kasLaci)}`}
      icon={Wallet}
      variant="brand"
    />
    <MetricCard
      title="Total Kas Masuk (IN)"
      value={formatRupiah(totalCashIn, false)}
      subtext="{branchCashEntries.filter((e) => e.type === 'IN').length} Mutasi penerimaan"
      icon={ArrowDownLeft}
      variant="success"
    />
    <MetricCard
      title="Kas Keluar (OUT)"
      value={formatRupiah(totalCashOut, false)}
      subtext="{branchCashEntries.filter((e) => e.type === 'OUT').length} Beban & pembayaran"
      icon={ArrowUpRight}
      variant="warning"
    />
    <MetricCard
      title="Kas Bersih (Net)"
      value={formatRupiah(totalCashIn - totalCashOut, false)}
      subtext="Selisih kas masuk vs keluar"
      icon={(totalCashIn - totalCashOut) > 0 ? TrendingUp : TrendingDown}
      variant={(totalCashIn - totalCashOut) > 0 ? "brand" : "danger"}
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
        Rekening Tujuan: <strong>{tenantStore.current.bankName} {tenantStore.current.bankAccountNumber}</strong> ({tenantStore.current.bankAccountHolder}) &bull; Auto-sweep setiap 23:00 WIB
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

  <!-- TAB NAVIGATION -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold overflow-x-auto no-scrollbar">
    <button
      type="button"
      onclick={() => (activeTab = "buku_kas")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'buku_kas' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Buku Kas & Mutasi Harian ({branchCashEntries.length})</span>
      {#if activeTab === "buku_kas"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "rekonsiliasi_shift")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'rekonsiliasi_shift' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Rekonsiliasi & Tutup Shift Kasir ({branchShiftRecords.length})</span>
      {#if activeTab === "rekonsiliasi_shift"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>
  </div>

  <!-- TAB 1: DATA TABLE BUKU KAS -->
  {#if activeTab === "buku_kas"}
    <DataTable
      title="Buku Kas Operasional Harian"
      subtitle="Arus kas masuk dan keluar per cabang operasional"
      searchPlaceholder="Cari keterangan, nomor referensi, atau kategori..."
      bind:searchValue={searchQuery}
      totalCount={sortedCashEntries.length}
      currentPage={cashPage}
      totalPages={cashTotalPages}
      pageSize={PAGE_SIZE}
      onPageChange={(p) => (cashPage = p)}
      isLoading={isLoading}
      emptyText="Belum ada transaksi arus kas untuk cabang ini."
      emptyIcon={Wallet}
    >
      {#snippet titleContent()}
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-blue-50 text-[#1d63d8] flex items-center justify-center font-bold">
            <Wallet class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Buku Kas Operasional Harian</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#1d63d8] border border-blue-200/60">
                {sortedCashEntries.length} Mutasi
              </span>
            </h3>
            <p class="text-[11px] text-slate-500 font-medium">Arus kas masuk dan keluar per cabang operasional</p>
          </div>
        </div>
      {/snippet}

      {#snippet filters()}
        <div class="w-44 shrink-0">
          <Select
            value={ledgerTypeFilter}
            onchange={(val) => {
              ledgerTypeFilter = val as typeof ledgerTypeFilter;
              cashPage = 1;
            }}
            options={[
              { value: "ALL", label: "Semua Arus Kas" },
              { value: "IN", label: "Kas Masuk (IN)" },
              { value: "OUT", label: "Kas Keluar (OUT)" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <SortableTh key="time" label="Waktu" dataType="date" sortKey={cashSortKey} sortDirection={cashSortDirection} onsort={handleCashSort} />
        <SortableTh key="refNumber" label="Referensi" sortKey={cashSortKey} sortDirection={cashSortDirection} onsort={handleCashSort} />
        <SortableTh key="account" label="Akun" sortKey={cashSortKey} sortDirection={cashSortDirection} onsort={handleCashSort} />
        <SortableTh key="description" label="Keterangan" sortKey={cashSortKey} sortDirection={cashSortDirection} onsort={handleCashSort} />
        <SortableTh key="in" label="Masuk" dataType="currency" align="right" sortKey={cashSortKey} sortDirection={cashSortDirection} onsort={handleCashSort} />
        <SortableTh key="out" label="Keluar" dataType="currency" align="right" sortKey={cashSortKey} sortDirection={cashSortDirection} onsort={handleCashSort} />
        <SortableTh key="operator" label="Petugas" align="center" sortKey={cashSortKey} sortDirection={cashSortDirection} onsort={handleCashSort} />
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if paginatedCashEntries.length === 0}
          <tr>
            <td colspan="8" class="py-12 text-center text-slate-400 text-xs">
              {isLoading ? "Memuat riwayat transaksi kas..." : "Belum ada transaksi arus kas untuk cabang ini."}
            </td>
          </tr>
        {/if}
        {#each paginatedCashEntries as entry}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
              {entry.time}
              <div class="font-sans text-[10px] text-slate-400">{entry.branchName}</div>
            </td>
            <td class="py-3.5 px-4 font-mono font-bold text-brand-blue whitespace-nowrap">
              {entry.refNumber}
              <div class="text-[10px] font-mono text-slate-400 mt-0.5">
                {entry.category}
              </div>
            </td>
            <td class="py-3.5 px-4">
              <div class="px-2 py-0.5 rounded text-center text-[8px] {entry.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-brand-red-700'}">
                {entry.account}
              </div>
            </td>
            <td class="py-3.5 px-4 text-slate-700 text-xs">{entry.description}</td>
            <td class="py-3.5 px-4 text-right font-mono font-bold text-emerald-600">
              {entry.type === "IN" ? formatRupiah(entry.amount) : "-"}
            </td>
            <td class="py-3.5 px-4 text-right font-mono font-bold text-brand-red-600">
              {entry.type === "OUT" ? formatRupiah(entry.amount) : "-"}
            </td>
            <td class="py-3.5 px-4 text-center text-slate-600 font-semibold">{entry.operator}</td>
            <td class="py-3.5 px-4 text-center">
              {#if canManageCashflow}
                <button
                  type="button"
                  onclick={() => handleDeleteEntry(entry)}
                  disabled={deletingEntryId === entry.id}
                  class="p-1.5 rounded-lg text-slate-400 hover:text-brand-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                  title="Hapus / Batalkan Transaksi Kas"
                  aria-label="Hapus Transaksi Kas"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              {:else}
                <span class="text-slate-300 text-xs">-</span>
              {/if}
            </td>
          </tr>
        {/each}
      {/snippet}
    </DataTable>

  <!-- TAB 2: REKONSILIASI & TUTUP SHIFT KASIR -->
  {:else if activeTab === "rekonsiliasi_shift"}
    <DataTable
      title="Rekonsiliasi Kasir & Setoran Laci"
      subtitle="Pencatatan modal kasir, penerimaan penjualan, dan selisih fisik tutup shift"
      searchPlaceholder="Cari kode shift, nama kasir, atau jadwal..."
      bind:searchValue={shiftSearchQuery}
      totalCount={sortedShiftRecords.length}
      currentPage={shiftPage}
      totalPages={shiftTotalPages}
      pageSize={PAGE_SIZE}
      onPageChange={(p) => (shiftPage = p)}
      isLoading={isLoading}
      emptyText="Belum ada catatan shift kasir untuk cabang ini."
      emptyIcon={Lock}
    >
      {#snippet titleContent()}
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Lock class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Rekonsiliasi Kasir & Setoran Laci</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                {sortedShiftRecords.length} Shift
              </span>
            </h3>
            <p class="text-[11px] text-slate-500 font-medium">Pencatatan modal kasir, penerimaan penjualan, dan selisih fisik tutup shift</p>
          </div>
        </div>
      {/snippet}

      {#snippet filters()}
        <div class="w-44 shrink-0">
          <Select
            value={shiftStatusFilter}
            onchange={(val) => {
              shiftStatusFilter = val as typeof shiftStatusFilter;
              shiftPage = 1;
            }}
            options={[
              { value: "ALL", label: "Semua Shift" },
              { value: "OPEN", label: "Shift Aktif" },
              { value: "CLOSED", label: "Sudah Ditutup" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <SortableTh key="shiftCode" label="Shift" sortKey={shiftSortKey} sortDirection={shiftSortDirection} onsort={handleShiftSort} />
        <SortableTh key="cashierName" label="Kasir" sortKey={shiftSortKey} sortDirection={shiftSortDirection} onsort={handleShiftSort} />
        <SortableTh key="initialCash" label="Modal" dataType="currency" align="right" sortKey={shiftSortKey} sortDirection={shiftSortDirection} onsort={handleShiftSort} />
        <SortableTh key="expectedCash" label="Sistem" dataType="currency" align="right" sortKey={shiftSortKey} sortDirection={shiftSortDirection} onsort={handleShiftSort} />
        <SortableTh key="actualCash" label="Fisik" dataType="currency" align="right" sortKey={shiftSortKey} sortDirection={shiftSortDirection} onsort={handleShiftSort} />
        <SortableTh key="totalNonCash" label="Non-Tunai" dataType="currency" align="right" sortKey={shiftSortKey} sortDirection={shiftSortDirection} onsort={handleShiftSort} />
        <SortableTh key="cashDifference" label="Selisih" dataType="currency" align="center" sortKey={shiftSortKey} sortDirection={shiftSortDirection} onsort={handleShiftSort} />
        <SortableTh key="isOpen" label="Status" align="center" sortKey={shiftSortKey} sortDirection={shiftSortDirection} onsort={handleShiftSort} />
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if paginatedShiftRecords.length === 0}
          <tr>
            <td colspan="9" class="py-12 text-center text-slate-400 text-xs">
              {isLoading ? "Memuat riwayat shift kasir..." : "Belum ada catatan shift kasir untuk cabang ini."}
            </td>
          </tr>
        {/if}
        {#each paginatedShiftRecords as s}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4">
              <div class="font-mono font-bold text-slate-900">{s.shiftCode}</div>
              <div class="text-[11px] text-slate-500">{s.shiftLabel}</div>
            </td>
            <td class="py-3.5 px-4">
              <div class="font-bold text-slate-800">{s.cashierName}</div>
              <div class="text-[10px] text-slate-400">{s.branchName}</div>
            </td>
            <td class="py-3.5 px-4 text-right font-mono text-slate-600">
              {formatRupiah(s.initialCash)}
            </td>
            <td class="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
              {formatRupiah(s.expectedCash)}
            </td>
            <td class="py-3.5 px-4 text-right font-mono font-bold text-brand-blue">
              {s.isOpen ? "-" : formatRupiah(s.actualCash)}
            </td>
            <td class="py-3.5 px-4 text-right font-mono text-emerald-600 font-semibold">
              {formatRupiah(s.totalNonCash)}
            </td>
            <td class="py-3.5 px-4 text-center font-mono">
              {#if s.isOpen}
                <Badge type="INFO" label="BERJALAN" />
              {:else if s.cashDifference === 0}
                <Badge type="SUCCESS" label="KLOP (Rp 0)" />
              {:else}
                <span class="font-bold text-brand-red-600">{formatRupiah(s.cashDifference)}</span>
              {/if}
            </td>
            <td class="py-3.5 px-4 text-center">
              {#if s.isOpen}
                <button
                  type="button"
                  onclick={() => openCloseShiftModal(s)}
                  class="px-2.5 py-1 rounded-lg bg-brand-red-600 hover:bg-brand-red-700 text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-xs"
                >
                  <Lock class="w-3 h-3" />
                  <span>Tutup Shift</span>
                </button>
              {:else}
                <span class="text-emerald-600 font-bold text-[11px] inline-flex items-center gap-1">
                  <CheckCircle2 class="w-3.5 h-3.5" /> Ditutup
                </span>
              {/if}
            </td>
          </tr>
        {/each}
      {/snippet}
    </DataTable>
  {/if}
</div>

<!-- MODAL CATAT MUTASI KAS KECIL -->
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
          <span>Catat Mutasi Kas Kecil & Operasional</span>
        </div>
        <button
          onclick={() => (isAddExpenseModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label for="exp-type" class="font-bold text-slate-700 block mb-1">Jenis Arus Kas</label>
          <Select
            id="exp-type"
            value={expenseForm.type}
            onchange={(val) => (expenseForm.type = val as "IN" | "OUT")}
            options={[
              { value: "OUT", label: "Pengeluaran Kas (OUT)" },
              { value: "IN", label: "Pemasukan / Tambah Modal (IN)" }
            ]}
          />
        </div>

        <div>
          <label for="exp-acc" class="font-bold text-slate-700 block mb-1">Sumber / Akun Kas</label>
          <Select
            id="exp-acc"
            value={expenseForm.account}
            onchange={(val) =>
              (expenseForm.account = val as "KAS_LACI" | "KAS_BRANKAS" | "BANK_BCA")}
            options={[
              { value: "KAS_LACI", label: "Kas Kecil / Laci Kasir" },
              { value: "KAS_BRANKAS", label: "Kas Brankas Apotek" },
              { value: "BANK_BCA", label: "Rekening Bank BCA" }
            ]}
          />
          {#if expenseForm.account === "KAS_LACI"}
            <span class="pl-2 text-[10px] text-amber-600 block mt-1 font-medium leading-tight">
              Memotong/menambah saldo kas kecil.
            </span>
          {:else if expenseForm.account === "KAS_BRANKAS"}
            <span class="pl-2 text-[10px] text-slate-500 block mt-1 font-medium leading-tight">
              Kas brankas apotek/pusat.
            </span>
          {:else}
            <span class="pl-2 text-[10px] text-blue-600 block mt-1 font-medium leading-tight">
              Mutasi rekening bank.
            </span>
          {/if}
        </div>

        <div class="col-span-2">
          <label for="exp-cat" class="font-bold text-slate-700 block mb-1">Kategori Transaksi</label>
          <Select
            id="exp-cat"
            value={expenseForm.category}
            onchange={(val) => (expenseForm.category = val)}
            options={[
              "Perlengkapan Kasir (Kertas, Plastik, ATK)",
              "Kebersihan & Operasional",
              "Konsumsi Karyawan",
              "Listrik, Air & Internet",
              "Sewa & Pemeliharaan Gedung",
              "Biaya Lain-Lain",
              "Tambah Modal Laci Kasir"
            ]}
          />
        </div>

        <div>
          <label for="exp-amount" class="font-bold text-slate-700 block mb-1">Nominal (Rp)</label>
          <input
            id="exp-amount"
            type="number"
            min="1000"
            bind:value={expenseForm.amount}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-brand-red-600"
          />
        </div>

        <div>
          {#if authStore.canSelectBranch}
            <label for="exp-branch" class="font-bold text-slate-700 block mb-1">Cabang Apotek</label>
            <Select
              id="exp-branch"
              value={expenseForm.branchId}
              onchange={(val) => (expenseForm.branchId = val)}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          {:else}
            <span class="font-bold text-slate-700 block mb-1">Cabang Apotek</span>
            <div class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-2">
              <Store class="w-4 h-4 text-brand-blue" />
              <span>{authStore.user?.branchName || branches.find((b) => b.id === expenseForm.branchId)?.name || "Cabang Utama"}</span>
            </div>
          {/if}
        </div>

        <div class="col-span-2">
          <label for="exp-desc" class="font-bold text-slate-700 block mb-1">Keterangan Lengkap</label>
          <textarea
            id="exp-desc"
            rows="2"
            bind:value={expenseForm.description}
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
          onclick={handleSaveExpense}
          disabled={isSubmittingExpense}
          class="px-4 py-2 rounded-xl bg-brand-red-600 hover:bg-brand-red-700 text-white font-bold text-xs shadow-sm disabled:opacity-50"
        >
          {isSubmittingExpense ? "Menyimpan..." : "Simpan ke Buku Kas"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL TUTUP & REKONSILIASI SHIFT KASIR -->
{#if isCloseShiftModalOpen && selectedShiftForClose}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isCloseShiftModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto text-xs">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold text-sm">
          <Lock class="w-5 h-5 text-brand-red-600" />
          <span>Tutup & Rekonsiliasi Shift Kasir</span>
        </div>
        <button
          onclick={() => (isCloseShiftModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
        <div class="flex justify-between">
          <span class="text-slate-500">Kode Shift:</span>
          <strong class="font-mono text-brand-blue">{selectedShiftForClose.shiftCode}</strong>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Kasir:</span>
          <strong>{selectedShiftForClose.cashierName} ({selectedShiftForClose.shiftLabel})</strong>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Modal Awal Laci:</span>
          <strong class="font-mono">{formatRupiah(selectedShiftForClose.initialCash)}</strong>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Non-Tunai (QRIS/EDC):</span>
          <strong class="font-mono text-emerald-700">{formatRupiah(selectedShiftForClose.totalNonCash)}</strong>
        </div>
        {#if (selectedShiftForClose.pettyCashOut ?? 0) > 0}
          <div class="flex justify-between text-amber-800 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
            <span>Pengeluaran Kas Kecil Laci:</span>
            <strong class="font-mono text-brand-red-600">- {formatRupiah(selectedShiftForClose.pettyCashOut || 0)}</strong>
          </div>
        {/if}
        {#if (selectedShiftForClose.pettyCashIn ?? 0) > 0}
          <div class="flex justify-between text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
            <span>Pemasukan / Modal Kas Laci:</span>
            <strong class="font-mono text-emerald-600">+ {formatRupiah(selectedShiftForClose.pettyCashIn || 0)}</strong>
          </div>
        {/if}
        {#if (selectedShiftForClose.cashRefunds ?? 0) > 0}
          <div class="flex justify-between text-rose-800 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200">
            <span>Refund Retur Penjualan:</span>
            <strong class="font-mono text-rose-600">- {formatRupiah(selectedShiftForClose.cashRefunds || 0)}</strong>
          </div>
        {/if}
        <div class="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm">
          <span>Tunai Sistem (Expected):</span>
          <span class="font-mono text-slate-900">{formatRupiah(selectedShiftForClose.expectedCash)}</span>
        </div>
      </div>

      <div class="space-y-3">
        <div>
          <label for="cls-actual" class="font-bold text-slate-700 block mb-1">Uang Tunai Fisik Dihitung di Laci (Rp)</label>
          <input
            id="cls-actual"
            type="number"
            bind:value={actualCountedCashInput}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-brand-blue text-sm"
          />
          <div class="mt-1 font-mono text-[11px] {closeShiftRecon?.status === 'BALANCED' ? 'text-emerald-600' : 'text-brand-red-600'} font-bold">
            Selisih: {formatRupiah(closeShiftRecon?.cashDifference ?? 0)}
            {#if closeShiftRecon?.status === "SURPLUS"}
              (Surplus / Kas Lebih)
            {:else if closeShiftRecon?.status === "DEFICIT"}
              (Defisit / Kas Kurang)
            {:else}
              (Seimbang / Sesuai)
            {/if}
          </div>
        </div>

        <div>
          <label for="cls-notes" class="font-bold text-slate-700 block mb-1">Catatan Rekonsiliasi</label>
          <input
            id="cls-notes"
            type="text"
            bind:value={closeShiftNotes}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>
      </div>

      <div class="border-t border-slate-100 pt-3 flex justify-end gap-2">
        <button
          type="button"
          onclick={() => (isCloseShiftModalOpen = false)}
          class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleConfirmCloseShift}
          disabled={isClosingShift}
          class="px-4 py-1.5 rounded-xl bg-brand-red-600 hover:bg-brand-red-700 text-white font-bold disabled:opacity-50"
        >
          {isClosingShift ? "Menutup..." : "Konfirmasi Tutup Shift"}
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
            <div class="font-bold text-slate-800 text-sm">{tenantStore.current.bankName}</div>
            <div class="font-mono text-slate-700">No. Rek: <strong>{tenantStore.current.bankAccountNumber}</strong></div>
            <div class="text-[11px] text-slate-500">A/N: {tenantStore.current.bankAccountHolder}</div>
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
            disabled={isSubmittingPayout}
            class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm disabled:opacity-50"
          >
            {isSubmittingPayout ? "Memproses..." : "Proses Penarikan Dana"}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
