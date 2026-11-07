<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import {
    KeyRound,
    ArrowRight,
    ShieldCheck,
    CheckCircle2,
    AlertCircle,
    Crown,
    Users,
    Trash2,
    Wifi,
    WifiOff
  } from "lucide-svelte";
  import { authStore, type ActiveUser } from "$lib/stores/authStore.svelte";
  import { api } from "$lib/services/api";

  interface SavedAccount {
    id: string;
    fullName: string;
    username: string;
    email?: string;
    role: string;
    branchId: string;
    branchName: string;
    avatarUrl?: string;
    lastLoginAt: number;
    token?: string;
    tenantId?: string;
    permissions?: string[];
    pin?: string;
  }

  // Svelte 5 Runes
  let users = $state<ActiveUser[]>([]);
  let branches = $state<any[]>([]);
  let savedAccounts = $state<SavedAccount[]>([]);

  // Auth Mode: "GOOGLE" (Default) | "PIN" (Kasir Cepat/Offline)
  let activeTab = $state<"GOOGLE" | "PIN">("GOOGLE");

  // Google Form State
  let googleConfig = $state<{ clientId: string; isConfigured: boolean }>({
    clientId: "",
    isConfigured: false
  });

  // PIN Form State
  let selectedBranchId = $state("1");
  let selectedUserId = $state<string>("");
  let inputPin = $state("");
  let pinError = $state("");
  let isSubmitting = $state(false);
  let successMessage = $state("");
  let isOffline = $state(false);

  // Daftar akun yang tersedia untuk opsi pilihan akun di tab PIN
  let availableAccounts = $derived.by(() => {
    const list: {
      id: string;
      fullName: string;
      username: string;
      email?: string;
      role: string;
      branchId: string;
      branchName: string;
      avatarUrl?: string;
      pin?: string;
      isSaved?: boolean;
    }[] = [];
    const seen = new Set<string>();

    // 1. Akun yang tersimpan di perangkat ini (prioritas teratas)
    for (const acc of savedAccounts) {
      if (acc && acc.id && !seen.has(acc.id)) {
        seen.add(acc.id);
        list.push({
          id: acc.id,
          fullName: acc.fullName,
          username: acc.username,
          email: acc.email,
          role: acc.role,
          branchId: acc.branchId,
          branchName: acc.branchName,
          avatarUrl: acc.avatarUrl,
          pin: acc.pin,
          isSaved: true
        });
      }
    }

    // 2. Akun terdaftar dari database
    for (const u of users) {
      if (u && u.id && !seen.has(u.id)) {
        seen.add(u.id);
        list.push({
          id: u.id,
          fullName: u.fullName,
          username: u.username,
          email: u.email,
          role: u.role,
          branchId: u.branchId,
          branchName: u.branchName,
          avatarUrl: u.avatarUrl,
          pin: u.pin,
          isSaved: false
        });
      }
    }

    return list;
  });

  let selectedAccount = $derived(
    availableAccounts.find((a) => a.id === selectedUserId) || (availableAccounts.length > 0 ? availableAccounts[0] : null)
  );

  $effect(() => {
    if (!selectedUserId && availableAccounts.length > 0) {
      selectedUserId = availableAccounts[0].id;
    }
  });

  function loadSavedAccounts(): SavedAccount[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("apoteku_saved_accounts");
      if (!raw) return [];
      const list: SavedAccount[] = JSON.parse(raw);
      return Array.isArray(list) ? list.filter((a) => a && a.id && a.fullName) : [];
    } catch {
      return [];
    }
  }

  function saveAccountToRecent(user: any, token?: string) {
    if (typeof window === "undefined" || !user || !user.id) return;
    try {
      let list = loadSavedAccounts();
      const existing = list.find((a) => a.id === user.id || (user.email && a.email === user.email));
      list = list.filter((a) => a.id !== user.id && (user.email ? a.email !== user.email : true));
      const cleanAvatar = user.avatarUrl && !user.avatarUrl.includes("unsplash.com") ? user.avatarUrl : undefined;
      list.unshift({
        id: user.id,
        fullName: user.fullName || "Pengguna",
        username: user.username || "",
        email: user.email,
        role: user.role || "GUEST",
        branchId: user.branchId || "1",
        branchName: user.branchName || "Apotek Hafidz Farma",
        avatarUrl: cleanAvatar,
        lastLoginAt: Date.now(),
        token: token || user.token || existing?.token,
        tenantId: user.tenantId || existing?.tenantId || "tenant-hafidz-farma",
        permissions: user.permissions || existing?.permissions,
        pin: user.pin || existing?.pin
      });
      list = list.slice(0, 5);
      localStorage.setItem("apoteku_saved_accounts", JSON.stringify(list));
      savedAccounts = list;
    } catch (e) {
      console.error("Failed to save recent account:", e);
    }
  }

  function handleSelectSavedAccount(acc: SavedAccount) {
    isSubmitting = true;
    pinError = "";

    // Sinkronisasi dengan data terbaru jika sudah dimuat dari API users
    const dbUser = users.find(
      (u) =>
        u.id === acc.id ||
        (acc.email && u.email && u.email.toLowerCase() === acc.email.toLowerCase()) ||
        (acc.username && u.username && u.username.toLowerCase() === acc.username.toLowerCase())
    );

    const activeRole = (dbUser?.role || acc.role || "GUEST") as any;

    const activeUser: ActiveUser = {
      id: dbUser?.id || acc.id,
      username: dbUser?.username || acc.username,
      fullName: dbUser?.fullName || acc.fullName,
      email: dbUser?.email || acc.email || "",
      role: activeRole,
      tenantId: dbUser?.tenantId || acc.tenantId || "tenant-hafidz-farma",
      branchId: dbUser?.branchId || acc.branchId || "1",
      branchName: dbUser?.branchName || acc.branchName || "Apotek Hafidz Farma Pusat",
      pin: dbUser?.pin || acc.pin || "",
      avatarUrl: dbUser?.avatarUrl || acc.avatarUrl,
      isActive: true,
      permissions:
        activeRole === "SUPERADMIN" || activeRole === "OWNER"
          ? ["*"]
          : activeRole === "GUEST"
            ? []
            : (dbUser?.permissions || acc.permissions || ["pos:read", "pos:write", "stok:read"])
    };

    const token =
      acc.token ||
      (authStore.user?.id === activeUser.id && authStore.accessToken
        ? authStore.accessToken
        : `session-${activeUser.id}-${Date.now()}`);

    authStore.setUserSession(activeUser, {
      access: token,
      refresh: `refresh-${activeUser.id}`
    });

    saveAccountToRecent(activeUser, token);

    successMessage = `Selamat datang kembali, ${activeUser.fullName}! Mengalihkan...`;

    setTimeout(() => {
      if (activeUser.role === "GUEST") {
        goto("/pengaturan?tab=profil");
      } else if (activeUser.role === "CASHIER") {
        goto("/pos");
      } else {
        goto("/");
      }
    }, 250);
  }

  function handleAccountCardClick(acc: SavedAccount) {
    if (isOffline) {
      // Saat offline, langsung alihkan ke tab PIN dengan akun terpilih!
      selectedUserId = acc.id;
      inputPin = "";
      pinError = "";
      activeTab = "PIN";
      return;
    }

    handleSelectSavedAccount(acc);
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (activeTab !== "PIN") return;

    // Abaikan ketikan jika user sedang berada di elemen select atau input teks
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "select" || (tag === "input" && (e.target as HTMLElement)?.id !== "pinInputRaw")) {
      return;
    }

    if (e.key >= "0" && e.key <= "9") {
      handlePinKeypad(e.key);
    } else if (e.key === "Backspace") {
      handlePinBackspace();
    } else if (e.key === "Enter") {
      const form = document.getElementById("pinLoginForm") as HTMLFormElement;
      form?.requestSubmit();
    }
  }

  function removeSavedAccount(accountId: string) {
    try {
      savedAccounts = savedAccounts.filter((a) => a.id !== accountId);
      localStorage.setItem("apoteku_saved_accounts", JSON.stringify(savedAccounts));
    } catch (e) {
      console.error("Failed to remove account:", e);
    }
  }

  onMount(async () => {
    // 0. Network Online / Offline Detection
    isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false;

    // 1. Check if returning from Google OAuth Redirect callback
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("google_success") === "true") {
        const token = urlParams.get("token");
        const userDataRaw = urlParams.get("user_data");
        if (token && userDataRaw) {
          try {
            const user = JSON.parse(decodeURIComponent(userDataRaw));
            authStore.setUserSession(user, { access: token, refresh: `refresh-${user.id}` });
            saveAccountToRecent(user, token);
            successMessage = user.isFirstUser
              ? `Selamat datang, ${user.fullName}! Akun Google Anda otomatis ditetapkan sebagai SUPER ADMIN (Level Teratas).`
              : user.role === "GUEST"
                ? `Selamat datang, ${user.fullName}! Akun Anda terdaftar sebagai Tamu (Guest). Silakan menunggu pemberian hak akses dari Administrator.`
                : `Selamat datang kembali, ${user.fullName}! Mengalihkan...`;

            window.history.replaceState({}, document.title, window.location.pathname);

            setTimeout(() => {
              if (user.role === "GUEST") {
                goto("/pengaturan?tab=profil");
              } else if (user.role === "CASHIER") {
                goto("/pos");
              } else {
                goto("/");
              }
            }, 400);
            return;
          } catch (e) {
            console.error("Gagal membaca sesi pengguna:", e);
          }
        }
      } else if (urlParams.get("error")) {
        pinError = decodeURIComponent(urlParams.get("error") || "Gagal masuk menggunakan Google");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    // Load saved accounts from localStorage
    savedAccounts = loadSavedAccounts();

    try {
      const [userRes, branchRes, gCfgRes] = await Promise.all([
        api.users.list().catch(() => null),
        api.branches.list().catch(() => null),
        api.auth.getGoogleConfig().catch(() => null)
      ]);
      if (userRes?.success && Array.isArray(userRes.data)) {
        users = userRes.data;
      }
      if (branchRes?.success && Array.isArray(branchRes.data) && branchRes.data.length > 0) {
        branches = branchRes.data;
        selectedBranchId = branchRes.data[0]?.id || "1";
      }
      if (gCfgRes?.success && gCfgRes.data) {
        googleConfig = gCfgRes.data;
      }
    } catch (e) {
      console.warn("Failed to fetch initial login data:", e);
    }
  });

  function handleGoogleButtonClick(emailHint?: string) {
    pinError = "";
    isSubmitting = true;

    const clientId =
      googleConfig.clientId ||
      "";

    const redirectUri = "http://localhost:5173/api/auth/google/callback";

    let loginUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      clientId
    )}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=openid%20profile%20email&prompt=select_account`;

    if (emailHint) {
      loginUrl += `&login_hint=${encodeURIComponent(emailHint)}`;
    }

    window.location.href = loginUrl;
  }

  async function handlePinLogin(e?: SubmitEvent) {
    if (e) e.preventDefault();
    pinError = "";

    if (inputPin.length < 4) {
      pinError = "PIN harus terdiri dari minimal 4 digit angka.";
      return;
    }

    const currentAcc = selectedAccount;
    if (!currentAcc) {
      pinError = "Silakan pilih akun pengguna terlebih dahulu.";
      return;
    }

    isSubmitting = true;

    // Mapping PIN default per peran apotek jika belum pernah kustomisasi PIN
    const rolePinMap: Record<string, string> = {
      SUPERADMIN: "123456",
      OWNER: "888888",
      PHARMACIST: "112233",
      CASHIER: "654321",
      INVENTORY: "777777",
      FINANCE: "999999",
      GUEST: "123456"
    };

    const targetRole = (currentAcc.role || "CASHIER").toUpperCase();
    const expectedPin = currentAcc.pin || rolePinMap[targetRole] || "123456";

    // 1. VALIDASI SAAT MODE OFFLINE (Lokal tanpa request backend)
    if (isOffline) {
      if (inputPin.trim() !== expectedPin.trim()) {
        isSubmitting = false;
        pinError = `PIN salah untuk akun ${currentAcc.fullName}.`;
        return;
      }

      // PIN valid! Aktifkan sesi akun terpilih secara offline
      isSubmitting = false;
      const targetSaved: SavedAccount = {
        id: currentAcc.id,
        fullName: currentAcc.fullName,
        username: currentAcc.username,
        email: currentAcc.email,
        role: currentAcc.role,
        branchId: currentAcc.branchId || selectedBranchId || "1",
        branchName: currentAcc.branchName || "Apotek Hafidz Farma",
        avatarUrl: currentAcc.avatarUrl,
        pin: inputPin.trim(),
        lastLoginAt: Date.now()
      };

      handleSelectSavedAccount(targetSaved);
      return;
    }

    // 2. VALIDASI SAAT MODE ONLINE (Kirim identifier akun terpilih ke API)
    const identifier = currentAcc.username || currentAcc.email || currentAcc.id;
    const res = await authStore.loginWithApi(identifier, inputPin, selectedBranchId);
    isSubmitting = false;

    if (res.success) {
      if (authStore.user) {
        saveAccountToRecent(authStore.user, authStore.accessToken || undefined);
      }
      successMessage = `PIN Terverifikasi. Selamat bertugas, ${authStore.user?.fullName}!`;
      setTimeout(() => {
        if (authStore.user?.role === "GUEST") {
          goto("/pengaturan?tab=profil");
        } else if (authStore.user?.role === "CASHIER") {
          goto("/pos");
        } else {
          goto("/");
        }
      }, 300);
    } else {
      pinError = res.error || `PIN tidak cocok untuk akun ${currentAcc.fullName}.`;
    }
  }

  function handlePinKeypad(digit: string) {
    if (inputPin.length < 6) {
      inputPin += digit;
      pinError = "";
      if (inputPin.length === 6) {
        setTimeout(() => {
          const form = document.getElementById("pinLoginForm") as HTMLFormElement;
          form?.requestSubmit();
        }, 120);
      }
    }
  }

  function handlePinBackspace() {
    inputPin = inputPin.slice(0, -1);
  }
</script>

<svelte:head>
  <title>Login &bull; Hafidz Farma</title>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</svelte:head>

<svelte:window
  ononline={() => (isOffline = false)}
  onoffline={() => (isOffline = true)}
  onkeydown={handleWindowKeydown}
/>

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
    <!-- Header with Hafidz Farma Logo & Connection Status -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <div class="inline-flex items-center justify-center max-w-[200px] mx-auto">
          <img
            src="/img/brand.png"
            alt="Apotek Hafidz Farma"
            class="h-28 w-auto object-contain"
          />
        </div>
      </div>
    </div>

    <!-- TAB SWITCHER: GOOGLE VS PIN -->
    <div class="grid grid-cols-2 gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200">
      <button
        type="button"
        onclick={() => { activeTab = "GOOGLE"; pinError = ""; }}
        class="py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer {activeTab === 'GOOGLE'
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
        class="py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer {activeTab === 'PIN'
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
        <!-- List Akun yang Pernah Masuk di Perangkat Ini -->
        {#if savedAccounts.length > 0}
          <div class="space-y-2">
            <div class="flex items-center justify-between pb-1 px-4 border-b border-slate-100">
              <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Users class="w-3.5 h-3.5 text-brand-blue" />
                <span>Pilih Akun Tersimpan</span>
              </span>
              <span class="text-[10px] text-slate-400 font-medium">{savedAccounts.length} akun</span>
            </div>

            <div class="space-y-2 max-h-56 overflow-y-auto pr-0.5">
              {#each savedAccounts as acc}
                <div class="p-2.5 bg-slate-50/80 hover:bg-blue-50/70 border border-slate-200/80 hover:border-brand-blue/40 rounded-2xl transition-all shadow-2xs flex items-center justify-between gap-2.5 group">
                  <button
                    type="button"
                    onclick={() => handleAccountCardClick(acc)}
                    disabled={isSubmitting}
                    class="flex items-center gap-2.5 flex-1 text-left cursor-pointer min-w-0 disabled:opacity-50"
                    title={isOffline ? "Klik untuk verifikasi PIN 6-digit (Mode Offline)" : "Klik untuk langsung masuk ke aplikasi"}
                  >
                    <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-brand-blue to-cyan-500 text-white flex items-center justify-center font-bold text-xs ring-2 ring-blue-100 overflow-hidden flex-shrink-0">
                      {#if acc.avatarUrl}
                        <img
                          src={acc.avatarUrl}
                          alt={acc.fullName}
                          class="w-full h-full object-cover"
                          onerror={(e) => ((e.currentTarget as HTMLElement).style.display = 'none')}
                        />
                      {:else}
                        <span>{acc.fullName.slice(0, 2).toUpperCase()}</span>
                      {/if}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5">
                        <span class="truncate">{acc.fullName}</span>
                        <span class="px-1.5 py-0.2 rounded text-[9px] font-black flex-shrink-0 {acc.role === 'SUPERADMIN' ? 'bg-blue-100 text-blue-800' : acc.role === 'OWNER' ? 'bg-amber-100 text-amber-800' : acc.role === 'GUEST' ? 'bg-amber-100 text-amber-900 border border-amber-300' : acc.role === 'PHARMACIST' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'}">
                          {acc.role}
                        </span>
                      </div>
                      <div class="text-[10px] text-slate-500 truncate mt-0.5 flex items-center gap-1.5">
                        <span class="truncate">{acc.email || `@${acc.username}`}</span>
                        <span>&bull;</span>
                        <span class="text-brand-blue font-semibold truncate">{acc.branchName || "Cabang Pusat"}</span>
                      </div>
                    </div>
                    {#if isOffline}
                      <div class="flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 group-hover:bg-amber-200 px-2 py-0.5 rounded-lg border border-amber-300 flex-shrink-0 transition-colors">
                        <KeyRound class="w-3.5 h-3.5 text-amber-700" />
                        <span>Ketik PIN</span>
                      </div>
                    {:else}
                      <div class="flex items-center gap-1 text-[11px] font-bold text-brand-blue opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all flex-shrink-0">
                        <span>Masuk</span>
                        <ArrowRight class="w-3.5 h-3.5 text-brand-blue" />
                      </div>
                    {/if}
                  </button>

                  <button
                    type="button"
                    onclick={(e) => { e.stopPropagation(); removeSavedAccount(acc.id); }}
                    class="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer flex-shrink-0"
                    title="Hapus akun dari daftar perangkat ini"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Google OAuth Button -->
        {#if isOffline}
          <div class="p-3.5 bg-slate-100/90 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center justify-center gap-2.5 text-center">
            <WifiOff class="w-4 h-4 text-slate-500 flex-shrink-0" />
            <span class="text-[11px]">Google OAuth dinonaktifkan saat offline. Silakan pilih akun tersimpan di atas atau gunakan tab <strong>PIN (6-Digit)</strong>.</span>
          </div>
        {:else}
          <button
            type="button"
            disabled={isSubmitting}
            onclick={() => handleGoogleButtonClick()}
            class="w-full py-3.5 px-4 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-2xl text-xs sm:text-sm border border-slate-300 shadow-sm flex items-center justify-center gap-3 transition-all hover:shadow hover:border-slate-400 disabled:opacity-50 cursor-pointer"
          >
            <!-- Google G SVG -->
            <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"/>
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"/>
            </svg>
            {#if isSubmitting}
              <div class="w-4 h-4 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div>
              <span>Menghubungkan ke Google...</span>
            {:else if savedAccounts.length > 0}
              <span>Masuk dengan Akun Google Lainnya</span>
            {:else}
              <span>Lanjutkan dengan Google Workspace</span>
            {/if}
          </button>
        {/if}

        {#if users.length === 0}
          <div class="p-3.5 bg-blue-50/90 rounded-2xl border border-blue-200/80 flex items-start gap-2.5 text-xs text-blue-950">
            <Crown class="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div class="space-y-0.5">
              <div class="font-bold text-blue-900">Inisialisasi Sistem Baru</div>
              <div class="text-[11px] text-blue-800 leading-relaxed">
                Database saat ini belum memiliki pengguna. Pengguna yang pertama kali login akan otomatis ditetapkan sebagai <strong>SUPER ADMIN (Level Teratas)</strong>.
              </div>
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <!-- TAB 2: PIN 6-DIGIT KASIR LOGIN -->
      <form id="pinLoginForm" onsubmit={handlePinLogin} class="space-y-4">
        <!-- Preview Kartu Akun Terpilih -->
        {#if selectedAccount}
          <div class="p-2.5 bg-slate-50/90 border border-slate-200/90 rounded-2xl flex items-center justify-between gap-2.5">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-blue to-cyan-500 text-white flex items-center justify-center font-bold text-xs ring-1 ring-blue-100 overflow-hidden flex-shrink-0">
                {#if selectedAccount.avatarUrl}
                  <img
                    src={selectedAccount.avatarUrl}
                    alt={selectedAccount.fullName}
                    class="w-full h-full object-cover"
                    onerror={(e) => ((e.currentTarget as HTMLElement).style.display = 'none')}
                  />
                {:else}
                  <span>{selectedAccount.fullName.slice(0, 2).toUpperCase()}</span>
                {/if}
              </div>
              <div class="min-w-0">
                <div class="text-xs font-bold text-slate-800 truncate">{selectedAccount.fullName}</div>
                <div class="text-[10px] text-slate-500 truncate">{selectedAccount.email || `@${selectedAccount.username}`}</div>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded text-[9px] font-black flex-shrink-0 {selectedAccount.role === 'SUPERADMIN' ? 'bg-blue-100 text-blue-800' : selectedAccount.role === 'OWNER' ? 'bg-amber-100 text-amber-800' : selectedAccount.role === 'GUEST' ? 'bg-amber-100 text-amber-900 border border-amber-300' : selectedAccount.role === 'PHARMACIST' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'}">
              {selectedAccount.role}
            </span>
          </div>
        {/if}

        <!-- PIN Display Dots -->
        <div class="space-y-1.5 pt-0.5">
          <span class="block text-xs font-bold text-slate-700 text-center">
            {isOffline ? 'Masukkan PIN 6-Digit (Mode Offline)' : 'Masuk dengan PIN (6 Digit)'}
          </span>
          <div class="flex items-center justify-center gap-2 py-1.5">
            {#each Array(6) as _, idx}
              <div
                class="w-8 h-10 rounded-xl border-2 flex items-center justify-center text-lg font-mono font-bold transition-all {idx < inputPin.length
                  ? (isOffline ? 'border-amber-500 bg-amber-50 text-amber-700 scale-105' : 'border-[#df1c2d] bg-red-50 text-[#df1c2d] scale-105')
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
              class="h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold text-base transition-colors cursor-pointer"
            >
              {num}
            </button>
          {/each}
          <button
            type="button"
            onclick={() => (inputPin = "")}
            class="h-10 rounded-xl bg-slate-100 hover:bg-red-100 text-red-600 font-bold text-xs transition-colors cursor-pointer"
          >
            Hapus
          </button>
          <button
            type="button"
            onclick={() => handlePinKeypad("0")}
            class="h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold text-base transition-colors cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onclick={handlePinBackspace}
            class="h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
          >
            &larr;
          </button>
        </div>
        
        <!-- SELECT PILIH AKUN PENGGUNA -->
        <div class="space-y-1.5 text-left">
          <label for="select-account-pin" class="block text-xs font-bold text-slate-700 text-center">
            Pilih Akun Pengguna
          </label>
          <div class="relative">
            <select
              id="select-account-pin"
              bind:value={selectedUserId}
              onchange={() => {
                inputPin = "";
                pinError = "";
              }}
              class="w-full py-2.5 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition-all cursor-pointer"
            >
              {#if availableAccounts.length === 0}
                <option value="" disabled>Belum ada akun terdaftar</option>
              {:else}
                {#each availableAccounts as acc}
                  <option value={acc.id}>
                    {acc.fullName} ({acc.role}) {acc.branchName ? `• ${acc.branchName}` : ''}
                  </option>
                {/each}
              {/if}
            </select>
          </div>
        </div>

        <!-- Submit PIN Button -->
        <button
          type="submit"
          disabled={isSubmitting || inputPin.length < 4}
          class="w-full py-2.5 px-4 font-bold rounded-xl text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-2 cursor-pointer {isOffline
            ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20'
            : 'bg-[#df1c2d] hover:bg-[#c91827] text-white shadow-red-600/20'}"
        >
          {#if isSubmitting}
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Memverifikasi PIN...</span>
          {:else}
            <span>{isOffline ? 'Verifikasi PIN & Masuk Offline' : 'Verifikasi PIN & Masuk Kasir'}</span>
            <ArrowRight class="w-4 h-4" />
          {/if}
        </button>
      </form>
    {/if}

    <!-- INFORMASI PENDAFTARAN OTOMATIS -->
    <div class="pt-2 border-t border-slate-100 text-center text-xs text-slate-500">
      <span>Staf baru? Cukup klik <strong class="text-slate-700">Lanjutkan dengan Google</strong> di atas untuk registrasi instan tanpa formulir. Hak akses akan ditentukan oleh Admin.</span>
    </div>

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
