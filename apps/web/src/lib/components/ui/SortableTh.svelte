<script lang="ts">
  import type { Snippet } from "svelte";
  import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-svelte";
  import { getNextSortDirection, type SortDirection, type SortState, type ColumnDataType } from "./DataTable.types";

  interface Props {
    key: string;
    label?: string;
    sortKey?: string;
    sortDirection?: SortDirection;
    dataType?: ColumnDataType;
    align?: "left" | "center" | "right";
    class?: string;
    onclick?: (key: string) => void;
    onsort?: (state: SortState) => void;
    children?: Snippet;
  }

  let {
    key,
    label = "",
    sortKey = "",
    sortDirection = null,
    dataType = "string",
    align = "left",
    class: className = "",
    onclick,
    onsort,
    children
  }: Props = $props();

  let isActive = $derived(sortKey === key && sortDirection !== null);
  let effectiveDirection = $derived(sortKey === key ? sortDirection : null);

  let alignContainerClass = $derived(
    align === "right" ? "justify-end text-right" : align === "center" ? "justify-center text-center" : "justify-start text-left"
  );

  function handleClick() {
    const nextDir = getNextSortDirection(effectiveDirection);
    onclick?.(key);
    onsort?.({ key, direction: nextDir });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }
</script>

<th
  scope="col"
  aria-sort={isActive ? (effectiveDirection === "asc" ? "ascending" : "descending") : "none"}
  class="py-3 px-4 font-bold text-[11px] uppercase tracking-wider select-none transition-colors {className} {isActive ? 'bg-blue-50/80 text-[#1d63d8]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/70'}"
>
  <button
    type="button"
    onclick={handleClick}
    onkeydown={handleKeydown}
    class="w-full flex items-center gap-1.5 font-bold cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 rounded-sm {alignContainerClass}"
    title={`Klik untuk mengurutkan data (${effectiveDirection === "asc" ? "Z ke A" : "A ke Z"})`}
  >
    <span class="truncate">
      {#if children}
        {@render children()}
      {:else}
        {label}
      {/if}
    </span>

    <span class="inline-flex items-center shrink-0 transition-transform duration-150">
      {#if isActive && effectiveDirection === "asc"}
        <ArrowUp class="w-3.5 h-3.5 text-[#1d63d8] stroke-[2.5]" />
      {:else if isActive && effectiveDirection === "desc"}
        <ArrowDown class="w-3.5 h-3.5 text-[#1d63d8] stroke-[2.5]" />
      {:else}
        <ArrowUpDown class="w-3.5 h-3.5 text-slate-300 hover:text-slate-500 opacity-60" />
      {/if}
    </span>
  </button>
</th>
