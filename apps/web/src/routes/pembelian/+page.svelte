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
    X
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
  import procurementData from "$lib/mocks/procurement.json";
  import suppliersData from "$lib/mocks/suppliers.json";
  import productsData from "$lib/mocks/products.json";
  import branchesData from "$lib/mocks/branches.json";
  import { portal } from "$lib/actions/portal";
  import { api } from "$lib/services/api";

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
    productId: string;
    productName: string;
    qty: number;
    unit: string;
    estimatedHna: number;
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
    receiptNumber: string;
    branchId?: string;
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
  let invoices = $state<PurchaseInvoiceRecord[]>(procurementData.purchaseInvoices);
  let purchaseOrders = $state<PurchaseOrderRecord[]>(procurementData.purchaseOrders);
  let consignments = $state<ConsignmentRecord[]>(
    procurementData.consignments.map((c) => ({ ...c, branchId: "1" }))
  );
  let suppliers = $state(suppliersData);
  let products = $state(productsData);
  let branches = $state(branchesData);

  // Navigation & Filters
  let selectedBranchId = $state("ALL");
  let activeTab = $state<"faktur" | "sp" | "konsinyasi">("faktur");
  let invoiceStatusFilter = $state<"ALL" | "UNPAID" | "PARTIAL" | "OVERDUE" | "PAID">("ALL");
  let searchQuery = $state("");
  let spSearchQuery = $state("");
  let ksnSearchQuery = $state("");

  onMount(async () => {
    try {
      const res = await api.erp.getPurchases(100);
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        invoices = res.data.map((p: any) => ({
          id: p.id,
          invoiceNumber: p.invoiceNumber,
          poNumber: `PO-${p.invoiceNumber.slice(0, 8)}`,
          supplierId: "supp-1",
          supplierName: p.supplierName,
          branchId: "1",
          branchName: "Apotek Hafidz Farma 1",
          invoiceDate: p.receiveDate,
          dueDate: p.dueDate,
          totalAmount: p.grandTotal,
          paidAmount: p.paidAmount,
          status: p.isPaidOff ? "PAID" : (p.paidAmount > 0 ? "PARTIAL" : "UNPAID"),
          itemsCount: 1,
          taxPercent: 11,
          notes: "Faktur Pembelian PBF Terverifikasi"
        }));
      }
    } catch (_) {}
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
    branchId: "1",
    supplierName: "PT. Herbal Alam Sehat (Titipan)",
    productName: "Madu Habbatussauda Extra Propolis 250ml",
    receivedQty: 30,
    unitPrice: 45000,
    sellingPrice: 65000
  });

  // New Invoice Form State (Multi-Item Grid)
  let newInvoiceBranchId = $state("1");
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
    branchId: "1",
    orderType: "REGULER",
    supplierName: "PT. Kimia Farma Trading & Distribution",
    pharmacistName: "apt. Hafidz Nurul, S.Farm.",
    sipa: "SIPA-503/044/Dinkes/2024",
    items: [
      {
        productId: "prod-amox-500",
        productName: "Amoxicillin 500mg (Errata)",
        qty: 10,
        unit: "BOX",
        estimatedHna: 68000
      }
    ] as SpItemRow[]
  });

  let draftSpProductName = $state("Amoxicillin 500mg (Errata)");
  let draftSpQty = $state(5);
  let draftSpUnit = $state("BOX");
  let draftSpHna = $state(68000);

  onMount(() => {
    selectedBranchId = "ALL";
  });

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
    newInvoiceItems.push({
      productId: products[0]?.id || "",
      productName: products[0]?.name || "Produk Baru",
      batchNo: `BATCH-${Date.now().toString().slice(-6)}`,
      expiredDate: "2027-12-31",
      unit: "BOX",
      qty: 1,
      hna: 50000,
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
    const gross = (item.qty || 0) * (item.hna || 0);
    const afterDisc1 = gross * (1 - (item.disc1 || 0) / 100);
    const afterDisc2 = afterDisc1 * (1 - (item.disc2 || 0) / 100);
    return Math.round(afterDisc2);
  }

  // Invoice Totals Breakdown
  let invoiceSubtotalBruto = $derived(
    newInvoiceItems.reduce((acc, it) => acc + (it.qty || 0) * (it.hna || 0), 0)
  );

  let invoiceTotalNetto = $derived(
    newInvoiceItems.reduce((acc, it) => acc + calcRowSubtotal(it), 0)
  );

  let invoiceTotalDiscount = $derived(invoiceSubtotalBruto - invoiceTotalNetto);

  let invoiceTaxAmount = $derived(
    newInvoiceTaxIncluded ? Math.round(invoiceTotalNetto * 0.11) : 0
  );

  let invoiceGrandTotal = $derived(invoiceTotalNetto + invoiceTaxAmount);

  function formatRupiah(num: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(num);
  }

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

  let branchConsignments = $derived(
    consignments.filter(
      (c) => selectedBranchId === "ALL" || (c.branchId || "1") === selectedBranchId
    )
  );

  // Filtered Lists for Tables
  let filteredInvoices = $derived(
    branchInvoices.filter((inv) => {
      const matchStatus =
        invoiceStatusFilter === "ALL" || inv.status === invoiceStatusFilter;
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

  function handleSaveNewInvoice() {
    if (!newInvoiceNumber.trim()) return;

    const supplierObj =
      suppliers.find((s) => s.name === newInvoiceSupplier) || suppliers[0];
    const branchObj =
      branches.find((b) => b.id === newInvoiceBranchId) || branches[0];

    const createdInvoice: PurchaseInvoiceRecord = {
      id: `inv-${Date.now()}`,
      invoiceNumber: newInvoiceNumber.trim().toUpperCase(),
      poNumber: newInvoicePoNumber !== "NONE" ? newInvoicePoNumber : undefined,
      supplierId: supplierObj?.id || "sup-01",
      supplierName: newInvoiceSupplier,
      branchId: newInvoiceBranchId,
      branchName: branchObj?.name || "Apotek Hafidz Farma Pusat",
      invoiceDate: newInvoiceDate,
      dueDate: newInvoiceDueDate,
      totalAmount: invoiceGrandTotal,
      paidAmount: 0,
      status: "UNPAID",
      itemsCount: newInvoiceItems.length,
      taxPercent: newInvoiceTaxIncluded ? 11 : 0,
      notes:
        newInvoicePoNumber !== "NONE"
          ? `Penerimaan atas SP ${newInvoicePoNumber}`
          : "Faktur pembelian PBF multi-item",
      items: [...newInvoiceItems],
      payments: []
    };

    invoices = [createdInvoice, ...invoices];

    if (newInvoicePoNumber !== "NONE") {
      purchaseOrders = purchaseOrders.map((sp) =>
        sp.orderNumber === newInvoicePoNumber
          ? { ...sp, status: "RECEIVED" }
          : sp
      );
    }

    isAddInvoiceModalOpen = false;
    newInvoiceNumber = "";
    newInvoicePoNumber = "NONE";
  }

  function openReceiveSpIntoInvoice(sp: PurchaseOrderRecord) {
    newInvoiceBranchId = sp.branchId || "1";
    newInvoicePoNumber = sp.orderNumber;
    newInvoiceSupplier = sp.supplierName;
    newInvoiceNumber = `FP-${new Date().toISOString().slice(2, 7).replace("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`;
    updateDueDateFromSupplier(sp.supplierName, newInvoiceDate);

    if (sp.items && sp.items.length > 0) {
      newInvoiceItems = sp.items.map((it, idx) => ({
        productId: it.productId,
        productName: it.productName,
        batchNo: `B2511-${idx + 1}`,
        expiredDate: "2027-11-30",
        unit: it.unit,
        qty: it.qty,
        hna: it.estimatedHna,
        disc1: 0,
        disc2: 0
      }));
    }

    isAddInvoiceModalOpen = true;
  }

  async function openInvoiceDetail(inv: PurchaseInvoiceRecord) {
    selectedInvoiceDetail = inv;
    isInvoiceDetailModalOpen = true;
    try {
      const payRes = await api.finance.getDebtPayments({ invoiceId: inv.id });
      if (payRes?.success && Array.isArray(payRes.data) && payRes.data.length > 0) {
        selectedInvoiceDetail = {
          ...selectedInvoiceDetail,
          payments: payRes.data.map((p: any) => ({
            paymentNumber: p.paymentNumber,
            paymentDate: p.paymentDate,
            paymentMethod: p.paymentMethod,
            amountPaid: Number(p.amountPaid)
          }))
        };
      }
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
        // Refresh purchases data from API
        const purRes = await api.erp.getPurchases(100);
        if (purRes?.success && Array.isArray(purRes.data) && purRes.data.length > 0) {
          invoices = purRes.data.map((p: any) => ({
            id: p.id,
            invoiceNumber: p.invoiceNumber,
            poNumber: `PO-${p.invoiceNumber.slice(0, 8)}`,
            supplierId: "supp-1",
            supplierName: p.supplierName,
            branchId: "1",
            branchName: "Apotek Hafidz Farma 1",
            invoiceDate: p.receiveDate,
            dueDate: p.dueDate,
            totalAmount: p.grandTotal,
            paidAmount: p.paidAmount,
            status: p.isPaidOff ? "PAID" : (p.paidAmount > 0 ? "PARTIAL" : "UNPAID"),
            itemsCount: 1,
            taxPercent: 11,
            notes: "Faktur Pembelian PBF Terverifikasi"
          }));
        }
      }
    } catch (err) {
      console.warn("Could not save debt payment via API, using local fallback", err);
    }

    invoices = invoices.map((inv) => {
      if (inv.id !== selectedInvoiceForPayment?.id) return inv;
      const updatedPaid = Math.min(inv.totalAmount, inv.paidAmount + paymentAmount);
      const updatedStatus =
        updatedPaid >= inv.totalAmount ? "PAID" : "PARTIAL";
      return {
        ...inv,
        paidAmount: updatedPaid,
        status: updatedStatus,
        payments: [
          ...(inv.payments || []),
          {
            paymentNumber: rlNumber,
            paymentDate: today,
            paymentMethod,
            amountPaid: paymentAmount
          }
        ]
      };
    });

    isPayDebtModalOpen = false;
    selectedInvoiceForPayment = null;
  }

  function addDraftItemToSp() {
    if (!draftSpProductName || draftSpQty <= 0) return;
    const prod = products.find((p) => p.name === draftSpProductName);
    newSpForm.items = [
      ...newSpForm.items,
      {
        productId: prod?.id || `prod-${Date.now()}`,
        productName: draftSpProductName,
        qty: Number(draftSpQty),
        unit: draftSpUnit,
        estimatedHna: Number(draftSpHna) || 50000
      }
    ];
    draftSpQty = 5;
  }

  function removeDraftItemFromSp(idx: number) {
    if (newSpForm.items.length > 1) {
      newSpForm.items = newSpForm.items.filter((_, i) => i !== idx);
    }
  }

  function handleCreateSp() {
    if (newSpForm.items.length === 0) return;
    const prefix =
      newSpForm.orderType === "PSIKOTROPIKA"
        ? "PSI"
        : newSpForm.orderType === "PREKURSOR"
          ? "PRE"
          : newSpForm.orderType === "OOT"
            ? "OOT"
            : "REG";
    const nextNum = String(purchaseOrders.length + 43).padStart(4, "0");
    const estimatedTotal = newSpForm.items.reduce(
      (sum, it) => sum + it.qty * it.estimatedHna,
      0
    );

    const createdSp: PurchaseOrderRecord = {
      id: `sp-${Date.now()}`,
      orderNumber: `SP-${prefix}-HF-2025-${nextNum}`,
      orderType: newSpForm.orderType,
      supplierId: "sup-1",
      supplierName: newSpForm.supplierName,
      branchId: newSpForm.branchId,
      orderDate: "2025-10-28",
      status: "SENT",
      pharmacistName: newSpForm.pharmacistName,
      sipa: newSpForm.sipa,
      totalItems: newSpForm.items.length,
      estimatedAmount: estimatedTotal,
      items: [...newSpForm.items]
    };

    purchaseOrders = [createdSp, ...purchaseOrders];
    isAddSpModalOpen = false;
  }

  function openKsnSettleModal(ksn: ConsignmentRecord) {
    selectedKsnForSettle = ksn;
    isSettleKsnModalOpen = true;
  }

  function handleConfirmSettleKsn() {
    if (!selectedKsnForSettle) return;
    consignments = consignments.map((c) =>
      c.id === selectedKsnForSettle?.id
        ? { ...c, unsettledAmount: 0, status: "SETTLED" }
        : c
    );
    isSettleKsnModalOpen = false;
    selectedKsnForSettle = null;
  }

  function handleCreateConsignment() {
    if (newKsnForm.receivedQty <= 0) return;
    const nextNo = String(consignments.length + 20).padStart(4, "0");
    const created: ConsignmentRecord = {
      id: `ksn-${Date.now()}`,
      receiptNumber: `KSN-HF-2025-${nextNo}`,
      branchId: newKsnForm.branchId,
      supplierName: newKsnForm.supplierName,
      date: "2025-10-28",
      productName: newKsnForm.productName,
      receivedQty: Number(newKsnForm.receivedQty),
      soldQty: 0,
      remainingQty: Number(newKsnForm.receivedQty),
      unitPrice: Number(newKsnForm.unitPrice),
      sellingPrice: Number(newKsnForm.sellingPrice),
      unsettledAmount: 0,
      status: "ACTIVE"
    };
    consignments = [created, ...consignments];
    isAddKsnModalOpen = false;
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
      <!-- Branch Selector -->
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
      title="Jatuh Tempo & Overdue"
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
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold">
    <button
      type="button"
      onclick={() => (activeTab = "faktur")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'faktur' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
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
      class="pb-3 px-3 transition-colors relative {activeTab === 'sp' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
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
      class="pb-3 px-3 transition-colors relative {activeTab === 'konsinyasi' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
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
        <div class="w-44 shrink-0">
          <Select
            value={invoiceStatusFilter}
            onchange={(val) => (invoiceStatusFilter = val as typeof invoiceStatusFilter)}
            options={[
              { value: "ALL", label: "Semua Status" },
              { value: "UNPAID", label: "Belum Lunas" },
              { value: "PARTIAL", label: "Sebagian" },
              { value: "OVERDUE", label: "Lewat Tempo" },
              { value: "PAID", label: "Lunas" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <th class="py-3 px-4">Faktur PBF</th>
        <th class="py-3 px-4">Distributor PBF</th>
        <th class="py-3 px-4">Tanggal</th>
        <th class="py-3 px-4">Tempo</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-right">Total</th>
        <th class="py-3 px-4 text-right">Hutang</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#each filteredInvoices as inv}
          {@const remainingDebt = inv.totalAmount - inv.paidAmount}
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
            <td class="py-3.5 px-4 font-mono {inv.status === 'OVERDUE' ? 'text-brand-red-600 font-bold' : 'text-slate-600'}">
              {inv.dueDate}
            </td>
            <td class="py-3.5 px-4 text-center">
              {#if inv.status === "PAID"}
                <Badge type="SUCCESS" label="LUNAS" />
              {:else if inv.status === "OVERDUE"}
                <Badge type="DANGER" label="LEWAT TEMPO" />
              {:else if inv.status === "PARTIAL"}
                <Badge type="WARNING" label="SEBAGIAN" />
              {:else}
                <Badge type="WARNING" label="BELUM LUNAS" />
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
              </div>
            </td>
          </tr>
        {/each}
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
        <th class="py-3 px-4">No. Surat Pesanan</th>
        <th class="py-3 px-4">Jenis SP</th>
        <th class="py-3 px-4">Distributor Dituju</th>
        <th class="py-3 px-4">Apoteker PJ & SIPA</th>
        <th class="py-3 px-4 text-center">Total Item</th>
        <th class="py-3 px-4 text-right">Estimasi Nilai</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#each filteredPurchaseOrders as sp}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
              {sp.orderNumber}
              <div class="text-[10px] text-slate-400 font-normal">{sp.orderDate}</div>
            </td>
            <td class="py-3.5 px-4">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold {sp.orderType === 'PSIKOTROPIKA' ? 'bg-purple-100 text-purple-700' : sp.orderType === 'PREKURSOR' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}">
                SP {sp.orderType}
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
                  onclick={() => {
                    selectedSpForPrint = sp;
                    isPrintSpModalOpen = true;
                  }}
                  class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-brand-blue"
                  title="Cetak SP Resmi 4 Rangkap"
                >
                  <Printer class="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        {/each}
      {/snippet}
    </DataTable>

  <!-- TAB 3: KONSINYASI MASUK -->
  {:else if activeTab === "konsinyasi"}
    <DataTable
      title="Manajemen Obat & Produk Konsinyasi (Titipan)"
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
        <th class="py-3 px-4">No. Tanda Terima</th>
        <th class="py-3 px-4">Konsinyor / Vendor</th>
        <th class="py-3 px-4">Nama Produk Titipan</th>
        <th class="py-3 px-4 text-center">Masuk</th>
        <th class="py-3 px-4 text-center">Laku</th>
        <th class="py-3 px-4 text-center">Sisa</th>
        <th class="py-3 px-4 text-right">Harga Setor</th>
        <th class="py-3 px-4 text-right">Harga Jual</th>
        <th class="py-3 px-4 text-right">Harus Disetor</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
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
              onchange={(val) => (newInvoicePoNumber = val)}
              options={[
                { value: "NONE", label: "Tanpa Referensi SP" },
                ...purchaseOrders.map((sp) => ({
                  value: sp.orderNumber,
                  label: `${sp.orderNumber} (${sp.orderType})`
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
            <label for="inv-branch" class="font-bold text-slate-700 block mb-1">Cabang Penerima</label>
            <Select
              id="inv-branch"
              value={newInvoiceBranchId}
              onchange={(val) => (newInvoiceBranchId = val)}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
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

        <!-- MULTI-ITEM GRID TABLE -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-slate-800 text-xs">Rincian Obat & Nomor Batch</h4>
            <button
              type="button"
              onclick={addNewInvoiceItem}
              class="px-2.5 py-1 rounded-lg bg-brand-blue-50 hover:bg-brand-blue-100 text-brand-blue-700 font-bold text-xs inline-flex items-center gap-1 transition-colors"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Tambah Obat</span>
            </button>
          </div>

          <div class="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th class="py-2.5 px-3">Nama Obat</th>
                  <th class="py-2.5 px-3 w-28">No. Batch</th>
                  <th class="py-2.5 px-3 w-28">Kadaluarsa (ED)</th>
                  <th class="py-2.5 px-3 w-16 text-center">Qty</th>
                  <th class="py-2.5 px-3 w-24 text-right">HNA (Rp)</th>
                  <th class="py-2.5 px-3 w-14 text-center">Disc%</th>
                  <th class="py-2.5 px-3 w-28 text-right">Subtotal</th>
                  <th class="py-2.5 px-2 w-8 text-center"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                {#each newInvoiceItems as item, idx}
                  <tr class="hover:bg-slate-50/50">
                    <td class="p-2">
                      <SearchableSelect
                        id={`inv-product-${idx}`}
                        bind:value={item.productName}
                        variant="default"
                        size="sm"
                        searchPlaceholder="Cari nama obat..."
                        options={products.map((p) => ({
                          value: p.name,
                          label: p.name
                        }))}
                      />
                    </td>
                    <td class="p-2">
                      <input
                        type="text"
                        bind:value={item.batchNo}
                        placeholder="Batch"
                        class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-xs uppercase"
                      />
                    </td>
                    <td class="p-2">
                      <input
                        type="date"
                        bind:value={item.expiredDate}
                        class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-xs"
                      />
                    </td>
                    <td class="p-2">
                      <input
                        type="number"
                        min="1"
                        bind:value={item.qty}
                        class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-center text-xs"
                      />
                    </td>
                    <td class="p-2">
                      <input
                        type="number"
                        min="0"
                        step="500"
                        bind:value={item.hna}
                        class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-right text-xs"
                      />
                    </td>
                    <td class="p-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        bind:value={item.disc1}
                        class="w-full bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-center text-xs"
                      />
                    </td>
                    <td class="p-2 text-right font-mono font-bold text-slate-900">
                      {formatRupiah(calcRowSubtotal(item))}
                    </td>
                    <td class="p-2 text-center">
                      <button
                        type="button"
                        onclick={() => removeInvoiceItem(idx)}
                        disabled={newInvoiceItems.length <= 1}
                        class="p-1 rounded text-slate-400 hover:text-brand-red-600 disabled:opacity-30"
                        title="Hapus baris"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                      </button>
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
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm"
        >
          Simpan Faktur
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
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
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
          <label for="sp-branch" class="font-bold text-slate-700 block mb-1">Cabang Pemesan</label>
          <Select
            id="sp-branch"
            value={newSpForm.branchId}
            onchange={(val) => (newSpForm.branchId = val)}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
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
          <div class="col-span-6">
            <label for="sp-item-prod" class="text-[11px] font-semibold text-slate-600 block mb-1">Nama Obat</label>
            <SearchableSelect
              id="sp-item-prod"
              value={draftSpProductName}
              onchange={(val) => (draftSpProductName = val)}
              searchPlaceholder="Cari nama obat..."
              options={products.map((p) => ({ value: p.name, label: p.name }))}
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
          <div class="col-span-3">
            <label for="sp-item-unit" class="text-[11px] font-semibold text-slate-600 block mb-1">Satuan</label>
            <Select
              id="sp-item-unit"
              value={draftSpUnit}
              onchange={(val) => (draftSpUnit = val)}
              options={["BOX", "BOTOL", "FLS", "STRIP"]}
            />
          </div>
          <div class="col-span-1">
            <button
              type="button"
              onclick={addDraftItemToSp}
              class="w-full py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold flex items-center justify-center"
              title="Tambah ke SP"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div class="divide-y divide-slate-200 bg-white rounded-xl border border-slate-200">
          {#each newSpForm.items as item, idx}
            <div class="px-3 py-2 flex items-center justify-between">
              <span class="font-bold text-slate-800">{idx + 1}. {item.productName}</span>
              <div class="flex items-center gap-3">
                <span class="font-mono font-bold text-brand-blue">{item.qty} {item.unit}</span>
                <button
                  type="button"
                  onclick={() => removeDraftItemFromSp(idx)}
                  class="text-slate-400 hover:text-red-600"
                  title="Hapus"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          {/each}
        </div>
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

<!-- MODAL CETAK SP RESMI 4 RANGKAP -->
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
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto text-xs">
      <div class="text-center border-b-2 border-slate-900 pb-3">
        <div class="font-black text-sm text-slate-900">SURAT PESANAN OBAT ({selectedSpForPrint.orderType})</div>
        <div class="font-mono font-bold text-brand-blue">Nomor: {selectedSpForPrint.orderNumber}</div>
      </div>

      <div class="space-y-1 text-slate-700">
        <div>Yang bertanda tangan di bawah ini:</div>
        <div>Nama Apoteker: <strong>{selectedSpForPrint.pharmacistName}</strong></div>
        <div>No. SIPA: <strong>{selectedSpForPrint.sipa}</strong></div>
        <div class="pt-1">Mengajukan pesanan obat kepada PBF: <strong>{selectedSpForPrint.supplierName}</strong></div>
      </div>

      <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between font-bold">
        <span>Total Item Dipesan: {selectedSpForPrint.totalItems} Jenis Obat</span>
        <span class="font-mono text-brand-blue">{formatRupiah(selectedSpForPrint.estimatedAmount)}</span>
      </div>

      <div class="flex justify-between items-end pt-4 text-[11px] text-slate-600">
        <div>Rangkap 4: (1) PBF, (2) BPOM/Dinkes, (3) Arsip Apotek</div>
        <div class="text-right">
          <div>Tasikmalaya, {selectedSpForPrint.orderDate}</div>
          <div class="font-bold text-slate-900 pt-8 underline">{selectedSpForPrint.pharmacistName}</div>
        </div>
      </div>

      <div class="border-t border-slate-100 pt-3 flex justify-end gap-2">
        <button
          type="button"
          onclick={() => (isPrintSpModalOpen = false)}
          class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold"
        >
          Tutup
        </button>
        <button
          type="button"
          onclick={() => {
            window.print();
            isPrintSpModalOpen = false;
          }}
          class="px-4 py-1.5 rounded-xl bg-brand-blue-700 text-white font-bold"
        >
          Cetak 4 Rangkap
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
        <div>
          <label for="ksn-sup" class="font-bold text-slate-700 block mb-1">Nama Vendor / Konsinyor</label>
          <input
            id="ksn-sup"
            type="text"
            bind:value={newKsnForm.supplierName}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
          />
        </div>
        <div>
          <label for="ksn-prod" class="font-bold text-slate-700 block mb-1">Nama Produk Titipan</label>
          <input
            id="ksn-prod"
            type="text"
            bind:value={newKsnForm.productName}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
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
