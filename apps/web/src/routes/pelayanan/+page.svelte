<script lang="ts">
  import { onMount } from "svelte";
  import {
    FileText,
    Plus,
    Printer,
    UserCheck,
    Stethoscope,
    Pill,
    AlertCircle,
    CheckCircle2,
    Calendar,
    Search,
    Clock,
    X
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
  import doctorsData from "$lib/mocks/doctors.json";
  import customersData from "$lib/mocks/customers.json";
  import productsData from "$lib/mocks/products.json";
  import { portal } from "$lib/actions/portal";

  // State
  let doctors = $state(doctorsData);
  let customers = $state(customersData);
  let products = $state(productsData);

  let activeTab = $state<"resep" | "etiket" | "konseling">("resep");
  let searchQuery = $state("");

  // Modals
  let isAddResepModalOpen = $state(false);
  let isEtiketModalOpen = $state(false);
  let selectedEtiket = $state({
    patientName: "Ibu Siti Rohmah",
    drugName: "Amoxicillin 500mg",
    signa: "3 x Sehari 1 Tablet Sesudah Makan",
    date: "27 Okt 2025",
    type: "PUTIH" // PUTIH (Oral) | BIRU (Luar)
  });

  // Synthetic Prescription List
  let prescriptions = $state([
    {
      id: "rsp-001",
      recipeNumber: "RSP-2025-1027-001",
      doctorName: "dr. Hendra Sp.PD",
      patientName: "Bapak Rudi Hartono",
      date: "2025-10-27 09:30",
      type: "RACIKAN",
      rCount: 3,
      tuslah: 5000,
      embalase: 2000,
      totalPrice: 85000,
      status: "DISPENSED",
      notes: "Racikan kapsul batuk & ekspektoran 10 kapsul"
    },
    {
      id: "rsp-002",
      recipeNumber: "RSP-2025-1027-002",
      doctorName: "dr. Maya Sp.A",
      patientName: "Ananda Farhan (4 thn)",
      date: "2025-10-27 10:15",
      type: "RACIKAN",
      rCount: 2,
      tuslah: 5000,
      embalase: 3000,
      totalPrice: 62000,
      status: "VERIFIED",
      notes: "Sirup kering cefixime + puyer penurun panas"
    },
    {
      id: "rsp-003",
      recipeNumber: "RSP-2025-1027-003",
      doctorName: "dr. Asep Suryana",
      patientName: "Ibu Dewi Lestari",
      date: "2025-10-27 11:00",
      type: "NON_RACIKAN",
      rCount: 2,
      tuslah: 3000,
      embalase: 1000,
      totalPrice: 148500,
      status: "DRAFT",
      notes: "Amlodipine 10mg & Candesartan 8mg"
    }
  ]);

  function formatRupiah(num: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(num);
  }

  let filteredPrescriptions = $derived(
    prescriptions.filter((r) =>
      r.recipeNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.doctorName.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );
</script>

<svelte:head>
  <title>Pelayanan &bull; Hafidz Farma</title>
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Pelayanan Kefarmasian & Resep"
    subtitle="Skrining klinis resep dokter, peracikan obat, dan kefarmasian"
    icon={FileText}
    breadcrumbs={[{ label: "Pelayanan Kefarmasian" }]}
  >
    {#snippet actions()}
      <button
        type="button"
        onclick={() => (isEtiketModalOpen = true)}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs"
      >
        <Printer class="w-4 h-4 text-brand-blue" />
        <span>Cetak Etiket Manual</span>
      </button>

      <button
        type="button"
        onclick={() => (isAddResepModalOpen = true)}
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
      >
        <Plus class="w-4 h-4" />
        <span>Input Resep Dokter Baru</span>
      </button>
    {/snippet}
  </PageHeader>

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Total Resep Hari Ini"
      value="{prescriptions.length} Resep"
      subtext="2 Racikan, 1 Non-Racikan"
      icon={FileText}
      variant="brand"
    />
    <MetricCard
      title="Sedang Disiapkan"
      value="1 Resep"
      subtext="Menunggu verifikasi apoteker"
      icon={Clock}
      variant="warning"
    />
    <MetricCard
      title="Selesai (PIO)"
      value="1 Resep"
      subtext="Disertai edukasi cara minum"
      icon={CheckCircle2}
      variant="success"
    />
    <MetricCard
      title="Total Perujuk"
      value="{doctors.length} Dokter"
      subtext="Terdaftar di database apotek"
      icon={Stethoscope}
      variant="default"
    />
  </div>

  <!-- TAB NAVIGATION -->
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold">
    <button
      type="button"
      onclick={() => (activeTab = "resep")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'resep' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Daftar Resep Masuk ({prescriptions.length})</span>
      {#if activeTab === "resep"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "etiket")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'etiket' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Generator Etiket Obat</span>
      {#if activeTab === "etiket"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>
  </div>

  <!-- TAB 1: RESEP DOKTER -->
  {#if activeTab === "resep"}
    <DataTable
      title="Antrian Resep Dokter & Racikan"
      searchPlaceholder="Cari nomor resep, nama pasien, atau dokter..."
      bind:searchValue={searchQuery}
      totalCount={filteredPrescriptions.length}
    >
      {#snippet header()}
        <th class="py-3 px-4">No. Resep</th>
        <th class="py-3 px-4">Pasien & Dokter</th>
        <th class="py-3 px-4">Tipe Resep</th>
        <th class="py-3 px-4 text-right">Biaya</th>
        <th class="py-3 px-4 text-right">Biaya</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#each filteredPrescriptions as r}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
              {r.recipeNumber}
              <div class="text-[10px] text-slate-400 font-normal">{r.date}</div>
            </td>
            <td class="py-3.5 px-4 font-bold text-slate-800">
              {r.patientName}
              <div class="text-slate-500 font-semibold">{r.doctorName}</div>
            </td>
            <td class="py-3.5 px-4">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold {r.type === 'RACIKAN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
                {r.type} ({r.rCount} R/)
              </span>
            </td>
            <td class="py-3.5 px-4 text-right font-mono text-[11px] text-slate-600">
              <div>Tuslah: {formatRupiah(r.tuslah)}</div>
              <div>Embalase: {formatRupiah(r.embalase)}</div>
            </td>
            <td class="py-3.5 px-4 text-right font-mono font-bold text-brand-blue">
              {formatRupiah(r.totalPrice)}
            </td>
            <td class="py-3.5 px-4 text-center">
              {#if r.status === "DISPENSED"}
                <Badge type="SUCCESS" label="SELESAI (PIO)" />
              {:else if r.status === "VERIFIED"}
                <Badge type="WARNING" label="DISIAPKAN" />
              {:else}
                <Badge type="INFO" label="DRAFT" />
              {/if}
            </td>
            <td class="py-3.5 px-4 text-center">
              <div class="flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  onclick={() => {
                    selectedEtiket = {
                      patientName: r.patientName,
                      drugName: r.notes,
                      signa: "3 x Sehari 1 Tablet Sesudah Makan",
                      date: "27 Okt 2025",
                      type: "PUTIH"
                    };
                    isEtiketModalOpen = true;
                  }}
                  class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-brand-blue"
                  title="Cetak Etiket Obat"
                >
                  <Printer class="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        {/each}
      {/snippet}
    </DataTable>

  <!-- TAB 2: ETIKET OBAT PREVIEW -->
  {:else if activeTab === "etiket"}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- ETIKET PUTIH (OBAT DALAM) -->
      <div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm p-6 space-y-4">
        <div class="text-center border-b-2 border-slate-800 pb-3">
          <div class="font-black text-sm text-slate-900 tracking-tight">APOTEK HAFIDZ FARMA PUSAT</div>
          <div class="text-[10px] text-slate-600">Jl. Letnan Harun No. 12, Indihiang - Tasikmalaya</div>
          <div class="text-[10px] text-slate-600">APA: apt. Hafidz Nurul, S.Farm. | SIPA: 503/044/Dinkes</div>
        </div>

        <div class="space-y-2 text-xs">
          <div class="flex justify-between border-b border-dashed border-slate-200 pb-1">
            <span>No: <strong>RSP-2025-1027-001</strong></span>
            <span>Tgl: <strong>27/10/2025</strong></span>
          </div>
          <div>Pasien: <strong class="text-slate-900 text-sm">Bapak Rudi Hartono</strong></div>
          <div class="py-3 text-center bg-blue-50/50 rounded-xl border border-blue-100 font-extrabold text-brand-blue text-sm">
            3 x Sehari 1 Kapsul<br />
            <span class="text-xs font-semibold text-slate-600">Sesudah Makan</span>
          </div>
          <div class="text-[11px] text-slate-500">
            Obat: <strong>Racikan Kapsul Batuk (10 Kapsul)</strong>
          </div>
        </div>

        <div class="text-center text-[10px] text-slate-400 pt-2 border-t border-slate-100 font-bold uppercase">
          ETIKET OBAT DALAM (PUTIH)
        </div>
      </div>

      <!-- ETIKET BIRU (OBAT LUAR) -->
      <div class="bg-blue-50/60 rounded-2xl border-2 border-blue-300 shadow-sm p-6 space-y-4">
        <div class="text-center border-b-2 border-blue-800 pb-3">
          <div class="font-black text-sm text-blue-950 tracking-tight">APOTEK HAFIDZ FARMA PUSAT</div>
          <div class="text-[10px] text-blue-800">Jl. Letnan Harun No. 12, Indihiang - Tasikmalaya</div>
          <div class="text-[10px] text-blue-800">APA: apt. Hafidz Nurul, S.Farm. | SIPA: 503/044/Dinkes</div>
        </div>

        <div class="space-y-2 text-xs">
          <div class="flex justify-between border-b border-dashed border-blue-200 pb-1">
            <span>No: <strong>RSP-2025-1027-002</strong></span>
            <span>Tgl: <strong>27/10/2025</strong></span>
          </div>
          <div>Pasien: <strong class="text-blue-950 text-sm">Ibu Siti Rohmah</strong></div>
          <div class="py-3 text-center bg-white rounded-xl border border-blue-200 font-extrabold text-blue-900 text-sm">
            Oleskan Tipis Pada Area Gatal<br />
            <span class="text-xs font-semibold text-blue-700">2 x Sehari (Pagi & Malam)</span>
          </div>
          <div class="text-[11px] text-blue-800">
            Obat: <strong>Salep Kulit Hidrokortison 2.5%</strong>
          </div>
        </div>

        <div class="text-center text-[10px] text-brand-red-600 pt-2 border-t border-blue-200 font-black uppercase tracking-wider">
          OBAT LUAR - TIDAK BOLEH DITELAN
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- MODAL INPUT RESEP -->
{#if isAddResepModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isAddResepModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <FileText class="w-5 h-5 text-brand-blue" />
          <span>Input Resep Dokter Baru</span>
        </div>
        <button
          onclick={() => (isAddResepModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label for="rsp-patient" class="font-bold text-slate-700 block mb-1">Nama Pasien</label>
          <SearchableSelect
            id="rsp-patient"
            variant="default"
            searchPlaceholder="Cari nama pasien atau kode..."
            options={customers.map((c) => ({
              value: `${c.name} (${c.code})`,
              label: `${c.name} (${c.code})`,
              sublabel: c.phone && c.phone !== "-" ? `${c.phone} • ${c.address}` : "Pasien Umum"
            }))}
          />
        </div>
        <div>
          <label for="rsp-doctor" class="font-bold text-slate-700 block mb-1">Dokter Penulis</label>
          <SearchableSelect
            id="rsp-doctor"
            variant="default"
            searchPlaceholder="Cari dokter atau RS..."
            options={doctors.map((d) => ({
              value: `${d.name} (${d.hospital})`,
              label: `${d.name} (${d.hospital})`,
              sublabel: `SIP: ${d.sip}`
            }))}
          />
        </div>
        <div>
          <label for="rsp-type" class="font-bold text-slate-700 block mb-1">Bentuk Resep</label>
          <Select
            id="rsp-type"
            options={[
              "Racikan (Puyer / Kapsul / Salep)",
              "Non-Racikan (Obat Jadi)"
            ]}
          />
        </div>
        <div>
          <label for="rsp-tuslah" class="font-bold text-slate-700 block mb-1">Tuslah Jasa Apoteker (Rp)</label>
          <input
            id="rsp-tuslah"
            type="number"
            value="5000"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
          />
        </div>
        <div class="col-span-2">
          <label for="rsp-desc" class="font-bold text-slate-700 block mb-1">Instruksi Racikan / Signa</label>
          <textarea
            id="rsp-desc"
            rows="2"
            placeholder="Contoh: R/ Paracetamol 250mg, CTM 2mg, Salbutamol 1mg m.f. pulv. d.t.d No. X S. 3 dd p.I"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-xs"
          ></textarea>
        </div>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isAddResepModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={() => {
            isAddResepModalOpen = false;
            alert("Resep berhasil diverifikasi dan masuk antrian dispensing!");
          }}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm"
        >
          Verifikasi & Simpan Resep
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL CETAK ETIKET -->
{#if isEtiketModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isEtiketModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <Printer class="w-5 h-5 text-brand-blue" />
          <span>Cetak Etiket Obat</span>
        </div>
        <button
          onclick={() => (isEtiketModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="p-4 border-2 border-slate-300 rounded-xl text-center space-y-2 text-xs">
        <div class="font-extrabold text-slate-900">APOTEK HAFIDZ FARMA PUSAT</div>
        <div class="text-[10px] text-slate-500">Pasien: <strong>{selectedEtiket.patientName}</strong></div>
        <div class="p-2 bg-blue-50 rounded-lg font-black text-brand-blue">{selectedEtiket.signa}</div>
        <div class="text-[10px] text-slate-400">{selectedEtiket.drugName}</div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onclick={() => (isEtiketModalOpen = false)}
          class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={() => {
            isEtiketModalOpen = false;
            alert("Etiket berhasil dicetak ke printer label!");
          }}
          class="px-4 py-1.5 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm"
        >
          Cetak Sekarang
        </button>
      </div>
    </div>
  </div>
{/if}
