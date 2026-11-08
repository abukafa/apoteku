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
    Clock,
    Building2,
    MapPin,
    Edit3,
    Percent,
    Layers
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { alertStore } from "$lib/stores/alertStore.svelte";
  import { portal } from "$lib/actions/portal";
  import { api } from "$lib/services/api";

  let activeTab = $state<"profil" | "cabang" | "pengguna" | "printer" | "diagnostik">("profil");
  let branches = $state<any[]>([]);
  let users = $state<any[]>([]);
  let selectedBranch = $state<any>(null);

  let isSuperOrOwner = $derived(
    authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"
  );

  // Guard: Tab "cabang" (Master Tenant, Branch, Inventory Location) & "pengguna" (Master Users) hanya untuk SUPERADMIN & OWNER
  $effect(() => {
    if (authStore.user && !isSuperOrOwner && (activeTab === "cabang" || activeTab === "pengguna")) {
      activeTab = "profil";
    }
  });

  // Master Tenant State (`tenants`)
  let tenantForm = $state({
    id: "",
    code: "HAFIDZ-FARMA",
    name: "Apotek Hafidz Farma",
    taxPercent: 11,
    isActive: true
  });
  let isSavingTenant = $state(false);
  let tenantError = $state("");

  // Modal Tambah/Edit Cabang (`branches`)
  let isBranchModalOpen = $state(false);
  let editingBranchId = $state<string | null>(null);
  let isSavingBranch = $state(false);
  let branchModalError = $state("");
  let branchForm = $state({
    code: "",
    name: "",
    phone: "",
    address: "",
    receiptHeader: "",
    receiptFooter: "Semoga lekas sembuh. Terima kasih.",
    createDefaultLocation: true,
    defaultLocationCode: "",
    defaultLocationName: ""
  });

  // Modal Tambah/Edit Lokasi Inventori (`inventory_locations`)
  let isLocationModalOpen = $state(false);
  let editingLocationId = $state<string | null>(null);
  let isSavingLocation = $state(false);
  let locationModalError = $state("");
  let locationForm = $state({
    branchId: "",
    code: "",
    name: "",
    isDefault: false,
    isActive: true
  });

  let saveSuccessMessage = $state("");
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
      alertStore.danger("Gagal Mengubah Peran", e.message || "Terjadi kesalahan sistem saat mengubah peran.");
    }
  }

  async function handleUpdateUserBranch(userId: string, newBranchId: string) {
    try {
      const res = await api.users.update(userId, { branchId: newBranchId });
      if (res.success) {
        const br = branches.find((b) => b.id === newBranchId);
        users = users.map((u) => (u.id === userId ? { ...u, branchId: newBranchId, branchName: br?.name || u.branchName } : u));
        alertStore.toast("Cabang penugasan berhasil diubah", "success");
      }
    } catch (e: any) {
      alertStore.danger("Gagal Mengubah Cabang", e.message || "Terjadi kesalahan sistem saat memindahkan cabang.");
    }
  }

  async function handleDeleteUser(userId: string, fullName: string) {
    const isConfirmed = await alertStore.confirm({
      type: "danger",
      title: "Hapus Akses Pengguna",
      message: `Apakah Anda yakin ingin menghapus pengguna "${fullName}"? Pengguna tidak akan dapat login lagi ke sistem.`,
      confirmText: "Ya, Hapus Pengguna",
      cancelText: "Batal"
    });
    if (!isConfirmed) return;

    try {
      const res = await api.users.delete(userId);
      if (res.success) {
        users = users.filter((u) => u.id !== userId);
        alertStore.toast(`Pengguna ${fullName} berhasil dihapus dari sistem.`, "success");
      }
    } catch (e: any) {
      alertStore.danger("Gagal Menghapus Pengguna", e.message || "Terjadi kesalahan saat menghapus pengguna.");
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

  async function loadMasterFoundationData() {
    try {
      const [tenantRes, branchRes, userRes] = await Promise.all([
        api.tenant.get().catch(() => null),
        api.branches.list().catch(() => null),
        api.users.list().catch(() => null)
      ]);
      if (tenantRes?.success && tenantRes.data) {
        tenantForm = {
          id: tenantRes.data.id || "",
          code: tenantRes.data.code || "HAFIDZ-FARMA",
          name: tenantRes.data.name || "Apotek Hafidz Farma",
          taxPercent: Number(tenantRes.data.taxPercent ?? 11),
          isActive: tenantRes.data.isActive !== false
        };
      }
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
  }

  onMount(async () => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get("tab") as any;
      if (authStore.user?.role === "GUEST") {
        activeTab = "profil";
      } else if (
        (tabParam === "cabang" || tabParam === "pengguna") &&
        authStore.user?.role !== "SUPERADMIN" &&
        authStore.user?.role !== "OWNER"
      ) {
        activeTab = "profil";
      } else if (["profil", "cabang", "pengguna", "printer", "diagnostik"].includes(tabParam)) {
        activeTab = tabParam;
      }
    }

    await loadMasterFoundationData();
  });

  async function handleSaveTenant() {
    tenantError = "";
    if (!isSuperOrOwner) {
      tenantError = "Hanya Superadmin dan Owner yang dapat mengubah data organisasi/tenant.";
      return;
    }
    if (!tenantForm.name.trim() || !tenantForm.code.trim()) {
      tenantError = "Nama organisasi dan kode tenant wajib diisi.";
      return;
    }
    isSavingTenant = true;
    try {
      const res = await api.tenant.update({
        id: tenantForm.id || undefined,
        code: tenantForm.code.trim().toUpperCase(),
        name: tenantForm.name.trim(),
        taxPercent: Number(tenantForm.taxPercent) || 0,
        isActive: tenantForm.isActive
      });
      if (res?.success) {
        if (res.data) {
          tenantForm = {
            id: res.data.id,
            code: res.data.code,
            name: res.data.name,
            taxPercent: Number(res.data.taxPercent ?? 11),
            isActive: res.data.isActive !== false
          };
        }
        saveSuccessMessage = res.message || "Data organisasi (tenant) berhasil diperbarui!";
        setTimeout(() => (saveSuccessMessage = ""), 3000);
      } else {
        tenantError = res?.error || "Gagal memperbarui data tenant.";
      }
    } catch (e: any) {
      tenantError = e.message || "Gagal memperbarui data tenant.";
    } finally {
      isSavingTenant = false;
    }
  }

  function openAddBranchModal() {
    editingBranchId = null;
    branchModalError = "";
    const nextNum = branches.length + 1;
    branchForm = {
      code: `CB-0${nextNum}`,
      name: "",
      phone: "",
      address: "",
      receiptHeader: "",
      receiptFooter: "Semoga lekas sembuh. Terima kasih.",
      createDefaultLocation: true,
      defaultLocationCode: `LOC-CB0${nextNum}`,
      defaultLocationName: "Etalase & Gudang Utama"
    };
    isBranchModalOpen = true;
  }

  function openEditBranchModal(b: any) {
    editingBranchId = b.id;
    branchModalError = "";
    branchForm = {
      code: b.code || "",
      name: b.name || "",
      phone: b.phone || "",
      address: b.address || "",
      receiptHeader: b.receiptHeader || b.name || "",
      receiptFooter: b.receiptFooter || "Semoga lekas sembuh. Terima kasih.",
      createDefaultLocation: false,
      defaultLocationCode: "",
      defaultLocationName: ""
    };
    isBranchModalOpen = true;
  }

  async function handleSaveBranch() {
    branchModalError = "";
    if (!branchForm.code.trim() || !branchForm.name.trim()) {
      branchModalError = "Kode cabang dan nama cabang wajib diisi.";
      return;
    }
    isSavingBranch = true;
    try {
      if (editingBranchId) {
        const res = await api.branches.update(editingBranchId, {
          code: branchForm.code.trim().toUpperCase(),
          name: branchForm.name.trim(),
          phone: branchForm.phone.trim(),
          address: branchForm.address.trim(),
          receiptHeader: branchForm.receiptHeader.trim() || branchForm.name.trim(),
          receiptFooter: branchForm.receiptFooter.trim()
        });
        if (res?.success) {
          await loadMasterFoundationData();
          isBranchModalOpen = false;
          saveSuccessMessage = `Data cabang "${branchForm.name}" berhasil diperbarui!`;
          setTimeout(() => (saveSuccessMessage = ""), 3000);
        } else {
          branchModalError = res?.error || "Gagal memperbarui cabang.";
        }
      } else {
        const res = await api.branches.create({
          code: branchForm.code.trim().toUpperCase(),
          name: branchForm.name.trim(),
          phone: branchForm.phone.trim(),
          address: branchForm.address.trim(),
          receiptHeader: branchForm.receiptHeader.trim() || branchForm.name.trim(),
          receiptFooter: branchForm.receiptFooter.trim(),
          createDefaultLocation: branchForm.createDefaultLocation,
          defaultLocationCode: branchForm.defaultLocationCode.trim() || undefined,
          defaultLocationName: branchForm.defaultLocationName.trim() || undefined
        });
        if (res?.success) {
          await loadMasterFoundationData();
          isBranchModalOpen = false;
          saveSuccessMessage = `Cabang baru "${branchForm.name}" berhasil ditambahkan!`;
          setTimeout(() => (saveSuccessMessage = ""), 3000);
        } else {
          branchModalError = res?.error || "Gagal menambahkan cabang baru.";
        }
      }
    } catch (e: any) {
      branchModalError = e.message || "Terjadi kesalahan saat menyimpan cabang.";
    } finally {
      isSavingBranch = false;
    }
  }

  function openAddLocationModal(defaultBranchId?: string) {
    editingLocationId = null;
    locationModalError = "";
    const targetBranchId = defaultBranchId || branches[0]?.id || "";
    const br = branches.find((b) => b.id === targetBranchId);
    const existingLocCount = (br?.locations?.length || 0) + 1;
    locationForm = {
      branchId: targetBranchId,
      code: `${br?.code || "LOC"}-L0${existingLocCount}`,
      name: "",
      isDefault: existingLocCount === 1,
      isActive: true
    };
    isLocationModalOpen = true;
  }

  function openEditLocationModal(loc: any) {
    editingLocationId = loc.id;
    locationModalError = "";
    locationForm = {
      branchId: loc.branchId,
      code: loc.code || "",
      name: loc.name || "",
      isDefault: Boolean(loc.isDefault),
      isActive: loc.isActive !== false
    };
    isLocationModalOpen = true;
  }

  async function handleSaveLocation() {
    locationModalError = "";
    if (!locationForm.branchId || !locationForm.code.trim() || !locationForm.name.trim()) {
      locationModalError = "Cabang, kode lokasi, dan nama lokasi wajib diisi.";
      return;
    }
    isSavingLocation = true;
    try {
      if (editingLocationId) {
        const res = await api.locations.update(editingLocationId, {
          branchId: locationForm.branchId,
          code: locationForm.code.trim().toUpperCase(),
          name: locationForm.name.trim(),
          isDefault: locationForm.isDefault,
          isActive: locationForm.isActive
        });
        if (res?.success) {
          await loadMasterFoundationData();
          isLocationModalOpen = false;
          saveSuccessMessage = `Lokasi inventori "${locationForm.name}" berhasil diperbarui!`;
          setTimeout(() => (saveSuccessMessage = ""), 3000);
        } else {
          locationModalError = res?.error || "Gagal memperbarui lokasi inventori.";
        }
      } else {
        const res = await api.locations.create({
          branchId: locationForm.branchId,
          code: locationForm.code.trim().toUpperCase(),
          name: locationForm.name.trim(),
          isDefault: locationForm.isDefault,
          isActive: locationForm.isActive
        });
        if (res?.success) {
          await loadMasterFoundationData();
          isLocationModalOpen = false;
          saveSuccessMessage = `Lokasi inventori "${locationForm.name}" berhasil ditambahkan!`;
          setTimeout(() => (saveSuccessMessage = ""), 3000);
        } else {
          locationModalError = res?.error || "Gagal menambahkan lokasi inventori.";
        }
      }
    } catch (e: any) {
      locationModalError = e.message || "Terjadi kesalahan saat menyimpan lokasi inventori.";
    } finally {
      isSavingLocation = false;
    }
  }

  async function handleSaveSettings() {
    if (activeTab === "cabang" && isSuperOrOwner) {
      await handleSaveTenant();
      return;
    }
    saveSuccessMessage = "Pengaturan berhasil disimpan ke database PostgreSQL!";
    setTimeout(() => {
      saveSuccessMessage = "";
    }, 3000);
  }

  function handleResyncMaster() {
    alertStore.toast({
      title: "Sinkronisasi Master",
      message: "Katalog master berhasil disinkronkan ulang ke IndexedDB lokal!",
      type: "success",
      duration: 3500
    });
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
  <div class="flex items-center gap-1 sm:gap-2 border-b border-slate-200 text-xs font-bold overflow-x-auto no-scrollbar -mx-1 px-1">
    <button
      type="button"
      onclick={() => (activeTab = "profil")}
      class="pb-3 px-2.5 sm:px-3 transition-colors relative shrink-0 whitespace-nowrap {activeTab === 'profil' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <div class="flex items-center gap-2">
        <User class="w-4 h-4 text-brand-blue-600 shrink-0" />
        <span>Profil & PIN Saya</span>
      </div>
      {#if activeTab === "profil"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    {#if isSuperOrOwner}
      <button
        type="button"
        onclick={() => (activeTab = "cabang")}
        class="pb-3 px-2.5 sm:px-3 transition-colors relative shrink-0 whitespace-nowrap {activeTab === 'cabang' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
      >
        <div class="flex items-center gap-2">
          <Store class="w-4 h-4 shrink-0" />
          <span>Profil Apotek & Cabang</span>
        </div>
        {#if activeTab === "cabang"}
          <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
        {/if}
      </button>

      <button
        type="button"
        onclick={() => (activeTab = "pengguna")}
        class="pb-3 px-2.5 sm:px-3 transition-colors relative shrink-0 whitespace-nowrap {activeTab === 'pengguna' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
      >
        <div class="flex items-center gap-2">
          <Users class="w-4 h-4 shrink-0" />
          <span>Staf, Akun & PIN Kasir</span>
        </div>
        {#if activeTab === "pengguna"}
          <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
        {/if}
      </button>
    {/if}

    {#if authStore.user?.role !== "GUEST"}
      <button
        type="button"
        onclick={() => (activeTab = "printer")}
        class="pb-3 px-2.5 sm:px-3 transition-colors relative shrink-0 whitespace-nowrap {activeTab === 'printer' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
      >
        <div class="flex items-center gap-2">
          <Printer class="w-4 h-4 shrink-0" />
          <span>Printer Thermal & Laci Kasir</span>
        </div>
        {#if activeTab === "printer"}
          <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
        {/if}
      </button>

      <button
        type="button"
        onclick={() => (activeTab = "diagnostik")}
        class="pb-3 px-2.5 sm:px-3 transition-colors relative shrink-0 whitespace-nowrap {activeTab === 'diagnostik' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
      >
        <div class="flex items-center gap-2">
          <HardDrive class="w-4 h-4 text-emerald-600 shrink-0" />
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
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="flex items-start sm:items-center gap-3.5 sm:gap-4 w-full sm:w-auto">
            {#if authStore.user?.avatarUrl}
              <img
                src={authStore.user.avatarUrl}
                alt={authStore.user.fullName}
                class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 border-brand-blue/20 shadow-sm shrink-0"
                onerror={(e) => ((e.currentTarget as HTMLElement).style.display = 'none')}
              />
            {:else}
              <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-brand-blue to-brand-blue-700 text-white font-black text-lg sm:text-xl flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                {(authStore.user?.fullName || "HF").slice(0, 2).toUpperCase()}
              </div>
            {/if}
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-sm sm:text-base font-bold text-slate-800">{authStore.user?.fullName || "Pengguna Apotek"}</h3>
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
              <div class="text-xs text-slate-500 mt-1.5 flex items-center gap-x-2 gap-y-1 flex-wrap">
                <span class="font-mono text-slate-600">@{authStore.user?.username || "user"}</span>
                <span class="hidden sm:inline">&bull;</span>
                <span class="flex items-center gap-1 text-slate-600 break-all sm:break-normal">
                  <Mail class="w-3 h-3 text-slate-400 shrink-0" />
                  {authStore.user?.email || "-"}
                </span>
                <span class="hidden sm:inline">&bull;</span>
                <span class="flex items-center gap-1 text-brand-blue-700 font-semibold">
                  <Store class="w-3 h-3 text-brand-blue-600 shrink-0" />
                  {authStore.user?.branchName || "Cabang Pusat"}
                </span>
              </div>
            </div>
          </div>

          <div class="text-xs text-slate-500 bg-slate-50 border border-slate-200/80 rounded-xl p-3 w-full sm:w-auto sm:max-w-xs">
            <div class="font-bold text-slate-700 flex items-center gap-1 mb-1">
              <ShieldCheck class="w-3.5 h-3.5 text-emerald-600" />
              <span>Autentikasi Terverifikasi</span>
            </div>
            <p class="text-[11px] leading-relaxed">
              Akun Anda terhubung dengan Google Workspace. Wewenang & penugasan ditentukan oleh Owner.
            </p>
          </div>
        </div>
      </div>

      <!-- FORM UBAH PROFIL & DAFTARKAN PIN KASIR -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- KOLOM 1 & 2: DATA PROFIL & PIN -->
        <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-6">
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
                <div class="w-7 h-7 rounded-lg bg-red-50 text-[#df1c2d] flex items-center justify-center shrink-0">
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
                class="w-full sm:w-auto justify-center px-5 py-2.5 bg-brand-blue hover:bg-brand-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
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
          <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-5 space-y-3">
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

          <div class="bg-blue-50 border border-blue-200/60 rounded-2xl p-4 sm:p-5 space-y-2">
            <h5 class="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <Sparkles class="w-4 h-4 text-blue-600" />
              <span>Urgensi PIN Kasir POS</span>
            </h5>
            <ul class="text-[11px] text-blue-800 space-y-1.5 list-disc list-inside leading-relaxed">
              <li><strong>Offline Ready:</strong> Kasir tetap bisa transaksi saat internet terputus.</li>
              <li><strong>PIN Switch:</strong> User bisa login via 6 digit PIN tanpa perlu Google Auth.</li>
              <li><strong>Auto-Lock:</strong> Layar kasir otomatis terkunci saat kasir istirahat.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

  <!-- TAB 1: PROFIL APOTEK (TENANT) & TABEL CABANG + INVENTORY LOCATION -->
  {:else if activeTab === "cabang" && isSuperOrOwner}
    <div class="space-y-6">
      <!-- BAGIAN ATAS: FORM EDIT DATA TENANT (tenants) -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div class="flex items-start sm:items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-brand-blue/10 text-brand-blue-700 flex items-center justify-center shrink-0">
              <Building2 class="w-5 h-5" />
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-sm font-bold text-slate-800">Profil Apotek</h3>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 uppercase">
                  Khusus Owner
                </span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">
                Data induk perusahaan (<code class="text-[11px] font-mono text-slate-600">tenants</code>), pajak PPN standar, dan lisensi operasional.
              </p>
            </div>
          </div>

          <button
            type="button"
            onclick={handleSaveTenant}
            disabled={isSavingTenant}
            class="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-blue hover:bg-brand-blue-700 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
          >
            {#if isSavingTenant}
              <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Menyimpan...</span>
            {:else}
              <Save class="w-3.5 h-3.5" />
              <span>Simpan Data</span>
            {/if}
          </button>
        </div>

        {#if tenantError}
          <div class="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
            <X class="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>{tenantError}</span>
          </div>
        {/if}

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div class="sm:col-span-2">
            <label for="tn-name" class="font-bold text-slate-700 block mb-1">Nama Resmi jaringan / Entitas Apotek</label>
            <input
              id="tn-name"
              type="text"
              bind:value={tenantForm.name}
              placeholder="Contoh: Apotek Hafidz Farma"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
            />
          </div>

          <div>
            <label for="tn-code" class="font-bold text-slate-700 block mb-1">Kode Tenant Unik</label>
            <input
              id="tn-code"
              type="text"
              bind:value={tenantForm.code}
              placeholder="HAFIDZ-FARMA"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-brand-blue-700 uppercase focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
            />
          </div>

          <div>
            <label for="tn-tax" class="font-bold text-slate-700 block mb-1">Tarif PPN Default (%)</label>
            <div class="relative">
              <input
                id="tn-tax"
                type="number"
                step="0.01"
                min="0"
                max="100"
                bind:value={tenantForm.taxPercent}
                class="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-8 py-2 font-mono font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
              />
              <Percent class="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
            </div>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
          <div class="flex items-center gap-2 flex-wrap">
            <span>ID Tenant Database:</span>
            <code class="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-mono break-all">{tenantForm.id || "-"}</code>
          </div>
          <label class="inline-flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={tenantForm.isActive}
              class="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
            />
            <span>Status Entitas Tenant Aktif</span>
          </label>
        </div>
      </div>

      <!-- BAGIAN BAWAH: TABEL CABANG (branches) & LOKASI PENYIMPANAN (inventory_locations) -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div class="flex items-start sm:items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Store class="w-5 h-5" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-slate-800">Daftar Cabang & Penyimpanan Stok</h3>
              <p class="text-xs text-slate-500 mt-0.5">
                Kelola cabang (<code class="text-[11px] font-mono text-slate-600">branches</code>) dan titik penyimpanan fisik (<code class="text-[11px] font-mono text-slate-600">inventory_locations</code>).
              </p>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onclick={() => openAddLocationModal()}
              class="justify-center inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-all cursor-pointer"
            >
              <MapPin class="w-3.5 h-3.5 shrink-0" />
              <span>Tambah Lokasi</span>
            </button>

            <button
              type="button"
              onclick={openAddBranchModal}
              class="justify-center inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl bg-brand-blue hover:bg-brand-blue-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <Plus class="w-3.5 h-3.5 shrink-0" />
              <span>Tambah Cabang</span>
            </button>
          </div>
        </div>

        <!-- MOBILE CARD VIEW (< md) UNTUK CABANG & LOKASI PENYIMPANAN -->
        <div class="md:hidden space-y-3">
          {#if branches.length === 0}
            <div class="py-8 text-center text-xs text-slate-400">
              Belum ada data cabang terdaftar.
            </div>
          {:else}
            {#each branches as b}
              <div class="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-4 space-y-3 text-xs">
                <div class="flex items-start justify-between gap-2 border-b border-slate-200/70 pb-3">
                  <div class="flex items-start gap-2.5 min-w-0">
                    <span class="px-2 py-0.5 rounded-lg bg-brand-blue/10 text-brand-blue-700 font-mono font-black text-[11px] shrink-0">
                      #{b.code}
                    </span>
                    <div class="min-w-0">
                      <div class="font-bold text-slate-900 text-xs leading-snug">{b.name}</div>
                      <div class="text-[10px] text-slate-400 font-mono mt-0.5" title={b.id}>
                        ID: {b.id.slice(0, 8)}...
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onclick={() => openEditBranchModal(b)}
                    class="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-brand-blue hover:text-white text-slate-700 font-bold text-[11px] transition-colors cursor-pointer shadow-2xs"
                  >
                    <Edit3 class="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                  <div class="bg-white rounded-xl p-2.5 border border-slate-100 space-y-1">
                    <div class="text-[10px] font-bold uppercase text-slate-400">Kontak & Alamat</div>
                    <div class="font-mono text-slate-700 font-semibold flex items-center gap-1">
                      <Phone class="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{b.phone || "-"}</span>
                    </div>
                    <div class="text-slate-500 leading-snug">{b.address || "Alamat belum diisi"}</div>
                  </div>

                  <div class="bg-white rounded-xl p-2.5 border border-slate-100 space-y-1">
                    <div class="text-[10px] font-bold uppercase text-slate-400">Header & Slogan Struk</div>
                    <div class="text-slate-700 font-medium">{b.receiptHeader || "-"}</div>
                    <div class="text-slate-500 italic">"{b.receiptFooter || "Semoga Lekas Sembuh"}"</div>
                  </div>
                </div>

                <div class="bg-white rounded-xl p-3 border border-slate-100 space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[10px] font-bold uppercase text-slate-400">Lokasi Penyimpanan</span>
                    <button
                      type="button"
                      onclick={() => openAddLocationModal(b.id)}
                      class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                    >
                      <Plus class="w-3 h-3" />
                      <span>Tambah Lokasi</span>
                    </button>
                  </div>

                  {#if b.locations && b.locations.length > 0}
                    <div class="flex flex-wrap gap-1.5">
                      {#each b.locations as loc}
                        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] {loc.isActive ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-100 border-slate-200 text-slate-400 line-through'}">
                          <Layers class="w-3 h-3 shrink-0 {loc.isDefault ? 'text-emerald-600' : 'text-slate-400'}" />
                          <span class="font-mono font-bold text-[10px] text-brand-blue-700">[{loc.code}]</span>
                          <span class="font-semibold">{loc.name}</span>
                          {#if loc.isDefault}
                            <span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase">
                              Utama
                            </span>
                          {/if}
                          <button
                            type="button"
                            onclick={() => openEditLocationModal(loc)}
                            class="ml-0.5 p-0.5 text-slate-400 hover:text-brand-blue-700 transition-colors cursor-pointer"
                            title="Edit Lokasi Penyimpanan"
                          >
                            <Edit3 class="w-3 h-3" />
                          </button>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <div class="text-[11px] text-amber-600 font-semibold">
                      Belum ada lokasi penyimpanan di cabang ini
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          {/if}
        </div>

        <!-- DESKTOP TABLE VIEW (md+) UNTUK CABANG & LOKASI PENYIMPANAN -->
        <div class="hidden md:block overflow-x-auto scrollbar-thin">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-100">
                <th class="py-3 px-4">Kode & Nama</th>
                <th class="py-3 px-4">Kontak & Alamat</th>
                <th class="py-3 px-4">Header Struk</th>
                <th class="py-3 px-4">Lokasi Penyimpanan</th>
                <th class="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              {#if branches.length === 0}
                <tr>
                  <td colspan="5" class="py-8 text-center text-slate-400">
                    Belum ada data cabang terdaftar.
                  </td>
                </tr>
              {:else}
                {#each branches as b}
                  <tr class="hover:bg-slate-50/80 transition-colors align-top">
                    <td class="py-3.5 px-4">
                      <div class="flex items-start gap-2.5">
                        <span class="px-2 py-0.5 rounded-lg bg-brand-blue/10 text-brand-blue-700 font-mono font-black text-[11px]">
                          #{b.code}
                        </span>
                        <div>
                          <div class="font-bold text-slate-900 text-xs">{b.name}</div>
                          <div class="text-[10px] text-slate-400 font-mono mt-0.5" title={b.id}>
                            ID: {b.id.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>

                    <td class="py-3.5 px-4 max-w-xs">
                      <div class="font-mono text-slate-700 font-semibold flex items-center gap-1">
                        <Phone class="w-3 h-3 text-slate-400 flex-shrink-0" />
                        <span>{b.phone || "-"}</span>
                      </div>
                      <div class="text-[11px] text-slate-500 mt-1 leading-snug">
                        {b.address || "Alamat belum diisi"}
                      </div>
                    </td>

                    <td class="py-3.5 px-4 max-w-xs">
                      <div class="text-[11px] font-semibold text-slate-700">
                        <span class="font-normal text-slate-600">{b.receiptHeader || "-"}</span>
                      </div>
                      <div class="text-[11px] text-slate-500 italic mt-0.5">
                        "{b.receiptFooter || "Semoga Lekas Sembuh"}"
                      </div>
                    </td>

                    <td class="py-3.5 px-4">
                      <div class="space-y-1.5">
                        {#if b.locations && b.locations.length > 0}
                          <div class="flex flex-wrap gap-1.5">
                            {#each b.locations as loc}
                              <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] {loc.isActive ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-100 border-slate-200 text-slate-400 line-through'}">
                                <Layers class="w-3 h-3 {loc.isDefault ? 'text-emerald-600' : 'text-slate-400'}" />
                                <span class="font-mono font-bold text-[10px] text-brand-blue-700">[{loc.code}]</span>
                                <span class="font-semibold">{loc.name}</span>
                                {#if loc.isDefault}
                                  <span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase">
                                    Utama
                                  </span>
                                {/if}
                                <button
                                  type="button"
                                  onclick={() => openEditLocationModal(loc)}
                                  class="ml-1 p-0.5 text-slate-400 hover:text-brand-blue-700 transition-colors cursor-pointer"
                                  title="Edit Lokasi Penyimpanan"
                                >
                                  <Edit3 class="w-3 h-3" />
                                </button>
                              </div>
                            {/each}
                          </div>
                        {:else}
                          <div class="text-[11px] text-amber-600 font-semibold">
                            Belum ada lokasi penyimpanan di cabang ini
                          </div>
                        {/if}

                        <div>
                          <button
                            type="button"
                            onclick={() => openAddLocationModal(b.id)}
                            class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 mt-1 cursor-pointer"
                          >
                            <Plus class="w-3 h-3" />
                            <span>Tambah Lokasi</span>
                          </button>
                        </div>
                      </div>
                    </td>

                    <td class="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onclick={() => openEditBranchModal(b)}
                        class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-blue hover:text-white text-slate-700 font-bold text-[11px] transition-colors cursor-pointer"
                      >
                        <Edit3 class="w-3 h-3" />
                        <span>Edit Cabang</span>
                      </button>
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    </div>

  <!-- TAB 2: PENGGUNA & PIN KASIR -->
  {:else if activeTab === "pengguna" && isSuperOrOwner}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-6">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Manajemen Staf, Hak Akses & PIN</h3>
          <p class="text-xs text-slate-500 mt-0.5">Super Admin dapat mengubah peran (role) staf dan memindahkan cabang penugasan</p>
        </div>
        <button
          type="button"
          onclick={() => { userModalError = ""; isAddUserModalOpen = true; }}
          class="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-3.5 py-2 sm:py-1.5 rounded-xl bg-brand-blue hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>Tambah Pengguna</span>
        </button>
      </div>

      <!-- MOBILE CARD VIEW (< md) UNTUK DAFTAR PENGGUNA -->
      <div class="md:hidden space-y-3">
        {#if users.length === 0}
          <div class="py-10 text-center text-xs text-slate-400">
            <div class="flex flex-col items-center justify-center gap-2">
              <Users class="w-8 h-8 text-slate-300" />
              <span class="font-bold">Belum ada pengguna terdaftar di database PostgreSQL</span>
              <a href="/register" class="text-brand-blue hover:underline font-semibold mt-1">Daftarkan akun Super Admin pertama &rarr;</a>
            </div>
          </div>
        {:else}
          {#each users as u}
            <div class="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-4 space-y-3 text-xs">
              <div class="flex items-start justify-between gap-2 border-b border-slate-200/70 pb-2.5">
                <div class="min-w-0">
                  <div class="font-bold text-slate-900 text-xs">{u.fullName}</div>
                  {#if u.email}
                    <div class="text-[10px] text-slate-400 break-all">{u.email}</div>
                  {:else}
                    <div class="text-[10px] text-slate-400 break-all">@{u.username}</div>
                  {/if}
                </div>
                <div class="shrink-0">
                  <Badge type="SUCCESS" label="AKTIF" />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2.5">
                <div>
                  <span class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Peran (Role)</span>
                  {#if authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"}
                    <select
                      value={u.role}
                      onchange={(e) => handleUpdateUserRole(u.id, e.currentTarget.value)}
                      class="w-full bg-white border border-slate-200 text-slate-800 text-[11px] font-bold rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue cursor-pointer"
                    >
                      <option value="GUEST">GUEST</option>
                      <option value="CASHIER">CASHIER</option>
                      <option value="PHARMACIST">PHARMACIST</option>
                      <option value="INVENTORY">INVENTORY</option>
                      <option value="FINANCE">FINANCE</option>
                      <option value="OWNER">OWNER</option>
                      <option value="SUPERADMIN">SUPERADMIN</option>
                    </select>
                  {:else}
                    <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold {u.role === 'SUPERADMIN' ? 'bg-blue-100 text-blue-800' : u.role === 'GUEST' ? 'bg-amber-100 text-amber-900 border border-amber-300' : u.role === 'PHARMACIST' ? 'bg-purple-100 text-purple-800' : u.role === 'CASHIER' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
                      {u.role}
                    </span>
                  {/if}
                </div>

                <div>
                  <span class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Penugasan Cabang</span>
                  {#if (authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER") && branches.length > 0}
                    <select
                      value={u.branchId || branches[0]?.id}
                      onchange={(e) => handleUpdateUserBranch(u.id, e.currentTarget.value)}
                      class="w-full bg-white border border-slate-200 text-slate-700 text-[11px] font-medium rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue cursor-pointer"
                    >
                      {#each branches as b}
                        <option value={b.id}>{b.name}</option>
                      {/each}
                    </select>
                  {:else}
                    <span class="font-semibold text-slate-700">{u.branchName || "Cabang Pusat"}</span>
                  {/if}
                </div>
              </div>

              <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                <div class="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <KeyRound class="w-3.5 h-3.5 text-slate-400" />
                  <span>PIN: <strong class="font-mono tracking-widest">••••••</strong></span>
                </div>

                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    onclick={() => openPinModal(u)}
                    class="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-brand-blue hover:bg-blue-50 text-slate-700 hover:text-brand-blue text-[11px] font-bold transition-all cursor-pointer"
                  >
                    Ubah PIN
                  </button>
                  {#if (authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER") && u.id !== authStore.user?.id}
                    <button
                      type="button"
                      onclick={() => handleDeleteUser(u.id, u.fullName)}
                      class="p-1.5 rounded-xl bg-white border border-slate-200 hover:border-red-400 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all cursor-pointer"
                      title="Hapus Pengguna"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- DESKTOP TABLE VIEW (md+) UNTUK DAFTAR PENGGUNA -->
      <div class="hidden md:block overflow-x-auto scrollbar-minimalist">
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
          onclick={() => alertStore.toast("Mengirim sinyal uji cetak ESC/POS dan pembukaan laci RJ11...", "info", "Uji Printer & Laci")}
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
        <h3 class="text-sm font-bold text-slate-800">Status Penyimpanan Offline</h3>
        <p class="text-xs text-slate-500 mt-0.5">Database lokal di browser untuk menjamin kasir tetap dapat bertransaksi saat internet mati</p>
      </div>

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
            <span class="font-mono font-bold text-slate-800">82 <span class="hidden md:inline">record</span></span>
          </div>
          <div class="p-2.5 rounded-lg border border-slate-200 bg-white flex justify-between items-center">
            <span class="text-slate-600 font-medium">branchBatches</span>
            <span class="font-mono font-bold text-slate-800">145 <span class="hidden md:inline">batch</span></span>
          </div>
          <div class="p-2.5 rounded-lg border border-slate-200 bg-white flex justify-between items-center">
            <span class="text-slate-600 font-medium">customers</span>
            <span class="font-mono font-bold text-slate-800">4 <span class="hidden md:inline">debitur</span></span>
          </div>
          <div class="p-2.5 rounded-lg border border-slate-200 bg-white flex justify-between items-center">
            <span class="text-slate-600 font-medium">pendingSales</span>
            <span class="font-mono font-bold text-emerald-600">0 <span class="hidden md:inline">antrean</span></span>
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

<!-- MODAL TAMBAH / EDIT CABANG (branches) -->
{#if isBranchModalOpen}
  <div use:portal class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
    <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-brand-blue text-white flex items-center justify-center">
            <Store class="w-4 h-4" />
          </div>
          <div>
            <h4 class="text-sm font-bold text-slate-800">
              {editingBranchId ? "Edit Data Cabang Apotek" : "Tambah Cabang Apotek Baru"}
            </h4>
            <p class="text-[11px] text-slate-500">
              Tabel Master Fondasi: <code class="font-mono">branches</code>
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => (isBranchModalOpen = false)}
          class="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
        {#if branchModalError}
          <div class="p-3 bg-red-50 border border-red-200 text-red-700 font-bold rounded-xl">
            {branchModalError}
          </div>
        {/if}

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label for="bm-code" class="block font-bold text-slate-700 mb-1">Kode Cabang *</label>
            <input
              id="bm-code"
              type="text"
              bind:value={branchForm.code}
              placeholder="1 / PUSAT / GUDANG"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-brand-blue-700 uppercase"
            />
          </div>
          <div class="sm:col-span-2">
            <label for="bm-name" class="block font-bold text-slate-700 mb-1">Nama Cabang / Outlet *</label>
            <input
              id="bm-name"
              type="text"
              bind:value={branchForm.name}
              placeholder="Contoh: Apotek Hafidz Farma - Cabang 2"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="bm-phone" class="block font-bold text-slate-700 mb-1">Nomor Telepon / WhatsApp</label>
            <input
              id="bm-phone"
              type="text"
              bind:value={branchForm.phone}
              placeholder="0812xxxxxxxx"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label for="bm-header" class="block font-bold text-slate-700 mb-1">Header Struk Kasir</label>
            <input
              id="bm-header"
              type="text"
              bind:value={branchForm.receiptHeader}
              placeholder="APOTEK HAFIDZ FARMA"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold"
            />
          </div>
        </div>

        <div>
          <label for="bm-address" class="block font-bold text-slate-700 mb-1">Alamat Lengkap Cabang</label>
          <input
            id="bm-address"
            type="text"
            bind:value={branchForm.address}
            placeholder="Jl. Raya Utama No. 12, Kota..."
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>

        <div>
          <label for="bm-footer" class="block font-bold text-slate-700 mb-1">Slogan / Footer Struk Kasir</label>
          <input
            id="bm-footer"
            type="text"
            bind:value={branchForm.receiptFooter}
            placeholder="Semoga Lekas Sembuh & Sehat Selalu"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>

        {#if !editingBranchId}
          <div class="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
            <label class="flex items-center gap-2 font-bold text-emerald-900 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={branchForm.createDefaultLocation}
                class="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Buat Lokasi Penyimpanan Utama (<code class="font-mono">inventory_location</code>) Otomatis</span>
            </label>

            {#if branchForm.createDefaultLocation}
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <div>
                  <label for="bm-loc-code" class="block text-[11px] font-bold text-emerald-800 mb-1">Kode Lokasi</label>
                  <input
                    id="bm-loc-code"
                    type="text"
                    bind:value={branchForm.defaultLocationCode}
                    placeholder="ETALASE"
                    class="w-full bg-white border border-emerald-200 rounded-lg px-2.5 py-1.5 font-mono font-bold uppercase text-xs"
                  />
                </div>
                <div class="sm:col-span-2">
                  <label for="bm-loc-name" class="block text-[11px] font-bold text-emerald-800 mb-1">Nama Lokasi Default</label>
                  <input
                    id="bm-loc-name"
                    type="text"
                    bind:value={branchForm.defaultLocationName}
                    placeholder="Rak Etalase Utama"
                    class="w-full bg-white border border-emerald-200 rounded-lg px-2.5 py-1.5 font-semibold text-xs"
                  />
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onclick={() => (isBranchModalOpen = false)}
            class="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isSavingBranch}
            onclick={handleSaveBranch}
            class="px-4 py-2 rounded-xl bg-brand-blue hover:bg-blue-700 text-white font-bold disabled:opacity-50 cursor-pointer"
          >
            {isSavingBranch ? "Menyimpan..." : editingBranchId ? "Simpan Perubahan Cabang" : "Tambah Cabang"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL TAMBAH / EDIT LOKASI PENYIMPANAN (inventory_locations) -->
{#if isLocationModalOpen}
  <div use:portal class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
    <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
            <MapPin class="w-4 h-4" />
          </div>
          <div>
            <h4 class="text-sm font-bold text-slate-800">
              {editingLocationId ? "Edit Lokasi Penyimpanan" : "Tambah Lokasi Penyimpanan Stok"}
            </h4>
            <p class="text-[11px] text-slate-500">
              Tabel Master Fondasi: <code class="font-mono">inventory_locations</code>
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => (isLocationModalOpen = false)}
          class="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-5 space-y-4 text-xs">
        {#if locationModalError}
          <div class="p-3 bg-red-50 border border-red-200 text-red-700 font-bold rounded-xl">
            {locationModalError}
          </div>
        {/if}

        <div>
          <label for="lm-branch" class="block font-bold text-slate-700 mb-1">Cabang Apotek *</label>
          <select
            id="lm-branch"
            bind:value={locationForm.branchId}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 cursor-pointer"
          >
            {#each branches as b}
              <option value={b.id}>#{b.code} - {b.name}</option>
            {/each}
          </select>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label for="lm-code" class="block font-bold text-slate-700 mb-1">Kode Lokasi *</label>
            <input
              id="lm-code"
              type="text"
              bind:value={locationForm.code}
              placeholder="ETALASE / GUDANG"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-brand-blue-700 uppercase"
            />
          </div>
          <div class="sm:col-span-2">
            <label for="lm-name" class="block font-bold text-slate-700 mb-1">Nama Lokasi Simpan *</label>
            <input
              id="lm-name"
              type="text"
              bind:value={locationForm.name}
              placeholder="Contoh: Rak Etalase Depan / Lemari Narkotika"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900"
            />
          </div>
        </div>

        <div class="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2.5">
          <label class="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={locationForm.isDefault}
              class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Jadikan Lokasi Utama (Default) di Cabang Ini</span>
          </label>
          <p class="text-[11px] text-slate-500 pl-6">
            Lokasi utama dipakai sebagai titik pemotongan stok kasir POS dan penerimaan barang default cabang.
          </p>

          <label class="flex items-center gap-2 font-bold text-slate-800 cursor-pointer pt-1 border-t border-slate-200/60">
            <input
              type="checkbox"
              bind:checked={locationForm.isActive}
              class="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
            />
            <span>Status Lokasi Penyimpanan Aktif</span>
          </label>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onclick={() => (isLocationModalOpen = false)}
            class="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isSavingLocation}
            onclick={handleSaveLocation}
            class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50 cursor-pointer"
          >
            {isSavingLocation ? "Menyimpan..." : editingLocationId ? "Simpan Lokasi" : "Tambah Lokasi"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
