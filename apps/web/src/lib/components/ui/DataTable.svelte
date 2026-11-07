<script lang="ts">
  import type { Snippet } from "svelte";
  import { Search, ChevronLeft, ChevronRight, Inbox } from "lucide-svelte";

  interface Props {
    title?: string;
    searchPlaceholder?: string;
    searchValue?: string;
    onSearchChange?: (val: string) => void;
    filters?: Snippet;
    actions?: Snippet;
    header: Snippet;
    rows: Snippet;
    emptyText?: string;
    totalCount?: number;
    currentPage?: number;
    totalPages?: number;
    pageSize?: number;
    onPageChange?: (page: number) => void;
  }

  let {
    title,
    searchPlaceholder = "Cari data...",
    searchValue = $bindable(""),
    onSearchChange,
    filters,
    actions,
    header,
    rows,
    emptyText = "Belum ada data untuk ditampilkan.",
    totalCount = 0,
    currentPage = 1,
    totalPages = 1,
    pageSize = 25,
    onPageChange
  }: Props = $props();

  let startItem = $derived(totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1);
  let endItem = $derived(Math.min(currentPage * pageSize, totalCount));

  function handleInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    searchValue = val;
    if (currentPage !== 1) {
      onPageChange?.(1);
    }
    onSearchChange?.(val);
  }
</script>

<div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
  <!-- TOP TOOLBAR -->
  <div class="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    {#if title}
      <h3 class="text-sm font-bold text-slate-800 tracking-tight">
        {title}
        {#if totalCount > 0}
          <span class="ml-1.5 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold">
            {totalCount}
          </span>
        {/if}
      </h3>
    {/if}

    <div class="flex items-center gap-2.5 flex-1 max-w-xl sm:ml-auto">
      <!-- Search Input -->
      <div class="relative flex-1">
        <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchValue}
          oninput={handleInput}
          placeholder={searchPlaceholder}
          class="w-full bg-slate-50 pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-xl border border-slate-200/80 focus:bg-white focus:border-brand-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-blue-500/10 text-slate-700 placeholder-slate-400 transition-all"
        />
      </div>

      <!-- Filters Slot -->
      {#if filters}
        {@render filters()}
      {/if}

      <!-- Actions Slot -->
      {#if actions}
        {@render actions()}
      {/if}
    </div>
  </div>

  <!-- TABLE CONTAINER -->
  <div class="overflow-x-auto scrollbar-thin flex-1">
    <table class="w-full text-left border-collapse text-xs">
      <thead>
        <tr class="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
          {@render header()}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
        {#if totalCount === 0}
          <tr>
            <td colspan="12" class="py-12 text-center text-slate-400">
              <div class="flex flex-col items-center justify-center">
                <Inbox class="w-8 h-8 text-slate-300 mb-2 stroke-1" />
                <p class="text-xs font-medium">{emptyText}</p>
              </div>
            </td>
          </tr>
        {:else}
          {@render rows()}
        {/if}
      </tbody>
    </table>
  </div>

  <!-- PAGINATION FOOTER -->
  {#if totalPages > 1}
    <div class="p-3.5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
      <div>
        Menampilkan <span class="font-bold text-slate-700">{startItem}–{endItem}</span> dari <span class="font-bold text-slate-700">{totalCount}</span> data
        <span class="text-slate-400 ml-1">(Hal. {currentPage} / {totalPages})</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1}
          onclick={() => onPageChange?.(1)}
          class="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-[11px] transition-colors"
        >
          Awal
        </button>
        <button
          type="button"
          disabled={currentPage <= 1}
          onclick={() => onPageChange?.(currentPage - 1)}
          class="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Halaman Sebelumnya"
        >
          <ChevronLeft class="w-4 h-4" />
        </button>
        <span class="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 text-[11px]">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onclick={() => onPageChange?.(currentPage + 1)}
          class="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Halaman Selanjutnya"
        >
          <ChevronRight class="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onclick={() => onPageChange?.(totalPages)}
          class="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-[11px] transition-colors"
        >
          Akhir
        </button>
      </div>
    </div>
  {/if}
</div>
