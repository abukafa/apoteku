<script lang="ts">
  import { alertStore, type AlertType } from "$lib/stores/alertStore.svelte";
  import {
    ShieldAlert,
    AlertTriangle,
    CheckCircle2,
    Info,
    X,
    ArrowRight,
    RefreshCw
  } from "lucide-svelte";

  function getTypeConfig(type: AlertType) {
    switch (type) {
      case "danger":
        return {
          icon: ShieldAlert,
          iconBg: "bg-red-500/15 text-red-500 border-red-500/30",
          badgeBg: "bg-red-100 text-red-800",
          confirmBtn: "bg-red-600 hover:bg-red-700 text-white focus:ring-red-400 shadow-red-200",
          border: "border-red-400/30",
          accentLine: "bg-red-500",
          headerTitle: "Peringatan Transaksi Ditolak"
        };
      case "warning":
        return {
          icon: AlertTriangle,
          iconBg: "bg-amber-500/15 text-amber-500 border-amber-500/30",
          badgeBg: "bg-amber-100 text-amber-800",
          confirmBtn: "bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-400 shadow-amber-200",
          border: "border-amber-400/30",
          accentLine: "bg-amber-500",
          headerTitle: "Perhatian & Konfirmasi"
        };
      case "success":
        return {
          icon: CheckCircle2,
          iconBg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
          badgeBg: "bg-emerald-100 text-emerald-800",
          confirmBtn: "bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-400 shadow-emerald-200",
          border: "border-emerald-400/30",
          accentLine: "bg-emerald-500",
          headerTitle: "Berhasil"
        };
      case "info":
      default:
        return {
          icon: Info,
          iconBg: "bg-blue-500/15 text-blue-400 border-blue-500/30",
          badgeBg: "bg-blue-100 text-brand-blue-800",
          confirmBtn: "bg-brand-blue-700 hover:bg-brand-blue-800 text-white focus:ring-blue-400 shadow-blue-200",
          border: "border-blue-400/30",
          accentLine: "bg-blue-500",
          headerTitle: "Informasi Sistem"
        };
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && alertStore.currentDialog) {
      alertStore.closeDialog(false);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- 1. MODAL DIALOG STANDAR & BLOKIR TRANSAKSI (FROSTED GLASS EFFECT) -->
{#if alertStore.currentDialog}
  {@const dlg = alertStore.currentDialog}
  {@const cfg = getTypeConfig(dlg.type)}
  {@const IconComponent = cfg.icon}

  <div
    class="fixed inset-0 z-[9999] flex items-center justify-center p-4 glass-backdrop animate-fade-in"
    role="dialog"
    aria-modal="true"
  >
    <!-- MODAL CARD CONTAINER WITH FROSTED GLASS -->
    <div
      class="glass-modal-card rounded-3xl max-w-md w-full overflow-hidden transform transition-all animate-scale-up"
    >
      <!-- TOP ACCENT COLOR BAR -->
      <div class="h-2 w-full {cfg.accentLine}"></div>

      <div class="p-6">
        <!-- ICON & HEADER -->
        <div class="flex items-start justify-between gap-3 mb-4">
          <div class="flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-2xl flex items-center justify-center border {cfg.iconBg} shadow-inner"
            >
              <IconComponent class="w-6 h-6" />
            </div>
            <div>
              <span
                class="inline-block text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-md mb-1 {cfg.badgeBg}"
              >
                {cfg.headerTitle}
              </span>
              <h3 class="text-base font-black text-slate-900 leading-snug">
                {dlg.title}
              </h3>
            </div>
          </div>

          {#if dlg.showCloseButton}
            <button
              type="button"
              onclick={() => alertStore.closeDialog(false)}
              class="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
              aria-label="Tutup"
            >
              <X class="w-5 h-5" />
            </button>
          {/if}
        </div>

        <!-- MAIN MESSAGE BODY -->
        <p class="text-sm text-slate-600 leading-relaxed font-normal mb-4">
          {dlg.message}
        </p>

        <!-- OPTIONAL DETAILS BOX -->
        {#if dlg.details}
          <div
            class="mb-5 p-3.5 bg-white/70 border border-slate-200/80 rounded-2xl text-xs text-slate-700 space-y-1.5 shadow-xs"
          >
            {#if Array.isArray(dlg.details)}
              <div class="font-bold text-slate-800 mb-1">Rincian Kendala:</div>
              <ul class="list-disc pl-4 space-y-1 text-slate-600">
                {#each dlg.details as det}
                  <li>{det}</li>
                {/each}
              </ul>
            {:else}
              <div class="font-medium">{dlg.details}</div>
            {/if}
          </div>
        {/if}

        <!-- BUTTONS ROW -->
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
          {#if dlg.isConfirm}
            <button
              type="button"
              onclick={() => alertStore.closeDialog(false)}
              class="px-4 py-2.5 rounded-xl border border-slate-300 bg-white/60 hover:bg-white/90 text-slate-700 text-xs font-bold transition-all {dlg.cancelClass || ''}"
            >
              {dlg.cancelText}
            </button>
          {/if}

          <!-- OPTIONAL DEDICATED ACTION BUTTON -->
          {#if dlg.actionButton}
            <button
              type="button"
              onclick={async () => {
                const fn = dlg.actionButton?.onClick;
                alertStore.closeDialog(false);
                if (fn) await fn();
              }}
              class="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white text-xs font-bold shadow-md transition-all {dlg.actionButton.class || ''}"
            >
              <span>{dlg.actionButton.label}</span>
              <ArrowRight class="w-3.5 h-3.5" />
            </button>
          {/if}

          <!-- CONFIRM / OK BUTTON -->
          <button
            type="button"
            onclick={() => alertStore.closeDialog(true)}
            class="px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all focus:outline-none focus:ring-2 {cfg.confirmBtn} {dlg.confirmClass || ''}"
          >
            {dlg.confirmText}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- 2. TOAST NOTIFICATION CONTAINER (AUTHENTIC GLASSMORPHISM WITH FROSTED BLUR & FADEOUT) -->
{#if alertStore.toasts.length > 0}
  <div class="fixed top-5 right-5 z-[10000] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
    {#each alertStore.toasts as toast (toast.id)}
      {@const tCfg = getTypeConfig(toast.type)}
      {@const isDark = toast.variant === "glass-dark"}

      <div
        class="pointer-events-auto rounded-2xl p-3.5 flex items-start gap-3 transition-all duration-300 relative overflow-hidden {isDark
          ? 'glass-dark-card'
          : 'glass-light-card'} {toast.isExiting
          ? 'opacity-0 -translate-y-3 scale-95 pointer-events-none'
          : 'opacity-100 translate-y-0 scale-100 animate-slide-in'}"
        role="alert"
      >
        <!-- FROSTED GLASS ICON PILL -->
        <div
          class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border {isDark
            ? 'glass-icon-dark'
            : tCfg.iconBg}"
        >
          {#if toast.isSpinning}
            <RefreshCw class="w-4 h-4 animate-spin text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.7)]" />
          {:else}
            {@const ToastIcon = tCfg.icon}
            <ToastIcon class="w-4 h-4 {isDark ? 'drop-shadow-sm' : ''}" />
          {/if}
        </div>

        <div class="flex-1 min-w-0 pr-1">
          {#if toast.title}
            <h4
              class="text-xs font-bold leading-tight mb-0.5 tracking-tight {isDark
                ? 'text-white'
                : 'text-slate-900'}"
            >
              {toast.title}
            </h4>
          {/if}
          <p
            class="text-xs leading-snug {isDark
              ? 'text-slate-200/90'
              : 'text-slate-600'}"
          >
            {toast.message}
          </p>
        </div>

        <button
          type="button"
          onclick={() => alertStore.removeToast(toast.id)}
          class="shrink-0 p-1 rounded-lg transition-colors {isDark
            ? 'text-slate-400 hover:text-white hover:bg-white/10'
            : 'text-slate-400 hover:text-slate-600 hover:bg-black/5'}"
          aria-label="Tutup notifikasi"
        >
          <X class="w-4 h-4" />
        </button>

        <!-- SUBTLE GLOWING PROGRESS BAR FADEOUT TIMER -->
        {#if toast.duration > 0}
          <div
            class="absolute bottom-0 left-0 right-0 h-[2.5px] {isDark
              ? 'bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400 shadow-[0_0_6px_rgba(56,189,248,0.5)]'
              : 'bg-brand-blue/40'}"
            style="animation: toastProgress {toast.duration}ms linear forwards;"
          ></div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* ==========================================================================
     AUTHENTIC GLASSMORPHISM SPECIFICATIONS (EXPLICIT CROSS-BROWSER BLUR)
     ========================================================================== */

  /* Dark Frosted Glass (Kristal Obsidian Modern untuk Notifikasi Transparan) */
  :global(.glass-dark-card) {
    background: rgba(15, 23, 42, 0.62) !important;
    background-image: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.12) 0%,
      rgba(255, 255, 255, 0.03) 40%,
      rgba(15, 23, 42, 0.65) 100%
    ) !important;
    backdrop-filter: blur(20px) saturate(200%) !important;
    -webkit-backdrop-filter: blur(20px) saturate(200%) !important;
    border: 1px solid rgba(255, 255, 255, 0.18) !important;
    box-shadow:
      0 16px 40px -6px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(255, 255, 255, 0.08),
      inset 0 1px 1px 0 rgba(255, 255, 255, 0.28) !important;
    color: #ffffff !important;
  }

  /* Light Frosted Glass (Kaca Transparan Terang) */
  :global(.glass-light-card) {
    background: rgba(255, 255, 255, 0.70) !important;
    background-image: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.6) 0%,
      rgba(255, 255, 255, 0.3) 100%
    ) !important;
    backdrop-filter: blur(20px) saturate(190%) !important;
    -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
    border: 1px solid rgba(255, 255, 255, 0.6) !important;
    box-shadow:
      0 14px 38px -6px rgba(15, 23, 42, 0.14),
      inset 0 1px 1px 0 rgba(255, 255, 255, 0.85) !important;
    color: #0f172a !important;
  }

  /* Frosted Glass Icon Badge */
  :global(.glass-icon-dark) {
    background: rgba(255, 255, 255, 0.10) !important;
    border: 1px solid rgba(255, 255, 255, 0.18) !important;
    box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.2) !important;
  }

  /* Frosted Glass Modal Dialog */
  :global(.glass-modal-card) {
    background: rgba(255, 255, 255, 0.88) !important;
    background-image: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.95) 0%,
      rgba(255, 255, 255, 0.80) 100%
    ) !important;
    backdrop-filter: blur(28px) saturate(190%) !important;
    -webkit-backdrop-filter: blur(28px) saturate(190%) !important;
    border: 1px solid rgba(255, 255, 255, 0.7) !important;
    box-shadow:
      0 25px 60px -12px rgba(15, 23, 42, 0.28),
      inset 0 1px 0 0 rgba(255, 255, 255, 0.95) !important;
  }

  /* Frosted Glass Backdrop Overlay */
  :global(.glass-backdrop) {
    background: rgba(15, 23, 42, 0.45) !important;
    backdrop-filter: blur(14px) !important;
    -webkit-backdrop-filter: blur(14px) !important;
  }

  /* ==========================================================================
     ANIMATIONS & KEYFRAMES
     ========================================================================== */
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes scaleUp {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-14px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes toastProgress {
    from {
      width: 100%;
    }
    to {
      width: 0%;
    }
  }

  .animate-fade-in {
    animation: fadeIn 0.18s ease-out forwards;
  }

  .animate-scale-up {
    animation: scaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .animate-slide-in {
    animation: slideIn 0.24s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
</style>
