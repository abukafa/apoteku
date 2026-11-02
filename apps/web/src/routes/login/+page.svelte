<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import {
    Store,
    KeyRound,
    Lock,
    Eye,
    EyeOff,
    ArrowRight,
    ShieldCheck,
    CheckCircle2,
    AlertCircle,
    UserCheck,
    Sparkles,
    WifiOff
  } from "lucide-svelte";
  import { authStore, type ActiveUser } from "$lib/stores/authStore.svelte";
  import usersData from "$lib/mocks/users.json";
  import branchesData from "$lib/mocks/branches.json";

  // Svelte 5 Runes
  let users = $state<ActiveUser[]>(usersData as ActiveUser[]);
  let branches = $state(branchesData);

  // Auth Mode: "GOOGLE" (Default) | "PIN" (Kasir Cepat/Offline)
  let activeTab = $state<"GOOGLE" | "PIN">("GOOGLE");

  // Google Form State
  let selectedGoogleEmail = $state(users[0]?.email || "");

  // PIN Form State
  let selectedBranchId = $state("1");
  let inputPin = $state("");
  let pinError = $state("");
  let isSubmitting = $state(false);
  let successMessage = $state("");

  // Role Formatter
  function formatRole(role: string) {
    switch (role) {
      case "SUPERADMIN":
        return { label: "Admin Sistem", badge: "bg-blue-100 text-blue-800 border-blue-200" };
      case "OWNER":
        return { label: "Pemilik / Direktur", badge: "bg-amber-100 text-amber-800 border-amber-200" };
      case "PHARMACIST":
        return { label: "Apoteker PJ", badge: "bg-purple-100 text-purple-800 border-purple-200" };
      case "CASHIER":
        return { label: "Kasir Farmasi", badge: "bg-emerald-100 text-emerald-800 border-emerald-200" };
      case "INVENTORY_STAFF":
        return { label: "Staf Gudang", badge: "bg-slate-100 text-slate-800 border-slate-200" };
      default:
        return { label: role, badge: "bg-slate-100 text-slate-700 border-slate-200" };
    }
  }

  function handleGoogleLogin(emailToUse?: string) {
    const targetEmail = emailToUse || selectedGoogleEmail;
    pinError = "";
    isSubmitting = true;

    setTimeout(() => {
      isSubmitting = false;
      const success = authStore.loginWithGoogle(targetEmail);
      if (success) {
        successMessage = `Selamat datang, ${authStore.user?.fullName}! Mengalihkan...`;
        setTimeout(() => {
          if (authStore.user?.role === "CASHIER") {
            goto("/pos");
          } else {
            goto("/");
          }
        }, 300);
      } else {
        pinError = "Akun Google tidak terdaftar di sistem Apoteku.";
      }
    }, 350);
  }

  function handlePinLogin(e: SubmitEvent) {
    e.preventDefault();
    pinError = "";

    if (inputPin.length < 6) {
      pinError = "PIN harus terdiri dari 6 digit angka.";
      return;
    }

    isSubmitting = true;

    setTimeout(() => {
      isSubmitting = false;
      const success = authStore.loginWithPin(inputPin, selectedBranchId);
      if (success) {
        successMessage = `PIN Terverifikasi. Selamat bertugas, ${authStore.user?.fullName}!`;
        setTimeout(() => {
          if (authStore.user?.role === "CASHIER") {
            goto("/pos");
          } else {
            goto("/");
          }
        }, 300);
      } else {
        pinError = "PIN 6-digit tidak cocok atau tidak terdaftar di cabang ini.";
      }
    }, 300);
  }

  function handlePinKeypad(digit: string) {
    if (inputPin.length < 6) {
      inputPin += digit;
    }
  }

  function handlePinBackspace() {
    inputPin = inputPin.slice(0, -1);
  }
</script>

<svelte:head>
  <title>Login</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-[#091b42] via-[#0d2a6b] to-[#071638] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans text-slate-800">
  <!-- Pharmacy Interior Wallpaper Overlay -->
  <div class="absolute inset-0 z-0 opacity-15 mix-blend-luminosity pointer-events-none">
    <img
      src="/img/banner.png"
      alt="Apotek Background"
      class="w-full h-full object-cover"
    />
  </div>

  <!-- Decorative Gradient Glows -->
  <div class="absolute -top-40 -left-40 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>
  <div class="absolute -bottom-40 -right-40 w-96 h-96 bg-red-500/15 rounded-full blur-3xl pointer-events-none"></div>

  <!-- MAIN LOGIN CARD -->
  <div class="relative z-10 bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/60 p-6 sm:p-8 max-w-lg w-full space-y-5">
    <!-- Header with Hafidz Farma Logo -->
    <div class="text-center space-y-2">
      <div class="inline-flex items-center justify-center max-w-[210px] mx-auto">
        <img
          src="/img/brand.png"
          alt="Apotek Hafidz Farma"
          class="h-32 w-auto object-contain"
        />
      </div>
    </div>

    <!-- TAB SWITCHER: GOOGLE VS PIN -->
    <div class="grid grid-cols-2 gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200">
      <button
        type="button"
        onclick={() => { activeTab = "GOOGLE"; pinError = ""; }}
        class="py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 {activeTab === 'GOOGLE'
          ? 'bg-white text-[#0c2e7a] shadow-sm'
          : 'text-slate-600 hover:text-slate-900'}"
      >
        <!-- Google G SVG -->
        <svg class="w-4 h-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/>
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"/>
          <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"/>
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"/>
        </svg>
        <span>Google OAuth</span>
      </button>

      <button
        type="button"
        onclick={() => { activeTab = "PIN"; pinError = ""; }}
        class="py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 {activeTab === 'PIN'
          ? 'bg-white text-[#df1c2d] shadow-sm'
          : 'text-slate-600 hover:text-slate-900'}"
      >
        <KeyRound class="w-4 h-4 text-[#df1c2d]" />
        <span>PIN (6-Digit)</span>
      </button>
    </div>

    <!-- ALERTS -->
    {#if pinError}
      <div class="bg-red-50 text-red-800 border border-red-200 text-xs p-3 rounded-xl flex items-center gap-2">
        <AlertCircle class="w-4 h-4 text-[#df1c2d] flex-shrink-0" />
        <span>{pinError}</span>
      </div>
    {/if}

    {#if successMessage}
      <div class="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs p-3 rounded-xl flex items-center gap-2">
        <CheckCircle2 class="w-4 h-4 text-emerald-600 flex-shrink-0" />
        <span>{successMessage}</span>
      </div>
    {/if}

    <!-- TAB 1: GOOGLE OAUTH LOGIN -->
    {#if activeTab === "GOOGLE"}
      <div class="space-y-4">
        <!-- Choose Google account from mocks -->
        <div class="space-y-1.5 text-center">
          <label for="googleAccountSelect" class="block text-xs font-bold text-slate-700">
            Login dengan Google
          </label>
          <select
            id="googleAccountSelect"
            bind:value={selectedGoogleEmail}
            class="hidden w-full bg-[#f8faff] p-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:border-[#1d63d8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700 cursor-pointer"
          >
            {#each users as u}
              {@const roleInfo = formatRole(u.role)}
              <option value={u.email}>
                {u.fullName} ({roleInfo.label}) — {u.email}
              </option>
            {/each}
          </select>
        </div>

        <!-- Official Google OAuth Button -->
        <button
          type="button"
          disabled={isSubmitting}
          onclick={() => handleGoogleLogin()}
          class="w-full py-3 px-4 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-xl text-xs sm:text-sm border border-slate-300 shadow-sm flex items-center justify-center gap-3 transition-all hover:shadow hover:border-slate-400 disabled:opacity-50"
        >
          <!-- Google G SVG -->
          <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"/>
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"/>
          </svg>
          {#if isSubmitting}
            <span>Menghubungkan ke Google...</span>
          {:else}
            <span>Lanjutkan dengan Google Workspace</span>
          {/if}
        </button>

        <!-- Quick 1-Click Persona Accounts matching users.json -->
        <div class="pt-3 border-t border-slate-100 space-y-2">
          <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">
            Pilih Akun Testing
          </div>
          <div class="space-y-1.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
            {#each users as u}
              {@const r = formatRole(u.role)}
              <button
                type="button"
                onclick={() => handleGoogleLogin(u.email)}
                class="w-full p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/50 flex items-center justify-between text-left transition-all group"
              >
                <div class="flex items-center gap-2.5">
                  <img
                    src={u.avatarUrl}
                    alt={u.fullName}
                    class="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200"
                  />
                  <div>
                    <div class="text-xs font-bold text-slate-800 group-hover:text-blue-700">
                      {u.fullName}
                    </div>
                    <div class="text-[10px] text-slate-500">
                      {u.email} &bull; PIN: <code class="font-mono text-slate-700">{u.pin}</code>
                    </div>
                  </div>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded border {r.badge}">
                  {r.label}
                </span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    {:else}
      <!-- TAB 2: PIN 6-DIGIT KASIR LOGIN -->
      <form onsubmit={handlePinLogin} class="space-y-4">

        <!-- PIN Display Dots -->
        <div class="space-y-1.5">
          <span class="block text-xs font-bold text-slate-700 text-center">
            Masuk dengan PIN (6 Digit)
          </span>
          <div class="flex items-center justify-center gap-2 py-2">
            {#each Array(6) as _, idx}
              <div
                class="w-8 h-10 rounded-xl border-2 flex items-center justify-center text-lg font-mono font-bold transition-all {idx < inputPin.length
                  ? 'border-[#df1c2d] bg-red-50 text-[#df1c2d] scale-105'
                  : 'border-slate-200 bg-slate-50 text-slate-300'}"
              >
                {idx < inputPin.length ? "●" : ""}
              </div>
            {/each}
          </div>

          <!-- Hidden raw input for physical keyboard -->
          <input
            id="pinInputRaw"
            type="password"
            maxlength="6"
            bind:value={inputPin}
            class="sr-only"
            autocomplete="one-time-code"
          />
        </div>

        <!-- Virtual Keypad (0-9) for Touchscreen POS -->
        <div class="grid grid-cols-3 gap-2 max-w-[260px] mx-auto pt-1">
          {#each ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as num}
            <button
              type="button"
              onclick={() => handlePinKeypad(num)}
              class="h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold text-base transition-colors"
            >
              {num}
            </button>
          {/each}
          <button
            type="button"
            onclick={() => (inputPin = "")}
            class="h-10 rounded-xl bg-slate-100 hover:bg-red-100 text-red-600 font-bold text-xs transition-colors"
          >
            Hapus
          </button>
          <button
            type="button"
            onclick={() => handlePinKeypad("0")}
            class="h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold text-base transition-colors"
          >
            0
          </button>
          <button
            type="button"
            onclick={handlePinBackspace}
            class="h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
          >
            &larr;
          </button>
        </div>
        
        <!-- Branch selection -->
        <div class="space-y-1">
          <div class="relative">
            <Store class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <select
              id="pinBranchSelect"
              bind:value={selectedBranchId}
              class="w-full bg-[#f8faff] pl-9 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:border-[#df1c2d] focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 text-slate-700 cursor-pointer"
            >
              {#each branches as b}
                <option value={b.id}>{b.name} ({b.code})</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- Submit PIN Button -->
        <button
          type="submit"
          disabled={isSubmitting || inputPin.length < 6}
          class="w-full py-2.5 px-4 bg-[#df1c2d] hover:bg-[#c91827] text-white font-bold rounded-xl text-xs sm:text-sm shadow-md shadow-red-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-2"
        >
          {#if isSubmitting}
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Memverifikasi PIN...</span>
          {:else}
            <span>Verifikasi PIN & Masuk Kasir</span>
            <ArrowRight class="w-4 h-4" />
          {/if}
        </button>
      </form>
    {/if}

    <!-- SECURITY & COMPLIANCE BADGE -->
    <div class="pt-2 text-center text-[10px] text-slate-400 flex items-center justify-center gap-1.5 border-t border-slate-100">
      <ShieldCheck class="w-3.5 h-3.5 text-emerald-600" />
      <span>Sistem Terenkripsi SSL 256-bit</span>
    </div>
  </div>

  <!-- BOTTOM COPYRIGHT -->
  <div class="relative z-10 mt-6 text-center text-xs text-white/70">
    <div>&copy; 2026 Apoteku &bull; Powered by <a href="http://semangkamedia.github.io" target="_blank" class="text-blue-400 hover:underline">Semangkamedia</a></div>
  </div>
</div>
