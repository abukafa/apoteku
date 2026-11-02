<script lang="ts">
  import { onMount } from "svelte";
  import {
    mockApi,
    type Product,
    type Branch,
    type Category,
    type Customer,
    type CashierShift,
    type CartItem,
    type PriceTier,
    type CheckoutResult
  } from "$lib/services/mock-api";
  import { calculateCartTotals, selectFefoBatches, EscPosBuilder } from "@apoteku/core";
  import {
    Search,
    Barcode,
    ShoppingCart,
    Trash2,
    Plus,
    Minus,
    ArrowLeft,
    Clock,
    User,
    Store,
    Printer,
    CheckCircle2,
    AlertCircle,
    X,
    CreditCard,
    DollarSign,
    QrCode,
    Sparkles,
    ShieldAlert
  } from "lucide-svelte";

  // Reactive state using Svelte 5 Runes
  let branches = $state<Branch[]>([]);
  let selectedBranchId = $state("1");
  let categories = $state<Category[]>([]);
  let selectedCategoryId = $state("cat-all");
  let customers = $state<Customer[]>([]);
  let selectedCustomerId = $state("cust-general");
  let activeShift = $state<CashierShift | null>(null);

  let searchQuery = $state("");
  let products = $state<Product[]>([]);
  let isLoading = $state(false);

  // Cart state
  let cart = $state<CartItem[]>([]);
  let invoiceDiscount = $state(0);
  let taxRate = $state(0); // 0 or 0.11 (PPN 11%)
  let selectedPaymentMethod = $state<"CASH" | "QRIS" | "DEBIT" | "TRANSFER">("CASH");
  let cashPaid = $state(0);

  // Modals
  let showCheckoutModal = $state(false);
  let showReceiptModal = $state(false);
  let lastCheckoutResult = $state<CheckoutResult | null>(null);
  let receiptTextPreview = $state("");

  // Derived state using Svelte 5 Runes
  let selectedBranch = $derived(
    branches.find((b) => b.id === selectedBranchId) || branches[0]
  );

  let selectedCustomer = $derived(
    customers.find((c) => c.id === selectedCustomerId) || customers[0]
  );

  let currentPriceTier = $derived<PriceTier>(
    selectedCustomer ? selectedCustomer.priceTier : "general"
  );

  let totals = $derived(
    calculateCartTotals(
      cart.map((i) => ({
        unitPrice: i.unitPrice,
        qty: i.quantity,
        discountPercent: i.discountPercent,
        discountAmount: i.discountAmount
      })),
      {
        taxRatePercent: taxRate,
        paidAmount: cashPaid,
        roundingStep: 100
      }
    )
  );

  let changeAmount = $derived(totals.changeAmount);

  // Load initial data
  onMount(async () => {
    isLoading = true;
    try {
      const [branchList, catList, custList, shift] = await Promise.all([
        mockApi.getBranches(),
        mockApi.getCategories(),
        mockApi.getCustomers(),
        mockApi.getCurrentShift(selectedBranchId)
      ]);
      branches = branchList;
      categories = catList;
      customers = custList;
      activeShift = shift;
      await fetchProducts();
    } finally {
      isLoading = false;
    }
  });

  async function fetchProducts() {
    isLoading = true;
    try {
      products = await mockApi.searchProducts({
        query: searchQuery,
        categoryId: selectedCategoryId,
        branchId: selectedBranchId
      });
    } finally {
      isLoading = false;
    }
  }

  function handleCategoryChange(catId: string) {
    selectedCategoryId = catId;
    fetchProducts();
  }

  function handleSearchInput() {
    fetchProducts();
  }

  function getDrugClassBadge(drugClass: string) {
    switch (drugClass) {
      case "ETHICAL":
        return { text: "Obat Keras (K)", bg: "bg-red-100 text-red-800 border-red-200" };
      case "LIMITED_OTC":
        return { text: "Bebas Terbatas (W)", bg: "bg-blue-100 text-blue-800 border-blue-200" };
      case "OTC":
        return { text: "Obat Bebas (G)", bg: "bg-emerald-100 text-emerald-800 border-emerald-200" };
      default:
        return { text: drugClass, bg: "bg-slate-100 text-slate-800 border-slate-200" };
    }
  }

  function getAvailableStock(product: Product): number {
    return product.batches.reduce((sum, b) => sum + b.stock, 0);
  }

  function addToCart(product: Product, unitIndex = 0) {
    const selectedUnitObj = product.units[unitIndex] || product.units[0];
    const unitPrice = selectedUnitObj.prices[currentPriceTier] || selectedUnitObj.prices.general;

    const existingIndex = cart.findIndex(
      (item) => item.productId === product.id && item.selectedUnit === selectedUnitObj.unit
    );

    // Calculate FEFO batch allocation preview
    const requestedQty = existingIndex >= 0 ? cart[existingIndex].quantity + 1 : 1;
    const batchAllocations = allocateBatches(product, requestedQty * selectedUnitObj.multiplier);

    if (existingIndex >= 0) {
      cart[existingIndex].quantity += 1;
      cart[existingIndex].subtotal = cart[existingIndex].quantity * cart[existingIndex].unitPrice;
      cart[existingIndex].batches = batchAllocations;
    } else {
      cart.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        selectedUnit: selectedUnitObj.unit,
        multiplier: selectedUnitObj.multiplier,
        priceTier: currentPriceTier,
        unitPrice,
        quantity: 1,
        discountPercent: 0,
        discountAmount: 0,
        subtotal: unitPrice,
        batches: batchAllocations
      });
    }
  }

  function allocateBatches(product: Product, requiredUnits: number) {
    const candidates = [...product.batches]
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
      .map((b) => ({
        batchId: b.id,
        batchNo: b.batchNumber,
        expiredDate: b.expiryDate,
        qtyBase: b.stock
      }));

    const result = selectFefoBatches(candidates, requiredUnits);
    return result.batches.map((b) => ({
      batchId: b.batchId,
      batchNumber: b.batchNo || "-",
      expiryDate: b.expiredDate || "-",
      quantity: b.allocatedQtyBase
    }));
  }

  function updateQuantity(index: number, delta: number) {
    const item = cart[index];
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      removeFromCart(index);
      return;
    }

    const product = products.find((p) => p.id === item.productId);
    if (product) {
      item.batches = allocateBatches(product, newQty * item.multiplier);
    }
    item.quantity = newQty;
    item.subtotal = newQty * item.unitPrice;
  }

  function removeFromCart(index: number) {
    cart.splice(index, 1);
  }

  function clearCart() {
    cart = [];
    invoiceDiscount = 0;
    cashPaid = 0;
  }

  function openCheckout() {
    cashPaid = totals.grandTotal;
    showCheckoutModal = true;
  }

  async function handleCheckoutSubmit() {
    if (cashPaid < totals.grandTotal && selectedPaymentMethod === "CASH") {
      alert("Jumlah uang tunai kurang dari total tagihan.");
      return;
    }

    const payload = {
      branchId: selectedBranchId,
      cashierId: activeShift?.cashierId || "usr-1",
      cashierName: activeShift?.cashierName || "Kasir Utama",
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      paymentMethod: selectedPaymentMethod,
      items: cart,
      subtotal: totals.subtotal,
      invoiceDiscount: totals.totalDiscount,
      taxAmount: totals.taxAmount,
      roundingAmount: totals.roundingDifference,
      grandTotal: totals.grandTotal,
      cashPaid,
      changeAmount
    };

    const result = await mockApi.checkoutSale(payload);
    lastCheckoutResult = result;
    showCheckoutModal = false;

    // Generate receipt preview string
    buildReceiptPreview(result);
    showReceiptModal = true;
    clearCart();
    await fetchProducts(); // Refresh stock
  }

  function buildReceiptPreview(res: CheckoutResult) {
    const p = res.payload;
    const lines = [
      "========================================",
      "          APOTEK HAFIDZ FARMA          ",
      `      ${selectedBranch?.name || "KOTA TASIKMALAYA"}      `,
      `Telp: ${selectedBranch?.phone || "-"}`,
      `SIA: ${selectedBranch?.sia || "-"}`,
      `Apoteker: ${selectedBranch?.pharmacistName || "-"}`,
      "========================================",
      `No. Faktur: ${res.invoiceNumber}`,
      `Waktu     : ${new Date(res.transactionTime).toLocaleString("id-ID")}`,
      `Kasir     : ${p.cashierName}`,
      `Pelanggan : ${p.customerName || "Umum"} (${p.items[0]?.priceTier?.toUpperCase() || "UMUM"})`,
      "----------------------------------------",
      ...p.items.map((i) => {
        const line1 = `${i.name.slice(0, 24)} (${i.selectedUnit})`;
        const line2 = `${i.quantity} x Rp ${i.unitPrice.toLocaleString("id-ID")} = Rp ${i.subtotal.toLocaleString("id-ID")}`;
        const batchInfo = i.batches.map((b) => ` [B:${b.batchNumber} ED:${b.expiryDate}]`).join("");
        return `${line1}\n  ${line2}\n  ${batchInfo}`;
      }),
      "----------------------------------------",
      `Subtotal       : Rp ${p.subtotal.toLocaleString("id-ID")}`,
      p.invoiceDiscount > 0 ? `Diskon Faktur  : -Rp ${p.invoiceDiscount.toLocaleString("id-ID")}` : "",
      p.taxAmount > 0 ? `PPN (11%)      : Rp ${p.taxAmount.toLocaleString("id-ID")}` : "",
      p.roundingAmount !== 0 ? `Pembulatan     : Rp ${p.roundingAmount.toLocaleString("id-ID")}` : "",
      "----------------------------------------",
      `TOTAL AKHIR    : Rp ${p.grandTotal.toLocaleString("id-ID")}`,
      `Pembayaran (${p.paymentMethod}): Rp ${p.cashPaid.toLocaleString("id-ID")}`,
      `Kembalian      : Rp ${p.changeAmount.toLocaleString("id-ID")}`,
      "========================================",
      "      Terima kasih atas kunjungan Anda  ",
      "           Semoga Lekas Sembuh          ",
      "        -- Ikhtiar Sehat Keluarga --    ",
      "========================================"
    ].filter(Boolean);

    receiptTextPreview = lines.join("\n");
  }
</script>

<svelte:head>
  <title>Kasir POS Farmasi — Apotek Hafidz Farma</title>
</svelte:head>

<div class="min-h-screen bg-slate-100 flex flex-col font-sans">
  <!-- POS TOPBAR -->
  <header class="bg-brand-blue text-white shadow-elevated px-4 py-2.5 flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <a href="/" class="p-1.5 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-1.5 text-xs text-white/90">
        <ArrowLeft class="w-4 h-4" />
        <span class="font-medium hidden sm:inline">Kembali</span>
      </a>
      <div class="h-6 w-px bg-white/20"></div>
      <div class="flex items-center gap-2">
        <img src="/img/heart.png" alt="Apoteku" class="w-6 h-6 object-contain" />
        <span class="font-bold text-sm tracking-wide">POS Farmasi Hafidz Farma</span>
      </div>
    </div>

    <!-- Branch & Shift Selector -->
    <div class="flex items-center gap-3 text-xs">
      <!-- Branch selector -->
      <div class="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-lg border border-white/20">
        <Store class="w-3.5 h-3.5 text-cyan-200" />
        <select
          bind:value={selectedBranchId}
          onchange={() => { fetchProducts(); }}
          class="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
        >
          {#each branches as b}
            <option value={b.id} class="text-slate-800">{b.name} ({b.code})</option>
          {/each}
        </select>
      </div>

      <!-- Shift Info -->
      <div class="hidden md:flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-lg border border-white/20">
        <Clock class="w-3.5 h-3.5 text-cyan-200" />
        <span>{activeShift?.cashierName || "Kasir"} ({activeShift?.shiftName || "Pagi"})</span>
      </div>

      <!-- Price Tier Badge -->
      <div class="bg-emerald-500 text-white font-bold px-2 py-0.5 rounded text-[11px] uppercase tracking-wider">
        Tier: {currentPriceTier}
      </div>
    </div>
  </header>

  <!-- MAIN POS LAYOUT: 2 COLUMNS (Catalog & Cart) -->
  <div class="flex-1 flex flex-col lg:flex-row overflow-hidden">
    <!-- LEFT: PRODUCT CATALOG (65%) -->
    <div class="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
      <!-- Search & Filters Bar -->
      <div class="bg-white p-3 rounded-xl border border-surface-border shadow-card flex flex-col sm:flex-row gap-3">
        <!-- Search input -->
        <div class="relative flex-1">
          <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            bind:value={searchQuery}
            oninput={handleSearchInput}
            placeholder="Cari obat (nama, kandungan aktif, barcode, SKU)... [Tekan F2]"
            class="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-surface-border focus:outline-none focus:ring-2 focus:ring-brand-blue-500/20 focus:border-brand-blue-500 bg-surface-base"
          />
        </div>

        <!-- Customer selection -->
        <div class="flex items-center gap-2">
          <User class="w-4 h-4 text-slate-400" />
          <select
            bind:value={selectedCustomerId}
            class="text-xs bg-surface-base border border-surface-border rounded-lg px-2.5 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-blue-500/20"
          >
            {#each customers as c}
              <option value={c.id}>
                {c.name} ({c.priceTier.toUpperCase()})
              </option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Categories Pills -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {#each categories as cat}
          <button
            onclick={() => handleCategoryChange(cat.id)}
            class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border {selectedCategoryId === cat.id ? 'bg-brand-blue text-white border-brand-blue shadow-sm' : 'bg-white text-slate-600 border-surface-border hover:bg-slate-50'}"
          >
            {cat.name}
          </button>
        {/each}
      </div>

      <!-- Product Grid -->
      {#if isLoading}
        <div class="flex-1 flex items-center justify-center py-20 text-slate-400">
          <div class="flex flex-col items-center gap-2">
            <div class="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin"></div>
            <span class="text-xs">Memuat katalog obat...</span>
          </div>
        </div>
      {:else if products.length === 0}
        <div class="flex-1 flex items-center justify-center py-20 text-slate-400">
          <div class="text-center">
            <AlertCircle class="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p class="text-sm font-medium">Obat tidak ditemukan</p>
            <p class="text-xs text-slate-400 mt-1">Coba kata kunci lain atau periksa kategori yang dipilih.</p>
          </div>
        </div>
      {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {#each products as prod}
            {@const badge = getDrugClassBadge(prod.drugClass)}
            {@const stock = getAvailableStock(prod)}
            {@const primaryUnit = prod.units[0]}
            {@const price = primaryUnit.prices[currentPriceTier] || primaryUnit.prices.general}

            <div class="bg-white rounded-xl border border-surface-border p-3 flex flex-col justify-between hover:border-brand-blue-400 hover:shadow-card transition-all">
              <div>
                <!-- Badge row -->
                <div class="flex items-center justify-between gap-1 mb-1.5">
                  <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded border {badge.bg}">
                    {badge.text}
                  </span>
                  <span class="text-[10px] font-mono font-medium {stock > 10 ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'} px-1.5 py-0.5 rounded">
                    Stok: {stock} {prod.baseUnit}
                  </span>
                </div>

                <!-- Product Name -->
                <h3 class="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
                  {prod.name}
                </h3>
                {#if prod.genericName}
                  <p class="text-[10px] text-slate-500 line-clamp-1 mt-0.5 italic">
                    {prod.genericName}
                  </p>
                {/if}

                <!-- SKU & Barcode -->
                <div class="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-1">
                  <span>SKU: {prod.sku}</span>
                </div>
              </div>

              <!-- Price & Unit Action Buttons -->
              <div class="mt-3 pt-2 border-t border-slate-100">
                <div class="flex items-baseline justify-between mb-2">
                  <span class="text-sm font-extrabold text-brand-blue">
                    Rp {price.toLocaleString("id-ID")}
                  </span>
                  <span class="text-[10px] text-slate-400">/{primaryUnit.unit}</span>
                </div>

                <!-- Multi-unit purchase buttons -->
                <div class="flex items-center gap-1">
                  {#each prod.units as u, uIdx}
                    {@const uPrice = u.prices[currentPriceTier] || u.prices.general}
                    <button
                      onclick={() => addToCart(prod, uIdx)}
                      class="flex-1 py-1 px-1.5 text-[11px] font-semibold rounded bg-brand-blue-50 text-brand-blue hover:bg-brand-blue hover:text-white border border-brand-blue-200 transition-colors text-center"
                      title="Beli per {u.unit} (Rp {uPrice.toLocaleString('id-ID')})"
                    >
                      + {u.unit}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- RIGHT: POS CART & TOTALS (35%) -->
    <div class="w-full lg:w-[420px] bg-white border-l border-surface-border flex flex-col shadow-card">
      <!-- Cart Header -->
      <div class="p-4 border-b border-surface-border flex items-center justify-between bg-slate-50">
        <div class="flex items-center gap-2">
          <ShoppingCart class="w-4 h-4 text-brand-blue" />
          <h2 class="text-sm font-bold text-slate-900">Keranjang Transaksi</h2>
          <span class="text-xs bg-brand-blue text-white font-bold px-1.5 py-0.5 rounded-full">
            {cart.reduce((s, i) => s + i.quantity, 0)}
          </span>
        </div>
        {#if cart.length > 0}
          <button
            onclick={clearCart}
            class="text-xs text-brand-red-500 hover:text-brand-red-700 flex items-center gap-1 font-medium"
          >
            <Trash2 class="w-3.5 h-3.5" />
            Batal
          </button>
        {/if}
      </div>

      <!-- Cart Item List -->
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        {#if cart.length === 0}
          <div class="h-full flex flex-col items-center justify-center text-slate-400 py-16">
            <ShoppingCart class="w-12 h-12 text-slate-200 mb-2" />
            <p class="text-xs font-medium">Keranjang masih kosong</p>
            <p class="text-[11px] text-slate-400 text-center max-w-[200px] mt-1">
              Pilih obat dari katalog di sebelah kiri untuk memulai transaksi.
            </p>
          </div>
        {:else}
          {#each cart as item, idx}
            <div class="bg-surface-base p-3 rounded-lg border border-surface-border space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <h4 class="text-xs font-bold text-slate-900 leading-snug">{item.name}</h4>
                  <div class="text-[10px] text-slate-500 mt-0.5">
                    Satuan: <span class="font-semibold text-slate-700">{item.selectedUnit}</span> (Isi {item.multiplier}) &bull; Rp {item.unitPrice.toLocaleString("id-ID")}
                  </div>
                </div>
                <button
                  onclick={() => removeFromCart(idx)}
                  class="text-slate-400 hover:text-brand-red-500 transition-colors"
                  aria-label="Hapus item"
                >
                  <X class="w-4 h-4" />
                </button>
              </div>

              <!-- FEFO Batches Pill -->
              {#if item.batches && item.batches.length > 0}
                <div class="flex flex-wrap gap-1 text-[9px]">
                  {#each item.batches as b}
                    <span class="bg-cyan-50 text-cyan-800 border border-cyan-200 px-1 py-0.5 rounded">
                      Batch {b.batchNumber} (ED: {b.expiryDate})
                    </span>
                  {/each}
                </div>
              {/if}

              <!-- Quantity Controls & Subtotal -->
              <div class="flex items-center justify-between pt-1">
                <div class="flex items-center gap-1 bg-white border border-surface-border rounded-md px-1 py-0.5">
                  <button
                    onclick={() => updateQuantity(idx, -1)}
                    class="p-1 hover:bg-slate-100 rounded text-slate-600"
                    aria-label="Kurangi"
                  >
                    <Minus class="w-3 h-3" />
                  </button>
                  <span class="w-8 text-center text-xs font-bold text-slate-800">{item.quantity}</span>
                  <button
                    onclick={() => updateQuantity(idx, 1)}
                    class="p-1 hover:bg-slate-100 rounded text-slate-600"
                    aria-label="Tambah"
                  >
                    <Plus class="w-3 h-3" />
                  </button>
                </div>

                <span class="text-xs font-extrabold text-brand-blue">
                  Rp {item.subtotal.toLocaleString("id-ID")}
                </span>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Cart Calculations Footer -->
      <div class="p-4 border-t border-surface-border bg-slate-50 space-y-2">
        <div class="flex justify-between text-xs text-slate-600">
          <span>Subtotal</span>
          <span class="font-medium">Rp {totals.subtotal.toLocaleString("id-ID")}</span>
        </div>

        {#if totals.taxAmount > 0}
          <div class="flex justify-between text-xs text-slate-600">
            <span>PPN (11%)</span>
            <span class="font-medium">Rp {totals.taxAmount.toLocaleString("id-ID")}</span>
          </div>
        {/if}

        {#if totals.roundingDifference !== 0}
          <div class="flex justify-between text-xs text-slate-600">
            <span>Pembulatan Kasir</span>
            <span class="font-medium">Rp {totals.roundingDifference.toLocaleString("id-ID")}</span>
          </div>
        {/if}

        <div class="flex justify-between items-baseline pt-2 border-t border-surface-border">
          <span class="text-xs font-bold text-slate-700">TOTAL BAYAR</span>
          <span class="text-lg font-black text-brand-blue">
            Rp {totals.grandTotal.toLocaleString("id-ID")}
          </span>
        </div>

        <!-- Checkout Action Button -->
        <button
          disabled={cart.length === 0}
          onclick={openCheckout}
          class="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm shadow-card flex items-center justify-center gap-2 transition-all mt-2"
        >
          <CreditCard class="w-4 h-4" />
          Proses Pembayaran [F8]
        </button>
      </div>
    </div>
  </div>
</div>

<!-- MODAL: PROSES CHECKOUT -->
{#if showCheckoutModal}
  <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-elevated space-y-4">
      <div class="flex items-center justify-between pb-2 border-b border-surface-border">
        <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
          <CreditCard class="w-5 h-5 text-brand-blue" />
          Pembayaran POS
        </h3>
        <button onclick={() => (showCheckoutModal = false)} class="text-slate-400 hover:text-slate-600">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Grand Total Highlight -->
      <div class="bg-brand-blue-50 p-4 rounded-xl text-center border border-brand-blue-200">
        <div class="text-xs text-brand-blue-700 font-medium">Total Yang Harus Dibayar</div>
        <div class="text-2xl font-black text-brand-blue mt-1">
          Rp {totals.grandTotal.toLocaleString("id-ID")}
        </div>
      </div>

      <!-- Payment Method Selector -->
      <div class="space-y-1.5">
        <span class="block text-xs font-bold text-slate-700">Metode Pembayaran</span>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            onclick={() => (selectedPaymentMethod = "CASH")}
            class="p-2.5 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 {selectedPaymentMethod === 'CASH' ? 'border-brand-blue bg-brand-blue text-white' : 'border-surface-border hover:bg-slate-50 text-slate-700'}"
          >
            <DollarSign class="w-4 h-4" />
            Tunai / Cash
          </button>
          <button
            type="button"
            onclick={() => (selectedPaymentMethod = "QRIS")}
            class="p-2.5 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 {selectedPaymentMethod === 'QRIS' ? 'border-brand-blue bg-brand-blue text-white' : 'border-surface-border hover:bg-slate-50 text-slate-700'}"
          >
            <QrCode class="w-4 h-4" />
            QRIS Dinamis
          </button>
        </div>
      </div>

      <!-- Cash Input -->
      {#if selectedPaymentMethod === "CASH"}
        <div class="space-y-1.5">
          <label for="cashPaidInput" class="text-xs font-bold text-slate-700">Uang Diterima (Rp)</label>
          <input
            id="cashPaidInput"
            type="number"
            bind:value={cashPaid}
            min={totals.grandTotal}
            class="w-full p-2.5 text-base font-bold rounded-lg border border-surface-border focus:ring-2 focus:ring-brand-blue-500/20 focus:outline-none"
          />

          <!-- Quick Cash Suggestions -->
          <div class="flex gap-1.5 pt-1">
            {#each [totals.grandTotal, Math.ceil(totals.grandTotal / 50000) * 50000, 100000, 200000] as amt}
              {#if amt >= totals.grandTotal}
                <button
                  type="button"
                  onclick={() => (cashPaid = amt)}
                  class="flex-1 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 rounded text-slate-700"
                >
                  {amt.toLocaleString("id-ID")}
                </button>
              {/if}
            {/each}
          </div>

          <!-- Change Calculation -->
          <div class="flex justify-between items-center text-sm font-bold pt-2 border-t border-slate-100">
            <span class="text-slate-600">Kembalian:</span>
            <span class="text-emerald-600 font-extrabold text-base">
              Rp {changeAmount.toLocaleString("id-ID")}
            </span>
          </div>
        </div>
      {/if}

      <!-- Submit Checkout Button -->
      <div class="flex items-center gap-2 pt-2">
        <button
          onclick={() => (showCheckoutModal = false)}
          class="flex-1 py-2 px-4 rounded-xl border border-surface-border text-slate-600 font-semibold text-xs hover:bg-slate-50"
        >
          Kembali
        </button>
        <button
          onclick={handleCheckoutSubmit}
          class="flex-1 py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-card flex items-center justify-center gap-1.5"
        >
          <CheckCircle2 class="w-4 h-4" />
          Konfirmasi & Cetak Nota
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL: STRUK PREVIEW (ESC/POS) -->
{#if showReceiptModal && lastCheckoutResult}
  <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-elevated space-y-4">
      <div class="flex items-center justify-between pb-2 border-b border-surface-border">
        <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
          <Printer class="w-5 h-5 text-emerald-600" />
          Nota Penjualan Sukses!
        </h3>
        <button onclick={() => (showReceiptModal = false)} class="text-slate-400 hover:text-slate-600">
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="bg-emerald-50 text-emerald-800 p-2.5 rounded-lg text-xs font-medium flex items-center gap-2">
        <CheckCircle2 class="w-4 h-4 text-emerald-600 flex-shrink-0" />
        <span>Faktur: <strong>{lastCheckoutResult.invoiceNumber}</strong> berhasil disimpan ke memory mock server!</span>
      </div>

      <!-- Thermal Receipt Box -->
      <div class="bg-slate-900 text-emerald-400 font-mono text-[11px] p-4 rounded-xl overflow-x-auto max-h-[350px] whitespace-pre shadow-inner">
        {receiptTextPreview}
      </div>

      <div class="flex items-center gap-2">
        <button
          onclick={() => { window.print(); }}
          class="flex-1 py-2 px-4 rounded-xl bg-brand-blue text-white font-bold text-xs shadow-card flex items-center justify-center gap-1.5 hover:bg-brand-blue-700"
        >
          <Printer class="w-4 h-4" />
          Cetak Thermal (58mm/80mm)
        </button>
        <button
          onclick={() => (showReceiptModal = false)}
          class="py-2 px-4 rounded-xl border border-surface-border text-slate-600 font-semibold text-xs hover:bg-slate-50"
        >
          Tutup
        </button>
      </div>
    </div>
  </div>
{/if}
