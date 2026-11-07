<script lang="ts">
  import { onMount } from "svelte";
  import {
    RotateCcw,
    Plus,
    ShoppingCart,
    ShoppingBag,
    CheckCircle2,
    AlertCircle,
    Printer,
    Eye,
    Check,
    Store,
    X
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
  import { portal } from "$lib/actions/portal";
  import { api } from "$lib/services/api";
  import { mockApi } from "$lib/services/mock-api";
  import { authStore } from "$lib/stores/authStore.svelte";

  interface CustomerReturnRecord {
    id: string;
    returnNumber: string;
    branchId: string;
    branchName: string;
    originalTrx: string;
    customerName: string;
    date: string;
    productName: string;
    batchNo: string;
    qty: number;
    unit: string;
    refundAmount: number;
    stockDisposition: "LAYAK_JUAL" | "KARANTINA";
    compensationType: "REFUND_TUNAI" | "TUKAR_BARANG";
    reason: string;
    status: "PENDING" | "APPROVED";
    cashier: string;
  }

  interface SupplierReturnRecord {
    id: string;
    returnNumber: string;
    branchId: string;
    branchName: string;
    invoiceRef: string;
    supplierName: string;
    date: string;
    productName: string;
    batchNo: string;
    qty: number;
    unit: string;
    totalValue: number;
    settlementType: "NOTA_KREDIT" | "TUKAR_BATCH";
    creditNoteNo?: string;
    reason: string;
    status: "QUARANTINED" | "SENT_TO_SUPPLIER" | "RESOLVED";
    pic: string;
  }

  // Master Data
  let branches = $state<any[]>([]);
  let products = $state<any[]>([]);
  let suppliers = $state<any[]>([]);
  let customers = $state<any[]>([]);
  let purchaseInvoices = $state<any[]>([]);

  // Filter & Tab State
  let selectedBranchId = $state(authStore.user?.branchId || "1");
  let activeTab = $state<"penjualan" | "pembelian">("penjualan");
  let salesReturnStatusFilter = $state<"ALL" | "PENDING" | "APPROVED">("ALL");
  let purchaseReturnStatusFilter = $state<
    "ALL" | "QUARANTINED" | "SENT_TO_SUPPLIER" | "RESOLVED"
  >("ALL");
  let searchQuery = $state("");
  let pbfSearchQuery = $state("");

  // Modals State
  let isAddReturModalOpen = $state(false);
  let isDetailModalOpen = $state(false);
  let selectedDetailType = $state<"PENJUALAN" | "PEMBELIAN">("PENJUALAN");
  let selectedCustomerReturn = $state<CustomerReturnRecord | null>(null);
  let selectedSupplierReturn = $state<SupplierReturnRecord | null>(null);

  let isResolvePbfModalOpen = $state(false);
  let resolveCreditNoteNo = $state("");
  let resolveSettlementType = $state<"NOTA_KREDIT" | "TUKAR_BATCH">("NOTA_KREDIT");

  let customerReturns = $state<CustomerReturnRecord[]>([]);
  let supplierReturns = $state<SupplierReturnRecord[]>([]);

  // Form Input Retur Baru State
  let newReturForm = $state({
    returCategory: "PENJUALAN" as "PENJUALAN" | "PEMBELIAN",
    branchId: authStore.user?.branchId || "1",
    referenceNo: "PJ-1025-0319",
    customerName: "Pelanggan Umum (Walk-in)",
    supplierName: "PT. Kimia Farma Trading & Distribution",
    productId: "",
    productName: "Amoxicillin 500mg (Errata)",
    batchNo: "AMX24H01",
    qty: 1,
    unit: "STRIP",
    unitPrice: 8500,
    stockDisposition: "KARANTINA" as "LAYAK_JUAL" | "KARANTINA",
    compensationType: "REFUND_TUNAI" as "REFUND_TUNAI" | "TUKAR_BARANG",
    settlementType: "NOTA_KREDIT" as "NOTA_KREDIT" | "TUKAR_BATCH",
    reason: ""
  });

  onMount(async () => {
    if (authStore.user?.branchId) {
      selectedBranchId = authStore.user.branchId;
      newReturForm.branchId = authStore.user.branchId;
    }
    try {
      await mockApi.ensureDataLoaded();
      const [prods, custs, branchList, suppRes, custRetRes, suppRetRes] =
        await Promise.all([
          mockApi.getProducts(),
          mockApi.getCustomers(),
          mockApi.getBranches(),
          api.erp.getSuppliers(),
          api.returns.getCustomerReturns(),
          api.returns.getSupplierReturns()
        ]);

      if (prods.length > 0) products = prods;
      if (custs.length > 0) customers = custs;
      if (branchList.length > 0) {
        branches = branchList;
        if (!authStore.user?.branchId && branchList[0]?.id) {
          selectedBranchId = branchList[0].id;
          newReturForm.branchId = branchList[0].id;
        }
      }
      if (suppRes?.success && Array.isArray(suppRes.data) && suppRes.data.length > 0) {
        suppliers = suppRes.data;
      }
      if (custRetRes?.success && Array.isArray(custRetRes.data) && custRetRes.data.length > 0) {
        customerReturns = custRetRes.data;
      }
      if (suppRetRes?.success && Array.isArray(suppRetRes.data) && suppRetRes.data.length > 0) {
        supplierReturns = suppRetRes.data;
      }
    } catch (e) {
      console.warn("Retur onMount API error:", e);
    }
  });

  function formatRupiah(num: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(num);
  }

  // Branch-filtered arrays
  let branchCustomerReturns = $derived(
    customerReturns.filter(
      (r) => selectedBranchId === "ALL" || r.branchId === selectedBranchId
    )
  );

  let branchSupplierReturns = $derived(
    supplierReturns.filter(
      (r) => selectedBranchId === "ALL" || r.branchId === selectedBranchId
    )
  );

  // Table-filtered arrays
  let filteredCustomerReturns = $derived(
    branchCustomerReturns.filter((r) => {
      const matchStatus =
        salesReturnStatusFilter === "ALL" || r.status === salesReturnStatusFilter;
      const q = searchQuery.toLowerCase();
      const matchSearch =
        r.returnNumber.toLowerCase().includes(q) ||
        r.originalTrx.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    })
  );

  let filteredSupplierReturns = $derived(
    branchSupplierReturns.filter((r) => {
      const matchStatus =
        purchaseReturnStatusFilter === "ALL" ||
        r.status === purchaseReturnStatusFilter;
      const q = pbfSearchQuery.toLowerCase();
      const matchSearch =
        r.returnNumber.toLowerCase().includes(q) ||
        r.invoiceRef.toLowerCase().includes(q) ||
        r.supplierName.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    })
  );

  // Reactive Metrics
  let totalCustomerRefunds = $derived(
    branchCustomerReturns.reduce((a, b) => a + b.refundAmount, 0)
  );
  let totalSupplierCredit = $derived(
    branchSupplierReturns.reduce((a, b) => a + b.totalValue, 0)
  );
  let activePbfClaimsCount = $derived(
    branchSupplierReturns.filter((r) => r.status !== "RESOLVED").length
  );
  let quarantinedItemsCount = $derived(
    branchCustomerReturns.filter((r) => r.stockDisposition === "KARANTINA").length +
      branchSupplierReturns.filter((r) => r.status !== "RESOLVED").length
  );

  let newReturCalculatedTotal = $derived(
    (Number(newReturForm.qty) || 0) * (Number(newReturForm.unitPrice) || 0)
  );

  function handleProductChange(prodName: string) {
    newReturForm.productName = prodName;
    const found = products.find((p) => p.name === prodName);
    if (found) {
      newReturForm.productId = found.id;
      newReturForm.batchNo = found.batches?.[0]?.batchNumber || "BATCH-01";
      if (newReturForm.returCategory === "PENJUALAN") {
        newReturForm.unit = found.units?.[1]?.unit || found.baseUnit || "STRIP";
        newReturForm.unitPrice =
          found.units?.[1]?.prices?.general ??
          found.units?.[0]?.prices?.general ??
          10000;
      } else {
        newReturForm.unit = found.units?.[2]?.unit || "BOX";
        newReturForm.unitPrice =
          (found.batches?.[0]?.buyPrice || 800) *
          (found.units?.[2]?.multiplier || 100);
      }
    }
  }

  async function handleSaveNewRetur() {
    const branchObj =
      branches.find((b) => b.id === newReturForm.branchId) || branches[0];
    const nowStr = new Date().toISOString().replace("T", " ").slice(0, 16);

    if (newReturForm.returCategory === "PENJUALAN") {
      const nextNo = String(customerReturns.length + 1).padStart(3, "0");
      let created: CustomerReturnRecord = {
        id: `ret-cust-${Date.now()}`,
        returnNumber: `RET-JL-2025-${nextNo}`,
        branchId: newReturForm.branchId,
        branchName: branchObj?.name || "Apotek Hafidz Farma Pusat",
        originalTrx: newReturForm.referenceNo || "PJ-1025-0320",
        customerName: newReturForm.customerName,
        date: nowStr,
        productName: newReturForm.productName,
        batchNo: newReturForm.batchNo,
        qty: Number(newReturForm.qty) || 1,
        unit: newReturForm.unit,
        refundAmount: newReturCalculatedTotal,
        stockDisposition: newReturForm.stockDisposition,
        compensationType: newReturForm.compensationType,
        reason: newReturForm.reason.trim() || "Retur pelanggan terverifikasi",
        status: "APPROVED",
        cashier: "apt. Hafidz Nurul"
      };

      try {
        const res = await api.returns.createCustomerReturn({
          branchId: newReturForm.branchId,
          customerName: newReturForm.customerName,
          originalTrx: newReturForm.referenceNo,
          productId: newReturForm.productId || undefined,
          productName: newReturForm.productName,
          batchNo: newReturForm.batchNo,
          qty: Number(newReturForm.qty) || 1,
          unit: newReturForm.unit,
          refundAmount: newReturCalculatedTotal,
          stockDisposition: newReturForm.stockDisposition,
          compensationType: newReturForm.compensationType,
          reason: newReturForm.reason.trim() || "Retur pelanggan terverifikasi",
          cashier: "apt. Hafidz Nurul"
        });
        if (res?.success && res.data) {
          created = {
            ...created,
            id: res.data.id,
            returnNumber: res.data.returnNumber
          };
        }
      } catch (err) {
        console.warn("Could not save customer return via API, using fallback", err);
      }

      customerReturns = [created, ...customerReturns];
      activeTab = "penjualan";
    } else {
      const nextNo = String(supplierReturns.length + 1).padStart(3, "0");
      let created: SupplierReturnRecord = {
        id: `ret-sup-${Date.now()}`,
        returnNumber: `RET-BL-2025-${nextNo}`,
        branchId: newReturForm.branchId,
        branchName: branchObj?.name || "Apotek Hafidz Farma Pusat",
        invoiceRef: newReturForm.referenceNo || "FP-KF-2025-0891",
        supplierName: newReturForm.supplierName,
        date: nowStr,
        productName: newReturForm.productName,
        batchNo: newReturForm.batchNo,
        qty: Number(newReturForm.qty) || 1,
        unit: newReturForm.unit,
        totalValue: newReturCalculatedTotal,
        settlementType: newReturForm.settlementType,
        reason: newReturForm.reason.trim() || "Klaim retur barang ke PBF",
        status: "SENT_TO_SUPPLIER",
        pic: "apt. Hafidz Nurul"
      };

      try {
        const res = await api.returns.createSupplierReturn({
          branchId: newReturForm.branchId,
          supplierName: newReturForm.supplierName,
          invoiceRef: newReturForm.referenceNo,
          productId: newReturForm.productId || undefined,
          productName: newReturForm.productName,
          batchNo: newReturForm.batchNo,
          qty: Number(newReturForm.qty) || 1,
          unit: newReturForm.unit,
          totalValue: newReturCalculatedTotal,
          settlementType: newReturForm.settlementType,
          reason: newReturForm.reason.trim() || "Klaim retur barang ke PBF",
          pic: "apt. Hafidz Nurul"
        });
        if (res?.success && res.data) {
          created = {
            ...created,
            id: res.data.id,
            returnNumber: res.data.returnNumber
          };
        }
      } catch (err) {
        console.warn("Could not save supplier return via API, using fallback", err);
      }

      supplierReturns = [created, ...supplierReturns];
      activeTab = "pembelian";
    }

    newReturForm.reason = "";
    isAddReturModalOpen = false;
  }

  function approveCustomerReturn(id: string) {
    customerReturns = customerReturns.map((r) =>
      r.id === id ? { ...r, status: "APPROVED" } : r
    );
  }

  function openResolveSupplierReturn(r: SupplierReturnRecord) {
    selectedSupplierReturn = r;
    resolveSettlementType = r.settlementType;
    resolveCreditNoteNo = `CN-${r.returnNumber.slice(-3)}-${Math.floor(100 + Math.random() * 900)}`;
    isResolvePbfModalOpen = true;
  }

  async function handleConfirmResolvePbf() {
    if (!selectedSupplierReturn) return;
    try {
      await api.returns.resolveSupplierReturn(selectedSupplierReturn.id, {
        settlementType: resolveSettlementType,
        creditNoteNo: resolveCreditNoteNo
      });
    } catch (err) {
      console.warn("Could not resolve supplier return via API, using fallback", err);
    }

    supplierReturns = supplierReturns.map((r) =>
      r.id === selectedSupplierReturn?.id
        ? {
            ...r,
            status: "RESOLVED",
            settlementType: resolveSettlementType,
            creditNoteNo: resolveCreditNoteNo
          }
        : r
    );
    isResolvePbfModalOpen = false;
    selectedSupplierReturn = null;
  }
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
        onclick={() => {
          newReturForm.returCategory =
            activeTab === "pembelian" ? "PEMBELIAN" : "PENJUALAN";
          isAddReturModalOpen = true;
        }}
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
      subtext="{branchCustomerReturns.length} Transaksi dibatalkan/ditukar"
      icon={ShoppingCart}
      variant="warning"
    />
    <MetricCard
      title="Retur ke PBF"
      value={formatRupiah(totalSupplierCredit)}
      subtext="{branchSupplierReturns.length} Klaim pengurang hutang"
      icon={ShoppingBag}
      variant="brand"
    />
    <MetricCard
      title="Klaim PBF Aktif"
      value="{activePbfClaimsCount} Klaim PBF"
      subtext="Menunggu nota kredit / ganti batch"
      icon={AlertCircle}
      variant="danger"
    />
    <MetricCard
      title="Karantina Stok"
      value="{quarantinedItemsCount} Batch"
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
        <span class="px-2 py-0.5 rounded-full text-[10px] {activeTab === 'penjualan' ? 'bg-brand-blue-50 text-brand-blue-700' : 'bg-slate-100 text-slate-600'}">
          {branchCustomerReturns.length}
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
        <span class="px-2 py-0.5 rounded-full text-[10px] {activeTab === 'pembelian' ? 'bg-brand-blue-50 text-brand-blue-700' : 'bg-slate-100 text-slate-600'}">
          {branchSupplierReturns.length}
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
      searchPlaceholder="Cari nomor retur, struk, pelanggan, atau obat..."
      bind:searchValue={searchQuery}
      totalCount={filteredCustomerReturns.length}
    >
      {#snippet filters()}
        <div class="w-44 shrink-0">
          <Select
            value={salesReturnStatusFilter}
            onchange={(val) => (salesReturnStatusFilter = val as typeof salesReturnStatusFilter)}
            options={[
              { value: "ALL", label: "Semua Status" },
              { value: "PENDING", label: "Menunggu" },
              { value: "APPROVED", label: "Disetujui" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <th class="py-3 px-4">No. Retur</th>
        <th class="py-3 px-4">No. Struk</th>
        <th class="py-3 px-4">Pelanggan</th>
        <th class="py-3 px-4">Produk & Perlakuan Stok</th>
        <th class="py-3 px-4">Alasan Retur</th>
        <th class="py-3 px-4 text-right">Pengembalian</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if filteredCustomerReturns.length === 0}
          <tr>
            <td colspan="8" class="text-center py-12 text-slate-400">
              <ShoppingBag class="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p class="font-medium text-sm">Belum ada riwayat retur penjualan</p>
              <p class="text-xs text-slate-400">Retur dari pelanggan akan otomatis tercatat dan dapat diproses di sini.</p>
            </td>
          </tr>
        {:else}
          {#each filteredCustomerReturns as r}
            <tr class="hover:bg-blue-50/40 transition-colors">
              <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
                {r.returnNumber}
                <div class="text-[10px] text-slate-400 font-normal">{r.date}</div>
              </td>
              <td class="py-3.5 px-4 font-mono text-brand-blue font-semibold">
                {r.originalTrx}
                <div class="text-[10px] text-slate-400 font-sans font-normal">{r.branchName}</div>
              </td>
              <td class="py-3.5 px-4 font-bold text-slate-800">{r.customerName}</td>
              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-800">{r.productName} ({r.qty} {r.unit})</div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="font-mono text-[10px] text-slate-500">Batch: {r.batchNo}</span>
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-bold {r.stockDisposition === 'LAYAK_JUAL' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                    {r.stockDisposition === "LAYAK_JUAL" ? "Stok Layak Jual" : "Rak Karantina"}
                  </span>
                </div>
              </td>
              <td class="py-3.5 px-4 text-slate-500 text-[11px] max-w-xs">{r.reason}</td>
              <td class="py-3.5 px-4 text-right">
                <div class="font-mono font-black text-brand-red-600">{formatRupiah(r.refundAmount)}</div>
                <div class="text-[10px] text-slate-400 font-semibold">
                  {r.compensationType === "REFUND_TUNAI" ? "Refund Tunai" : "Tukar Barang"}
                </div>
              </td>
              <td class="py-3.5 px-4 text-center">
                {#if r.status === "APPROVED"}
                  <Badge type="SUCCESS" label="DISETUJUI" />
                {:else}
                  <Badge type="WARNING" label="MENUNGGU" />
                {/if}
              </td>
              <td class="py-3.5 px-4 text-center">
                <div class="flex items-center justify-center gap-1.5">
                  {#if r.status === "PENDING"}
                    <button
                      type="button"
                      onclick={() => approveCustomerReturn(r.id)}
                      class="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1"
                      title="Setujui Retur Pelanggan"
                    >
                      <Check class="w-3 h-3" />
                      <span>Setujui</span>
                    </button>
                  {/if}
                  <button
                    type="button"
                    onclick={() => {
                      selectedDetailType = "PENJUALAN";
                      selectedCustomerReturn = r;
                      isDetailModalOpen = true;
                    }}
                    class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-brand-blue"
                    title="Detail & Cetak Bukti Retur"
                  >
                    <Eye class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        {/if}
      {/snippet}
    </DataTable>

  <!-- TAB 2: RETUR PEMBELIAN KE PBF -->
  {:else if activeTab === "pembelian"}
    <DataTable
      title="Daftar Retur Pembelian ke Distributor PBF"
      searchPlaceholder="Cari nomor retur, faktur PBF, distributor, atau obat..."
      bind:searchValue={pbfSearchQuery}
      totalCount={filteredSupplierReturns.length}
    >
      {#snippet filters()}
        <div class="w-44 shrink-0">
          <Select
            value={purchaseReturnStatusFilter}
            onchange={(val) =>
              (purchaseReturnStatusFilter = val as typeof purchaseReturnStatusFilter)}
            options={[
              { value: "ALL", label: "Semua Status" },
              { value: "QUARANTINED", label: "Karantina" },
              { value: "SENT_TO_SUPPLIER", label: "Dikirim ke PBF" },
              { value: "RESOLVED", label: "Selesai (CN)" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <th class="py-3 px-4">Retur Beli</th>
        <th class="py-3 px-4">Faktur PBF</th>
        <th class="py-3 px-4">Distributor</th>
        <th class="py-3 px-4">Produk & Batch</th>
        <th class="py-3 px-4">Alasan Klaim</th>
        <th class="py-3 px-4 text-right">Nilai Klaim</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if filteredSupplierReturns.length === 0}
          <tr>
            <td colspan="8" class="text-center py-12 text-slate-400">
              <RotateCcw class="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p class="font-medium text-sm">Belum ada klaim retur pembelian ke PBF</p>
              <p class="text-xs text-slate-400">Klaim barang rusak atau near-ED ke distributor dapat dicatat menggunakan tombol "Buat Retur Baru".</p>
            </td>
          </tr>
        {:else}
          {#each filteredSupplierReturns as r}
            <tr class="hover:bg-blue-50/40 transition-colors">
              <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
                {r.returnNumber}
                <div class="text-[10px] text-slate-400 font-normal">{r.date}</div>
              </td>
              <td class="py-3.5 px-4 font-mono text-brand-blue font-semibold">
                {r.invoiceRef}
                {#if r.creditNoteNo}
                  <div class="text-[10px] text-emerald-700 font-bold">CN: {r.creditNoteNo}</div>
                {/if}
              </td>
              <td class="py-3.5 px-4 font-bold text-slate-800">{r.supplierName}</td>
              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-800">{r.productName} ({r.qty} {r.unit})</div>
                <div class="text-[10px] font-mono text-slate-500">Batch: {r.batchNo}</div>
              </td>
              <td class="py-3.5 px-4 text-slate-500 text-[11px] max-w-xs">{r.reason}</td>
              <td class="py-3.5 px-4 text-right">
                <div class="font-mono font-black text-brand-blue">{formatRupiah(r.totalValue)}</div>
                <div class="text-[10px] text-slate-400 font-semibold">
                  {r.settlementType === "NOTA_KREDIT" ? "Potong Hutang (CN)" : "Tukar Batch Baru"}
                </div>
              </td>
              <td class="py-3.5 px-4 text-center">
                {#if r.status === "RESOLVED"}
                  <Badge type="SUCCESS" label="SELESAI (CN)" />
                {:else if r.status === "SENT_TO_SUPPLIER"}
                  <Badge type="WARNING" label="DIKIRIM KE PBF" />
                {:else}
                  <Badge type="INFO" label="KARANTINA" />
                {/if}
              </td>
              <td class="py-3.5 px-4 text-center">
                <div class="flex items-center justify-center gap-1.5">
                  {#if r.status !== "RESOLVED"}
                    <button
                      type="button"
                      onclick={() => openResolveSupplierReturn(r)}
                      class="px-2.5 py-1 rounded-lg bg-brand-blue-50 hover:bg-brand-blue-100 text-brand-blue-700 text-[11px] font-bold transition-colors"
                      title="Terima Nota Kredit / Penggantian Batch dari PBF"
                    >
                      Terima CN
                    </button>
                  {/if}
                  <button
                    type="button"
                    onclick={() => {
                      selectedDetailType = "PEMBELIAN";
                      selectedSupplierReturn = r;
                      isDetailModalOpen = true;
                    }}
                    class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-brand-blue"
                    title="Detail & Cetak Nota Retur PBF"
                  >
                    <Eye class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        {/if}
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
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] overflow-y-auto">
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

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label for="ret-type" class="font-bold text-slate-700 block mb-1">Jenis Retur</label>
          <Select
            id="ret-type"
            value={newReturForm.returCategory}
            onchange={(val) => {
              newReturForm.returCategory = val as "PENJUALAN" | "PEMBELIAN";
              newReturForm.referenceNo =
                val === "PENJUALAN" ? "PJ-1025-0319" : "FP-KF-2025-0891";
              handleProductChange(newReturForm.productName);
            }}
            options={[
              { value: "PENJUALAN", label: "Retur Penjualan (Dari Pelanggan)" },
              { value: "PEMBELIAN", label: "Retur Pembelian (Ke PBF)" }
            ]}
          />
        </div>

        <div>
          {#if authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"}
            <label for="ret-branch" class="font-bold text-slate-700 block mb-1">Cabang Apotek</label>
            <Select
              id="ret-branch"
              value={newReturForm.branchId}
              onchange={(val) => (newReturForm.branchId = val)}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          {:else}
            <span class="font-bold text-slate-700 block mb-1">Cabang Apotek</span>
            <div class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-2">
              <Store class="w-4 h-4 text-brand-blue" />
              <span>{authStore.user?.branchName || branches.find((b) => b.id === newReturForm.branchId)?.name || "Cabang Utama"}</span>
            </div>
          {/if}
        </div>

        {#if newReturForm.returCategory === "PENJUALAN"}
          <div>
            <label for="ret-ref-jl" class="font-bold text-slate-700 block mb-1">No. Struk Kasir Referensi</label>
            <input
              id="ret-ref-jl"
              type="text"
              bind:value={newReturForm.referenceNo}
              placeholder="PJ-1025-..."
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
            />
          </div>
          <div>
            <label for="ret-cust" class="font-bold text-slate-700 block mb-1">Pelanggan / Pasien</label>
            <SearchableSelect
              id="ret-cust"
              value={newReturForm.customerName}
              onchange={(val) => (newReturForm.customerName = val)}
              searchPlaceholder="Cari pelanggan..."
              options={customers.map((c) => ({
                value: c.name,
                label: c.name,
                sublabel: c.code
              }))}
            />
          </div>
        {:else}
          <div>
            <label for="ret-ref-bl" class="font-bold text-slate-700 block mb-1">No. Faktur PBF Referensi</label>
            <Select
              id="ret-ref-bl"
              value={newReturForm.referenceNo}
              onchange={(val) => {
                newReturForm.referenceNo = val;
                const inv = purchaseInvoices.find((i) => i.invoiceNumber === val);
                if (inv) newReturForm.supplierName = inv.supplierName;
              }}
              options={purchaseInvoices.map((inv) => ({
                value: inv.invoiceNumber,
                label: `${inv.invoiceNumber} (${inv.supplierName})`
              }))}
            />
          </div>
          <div>
            <label for="ret-sup" class="font-bold text-slate-700 block mb-1">Distributor PBF</label>
            <SearchableSelect
              id="ret-sup"
              value={newReturForm.supplierName}
              onchange={(val) => (newReturForm.supplierName = val)}
              searchPlaceholder="Cari distributor PBF..."
              options={suppliers.map((s) => ({
                value: s.name,
                label: s.name,
                sublabel: s.code
              }))}
            />
          </div>
        {/if}

        <div class="col-span-2">
          <label for="ret-prod" class="font-bold text-slate-700 block mb-1">Produk Obat Diretur</label>
          <SearchableSelect
            id="ret-prod"
            value={newReturForm.productName}
            onchange={handleProductChange}
            searchPlaceholder="Cari nama obat..."
            options={products.map((p) => ({
              value: p.name,
              label: p.name,
              sublabel: `SKU: ${p.sku}`
            }))}
          />
        </div>

        <div>
          <label for="ret-batch" class="font-bold text-slate-700 block mb-1">Nomor Batch</label>
          <input
            id="ret-batch"
            type="text"
            bind:value={newReturForm.batchNo}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono uppercase"
          />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label for="ret-qty" class="font-bold text-slate-700 block mb-1">Qty Retur</label>
            <input
              id="ret-qty"
              type="number"
              min="1"
              bind:value={newReturForm.qty}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-center"
            />
          </div>
          <div>
            <label for="ret-unit" class="font-bold text-slate-700 block mb-1">Satuan</label>
            <Select
              id="ret-unit"
              value={newReturForm.unit}
              onchange={(val) => (newReturForm.unit = val)}
              options={["TABLET", "STRIP", "BOX", "BOTOL"]}
            />
          </div>
        </div>

        <div>
          <label for="ret-price" class="font-bold text-slate-700 block mb-1">Nilai Satuan (Rp)</label>
          <input
            id="ret-price"
            type="number"
            bind:value={newReturForm.unitPrice}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
          />
        </div>

        {#if newReturForm.returCategory === "PENJUALAN"}
          <div>
            <label for="ret-disp" class="font-bold text-slate-700 block mb-1">Perlakuan Stok Fisik</label>
            <Select
              id="ret-disp"
              value={newReturForm.stockDisposition}
              onchange={(val) =>
                (newReturForm.stockDisposition = val as "LAYAK_JUAL" | "KARANTINA")}
              options={[
                { value: "LAYAK_JUAL", label: "Kembali ke Stok Layak Jual" },
                { value: "KARANTINA", label: "Pisahkan ke Rak Karantina" }
              ]}
            />
          </div>
          <div class="col-span-2">
            <label for="ret-comp" class="font-bold text-slate-700 block mb-1">Kompensasi ke Pelanggan</label>
            <Select
              id="ret-comp"
              value={newReturForm.compensationType}
              onchange={(val) =>
                (newReturForm.compensationType = val as "REFUND_TUNAI" | "TUKAR_BARANG")}
              options={[
                { value: "REFUND_TUNAI", label: "Refund Tunai (Kas Kasir)" },
                { value: "TUKAR_BARANG", label: "Tukar Barang / Replacement" }
              ]}
            />
          </div>
        {:else}
          <div>
            <label for="ret-settle" class="font-bold text-slate-700 block mb-1">Mekanisme Klaim PBF</label>
            <Select
              id="ret-settle"
              value={newReturForm.settlementType}
              onchange={(val) =>
                (newReturForm.settlementType = val as "NOTA_KREDIT" | "TUKAR_BATCH")}
              options={[
                { value: "NOTA_KREDIT", label: "Nota Kredit (Potong Hutang Faktur)" },
                { value: "TUKAR_BATCH", label: "Tukar Guling Batch Baru" }
              ]}
            />
          </div>
        {/if}

        <div class="col-span-2">
          <label for="ret-reason" class="font-bold text-slate-700 block mb-1">Alasan Pengembalian</label>
          <textarea
            id="ret-reason"
            rows="2"
            bind:value={newReturForm.reason}
            placeholder="Contoh: ED < 6 bulan / Kemasan blister cacat / Revisi resep dokter..."
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          ></textarea>
        </div>
      </div>

      <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
        <span class="text-slate-600 font-semibold">Total Nilai Retur:</span>
        <span class="font-mono font-black text-brand-red-600 text-sm">
          {formatRupiah(newReturCalculatedTotal)}
        </span>
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
          onclick={handleSaveNewRetur}
          class="px-4 py-2 rounded-xl bg-brand-red-600 hover:bg-brand-red-700 text-white font-bold text-xs shadow-sm"
        >
          Konfirmasi Retur
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL REKONSILIASI NOTA KREDIT (CN) PBF -->
{#if isResolvePbfModalOpen && selectedSupplierReturn}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isResolvePbfModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto text-xs">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="font-bold text-slate-900 flex items-center gap-2 text-sm">
          <CheckCircle2 class="w-5 h-5 text-emerald-600" />
          <span>Penyelesaian Klaim Retur PBF</span>
        </div>
        <button
          onclick={() => (isResolvePbfModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
        <div class="font-mono font-bold text-brand-blue">{selectedSupplierReturn.returnNumber} • Ref: {selectedSupplierReturn.invoiceRef}</div>
        <div class="font-bold text-slate-900">{selectedSupplierReturn.supplierName}</div>
        <div class="text-slate-600">{selectedSupplierReturn.productName} ({selectedSupplierReturn.qty} {selectedSupplierReturn.unit})</div>
        <div class="pt-2 border-t border-slate-200 flex justify-between font-bold">
          <span>Nilai Klaim:</span>
          <span class="font-mono text-brand-blue">{formatRupiah(selectedSupplierReturn.totalValue)}</span>
        </div>
      </div>

      <div class="space-y-3">
        <div>
          <label for="res-type" class="font-bold text-slate-700 block mb-1">Hasil Penyelesaian PBF</label>
          <Select
            id="res-type"
            value={resolveSettlementType}
            onchange={(val) => (resolveSettlementType = val as "NOTA_KREDIT" | "TUKAR_BATCH")}
            options={[
              { value: "NOTA_KREDIT", label: "Nota Kredit (Potong Tagihan Faktur)" },
              { value: "TUKAR_BATCH", label: "Tukar Guling Batch Baru Diterima" }
            ]}
          />
        </div>
        <div>
          <label for="res-cn" class="font-bold text-slate-700 block mb-1">No. Nota Kredit (CN) / Surat Jalan Pengganti</label>
          <input
            id="res-cn"
            type="text"
            bind:value={resolveCreditNoteNo}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
          />
        </div>
      </div>

      <div class="border-t border-slate-100 pt-3 flex justify-end gap-2">
        <button
          type="button"
          onclick={() => (isResolvePbfModalOpen = false)}
          class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleConfirmResolvePbf}
          class="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
        >
          Simpan & Selesaikan
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL DETAIL & CETAK NOTA RETUR -->
{#if isDetailModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isDetailModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto text-xs">
      {#if selectedDetailType === "PENJUALAN" && selectedCustomerReturn}
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <div class="font-mono font-bold text-brand-blue">{selectedCustomerReturn.returnNumber}</div>
            <div class="font-bold text-slate-900 text-sm">Bukti Retur Penjualan Kasir</div>
          </div>
          <button
            onclick={() => (isDetailModalOpen = false)}
            class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
            aria-label="Tutup"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <div class="flex justify-between">
            <span class="text-slate-500">Struk Referensi:</span>
            <strong class="font-mono">{selectedCustomerReturn.originalTrx}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Pelanggan:</span>
            <strong>{selectedCustomerReturn.customerName}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Produk & Batch:</span>
            <strong>{selectedCustomerReturn.productName} ({selectedCustomerReturn.batchNo})</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Perlakuan Stok:</span>
            <strong>{selectedCustomerReturn.stockDisposition === "LAYAK_JUAL" ? "Masuk Stok Layak Jual" : "Masuk Rak Karantina"}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Kompensasi:</span>
            <strong>{selectedCustomerReturn.compensationType === "REFUND_TUNAI" ? "Refund Tunai" : "Tukar Barang"}</strong>
          </div>
          <div class="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm">
            <span>Nilai Pengembalian:</span>
            <span class="font-mono text-brand-red-600">{formatRupiah(selectedCustomerReturn.refundAmount)}</span>
          </div>
        </div>
      {:else if selectedDetailType === "PEMBELIAN" && selectedSupplierReturn}
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <div class="font-mono font-bold text-brand-blue">{selectedSupplierReturn.returnNumber}</div>
            <div class="font-bold text-slate-900 text-sm">Nota Retur Pembelian PBF</div>
          </div>
          <button
            onclick={() => (isDetailModalOpen = false)}
            class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
            aria-label="Tutup"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <div class="flex justify-between">
            <span class="text-slate-500">Faktur PBF:</span>
            <strong class="font-mono">{selectedSupplierReturn.invoiceRef}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Distributor:</span>
            <strong>{selectedSupplierReturn.supplierName}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Produk & Batch:</span>
            <strong>{selectedSupplierReturn.productName} ({selectedSupplierReturn.batchNo})</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Kuantitas:</span>
            <strong>{selectedSupplierReturn.qty} {selectedSupplierReturn.unit}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Mekanisme Klaim:</span>
            <strong>{selectedSupplierReturn.settlementType === "NOTA_KREDIT" ? "Potong Hutang (Nota Kredit)" : "Tukar Batch Baru"}</strong>
          </div>
          {#if selectedSupplierReturn.creditNoteNo}
            <div class="flex justify-between text-emerald-700">
              <span>No. Nota Kredit:</span>
              <strong class="font-mono">{selectedSupplierReturn.creditNoteNo}</strong>
            </div>
          {/if}
          <div class="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm">
            <span>Nilai Klaim PBF:</span>
            <span class="font-mono text-brand-blue">{formatRupiah(selectedSupplierReturn.totalValue)}</span>
          </div>
        </div>
      {/if}

      <div class="border-t border-slate-100 pt-3 flex justify-end gap-2">
        <button
          type="button"
          onclick={() => (isDetailModalOpen = false)}
          class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold"
        >
          Tutup
        </button>
        <button
          type="button"
          onclick={() => {
            window.print();
            isDetailModalOpen = false;
          }}
          class="px-4 py-1.5 rounded-xl bg-brand-blue-700 text-white font-bold inline-flex items-center gap-1.5"
        >
          <Printer class="w-3.5 h-3.5" />
          <span>Cetak Nota Retur</span>
        </button>
      </div>
    </div>
  </div>
{/if}
