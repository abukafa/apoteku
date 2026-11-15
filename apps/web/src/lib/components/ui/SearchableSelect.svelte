<script lang="ts">
  import { tick } from "svelte";
  import { ChevronDown, Check, Search, X } from "lucide-svelte";
  import { portal } from "$lib/actions/portal";
  import type { SelectOption } from "./Select.svelte";

  interface Props {
    id?: string;
    value?: any;
    options: Array<SelectOption | string>;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    icon?: any;
    variant?: "default" | "white" | "soft";
    size?: "sm" | "md";
    align?: "left" | "right";
    minMenuWidth?: number;
    maxRenderedOptions?: number;
    disabled?: boolean;
    class?: string;
    onchange?: (value: any) => void;
  }

  let {
    id,
    value = $bindable(),
    options = [],
    placeholder = "Pilih data...",
    searchPlaceholder = "Ketik untuk mencari & filter...",
    emptyText = "Data tidak ditemukan",
    icon: IconComponent,
    variant = "white",
    size = "md",
    align = "left",
    minMenuWidth = 280,
    maxRenderedOptions = 50,
    disabled = false,
    class: className = "",
    onchange
  }: Props = $props();

  let isOpen = $state(false);
  let searchQuery = $state("");
  let highlightedIndex = $state(0);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  let menuEl = $state<HTMLDivElement | null>(null);
  let searchInputEl = $state<HTMLInputElement | null>(null);
  let menuStyle = $state("");

  let normalizedOptions = $derived<SelectOption[]>(
    options
      .filter((opt): opt is SelectOption | string => opt !== null && opt !== undefined)
      .map((opt) =>
        typeof opt === "string" ? { value: opt, label: opt } : opt
      )
  );

  $effect(() => {
    if (value === undefined && normalizedOptions.length > 0) {
      value = normalizedOptions[0].value;
    }
  });

  let selectedOption = $derived(
    normalizedOptions.find((opt) => opt.value === value) || normalizedOptions[0]
  );

  let filteredOptions = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q))
    );
  });

  let visibleOptions = $derived(filteredOptions.slice(0, maxRenderedOptions));

  function updatePosition() {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < 280 && spaceAbove > spaceBelow;

    const effectiveMinWidth = Math.max(rect.width, minMenuWidth);
    const styles: string[] = [
      `min-width: ${effectiveMinWidth}px`,
      `max-width: ${Math.min(440, viewportWidth - 24)}px`
    ];

    if (align === "right" || rect.left + effectiveMinWidth > viewportWidth - 12) {
      styles.push(`right: ${Math.max(12, viewportWidth - rect.right)}px`);
    } else {
      styles.push(`left: ${Math.max(12, rect.left)}px`);
    }

    if (openUpward) {
      styles.push(`bottom: ${viewportHeight - rect.top + 6}px`);
    } else {
      styles.push(`top: ${rect.bottom + 6}px`);
    }

    menuStyle = styles.join("; ");
  }

  async function openMenu() {
    if (disabled) return;
    isOpen = true;
    searchQuery = "";
    const idx = normalizedOptions.findIndex((o) => o.value === value);
    highlightedIndex = idx >= 0 ? idx : 0;
    updatePosition();
    await tick();
    searchInputEl?.focus();
  }

  function toggleMenu() {
    if (disabled) return;
    if (isOpen) {
      isOpen = false;
    } else {
      openMenu();
    }
  }

  function selectOption(opt: SelectOption) {
    value = opt.value;
    isOpen = false;
    searchQuery = "";
    onchange?.(opt.value);
    triggerEl?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (disabled) return;
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      isOpen = false;
      triggerEl?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (visibleOptions.length > 0) {
        highlightedIndex = (highlightedIndex + 1) % visibleOptions.length;
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (visibleOptions.length > 0) {
        highlightedIndex = (highlightedIndex - 1 + visibleOptions.length) % visibleOptions.length;
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (visibleOptions[highlightedIndex]) {
        selectOption(visibleOptions[highlightedIndex]);
      }
    }
  }

  function handleWindowClick(e: MouseEvent) {
    if (!isOpen) return;
    const target = e.target as Node;
    if (!triggerEl?.contains(target) && !menuEl?.contains(target)) {
      isOpen = false;
    }
  }

  function handleWindowScroll(e: Event) {
    if (!isOpen) return;
    if (menuEl && e.target instanceof Node && menuEl.contains(e.target)) {
      return;
    }
    updatePosition();
  }

  let variantClasses = $derived.by(() => {
    switch (variant) {
      case "white":
        return "bg-white border border-slate-200 hover:border-blue-300 text-slate-700";
      case "soft":
        return "bg-[#f4f7fb] border border-slate-200 hover:border-blue-300 text-slate-700";
      default:
        return "bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-white text-slate-700";
    }
  });

  let sizeClasses = $derived(
    size === "sm"
      ? "px-2.5 py-1.5 text-xs rounded-xl gap-2"
      : "px-3 py-2 text-xs rounded-xl gap-2"
  );
</script>

<svelte:window
  onclick={handleWindowClick}
  onresize={updatePosition}
  onscrollcapture={handleWindowScroll}
/>

<div class="relative {className}">
  <button
    bind:this={triggerEl}
    {id}
    type="button"
    {disabled}
    onclick={toggleMenu}
    onkeydown={handleKeydown}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    class="w-full flex items-center justify-between text-left font-semibold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#1d63d8] disabled:opacity-50 disabled:cursor-not-allowed {variantClasses} {sizeClasses} {isOpen ? 'border-[#1d63d8] bg-white ring-2 ring-blue-500/20' : ''}"
  >
    <span class="flex items-center gap-2 min-w-0 flex-1">
      {#if IconComponent}
        <IconComponent class="w-4 h-4 text-[#1d63d8] flex-shrink-0" />
      {/if}
      <span class="truncate {selectedOption ? 'text-slate-800' : 'text-slate-400'}">
        {selectedOption ? selectedOption.label : placeholder}
      </span>
      {#if selectedOption?.badge}
        <span class="px-1.5 py-0.5 text-[10px] font-bold rounded-md flex-shrink-0 uppercase {selectedOption.badgeClass || 'bg-blue-50 text-[#1d63d8] border border-blue-200'}">
          {selectedOption.badge}
        </span>
      {/if}
    </span>
    <ChevronDown
      class="w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform duration-150 {isOpen ? 'rotate-180 text-[#1d63d8]' : ''}"
    />
  </button>

  {#if isOpen}
    <div
      bind:this={menuEl}
      use:portal
      style={menuStyle}
      role="listbox"
      tabindex="-1"
      class="fixed z-[130] bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Search Input Bar -->
      <div class="p-2 border-b border-slate-100 bg-slate-50/70">
        <div class="relative flex items-center">
          <Search class="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            bind:this={searchInputEl}
            type="text"
            bind:value={searchQuery}
            oninput={() => (highlightedIndex = 0)}
            onkeydown={handleKeydown}
            placeholder={searchPlaceholder}
            class="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1d63d8] focus:ring-2 focus:ring-blue-500/20"
          />
          {#if searchQuery}
            <button
              type="button"
              onclick={() => {
                searchQuery = "";
                highlightedIndex = 0;
                searchInputEl?.focus();
              }}
              class="absolute right-2 p-0.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100"
              aria-label="Hapus pencarian"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          {/if}
        </div>
        <div class="flex items-center justify-between px-1 pt-1.5 text-[10px] text-slate-400 font-medium">
          <span>
            Menampilkan {visibleOptions.length} dari {filteredOptions.length} hasil
            {#if filteredOptions.length !== normalizedOptions.length}
              (total {normalizedOptions.length})
            {/if}
          </span>
          <span class="font-mono text-[9px]">↑↓ Pilih • Enter</span>
        </div>
      </div>

      <!-- Filtered Option List -->
      <div class="max-h-60 overflow-y-auto p-1.5 space-y-0.5 scrollbar-minimalist">
        {#if visibleOptions.length === 0}
          <div class="px-3 py-6 text-center text-xs text-slate-400">
            <p class="font-semibold text-slate-500">{emptyText}</p>
            <p class="text-[11px] mt-0.5">Tidak ada kecocokan untuk "{searchQuery}"</p>
          </div>
        {:else}
          {#each visibleOptions as opt, idx}
            {@const isSelected = opt.value === value}
            {@const isHighlighted = idx === highlightedIndex}
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              onclick={() => selectOption(opt)}
              onmouseenter={() => (highlightedIndex = idx)}
              class="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-colors cursor-pointer {isSelected
                ? 'bg-blue-50/90 text-[#0c2e7a] font-bold'
                : isHighlighted
                  ? 'bg-slate-100/80 text-slate-900 font-semibold'
                  : 'text-slate-700 font-medium hover:bg-slate-50'}"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate">{opt.label}</span>
                  {#if opt.badge}
                    <span class="px-1.5 py-0.5 text-[9px] font-bold rounded uppercase flex-shrink-0 {opt.badgeClass || 'bg-blue-50 text-[#1d63d8] border border-blue-200'}">
                      {opt.badge}
                    </span>
                  {/if}
                </div>
                {#if opt.sublabel}
                  <div class="text-[10px] text-slate-400 font-normal truncate mt-0.5">
                    {opt.sublabel}
                  </div>
                {/if}
              </div>

              {#if isSelected}
                <span class="w-5 h-5 rounded-full bg-[#1d63d8] text-white flex items-center justify-center flex-shrink-0">
                  <Check class="w-3 h-3" />
                </span>
              {/if}
            </button>
          {/each}
          {#if filteredOptions.length > maxRenderedOptions}
            <div class="px-3 py-2 text-center text-[10px] text-slate-400 bg-slate-50 rounded-lg border border-slate-100 mt-1">
              Menampilkan {maxRenderedOptions} teratas dari {filteredOptions.length} hasil — ketik kata kunci untuk mencari lebih spesifik.
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>
