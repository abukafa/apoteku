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
    ArrowRight
  } from "lucide-svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import productsData from "$lib/mocks/products.json";
  import categoriesData from "$lib/mocks/categories.json";
  import branchesData from "$lib/mocks/branches.json";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { portal } from "$lib/actions/portal";

  // Types for Ledger & Adjustment History
  interface LedgerEntry {
    id: string;
    productId: string;
    productName: string;
    date: string;
    refNumber: string;
    type: "PEMBELIAN" | "PENJUALAN" | "TRANSFER_OUT" | "TRANSFER_IN" | "OPNAME" | "DEFICIT_OVERSELL";
    batch: string;
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

  // Deep clone initial products per branch so in-memory mutations & branch filter work cleanly
  const branchMultipliers: Record<string, number> = {
    "1": 1,
    "2": 0.65,
    "3": 0.45,
    "4": 0.35,
    "5": 0.8
  };

  function createBranchProducts(branchId: string) {
    const mult = branchMultipliers[branchId] ?? 0.5;
    return structuredClone(productsData).map((p, idx) => ({
      ...p,
      batches: p.batches.map((b) => ({
        ...b,
        branchId,
        stock:
          branchId === "1"
            ? b.stock
            : Math.max(5, Math.round((b.stock * mult) + ((idx % 3) * 4)))
      }))
    }));
  }

  let branchProductsMap: Record<string, typeof productsData> = {
    "1": createBranchProducts("1")
  };

  let products = $state(branchProductsMap["1"]);
  let categories = $state(categoriesData);
  let branches = $state(branchesData);

  // Active Tab: 4 comprehensive tabs
  let activeTab = $state<"katalog" | "kartu_stok" | "riwayat_opname" | "ed_defekta">("katalog");

  // Filter States
  let searchQuery = $state("");
  let selectedCategory = $state("ALL");
  let selectedBranchId = $state(authStore.user?.branchId || "1");

  function fetchProducts() {
    if (!branchProductsMap[selectedBranchId]) {
      branchProductsMap[selectedBranchId] = createBranchProducts(selectedBranchId);
    }
    products = branchProductsMap[selectedBranchId];
    if (
      !products.some((p) => p.id === selectedProductIdForCard) &&
      products[0]
    ) {
      selectedProductIdForCard = products[0].id;
    }
  }

  onMount(() => {
    if (authStore.user?.branchId) {
      selectedBranchId = authStore.user.branchId;
    }
    fetchProducts();
  });

  // Selection for Stock Card (Tab 2)
  let selectedProductIdForCard = $state(productsData[0]?.id || "");
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
  function formatRupiah(num: number): string {
    const prefix = num < 0 ? "-" : "";
    return (
      prefix +
      new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
      }).format(Math.abs(num))
    );
  }

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

  // Initial Synthetic Stock Movement Ledger (`stock_ledger`)
  let ledgerEntries = $state<LedgerEntry[]>([
    {
      id: "led-01",
      productId: productsData[0]?.id || "prod-amox-500",
      productName: productsData[0]?.name || "Amoxicillin 500mg (Errata)",
      date: "2025-10-27 14:20",
      refNumber: "RJK-202510-0018",
      type: "OPNAME",
      batch: productsData[0]?.batches[0]?.batchNumber || "AMX24H01",
      qtyIn: 0,
      qtyOut: 8,
      balance: 150,
      unit: productsData[0]?.baseUnit || "TABLET",
      notes: "Opname Rutin: Selisih hitung fisik rak Obat Keras",
      operator: "apt. Hafidz Nurul"
    },
    {
      id: "led-ovs-01",
      productId: productsData[0]?.id || "prod-amox-500",
      productName: productsData[0]?.name || "Amoxicillin 500mg (Errata)",
      date: "2025-10-27 12:40",
      refNumber: "PJ-CB01-20261027-009",
      type: "DEFICIT_OVERSELL",
      batch: productsData[0]?.batches[0]?.batchNumber || "AMX24H01",
      qtyIn: 0,
      qtyOut: 5,
      balance: -5,
      unit: productsData[0]?.baseUnit || "TABLET",
      notes: "Sinkronisasi Offline: Kasir offline menjual melebihi sisa batch. Tercatat unbatched.",
      operator: "Kasir 01 (Terminal Offline)"
    },
    {
      id: "led-02",
      productId: productsData[0]?.id || "prod-amox-500",
      productName: productsData[0]?.name || "Amoxicillin 500mg (Errata)",
      date: "2025-10-27 10:12",
      refNumber: "PJ-1025-0287",
      type: "PENJUALAN",
      batch: productsData[0]?.batches[0]?.batchNumber || "AMX24H01",
      qtyIn: 0,
      qtyOut: 12,
      balance: 158,
      unit: productsData[0]?.baseUnit || "TABLET",
      notes: "Penjualan Kasir Resep & Umum",
      operator: "Nida Farida"
    },
    {
      id: "led-03",
      productId: productsData[0]?.id || "prod-amox-500",
      productName: productsData[0]?.name || "Amoxicillin 500mg (Errata)",
      date: "2025-10-25 14:30",
      refNumber: "MUT-2025-1025-001",
      type: "TRANSFER_OUT",
      batch: productsData[0]?.batches[0]?.batchNumber || "AMX24H01",
      qtyIn: 0,
      qtyOut: 30,
      balance: 170,
      unit: productsData[0]?.baseUnit || "TABLET",
      notes: "Mutasi keluar ke Cabang 2",
      operator: "Erwin Noval Mufid"
    },
    {
      id: "led-04",
      productId: productsData[0]?.id || "prod-amox-500",
      productName: productsData[0]?.name || "Amoxicillin 500mg (Errata)",
      date: "2025-10-20 09:15",
      refNumber: "FP-KF-2025-0891",
      type: "PEMBELIAN",
      batch: productsData[0]?.batches[0]?.batchNumber || "AMX24H01",
      qtyIn: 200,
      qtyOut: 0,
      balance: 200,
      unit: productsData[0]?.baseUnit || "TABLET",
      notes: "Penerimaan Faktur PBF PT. Errita Pharma",
      operator: "apt. Hafidz Nurul"
    }
  ]);

  // Initial Stock Opname & Adjustment History (`stock_adjustments` + `stock_adjustment_items`)
  let opnameHistory = $state<OpnameAdjustmentRecord[]>([
    {
      id: "adj-01",
      docNumber: "RJK-202510-0018",
      date: "2025-10-27 14:20",
      branchId: "1",
      productId: productsData[0]?.id || "prod-amox-500",
      productName: productsData[0]?.name || "Amoxicillin 500mg (Errata)",
      sku: productsData[0]?.sku || "900000092",
      batchId: productsData[0]?.batches[0]?.id || "batch-amox-01",
      batchNumber: productsData[0]?.batches[0]?.batchNumber || "AMX24H01",
      unit: productsData[0]?.baseUnit || "TABLET",
      systemQty: 158,
      actualQty: 150,
      differenceQty: -8,
      costPerUnit: productsData[0]?.batches[0]?.buyPrice || 520,
      valueDifference: -8 * (productsData[0]?.batches[0]?.buyPrice || 520),
      reasonType: "STOCK_OPNAME",
      notes: "Selisih hitung fisik bulanan di rak Obat Keras",
      operator: "apt. Hafidz Nurul"
    },
    {
      id: "adj-02",
      docNumber: "RJK-202510-0018",
      date: "2025-10-27 14:20",
      branchId: "1",
      productId: productsData[1]?.id || "prod-amlo-10",
      productName: productsData[1]?.name || "Amlodipine Besylate 10mg (Hexpharm Jaya)",
      sku: productsData[1]?.sku || "000055",
      batchId: productsData[1]?.batches[0]?.id || "batch-amlo-01",
      batchNumber: productsData[1]?.batches[0]?.batchNumber || "AML24B10",
      unit: productsData[1]?.baseUnit || "TABLET",
      systemQty: 195,
      actualQty: 200,
      differenceQty: 5,
      costPerUnit: productsData[1]?.batches[0]?.buyPrice || 410,
      valueDifference: 5 * (productsData[1]?.batches[0]?.buyPrice || 410),
      reasonType: "DISCREPANCY",
      notes: "Koreksi kasir salah pilih varian Amlodipine 5mg vs 10mg",
      operator: "apt. Hafidz Nurul"
    },
    {
      id: "adj-03",
      docNumber: "RJK-202510-0015",
      date: "2025-10-24 16:05",
      branchId: "1",
      productId: productsData[2]?.id || "prod-pct-500",
      productName: productsData[2]?.name || "Paracetamol 500mg (Mersifarma)",
      sku: productsData[2]?.sku || "000102",
      batchId: productsData[2]?.batches[0]?.id || "batch-pct-01",
      batchNumber: productsData[2]?.batches[0]?.batchNumber || "PCT24D01",
      unit: productsData[2]?.baseUnit || "TABLET",
      systemQty: 250,
      actualQty: 240,
      differenceQty: -10,
      costPerUnit: productsData[2]?.batches[0]?.buyPrice || 220,
      valueDifference: -10 * (productsData[2]?.batches[0]?.buyPrice || 220),
      reasonType: "DAMAGED",
      notes: "1 strip kemasan blister robek terkena lembab",
      operator: "Erwin Noval Mufid"
    },
    {
      id: "adj-04",
      docNumber: "RJK-202510-0015",
      date: "2025-10-24 16:05",
      branchId: "1",
      productId: productsData[3]?.id || "prod-sanmol-syr",
      productName: productsData[3]?.name || "Sanmol Sirup 60ml",
      sku: productsData[3]?.sku || "000215",
      batchId: productsData[3]?.batches[0]?.id || "batch-san-01",
      batchNumber: productsData[3]?.batches[0]?.batchNumber || "SNM24F09",
      unit: productsData[3]?.baseUnit || "BOTOL",
      systemQty: 45,
      actualQty: 45,
      differenceQty: 0,
      costPerUnit: productsData[3]?.batches[0]?.buyPrice || 14500,
      valueDifference: 0,
      reasonType: "STOCK_OPNAME",
      notes: "Stok fisik cocok 100% dengan sistem",
      operator: "Nida Farida"
    }
  ]);

  // Derived: Selected Product Object for Stock Card
  let selectedProductForCard = $derived(
    products.find((p) => p.id === selectedProductIdForCard) || products[0]
  );

  // Derived: Filtered Products for Catalog Tab
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

  // Derived: Filtered Ledger Entries for Selected Product
  let productLedgerEntries = $derived.by(() => {
    const prod = selectedProductForCard;
    if (!prod) return [];

    const existing = ledgerEntries.filter((e) => e.productId === prod.id);
    const list =
      existing.length > 0
        ? existing
        : [
            {
              id: `led-init-${prod.id}`,
              productId: prod.id,
              productName: prod.name,
              date: "2025-10-18 09:00",
              refNumber: `FP-PBF-2025-${prod.sku.slice(-4)}`,
              type: "PEMBELIAN" as const,
              batch: prod.batches[0]?.batchNumber || "BATCH-01",
              qtyIn: prod.batches.reduce((a, b) => a + b.stock, 0),
              qtyOut: 0,
              balance: prod.batches.reduce((a, b) => a + b.stock, 0),
              unit: prod.baseUnit,
              notes: `Saldo awal penerimaan PBF (${prod.manufacturer})`,
              operator: "apt. Hafidz Nurul"
            }
          ];

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
    products.reduce((acc, p) => {
      const productBatchValue = p.batches.reduce(
        (bAcc, b) => bAcc + b.stock * (b.buyPrice || 500),
        0
      );
      return acc + productBatchValue;
    }, 0)
  );

  // Defekta & Expiring batches
  let expiringBatches = $derived(
    products
      .flatMap((p) =>
        p.batches.map((b) => ({
          ...b,
          productId: p.id,
          productName: p.name,
          drugClass: p.drugClass,
          baseUnit: p.baseUnit
        }))
      )
      .filter((b) => {
        const exp = new Date(b.expiryDate).getTime();
        const now = new Date("2025-10-27").getTime();
        const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
        return diffDays <= 730 && b.stock > 0;
      })
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
  );

  let lowStockProducts = $derived(
    products.filter((p) => {
      const totalStock = p.batches.reduce((acc, b) => acc + b.stock, 0);
      return totalStock < 50;
    })
  );

  // =========================================================================
  // MODAL 1: STOK OPNAME & PENYESUAIAN FISIK (SINGLE & WORKSHEET MASSAL)
  // =========================================================================
  let isOpnameModalOpen = $state(false);
  let opnameMode = $state<"single" | "worksheet">("single");
  let opnameReasonType = $state<OpnameAdjustmentRecord["reasonType"]>("STOCK_OPNAME");
  let opnameNotes = $state("");

  // Single Mode State
  let opnameProductId = $state(productsData[0]?.id || "");
  let opnameBatchId = $state(productsData[0]?.batches[0]?.id || "");
  let opnameActualQty = $state<number>(productsData[0]?.batches[0]?.stock ?? 0);

  let selectedOpnameProduct = $derived(
    products.find((p) => p.id === opnameProductId) || products[0]
  );
  let selectedOpnameBatch = $derived(
    selectedOpnameProduct?.batches.find((b) => b.id === opnameBatchId) ||
      selectedOpnameProduct?.batches[0]
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
      .flatMap((p) =>
        p.batches.map((b) => {
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
    const targetProd = products.find((p) => p.id === productId) || products[0];
    if (targetProd) {
      opnameProductId = targetProd.id;
      opnameBatchId = targetProd.batches[0]?.id || "";
      opnameActualQty = targetProd.batches[0]?.stock ?? 0;
    }
    opnameMode = "single";
    opnameReasonType = "STOCK_OPNAME";
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
    const batch = selectedOpnameProduct?.batches.find((b) => b.id === newBatchId);
    if (batch) {
      opnameActualQty = batch.stock;
    }
  }

  function submitStockOpname() {
    const nowStr = formatNowTimestamp();
    const docSeq = String(Math.floor(1000 + Math.random() * 9000));
    const docNumber = `RJK-202510-${docSeq}`;
    const operatorName = authStore.user?.fullName || "apt. Hafidz Nurul";

    if (opnameMode === "single") {
      if (!selectedOpnameProduct || !selectedOpnameBatch) return;

      const sysQty = selectedOpnameBatch.stock;
      const actQty = Math.max(0, Number(opnameActualQty) || 0);
      const diffQty = actQty - sysQty;
      const cost = selectedOpnameBatch.buyPrice || 500;
      const reasonText =
        opnameNotes.trim() ||
        `Fisik: ${actQty}, Sistem: ${sysQty}`;

      // 1. Update Saldo Batch Fisik di Katalog (`branch_batch_stocks`)
      selectedOpnameBatch.stock = actQty;
      const newTotalProductStock = selectedOpnameProduct.batches.reduce(
        (acc, b) => acc + b.stock,
        0
      );

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

      const newAdjustments: OpnameAdjustmentRecord[] = [];
      const newLedgers: LedgerEntry[] = [];

      for (const row of rowsToProcess) {
        const prod = products.find((p) => p.id === row.productId);
        const batch = prod?.batches.find((b) => b.id === row.batchId);
        if (!prod || !batch) continue;

        const sysQty = batch.stock;
        const actQty = Math.max(0, Number(row.actualQty) || 0);
        const diffQty = actQty - sysQty;
        batch.stock = actQty;

        const totalProdStock = prod.batches.reduce((a, b) => a + b.stock, 0);
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
  }

  // =========================================================================
  // MODAL 2: TAMBAH / EDIT MASTER OBAT (CRUD KATALOG)
  // =========================================================================
  let isProductModalOpen = $state(false);
  let editingProductId = $state<string | null>(null);

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
    formProdBaseUnit = prod.baseUnit;
    formProdPriceGeneral = prod.units[0]?.prices.general || 1000;
    formProdPriceResep = prod.units[0]?.prices.prescription || 1000;
    formProdPriceWholesale = prod.units[0]?.prices.wholesale || 900;
    formProdInitialBatch = prod.batches[0]?.batchNumber || "BATCH-01";
    formProdInitialExpiry = prod.batches[0]?.expiryDate || "2027-12-31";
    formProdInitialStock = prod.batches.reduce((a, b) => a + b.stock, 0);
    formProdBuyPrice = prod.batches[0]?.buyPrice || 500;
    isProductModalOpen = true;
  }

  function saveProductForm() {
    if (!formProdName.trim()) return;

    const catObj = categories.find((c) => c.id === formProdCategoryId);
    const categoryName = catObj?.name || "Obat Bebas";

    if (editingProductId) {
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
        if (existing.units[0]) {
          existing.units[0].unit = formProdBaseUnit;
          existing.units[0].prices.general = Number(formProdPriceGeneral) || 0;
          existing.units[0].prices.prescription = Number(formProdPriceResep) || 0;
          existing.units[0].prices.wholesale = Number(formProdPriceWholesale) || 0;
        }
        if (existing.batches[0]) {
          existing.batches[0].buyPrice = Number(formProdBuyPrice) || existing.batches[0].buyPrice;
        }
      }
      isProductModalOpen = false;
      notificationBanner = {
        message: `Data master obat "${formProdName}" berhasil diperbarui!`
      };
    } else {
      const newProdId = `prod-${Date.now()}`;
      const newBatchId = `batch-${Date.now()}`;
      const initStock = Math.max(0, Number(formProdInitialStock) || 0);
      const buyPrice = Math.max(0, Number(formProdBuyPrice) || 500);

      const newProduct = {
        id: newProdId,
        sku: formProdSku.trim() || "000999",
        barcode: formProdBarcode.trim() || "8999900999999",
        name: formProdName.trim(),
        genericName: formProdGeneric.trim() || formProdName.trim(),
        categoryId: formProdCategoryId,
        categoryName,
        drugClass: formProdDrugClass,
        requiresPrescription: formProdDrugClass === "ETHICAL" || formProdDrugClass === "PSYCHOTROPIC" || formProdDrugClass === "NARCOTICS",
        isConsignment: false,
        manufacturer: formProdManufacturer.trim() || "PBF Umum",
        description: "Produk baru ditambahkan dari katalog master.",
        indication: "-",
        dosage: "Gunakan sesuai petunjuk",
        baseUnit: formProdBaseUnit,
        units: [
          {
            unit: formProdBaseUnit,
            multiplier: 1,
            prices: {
              general: Number(formProdPriceGeneral) || 0,
              prescription: Number(formProdPriceResep) || 0,
              wholesale: Number(formProdPriceWholesale) || 0,
              delivery: Number(formProdPriceGeneral) || 0,
              member: Number(formProdPriceWholesale) || 0
            }
          }
        ],
        batches: [
          {
            id: newBatchId,
            batchNumber: formProdInitialBatch.trim() || "BCH26A01",
            branchId: selectedBranchId,
            expiryDate: formProdInitialExpiry || "2028-01-01",
            stock: initStock,
            buyPrice
          }
        ]
      };

      products = [newProduct as any, ...products];
      branchProductsMap[selectedBranchId] = products;

      if (initStock > 0) {
        ledgerEntries = [
          {
            id: `led-init-${Date.now()}`,
            productId: newProdId,
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
  }
</script>

<svelte:head>
  <title>Stok Obat &bull; Hafidz Farma</title>
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
          <button
            type="button"
            onclick={() => openOpnameForProduct()}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 text-emerald-800 text-xs font-bold transition-all shadow-xs"
          >
            <ClipboardCheck class="w-4 h-4 text-emerald-600" />
            <span>Stok Opname</span>
          </button>

          <button
            type="button"
            onclick={openAddProductModal}
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
          >
            <Plus class="w-4 h-4" />
            <span>Tambah Obat Baru</span>
          </button>
        </div>
        
        <!-- Branch Selector -->
        <Select
          bind:value={selectedBranchId}
          icon={Store}
          variant="soft"
          size="sm"
          align="right"
          onchange={() => fetchProducts()}
          options={branches.map((b) => ({
            value: b.id,
            label: `${b.name} (${b.code})`,
            sublabel: b.address
          }))}
        />
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
      alertActionText="Audit Selisih"
      onAlertClick={() => (activeTab = "riwayat_opname")}
    />
    <MetricCard
      title="Defekta & ED"
      value="{lowStockProducts.length} Defekta / {expiringBatches.slice(0, 5).length} ED"
      subtext="Monitoring FEFO"
      icon={AlertTriangle}
      variant="warning"
      alertActionText="Cek Alert"
      onAlertClick={() => (activeTab = "ed_defekta")}
    />
  </div>

  <!-- TAB NAVIGATION -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold overflow-x-auto scrollbar-none">
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
          {lowStockProducts.length + expiringBatches.slice(0, 3).length}
        </span>
      </div>
      {#if activeTab === "ed_defekta"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

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
  </div>

  <!-- ===================================================================== -->
  <!-- TAB 1: KATALOG OBAT                                                   -->
  <!-- ===================================================================== -->
  {#if activeTab === "katalog"}
    <DataTable
      title="Daftar Katalog Obat & Saldo Stok Sistem"
      searchPlaceholder="Cari nama obat, kandungan aktif, SKU, atau scan barcode..."
      bind:searchValue={searchQuery}
      totalCount={filteredProducts.length}
    >
      {#snippet filters()}
        <Select
          bind:value={selectedCategory}
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
        <th class="py-3 px-4">Nama Produk</th>
        <th class="py-3 px-4">SKU & Code</th>
        <th class="py-3 px-4">Golongan</th>
        <th class="py-3 px-4 text-center">Satuan</th>
        <th class="py-3 px-4 text-right" title="Saldo stok tercatat di sistem saat ini (otomatis ter-update setelah penjualan, pembelian, atau stok opname)">
          Stok
        </th>
        <th class="py-3 px-4 text-right">Umum</th>
        <th class="py-3 px-4 text-right">Resep</th>
        <th class="py-3 px-4 text-center">Aksi Cepat</th>
      {/snippet}

      {#snippet rows()}
        {#each filteredProducts as p}
          {@const totalStock = p.batches.reduce((acc, b) => acc + b.stock, 0)}
          {@const generalPrice = p.units[0]?.prices.general || 0}
          {@const prescriptionPrice = p.units[0]?.prices.prescription || 0}
          <tr class="hover:bg-blue-50/40 transition-colors group">
            <td class="py-3.5 px-4">
              <div class="font-bold text-slate-900 group-hover:text-brand-blue transition-colors">
                {p.name}
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
                {p.batches.length} batch ({p.batches[0]?.batchNumber || "-"})
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
                <button
                  type="button"
                  onclick={() => openOpnameForProduct(p.id)}
                  title="Hitung fisik & sesuaikan stok obat ini"
                  class="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold transition-all"
                >
                  Opname
                </button>
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
                  onclick={() => {
                    selectedProductIdForCard = p.id;
                    activeTab = "kartu_stok";
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
            Kartu Stok Buku Besar
          </span>
          <h2 class="text-lg font-black text-slate-900 mt-0.5">
            {selectedProductForCard?.name}
          </h2>
          <div class="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
            <span>SKU: <strong class="text-slate-700 font-mono">{selectedProductForCard?.sku}</strong></span>
            <span>Satuan Dasar: <strong class="text-slate-700">{selectedProductForCard?.baseUnit}</strong></span>
            <span>
              Saldo Sistem Saat Ini:
              <strong class="text-emerald-700 font-mono">
                {selectedProductForCard?.batches.reduce((a, b) => a + b.stock, 0)} {selectedProductForCard?.baseUnit}
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
                { value: "ALL", label: "Semua Mutasi" },
                { value: "PEMBELIAN", label: "Pembelian PBF (+)" },
                { value: "PENJUALAN", label: "Penjualan POS (-)" },
                { value: "TRANSFER_OUT", label: "Transfer Cabang" },
                { value: "OPNAME", label: "Stok Opname / Koreksi (+/-)" },
                { value: "DEFICIT_OVERSELL", label: "Defisit Oversell (Audit APA)" }
              ]}
            />

            <button
              type="button"
              onclick={() => openOpnameForProduct(selectedProductForCard?.id)}
              class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <ClipboardCheck class="w-3.5 h-3.5" />
              <span>Opname Obat Ini</span>
            </button>
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
                sublabel: `SKU: ${p.sku} • Stok: ${p.batches.reduce((a, b) => a + b.stock, 0)} ${p.baseUnit}`
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
          <button
            type="button"
            onclick={() => openOpnameForProduct(selectedProductForCard?.id)}
            class="px-2.5 py-1 rounded-lg bg-brand-red-600 hover:bg-brand-red-700 text-white font-bold text-[11px] transition-colors"
          >
            Sesuaikan Fisik
          </button>
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
              <div class="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-mono text-[11px] flex items-center gap-2">
                <span class="font-bold text-slate-800">{b.batchNumber}</span>
                <span class="text-slate-400">|</span>
                <span class="text-amber-700">ED: {b.expiryDate}</span>
                <span class="text-slate-400">|</span>
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
              <th class="py-3 px-4">No. Dokumen / Ref</th>
              <th class="py-3 px-4">Mutasi</th>
              <th class="py-3 px-4">Batch</th>
              <th class="py-3 px-4 text-right">Masuk</th>
              <th class="py-3 px-4 text-right">Keluar</th>
              <th class="py-3 px-4 text-right">Saldo</th>
              <th class="py-3 px-4">Keterangan / Alasan</th>
              <th class="py-3 px-4 text-center">Petugas</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
            {#each productLedgerEntries as entry}
              <tr class="hover:bg-slate-50/50 {entry.type === 'OPNAME' ? 'bg-amber-50/30' : ''}">
                <td class="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">{entry.date}</td>
                <td class="py-3 px-4 font-mono font-bold text-brand-blue whitespace-nowrap">{entry.refNumber}</td>
                <td class="py-3 px-4">
                  <span
                    class="px-2 py-0.5 rounded text-[10px] font-bold {entry.type === 'PEMBELIAN'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : entry.type === 'PENJUALAN'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : entry.type === 'OPNAME'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : entry.type === 'DEFICIT_OVERSELL'
                            ? 'bg-red-100 text-brand-red-700 border border-red-300'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'}"
                  >
                    {entry.type === 'DEFICIT_OVERSELL' ? 'DEFISIT OFFLINE' : entry.type}
                  </span>
                </td>
                <td class="py-3 px-4 font-mono">{entry.batch}</td>
                <td class="py-3 px-4 text-right font-bold text-emerald-600 font-mono">
                  {entry.qtyIn > 0 ? `+${entry.qtyIn}` : "-"}
                </td>
                <td class="py-3 px-4 text-right font-bold text-brand-red-600 font-mono">
                  {entry.qtyOut > 0 ? `-${entry.qtyOut}` : "-"}
                </td>
                <td class="py-3 px-4 text-right font-black text-slate-900 font-mono">
                  {entry.balance} {entry.unit}
                </td>
                <td class="py-3 px-4 text-slate-600 max-w-xs truncate" title={entry.notes}>
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
        searchPlaceholder="Cari nama obat, No. Dokumen RJK, atau nomor batch..."
        bind:searchValue={opnameSearchQuery}
        totalCount={filteredOpnameHistory.length}
        emptyText="Tidak ada data pemeriksaan stok opname yang sesuai filter."
      >
        {#snippet filters()}
          <Select
            bind:value={opnameDiffFilter}
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
          <th class="py-3 px-4">Dokumen</th>
          <th class="py-3 px-4">Nama Obat</th>
          <th class="py-3 px-4 text-right">Sebelum</th>
          <th class="py-3 px-4 text-right">Sesudah</th>
          <th class="py-3 px-4 text-center">Selisih</th>
          <th class="py-3 px-4 text-right">Dampak HPP</th>
          <th class="py-3 px-4">Catatan</th>
          <th class="py-3 px-4 text-center">Petugas</th>
        {/snippet}

        {#snippet rows()}
          {#each filteredOpnameHistory as item}
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
                  {item.valueDifference > 0 ? `+${formatRupiah(item.valueDifference)}` : formatRupiah(item.valueDifference)}
                </div>
                <div class="text-[10px] text-slate-400">
                  @ {formatRupiah(item.costPerUnit)}/{item.unit}
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
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2">
            <AlertTriangle class="w-4 h-4 text-brand-red-600" />
            <h3 class="text-sm font-bold text-slate-800">Daftar Defekta (Stok di Bawah Batas Minimum)</h3>
          </div>
          <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-brand-red-700">
            {lowStockProducts.length} Obat
          </span>
        </div>

        <div class="space-y-3">
          {#each lowStockProducts as lp}
            {@const stock = lp.batches.reduce((a, b) => a + b.stock, 0)}
            <div class="p-3 rounded-xl border border-red-100 bg-red-50/20 flex items-center justify-between">
              <div>
                <div class="font-bold text-xs text-slate-900">{lp.name}</div>
                <div class="text-[11px] text-slate-400 mt-0.5">Produsen: {lp.manufacturer}</div>
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
      </div>

      <!-- ED ALERT CARD -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2">
            <Clock class="w-4 h-4 text-amber-500" />
            <h3 class="text-sm font-bold text-slate-800">Batch Mendekati Kadaluarsa (FEFO Alert)</h3>
          </div>
          <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
            {expiringBatches.length} Batch
          </span>
        </div>

        <div class="space-y-3">
          {#each expiringBatches.slice(0, 6) as eb}
            <div class="p-3 rounded-xl border border-amber-100 bg-amber-50/20 flex items-center justify-between">
              <div>
                <div class="font-bold text-xs text-slate-900">{eb.productName}</div>
                <div class="text-[11px] text-slate-400 mt-0.5 font-mono">
                  Batch: <strong>{eb.batchNumber}</strong>
                </div>
              </div>
              <div class="text-right">
                <div class="text-xs font-black text-amber-700 font-mono">
                  ED: {eb.expiryDate}
                </div>
                <div class="text-[10px] text-slate-500 mt-0.5">
                  Stok: <strong>{eb.stock} {eb.baseUnit}</strong>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- ======================================================================= -->
<!-- MODAL 1: STOK OPNAME FISIK (SINGLE ITEM & LEMBAR KERJA MASSAL)          -->
<!-- ======================================================================= -->
{#if isOpnameModalOpen}
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
                  const tot = p.batches.reduce((a, b) => a + b.stock, 0);
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
                options={(selectedOpnameProduct?.batches || []).map((b) => ({
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
            class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm inline-flex items-center gap-1.5"
          >
            <CheckCircle2 class="w-4 h-4" />
            <span>Konfirmasi & Sesuaikan Stok</span>
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
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isProductModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold text-sm">
          <Package class="w-5 h-5 text-brand-blue" />
          <span>{editingProductId ? "Edit Master Obat & Harga" : "Tambah Katalog Obat Baru"}</span>
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
          <label for="prod-name" class="font-bold text-slate-700 block mb-1">Nama Obat & Kekuatan Sediaan</label>
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
        <div>
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
        <div>
          <label for="prod-base-unit" class="font-bold text-slate-700 block mb-1">Satuan Dasar Terkecil</label>
          <Select
            id="prod-base-unit"
            bind:value={formProdBaseUnit}
            options={["TABLET", "KAPSUL", "BOTOL", "TUBE", "STRIP", "PCS"]}
          />
        </div>
        <div>
          <label for="prod-price-general" class="font-bold text-slate-700 block mb-1">Harga Jual Umum (Rp)</label>
          <input
            id="prod-price-general"
            type="number"
            bind:value={formProdPriceGeneral}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
          />
        </div>
        <div>
          <label for="prod-price-resep" class="font-bold text-slate-700 block mb-1">Harga Jual Resep (Rp)</label>
          <input
            id="prod-price-resep"
            type="number"
            bind:value={formProdPriceResep}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-blue-700"
          />
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
            <label for="prod-init-stock" class="font-bold text-slate-700 block mb-1">Stok Awal ({formProdBaseUnit})</label>
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
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={saveProductForm}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm"
        >
          {editingProductId ? "Simpan Perubahan" : "Simpan Produk Baru"}
        </button>
      </div>
    </div>
  </div>
{/if}
