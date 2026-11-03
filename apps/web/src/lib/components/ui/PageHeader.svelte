<script lang="ts">
  import type { Component } from "svelte";
  import type { Snippet } from "svelte";
  import { ChevronRight, Home } from "lucide-svelte";

  interface BreadcrumbItem {
    label: string;
    href?: string;
  }

  interface Props {
    title: string;
    subtitle?: string;
    icon?: any;
    breadcrumbs?: BreadcrumbItem[];
    actions?: Snippet;
  }

  let {
    title,
    subtitle,
    icon: IconComponent,
    breadcrumbs = [],
    actions
  }: Props = $props();
</script>

<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
  <div>
    <!-- Breadcrumbs -->
    <nav class="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5 font-medium">
      <a href="/" class="hover:text-brand-blue flex items-center gap-1 transition-colors">
        <Home class="w-3.5 h-3.5" />
        <span>Beranda</span>
      </a>
      {#each breadcrumbs as crumb}
        <ChevronRight class="w-3.5 h-3.5 text-slate-300" />
        {#if crumb.href}
          <a href={crumb.href} class="hover:text-brand-blue transition-colors">
            {crumb.label}
          </a>
        {:else}
          <span class="text-slate-600 font-semibold">{crumb.label}</span>
        {/if}
      {/each}
    </nav>

    <!-- Title & Icon -->
    <div class="flex items-center gap-3">
      {#if IconComponent}
        <div class="w-10 h-10 rounded-xl bg-brand-blue-50 text-brand-blue-700 flex items-center justify-center border border-brand-blue-100 shadow-sm flex-shrink-0">
          <IconComponent class="w-5 h-5" />
        </div>
      {/if}
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">
          {title}
        </h1>
        {#if subtitle}
          <p class="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
            {subtitle}
          </p>
        {/if}
      </div>
    </div>
  </div>

  <!-- Action Buttons Slot -->
  {#if actions}
    <div class="flex items-center gap-2.5 flex-wrap">
      {@render actions()}
    </div>
  {/if}
</div>
