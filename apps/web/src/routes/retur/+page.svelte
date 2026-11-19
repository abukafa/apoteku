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
    Clock,
    FileText,
    X
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import SortableTh from "$lib/components/ui/SortableTh.svelte";
  import { compareTableValues, type SortDirection, type SortState } from "$lib/components/ui/DataTable.types";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
  import { portal } from "$lib/actions/portal";
  import { api } from "$lib/services/api";
  import { mockApi } from "$lib/services/mock-api";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { alertStore } from "$lib/stores/alertStore.svelte";
  import { tenantStore } from "$lib/stores/tenantStore.svelte";
  import { formatRupiah } from "@apoteku/core";

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
    cashierShiftId?: string | null;
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

  // Master Data State (100% dari API Database Real)
  let branches = $state<any[]>([]);
  let products = $state<any[]>([]);
  let masterProducts = $state<any[]>([]);
  let suppliers = $state<any[]>([]);
  let customers = $state<any[]>([]);
  let purchaseInvoices = $state<any[]>([]);
  let salesInvoices = $state<any[]>([]);
  let selectedPurchaseItems = $state<any[]>([]);

  // Shift Kasir State
  let activeShift = $state<any | null>(null);
  let isCheckingShift = $state(false);

  // Filter & Tab State
  const canSelectBranch = $derived(authStore.canSelectBranch);
  const canCustomerReturn = $derived(authStore.can("returns:customer:process"));
  const canSupplierReturn = $derived(authStore.can("returns:supplier:process"));
  const canProcessAnyReturn = $derived(canCustomerReturn || canSupplierReturn);

  let selectedBranchId = $state(authStore.isAllBranches ? "ALL" : (authStore.user?.branchId || "1"));
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
  let isSubmitting = $state(false);

  // Form Input Retur Baru State
  let newReturForm = $state({
    returCategory: "PENJUALAN" as "PENJUALAN" | "PEMBELIAN",
    branchId: authStore.user?.branchId || "",
    referenceNo: "",
    customerName: "",
    supplierName: "",
    productId: "",
    productName: "",
    batchNo: "",
    qty: 1,
    unit: "STRIP",
    unitPrice: 0,
    stockDisposition: "LAYAK_JUAL" as "LAYAK_JUAL" | "KARANTINA",
    compensationType: "REFUND_TUNAI" as "REFUND_TUNAI" | "TUKAR_BARANG",
    settlementType: "NOTA_KREDIT" as "NOTA_KREDIT" | "TUKAR_BATCH",
    reason: ""
  });

  // Struk Penjualan Terpilih di Modal Retur
  let selectedSaleInvoice = $derived(
    salesInvoices.find(
      (s) =>
        s.invoiceNo === newReturForm.referenceNo ||
        s.invoiceNumber === newReturForm.referenceNo
    )
  );

  // Faktur PBF Terpilih di Modal Retur
  let selectedPurchaseInvoice = $derived(
    purchaseInvoices.find(
      (p) => p.invoiceNumber === newReturForm.referenceNo
    )
  );

  // Daftar obat yang valid dan boleh diretur:
  // Jika memilih No. Struk Kasir, HANYA menampilkan obat yang dibeli pada struk tersebut!
  let eligibleProducts = $derived.by(() => {
    if (newReturForm.returCategory === "PENJUALAN" && selectedSaleInvoice?.items?.length) {
      return selectedSaleInvoice.items.map((item: any) => {
        const master =
          masterProducts.find((p: any) => p.id === item.productId || p.name === item.productName) ||
          products.find((p: any) => p.id === item.productId || p.name === item.productName);

        // Ambil seluruh satuan yang terdaftar di master obat
        let itemUnits =
          master?.units && Array.isArray(master.units) && master.units.length > 0
            ? master.units
            : [
                {
                  unitName: item.unit || "TABLET",
                  conversionFactor: 1,
                  salePriceGeneral: Number(item.price || item.unitPrice || 0)
                }
              ];

        // Pastikan satuan yang dibeli ada di list opsi
        const hasPurchasedUnit = itemUnits.some(
          (u: any) => (u.unitName || u.unit)?.toUpperCase() === (item.unit || "").toUpperCase()
        );
        if (!hasPurchasedUnit && item.unit) {
          itemUnits = [
            ...itemUnits,
            {
              unitName: item.unit,
              conversionFactor: 1,
              salePriceGeneral: Number(item.price || item.unitPrice || 0)
            }
          ];
        }

        // Hitung total kuantitas pembelian dalam satuan terkecil / dasar
        const purchasedUnitInfo = itemUnits.find(
          (u: any) => (u.unitName || u.unit)?.toUpperCase() === (item.unit || "").toUpperCase()
        );
        const factorPurchased = Number(purchasedUnitInfo?.conversionFactor) || 1;
        const purchasedQtyBase = Number(item.qty || 1) * factorPurchased;

        return {
          id: item.productId,
          name: item.productName,
          sku: master?.sku || item.productId?.slice(0, 8),
          stock: Number(item.qty || 1),
          purchasedQty: Number(item.qty || 1),
          purchasedUnit: item.unit,
          purchasedQtyBase,
          baseUnit: master?.baseUnit || item.unit || "PCS",
          batchNo: item.batchNo || "BATCH-REG",
          price: Number(item.price || item.unitPrice || 0),
          units: itemUnits
        };
      });
    }

    if (newReturForm.returCategory === "PEMBELIAN" && selectedPurchaseItems.length > 0) {
      return selectedPurchaseItems.map((item: any) => {
        const master =
          masterProducts.find((p: any) => p.id === item.productId || p.name === item.productName) ||
          products.find((p: any) => p.id === item.productId || p.name === item.productName);

        let itemUnits =
          master?.units && Array.isArray(master.units) && master.units.length > 0
            ? master.units
            : [
                {
                  unitName: item.unit || "BOX",
                  conversionFactor: 1,
                  buyPrice: Number(item.hna || item.buyPrice || 0)
                }
              ];

        const hasPurchasedUnit = itemUnits.some(
          (u: any) => (u.unitName || u.unit)?.toUpperCase() === (item.unit || "").toUpperCase()
        );
        if (!hasPurchasedUnit && item.unit) {
          itemUnits = [
            ...itemUnits,
            {
              unitName: item.unit,
              conversionFactor: 1,
              buyPrice: Number(item.hna || item.buyPrice || 0)
            }
          ];
        }

        const purchasedUnitInfo = itemUnits.find(
          (u: any) => (u.unitName || u.unit)?.toUpperCase() === (item.unit || "").toUpperCase()
        );
        const factorPurchased = Number(purchasedUnitInfo?.conversionFactor) || 1;
        const purchasedQtyBase = Number(item.qty || 1) * factorPurchased;

        return {
          id: item.productId,
          name: item.productName,
          sku: master?.sku || item.productId?.slice(0, 8),
          stock: Number(item.qty || 1),
          purchasedQty: Number(item.qty || 1),
          purchasedUnit: item.unit,
          purchasedQtyBase,
          baseUnit: master?.baseUnit || item.unit || "BOX",
          batchNo: item.batchNo || "BATCH-REG",
          price: Number(item.hna || item.buyPrice || 0),
          units: itemUnits
        };
      });
    }

    // Fallback: seluruh obat yang ada di master/cabang aktif
    const sourceList = masterProducts.length > 0 ? masterProducts : products;
    return sourceList.map((p: any) => ({
      ...p,
      purchasedQty: undefined,
      purchasedQtyBase: undefined,
      price: Number(
        p.units?.[0]?.salePriceGeneral ??
        p.sellPrice ??
        p.referenceBuyPriceBase ??
        0
      )
    }));
  });

  // Maksimum kuantitas yang dapat diretur sesuai struk pembelian & satuan aktif
  let maxAllowedQty = $derived.by(() => {
    const found = eligibleProducts.find((p: any) => p.name === newReturForm.productName);
    if (!found) return undefined;
    if (found.purchasedQtyBase !== undefined) {
      const currentUnitInfo = found.units?.find(
        (u: any) => (u.unitName || u.unit || u.name)?.toUpperCase() === (newReturForm.unit || "").toUpperCase()
      );
      const currentFactor = Number(currentUnitInfo?.conversionFactor) || 1;
      return Math.floor(found.purchasedQtyBase / currentFactor);
    }
    return found.purchasedQty;
  });

  // Opsi satuan obat yang aman tanpa undefined
  let availableUnits = $derived.by(() => {
    const found =
      eligibleProducts.find((p: any) => p.name === newReturForm.productName) ||
      masterProducts.find((p: any) => p.name === newReturForm.productName) ||
      products.find((p: any) => p.name === newReturForm.productName);

    if (found && Array.isArray(found.units) && found.units.length > 0) {
      const list = found.units
        .map((u: any) => u.unitName || u.unit || u.name)
        .filter((u: any): u is string => typeof u === "string" && u.trim().length > 0);
      if (list.length > 0) {
        return Array.from(new Set(list));
      }
    }
    if (found?.baseUnit) {
      return [found.baseUnit];
    }
    return ["TABLET", "STRIP", "BOX", "BOTOL", "KAPLET"];
  });

  // Ambil produk relatif cabang
  async function loadProductsForBranch(branchId: string) {
    if (!branchId || branchId === "ALL") return;
    try {
      const res = await api.transfer.getBranchProducts(branchId);
      if (res?.success && Array.isArray(res.data)) {
        products = res.data;
      }
    } catch (e) {
      console.warn("Gagal memuat produk cabang:", e);
    }
  }

  // Cek apakah cabang yang dipilih sedang dalam status Buka Sif Kasir
  async function checkBranchShift(branchId: string) {
    if (!branchId || branchId === "ALL") {
      activeShift = null;
      return;
    }
    isCheckingShift = true;
    try {
      const res = await api.shift.getCurrent(branchId);
      if (res?.success && res.data) {
        activeShift = res.data;
      } else {
        activeShift = null;
      }
    } catch (e) {
      activeShift = null;
    } finally {
      isCheckingShift = false;
    }
  }

  async function loadReturnsData(branchId?: string) {
    try {
      const targetBranch = branchId ?? selectedBranchId ?? (authStore.isAllBranches ? "ALL" : authStore.user?.branchId);
      const [custRetRes, suppRetRes] = await Promise.all([
        api.returns.getCustomerReturns({ branchId: targetBranch }),
        api.returns.getSupplierReturns({ branchId: targetBranch })
      ]);
      if (custRetRes?.success && Array.isArray(custRetRes.data)) {
        customerReturns = custRetRes.data;
      } else {
        customerReturns = [];
      }
      if (suppRetRes?.success && Array.isArray(suppRetRes.data)) {
        supplierReturns = suppRetRes.data;
      } else {
        supplierReturns = [];
      }
    } catch (e) {
      console.warn("Gagal mengambil daftar retur:", e);
    }
  }

  async function handleBranchChange(newBranchId: string) {
    selectedBranchId = newBranchId;
    salesReturnPage = 1;
    purchaseReturnPage = 1;
    if (newBranchId !== "ALL") {
      newReturForm.branchId = newBranchId;
      await Promise.all([
        loadReturnsData(newBranchId),
        loadProductsForBranch(newBranchId),
        checkBranchShift(newBranchId)
      ]);
    } else {
      const fallbackBranch = branches[0]?.id || "";
      newReturForm.branchId = fallbackBranch;
      await Promise.all([
        loadReturnsData("ALL"),
        fallbackBranch ? loadProductsForBranch(fallbackBranch) : Promise.resolve(),
        checkBranchShift("")
      ]);
    }
  }

  onMount(async () => {
    try {
      const [branchList, suppRes, custList, purchaseRes, salesRes] = await Promise.all([
        api.erp.getBranches(),
        api.erp.getSuppliers(),
        api.erp.getCustomers(),
        api.erp.getPurchases(100),
        api.erp.getSales(100)
      ]);

      const bList = branchList?.data || (Array.isArray(branchList) ? branchList : []);
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
        newReturForm.branchId = selectedBranchId === "ALL" ? bList[0].id : selectedBranchId;
      }

      if (suppRes?.success && Array.isArray(suppRes.data)) {
        suppliers = suppRes.data;
      } else if (Array.isArray(suppRes)) {
        suppliers = suppRes;
      }

      const cList = custList?.data || (Array.isArray(custList) ? custList : []);
      if (cList.length > 0) {
        customers = cList;
      }

      if (purchaseRes?.success && Array.isArray(purchaseRes.data)) {
        purchaseInvoices = purchaseRes.data;
      } else if (Array.isArray(purchaseRes)) {
        purchaseInvoices = purchaseRes;
      }

      if (salesRes?.success && Array.isArray(salesRes.data)) {
        salesInvoices = salesRes.data;
      } else if (Array.isArray(salesRes)) {
        salesInvoices = salesRes;
      }

      const activeBranch = selectedBranchId !== "ALL" ? selectedBranchId : (branches[0]?.id || "");
      await Promise.all([
        loadReturnsData(selectedBranchId),
        activeBranch ? loadProductsForBranch(activeBranch) : Promise.resolve(),
        activeBranch && selectedBranchId !== "ALL" ? checkBranchShift(activeBranch) : Promise.resolve()
      ]);
    } catch (e) {
      console.warn("Retur onMount API error:", e);
      await loadReturnsData(selectedBranchId);
    }
  });

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

  let branchSalesInvoices = $derived(
    salesInvoices.filter(
      (s) =>
        newReturForm.branchId === "ALL" ||
        !s.branchId ||
        s.branchId === newReturForm.branchId
    )
  );

  let branchPurchaseInvoices = $derived(
    purchaseInvoices.filter(
      (p) =>
        newReturForm.branchId === "ALL" ||
        !p.branchId ||
        p.branchId === newReturForm.branchId
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

  // Pagination & Sorting State
  const PAGE_SIZE = 25;
  let salesReturnPage = $state(1);
  let purchaseReturnPage = $state(1);

  // Tab 1 Sorting State: Retur Penjualan Kasir
  let salesReturnSortKey = $state<string>("date");
  let salesReturnSortDirection = $state<SortDirection>("desc");

  function handleSalesReturnSort(state: SortState) {
    salesReturnSortKey = state.key;
    salesReturnSortDirection = state.direction;
    salesReturnPage = 1;
  }

  let sortedCustomerReturns = $derived.by(() => {
    if (!salesReturnSortKey || !salesReturnSortDirection) return filteredCustomerReturns;
    const copy = [...filteredCustomerReturns];
    return copy.sort((a, b) => {
      let valA: any;
      let valB: any;
      let type: "string" | "number" | "date" = "string";

      switch (salesReturnSortKey) {
        case "date":
          valA = a.date;
          valB = b.date;
          type = "date";
          break;
        case "productName":
          valA = a.productName;
          valB = b.productName;
          break;
        case "stockDisposition":
          valA = a.stockDisposition;
          valB = b.stockDisposition;
          break;
        case "customerName":
          valA = a.customerName;
          valB = b.customerName;
          break;
        case "refundAmount":
          valA = Number(a.refundAmount || 0);
          valB = Number(b.refundAmount || 0);
          type = "number";
          break;
        case "status":
          valA = a.status;
          valB = b.status;
          break;
        default:
          valA = (a as Record<string, any>)[salesReturnSortKey];
          valB = (b as Record<string, any>)[salesReturnSortKey];
      }
      return compareTableValues(valA, valB, salesReturnSortDirection, type);
    });
  });

  let salesReturnTotalPages = $derived(
    Math.max(1, Math.ceil(sortedCustomerReturns.length / PAGE_SIZE))
  );
  let paginatedCustomerReturns = $derived(
    sortedCustomerReturns.slice((salesReturnPage - 1) * PAGE_SIZE, salesReturnPage * PAGE_SIZE)
  );

  // Tab 2 Sorting State: Retur Pembelian PBF
  let purchaseReturnSortKey = $state<string>("date");
  let purchaseReturnSortDirection = $state<SortDirection>("desc");

  function handlePurchaseReturnSort(state: SortState) {
    purchaseReturnSortKey = state.key;
    purchaseReturnSortDirection = state.direction;
    purchaseReturnPage = 1;
  }

  let sortedSupplierReturns = $derived.by(() => {
    if (!purchaseReturnSortKey || !purchaseReturnSortDirection) return filteredSupplierReturns;
    const copy = [...filteredSupplierReturns];
    return copy.sort((a, b) => {
      let valA: any;
      let valB: any;
      let type: "string" | "number" | "date" = "string";

      switch (purchaseReturnSortKey) {
        case "returnNumber":
          valA = a.returnNumber;
          valB = b.returnNumber;
          break;
        case "invoiceRef":
          valA = a.invoiceRef;
          valB = b.invoiceRef;
          break;
        case "supplierName":
          valA = a.supplierName;
          valB = b.supplierName;
          break;
        case "productName":
          valA = a.productName;
          valB = b.productName;
          break;
        case "reason":
          valA = a.reason;
          valB = b.reason;
          break;
        case "totalValue":
          valA = Number(a.totalValue || 0);
          valB = Number(b.totalValue || 0);
          type = "number";
          break;
        case "status":
          valA = a.status;
          valB = b.status;
          break;
        default:
          valA = (a as Record<string, any>)[purchaseReturnSortKey];
          valB = (b as Record<string, any>)[purchaseReturnSortKey];
      }
      return compareTableValues(valA, valB, purchaseReturnSortDirection, type);
    });
  });

  let purchaseReturnTotalPages = $derived(
    Math.max(1, Math.ceil(sortedSupplierReturns.length / PAGE_SIZE))
  );
  let paginatedSupplierReturns = $derived(
    sortedSupplierReturns.slice((purchaseReturnPage - 1) * PAGE_SIZE, purchaseReturnPage * PAGE_SIZE)
  );

  // Reactive Metrics
  let totalCustomerRefunds = $derived(
    branchCustomerReturns.reduce((a, b) => a + Number(b.refundAmount || 0), 0)
  );
  let totalSupplierCredit = $derived(
    branchSupplierReturns.reduce((a, b) => a + Number(b.totalValue || 0), 0)
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

  function handleProductSelect(prodName: string) {
    newReturForm.productName = prodName;
    const found =
      eligibleProducts.find((p: any) => p.name === prodName) ||
      masterProducts.find((p: any) => p.name === prodName) ||
      products.find((p: any) => p.name === prodName);

    if (found) {
      newReturForm.productId = found.id;
      newReturForm.batchNo =
        found.batchNo ||
        found.batches?.[0]?.batchNumber ||
        found.batches?.[0]?.batchNo ||
        "BATCH-REG";

      const primaryUnit =
        found.purchasedUnit ||
        found.baseUnit ||
        found.units?.[0]?.unitName ||
        found.units?.[0]?.unit ||
        (newReturForm.returCategory === "PENJUALAN" ? "STRIP" : "BOX");
      newReturForm.unit = primaryUnit;

      const matchUnit = found.units?.find(
        (u: any) => (u.unitName || u.unit || u.name)?.toUpperCase() === primaryUnit.toUpperCase()
      );

      if (newReturForm.returCategory === "PENJUALAN") {
        newReturForm.unitPrice = Number(
          matchUnit?.salePriceGeneral ??
          found.price ??
          found.units?.[0]?.salePriceGeneral ??
          found.sellPrice ??
          10000
        );
      } else {
        newReturForm.unitPrice = Number(
          matchUnit?.buyPrice ??
          found.price ??
          found.hna ??
          found.units?.[0]?.buyPrice ??
          found.batches?.[0]?.buyPrice ??
          10000
        );
      }

      newReturForm.qty = 1;
    }
  }

  function handleUnitChange(newUnit: string) {
    newReturForm.unit = newUnit;
    const found =
      eligibleProducts.find((p: any) => p.name === newReturForm.productName) ||
      masterProducts.find((p: any) => p.name === newReturForm.productName) ||
      products.find((p: any) => p.name === newReturForm.productName);

    if (found && Array.isArray(found.units)) {
      const matchUnit = found.units.find(
        (u: any) => (u.unitName || u.unit || u.name)?.toUpperCase() === newUnit.toUpperCase()
      );
      if (matchUnit) {
        if (newReturForm.returCategory === "PENJUALAN") {
          let price = Number(matchUnit.salePriceGeneral ?? matchUnit.price ?? 0);
          if (price <= 0 && found.price) {
            const baseFactor = Number(found.purchasedQtyBase ? (found.purchasedQtyBase / (found.purchasedQty || 1)) : 1);
            price = Math.round((Number(found.price) * (Number(matchUnit.conversionFactor) || 1)) / (baseFactor || 1));
          }
          newReturForm.unitPrice = price;
        } else {
          let price = Number(matchUnit.buyPrice ?? matchUnit.hna ?? 0);
          if (price <= 0 && found.price) {
            const baseFactor = Number(found.purchasedQtyBase ? (found.purchasedQtyBase / (found.purchasedQty || 1)) : 1);
            price = Math.round((Number(found.price) * (Number(matchUnit.conversionFactor) || 1)) / (baseFactor || 1));
          }
          newReturForm.unitPrice = price;
        }
      }
    }
  }

  function handleSaleInvoiceChange(invNo: string) {
    newReturForm.referenceNo = invNo;
    const sale = salesInvoices.find(
      (s) => s.invoiceNo === invNo || s.invoiceNumber === invNo
    );
    if (sale) {
      newReturForm.customerName =
        sale.customerName || sale.patientName || "Pelanggan Umum";
      if (Array.isArray(sale.items) && sale.items.length > 0) {
        handleProductSelect(sale.items[0].productName);
      }
    } else {
      // Manual mode / struk tidak dipilih
      if (customers.length > 0 && !newReturForm.customerName) {
        newReturForm.customerName = customers[0].name;
      }
      if (products.length > 0) {
        handleProductSelect(products[0].name);
      }
    }
  }

  async function handlePurchaseInvoiceChange(invNumber: string) {
    newReturForm.referenceNo = invNumber;
    selectedPurchaseItems = [];
    const inv = purchaseInvoices.find((i) => i.invoiceNumber === invNumber);
    if (inv?.supplierName) newReturForm.supplierName = inv.supplierName;

    if (inv?.id) {
      try {
        const res = await api.erp.getPurchaseById(inv.id);
        if (res?.success && res.data?.items && Array.isArray(res.data.items)) {
          selectedPurchaseItems = res.data.items;
          if (selectedPurchaseItems.length > 0) {
            handleProductSelect(selectedPurchaseItems[0].productName);
          }
        }
      } catch (e) {
        console.warn("Gagal mengambil detail faktur PBF:", e);
      }
    }

    if (selectedPurchaseItems.length === 0 && products.length > 0) {
      handleProductSelect(products[0].name);
    }
  }

  async function openAddReturModal(category?: "PENJUALAN" | "PEMBELIAN") {
    if (!canProcessAnyReturn) {
      alertStore.danger("Akses Ditolak", "Anda tidak memiliki hak akses untuk memproses retur barang.");
      return;
    }

    let resolvedCategory = category;
    if (!resolvedCategory) {
      resolvedCategory = activeTab === "pembelian" ? "PEMBELIAN" : "PENJUALAN";
    }
    if (resolvedCategory === "PENJUALAN" && !canCustomerReturn) {
      resolvedCategory = "PEMBELIAN";
    } else if (resolvedCategory === "PEMBELIAN" && !canSupplierReturn) {
      resolvedCategory = "PENJUALAN";
    }

    newReturForm.returCategory = resolvedCategory;
    const effectiveBranch =
      selectedBranchId !== "ALL"
        ? selectedBranchId
        : (branches[0]?.id || "81d3bcff-9577-47b6-9a35-7d510c0d4225");
    newReturForm.branchId = effectiveBranch;

    // Load produk & status shift
    await Promise.all([
      loadProductsForBranch(effectiveBranch),
      checkBranchShift(effectiveBranch),
      api.erp.getProducts().then((res) => {
        if (res?.success && Array.isArray(res.data)) masterProducts = res.data;
      })
    ]);

    if (category === "PENJUALAN") {
      const branchSales = salesInvoices.filter(
        (s) => !s.branchId || s.branchId === effectiveBranch
      );
      if (branchSales.length > 0) {
        handleSaleInvoiceChange(branchSales[0].invoiceNo);
      } else {
        newReturForm.referenceNo = "";
        newReturForm.customerName = customers[0]?.name || "Pelanggan Umum (Walk-in)";
        if (products.length > 0) {
          handleProductSelect(products[0].name);
        }
      }
    } else {
      const branchPurchases = purchaseInvoices.filter(
        (p) => !p.branchId || p.branchId === effectiveBranch
      );
      if (branchPurchases.length > 0) {
        await handlePurchaseInvoiceChange(branchPurchases[0].invoiceNumber);
      } else {
        newReturForm.referenceNo = "";
        newReturForm.supplierName = suppliers[0]?.name || "Distributor PBF";
        if (products.length > 0) {
          handleProductSelect(products[0].name);
        }
      }
    }

    isAddReturModalOpen = true;
  }

  async function handleSaveNewRetur() {
    if (newReturForm.returCategory === "PENJUALAN" && !canCustomerReturn) {
      alertStore.danger("Akses Ditolak", "Anda tidak memiliki wewenang memproses retur penjualan (returns:customer:process).");
      return;
    }
    if (newReturForm.returCategory === "PEMBELIAN" && !canSupplierReturn) {
      alertStore.danger("Akses Ditolak", "Anda tidak memiliki wewenang memproses retur ke PBF (returns:supplier:process).");
      return;
    }
    if (!newReturForm.productName) {
      alert("Silakan pilih produk obat yang akan diretur.");
      return;
    }
    const qtyVal = Number(newReturForm.qty) || 0;
    if (qtyVal <= 0) {
      alert("Kuantitas retur harus lebih besar dari 0.");
      return;
    }

    // Validasi kuantitas tidak boleh melebihi kuantitas pembelian di struk
    if (maxAllowedQty !== undefined && qtyVal > maxAllowedQty) {
      alert(
        `Kuantitas retur (${qtyVal} ${newReturForm.unit}) tidak boleh melebihi jumlah pembelian pada struk (${maxAllowedQty} ${newReturForm.unit}).`
      );
      return;
    }

    isSubmitting = true;

    try {
      if (newReturForm.returCategory === "PENJUALAN") {
        const res = await api.returns.createCustomerReturn({
          branchId: newReturForm.branchId,
          customerName: newReturForm.customerName || "Pelanggan Umum (Walk-in)",
          originalTrx: newReturForm.referenceNo || "PJ-UMUM",
          productId: newReturForm.productId || undefined,
          productName: newReturForm.productName,
          batchNo: newReturForm.batchNo || "BATCH-REG",
          qty: qtyVal,
          unit: newReturForm.unit,
          refundAmount: newReturCalculatedTotal,
          stockDisposition: newReturForm.stockDisposition,
          compensationType: newReturForm.compensationType,
          reason: newReturForm.reason.trim() || "Retur penjualan terverifikasi",
          cashier: authStore.user?.fullName || "apt. Hafidz Nurul"
        });

        if (res?.success && res.data) {
          customerReturns = [res.data, ...customerReturns];
        } else {
          throw new Error(res?.error || "Gagal menyimpan data retur penjualan ke database");
        }
        activeTab = "penjualan";
      } else {
        const res = await api.returns.createSupplierReturn({
          branchId: newReturForm.branchId,
          supplierName: newReturForm.supplierName || "Distributor PBF",
          invoiceRef: newReturForm.referenceNo || "FP-PBF",
          productId: newReturForm.productId || undefined,
          productName: newReturForm.productName,
          batchNo: newReturForm.batchNo || "BATCH-REG",
          qty: qtyVal,
          unit: newReturForm.unit,
          totalValue: newReturCalculatedTotal,
          settlementType: newReturForm.settlementType,
          reason: newReturForm.reason.trim() || "Klaim retur barang ke PBF",
          pic: authStore.user?.fullName || "apt. Hafidz Nurul"
        });

        if (res?.success && res.data) {
          supplierReturns = [res.data, ...supplierReturns];
        } else {
          throw new Error(res?.error || "Gagal menyimpan data retur pembelian ke database");
        }
        activeTab = "pembelian";
      }

      // Segarkan cache stok produk agar realtime seketika
      await Promise.all([
        mockApi.ensureDataLoaded(newReturForm.branchId, true),
        loadProductsForBranch(newReturForm.branchId)
      ]);

      newReturForm.reason = "";
      isAddReturModalOpen = false;
    } catch (err: any) {
      alert(`Gagal menyimpan retur: ${err?.message || "Terjadi kesalahan"}`);
    } finally {
      isSubmitting = false;
    }
  }

  async function approveCustomerReturn(id: string) {
    if (!canCustomerReturn) {
      alertStore.danger("Akses Ditolak", "Anda tidak memiliki wewenang menyetujui retur pelanggan (returns:customer:process).");
      return;
    }
    try {
      await api.returns.approveCustomerReturn(id);
      customerReturns = customerReturns.map((r) =>
        r.id === id ? { ...r, status: "APPROVED" } : r
      );
    } catch (err) {
      console.warn("Gagal menyetujui retur pelanggan:", err);
    }
  }

  function openResolveSupplierReturn(r: SupplierReturnRecord) {
    if (!canSupplierReturn) {
      alertStore.danger("Akses Ditolak", "Anda tidak memiliki wewenang menyelesaikan klaim retur PBF (returns:supplier:process).");
      return;
    }
    selectedSupplierReturn = r;
    resolveSettlementType = r.settlementType;
    resolveCreditNoteNo = r.creditNoteNo || "";
    isResolvePbfModalOpen = true;
  }

  async function handleConfirmResolvePbf() {
    if (!selectedSupplierReturn) return;
    try {
      const res = await api.returns.resolveSupplierReturn(selectedSupplierReturn.id, {
        settlementType: resolveSettlementType,
        creditNoteNo: resolveCreditNoteNo
      });
      if (res?.success) {
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
      } else {
        throw new Error(res?.error || "Gagal menyelesaikan klaim PBF");
      }
    } catch (err: any) {
      alert(`Gagal menyelesaikan klaim PBF: ${err?.message || "Terjadi kesalahan"}`);
    } finally {
      isResolvePbfModalOpen = false;
      selectedSupplierReturn = null;
    }
  }
</script>

<svelte:head>
  <title>Retur &bull; {tenantStore.current.name || "Hafidz Farma"}</title>
  {#if isDetailModalOpen}
    <style>
      @media print {
        @page {
          size: A5 portrait;
          margin: 10mm;
        }
      }
    </style>
  {/if}
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Retur Transaksi"
    subtitle="Retur konsumen kasir dan klaim distributor PBF"
    icon={RotateCcw}
    breadcrumbs={[{ label: "Retur" }]}
  >
    {#snippet actions()}
      <!-- Shift Status Indicator (Live dari API) -->
      {#if activeShift}
        <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold" title="Status Shift Kasir Aktif">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Shift #{activeShift.shiftNumber} Buka</span>
        </div>
      {:else if selectedBranchId !== "ALL"}
        <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold" title="Kasir belum membuka shift">
          <Clock class="w-3.5 h-3.5 text-amber-600" />
          <span>Shift Kasir Tutup</span>
        </div>
      {/if}

      <!-- Branch selector (for Multi-branch User) or locked badge (for Single Branch Staff) -->
      {#if authStore.canSelectBranch}
        <div class="w-56">
          <Select
            value={selectedBranchId}
            onchange={handleBranchChange}
            options={[
              { value: "ALL", label: "Semua Cabang Apotek" },
              ...branches.map((b) => ({ value: b.id, label: b.name }))
            ]}
          />
        </div>
      {:else}
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs" title="Cabang Penugasan">
          <Store class="w-3.5 h-3.5 text-brand-blue" />
          <span>{authStore.user?.branchName || branches.find((b) => b.id === selectedBranchId)?.name || tenantStore.current.name || "Apotek Hafidz Farma"}</span>
        </div>
      {/if}

      {#if canProcessAnyReturn}
        <button
          type="button"
          onclick={() => openAddReturModal(activeTab === "pembelian" ? "PEMBELIAN" : "PENJUALAN")}
          class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
        >
          <Plus class="w-4 h-4" />
          <span>Input Retur Baru</span>
        </button>
      {/if}
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
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold overflow-x-auto no-scrollbar">
    <button
      type="button"
      onclick={() => (activeTab = "penjualan")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'penjualan' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
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
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'pembelian' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
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
      subtitle="Pengembalian obat dari pasien/pelanggan, refund tunai, dan disposisi fisik stok"
      searchPlaceholder="Cari nomor retur, struk, pelanggan, atau obat..."
      bind:searchValue={searchQuery}
      totalCount={sortedCustomerReturns.length}
      currentPage={salesReturnPage}
      totalPages={salesReturnTotalPages}
      pageSize={PAGE_SIZE}
      onPageChange={(p) => (salesReturnPage = p)}
      emptyText="Belum ada riwayat retur penjualan"
      emptyIcon={ShoppingBag}
    >
      {#snippet titleContent()}
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-blue-50 text-[#1d63d8] flex items-center justify-center font-bold">
            <ShoppingBag class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Daftar Retur Penjualan Kasir</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#1d63d8] border border-blue-200/60">
                {sortedCustomerReturns.length} Retur
              </span>
            </h3>
            <p class="text-[11px] text-slate-500 font-medium">Pengembalian obat dari pasien/pelanggan, refund tunai, dan disposisi fisik stok</p>
          </div>
        </div>
      {/snippet}

      {#snippet filters()}
        <div class="w-44 shrink-0">
          <Select
            value={salesReturnStatusFilter}
            onchange={(val) => {
              salesReturnStatusFilter = val as typeof salesReturnStatusFilter;
              salesReturnPage = 1;
            }}
            options={[
              { value: "ALL", label: "Semua Status" },
              { value: "PENDING", label: "Menunggu" },
              { value: "APPROVED", label: "Disetujui" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <SortableTh key="date" label="Tanggal" dataType="date" sortKey={salesReturnSortKey} sortDirection={salesReturnSortDirection} onsort={handleSalesReturnSort} />
        <SortableTh key="productName" label="Produk" sortKey={salesReturnSortKey} sortDirection={salesReturnSortDirection} onsort={handleSalesReturnSort} />
        <SortableTh key="stockDisposition" label="Alokasi" sortKey={salesReturnSortKey} sortDirection={salesReturnSortDirection} onsort={handleSalesReturnSort} />
        <SortableTh key="customerName" label="Pelanggan" sortKey={salesReturnSortKey} sortDirection={salesReturnSortDirection} onsort={handleSalesReturnSort} />
        <SortableTh key="refundAmount" label="Pengembalian" dataType="currency" align="right" sortKey={salesReturnSortKey} sortDirection={salesReturnSortDirection} onsort={handleSalesReturnSort} />
        <SortableTh key="status" label="Status" align="center" sortKey={salesReturnSortKey} sortDirection={salesReturnSortDirection} onsort={handleSalesReturnSort} />
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if paginatedCustomerReturns.length === 0}
          <tr>
            <td colspan="7" class="text-center py-12 text-slate-400">
              <ShoppingBag class="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p class="font-medium text-sm">Belum ada riwayat retur penjualan</p>
              <p class="text-xs text-slate-400">Retur dari pelanggan akan otomatis tercatat dan dapat diproses di sini.</p>
            </td>
          </tr>
        {:else}
          {#each paginatedCustomerReturns as r}
            <tr class="hover:bg-blue-50/40 transition-colors">
              <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
                {r.date}
                {#if (selectedBranchId === "ALL" || canSelectBranch) && r.branchName}
                  <div class="text-[10px] text-brand-blue font-semibold truncate flex items-center gap-1 mt-0.5" title={r.branchName}>
                    <Store class="w-3 h-3 flex-shrink-0" />
                    <span>{r.branchName}</span>
                  </div>
                {/if}
              </td>
              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-800">{r.productName} ({r.qty} {r.unit})</div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="font-mono text-[10px] text-slate-500">Batch: {r.batchNo}</span>
                </div>
              </td>
              <td>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold {r.stockDisposition === 'LAYAK_JUAL' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                  {r.stockDisposition === "LAYAK_JUAL" ? "Stok Layak Jual" : "Rak Karantina"}
                </span>
              </td>
              <td class="py-3.5 px-4 text-slate-500 text-[11px] max-w-xs">
                <div class="font-bold text-slate-800">{r.customerName}</div>
                {r.reason}
              </td>
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
                  {#if r.status === "PENDING" && canCustomerReturn}
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
      subtitle="Pengembalian obat rusak atau near-ED ke PBF dan penerbitan nota kredit (CN)"
      searchPlaceholder="Cari nomor retur, faktur PBF, distributor, atau obat..."
      bind:searchValue={pbfSearchQuery}
      totalCount={sortedSupplierReturns.length}
      currentPage={purchaseReturnPage}
      totalPages={purchaseReturnTotalPages}
      pageSize={PAGE_SIZE}
      onPageChange={(p) => (purchaseReturnPage = p)}
      emptyText="Belum ada klaim retur pembelian ke PBF"
      emptyIcon={RotateCcw}
    >
      {#snippet titleContent()}
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <RotateCcw class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Daftar Retur Pembelian ke Distributor PBF</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                {sortedSupplierReturns.length} Retur
              </span>
            </h3>
            <p class="text-[11px] text-slate-500 font-medium">Pengembalian obat rusak atau near-ED ke PBF dan penerbitan nota kredit (CN)</p>
          </div>
        </div>
      {/snippet}

      {#snippet filters()}
        <div class="w-44 shrink-0">
          <Select
            value={purchaseReturnStatusFilter}
            onchange={(val) => {
              purchaseReturnStatusFilter = val as typeof purchaseReturnStatusFilter;
              purchaseReturnPage = 1;
            }}
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
        <SortableTh key="returnNumber" label="Nomor" sortKey={purchaseReturnSortKey} sortDirection={purchaseReturnSortDirection} onsort={handlePurchaseReturnSort} />
        <SortableTh key="invoiceRef" label="Faktur" sortKey={purchaseReturnSortKey} sortDirection={purchaseReturnSortDirection} onsort={handlePurchaseReturnSort} />
        <SortableTh key="supplierName" label="Distributor" sortKey={purchaseReturnSortKey} sortDirection={purchaseReturnSortDirection} onsort={handlePurchaseReturnSort} />
        <SortableTh key="productName" label="Produk" sortKey={purchaseReturnSortKey} sortDirection={purchaseReturnSortDirection} onsort={handlePurchaseReturnSort} />
        <SortableTh key="reason" label="Alasan" sortKey={purchaseReturnSortKey} sortDirection={purchaseReturnSortDirection} onsort={handlePurchaseReturnSort} />
        <SortableTh key="totalValue" label="Nilai" dataType="currency" align="right" sortKey={purchaseReturnSortKey} sortDirection={purchaseReturnSortDirection} onsort={handlePurchaseReturnSort} />
        <SortableTh key="status" label="Status" align="center" sortKey={purchaseReturnSortKey} sortDirection={purchaseReturnSortDirection} onsort={handlePurchaseReturnSort} />
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if paginatedSupplierReturns.length === 0}
          <tr>
            <td colspan="8" class="text-center py-12 text-slate-400">
              <RotateCcw class="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p class="font-medium text-sm">Belum ada klaim retur pembelian ke PBF</p>
              <p class="text-xs text-slate-400">Klaim barang rusak atau near-ED ke distributor dapat dicatat menggunakan tombol "Buat Retur Baru".</p>
            </td>
          </tr>
        {:else}
          {#each paginatedSupplierReturns as r}
            <tr class="hover:bg-blue-50/40 transition-colors">
              <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
                {r.returnNumber}
                <div class="text-[10px] text-slate-400 font-normal">{r.date}</div>
                {#if (selectedBranchId === "ALL" || canSelectBranch) && r.branchName}
                  <div class="text-[10px] text-brand-blue font-semibold truncate flex items-center gap-1 mt-0.5" title={r.branchName}>
                    <Store class="w-3 h-3 flex-shrink-0" />
                    <span>{r.branchName}</span>
                  </div>
                {/if}
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
                  {#if r.status !== "RESOLVED" && canSupplierReturn}
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
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] overflow-y-auto scrollbar-minimalist">
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
              if (val === "PENJUALAN") {
                const branchSales = salesInvoices.filter(
                  (s) => !s.branchId || s.branchId === newReturForm.branchId
                );
                if (branchSales.length > 0) {
                  handleSaleInvoiceChange(branchSales[0].invoiceNo);
                } else {
                  newReturForm.referenceNo = "";
                  newReturForm.customerName = customers[0]?.name || "Pelanggan Umum (Walk-in)";
                }
              } else {
                const branchPurchases = purchaseInvoices.filter(
                  (p) => !p.branchId || p.branchId === newReturForm.branchId
                );
                if (branchPurchases.length > 0) {
                  handlePurchaseInvoiceChange(branchPurchases[0].invoiceNumber);
                } else {
                  newReturForm.referenceNo = "";
                  newReturForm.supplierName = suppliers[0]?.name || "Distributor PBF";
                }
              }
            }}
            options={[
              ...(canCustomerReturn ? [{ value: "PENJUALAN", label: "Retur Penjualan (Dari Pelanggan)" }] : []),
              ...(canSupplierReturn ? [{ value: "PEMBELIAN", label: "Retur Pembelian (Ke PBF)" }] : [])
            ]}
          />
        </div>

        <div>
          {#if authStore.canSelectBranch}
            <label for="ret-branch" class="font-bold text-slate-700 block mb-1">Cabang Apotek</label>
            <Select
              id="ret-branch"
              value={newReturForm.branchId}
              onchange={async (val) => {
                newReturForm.branchId = val;
                await Promise.all([
                  loadProductsForBranch(val),
                  checkBranchShift(val)
                ]);
              }}
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
            <label for="ret-ref-jl" class="font-bold text-slate-700 block mb-1 flex items-center gap-1">
              <FileText class="w-3.5 h-3.5 text-brand-blue" />
              <span>No. Struk Kasir Referensi</span>
            </label>
            {#if branchSalesInvoices.length > 0}
              <Select
                id="ret-ref-jl"
                value={newReturForm.referenceNo}
                onchange={handleSaleInvoiceChange}
                options={[
                  { value: "", label: "-- Input Manual / Walk-in --" },
                  ...branchSalesInvoices.map((s) => ({
                    value: s.invoiceNo,
                    label: `${s.invoiceNo} • ${s.customerName || s.patientName || 'Umum'} (${formatRupiah(s.grandTotal)})`
                  }))
                ]}
              />
            {:else}
              <input
                id="ret-ref-jl"
                type="text"
                bind:value={newReturForm.referenceNo}
                placeholder="Contoh: INV/... (Opsional)"
                class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
              />
            {/if}
          </div>
          <div>
            <label for="ret-cust" class="font-bold text-slate-700 block mb-1">
              Pelanggan / Pasien
              {#if selectedSaleInvoice}
                <span class="text-[10px] text-emerald-700 font-bold ml-1">(Dari Struk)</span>
              {/if}
            </label>
            {#if selectedSaleInvoice}
              <div class="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800">
                {newReturForm.customerName || "Pelanggan Umum"}
              </div>
            {:else}
              <SearchableSelect
                id="ret-cust"
                value={newReturForm.customerName}
                onchange={(val) => (newReturForm.customerName = val)}
                searchPlaceholder="Cari pelanggan..."
                options={customers.map((c) => ({
                  value: c.name,
                  label: c.name,
                  sublabel: c.code || c.phone || "Pelanggan"
                }))}
              />
            {/if}
          </div>
        {:else}
          <div>
            <label for="ret-ref-bl" class="font-bold text-slate-700 block mb-1 flex items-center gap-1">
              <FileText class="w-3.5 h-3.5 text-brand-blue" />
              <span>No. Faktur PBF Referensi</span>
            </label>
            {#if branchPurchaseInvoices.length > 0}
              <Select
                id="ret-ref-bl"
                value={newReturForm.referenceNo}
                onchange={handlePurchaseInvoiceChange}
                options={branchPurchaseInvoices.map((inv) => ({
                  value: inv.invoiceNumber,
                  label: `${inv.invoiceNumber} • ${inv.supplierName}`
                }))}
              />
            {:else}
              <input
                id="ret-ref-bl"
                type="text"
                bind:value={newReturForm.referenceNo}
                placeholder="FP-PBF-..."
                class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
              />
            {/if}
          </div>
          <div>
            <label for="ret-sup" class="font-bold text-slate-700 block mb-1">
              Distributor PBF
              {#if selectedPurchaseInvoice}
                <span class="text-[10px] text-emerald-700 font-bold ml-1">(Dari Faktur)</span>
              {/if}
            </label>
            {#if selectedPurchaseInvoice}
              <div class="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800">
                {newReturForm.supplierName || "Distributor PBF"}
              </div>
            {:else}
              <SearchableSelect
                id="ret-sup"
                value={newReturForm.supplierName}
                onchange={(val) => (newReturForm.supplierName = val)}
                searchPlaceholder="Cari distributor PBF..."
                options={suppliers.map((s) => ({
                  value: s.name,
                  label: s.name,
                  sublabel: s.code || s.phone || "Distributor PBF"
                }))}
              />
            {/if}
          </div>
        {/if}

        <div class="col-span-2">
          <label for="ret-prod" class="font-bold text-slate-700 block mb-1 flex items-center justify-between">
            <span>
              Produk Obat Diretur
              {#if selectedSaleInvoice}
                <span class="text-brand-blue font-bold text-[11px] ml-1">
                  (Daftar Obat pada Struk {selectedSaleInvoice.invoiceNo})
                </span>
              {:else if selectedPurchaseInvoice}
                <span class="text-brand-blue font-bold text-[11px] ml-1">
                  (Daftar Obat pada Faktur PBF {selectedPurchaseInvoice.invoiceNumber})
                </span>
              {:else}
                <span class="text-slate-500 font-normal text-[11px] ml-1">
                  ({eligibleProducts.length} Obat Tersedia di Cabang)
                </span>
              {/if}
            </span>
            {#if maxAllowedQty !== undefined}
              <span class="text-emerald-700 font-bold text-[11px]">
                Maks. Retur: {maxAllowedQty} {newReturForm.unit}
              </span>
            {/if}
          </label>
          <SearchableSelect
            id="ret-prod"
            value={newReturForm.productName}
            onchange={handleProductSelect}
            searchPlaceholder="Cari nama obat yang dibeli..."
            options={eligibleProducts.map((p: any) => ({
              value: p.name,
              label: p.name,
              sublabel:
                p.purchasedQty !== undefined
                  ? `Dibeli: ${p.purchasedQty} ${p.baseUnit || ''} @ ${formatRupiah(p.price)} • Batch: ${p.batchNo || '-'}`
                  : `Stok Cabang: ${p.stock ?? p.totalStock ?? 0} ${p.baseUnit || ''} • SKU: ${p.sku || '-'}`
            }))}
          />
        </div>

        <div>
          <label for="ret-batch" class="font-bold text-slate-700 block mb-1">Nomor Batch</label>
          <input
            id="ret-batch"
            type="text"
            bind:value={newReturForm.batchNo}
            placeholder="Nomor batch obat"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono uppercase font-bold"
          />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label for="ret-qty" class="font-bold text-slate-700 block mb-1">Qty Retur</label>
            <input
              id="ret-qty"
              type="number"
              min="1"
              max={maxAllowedQty || 9999}
              bind:value={newReturForm.qty}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-center"
            />
          </div>
          <div>
            <label for="ret-unit" class="font-bold text-slate-700 block mb-1">Satuan</label>
            <Select
              id="ret-unit"
              value={newReturForm.unit}
              onchange={handleUnitChange}
              options={availableUnits}
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

          <!-- PEMBERITAHUAN SHIFT KASIR UNTUK REFUND TUNAI -->
          {#if newReturForm.compensationType === "REFUND_TUNAI"}
            <div class="col-span-2">
              {#if activeShift}
                <div class="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                  <CheckCircle2 class="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <div class="font-bold">Shift Kasir Aktif: Shift #{activeShift.shiftNumber} ({activeShift.shiftName || "Sedang Berjalan"})</div>
                    <div class="text-[11px] text-emerald-700">Pengeluaran kas refund tunai akan dicatat otomatis ke laci kasir dan disinkronkan saat tutup shift.</div>
                  </div>
                </div>
              {:else}
                <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                  <AlertCircle class="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <div class="font-bold">Perhatian: Shift Kasir Belum Dibuka</div>
                    <div class="text-[11px] text-amber-700">Pengembalian uang tunai (Refund Tunai) sebaiknya diproses saat shift kasir buka agar uang keluar dari laci kasir dapat dipertanggungjawabkan saat rekonsiliasi Z-Report.</div>
                  </div>
                </div>
              {/if}
            </div>
          {/if}
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
                { value: "TUKAR_BATCH", label: "Tukar Batch Baru (Barang Pengganti)" }
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
            placeholder="Contoh: ED < 6 bulan / Kemasan blister cacat / Salah beli dosis resep..."
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
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
          disabled={isSubmitting}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleSaveNewRetur}
          disabled={isSubmitting}
          class="px-4 py-2 rounded-xl bg-brand-red-600 hover:bg-brand-red-700 text-white font-bold text-xs shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {#if isSubmitting}
            <span class="animate-spin text-sm">&bull;</span>
            <span>Menyimpan...</span>
          {:else}
            <span>Konfirmasi Retur</span>
          {/if}
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
        <div class="font-mono font-bold text-brand-blue">{selectedSupplierReturn.returnNumber} &bull; Ref: {selectedSupplierReturn.invoiceRef}</div>
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
            placeholder="Contoh: CN-012/PBF/2026"
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

<!-- MODAL DETAIL & CETAK NOTA RETUR RESMI (A5 PORTRAIT / A4) -->
{#if isDetailModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay print-active-sheet fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isDetailModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-4 my-auto text-xs print-sheet-card">
      <!-- KOP APOTEK RESMI -->
      <div class="border-b-2 border-slate-900 pb-3 text-center space-y-0.5">
        <div class="font-black text-sm uppercase tracking-wide text-slate-900">{tenantStore.current.name}</div>
        <div class="text-[11px] text-slate-600">SIA: {tenantStore.current.siaNumber} &bull; {tenantStore.current.address}, {tenantStore.current.city}</div>
        <div class="text-[10px] text-slate-500 font-mono">Telp: {tenantStore.current.phone} &bull; Pengendalian Mutu & Retur Farmasi</div>
      </div>

      {#if selectedDetailType === "PENJUALAN" && selectedCustomerReturn}
        <div class="flex items-center justify-between border-b border-slate-200 pb-2">
          <div>
            <div class="font-mono font-bold text-brand-blue">{selectedCustomerReturn.returnNumber}</div>
            <div class="font-black text-slate-900 text-sm uppercase">BUKTI RETUR PENJUALAN KASIR</div>
            <div class="text-[10px] text-slate-500">Waktu: {selectedCustomerReturn.date} &bull; Kasir: {selectedCustomerReturn.cashier}</div>
          </div>
          <button
            onclick={() => (isDetailModalOpen = false)}
            class="p-1 text-slate-400 hover:text-slate-600 rounded-lg no-print"
            aria-label="Tutup"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-[11px]">
          <div class="flex justify-between">
            <span class="text-slate-500">Struk Referensi:</span>
            <strong class="font-mono text-slate-900">{selectedCustomerReturn.originalTrx}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Cabang Pelayanan:</span>
            <strong>{selectedCustomerReturn.branchName}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Nama Pelanggan:</span>
            <strong>{selectedCustomerReturn.customerName}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Produk Retur:</span>
            <strong class="text-slate-900">{selectedCustomerReturn.productName}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Batch & Exp Date:</span>
            <span class="font-mono font-bold text-slate-800">{selectedCustomerReturn.batchNo}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Jumlah Diretur:</span>
            <strong>{selectedCustomerReturn.qty} {selectedCustomerReturn.unit}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Alasan Retur:</span>
            <span class="text-rose-700 font-medium">{selectedCustomerReturn.reason}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Disposisi Stok:</span>
            <strong class="{selectedCustomerReturn.stockDisposition === 'LAYAK_JUAL' ? 'text-emerald-700' : 'text-amber-700'}">
              {selectedCustomerReturn.stockDisposition === "LAYAK_JUAL" ? "Masuk Stok Layak Jual (Restock)" : "Masuk Rak Karantina / Pemusnahan"}
            </strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Metode Kompensasi:</span>
            <strong>{selectedCustomerReturn.compensationType === "REFUND_TUNAI" ? "Pengembalian Tunai (Cash Refund)" : "Tukar Produk Baru"}</strong>
          </div>
          <div class="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm">
            <span>Total Pengembalian:</span>
            <span class="font-mono text-brand-red-600">{formatRupiah(selectedCustomerReturn.refundAmount)}</span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 pt-4 text-center text-[11px] text-slate-600 print-avoid-break">
          <div class="border-t border-slate-200 pt-2">
            <div class="font-bold text-slate-800">Petugas Farmasi</div>
            <div class="mt-8 text-slate-500">({selectedCustomerReturn.cashier})</div>
          </div>
          <div class="border-t border-slate-200 pt-2">
            <div class="font-bold text-slate-800">Pelanggan</div>
            <div class="mt-8 text-slate-500">({selectedCustomerReturn.customerName})</div>
          </div>
        </div>

      {:else if selectedDetailType === "PEMBELIAN" && selectedSupplierReturn}
        <div class="flex items-center justify-between border-b border-slate-200 pb-2">
          <div>
            <div class="font-mono font-bold text-brand-blue">{selectedSupplierReturn.returnNumber}</div>
            <div class="font-black text-slate-900 text-sm uppercase">NOTA RETUR PEMBELIAN PBF</div>
            <div class="text-[10px] text-slate-500">Waktu: {selectedSupplierReturn.date} &bull; Petugas: {selectedSupplierReturn.pic}</div>
          </div>
          <button
            onclick={() => (isDetailModalOpen = false)}
            class="p-1 text-slate-400 hover:text-slate-600 rounded-lg no-print"
            aria-label="Tutup"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-[11px]">
          <div class="flex justify-between">
            <span class="text-slate-500">No. Faktur PBF:</span>
            <strong class="font-mono text-slate-900">{selectedSupplierReturn.invoiceRef}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Cabang Pengirim Retur:</span>
            <strong>{selectedSupplierReturn.branchName}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Distributor Farmasi (PBF):</span>
            <strong class="text-slate-900">{selectedSupplierReturn.supplierName}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Produk & Batch:</span>
            <strong class="text-slate-900">{selectedSupplierReturn.productName} ({selectedSupplierReturn.batchNo})</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Kuantitas Dikembalikan:</span>
            <strong>{selectedSupplierReturn.qty} {selectedSupplierReturn.unit}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Alasan Retur PBF:</span>
            <span class="text-rose-700 font-medium">{selectedSupplierReturn.reason}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Mekanisme Klaim:</span>
            <strong>{selectedSupplierReturn.settlementType === "NOTA_KREDIT" ? "Potong Tagihan Hutang (Nota Kredit)" : "Tukar Barang / Batch Baru"}</strong>
          </div>
          {#if selectedSupplierReturn.creditNoteNo}
            <div class="flex justify-between text-emerald-700">
              <span>No. Dokumen Nota Kredit:</span>
              <strong class="font-mono">{selectedSupplierReturn.creditNoteNo}</strong>
            </div>
          {/if}
          <div class="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm">
            <span>Nilai Klaim ke PBF:</span>
            <span class="font-mono text-brand-blue">{formatRupiah(selectedSupplierReturn.totalValue)}</span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 pt-4 text-center text-[11px] text-slate-600 print-avoid-break">
          <div class="border-t border-slate-200 pt-2">
            <div class="font-bold text-slate-800">Apoteker / Logistik Apotek</div>
            <div class="mt-8 text-slate-500">({selectedSupplierReturn.pic})</div>
          </div>
          <div class="border-t border-slate-200 pt-2">
            <div class="font-bold text-slate-800">Petugas / Ekspedisi PBF</div>
            <div class="mt-8 text-slate-500">({selectedSupplierReturn.supplierName})</div>
          </div>
        </div>
      {/if}

      <div class="border-t border-slate-100 pt-3 flex justify-end gap-2 no-print">
        <button
          type="button"
          onclick={() => (isDetailModalOpen = false)}
          class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 text-xs transition-colors"
        >
          Tutup
        </button>
        <button
          type="button"
          onclick={() => {
            window.print();
          }}
          class="px-4 py-1.5 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold inline-flex items-center gap-1.5 text-xs shadow-sm transition-colors"
        >
          <Printer class="w-3.5 h-3.5" />
          <span>Cetak Nota Retur (A5)</span>
        </button>
      </div>
    </div>
  </div>
{/if}
