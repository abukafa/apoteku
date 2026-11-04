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
  import { authStore } from "$lib/stores/authStore.svelte";
  import { portal } from "$lib/actions/portal";
  import Select from "$lib/components/ui/Select.svelte";
  import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
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
    ShieldAlert,
    Wifi,
    WifiOff,
    RefreshCw,
    Lock,
    KeyRound
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
  let productMap = $state(new Map<string, Product>());
  let isLoading = $state(false);

  // Cart state
  let cart = $state<CartItem[]>([]);
  let invoiceDiscount = $state(0);
  let taxRate = $state(0); // 0 or 0.11 (PPN 11%)
  let selectedPaymentMethod = $state<"CASH" | "QRIS" | "DEBIT" | "TRANSFER">("CASH");
  let cashPaid = $state(0);

  // QRIS Payment State
  let qrisStatus = $state<"WAITING" | "PAID" | "EXPIRED">("WAITING");
  let qrisRef = $state("");
  let qrisCountdown = $state(300);
  let qrisTimerInterval: any = null;

  function initQris() {
    qrisStatus = "WAITING";
    cashPaid = totals.grandTotal;
    qrisCountdown = 300;
    qrisRef = "QRIS-HF-" + Math.floor(100000 + Math.random() * 900000);

    if (qrisTimerInterval) clearInterval(qrisTimerInterval);
    qrisTimerInterval = setInterval(() => {
      if (qrisCountdown > 0 && qrisStatus === "WAITING") {
        qrisCountdown -= 1;
      } else if (qrisCountdown === 0 && qrisStatus === "WAITING") {
        qrisStatus = "EXPIRED";
        clearInterval(qrisTimerInterval);
      }
    }, 1000);
  }

  function simulateQrisSuccess() {
    qrisStatus = "PAID";
    cashPaid = totals.grandTotal;
    if (qrisTimerInterval) clearInterval(qrisTimerInterval);
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  // Modals
  let showCheckoutModal = $state(false);
  let showReceiptModal = $state(false);
  let lastCheckoutResult = $state<CheckoutResult | null>(null);
  let receiptTextPreview = $state("");

  // Offline Sync State
  let isOfflineSimulated = $state(false);
  let pendingSalesCount = $state(0);
  let isSyncing = $state(false);
  let syncFeedback = $state("");

  async function handleManualSync() {
    if (pendingSalesCount === 0) {
      syncFeedback = "Semua transaksi telah tersinkron!";
      setTimeout(() => (syncFeedback = ""), 3000);
      return;
    }
    isSyncing = true;
    syncFeedback = "Mengunggah data transaksi ke server cloud...";
    await new Promise((r) => setTimeout(r, 1200));
    isSyncing = false;
    const synced = pendingSalesCount;
    pendingSalesCount = 0;
    syncFeedback = `${synced} transaksi offline berhasil disinkronkan!`;
    setTimeout(() => (syncFeedback = ""), 4000);
  }

  // Shift Register State
  let isShiftModalOpen = $state(false);
  let shiftInitialCash = $state(200000);
  let shiftCashSales = $state(1450000);
  let shiftQrisSales = $state(820000);
  let shiftActualCash = $state(1650000);
  let shiftExpectedCash = $derived(shiftInitialCash + shiftCashSales);
  let shiftDiscrepancy = $derived(shiftActualCash - shiftExpectedCash);
  let shiftNotes = $state("");
  let shiftClosureSuccess = $state("");

  function handleCloseShift() {
    shiftClosureSuccess = "Shift kasir ditutup & Berita Acara dicetak!";
    setTimeout(() => {
      shiftClosureSuccess = "";
      isShiftModalOpen = false;
    }, 2000);
  }

  // Quick PIN Lock State
  let isTerminalLocked = $state(false);
  let pinInput = $state("");
  let pinError = $state(false);

  function enterPinDigit(digit: string) {
    if (pinInput.length < 6) {
      pinInput += digit;
      pinError = false;
      if (pinInput.length === 6) {
        verifyPin();
      }
    }
  }

  function clearPin() {
    pinInput = "";
    pinError = false;
  }

  function deletePinLast() {
    if (pinInput.length > 0) {
      pinInput = pinInput.slice(0, -1);
      pinError = false;
    }
  }

  function verifyPin() {
    // Default PIN is 123456 or any 6 digits for testing
    if (pinInput === "123456" || pinInput.length === 6) {
      isTerminalLocked = false;
      pinInput = "";
      pinError = false;
    } else {
      pinError = true;
      pinInput = "";
    }
  }

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
    if (authStore.user?.branchId) {
      selectedBranchId = authStore.user.branchId;
    }
    try {
      const [branchList, catList, custList, shift, allProds] = await Promise.all([
        mockApi.getBranches(),
        mockApi.getCategories(),
        mockApi.getCustomers(),
        mockApi.getCurrentShift(selectedBranchId),
        mockApi.searchProducts({ branchId: selectedBranchId })
      ]);
      branches = branchList;
      categories = catList;
      customers = custList;
      activeShift = shift;
      for (const p of allProds) {
        productMap.set(p.id, p);
      }
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
      for (const p of products) {
        productMap.set(p.id, p);
      }
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
    productMap.set(product.id, product);
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

  function updateItemUnit(index: number, newUnitName: string) {
    const item = cart[index];
    if (!item || item.selectedUnit === newUnitName) return;

    const product = productMap.get(item.productId) || products.find((p) => p.id === item.productId);
    if (!product) return;

    const unitObj = product.units.find((u) => u.unit === newUnitName) || product.units[0];
    const newUnitPrice = unitObj.prices[currentPriceTier] || unitObj.prices.general;

    // Cek jika produk dengan satuan baru ini sudah ada di baris keranjang lain
    const existingIndex = cart.findIndex(
      (it, i) => i !== index && it.productId === item.productId && it.selectedUnit === unitObj.unit
    );

    if (existingIndex >= 0) {
      // Gabungkan jumlah qty ke baris yang sudah ada
      cart[existingIndex].quantity += item.quantity;
      cart[existingIndex].subtotal = cart[existingIndex].quantity * cart[existingIndex].unitPrice;
      cart[existingIndex].batches = allocateBatches(
        product,
        cart[existingIndex].quantity * cart[existingIndex].multiplier
      );
      // Hapus baris yang diubah ini
      removeFromCart(index);
    } else {
      // Ubah satuan, harga, faktor pengali, dan alokasi batch FEFO baris saat ini
      item.selectedUnit = unitObj.unit;
      item.multiplier = unitObj.multiplier;
      item.unitPrice = newUnitPrice;
      item.subtotal = item.quantity * newUnitPrice;
      item.batches = allocateBatches(product, item.quantity * unitObj.multiplier);
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

    const product = productMap.get(item.productId) || products.find((p) => p.id === item.productId);
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
    selectedPaymentMethod = "CASH";
    qrisStatus = "WAITING";
    if (qrisTimerInterval) clearInterval(qrisTimerInterval);
    showCheckoutModal = true;
  }

  async function handleCheckoutSubmit() {
    if (selectedPaymentMethod === "CASH" && cashPaid < totals.grandTotal) {
      alert("Jumlah uang tunai kurang dari total tagihan.");
      return;
    }

    if (selectedPaymentMethod === "QRIS" && qrisStatus !== "PAID") {
      alert("Pembayaran QRIS belum terkonfirmasi oleh sistem perbankan. Silakan klik tombol 'Simulasikan Pembayaran Berhasil' untuk menguji alur nota.");
      return;
    }

    if (qrisTimerInterval) clearInterval(qrisTimerInterval);

    const payload = {
      branchId: selectedBranchId,
      cashierId: authStore.user?.id || activeShift?.cashierId || "usr-01",
      cashierName: authStore.user?.fullName || "Kasir Utama",
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      paymentMethod: selectedPaymentMethod,
      items: cart,
      subtotal: totals.subtotal,
      invoiceDiscount: totals.totalDiscount,
      taxAmount: totals.taxAmount,
      roundingAmount: totals.roundingDifference,
      grandTotal: totals.grandTotal,
      cashPaid: selectedPaymentMethod === "QRIS" ? totals.grandTotal : cashPaid,
      changeAmount: selectedPaymentMethod === "QRIS" ? 0 : changeAmount
    };

    const result = await mockApi.checkoutSale(payload);
    lastCheckoutResult = result;
    showCheckoutModal = false;

    if (isOfflineSimulated) {
      pendingSalesCount += 1;
    }

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
  <title>Kasir POS &bull; Hafidz Farma</title>
</svelte:head>

<div class="h-screen w-screen p-3 sm:p-4 bg-[#f0f4f9] flex flex-col overflow-hidden space-y-3">
  <!-- POS DEDICATED FULLSCREEN TOPBAR -->
  <header class="bg-white rounded-2xl px-4 py-2.5 border border-slate-100 shadow-sm flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
    <div class="flex items-center gap-3">
      <!-- Back to Admin / Penjualan Menu -->
      <a
        href="/penjualan"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all shadow-2xs"
        title="Keluar dari mode kasir layar penuh"
      >
        <ArrowLeft class="w-4 h-4 text-brand-blue" />
        <span class="hidden sm:inline">Kembali ke Penjualan</span>
        <span class="sm:hidden">Keluar</span>
      </a>

      <div class="h-5 w-px bg-slate-200"></div>

      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-blue-50 text-[#0c2e7a] flex items-center justify-center font-bold">
          <ShoppingCart class="w-4 h-4 text-[#1d63d8]" />
        </div>
        <div>
          <h1 class="text-xs sm:text-sm font-bold text-slate-900 leading-tight flex items-center gap-2">
            <span>Terminal Kasir POS Farmasi</span>
          </h1>
          <div class="text-[10px] text-slate-500 font-medium flex items-center gap-2">
            <span>Pintasan: <kbd class="bg-slate-100 px-1 py-0.5 rounded text-[9px] font-mono font-bold">F2: Cari</kbd> <kbd class="bg-slate-100 px-1 py-0.5 rounded text-[9px] font-mono font-bold">F8: Bayar</kbd></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Controls: Branch Selector, Shift info, Offline/Online Sync, Lock Terminal -->
    <div class="flex items-center gap-2 text-xs">
      <!-- Branch selector -->
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

      <!-- Shift Info (Clickable for Shift Close / Reconciliation) -->
      <button
        type="button"
        onclick={() => (isShiftModalOpen = true)}
        class="hidden md:flex items-center gap-1.5 bg-[#f4f7fb] hover:bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 transition-colors"
        title="Klik untuk rekonsiliasi & tutup shift kasir"
      >
        <Clock class="w-3.5 h-3.5 text-slate-500" />
        <span class="font-medium text-[11px]">{authStore.user?.fullName || activeShift?.cashierName || "Kasir"} ({activeShift?.shiftName || "Pagi"})</span>
      </button>

      <!-- Network / Offline Simulator Toggle -->
      <button
        type="button"
        onclick={() => (isOfflineSimulated = !isOfflineSimulated)}
        class="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all {isOfflineSimulated ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}"
        title="Simulasi Mode Offline (Dexie.js) / Cloud Online"
      >
        {#if isOfflineSimulated}
          <WifiOff class="w-3.5 h-3.5 text-amber-600" />
          <span>Offline (Lokal)</span>
        {:else}
          <Wifi class="w-3.5 h-3.5 text-emerald-600" />
          <span>Online</span>
        {/if}
      </button>

      <!-- Sync Queue Monitor -->
      {#if pendingSalesCount > 0 || isSyncing}
        <button
          type="button"
          onclick={handleManualSync}
          disabled={isSyncing}
          class="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-brand-blue-50 text-brand-blue-700 border border-brand-blue-200 hover:bg-brand-blue-100 transition-colors animate-pulse"
          title="Klik untuk sinkronisasi transaksi offline ke server"
        >
          <RefreshCw class="w-3.5 h-3.5 {isSyncing ? 'animate-spin' : ''}" />
          <span>Sinkron ({pendingSalesCount})</span>
        </button>
      {/if}

      <!-- Terminal Lock Screen Button -->
      <button
        type="button"
        onclick={() => (isTerminalLocked = true)}
        class="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors"
        title="Kunci Layar Terminal Kasir (PIN Quick Lock)"
      >
        <Lock class="w-3.5 h-3.5" />
      </button>
    </div>
  </header>

  <!-- MAIN POS LAYOUT: 2 COLUMNS (Catalog & Cart) -->
  <div class="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden min-h-0">
    <!-- LEFT: PRODUCT CATALOG (65%) -->
    <div class="flex-1 flex flex-col bg-white rounded-2xl border border-slate-100 shadow-sm p-4 overflow-hidden min-h-0">
      <!-- FIXED TOP CONTROLS: Search & Categories Pills (Never squished) -->
      <div class="flex-shrink-0 space-y-3 pb-3 border-b border-slate-100">
        <!-- Search & Customer Filter Bar -->
        <div class="bg-[#f8faff] p-2.5 sm:p-3 rounded-xl border border-blue-100/70 flex flex-col sm:flex-row gap-2.5">
          <!-- Search input -->
          <div class="relative flex-1">
            <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              bind:value={searchQuery}
              oninput={handleSearchInput}
              placeholder="Cari obat (nama, kandungan aktif, barcode, SKU)... [Tekan F2]"
              class="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#1d63d8] bg-white"
            />
          </div>

          <!-- Customer selection -->
          <SearchableSelect
            bind:value={selectedCustomerId}
            icon={User}
            variant="white"
            align="right"
            minMenuWidth={320}
            class="w-full sm:w-64 md:w-72"
            placeholder="Pilih Pelanggan..."
            searchPlaceholder="Cari nama, kode, no. HP, atau tier..."
            options={customers.map((c) => ({
              value: c.id,
              label: c.name,
              sublabel:
                c.phone && c.phone !== "-"
                  ? `${c.code} • ${c.phone} • ${c.address}`
                  : `Kode: ${c.code} (Pelanggan Reguler)`,
              badge: c.priceTier,
              badgeClass:
                c.priceTier === "wholesale"
                  ? "bg-purple-50 text-purple-700 border border-purple-200"
                  : c.priceTier === "member"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : c.priceTier === "prescription"
                      ? "bg-blue-50 text-[#1d63d8] border border-blue-200"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
            }))}
          />
        </div>

        <!-- Categories Pills (Always Visible, Never Shrink, Smooth Horizontal Scroll) -->
        <div class="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar flex-shrink-0 relative z-10 min-h-[42px]">
          {#each categories as cat}
            <button
              type="button"
              onclick={() => handleCategoryChange(cat.id)}
              class="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex-shrink-0 {selectedCategoryId === cat.id ? 'bg-[#0c2e7a] text-white border-[#0c2e7a] shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}"
            >
              {cat.name}
            </button>
          {/each}
        </div>
      </div>

      <!-- SCROLLABLE PRODUCT GRID CONTAINER (Only the products scroll) -->
      <div class="flex-1 min-h-0 overflow-y-auto pt-3 pr-1 scrollbar-minimalist">
        {#if isLoading}
          <div class="h-full flex items-center justify-center py-20 text-slate-400">
            <div class="flex flex-col items-center gap-2">
              <div class="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin"></div>
              <span class="text-xs">Memuat katalog obat...</span>
            </div>
          </div>
        {:else if products.length === 0}
          <div class="h-full flex items-center justify-center py-20 text-slate-400">
            <div class="text-center">
              <AlertCircle class="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p class="text-sm font-medium">Obat tidak ditemukan</p>
              <p class="text-xs text-slate-400 mt-1">Coba kata kunci lain atau periksa kategori yang dipilih.</p>
            </div>
          </div>
        {:else}
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
                      {badge.text.charAt(badge.text.length - 2)}
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
                        {u.unit}
                      </button>
                    {/each}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- RIGHT: POS CART & TOTALS (35%) -->
    <div class="w-full lg:w-[400px] xl:w-[430px] bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col overflow-hidden min-h-0">
      <!-- Cart Header (Fixed Top) -->
      <div class="p-4 border-b border-surface-border flex items-center justify-between bg-slate-50 flex-shrink-0">
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

      <!-- Cart Item List (Scrollable Area) -->
      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scrollbar-minimalist">
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
            {@const product = productMap.get(item.productId) || products.find((p) => p.id === item.productId)}
            <div class="bg-surface-base p-3 rounded-xl border border-surface-border space-y-2.5">
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <h4 class="text-xs font-bold text-slate-900 leading-snug truncate">{item.name}</h4>

                  <!-- Pilihan Satuan Interaktif (Bisa Diubah Langsung) -->
                  <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span class="text-[10px] font-semibold text-slate-500">Satuan:</span>
                    {#if product && product.units.length > 1}
                      <div class="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 gap-0.5">
                        {#each product.units as u}
                          <button
                            type="button"
                            onclick={() => updateItemUnit(idx, u.unit)}
                            class="px-2 py-0.5 rounded-md text-[10px] font-bold transition-all {item.selectedUnit === u.unit ? 'bg-brand-blue text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'}"
                            title="Ganti ke {u.unit} (Isi {u.multiplier}) - Rp {(u.prices[currentPriceTier] || u.prices.general).toLocaleString('id-ID')}"
                          >
                            {u.unit}
                          </button>
                        {/each}
                      </div>
                    {:else}
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                        {item.selectedUnit}
                      </span>
                    {/if}
                    <span class="text-[10px] text-slate-500 font-mono">
                      &bull; Rp {item.unitPrice.toLocaleString("id-ID")}/{item.selectedUnit}
                    </span>
                  </div>
                </div>

                <!-- Tombol Hapus Item -->
                <button
                  type="button"
                  onclick={() => removeFromCart(idx)}
                  class="text-slate-400 hover:text-brand-red-500 transition-colors p-1 rounded-lg hover:bg-red-50 flex-shrink-0"
                  aria-label="Hapus item"
                  title="Hapus dari keranjang"
                >
                  <X class="w-4 h-4" />
                </button>
              </div>

              <!-- FEFO Batches Pill -->
              {#if item.batches && item.batches.length > 0}
                <div class="flex flex-wrap gap-1 text-[9px]">
                  {#each item.batches as b}
                    <span class="bg-cyan-50 text-cyan-800 border border-cyan-200 px-1.5 py-0.5 rounded font-mono">
                      Batch {b.batchNumber} (ED: {b.expiryDate})
                    </span>
                  {/each}
                </div>
              {/if}

              <!-- Quantity Controls & Subtotal -->
              <div class="flex items-center justify-between pt-1 border-t border-slate-100">
                <div class="flex items-center gap-1 bg-white border border-surface-border rounded-lg px-1.5 py-0.5 shadow-2xs">
                  <button
                    type="button"
                    onclick={() => updateQuantity(idx, -1)}
                    class="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors"
                    aria-label="Kurangi"
                  >
                    <Minus class="w-3 h-3" />
                  </button>
                  <span class="w-8 text-center text-xs font-bold text-slate-800">{item.quantity}</span>
                  <button
                    type="button"
                    onclick={() => updateQuantity(idx, 1)}
                    class="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors"
                    aria-label="Tambah"
                  >
                    <Plus class="w-3 h-3" />
                  </button>
                </div>

                <div class="text-right">
                  <div class="text-xs font-extrabold text-brand-blue font-mono">
                    Rp {item.subtotal.toLocaleString("id-ID")}
                  </div>
                  <div class="text-[9px] text-slate-400 font-mono">
                    Total: {item.quantity * item.multiplier} {product?.baseUnit || "Pcs"}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Cart Calculations Footer (Fixed Bottom) -->
      <div class="p-4 border-t border-surface-border bg-slate-50 space-y-2 flex-shrink-0">
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
          Proses Pembayaran
        </button>
      </div>
    </div>
  </div>
</div>

<!-- MODAL: PROSES CHECKOUT -->
{#if showCheckoutModal}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) showCheckoutModal = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 space-y-4 my-auto">
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
            onclick={() => {
              selectedPaymentMethod = "CASH";
              if (qrisTimerInterval) clearInterval(qrisTimerInterval);
            }}
            class="p-2.5 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 {selectedPaymentMethod === 'CASH' ? 'border-brand-blue bg-brand-blue text-white shadow-2xs' : 'border-surface-border hover:bg-slate-50 text-slate-700'}"
          >
            <DollarSign class="w-4 h-4" />
            Tunai / Cash
          </button>
          <button
            type="button"
            onclick={() => {
              selectedPaymentMethod = "QRIS";
              initQris();
            }}
            class="p-2.5 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 {selectedPaymentMethod === 'QRIS' ? 'border-brand-blue bg-brand-blue text-white shadow-2xs' : 'border-surface-border hover:bg-slate-50 text-slate-700'}"
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
      {:else if selectedPaymentMethod === "QRIS"}
        <!-- QRIS DYNAMIC DISPLAY & SIMULATOR -->
        <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center space-y-3 animate-in fade-in duration-150">
          <!-- QRIS Header Banner -->
          <div class="flex items-center justify-between pb-2 border-b border-slate-200 text-[11px]">
            <div class="flex items-center gap-1.5 font-black tracking-tight text-slate-800">
              <span class="bg-red-600 text-white font-black px-1.5 py-0.5 rounded text-[10px]">QRIS</span>
              <span class="text-slate-600 font-bold">GPN</span>
            </div>
            <div class="font-mono text-[10px] text-slate-500">
              NMID: ID1020251027001
            </div>
          </div>

          <div class="text-xs font-bold text-slate-800">
            {selectedBranch?.name || "Apotek Hafidz Farma"}
          </div>

          <!-- Dummy QR Code SVG Graphic with Status Overlay -->
          <div class="relative mx-auto w-44 h-44 bg-white p-2.5 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center">
            {#if qrisStatus === "PAID"}
              <!-- Verified Payment Badge Overlay -->
              <div class="absolute inset-0 bg-emerald-600/95 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center text-white p-3 animate-in zoom-in-95 duration-150 z-20">
                <CheckCircle2 class="w-10 h-10 mb-1 animate-bounce" />
                <span class="font-black text-xs sm:text-sm">PEMBAYARAN DITERIMA</span>
                <span class="text-[10px] opacity-90 font-mono mt-0.5">m-Banking / QRIS Dinamis</span>
                <span class="text-[10px] font-bold bg-white/20 px-2.5 py-0.5 rounded-full mt-2 font-mono">
                  Rp {totals.grandTotal.toLocaleString("id-ID")}
                </span>
              </div>
            {:else if qrisStatus === "EXPIRED"}
              <!-- Expired QR Code Overlay -->
              <div class="absolute inset-0 bg-slate-900/90 rounded-2xl flex flex-col items-center justify-center text-white p-3 z-20">
                <AlertCircle class="w-8 h-8 text-brand-red-500 mb-1" />
                <span class="font-bold text-xs">QRIS Kadaluarsa</span>
                <button
                  type="button"
                  onclick={initQris}
                  class="mt-2 px-3 py-1 bg-white text-slate-900 rounded-lg text-[11px] font-bold hover:bg-slate-100"
                >
                  Perbarui QR
                </button>
              </div>
            {/if}

            <!-- Authentic QR Vector Graphic (2D Matrix Pattern) -->
            <svg viewBox="0 0 100 100" class="w-full h-full text-slate-900">
              <!-- Top-Left Finder Square -->
              <rect x="5" y="5" width="26" height="26" fill="none" stroke="currentColor" stroke-width="4" rx="2" />
              <rect x="11" y="11" width="14" height="14" fill="currentColor" rx="1" />

              <!-- Top-Right Finder Square -->
              <rect x="69" y="5" width="26" height="26" fill="none" stroke="currentColor" stroke-width="4" rx="2" />
              <rect x="75" y="11" width="14" height="14" fill="currentColor" rx="1" />

              <!-- Bottom-Left Finder Square -->
              <rect x="5" y="69" width="26" height="26" fill="none" stroke="currentColor" stroke-width="4" rx="2" />
              <rect x="11" y="75" width="14" height="14" fill="currentColor" rx="1" />

              <!-- Center Alignment Pattern -->
              <rect x="42" y="42" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" rx="1" />
              <rect x="46" y="46" width="8" height="8" fill="currentColor" />

              <!-- High-Density Matrix Dots -->
              <rect x="36" y="8" width="5" height="5" fill="currentColor" />
              <rect x="46" y="8" width="5" height="5" fill="currentColor" />
              <rect x="56" y="8" width="5" height="5" fill="currentColor" />
              <rect x="36" y="18" width="5" height="5" fill="currentColor" />
              <rect x="56" y="18" width="5" height="5" fill="currentColor" />
              <rect x="36" y="28" width="5" height="5" fill="currentColor" />
              <rect x="46" y="28" width="5" height="5" fill="currentColor" />
              
              <rect x="8" y="36" width="5" height="5" fill="currentColor" />
              <rect x="18" y="36" width="5" height="5" fill="currentColor" />
              <rect x="28" y="36" width="5" height="5" fill="currentColor" />
              <rect x="8" y="46" width="5" height="5" fill="currentColor" />
              <rect x="28" y="46" width="5" height="5" fill="currentColor" />
              <rect x="8" y="56" width="5" height="5" fill="currentColor" />
              <rect x="18" y="56" width="5" height="5" fill="currentColor" />

              <rect x="69" y="36" width="5" height="5" fill="currentColor" />
              <rect x="79" y="36" width="5" height="5" fill="currentColor" />
              <rect x="89" y="36" width="5" height="5" fill="currentColor" />
              <rect x="69" y="46" width="5" height="5" fill="currentColor" />
              <rect x="89" y="46" width="5" height="5" fill="currentColor" />
              <rect x="69" y="56" width="5" height="5" fill="currentColor" />
              <rect x="79" y="56" width="5" height="5" fill="currentColor" />

              <rect x="36" y="69" width="5" height="5" fill="currentColor" />
              <rect x="46" y="69" width="5" height="5" fill="currentColor" />
              <rect x="56" y="69" width="5" height="5" fill="currentColor" />
              <rect x="69" y="69" width="5" height="5" fill="currentColor" />
              <rect x="79" y="69" width="5" height="5" fill="currentColor" />
              <rect x="89" y="69" width="5" height="5" fill="currentColor" />
              <rect x="46" y="79" width="5" height="5" fill="currentColor" />
              <rect x="69" y="79" width="5" height="5" fill="currentColor" />
              <rect x="89" y="79" width="5" height="5" fill="currentColor" />
              <rect x="36" y="89" width="5" height="5" fill="currentColor" />
              <rect x="56" y="89" width="5" height="5" fill="currentColor" />
              <rect x="79" y="89" width="5" height="5" fill="currentColor" />
            </svg>
          </div>

          <!-- Reference & Countdown Timer -->
          <div class="flex items-center justify-between text-[11px] text-slate-500 font-mono px-1">
            <span>Ref: {qrisRef}</span>
            <span class="flex items-center gap-1 font-bold {qrisCountdown < 60 ? 'text-brand-red-600' : 'text-slate-700'}">
              <Clock class="w-3.5 h-3.5" />
              {formatTime(qrisCountdown)}
            </span>
          </div>

          <!-- Real-Time Interactive Simulator -->
          {#if qrisStatus === "WAITING"}
            <div class="pt-1 space-y-1.5">
              <div class="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                <span>Menunggu scan aplikasi perbankan pelanggan...</span>
              </div>
              <button
                type="button"
                onclick={simulateQrisSuccess}
                class="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-98"
              >
                <Sparkles class="w-3.5 h-3.5" />
                <span>Simulasikan Pembayaran Berhasil (Scan/Webhook)</span>
              </button>
            </div>
          {:else if qrisStatus === "PAID"}
            <div class="p-2 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border border-emerald-200">
              <CheckCircle2 class="w-4 h-4 text-emerald-600" />
              <span>Pembayaran terverifikasi. Siap cetak nota kasir!</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Submit Checkout Button -->
      <div class="flex items-center gap-2 pt-2">
        <button
          onclick={() => (showCheckoutModal = false)}
          class="flex-1 py-2.5 px-4 rounded-xl border border-surface-border text-slate-600 font-semibold text-xs hover:bg-slate-50"
        >
          Kembali
        </button>
        <button
          onclick={handleCheckoutSubmit}
          class="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs shadow-card flex items-center justify-center gap-1.5 transition-all {selectedPaymentMethod === 'QRIS' && qrisStatus !== 'PAID' ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}"
        >
          <CheckCircle2 class="w-4 h-4" />
          <span>{selectedPaymentMethod === 'QRIS' && qrisStatus === 'PAID' ? 'Cetak Nota' : 'Cetak Nota'}</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL: STRUK PREVIEW (ESC/POS) -->
{#if showReceiptModal && lastCheckoutResult}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) showReceiptModal = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 space-y-4 my-auto">
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

<!-- MODAL: REKONSILIASI & TUTUP SHIFT KASIR -->
{#if isShiftModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isShiftModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 space-y-4 my-auto">
      <div class="flex items-center justify-between pb-2 border-b border-slate-100">
        <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Clock class="w-4 h-4 text-brand-blue" />
          <span>Rekonsiliasi & Tutup Shift Kasir</span>
        </h3>
        <button onclick={() => (isShiftModalOpen = false)} class="text-slate-400 hover:text-slate-600">
          <X class="w-5 h-5" />
        </button>
      </div>

      {#if shiftClosureSuccess}
        <div class="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200 flex items-center gap-2">
          <CheckCircle2 class="w-4 h-4 text-emerald-600" />
          <span>{shiftClosureSuccess}</span>
        </div>
      {:else}
        <div class="space-y-3 text-xs">
          <!-- Shift Overview -->
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5">
            <div class="flex justify-between text-slate-600">
              <span>Kasir Bertugas:</span>
              <strong class="text-slate-800">{authStore.user?.fullName || "Kasir Utama"}</strong>
            </div>
            <div class="flex justify-between text-slate-600">
              <span>Waktu Buka Shift:</span>
              <span class="font-mono">Hari ini, 07:00 WIB</span>
            </div>
          </div>

          <!-- Cash & Digital Summary -->
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
            <div class="flex justify-between text-slate-600">
              <span>Modal Awal Kas:</span>
              <span class="font-mono font-bold">Rp {shiftInitialCash.toLocaleString("id-ID")}</span>
            </div>
            <div class="flex justify-between text-slate-600">
              <span>Penjualan Tunai:</span>
              <span class="font-mono font-bold text-emerald-600">+ Rp {shiftCashSales.toLocaleString("id-ID")}</span>
            </div>
            <div class="flex justify-between text-slate-600">
              <span>Penjualan Non-Tunai / QRIS:</span>
              <span class="font-mono text-slate-500">Rp {shiftQrisSales.toLocaleString("id-ID")}</span>
            </div>
            <div class="flex justify-between text-slate-800 pt-2 border-t border-slate-200 font-bold">
              <span>Target Kas di Laci:</span>
              <span class="font-mono text-brand-blue">Rp {shiftExpectedCash.toLocaleString("id-ID")}</span>
            </div>
          </div>

          <!-- Physical Cash Count Input -->
          <div>
            <label for="shift-actual" class="font-bold text-slate-700 block mb-1">
              Fisik Kas Aktual di Laci (Rp)
            </label>
            <input
              id="shift-actual"
              type="number"
              bind:value={shiftActualCash}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 text-sm"
            />
          </div>

          <!-- Discrepancy indicator -->
          <div class="p-2.5 rounded-xl border text-xs font-bold flex justify-between items-center {shiftDiscrepancy === 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : shiftDiscrepancy > 0 ? 'bg-blue-50 text-brand-blue border-blue-200' : 'bg-red-50 text-brand-red-600 border-red-200'}">
            <span>Selisih Kas Fisik:</span>
            <span class="font-mono">
              {shiftDiscrepancy === 0 ? 'Seimbang (Rp 0)' : (shiftDiscrepancy > 0 ? `Lebih Rp ${shiftDiscrepancy.toLocaleString('id-ID')}` : `Kurang Rp ${Math.abs(shiftDiscrepancy).toLocaleString('id-ID')}`)}
            </span>
          </div>

          <!-- Shift Handover Notes -->
          <div>
            <label for="shift-notes" class="font-bold text-slate-700 block mb-1">Catatan Serah Terima (Opsional)</label>
            <input
              id="shift-notes"
              type="text"
              bind:value={shiftNotes}
              placeholder="Contoh: Uang koin 500 habis..."
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs"
            />
          </div>
        </div>

        <div class="border-t border-slate-100 pt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onclick={() => (isShiftModalOpen = false)}
            class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            onclick={handleCloseShift}
            class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm"
          >
            Tutup Shift & Cetak Berita Acara
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- MODAL: PIN QUICK LOCK SCREEN (TERMINAL KASIR) -->
{#if isTerminalLocked}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-slate-900/95 backdrop-blur-xl z-[120] flex items-center justify-center overflow-y-auto w-screen h-screen"
    role="dialog"
    aria-label="Kunci Terminal Kasir"
  >
    <div class="bg-white/10 border border-white/20 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center text-white space-y-5 shadow-2xl backdrop-blur-2xl">
      <!-- Lock Avatar -->
      <div class="w-16 h-16 rounded-full bg-gradient-to-tr from-brand-red-600 to-brand-blue-600 mx-auto flex items-center justify-center shadow-lg border border-white/30">
        <Lock class="w-7 h-7 text-white" />
      </div>

      <div>
        <h3 class="text-base font-bold tracking-tight">Terminal Kasir Terkunci</h3>
        <p class="text-xs text-slate-300 mt-1">Masukkan 6-digit PIN kasir untuk melanjutkan</p>
      </div>

      <!-- PIN Indicator Dots -->
      <div class="flex items-center justify-center gap-3 py-2">
        {#each [0, 1, 2, 3, 4, 5] as i}
          <div class="w-3.5 h-3.5 rounded-full transition-all duration-150 {i < pinInput.length ? 'bg-white scale-110 shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-white/20 border border-white/30'}"></div>
        {/each}
      </div>

      {#if pinError}
        <div class="text-xs font-bold text-rose-300 bg-rose-500/20 py-1.5 px-3 rounded-xl border border-rose-400/30">
          PIN tidak sesuai! Silakan coba lagi.
        </div>
      {/if}

      <!-- Keypad -->
      <div class="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto text-base font-bold">
        {#each ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as d}
          <button
            type="button"
            onclick={() => enterPinDigit(d)}
            class="h-12 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/15 transition-all text-white flex items-center justify-center shadow-xs"
          >
            {d}
          </button>
        {/each}
        <button
          type="button"
          onclick={clearPin}
          class="h-12 rounded-2xl bg-white/5 hover:bg-white/15 text-slate-300 text-xs font-bold transition-all"
        >
          Reset
        </button>
        <button
          type="button"
          onclick={() => enterPinDigit("0")}
          class="h-12 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/15 transition-all text-white flex items-center justify-center shadow-xs"
        >
          0
        </button>
        <button
          type="button"
          onclick={deletePinLast}
          class="h-12 rounded-2xl bg-white/5 hover:bg-white/15 text-slate-300 text-xs font-bold transition-all"
        >
          Hapus
        </button>
      </div>

      <div class="text-[11px] text-slate-400 pt-2 border-t border-white/10">
        Default PIN demo: <code class="font-mono text-white bg-white/10 px-1.5 py-0.5 rounded">123456</code>
      </div>
    </div>
  </div>
{/if}
