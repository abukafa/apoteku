<script lang="ts">
  import { Package, ArrowRight } from "lucide-svelte";

  const lowStockItems = [
    { name: "Amoxicillin 500 mg", stock: 5, minStock: 10 },
    { name: "Paracetamol 500 mg", stock: 8, minStock: 10 },
    { name: "Vitamin C 500 mg", stock: 6, minStock: 10 },
    { name: "Ibuprofen 200 mg", stock: 4, minStock: 10 },
    { name: "Salbutamol Inhaler", stock: 2, minStock: 5 }
  ];
</script>

<div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between">
  <!-- HEADER -->
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <Package class="w-4 h-4 text-[#0c2e7a]" />
      <h3 class="text-sm font-bold text-slate-800">Stok Menipis</h3>
    </div>
    <a href="#stok" class="text-xs font-semibold text-[#1d63d8] hover:underline flex items-center gap-1">
      Lihat Semua <ArrowRight class="w-3 h-3" />
    </a>
  </div>

  <!-- TABLE -->
  <div class="overflow-x-auto">
    <table class="w-full text-left text-xs">
      <thead>
        <tr class="bg-blue-50/50 text-slate-600 border-b border-slate-100 font-bold">
          <th class="py-2.5 px-3 rounded-l-lg">Nama Obat</th>
          <th class="py-2.5 px-3 text-center">Stok</th>
          <th class="py-2.5 px-3 text-center rounded-r-lg">Min. Stok</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-50">
        {#each lowStockItems as item}
          <tr class="hover:bg-slate-50/80 transition-colors">
            <td class="py-2.5 px-3 font-semibold text-slate-800">
              {item.name}
            </td>
            <td class="py-2.5 px-3 text-center font-bold text-[#df1c2d]">
              {item.stock}
            </td>
            <td class="py-2.5 px-3 text-center font-semibold text-slate-500">
              {item.minStock}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
