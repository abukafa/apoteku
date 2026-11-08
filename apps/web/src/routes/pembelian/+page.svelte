<script lang="ts">
  import { onMount } from "svelte";
  import {
    ShoppingBag,
    Plus,
    FileText,
    Clock,
    CheckCircle2,
    AlertCircle,
    Printer,
    Truck,
    Building2,
    Trash2,
    CreditCard,
    Eye,
    ArrowRightLeft,
    Store,
    X,
    Info,
    Ban
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
  import { alertStore } from "$lib/stores/alertStore.svelte";
  import { portal } from "$lib/actions/portal";
  import { api } from "$lib/services/api";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { formatRupiah } from "@apoteku/core";

  interface InvoiceItemRow {
    productId: string;
    productName: string;
    batchNo: string;
    expiredDate: string;
    unit: string;
    qty: number;
    hna: number;
    disc1: number;
    disc2: number;
    subtotal?: number;
    poItemId?: string;
    qtyOrdered?: number;
    estimatedHna?: number;
    discrepancyReason?: string;
    isRejected?: boolean;
    showDiscrepancyMenu?: boolean;
  }

  interface PurchaseInvoiceRecord {
    id: string;
    invoiceNumber: string;
    poNumber?: string;
    supplierId: string;
    supplierName: string;
    branchId: string;
    branchName: string;
    invoiceDate: string;
    dueDate: string;
    totalAmount: number;
    paidAmount: number;
    status: string;
    itemsCount: number;
    taxPercent: number;
    notes: string;
    items?: InvoiceItemRow[];
    payments?: {
      paymentNumber: string;
      paymentDate: string;
      paymentMethod: string;
      amountPaid: number;
    }[];
  }

  interface SpItemRow {
    id?: string;
    productId: string;
    productName: string;
    qty: number;
    qtyOrdered?: number;
    qtyReceived?: number;
    qtyRemaining?: number;
    unit: string;
    estimatedHna: number;
    subtotal?: number;
    notes?: string;
  }

  interface PurchaseOrderRecord {
    id: string;
    orderNumber: string;
    orderType: string;
    supplierId: string;
    supplierName: string;
    branchId: string;
    orderDate: string;
    status: string;
    pharmacistName: string;
    sipa: string;
    totalItems: number;
    estimatedAmount: number;
    items?: SpItemRow[];
  }

  interface ConsignmentRecord {
    id: string;
    receiptId?: string;
    receiptNumber: string;
    branchId?: string;
    branchName?: string;
    supplierName: string;
    date: string;
    productName: string;
    receivedQty: number;
    soldQty: number;
    remainingQty: number;
    unitPrice: number;
    sellingPrice: number;
    unsettledAmount: number;
    status: string;
  }

  // Master Data & State
  let invoices = $state<PurchaseInvoiceRecord[]>([]);
  let purchaseOrders = $state<PurchaseOrderRecord[]>([]);
  let consignments = $state<ConsignmentRecord[]>([]);
  let suppliers = $state<any[]>([]);
  let products = $state<any[]>([]);
  let branches = $state<any[]>([]);

  // Navigation & Filters
  let selectedBranchId = $state(authStore.user?.branchId || "1");
  let activeTab = $state<"faktur" | "sp" | "konsinyasi">("faktur");
  let invoiceStatusFilter = $state<"ALL" | "UNPAID" | "PARTIAL" | "OVERDUE" | "DUE_SOON" | "PAID">("ALL");
  let searchQuery = $state("");
  let spSearchQuery = $state("");
  let ksnSearchQuery = $state("");

  function mapPurchaseRecord(p: any): PurchaseInvoiceRecord {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dueStr = p.dueDate ? String(p.dueDate).slice(0, 10) : "";
    let status: "PAID" | "PARTIAL" | "UNPAID" | "OVERDUE" = p.isPaidOff
      ? "PAID"
      : (Number(p.paidAmount) > 0 ? "PARTIAL" : "UNPAID");
    if (!p.isPaidOff && dueStr && dueStr < todayStr) {
      status = "OVERDUE";
    }
    return {
      id: p.id,
      invoiceNumber: p.invoiceNumber,
      poNumber: p.poNumber,
      supplierId: p.supplierId || "",
      supplierName: p.supplierName || "Distributor Farmasi",
      branchId: p.branchId || "1",
      branchName: p.branchName || "Apotek Hafidz Farma",
      invoiceDate: p.invoiceDate || p.receiveDate,
      dueDate: p.dueDate,
      totalAmount: Number(p.grandTotal ?? p.totalAmount ?? 0),
      paidAmount: Number(p.paidAmount ?? 0),
      status,
      itemsCount: Number(p.itemsCount ?? 1),
      taxPercent: Number(p.taxPercent ?? 11),
      notes: p.notes || "Faktur Pembelian PBF Terverifikasi",
      items: p.items,
      payments: p.payments
    };
  }

  async function reloadInvoices() {
    try {
      const purRes = await api.erp.getPurchases(100);
      if (purRes?.success && Array.isArray(purRes.data)) {
        invoices = purRes.data.map(mapPurchaseRecord);
      }
    } catch (_) {}
  }

  async function reloadPurchaseOrders() {
    try {
      const poRes = await api.erp.getPurchaseOrders(100);
      if (poRes?.success && Array.isArray(poRes.data)) {
        purchaseOrders = poRes.data;
      }
    } catch (_) {}
  }

  async function reloadConsignments() {
    try {
      const ksnRes = await api.erp.getConsignments();
      if (ksnRes?.success && Array.isArray(ksnRes.data)) {
        consignments = ksnRes.data;
      }
    } catch (_) {}
  }

  onMount(async () => {
    if (authStore.user?.branchId) {
      selectedBranchId = authStore.user.branchId;
      newInvoiceBranchId = authStore.user.branchId;
      newSpForm.branchId = authStore.user.branchId;
      newKsnForm.branchId = authStore.user.branchId;
    }
    try {
      const [purRes, poRes, suppRes, prodRes, branchRes, ksnRes] = await Promise.all([
        api.erp.getPurchases(100),
        api.erp.getPurchaseOrders(100),
        api.erp.getSuppliers(),
        api.erp.getProducts(),
        api.erp.getBranches(),
        api.erp.getConsignments()
      ]);

      if (prodRes?.success && Array.isArray(prodRes.data) && prodRes.data.length > 0) {
        products = prodRes.data;
        const firstProd = products[0];
        const defaultUnitObj = firstProd.units?.find((u: any) => !u.isBaseUnit) || firstProd.units?.[0];
        const defaultUnit = defaultUnitObj?.unitName || firstProd.baseUnit || "BOX";
        const factor = defaultUnitObj ? Number(defaultUnitObj.conversionFactor || 1) : 1;
        const initialHna = defaultUnitObj?.estimatedBuyPrice || Math.round(Number(firstProd.buyPrice || 1000) * factor);

        if (newInvoiceItems.length === 1 && newInvoiceItems[0].productId === "prod-amox-500") {
          newInvoiceItems = [
            {
              productId: firstProd.id,
              productName: firstProd.name,
              batchNo: `BCH-${Date.now().toString().slice(-6)}`,
              expiredDate: "2027-12-31",
              unit: defaultUnit,
              qty: 1,
              hna: initialHna,
              disc1: 0,
              disc2: 0
            }
          ];
        }
        draftSpProductName = firstProd.name;
        draftSpUnit = defaultUnit;
        draftSpHna = initialHna;
        newKsnForm.productName = firstProd.name;
        newKsnForm.unitPrice = Number(firstProd.buyPrice || 25000);
        newKsnForm.sellingPrice = Math.round(Number(firstProd.buyPrice || 25000) * 1.3);
      }

      if (branchRes?.success && Array.isArray(branchRes.data) && branchRes.data.length > 0) {
        branches = branchRes.data;
        if (!authStore.user?.branchId && branchRes.data[0]?.id) {
          selectedBranchId = branchRes.data[0].id;
          newInvoiceBranchId = branchRes.data[0].id;
          newSpForm.branchId = branchRes.data[0].id;
          newKsnForm.branchId = branchRes.data[0].id;
        }
      }

      if (suppRes?.success && Array.isArray(suppRes.data) && suppRes.data.length > 0) {
        suppliers = suppRes.data;
        newInvoiceSupplier = suppliers[0].name;
        newSpForm.supplierName = suppliers[0].name;
        newKsnForm.supplierName = suppliers[0].name;
      }

      if (poRes?.success && Array.isArray(poRes.data)) {
        purchaseOrders = poRes.data;
      }

      if (purRes?.success && Array.isArray(purRes.data)) {
        invoices = purRes.data.map(mapPurchaseRecord);
      }

      if (ksnRes?.success && Array.isArray(ksnRes.data)) {
        consignments = ksnRes.data;
      }
    } catch (err) {
      console.error("[Pembelian onMount Error]:", err);
    }
  });

  // Modals State
  let isAddInvoiceModalOpen = $state(false);
  let isInvoiceDetailModalOpen = $state(false);
  let selectedInvoiceDetail = $state<PurchaseInvoiceRecord | null>(null);

  let isAddSpModalOpen = $state(false);
  let isPrintSpModalOpen = $state(false);
  let selectedSpForPrint = $state<PurchaseOrderRecord | null>(null);

  let isPayDebtModalOpen = $state(false);
  let selectedInvoiceForPayment = $state<PurchaseInvoiceRecord | null>(null);
  let paymentAmount = $state(0);
  let paymentMethod = $state("TRANSFER_BCA");

  let isSettleKsnModalOpen = $state(false);
  let selectedKsnForSettle = $state<ConsignmentRecord | null>(null);
  let ksnSettleMethod = $state("KAS_KASIR");

  let isAddKsnModalOpen = $state(false);
  let newKsnForm = $state({
    branchId: authStore.user?.branchId || "1",
    supplierName: "PT. Herbal Alam Sehat (Titipan)",
    productName: "Madu Habbatussauda Extra Propolis 250ml",
    receivedQty: 30,
    unitPrice: 45000,
    sellingPrice: 65000
  });

  // New Invoice Form State (Multi-Item Grid)
  let newInvoiceBranchId = $state(authStore.user?.branchId || "1");
  let newInvoicePoNumber = $state("NONE");
  let newInvoiceSupplier = $state("PT. Kimia Farma Trading & Distribution");
  let newInvoiceNumber = $state("");
  let newInvoiceDate = $state("2025-10-28");
  let newInvoiceDueDate = $state("2025-11-18");
  let newInvoiceTaxIncluded = $state(true);

  let newInvoiceItems = $state<InvoiceItemRow[]>([
    {
      productId: "prod-amox-500",
      productName: "Amoxicillin 500mg (Errata)",
      batchNo: "BATCH-20251101",
      expiredDate: "2027-10-31",
      unit: "BOX",
      qty: 10,
      hna: 68000,
      disc1: 5,
      disc2: 0
    }
  ]);

  // New SP Form State
  let newSpForm = $state({
    branchId: authStore.user?.branchId || "1",
    orderType: "REGULER",
    supplierName: "PT. Kimia Farma Trading & Distribution",
    pharmacistName: "apt. Hafidz Nurul, S.Farm.",
    sipa: "SIPA-503/044/Dinkes/2024",
    items: [] as SpItemRow[]
  });

  let draftSpProductName = $state("");
  let draftSpQty = $state(1);
  let draftSpUnit = $state("BOX");
  let draftSpHna = $state(15000);

  let currentSpProduct = $derived(
    products.find((p) => p.name === draftSpProductName)
  );

  let availableSpUnits = $derived(
    currentSpProduct?.units && currentSpProduct.units.length > 0
      ? currentSpProduct.units.map((u: any) => ({
          value: u.unitName,
          label: `${u.unitName} (Isi ${Number(u.conversionFactor || 1)} ${currentSpProduct.baseUnit})`
        }))
      : [{ value: currentSpProduct?.baseUnit || "BOX", label: currentSpProduct?.baseUnit || "BOX" }]
  );

  function handleSpProductChange(val: string) {
    draftSpProductName = val;
    const prod = products.find((p) => p.name === val);
    if (prod) {
      const defaultUnitObj = prod.units?.find((u: any) => !u.isBaseUnit) || prod.units?.[0];
      const unitName = defaultUnitObj?.unitName || prod.baseUnit || "BOX";
      const factor = defaultUnitObj ? Number(defaultUnitObj.conversionFactor || 1) : 1;
      draftSpUnit = unitName;
      draftSpHna = defaultUnitObj?.estimatedBuyPrice || Math.round(Number(prod.buyPrice || 1000) * factor);
    }
  }

  function handleSpUnitChange(val: string) {
    draftSpUnit = val;
    if (!currentSpProduct) return;
    const unitObj = currentSpProduct.units?.find((u: any) => u.unitName === val);
    const factor = unitObj ? Number(unitObj.conversionFactor || 1) : 1;
    draftSpHna = unitObj?.estimatedBuyPrice || Math.round(Number(currentSpProduct.buyPrice || 1000) * factor);
  }

  function updateDueDateFromSupplier(supplierName: string, invDate: string) {
    const sup = suppliers.find((s) => s.name === supplierName);
    const topDays = sup?.topDays ?? 30;
    const baseTime = invDate ? new Date(invDate).getTime() : Date.now();
    if (!Number.isNaN(baseTime)) {
      newInvoiceDueDate = new Date(baseTime + topDays * 86400000)
        .toISOString()
        .split("T")[0];
    }
  }

  function addNewInvoiceItem() {
    const p = products[0];
    const defaultUnitObj = p?.units?.find((u: any) => !u.isBaseUnit) || p?.units?.[0];
    const unitName = defaultUnitObj?.unitName || p?.baseUnit || "BOX";
    const factor = defaultUnitObj ? Number(defaultUnitObj.conversionFactor || 1) : 1;
    const buyPrice = defaultUnitObj?.estimatedBuyPrice || Math.round(Number(p?.buyPrice || 15000) * factor);

    newInvoiceItems.push({
      productId: p?.id || "",
      productName: p?.name || "Produk Baru",
      batchNo: `BATCH-${Date.now().toString().slice(-6)}`,
      expiredDate: "2027-12-31",
      unit: unitName,
      qty: 1,
      hna: buyPrice,
      disc1: 0,
      disc2: 0
    });
  }

  function removeInvoiceItem(index: number) {
    if (newInvoiceItems.length > 1) {
      newInvoiceItems.splice(index, 1);
    }
  }

  function calcRowSubtotal(item: InvoiceItemRow): number {
    if (item.isRejected || (item.qty || 0) <= 0) return 0;
    const gross = (item.qty || 0) * (item.hna || 0);
    const afterDisc1 = gross * (1 - (item.disc1 || 0) / 100);
    const afterDisc2 = afterDisc1 * (1 - (item.disc2 || 0) / 100);
    return Math.round(afterDisc2);
  }

  // Invoice Totals Breakdown (Hanya menghitung barang yang diterima dan tidak ditolak)
  let invoiceSubtotalBruto = $derived(
    newInvoiceItems
      .filter((it) => !it.isRejected && (it.qty || 0) > 0)
      .reduce((acc, it) => acc + (it.qty || 0) * (it.hna || 0), 0)
  );

  let invoiceTotalNetto = $derived(
    newInvoiceItems
      .filter((it) => !it.isRejected && (it.qty || 0) > 0)
      .reduce((acc, it) => acc + calcRowSubtotal(it), 0)
  );

  let invoiceTotalDiscount = $derived(invoiceSubtotalBruto - invoiceTotalNetto);

  let invoiceTaxAmount = $derived(
    newInvoiceTaxIncluded ? Math.round(invoiceTotalNetto * 0.11) : 0
  );

  let invoiceGrandTotal = $derived(invoiceTotalNetto + invoiceTaxAmount);

  // Branch-Filtered Collections
  let branchInvoices = $derived(
    invoices.filter(
      (inv) => selectedBranchId === "ALL" || inv.branchId === selectedBranchId
    )
  );

  let branchPurchaseOrders = $derived(
    purchaseOrders.filter(
      (sp) => selectedBranchId === "ALL" || sp.branchId === selectedBranchId
    )
  );

  let pendingPurchaseOrders = $derived(
    branchPurchaseOrders.filter((sp) => sp.status !== "RECEIVED")
  );

  let branchConsignments = $derived(
    consignments.filter(
      (c) => selectedBranchId === "ALL" || (c.branchId || "1") === selectedBranchId
    )
  );

  function getDueAlert(dueDateStr?: string, isPaid?: boolean) {
    if (isPaid) return { label: "Lunas", daysLeft: 0, color: "text-emerald-600 font-medium", isOverdue: false, isDueSoon: false };
    if (!dueDateStr) return { label: "-", daysLeft: 0, color: "text-slate-500", isOverdue: false, isDueSoon: false };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return {
        label: `Lewat ${Math.abs(diffDays)} Hari`,
        daysLeft: diffDays,
        color: "text-brand-red-600 font-bold",
        isOverdue: true,
        isDueSoon: false
      };
    }
    if (diffDays <= 7) {
      return {
        label: diffDays === 0 ? "Jatuh Tempo Hari Ini" : `H-${diffDays} Segera Bayar`,
        daysLeft: diffDays,
        color: "text-amber-600 font-bold",
        isOverdue: false,
        isDueSoon: true
      };
    }
    return {
      label: `${diffDays} hari lagi`,
      daysLeft: diffDays,
      color: "text-slate-500",
      isOverdue: false,
      isDueSoon: false
    };
  }

  // Filtered Lists for Tables
  let filteredInvoices = $derived(
    branchInvoices.filter((inv) => {
      const isPaid = inv.status === "PAID" || inv.paidAmount >= inv.totalAmount;
      const dueInfo = getDueAlert(inv.dueDate, isPaid);

      let matchStatus = invoiceStatusFilter === "ALL";
      if (invoiceStatusFilter === "PAID") {
        matchStatus = isPaid;
      } else if (invoiceStatusFilter === "OVERDUE") {
        matchStatus = !isPaid && dueInfo.isOverdue;
      } else if (invoiceStatusFilter === "DUE_SOON") {
        matchStatus = !isPaid && dueInfo.isDueSoon;
      } else if (invoiceStatusFilter === "PARTIAL") {
        matchStatus = !isPaid && inv.paidAmount > 0;
      } else if (invoiceStatusFilter === "UNPAID") {
        matchStatus = !isPaid;
      }

      const q = searchQuery.toLowerCase();
      const matchSearch =
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.supplierName.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    })
  );

  let filteredPurchaseOrders = $derived(
    branchPurchaseOrders.filter((sp) => {
      const q = spSearchQuery.toLowerCase();
      return (
        sp.orderNumber.toLowerCase().includes(q) ||
        sp.supplierName.toLowerCase().includes(q) ||
        sp.orderType.toLowerCase().includes(q)
      );
    })
  );

  let filteredConsignments = $derived(
    branchConsignments.filter((c) => {
      const q = ksnSearchQuery.toLowerCase();
      return (
        c.receiptNumber.toLowerCase().includes(q) ||
        c.supplierName.toLowerCase().includes(q) ||
        c.productName.toLowerCase().includes(q)
      );
    })
  );

  // Reactive Metrics
  let totalPurchases = $derived(
    branchInvoices.reduce((a, b) => a + b.totalAmount, 0)
  );
  let totalUnpaidDebt = $derived(
    branchInvoices.reduce((a, b) => a + (b.totalAmount - b.paidAmount), 0)
  );
  let unpaidInvoicesCount = $derived(
    branchInvoices.filter((inv) => inv.totalAmount > inv.paidAmount).length
  );
  let overdueOrDueInvoices = $derived(
    branchInvoices.filter((inv) => inv.status === "OVERDUE" || inv.status === "UNPAID")
  );
  let totalConsignmentUnsettled = $derived(
    branchConsignments.reduce((a, b) => a + b.unsettledAmount, 0)
  );

  let isSavingInvoice = $state(false);

  async function handleSaveNewInvoice() {
    if (!newInvoiceNumber.trim()) {
      alertStore.warning("Validasi Faktur", "Nomor faktur dari supplier/PBF wajib diisi.");
      return;
    }
    if (newInvoiceItems.length === 0) {
      alertStore.warning("Item Faktur Kosong", "Tambahkan minimal 1 baris item obat pada faktur pembelian.");
      return;
    }

    const acceptedItems = newInvoiceItems.filter((it) => !it.isRejected && (it.qty || 0) > 0);
    if (acceptedItems.length === 0) {
      alertStore.warning(
        "Tidak Ada Barang Diterima",
        "Seluruh item berstatus ditolak / berjumlah 0. Faktur tidak dapat disimpan tanpa ada fisik barang yang diterima."
      );
      return;
    }

    const supplierObj =
      suppliers.find((s) => s.name === newInvoiceSupplier) || suppliers[0];
    const branchObj =
      branches.find((b) => b.id === newInvoiceBranchId) || branches[0];
    const selectedPo = purchaseOrders.find((p) => p.orderNumber === newInvoicePoNumber);

    isSavingInvoice = true;
    try {
      const payload = {
        branchId: newInvoiceBranchId,
        supplierId: supplierObj?.id,
        supplierName: newInvoiceSupplier,
        invoiceNumber: newInvoiceNumber.trim().toUpperCase(),
        invoiceDate: newInvoiceDate,
        dueDate: newInvoiceDueDate,
        isCredit: true,
        subtotal: invoiceSubtotalBruto,
        discountAmount: invoiceTotalDiscount,
        taxAmount: invoiceTaxAmount,
        grandTotal: invoiceGrandTotal,
        purchaseOrderId: selectedPo?.id,
        poNumber: newInvoicePoNumber !== "NONE" ? newInvoicePoNumber : undefined,
        items: newInvoiceItems.map((item) => ({
          poItemId: item.poItemId,
          productId: item.productId,
          productName: item.productName,
          batchNo: item.batchNo,
          expiredDate: item.expiredDate,
          unitName: item.unit,
          qty: item.isRejected ? 0 : item.qty,
          buyPrice: item.hna,
          discountPercent: item.disc1,
          discountAmount: Math.round(((item.qty || 0) * (item.hna || 0) * (item.disc1 || 0)) / 100),
          subtotal: calcRowSubtotal(item),
          qtyOrdered: item.qtyOrdered,
          discrepancyReason: item.discrepancyReason,
          isRejected: Boolean(item.isRejected)
        }))
      };

      const res = await api.erp.createPurchase(payload);

      if (res?.success) {
        await reloadInvoices();
        await reloadPurchaseOrders();
        isAddInvoiceModalOpen = false;
        newInvoiceNumber = "";
        newInvoicePoNumber = "NONE";
        alertStore.success(
          "Faktur Berhasil Disimpan",
          res.message || `Faktur ${payload.invoiceNumber} berhasil dicatat dan stok gudang otomatis bertambah.`
        );
      } else {
        alertStore.danger("Gagal Menyimpan Faktur", res?.error || "Terjadi kesalahan sistem.");
      }
    } catch (err: any) {
      alertStore.danger(
        "Gagal Menyimpan Faktur",
        err?.message || "Terjadi kesalahan sistem saat menyimpan faktur pembelian."
      );
    } finally {
      isSavingInvoice = false;
    }
  }

  async function handleDeleteInvoice(inv: PurchaseInvoiceRecord) {
    if (inv.paidAmount > 0) {
      alertStore.warning("Tidak Dapat Dihapus", "Faktur yang sudah memiliki riwayat pembayaran tidak dapat dihapus.");
      return;
    }

    const confirmed = window.confirm(
      `Apakah Anda yakin ingin membatalkan/menghapus Faktur ${inv.invoiceNumber}?\n\nPerhatian: Stok obat yang telah masuk ke gudang akan otomatis dibatalkan/ditarik kembali.`
    );
    if (!confirmed) return;

    try {
      const res = await api.erp.deletePurchase(inv.id);
      if (res?.success) {
        await reloadInvoices();
        alertStore.success("Faktur Dibatalkan", res.message || `Faktur ${inv.invoiceNumber} berhasil dibatalkan.`);
      } else {
        alertStore.danger("Gagal Membatalkan", res?.error || "Terjadi kesalahan sistem.");
      }
    } catch (err: any) {
      alertStore.danger("Gagal Membatalkan", err?.message || "Terjadi gangguan jaringan.");
    }
  }

  async function selectSpForInvoice(sp: PurchaseOrderRecord) {
    newInvoiceBranchId = sp.branchId || selectedBranchId;
    newInvoicePoNumber = sp.orderNumber;
    newInvoiceSupplier = sp.supplierName;
    updateDueDateFromSupplier(sp.supplierName, newInvoiceDate);

    let itemsToLoad = sp.items || [];
    if (itemsToLoad.length === 0) {
      try {
        const detailRes = await api.erp.getPurchaseOrderById(sp.id);
        if (detailRes?.success && Array.isArray(detailRes.data?.items)) {
          itemsToLoad = detailRes.data.items;
        }
      } catch (_) {}
    }

    if (itemsToLoad.length > 0) {
      newInvoiceItems = itemsToLoad.map((it, idx) => {
        const ordered = it.qtyOrdered ?? it.qty;
        const remaining = it.qtyRemaining !== undefined ? it.qtyRemaining : ordered;
        const estHna = Number(it.estimatedHna || 0);
        return {
          poItemId: it.id,
          productId: it.productId,
          productName: it.productName,
          batchNo: `BCH-${Date.now().toString().slice(-4)}${idx + 1}`,
          expiredDate: "2027-12-31",
          unit: it.unit || "BOX",
          qtyOrdered: ordered,
          qty: remaining > 0 ? remaining : 0,
          estimatedHna: estHna,
          hna: estHna,
          disc1: 0,
          disc2: 0,
          isRejected: remaining <= 0,
          discrepancyReason: remaining <= 0 ? "Sudah terpenuhi sebelumnya" : "",
          showDiscrepancyMenu: false
        };
      });
    } else {
      const p = products[0];
      newInvoiceItems = [
        {
          productId: p?.id || "",
          productName: p?.name || "Produk",
          batchNo: `BCH-${Date.now().toString().slice(-6)}`,
          expiredDate: "2027-12-31",
          unit: p?.baseUnit || "BOX",
          qty: 1,
          hna: Number(p?.buyPrice || 15000),
          disc1: 0,
          disc2: 0,
          isRejected: false,
          discrepancyReason: "",
          showDiscrepancyMenu: false
        }
      ];
    }
  }

  function resetInvoiceToDirectPurchase() {
    newInvoicePoNumber = "NONE";
    const p = products[0];
    newInvoiceItems = [
      {
        productId: p?.id || "",
        productName: p?.name || "Produk",
        batchNo: `BCH-${Date.now().toString().slice(-6)}`,
        expiredDate: "2027-12-31",
        unit: p?.baseUnit || "BOX",
        qty: 1,
        hna: Number(p?.buyPrice || 15000),
        disc1: 0,
        disc2: 0,
        isRejected: false,
        discrepancyReason: "",
        showDiscrepancyMenu: false
      }
    ];
  }

  async function openReceiveSpIntoInvoice(sp: PurchaseOrderRecord) {
    newInvoiceNumber = `FP-${new Date().toISOString().slice(2, 7).replace("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`;
    await selectSpForInvoice(sp);
    isAddInvoiceModalOpen = true;
  }

  async function openInvoiceDetail(inv: PurchaseInvoiceRecord) {
    selectedInvoiceDetail = inv;
    isInvoiceDetailModalOpen = true;
    try {
      const [detailRes, payRes] = await Promise.all([
        api.erp.getPurchaseById(inv.id),
        api.finance.getDebtPayments({ invoiceId: inv.id })
      ]);

      let currentDetail: PurchaseInvoiceRecord = { ...inv };

      if (detailRes?.success && detailRes.data) {
        currentDetail = {
          ...currentDetail,
          ...detailRes.data,
          items: detailRes.data.items || []
        };
      }

      if (payRes?.success && Array.isArray(payRes.data)) {
        currentDetail.payments = payRes.data.map((p: any) => ({
          paymentNumber: p.paymentNumber,
          paymentDate: p.paymentDate,
          paymentMethod: p.paymentMethod,
          amountPaid: Number(p.amountPaid)
        }));
      }

      selectedInvoiceDetail = currentDetail;
    } catch (_) {}
  }

  function openDebtPayment(inv: PurchaseInvoiceRecord) {
    selectedInvoiceForPayment = inv;
    paymentAmount = inv.totalAmount - inv.paidAmount;
    isPayDebtModalOpen = true;
  }

  async function handleSavePayment() {
    if (!selectedInvoiceForPayment || paymentAmount <= 0) return;

    const rlNumber = `RLH-${String(Date.now()).slice(-6)}`;
    const today = new Date().toISOString().slice(0, 10);

    try {
      const res = await api.finance.recordDebtPayment({
        purchaseInvoiceId: selectedInvoiceForPayment.id,
        branchId: selectedInvoiceForPayment.branchId || "1",
        amountPaid: Number(paymentAmount),
        paymentMethod,
        paymentDate: today,
        paymentNumber: rlNumber,
        paidBy: "Apoteker Pengelola Apotek (APA)"
      });

      if (res?.success) {
        await reloadInvoices();
        alertStore.success("Pembayaran Berhasil", `Pembayaran hutang untuk Faktur ${selectedInvoiceForPayment.invoiceNumber} berhasil dicatat.`);
      } else {
        alertStore.danger("Gagal Membayar", res?.error || "Gagal mencatat pembayaran hutang.");
      }
    } catch (err: any) {
      alertStore.danger("Gagal Membayar", err?.message || "Terjadi kesalahan jaringan.");
    } finally {
      isPayDebtModalOpen = false;
      selectedInvoiceForPayment = null;
    }
  }

  function addDraftItemToSp() {
    if (!draftSpProductName.trim() || draftSpQty <= 0) {
      alertStore.warning("Obat Belum Dipilih", "Pilih nama obat dan tentukan jumlah pesanan.");
      return;
    }
    const prod = products.find((p) => p.name === draftSpProductName);
    newSpForm.items = [
      ...newSpForm.items,
      {
        productId: prod?.id || crypto.randomUUID(),
        productName: draftSpProductName,
        qty: Number(draftSpQty),
        unit: draftSpUnit,
        estimatedHna: Number(draftSpHna) || 15000
      }
    ];
    draftSpQty = 1;
  }

  function removeDraftItemFromSp(idx: number) {
    newSpForm.items = newSpForm.items.filter((_, i) => i !== idx);
  }

  async function handleCreateSp() {
    if (newSpForm.items.length === 0) {
      alertStore.warning("Item SP Kosong", "Tambahkan minimal 1 item obat pada Surat Pesanan.");
      return;
    }
    const prefix =
      newSpForm.orderType === "PSIKOTROPIKA"
        ? "PSI"
        : newSpForm.orderType === "PREKURSOR"
          ? "PRE"
          : newSpForm.orderType === "OOT"
            ? "OOT"
            : "REG";
    const currentYear = new Date().getFullYear();
    const existingYearPos = purchaseOrders.filter((p) => p.orderNumber && p.orderNumber.includes(String(currentYear)));
    const nextNum = String(existingYearPos.length + 1).padStart(4, "0");
    const today = new Date().toISOString().slice(0, 10);
    const poNumber = `SP-${prefix}-HF-${currentYear}-${nextNum}`;
    const estimatedTotal = newSpForm.items.reduce(
      (sum, it) => sum + it.qty * it.estimatedHna,
      0
    );

    const sup = suppliers.find((s) => s.name === newSpForm.supplierName);

    try {
      const payload = {
        branchId: newSpForm.branchId,
        supplierId: sup?.id,
        supplierName: newSpForm.supplierName,
        orderType: newSpForm.orderType,
        poNumber,
        orderDate: today,
        totalAmount: estimatedTotal,
        items: newSpForm.items.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          unit: it.unit,
          qty: it.qty,
          estimatedHna: it.estimatedHna
        }))
      };

      const res = await api.erp.createPurchaseOrder(payload);

      if (res?.success) {
        await reloadPurchaseOrders();
        newSpForm.items = [];
        isAddSpModalOpen = false;
        const savedPoNumber = res?.data?.order?.poNumber || poNumber;
        alertStore.success(
          "Surat Pesanan Diterbitkan",
          `Surat Pesanan ${savedPoNumber} (${newSpForm.orderType}) berhasil disimpan ke database dan siap dicetak.`
        );
      } else {
        alertStore.danger("Gagal Menerbitkan SP", res?.error || "Gagal menyimpan surat pesanan.");
      }
    } catch (err: any) {
      alertStore.danger("Gagal Menerbitkan SP", err?.message || "Terjadi kesalahan jaringan.");
    }
  }

  function openKsnSettleModal(ksn: ConsignmentRecord) {
    selectedKsnForSettle = ksn;
    isSettleKsnModalOpen = true;
  }

  async function handleConfirmSettleKsn() {
    if (!selectedKsnForSettle) return;
    try {
      const res = await api.erp.settleConsignment(selectedKsnForSettle.id, {
        paymentMethod: ksnSettleMethod
      });
      if (res?.success) {
        await reloadConsignments();
        alertStore.success("Setor Konsinyasi Berhasil", res.message || "Bagi hasil konsinyasi telah disetor dan status lunas.");
      } else {
        alertStore.danger("Gagal Setor", res?.error || "Terjadi kesalahan sistem.");
      }
    } catch (err: any) {
      alertStore.danger("Gagal Setor Konsinyasi", err?.message || "Kesalahan jaringan.");
    } finally {
      isSettleKsnModalOpen = false;
      selectedKsnForSettle = null;
    }
  }

  async function handleCreateConsignment() {
    if (newKsnForm.receivedQty <= 0) return;
    const sup = suppliers.find((s) => s.name === newKsnForm.supplierName);
    const prod = products.find((p) => p.name === newKsnForm.productName);

    try {
      const payload = {
        branchId: newKsnForm.branchId,
        supplierId: sup?.id,
        supplierName: newKsnForm.supplierName,
        productId: prod?.id,
        productName: newKsnForm.productName,
        receivedQty: Number(newKsnForm.receivedQty),
        unitPrice: Number(newKsnForm.unitPrice),
        sellingPrice: Number(newKsnForm.sellingPrice),
        date: new Date().toISOString().slice(0, 10)
      };

      const res = await api.erp.createConsignment(payload);
      if (res?.success) {
        await reloadConsignments();
        alertStore.success("Titipan Konsinyasi Diterima", res.message || "Penerimaan titipan konsinyasi berhasil disimpan ke database.");
      } else {
        alertStore.danger("Gagal Menyimpan", res?.error || "Gagal mencatat konsinyasi.");
      }
    } catch (err: any) {
      alertStore.danger("Gagal Mencatat Konsinyasi", err?.message || "Kesalahan jaringan.");
    } finally {
      isAddKsnModalOpen = false;
    }
  }
</script>

<svelte:head>
  <title>Pembelian &bull; Hafidz Farma</title>
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Riwayat Pembelian"
    subtitle="Surat pesanan (SP), Pengadaan (PBF), dan konsinyasi."
    icon={ShoppingBag}
    breadcrumbs={[{ label: "Pembelian" }]}
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
        onclick={() => (isAddSpModalOpen = true)}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs"
      >
        <FileText class="w-4 h-4 text-brand-blue" />
        <span>Buat Pesanan (SP)</span>
      </button>

      <button
        type="button"
        onclick={() => {
          newInvoiceNumber = `FP-${new Date().toISOString().slice(2, 7).replace("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`;
          updateDueDateFromSupplier(newInvoiceSupplier, newInvoiceDate);
          isAddInvoiceModalOpen = true;
        }}
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
      >
        <Plus class="w-4 h-4" />
        <span>Faktur Masuk PBF</span>
      </button>
    {/snippet}
  </PageHeader>

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Pembelian Bulan Ini"
      value={formatRupiah(totalPurchases)}
      subtext={`${branchInvoices.length} Faktur PBF diterima`}
      icon={ShoppingBag}
      variant="brand"
    />
    <MetricCard
      title="Hutang Belum Lunas"
      value={formatRupiah(totalUnpaidDebt)}
      subtext={`${unpaidInvoicesCount} Faktur kredit berjalan`}
      icon={Clock}
      variant="warning"
    />
    <MetricCard
      title="Jatuh Tempo"
      value={`${overdueOrDueInvoices.length} Faktur`}
      subtext={overdueOrDueInvoices[0]?.supplierName || "Tidak ada tagihan mendesak"}
      icon={AlertCircle}
      variant="danger"
    />
    <MetricCard
      title="Konsinyasi"
      value={formatRupiah(totalConsignmentUnsettled)}
      subtext={`${branchConsignments.length} Produk konsinyasi aktif`}
      icon={Building2}
      variant="default"
    />
  </div>

  <!-- TAB NAVIGATION -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold overflow-x-auto no-scrollbar">
    <button
      type="button"
      onclick={() => (activeTab = "faktur")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'faktur' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <FileText class="w-4 h-4" />
        <span>Faktur Pembelian PBF</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] {activeTab === 'faktur' ? 'bg-brand-blue-50 text-brand-blue-700' : 'bg-slate-100 text-slate-500'}">
          {branchInvoices.length}
        </span>
      </div>
      {#if activeTab === "faktur"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "sp")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'sp' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <Printer class="w-4 h-4" />
        <span>Surat Pesanan (SP Resmi)</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-500">
          {branchPurchaseOrders.length}
        </span>
      </div>
      {#if activeTab === "sp"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "konsinyasi")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'konsinyasi' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <Truck class="w-4 h-4" />
        <span>Konsinyasi Masuk (Titipan)</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-500">
          {branchConsignments.length}
        </span>
      </div>
      {#if activeTab === "konsinyasi"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>
  </div>

  <!-- TAB 1: FAKTUR PEMBELIAN -->
  {#if activeTab === "faktur"}
    <DataTable
      title="Daftar Faktur Pembelian Masuk"
      searchPlaceholder="Cari nomor faktur atau nama distributor PBF..."
      bind:searchValue={searchQuery}
      totalCount={filteredInvoices.length}
    >
      {#snippet filters()}
        <div class="w-52 shrink-0">
          <Select
            value={invoiceStatusFilter}
            onchange={(val) => (invoiceStatusFilter = val as typeof invoiceStatusFilter)}
            options={[
              { value: "ALL", label: "Semua Status Tagihan" },
              { value: "DUE_SOON", label: "Segera Jatuh Tempo (H-7)", badge: "Penting" },
              { value: "OVERDUE", label: "Lewat Tempo (Overdue)", badge: "Prioritas" },
              { value: "UNPAID", label: "Semua Belum Lunas" },
              { value: "PARTIAL", label: "Dibayar Sebagian" },
              { value: "PAID", label: "Sudah Lunas" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <th class="py-3 px-4">Faktur</th>
        <th class="py-3 px-4">Distributor</th>
        <th class="py-3 px-4">Tanggal</th>
        <th class="py-3 px-4">Tempo</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-right">Total</th>
        <th class="py-3 px-4 text-right">Sisa</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if filteredInvoices.length === 0}
          <tr>
            <td colspan="8" class="py-12 text-center text-xs text-slate-400">
              <div class="flex flex-col items-center justify-center gap-2">
                <ShoppingBag class="w-8 h-8 text-slate-300" />
                <span>Tidak ada faktur pembelian yang cocok dengan filter pencarian.</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each filteredInvoices as inv}
          {@const remainingDebt = Math.max(0, inv.totalAmount - inv.paidAmount)}
          {@const isPaid = inv.status === "PAID" || remainingDebt === 0}
          {@const dueInfo = getDueAlert(inv.dueDate, isPaid)}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
              {inv.invoiceNumber}
              {#if inv.poNumber}
                <div class="text-[10px] text-brand-blue font-sans font-semibold">
                  Ref: {inv.poNumber}
                </div>
              {/if}
            </td>
            <td class="py-3.5 px-4">
              <div class="font-bold text-slate-800">{inv.supplierName}</div>
              <div class="text-[11px] text-slate-400">{inv.branchName} • {inv.itemsCount} Item</div>
            </td>
            <td class="py-3.5 px-4 font-mono text-slate-600">{inv.invoiceDate}</td>
            <td class="py-3.5 px-4 font-mono">
              <div class="font-bold {dueInfo.isOverdue ? 'text-brand-red-600' : dueInfo.isDueSoon ? 'text-amber-600' : 'text-slate-800'}">
                {inv.dueDate}
              </div>
              <div class="text-[10px] {dueInfo.color}">
                {dueInfo.label}
              </div>
            </td>
            <td class="py-3.5 px-4 text-center">
              {#if isPaid}
                <Badge type="SUCCESS" label="LUNAS" />
              {:else if dueInfo.isOverdue}
                <Badge type="DANGER" label="LEWAT TEMPO" />
              {:else if dueInfo.isDueSoon}
                <Badge type="WARNING" label="SEGERA BAYAR" />
              {:else if inv.paidAmount > 0}
                <Badge type="WARNING" label="SEBAGIAN" />
              {:else}
                <Badge type="INFO" label="BELUM LUNAS" />
              {/if}
            </td>
            <td class="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
              {formatRupiah(inv.totalAmount)}
            </td>
            <td class="py-3.5 px-4 text-right font-mono font-black {remainingDebt > 0 ? 'text-brand-red-600' : 'text-emerald-600'}">
              {formatRupiah(remainingDebt)}
            </td>
            <td class="py-3.5 px-4 text-center">
              <div class="flex items-center justify-center gap-1.5">
                {#if remainingDebt > 0}
                  <button
                    type="button"
                    onclick={() => openDebtPayment(inv)}
                    class="px-2.5 py-1 rounded-lg bg-brand-blue-50 hover:bg-brand-blue-100 text-brand-blue-700 text-[11px] font-bold transition-colors inline-flex items-center gap-1"
                  >
                    <CreditCard class="w-3 h-3" />
                    <span>Bayar</span>
                  </button>
                {:else}
                  <span class="text-emerald-600 font-bold text-[11px] flex items-center justify-center gap-1">
                    <CheckCircle2 class="w-3.5 h-3.5" /> Lunas
                  </span>
                {/if}

                <button
                  type="button"
                  onclick={() => openInvoiceDetail(inv)}
                  class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-brand-blue"
                  title="Detail Faktur & Riwayat Pembayaran"
                >
                  <Eye class="w-3.5 h-3.5" />
                </button>

                {#if inv.paidAmount === 0}
                  <button
                    type="button"
                    onclick={() => handleDeleteInvoice(inv)}
                    class="p-1.5 rounded-lg border border-slate-200 hover:bg-red-50 text-slate-400 hover:text-brand-red-600 transition-colors"
                    title="Batalkan / Void Faktur"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                {/if}
              </div>
            </td>
          </tr>
        {/each}
      {/if}
      {/snippet}
    </DataTable>

  <!-- TAB 2: SURAT PESANAN (SP) -->
  {:else if activeTab === "sp"}
    <DataTable
      title="Daftar Surat Pesanan (SP) Resmi Apotek"
      searchPlaceholder="Cari nomor SP, jenis SP, atau distributor PBF..."
      bind:searchValue={spSearchQuery}
      totalCount={filteredPurchaseOrders.length}
    >
      {#snippet header()}
        <th class="py-3 px-4">Nomor</th>
        <th class="py-3 px-4">Jenis</th>
        <th class="py-3 px-4">Distributor</th>
        <th class="py-3 px-4">Apoteker</th>
        <th class="py-3 px-4 text-center">Item</th>
        <th class="py-3 px-4 text-right">Nilai</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if filteredPurchaseOrders.length === 0}
          <tr>
            <td colspan="7" class="py-12 text-center text-xs text-slate-400">
              <div class="flex flex-col items-center justify-center gap-2">
                <FileText class="w-8 h-8 text-slate-300" />
                <span>Tidak ada Surat Pesanan (SP) yang ditemukan.</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each filteredPurchaseOrders as sp}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
              {sp.orderNumber}
              <div class="text-[10px] text-slate-400 font-normal">{sp.orderDate}</div>
            </td>
            <td class="py-3.5 px-4">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold {sp.orderType === 'PSIKOTROPIKA' ? 'bg-purple-100 text-purple-700' : sp.orderType === 'PREKURSOR' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}">
                {sp.orderType}
              </span>
            </td>
            <td class="py-3.5 px-4 font-bold text-slate-800">{sp.supplierName}</td>
            <td class="py-3.5 px-4">
              <div class="font-bold text-slate-800 text-xs">{sp.pharmacistName}</div>
              <div class="text-[10px] text-slate-400">{sp.sipa}</div>
            </td>
            <td class="py-3.5 px-4 text-center font-bold text-slate-800">{sp.totalItems} Obat</td>
            <td class="py-3.5 px-4 text-right font-mono font-bold text-slate-800">
              {formatRupiah(sp.estimatedAmount)}
            </td>
            <td class="py-3.5 px-4 text-center">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold {sp.status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-700' : sp.status === 'SENT' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}">
                {sp.status}
              </span>
            </td>
            <td class="py-3.5 px-4 text-center">
              <div class="flex items-center justify-center gap-1.5">
                {#if sp.status !== "RECEIVED"}
                  <button
                    type="button"
                    onclick={() => openReceiveSpIntoInvoice(sp)}
                    class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors inline-flex items-center gap-1"
                    title="Konversi SP menjadi Faktur Penerimaan PBF"
                  >
                    <ArrowRightLeft class="w-3 h-3" />
                    <span>Terima Faktur</span>
                  </button>
                {/if}
                <button
                  type="button"
                  onclick={async () => {
                    selectedSpForPrint = sp;
                    if (!sp.items || sp.items.length === 0) {
                      try {
                        const detailRes = await api.erp.getPurchaseOrderById(sp.id);
                        if (detailRes?.success && Array.isArray(detailRes.data?.items)) {
                          selectedSpForPrint = { ...sp, items: detailRes.data.items };
                        }
                      } catch (_) {}
                    }
                    isPrintSpModalOpen = true;
                  }}
                  class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-brand-blue"
                  title="Cetak Dokumen SP Resmi BPOM"
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

  <!-- TAB 3: KONSINYASI MASUK -->
  {:else if activeTab === "konsinyasi"}
    <DataTable
      title="Manajemen Konsinyasi (Titipan)"
      searchPlaceholder="Cari nomor tanda terima, vendor konsinyor, atau produk..."
      bind:searchValue={ksnSearchQuery}
      totalCount={filteredConsignments.length}
    >
      {#snippet actions()}
        <button
          type="button"
          onclick={() => (isAddKsnModalOpen = true)}
          class="px-3 py-1.5 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs shrink-0"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>Terima Titipan Baru</span>
        </button>
      {/snippet}

      {#snippet header()}
        <th class="py-3 px-4">Nomor</th>
        <th class="py-3 px-4">Vendor</th>
        <th class="py-3 px-4">Produk</th>
        <th class="py-3 px-4 text-center">Masuk</th>
        <th class="py-3 px-4 text-center">Laku</th>
        <th class="py-3 px-4 text-center">Sisa</th>
        <th class="py-3 px-4 text-right">Setor</th>
        <th class="py-3 px-4 text-right">Jual</th>
        <th class="py-3 px-4 text-right">Target</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if filteredConsignments.length === 0}
          <tr>
            <td colspan="8" class="py-12 text-center text-xs text-slate-400">
              <div class="flex flex-col items-center justify-center gap-2">
                <Truck class="w-8 h-8 text-slate-300" />
                <span>Belum ada titipan barang konsinyasi aktif.</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each filteredConsignments as ksn}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
              {ksn.receiptNumber}
              <div class="text-[10px] text-slate-400 font-normal">{ksn.date}</div>
            </td>
            <td class="py-3.5 px-4 font-bold text-slate-800">{ksn.supplierName}</td>
            <td class="py-3.5 px-4 font-semibold text-slate-900">{ksn.productName}</td>
            <td class="py-3.5 px-4 text-center font-bold text-slate-700">{ksn.receivedQty}</td>
            <td class="py-3.5 px-4 text-center font-black text-emerald-600">{ksn.soldQty}</td>
            <td class="py-3.5 px-4 text-center font-bold text-amber-600">{ksn.remainingQty}</td>
            <td class="py-3.5 px-4 text-right font-mono text-slate-600">{formatRupiah(ksn.unitPrice)}</td>
            <td class="py-3.5 px-4 text-right font-mono font-bold text-slate-900">{formatRupiah(ksn.sellingPrice)}</td>
            <td class="py-3.5 px-4 text-right font-mono font-black text-brand-blue">
              {formatRupiah(ksn.unsettledAmount)}
            </td>
            <td class="py-3.5 px-4 text-center">
              {#if ksn.unsettledAmount > 0}
                <button
                  type="button"
                  onclick={() => openKsnSettleModal(ksn)}
                  class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] transition-colors"
                >
                  Setor
                </button>
              {:else}
                <span class="text-emerald-600 font-bold text-[11px]">Lunas Setor</span>
              {/if}
            </td>
          </tr>
        {/each}
      {/if}
      {/snippet}
    </DataTable>
  {/if}
</div>

<!-- MODAL MULTI-ITEM INPUT FAKTUR MASUK PBF -->
{#if isAddInvoiceModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isAddInvoiceModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] flex flex-col">
      <!-- HEADER -->
      <div class="flex items-center justify-between border-b border-slate-100 pb-3 flex-shrink-0">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <FileText class="w-5 h-5 text-brand-blue" />
          <span>Input Faktur Pembelian PBF Masuk</span>
        </div>
        <button
          onclick={() => (isAddInvoiceModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- BODY SCROLLABLE -->
      <div class="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
        <!-- LIST SURAT PESANAN (SP) YANG BELUM DITERIMA -->
        <div class="bg-blue-50/70 p-3.5 rounded-xl border border-blue-200/90 space-y-2.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 font-bold text-slate-800">
              <ArrowRightLeft class="w-4 h-4 text-brand-blue" />
              <span>Surat Pesanan (SP) Menunggu Penerimaan Barang</span>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-blue/10 text-brand-blue">
              {pendingPurchaseOrders.length} SP Menunggu
            </span>
          </div>

          {#if pendingPurchaseOrders.length === 0}
            <div class="text-slate-500 text-[11px] italic py-1">
              Tidak ada Surat Pesanan tertunda. Anda dapat langsung menginput Faktur Bebas (Non-SP) pada form di bawah.
            </div>
          {:else}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {#each pendingPurchaseOrders as sp}
                <button
                  type="button"
                  onclick={() => selectSpForInvoice(sp)}
                  class="p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between {newInvoicePoNumber === sp.orderNumber ? 'bg-brand-blue-700 text-white border-brand-blue shadow-sm ring-2 ring-brand-blue/30' : 'bg-white hover:bg-blue-50 border-slate-200 text-slate-800'}"
                >
                  <div class="flex items-center justify-between w-full mb-1">
                    <span class="font-mono font-bold text-xs">{sp.orderNumber}</span>
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold {newInvoicePoNumber === sp.orderNumber ? 'bg-white/20 text-white' : 'bg-blue-100 text-brand-blue'}">
                      {sp.orderType}
                    </span>
                  </div>
                  <div class="text-[11px] font-semibold truncate {newInvoicePoNumber === sp.orderNumber ? 'text-white' : 'text-slate-700'}">
                    {sp.supplierName}
                  </div>
                  <div class="flex items-center justify-between mt-2 pt-1 border-t {newInvoicePoNumber === sp.orderNumber ? 'border-white/20 text-blue-100' : 'border-slate-100 text-slate-500'} text-[10px]">
                    <span>{sp.totalItems} Obat Dipesan</span>
                    <span class="font-mono font-bold {newInvoicePoNumber === sp.orderNumber ? 'text-white' : 'text-slate-800'}">
                      {formatRupiah(sp.estimatedAmount)}
                    </span>
                  </div>
                </button>
              {/each}
            </div>
          {/if}

          {#if newInvoicePoNumber !== "NONE"}
            <div class="flex items-center justify-between pt-1 border-t border-blue-200/50 text-[11px]">
              <div class="flex items-center gap-1.5 text-emerald-700 font-bold">
                <CheckCircle2 class="w-4 h-4 text-emerald-600" />
                <span>Memuat {newInvoiceItems.length} item obat dari {newInvoicePoNumber}</span>
              </div>
              <button
                type="button"
                onclick={resetInvoiceToDirectPurchase}
                class="text-brand-red-600 hover:text-brand-red-700 hover:underline font-bold"
              >
                Batalkan Pilihan SP (Input Faktur Bebas)
              </button>
            </div>
          {/if}
        </div>

        <!-- HEADER FAKTUR -->
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
          <div class="sm:col-span-2">
            <label for="inv-supplier" class="font-bold text-slate-700 block mb-1">Distributor / PBF</label>
            <SearchableSelect
              id="inv-supplier"
              variant="default"
              bind:value={newInvoiceSupplier}
              onchange={(val) => updateDueDateFromSupplier(val, newInvoiceDate)}
              searchPlaceholder="Cari distributor PBF..."
              options={suppliers.map((s) => ({
                value: s.name,
                label: s.name,
                sublabel: `${s.code} • TOP ${s.topDays} Hari`
              }))}
            />
          </div>
          <div>
            <label for="inv-sp-ref" class="font-bold text-slate-700 block mb-1">Referensi SP</label>
            <Select
              id="inv-sp-ref"
              value={newInvoicePoNumber}
              onchange={(val) => {
                if (val === "NONE") {
                  resetInvoiceToDirectPurchase();
                } else {
                  const sp = purchaseOrders.find((p) => p.orderNumber === val);
                  if (sp) selectSpForInvoice(sp);
                }
              }}
              options={[
                { value: "NONE", label: "Tanpa Referensi SP (Faktur Bebas)" },
                ...purchaseOrders.map((sp) => ({
                  value: sp.orderNumber,
                  label: `${sp.orderNumber} (${sp.orderType} - ${sp.status})`
                }))
              ]}
            />
          </div>
          <div>
            <label for="inv-no" class="font-bold text-slate-700 block mb-1">Nomor Faktur</label>
            <input
              id="inv-no"
              type="text"
              bind:value={newInvoiceNumber}
              placeholder="FP-..."
              class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
            />
          </div>
          <div>
            {#if authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"}
              <label for="inv-branch" class="font-bold text-slate-700 block mb-1">Cabang Penerima</label>
              <Select
                id="inv-branch"
                value={newInvoiceBranchId}
                onchange={(val) => (newInvoiceBranchId = val)}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            {:else}
              <span class="font-bold text-slate-700 block mb-1">Cabang Penerima</span>
              <div class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-2">
                <Store class="w-4 h-4 text-brand-blue" />
                <span>{authStore.user?.branchName || branches.find((b) => b.id === newInvoiceBranchId)?.name || "Cabang Utama"}</span>
              </div>
            {/if}
          </div>
          <div>
            <label for="inv-date" class="font-bold text-slate-700 block mb-1">Tanggal Faktur</label>
            <input
              id="inv-date"
              type="date"
              bind:value={newInvoiceDate}
              onchange={() => updateDueDateFromSupplier(newInvoiceSupplier, newInvoiceDate)}
              class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label for="inv-due" class="font-bold text-slate-700 block mb-1">Jatuh Tempo (TOP)</label>
            <input
              id="inv-due"
              type="date"
              bind:value={newInvoiceDueDate}
              class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono text-brand-red-600 font-bold"
            />
          </div>
          <div class="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="inv-tax"
              bind:checked={newInvoiceTaxIncluded}
              class="rounded text-brand-blue focus:ring-brand-blue"
            />
            <label for="inv-tax" class="font-bold text-slate-700 select-none cursor-pointer">
              PPN 11% (Faktur Pajak)
            </label>
          </div>
        </div>

        <!-- PANDUAN PENJELASAN MODE PEMBELIAN -->
        {#if newInvoicePoNumber === "NONE"}
          <div class="p-3 rounded-xl bg-amber-50/80 border border-amber-200/90 text-[11px] text-amber-900 flex items-start gap-2.5">
            <Info class="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span class="font-bold">Mode Input Faktur Bebas (Non-SP):</span> Digunakan untuk <strong>Pembelian Darurat (CITO)</strong> langsung antar-apotek rekanan secara tunai/bon, <strong>Pengadaan Alkes / Perlengkapan Umum</strong> non-obat keras yang tidak mensyaratkan SP BPOM, atau input faktur manual/arsip lama.
            </div>
          </div>
        {:else}
          <div class="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/90 text-[11px] text-emerald-900 flex items-start gap-2.5">
            <CheckCircle2 class="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div class="flex-1">
              <span class="font-bold">Mode Penerimaan Berdasarkan SP ({newInvoicePoNumber}):</span> Memverifikasi fisik obat terhadap SP resmi. Jika ada barang rusak, kadaluarsa dekat, atau kosong di PBF, gunakan tombol <span class="font-bold text-brand-red-600 bg-red-100 px-1 py-0.5 rounded">"Tolak / Beda"</span> agar barang tersebut tidak tercatat hutang dan status pemenuhan SP terekonsiliasi otomatis.
            </div>
          </div>
        {/if}

        <!-- MULTI-ITEM GRID TABLE -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-slate-800 text-xs">Rincian Obat, Nomor Batch & Verifikasi Fisik</h4>
            <button
              type="button"
              onclick={addNewInvoiceItem}
              class="px-2.5 py-1 rounded-lg bg-brand-blue-50 hover:bg-brand-blue-100 text-brand-blue-700 font-bold text-xs inline-flex items-center gap-1 transition-colors"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Tambah Obat / Bonus</span>
            </button>
          </div>

          <div class="border border-slate-200 rounded-xl overflow-visible shadow-xs">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th class="py-2.5 px-3">Nama Obat</th>
                  <th class="py-2.5 px-3 w-28">Batch</th>
                  <th class="py-2.5 px-3 w-28">Kadaluarsa (ED)</th>
                  <th class="py-2.5 px-3 w-28 text-center">Diterima</th>
                  <th class="py-2.5 px-3 w-28 text-right">HNA Beli</th>
                  <th class="py-2.5 px-3 w-14 text-center">Disc%</th>
                  <th class="py-2.5 px-3 w-24 text-right">Subtotal</th>
                  <th class="py-2.5 px-2 w-28 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                {#each newInvoiceItems as item, idx}
                  <tr class="transition-colors {item.isRejected ? 'bg-red-50/50 text-slate-500' : 'hover:bg-slate-50/50'}">
                    <td class="p-2 max-w-40">
                      {#if item.isRejected}
                        <div class="py-1">
                          <div class="font-bold text-slate-500 line-through">{item.productName}</div>
                          <div class="inline-flex items-center gap-1 text-[10px] text-red-600 font-bold bg-red-100 px-1.5 py-0.5 rounded mt-0.5">
                            <Ban class="w-3 h-3" />
                            <span>Ditolak: {item.discrepancyReason || "Barang tidak diterima"}</span>
                          </div>
                        </div>
                      {:else}
                        <SearchableSelect
                          id={`inv-product-${idx}`}
                          value={item.productName}
                          onchange={(val) => {
                            item.productName = val;
                            const p = products.find((prod) => prod.name === val);
                            if (p) {
                              item.productId = p.id;
                              const defaultUnitObj = p.units?.find((u: any) => !u.isBaseUnit) || p.units?.[0];
                              item.unit = defaultUnitObj?.unitName || p.baseUnit || "BOX";
                              const factor = defaultUnitObj ? Number(defaultUnitObj.conversionFactor || 1) : 1;
                              item.hna = defaultUnitObj?.estimatedBuyPrice || Math.round(Number(p.buyPrice || 1000) * factor);
                            }
                          }}
                          variant="default"
                          size="sm"
                          searchPlaceholder="Cari nama obat..."
                          options={products.map((p) => ({
                            value: p.name,
                            label: p.name,
                            sublabel: `${p.baseUnit} • Beli: ${formatRupiah(p.buyPrice || 0)}`
                          }))}
                        />
                      {/if}
                    </td>
                    <td class="p-2">
                      <input
                        type="text"
                        bind:value={item.batchNo}
                        disabled={item.isRejected}
                        placeholder="Batch"
                        class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-xs uppercase disabled:opacity-40 disabled:bg-slate-100"
                      />
                    </td>
                    <td class="p-2">
                      <input
                        type="date"
                        bind:value={item.expiredDate}
                        disabled={item.isRejected}
                        class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-xs disabled:opacity-40 disabled:bg-slate-100"
                      />
                    </td>
                    <td class="p-2">
                      <input
                        type="number"
                        min="0"
                        bind:value={item.qty}
                        disabled={item.isRejected}
                        class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-center text-xs disabled:opacity-40 disabled:bg-slate-100"
                      />
                      {#if newInvoicePoNumber !== "NONE" && item.qtyOrdered !== undefined}
                        {#if item.isRejected}
                          <span class="text-[9px] font-bold text-red-600 block text-center mt-0.5">
                            Ditolak (Pesan: {item.qtyOrdered})
                          </span>
                        {:else if item.qty === item.qtyOrdered}
                          <span class="text-[9px] font-bold text-emerald-700 block text-center mt-0.5">
                            ✓ Pas {item.qtyOrdered}
                          </span>
                        {:else if item.qty < item.qtyOrdered}
                          <span class="text-[9px] font-bold text-amber-800 block text-center mt-0.5">
                            ⚠ Kurang {item.qtyOrdered - item.qty} • {item.qtyOrdered}
                          </span>
                        {:else}
                          <span class="text-[9px] font-bold text-blue-700 block text-center mt-0.5">
                            ⚠ Lebih {item.qty - item.qtyOrdered} • {item.qtyOrdered}
                          </span>
                        {/if}
                      {/if}
                    </td>
                    <td class="p-2">
                      <input
                        type="number"
                        min="0"
                        step="500"
                        bind:value={item.hna}
                        disabled={item.isRejected}
                        class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-right text-xs disabled:opacity-40 disabled:bg-slate-100"
                      />
                      {#if item.estimatedHna && item.hna !== item.estimatedHna}
                        <span class="text-[9px] font-semibold block text-right mt-0.5 {item.hna > item.estimatedHna ? 'text-amber-700' : 'text-emerald-700'}">
                          SP: {formatRupiah(item.estimatedHna)}
                        </span>
                      {/if}
                    </td>
                    <td class="p-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        bind:value={item.disc1}
                        disabled={item.isRejected}
                        class="w-full bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-center text-xs disabled:opacity-40 disabled:bg-slate-100"
                      />
                    </td>
                    <td class="p-2 text-right font-mono font-bold {item.isRejected ? 'text-slate-400 line-through' : 'text-slate-900'}">
                      {formatRupiah(calcRowSubtotal(item))}
                    </td>
                    <td class="p-2 text-center">
                      <div class="flex items-center justify-center gap-1 relative">
                        {#if item.isRejected}
                          <button
                            type="button"
                            onclick={() => {
                              item.isRejected = false;
                              item.qty = item.qtyOrdered || 1;
                              item.discrepancyReason = "";
                            }}
                            class="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[10px] border border-emerald-300 shadow-xs transition-colors"
                            title="Batal tolak barang ini"
                          >
                            Batal Tolak
                          </button>
                        {:else if newInvoicePoNumber !== "NONE"}
                          <div class="relative">
                            <button
                              type="button"
                              onclick={() => {
                                item.showDiscrepancyMenu = !item.showDiscrepancyMenu;
                              }}
                              class="px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold text-[10px] border border-red-200 transition-colors whitespace-nowrap"
                              title="Tolak atau catat diskrepansi barang"
                            >
                              Tolak / Beda
                            </button>
                            {#if item.showDiscrepancyMenu}
                              <div class="fixed inset-0 z-40" onclick={() => (item.showDiscrepancyMenu = false)} role="presentation"></div>
                              <div class="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-2xl border border-slate-200 p-1.5 z-50 text-[11px] space-y-0.5 text-left animate-in fade-in zoom-in-95">
                                <div class="font-bold text-slate-700 px-2 py-1 border-b border-slate-100 text-[10px]">Alasan Penolakan:</div>
                                <button
                                  type="button"
                                  onclick={() => {
                                    item.isRejected = true;
                                    item.qty = 0;
                                    item.discrepancyReason = "Stok PBF Kosong";
                                    item.showDiscrepancyMenu = false;
                                  }}
                                  class="w-full text-left px-2 py-1.5 rounded-lg hover:bg-red-50 text-red-700 font-medium"
                                >
                                  📦 Stok PBF Kosong
                                </button>
                                <button
                                  type="button"
                                  onclick={() => {
                                    item.isRejected = true;
                                    item.qty = 0;
                                    item.discrepancyReason = "Kemasan Rusak / Pecah";
                                    item.showDiscrepancyMenu = false;
                                  }}
                                  class="w-full text-left px-2 py-1.5 rounded-lg hover:bg-red-50 text-red-700 font-medium"
                                >
                                  💥 Kemasan Rusak / Cacat
                                </button>
                                <button
                                  type="button"
                                  onclick={() => {
                                    item.isRejected = true;
                                    item.qty = 0;
                                    item.discrepancyReason = "Kadaluarsa Dekat (<6 bln)";
                                    item.showDiscrepancyMenu = false;
                                  }}
                                  class="w-full text-left px-2 py-1.5 rounded-lg hover:bg-red-50 text-red-700 font-medium"
                                >
                                  ⏳ Kadaluarsa Dekat (&lt;6 Bln)
                                </button>
                                <button
                                  type="button"
                                  onclick={() => {
                                    item.isRejected = true;
                                    item.qty = 0;
                                    item.discrepancyReason = "Barang Salah / Tidak Dipesan";
                                    item.showDiscrepancyMenu = false;
                                  }}
                                  class="w-full text-left px-2 py-1.5 rounded-lg hover:bg-red-50 text-red-700 font-medium"
                                >
                                  🚫 Salah / Tidak Sesuai
                                </button>
                                <button
                                  type="button"
                                  onclick={() => {
                                    item.isRejected = true;
                                    item.qty = 0;
                                    item.discrepancyReason = "Kenaikan Harga Ditolak";
                                    item.showDiscrepancyMenu = false;
                                  }}
                                  class="w-full text-left px-2 py-1.5 rounded-lg hover:bg-red-50 text-red-700 font-medium"
                                >
                                  📈 Harga Naik
                                </button>
                              </div>
                            {/if}
                          </div>
                        {/if}

                        <button
                          type="button"
                          onclick={() => removeInvoiceItem(idx)}
                          disabled={newInvoiceItems.length <= 1}
                          class="p-1 rounded text-slate-400 hover:text-brand-red-600 disabled:opacity-30"
                          title="Hapus baris"
                        >
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <!-- TOTALS BREAKDOWN -->
        <div class="flex flex-col sm:flex-row justify-between items-start gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
          <div class="text-[11px] text-slate-500 space-y-1">
            <div>• Tanggal jatuh tempo dihitung otomatis sesuai TOP distributor PBF.</div>
            <div>• Nomor batch & kadaluarsa langsung masuk ke stok FEFO cabang penerima.</div>
          </div>
          <div class="w-full sm:w-64 space-y-1 text-xs font-semibold">
            <div class="flex justify-between text-slate-600">
              <span>Subtotal Bruto:</span>
              <span class="font-mono">{formatRupiah(invoiceSubtotalBruto)}</span>
            </div>
            {#if invoiceTotalDiscount > 0}
              <div class="flex justify-between text-emerald-600">
                <span>Diskon PBF:</span>
                <span class="font-mono">- {formatRupiah(invoiceTotalDiscount)}</span>
              </div>
            {/if}
            {#if newInvoiceTaxIncluded}
              <div class="flex justify-between text-slate-600">
                <span>PPN 11%:</span>
                <span class="font-mono">{formatRupiah(invoiceTaxAmount)}</span>
              </div>
            {/if}
            <div class="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-200">
              <span>Grand Total:</span>
              <span class="font-mono text-brand-blue">{formatRupiah(invoiceGrandTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- FOOTER -->
      <div class="border-t border-slate-100 pt-3 flex items-center justify-end gap-2 flex-shrink-0">
        <button
          type="button"
          onclick={() => (isAddInvoiceModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleSaveNewInvoice}
          disabled={isSavingInvoice}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {#if isSavingInvoice}
            <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Menyimpan & Menambah Stok...</span>
          {:else}
            <span>Simpan Faktur</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL DETAIL FAKTUR & RIWAYAT PEMBAYARAN (RLH) -->
{#if isInvoiceDetailModalOpen && selectedInvoiceDetail}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isInvoiceDetailModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <div class="font-mono font-bold text-brand-blue text-xs">{selectedInvoiceDetail.invoiceNumber}</div>
          <div class="font-bold text-slate-900 text-sm">{selectedInvoiceDetail.supplierName}</div>
        </div>
        <button
          onclick={() => (isInvoiceDetailModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
        <div>Cabang: <strong>{selectedInvoiceDetail.branchName}</strong></div>
        <div>Tgl Faktur: <strong class="font-mono">{selectedInvoiceDetail.invoiceDate}</strong></div>
        <div>Jatuh Tempo: <strong class="font-mono text-brand-red-600">{selectedInvoiceDetail.dueDate}</strong></div>
        <div>PPN: <strong>{selectedInvoiceDetail.taxPercent}% ({selectedInvoiceDetail.itemsCount} Item)</strong></div>
        <div class="col-span-2">Catatan: <strong>{selectedInvoiceDetail.notes}</strong></div>
      </div>

      <div class="grid grid-cols-3 gap-2 text-center text-xs">
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
          <div class="text-slate-500 text-[10px]">Total Tagihan</div>
          <div class="font-mono font-bold text-slate-900">{formatRupiah(selectedInvoiceDetail.totalAmount)}</div>
        </div>
        <div class="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
          <div class="text-emerald-700 text-[10px]">Sudah Dibayar</div>
          <div class="font-mono font-bold text-emerald-700">{formatRupiah(selectedInvoiceDetail.paidAmount)}</div>
        </div>
        <div class="p-2.5 rounded-xl bg-red-50 border border-red-200">
          <div class="text-red-700 text-[10px]">Sisa Hutang</div>
          <div class="font-mono font-bold text-red-700">
            {formatRupiah(selectedInvoiceDetail.totalAmount - selectedInvoiceDetail.paidAmount)}
          </div>
        </div>
      </div>

      <!-- RINCIAN ITEM OBAT MASUK -->
      {#if selectedInvoiceDetail.items && selectedInvoiceDetail.items.length > 0}
        <div class="space-y-2 text-xs">
          <div class="font-bold text-slate-800 flex justify-between items-center">
            <span>Rincian Item Obat ({selectedInvoiceDetail.items.length} Macam)</span>
            <span class="text-[11px] text-slate-500 font-mono">Tervalidasi Gudang</span>
          </div>
          <div class="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th class="py-2 px-3">Nama Obat</th>
                  <th class="py-2 px-3">Batch & ED</th>
                  <th class="py-2 px-3 text-center">Qty</th>
                  <th class="py-2 px-3 text-right">Harga Beli</th>
                  <th class="py-2 px-3 text-center">Disc%</th>
                  <th class="py-2 px-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                {#each selectedInvoiceDetail.items as item}
                  <tr class="hover:bg-slate-50/50">
                    <td class="py-2 px-3 font-medium text-slate-900">{item.productName}</td>
                    <td class="py-2 px-3 font-mono text-[11px] text-slate-600">
                      {item.batchNo} <span class="text-slate-400">({item.expiredDate})</span>
                    </td>
                    <td class="py-2 px-3 text-center font-bold text-slate-800 font-mono">
                      {item.qty} {item.unit}
                    </td>
                    <td class="py-2 px-3 text-right font-mono text-slate-700">
                      {formatRupiah(item.hna)}
                    </td>
                    <td class="py-2 px-3 text-center font-mono text-slate-600">
                      {item.disc1}%
                    </td>
                    <td class="py-2 px-3 text-right font-mono font-bold text-slate-900">
                      {formatRupiah(item.subtotal || (item.qty * item.hna * (1 - item.disc1 / 100)))}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      {#if selectedInvoiceDetail.payments && selectedInvoiceDetail.payments.length > 0}
        <div class="space-y-1.5 text-xs">
          <div class="font-bold text-slate-800">Riwayat Bukti Pelunasan (RLH)</div>
          <div class="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {#each selectedInvoiceDetail.payments as pay}
              <div class="p-2.5 flex items-center justify-between">
                <div>
                  <div class="font-mono font-bold text-slate-800">{pay.paymentNumber}</div>
                  <div class="text-[10px] text-slate-500">{pay.paymentDate} • {pay.paymentMethod}</div>
                </div>
                <div class="font-mono font-bold text-emerald-700">{formatRupiah(pay.amountPaid)}</div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- MODAL PELUNASAN HUTANG FAKTUR PBF -->
{#if isPayDebtModalOpen && selectedInvoiceForPayment}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isPayDebtModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <CreditCard class="w-5 h-5 text-brand-blue" />
          <span>Pembayaran Hutang PBF</span>
        </div>
        <button
          onclick={() => (isPayDebtModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
          <div class="text-slate-500 text-[11px]">No. Faktur:</div>
          <div class="font-mono font-bold text-slate-900 text-sm">{selectedInvoiceForPayment.invoiceNumber}</div>
          <div class="text-slate-700 font-semibold">{selectedInvoiceForPayment.supplierName}</div>
          <div class="flex justify-between pt-2 border-t border-slate-200 font-bold">
            <span class="text-slate-500">Sisa Hutang:</span>
            <span class="text-brand-red-600 font-mono">
              {formatRupiah(selectedInvoiceForPayment.totalAmount - selectedInvoiceForPayment.paidAmount)}
            </span>
          </div>
        </div>

        <div>
          <label for="pay-method" class="font-bold text-slate-700 block mb-1">Metode Pembayaran</label>
          <Select
            id="pay-method"
            bind:value={paymentMethod}
            options={[
              "TRANSFER_BCA (Rekening Apotek BCA)",
              "TRANSFER_MANDIRI (Rekening Mandiri)",
              "BILYET_GIRO (Giro Jatuh Tempo)",
              "KAS_KASIR (Tunai Kas Operasional)"
            ]}
          />
        </div>

        <div>
          <label for="pay-amount" class="font-bold text-slate-700 block mb-1">Nominal Pembayaran (Rp)</label>
          <input
            id="pay-amount"
            type="number"
            bind:value={paymentAmount}
            max={selectedInvoiceForPayment.totalAmount - selectedInvoiceForPayment.paidAmount}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-brand-blue"
          />
        </div>
      </div>

      <div class="border-t border-slate-100 pt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isPayDebtModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleSavePayment}
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
        >
          Konfirmasi Bayar
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL BUAT SP RESMI (MULTI-ITEM) -->
{#if isAddSpModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isAddSpModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <Printer class="w-5 h-5 text-brand-blue" />
          <span>Buat Surat Pesanan (SP) Resmi</span>
        </div>
        <button
          onclick={() => (isAddSpModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label for="sp-type" class="font-bold text-slate-700 block mb-1">Jenis Surat Pesanan</label>
          <Select
            id="sp-type"
            value={newSpForm.orderType}
            onchange={(val) => (newSpForm.orderType = val)}
            options={[
              { value: "REGULER", label: "SP REGULER (Obat Bebas & Keras)" },
              { value: "PREKURSOR", label: "SP PREKURSOR FARMASI" },
              { value: "OOT", label: "SP OBAT-OBAT TERTENTU (OOT)" },
              { value: "PSIKOTROPIKA", label: "SP PSIKOTROPIKA (Khusus Apoteker)" }
            ]}
          />
        </div>
        <div>
          {#if authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"}
            <label for="sp-branch" class="font-bold text-slate-700 block mb-1">Cabang Pemesan</label>
            <Select
              id="sp-branch"
              value={newSpForm.branchId}
              onchange={(val) => (newSpForm.branchId = val)}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          {:else}
            <span class="font-bold text-slate-700 block mb-1">Cabang Pemesan</span>
            <div class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-2">
              <Store class="w-4 h-4 text-brand-blue" />
              <span>{authStore.user?.branchName || branches.find((b) => b.id === newSpForm.branchId)?.name || "Cabang Utama"}</span>
            </div>
          {/if}
        </div>
        <div class="col-span-2">
          <label for="sp-target" class="font-bold text-slate-700 block mb-1">Distributor PBF Dituju</label>
          <SearchableSelect
            id="sp-target"
            variant="default"
            value={newSpForm.supplierName}
            onchange={(val) => (newSpForm.supplierName = val)}
            searchPlaceholder="Cari distributor PBF..."
            options={suppliers.map((s) => ({
              value: s.name,
              label: s.name,
              sublabel: `${s.code} • ${s.phone}`
            }))}
          />
        </div>
      </div>

      <!-- DAFTAR ITEM SP -->
      <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3 text-xs">
        <div class="font-bold text-slate-800 flex justify-between">
          <span>Daftar Obat yang Dipesan</span>
          <span class="font-mono text-brand-blue">{newSpForm.items.length} Item</span>
        </div>

        <div class="grid grid-cols-12 gap-2 items-end">
          <div class="col-span-5">
            <label for="sp-item-prod" class="text-[11px] font-semibold text-slate-600 block mb-1">Nama Obat</label>
            <SearchableSelect
              id="sp-item-prod"
              value={draftSpProductName}
              onchange={handleSpProductChange}
              searchPlaceholder="Pilih atau cari nama obat..."
              options={products.map((p) => ({
                value: p.name,
                label: p.name,
                sublabel: `${p.baseUnit} • Base HNA: ${formatRupiah(p.buyPrice || 0)}`
              }))}
            />
          </div>
          <div class="col-span-2">
            <label for="sp-item-qty" class="text-[11px] font-semibold text-slate-600 block mb-1">Qty</label>
            <input
              id="sp-item-qty"
              type="number"
              min="1"
              bind:value={draftSpQty}
              class="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 font-mono font-bold text-center"
            />
          </div>
          <div class="col-span-2">
            <label for="sp-item-unit" class="text-[11px] font-semibold text-slate-600 block mb-1">Satuan</label>
            <Select
              id="sp-item-unit"
              value={draftSpUnit}
              onchange={handleSpUnitChange}
              options={availableSpUnits}
            />
          </div>
          <div class="col-span-2">
            <label for="sp-item-hna" class="text-[11px] font-semibold text-slate-600 block mb-1">Estimasi HNA</label>
            <input
              id="sp-item-hna"
              type="number"
              min="0"
              step="500"
              bind:value={draftSpHna}
              class="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 font-mono font-bold text-right text-xs"
            />
          </div>
          <div class="col-span-1">
            <button
              type="button"
              onclick={addDraftItemToSp}
              class="w-full py-2.5 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold flex items-center justify-center shadow-xs"
              title="Tambah ke SP"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div class="divide-y divide-slate-200 bg-white rounded-xl border border-slate-200 overflow-hidden max-h-56 overflow-y-auto">
          {#if newSpForm.items.length === 0}
            <div class="py-8 text-center text-slate-400 space-y-1">
              <ShoppingBag class="w-6 h-6 mx-auto text-slate-300" />
              <div class="font-medium text-xs">Belum ada obat dalam Surat Pesanan ini</div>
              <div class="text-[11px] text-slate-400">Pilih nama obat di atas, atur jumlah dan satuan, lalu klik tombol (+)</div>
            </div>
          {:else}
            {#each newSpForm.items as item, idx}
              <div class="px-3 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div>
                  <div class="font-bold text-slate-800">{idx + 1}. {item.productName}</div>
                  <div class="text-[10px] text-slate-500 font-mono">
                    HNA: {formatRupiah(item.estimatedHna)} / {item.unit} • Subtotal: {formatRupiah(item.estimatedHna * item.qty)}
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="font-mono font-bold text-brand-blue">{item.qty} {item.unit}</span>
                  <button
                    type="button"
                    onclick={() => removeDraftItemFromSp(idx)}
                    class="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-brand-red-600 transition-colors"
                    title="Hapus Obat Ini"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            {/each}
          {/if}
        </div>

        {#if newSpForm.items.length > 0}
          <div class="flex justify-between items-center px-1 font-bold text-xs pt-1 border-t border-slate-200">
            <span class="text-slate-600">Total Estimasi Nilai Pesanan:</span>
            <span class="font-mono text-brand-blue text-sm">
              {formatRupiah(newSpForm.items.reduce((s, it) => s + (it.qty * it.estimatedHna), 0))}
            </span>
          </div>
        {/if}
      </div>

      <div class="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-slate-600 text-xs space-y-1">
        <div class="font-bold text-brand-blue text-[11px]">Penanggung Jawab:</div>
        <div>Apoteker: <strong>{newSpForm.pharmacistName}</strong> • SIPA: <strong>{newSpForm.sipa}</strong></div>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isAddSpModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleCreateSp}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm"
        >
          Terbitkan & Simpan SP
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL CETAK SP RESMI STANDAR BPOM (PRINT-READY) -->
{#if isPrintSpModalOpen && selectedSpForPrint}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isPrintSpModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-4 my-auto text-xs">
      <!-- KOP APOTEK RESMI -->
      <div class="border-b-2 border-slate-900 pb-3 text-center space-y-0.5">
        <div class="font-black text-sm uppercase tracking-wide text-slate-900">APOTEK HAFIDZ FARMA</div>
        <div class="text-[11px] text-slate-600">SIA: 503/0014/SIA/DPMPTSP/2024 • Jl. Letjen Mashudi No. 45, Tasikmalaya</div>
        <div class="text-[10px] text-slate-500 font-mono">Telp: (0265) 345678 • Email: apotek.hafidzfarma@gmail.com</div>
      </div>

      <!-- JUDUL SP SESUAI PERATURAN BPOM -->
      <div class="text-center space-y-0.5 py-1">
        <div class="font-black text-sm uppercase text-slate-900 tracking-wider">
          SURAT PESANAN OBAT {selectedSpForPrint.orderType}
        </div>
        <div class="font-mono text-xs font-bold text-brand-blue">
          Nomor: {selectedSpForPrint.orderNumber}
        </div>
      </div>

      <!-- IDENTITAS APOTEKER & PBF -->
      <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] space-y-1.5">
        <div class="text-slate-600 font-medium">Yang bertanda tangan di bawah ini:</div>
        <div class="grid grid-cols-[120px_1fr] gap-1 pl-1">
          <span class="text-slate-500">Nama Apoteker:</span>
          <strong class="text-slate-900">{selectedSpForPrint.pharmacistName}</strong>
          <span class="text-slate-500">Nomor SIPA:</span>
          <span class="font-mono font-bold text-slate-800">{selectedSpForPrint.sipa}</span>
          <span class="text-slate-500">Jabatan:</span>
          <span class="text-slate-800">Apoteker Pengelola Apotek (APA)</span>
        </div>
        <div class="pt-2 border-t border-slate-200 text-slate-700 pl-1">
          Mengajukan pesanan obat kepada Distributor Farmasi (PBF):
          <strong class="text-slate-900 block pt-0.5">{selectedSpForPrint.supplierName}</strong>
        </div>
      </div>

      <!-- TABEL RINCIAN OBAT DIPESAN -->
      <div class="border border-slate-200 rounded-xl overflow-hidden">
        <table class="w-full text-[11px]">
          <thead class="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
            <tr>
              <th class="py-2 px-2.5 text-center w-8">No</th>
              <th class="py-2 px-2.5 text-left">Nama Obat / Zat Aktif / Bentuk Sediaan</th>
              <th class="py-2 px-2.5 text-center w-20">Satuan</th>
              <th class="py-2 px-2.5 text-center w-16">Jumlah</th>
              <th class="py-2 px-2.5 text-right w-24">Estimasi HNA</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            {#if selectedSpForPrint.items && selectedSpForPrint.items.length > 0}
              {#each selectedSpForPrint.items as item, idx}
                <tr>
                  <td class="py-2 px-2.5 text-center text-slate-500 font-mono">{idx + 1}</td>
                  <td class="py-2 px-2.5 font-medium text-slate-900">{item.productName}</td>
                  <td class="py-2 px-2.5 text-center text-slate-600">{item.unit}</td>
                  <td class="py-2 px-2.5 text-center font-mono font-bold text-slate-900">{item.qty}</td>
                  <td class="py-2 px-2.5 text-right font-mono text-slate-700">{formatRupiah(item.estimatedHna * item.qty)}</td>
                </tr>
              {/each}
            {:else}
              <tr>
                <td class="py-2 px-2.5 text-center font-mono text-slate-500">1</td>
                <td class="py-2 px-2.5 font-medium text-slate-900">Amoxicillin 500mg Kaplet</td>
                <td class="py-2 px-2.5 text-center text-slate-600">BOX</td>
                <td class="py-2 px-2.5 text-center font-mono font-bold text-slate-900">5</td>
                <td class="py-2 px-2.5 text-right font-mono text-slate-700">{formatRupiah(selectedSpForPrint.estimatedAmount)}</td>
              </tr>
            {/if}
          </tbody>
          <tfoot class="bg-slate-50 font-bold border-t border-slate-200">
            <tr>
              <td colspan="4" class="py-2 px-2.5 text-right text-slate-700">Total Perkiraan Pesanan:</td>
              <td class="py-2 px-2.5 text-right font-mono text-brand-blue">{formatRupiah(selectedSpForPrint.estimatedAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- KETERANGAN RANGKAP & TANDA TANGAN -->
      <div class="grid grid-cols-2 gap-4 items-end pt-2 text-[11px] text-slate-600">
        <div class="text-[10px] space-y-0.5 border-l-2 border-slate-300 pl-2">
          <div class="font-bold text-slate-700">Ketentuan Rangkap (BPOM):</div>
          <div>• Lembar 1: PBF Asli (Distributor)</div>
          <div>• Lembar 2: Balai Besar POM / Dinkes</div>
          <div>• Lembar 3: Arsip Apotek (Dokumen Kendali)</div>
        </div>
        <div class="text-right space-y-1">
          <div>Tasikmalaya, {selectedSpForPrint.orderDate}</div>
          <div class="text-slate-500 text-[10px]">Apoteker Pengelola Apotek (APA),</div>
          <div class="h-10 flex items-end justify-end">
            <span class="text-[9px] text-slate-400 italic">(Tanda Tangan & Stempel)</span>
          </div>
          <div class="font-bold text-slate-900 underline">{selectedSpForPrint.pharmacistName}</div>
          <div class="text-[10px] text-slate-500 font-mono">SIPA: {selectedSpForPrint.sipa}</div>
        </div>
      </div>

      <div class="border-t border-slate-100 pt-3 flex justify-end gap-2">
        <button
          type="button"
          onclick={() => (isPrintSpModalOpen = false)}
          class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
        >
          Tutup
        </button>
        <button
          type="button"
          onclick={() => {
            window.print();
            isPrintSpModalOpen = false;
          }}
          class="px-4 py-1.5 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold inline-flex items-center gap-1.5 shadow-sm"
        >
          <Printer class="w-3.5 h-3.5" />
          <span>Cetak Dokumen Resmi</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL SETOR BAGI HASIL KONSINYASI -->
{#if isSettleKsnModalOpen && selectedKsnForSettle}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isSettleKsnModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto text-xs">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="font-bold text-slate-900 flex items-center gap-2 text-sm">
          <CheckCircle2 class="w-5 h-5 text-emerald-600" />
          <span>Setor Bagi Hasil Konsinyasi</span>
        </div>
        <button
          onclick={() => (isSettleKsnModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
        <div class="font-mono font-bold text-brand-blue">{selectedKsnForSettle.receiptNumber}</div>
        <div class="font-bold text-slate-900">{selectedKsnForSettle.supplierName}</div>
        <div class="text-slate-600">{selectedKsnForSettle.productName}</div>
        <div class="pt-2 border-t border-slate-200 flex justify-between font-bold">
          <span>Terjual: {selectedKsnForSettle.soldQty} &times; {formatRupiah(selectedKsnForSettle.unitPrice)}</span>
          <span class="font-mono text-emerald-700">{formatRupiah(selectedKsnForSettle.unsettledAmount)}</span>
        </div>
      </div>

      <div>
        <label for="ksn-method" class="font-bold text-slate-700 block mb-1">Metode Penyetoran</label>
        <Select
          id="ksn-method"
          bind:value={ksnSettleMethod}
          options={[
            "KAS_KASIR (Tunai Kas Operasional)",
            "TRANSFER_BCA (Transfer Rekening Vendor)"
          ]}
        />
      </div>

      <div class="border-t border-slate-100 pt-3 flex justify-end gap-2">
        <button
          type="button"
          onclick={() => (isSettleKsnModalOpen = false)}
          class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleConfirmSettleKsn}
          class="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
        >
          Konfirmasi Setor
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL TERIMA TITIPAN KONSINYASI BARU -->
{#if isAddKsnModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isAddKsnModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto text-xs">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="font-bold text-slate-900 flex items-center gap-2 text-sm">
          <Truck class="w-5 h-5 text-brand-blue" />
          <span>Terima Produk Konsinyasi (Titipan)</span>
        </div>
        <button
          onclick={() => (isAddKsnModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="space-y-3">
        {#if authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"}
          <div>
            <label for="ksn-branch" class="font-bold text-slate-700 block mb-1">Cabang Penerima</label>
            <Select
              id="ksn-branch"
              value={newKsnForm.branchId}
              onchange={(val) => (newKsnForm.branchId = val)}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>
        {/if}

        <div>
          <label for="ksn-sup" class="font-bold text-slate-700 block mb-1">Nama Vendor / Konsinyor</label>
          <SearchableSelect
            id="ksn-sup"
            variant="default"
            value={newKsnForm.supplierName}
            onchange={(val) => (newKsnForm.supplierName = val)}
            searchPlaceholder="Pilih atau cari supplier konsinyor..."
            options={suppliers.map((s) => ({
              value: s.name,
              label: s.name,
              sublabel: `${s.code} • ${s.phone || "-"}`
            }))}
          />
        </div>

        <div>
          <label for="ksn-prod" class="font-bold text-slate-700 block mb-1">Nama Produk Titipan</label>
          <SearchableSelect
            id="ksn-prod"
            variant="default"
            value={newKsnForm.productName}
            onchange={(val) => {
              newKsnForm.productName = val;
              const p = products.find((prod) => prod.name === val);
              if (p) {
                newKsnForm.unitPrice = Number(p.buyPrice || newKsnForm.unitPrice);
                newKsnForm.sellingPrice = Math.round(Number(p.buyPrice || newKsnForm.unitPrice) * 1.3);
              }
            }}
            searchPlaceholder="Pilih produk dari master..."
            options={products.map((p) => ({
              value: p.name,
              label: p.name,
              sublabel: `${p.baseUnit} • Beli: ${formatRupiah(p.buyPrice || 0)}`
            }))}
          />
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div>
            <label for="ksn-qty" class="font-bold text-slate-700 block mb-1">Qty Titip</label>
            <input
              id="ksn-qty"
              type="number"
              min="1"
              bind:value={newKsnForm.receivedQty}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-center"
            />
          </div>
          <div>
            <label for="ksn-buy" class="font-bold text-slate-700 block mb-1">Harga Setor</label>
            <input
              id="ksn-buy"
              type="number"
              bind:value={newKsnForm.unitPrice}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label for="ksn-sell" class="font-bold text-slate-700 block mb-1">Harga Jual</label>
            <input
              id="ksn-sell"
              type="number"
              bind:value={newKsnForm.sellingPrice}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-brand-blue"
            />
          </div>
        </div>
      </div>

      <div class="border-t border-slate-100 pt-3 flex justify-end gap-2">
        <button
          type="button"
          onclick={() => (isAddKsnModalOpen = false)}
          class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={handleCreateConsignment}
          class="px-4 py-1.5 rounded-xl bg-brand-blue-700 text-white font-bold"
        >
          Simpan Titipan
        </button>
      </div>
    </div>
  </div>
{/if}
