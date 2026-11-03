<script lang="ts">
  import type { Snippet } from "svelte";
  import { X } from "lucide-svelte";
  import { portal } from "$lib/actions/portal";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    icon?: any;
    maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
    children: Snippet;
  }

  let {
    isOpen = $bindable(false),
    onClose,
    title,
    icon: IconComponent,
    maxWidth = "lg",
    children
  }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen) {
      onClose();
    }
  }

  function getMaxWidthClass(w: string) {
    switch (w) {
      case "sm":
        return "max-w-sm";
      case "md":
        return "max-w-md";
      case "xl":
        return "max-w-xl";
      case "2xl":
        return "max-w-2xl";
      default:
        return "max-w-lg";
    }
  }

  let widthClass = $derived(getMaxWidthClass(maxWidth));
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    role="presentation"
  >
    <div
      class="bg-white/95 backdrop-blur-xl rounded-2xl {widthClass} w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto"
      role="dialog"
      aria-modal="true"
    >
      {#if title}
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2 text-slate-900 font-bold">
            {#if IconComponent}
              <IconComponent class="w-5 h-5 text-brand-blue" />
            {/if}
            <span class="text-sm sm:text-base">{title}</span>
          </div>
          <button
            type="button"
            onclick={onClose}
            class="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Tutup"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      {/if}

      {@render children()}
    </div>
  </div>
{/if}
