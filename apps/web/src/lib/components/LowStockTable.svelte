<script lang="ts">
  import { Package, ArrowRight } from "lucide-svelte";

  interface LowStockItem {
    id: string;
    name: string;
    stock: number;
    minStock: number;
    unit?: string;
  }

  interface Props {
    items?: LowStockItem[];
  }

  let { items = [] }: Props = $props();
</script>

<div class="min-h-0 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between xl:absolute xl:inset-0">
  <!-- HEADER -->
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <Package class="w-4 h-4 text-[#0c2e7a]" />
      <h3 class="text-sm font-bold text-slate-800">Stok Menipis</h3>
    </div>
    <a href="/stok" class="text-[11px] font-semibold text-[#1d63d8] hover:underline flex items-center gap-1">
      Lihat <ArrowRight class="w-3 h-3" />
    </a>
  </div>

  <!-- TABLE -->
  <div class="flex-1 min-h-0 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {#if items.length === 0}
      <div class="h-full flex flex-col items-center justify-center text-center p-4">
        <p class="text-xs text-slate-400 font-medium">Semua stok obat aman & mencukupi batas minimum.</p>
      </div>
    {:else}
      <table class="w-full text-left text-[11px]">
        <thead>
          <tr class="bg-blue-50/50 text-slate-600 border-b border-slate-100 font-bold">
            <th class="py-2.5 px-3 rounded-l-lg">Nama Obat</th>
            <th class="py-2.5 px-3 text-center">Stok</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-50">
          {#each items as item}
            <tr class="hover:bg-slate-50/80 transition-colors">
              <td class="py-2.5 px-3 font-semibold text-slate-800">
                {item.name}
              </td>
              <td class="py-2.5 px-3 text-center font-bold text-[#df1c2d]">
                {item.stock}<span class="font-semibold text-slate-400">/{item.minStock}</span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
