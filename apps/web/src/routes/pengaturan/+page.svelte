<script lang="ts">
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
    Wifi
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import branchesData from "$lib/mocks/branches.json";
  import usersData from "$lib/mocks/users.json";
  import { authStore } from "$lib/stores/authStore.svelte";

  let activeTab = $state<"cabang" | "pengguna" | "printer" | "diagnostik">("cabang");
  let branches = $state(branchesData);
  let users = $state(usersData);
  let selectedBranch = $state(branches[0]);

  let saveSuccessMessage = $state("");
  let resyncMessage = $state("");

  function handleSaveSettings() {
    saveSuccessMessage = "Pengaturan berhasil disimpan!";
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
  </div>

  <!-- TAB 1: PROFIL CABANG -->
  {#if activeTab === "cabang"}
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
            bind:value={selectedBranch.sia}
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
            bind:value={selectedBranch.sipa}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
          />
        </div>
        <div>
          <label for="br-footer" class="font-bold text-slate-700 block mb-1">Slogan Struk Kasir</label>
          <input
            id="br-footer"
            type="text"
            value="Ikhtiar sehat keluarga - Semoga Lekas Sembuh"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-script text-sm text-slate-700"
          />
        </div>
      </div>
    </div>

  <!-- TAB 2: PENGGUNA & PIN KASIR -->
  {:else if activeTab === "pengguna"}
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Manajemen Staf, Hak Akses & PIN Kasir 6-Digit</h3>
          <p class="text-xs text-slate-500 mt-0.5">PIN digunakan untuk login kilat POS dan verifikasi saat transaksi offline</p>
        </div>
      </div>

      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-100">
              <th class="py-3 px-4">Nama Lengkap</th>
              <th class="py-3 px-4">Email Google SSO</th>
              <th class="py-3 px-4">Peran (Role)</th>
              <th class="py-3 px-4">Penugasan Cabang</th>
              <th class="py-3 px-4 text-center">PIN</th>
              <th class="py-3 px-4 text-center">Status</th>
              <th class="py-3 px-4 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
            {#each users as u}
              <tr class="hover:bg-slate-50/50">
                <td class="py-3.5 px-4 font-bold text-slate-900">{u.fullName}</td>
                <td class="py-3.5 px-4 font-mono text-slate-500 text-[11px]">{u.email}</td>
                <td class="py-3.5 px-4">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold {u.role === 'SUPERADMIN' ? 'bg-blue-100 text-blue-800' : u.role === 'PHARMACIST' ? 'bg-purple-100 text-purple-800' : u.role === 'CASHIER' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
                    {u.role}
                  </span>
                </td>
                <td class="py-3.5 px-4 text-slate-600 font-semibold">{u.branchName}</td>
                <td class="py-3.5 px-4 text-center font-mono font-bold tracking-widest text-slate-500">
                  ••••••
                </td>
                <td class="py-3.5 px-4 text-center">
                  <Badge type="SUCCESS" label="AKTIF" />
                </td>
                <td class="py-3.5 px-4 text-center">
                  <button
                    type="button"
                    onclick={() => alert(`Reset PIN untuk ${u.fullName}`)}
                    class="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-brand-blue hover:bg-blue-50 text-slate-600 hover:text-brand-blue text-[11px] font-bold transition-all"
                  >
                    Ubah PIN
                  </button>
                </td>
              </tr>
            {/each}
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
