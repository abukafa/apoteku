<script lang="ts">
  import { onMount } from "svelte";
  import {
    ShoppingBag,
    Plus,
    FileText,
    Clock,
    DollarSign,
    CheckCircle2,
    AlertCircle,
    Calendar,
    Printer,
    Truck,
    Building2,
    ArrowUpRight,
    Trash2,
    UploadCloud,
    CreditCard,
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
  import { portal } from "$lib/actions/portal";

  // State
  let invoices = $state(procurementData.purchaseInvoices);
  let purchaseOrders = $state(procurementData.purchaseOrders);
  let consignments = $state(procurementData.consignments);
  let suppliers = $state(suppliersData);
  let products = $state(productsData);

  let activeTab = $state<"faktur" | "sp" | "konsinyasi">("faktur");
  let searchQuery = $state("");

  // Modals
  let isAddInvoiceModalOpen = $state(false);
  let isAddSpModalOpen = $state(false);
  let isPayDebtModalOpen = $state(false);
  let selectedInvoiceForPayment = $state<any>(null);
  let paymentAmount = $state(0);
  let paymentMethod = $state("TRANSFER_BCA");

  // New Invoice Form State (Multi-Item Grid)
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

  let newInvoiceSupplier = $state("PT. Kimia Farma Trading & Distribution");
  let newInvoiceNumber = $state("");
  let newInvoiceDate = $state(new Date().toISOString().split("T")[0]);
  let newInvoiceDueDate = $state(
    new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]
  );
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

  // Row Subtotal Calculator
  function calcRowSubtotal(item: InvoiceItemRow): number {
    const gross = (item.qty || 0) * (item.hna || 0);
    const afterDisc1 = gross * (1 - (item.disc1 || 0) / 100);
    const afterDisc2 = afterDisc1 * (1 - (item.disc2 || 0) / 100);
    return Math.round(afterDisc2);
  }

  // Totals Breakdown
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

  // Currency Formatter
  function formatRupiah(num: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(num);
  }

  // Filtered Invoices
  let filteredInvoices = $derived(
    invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.supplierName.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  // Metrics
  let totalPurchases = $derived(invoices.reduce((a, b) => a + b.totalAmount, 0));
  let totalUnpaidDebt = $derived(
    invoices.reduce((a, b) => a + (b.totalAmount - b.paidAmount), 0)
  );
  let totalConsignmentUnsettled = $derived(
    consignments.reduce((a, b) => a + b.unsettledAmount, 0)
  );

  function handleSaveNewInvoice() {
    if (!newInvoiceNumber.trim()) {
      alert("Harap masukkan nomor faktur PBF!");
      return;
    }

    const supplierObj = suppliers.find((s) => s.name === newInvoiceSupplier) || suppliers[0];
    const createdInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: newInvoiceNumber.trim().toUpperCase(),
      supplierId: supplierObj?.id || "sup-01",
      supplierName: newInvoiceSupplier,
      branchId: "1",
      branchName: "Apotek Hafidz Farma Pusat",
      invoiceDate: newInvoiceDate,
      dueDate: newInvoiceDueDate,
      totalAmount: invoiceGrandTotal,
      paidAmount: 0,
      status: "UNPAID",
      itemsCount: newInvoiceItems.length,
      taxPercent: newInvoiceTaxIncluded ? 11 : 0,
      notes: "Faktur pembelian PBF multi-item"
    };

    invoices.unshift(createdInvoice);
    isAddInvoiceModalOpen = false;

    // Reset Form
    newInvoiceNumber = "";
  }

  function openDebtPayment(inv: any) {
    selectedInvoiceForPayment = inv;
    paymentAmount = inv.totalAmount - inv.paidAmount;
    isPayDebtModalOpen = true;
  }

  function handleSavePayment() {
    if (!selectedInvoiceForPayment || paymentAmount <= 0) return;

    selectedInvoiceForPayment.paidAmount += paymentAmount;
    if (selectedInvoiceForPayment.paidAmount >= selectedInvoiceForPayment.totalAmount) {
      selectedInvoiceForPayment.status = "PAID";
    } else {
      selectedInvoiceForPayment.status = "PARTIAL";
    }

    isPayDebtModalOpen = false;
    selectedInvoiceForPayment = null;
  }
</script>

<svelte:head>
  <title>Riwayat Pembelian | Apoteku.com</title>
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
      subtext={`${invoices.length} Faktur PBF diterima`}
      icon={ShoppingBag}
      variant="brand"
    />
    <MetricCard
      title="Hutang Belum Lunas"
      value={formatRupiah(totalUnpaidDebt)}
      subtext="Termin kredit berjalan"
      icon={Clock}
      variant="warning"
    />
    <MetricCard
      title="Jatuh Tempo"
      value="2 Hari Lagi"
      subtext="PT. Mensa Binasukses (MBS)"
      icon={AlertCircle}
      variant="danger"
    />
    <MetricCard
      title="Konsinyasi"
      value={formatRupiah(totalConsignmentUnsettled)}
      subtext="2 Vendor konsinyasi aktif"
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
          {invoices.length}
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
          {purchaseOrders.length}
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
          {consignments.length}
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
            </td>
            <td class="py-3.5 px-4">
              <div class="font-bold text-slate-800">{inv.supplierName}</div>
              <div class="text-[11px] text-slate-400">{inv.branchName}</div>
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
            </td>
          </tr>
        {/each}
      {/snippet}
    </DataTable>

  <!-- TAB 2: SURAT PESANAN (SP) -->
  {:else if activeTab === "sp"}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 class="text-sm font-bold text-slate-800">Daftar Surat Pesanan (SP) Resmi Apotek</h3>
        <button
          type="button"
          onclick={() => (isAddSpModalOpen = true)}
          class="px-3 py-1.5 rounded-xl bg-brand-blue text-white text-xs font-bold hover:bg-brand-blue-700 transition-colors"
        >
          + SP Baru
        </button>
      </div>

      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-100">
              <th class="py-3 px-4">No. Surat Pesanan</th>
              <th class="py-3 px-4">Jenis SP</th>
              <th class="py-3 px-4">Distributor Dituju</th>
              <th class="py-3 px-4">Apoteker PJ & SIPA</th>
              <th class="py-3 px-4 text-center">Total Item</th>
              <th class="py-3 px-4 text-center">Status</th>
              <th class="py-3 px-4 text-center">Cetak</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
            {#each purchaseOrders as sp}
              <tr class="hover:bg-slate-50/50">
                <td class="py-3.5 px-4 font-mono font-bold text-slate-900">{sp.orderNumber}</td>
                <td class="py-3.5 px-4">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold {sp.orderType === 'PSIKOTROPIKA' ? 'bg-purple-100 text-purple-700' : sp.orderType === 'PREKURSOR' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}">
                    SP {sp.orderType}
                  </span>
                </td>
                <td class="py-3.5 px-4 font-bold text-slate-800">{sp.supplierName}</td>
                <td class="py-3.5 px-4">
                  <div class="font-bold text-slate-800">{sp.pharmacistName}</div>
                  <div class="text-[10px] text-slate-400">{sp.sipa}</div>
                </td>
                <td class="py-3.5 px-4 text-center font-bold text-slate-800">{sp.totalItems} Obat</td>
                <td class="py-3.5 px-4 text-center">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold {sp.status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-700' : sp.status === 'SENT' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}">
                    {sp.status}
                  </span>
                </td>
                <td class="py-3.5 px-4 text-center">
                  <button
                    type="button"
                    onclick={() => alert(`Mencetak Formulir 4 Rangkap untuk ${sp.orderNumber}`)}
                    class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-brand-blue"
                    title="Cetak SP Resmi 4 Rangkap"
                  >
                    <Printer class="w-4 h-4" />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

  <!-- TAB 3: KONSINYASI MASUK -->
  {:else if activeTab === "konsinyasi"}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Manajemen Obat & Produk Konsinyasi (Titipan)</h3>
          <p class="text-xs text-slate-500 mt-0.5">Pelunasan bagi hasil disetor ke konsinyor hanya untuk barang yang telah laku terjual di POS</p>
        </div>
      </div>

      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-100">
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
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
            {#each consignments as ksn}
              <tr class="hover:bg-slate-50/50">
                <td class="py-3.5 px-4 font-mono font-bold text-slate-900">{ksn.receiptNumber}</td>
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
                  <button
                    type="button"
                    onclick={() => alert(`Proses pelunasan setoran konsinyasi ${formatRupiah(ksn.unsettledAmount)} ke ${ksn.supplierName}`)}
                    class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] transition-colors"
                  >
                    Setor
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
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
              searchPlaceholder="Cari distributor PBF..."
              options={suppliers.map((s) => ({
                value: s.name,
                label: s.name,
                sublabel: `${s.code} • ${s.phone}`
              }))}
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
            <label for="inv-date" class="font-bold text-slate-700 block mb-1">Tanggal Faktur</label>
            <input
              id="inv-date"
              type="date"
              bind:value={newInvoiceDate}
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
                      <select
                        bind:value={item.productName}
                        class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-slate-800 text-xs"
                      >
                        {#each products as p}
                          <option value={p.name}>{p.name}</option>
                        {/each}
                      </select>
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
            <div>• Tanggal jatuh tempo akan memicu reminder otomatis pada H-3.</div>
            <div>• Nomor batch & kadaluarsa akan langsung terdaftar di sistem FEFO depo.</div>
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

<!-- MODAL BUAT SP -->
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
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
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

      <div class="space-y-3 text-xs">
        <div>
          <label for="sp-type" class="font-bold text-slate-700 block mb-1">Jenis Surat Pesanan</label>
          <Select
            id="sp-type"
            options={[
              "SP REGULER (Obat Bebas & Keras Non-Khusus)",
              "SP PREKURSOR FARMASI",
              "SP OBAT-OBAT TERTENTU (OOT)",
              "SP PSIKOTROPIKA (Khusus Apoteker)"
            ]}
          />
        </div>
        <div>
          <label for="sp-target" class="font-bold text-slate-700 block mb-1">Distributor PBF Dituju</label>
          <SearchableSelect
            id="sp-target"
            variant="default"
            searchPlaceholder="Cari distributor PBF..."
            options={suppliers.map((s) => ({
              value: s.name,
              label: s.name,
              sublabel: `${s.code} • ${s.phone}`
            }))}
          />
        </div>
        <div class="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-slate-600 space-y-1">
          <div class="font-bold text-brand-blue text-[11px]">Penanggung Jawab:</div>
          <div>Apoteker: <strong>apt. Hafidz Nurul, S.Farm.</strong></div>
          <div>SIPA: <strong>SIPA-503/044/Dinkes/2024</strong></div>
        </div>
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
          onclick={() => {
            isAddSpModalOpen = false;
            alert("Surat Pesanan (SP) berhasil dibuat dan siap dicetak 4 rangkap!");
          }}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm"
        >
          Terbitkan & Cetak SP
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL BUAT SP -->
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
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
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

      <div class="space-y-3 text-xs">
        <div>
          <label for="sp-type" class="font-bold text-slate-700 block mb-1">Jenis Surat Pesanan</label>
          <Select
            id="sp-type"
            options={[
              "SP REGULER (Obat Bebas & Keras Non-Khusus)",
              "SP PREKURSOR FARMASI",
              "SP OBAT-OBAT TERTENTU (OOT)",
              "SP PSIKOTROPIKA (Khusus Apoteker)"
            ]}
          />
        </div>
        <div>
          <label for="sp-target" class="font-bold text-slate-700 block mb-1">Distributor PBF Dituju</label>
          <SearchableSelect
            id="sp-target"
            variant="default"
            searchPlaceholder="Cari distributor PBF..."
            options={suppliers.map((s) => ({
              value: s.name,
              label: s.name,
              sublabel: `${s.code} • ${s.phone}`
            }))}
          />
        </div>
        <div class="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-slate-600 space-y-1">
          <div class="font-bold text-brand-blue text-[11px]">Penanggung Jawab:</div>
          <div>Apoteker: <strong>apt. Hafidz Nurul, S.Farm.</strong></div>
          <div>SIPA: <strong>SIPA-503/044/Dinkes/2024</strong></div>
        </div>
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
          onclick={() => {
            isAddSpModalOpen = false;
            alert("Surat Pesanan (SP) berhasil dibuat dan siap dicetak 4 rangkap!");
          }}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm"
        >
          Terbitkan & Cetak SP
        </button>
      </div>
    </div>
  </div>
{/if}
