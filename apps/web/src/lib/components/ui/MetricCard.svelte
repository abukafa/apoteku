<script lang="ts">
  import type { Component } from "svelte";
  import { TrendingUp, TrendingDown, AlertCircle } from "lucide-svelte";

  interface Props {
    title: string;
    value: string | number;
    subtext?: string;
    trend?: {
      direction: "up" | "down";
      text: string;
    };
    icon?: any;
    variant?: "default" | "warning" | "danger" | "success" | "brand";
    alertActionText?: string;
    onAlertClick?: () => void;
  }

  let {
    title,
    value,
    subtext,
    trend,
    icon: IconComponent,
    variant = "default",
    alertActionText,
    onAlertClick
  }: Props = $props();

  function getVariantClasses(v: string) {
    switch (v) {
      case "brand":
        return {
          iconBg: "bg-brand-blue-50 text-brand-blue-700 border-brand-blue-100",
          cardBorder: "border-slate-100 hover:border-brand-blue-200"
        };
      case "danger":
        return {
          iconBg: "bg-red-50 text-brand-red-600 border-red-100",
          cardBorder: "border-red-100 bg-red-50/20"
        };
      case "warning":
        return {
          iconBg: "bg-amber-50 text-amber-600 border-amber-100",
          cardBorder: "border-amber-100 bg-amber-50/20"
        };
      case "success":
        return {
          iconBg: "bg-emerald-50 text-emerald-600 border-emerald-100",
          cardBorder: "border-emerald-100 bg-emerald-50/20"
        };
      default:
        return {
          iconBg: "bg-blue-50 text-brand-blue-600 border-blue-100",
          cardBorder: "border-slate-100 hover:border-slate-200"
        };
    }
  }

  let classes = $derived(getVariantClasses(variant));
</script>

<div
  class="bg-white rounded-2xl p-4 sm:p-5 border {classes.cardBorder} shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
>
  <div class="flex items-start justify-between gap-3">
    <div class="flex-1">
      <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
        {title}
      </span>
      <div class="text-xl sm:text-xl font-black text-slate-900 mt-1 tracking-tight">
        {value}
      </div>
    </div>
    {#if IconComponent}
      <div class="w-10 h-10 rounded-xl {classes.iconBg} border flex items-center justify-center flex-shrink-0 shadow-xs">
        <IconComponent class="w-5 h-5" />
      </div>
    {/if}
  </div>

  <div class="mt-3 pt-3 border-t border-slate-100/80 flex items-center justify-between text-xs">
    {#if trend}
      <div class="flex items-center gap-1 font-semibold {trend.direction === 'up' ? 'text-emerald-600' : 'text-brand-red-600'}">
        {#if trend.direction === "up"}
          <TrendingUp class="w-3.5 h-3.5" />
        {:else}
          <TrendingDown class="w-3.5 h-3.5" />
        {/if}
        <span>{trend.text}</span>
      </div>
    {:else if subtext}
      <span class="text-slate-500 font-medium">{subtext}</span>
    {/if}

    {#if alertActionText}
      <button
        type="button"
        onclick={() => onAlertClick?.()}
        class="text-brand-red-600 font-bold hover:underline flex items-center gap-1 ml-auto"
      >
        <AlertCircle class="w-3.5 h-3.5" />
        <span>{alertActionText}</span>
      </button>
    {/if}
  </div>
</div>
