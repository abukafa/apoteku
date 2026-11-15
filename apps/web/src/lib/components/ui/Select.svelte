<script lang="ts">
  import { ChevronDown, Check } from "lucide-svelte";
  import { portal } from "$lib/actions/portal";

  export interface SelectOption {
    value: any;
    label: string;
    sublabel?: string;
    badge?: string;
    badgeClass?: string;
  }

  interface Props {
    id?: string;
    value?: any;
    options: Array<SelectOption | string>;
    placeholder?: string;
    icon?: any;
    variant?: "default" | "white" | "soft" | "ghost";
    size?: "sm" | "md";
    align?: "left" | "right";
    minMenuWidth?: number;
    disabled?: boolean;
    class?: string;
    onchange?: (value: any) => void;
  }

  let {
    id,
    value = $bindable(),
    options = [],
    placeholder = "Pilih opsi...",
    icon: IconComponent,
    variant = "default",
    size = "md",
    align = "left",
    minMenuWidth = 0,
    disabled = false,
    class: className = "",
    onchange
  }: Props = $props();

  let isOpen = $state(false);
  let highlightedIndex = $state(-1);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  let menuEl = $state<HTMLDivElement | null>(null);
  let menuStyle = $state("");

  let normalizedOptions = $derived<SelectOption[]>(
    options
      .filter((opt): opt is SelectOption | string => opt !== null && opt !== undefined)
      .map((opt) =>
        typeof opt === "string" ? { value: opt, label: opt } : opt
      )
  );

  // Auto-select first option when value is undefined and options are available (matching native <select>)
  $effect(() => {
    if (value === undefined && normalizedOptions.length > 0) {
      value = normalizedOptions[0].value;
    }
  });

  let selectedOption = $derived(
    normalizedOptions.find((opt) => opt.value === value) || normalizedOptions[0]
  );

  function updatePosition() {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < 230 && spaceAbove > spaceBelow;

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

  function toggleMenu() {
    if (disabled) return;
    isOpen = !isOpen;
    if (isOpen) {
      const idx = normalizedOptions.findIndex((o) => o.value === value);
      highlightedIndex = idx >= 0 ? idx : 0;
      updatePosition();
    }
  }

  function selectOption(opt: SelectOption) {
    value = opt.value;
    isOpen = false;
    onchange?.(opt.value);
    triggerEl?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (disabled) return;
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleMenu();
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
      highlightedIndex = (highlightedIndex + 1) % Math.max(1, normalizedOptions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex =
        (highlightedIndex - 1 + Math.max(1, normalizedOptions.length)) %
        Math.max(1, normalizedOptions.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (normalizedOptions[highlightedIndex]) {
        selectOption(normalizedOptions[highlightedIndex]);
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
        return "bg-white border border-slate-200 hover:border-blue-300 text-slate-700 shadow-2xs";
      case "soft":
        return "bg-[#f4f7fb] border border-slate-200 hover:border-blue-300 text-slate-700";
      case "ghost":
        return "bg-transparent border border-transparent hover:bg-slate-100/70 text-slate-700";
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
        <IconComponent class="w-3.5 h-3.5 text-[#1d63d8] flex-shrink-0" />
      {/if}
      <span class="truncate {selectedOption ? 'text-slate-800' : 'text-slate-400'}">
        {selectedOption ? selectedOption.label : placeholder}
      </span>
      {#if selectedOption?.badge}
        <span class="px-1.5 py-0.5 text-[10px] font-bold rounded-md flex-shrink-0 {selectedOption.badgeClass || 'bg-blue-50 text-[#1d63d8] border border-blue-200'}">
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
      class="fixed z-[130] bg-white/98 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/90 py-1.5 animate-in fade-in zoom-in-95 duration-150"
    >
      <div class="max-h-60 overflow-y-auto px-1.5 space-y-0.5 scrollbar-minimalist">
        {#if normalizedOptions.length === 0}
          <div class="px-3 py-3 text-center text-xs text-slate-400">
            Tidak ada pilihan tersedia
          </div>
        {:else}
          {#each normalizedOptions as opt, idx}
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
                    <span class="px-1.5 py-0.5 text-[9px] font-bold rounded flex-shrink-0 {opt.badgeClass || 'bg-blue-50 text-[#1d63d8] border border-blue-200'}">
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
        {/if}
      </div>
    </div>
  {/if}
</div>
