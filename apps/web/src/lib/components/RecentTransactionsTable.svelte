<script lang="ts">
  import { ArrowLeftRight, ArrowRight } from "lucide-svelte";
  import { onMount } from "svelte";
  import { api } from "$lib/services/api";

  let transactions = $state([
    { no: "PJ-1025-0287", time: "27 Okt 2025 10:12", customer: "Umum", total: 125000, method: "Tunai", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    { no: "PJ-1025-0286", time: "27 Okt 2025 09:48", customer: "Ibu Sari", total: 86500, method: "Non Tunai", badge: "bg-blue-50 text-blue-700 border-blue-200" },
    { no: "PJ-1025-0285", time: "27 Okt 2025 09:32", customer: "Bapak Rudi", total: 210000, method: "Tunai", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    { no: "PJ-1025-0284", time: "27 Okt 2025 08:55", customer: "Umum", total: 67000, method: "Tunai", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    { no: "PJ-1025-0283", time: "27 Okt 2025 08:41", customer: "Ibu Dewi", total: 148500, method: "BPJS", badge: "bg-purple-50 text-purple-700 border-purple-200" }
  ]);

  onMount(async () => {
    try {
      const res = await api.erp.getSales(5);
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        transactions = res.data.map((s: any) => {
          const d = new Date(s.transactionTime);
          const dateStr = !isNaN(d.getTime())
            ? d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
            : s.transactionTime;
          return {
            no: s.invoiceNumber,
            time: dateStr,
            customer: s.customerType === "MEMBER" ? "Member" : "Umum",
            total: s.grandTotal,
            method: s.paymentMethod === "CASH" ? "Tunai" : s.paymentMethod === "QRIS" ? "QRIS" : "Non Tunai",
            badge: s.paymentMethod === "CASH"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-blue-50 text-blue-700 border-blue-200"
          };
        });
      }
    } catch (_) {}
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
            <td class="py-2.5 px-3 text-slate-500 text-[11px]">
              {trx.time}
            </td>
            <td class="py-2.5 px-3 font-semibold text-slate-800">
              {trx.customer}
            </td>
            <td class="py-2.5 px-3 text-right font-bold text-slate-900">
              {trx.total.toLocaleString("id-ID")}
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
  </div>
</div>
