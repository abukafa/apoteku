<script lang="ts">
  import {
    Pill,
    ShoppingCart,
    Package,
    Users,
    ArrowUpRight,
    AlertTriangle
  } from "lucide-svelte";

  interface Props {
    salesToday?: string;
    salesTrend?: string;
    totalTransactions?: string;
    transactionTrend?: string;
    lowStockCount?: string;
    newCustomers?: string;
    customerTrend?: string;
  }

  let {
    salesToday = "Rp 0",
    salesTrend = "0% dari kemarin",
    totalTransactions = "0",
    transactionTrend = "Transaksi tercatat",
    lowStockCount = "0 item",
    newCustomers = "0",
    customerTrend = "Pelanggan terdaftar"
  }: Props = $props();
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
  <!-- CARD 1: TOTAL PENJUALAN HARI INI -->
  <div class="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
    <div class="w-12 h-12 rounded-full bg-[#1d63d8] text-white flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-500/20">
      <Pill class="w-6 h-6 rotate-45" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="text-xs font-semibold text-slate-500 truncate">Total Penjualan Hari Ini</div>
      <div class="text-lg sm:text-xl font-black text-slate-900 mt-0.5 tracking-tight truncate">
        {salesToday}
      </div>
      <div class="text-[11px] font-semibold text-emerald-600 flex items-center gap-0.5 mt-1">
        <ArrowUpRight class="w-3.5 h-3.5" />
        <span>{salesTrend}</span>
      </div>
    </div>
  </div>

  <!-- CARD 2: JUMLAH TRANSAKSI -->
  <div class="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
    <div class="w-12 h-12 rounded-full bg-[#df1c2d] text-white flex items-center justify-center flex-shrink-0 shadow-sm shadow-red-500/20">
      <ShoppingCart class="w-6 h-6" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="text-xs font-semibold text-slate-500 truncate">Jumlah Transaksi</div>
      <div class="text-lg sm:text-xl font-black text-slate-900 mt-0.5 tracking-tight">
        {totalTransactions}
      </div>
      <div class="text-[11px] font-semibold text-emerald-600 flex items-center gap-0.5 mt-1">
        <ArrowUpRight class="w-3.5 h-3.5" />
        <span>{transactionTrend}</span>
      </div>
    </div>
  </div>

  <!-- CARD 3: STOK MENIPIS -->
  <div class="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
    <div class="w-12 h-12 rounded-full bg-[#f59e0b] text-white flex items-center justify-center flex-shrink-0 shadow-sm shadow-amber-500/20">
      <Package class="w-6 h-6" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="text-xs font-semibold text-slate-500 truncate">Stok Menipis</div>
      <div class="text-lg sm:text-xl font-black text-slate-900 mt-0.5 tracking-tight">
        {lowStockCount}
      </div>
      <a href="/stok" class="text-[11px] font-bold text-[#df1c2d] flex items-center gap-1 mt-1 hover:underline">
        <AlertTriangle class="w-3.5 h-3.5" />
        <span>Lihat Detail</span>
      </a>
    </div>
  </div>

  <!-- CARD 4: PELANGGAN BARU -->
  <div class="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
    <div class="w-12 h-12 rounded-full bg-[#10b981] text-white flex items-center justify-center flex-shrink-0 shadow-sm shadow-emerald-500/20">
      <Users class="w-6 h-6" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="text-xs font-semibold text-slate-500 truncate">Pelanggan Terdaftar</div>
      <div class="text-lg sm:text-xl font-black text-slate-900 mt-0.5 tracking-tight">
        {newCustomers}
      </div>
      <div class="text-[11px] font-semibold text-emerald-600 flex items-center gap-0.5 mt-1">
        <ArrowUpRight class="w-3.5 h-3.5" />
        <span>{customerTrend}</span>
      </div>
    </div>
  </div>
</div>
