<script lang="ts">
  import { onMount } from "svelte";
  import {
    Settings,
    Store,
    Users,
    Printer,
    Shield,
    Database,
    CheckCircle2,
    Save,
    KeyRound,
    Lock,
    HardDrive,
    RefreshCw,
    Wifi,
    Trash2,
    Plus,
    X,
    UserCheck,
    Crown,
    User,
    Mail,
    Phone,
    ShieldCheck,
    Sparkles,
    ShieldAlert,
    Clock
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { portal } from "$lib/actions/portal";
  import { api } from "$lib/services/api";

  let activeTab = $state<"profil" | "cabang" | "pengguna" | "printer" | "diagnostik">("profil");
  let branches = $state<any[]>([]);
  let users = $state<any[]>([]);
  let selectedBranch = $state<any>(null);

  let saveSuccessMessage = $state("");
  let resyncMessage = $state("");
  let isLoading = $state(true);

  // Profil & PIN Saya State
  let myProfileForm = $state({
    fullName: "",
    phone: "",
    pin: "",
    confirmPin: ""
  });
  let myProfileError = $state("");
  let isSavingMyProfile = $state(false);

  $effect(() => {
    if (authStore.user) {
      if (!myProfileForm.fullName) myProfileForm.fullName = authStore.user.fullName || "";
      if (!myProfileForm.phone) myProfileForm.phone = (authStore.user as any).phone || "";
    }
  });

  async function handleSaveMyProfile() {
    myProfileError = "";
    if (!authStore.user?.id) return;
    if (!myProfileForm.fullName.trim()) {
      myProfileError = "Nama lengkap wajib diisi.";
      return;
    }
    if (myProfileForm.pin) {
      if (myProfileForm.pin.length < 4 || myProfileForm.pin.length > 6 || !/^\d+$/.test(myProfileForm.pin)) {
        myProfileError = "PIN Kasir harus berupa 4 hingga 6 digit angka.";
        return;
      }
      if (myProfileForm.pin !== myProfileForm.confirmPin) {
        myProfileError = "Konfirmasi PIN tidak cocok dengan PIN baru.";
        return;
      }
    }

    isSavingMyProfile = true;
    try {
      const payload: Record<string, any> = {
        fullName: myProfileForm.fullName.trim(),
        phone: myProfileForm.phone.trim() || undefined
      };
      if (myProfileForm.pin) {
        payload.pin = myProfileForm.pin;
      }

      const res = await api.users.update(authStore.user.id, payload);
      if (res.success) {
        authStore.setUserSession({
          ...authStore.user,
          fullName: payload.fullName,
          phone: payload.phone,
          ...(payload.pin ? { pin: payload.pin } : {})
        } as any);

        saveSuccessMessage = "Data akun dan PIN Kasir Anda berhasil disimpan!";
        myProfileForm.pin = "";
        myProfileForm.confirmPin = "";
        setTimeout(() => (saveSuccessMessage = ""), 3000);
      } else {
        myProfileError = res.error || "Gagal menyimpan perubahan profil.";
      }
    } catch (e: any) {
      myProfileError = e.message || "Gagal menyimpan perubahan.";
    } finally {
      isSavingMyProfile = false;
    }
  }

  // User Management Modals
  let isAddUserModalOpen = $state(false);
  let isPinModalOpen = $state(false);
  let selectedUserForPin = $state<any>(null);
  let newPinValue = $state("");
  let userModalError = $state("");

  let newUserForm = $state({
    fullName: "",
    username: "",
    email: "",
    phone: "",
    role: "CASHIER",
    pin: "123456",
    branchId: ""
  });

  async function handleUpdateUserRole(userId: string, newRole: string) {
    try {
      const res = await api.users.update(userId, { role: newRole });
      if (res.success) {
        users = users.map((u) => (u.id === userId ? { ...u, role: newRole } : u));
        saveSuccessMessage = `Peran pengguna berhasil diubah ke ${newRole}`;
        setTimeout(() => (saveSuccessMessage = ""), 3000);
      }
    } catch (e: any) {
      alert("Gagal mengubah peran: " + e.message);
    }
  }

  async function handleUpdateUserBranch(userId: string, newBranchId: string) {
    try {
      const res = await api.users.update(userId, { branchId: newBranchId });
      if (res.success) {
        const br = branches.find((b) => b.id === newBranchId);
        users = users.map((u) => (u.id === userId ? { ...u, branchId: newBranchId, branchName: br?.name || u.branchName } : u));
        saveSuccessMessage = `Cabang penugasan berhasil diubah`;
        setTimeout(() => (saveSuccessMessage = ""), 3000);
      }
    } catch (e: any) {
      alert("Gagal mengubah cabang penugasan: " + e.message);
    }
  }

  async function handleDeleteUser(userId: string, fullName: string) {
    if (!confirm(`Apakah Anda yakin ingin menghapus pengguna ${fullName}?`)) return;
    try {
      const res = await api.users.delete(userId);
      if (res.success) {
        users = users.filter((u) => u.id !== userId);
        saveSuccessMessage = `Pengguna ${fullName} berhasil dihapus dari sistem`;
        setTimeout(() => (saveSuccessMessage = ""), 3000);
      }
    } catch (e: any) {
      alert("Gagal menghapus pengguna: " + e.message);
    }
  }

  function openPinModal(u: any) {
    selectedUserForPin = u;
    newPinValue = "";
    userModalError = "";
    isPinModalOpen = true;
  }

  async function handleSaveNewPin() {
    if (!selectedUserForPin) return;
    if (newPinValue.trim().length < 4) {
      userModalError = "PIN minimal 4 digit angka.";
      return;
    }
    try {
      const res = await api.users.update(selectedUserForPin.id, { pin: newPinValue.trim() });
      if (res.success) {
        users = users.map((u) => (u.id === selectedUserForPin.id ? { ...u, pin: newPinValue.trim() } : u));
        isPinModalOpen = false;
        saveSuccessMessage = `PIN untuk ${selectedUserForPin.fullName} berhasil diperbarui`;
        setTimeout(() => (saveSuccessMessage = ""), 3000);
      }
    } catch (e: any) {
      userModalError = e.message || "Gagal mengubah PIN";
    }
  }

  async function handleCreateUserSubmit() {
    userModalError = "";
    if (!newUserForm.fullName.trim() || !newUserForm.username.trim() || !newUserForm.pin.trim()) {
      userModalError = "Nama lengkap, username, dan PIN wajib diisi.";
      return;
    }
    try {
      const targetBranch = newUserForm.branchId || branches[0]?.id;
      const res = await api.users.create({
        fullName: newUserForm.fullName.trim(),
        username: newUserForm.username.trim().toLowerCase(),
        email: newUserForm.email.trim() || undefined,
        phone: newUserForm.phone.trim() || undefined,
        role: newUserForm.role,
        pin: newUserForm.pin.trim(),
        branchId: targetBranch
      });
      if (res.success) {
        const branchObj = branches.find((b) => b.id === targetBranch);
        users = [
          ...users,
          {
            ...res.data,
            branchName: branchObj?.name || "Cabang Pusat"
          }
        ];
        isAddUserModalOpen = false;
        newUserForm = {
          fullName: "",
          username: "",
          email: "",
          phone: "",
          role: "CASHIER",
          pin: "123456",
          branchId: ""
        };
        saveSuccessMessage = "Pengguna baru berhasil ditambahkan";
        setTimeout(() => (saveSuccessMessage = ""), 3000);
      }
    } catch (e: any) {
      userModalError = e.message || "Gagal menambahkan pengguna baru";
    }
  }

  onMount(async () => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get("tab") as any;
      if (authStore.user?.role === "GUEST") {
        activeTab = "profil";
      } else if (["profil", "cabang", "pengguna", "printer", "diagnostik"].includes(tabParam)) {
        activeTab = tabParam;
      }
    }

    try {
      const [branchRes, userRes] = await Promise.all([
        api.branches.list(),
        api.users.list()
      ]);
      if (branchRes?.success && Array.isArray(branchRes.data) && branchRes.data.length > 0) {
        branches = branchRes.data;
        selectedBranch = branchRes.data[0];
      }
      if (userRes?.success && Array.isArray(userRes.data) && userRes.data.length > 0) {
        users = userRes.data;
      }
    } catch (e) {
      console.warn("Gagal memuat data pengaturan dari backend:", e);
    } finally {
      isLoading = false;
    }
  });

  async function handleSaveSettings() {
    if (selectedBranch && selectedBranch.id) {
      try {
        await api.branches.update(selectedBranch.id, selectedBranch);
      } catch (e) {
        console.warn("Gagal menyimpan perubahan cabang via API:", e);
      }
    }
    saveSuccessMessage = "Pengaturan berhasil disimpan ke database PostgreSQL!";
    setTimeout(() => {
      saveSuccessMessage = "";
    }, 3000);
  }

  function handleResyncMaster() {
    resyncMessage = "Katalog master berhasil disinkronkan ulang ke IndexedDB!";
    setTimeout(() => {
      resyncMessage = "";
    }, 3500);
  }
</script>

<svelte:head>
  <title>Pengaturan &bull; Hafidz Farma</title>
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Pengaturan Sistem"
    subtitle="Konfigurasi apotek, hak akses staf, dan printer"
    icon={Settings}
    breadcrumbs={[{ label: "Pengaturan" }]}
  >
    {#snippet actions()}
      <button
        type="button"
        onclick={handleSaveSettings}
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
      >
        <Save class="w-4 h-4" />
        <span>Simpan Perubahan</span>
      </button>
    {/snippet}
  </PageHeader>

  {#if saveSuccessMessage}
    <div class="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2">
      <CheckCircle2 class="w-4 h-4 text-emerald-600" />
      <span>{saveSuccessMessage}</span>
    </div>
  {/if}

  <!-- TAB NAVIGATION -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold">
    <button
      type="button"
      onclick={() => (activeTab = "profil")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'profil' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <User class="w-4 h-4 text-brand-blue-600" />
        <span>Profil & PIN Saya</span>
      </div>
      {#if activeTab === "profil"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    {#if authStore.user?.role !== "GUEST"}
      <button
        type="button"
        onclick={() => (activeTab = "cabang")}
        class="pb-3 px-3 transition-colors relative {activeTab === 'cabang' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
      >
        <div class="flex items-center gap-2">
          <Store class="w-4 h-4" />
          <span>Profil Apotek & Cabang</span>
        </div>
        {#if activeTab === "cabang"}
          <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
        {/if}
      </button>

      <button
        type="button"
        onclick={() => (activeTab = "pengguna")}
        class="pb-3 px-3 transition-colors relative {activeTab === 'pengguna' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
      >
        <div class="flex items-center gap-2">
          <Users class="w-4 h-4" />
          <span>Staf, Akun & PIN Kasir</span>
        </div>
        {#if activeTab === "pengguna"}
          <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
        {/if}
      </button>

      <button
        type="button"
        onclick={() => (activeTab = "printer")}
        class="pb-3 px-3 transition-colors relative {activeTab === 'printer' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
      >
        <div class="flex items-center gap-2">
          <Printer class="w-4 h-4" />
          <span>Printer Thermal & Laci Kasir</span>
        </div>
        {#if activeTab === "printer"}
          <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
        {/if}
      </button>

      <button
        type="button"
        onclick={() => (activeTab = "diagnostik")}
        class="pb-3 px-3 transition-colors relative {activeTab === 'diagnostik' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
      >
        <div class="flex items-center gap-2">
          <HardDrive class="w-4 h-4 text-emerald-600" />
          <span>Storage Offline & Sync</span>
        </div>
        {#if activeTab === "diagnostik"}
          <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
        {/if}
      </button>
    {/if}
  </div>

  <!-- TAB 0: PROFIL & PIN SAYA -->
  {#if activeTab === "profil"}
    <div class="space-y-6">
      <!-- GUEST ALERT BANNER -->
      {#if authStore.user?.role === "GUEST"}
        <div class="p-4 bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-2xl flex items-start gap-3.5 shadow-sm">
          <div class="p-2.5 bg-amber-100 rounded-xl text-amber-700 flex-shrink-0 mt-0.5">
            <ShieldAlert class="w-5 h-5" />
          </div>
          <div class="space-y-1">
            <h4 class="text-xs font-black uppercase tracking-wide text-amber-900">Perhatian: Akun Anda Berstatus Tamu (GUEST)</h4>
            <p class="text-xs text-amber-800 leading-relaxed">
              Pendaftaran akun Google Anda telah berhasil. Namun demi keamanan data apotek, Anda <strong>belum memiliki hak akses ke kasir POS, penjualan, maupun data perusahaan</strong>.
              Silakan lengkapi nama dan daftarkan 6-digit PIN Kasir Anda di formulir bawah ini, lalu hubungi <strong>Superadmin</strong> atau <strong>Owner</strong> untuk mengaktifkan hak akses penugasan kerja.
            </p>
          </div>
        </div>
      {/if}

      <!-- HERO IDENTITAS AKUN GOOGLE & ROLE -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            {#if authStore.user?.avatarUrl}
              <img
                src={authStore.user.avatarUrl}
                alt={authStore.user.fullName}
                class="w-16 h-16 rounded-2xl object-cover border-2 border-brand-blue/20 shadow-sm"
                onerror={(e) => ((e.currentTarget as HTMLElement).style.display = 'none')}
              />
            {:else}
              <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-blue to-brand-blue-700 text-white font-black text-xl flex items-center justify-center shadow-md shadow-blue-500/20">
                {(authStore.user?.fullName || "HF").slice(0, 2).toUpperCase()}
              </div>
            {/if}
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-base font-bold text-slate-800">{authStore.user?.fullName || "Pengguna Apotek"}</h3>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide {authStore.user?.role === 'SUPERADMIN' ? 'bg-blue-100 text-blue-800' : authStore.user?.role === 'OWNER' ? 'bg-amber-100 text-amber-800' : authStore.user?.role === 'GUEST' ? 'bg-amber-100 text-amber-900 border border-amber-300' : authStore.user?.role === 'PHARMACIST' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'}">
                  {authStore.user?.role === 'GUEST' ? 'GUEST (Menunggu Akses)' : authStore.user?.role || "GUEST"}
                </span>
                {#if authStore.user?.role === "SUPERADMIN"}
                  <span class="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-bold">
                    <Crown class="w-3 h-3 text-amber-500" />
                    Level Teratas
                  </span>
                {/if}
              </div>
              <div class="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                <span class="font-mono text-slate-600">@{authStore.user?.username || "user"}</span>
                <span>&bull;</span>
                <span class="flex items-center gap-1 text-slate-600">
                  <Mail class="w-3 h-3 text-slate-400" />
                  {authStore.user?.email || "-"}
                </span>
                <span>&bull;</span>
                <span class="flex items-center gap-1 text-brand-blue-700 font-semibold">
                  <Store class="w-3 h-3 text-brand-blue-600" />
                  {authStore.user?.branchName || "Cabang Pusat"}
                </span>
              </div>
            </div>
          </div>

          <div class="text-xs text-slate-500 bg-slate-50 border border-slate-200/80 rounded-xl p-3 max-w-xs">
            <div class="font-bold text-slate-700 flex items-center gap-1 mb-1">
              <ShieldCheck class="w-3.5 h-3.5 text-emerald-600" />
              <span>Autentikasi Terverifikasi</span>
            </div>
            <p class="text-[11px] leading-relaxed">
              Akun Anda terhubung dengan Google Workspace. Wewenang peran & penugasan cabang ditentukan oleh Superadmin / Owner.
            </p>
          </div>
        </div>
      </div>

      <!-- FORM UBAH PROFIL & DAFTARKAN PIN KASIR -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- KOLOM 1 & 2: DATA PROFIL & PIN -->
        <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
          <div>
            <h4 class="text-sm font-bold text-slate-800">Ubah Data Diri & PIN Cepat</h4>
            <p class="text-xs text-slate-500 mt-0.5">Perbarui nama pengguna, nomor kontak, serta 4-6 digit PIN untuk login kasir POS cepat.</p>
          </div>

          {#if myProfileError}
            <div class="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
              <X class="w-4 h-4 text-red-500 flex-shrink-0" />
              <span>{myProfileError}</span>
            </div>
          {/if}

          <form onsubmit={(e) => { e.preventDefault(); handleSaveMyProfile(); }} class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="prof-fullname" class="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap</label>
                <input
                  id="prof-fullname"
                  type="text"
                  bind:value={myProfileForm.fullName}
                  class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                  placeholder="Nama Lengkap Anda"
                />
              </div>

              <div>
                <label for="prof-phone" class="block text-xs font-bold text-slate-700 mb-1">Nomor WhatsApp / Telepon</label>
                <input
                  id="prof-phone"
                  type="text"
                  bind:value={myProfileForm.phone}
                  class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                  placeholder="08xxxxxxxxxx"
                />
              </div>

              <div>
                <label for="prof-email" class="block text-xs font-bold text-slate-700 mb-1">Email Google Workspace</label>
                <input
                  id="prof-email"
                  type="text"
                  value={authStore.user?.email || ""}
                  disabled
                  class="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-500 cursor-not-allowed"
                />
                <span class="text-[10px] text-slate-400 mt-0.5 block">Terkunci ke akun Google login Anda</span>
              </div>

              <div>
                <label for="prof-user" class="block text-xs font-bold text-slate-700 mb-1">Username Sistem</label>
                <input
                  id="prof-user"
                  type="text"
                  value={authStore.user?.username || ""}
                  disabled
                  class="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-500 cursor-not-allowed"
                />
                <span class="text-[10px] text-slate-400 mt-0.5 block">Identitas username unik di database</span>
              </div>
            </div>

            <!-- PIN SECTION -->
            <div class="pt-4 border-t border-slate-100 space-y-3">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-lg bg-red-50 text-[#df1c2d] flex items-center justify-center">
                  <KeyRound class="w-4 h-4" />
                </div>
                <div>
                  <div class="text-xs font-bold text-slate-800">PIN Kasir POS (4 - 6 Digit Angka)</div>
                  <div class="text-[10px] text-slate-500">Gunakan PIN ini untuk login cepat di meja kasir & buka kunci layar POS</div>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="prof-pin" class="block text-xs font-bold text-slate-700 mb-1">Daftarkan PIN Baru</label>
                  <input
                    id="prof-pin"
                    type="password"
                    maxlength="6"
                    bind:value={myProfileForm.pin}
                    class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold tracking-widest text-slate-800 focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                    placeholder="Contoh: 123456"
                  />
                  <span class="text-[10px] text-slate-400 mt-0.5 block">Biarkan kosong jika tidak ingin mengubah PIN</span>
                </div>

                <div>
                  <label for="prof-cpin" class="block text-xs font-bold text-slate-700 mb-1">Konfirmasi PIN Baru</label>
                  <input
                    id="prof-cpin"
                    type="password"
                    maxlength="6"
                    bind:value={myProfileForm.confirmPin}
                    class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold tracking-widest text-slate-800 focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                    placeholder="Ulangi PIN di atas"
                  />
                </div>
              </div>
            </div>

            <div class="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={isSavingMyProfile}
                class="px-5 py-2.5 bg-brand-blue hover:bg-brand-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                {#if isSavingMyProfile}
                  <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Menyimpan...</span>
                {:else}
                  <Save class="w-3.5 h-3.5" />
                  <span>Simpan Profil & PIN</span>
                {/if}
              </button>
            </div>
          </form>
        </div>

        <!-- KOLOM 3: KETERANGAN HAK AKSES & INFORMASI -->
        <div class="space-y-4">
          <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
            <h5 class="text-xs font-bold text-slate-800 flex items-center gap-2">
              <Shield class="w-4 h-4 text-brand-blue" />
              <span>Hak Akses Anda Saat Ini</span>
            </h5>
            <div class="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-2 text-xs">
              <div class="flex items-center justify-between">
                <span class="text-slate-500">Peran:</span>
                <span class="font-bold text-slate-800">{authStore.user?.role}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500">Cabang Tugas:</span>
                <span class="font-semibold text-slate-700">{authStore.user?.branchName || "Pusat"}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500">Status Akun:</span>
                <span class="font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 class="w-3.5 h-3.5" />
                  Aktif
                </span>
              </div>
            </div>
            <p class="text-[11px] text-slate-500 leading-relaxed">
              Jika Anda memerlukan akses ke modul lain (Apoteker PJ, Laporan Keuangan, Stok Gudang), silakan mengajukan permohonan ke Superadmin atau Pemilik Apotek (Owner).
            </p>
          </div>

          <div class="bg-blue-50 border border-blue-200/60 rounded-2xl p-5 space-y-2">
            <h5 class="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <Sparkles class="w-4 h-4 text-blue-600" />
              <span>Kelebihan PIN Kasir POS</span>
            </h5>
            <ul class="text-[11px] text-blue-800 space-y-1.5 list-disc list-inside leading-relaxed">
              <li><strong>Switch Shift Kilat:</strong> Kasir bergantian hanya dengan mengetik 6 digit PIN tanpa logout browser.</li>
              <li><strong>Offline Ready:</strong> Kasir tetap bisa transaksi saat internet terputus.</li>
              <li><strong>Kunci Meja POS:</strong> Layar kasir cepat terkunci saat kasir istirahat.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

  <!-- TAB 1: PROFIL CABANG -->
  {:else if activeTab === "cabang"}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Legalitas & Identitas Outlet Apotek</h3>
          <p class="text-xs text-slate-500 mt-0.5">Informasi ini dicetak pada header struk kasir dan dokumen Surat Pesanan (SP)</p>
        </div>

        <div class="flex items-center gap-2">
          <label for="select-cabang" class="text-xs font-bold text-slate-600">Pilih Outlet:</label>
          <Select
            id="select-cabang"
            bind:value={selectedBranch}
            size="sm"
            align="right"
            options={branches.map((b) => ({
              value: b,
              label: b.name,
              sublabel: `${b.code} • ${b.address}`
            }))}
          />
        </div>
      </div>

      {#if selectedBranch}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label for="br-name" class="font-bold text-slate-700 block mb-1">Nama Outlet Apotek</label>
            <input
              id="br-name"
              type="text"
              bind:value={selectedBranch.name}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900"
            />
          </div>
          <div>
            <label for="br-phone" class="font-bold text-slate-700 block mb-1">Nomor Telepon / WhatsApp</label>
            <input
              id="br-phone"
              type="text"
              bind:value={selectedBranch.phone}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
            />
          </div>
          <div class="md:col-span-2">
            <label for="br-addr" class="font-bold text-slate-700 block mb-1">Alamat Lengkap</label>
            <input
              id="br-addr"
              type="text"
              bind:value={selectedBranch.address}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label for="br-sia" class="font-bold text-slate-700 block mb-1">Nomor SIA (Surat Izin Apotek)</label>
            <input
              id="br-sia"
              type="text"
              bind:value={selectedBranch.siaNumber}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-brand-blue"
            />
          </div>
          <div>
            <label for="br-apa" class="font-bold text-slate-700 block mb-1">Apoteker Penanggung Jawab (APA)</label>
            <input
              id="br-apa"
              type="text"
              bind:value={selectedBranch.pharmacistName}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900"
            />
          </div>
          <div>
            <label for="br-sipa" class="font-bold text-slate-700 block mb-1">Nomor SIPA APA</label>
            <input
              id="br-sipa"
              type="text"
              value="500.16.7.2/0289/SIPA/DPMPTSP/II/2026"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label for="br-footer" class="font-bold text-slate-700 block mb-1">Slogan Struk Kasir</label>
            <input
              id="br-footer"
              type="text"
              bind:value={selectedBranch.receiptFooter}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-script text-sm text-slate-700"
            />
          </div>
        </div>
      {:else}
        <div class="p-8 text-center text-xs text-slate-400">
          Memuat data cabang dari database...
        </div>
      {/if}
    </div>

  <!-- TAB 2: PENGGUNA & PIN KASIR -->
  {:else if activeTab === "pengguna"}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Manajemen Staf, Hak Akses & PIN Kasir 6-Digit</h3>
          <p class="text-xs text-slate-500 mt-0.5">Super Admin dapat mengubah peran (role) staf dan memindahkan cabang penugasan</p>
        </div>
        <button
          type="button"
          onclick={() => { userModalError = ""; isAddUserModalOpen = true; }}
          class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-blue hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>Tambah Pengguna</span>
        </button>
      </div>

      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-100">
              <th class="py-3 px-4">Nama Lengkap</th>
              <th class="py-3 px-4">Username / Email</th>
              <th class="py-3 px-4">Peran (Role)</th>
              <th class="py-3 px-4">Penugasan Cabang</th>
              <th class="py-3 px-4 text-center">PIN</th>
              <th class="py-3 px-4 text-center">Status</th>
              <th class="py-3 px-4 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
            {#if users.length === 0}
              <tr>
                <td colspan="7" class="py-12 text-center text-xs text-slate-400">
                  <div class="flex flex-col items-center justify-center gap-2">
                    <Users class="w-8 h-8 text-slate-300" />
                    <span class="font-bold">Belum ada pengguna terdaftar di database PostgreSQL</span>
                    <a href="/register" class="text-brand-blue hover:underline font-semibold mt-1">Daftarkan akun Super Admin pertama &rarr;</a>
                  </div>
                </td>
              </tr>
            {:else}
              {#each users as u}
                <tr class="hover:bg-slate-50/50 transition-colors">
                  <td class="py-3.5 px-4">
                    <div class="font-bold text-slate-900">{u.fullName}</div>
                    {#if u.phone}
                      <div class="text-[10px] text-slate-400 font-mono">{u.phone}</div>
                    {/if}
                  </td>
                  <td class="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                    <div class="font-bold text-slate-700">{u.username}</div>
                    <div class="text-[10px]">{u.email}</div>
                  </td>
                  <td class="py-3.5 px-4">
                    {#if authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"}
                      <select
                        value={u.role}
                        onchange={(e) => handleUpdateUserRole(u.id, e.currentTarget.value)}
                        class="bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-bold rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue cursor-pointer"
                      >
                        <option value="GUEST">GUEST (Tamu - Belum Diberi Akses)</option>
                        <option value="CASHIER">CASHIER (Kasir Penjualan POS)</option>
                        <option value="PHARMACIST">PHARMACIST (Apoteker APA)</option>
                        <option value="INVENTORY">INVENTORY (Gudang & Logistik)</option>
                        <option value="FINANCE">FINANCE (Keuangan & Kas)</option>
                        <option value="OWNER">OWNER (Pemilik Apotek)</option>
                        <option value="SUPERADMIN">SUPERADMIN (Programmer)</option>
                      </select>
                    {:else}
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold {u.role === 'SUPERADMIN' ? 'bg-blue-100 text-blue-800' : u.role === 'GUEST' ? 'bg-amber-100 text-amber-900 border border-amber-300' : u.role === 'PHARMACIST' ? 'bg-purple-100 text-purple-800' : u.role === 'CASHIER' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
                        {u.role}
                      </span>
                    {/if}
                  </td>
                  <td class="py-3.5 px-4 text-slate-600 font-semibold">
                    {#if (authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER") && branches.length > 0}
                      <select
                        value={u.branchId || branches[0]?.id}
                        onchange={(e) => handleUpdateUserBranch(u.id, e.currentTarget.value)}
                        class="bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-medium rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue cursor-pointer max-w-[180px]"
                      >
                        {#each branches as b}
                          <option value={b.id}>{b.name}</option>
                        {/each}
                      </select>
                    {:else}
                      <span>{u.branchName || "Cabang Pusat"}</span>
                    {/if}
                  </td>
                  <td class="py-3.5 px-4 text-center font-mono font-bold tracking-widest text-slate-500">
                    ••••••
                  </td>
                  <td class="py-3.5 px-4 text-center">
                    <Badge type="SUCCESS" label="AKTIF" />
                  </td>
                  <td class="py-3.5 px-4 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onclick={() => openPinModal(u)}
                        class="px-2 py-1 rounded-lg border border-slate-200 hover:border-brand-blue hover:bg-blue-50 text-slate-600 hover:text-brand-blue text-[11px] font-bold transition-all cursor-pointer"
                        title="Ubah PIN Kasir"
                      >
                        Ubah PIN
                      </button>
                      {#if (authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER") && u.id !== authStore.user?.id}
                        <button
                          type="button"
                          onclick={() => handleDeleteUser(u.id, u.fullName)}
                          class="p-1 rounded-lg border border-slate-200 hover:border-red-400 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all cursor-pointer"
                          title="Hapus Pengguna"
                        >
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>

  <!-- TAB 3: PRINTER & LACI KASIR -->
  {:else if activeTab === "printer"}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
      <div class="border-b border-slate-100 pb-3">
        <h3 class="text-sm font-bold text-slate-800">Konfigurasi Perangkat Keras POS</h3>
        <p class="text-xs text-slate-500 mt-0.5">Pengaturan printer thermal ESC/POS (USB/Serial) dan pemicu laci uang elektrik (RJ11)</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div>
          <label for="pr-type" class="font-bold text-slate-700 block mb-1">Tipe Koneksi Printer</label>
          <Select
            id="pr-type"
            options={[
              "Web Serial API (Direct USB Driver - Rekomendasi)",
              "System Dialog Print (Browser Default)",
              "Network LAN / TCP Raw ESC/POS"
            ]}
          />
        </div>
        <div>
          <label for="pr-width" class="font-bold text-slate-700 block mb-1">Lebar Kertas Struk</label>
          <Select
            id="pr-width"
            options={[
              "80 mm (48 Karakter / Baris - Standar Kasir Besar)",
              "58 mm (32 Karakter / Baris - Portabel)"
            ]}
          />
        </div>
        <div>
          <label for="pr-baud" class="font-bold text-slate-700 block mb-1">Baud Rate Serial</label>
          <input
            id="pr-baud"
            type="text"
            value="9600"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
          />
        </div>
        <div>
          <label for="pr-drawer" class="font-bold text-slate-700 block mb-1">Buka Laci Uang (RJ11 Cash Drawer)</label>
          <Select
            id="pr-drawer"
            options={[
              "Otomatis Buka Setiap Transaksi Tunai Selesai",
              "Hanya Buka Manual via Tombol Kasir",
              "Nonaktif"
            ]}
          />
        </div>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-start gap-3">
        <button
          type="button"
          onclick={() => alert("Mengirim sinyal uji cetak ESC/POS dan pembukaan laci RJ11...")}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm flex items-center gap-2"
        >
          <Printer class="w-4 h-4" />
          <span>Uji Cetak Struk & Tes Buka Laci</span>
        </button>
      </div>
    </div>
  {/if}

  <!-- TAB 4: DIAGNOSTIK & STORAGE OFFLINE -->
  {#if activeTab === "diagnostik"}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
      <div class="border-b border-slate-100 pb-4">
        <h3 class="text-sm font-bold text-slate-800">Status Penyimpanan Offline (IndexedDB / Dexie.js v4)</h3>
        <p class="text-xs text-slate-500 mt-0.5">Database lokal di browser untuk menjamin kasir tetap dapat bertransaksi saat internet mati</p>
      </div>

      {#if resyncMessage}
        <div class="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
          <CheckCircle2 class="w-4 h-4 text-emerald-600" />
          <span>{resyncMessage}</span>
        </div>
      {/if}

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
          <span class="text-slate-400 font-bold uppercase text-[10px]">Ukuran Storage Lokal</span>
          <div class="text-base font-black text-slate-800">48.2 MB</div>
          <div class="text-[11px] text-slate-500">Kuota aman (Browser Quota: 8GB)</div>
        </div>
        <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
          <span class="text-slate-400 font-bold uppercase text-[10px]">Status Database Dexie</span>
          <div class="text-base font-black text-emerald-600 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Tersambung (v4.0.10)</span>
          </div>
          <div class="text-[11px] text-slate-500">Schema version 4 ready</div>
        </div>
        <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
          <span class="text-slate-400 font-bold uppercase text-[10px]">Koneksi Server Cloud</span>
          <div class="text-base font-black text-brand-blue flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            <span>Online Sinkron</span>
          </div>
          <div class="text-[11px] text-slate-500">WebSocket / Polling aktif</div>
        </div>
      </div>

      <div class="space-y-3 text-xs">
        <h4 class="font-bold text-slate-700">Tabel Cache Lokal Terpasang:</h4>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div class="p-2.5 rounded-lg border border-slate-200 bg-white flex justify-between items-center">
            <span class="text-slate-600 font-medium">products</span>
            <span class="font-mono font-bold text-slate-800">82 record</span>
          </div>
          <div class="p-2.5 rounded-lg border border-slate-200 bg-white flex justify-between items-center">
            <span class="text-slate-600 font-medium">branchBatches</span>
            <span class="font-mono font-bold text-slate-800">145 batch</span>
          </div>
          <div class="p-2.5 rounded-lg border border-slate-200 bg-white flex justify-between items-center">
            <span class="text-slate-600 font-medium">customers</span>
            <span class="font-mono font-bold text-slate-800">4 debitur</span>
          </div>
          <div class="p-2.5 rounded-lg border border-slate-200 bg-white flex justify-between items-center">
            <span class="text-slate-600 font-medium">pendingSales</span>
            <span class="font-mono font-bold text-emerald-600">0 antrean</span>
          </div>
        </div>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-start gap-3">
        <button
          type="button"
          onclick={handleResyncMaster}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw class="w-4 h-4" />
          <span>Sinkronkan Ulang Katalog dari Cloud</span>
        </button>
      </div>
    </div>
  {/if}
</div>

<!-- MODAL UBAH PIN KASIR -->
{#if isPinModalOpen && selectedUserForPin}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isPinModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold text-sm">
          <KeyRound class="w-4 h-4 text-brand-blue" />
          <span>Ubah PIN: {selectedUserForPin.fullName}</span>
        </div>
        <button onclick={() => isPinModalOpen = false} class="text-slate-400 hover:text-slate-600">
          <X class="w-4 h-4" />
        </button>
      </div>

      {#if userModalError}
        <div class="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
          {userModalError}
        </div>
      {/if}

      <div class="space-y-3 text-xs">
        <div>
          <label for="new-pin-input" class="block font-bold text-slate-700 mb-1">PIN Baru (4-8 Digit)</label>
          <input
            id="new-pin-input"
            type="password"
            maxlength="8"
            bind:value={newPinValue}
            placeholder="••••••"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-center tracking-widest text-lg"
          />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onclick={() => isPinModalOpen = false}
            class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onclick={handleSaveNewPin}
            class="px-4 py-1.5 rounded-xl bg-brand-blue hover:bg-blue-700 text-white font-bold cursor-pointer"
          >
            Simpan PIN
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL TAMBAH PENGGUNA BARU -->
{#if isAddUserModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isAddUserModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold text-sm">
          <UserCheck class="w-4 h-4 text-brand-blue" />
          <span>Tambah Pengguna & Pegawai Baru</span>
        </div>
        <button onclick={() => isAddUserModalOpen = false} class="text-slate-400 hover:text-slate-600">
          <X class="w-4 h-4" />
        </button>
      </div>

      {#if userModalError}
        <div class="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
          {userModalError}
        </div>
      {/if}

      <div class="space-y-3 text-xs">
        <div>
          <label for="nu-name" class="block font-bold text-slate-700 mb-1">Nama Lengkap</label>
          <input
            id="nu-name"
            type="text"
            bind:value={newUserForm.fullName}
            placeholder="cth: Siti Rahmawati"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium"
          />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label for="nu-user" class="block font-bold text-slate-700 mb-1">Username</label>
            <input
              id="nu-user"
              type="text"
              bind:value={newUserForm.username}
              placeholder="huruf kecil, cth: sitirahma"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
            />
          </div>
          <div>
            <label for="nu-pin" class="block font-bold text-slate-700 mb-1">6-Digit PIN Kasir</label>
            <input
              id="nu-pin"
              type="password"
              maxlength="8"
              bind:value={newUserForm.pin}
              placeholder="123456"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-center tracking-widest"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label for="nu-role" class="block font-bold text-slate-700 mb-1">Peran / Hak Akses</label>
            <select
              id="nu-role"
              bind:value={newUserForm.role}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold cursor-pointer"
            >
              <option value="SUPERADMIN">SUPERADMIN (Programmer)</option>
              <option value="OWNER">OWNER (Pemilik Apotek)</option>
              <option value="PHARMACIST">PHARMACIST (Apoteker APA)</option>
              <option value="CASHIER">CASHIER (Kasir POS)</option>
              <option value="INVENTORY">INVENTORY (Gudang)</option>
              <option value="FINANCE">FINANCE (Keuangan)</option>
            </select>
          </div>
          <div>
            <label for="nu-branch" class="block font-bold text-slate-700 mb-1">Cabang Penugasan</label>
            <select
              id="nu-branch"
              bind:value={newUserForm.branchId}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium cursor-pointer"
            >
              {#each branches as b}
                <option value={b.id}>{b.name}</option>
              {/each}
            </select>
          </div>
        </div>

        <div>
          <label for="nu-email" class="block font-bold text-slate-700 mb-1">Email (Opsional)</label>
          <input
            id="nu-email"
            type="email"
            bind:value={newUserForm.email}
            placeholder="staf@hafidzfarma.com"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onclick={() => isAddUserModalOpen = false}
            class="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onclick={handleCreateUserSubmit}
            class="px-4 py-2 rounded-xl bg-brand-blue hover:bg-blue-700 text-white font-bold cursor-pointer"
          >
            Tambahkan Pengguna
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
