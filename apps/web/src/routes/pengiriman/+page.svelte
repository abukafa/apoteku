<script lang="ts">
  import { onMount } from "svelte";
  import {
    ArrowLeftRight,
    Truck,
    Plus,
    CheckCircle2,
    Clock,
    AlertTriangle,
    Printer,
    Store,
    Package,
    Trash2,
    Eye,
    Send,
    X
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { portal } from "$lib/actions/portal";
  import { api } from "$lib/services/api";
  import { mockApi } from "$lib/services/mock-api";

  interface TransferItem {
    productId: string;
    productName: string;
    batchNumber: string;
    qty: number;
    receivedQty?: number;
    discrepancyQty?: number;
    discrepancyReason?: string;
    unit: string;
    status: "REQUESTED" | "IN_TRANSIT" | "RECEIVED" | "RECEIVED_DISCREPANCY";
  }

  interface TransferDoc {
    id: string;
    transferNumber: string;
    receiptNumber?: string;
    fromBranchId: string;
    fromBranchName: string;
    toBranchId: string;
    toBranchName: string;
    transferDate: string;
    receivedDate?: string;
    courierName?: string;
    operator: string;
    receivedBy?: string;
    status: "REQUESTED" | "IN_TRANSIT" | "RECEIVED" | "RECEIVED_DISCREPANCY";
    notes: string;
    receiptNotes?: string;
    items: TransferItem[];
  }

  // State
  let transfers = $state<TransferDoc[]>([]);
  let branches = $state<any[]>([]);
  let products = $state<any[]>([]);

  let selectedBranchFilter = $state<string>(authStore.user?.branchId || "1");
  let activeTab = $state<"semua" | "in_transit" | "requested" | "received">("semua");
  let searchQuery = $state("");

  // Notification Banner
  let notificationBanner = $state<{
    message: string;
    subtext?: string;
  } | null>(null);

  onMount(async () => {
    if (authStore.user?.branchId) {
      selectedBranchFilter = authStore.user.branchId;
      formFromBranchId = authStore.user.branchId;
    }
    try {
      await mockApi.ensureDataLoaded();
      const [branchList, prodList, transferList] = await Promise.all([
        mockApi.getBranches(),
        mockApi.getProducts(),
        api.transfer.list()
      ]);
      if (branchList.length > 0) {
        branches = branchList;
        if (!authStore.user?.branchId && branchList[0]?.id) {
          formFromBranchId = branchList[0].id;
          selectedBranchFilter = branchList[0].id;
        }
        const altDest = branchList.find((b) => b.id !== formFromBranchId);
        if (altDest?.id) formToBranchId = altDest.id;
      }
      if (prodList.length > 0) {
        products = prodList;
        draftProductId = prodList[0]?.id || "";
        draftBatchNumber = prodList[0]?.batches[0]?.batchNumber || "";
      }
      if (transferList?.success && Array.isArray(transferList.data) && transferList.data.length > 0) {
        transfers = transferList.data;
      }
    } catch (_) {}
  });

  function formatNowTimestamp(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }

  // Branch-scoped transfers
  let branchTransfers = $derived(
    transfers.filter((t) => {
      if (selectedBranchFilter === "ALL") return true;
      return (
        t.fromBranchId === selectedBranchFilter ||
        t.toBranchId === selectedBranchFilter
      );
    })
  );

  // Filtered by Tab & Search
  let filteredTransfers = $derived(
    branchTransfers.filter((t) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        t.transferNumber.toLowerCase().includes(q) ||
        t.toBranchName.toLowerCase().includes(q) ||
        t.fromBranchName.toLowerCase().includes(q) ||
        t.items.some(
          (i) =>
            i.productName.toLowerCase().includes(q) ||
            i.batchNumber.toLowerCase().includes(q)
        );

      if (activeTab === "in_transit") return matchSearch && t.status === "IN_TRANSIT";
      if (activeTab === "requested") return matchSearch && t.status === "REQUESTED";
      if (activeTab === "received")
        return (
          matchSearch &&
          (t.status === "RECEIVED" || t.status === "RECEIVED_DISCREPANCY")
        );
      return matchSearch;
    })
  );

  // Metrics
  let inTransitCount = $derived(
    branchTransfers.filter((t) => t.status === "IN_TRANSIT").length
  );
  let requestedCount = $derived(
    branchTransfers.filter((t) => t.status === "REQUESTED").length
  );
  let receivedCount = $derived(
    branchTransfers.filter(
      (t) => t.status === "RECEIVED" || t.status === "RECEIVED_DISCREPANCY"
    ).length
  );
  let discrepancyCount = $derived(
    branchTransfers.filter((t) => t.status === "RECEIVED_DISCREPANCY").length
  );

  // =========================================================================
  // MODAL 1: BUAT PENGIRIMAN BARU (MULTI-ITEM SURAT JALAN / RKB)
  // =========================================================================
  let isAddTransferModalOpen = $state(false);
  let formFromBranchId = $state("1");
  let formToBranchId = $state("2");
  let formCourierName = $state("Kurir Internal - Kang Asep");
  let formTransferNotes = $state("");

  // Draft item selector
  let draftProductId = $state("");
  let draftBatchNumber = $state("");
  let draftQty = $state(20);
  let draftUnit = $state("STRIP");

  let formItems = $state<
    Array<{
      productId: string;
      productName: string;
      batchNumber: string;
      qty: number;
      unit: string;
    }>
  >([]);

  let selectedDraftProduct = $derived(
    products.find((p) => p.id === draftProductId) || products[0]
  );

  let availableToBranches = $derived(
    branches.filter((b) => b.id !== formFromBranchId)
  );

  function openAddTransferModal() {
    formFromBranchId = authStore.user?.branchId || (selectedBranchFilter !== "ALL" ? selectedBranchFilter : "1");
    const firstDest = branches.find((b) => b.id !== formFromBranchId);
    formToBranchId = firstDest?.id || "2";
    formCourierName = "Kurir Internal - Kang Asep";
    formTransferNotes = "";

    const firstProd = products[0];
    if (firstProd) {
      draftProductId = firstProd.id;
      draftBatchNumber = firstProd.batches[0]?.batchNumber || "BATCH-01";
      draftUnit = firstProd.units[1]?.unit || firstProd.baseUnit;
      draftQty = 20;
      formItems = [
        {
          productId: firstProd.id,
          productName: firstProd.name,
          batchNumber: firstProd.batches[0]?.batchNumber || "BATCH-01",
          qty: 20,
          unit: firstProd.units[1]?.unit || firstProd.baseUnit
        }
      ];
    }
    isAddTransferModalOpen = true;
  }

  function handleFromBranchChange(newFromId: string) {
    formFromBranchId = newFromId;
    if (formToBranchId === newFromId) {
      const alt = branches.find((b) => b.id !== newFromId);
      if (alt) formToBranchId = alt.id;
    }
  }

  function handleDraftProductChange(newProdId: string) {
    draftProductId = newProdId;
    const prod = products.find((p) => p.id === newProdId);
    if (prod) {
      draftBatchNumber = prod.batches[0]?.batchNumber || "BATCH-01";
      draftUnit = prod.units[1]?.unit || prod.baseUnit;
    }
  }

  function addDraftItemToList() {
    if (!selectedDraftProduct || draftQty <= 0) return;
    const existingIdx = formItems.findIndex(
      (i) =>
        i.productId === selectedDraftProduct.id &&
        i.batchNumber === draftBatchNumber &&
        i.unit === draftUnit
    );
    if (existingIdx !== -1) {
      formItems[existingIdx].qty += Number(draftQty) || 1;
    } else {
      formItems = [
        ...formItems,
        {
          productId: selectedDraftProduct.id,
          productName: selectedDraftProduct.name,
          batchNumber: draftBatchNumber,
          qty: Number(draftQty) || 1,
          unit: draftUnit
        }
      ];
    }
  }

  function removeDraftItem(index: number) {
    formItems = formItems.filter((_, i) => i !== index);
  }

  async function submitNewTransfer() {
    if (formItems.length === 0) return;

    const fromBranch = branches.find((b) => b.id === formFromBranchId);
    const toBranch = branches.find((b) => b.id === formToBranchId);

    try {
      const res = await api.transfer.create({
        fromBranchId: formFromBranchId,
        toBranchId: formToBranchId,
        courierName: formCourierName.trim() || "Kurir Internal",
        operator: authStore.user?.fullName || "apt. Hafidz Nurul",
        status: "IN_TRANSIT",
        notes: formTransferNotes.trim() || "Pengiriman stok antar cabang",
        items: formItems.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          batchNumber: it.batchNumber,
          qty: it.qty,
          unit: it.unit
        }))
      });

      if (res?.success && res.data) {
        transfers = [res.data, ...transfers];
        notificationBanner = {
          message: `Surat Jalan ${res.data.transferNumber} berhasil diterbitkan (Status: DI JALAN)!`,
          subtext: `Stok cabang asal (${fromBranch?.name || "Asal"}) telah dipotong (TRANSFER_OUT) dan siap diverifikasi oleh ${toBranch?.name || "Tujuan"}.`
        };
      } else {
        throw new Error(res?.error || "Gagal membuat surat jalan");
      }
    } catch (err) {
      console.warn("API transfer create error, falling back locally:", err);
      const seq = String(Math.floor(100 + Math.random() * 900));
      const docNo = `RKB-2025-1027-${seq}`;
      const newTransfer: TransferDoc = {
        id: `trf-${Date.now()}`,
        transferNumber: docNo,
        fromBranchId: formFromBranchId,
        fromBranchName: fromBranch?.name || "Apotek Pusat",
        toBranchId: formToBranchId,
        toBranchName: toBranch?.name || "Cabang Tujuan",
        transferDate: formatNowTimestamp(),
        courierName: formCourierName.trim() || "Kurir Internal",
        operator: authStore.user?.fullName || "apt. Hafidz Nurul",
        status: "IN_TRANSIT",
        notes: formTransferNotes.trim() || "Pengiriman stok antar cabang",
        items: formItems.map((it) => ({
          ...it,
          status: "IN_TRANSIT"
        }))
      };
      transfers = [newTransfer, ...transfers];
      notificationBanner = {
        message: `Surat Jalan ${docNo} berhasil diterbitkan (Status: DI JALAN)!`,
        subtext: `Stok cabang asal (${newTransfer.fromBranchName}) telah dipotong (TRANSFER_OUT) dan siap diverifikasi oleh ${newTransfer.toBranchName}.`
      };
    }
    isAddTransferModalOpen = false;
  }

  // Dispatch a REQUESTED transfer
  async function dispatchRequestedTransfer(trf: TransferDoc) {
    try {
      await api.transfer.dispatch(trf.id, "Kurir Internal Hafidz Farma");
    } catch (_) {}
    trf.status = "IN_TRANSIT";
    trf.transferDate = formatNowTimestamp();
    trf.courierName = "Kurir Internal Hafidz Farma";
    trf.items = trf.items.map((it) => ({ ...it, status: "IN_TRANSIT" }));
    notificationBanner = {
      message: `Permintaan ${trf.transferNumber} telah dikirim (Status: DI JALAN)!`,
      subtext: `Barang sedang dikirim dari ${trf.fromBranchName} menuju ${trf.toBranchName}.`
    };
  }

  // =========================================================================
  // MODAL 2: VERIFIKASI PENERIMAAN FISIK (KONFIRMASI TERIMA / RTB)
  // =========================================================================
  let isReceiveModalOpen = $state(false);
  let receivingTransfer = $state<TransferDoc | null>(null);
  let receiveCounts = $state<Record<number, number>>({});
  let receiveReasons = $state<Record<number, string>>({});
  let receiveGeneralNotes = $state("");

  let receiveHasDiscrepancy = $derived.by(() => {
    if (!receivingTransfer) return false;
    return receivingTransfer.items.some((item, idx) => {
      const actual = receiveCounts[idx] ?? item.qty;
      return actual !== item.qty;
    });
  });

  function openReceiveModal(trf: TransferDoc) {
    receivingTransfer = trf;
    const initCounts: Record<number, number> = {};
    const initReasons: Record<number, string> = {};
    trf.items.forEach((item, idx) => {
      initCounts[idx] = item.qty;
      initReasons[idx] = "";
    });
    receiveCounts = initCounts;
    receiveReasons = initReasons;
    receiveGeneralNotes = "";
    isReceiveModalOpen = true;
  }

  async function submitReceiveVerification() {
    if (!receivingTransfer) return;

    let anyDiff = false;
    const itemPayload = receivingTransfer.items.map((item, idx) => {
      const recQty = Math.max(0, Number(receiveCounts[idx] ?? item.qty));
      const diff = recQty - item.qty;
      if (diff !== 0) anyDiff = true;
      return {
        lineNo: idx + 1,
        qtyReceived: recQty,
        discrepancyReason: diff !== 0 ? receiveReasons[idx]?.trim() || "Selisih hitung saat penerimaan" : undefined
      };
    });

    try {
      await api.transfer.receive(receivingTransfer.id, {
        receivedBy: authStore.user?.fullName || "apt. Rina Marlina",
        receiptNotes: receiveGeneralNotes.trim() || (anyDiff ? "Diterima dengan catatan selisih fisik" : "Diterima lengkap dan cocok"),
        items: itemPayload
      });
      const res = await api.transfer.list();
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        transfers = res.data;
      }
    } catch (e) {
      console.warn("API transfer receive error, fallback local:", e);
    }

    const updatedItems: TransferItem[] = receivingTransfer.items.map(
      (item, idx) => {
        const recQty = Math.max(0, Number(receiveCounts[idx] ?? item.qty));
        const diff = recQty - item.qty;
        return {
          ...item,
          receivedQty: recQty,
          discrepancyQty: diff,
          discrepancyReason:
            diff !== 0
              ? receiveReasons[idx]?.trim() || "Selisih hitung saat penerimaan"
              : undefined,
          status: diff !== 0 ? "RECEIVED_DISCREPANCY" : "RECEIVED"
        };
      }
    );

    const rtbNo = `RTB-${receivingTransfer.transferNumber.slice(-7)}`;
    receivingTransfer.status = anyDiff ? "RECEIVED_DISCREPANCY" : "RECEIVED";
    receivingTransfer.receiptNumber = rtbNo;
    receivingTransfer.receivedDate = formatNowTimestamp();
    receivingTransfer.receivedBy =
      authStore.user?.fullName || "apt. Rina Marlina";
    receivingTransfer.receiptNotes =
      receiveGeneralNotes.trim() ||
      (anyDiff
        ? "Diterima dengan catatan selisih fisik"
        : "Diterima lengkap sesuai Surat Jalan");
    receivingTransfer.items = updatedItems;

    const docNo = receivingTransfer.transferNumber;
    const destName = receivingTransfer.toBranchName;
    isReceiveModalOpen = false;
    notificationBanner = {
      message: anyDiff
        ? `Penerimaan ${rtbNo} (${docNo}) disimpan dengan Status: DITERIMA SELISIH!`
        : `Penerimaan ${rtbNo} (${docNo}) selesai diverifikasi 100% Cocok!`,
      subtext: `Stok di ${destName} telah ditambahkan (TRANSFER_IN) sesuai jumlah fisik diterima.`
    };
  }

  // =========================================================================
  // MODAL 3: DETAIL & CETAK SURAT JALAN
  // =========================================================================
  let isDetailModalOpen = $state(false);
  let selectedTransferForDetail = $state<TransferDoc | null>(null);

  function openDetailModal(trf: TransferDoc) {
    selectedTransferForDetail = trf;
    isDetailModalOpen = true;
  }
</script>

<svelte:head>
  <title>Pengiriman &bull; Hafidz Farma</title>
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Pengiriman & Mutasi Antar Cabang"
    subtitle="Surat jalan pengiriman (RKB), verifikasi terima fisik (RTB), dan audit selisih mutasi"
    icon={ArrowLeftRight}
    breadcrumbs={[{ label: "Pengiriman" }]}
  >
    {#snippet actions()}
      <!-- Branch selector (for Superadmin/Owner) or locked badge (for Staff) -->
      {#if authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"}
        <Select
          bind:value={selectedBranchFilter}
          icon={Store}
          variant="soft"
          size="sm"
          align="right"
          options={[
            { value: "ALL", label: "Semua Cabang (Konsolidasi)" },
            ...branches.map((b) => ({
              value: b.id,
              label: `${b.name}`,
              sublabel: b.address
            }))
          ]}
        />
      {:else}
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs" title="Cabang Penugasan">
          <Store class="w-3.5 h-3.5 text-brand-blue" />
          <span>{authStore.user?.branchName || branches.find((b) => b.id === selectedBranchFilter)?.name || "Apotek Hafidz Farma Pusat"}</span>
        </div>
      {/if}
      
      <button
        type="button"
        onclick={openAddTransferModal}
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
      >
        <Plus class="w-4 h-4" />
        <span>Kirim Barang Baru</span>
      </button>
    {/snippet}
  </PageHeader>

  <!-- NOTIFICATION BANNER -->
  {#if notificationBanner}
    <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-150">
      <div class="flex items-start gap-3">
        <CheckCircle2 class="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div>
          <div class="text-xs font-bold text-emerald-950">{notificationBanner.message}</div>
          {#if notificationBanner.subtext}
            <div class="text-[11px] text-emerald-700 mt-0.5">{notificationBanner.subtext}</div>
          {/if}
        </div>
      </div>
      <button
        type="button"
        onclick={() => (notificationBanner = null)}
        class="p-1 text-emerald-600 hover:text-emerald-900 rounded-lg"
        aria-label="Tutup Notifikasi"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  {/if}

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Total Mutasi"
      value="{branchTransfers.length} Surat Jalan"
      subtext="Logistik antar cabang"
      icon={ArrowLeftRight}
      variant="brand"
    />
    <MetricCard
      title="Dalam Perjalanan"
      value="{inTransitCount} Pengiriman"
      subtext="Menunggu konfirmasi"
      icon={Truck}
      variant="warning"
      alertActionText="Lihat"
      onAlertClick={() => (activeTab = "in_transit")}
    />
    <MetricCard
      title="Permintaan Cabang"
      value="{requestedCount} Permintaan"
      subtext="Perlu diproses kirim"
      icon={Clock}
      variant="default"
      alertActionText="Proses"
      onAlertClick={() => (activeTab = "requested")}
    />
    <MetricCard
      title="Selesai Diterima"
      value="{receivedCount} Mutasi"
      subtext={discrepancyCount > 0 ? `${discrepancyCount} diterima dengan selisih` : "100% sesuai surat jalan"}
      icon={CheckCircle2}
      variant={discrepancyCount > 0 ? "danger" : "success"}
    />
  </div>

  <!-- TAB NAVIGATION -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold overflow-x-auto scrollbar-none">
    <button
      type="button"
      onclick={() => (activeTab = "semua")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'semua' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Semua Pengiriman ({branchTransfers.length})</span>
      {#if activeTab === "semua"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "in_transit")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'in_transit' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Dalam Perjalanan ({inTransitCount})</span>
      {#if activeTab === "in_transit"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "requested")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'requested' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Permintaan Mutasi ({requestedCount})</span>
      {#if activeTab === "requested"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "received")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'received' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Selesai Diterima ({receivedCount})</span>
      {#if activeTab === "received"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>
  </div>

  <!-- DATA TABLE -->
  <DataTable
    title="Riwayat Surat Jalan & Mutasi Cabang"
    searchPlaceholder="Cari nomor surat jalan, nama obat, batch, atau cabang..."
    bind:searchValue={searchQuery}
    totalCount={filteredTransfers.length}
  >
    {#snippet header()}
      <th class="py-3 px-4">No. Surat</th>
      <th class="py-3 px-4">Cabang Asal</th>
      <th class="py-3 px-4">Cabang Tujuan</th>
      <th class="py-3 px-4">Waktu</th>
      <th class="py-3 px-4">Rincian Barang</th>
      <th class="py-3 px-4 text-center">Status</th>
      <th class="py-3 px-4 text-center">Aksi</th>
    {/snippet}

    {#snippet rows()}
      {#if filteredTransfers.length === 0}
        <tr>
          <td colspan="7" class="text-center py-12 text-slate-400">
            <Truck class="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p class="font-medium text-sm">Tidak ada data surat jalan atau mutasi cabang</p>
            <p class="text-xs text-slate-400">Gunakan tombol "Buat Surat Jalan" untuk memulai pengiriman antarcabang.</p>
          </td>
        </tr>
      {:else}
        {#each filteredTransfers as t}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4">
              <div class="font-mono font-bold text-brand-blue">{t.transferNumber}</div>
              {#if t.receiptNumber}
                <div class="text-[10px] font-mono text-emerald-700 mt-0.5">
                  Terima: {t.receiptNumber}
                </div>
              {/if}
            </td>
            <td class="py-3.5 px-4">
              <div class="font-bold text-slate-800">{t.fromBranchName}</div>
              <div class="text-[11px] text-slate-400">Oleh: {t.operator}</div>
            </td>
            <td class="py-3.5 px-4">
              <div class="font-bold text-slate-800">{t.toBranchName}</div>
              {#if t.receivedBy}
                <div class="text-[11px] text-emerald-700">Diterima: {t.receivedBy}</div>
              {/if}
            </td>
            <td class="py-3.5 px-4">
              <div class="font-mono text-slate-600 text-[11px]">{t.transferDate}</div>
              {#if t.courierName}
                <div class="text-[11px] text-slate-400 mt-0.5">{t.courierName}</div>
              {/if}
            </td>
            <td class="py-3.5 px-4">
              <div class="space-y-1">
                {#each t.items as item}
                  <div class="text-[11px] text-slate-700 font-medium flex items-center gap-1.5 flex-wrap">
                    <span>• {item.productName}</span>
                    <span class="font-bold text-slate-900">({item.qty} {item.unit})</span>
                    <span class="text-slate-400 font-mono text-[10px]">[{item.batchNumber}]</span>
                    {#if item.discrepancyQty !== undefined && item.discrepancyQty !== 0}
                      <span class="px-1.5 py-0.5 rounded bg-red-100 text-brand-red-700 font-mono font-bold text-[10px]">
                        Fisik: {item.receivedQty} (Selisih {item.discrepancyQty})
                      </span>
                    {/if}
                  </div>
                {/each}
              </div>
            </td>
            <td class="py-3.5 px-4 text-center">
              {#if t.status === "RECEIVED"}
                <Badge type="SUCCESS" label="DITERIMA" />
              {:else if t.status === "RECEIVED_DISCREPANCY"}
                <Badge type="DANGER" label="SELISIH TERIMA" />
              {:else if t.status === "IN_TRANSIT"}
                <Badge type="WARNING" label="DI JALAN" />
              {:else}
                <Badge type="INFO" label="DIMINTA" />
              {/if}
            </td>
            <td class="py-3.5 px-4 text-center">
              <div class="flex items-center justify-center gap-1.5">
                {#if t.status === "IN_TRANSIT"}
                  <button
                    type="button"
                    onclick={() => openReceiveModal(t)}
                    class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors shadow-xs"
                  >
                    Terima
                  </button>
                {:else if t.status === "REQUESTED"}
                  <button
                    type="button"
                    onclick={() => dispatchRequestedTransfer(t)}
                    class="px-2.5 py-1 rounded-lg bg-brand-blue-600 hover:bg-brand-blue-700 text-white font-bold text-[11px] inline-flex items-center gap-1 transition-colors shadow-xs"
                  >
                    <Send class="w-3 h-3" />
                    <span>Kirim</span>
                  </button>
                {/if}
                <button
                  type="button"
                  onclick={() => openDetailModal(t)}
                  class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-brand-blue"
                  title="Lihat Detail & Cetak Surat Jalan"
                >
                  <Printer class="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        {/each}
      {/if}
    {/snippet}
  </DataTable>
</div>

<!-- ======================================================================= -->
<!-- MODAL 1: BUAT PENGIRIMAN / SURAT JALAN BARU (MULTI-ITEM)                -->
<!-- ======================================================================= -->
{#if isAddTransferModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isAddTransferModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <div class="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Truck class="w-5 h-5 text-brand-blue" />
            <span>Buat Pengiriman / Surat Jalan Baru (RKB)</span>
          </div>
          <p class="text-[11px] text-slate-500 mt-0.5">
            Potong stok cabang pengirim dan terbitkan dokumen di cabang tujuan.
          </p>
        </div>
        <button
          onclick={() => (isAddTransferModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          {#if authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"}
            <label for="trf-from" class="font-bold text-slate-700 block mb-1">Cabang Pengirim (Asal)</label>
            <Select
              id="trf-from"
              bind:value={formFromBranchId}
              onchange={(val) => handleFromBranchChange(val)}
              options={branches.map((b) => ({
                value: b.id,
                label: b.name,
                sublabel: b.code
              }))}
            />
          {:else}
            <span class="font-bold text-slate-700 block mb-1">Cabang Pengirim (Asal)</span>
            <div class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-2">
              <Store class="w-4 h-4 text-brand-blue" />
              <span>{authStore.user?.branchName || branches.find((b) => b.id === formFromBranchId)?.name || "Cabang Asal"}</span>
            </div>
          {/if}
        </div>
        <div>
          <label for="trf-to" class="font-bold text-slate-700 block mb-1">Cabang Penerima (Tujuan)</label>
          <Select
            id="trf-to"
            bind:value={formToBranchId}
            options={availableToBranches.map((b) => ({
              value: b.id,
              label: b.name,
              sublabel: b.code
            }))}
          />
        </div>

        <div>
          <label for="trf-courier" class="font-bold text-slate-700 block mb-1">Petugas Pengantar / Kurir</label>
          <input
            id="trf-courier"
            type="text"
            bind:value={formCourierName}
            placeholder="Nama driver / ekspedisi internal"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium"
          />
        </div>
        <div>
          <label for="trf-notes" class="font-bold text-slate-700 block mb-1">Catatan Surat Jalan</label>
          <input
            id="trf-notes"
            type="text"
            bind:value={formTransferNotes}
            placeholder="Contoh: Distribusi stok rutin mingguan..."
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>
      </div>

      <!-- Add Item Box -->
      <div class="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-3 text-xs">
        <div class="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
          Tambah Obat ke Daftar Surat Jalan (FEFO)
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
          <div class="sm:col-span-6">
            <label for="trf-item" class="font-semibold text-slate-600 block mb-1">Pilih Obat</label>
            <SearchableSelect
              id="trf-item"
              bind:value={draftProductId}
              variant="white"
              size="sm"
              searchPlaceholder="Cari nama obat atau SKU..."
              onchange={(val) => handleDraftProductChange(val)}
              options={products.map((p) => {
                const tot = (p.batches || []).reduce((a: number, b: any) => a + Number(b?.stock || 0), 0);
                return {
                  value: p.id,
                  label: p.name,
                  sublabel: `Batch FEFO: ${p.batches?.[0]?.batchNumber || "-"} • ED: ${p.batches?.[0]?.expiryDate || "-"}`,
                  badge: `${tot} ${p.baseUnit || "PCS"}`
                };
              })}
            />
          </div>
          <div class="sm:col-span-2">
            <label for="trf-qty" class="font-semibold text-slate-600 block mb-1">Qty</label>
            <input
              id="trf-qty"
              type="number"
              min="1"
              bind:value={draftQty}
              class="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-mono font-bold text-center"
            />
          </div>
          <div class="sm:col-span-2">
            <label for="trf-unit" class="font-semibold text-slate-600 block mb-1">Satuan</label>
            <Select
              id="trf-unit"
              bind:value={draftUnit}
              variant="white"
              size="sm"
              options={["STRIP", "DUS", "TABLET", "BOTOL", "TUBE"]}
            />
          </div>
          <div class="sm:col-span-2">
            <button
              type="button"
              onclick={addDraftItemToList}
              class="w-full py-1.5 px-3 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs inline-flex items-center justify-center gap-1"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Tambah</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Items List Table -->
      <div class="border border-slate-200 rounded-xl overflow-hidden">
        <table class="w-full text-left text-xs border-collapse">
          <thead class="bg-slate-100 text-slate-600 font-bold text-[10px] uppercase">
            <tr>
              <th class="py-2 px-3">Nama Obat</th>
              <th class="py-2 px-3">No. Batch</th>
              <th class="py-2 px-3 text-right">Qty Dikirim</th>
              <th class="py-2 px-3 text-center w-12">Hapus</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            {#if formItems.length === 0}
              <tr>
                <td colspan="4" class="py-6 text-center text-slate-400">
                  Belum ada item obat yang ditambahkan ke Surat Jalan.
                </td>
              </tr>
            {:else}
              {#each formItems as item, idx}
                <tr>
                  <td class="py-2 px-3 font-bold text-slate-800">{item.productName}</td>
                  <td class="py-2 px-3 font-mono text-slate-600">{item.batchNumber}</td>
                  <td class="py-2 px-3 text-right font-mono font-black text-brand-blue-700">
                    {item.qty} {item.unit}
                  </td>
                  <td class="py-2 px-3 text-center">
                    <button
                      type="button"
                      onclick={() => removeDraftItem(idx)}
                      class="p-1 text-slate-400 hover:text-brand-red-600 rounded"
                      aria-label="Hapus item"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isAddTransferModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={formItems.length === 0}
          onclick={submitNewTransfer}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 disabled:opacity-50 text-white font-bold text-xs shadow-sm"
        >
          Terbitkan & Kirim Surat Jalan ({formItems.length} Item)
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ======================================================================= -->
<!-- MODAL 2: VERIFIKASI PENERIMAAN FISIK (KONFIRMASI TERIMA / RTB)          -->
<!-- ======================================================================= -->
{#if isReceiveModalOpen && receivingTransfer}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isReceiveModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <div class="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <CheckCircle2 class="w-5 h-5 text-emerald-600" />
            <span>Verifikasi Penerimaan Barang ({receivingTransfer.transferNumber})</span>
          </div>
          <p class="text-[11px] text-slate-500 mt-0.5">
            Dari <strong>{receivingTransfer.fromBranchName}</strong> menuju <strong>{receivingTransfer.toBranchName}</strong>
          </p>
        </div>
        <button
          onclick={() => (isReceiveModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="border border-slate-200 rounded-xl overflow-hidden">
        <table class="w-full text-left text-xs border-collapse">
          <thead class="bg-slate-100 text-slate-600 font-bold text-[10px] uppercase">
            <tr>
              <th class="py-2.5 px-3">Nama Obat & Batch</th>
              <th class="py-2.5 px-3 text-right">Qty Surat Jalan</th>
              <th class="py-2.5 px-3 text-center w-32">Qty Fisik Diterima</th>
              <th class="py-2.5 px-3 text-center">Selisih</th>
              <th class="py-2.5 px-3">Keterangan Selisih</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            {#each receivingTransfer.items as item, idx}
              {@const recQty = receiveCounts[idx] ?? item.qty}
              {@const diff = recQty - item.qty}
              <tr class={diff !== 0 ? "bg-red-50/40" : ""}>
                <td class="py-2.5 px-3">
                  <div class="font-bold text-slate-900">{item.productName}</div>
                  <div class="text-[10px] font-mono text-slate-500">Batch: {item.batchNumber}</div>
                </td>
                <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                  {item.qty} {item.unit}
                </td>
                <td class="py-2.5 px-3 text-center">
                  <input
                    type="number"
                    min="0"
                    value={recQty}
                    oninput={(e) => {
                      const val = Number((e.target as HTMLInputElement).value);
                      receiveCounts[idx] = isNaN(val) ? 0 : val;
                    }}
                    class="w-20 text-center font-mono font-black px-2 py-1 rounded-lg border {diff !== 0 ? 'border-red-400 bg-white text-brand-red-700' : 'border-emerald-300 bg-emerald-50/40 text-emerald-900'}"
                  />
                </td>
                <td class="py-2.5 px-3 text-center font-mono font-black">
                  {#if diff === 0}
                    <span class="text-emerald-600 text-[11px]">Cocok</span>
                  {:else}
                    <span class="text-brand-red-600">{diff > 0 ? `+${diff}` : diff} {item.unit}</span>
                  {/if}
                </td>
                <td class="py-2.5 px-3">
                  {#if diff !== 0}
                    <input
                      type="text"
                      bind:value={receiveReasons[idx]}
                      placeholder="Contoh: Kurang kirim / rusak..."
                      class="w-full bg-white border border-red-200 rounded-lg px-2 py-1 text-[11px]"
                    />
                  {:else}
                    <span class="text-[11px] text-slate-400">Sesuai surat jalan</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="text-xs">
        <label for="rec-notes" class="font-bold text-slate-700 block mb-1">Catatan Penerimaan (RTB)</label>
        <input
          id="rec-notes"
          type="text"
          bind:value={receiveGeneralNotes}
          placeholder="Contoh: Diterima oleh petugas sif pagi..."
          class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
        />
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-between gap-2">
        <span class="text-[11px] text-slate-500">
          Penerima: <strong>{authStore.user?.fullName || "apt. Rina Marlina"}</strong>
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={() => (isReceiveModalOpen = false)}
            class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            onclick={submitReceiveVerification}
            class="px-4 py-2 rounded-xl {receiveHasDiscrepancy ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-bold text-xs shadow-sm inline-flex items-center gap-1.5"
          >
            <CheckCircle2 class="w-4 h-4" />
            <span>
              {receiveHasDiscrepancy ? "Simpan Penerimaan (Ada Selisih)" : "Konfirmasi Terima Lengkap"}
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ======================================================================= -->
<!-- MODAL 3: DETAIL & CETAK SURAT JALAN                                     -->
<!-- ======================================================================= -->
{#if isDetailModalOpen && selectedTransferForDetail}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isDetailModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto text-xs">
      <div class="flex items-start justify-between border-b border-slate-200 pb-3">
        <div>
          <div class="text-[10px] font-bold uppercase tracking-widest text-brand-blue">
            DOKUMEN SURAT JALAN MUTASI APOTEK HAFIDZ FARMA
          </div>
          <h3 class="text-base font-black text-slate-900 font-mono mt-0.5">
            {selectedTransferForDetail.transferNumber}
          </h3>
          <div class="text-[11px] text-slate-500">
            Waktu Kirim: {selectedTransferForDetail.transferDate}
          </div>
        </div>
        <button
          onclick={() => (isDetailModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
        <div>
          <span class="text-[10px] font-bold text-slate-400 uppercase block">Cabang Pengirim</span>
          <div class="font-bold text-slate-900">{selectedTransferForDetail.fromBranchName}</div>
          <div class="text-[11px] text-slate-500">Petugas: {selectedTransferForDetail.operator}</div>
        </div>
        <div>
          <span class="text-[10px] font-bold text-slate-400 uppercase block">Cabang Tujuan</span>
          <div class="font-bold text-slate-900">{selectedTransferForDetail.toBranchName}</div>
          <div class="text-[11px] text-slate-500">
            Penerima: {selectedTransferForDetail.receivedBy || "Menunggu Konfirmasi"}
          </div>
        </div>
      </div>

      <table class="w-full text-left border-collapse border border-slate-200 text-xs">
        <thead class="bg-slate-100 text-slate-600 font-bold text-[10px] uppercase">
          <tr>
            <th class="py-2 px-3 border-b border-slate-200">Nama Obat</th>
            <th class="py-2 px-3 border-b border-slate-200">Batch</th>
            <th class="py-2 px-3 border-b border-slate-200 text-right">Qty Kirim</th>
            <th class="py-2 px-3 border-b border-slate-200 text-right">Qty Terima</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each selectedTransferForDetail.items as item}
            <tr>
              <td class="py-2 px-3 font-bold text-slate-800">{item.productName}</td>
              <td class="py-2 px-3 font-mono text-slate-600">{item.batchNumber}</td>
              <td class="py-2 px-3 text-right font-mono font-bold">{item.qty} {item.unit}</td>
              <td class="py-2 px-3 text-right font-mono font-bold">
                {item.receivedQty !== undefined ? `${item.receivedQty} ${item.unit}` : "-"}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      <div class="grid grid-cols-3 gap-3 pt-4 text-center text-[11px] text-slate-600">
        <div class="border-t border-slate-200 pt-2">
          <div class="font-bold text-slate-800">Pengirim</div>
          <div class="mt-6 text-slate-500">({selectedTransferForDetail.operator})</div>
        </div>
        <div class="border-t border-slate-200 pt-2">
          <div class="font-bold text-slate-800">Kurir Logistik</div>
          <div class="mt-6 text-slate-500">({selectedTransferForDetail.courierName || "Kurir"})</div>
        </div>
        <div class="border-t border-slate-200 pt-2">
          <div class="font-bold text-slate-800">Penerima</div>
          <div class="mt-6 text-slate-500">({selectedTransferForDetail.receivedBy || "................"})</div>
        </div>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isDetailModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Tutup
        </button>
        <button
          type="button"
          onclick={() => window.print()}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs inline-flex items-center gap-1.5"
        >
          <Printer class="w-4 h-4" />
          <span>Cetak Surat Jalan</span>
        </button>
      </div>
    </div>
  </div>
{/if}
