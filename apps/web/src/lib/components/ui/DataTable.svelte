<script lang="ts">
  import type { Snippet } from "svelte";
  import { Search, ChevronLeft, ChevronRight, Inbox, X } from "lucide-svelte";
  import type { SortDirection, SortState } from "./DataTable.types";

  interface Props {
    title?: string;
    subtitle?: string;
    titleContent?: Snippet;
    badgeContent?: Snippet;

    showSearch?: boolean;
    searchPlaceholder?: string;
    searchValue?: string;
    onSearchChange?: (val: string) => void;

    filters?: Snippet;
    actions?: Snippet;
    bulkActions?: Snippet;

    header?: Snippet;
    rows?: Snippet;
    footerSummary?: Snippet;

    emptyText?: string;
    emptyIcon?: any;
    isLoading?: boolean;

    totalCount?: number;
    currentPage?: number;
    totalPages?: number;
    pageSize?: number;
    pageSizeOptions?: number[];
    onPageChange?: (page: number) => void;
    onPageSizeChange?: (size: number) => void;

    sortKey?: string;
    sortDirection?: SortDirection;
    onSortChange?: (state: SortState) => void;
  }

  let {
    title,
    subtitle,
    titleContent,
    badgeContent,
    showSearch = true,
    searchPlaceholder = "Cari data...",
    searchValue = $bindable(""),
    onSearchChange,
    filters,
    actions,
    bulkActions,
    header,
    rows,
    footerSummary,
    emptyText = "Belum ada data untuk ditampilkan.",
    emptyIcon: EmptyIconComponent,
    isLoading = false,
    totalCount = 0,
    currentPage = $bindable(1),
    totalPages = 1,
    pageSize = 25,
    pageSizeOptions = [10, 25, 50, 100],
    onPageChange,
    onPageSizeChange,
    sortKey = $bindable(""),
    sortDirection = $bindable(null),
    onSortChange
  }: Props = $props();

  let startItem = $derived(totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1);
  let endItem = $derived(Math.min(currentPage * pageSize, totalCount));

  function handleInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    searchValue = val;
    if (currentPage !== 1) {
      currentPage = 1;
      onPageChange?.(1);
    }
    onSearchChange?.(val);
  }

  function handleClearSearch() {
    searchValue = "";
    if (currentPage !== 1) {
      currentPage = 1;
      onPageChange?.(1);
    }
    onSearchChange?.("");
  }
</script>

<div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
  <!-- TOP TOOLBAR -->
  {#if title || titleContent || showSearch || filters || actions || bulkActions}
    <div class="p-4 sm:p-5 border-b border-slate-100 flex flex-col gap-3.5">
      <!-- Row 1: Title & Actions/Filters Flex Container -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 flex-wrap">
        <!-- Title area (Flexible) -->
        <div class="flex items-center gap-2.5 flex-wrap">
          {#if titleContent}
            {@render titleContent()}
          {:else if title}
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  {title}
                </h3>
                {#if badgeContent}
                  {@render badgeContent()}
                {:else if totalCount > 0}
                  <span class="px-2 py-0.5 bg-blue-50 text-[#1d63d8] border border-blue-100/80 rounded-full text-xs font-bold">
                    {totalCount.toLocaleString("id-ID")}
                  </span>
                {/if}
              </div>
              {#if subtitle}
                <p class="text-[11px] text-slate-500 mt-0.5 font-medium">{subtitle}</p>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Right Controls: Search, Filters, and Actions -->
        <div class="flex items-center gap-2.5 flex-1 max-w-full md:max-w-2xl md:ml-auto justify-end flex-wrap">
          <!-- Search Input -->
          {#if showSearch}
            <div class="relative flex-1 min-w-[200px] max-w-sm">
              <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchValue}
                oninput={handleInput}
                placeholder={searchPlaceholder}
                class="w-full bg-slate-50 pl-9 pr-8 py-1.5 text-xs sm:text-sm rounded-xl border border-slate-200/80 focus:bg-white focus:border-brand-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-blue-500/10 text-slate-700 placeholder-slate-400 transition-all"
              />
              {#if searchValue}
                <button
                  type="button"
                  onclick={handleClearSearch}
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  title="Hapus pencarian"
                  aria-label="Hapus teks pencarian"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              {/if}
            </div>
          {/if}

          <!-- Filters Slot -->
          {#if filters}
            <div class="flex items-center gap-2 flex-wrap">
              {@render filters()}
            </div>
          {/if}

          <!-- Actions Slot -->
          {#if actions}
            <div class="flex items-center gap-2 flex-wrap">
              {@render actions()}
            </div>
          {/if}
        </div>
      </div>

      <!-- Row 2: Bulk Actions (Conditional) -->
      {#if bulkActions}
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
          {@render bulkActions()}
        </div>
      {/if}
    </div>
  {/if}

  <!-- TABLE CONTAINER -->
  <div class="overflow-x-auto scrollbar-thin flex-1">
    <table class="w-full text-left border-collapse text-xs">
      <thead>
        <tr class="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
          {#if header}
            {@render header()}
          {/if}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
        {#if isLoading}
          <!-- SKELETON ROWS LOADING STATE -->
          {#each [1, 2, 3, 4] as _}
            <tr class="animate-pulse">
              <td colspan="12" class="py-3.5 px-4">
                <div class="flex items-center gap-3">
                  <div class="h-4 bg-slate-200 rounded w-1/4"></div>
                  <div class="h-4 bg-slate-100 rounded w-1/3"></div>
                  <div class="h-4 bg-slate-100 rounded w-1/6"></div>
                  <div class="h-4 bg-slate-200 rounded w-1/5 ml-auto"></div>
                </div>
              </td>
            </tr>
          {/each}
        {:else if totalCount === 0}
          <tr>
            <td colspan="12" class="py-12 text-center text-slate-400">
              <div class="flex flex-col items-center justify-center">
                {#if EmptyIconComponent}
                  <EmptyIconComponent class="w-8 h-8 text-slate-300 mb-2 stroke-1" />
                {:else}
                  <Inbox class="w-8 h-8 text-slate-300 mb-2 stroke-1" />
                {/if}
                <p class="text-xs font-medium text-slate-500">{emptyText}</p>
              </div>
            </td>
          </tr>
        {:else if rows}
          {@render rows()}
        {/if}
      </tbody>
      {#if footerSummary}
        <tfoot class="bg-slate-50 border-t border-slate-200 font-bold text-slate-800 text-xs">
          {@render footerSummary()}
        </tfoot>
      {/if}
    </table>
  </div>

  <!-- PAGINATION FOOTER -->
  {#if totalPages > 1}
    <div class="p-3.5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
      <div class="flex items-center gap-3">
        <div>
          Menampilkan <span class="font-bold text-slate-700">{startItem}–{endItem}</span> dari <span class="font-bold text-slate-700">{totalCount.toLocaleString("id-ID")}</span> data
          <span class="text-slate-400 ml-1">(Hal. {currentPage} / {totalPages})</span>
        </div>

        {#if onPageSizeChange && pageSizeOptions.length > 1}
          <div class="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500">
            <span>Per halaman:</span>
            <select
              value={pageSize}
              onchange={(e) => onPageSizeChange(Number((e.target as HTMLSelectElement).value))}
              class="px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold focus:outline-none focus:border-brand-blue-500"
            >
              {#each pageSizeOptions as opt}
                <option value={opt}>{opt}</option>
              {/each}
            </select>
          </div>
        {/if}
      </div>

      <div class="flex items-center gap-1.5 self-end sm:self-auto">
        <button
          type="button"
          disabled={currentPage <= 1 || isLoading}
          onclick={() => {
            currentPage = 1;
            onPageChange?.(1);
          }}
          class="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-[11px] transition-colors cursor-pointer"
        >
          Awal
        </button>
        <button
          type="button"
          disabled={currentPage <= 1 || isLoading}
          onclick={() => {
            const p = Math.max(1, currentPage - 1);
            currentPage = p;
            onPageChange?.(p);
          }}
          class="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          aria-label="Halaman Sebelumnya"
        >
          <ChevronLeft class="w-4 h-4" />
        </button>
        <span class="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 text-[11px]">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={currentPage >= totalPages || isLoading}
          onclick={() => {
            const p = Math.min(totalPages, currentPage + 1);
            currentPage = p;
            onPageChange?.(p);
          }}
          class="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          aria-label="Halaman Selanjutnya"
        >
          <ChevronRight class="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={currentPage >= totalPages || isLoading}
          onclick={() => {
            currentPage = totalPages;
            onPageChange?.(totalPages);
          }}
          class="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-[11px] transition-colors cursor-pointer"
        >
          Akhir
        </button>
      </div>
    </div>
  {/if}
</div>
