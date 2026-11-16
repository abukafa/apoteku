<script lang="ts">
  import { ArrowLeftRight, ArrowRight } from "lucide-svelte";
  import { onMount } from "svelte";
  import { api } from "$lib/services/api";

  interface TransactionItem {
    no: string;
    time: string;
    customer: string;
    total: number;
    method: string;
    badge: string;
  }

  interface Props {
    recentTransactions?: any[];
  }

  let { recentTransactions }: Props = $props();

  let transactions = $state<TransactionItem[]>([]);
  let isLoading = $state(true);

  function mapSale(s: any): TransactionItem {
    const rawTime = s.createdAt || s.transactionTime;
    const d = rawTime ? new Date(rawTime) : null;
    const dateStr = d && !isNaN(d.getTime())
      ? d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "-";

    const customer = s.patientName || s.customerName || (s.customerType === "MEMBER" ? "Member" : "Umum");
    const method = s.paymentMethod === "CASH"
      ? "Tunai"
      : s.paymentMethod === "QRIS"
        ? "QRIS"
        : s.paymentMethod === "TEMPO"
          ? "Tempo"
          : s.paymentMethod === "RESEP"
            ? "Resep"
            : (s.paymentMethod || "Non Tunai");

    const badge = s.paymentMethod === "CASH"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s.paymentMethod === "QRIS"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : s.paymentMethod === "TEMPO"
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-purple-50 text-purple-700 border-purple-200";

    return {
      no: s.invoiceNo || s.invoiceNumber || "-",
      time: dateStr,
      customer,
      total: Number(s.grandTotal || 0),
      method,
      badge
    };
  }

  $effect(() => {
    if (Array.isArray(recentTransactions) && recentTransactions.length > 0) {
      transactions = recentTransactions.map(mapSale);
      isLoading = false;
    }
  });

  onMount(async () => {
    if (Array.isArray(recentTransactions) && recentTransactions.length > 0) {
      transactions = recentTransactions.map(mapSale);
      isLoading = false;
      return;
    }
    try {
      const res = await api.erp.getSales(5);
      if (res?.success && Array.isArray(res.data)) {
        transactions = res.data.map(mapSale);
      }
    } catch (_) {
    } finally {
      isLoading = false;
    }
  });
</script>

<div class="min-h-0 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between xl:absolute xl:inset-0">
  <!-- HEADER -->
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <ArrowLeftRight class="w-4 h-4 text-[#0c2e7a]" />
      <h3 class="text-sm font-bold text-slate-800">Transaksi Terbaru</h3>
    </div>
    <a href="/penjualan" class="text-[11px] font-semibold text-[#1d63d8] hover:underline flex items-center gap-1">
      Lihat <ArrowRight class="w-3 h-3" />
    </a>
  </div>

  <!-- TABLE -->
  <div class="flex-1 min-h-0 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {#if isLoading}
      <div class="h-full flex items-center justify-center p-4">
        <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if transactions.length === 0}
      <div class="h-full flex flex-col items-center justify-center text-center p-4">
        <p class="text-xs text-slate-400 font-medium">Belum ada transaksi penjualan tercatat.</p>
      </div>
    {:else}
      <table class="w-full text-left text-[11px]">
        <thead>
          <tr class="bg-blue-50/50 text-slate-600 border-b border-slate-100 font-bold">
            <th class="py-2.5 px-3">Tanggal</th>
            <th class="py-2.5 px-3">Pelanggan</th>
            <th class="py-2.5 px-3 text-right">Total</th>
            <th class="py-2.5 px-3 text-center rounded-r-lg">Metode</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-50">
          {#each transactions as trx}
            <tr class="hover:bg-slate-50/80 transition-colors">
              <td class="py-2.5 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                {trx.time}
              </td>
              <td class="py-2.5 px-3 font-semibold text-slate-800 truncate max-w-[120px]" title={trx.customer}>
                {trx.customer}
              </td>
              <td class="py-2.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                Rp {trx.total.toLocaleString("id-ID")}
              </td>
              <td class="py-2.5 px-3 text-center">
                <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold border {trx.badge}">
                  {trx.method}
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
