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
    CheckCircle2,
    Lock,
    Eye,
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
    isOpen: boolean;
    notes: string;
  }

  // Master Data & Filters
  let branches = $state<any[]>([]);
  let selectedBranchId = $state(authStore.user?.branchId || "1");
  let activeTab = $state<"buku_kas" | "rekonsiliasi_shift">("buku_kas");

  let ledgerTypeFilter = $state<"ALL" | "IN" | "OUT">("ALL");
  let shiftStatusFilter = $state<"ALL" | "OPEN" | "CLOSED">("ALL");
  let searchQuery = $state("");
  let shiftSearchQuery = $state("");

  // Modals State
  let isAddExpenseModalOpen = $state(false);
  let isCloseShiftModalOpen = $state(false);
  let selectedShiftForClose = $state<CashierShiftRecord | null>(null);
  let actualCountedCashInput = $state(0);
  let closeShiftNotes = $state("");

  // QRIS Payment Gateway Settlement State
  let qrisBalance = $state(3420000);
  let isPayoutModalOpen = $state(false);
  let payoutSuccess = $state("");
  let payoutAmount = $state(3420000);

  // Cash Ledger Entries
  let cashEntries = $state<CashLedgerEntry[]>([
    {
      id: "csh-001",
      branchId: "1",
      branchName: "Apotek Hafidz Farma Pusat",
      time: "2025-10-27 10:12",
      type: "IN",
      category: "POS Kasir",
      account: "KAS_LACI",
      refNumber: "PJ-1025-0287",
      amount: 125000,
      balance: 4850000,
      operator: "Nida Farida",
      description: "Penjualan OTC Tunai"
    },
    {
      id: "csh-002",
      branchId: "1",
      branchName: "Apotek Hafidz Farma Pusat",
      time: "2025-10-27 09:48",
      type: "IN",
      category: "QRIS",
      account: "BANK_BCA",
      refNumber: "PJ-1025-0286",
      amount: 86500,
      balance: 4725000,
      operator: "Nida Farida",
      description: "Pembayaran QRIS Kasir (Resep RSP-2025-10-098)"
    },
    {
      id: "csh-003",
      branchId: "1",
      branchName: "Apotek Hafidz Farma Pusat",
      time: "2025-10-27 08:30",
      type: "OUT",
      category: "Operasional",
      account: "KAS_LACI",
      refNumber: "BOP-1027-01",
      amount: 150000,
      balance: 4638500,
      operator: "Erwin Noval Mufid",
      description: "Pembelian kantong kresek & lakban packing"
    },
    {
      id: "csh-004",
      branchId: "1",
      branchName: "Apotek Hafidz Farma Pusat",
      time: "2025-10-27 07:00",
      type: "IN",
      category: "Modal Kasir",
      account: "KAS_LACI",
      refNumber: "SFT-1027-01",
      amount: 500000,
      balance: 4788500,
      operator: "Nida Farida",
      description: "Kas awal laci kasir Shift Pagi"
    },
    {
      id: "csh-005",
      branchId: "2",
      branchName: "Apotek Hafidz Farma 2",
      time: "2025-10-27 09:15",
      type: "OUT",
      category: "Pelunasan PBF",
      account: "BANK_BCA",
      refNumber: "RLH-251027",
      amount: 1200000,
      balance: 3588500,
      operator: "apt. Hafidz Nurul",
      description: "Cicilan faktur PBF PT. Enseval Putera Megatrading"
    }
  ]);

  // Cashier Shift Reconciliation Records (cashier_shifts)
  let shiftRecords = $state<CashierShiftRecord[]>([
    {
      id: "shf-001",
      shiftCode: "SFT-20251028-01",
      branchId: "1",
      branchName: "Apotek Hafidz Farma Pusat",
      cashierName: "Nida Farida",
      shiftLabel: "Shift Pagi (07:00 - 15:00)",
      startTime: "2025-10-28 07:00",
      endTime: "-",
      initialCash: 500000,
      expectedCash: 3470000,
      actualCash: 0,
      cashDifference: 0,
      totalNonCash: 1480000,
      totalSales: 4450000,
      isOpen: true,
      notes: "Shift sedang berlangsung"
    },
    {
      id: "shf-002",
      shiftCode: "SFT-20251027-02",
      branchId: "1",
      branchName: "Apotek Hafidz Farma Pusat",
      cashierName: "Darajat Rahmatulloh",
      shiftLabel: "Shift Siang (15:00 - 22:00)",
      startTime: "2025-10-27 15:00",
      endTime: "2025-10-27 22:05",
      initialCash: 500000,
      expectedCash: 2890000,
      actualCash: 2890000,
      cashDifference: 0,
      totalNonCash: 1120000,
      totalSales: 3510000,
      isOpen: false,
      notes: "Setoran tunai & struk EDC klop"
    },
    {
      id: "shf-003",
      shiftCode: "SFT-20251027-01",
      branchId: "2",
      branchName: "Apotek Hafidz Farma 2",
      cashierName: "Cantika Nur Gustiani",
      shiftLabel: "Shift Pagi (07:00 - 15:00)",
      startTime: "2025-10-27 07:00",
      endTime: "2025-10-27 15:10",
      initialCash: 400000,
      expectedCash: 2150000,
      actualCash: 2148000,
      cashDifference: -2000,
      totalNonCash: 860000,
      totalSales: 2610000,
      isOpen: false,
      notes: "Selisih kurang Rp 2.000 pembulatan kembalian receh"
    }
  ]);

  // Form Catat Mutasi Kas Kecil State
  let expenseForm = $state({
    branchId: authStore.user?.branchId || "1",
    type: "OUT" as "IN" | "OUT",
    category: "Perlengkapan Apotek",
    account: "KAS_LACI" as "KAS_LACI" | "KAS_BRANKAS" | "BANK_BCA",
    amount: 50000,
    operator: "Erwin Noval Mufid",
    description: ""
  });

  onMount(async () => {
    if (authStore.user?.branchId) {
      selectedBranchId = authStore.user.branchId;
      expenseForm.branchId = authStore.user.branchId;
    }
    try {
      await mockApi.ensureDataLoaded();
      const [bList, shiftRes, cfRes] = await Promise.all([
        mockApi.getBranches(),
        api.shift.list(),
        api.finance.getCashflow()
      ]);
      if (bList.length > 0) {
        branches = bList;
        if (!authStore.user?.branchId && bList[0]?.id) {
          selectedBranchId = bList[0].id;
          expenseForm.branchId = bList[0].id;
        }
      }

      if (shiftRes?.success && Array.isArray(shiftRes.data) && shiftRes.data.length > 0) {
        shiftRecords = shiftRes.data;
      }
      if (cfRes?.success && cfRes.data) {
        const d = cfRes.data;
        if (d.kasLaci) payoutAmount = d.kasLaci;
        if (Array.isArray(d.entries) && d.entries.length > 0) {
          cashEntries = d.entries.map((e: any) => ({
            id: e.id,
            branchId: "1",
            branchName: "Apotek Hafidz Farma Pusat",
            time: `${e.date} ${e.time}`,
            type: e.type,
            category: e.category,
            account: e.account,
            refNumber: `CF-${e.id}`,
            amount: e.amount,
            balance: 5000000,
            operator: "Sistem Keuangan",
            description: e.description
          }));
        }
      }
    } catch (_) {}
  });

  function formatRupiah(num: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(num);
  }

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
  let currentBalance = $derived(branchCashEntries[0]?.balance || 4850000);

  function handleSaveExpense() {
    if (!expenseForm.amount || expenseForm.amount <= 0) return;
    const branchObj =
      branches.find((b) => b.id === expenseForm.branchId) || branches[0];
    const amt = Number(expenseForm.amount);
    const nextBalance =
      expenseForm.type === "IN" ? currentBalance + amt : currentBalance - amt;
    const prefix = expenseForm.type === "IN" ? "KSM" : "BOP";

    const newEntry: CashLedgerEntry = {
      id: `csh-${Date.now()}`,
      branchId: expenseForm.branchId,
      branchName: branchObj?.name || "Apotek Hafidz Farma Pusat",
      time: "2025-10-28 11:30",
      type: expenseForm.type,
      category: expenseForm.category,
      account: expenseForm.account,
      refNumber: `${prefix}-1028-${String(cashEntries.length + 1).padStart(2, "0")}`,
      amount: amt,
      balance: nextBalance,
      operator: expenseForm.operator,
      description:
        expenseForm.description.trim() ||
        `${expenseForm.category} (${expenseForm.account})`
    };

    cashEntries = [newEntry, ...cashEntries];
    expenseForm.description = "";
    isAddExpenseModalOpen = false;
  }

  function handlePayoutSubmit() {
    if (payoutAmount <= 0) return;
    const amount = payoutAmount;
    qrisBalance = Math.max(0, qrisBalance - amount);

    cashEntries = [
      {
        id: `csh-${Date.now()}`,
        branchId: "1",
        branchName: "Apotek Hafidz Farma Pusat",
        time: "2025-10-28 11:40",
        type: "IN",
        category: "Settlement QRIS",
        account: "BANK_BCA",
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
    }, 1500);
  }

  function openCloseShiftModal(shift: CashierShiftRecord) {
    selectedShiftForClose = shift;
    actualCountedCashInput = shift.expectedCash;
    closeShiftNotes = "Setoran fisik laci kasir sesuai";
    isCloseShiftModalOpen = true;
  }

  async function handleConfirmCloseShift() {
    if (!selectedShiftForClose) return;
    const diff = Number(actualCountedCashInput) - selectedShiftForClose.expectedCash;

    try {
      await api.shift.close({
        shiftId: selectedShiftForClose.id,
        actualCash: Number(actualCountedCashInput),
        notes: closeShiftNotes
      });

      const res = await api.shift.list();
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        shiftRecords = res.data;
      }
    } catch (_) {
      shiftRecords = shiftRecords.map((s) =>
        s.id === selectedShiftForClose?.id
          ? {
              ...s,
              endTime: new Date().toISOString().replace("T", " ").substring(0, 16),
              actualCash: Number(actualCountedCashInput),
              cashDifference: diff,
              isOpen: false,
              notes: closeShiftNotes
            }
          : s
      );
    }

    cashEntries = [
      {
        id: `csh-${Date.now()}`,
        branchId: selectedShiftForClose.branchId,
        branchName: selectedShiftForClose.branchName,
        time: new Date().toISOString().replace("T", " ").substring(0, 16),
        type: "IN",
        category: "Setoran Shift",
        account: "KAS_BRANKAS",
        refNumber: selectedShiftForClose.shiftCode,
        amount: Number(actualCountedCashInput),
        balance: currentBalance + Number(actualCountedCashInput),
        operator: selectedShiftForClose.cashierName,
        description: `Setoran tutup ${selectedShiftForClose.shiftLabel}`
      },
      ...cashEntries
    ];

    isCloseShiftModalOpen = false;
    selectedShiftForClose = null;
  }
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
      <!-- Branch selector (for Superadmin/Owner) or locked badge (for Staff) -->
      {#if authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"}
        <div class="w-56">
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

      <button
        type="button"
        onclick={() => (isAddExpenseModalOpen = true)}
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
      >
        <Plus class="w-4 h-4" />
        <span>Catat Mutasi Kas Kecil</span>
      </button>
    {/snippet}
  </PageHeader>

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Saldo Kas & Bank"
      value={formatRupiah(currentBalance)}
      subtext="Kas laci, brankas & rekening"
      icon={Wallet}
      variant="brand"
    />
    <MetricCard
      title="Total Kas Masuk (IN)"
      value={formatRupiah(totalCashIn)}
      subtext="{branchCashEntries.filter((e) => e.type === 'IN').length} Mutasi penerimaan"
      icon={ArrowUpRight}
      variant="success"
    />
    <MetricCard
      title="Total Kas Keluar (OUT)"
      value={formatRupiah(totalCashOut)}
      subtext="{branchCashEntries.filter((e) => e.type === 'OUT').length} Beban & pembayaran"
      icon={ArrowDownLeft}
      variant="warning"
    />
    <MetricCard
      title="Arus Kas Bersih (Net)"
      value={formatRupiah(totalCashIn - totalCashOut)}
      subtext="Selisih kas masuk vs keluar"
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

  <!-- TAB NAVIGATION -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold">
    <button
      type="button"
      onclick={() => (activeTab = "buku_kas")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'buku_kas' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Buku Kas & Mutasi Harian ({branchCashEntries.length})</span>
      {#if activeTab === "buku_kas"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "rekonsiliasi_shift")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'rekonsiliasi_shift' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
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
      searchPlaceholder="Cari keterangan, nomor referensi, atau kategori..."
      bind:searchValue={searchQuery}
      totalCount={filteredCashEntries.length}
    >
      {#snippet filters()}
        <div class="w-44 shrink-0">
          <Select
            value={ledgerTypeFilter}
            onchange={(val) => (ledgerTypeFilter = val as typeof ledgerTypeFilter)}
            options={[
              { value: "ALL", label: "Semua Arus Kas" },
              { value: "IN", label: "Kas Masuk (IN)" },
              { value: "OUT", label: "Kas Keluar (OUT)" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <th class="py-3 px-4">Waktu</th>
        <th class="py-3 px-4">Referensi</th>
        <th class="py-3 px-4">Kategori & Akun</th>
        <th class="py-3 px-4">Keterangan Transaksi</th>
        <th class="py-3 px-4 text-right">Masuk (IN)</th>
        <th class="py-3 px-4 text-right">Keluar (OUT)</th>
        <th class="py-3 px-4 text-right">Saldo</th>
        <th class="py-3 px-4 text-center">Petugas</th>
      {/snippet}

      {#snippet rows()}
        {#each filteredCashEntries as entry}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
              {entry.time}
              <div class="font-sans text-[10px] text-slate-400">{entry.branchName}</div>
            </td>
            <td class="py-3.5 px-4 font-mono font-bold text-brand-blue">{entry.refNumber}</td>
            <td class="py-3.5 px-4">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold {entry.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-brand-red-700'}">
                {entry.category}
              </span>
              <div class="text-[10px] font-mono text-slate-400 mt-0.5">{entry.account}</div>
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

  <!-- TAB 2: REKONSILIASI & TUTUP SHIFT KASIR -->
  {:else if activeTab === "rekonsiliasi_shift"}
    <DataTable
      title="Daftar Rekonsiliasi Kasir & Setoran Laci per Shift"
      searchPlaceholder="Cari kode shift, nama kasir, atau jadwal..."
      bind:searchValue={shiftSearchQuery}
      totalCount={filteredShiftRecords.length}
    >
      {#snippet filters()}
        <div class="w-44 shrink-0">
          <Select
            value={shiftStatusFilter}
            onchange={(val) => (shiftStatusFilter = val as typeof shiftStatusFilter)}
            options={[
              { value: "ALL", label: "Semua Shift" },
              { value: "OPEN", label: "Shift Aktif" },
              { value: "CLOSED", label: "Sudah Ditutup" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <th class="py-3 px-4">Kode & Jadwal Shift</th>
        <th class="py-3 px-4">Kasir & Cabang</th>
        <th class="py-3 px-4 text-right">Modal Awal</th>
        <th class="py-3 px-4 text-right">Tunai Sistem</th>
        <th class="py-3 px-4 text-right">Tunai Fisik</th>
        <th class="py-3 px-4 text-right">Non-Tunai</th>
        <th class="py-3 px-4 text-center">Selisih Kas</th>
        <th class="py-3 px-4 text-center">Status & Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#each filteredShiftRecords as s}
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
        </div>

        <div class="col-span-2">
          <label for="exp-cat" class="font-bold text-slate-700 block mb-1">Kategori Transaksi</label>
          <Select
            id="exp-cat"
            value={expenseForm.category}
            onchange={(val) => (expenseForm.category = val)}
            options={[
              "Perlengkapan Apotek",
              "Kebersihan & Sanitasi",
              "Listrik, Air & Internet",
              "Biaya Angkut / Ekspedisi",
              "Konsumsi Staf & Lembur",
              "Modal Kasir Tambahan"
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
          {#if authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"}
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
          class="px-4 py-2 rounded-xl bg-brand-red-600 hover:bg-brand-red-700 text-white font-bold text-xs shadow-sm"
        >
          Simpan ke Buku Kas
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
          <div class="mt-1 font-mono text-[11px] {actualCountedCashInput - selectedShiftForClose.expectedCash === 0 ? 'text-emerald-600' : 'text-brand-red-600'} font-bold">
            Selisih: {formatRupiah(actualCountedCashInput - selectedShiftForClose.expectedCash)}
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
          class="px-4 py-1.5 rounded-xl bg-brand-red-600 hover:bg-brand-red-700 text-white font-bold"
        >
          Konfirmasi Tutup Shift
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
