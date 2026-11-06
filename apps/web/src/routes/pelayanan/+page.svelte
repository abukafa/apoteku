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
    Eye,
    Trash2,
    MessageSquareHeart,
    ClipboardCheck,
    Sparkles,
    Paperclip,
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
  import branchesData from "$lib/mocks/branches.json";
  import { portal } from "$lib/actions/portal";
  import { api } from "$lib/services/api";
  import { mockApi } from "$lib/services/mock-api";

  interface PrescriptionItem {
    productId: string;
    productName: string;
    qty: number;
    unit: string;
    unitPrice: number;
    dosageNote: string;
  }

  interface PrescriptionRecord {
    id: string;
    recipeNumber: string;
    branchId: string;
    branchName: string;
    doctorName: string;
    patientName: string;
    date: string;
    type: "RACIKAN" | "NON_RACIKAN";
    compoundForm?: string;
    compoundQty?: number;
    etiketType: "PUTIH" | "BIRU";
    signa: string;
    instruction: string;
    budDate: string;
    rCount: number;
    tuslah: number;
    embalase: number;
    drugSubtotal: number;
    totalPrice: number;
    status: "DRAFT" | "VERIFIED" | "DISPENSED";
    prescriptionImageUrl?: string | null;
    notes: string;
    clinicalScreening: {
      adminComplete: boolean;
      doseVerified: boolean;
      noInteraction: boolean;
      allergyHistory: string;
    };
    items: PrescriptionItem[];
  }

  interface CounselingRecord {
    id: string;
    recipeNumber: string;
    branchId: string;
    date: string;
    patientName: string;
    doctorName: string;
    drugSummary: string;
    signa: string;
    allergyNote: string;
    pioPoints: string;
    pharmacistName: string;
  }

  // Master Data State
  let doctors = $state(doctorsData);
  let customers = $state<any[]>(customersData);
  let products = $state<any[]>(productsData);
  let branches = $state<any[]>(branchesData);

  // Filter & Navigation State
  let selectedBranchId = $state("ALL");
  let activeTab = $state<"resep" | "etiket" | "konseling">("resep");
  let statusFilter = $state<"ALL" | "DRAFT" | "VERIFIED" | "DISPENSED">("ALL");
  let searchQuery = $state("");
  let pioSearchQuery = $state("");

  // Synthetic Prescription List
  let prescriptions = $state<PrescriptionRecord[]>([
    {
      id: "rsp-001",
      recipeNumber: "RSP-2025-1027-001",
      branchId: "1",
      branchName: "Apotek Hafidz Farma 1 (Pusat)",
      doctorName: "dr. Hendra Sp.PD",
      patientName: "Bapak Rudi Hartono",
      date: "2025-10-27 09:30",
      type: "RACIKAN",
      compoundForm: "KAPSUL",
      compoundQty: 10,
      etiketType: "PUTIH",
      signa: "3 x Sehari 1 Kapsul",
      instruction: "Sesudah Makan",
      budDate: "2025-11-27",
      rCount: 3,
      tuslah: 5000,
      embalase: 2000,
      drugSubtotal: 78000,
      totalPrice: 85000,
      status: "DISPENSED",
      notes: "Racikan kapsul batuk & ekspektoran 10 kapsul",
      clinicalScreening: {
        adminComplete: true,
        doseVerified: true,
        noInteraction: true,
        allergyHistory: "Tidak ada alergi obat"
      },
      items: [
        {
          productId: "prod-amox-500",
          productName: "Amoxicillin 500mg (Errata)",
          qty: 10,
          unit: "TABLET",
          unitPrice: 850,
          dosageNote: "500mg / kapsul"
        },
        {
          productId: "prod-pct-500",
          productName: "Paracetamol 500mg (Kimia Farma)",
          qty: 10,
          unit: "TABLET",
          unitPrice: 450,
          dosageNote: "500mg / kapsul"
        }
      ]
    },
    {
      id: "rsp-002",
      recipeNumber: "RSP-2025-1027-002",
      branchId: "1",
      branchName: "Apotek Hafidz Farma 1 (Pusat)",
      doctorName: "dr. Maya Sp.A",
      patientName: "Ananda Farhan (4 thn)",
      date: "2025-10-27 10:15",
      type: "RACIKAN",
      compoundForm: "PUYER",
      compoundQty: 12,
      etiketType: "PUTIH",
      signa: "3 x Sehari 1 Bungkus Puyer",
      instruction: "Sesudah Makan (Bila Demam)",
      budDate: "2025-11-10",
      rCount: 2,
      tuslah: 5000,
      embalase: 3000,
      drugSubtotal: 54000,
      totalPrice: 62000,
      status: "VERIFIED",
      notes: "Sirup kering cefixime + puyer penurun panas 12 bungkus",
      clinicalScreening: {
        adminComplete: true,
        doseVerified: true,
        noInteraction: true,
        allergyHistory: "Riwayat asma ringan"
      },
      items: [
        {
          productId: "prod-pct-500",
          productName: "Paracetamol 500mg (Kimia Farma)",
          qty: 6,
          unit: "TABLET",
          unitPrice: 450,
          dosageNote: "250mg / bungkus (m.f. pulv. d.t.d No. XII)"
        }
      ]
    },
    {
      id: "rsp-003",
      recipeNumber: "RSP-2025-1027-003",
      branchId: "2",
      branchName: "Apotek Hafidz Farma 2 (Ciawi)",
      doctorName: "dr. Asep Suryana",
      patientName: "Ibu Dewi Lestari",
      date: "2025-10-27 11:00",
      type: "NON_RACIKAN",
      etiketType: "PUTIH",
      signa: "1 x Sehari 1 Tablet",
      instruction: "Pagi Hari Sesudah Makan",
      budDate: "2027-05-15",
      rCount: 2,
      tuslah: 3000,
      embalase: 1000,
      drugSubtotal: 144500,
      totalPrice: 148500,
      status: "DRAFT",
      notes: "Amlodipine 10mg & Candesartan 8mg (Terapi Hipertensi Rutin)",
      clinicalScreening: {
        adminComplete: true,
        doseVerified: false,
        noInteraction: true,
        allergyHistory: "Tidak ada"
      },
      items: [
        {
          productId: "prod-amlo-10",
          productName: "Amlodipine 10mg (Dexa)",
          qty: 30,
          unit: "TABLET",
          unitPrice: 1100,
          dosageNote: "S 1 dd 1 tab pc pagi"
        }
      ]
    }
  ]);

  // Synthetic Counseling / PIO Records
  let counselingRecords = $state<CounselingRecord[]>([
    {
      id: "pio-001",
      recipeNumber: "RSP-2025-1027-001",
      branchId: "1",
      date: "2025-10-27 09:48",
      patientName: "Bapak Rudi Hartono",
      doctorName: "dr. Hendra Sp.PD",
      drugSummary: "Racikan kapsul batuk & ekspektoran 10 kapsul",
      signa: "3 x Sehari 1 Kapsul (Sesudah Makan)",
      allergyNote: "Tidak ada alergi obat",
      pioPoints:
        "Antibiotik wajib dihabiskan setiap 8 jam. Simpan kapsul racikan di tempat kering (BUD 30 hari). Perbanyak minum air hangat.",
      pharmacistName: "apt. Hafidz Nurul, S.Farm."
    }
  ]);

  // Modals State
  let isAddResepModalOpen = $state(false);
  let isEtiketModalOpen = $state(false);
  let isDetailModalOpen = $state(false);
  let isPioModalOpen = $state(false);

  let selectedPrescription = $state<PrescriptionRecord | null>(null);

  // Interactive Etiket State (used by Modal & Tab 2 Generator)
  let selectedEtiket = $state({
    recipeNumber: "RSP-2025-1027-001",
    branchName: "APOTEK HAFIDZ FARMA PUSAT",
    patientName: "Bapak Rudi Hartono",
    drugName: "Racikan Kapsul Batuk (10 Kapsul)",
    signa: "3 x Sehari 1 Kapsul",
    instruction: "Sesudah Makan • Habiskan",
    date: "27/10/2025",
    budDate: "27/11/2025",
    type: "PUTIH" as "PUTIH" | "BIRU"
  });

  // Form Input Resep Baru State
  let newResepForm = $state({
    branchId: "1",
    patientName: "Ny. Santi (Resep Rutin) (AHF-000003)",
    doctorName: "dr. Hendra Sp.PD (RSUD dr. Soekardjo)",
    type: "RACIKAN" as "RACIKAN" | "NON_RACIKAN",
    compoundForm: "KAPSUL",
    compoundQty: 10,
    etiketType: "PUTIH" as "PUTIH" | "BIRU",
    signa: "3 x Sehari 1 Kapsul",
    instruction: "Sesudah Makan",
    budDate: "2025-11-27",
    tuslah: 5000,
    embalase: 2000,
    notes: "",
    allergyHistory: "Tidak ada",
    prescriptionImageUrl: "",
    items: [
      {
        productId: "prod-amox-500",
        productName: "Amoxicillin 500mg (Errata)",
        qty: 10,
        unit: "TABLET",
        unitPrice: 850,
        dosageNote: "500mg"
      }
    ] as PrescriptionItem[]
  });

  let isUploadingPrescription = $state(false);
  let uploadError = $state("");

  async function handlePrescriptionFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    isUploadingPrescription = true;
    uploadError = "";
    try {
      const res = await api.media.uploadFile(file, "prescriptions");
      if (res?.success && res.url) {
        newResepForm.prescriptionImageUrl = res.url;
      } else {
        uploadError = "Upload gagal, format tidak didukung.";
      }
    } catch (err: any) {
      uploadError = err?.message || "Gagal mengunggah berkas resep";
    } finally {
      isUploadingPrescription = false;
    }
  }

  // Draft item selector inside New Prescription Modal
  let draftItemProductId = $state("prod-amox-500");
  let draftItemQty = $state(10);
  let draftItemDosageNote = $state("1 tab / dosis");

  // Form Input PIO / Konseling State
  let pioForm = $state({
    recipeId: "",
    recipeNumber: "",
    patientName: "",
    doctorName: "",
    drugSummary: "",
    signa: "",
    allergyNote: "Tidak ada alergi obat",
    pioPoints:
      "Edukasi aturan pakai sesuai signa, waktu minum obat, efek samping ringan yang mungkin muncul, dan cara penyimpanan obat (BUD).",
    pharmacistName: "apt. Hafidz Nurul, S.Farm."
  });

  onMount(async () => {
    selectedBranchId = "ALL";
    try {
      await mockApi.ensureDataLoaded();
      const [prods, custs, branchList, prescList] = await Promise.all([
        mockApi.getProducts(),
        mockApi.getCustomers(),
        mockApi.getBranches(),
        api.prescription.list()
      ]);
      if (prods.length > 0) {
        products = prods;
        if (prods[0]?.id) {
          draftItemProductId = prods[0].id;
        }
      }
      if (custs.length > 0) customers = custs;
      if (branchList.length > 0) {
        branches = branchList;
        if (newResepForm.branchId === "1" && branchList[0]?.id) {
          newResepForm.branchId = branchList[0].id;
        }
      }
      if (prescList?.success && Array.isArray(prescList.data) && prescList.data.length > 0) {
        prescriptions = prescList.data;
      }
    } catch (_) {}
  });

  function formatRupiah(num: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(num);
  }

  // Reactive Derived Data
  let branchFilteredPrescriptions = $derived(
    prescriptions.filter(
      (r) => selectedBranchId === "ALL" || r.branchId === selectedBranchId
    )
  );

  let racikanCount = $derived(
    branchFilteredPrescriptions.filter((r) => r.type === "RACIKAN").length
  );
  let nonRacikanCount = $derived(
    branchFilteredPrescriptions.filter((r) => r.type === "NON_RACIKAN").length
  );
  let preparingCount = $derived(
    branchFilteredPrescriptions.filter(
      (r) => r.status === "DRAFT" || r.status === "VERIFIED"
    ).length
  );
  let dispensedCount = $derived(
    branchFilteredPrescriptions.filter((r) => r.status === "DISPENSED").length
  );

  let filteredPrescriptions = $derived(
    branchFilteredPrescriptions.filter((r) => {
      const matchStatus =
        statusFilter === "ALL" || r.status === statusFilter;
      const q = searchQuery.toLowerCase();
      const matchSearch =
        r.recipeNumber.toLowerCase().includes(q) ||
        r.patientName.toLowerCase().includes(q) ||
        r.doctorName.toLowerCase().includes(q) ||
        r.notes.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    })
  );

  let filteredCounselings = $derived(
    counselingRecords.filter((c) => {
      const matchBranch =
        selectedBranchId === "ALL" || c.branchId === selectedBranchId;
      const q = pioSearchQuery.toLowerCase();
      const matchSearch =
        c.recipeNumber.toLowerCase().includes(q) ||
        c.patientName.toLowerCase().includes(q) ||
        c.drugSummary.toLowerCase().includes(q);
      return matchBranch && matchSearch;
    })
  );

  let newResepDrugSubtotal = $derived(
    newResepForm.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
  );

  let newResepGrandTotal = $derived(
    newResepDrugSubtotal +
      (Number(newResepForm.tuslah) || 0) +
      (Number(newResepForm.embalase) || 0)
  );

  function addDraftItemToResep() {
    const prod = products.find((p) => p.id === draftItemProductId);
    if (!prod || draftItemQty <= 0) return;

    const baseUnitObj = prod.units?.[0];
    const prescriptionPrice =
      baseUnitObj?.prices?.prescription ?? baseUnitObj?.prices?.general ?? 1000;

    newResepForm.items = [
      ...newResepForm.items,
      {
        productId: prod.id,
        productName: prod.name,
        qty: Number(draftItemQty),
        unit: prod.baseUnit || "TABLET",
        unitPrice: prescriptionPrice,
        dosageNote: draftItemDosageNote || "-"
      }
    ];
    draftItemQty = 10;
    draftItemDosageNote = "";
  }

  function removeDraftItemFromResep(idx: number) {
    newResepForm.items = newResepForm.items.filter((_, i) => i !== idx);
  }

  async function submitNewPrescription() {
    if (newResepForm.items.length === 0) return;

    const branchObj = branches.find((b) => b.id === newResepForm.branchId);
    const doctorClean = newResepForm.doctorName.split(" (")[0] || newResepForm.doctorName;
    const patientClean = newResepForm.patientName.split(" (")[0] || newResepForm.patientName;

    try {
      const res = await api.prescription.create({
        branchId: newResepForm.branchId,
        doctorName: doctorClean,
        patientName: patientClean,
        type: newResepForm.type,
        compoundForm: newResepForm.type === "RACIKAN" ? newResepForm.compoundForm : undefined,
        compoundQty: newResepForm.type === "RACIKAN" ? newResepForm.compoundQty : undefined,
        etiketType: newResepForm.etiketType,
        signa: newResepForm.signa,
        instruction: newResepForm.instruction,
        budDate: newResepForm.budDate,
        tuslah: Number(newResepForm.tuslah) || 0,
        embalase: Number(newResepForm.embalase) || 0,
        notes: newResepForm.notes,
        prescriptionImageUrl: newResepForm.prescriptionImageUrl || undefined,
        items: newResepForm.items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          qty: i.qty,
          unit: i.unit,
          unitPrice: i.unitPrice,
          dosageNote: i.dosageNote
        }))
      });

      if (res?.success && res.data) {
        prescriptions = [res.data, ...prescriptions];
      } else {
        throw new Error(res?.error || "Gagal menyimpan resep ke API");
      }
    } catch (err) {
      console.warn("Gagal simpan resep via API, fallback lokal:", err);
      const nextNum = String(prescriptions.length + 1).padStart(3, "0");
      const recipeNumber = `RSP-2025-1027-${nextNum}`;
      const summaryNotes =
        newResepForm.notes.trim() ||
        newResepForm.items.map((i) => `${i.productName} (${i.qty} ${i.unit})`).join(", ");

      const created: PrescriptionRecord = {
        id: `rsp-${Date.now()}`,
        recipeNumber,
        branchId: newResepForm.branchId,
        branchName: branchObj?.name || "Apotek Hafidz Farma 1 (Pusat)",
        doctorName: doctorClean,
        patientName: patientClean,
        date: new Date().toISOString().replace("T", " ").substring(0, 16),
        type: newResepForm.type,
        compoundForm: newResepForm.type === "RACIKAN" ? newResepForm.compoundForm : undefined,
        compoundQty: newResepForm.type === "RACIKAN" ? newResepForm.compoundQty : undefined,
        etiketType: newResepForm.etiketType,
        signa: newResepForm.signa,
        instruction: newResepForm.instruction,
        budDate: newResepForm.budDate,
        rCount: newResepForm.items.length,
        tuslah: Number(newResepForm.tuslah) || 0,
        embalase: Number(newResepForm.embalase) || 0,
        drugSubtotal: newResepDrugSubtotal,
        totalPrice: newResepGrandTotal,
        status: "VERIFIED",
        notes: summaryNotes,
        prescriptionImageUrl: newResepForm.prescriptionImageUrl || undefined,
        clinicalScreening: {
          adminComplete: true,
          doseVerified: true,
          noInteraction: true,
          allergyHistory: newResepForm.allergyHistory || "Tidak ada"
        },
        items: [...newResepForm.items]
      };
      prescriptions = [created, ...prescriptions];
    }

    isAddResepModalOpen = false;
  }

  function verifyPrescription(r: PrescriptionRecord) {
    prescriptions = prescriptions.map((item) =>
      item.id === r.id
        ? {
            ...item,
            status: "VERIFIED",
            clinicalScreening: {
              ...item.clinicalScreening,
              adminComplete: true,
              doseVerified: true,
              noInteraction: true
            }
          }
        : item
    );
  }

  function openPioHandoverModal(r: PrescriptionRecord) {
    pioForm = {
      recipeId: r.id,
      recipeNumber: r.recipeNumber,
      patientName: r.patientName,
      doctorName: r.doctorName,
      drugSummary: r.notes,
      signa: `${r.signa} (${r.instruction})`,
      allergyNote: r.clinicalScreening.allergyHistory || "Tidak ada alergi obat",
      pioPoints:
        "Pasien telah diedukasi cara pakai obat sesuai Signa, aturan waktu minum, serta batas simpan obat (BUD).",
      pharmacistName: "apt. Hafidz Nurul, S.Farm."
    };
    isPioModalOpen = true;
  }

  function submitPioHandover() {
    prescriptions = prescriptions.map((item) =>
      item.id === pioForm.recipeId ? { ...item, status: "DISPENSED" } : item
    );

    const targetResep = prescriptions.find((item) => item.id === pioForm.recipeId);
    counselingRecords = [
      {
        id: `pio-${Date.now()}`,
        recipeNumber: pioForm.recipeNumber || "RSP-MANUAL",
        branchId: targetResep?.branchId || "1",
        date: "2025-10-27 12:10",
        patientName: pioForm.patientName,
        doctorName: pioForm.doctorName,
        drugSummary: pioForm.drugSummary,
        signa: pioForm.signa,
        allergyNote: pioForm.allergyNote,
        pioPoints: pioForm.pioPoints,
        pharmacistName: pioForm.pharmacistName
      },
      ...counselingRecords
    ];

    isPioModalOpen = false;
  }

  function openEtiketForPrescription(r: PrescriptionRecord) {
    selectedEtiket = {
      recipeNumber: r.recipeNumber,
      branchName: r.branchName.toUpperCase(),
      patientName: r.patientName,
      drugName: r.notes,
      signa: r.signa,
      instruction: r.instruction,
      date: r.date.split(" ")[0] || "27/10/2025",
      budDate: r.budDate,
      type: r.etiketType
    };
    isEtiketModalOpen = true;
  }

  function openDetailModal(r: PrescriptionRecord) {
    selectedPrescription = r;
    isDetailModalOpen = true;
  }
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
      <!-- Branch Selector -->
      <div class="w-56">
        <Select
          value={selectedBranchId}
          onchange={(val) => (selectedBranchId = val)}
          options={[
            { value: "ALL", label: "Semua Cabang Apotek" },
            ...branches.map((b) => ({ value: b.id, label: b.name }))
          ]}
        />
      </div>

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
      value="{branchFilteredPrescriptions.length} Resep"
      subtext="{racikanCount} Racikan, {nonRacikanCount} Non-Racikan"
      icon={FileText}
      variant="brand"
    />
    <MetricCard
      title="Sedang Disiapkan"
      value="{preparingCount} Resep"
      subtext="Skrining & peracikan aktif"
      icon={Clock}
      variant="warning"
    />
    <MetricCard
      title="Selesai (PIO)"
      value="{dispensedCount} Resep"
      subtext="Diserahkan beserta edukasi"
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
      <span>Daftar Resep Masuk ({branchFilteredPrescriptions.length})</span>
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

    <button
      type="button"
      onclick={() => (activeTab = "konseling")}
      class="pb-3 px-3 transition-colors relative {activeTab === 'konseling' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Dokumentasi PIO & Konseling ({filteredCounselings.length})</span>
      {#if activeTab === "konseling"}
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
      {#snippet filters()}
        <div class="w-44 shrink-0">
          <Select
            value={statusFilter}
            onchange={(val) => (statusFilter = val as typeof statusFilter)}
            options={[
              { value: "ALL", label: "Semua Status" },
              { value: "DRAFT", label: "Draft Skrining" },
              { value: "VERIFIED", label: "Disiapkan" },
              { value: "DISPENSED", label: "Selesai (PIO)" }
            ]}
          />
        </div>
      {/snippet}

      {#snippet header()}
        <th class="py-3 px-4">No. Resep</th>
        <th class="py-3 px-4">Pasien & Dokter</th>
        <th class="py-3 px-4">Tipe & Komposisi</th>
        <th class="py-3 px-4 text-right">Tuslah & Embalase</th>
        <th class="py-3 px-4 text-right">Total Resep</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#each filteredPrescriptions as r}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
              {r.recipeNumber}
              <div class="text-[10px] text-slate-400 font-normal">{r.date}</div>
              <div class="text-[10px] text-brand-blue font-sans font-semibold">{r.branchName}</div>
            </td>
            <td class="py-3.5 px-4 font-bold text-slate-800">
              {r.patientName}
              <div class="text-slate-500 font-semibold text-xs">{r.doctorName}</div>
            </td>
            <td class="py-3.5 px-4">
              <div class="flex items-center gap-1.5 mb-1">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold {r.type === 'RACIKAN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
                  {r.type} ({r.rCount} R/)
                </span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold {r.etiketType === 'PUTIH' ? 'bg-slate-100 text-slate-700 border border-slate-300' : 'bg-blue-600 text-white'}">
                  Etiket {r.etiketType}
                </span>
              </div>
              <div class="text-xs text-slate-700 font-medium line-clamp-1">{r.notes}</div>
              <div class="text-[11px] text-slate-500 font-mono">{r.signa} • {r.instruction}</div>
            </td>
            <td class="py-3.5 px-4 text-right font-mono text-[11px] text-slate-600">
              <div>Tuslah: {formatRupiah(r.tuslah)}</div>
              <div>Embalase: {formatRupiah(r.embalase)}</div>
            </td>
            <td class="py-3.5 px-4 text-right font-mono font-bold text-brand-blue">
              {formatRupiah(r.totalPrice)}
              <div class="text-[10px] text-slate-400 font-normal">
                Obat: {formatRupiah(r.drugSubtotal)}
              </div>
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
                {#if r.status === "DRAFT"}
                  <button
                    type="button"
                    onclick={() => verifyPrescription(r)}
                    class="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold transition-colors shadow-xs"
                    title="Verifikasi Skrining Klinis & Mulai Racik"
                  >
                    Verifikasi
                  </button>
                {:else if r.status === "VERIFIED"}
                  <button
                    type="button"
                    onclick={() => openPioHandoverModal(r)}
                    class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors shadow-xs"
                    title="Serahkan Obat & Catat Edukasi PIO"
                  >
                    Serahkan & PIO
                  </button>
                {/if}

                <button
                  type="button"
                  onclick={() => openEtiketForPrescription(r)}
                  class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-brand-blue"
                  title="Cetak Etiket Obat"
                >
                  <Printer class="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onclick={() => openDetailModal(r)}
                  class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-brand-blue"
                  title="Detail Skrining & Komposisi Resep"
                >
                  <Eye class="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        {/each}
      {/snippet}
    </DataTable>

  <!-- TAB 2: ETIKET OBAT PREVIEW & GENERATOR -->
  {:else if activeTab === "etiket"}
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- FORM CUSTOMIZER ETIKET -->
      <div class="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Printer class="w-4 h-4 text-brand-blue" />
            <span>Kustomisasi Etiket Obat</span>
          </div>
          <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
            58mm x 40mm
          </span>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label for="gen-type" class="font-bold text-slate-700 block mb-1">Jenis Etiket</label>
            <Select
              id="gen-type"
              value={selectedEtiket.type}
              onchange={(val) => (selectedEtiket.type = val as "PUTIH" | "BIRU")}
              options={[
                { value: "PUTIH", label: "Etiket Putih (Obat Dalam)" },
                { value: "BIRU", label: "Etiket Biru (Obat Luar)" }
              ]}
            />
          </div>
          <div>
            <label for="gen-no" class="font-bold text-slate-700 block mb-1">Nomor Resep</label>
            <input
              id="gen-no"
              type="text"
              bind:value={selectedEtiket.recipeNumber}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
            />
          </div>
          <div class="col-span-2">
            <label for="gen-patient" class="font-bold text-slate-700 block mb-1">Nama Pasien</label>
            <input
              id="gen-patient"
              type="text"
              bind:value={selectedEtiket.patientName}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
            />
          </div>
          <div class="col-span-2">
            <label for="gen-drug" class="font-bold text-slate-700 block mb-1">Nama Obat / Sediaan Racikan</label>
            <input
              id="gen-drug"
              type="text"
              bind:value={selectedEtiket.drugName}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label for="gen-signa" class="font-bold text-slate-700 block mb-1">Aturan Pakai (Signa)</label>
            <input
              id="gen-signa"
              type="text"
              bind:value={selectedEtiket.signa}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-brand-blue"
            />
          </div>
          <div>
            <label for="gen-inst" class="font-bold text-slate-700 block mb-1">Waktu / Instruksi</label>
            <input
              id="gen-inst"
              type="text"
              bind:value={selectedEtiket.instruction}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label for="gen-date" class="font-bold text-slate-700 block mb-1">Tanggal Pelayanan</label>
            <input
              id="gen-date"
              type="text"
              bind:value={selectedEtiket.date}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label for="gen-bud" class="font-bold text-slate-700 block mb-1">Batas Simpan (BUD/ED)</label>
            <input
              id="gen-bud"
              type="text"
              bind:value={selectedEtiket.budDate}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
            />
          </div>
        </div>

        <div class="pt-2 flex justify-end">
          <button
            type="button"
            onclick={() => (isEtiketModalOpen = true)}
            class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white text-xs font-bold shadow-xs"
          >
            <Printer class="w-4 h-4" />
            <span>Cetak Label Etiket</span>
          </button>
        </div>
      </div>

      <!-- DUAL LIVE PREVIEW: PUTIH & BIRU -->
      <div class="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <!-- ETIKET PUTIH (OBAT DALAM) -->
        <div class="bg-white rounded-2xl border-2 {selectedEtiket.type === 'PUTIH' ? 'border-brand-blue ring-4 ring-blue-500/10' : 'border-slate-200'} shadow-sm p-6 space-y-4">
          <div class="text-center border-b-2 border-slate-800 pb-3">
            <div class="font-black text-sm text-slate-900 tracking-tight">{selectedEtiket.branchName}</div>
            <div class="text-[10px] text-slate-600">Jl. Letnan Harun No. 12, Indihiang - Tasikmalaya</div>
            <div class="text-[10px] text-slate-600">APA: apt. Hafidz Nurul, S.Farm. | SIPA: 503/044/Dinkes</div>
          </div>

          <div class="space-y-2 text-xs">
            <div class="flex justify-between border-b border-dashed border-slate-200 pb-1">
              <span>No: <strong>{selectedEtiket.recipeNumber}</strong></span>
              <span>Tgl: <strong>{selectedEtiket.date}</strong></span>
            </div>
            <div>Pasien: <strong class="text-slate-900 text-sm">{selectedEtiket.patientName}</strong></div>
            <div class="py-3 text-center bg-blue-50/50 rounded-xl border border-blue-100 font-extrabold text-brand-blue text-sm">
              {selectedEtiket.signa}<br />
              <span class="text-xs font-semibold text-slate-600">{selectedEtiket.instruction}</span>
            </div>
            <div class="flex justify-between text-[11px] text-slate-600 pt-1">
              <span>Obat: <strong>{selectedEtiket.drugName}</strong></span>
            </div>
            <div class="text-[10px] text-slate-400 font-mono">
              Baik digunakan sebelum (BUD): {selectedEtiket.budDate}
            </div>
          </div>

          <div class="text-center text-[10px] text-slate-500 pt-2 border-t border-slate-100 font-bold uppercase">
            ETIKET OBAT DALAM (PUTIH)
          </div>
        </div>

        <!-- ETIKET BIRU (OBAT LUAR) -->
        <div class="bg-blue-50/70 rounded-2xl border-2 {selectedEtiket.type === 'BIRU' ? 'border-blue-600 ring-4 ring-blue-500/15' : 'border-blue-300'} shadow-sm p-6 space-y-4">
          <div class="text-center border-b-2 border-blue-800 pb-3">
            <div class="font-black text-sm text-blue-950 tracking-tight">{selectedEtiket.branchName}</div>
            <div class="text-[10px] text-blue-800">Jl. Letnan Harun No. 12, Indihiang - Tasikmalaya</div>
            <div class="text-[10px] text-blue-800">APA: apt. Hafidz Nurul, S.Farm. | SIPA: 503/044/Dinkes</div>
          </div>

          <div class="space-y-2 text-xs">
            <div class="flex justify-between border-b border-dashed border-blue-200 pb-1">
              <span>No: <strong>{selectedEtiket.recipeNumber}</strong></span>
              <span>Tgl: <strong>{selectedEtiket.date}</strong></span>
            </div>
            <div>Pasien: <strong class="text-blue-950 text-sm">{selectedEtiket.patientName}</strong></div>
            <div class="py-3 text-center bg-white rounded-xl border border-blue-200 font-extrabold text-blue-900 text-sm">
              {selectedEtiket.type === "BIRU" ? selectedEtiket.signa : "Oleskan Tipis Pada Area Sakit"}<br />
              <span class="text-xs font-semibold text-blue-700">
                {selectedEtiket.type === "BIRU" ? selectedEtiket.instruction : "2 x Sehari (Pagi & Malam)"}
              </span>
            </div>
            <div class="text-[11px] text-blue-900">
              Obat: <strong>{selectedEtiket.type === "BIRU" ? selectedEtiket.drugName : "Salep Kulit Hidrokortison 2.5%"}</strong>
            </div>
            <div class="text-[10px] text-blue-700 font-mono">
              Baik digunakan sebelum (BUD): {selectedEtiket.budDate}
            </div>
          </div>

          <div class="text-center text-[10px] text-brand-red-600 pt-2 border-t border-blue-200 font-black uppercase tracking-wider">
            OBAT LUAR - TIDAK BOLEH DITELAN
          </div>
        </div>
      </div>
    </div>

  <!-- TAB 3: DOKUMENTASI PIO & KONSELING -->
  {:else if activeTab === "konseling"}
    <DataTable
      title="Log Pelayanan Informasi Obat (PIO) & Konseling Pasien"
      searchPlaceholder="Cari nomor resep, nama pasien, atau obat..."
      bind:searchValue={pioSearchQuery}
      totalCount={filteredCounselings.length}
    >
      {#snippet header()}
        <th class="py-3 px-4">Waktu & No. Resep</th>
        <th class="py-3 px-4">Pasien & Dokter</th>
        <th class="py-3 px-4">Obat & Signa</th>
        <th class="py-3 px-4">Riwayat Alergi</th>
        <th class="py-3 px-4">Materi Edukasi PIO</th>
        <th class="py-3 px-4">Apoteker</th>
      {/snippet}

      {#snippet rows()}
        {#each filteredCounselings as c}
          <tr class="hover:bg-blue-50/40 transition-colors">
            <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
              {c.recipeNumber}
              <div class="text-[10px] text-slate-400 font-normal">{c.date}</div>
            </td>
            <td class="py-3.5 px-4 font-bold text-slate-800">
              {c.patientName}
              <div class="text-slate-500 font-semibold text-xs">{c.doctorName}</div>
            </td>
            <td class="py-3.5 px-4">
              <div class="font-bold text-slate-800 text-xs">{c.drugSummary}</div>
              <div class="text-[11px] text-brand-blue font-mono font-semibold">{c.signa}</div>
            </td>
            <td class="py-3.5 px-4 text-xs text-slate-600">
              {c.allergyNote}
            </td>
            <td class="py-3.5 px-4 text-xs text-slate-700 max-w-sm">
              {c.pioPoints}
            </td>
            <td class="py-3.5 px-4 text-xs font-bold text-slate-800">
              {c.pharmacistName}
            </td>
          </tr>
        {/each}
      {/snippet}
    </DataTable>
  {/if}
</div>

<!-- MODAL INPUT RESEP DOKTER BARU -->
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
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <FileText class="w-5 h-5 text-brand-blue" />
          <span>Input Resep Dokter & Kalkulasi Racikan</span>
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
            value={newResepForm.patientName}
            onchange={(val) => (newResepForm.patientName = val)}
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
            value={newResepForm.doctorName}
            onchange={(val) => (newResepForm.doctorName = val)}
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
            value={newResepForm.type}
            onchange={(val) => (newResepForm.type = val as "RACIKAN" | "NON_RACIKAN")}
            options={[
              { value: "RACIKAN", label: "Racikan (Puyer / Kapsul / Salep)" },
              { value: "NON_RACIKAN", label: "Non-Racikan (Obat Jadi)" }
            ]}
          />
        </div>

        <div>
          <label for="rsp-etiket" class="font-bold text-slate-700 block mb-1">Jenis Etiket</label>
          <Select
            id="rsp-etiket"
            value={newResepForm.etiketType}
            onchange={(val) => (newResepForm.etiketType = val as "PUTIH" | "BIRU")}
            options={[
              { value: "PUTIH", label: "Etiket Putih (Obat Dalam / Oral)" },
              { value: "BIRU", label: "Etiket Biru (Obat Luar / Topikal)" }
            ]}
          />
        </div>

        <div>
          <label for="rsp-signa" class="font-bold text-slate-700 block mb-1">Aturan Pakai (Signa)</label>
          <input
            id="rsp-signa"
            type="text"
            bind:value={newResepForm.signa}
            placeholder="Contoh: 3 x Sehari 1 Kapsul"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
          />
        </div>

        <div>
          <label for="rsp-inst" class="font-bold text-slate-700 block mb-1">Instruksi Waktu Minum</label>
          <input
            id="rsp-inst"
            type="text"
            bind:value={newResepForm.instruction}
            placeholder="Sesudah Makan / Habiskan"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>

        <div>
          <label for="rsp-tuslah" class="font-bold text-slate-700 block mb-1">Tuslah Jasa Apoteker (Rp)</label>
          <input
            id="rsp-tuslah"
            type="number"
            bind:value={newResepForm.tuslah}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
          />
        </div>

        <div>
          <label for="rsp-embalase" class="font-bold text-slate-700 block mb-1">Embalase Wadah/Kapsul (Rp)</label>
          <input
            id="rsp-embalase"
            type="number"
            bind:value={newResepForm.embalase}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
          />
        </div>
      </div>

      <!-- KOMPOSISI OBAT / BAHAN RACIKAN (R/) -->
      <div class="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 space-y-3 text-xs">
        <div class="font-bold text-slate-800 flex items-center justify-between">
          <span>Komposisi Obat / Bahan Baku (Tier Harga Resep)</span>
          <span class="text-[11px] text-brand-blue font-mono">{newResepForm.items.length} R/</span>
        </div>

        <div class="grid grid-cols-12 gap-2 items-end">
          <div class="col-span-6">
            <label for="rsp-add-prod" class="text-[11px] font-semibold text-slate-600 block mb-1">Pilih Obat</label>
            <SearchableSelect
              id="rsp-add-prod"
              value={draftItemProductId}
              onchange={(val) => (draftItemProductId = val)}
              searchPlaceholder="Cari nama obat atau SKU..."
              options={products.map((p) => ({
                value: p.id,
                label: p.name,
                sublabel: `Harga Resep: ${formatRupiah(p.units?.[0]?.prices?.prescription ?? 0)} / ${p.baseUnit}`
              }))}
            />
          </div>
          <div class="col-span-2">
            <label for="rsp-add-qty" class="text-[11px] font-semibold text-slate-600 block mb-1">Qty</label>
            <input
              id="rsp-add-qty"
              type="number"
              min="1"
              bind:value={draftItemQty}
              class="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 font-mono font-bold text-center"
            />
          </div>
          <div class="col-span-3">
            <label for="rsp-add-dose" class="text-[11px] font-semibold text-slate-600 block mb-1">Dosis / Catatan</label>
            <input
              id="rsp-add-dose"
              type="text"
              bind:value={draftItemDosageNote}
              placeholder="250mg / puyer"
              class="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2"
            />
          </div>
          <div class="col-span-1">
            <button
              type="button"
              onclick={addDraftItemToResep}
              class="w-full py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold flex items-center justify-center"
              title="Tambah R/"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>

        {#if newResepForm.items.length > 0}
          <div class="divide-y divide-slate-200/70 bg-white rounded-xl border border-slate-200 overflow-hidden">
            {#each newResepForm.items as item, idx}
              <div class="px-3 py-2 flex items-center justify-between text-xs">
                <div>
                  <span class="font-bold text-slate-800">R/{idx + 1} {item.productName}</span>
                  <span class="text-slate-500 ml-1">({item.dosageNote})</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="font-mono text-slate-600">
                    {item.qty} {item.unit} &times; {formatRupiah(item.unitPrice)}
                  </span>
                  <span class="font-mono font-bold text-slate-900">
                    {formatRupiah(item.qty * item.unitPrice)}
                  </span>
                  <button
                    type="button"
                    onclick={() => removeDraftItemFromResep(idx)}
                    class="text-slate-400 hover:text-red-600"
                    title="Hapus Item"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <div class="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
          <div class="text-slate-500">
            Subtotal Obat: <strong class="font-mono text-slate-800">{formatRupiah(newResepDrugSubtotal)}</strong>
            + Jasa: <strong class="font-mono text-slate-800">{formatRupiah((Number(newResepForm.tuslah) || 0) + (Number(newResepForm.embalase) || 0))}</strong>
          </div>
          <div class="text-sm font-black text-brand-blue font-mono">
            Total: {formatRupiah(newResepGrandTotal)}
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label for="rsp-allergy" class="font-bold text-slate-700 block mb-1">Riwayat Alergi / Klinis Pasien</label>
          <input
            id="rsp-allergy"
            type="text"
            bind:value={newResepForm.allergyHistory}
            placeholder="Contoh: Tidak ada alergi"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>
        <div>
          <label for="rsp-desc" class="font-bold text-slate-700 block mb-1">Ringkasan Sediaan / Catatan Racikan</label>
          <input
            id="rsp-desc"
            type="text"
            bind:value={newResepForm.notes}
            placeholder="Contoh: Racikan kapsul batuk 10 kapsul"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>
      </div>

      <!-- Upload Berkas Foto Resep Fisik -->
      <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs space-y-2">
        <label for="rsp-file-upload" class="font-bold text-slate-700 flex items-center justify-between">
          <span class="flex items-center gap-1.5">
            <Paperclip class="w-4 h-4 text-brand-blue" />
            Foto Resep Fisik / Scan Dokter (Opsional)
          </span>
          {#if isUploadingPrescription}
            <span class="text-brand-blue animate-pulse text-[11px]">Mengunggah berkas...</span>
          {/if}
        </label>

        <input
          id="rsp-file-upload"
          type="file"
          accept="image/*,application/pdf"
          onchange={handlePrescriptionFileChange}
          disabled={isUploadingPrescription}
          class="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-100 file:text-brand-blue hover:file:bg-blue-200 cursor-pointer"
        />

        {#if newResepForm.prescriptionImageUrl}
          <div class="flex items-center gap-2 text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200 text-[11px]">
            <CheckCircle2 class="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            <span class="truncate">Berkas tersimpan di server: {newResepForm.prescriptionImageUrl}</span>
          </div>
        {/if}

        {#if uploadError}
          <div class="text-red-600 text-[11px] font-semibold">{uploadError}</div>
        {/if}
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
          onclick={submitNewPrescription}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm"
        >
          Verifikasi & Simpan Resep
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL SERAHKAN OBAT & DOKUMENTASI PIO -->
{#if isPioModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isPioModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <CheckCircle2 class="w-5 h-5 text-emerald-600" />
          <span>Penyerahan Obat & Dokumentasi PIO</span>
        </div>
        <button
          onclick={() => (isPioModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1">
        <div class="flex justify-between">
          <span class="font-mono font-bold text-brand-blue">{pioForm.recipeNumber}</span>
          <span class="font-semibold text-slate-600">{pioForm.doctorName}</span>
        </div>
        <div class="font-bold text-slate-900 text-sm">{pioForm.patientName}</div>
        <div class="text-slate-600">{pioForm.drugSummary} • <strong>{pioForm.signa}</strong></div>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label for="pio-allergy" class="font-bold text-slate-700 block mb-1">Konfirmasi Alergi & Kondisi Khusus</label>
          <input
            id="pio-allergy"
            type="text"
            bind:value={pioForm.allergyNote}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          />
        </div>
        <div>
          <label for="pio-points" class="font-bold text-slate-700 block mb-1">Materi Edukasi PIO (Aturan Pakai, Efek Samping, Penyimpanan)</label>
          <textarea
            id="pio-points"
            rows="3"
            bind:value={pioForm.pioPoints}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
          ></textarea>
        </div>
        <div>
          <label for="pio-apt" class="font-bold text-slate-700 block mb-1">Apoteker Penyerah</label>
          <input
            id="pio-apt"
            type="text"
            bind:value={pioForm.pharmacistName}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
          />
        </div>
      </div>

      <div class="border-t border-slate-100 pt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isPioModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onclick={submitPioHandover}
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
        >
          Selesaikan & Simpan PIO
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL DETAIL RESEP & SKRINING KLINIS -->
{#if isDetailModalOpen && selectedPrescription}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isDetailModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <div class="font-mono font-bold text-brand-blue text-xs">{selectedPrescription.recipeNumber}</div>
          <div class="text-slate-900 font-bold text-sm">{selectedPrescription.patientName}</div>
        </div>
        <button
          onclick={() => (isDetailModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
        <div>Dokter: <strong>{selectedPrescription.doctorName}</strong></div>
        <div>Tipe: <strong>{selectedPrescription.type} ({selectedPrescription.rCount} R/)</strong></div>
        <div>Signa: <strong>{selectedPrescription.signa}</strong></div>
        <div>BUD: <strong class="font-mono">{selectedPrescription.budDate}</strong></div>
        <div class="col-span-2">Alergi: <strong>{selectedPrescription.clinicalScreening.allergyHistory}</strong></div>
      </div>

      <div class="space-y-2 text-xs">
        <div class="font-bold text-slate-800">Daftar Komposisi Obat (R/)</div>
        <div class="divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {#each selectedPrescription.items as item, i}
            <div class="p-2.5 flex items-center justify-between">
              <div>
                <div class="font-bold text-slate-800">R/{i + 1} {item.productName}</div>
                <div class="text-[11px] text-slate-500">{item.dosageNote}</div>
              </div>
              <div class="text-right font-mono">
                <div>{item.qty} {item.unit} &times; {formatRupiah(item.unitPrice)}</div>
                <div class="font-bold text-slate-900">{formatRupiah(item.qty * item.unitPrice)}</div>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
        <span class="text-slate-500">
          Tuslah {formatRupiah(selectedPrescription.tuslah)} + Embalase {formatRupiah(selectedPrescription.embalase)}
        </span>
        <span class="font-mono font-black text-brand-blue text-sm">
          Total: {formatRupiah(selectedPrescription.totalPrice)}
        </span>
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
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
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

      <div class="grid grid-cols-2 gap-2.5 text-xs">
        <div class="col-span-2">
          <label for="mdl-etk-type" class="font-bold text-slate-700 block mb-1">Jenis Etiket</label>
          <Select
            id="mdl-etk-type"
            value={selectedEtiket.type}
            onchange={(val) => (selectedEtiket.type = val as "PUTIH" | "BIRU")}
            options={[
              { value: "PUTIH", label: "Etiket Putih (Obat Dalam / Oral)" },
              { value: "BIRU", label: "Etiket Biru (Obat Luar / Topikal)" }
            ]}
          />
        </div>
        <div>
          <label for="mdl-etk-patient" class="font-bold text-slate-700 block mb-1">Pasien</label>
          <input
            id="mdl-etk-patient"
            type="text"
            bind:value={selectedEtiket.patientName}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-bold"
          />
        </div>
        <div>
          <label for="mdl-etk-signa" class="font-bold text-slate-700 block mb-1">Signa</label>
          <input
            id="mdl-etk-signa"
            type="text"
            bind:value={selectedEtiket.signa}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-brand-blue"
          />
        </div>
        <div class="col-span-2">
          <label for="mdl-etk-drug" class="font-bold text-slate-700 block mb-1">Nama Obat & Instruksi</label>
          <input
            id="mdl-etk-drug"
            type="text"
            bind:value={selectedEtiket.drugName}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5"
          />
        </div>
      </div>

      <!-- LIVE LABEL PREVIEW -->
      <div class="p-4 border-2 rounded-xl text-center space-y-2 text-xs {selectedEtiket.type === 'BIRU' ? 'bg-blue-50/80 border-blue-400 text-blue-950' : 'bg-white border-slate-300 text-slate-900'}">
        <div class="font-extrabold">{selectedEtiket.branchName}</div>
        <div class="text-[10px] opacity-75">
          No: <strong>{selectedEtiket.recipeNumber}</strong> • Pasien: <strong>{selectedEtiket.patientName}</strong>
        </div>
        <div class="p-2 rounded-lg font-black {selectedEtiket.type === 'BIRU' ? 'bg-white text-blue-900 border border-blue-200' : 'bg-blue-50 text-brand-blue'}">
          {selectedEtiket.signa}
          <div class="text-[10px] font-semibold opacity-80">{selectedEtiket.instruction}</div>
        </div>
        <div class="text-[11px] font-semibold">{selectedEtiket.drugName}</div>
        {#if selectedEtiket.type === "BIRU"}
          <div class="text-[10px] font-black text-brand-red-600 uppercase pt-1 border-t border-blue-200">
            OBAT LUAR - TIDAK BOLEH DITELAN
          </div>
        {/if}
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
            window.print();
            isEtiketModalOpen = false;
          }}
          class="px-4 py-1.5 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 text-white font-bold text-xs shadow-sm"
        >
          Cetak Sekarang
        </button>
      </div>
    </div>
  </div>
{/if}
