<script lang="ts">
  import { onMount } from "svelte";
  import {
    Package,
    Plus,
    ClipboardCheck,
    AlertTriangle,
    Clock,
    ArrowUpDown,
    Layers,
    DollarSign,
    Store,
    CheckCircle2,
    X,
    FileSpreadsheet,
    Edit3,
    TrendingDown,
    TrendingUp,
    Scale,
    Check,
    Info,
    ArrowRight,
    ChevronLeft,
    ChevronRight,
    Search,
    Trash2
  } from "lucide-svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import SortableTh from "$lib/components/ui/SortableTh.svelte";
  import { compareTableValues, type SortDirection, type SortState } from "$lib/components/ui/DataTable.types";
  import Badge from "$lib/components/ui/Badge.svelte";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { portal } from "$lib/actions/portal";
  import { mockApi } from "$lib/services/mock-api";
  import { api } from "$lib/services/api";
  import { alertStore } from "$lib/stores/alertStore.svelte";
  import { tenantStore } from "$lib/stores/tenantStore.svelte";
  import {
    formatRupiah,
    calculateStockDifference,
    generateAdjustmentNumber,
    evaluateExpiryStatus,
    type ExpiryColorLevel
  } from "@apoteku/core";

  // Types for Ledger & Adjustment History
  interface LedgerEntry {
    id: string;
    branchId?: string;
    branchName?: string;
    productId: string;
    productName: string;
    sku?: string;
    date: string;
    rawDate?: string;
    refNumber: string;
    type: string;
    rawMutationType?: string;
    batch: string;
    expiryDate?: string;
    qtyIn: number;
    qtyOut: number;
    balance: number;
    unit: string;
    notes: string;
    operator: string;
  }

  interface OpnameAdjustmentRecord {
    id: string;
    docNumber: string;
    date: string;
    branchId: string;
    productId: string;
    productName: string;
    sku: string;
    batchId: string;
    batchNumber: string;
    unit: string;
    systemQty: number;
    actualQty: number;
    differenceQty: number; // actualQty - systemQty
    costPerUnit: number;
    valueDifference: number; // differenceQty * costPerUnit
    reasonType: "STOCK_OPNAME" | "DAMAGED" | "EXPIRED" | "DISCREPANCY";
    notes: string;
    operator: string;
  }

  let products = $state<any[]>([]);
  let categories = $state<any[]>([
    { id: "ALL", name: "Semua Kategori" },
    { id: "cat-1", name: "Obat Bebas & Alkes" },
    { id: "cat-2", name: "Obat Bebas Terbatas" },
    { id: "cat-3", name: "Obat Keras" },
    { id: "cat-4", name: "Narkotika & Psikotropika" },
    { id: "cat-5", name: "Herbal & Suplemen" }
  ]);
  let branches = $state<any[]>([]);

  // Active Tab: 4 comprehensive tabs
  let activeTab = $state<"katalog" | "kartu_stok" | "riwayat_opname" | "ed_defekta">("katalog");

  // Wewenang Akses Fitur Stok Opname & Koreksi Manual (Sentralisasi @apoteku/core via authStore)
  const canPerformOpname = $derived(authStore.can("inventory:opname"));
  const canAdjust = $derived(authStore.can("inventory:adjust"));
  const canManageStock = $derived(canPerformOpname || canAdjust);

  $effect(() => {
    if (!canPerformOpname && activeTab === "riwayat_opname") {
      activeTab = "katalog";
    }
  });

  // Filter States
  let searchQuery = $state("");
  let selectedCategory = $state("ALL");
  let selectedBranchId = $state(!authStore.user?.branchId || authStore.user.branchId === "ALL" ? "1" : authStore.user.branchId);
  let selectedProductIdForCard = $state<string>("");

  async function fetchProducts(force = true) {
    try {
      await mockApi.ensureDataLoaded(selectedBranchId, force);
      const [liveProds, liveBranches] = await Promise.all([
        mockApi.searchProducts({ branchId: selectedBranchId, forceReload: force }),
        mockApi.getBranches()
      ]);
      if (liveProds && liveProds.length > 0) {
        products = liveProds as any;
        if (!selectedProductIdForCard && products[0]) {
          selectedProductIdForCard = products[0].id;
        }
      }
      if (liveBranches && liveBranches.length > 0) {
        branches = liveBranches as any;
      }
    } catch (_) {}
  }

  async function loadOpnameHistory() {
    try {
      const res = await api.inventory.getOpnameHistory({ branchId: selectedBranchId });
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        const loaded: OpnameAdjustmentRecord[] = [];
        for (const doc of res.data) {
          for (const item of (doc.items || [])) {
            loaded.push({
              id: item.id || `adj-${doc.id}`,
              docNumber: doc.docNumber,
              date: doc.date,
              branchId: doc.branchId,
              productId: item.productId,
              productName: item.productName,
              sku: item.sku,
              batchId: item.batchId,
              batchNumber: item.batchNumber,
              unit: item.unit,
              systemQty: item.systemQty,
              actualQty: item.actualQty,
              differenceQty: item.differenceQty,
              costPerUnit: item.costPerUnit,
              valueDifference: item.valueDifference,
              reasonType: "STOCK_OPNAME",
              notes: item.notes || doc.reason,
              operator: doc.operatorName || "Petugas Apotek"
            });
          }
        }
        if (loaded.length > 0) {
          opnameHistory = loaded;
        }
      }
    } catch (_) {}
  }

  async function loadStockLedger() {
    try {
      const res = await api.inventory.getLedger({ branchId: selectedBranchId });
      if (res?.success && Array.isArray(res.data)) {
        ledgerEntries = res.data;
      }
    } catch (e) {
      console.error("Gagal memuat kartu stok ledger:", e);
    }
  }

  onMount(async () => {
    if (authStore.user?.branchId) {
      selectedBranchId = authStore.user.branchId;
    }
    await Promise.all([
      fetchProducts(),
      loadOpnameHistory(),
      loadStockLedger()
    ]);
  });
  let selectedLedgerTypeFilter = $state("ALL");

  // Filter for Opname History (Tab 3)
  let opnameSearchQuery = $state("");
  let opnameDiffFilter = $state<"ALL" | "DIFF_ONLY" | "LOSS" | "GAIN" | "MATCH">("DIFF_ONLY");

  // Toast / Banner notification
  let notificationBanner = $state<{
    message: string;
    subtext?: string;
    targetTab?: "kartu_stok" | "riwayat_opname";
  } | null>(null);

  // Helpers
  function formatNowTimestamp(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }

  function getReasonLabel(reason: OpnameAdjustmentRecord["reasonType"]): string {
    switch (reason) {
      case "STOCK_OPNAME":
        return "Opname Rutin";
      case "DAMAGED":
        return "Rusak / Pecah";
      case "EXPIRED":
        return "Kadaluarsa (ED)";
      case "DISCREPANCY":
        return "Koreksi Selisih";
    }
  }

  function getProductTotalStock(p: any): number {
    if (!p || !Array.isArray(p.batches)) return 0;
    return p.batches.reduce((acc: number, b: any) => acc + (Number(b.stock) || 0), 0);
  }

  // Stock Movement Ledger (`stock_ledger`) — populated from real transactions / adjustments
  let ledgerEntries = $state<LedgerEntry[]>([]);

  // Stock Opname & Adjustment History (`stock_adjustments` + `stock_adjustment_items`)
  let opnameHistory = $state<OpnameAdjustmentRecord[]>([]);

  // Pagination state (25 rows per page for master tables, 15 for defekta card)
  const PAGE_SIZE = 25;
  const DEFEKTA_PAGE_SIZE = 15;
  let catalogPage = $state(1);
  let opnamePage = $state(1);
  let defektaPage = $state(1);
  let defektaSearchQuery = $state("");

  // Derived: Selected Product Object for Stock Card
  let selectedProductForCard = $derived(
    products.find((p) => p.id === selectedProductIdForCard) || products[0]
  );

  // Derived: Filtered Products for Catalog Tab (searches full dataset before pagination)
  let filteredProducts = $derived(
    products.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.genericName && p.genericName.toLowerCase().includes(q));

      const matchCategory =
        selectedCategory === "ALL" || p.categoryId === selectedCategory;

      return matchSearch && matchCategory;
    })
  );

  // Sorting state katalog obat
  let catalogSortKey = $state<string>("name");
  let catalogSortDirection = $state<SortDirection>("asc");

  function handleCatalogSort(state: SortState) {
    catalogSortKey = state.key;
    catalogSortDirection = state.direction;
    catalogPage = 1;
  }

  let sortedProducts = $derived.by(() => {
    if (!catalogSortKey || !catalogSortDirection) return filteredProducts;
    const copy = [...filteredProducts];
    return copy.sort((a, b) => {
      let valA: any;
      let valB: any;
      let type: "string" | "number" = "string";

      switch (catalogSortKey) {
        case "name":
          valA = a.name;
          valB = b.name;
          break;
        case "sku":
          valA = a.sku;
          valB = b.sku;
          break;
        case "drugClass":
          valA = a.drugClass;
          valB = b.drugClass;
          break;
        case "totalStock":
          valA = getProductTotalStock(a);
          valB = getProductTotalStock(b);
          type = "number";
          break;
        case "generalPrice":
          valA = a.units[0]?.prices.general || 0;
          valB = b.units[0]?.prices.general || 0;
          type = "number";
          break;
        case "prescriptionPrice":
          valA = a.units[0]?.prices.prescription || 0;
          valB = b.units[0]?.prices.prescription || 0;
          type = "number";
          break;
        default:
          valA = a[catalogSortKey];
          valB = b[catalogSortKey];
      }
      return compareTableValues(valA, valB, catalogSortDirection, type);
    });
  });

  let catalogTotalPages = $derived(Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE)));
  let paginatedProducts = $derived(
    sortedProducts.slice((catalogPage - 1) * PAGE_SIZE, catalogPage * PAGE_SIZE)
  );

  // Derived: Filtered Ledger Entries for Selected Product with Dynamic Running Balance
  let productLedgerEntries = $derived.by(() => {
    const prod = selectedProductForCard;
    if (!prod) return [];

    // Filter mutasi sesuai produk & cabang terpilih
    const forProd = ledgerEntries
      .filter(
        (e) =>
          e.productId === prod.id &&
          (!selectedBranchId || selectedBranchId === "ALL" || !e.branchId || e.branchId === selectedBranchId)
      )
      .sort((a, b) => new Date(a.rawDate || a.date).getTime() - new Date(b.rawDate || b.date).getTime());

    // Hitung saldo berjalan secara kronologis (dari transaksi terawal ke terbaru)
    let running = 0;
    const computed = forProd.map((e) => {
      running += Number(e.qtyIn) - Number(e.qtyOut);
      return {
        ...e,
        balance: running
      };
    });

    // Urutkan transaksi terbaru di paling atas (descending) untuk kenyamanan kartu stok
    const list =
      computed.length > 0
        ? [...computed].reverse()
        : getProductTotalStock(prod) > 0
          ? [
              {
                id: `led-init-${prod.id}`,
                productId: prod.id,
                productName: prod.name,
                date: "-",
                refNumber: `SALDO-${prod.sku}`,
                type: "PEMBELIAN",
                batch: prod.batches[0]?.batchNumber || "STOK-AKTIF",
                expiryDate: prod.batches[0]?.expiryDate || "-",
                qtyIn: getProductTotalStock(prod),
                qtyOut: 0,
                balance: getProductTotalStock(prod),
                unit: prod.baseUnit,
                notes: "Saldo stok aktif tercatat di database",
                operator: "Sistem"
              }
            ]
          : [];

    if (selectedLedgerTypeFilter === "ALL") return list;
    return list.filter((e) => e.type === selectedLedgerTypeFilter);
  });

  // Derived: Filtered Opname Adjustment History (Filtered by Branch, Search, and Diff)
  let branchOpnameHistory = $derived(
    opnameHistory.filter((item) => item.branchId === selectedBranchId)
  );

  let filteredOpnameHistory = $derived(
    branchOpnameHistory.filter((item) => {
      const q = opnameSearchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.productName.toLowerCase().includes(q) ||
        item.docNumber.toLowerCase().includes(q) ||
        item.batchNumber.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q);

      const matchDiff =
        opnameDiffFilter === "ALL"
          ? true
          : opnameDiffFilter === "DIFF_ONLY"
            ? item.differenceQty !== 0
            : opnameDiffFilter === "LOSS"
              ? item.differenceQty < 0
              : opnameDiffFilter === "GAIN"
                ? item.differenceQty > 0
                : item.differenceQty === 0;

      return matchSearch && matchDiff;
    })
  );

  // Sorting state untuk Hasil Stok Opname
  let opnameSortKey = $state<string>("date");
  let opnameSortDirection = $state<SortDirection>("desc");

  function handleOpnameSort(state: SortState) {
    opnameSortKey = state.key;
    opnameSortDirection = state.direction;
    opnamePage = 1;
  }

  let sortedOpnameHistory = $derived.by(() => {
    if (!opnameSortKey || !opnameSortDirection) return filteredOpnameHistory;
    const copy = [...filteredOpnameHistory];
    return copy.sort((a, b) => {
      let valA: any;
      let valB: any;
      let type: "string" | "number" | "date" = "string";

      switch (opnameSortKey) {
        case "docNumber":
          valA = a.docNumber;
          valB = b.docNumber;
          break;
        case "date":
          valA = a.date;
          valB = b.date;
          type = "date";
          break;
        case "productName":
          valA = a.productName;
          valB = b.productName;
          break;
        case "systemQty":
          valA = Number(a.systemQty || 0);
          valB = Number(b.systemQty || 0);
          type = "number";
          break;
        case "actualQty":
          valA = Number(a.actualQty || 0);
          valB = Number(b.actualQty || 0);
          type = "number";
          break;
        case "differenceQty":
          valA = Number(a.differenceQty || 0);
          valB = Number(b.differenceQty || 0);
          type = "number";
          break;
        case "valueDifference":
          valA = Number(a.valueDifference || 0);
          valB = Number(b.valueDifference || 0);
          type = "number";
          break;
        case "operator":
          valA = a.operator;
          valB = b.operator;
          break;
        default:
          valA = (a as Record<string, any>)[opnameSortKey];
          valB = (b as Record<string, any>)[opnameSortKey];
      }
      return compareTableValues(valA, valB, opnameSortDirection, type);
    });
  });

  let opnameTotalPages = $derived(Math.max(1, Math.ceil(sortedOpnameHistory.length / PAGE_SIZE)));
  let paginatedOpnameHistory = $derived(
    sortedOpnameHistory.slice((opnamePage - 1) * PAGE_SIZE, opnamePage * PAGE_SIZE)
  );

  // Summary Stats for Opname Discrepancy
  let opnameSummary = $derived.by(() => {
    const lossItems = branchOpnameHistory.filter((i) => i.differenceQty < 0);
    const gainItems = branchOpnameHistory.filter((i) => i.differenceQty > 0);
    const matchItems = branchOpnameHistory.filter((i) => i.differenceQty === 0);
    const totalLossValue = lossItems.reduce((acc, i) => acc + i.valueDifference, 0);
    const totalGainValue = gainItems.reduce((acc, i) => acc + i.valueDifference, 0);
    return {
      totalChecked: branchOpnameHistory.length,
      discrepancyCount: lossItems.length + gainItems.length,
      lossCount: lossItems.length,
      gainCount: gainItems.length,
      matchCount: matchItems.length,
      totalLossValue,
      totalGainValue,
      netValueDiff: totalLossValue + totalGainValue
    };
  });

  // Compute Top KPI Metrics (Accurate Per-Batch Valuation)
  let totalItemsCount = $derived(products.length);
  let totalInventoryValue = $derived(
    products.reduce((acc: number, p: any) => {
      const productBatchValue = (p.batches || []).reduce(
        (bAcc: number, b: any) => bAcc + (Number(b.stock) || 0) * (Number(b.buyPrice) || 500),
        0
      );
      return acc + productBatchValue;
    }, 0)
  );

  // Defekta & Expiring batches (Dinamis menggunakan @apoteku/core evaluateExpiryStatus & sisaHari)
  let expiryWarningDays = $state<number>(90);
  let normalizedExpiryDays = $derived(Math.max(1, Math.round(Number(expiryWarningDays) || 90)));
  let criticalExpiryDays = $derived(Math.floor(normalizedExpiryDays / 3));

  function getExpiryLevelClasses(level: ExpiryColorLevel) {
    if (level === "red") {
      return {
        card: "border-rose-200 bg-rose-50/45",
        badge: "bg-rose-100 text-rose-700 border-rose-200",
        edText: "text-rose-700",
        pill: "bg-rose-50 text-rose-700 border-rose-200"
      };
    }
    if (level === "yellow") {
      return {
        card: "border-amber-200 bg-amber-50/35",
        badge: "bg-amber-100 text-amber-800 border-amber-200",
        edText: "text-amber-700",
        pill: "bg-amber-50 text-amber-700 border-amber-200"
      };
    }
    return {
      card: "border-emerald-200 bg-emerald-50/30",
      badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
      edText: "text-emerald-700",
      pill: "bg-white text-emerald-700 border-emerald-200"
    };
  }

  let expiringBatches = $derived(
    products
      .flatMap((p: any) =>
        (p.batches || []).map((b: any) => {
          const expiryMeta = evaluateExpiryStatus(b.expiryDate, normalizedExpiryDays);
          return {
            ...b,
            productId: p.id,
            productName: p.name,
            drugClass: p.drugClass,
            baseUnit: p.baseUnit,
            expiryMeta
          };
        })
      )
      .filter(
        (b) =>
          b.batchNumber !== "STOK-AKTIF" &&
          Number(b.stock) > 0 &&
          b.expiryMeta.sisaHari <= normalizedExpiryDays
      )
      .sort((a, b) => a.expiryMeta.sisaHari - b.expiryMeta.sisaHari)
  );

  let lowStockProducts = $derived(
    products.filter((p) => {
      const totalStock = getProductTotalStock(p);
      return totalStock < 50;
    })
  );

  let filteredDefektaProducts = $derived(
    lowStockProducts.filter((p) => {
      const q = defektaSearchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.genericName && p.genericName.toLowerCase().includes(q))
      );
    })
  );

  let defektaTotalPages = $derived(
    Math.max(1, Math.ceil(filteredDefektaProducts.length / DEFEKTA_PAGE_SIZE))
  );
  let paginatedDefektaProducts = $derived(
    filteredDefektaProducts.slice(
      (defektaPage - 1) * DEFEKTA_PAGE_SIZE,
      defektaPage * DEFEKTA_PAGE_SIZE
    )
  );

  // =========================================================================
  // MODAL 1: STOK OPNAME & PENYESUAIAN FISIK (SINGLE & WORKSHEET MASSAL)
  // =========================================================================
  let isOpnameModalOpen = $state(false);
  let opnameMode = $state<"single" | "worksheet">("single");
  let opnameReasonType = $state<OpnameAdjustmentRecord["reasonType"]>("STOCK_OPNAME");
  let opnameNotes = $state("");

  // Single Mode State
  let opnameProductId = $state("");
  let opnameBatchId = $state("");
  let opnameActualQty = $state<number>(0);

  let selectedOpnameProduct = $derived(
    products.find((p) => p.id === opnameProductId) || products[0]
  );
  let selectedOpnameBatch = $derived(
    selectedOpnameProduct?.batches?.find((b: any) => b.id === opnameBatchId) ||
      selectedOpnameProduct?.batches?.[0]
  );
  let singleSystemQty = $derived(selectedOpnameBatch?.stock ?? 0);
  let singleDiffQty = $derived((opnameActualQty ?? 0) - singleSystemQty);
  let singleCostPerUnit = $derived(selectedOpnameBatch?.buyPrice ?? 500);
  let singleValueDiff = $derived(singleDiffQty * singleCostPerUnit);

  // Worksheet (Mass Opname) State: keyed by batch.id -> actualQty input
  let worksheetCategoryFilter = $state("ALL");
  let worksheetCounts = $state<Record<string, number>>({});

  let worksheetRows = $derived(
    products
      .filter(
        (p) => worksheetCategoryFilter === "ALL" || p.categoryId === worksheetCategoryFilter
      )
      .flatMap((p: any) =>
        (p.batches || []).map((b: any) => {
          const actual =
            worksheetCounts[b.id] !== undefined ? worksheetCounts[b.id] : b.stock;
          const diff = actual - b.stock;
          return {
            productId: p.id,
            productName: p.name,
            sku: p.sku,
            unit: p.baseUnit,
            batchId: b.id,
            batchNumber: b.batchNumber,
            expiryDate: b.expiryDate,
            systemQty: b.stock,
            actualQty: actual,
            diffQty: diff,
            buyPrice: b.buyPrice || 500,
            valueDiff: diff * (b.buyPrice || 500)
          };
        })
      )
  );

  let worksheetChangedRows = $derived(worksheetRows.filter((r) => r.diffQty !== 0));

  function openOpnameForProduct(productId?: string) {
    if (!canManageStock) {
      alertStore.danger("Akses Ditolak", "Anda tidak memiliki hak akses untuk melakukan koreksi stok atau opname.");
      return;
    }
    const targetProd = products.find((p) => p.id === productId) || products[0];
    if (targetProd) {
      opnameProductId = targetProd.id;
      opnameBatchId = targetProd.batches[0]?.id || "";
      opnameActualQty = targetProd.batches[0]?.stock ?? 0;
    }
    opnameMode = "single";
    opnameReasonType = canPerformOpname ? "STOCK_OPNAME" : "DISCREPANCY";
    opnameNotes = "";

    // Initialize worksheet counts with current system stock
    const initialMap: Record<string, number> = {};
    for (const p of products) {
      for (const b of p.batches) {
        initialMap[b.id] = b.stock;
      }
    }
    worksheetCounts = initialMap;
    isOpnameModalOpen = true;
  }

  function handleOpnameProductChange(newProdId: string) {
    opnameProductId = newProdId;
    const prod = products.find((p) => p.id === newProdId);
    if (prod && prod.batches[0]) {
      opnameBatchId = prod.batches[0].id;
      opnameActualQty = prod.batches[0].stock;
    }
  }

  function handleOpnameBatchChange(newBatchId: string) {
    opnameBatchId = newBatchId;
    const batch = selectedOpnameProduct?.batches?.find((b: any) => b.id === newBatchId);
    if (batch) {
      opnameActualQty = batch.stock;
    }
  }

  let isSavingOpname = $state(false);

  async function submitStockOpname() {
    if (opnameMode === "worksheet" && !canPerformOpname) {
      alertStore.danger("Akses Ditolak", "Anda tidak memiliki wewenang untuk rekonsiliasi lembar kerja stok opname.");
      return;
    }
    if (opnameMode === "single" && !canManageStock) {
      alertStore.danger("Akses Ditolak", "Anda tidak memiliki wewenang untuk menyimpan koreksi stok.");
      return;
    }
    const nowStr = formatNowTimestamp();
    const docNumber = generateAdjustmentNumber();
    const operatorName = authStore.user?.fullName || "apt. Hafidz Nurul";

    isSavingOpname = true;
    try {
      if (opnameMode === "single") {
        if (!selectedOpnameProduct || !selectedOpnameBatch) return;

        const sysQty = selectedOpnameBatch.stock;
        const actQty = Math.max(0, Number(opnameActualQty) || 0);
        const cost = selectedOpnameBatch.buyPrice || 500;
        const discrepancy = calculateStockDifference(sysQty, actQty, cost);
        const diffQty = discrepancy.differenceQty;
        const reasonText =
          opnameNotes.trim() ||
          `Fisik: ${actQty}, Sistem: ${sysQty}`;

        // Kirim ke Backend PostgreSQL
        await api.inventory.recordOpname({
          branchId: selectedBranchId,
          adjustmentNumber: docNumber,
          reason: `${getReasonLabel(opnameReasonType)}: ${reasonText}`,
          reasonType: opnameReasonType,
          items: [
            {
              productId: selectedOpnameProduct.id,
              productName: selectedOpnameProduct.name,
              batchId: selectedOpnameBatch.id,
              batchNo: selectedOpnameBatch.batchNumber,
              systemQty: sysQty,
              actualQty: actQty,
              differenceQty: diffQty,
              costPerUnit: cost,
              notes: reasonText
            }
          ]
        }).catch((err: any) => console.warn("API recordOpname failed, updating local state:", err));

        // 1. Update Saldo Batch Fisik di Katalog (`branch_batch_stocks`)
        selectedOpnameBatch.stock = actQty;
        const newTotalProductStock = getProductTotalStock(selectedOpnameProduct);

        // 2. Catat ke Riwayat Stok Opname (`stock_adjustment_items`)
        opnameHistory = [
          {
            id: `adj-${Date.now()}`,
            docNumber,
            date: nowStr,
            branchId: selectedBranchId,
            productId: selectedOpnameProduct.id,
            productName: selectedOpnameProduct.name,
            sku: selectedOpnameProduct.sku,
            batchId: selectedOpnameBatch.id,
            batchNumber: selectedOpnameBatch.batchNumber,
            unit: selectedOpnameProduct.baseUnit,
            systemQty: sysQty,
            actualQty: actQty,
            differenceQty: diffQty,
            costPerUnit: cost,
            valueDifference: diffQty * cost,
            reasonType: opnameReasonType,
            notes: reasonText,
            operator: operatorName
          },
          ...opnameHistory
        ];

        // 3. Jika ada selisih (diffQty !== 0), tulis mutasi ke Kartu Stok (`stock_ledger`)
        if (diffQty !== 0) {
          ledgerEntries = [
            {
              id: `led-${Date.now()}`,
              productId: selectedOpnameProduct.id,
              productName: selectedOpnameProduct.name,
              date: nowStr,
              refNumber: docNumber,
              type: "OPNAME",
              batch: selectedOpnameBatch.batchNumber,
              qtyIn: diffQty > 0 ? diffQty : 0,
              qtyOut: diffQty < 0 ? Math.abs(diffQty) : 0,
              balance: newTotalProductStock,
              unit: selectedOpnameProduct.baseUnit,
              notes: `${getReasonLabel(opnameReasonType)}: ${reasonText}`,
              operator: operatorName
            },
            ...ledgerEntries
          ];
        }

        selectedProductIdForCard = selectedOpnameProduct.id;
        isOpnameModalOpen = false;
        notificationBanner = {
          message: `Stok Opname ${docNumber} berhasil disimpan!`,
          subtext:
            diffQty === 0
              ? `Stok ${selectedOpnameProduct.name} (${selectedOpnameBatch.batchNumber}) cocok (${actQty} ${selectedOpnameProduct.baseUnit}).`
              : `Stok ${selectedOpnameProduct.name} disesuaikan dari ${sysQty} menjadi ${actQty} ${selectedOpnameProduct.baseUnit} (Selisih: ${diffQty > 0 ? `+${diffQty}` : diffQty}).`,
          targetTab: "riwayat_opname"
        };
      } else {
        // Mode Worksheet Massal
        const rowsToProcess = worksheetRows.filter(
          (r) => r.diffQty !== 0
        );
        if (rowsToProcess.length === 0) {
          isOpnameModalOpen = false;
          notificationBanner = {
            message: `Pemeriksaan Lembar Kerja ${docNumber} selesai!`,
            subtext: "Seluruh item pada lembar kerja cocok (tidak ditemukan selisih stok).",
            targetTab: "riwayat_opname"
          };
          return;
        }

        // Kirim ke Backend PostgreSQL
        await api.inventory.recordOpname({
          branchId: selectedBranchId,
          adjustmentNumber: docNumber,
          reason: `Opname Massal: ${getReasonLabel(opnameReasonType)}`,
          reasonType: opnameReasonType,
          items: rowsToProcess.map((r) => ({
            productId: r.productId,
            productName: r.name,
            batchId: r.batchId,
            batchNo: r.batchNumber,
            systemQty: r.systemQty,
            actualQty: r.actualQty,
            differenceQty: r.diffQty,
            costPerUnit: r.buyPrice,
            notes: opnameNotes.trim() || `Opname Massal (${getReasonLabel(opnameReasonType)})`
          }))
        }).catch((err: any) => console.warn("API recordOpname failed, updating local state:", err));

        const newAdjustments: OpnameAdjustmentRecord[] = [];
        const newLedgers: LedgerEntry[] = [];

        for (const row of rowsToProcess) {
          const prod = products.find((p) => p.id === row.productId);
          const batch = prod?.batches?.find((b: any) => b.id === row.batchId);
          if (!prod || !batch) continue;

          const sysQty = batch.stock;
          const actQty = Math.max(0, Number(row.actualQty) || 0);
          const discrepancy = calculateStockDifference(sysQty, actQty, row.buyPrice);
          const diffQty = discrepancy.differenceQty;
          batch.stock = actQty;

          const totalProdStock = getProductTotalStock(prod);
          const reasonText =
            opnameNotes.trim() ||
            `Opname Massal (${getReasonLabel(opnameReasonType)})`;

          newAdjustments.push({
            id: `adj-${Date.now()}-${row.batchId}`,
            docNumber,
            date: nowStr,
            branchId: selectedBranchId,
            productId: prod.id,
            productName: prod.name,
            sku: prod.sku,
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            unit: prod.baseUnit,
            systemQty: sysQty,
            actualQty: actQty,
            differenceQty: diffQty,
            costPerUnit: row.buyPrice,
            valueDifference: diffQty * row.buyPrice,
            reasonType: opnameReasonType,
            notes: reasonText,
            operator: operatorName
          });

          newLedgers.push({
            id: `led-${Date.now()}-${row.batchId}`,
            productId: prod.id,
            productName: prod.name,
            date: nowStr,
            refNumber: docNumber,
            type: "OPNAME",
            batch: batch.batchNumber,
            qtyIn: diffQty > 0 ? diffQty : 0,
            qtyOut: diffQty < 0 ? Math.abs(diffQty) : 0,
            balance: totalProdStock,
            unit: prod.baseUnit,
            notes: reasonText,
            operator: operatorName
          });
        }

        opnameHistory = [...newAdjustments, ...opnameHistory];
        ledgerEntries = [...newLedgers, ...ledgerEntries];
        isOpnameModalOpen = false;
        notificationBanner = {
          message: `Opname Massal ${docNumber} (${newAdjustments.length} batch selisih) berhasil direkonsiliasi!`,
          subtext: "Saldo di Katalog telah diperbarui dan mutasi telah tercatat di Kartu Stok.",
          targetTab: "riwayat_opname"
        };
      }
    } finally {
      isSavingOpname = false;
    }
  }

  // =========================================================================
  // MODAL 2: TAMBAH / EDIT MASTER OBAT (CRUD KATALOG & MULTI-SATUAN)
  // =========================================================================
  let isProductModalOpen = $state(false);
  let editingProductId = $state<string | null>(null);
  let isSavingProduct = $state(false);

  let formProdName = $state("");
  let formProdGeneric = $state("");
  let formProdManufacturer = $state("");
  let formProdSku = $state("");
  let formProdBarcode = $state("");
  let formProdCategoryId = $state("cat-otc");
  let formProdDrugClass = $state<"OTC" | "LIMITED_OTC" | "ETHICAL" | "PSYCHOTROPIC" | "NARCOTICS">("OTC");
  let formProdBaseUnit = $state("TABLET");
  let formProdPriceGeneral = $state(1500);
  let formProdPriceResep = $state(1800);
  let formProdPriceWholesale = $state(1300);
  let formProdInitialBatch = $state("BATCH25A01");
  let formProdInitialExpiry = $state("2027-12-31");
  let formProdInitialStock = $state(100);
  let formProdBuyPrice = $state(1000);
  let formProdIsConsignment = $state(false);

  interface FormProductUnit {
    unitName: string;
    conversionFactor: number;
    buyPrice: number;
    salePriceGeneral: number;
    salePriceResep: number;
    salePriceGrosir: number;
    isBaseUnit: boolean;
    isSellable: boolean;
    isPurchaseUnit: boolean;
  }

  let formProdUnits = $state<FormProductUnit[]>([
    {
      unitName: "TABLET",
      conversionFactor: 1,
      buyPrice: 1000,
      salePriceGeneral: 1500,
      salePriceResep: 1800,
      salePriceGrosir: 1300,
      isBaseUnit: true,
      isSellable: true,
      isPurchaseUnit: true
    }
  ]);

  function addUnitRow() {
    const baseBuy = formProdUnits[0]?.buyPrice || formProdBuyPrice || 0;
    const baseGeneral = formProdUnits[0]?.salePriceGeneral || 1500;
    const baseResep = formProdUnits[0]?.salePriceResep || 1800;
    const baseGrosir = formProdUnits[0]?.salePriceGrosir || 1300;
    formProdUnits.push({
      unitName: "STRIP",
      conversionFactor: 10,
      buyPrice: Math.round(baseBuy * 10),
      salePriceGeneral: Math.round(baseGeneral * 10),
      salePriceResep: Math.round(baseResep * 10),
      salePriceGrosir: Math.round(baseGrosir * 10),
      isBaseUnit: false,
      isSellable: true,
      isPurchaseUnit: false
    });
  }

  function removeUnitRow(idx: number) {
    if (idx === 0) return;
    formProdUnits.splice(idx, 1);
  }

  function openAddProductModal() {
    editingProductId = null;
    formProdName = "";
    formProdGeneric = "";
    formProdManufacturer = "PT. Kimia Farma";
    formProdSku = String(Math.floor(100000 + Math.random() * 900000));
    formProdBarcode = `8999900${Math.floor(100000 + Math.random() * 900000)}`;
    formProdCategoryId = categories[0]?.id || "cat-otc";
    formProdDrugClass = "OTC";
    formProdBaseUnit = "TABLET";
    formProdPriceGeneral = 1500;
    formProdPriceResep = 1700;
    formProdPriceWholesale = 1350;
    formProdInitialBatch = "BCH26A01";
    formProdInitialExpiry = "2028-06-30";
    formProdInitialStock = 100;
    formProdBuyPrice = 950;
    formProdIsConsignment = false;
    formProdUnits = [
      {
        unitName: "TABLET",
        conversionFactor: 1,
        buyPrice: 950,
        salePriceGeneral: 1500,
        salePriceResep: 1700,
        salePriceGrosir: 1350,
        isBaseUnit: true,
        isSellable: true,
        isPurchaseUnit: true
      }
    ];
    isProductModalOpen = true;
  }

  function openEditProductModal(prod: (typeof products)[0]) {
    editingProductId = prod.id;
    formProdName = prod.name;
    formProdGeneric = prod.genericName || "";
    formProdManufacturer = prod.manufacturer || "";
    formProdSku = prod.sku;
    formProdBarcode = prod.barcode;
    formProdCategoryId = prod.categoryId;
    formProdDrugClass = prod.drugClass as any;
    formProdBaseUnit = prod.baseUnit || "TABLET";
    formProdPriceGeneral = prod.units[0]?.prices.general || 1000;
    formProdPriceResep = prod.units[0]?.prices.prescription || 1000;
    formProdPriceWholesale = prod.units[0]?.prices.wholesale || 900;
    formProdInitialBatch = prod.batches[0]?.batchNumber || "BATCH-01";
    formProdInitialExpiry = prod.batches[0]?.expiryDate || "2027-12-31";
    formProdInitialStock = getProductTotalStock(prod);
    const refBaseBuy = Number(prod.referenceBuyPriceBase || prod.batches[0]?.buyPrice || 0);
    formProdBuyPrice = Math.round(refBaseBuy);
    formProdIsConsignment = Boolean(prod.isConsignment);

    if (prod.units && Array.isArray(prod.units) && prod.units.length > 0) {
      formProdUnits = prod.units.map((u: any, idx: number) => {
        const factor = Number(u.multiplier ?? u.conversionFactor ?? 1);
        const unitName = String(u.unit || u.unitName || (idx === 0 ? prod.baseUnit : "STRIP")).toUpperCase();
        const isDefPurchase =
          u.isPurchaseUnit !== undefined
            ? Boolean(u.isPurchaseUnit)
            : prod.defaultPurchaseUnit
              ? unitName === String(prod.defaultPurchaseUnit).toUpperCase()
              : idx === prod.units.length - 1;
        return {
          unitName,
          conversionFactor: factor,
          buyPrice: Math.round(Number(u.buyPrice ?? refBaseBuy * factor)),
          salePriceGeneral: Math.round(Number(u.prices?.general ?? u.salePriceGeneral ?? 0)),
          salePriceResep: Math.round(Number(u.prices?.prescription ?? u.salePriceResep ?? 0)),
          salePriceGrosir: Math.round(Number(u.prices?.wholesale ?? u.salePriceGrosir ?? 0)),
          isBaseUnit: idx === 0 || factor === 1,
          isSellable: u.isSellable !== false,
          isPurchaseUnit: isDefPurchase
        };
      });
    } else {
      formProdUnits = [
        {
          unitName: String(prod.baseUnit || "TABLET").toUpperCase(),
          conversionFactor: 1,
          buyPrice: Math.round(refBaseBuy),
          salePriceGeneral: Math.round(prod.units?.[0]?.prices?.general || 1000),
          salePriceResep: Math.round(prod.units?.[0]?.prices?.prescription || 1000),
          salePriceGrosir: Math.round(prod.units?.[0]?.prices?.wholesale || 900),
          isBaseUnit: true,
          isSellable: true,
          isPurchaseUnit: true
        }
      ];
    }

    isProductModalOpen = true;
  }

  async function saveProductForm() {
    if (!formProdName.trim()) return;
    isSavingProduct = true;

    try {
      const catObj = categories.find((c) => c.id === formProdCategoryId);
      const categoryName = catObj?.name || "Obat Bebas";

      // Sinkronisasi data unit dasar
      if (formProdUnits.length === 0) {
        formProdUnits = [
          {
            unitName: formProdBaseUnit || "TABLET",
            conversionFactor: 1,
            buyPrice: Math.max(0, Math.round(Number(formProdBuyPrice) || 0)),
            salePriceGeneral: Math.round(formProdPriceGeneral || 0),
            salePriceResep: Math.round(formProdPriceResep || 0),
            salePriceGrosir: Math.round(formProdPriceWholesale || 0),
            isBaseUnit: true,
            isSellable: true,
            isPurchaseUnit: true
          }
        ];
      }

      // Validasi anti-duplikat nama satuan & faktor konversi
      const seenUnitNames = new Set<string>();
      const seenFactors = new Set<number>();
      for (let idx = 0; idx < formProdUnits.length; idx++) {
        const u = formProdUnits[idx];
        const unitUpper = (u.unitName || "").trim().toUpperCase();
        if (!unitUpper) {
          alertStore.danger("Satuan Kosong", `Nama satuan pada baris #${idx + 1} wajib diisi.`);
          return;
        }
        if (seenUnitNames.has(unitUpper)) {
          alertStore.danger(
            "Nama Satuan Duplikat",
            `Satuan "${unitUpper}" muncul lebih dari satu kali. Hapus atau ganti salah satunya.`
          );
          return;
        }
        seenUnitNames.add(unitUpper);

        const factor = idx === 0 ? 1 : Number(u.conversionFactor || 0);
        if (idx > 0 && (!Number.isFinite(factor) || factor <= 1)) {
          alertStore.danger(
            "Konversi Tidak Valid",
            `Satuan kemasan "${unitUpper}" harus memiliki konversi lebih dari 1 ${formProdUnits[0].unitName}.`
          );
          return;
        }
        const facKey = Math.round(factor * 10000);
        if (seenFactors.has(facKey)) {
          alertStore.danger(
            "Faktor Konversi Kembar",
            `Terdapat dua satuan dengan isi konversi yang sama (${factor} ${formProdUnits[0].unitName}). Hapus salah satu agar tidak membingungkan di kasir dan SP.`
          );
          return;
        }
        seenFactors.add(facKey);
      }

      formProdBaseUnit = formProdUnits[0].unitName.trim().toUpperCase();
      formProdPriceGeneral = Math.round(formProdUnits[0].salePriceGeneral || 0);
      formProdPriceResep = Math.round(formProdUnits[0].salePriceResep || 0);
      formProdPriceWholesale = Math.round(formProdUnits[0].salePriceGrosir || 0);
      formProdBuyPrice = Math.max(0, Math.round(Number(formProdUnits[0].buyPrice ?? formProdBuyPrice) || 0));

      const hasPurchaseFlag = formProdUnits.some((u) => Boolean(u.isPurchaseUnit));
      const unitsPayload = formProdUnits.map((u, idx) => ({
        unitName: (u.unitName || "").trim().toUpperCase() || (idx === 0 ? "TABLET" : "STRIP"),
        conversionFactor: idx === 0 ? 1 : Math.max(2, Number(u.conversionFactor) || 2),
        buyPrice: Math.max(0, Math.round(Number(u.buyPrice) || 0)),
        salePriceGeneral: Math.max(0, Math.round(Number(u.salePriceGeneral) || 0)),
        salePriceResep: Math.max(0, Math.round(Number(u.salePriceResep) || 0)),
        salePriceGrosir: Math.max(0, Math.round(Number(u.salePriceGrosir) || 0)),
        salePriceDelivery: Math.max(0, Math.round(Number(u.salePriceGeneral) || 0)),
        salePriceMember: Math.max(0, Math.round(Number(u.salePriceGrosir) || 0)),
        isBaseUnit: idx === 0,
        isSellable: idx === 0 ? true : u.isSellable !== false,
        isPurchaseUnit: hasPurchaseFlag ? Boolean(u.isPurchaseUnit) : idx === (formProdUnits.length > 1 ? formProdUnits.length - 1 : 0)
      }));

      const primaryPurchaseUnit =
        unitsPayload.find((u) => u.isPurchaseUnit)?.unitName || unitsPayload[0].unitName;

      const mappedUnitsForMemory = unitsPayload.map((u) => ({
        unit: u.unitName,
        multiplier: u.conversionFactor,
        buyPrice: u.buyPrice,
        isSellable: u.isSellable,
        isPurchaseUnit: u.isPurchaseUnit,
        prices: {
          general: u.salePriceGeneral,
          prescription: u.salePriceResep,
          wholesale: u.salePriceGrosir,
          delivery: u.salePriceDelivery,
          member: u.salePriceMember
        }
      }));

      if (editingProductId) {
        const payload = {
          name: formProdName.trim(),
          genericName: formProdGeneric.trim(),
          manufacturer: formProdManufacturer.trim(),
          sku: formProdSku.trim(),
          barcode: formProdBarcode.trim(),
          categoryId: formProdCategoryId,
          drugClass: formProdDrugClass,
          baseUnit: formProdBaseUnit,
          defaultPurchaseUnit: primaryPurchaseUnit,
          referenceBuyPriceBase: Number(formProdBuyPrice) || 0,
          unitPrices: {
            general: Number(formProdPriceGeneral) || 0,
            prescription: Number(formProdPriceResep) || 0,
            wholesale: Number(formProdPriceWholesale) || 0
          },
          units: unitsPayload,
          buyPrice: Number(formProdBuyPrice) || 0,
          isConsignment: formProdIsConsignment
        };

        try {
          const updateRes = await api.products.update(editingProductId, payload);
          if (updateRes && updateRes.success === false) {
            alertStore.danger("Gagal Menyimpan Perubahan", updateRes.error || "Validasi server gagal.");
            return;
          }
        } catch (e: any) {
          alertStore.danger("Gagal Menyimpan Perubahan", e?.message || "Terjadi kesalahan saat memperbarui master produk.");
          return;
        }

        const idx = products.findIndex((p) => p.id === editingProductId);
        if (idx !== -1) {
          const existing = products[idx];
          existing.name = formProdName.trim();
          existing.genericName = formProdGeneric.trim();
          existing.manufacturer = formProdManufacturer.trim();
          existing.sku = formProdSku.trim();
          existing.barcode = formProdBarcode.trim();
          existing.categoryId = formProdCategoryId;
          existing.categoryName = categoryName;
          existing.drugClass = formProdDrugClass;
          existing.baseUnit = formProdBaseUnit;
          existing.defaultPurchaseUnit = primaryPurchaseUnit;
          existing.referenceBuyPriceBase = Number(formProdBuyPrice) || 0;
          existing.isConsignment = formProdIsConsignment;
          existing.units = mappedUnitsForMemory;
          if (existing.batches && existing.batches[0]) {
            existing.batches[0].buyPrice = Number(formProdBuyPrice) || existing.batches[0].buyPrice;
          }
          mockApi.updateProductInMemory(existing);
        }
        isProductModalOpen = false;
        notificationBanner = {
          message: `Data master obat "${formProdName}" berhasil diperbarui! (${unitsPayload.length} Satuan Aktif)`
        };
      } else {
        const newProdId = `prod-${Date.now()}`;
        const newBatchId = `batch-${Date.now()}`;
        const initStock = Math.max(0, Number(formProdInitialStock) || 0);
        const buyPrice = Math.max(0, Number(formProdBuyPrice) || 500);

        const payload = {
          sku: formProdSku.trim() || "000999",
          barcode: formProdBarcode.trim() || `8999900${Math.floor(100000 + Math.random() * 900000)}`,
          name: formProdName.trim(),
          genericName: formProdGeneric.trim() || formProdName.trim(),
          drugClass: formProdDrugClass,
          baseUnit: formProdBaseUnit,
          defaultPurchaseUnit: primaryPurchaseUnit,
          referenceBuyPriceBase: Number(formProdBuyPrice) || 0,
          unitPrices: {
            general: Number(formProdPriceGeneral) || 0,
            prescription: Number(formProdPriceResep) || 0,
            wholesale: Number(formProdPriceWholesale) || 0
          },
          units: unitsPayload,
          initialBatch: formProdInitialBatch.trim() || "BCH26A01",
          initialExpiry: formProdInitialExpiry || "2028-01-01",
          initialStock: initStock,
          buyPrice,
          branchId: selectedBranchId,
          isConsignment: formProdIsConsignment
        };

        let backendCreated: any = null;
        try {
          const res = await api.products.create(payload);
          if (res && res.success === false) {
            alertStore.danger("Gagal Menambahkan Produk", res.error || "Validasi server gagal.");
            return;
          }
          if (res?.success && res.data) {
            backendCreated = res.data;
          }
        } catch (e: any) {
          alertStore.danger("Gagal Menambahkan Produk", e?.message || "Gagal menyimpan produk baru ke server.");
          return;
        }

        const newProduct = {
          id: backendCreated?.id || newProdId,
          sku: payload.sku,
          barcode: payload.barcode,
          name: payload.name,
          genericName: payload.genericName,
          categoryId: formProdCategoryId,
          categoryName,
          drugClass: formProdDrugClass,
          requiresPrescription: formProdDrugClass === "ETHICAL" || formProdDrugClass === "PSYCHOTROPIC" || formProdDrugClass === "NARCOTICS",
          isConsignment: formProdIsConsignment,
          manufacturer: formProdManufacturer.trim() || "PBF Umum",
          description: "Produk baru ditambahkan dari katalog master.",
          indication: "-",
          dosage: "Gunakan sesuai petunjuk",
          baseUnit: formProdBaseUnit,
          defaultPurchaseUnit: primaryPurchaseUnit,
          referenceBuyPriceBase: Number(formProdBuyPrice) || 0,
          units: mappedUnitsForMemory,
          batches: [
            {
              id: newBatchId,
              batchNumber: payload.initialBatch,
              branchId: selectedBranchId,
              expiryDate: payload.initialExpiry,
              stock: initStock,
              buyPrice
            }
          ]
        };

        products = [newProduct as any, ...products];
        mockApi.updateProductInMemory(newProduct as any);

        if (initStock > 0) {
          ledgerEntries = [
            {
              id: `led-init-${Date.now()}`,
              productId: newProduct.id,
              productName: newProduct.name,
              date: formatNowTimestamp(),
              refNumber: `INIT-${newProduct.sku}`,
              type: "PEMBELIAN",
              batch: newProduct.batches[0].batchNumber,
              qtyIn: initStock,
              qtyOut: 0,
              balance: initStock,
              unit: newProduct.baseUnit,
              notes: "Stok Awal Pendaftaran Obat Baru",
              operator: authStore.user?.fullName || "apt. Hafidz Nurul"
            },
            ...ledgerEntries
          ];
        }

        isProductModalOpen = false;
        notificationBanner = {
          message: `Obat baru "${newProduct.name}" berhasil ditambahkan ke katalog!`,
          subtext: `Saldo awal tercatat: ${initStock} ${newProduct.baseUnit} (Batch: ${newProduct.batches[0].batchNumber}).`
        };
      }
    } finally {
      isSavingProduct = false;
    }
  }

  async function handleDeleteProduct(prod: any) {
    const isConfirmed = await alertStore.confirm({
      type: "danger",
      title: "Hapus / Nonaktifkan Obat",
      message: `Apakah Anda yakin ingin menghapus atau menonaktifkan obat "${prod.name}"?`,
      confirmText: "Ya, Lanjutkan",
      cancelText: "Batal"
    });
    if (!isConfirmed) return;
    try {
      const res = await api.products.delete(prod.id);
      if (res?.success) {
        if (res.action === 'soft_deleted') {
          const idx = products.findIndex((p) => p.id === prod.id);
          if (idx !== -1) {
            products[idx].isActive = false;
          }
          notificationBanner = {
            message: `Obat "${prod.name}" dinonaktifkan (karena memiliki riwayat transaksi).`
          };
        } else {
          products = products.filter((p) => p.id !== prod.id);
          notificationBanner = {
            message: `Obat "${prod.name}" berhasil dihapus permanen dari sistem!`
          };
        }
      } else {
        products = products.filter((p) => p.id !== prod.id);
        notificationBanner = {
          message: `Obat "${prod.name}" telah dihapus.`
        };
      }
    } catch (err: any) {
      products = products.filter((p) => p.id !== prod.id);
      notificationBanner = {
        message: `Obat "${prod.name}" telah dihapus.`
      };
    }
  }
</script>

<svelte:head>
  <title>Stok Obat &bull; {tenantStore.current.name || "Hafidz Farma"}</title>
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Stok Obat & Inventori"
    subtitle="Katalog obat, audit kartu stok, rekonsiliasi stok opname"
    icon={Package}
    breadcrumbs={[{ label: "Stok Obat" }]}
  >
    {#snippet actions()}
      <div class="grid grid-rows-2 justify-items-end gap-2">
        <div class="flex justify-end gap-2">
          {#if canManageStock}
            <button
              type="button"
              onclick={() => openOpnameForProduct()}
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 text-emerald-800 text-xs font-bold transition-all shadow-xs"
            >
              <ClipboardCheck class="w-4 h-4 text-emerald-600" />
              <span>{canPerformOpname ? "Stok Opname" : "Koreksi Stok"}</span>
            </button>
          {/if}

          <button
            type="button"
            onclick={openAddProductModal}
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
          >
            <Plus class="w-4 h-4" />
            <span>Tambah Obat Baru</span>
          </button>
        </div>
        
        <!-- Branch selector (for Multi-branch User) or locked badge (for Single Branch Staff) -->
        {#if authStore.canSelectBranch}
          <Select
            bind:value={selectedBranchId}
            icon={Store}
            variant="soft"
            size="sm"
            align="right"
            onchange={() => {
              fetchProducts();
              loadOpnameHistory();
              loadStockLedger();
            }}
            options={branches.map((b) => ({
              value: b.id,
              label: `${b.name}`,
              sublabel: b.address
            }))}
          />
        {:else}
          <div class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs" title="Cabang Penugasan">
            <Store class="w-3.5 h-3.5 text-brand-blue" />
            <span>{authStore.user?.branchName || branches.find((b) => b.id === selectedBranchId)?.name || (tenantStore.current.name ? `${tenantStore.current.name} Pusat` : "Apotek Hafidz Farma Pusat")}</span>
          </div>
        {/if}
      </div>
    {/snippet}
  </PageHeader>

  <!-- FEEDBACK NOTIFICATION BANNER -->
  {#if notificationBanner}
    <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-150">
      <div class="flex items-start gap-3">
        <CheckCircle2 class="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div>
          <div class="text-xs font-bold text-emerald-950">{notificationBanner.message}</div>
          {#if notificationBanner.subtext}
            <div class="text-[11px] text-emerald-700 mt-0.5">{notificationBanner.subtext}</div>
          {/if}
        </div>
      </div>
      <div class="flex items-center gap-2 self-end sm:self-center">
        {#if notificationBanner.targetTab}
          <button
            type="button"
            onclick={() => {
              if (notificationBanner?.targetTab) activeTab = notificationBanner.targetTab;
              notificationBanner = null;
            }}
            class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1 transition-all"
          >
            <span>Lihat Riwayat Selisih</span>
            <ArrowRight class="w-3.5 h-3.5" />
          </button>
        {/if}
        <button
          type="button"
          onclick={() => (notificationBanner = null)}
          class="p-1 text-emerald-600 hover:text-emerald-900 rounded-lg"
          aria-label="Tutup Notifikasi"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>
  {/if}

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Total Item Obat"
      value="{totalItemsCount} SKU"
      subtext="Katalog aktif multi-cabang"
      icon={Package}
      variant="brand"
    />
    <MetricCard
      title="Nilai Inventori"
      value={formatRupiah(totalInventoryValue)}
      subtext="Valuasi HPP saldo sistem"
      icon={DollarSign}
      variant="default"
    />
    <MetricCard
      title="Selisih Stok Opname"
      value="{opnameSummary.discrepancyCount} Batch"
      subtext="Net: {formatRupiah(opnameSummary.netValueDiff)}"
      icon={Scale}
      variant={opnameSummary.netValueDiff < 0 ? "danger" : "warning"}
      alertActionText={canPerformOpname ? "Audit Selisih" : undefined}
      onAlertClick={canPerformOpname ? () => (activeTab = "riwayat_opname") : undefined}
    />
    <MetricCard
      title="Defekta & ED"
      value="{lowStockProducts.length} &bull; {expiringBatches.length} ED"
      subtext="FEFO Alert (&le; {normalizedExpiryDays} hr)"
      icon={AlertTriangle}
      variant={expiringBatches.some((b) => b.expiryMeta.level === "red") ? "danger" : "warning"}
      alertActionText="Cek Alert"
      onAlertClick={() => (activeTab = "ed_defekta")}
    />
  </div>

  <!-- TAB NAVIGATION -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold overflow-x-auto no-scrollbar">
    <button
      type="button"
      onclick={() => (activeTab = "katalog")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'katalog' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <Layers class="w-4 h-4" />
        <span>Katalog & Master Obat</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] {activeTab === 'katalog' ? 'bg-brand-blue-50 text-brand-blue-700' : 'bg-slate-100 text-slate-500'}">
          {products.length}
        </span>
      </div>
      {#if activeTab === "katalog"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "kartu_stok")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'kartu_stok' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <ArrowUpDown class="w-4 h-4" />
        <span>Kartu Stok (Buku Besar Mutasi)</span>
      </div>
      {#if activeTab === "kartu_stok"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "ed_defekta")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'ed_defekta' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <AlertTriangle class="w-4 h-4 text-amber-500" />
        <span>Peringatan ED & Defekta</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-red-100 text-brand-red-700 font-bold">
          {lowStockProducts.length + expiringBatches.length}
        </span>
      </div>
      {#if activeTab === "ed_defekta"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    {#if canPerformOpname}
      <button
        type="button"
        onclick={() => (activeTab = "riwayat_opname")}
        class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'riwayat_opname' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
      >
        <div class="flex items-center gap-2">
          <ClipboardCheck class="w-4 h-4 text-emerald-600" />
          <span>Riwayat Opname & Selisih Fisik</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold">
            {opnameSummary.discrepancyCount}
          </span>
        </div>
        {#if activeTab === "riwayat_opname"}
          <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
        {/if}
      </button>
    {/if}
  </div>

  <!-- ===================================================================== -->
  <!-- TAB 1: KATALOG OBAT                                                   -->
  <!-- ===================================================================== -->
  {#if activeTab === "katalog"}
    <DataTable
      title="Katalog Obat & Stok"
      subtitle="Monitoring stok fisik, golongan obat, dan harga jual per satuan"
      searchPlaceholder="Cari nama obat, kandungan aktif, SKU, atau scan barcode..."
      bind:searchValue={searchQuery}
      totalCount={filteredProducts.length}
      currentPage={catalogPage}
      totalPages={catalogTotalPages}
      pageSize={PAGE_SIZE}
      onPageChange={(p) => (catalogPage = p)}
      emptyText="Tidak ada obat yang cocok dengan kriteria pencarian / golongan."
      emptyIcon={Package}
    >
      {#snippet titleContent()}
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-blue-50 text-[#1d63d8] flex items-center justify-center font-bold">
            <Package class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Katalog Obat & Stok</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#1d63d8] border border-blue-200/60">
                {filteredProducts.length} Produk
              </span>
            </h3>
            <p class="text-[11px] text-slate-500 font-medium">Monitoring stok fisik, golongan obat, dan harga jual per satuan</p>
          </div>
        </div>
      {/snippet}

      {#snippet filters()}
        <Select
          bind:value={selectedCategory}
          onchange={() => (catalogPage = 1)}
          size="sm"
          align="right"
          options={[
            { value: "ALL", label: "Semua Golongan" },
            ...categories.map((cat) => ({
              value: cat.id,
              label: cat.name
            }))
          ]}
        />
      {/snippet}

      {#snippet header()}
        <SortableTh key="name" label="Produk" sortKey={catalogSortKey} sortDirection={catalogSortDirection} onsort={handleCatalogSort} />
        <SortableTh key="sku" label="SKU / Barcode" sortKey={catalogSortKey} sortDirection={catalogSortDirection} onsort={handleCatalogSort} />
        <SortableTh key="drugClass" label="Golongan" sortKey={catalogSortKey} sortDirection={catalogSortDirection} onsort={handleCatalogSort} />
        <th class="py-3 px-4 text-center">Satuan</th>
        <SortableTh key="totalStock" label="Stok Fisik" align="right" dataType="number" sortKey={catalogSortKey} sortDirection={catalogSortDirection} onsort={handleCatalogSort} />
        <SortableTh key="generalPrice" label="Umum (Rp)" align="right" dataType="currency" sortKey={catalogSortKey} sortDirection={catalogSortDirection} onsort={handleCatalogSort} />
        <SortableTh key="prescriptionPrice" label="Resep (Rp)" align="right" dataType="currency" sortKey={catalogSortKey} sortDirection={catalogSortDirection} onsort={handleCatalogSort} />
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#each paginatedProducts as p}
          {@const totalStock = getProductTotalStock(p)}
          {@const generalPrice = p.units[0]?.prices.general || 0}
          {@const prescriptionPrice = p.units[0]?.prices.prescription || 0}
          <tr class="hover:bg-blue-50/40 transition-colors group">
            <td class="py-3.5 px-4">
              <div class="font-bold text-slate-900 group-hover:text-brand-blue transition-colors flex items-center gap-1.5 flex-wrap">
                <span>{p.name}</span>
                {#if p.isConsignment}
                  <span class="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200 font-bold text-[10px]">
                    KONSINYASI
                  </span>
                {/if}
              </div>
              <div class="text-[11px] text-slate-400 font-normal">
                {p.genericName || p.manufacturer}
              </div>
            </td>
            <td class="py-3.5 px-4 font-mono text-[11px] text-slate-500">
              <div>{p.sku}</div>
              <div class="text-[10px] text-slate-400">{p.barcode}</div>
            </td>
            <td class="py-3.5 px-4">
              <Badge
                type={
                  p.drugClass === "ETHICAL"
                    ? "KERAS"
                    : p.drugClass === "LIMITED_OTC"
                      ? "BEBAS_TERBATAS"
                      : p.drugClass === "PSYCHOTROPIC"
                        ? "PSIKOTROPIKA"
                        : p.drugClass === "NARCOTICS"
                          ? "NARKOTIKA"
                          : "BEBAS"
                }
              />
            </td>
            <td class="py-3.5 px-4 text-center">
              <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                {p.baseUnit}
              </span>
              {#if p.units.length > 1}
                <span class="block text-[10px] text-slate-400 mt-0.5">
                  {p.units.length} satuan
                </span>
              {/if}
            </td>
            <td class="py-3.5 px-4 text-right">
              <span class="font-black text-sm {totalStock < 50 ? 'text-brand-red-600' : 'text-slate-800'}">
                {totalStock}
              </span>
              <span class="text-[10px] text-slate-400 block">
                {p.batches.length} batch -
              </span>
            </td>
            <td class="py-3.5 px-4 text-right font-bold text-slate-800 font-mono">
              {formatRupiah(generalPrice)}
            </td>
            <td class="py-3.5 px-4 text-right font-bold text-blue-700 font-mono">
              {formatRupiah(prescriptionPrice)}
            </td>
            <td class="py-3.5 px-4 text-center">
              <div class="inline-flex items-center gap-1.5">
                {#if canManageStock}
                  <button
                    type="button"
                    onclick={() => openOpnameForProduct(p.id)}
                    title="Hitung fisik & sesuaikan stok obat ini"
                    class="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold transition-all"
                  >
                    {canPerformOpname ? "Opname" : "Koreksi"}
                  </button>
                {/if}
                <button
                  type="button"
                  onclick={() => openEditProductModal(p)}
                  title="Edit Master Obat & Harga"
                  class="p-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all"
                  aria-label="Edit {p.name}"
                >
                  <Edit3 class="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onclick={() => handleDeleteProduct(p)}
                  title="Hapus / Nonaktifkan Obat"
                  class="p-1.5 rounded-lg border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all"
                  aria-label="Hapus {p.name}"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onclick={() => {
                    selectedProductIdForCard = p.id;
                    activeTab = "kartu_stok";
                    loadStockLedger();
                    fetchProducts(true);
                  }}
                  title="Lihat buku besar mutasi keluar/masuk obat ini"
                  class="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-brand-blue hover:bg-blue-50 text-slate-600 hover:text-brand-blue text-[11px] font-bold transition-all"
                >
                  Kartu Stok
                </button>
              </div>
            </td>
          </tr>
        {/each}
      {/snippet}
    </DataTable>

  <!-- ===================================================================== -->
  <!-- TAB 2: KARTU STOK (DOUBLE-ENTRY MUTATION LEDGER)                      -->
  <!-- ===================================================================== -->
  {:else if activeTab === "kartu_stok"}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <span class="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Kartu Stok & Audit Mutasi
          </span>
          <h2 class="text-xl font-black text-slate-900 mt-0.5 flex items-center gap-2">
            <span>{selectedProductForCard?.name}</span>
          </h2>
          <div class="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1.5">
            <span>SKU: <strong class="text-slate-700 font-mono">{selectedProductForCard?.sku}</strong></span>
            <span>Satuan Dasar: <strong class="text-slate-700">{selectedProductForCard?.baseUnit}</strong></span>
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
              <span>Saldo Sistem Saat Ini:</span>
              <strong class="font-mono text-emerald-700 text-sm">
                {getProductTotalStock(selectedProductForCard)} {selectedProductForCard?.baseUnit}
              </strong>
            </span>
          </div>
        </div>

        <!-- Drug & Mutation Filter -->
        <div class="flex flex-col lg:items-end gap-2">
          <!-- Baris 1: Select Mutasi & Tombol Opname -->
          <div class="flex flex-wrap items-center lg:justify-end gap-2">
            <Select
              bind:value={selectedLedgerTypeFilter}
              size="sm"
              align="right"
              options={[
                { value: "ALL", label: "Semua Mutasi (Semua Alur Barang)" },
                { value: "PEMBELIAN", label: "Pembelian PBF (+)" },
                { value: "PENJUALAN", label: "Penjualan Kasir POS (-)" },
                { value: "RESEP_DOKTER", label: "Pelayanan Resep Dokter (-)" },
                { value: "PENGIRIMAN_CABANG", label: "Pengiriman Antar-Cabang (-)" },
                { value: "PENERIMAAN_CABANG", label: "Penerimaan Antar-Cabang (+)" },
                { value: "KONSINYASI", label: "Penerimaan Konsinyasi (+)" },
                { value: "OPNAME", label: "Stok Opname / Koreksi Fisik (+/-)" },
                { value: "RETUR_JUAL", label: "Retur Penjualan Pasien (+)" },
                { value: "RETUR_BELI", label: "Retur Pembelian ke PBF (-)" },
                { value: "VOID_BELI", label: "Pembatalan Faktur (-)" },
                { value: "DEFICIT_OVERSELL", label: "Defisit Oversell (Audit APA)" }
              ]}
            />

            {#if canManageStock}
              <button
                type="button"
                onclick={() => openOpnameForProduct(selectedProductForCard?.id)}
                class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <ClipboardCheck class="w-3.5 h-3.5" />
                <span>{canPerformOpname ? "Opname Obat Ini" : "Koreksi Obat Ini"}</span>
              </button>
            {/if}
          </div>

          <!-- Baris 2: Select Pilih Obat -->
          <div class="flex items-center lg:justify-end gap-2 w-full sm:w-auto">
            <label for="select-drug" class="text-xs font-bold text-slate-600 shrink-0">Pilih Obat:</label>
            <SearchableSelect
              id="select-drug"
              bind:value={selectedProductIdForCard}
              variant="default"
              size="sm"
              align="right"
              minMenuWidth={300}
              class="flex-1 sm:w-72"
              searchPlaceholder="Cari nama obat atau SKU..."
              options={products.map((p) => ({
                value: p.id,
                label: p.name,
                sublabel: `SKU: ${p.sku} • Stok: ${getProductTotalStock(p)} ${p.baseUnit}`
              }))}
            />
          </div>
        </div>
      </div>

      <!-- APA Deficit Oversell Alert Banner -->
      {#if productLedgerEntries.some((e) => e.type === "DEFICIT_OVERSELL")}
        <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 text-red-900">
          <div class="flex items-center gap-2">
            <AlertTriangle class="w-4 h-4 text-brand-red-600 flex-shrink-0" />
            <span><strong>Audit APA:</strong> Terdapat transaksi kasir offline yang melebihi saldo batch. Silakan lakukan opname fisik untuk menyeimbangkan.</span>
          </div>
          {#if canManageStock}
            <button
              type="button"
              onclick={() => openOpnameForProduct(selectedProductForCard?.id)}
              class="px-2.5 py-1 rounded-lg bg-brand-red-600 hover:bg-brand-red-700 text-white font-bold text-[11px] transition-colors"
            >
              Sesuaikan Fisik
            </button>
          {/if}
        </div>
      {/if}

      <!-- Batch Breakdown Banner -->
      {#if selectedProductForCard}
        <div class="bg-slate-50 rounded-xl p-3 border border-slate-200/70 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div class="font-bold text-slate-600 flex items-center gap-1.5">
            <Info class="w-4 h-4 text-brand-blue" />
            <span>Rincian Batch Aktif (FEFO Order):</span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            {#each selectedProductForCard.batches as b}
              {@const bExp = evaluateExpiryStatus(b.expiryDate, normalizedExpiryDays)}
              {@const bCls = getExpiryLevelClasses(bExp.level)}
              <div class="px-2.5 py-1 rounded-lg border font-mono text-[11px] flex items-center gap-2 {bCls.pill}">
                <span class="font-bold text-slate-800">{b.batchNumber}</span>
                <span class="text-slate-300">|</span>
                <span class="font-semibold {bCls.edText}">
                  ED: {b.expiryDate} ({bExp.label})
                </span>
                <span class="text-slate-300">|</span>
                <span class="font-black text-emerald-700">{b.stock} {selectedProductForCard.baseUnit}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Ledger Table -->
      <div class="overflow-x-auto scrollbar-minimalist">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-100">
              <th class="py-3 px-4">Tanggal</th>
              <th class="py-3 px-4">Jenis</th>
              <th class="py-3 px-4">Batch</th>
              <th class="py-3 px-4 text-right">Masuk</th>
              <th class="py-3 px-4 text-right">Keluar</th>
              <th class="py-3 px-4 text-right">Saldo</th>
              <th class="py-3 px-4">Keterangan</th>
              <th class="py-3 px-4 text-center">Petugas</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
            {#if productLedgerEntries.length === 0}
              <tr>
                <td colspan="9" class="py-12 text-center text-slate-400">
                  <div class="flex flex-col items-center justify-center gap-2">
                    <Package class="w-8 h-8 text-slate-300" />
                    <p class="font-bold text-sm text-slate-600">Belum ada riwayat mutasi alur barang untuk obat ini di cabang aktif</p>
                    <p class="text-xs text-slate-400">Seluruh transaksi penjualan, pembelian, pengiriman cabang, dan opname terekam otomatis di kartu stok ini.</p>
                  </div>
                </td>
              </tr>
            {/if}
            {#each productLedgerEntries as entry}
              <tr class="hover:bg-slate-50/50 {entry.type === 'OPNAME' ? 'bg-amber-50/30' : ''}">
                <td class="py-3 px-4 font-mono text-slate-500 max-w-[160px]">
                  {entry.date}
                </td>
                <td class="py-3 px-4">
                  <span
                    class="px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap {
                      entry.type === 'PEMBELIAN'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : entry.type === 'PENJUALAN'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : entry.type === 'RESEP_DOKTER'
                            ? 'bg-teal-50 text-teal-700 border-teal-200'
                            : entry.type === 'PENGIRIMAN_CABANG'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : entry.type === 'PENERIMAAN_CABANG'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : entry.type === 'KONSINYASI'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : entry.type === 'OPNAME'
                                    ? 'bg-violet-50 text-violet-700 border-violet-200'
                                    : entry.type === 'RETUR_JUAL'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : entry.type === 'RETUR_BELI'
                                        ? 'bg-orange-50 text-orange-700 border-orange-200'
                                        : entry.type === 'VOID_BELI'
                                          ? 'bg-slate-100 text-slate-700 border-slate-300'
                                          : entry.type === 'DEFICIT_OVERSELL'
                                            ? 'bg-red-100 text-brand-red-700 border-red-300'
                                            : 'bg-slate-50 text-slate-700 border-slate-200'
                    }"
                  >
                    {
                      entry.type === 'PEMBELIAN'
                        ? 'PEMBELIAN PBF'
                        : entry.type === 'PENJUALAN'
                          ? 'KASIR POS'
                          : entry.type === 'RESEP_DOKTER'
                            ? 'RESEP DOKTER'
                            : entry.type === 'PENGIRIMAN_CABANG'
                              ? 'TRANSFER KELUAR'
                              : entry.type === 'PENERIMAAN_CABANG'
                                ? 'TRANSFER MASUK'
                                : entry.type === 'KONSINYASI'
                                  ? 'KONSINYASI'
                                  : entry.type === 'OPNAME'
                                    ? 'STOK OPNAME'
                                    : entry.type === 'RETUR_JUAL'
                                      ? 'RETUR PASIEN'
                                      : entry.type === 'RETUR_BELI'
                                        ? 'RETUR KE PBF'
                                        : entry.type === 'VOID_BELI'
                                          ? 'VOID FAKTUR'
                                          : entry.type === 'DEFICIT_OVERSELL'
                                            ? 'DEFISIT OFFLINE'
                                            : entry.type
                    }
                  </span>
                </td>
                <td class="py-3 px-4 font-mono text-slate-600 min-w-[120px]">
                  <div>{entry.batch}</div>
                  {#if entry.expiryDate && entry.expiryDate !== '-'}
                    <div class="text-[10px] text-slate-400">ED: {entry.expiryDate}</div>
                  {/if}
                </td>
                <td class="py-3 px-4 text-right font-bold text-emerald-600 font-mono">
                  {entry.qtyIn > 0 ? `+${entry.qtyIn}` : "-"}
                </td>
                <td class="py-3 px-4 text-right font-bold text-brand-red-600 font-mono">
                  {entry.qtyOut > 0 ? `-${entry.qtyOut}` : "-"}
                </td>
                <td class="py-3 px-4 text-right font-black text-slate-900 font-mono">
                  {entry.balance}
                </td>
                <td class="py-3 px-4 text-slate-600 max-w-xs" title={entry.notes}>
                  {entry.notes}
                </td>
                <td class="py-3 px-4 text-center text-slate-500 font-semibold whitespace-nowrap">
                  {entry.operator}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

  <!-- ===================================================================== -->
  <!-- TAB 3: RIWAYAT OPNAME & AUDIT SELISIH FISIK VS SISTEM                 -->
  <!-- ===================================================================== -->
  {:else if activeTab === "riwayat_opname"}
    <div class="space-y-4">
      <!-- Summary Strip for Stock Opname Discrepancies -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white rounded-2xl border border-red-100 p-4 flex items-center justify-between shadow-xs">
          <div>
            <span class="text-[11px] font-bold text-slate-400 uppercase">Selisih Kurang (Shrinkage / Loss)</span>
            <div class="text-lg font-black text-brand-red-600 mt-0.5">
              {opnameSummary.lossCount} Batch ({formatRupiah(opnameSummary.totalLossValue)})
            </div>
            <span class="text-[11px] text-slate-500">Fisik di rak lebih sedikit dari sistem</span>
          </div>
          <div class="w-10 h-10 rounded-xl bg-red-50 text-brand-red-600 flex items-center justify-center">
            <TrendingDown class="w-5 h-5" />
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-blue-100 p-4 flex items-center justify-between shadow-xs">
          <div>
            <span class="text-[11px] font-bold text-slate-400 uppercase">Selisih Lebih (Surplus / Gain)</span>
            <div class="text-lg font-black text-brand-blue-700 mt-0.5">
              {opnameSummary.gainCount} Batch (+{formatRupiah(opnameSummary.totalGainValue)})
            </div>
            <span class="text-[11px] text-slate-500">Fisik di rak lebih banyak dari sistem</span>
          </div>
          <div class="w-10 h-10 rounded-xl bg-blue-50 text-brand-blue-700 flex items-center justify-center">
            <TrendingUp class="w-5 h-5" />
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-emerald-100 p-4 flex items-center justify-between shadow-xs">
          <div>
            <span class="text-[11px] font-bold text-slate-400 uppercase">Stok Cocok 100% (Terverifikasi)</span>
            <div class="text-lg font-black text-emerald-700 mt-0.5">
              {opnameSummary.matchCount} Batch Cocok
            </div>
            <span class="text-[11px] text-slate-500">Fisik sama persis dengan sistem (Delta = 0)</span>
          </div>
          <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Check class="w-5 h-5" />
          </div>
        </div>
      </div>

      <!-- Opname Discrepancy Table -->
      <DataTable
        title="Hasil Stok Opname"
        subtitle="Riwayat audit fisik stok, penyesuaian selisih batch, dan rekonsiliasi nilai inventaris"
        searchPlaceholder="Cari nama obat, No. Dokumen RJK, atau nomor batch..."
        bind:searchValue={opnameSearchQuery}
        totalCount={sortedOpnameHistory.length}
        currentPage={opnamePage}
        totalPages={opnameTotalPages}
        pageSize={PAGE_SIZE}
        onPageChange={(p) => (opnamePage = p)}
        emptyText="Tidak ada data pemeriksaan stok opname yang sesuai filter."
        emptyIcon={ClipboardCheck}
      >
        {#snippet titleContent()}
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <ClipboardCheck class="w-5 h-5" />
            </div>
            <div>
              <h3 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Hasil Stok Opname</span>
                <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                  {sortedOpnameHistory.length} Riwayat Opname
                </span>
              </h3>
              <p class="text-[11px] text-slate-500 font-medium">Riwayat audit fisik stok, penyesuaian selisih batch, dan rekonsiliasi nilai inventaris</p>
            </div>
          </div>
        {/snippet}

        {#snippet filters()}
          <Select
            bind:value={opnameDiffFilter}
            onchange={() => (opnamePage = 1)}
            size="sm"
            align="right"
            options={[
              { value: "DIFF_ONLY", label: "Hanya yang Selisih (Delta != 0)" },
              { value: "ALL", label: "Semua Hasil Opname" },
              { value: "LOSS", label: "Selisih Kurang / Hilang (-)" },
              { value: "GAIN", label: "Selisih Lebih (+)" },
              { value: "MATCH", label: "Cocok / Sesuai (Delta = 0)" }
            ]}
          />
        {/snippet}

        {#snippet header()}
          <SortableTh key="docNumber" label="Dokumen" sortKey={opnameSortKey} sortDirection={opnameSortDirection} onsort={handleOpnameSort} />
          <SortableTh key="productName" label="Nama Obat" sortKey={opnameSortKey} sortDirection={opnameSortDirection} onsort={handleOpnameSort} />
          <SortableTh key="systemQty" label="Sebelum" align="right" dataType="number" sortKey={opnameSortKey} sortDirection={opnameSortDirection} onsort={handleOpnameSort} />
          <SortableTh key="actualQty" label="Sesudah" align="right" dataType="number" sortKey={opnameSortKey} sortDirection={opnameSortDirection} onsort={handleOpnameSort} />
          <SortableTh key="differenceQty" label="Selisih" align="center" dataType="number" sortKey={opnameSortKey} sortDirection={opnameSortDirection} onsort={handleOpnameSort} />
          <SortableTh key="valueDifference" label="Dampak" align="right" dataType="currency" sortKey={opnameSortKey} sortDirection={opnameSortDirection} onsort={handleOpnameSort} />
          <th class="py-3 px-4">Catatan</th>
          <SortableTh key="operator" label="Petugas" align="center" sortKey={opnameSortKey} sortDirection={opnameSortDirection} onsort={handleOpnameSort} />
        {/snippet}

        {#snippet rows()}
          {#each paginatedOpnameHistory as item}
            <tr class="hover:bg-slate-50/70 transition-colors">
              <td class="py-3.5 px-4 whitespace-nowrap">
                <div class="font-mono font-bold text-brand-blue">{item.docNumber}</div>
                <div class="text-[11px] font-mono text-slate-400">{item.date}</div>
              </td>
              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-900">{item.productName}</div>
                <div class="text-[11px] font-mono text-slate-500">
                  <strong>{item.batchNumber}</strong> | {item.sku}
                </div>
              </td>
              <td class="py-3.5 px-4 text-right font-mono font-bold text-slate-500">
                {item.systemQty} {item.unit}
              </td>
              <td class="py-3.5 px-4 text-right font-mono font-black text-slate-900">
                {item.actualQty} {item.unit}
              </td>
              <td class="py-3.5 px-4 text-center">
                {#if item.differenceQty < 0}
                  <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-red-100 text-brand-red-700 font-mono">
                    {item.differenceQty} {item.unit}
                  </span>
                {:else if item.differenceQty > 0}
                  <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-100 text-brand-blue-700 font-mono">
                    +{item.differenceQty} {item.unit}
                  </span>
                {:else}
                  <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
                    0 (Cocok)
                  </span>
                {/if}
              </td>
              <td class="py-3.5 px-4 text-right font-mono">
                <div
                  class="font-bold {item.valueDifference < 0
                    ? 'text-brand-red-600'
                    : item.valueDifference > 0
                      ? 'text-brand-blue-700'
                      : 'text-slate-400'}"
                >
                  {item.valueDifference > 0 ? `+${formatRupiah(item.valueDifference, false)}` : formatRupiah(item.valueDifference, false)}
                </div>
                <div class="text-[10px] text-slate-400">
                  {formatRupiah(item.costPerUnit, false)}/{item.unit}
                </div>
              </td>
              <td class="py-3.5 px-4 max-w-xs">
                <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px] uppercase">
                  {getReasonLabel(item.reasonType)}
                </span>
                <p class="text-[11px] text-slate-500 mt-1 line-clamp-2">{item.notes}</p>
              </td>
              <td class="py-3.5 px-4 text-center text-slate-600 font-semibold whitespace-nowrap">
                {item.operator}
              </td>
            </tr>
          {/each}
        {/snippet}
      </DataTable>
    </div>

  <!-- ===================================================================== -->
  <!-- TAB 4: ED & DEFEKTA                                                   -->
  <!-- ===================================================================== -->
  {:else if activeTab === "ed_defekta"}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- DEFEKTA CARD -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2">
            <AlertTriangle class="w-4 h-4 text-brand-red-600" />
            <h3 class="text-sm font-bold text-slate-800">Daftar Defekta</h3>
            <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-brand-red-700">
              {filteredDefektaProducts.length} Obat
            </span>
          </div>
          <div class="relative w-full sm:w-56">
            <Search class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              bind:value={defektaSearchQuery}
              oninput={() => (defektaPage = 1)}
              placeholder="Cari obat defekta..."
              class="w-full bg-slate-50 pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:bg-white focus:border-brand-blue-500 focus:outline-none text-slate-700"
            />
          </div>
        </div>

        <div class="space-y-2.5">
          {#each paginatedDefektaProducts as lp}
            {@const stock = getProductTotalStock(lp)}
            <div class="p-3 rounded-xl border border-red-100 bg-red-50/20 flex items-center justify-between">
              <div>
                <div class="font-bold text-xs text-slate-900">{lp.name}</div>
                <div class="text-[11px] text-slate-400 mt-0.5">SKU: {lp.sku} • {lp.genericName || lp.manufacturer}</div>
              </div>
              <div class="text-right">
                <div class="text-xs font-black text-brand-red-600">Sisa Sistem: {stock} {lp.baseUnit}</div>
                <a
                  href="/pembelian"
                  class="text-[11px] font-bold text-brand-blue hover:underline mt-0.5 inline-block"
                >
                  + Buat Surat Pesanan
                </a>
              </div>
            </div>
          {/each}
        </div>

        {#if defektaTotalPages > 1}
          <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Hal. <strong class="text-slate-700">{defektaPage}</strong> / <strong class="text-slate-700">{defektaTotalPages}</strong>
              ({filteredDefektaProducts.length} obat)
            </span>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                disabled={defektaPage <= 1}
                onclick={() => (defektaPage = Math.max(1, defektaPage - 1))}
                class="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Halaman Defekta Sebelumnya"
              >
                <ChevronLeft class="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={defektaPage >= defektaTotalPages}
                onclick={() => (defektaPage = Math.min(defektaTotalPages, defektaPage + 1))}
                class="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Halaman Defekta Selanjutnya"
              >
                <ChevronRight class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- ED ALERT CARD -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3.5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2">
            <Clock class="w-4 h-4 text-amber-500" />
            <h3 class="text-sm font-bold text-slate-800">FEFO Alert</h3>
            <span class="px-2 py-0.5 rounded-full text-xs font-bold {expiringBatches.some((b) => b.expiryMeta.level === 'red') ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}">
              {expiringBatches.length} Batch
            </span>
          </div>

          <div class="flex items-center gap-1.5 text-[11px]">
            <label for="expiry-threshold-select" class="font-semibold text-slate-500 whitespace-nowrap">Batas ED:</label>
            <select
              id="expiry-threshold-select"
              value={String([30, 60, 90, 180, 365, 730].includes(normalizedExpiryDays) ? normalizedExpiryDays : "CUSTOM")}
              onchange={(e) => {
                const v = (e.currentTarget as HTMLSelectElement).value;
                if (v !== "CUSTOM") expiryWarningDays = Number(v);
              }}
              class="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-700 text-[11px] focus:outline-none focus:border-brand-blue-500"
            >
              <option value="30">30 Hari (1 Bln)</option>
              <option value="60">60 Hari (2 Bln)</option>
              <option value="90">90 Hari (3 Bln)</option>
              <option value="180">180 Hari (6 Bln)</option>
              <option value="365">365 Hari (1 Thn)</option>
              <option value="730">730 Hari (2 Thn)</option>
              <option value="CUSTOM">Kustom</option>
            </select>
          </div>
        </div>

        {#if expiringBatches.length === 0}
          <div class="py-10 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-xs">
            <CheckCircle2 class="w-7 h-7 mx-auto text-emerald-500 mb-1.5" />
            <div class="font-bold text-slate-700">Semua batch aman</div>
            <div class="text-[11px] text-slate-400 mt-0.5">
              Tidak ada batch dengan sisa masa simpan &le; {normalizedExpiryDays} hari.
            </div>
          </div>
        {:else}
          <div class="space-y-2.5 max-h-[480px] overflow-y-auto pr-1 scrollbar-minimalist">
            {#each expiringBatches as eb}
              {@const cls = getExpiryLevelClasses(eb.expiryMeta.level)}
              <div class="p-3 rounded-xl border flex items-center justify-between gap-3 {cls.card}">
                <div class="min-w-0">
                  <div class="font-bold text-xs text-slate-900 truncate">{eb.productName}</div>
                  <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mt-1 font-mono">
                    <span>Batch: <strong class="text-slate-700">{eb.batchNumber}</strong></span>
                    <span class="px-1.5 py-0.5 rounded border text-[10px] font-sans font-bold {cls.badge}">
                      {eb.expiryMeta.isExpired ? "KADALUARSA" : eb.expiryMeta.level === "red" ? "KRITIS" : "WASPADA"} &bull; {eb.expiryMeta.label}
                    </span>
                  </div>
                </div>
                <div class="text-right flex-shrink-0">
                  <div class="text-xs font-black font-mono {cls.edText}">
                    ED: {eb.expiryDate}
                  </div>
                  <div class="text-[10px] text-slate-500 mt-0.5">
                    Stok: <strong>{eb.stock} {eb.baseUnit}</strong>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- ======================================================================= -->
<!-- MODAL 1: STOK OPNAME FISIK (SINGLE ITEM & LEMBAR KERJA MASSAL)          -->
<!-- ======================================================================= -->
{#if isOpnameModalOpen && canManageStock}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isOpnameModalOpen = false;
    }}
    role="presentation"
  >
    <div
      class="bg-white/95 backdrop-blur-xl rounded-2xl {opnameMode === 'worksheet' ? 'max-w-4xl' : 'max-w-xl'} w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <div class="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <ClipboardCheck class="w-5 h-5 text-emerald-600" />
            <div class="flex flex-col">
              <span>Formulir Stok Opname & Rekonsiliasi Fisik</span>
              <p class="text-[11px] text-slate-500">
                Selisih tercatat ke Riwayat Opname & Kartu Stok.
              </p>
            </div>
          </div>
        </div>
        <button
          onclick={() => (isOpnameModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Mode Switcher: Koreksi Cepat 1 Obat vs Lembar Kerja Massal -->
      {#if canPerformOpname}
        <div class="grid grid-cols-2 gap-2 px-1 bg-slate-100 rounded-xl text-xs font-bold">
          <button
            type="button"
            onclick={() => (opnameMode = "single")}
            class="py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-2 {opnameMode === 'single' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}"
          >
            <ClipboardCheck class="w-4 h-4 text-emerald-600" />
            <span>Koreksi Per Obat</span>
          </button>
          <button
            type="button"
            onclick={() => (opnameMode = "worksheet")}
            class="py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-2 {opnameMode === 'worksheet' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}"
          >
            <FileSpreadsheet class="w-4 h-4 text-brand-blue" />
            <span>Lembar Kerja Massal</span>
          </button>
        </div>
      {/if}

      <!-- BODY: MODE 1 (SINGLE ITEM) -->
      {#if opnameMode === "single"}
        <div class="space-y-4 text-xs overflow-y-auto pr-1 no-scrollbar max-h-[70vh]">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="sm:col-span-2">
              <label for="opname-prod" class="font-bold text-slate-700 block mb-1">Obat Diperiksa</label>
              <SearchableSelect
                id="opname-prod"
                bind:value={opnameProductId}
                variant="default"
                searchPlaceholder="Cari nama obat, SKU, atau kandungan..."
                onchange={(val) => handleOpnameProductChange(val)}
                options={products.map((p) => {
                  const tot = getProductTotalStock(p);
                  return {
                    value: p.id,
                    label: p.name,
                    sublabel: `SKU: ${p.sku} • ${p.genericName || p.manufacturer}`,
                    badge: `${tot} ${p.baseUnit}`
                  };
                })}
              />
            </div>

            <div>
              <label for="opname-batch" class="font-bold text-slate-700 block mb-1">Nomor Batch</label>
              <Select
                id="opname-batch"
                bind:value={opnameBatchId}
                onchange={(val) => handleOpnameBatchChange(val)}
                options={(selectedOpnameProduct?.batches || []).map((b: any) => ({
                  value: b.id,
                  label: b.batchNumber,
                  sublabel: `ED: ${b.expiryDate}`,
                  badge: `Sistem: ${b.stock}`
                }))}
              />
            </div>

            <div>
              <label for="opname-qty" class="font-bold text-emerald-800 block mb-1">
                Qty Fisik ({selectedOpnameProduct?.baseUnit})
              </label>
              <input
                id="opname-qty"
                type="number"
                min="0"
                bind:value={opnameActualQty}
                placeholder="Masukkan jumlah fisik di rak"
                class="w-full bg-emerald-50/50 border-2 border-emerald-400 focus:border-emerald-600 focus:outline-none rounded-xl px-3 py-2 font-mono font-black text-sm text-emerald-900"
              />
            </div>
          </div>

          <!-- LIVE COMPARISON CARD: DATA SISTEM VS FISIK -->
          <div class="rounded-2xl border {singleDiffQty < 0 ? 'border-red-200 bg-red-50/40' : singleDiffQty > 0 ? 'border-blue-200 bg-blue-50/40' : 'border-emerald-200 bg-emerald-50/40'} p-4">
            <div class="grid grid-cols-3 gap-3 text-center">
              <div class="bg-white rounded-xl p-2.5 border border-slate-200/80">
                <span class="text-[10px] font-bold text-slate-400 uppercase block">Stok Sistem</span>
                <span class="text-base font-black text-slate-700 font-mono">
                  {singleSystemQty} {selectedOpnameProduct?.baseUnit}
                </span>
              </div>
              <div class="bg-white rounded-xl p-2.5 border border-slate-200/80">
                <span class="text-[10px] font-bold text-slate-400 uppercase block">Stok Fisik (Input)</span>
                <span class="text-base font-black text-slate-900 font-mono">
                  {opnameActualQty ?? 0} {selectedOpnameProduct?.baseUnit}
                </span>
              </div>
              <div class="bg-white rounded-xl p-2.5 border border-slate-200/80">
                <span class="text-[10px] font-bold text-slate-400 uppercase block">Selisih (Delta)</span>
                <span
                  class="text-base font-black font-mono {singleDiffQty < 0
                    ? 'text-brand-red-600'
                    : singleDiffQty > 0
                      ? 'text-brand-blue-700'
                      : 'text-emerald-600'}"
                >
                  {singleDiffQty > 0 ? `+${singleDiffQty}` : singleDiffQty} {selectedOpnameProduct?.baseUnit}
                </span>
              </div>
            </div>
            <div class="mt-2.5 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
              <span class="font-semibold text-slate-600">
                HPP Batch ({selectedOpnameBatch?.batchNumber}): <strong>{formatRupiah(singleCostPerUnit)}/{selectedOpnameProduct?.baseUnit}</strong>
              </span>
              <span class="font-bold {singleValueDiff < 0 ? 'text-brand-red-700' : singleValueDiff > 0 ? 'text-brand-blue-700' : 'text-emerald-700'}">
                Dampak Nilai Aset: {singleValueDiff > 0 ? `+${formatRupiah(singleValueDiff)}` : formatRupiah(singleValueDiff)}
              </span>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label for="opname-reason-type" class="font-bold text-slate-700 block mb-1">Kategori Alasan</label>
              <Select
                id="opname-reason-type"
                bind:value={opnameReasonType}
                options={[
                  { value: "STOCK_OPNAME", label: "Stok Opname Rutin" },
                  { value: "DAMAGED", label: "Barang Rusak / Pecah Kemasan" },
                  { value: "EXPIRED", label: "Barang Kadaluarsa (ED)" },
                  { value: "DISCREPANCY", label: "Koreksi Selisih Transaksi Kasir" }
                ]}
              />
            </div>
            <div>
              <label for="opname-notes" class="font-bold text-slate-700 block mb-1">Catatan Audit</label>
              <input
                id="opname-notes"
                type="text"
                bind:value={opnameNotes}
                placeholder="Contoh: Selisih hitung rak Obat Keras..."
                class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>
          </div>
        </div>

      <!-- BODY: MODE 2 (WORKSHEET MASSAL BANYAK OBAT SEKALIGUS) -->
      {:else}
        <div class="space-y-3 text-xs flex-1 overflow-hidden flex flex-col">
          <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div class="flex items-center gap-2">
              <label for="ws-cat" class="font-bold text-slate-600">Filter Rak / Golongan:</label>
              <Select
                id="ws-cat"
                bind:value={worksheetCategoryFilter}
                variant="white"
                size="sm"
                options={[
                  { value: "ALL", label: `Semua Golongan (${worksheetRows.length} Batch)` },
                  ...categories.map((c) => ({
                    value: c.id,
                    label: c.name
                  }))
                ]}
              />
            </div>

            <div class="flex items-center gap-3">
              <span class="text-slate-600">
                Terdeteksi Selisih:
                <strong class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  {worksheetChangedRows.length} Batch
                </strong>
              </span>
            </div>
          </div>

          <div class="overflow-y-auto border border-slate-200 rounded-xl flex-1 max-h-80 scrollbar-minimalist">
            <table class="w-full text-left border-collapse text-xs">
              <thead class="sticky top-0 bg-slate-100 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200 z-10">
                <tr>
                  <th class="py-2.5 px-3">Nama Obat</th>
                  <th class="py-2.5 px-3">Batch</th>
                  <th class="py-2.5 px-3 text-right">Qty Sistem</th>
                  <th class="py-2.5 px-3 text-center w-36">Qty Fisik</th>
                  <th class="py-2.5 px-3 text-center">Selisih</th>
                  <th class="py-2.5 px-3 text-right">Nilai</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                {#each worksheetRows as row}
                  <tr class={row.diffQty < 0 ? "bg-red-50/40" : row.diffQty > 0 ? "bg-blue-50/40" : "hover:bg-slate-50"}>
                    <td class="py-2 px-3">
                      <div class="font-bold text-slate-900">{row.productName}</div>
                      <div class="text-[10px] font-mono text-slate-400">SKU: {row.sku}</div>
                    </td>
                    <td class="py-2 px-3 font-mono text-[11px]">
                      <div class="font-bold text-slate-700">{row.batchNumber}</div>
                      <div class="text-[10px] text-slate-400">{row.expiryDate}</div>
                    </td>
                    <td class="py-2 px-3 text-right font-mono font-bold text-slate-600">
                      {row.systemQty} {row.unit}
                    </td>
                    <td class="py-2 px-3 text-center">
                      <input
                        type="number"
                        min="0"
                        value={worksheetCounts[row.batchId] ?? row.systemQty}
                        oninput={(e) => {
                          const val = Number((e.target as HTMLInputElement).value);
                          worksheetCounts[row.batchId] = isNaN(val) ? 0 : val;
                        }}
                        aria-label="Qty Fisik {row.productName} Batch {row.batchNumber}"
                        class="w-24 text-center font-mono font-black px-2 py-1 rounded-lg border {row.diffQty !== 0 ? 'border-amber-500 bg-white' : 'border-slate-200 bg-slate-50'} focus:outline-none focus:ring-2 focus:ring-brand-blue-500/20"
                      />
                    </td>
                    <td class="py-2 px-3 text-center font-mono font-black">
                      {#if row.diffQty < 0}
                        <span class="text-brand-red-600">{row.diffQty} {row.unit}</span>
                      {:else if row.diffQty > 0}
                        <span class="text-brand-blue-700">+{row.diffQty} {row.unit}</span>
                      {:else}
                        <span class="text-emerald-600 text-[11px]">0 (Cocok)</span>
                      {/if}
                    </td>
                    <td class="py-2 px-3 text-right font-mono text-[11px] font-bold {row.valueDiff < 0 ? 'text-brand-red-600' : row.valueDiff > 0 ? 'text-brand-blue-700' : 'text-slate-400'}">
                      {row.valueDiff === 0 ? "0" : formatRupiah(row.valueDiff)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label for="ws-reason" class="font-bold text-slate-700 block mb-1">Kategori Alasan Opname</label>
              <Select
                id="ws-reason"
                bind:value={opnameReasonType}
                size="sm"
                options={[
                  { value: "STOCK_OPNAME", label: "Stok Opname Rutin Bulanan" },
                  { value: "DISCREPANCY", label: "Koreksi Selisih Rak" },
                  { value: "DAMAGED", label: "Barang Rusak" },
                  { value: "EXPIRED", label: "Penarikan Obat ED" }
                ]}
              />
            </div>
            <div>
              <label for="ws-notes" class="font-bold text-slate-700 block mb-1">Catatan Lembar Kerja</label>
              <input
                id="ws-notes"
                type="text"
                bind:value={opnameNotes}
                placeholder="Contoh: Opname Rak Etalase Depan Oktober..."
                class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5"
              />
            </div>
          </div>
        </div>
      {/if}

      <!-- Footer -->
      <div class="border-t border-slate-100 pt-4 flex items-center justify-between gap-2">
        <span class="text-[11px] text-slate-500">
          Petugas: <strong>{authStore.user?.fullName || "apt. Hafidz Nurul"}</strong>
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={() => (isOpnameModalOpen = false)}
            class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            onclick={submitStockOpname}
            disabled={isSavingOpname}
            class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {#if isSavingOpname}
              <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Menyesuaikan Stok & Batch...</span>
            {:else}
              <CheckCircle2 class="w-4 h-4" />
              <span>Konfirmasi & Sesuaikan Stok</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ======================================================================= -->
<!-- MODAL 2: TAMBAH / EDIT KATALOG OBAT BARU                                -->
<!-- ======================================================================= -->
{#if isProductModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto scrollbar-minimalist w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isProductModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold text-sm">
          <Package class="w-5 h-5 text-brand-blue" />
          <span>{editingProductId ? "Edit Master Obat & Multi-Satuan" : "Tambah Katalog Obat Baru"}</span>
        </div>
        <button
          onclick={() => (isProductModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div class="col-span-2">
          <label for="prod-name" class="font-bold text-slate-700 block mb-1">Nama Obat / Barang</label>
          <input
            id="prod-name"
            type="text"
            bind:value={formProdName}
            placeholder="Contoh: Paracetamol 500 mg (Mersifarma)"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium"
          />
        </div>
        <div>
          <label for="prod-generic" class="font-bold text-slate-700 block mb-1">Zat Aktif / Generik</label>
          <input
            id="prod-generic"
            type="text"
            bind:value={formProdGeneric}
            placeholder="Paracetamol 500mg"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>
        <div>
          <label for="prod-manufacturer" class="font-bold text-slate-700 block mb-1">Pabrik / Produsen</label>
          <input
            id="prod-manufacturer"
            type="text"
            bind:value={formProdManufacturer}
            placeholder="PT. Kimia Farma"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>
        <div>
          <label for="prod-sku" class="font-bold text-slate-700 block mb-1">SKU / Kode Obat</label>
          <input
            id="prod-sku"
            type="text"
            bind:value={formProdSku}
            placeholder="000123"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
          />
        </div>
        <div>
          <label for="prod-barcode" class="font-bold text-slate-700 block mb-1">Barcode EAN-13</label>
          <input
            id="prod-barcode"
            type="text"
            bind:value={formProdBarcode}
            placeholder="8999900000001"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
          />
        </div>
        <div class="col-span-2 sm:col-span-1">
          <label for="prod-category" class="font-bold text-slate-700 block mb-1">Golongan Obat (BPOM)</label>
          <Select
            id="prod-category"
            bind:value={formProdDrugClass}
            options={[
              { value: "OTC", label: "Obat Bebas (Hijau)" },
              { value: "LIMITED_OTC", label: "Obat Bebas Terbatas (Biru)" },
              { value: "ETHICAL", label: "Obat Keras (Merah K)" },
              { value: "PSYCHOTROPIC", label: "Psikotropika" },
              { value: "NARCOTICS", label: "Narkotika" }
            ]}
          />
        </div>
        <div class="col-span-2 sm:col-span-1 flex items-center pt-4">
          <label for="prod-consignment" class="w-full bg-purple-50/70 border border-purple-200 rounded-xl p-2.5 flex items-start gap-2 cursor-pointer select-none">
            <input
              id="prod-consignment"
              type="checkbox"
              bind:checked={formProdIsConsignment}
              class="w-4 h-4 rounded text-purple-600 mt-0.5"
            />
            <div>
              <div class="font-bold text-purple-900 text-xs">Produk Konsinyasi (Titipan Vendor)</div>
              <div class="text-[10px] text-purple-700">Tandai sebagai barang titip jual dari supplier.</div>
            </div>
          </label>
        </div>

        <!-- SEKSI MULTI-SATUAN (product_units) -->
        <div class="col-span-2 border-t border-slate-200/80 pt-4 mt-2 space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Layers class="w-4 h-4 text-brand-blue" />
                <span>Multi-Satuan, Harga Beli (HNA) & Harga Jual Bertingkat</span>
              </div>
              <p class="text-[11px] text-slate-500 mt-0.5">
                Centang <strong>Jual POS</strong> agar satuan tampil di kasir, dan centang <strong>Beli SP</strong> untuk satuan pemesanan ke PBF.
              </p>
            </div>
            <button
              type="button"
              onclick={addUnitRow}
              class="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-brand-blue border border-blue-200 text-xs font-bold transition-all flex items-center gap-1 self-start sm:self-auto shadow-2xs"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Tambah Satuan</span>
            </button>
          </div>

          <div class="border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-2xs">
            <table class="w-full text-xs min-w-[780px]">
              <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th class="py-2.5 px-3 text-left">Level</th>
                  <th class="py-2.5 px-2 text-left">Satuan</th>
                  <th class="py-2.5 px-2 text-center">Konversi</th>
                  <th class="py-2.5 px-2 text-right bg-amber-50/60 text-amber-800">HNA Beli (Rp)</th>
                  <th class="py-2.5 px-2 text-right">Umum (Rp)</th>
                  <th class="py-2.5 px-2 text-right">Resep (Rp)</th>
                  <th class="py-2.5 px-2 text-right">Grosir (Rp)</th>
                  <th class="py-2.5 px-2 text-center" title="Tampilkan satuan ini sebagai tombol penjualan di kasir POS">Jual POS</th>
                  <th class="py-2.5 px-2 text-center" title="Jadikan satuan default pemesanan SP & Faktur Pembelian">Beli SP</th>
                  <th class="py-2.5 px-2 text-center w-10">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-medium">
                {#each formProdUnits as u, uIdx}
                  {@const isLowMargin = u.buyPrice > 0 && u.salePriceGeneral > 0 && u.salePriceGeneral <= u.buyPrice}
                  <tr class="hover:bg-slate-50/60 transition-colors {isLowMargin ? 'bg-rose-50/40' : uIdx === 0 ? 'bg-blue-50/20' : ''}">
                    <td class="py-2.5 px-3 font-semibold text-slate-700">
                      {#if uIdx === 0}
                        <Badge type="INFO" label="Terkecil" />
                      {:else}
                        <span class="text-slate-500 text-[11px]">Kemasan #{uIdx + 1}</span>
                      {/if}
                    </td>
                    <td class="py-2 px-2">
                      <input
                        type="text"
                        bind:value={u.unitName}
                        placeholder={uIdx === 0 ? "TABLET" : "STRIP"}
                        class="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-bold uppercase text-slate-800 text-xs"
                      />
                    </td>
                    <td class="py-2 px-2 text-center">
                      {#if uIdx === 0}
                        <span class="font-mono font-bold text-slate-500 text-xs">1</span>
                      {:else}
                        <div class="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="2"
                            bind:value={u.conversionFactor}
                            class="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-center font-mono font-bold text-xs"
                          />
                          <span class="text-slate-500 text-[10px]">{formProdUnits[0]?.unitName || 'Dasar'}</span>
                        </div>
                      {/if}
                    </td>
                    <td class="py-2 px-2 text-right bg-amber-50/30">
                      <input
                        type="number"
                        min="0"
                        bind:value={u.buyPrice}
                        class="w-24 bg-white border border-amber-200 rounded-lg px-2 py-1 text-right font-mono font-bold text-amber-800 text-xs"
                      />
                    </td>
                    <td class="py-2 px-2 text-right">
                      <input
                        type="number"
                        min="0"
                        bind:value={u.salePriceGeneral}
                        class="w-24 bg-slate-50 border {isLowMargin ? 'border-rose-400 text-rose-700' : 'border-slate-200 text-slate-800'} rounded-lg px-2 py-1 text-right font-mono font-bold text-xs"
                      />
                      {#if isLowMargin}
                        <div class="text-[9px] font-bold text-rose-600 mt-0.5">Margin &le; 0%</div>
                      {/if}
                    </td>
                    <td class="py-2 px-2 text-right">
                      <input
                        type="number"
                        min="0"
                        bind:value={u.salePriceResep}
                        class="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-right font-mono font-bold text-blue-700 text-xs"
                      />
                    </td>
                    <td class="py-2 px-2 text-right">
                      <input
                        type="number"
                        min="0"
                        bind:value={u.salePriceGrosir}
                        class="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-right font-mono font-bold text-slate-600 text-xs"
                      />
                    </td>
                    <td class="py-2 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={uIdx === 0 ? true : u.isSellable}
                        disabled={uIdx === 0}
                        onchange={(e) => {
                          if (uIdx > 0) u.isSellable = (e.currentTarget as HTMLInputElement).checked;
                        }}
                        class="w-4 h-4 rounded text-emerald-600 disabled:opacity-50"
                        aria-label="Jual di kasir POS ({u.unitName})"
                      />
                    </td>
                    <td class="py-2 px-2 text-center">
                      <input
                        type="checkbox"
                        bind:checked={u.isPurchaseUnit}
                        class="w-4 h-4 rounded text-amber-600"
                        aria-label="Satuan pemesanan SP ({u.unitName})"
                      />
                    </td>
                    <td class="py-2 px-2 text-center">
                      {#if uIdx > 0}
                        <button
                          type="button"
                          onclick={() => removeUnitRow(uIdx)}
                          class="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Hapus Satuan Kemasan"
                        >
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        {#if !editingProductId}
          <div class="col-span-2 border-t border-slate-100 pt-2 mt-1">
            <span class="text-[11px] font-bold text-slate-500 uppercase">Batch & Saldo Stok Awal</span>
          </div>
          <div>
            <label for="prod-batch-no" class="font-bold text-slate-700 block mb-1">Nomor Batch Awal</label>
            <input
              id="prod-batch-no"
              type="text"
              bind:value={formProdInitialBatch}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label for="prod-batch-ed" class="font-bold text-slate-700 block mb-1">Tanggal Kadaluarsa (ED)</label>
            <input
              id="prod-batch-ed"
              type="date"
              bind:value={formProdInitialExpiry}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label for="prod-init-stock" class="font-bold text-slate-700 block mb-1">Stok Awal ({formProdUnits[0]?.unitName || formProdBaseUnit})</label>
            <input
              id="prod-init-stock"
              type="number"
              bind:value={formProdInitialStock}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-emerald-700"
            />
          </div>
          <div>
            <label for="prod-buy-price" class="font-bold text-slate-700 block mb-1">HPP / Harga Beli (Rp)</label>
            <input
              id="prod-buy-price"
              type="number"
              bind:value={formProdBuyPrice}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
            />
          </div>
        {/if}
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isProductModalOpen = false)}
          disabled={isSavingProduct}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={saveProductForm}
          disabled={isSavingProduct}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {#if isSavingProduct}
            <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Menyimpan...</span>
          {:else}
            <span>{editingProductId ? "Simpan Perubahan" : "Simpan Produk Baru"}</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
