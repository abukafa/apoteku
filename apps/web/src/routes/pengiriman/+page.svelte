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
    Trash2,
    Send,
    X,
    Loader2,
    Package
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { alertStore } from "$lib/stores/alertStore.svelte";
  import { portal } from "$lib/actions/portal";
  import { api } from "$lib/services/api";
  import { selectFefoBatches } from "@apoteku/core";

  interface ProductUnitMeta {
    id?: string;
    unitName: string;
    conversionFactor: number;
    isBaseUnit: boolean;
    isSellable?: boolean;
    isPurchaseUnit?: boolean;
    buyPrice?: number;
  }

  interface BranchBatchMeta {
    batchId: string;
    locationId: string;
    locationName: string;
    batchNumber: string;
    expiryDate: string | null;
    stockBase: number;
    buyPrice: number;
    isUnbatched?: boolean;
  }

  interface BranchProduct {
    id: string;
    sku: string;
    barcode: string;
    name: string;
    activeSubstance?: string;
    baseUnit: string;
    defaultPurchaseUnit?: string;
    referenceBuyPriceBase: number;
    totalStockBase: number;
    units: ProductUnitMeta[];
    batches: BranchBatchMeta[];
  }

  interface BranchInfo {
    id: string;
    code: string;
    name: string;
    address?: string;
    phone?: string;
  }

  interface TransferItem {
    lineNo: number;
    productId: string;
    productName: string;
    sku?: string;
    batchId?: string;
    batchNumber: string;
    expiryDate?: string | null;
    qty: number;
    receivedQty?: number;
    discrepancyQty?: number;
    discrepancyReason?: string;
    costPerUnit?: number;
    unit: string;
    units?: Array<{ unitName: string; conversionFactor: number; isBaseUnit: boolean }>;
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

  interface DraftTransferRow {
    productId: string;
    productName: string;
    batchId: string;
    batchNumber: string;
    expiryDate: string | null;
    locationId: string;
    qty: number;
    unit: string;
    conversionFactor: number;
    qtyBase: number;
    baseUnit: string;
  }

  // State
  let transfers = $state<TransferDoc[]>([]);
  let branches = $state<BranchInfo[]>([]);
  let branchProducts = $state<BranchProduct[]>([]);

  let isLoadingTransfers = $state(true);
  let isLoadingBranchProducts = $state(false);
  let isSubmitting = $state(false);
  let dispatchingId = $state<string | null>(null);

  let selectedBranchFilter = $state<string>("ALL");
  let activeTab = $state<"semua" | "in_transit" | "requested" | "received">("semua");
  let searchQuery = $state("");

  // Notification Banner
  let notificationBanner = $state<{
    message: string;
    subtext?: string;
  } | null>(null);

  let isAdminRole = $derived(
    !authStore.user ||
      authStore.user.role === "SUPERADMIN" ||
      authStore.user.role === "OWNER"
  );

  let userResolvedBranchId = $derived(
    resolveBranchId(authStore.user?.branchId, branches) || branches[0]?.id || ""
  );

  function resolveBranchId(candidate: string | undefined, list: BranchInfo[]): string {
    if (!candidate || list.length === 0) return "";
    const exact = list.find((b) => b.id === candidate);
    if (exact) return exact.id;
    const byCode = list.find(
      (b) => b.code.toLowerCase() === candidate.trim().toLowerCase()
    );
    return byCode ? byCode.id : "";
  }

  function extractErrorMessage(err: unknown, fallback = "Terjadi kesalahan pada server"): string {
    if (!err) return fallback;
    const raw = err instanceof Error ? err.message : String(err);
    const jsonStart = raw.indexOf("{");
    if (jsonStart !== -1) {
      try {
        const parsed = JSON.parse(raw.slice(jsonStart));
        if (parsed?.error) return String(parsed.error);
        if (parsed?.message) return String(parsed.message);
      } catch {
        // Use raw string
      }
    }
    return raw || fallback;
  }

  function roundQty(val: number): number {
    return Math.round(val * 10000) / 10000;
  }

  function formatQty(val: number): string {
    if (!Number.isFinite(val)) return "0";
    return Number(val.toFixed(4)).toLocaleString("id-ID");
  }

  function formatDateTime(iso?: string): string {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d
      .toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
      .replace(/\./g, ":");
  }

  function formatPackHint(
    qtyBase: number,
    baseUnit: string,
    units?: Array<{ unitName: string; conversionFactor: number }>
  ): string {
    if (!units || units.length <= 1 || qtyBase <= 0) return "";
    const packUnits = [...units]
      .filter((u) => Number(u.conversionFactor) > 1 && u.unitName !== baseUnit)
      .sort((a, b) => Number(b.conversionFactor) - Number(a.conversionFactor));
    const largest = packUnits.find((u) => qtyBase >= Number(u.conversionFactor));
    if (!largest) return "";
    const factor = Number(largest.conversionFactor);
    const whole = Math.floor(qtyBase / factor);
    const rem = roundQty(qtyBase - whole * factor);
    if (whole <= 0) return "";
    return rem > 0
      ? `${whole} ${largest.unitName} + ${formatQty(rem)} ${baseUnit}`
      : `${whole} ${largest.unitName}`;
  }

  async function loadTransfers() {
    isLoadingTransfers = true;
    try {
      const targetFilter = selectedBranchFilter || "ALL";
      const res = await api.transfer.list({ branchId: targetFilter, limit: 200 });
      if (res?.success && Array.isArray(res.data)) {
        transfers = res.data;
      } else {
        throw new Error(res?.error || "Gagal memuat data pengiriman");
      }
    } catch (err) {
      alertStore.toast(extractErrorMessage(err, "Gagal memuat riwayat pengiriman"), "danger");
    } finally {
      isLoadingTransfers = false;
    }
  }

  async function loadBranchProducts(branchId: string) {
    if (!branchId) {
      branchProducts = [];
      draftProductId = "";
      draftBatchId = "";
      draftUnit = "";
      draftQty = 0;
      return;
    }
    isLoadingBranchProducts = true;
    try {
      const res = await api.transfer.getBranchProducts(branchId);
      if (res?.success && Array.isArray(res.data)) {
        branchProducts = res.data;
        if (branchProducts.length > 0) {
          syncDraftDefaultsForProduct(branchProducts[0]);
        } else {
          draftProductId = "";
          draftBatchId = "";
          draftUnit = "";
          draftQty = 0;
        }
      } else {
        throw new Error(res?.error || "Gagal memuat stok obat cabang");
      }
    } catch (err) {
      branchProducts = [];
      draftProductId = "";
      draftBatchId = "";
      draftUnit = "";
      draftQty = 0;
      alertStore.toast(extractErrorMessage(err, "Gagal memuat stok cabang"), "danger");
    } finally {
      isLoadingBranchProducts = false;
    }
  }

  onMount(async () => {
    try {
      const branchRes = await api.branches.list();
      if (branchRes?.success && Array.isArray(branchRes.data)) {
        branches = branchRes.data;
      } else {
        throw new Error(branchRes?.error || "Gagal memuat daftar cabang");
      }

      const resolvedUserBranch = resolveBranchId(authStore.user?.branchId, branches);
      if (isAdminRole) {
        selectedBranchFilter = "ALL";
        formFromBranchId = resolvedUserBranch || branches[0]?.id || "";
      } else {
        selectedBranchFilter = resolvedUserBranch || branches[0]?.id || "";
        formFromBranchId = selectedBranchFilter;
      }

      const altDest = branches.find((b) => b.id !== formFromBranchId);
      formToBranchId = altDest?.id || "";

      await loadTransfers();
    } catch (err) {
      isLoadingTransfers = false;
      alertStore.danger("Gagal Memuat Data", extractErrorMessage(err));
    }
  });

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
  let formFromBranchId = $state("");
  let formToBranchId = $state("");
  let formCourierName = $state("");
  let formTransferNotes = $state("");

  // Draft item selector
  let draftProductId = $state("");
  let draftBatchId = $state("");
  let draftQty = $state(1);
  let draftUnit = $state("");

  let formItems = $state<DraftTransferRow[]>([]);

  let availableToBranches = $derived(
    branches.filter((b) => b.id !== formFromBranchId)
  );

  function getQueuedBaseForProductBatch(productId: string, batchId: string): number {
    return roundQty(
      formItems
        .filter((it) => it.productId === productId && it.batchId === batchId)
        .reduce((sum, it) => sum + Number(it.qtyBase || 0), 0)
    );
  }

  function getQueuedBaseForProduct(productId: string): number {
    return roundQty(
      formItems
        .filter((it) => it.productId === productId)
        .reduce((sum, it) => sum + Number(it.qtyBase || 0), 0)
    );
  }

  let selectedDraftProduct = $derived(
    branchProducts.find((p) => p.id === draftProductId) || branchProducts[0] || null
  );

  let availableDraftBatches = $derived.by(() => {
    if (!selectedDraftProduct) return [] as Array<BranchBatchMeta & { remainingBase: number }>;
    return selectedDraftProduct.batches
      .map((b) => ({
        ...b,
        remainingBase: roundQty(
          Math.max(0, b.stockBase - getQueuedBaseForProductBatch(selectedDraftProduct.id, b.batchId))
        )
      }))
      .filter((b) => b.remainingBase > 0);
  });

  let totalRemainingProductBase = $derived(
    roundQty(availableDraftBatches.reduce((sum, b) => sum + b.remainingBase, 0))
  );

  let selectedBatchObj = $derived(
    draftBatchId === "AUTO_FEFO"
      ? null
      : availableDraftBatches.find((b) => b.batchId === draftBatchId) || availableDraftBatches[0] || null
  );

  let availableBaseForSelection = $derived(
    draftBatchId === "AUTO_FEFO"
      ? totalRemainingProductBase
      : selectedBatchObj?.remainingBase || 0
  );

  let draftUnitOptions = $derived.by(() => {
    if (!selectedDraftProduct) return [];
    return selectedDraftProduct.units.map((u) => {
      const maxInUnit = Math.floor((availableBaseForSelection + 1e-6) / u.conversionFactor);
      return {
        value: u.unitName,
        label:
          u.conversionFactor > 1
            ? `${u.unitName} (${formatQty(u.conversionFactor)} ${selectedDraftProduct.baseUnit})`
            : u.unitName,
        badge: maxInUnit > 0 ? `Maks ${formatQty(maxInUnit)}` : "Kurang",
        badgeClass:
          maxInUnit > 0
            ? "bg-blue-50 text-[#1d63d8] border border-blue-200"
            : "bg-red-50 text-red-700 border border-red-200"
      };
    });
  });

  let selectedUnitMeta = $derived.by(() => {
    if (!selectedDraftProduct) return null;
    return (
      selectedDraftProduct.units.find((u) => u.unitName === draftUnit) ||
      selectedDraftProduct.units[0] ||
      null
    );
  });

  let selectedConversionFactor = $derived(selectedUnitMeta?.conversionFactor || 1);

  let maxDraftQty = $derived(
    selectedConversionFactor > 0
      ? Math.floor((availableBaseForSelection + 1e-6) / selectedConversionFactor)
      : 0
  );

  let draftRequestedBase = $derived(
    roundQty(Math.max(0, Number(draftQty) || 0) * selectedConversionFactor)
  );

  let draftValidationError = $derived.by(() => {
    if (!selectedDraftProduct) return "";
    if (availableBaseForSelection <= 0) {
      return `Stok ${selectedDraftProduct.name} pada pilihan ini sudah habis dialokasikan ke daftar pengiriman.`;
    }
    if (maxDraftQty <= 0) {
      return `Stok tersisa (${formatQty(availableBaseForSelection)} ${selectedDraftProduct.baseUnit}) kurang dari 1 ${draftUnit} (${selectedConversionFactor} ${selectedDraftProduct.baseUnit}). Pilih satuan lebih kecil.`;
    }
    const q = Number(draftQty);
    if (!Number.isFinite(q) || q <= 0) {
      return "Qty harus lebih dari 0.";
    }
    if (q > maxDraftQty) {
      return `Melebihi stok tersedia cabang (maksimal ${formatQty(maxDraftQty)} ${draftUnit} = ${formatQty(availableBaseForSelection)} ${selectedDraftProduct.baseUnit}).`;
    }
    return "";
  });

  function syncDraftDefaultsForProduct(prod: BranchProduct | undefined) {
    if (!prod) {
      draftProductId = "";
      draftBatchId = "";
      draftUnit = "";
      draftQty = 0;
      return;
    }

    draftProductId = prod.id;
    const remBatches = prod.batches
      .map((b) => ({
        ...b,
        remainingBase: roundQty(Math.max(0, b.stockBase - getQueuedBaseForProductBatch(prod.id, b.batchId)))
      }))
      .filter((b) => b.remainingBase > 0);

    if (remBatches.length > 1) {
      draftBatchId = "AUTO_FEFO";
    } else {
      draftBatchId = remBatches[0]?.batchId || "";
    }

    const availBase = remBatches.reduce((sum, b) => sum + b.remainingBase, 0);
    const preferredUnit =
      prod.units.find(
        (u) =>
          u.unitName === prod.defaultPurchaseUnit &&
          availBase >= u.conversionFactor
      ) ||
      prod.units.find((u) => u.isBaseUnit && availBase >= u.conversionFactor) ||
      prod.units.find((u) => availBase >= u.conversionFactor) ||
      prod.units[0];

    draftUnit = preferredUnit?.unitName || prod.baseUnit;
    const factor = preferredUnit?.conversionFactor || 1;
    const maxForUnit = Math.floor((availBase + 1e-6) / factor);
    draftQty = maxForUnit >= 1 ? 1 : 0;
  }

  async function openAddTransferModal() {
    if (branches.length < 2) {
      alertStore.warning(
        "Cabang Tidak Cukup",
        "Minimal dibutuhkan 2 cabang terdaftar untuk melakukan pengiriman stok antar cabang."
      );
      return;
    }

    const defaultFrom = isAdminRole
      ? selectedBranchFilter !== "ALL"
        ? selectedBranchFilter
        : userResolvedBranchId || branches[0]?.id || ""
      : userResolvedBranchId;

    formFromBranchId = defaultFrom;
    const firstDest = branches.find((b) => b.id !== formFromBranchId);
    formToBranchId = firstDest?.id || "";
    formCourierName = "";
    formTransferNotes = "";
    formItems = [];
    isAddTransferModalOpen = true;

    await loadBranchProducts(formFromBranchId);
  }

  async function handleFromBranchChange(newFromId: string) {
    formFromBranchId = newFromId;
    if (formToBranchId === newFromId) {
      const alt = branches.find((b) => b.id !== newFromId);
      formToBranchId = alt?.id || "";
    }
    formItems = [];
    await loadBranchProducts(newFromId);
  }

  function handleDraftProductChange(newProdId: string) {
    const prod = branchProducts.find((p) => p.id === newProdId);
    syncDraftDefaultsForProduct(prod);
  }

  function handleDraftBatchChange(newBatchId: string) {
    draftBatchId = newBatchId;
    if (!selectedDraftProduct) return;
    const batchAvail =
      newBatchId === "AUTO_FEFO"
        ? totalRemainingProductBase
        : availableDraftBatches.find((b) => b.batchId === newBatchId)?.remainingBase || 0;
    const factor = selectedUnitMeta?.conversionFactor || 1;
    const maxForUnit = Math.floor((batchAvail + 1e-6) / factor);
    if (maxForUnit <= 0) {
      const fittingUnit = selectedDraftProduct.units.find((u) => batchAvail >= u.conversionFactor);
      if (fittingUnit) {
        draftUnit = fittingUnit.unitName;
        draftQty = 1;
      } else {
        draftQty = 0;
      }
    } else if (draftQty > maxForUnit) {
      draftQty = maxForUnit;
    } else if (draftQty <= 0) {
      draftQty = 1;
    }
  }

  function handleDraftUnitChange(newUnitName: string) {
    draftUnit = newUnitName;
    if (!selectedDraftProduct) return;
    const unitObj = selectedDraftProduct.units.find((u) => u.unitName === newUnitName);
    const factor = unitObj?.conversionFactor || 1;
    const maxForUnit = Math.floor((availableBaseForSelection + 1e-6) / factor);
    if (maxForUnit <= 0) {
      draftQty = 0;
    } else if (draftQty > maxForUnit) {
      draftQty = maxForUnit;
    } else if (draftQty <= 0) {
      draftQty = 1;
    }
  }

  function pushOrMergeFormItem(row: DraftTransferRow) {
    const existingIdx = formItems.findIndex(
      (i) =>
        i.productId === row.productId &&
        i.batchId === row.batchId &&
        i.unit === row.unit
    );
    if (existingIdx !== -1) {
      formItems[existingIdx] = {
        ...formItems[existingIdx],
        qty: roundQty(formItems[existingIdx].qty + row.qty),
        qtyBase: roundQty(formItems[existingIdx].qtyBase + row.qtyBase)
      };
    } else {
      formItems = [...formItems, row];
    }
  }

  function addDraftItemToList() {
    if (!selectedDraftProduct || draftValidationError) return;
    const factor = selectedConversionFactor;
    const neededBase = roundQty(Number(draftQty) * factor);

    if (draftBatchId === "AUTO_FEFO") {
      const fefoResult = selectFefoBatches(
        availableDraftBatches.map((b) => ({
          batchId: b.batchId,
          batchNo: b.batchNumber,
          expiredDate: b.expiryDate,
          qtyBase: b.remainingBase
        })),
        neededBase
      );

      if (!fefoResult.isFullyAllocated) {
        alertStore.warning(
          "Stok Tidak Mencukupi",
          `Stok ${selectedDraftProduct.name} di cabang asal hanya tersisa ${formatQty(fefoResult.allocatedQtyBase)} ${selectedDraftProduct.baseUnit}.`
        );
        return;
      }

      for (const alloc of fefoResult.batches) {
        const batchMeta = availableDraftBatches.find((b) => b.batchId === alloc.batchId);
        const exactPackCount = alloc.allocatedQtyBase / factor;
        const canUseSelectedUnit = Math.abs(exactPackCount - Math.round(exactPackCount)) < 1e-6;

        pushOrMergeFormItem({
          productId: selectedDraftProduct.id,
          productName: selectedDraftProduct.name,
          batchId: alloc.batchId,
          batchNumber: alloc.batchNo || batchMeta?.batchNumber || "BATCH-REG",
          expiryDate: alloc.expiredDate,
          locationId: batchMeta?.locationId || "",
          qty: canUseSelectedUnit ? Math.round(exactPackCount) : roundQty(alloc.allocatedQtyBase),
          unit: canUseSelectedUnit ? draftUnit : selectedDraftProduct.baseUnit,
          conversionFactor: canUseSelectedUnit ? factor : 1,
          qtyBase: roundQty(alloc.allocatedQtyBase),
          baseUnit: selectedDraftProduct.baseUnit
        });
      }
    } else if (selectedBatchObj) {
      pushOrMergeFormItem({
        productId: selectedDraftProduct.id,
        productName: selectedDraftProduct.name,
        batchId: selectedBatchObj.batchId,
        batchNumber: selectedBatchObj.batchNumber,
        expiryDate: selectedBatchObj.expiryDate,
        locationId: selectedBatchObj.locationId,
        qty: roundQty(Number(draftQty)),
        unit: draftUnit,
        conversionFactor: factor,
        qtyBase: neededBase,
        baseUnit: selectedDraftProduct.baseUnit
      });
    }

    // Refresh selection defaults after subtracting newly queued qty
    const remBatches = selectedDraftProduct.batches
      .map((b) => ({
        ...b,
        remainingBase: roundQty(
          Math.max(0, b.stockBase - getQueuedBaseForProductBatch(selectedDraftProduct.id, b.batchId))
        )
      }))
      .filter((b) => b.remainingBase > 0);

    if (remBatches.length > 0) {
      if (draftBatchId !== "AUTO_FEFO" && !remBatches.some((b) => b.batchId === draftBatchId)) {
        draftBatchId = remBatches.length > 1 ? "AUTO_FEFO" : remBatches[0].batchId;
      } else if (remBatches.length === 1 && draftBatchId === "AUTO_FEFO") {
        draftBatchId = remBatches[0].batchId;
      }
      const nextAvail =
        draftBatchId === "AUTO_FEFO"
          ? remBatches.reduce((sum, b) => sum + b.remainingBase, 0)
          : remBatches.find((b) => b.batchId === draftBatchId)?.remainingBase || 0;
      if (nextAvail < factor) {
        const fittingUnit = selectedDraftProduct.units.find((u) => nextAvail >= u.conversionFactor);
        if (fittingUnit) {
          draftUnit = fittingUnit.unitName;
          draftQty = 1;
        } else {
          draftQty = 0;
        }
      } else {
        draftQty = 1;
      }
    } else {
      const nextProd = branchProducts.find((p) => {
        const rem = roundQty(p.totalStockBase - getQueuedBaseForProduct(p.id));
        return rem > 0;
      });
      if (nextProd && nextProd.id !== selectedDraftProduct.id) {
        syncDraftDefaultsForProduct(nextProd);
      } else {
        draftBatchId = "";
        draftQty = 0;
      }
    }
  }

  function removeDraftItem(index: number) {
    formItems = formItems.filter((_, i) => i !== index);
    if (selectedDraftProduct) {
      const remBatches = selectedDraftProduct.batches
        .map((b) => ({
          ...b,
          remainingBase: roundQty(
            Math.max(0, b.stockBase - getQueuedBaseForProductBatch(selectedDraftProduct.id, b.batchId))
          )
        }))
        .filter((b) => b.remainingBase > 0);
      if (remBatches.length > 0) {
        const hasValidBatch =
          (draftBatchId === "AUTO_FEFO" && remBatches.length > 1) ||
          remBatches.some((b) => b.batchId === draftBatchId);
        if (!hasValidBatch) {
          draftBatchId = remBatches.length > 1 ? "AUTO_FEFO" : remBatches[0].batchId;
        }
        const availBase =
          draftBatchId === "AUTO_FEFO"
            ? remBatches.reduce((sum, b) => sum + b.remainingBase, 0)
            : remBatches.find((b) => b.batchId === draftBatchId)?.remainingBase || 0;
        const unitObj = selectedDraftProduct.units.find((u) => u.unitName === draftUnit);
        const factor = unitObj?.conversionFactor || 1;
        if (draftQty <= 0 && availBase >= factor) {
          draftQty = 1;
        }
      }
    }
  }

  async function submitNewTransfer() {
    if (formItems.length === 0 || isSubmitting) return;
    if (!formFromBranchId || !formToBranchId || formFromBranchId === formToBranchId) {
      alertStore.warning("Cabang Tidak Valid", "Pilih cabang pengirim dan cabang penerima yang berbeda.");
      return;
    }

    const fromBranch = branches.find((b) => b.id === formFromBranchId);
    const toBranch = branches.find((b) => b.id === formToBranchId);

    isSubmitting = true;
    try {
      const res = await api.transfer.create({
        fromBranchId: formFromBranchId,
        toBranchId: formToBranchId,
        courierName: formCourierName.trim() || undefined,
        operator: authStore.user?.fullName || undefined,
        status: "IN_TRANSIT",
        notes: formTransferNotes.trim() || undefined,
        items: formItems.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          batchId: it.batchId,
          batchNumber: it.batchNumber,
          expiryDate: it.expiryDate || undefined,
          locationId: it.locationId || undefined,
          qty: it.qty,
          unit: it.unit
        }))
      });

      if (!res?.success || !res.data) {
        throw new Error(res?.error || res?.message || "Gagal menerbitkan surat jalan");
      }

      isAddTransferModalOpen = false;
      await loadTransfers();

      notificationBanner = {
        message: `Surat Jalan ${res.data.transferNumber} berhasil diterbitkan (Status: DI JALAN)!`,
        subtext: `Stok cabang asal (${fromBranch?.name || res.data.fromBranchName}) telah dipotong (TRANSFER_OUT) dan siap diverifikasi oleh ${toBranch?.name || res.data.toBranchName}.`
      };
      alertStore.toast(`Surat Jalan ${res.data.transferNumber} berhasil dikirim`, "success");
    } catch (err) {
      alertStore.danger("Gagal Menerbitkan Surat Jalan", extractErrorMessage(err));
    } finally {
      isSubmitting = false;
    }
  }

  // Dispatch a REQUESTED transfer
  async function dispatchRequestedTransfer(trf: TransferDoc) {
    if (dispatchingId) return;
    dispatchingId = trf.id;
    try {
      const res = await api.transfer.dispatch(
        trf.id,
        trf.courierName || undefined,
        authStore.user?.fullName || undefined
      );
      if (!res?.success) {
        throw new Error(res?.error || res?.message || "Gagal memberangkatkan pengiriman");
      }
      await loadTransfers();
      notificationBanner = {
        message: `Permintaan ${trf.transferNumber} telah diberangkatkan (Status: DI JALAN)!`,
        subtext: `Stok ${trf.fromBranchName} telah dipotong dan barang sedang dikirim menuju ${trf.toBranchName}.`
      };
      alertStore.toast(`Surat jalan ${trf.transferNumber} diberangkatkan`, "success");
    } catch (err) {
      alertStore.danger("Gagal Memberangkatkan Pengiriman", extractErrorMessage(err));
    } finally {
      dispatchingId = null;
    }
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
      return roundQty(actual) !== roundQty(item.qty);
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
    if (!receivingTransfer || isSubmitting) return;

    let anyDiff = false;
    const itemPayload = receivingTransfer.items.map((item, idx) => {
      const recQty = roundQty(Math.max(0, Number(receiveCounts[idx] ?? item.qty)));
      const diff = roundQty(recQty - item.qty);
      if (diff !== 0) anyDiff = true;
      return {
        lineNo: item.lineNo || idx + 1,
        qtyReceived: recQty,
        discrepancyReason:
          diff !== 0 ? receiveReasons[idx]?.trim() || "Selisih hitung saat penerimaan" : undefined
      };
    });

    isSubmitting = true;
    try {
      const res = await api.transfer.receive(receivingTransfer.id, {
        receivedBy: authStore.user?.fullName || undefined,
        receiptNotes:
          receiveGeneralNotes.trim() ||
          (anyDiff ? "Diterima dengan catatan selisih fisik" : "Diterima lengkap dan cocok"),
        items: itemPayload
      });

      if (!res?.success || !res.data) {
        throw new Error(res?.error || res?.message || "Gagal memverifikasi penerimaan barang");
      }

      const docNo = receivingTransfer.transferNumber;
      const destName = receivingTransfer.toBranchName;
      const rtbNo = res.data.receiptNumber || `RTB-${docNo.replace(/^(RKB|SJL)-/, "")}`;

      isReceiveModalOpen = false;
      await loadTransfers();

      notificationBanner = {
        message: anyDiff
          ? `Penerimaan ${rtbNo} (${docNo}) disimpan dengan Status: DITERIMA SELISIH!`
          : `Penerimaan ${rtbNo} (${docNo}) selesai diverifikasi 100% Cocok!`,
        subtext: `Stok di ${destName} telah ditambahkan (TRANSFER_IN) sesuai jumlah fisik diterima.`
      };
      alertStore.toast(res.message || `Penerimaan ${rtbNo} tersimpan`, anyDiff ? "warning" : "success");
    } catch (err) {
      alertStore.danger("Gagal Verifikasi Penerimaan", extractErrorMessage(err));
    } finally {
      isSubmitting = false;
    }
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

  function canReceiveTransfer(trf: TransferDoc): boolean {
    if (isAdminRole) return true;
    return trf.toBranchId === userResolvedBranchId;
  }

  function canDispatchTransfer(trf: TransferDoc): boolean {
    if (isAdminRole) return true;
    return trf.fromBranchId === userResolvedBranchId;
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
      {#if isAdminRole}
        <Select
          bind:value={selectedBranchFilter}
          icon={Store}
          variant="soft"
          size="sm"
          align="right"
          onchange={() => loadTransfers()}
          options={[
            { value: "ALL", label: "Semua Cabang (Konsolidasi)" },
            ...branches.map((b) => ({
              value: b.id,
              label: b.name,
              sublabel: b.address || b.code
            }))
          ]}
        />
      {:else}
        <div
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs"
          title="Cabang Penugasan"
        >
          <Store class="w-3.5 h-3.5 text-brand-blue" />
          <span>
            {authStore.user?.branchName ||
              branches.find((b) => b.id === selectedBranchFilter)?.name ||
              "Cabang Aktif"}
          </span>
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
      <th class="py-3 px-4">Cabang</th>
      <th class="py-3 px-4">Cabang Tujuan</th>
      <th class="py-3 px-4">Waktu</th>
      <th class="py-3 px-4">Rincian Barang</th>
      <th class="py-3 px-4 text-center">Status</th>
      <th class="py-3 px-4 text-center">Aksi</th>
    {/snippet}

    {#snippet rows()}
      {#if isLoadingTransfers}
        <tr>
          <td colspan="7" class="text-center py-12 text-slate-400">
            <Loader2 class="w-8 h-8 mx-auto mb-2 animate-spin text-brand-blue" />
            <p class="font-medium text-xs">Memuat riwayat surat jalan dari database...</p>
          </td>
        </tr>
      {:else if filteredTransfers.length === 0}
        <tr>
          <td colspan="7" class="text-center py-12 text-slate-400">
            <Truck class="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p class="font-medium text-sm">Tidak ada data surat jalan atau mutasi cabang</p>
            <p class="text-xs text-slate-400">Gunakan tombol "Kirim Barang Baru" untuk memulai pengiriman antarcabang.</p>
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
              <div class="font-mono text-slate-600 text-[11px]">{formatDateTime(t.transferDate)}</div>
              {#if t.courierName}
                <div class="text-[11px] text-slate-400 mt-0.5">{t.courierName}</div>
              {/if}
            </td>
            <td class="py-3.5 px-4">
              <div class="space-y-1">
                {#each t.items as item}
                  {@const packHint = formatPackHint(item.qty, item.unit, item.units)}
                  <div class="text-[11px] text-slate-700 font-medium flex items-center gap-1.5 flex-wrap">
                    <span>&bull; {item.productName}</span>
                    <span class="font-bold text-slate-900">
                      ({formatQty(item.qty)} {item.unit}{#if packHint} &approx; {packHint}{/if})
                    </span>
                    <span class="text-slate-400 font-mono text-[10px]">[{item.batchNumber}]</span>
                    {#if item.discrepancyQty !== undefined && item.discrepancyQty !== 0}
                      <span class="px-1.5 py-0.5 rounded bg-red-100 text-brand-red-700 font-mono font-bold text-[10px]">
                        Fisik: {formatQty(item.receivedQty ?? 0)} (Selisih {item.discrepancyQty > 0 ? `+${formatQty(item.discrepancyQty)}` : formatQty(item.discrepancyQty)})
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
                  {#if canReceiveTransfer(t)}
                    <button
                      type="button"
                      onclick={() => openReceiveModal(t)}
                      class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors shadow-xs"
                    >
                      Terima
                    </button>
                  {:else}
                    <span class="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                      Menunggu Tujuan
                    </span>
                  {/if}
                {:else if t.status === "REQUESTED"}
                  {#if canDispatchTransfer(t)}
                    <button
                      type="button"
                      disabled={dispatchingId === t.id}
                      onclick={() => dispatchRequestedTransfer(t)}
                      class="px-2.5 py-1 rounded-lg bg-brand-blue-600 hover:bg-brand-blue-700 disabled:opacity-50 text-white font-bold text-[11px] inline-flex items-center gap-1 transition-colors shadow-xs"
                    >
                      {#if dispatchingId === t.id}
                        <Loader2 class="w-3 h-3 animate-spin" />
                      {:else}
                        <Send class="w-3 h-3" />
                      {/if}
                      <span>Kirim</span>
                    </button>
                  {:else}
                    <span class="px-2 py-1 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-semibold">
                      Menunggu Asal
                    </span>
                  {/if}
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
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] flex flex-col">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3 flex-shrink-0">
        <div>
          <div class="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Truck class="w-5 h-5 text-brand-blue" />
            <span>Buat Pengiriman / Surat Jalan Baru (RKB)</span>
          </div>
          <p class="text-[11px] text-slate-500 mt-0.5">
            Hanya menampilkan obat yang memiliki stok di cabang pengirim. Stok dipotong otomatis saat diterbitkan.
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

      <div class="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-minimalist">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            {#if isAdminRole}
              <label for="trf-from" class="font-bold text-slate-700 block mb-1">Cabang Pengirim (Asal)</label>
              <Select
                id="trf-from"
                bind:value={formFromBranchId}
                onchange={(val) => handleFromBranchChange(val)}
                options={branches.map((b) => ({
                  value: b.id,
                  label: b.name,
                  sublabel: `Kode: ${b.code}${b.address ? ` • ${b.address}` : ""}`
                }))}
              />
            {:else}
              <span class="font-bold text-slate-700 block mb-1">Cabang Pengirim (Asal)</span>
              <div class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-2">
                <Store class="w-4 h-4 text-brand-blue" />
                <span>
                  {branches.find((b) => b.id === formFromBranchId)?.name ||
                    authStore.user?.branchName ||
                    "Cabang Asal"}
                </span>
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
                sublabel: `Kode: ${b.code}${b.address ? ` • ${b.address}` : ""}`
              }))}
            />
          </div>

          <div>
            <label for="trf-courier" class="font-bold text-slate-700 block mb-1">Petugas Pengantar / Kurir</label>
            <input
              id="trf-courier"
              type="text"
              bind:value={formCourierName}
              placeholder="Contoh: Kurir Internal / Ekspedisi"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:bg-white focus:outline-none focus:border-brand-blue"
            />
          </div>
          <div>
            <label for="trf-notes" class="font-bold text-slate-700 block mb-1">Catatan Surat Jalan</label>
            <input
              id="trf-notes"
              type="text"
              bind:value={formTransferNotes}
              placeholder="Contoh: Distribusi stok rutin mingguan..."
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:outline-none focus:border-brand-blue"
            />
          </div>
        </div>

        <!-- Add Item Box -->
        <div class="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-3 text-xs">
          <div class="flex items-center justify-between gap-2">
            <span class="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
              Tambah Obat ke Daftar Surat Jalan (Stok Cabang Asal)
            </span>
            <span class="text-[11px] text-slate-500 font-semibold">
              {branchProducts.length} obat tersedia
            </span>
          </div>

          {#if isLoadingBranchProducts}
            <div class="py-6 flex items-center justify-center gap-2 text-slate-500">
              <Loader2 class="w-4 h-4 animate-spin text-brand-blue" />
              <span>Memuat daftar obat yang tersedia di cabang...</span>
            </div>
          {:else if branchProducts.length === 0}
            <div class="py-5 px-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center gap-2.5 text-amber-800">
              <AlertTriangle class="w-4 h-4 flex-shrink-0 text-amber-600" />
              <div>
                <div class="text-[11px] text-amber-700">
                  Cabang <strong>{branches.find((b) => b.id === formFromBranchId)?.name || "asal"}</strong> belum memiliki stok obat untuk dikirim. Pilih cabang pengirim lain atau lakukan pemesanan dan penerimaan stok terlebih dahulu untuk cabang ini.
                </div>
              </div>
            </div>
          {:else}
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              <div class="sm:col-span-6">
                <label for="trf-item" class="font-semibold text-slate-600 block mb-1">Pilih Obat (Tersedia di Cabang)</label>
                <SearchableSelect
                  id="trf-item"
                  bind:value={draftProductId}
                  variant="white"
                  size="sm"
                  searchPlaceholder="Cari nama obat, SKU, atau batch..."
                  onchange={(val) => handleDraftProductChange(val)}
                  options={branchProducts.map((p) => {
                    const remTotal = roundQty(Math.max(0, p.totalStockBase - getQueuedBaseForProduct(p.id)));
                    const packText = formatPackHint(remTotal, p.baseUnit, p.units);
                    const firstBatch = p.batches[0];
                    return {
                      value: p.id,
                      label: p.name,
                      sublabel: `SKU: ${p.sku} • Batch FEFO: ${firstBatch?.batchNumber || "-"}${firstBatch?.expiryDate ? ` (ED: ${firstBatch.expiryDate})` : ""}${packText ? ` • ≈ ${packText}` : ""}`,
                      badge: `${formatQty(remTotal)} ${p.baseUnit}`,
                      badgeClass:
                        remTotal > 0
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                    };
                  })}
                />
              </div>

              <div class="sm:col-span-6">
                <label for="trf-batch" class="font-semibold text-slate-600 block mb-1">Batch Sumber (FEFO)</label>
                <Select
                  id="trf-batch"
                  bind:value={draftBatchId}
                  variant="white"
                  size="sm"
                  disabled={availableDraftBatches.length === 0}
                  onchange={(val) => handleDraftBatchChange(val)}
                  options={[
                    ...(availableDraftBatches.length > 1
                      ? [
                          {
                            value: "AUTO_FEFO",
                            label: "Otomatis FEFO (ED Terdekat)",
                            sublabel: `${availableDraftBatches.length} batch tersedia di cabang`,
                            badge: `${formatQty(totalRemainingProductBase)} ${selectedDraftProduct?.baseUnit || ""}`
                          }
                        ]
                      : []),
                    ...availableDraftBatches.map((b) => ({
                      value: b.batchId,
                      label: `${b.batchNumber}${b.expiryDate ? ` (ED: ${b.expiryDate})` : ""}`,
                      sublabel: b.locationName,
                      badge: `${formatQty(b.remainingBase)} ${selectedDraftProduct?.baseUnit || ""}`
                    }))
                  ]}
                />
              </div>

              <div class="sm:col-span-4">
                <label for="trf-qty" class="font-semibold text-slate-600 block mb-1">
                  Qty (Maks: {formatQty(maxDraftQty)})
                </label>
                <input
                  id="trf-qty"
                  type="number"
                  min={maxDraftQty > 0 ? 1 : 0}
                  max={maxDraftQty}
                  step="any"
                  bind:value={draftQty}
                  disabled={maxDraftQty <= 0}
                  class="w-full bg-white border {draftValidationError ? 'border-red-300 text-red-700' : 'border-slate-200 text-slate-900'} rounded-xl px-2.5 py-1.5 font-mono font-bold text-center focus:outline-none focus:border-brand-blue disabled:bg-slate-100"
                />
              </div>

              <div class="sm:col-span-5">
                <label for="trf-unit" class="font-semibold text-slate-600 block mb-1">Satuan Produk</label>
                <Select
                  id="trf-unit"
                  bind:value={draftUnit}
                  variant="white"
                  size="sm"
                  onchange={(val) => handleDraftUnitChange(val)}
                  options={draftUnitOptions}
                />
              </div>

              <div class="sm:col-span-3">
                <button
                  type="button"
                  disabled={!selectedDraftProduct || Boolean(draftValidationError)}
                  onclick={addDraftItemToList}
                  class="w-full py-1.5 px-3 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 disabled:opacity-45 disabled:cursor-not-allowed text-white font-bold text-xs inline-flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus class="w-3.5 h-3.5" />
                  <span>Tambah</span>
                </button>
              </div>
            </div>

            {#if selectedDraftProduct}
              <div class="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                <span class="text-slate-600">
                  Stok tersedia:
                  <strong class="text-slate-900 font-mono">
                    {formatQty(availableBaseForSelection)} {selectedDraftProduct.baseUnit}
                  </strong>
                  {#if selectedConversionFactor > 1 && Number(draftQty) > 0 && !draftValidationError}
                    <span class="text-brand-blue-700 font-semibold ml-1.5">
                      (&rarr; {formatQty(draftRequestedBase)} {selectedDraftProduct.baseUnit})
                    </span>
                  {/if}
                </span>
                {#if draftValidationError}
                  <span class="text-brand-red-600 font-semibold">{draftValidationError}</span>
                {/if}
              </div>
            {/if}
          {/if}
        </div>

        <!-- Items List Table -->
        <div class="border border-slate-200 rounded-xl overflow-hidden">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-100 text-slate-600 font-bold text-[10px] uppercase">
              <tr>
                <th class="py-2 px-3">Nama Obat</th>
                <th class="py-2 px-3">No. Batch & ED</th>
                <th class="py-2 px-3 text-right">Qty Dikirim</th>
                <th class="py-2 px-3 text-center w-12">Hapus</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              {#if formItems.length === 0}
                <tr>
                  <td colspan="4" class="py-6 text-center text-slate-400">
                    <Package class="w-6 h-6 mx-auto mb-1 opacity-40" />
                    <span>Belum ada item obat yang ditambahkan ke Surat Jalan.</span>
                  </td>
                </tr>
              {:else}
                {#each formItems as item, idx}
                  <tr>
                    <td class="py-2 px-3 font-bold text-slate-800">{item.productName}</td>
                    <td class="py-2 px-3 font-mono text-slate-600 text-[11px]">
                      <div>{item.batchNumber}</div>
                      {#if item.expiryDate}
                        <div class="text-[10px] text-slate-400">ED: {item.expiryDate}</div>
                      {/if}
                    </td>
                    <td class="py-2 px-3 text-right font-mono">
                      <div class="font-black text-brand-blue-700">
                        {formatQty(item.qty)} {item.unit}
                      </div>
                      {#if item.conversionFactor > 1}
                        <div class="text-[10px] text-slate-500">
                          = {formatQty(item.qtyBase)} {item.baseUnit}
                        </div>
                      {/if}
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
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-end gap-2 flex-shrink-0">
        <button
          type="button"
          onclick={() => (isAddTransferModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={formItems.length === 0 || isSubmitting || !formToBranchId}
          onclick={submitNewTransfer}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 disabled:opacity-50 text-white font-bold text-xs shadow-sm inline-flex items-center gap-1.5"
        >
          {#if isSubmitting}
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
            <span>Menyimpan...</span>
          {:else}
            <span>Terbitkan & Kirim Surat Jalan ({formItems.length} Item)</span>
          {/if}
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
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] flex flex-col">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3 flex-shrink-0">
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

      <div class="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-minimalist">
        <div class="border border-slate-200 rounded-xl overflow-hidden">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-100 text-slate-600 font-bold text-[10px] uppercase">
              <tr>
                <th class="py-2.5 px-3">Nama Obat & Batch</th>
                <th class="py-2.5 px-3 text-right">Qty Surat Jalan</th>
                <th class="py-2.5 px-3 text-center w-36">Qty Fisik Diterima</th>
                <th class="py-2.5 px-3 text-center">Selisih</th>
                <th class="py-2.5 px-3">Keterangan Selisih</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              {#each receivingTransfer.items as item, idx}
                {@const recQty = receiveCounts[idx] ?? item.qty}
                {@const diff = roundQty(recQty - item.qty)}
                {@const sentPackHint = formatPackHint(item.qty, item.unit, item.units)}
                {@const recPackHint = formatPackHint(recQty, item.unit, item.units)}
                <tr class={diff !== 0 ? "bg-red-50/40" : ""}>
                  <td class="py-2.5 px-3">
                    <div class="font-bold text-slate-900">{item.productName}</div>
                    <div class="text-[10px] font-mono text-slate-500">
                      Batch: {item.batchNumber}{#if item.expiryDate} &bull; ED: {item.expiryDate}{/if}
                    </div>
                  </td>
                  <td class="py-2.5 px-3 text-right font-mono">
                    <div class="font-bold text-slate-700">{formatQty(item.qty)} {item.unit}</div>
                    {#if sentPackHint}
                      <div class="text-[10px] text-slate-400">&approx; {sentPackHint}</div>
                    {/if}
                  </td>
                  <td class="py-2.5 px-3 text-center">
                    <div class="inline-flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={recQty}
                        oninput={(e) => {
                          const val = Number((e.target as HTMLInputElement).value);
                          receiveCounts[idx] = isNaN(val) || val < 0 ? 0 : val;
                        }}
                        class="w-20 text-center font-mono font-black px-2 py-1 rounded-lg border {diff !== 0 ? 'border-red-400 bg-white text-brand-red-700' : 'border-emerald-300 bg-emerald-50/40 text-emerald-900'}"
                      />
                      <span class="text-[10px] font-bold text-slate-500">{item.unit}</span>
                    </div>
                    {#if recPackHint}
                      <div class="text-[10px] font-mono text-slate-400 mt-0.5">&approx; {recPackHint}</div>
                    {/if}
                  </td>
                  <td class="py-2.5 px-3 text-center font-mono font-black">
                    {#if diff === 0}
                      <span class="text-emerald-600 text-[11px]">Cocok</span>
                    {:else}
                      <span class="text-brand-red-600">{diff > 0 ? `+${formatQty(diff)}` : formatQty(diff)} {item.unit}</span>
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
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:outline-none focus:border-brand-blue"
          />
        </div>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-between gap-2 flex-shrink-0">
        <span class="text-[11px] text-slate-500">
          Penerima: <strong>{authStore.user?.fullName || "Petugas Penerima"}</strong>
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
            disabled={isSubmitting}
            onclick={submitReceiveVerification}
            class="px-4 py-2 rounded-xl {receiveHasDiscrepancy ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} disabled:opacity-50 text-white font-bold text-xs shadow-sm inline-flex items-center gap-1.5"
          >
            {#if isSubmitting}
              <Loader2 class="w-4 h-4 animate-spin" />
              <span>Menyimpan...</span>
            {:else}
              <CheckCircle2 class="w-4 h-4" />
              <span>
                {receiveHasDiscrepancy ? "Simpan Penerimaan (Ada Selisih)" : "Konfirmasi Terima Lengkap"}
              </span>
            {/if}
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
    <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto text-xs max-h-[92vh] overflow-y-auto scrollbar-minimalist">
      <div class="flex items-start justify-between border-b border-slate-200 pb-3">
        <div>
          <div class="text-[10px] font-bold uppercase tracking-widest text-brand-blue">
            DOKUMEN SURAT JALAN MUTASI APOTEK HAFIDZ FARMA
          </div>
          <div class="flex items-center gap-2 mt-0.5">
            <h3 class="text-base font-black text-slate-900 font-mono">
              {selectedTransferForDetail.transferNumber}
            </h3>
            {#if selectedTransferForDetail.receiptNumber}
              <span class="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-bold text-[10px]">
                {selectedTransferForDetail.receiptNumber}
              </span>
            {/if}
          </div>
          <div class="text-[11px] text-slate-500 mt-0.5">
            Waktu Kirim: {formatDateTime(selectedTransferForDetail.transferDate)}
            {#if selectedTransferForDetail.receivedDate}
              &bull; Waktu Terima: {formatDateTime(selectedTransferForDetail.receivedDate)}
            {/if}
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
            <th class="py-2 px-3 border-b border-slate-200">Batch & ED</th>
            <th class="py-2 px-3 border-b border-slate-200 text-right">Qty Kirim</th>
            <th class="py-2 px-3 border-b border-slate-200 text-right">Qty Terima</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each selectedTransferForDetail.items as item}
            {@const sentHint = formatPackHint(item.qty, item.unit, item.units)}
            <tr>
              <td class="py-2 px-3">
                <div class="font-bold text-slate-800">{item.productName}</div>
                {#if item.discrepancyReason}
                  <div class="text-[10px] text-brand-red-600 mt-0.5">
                    Selisih ({item.discrepancyQty && item.discrepancyQty > 0 ? `+${formatQty(item.discrepancyQty)}` : formatQty(item.discrepancyQty ?? 0)} {item.unit}): {item.discrepancyReason}
                  </div>
                {/if}
              </td>
              <td class="py-2 px-3 font-mono text-slate-600 text-[11px]">
                <div>{item.batchNumber}</div>
                {#if item.expiryDate}
                  <div class="text-[10px] text-slate-400">ED: {item.expiryDate}</div>
                {/if}
              </td>
              <td class="py-2 px-3 text-right font-mono font-bold">
                <div>{formatQty(item.qty)} {item.unit}</div>
                {#if sentHint}
                  <div class="text-[10px] font-normal text-slate-400">&approx; {sentHint}</div>
                {/if}
              </td>
              <td class="py-2 px-3 text-right font-mono font-bold">
                {item.receivedQty !== undefined ? `${formatQty(item.receivedQty)} ${item.unit}` : "-"}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      {#if selectedTransferForDetail.notes || selectedTransferForDetail.receiptNotes}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/70">
          {#if selectedTransferForDetail.notes}
            <div>
              <span class="font-bold text-slate-500">Catatan Pengiriman:</span>
              <span class="text-slate-700 ml-1">{selectedTransferForDetail.notes}</span>
            </div>
          {/if}
          {#if selectedTransferForDetail.receiptNotes}
            <div>
              <span class="font-bold text-slate-500">Catatan Penerimaan:</span>
              <span class="text-slate-700 ml-1">{selectedTransferForDetail.receiptNotes}</span>
            </div>
          {/if}
        </div>
      {/if}

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
