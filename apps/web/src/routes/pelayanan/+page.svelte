<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import {
    FileText,
    Plus,
    Printer,
    Stethoscope,
    CheckCircle2,
    Clock,
    Eye,
    Trash2,
    ClipboardCheck,
    Paperclip,
    Store,
    ExternalLink,
    X
  } from "lucide-svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import MetricCard from "$lib/components/ui/MetricCard.svelte";
  import DataTable from "$lib/components/ui/DataTable.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
  import { portal } from "$lib/actions/portal";
  import { api } from "$lib/services/api";
  import { alertStore } from "$lib/stores/alertStore.svelte";
  import { authStore } from "$lib/stores/authStore.svelte";
  import { tenantStore } from "$lib/stores/tenantStore.svelte";
  import { formatRupiah } from "@apoteku/core";

  interface DoctorRecord {
    id: string;
    name: string;
    sip: string;
    specialization: string;
    hospital: string;
    phone?: string;
  }

  interface PrescriptionItem {
    productId: string;
    productName: string;
    qty: number;
    conversionFactor?: number;
    unit: string;
    unitPrice: number;
    dosageNote: string;
  }

  interface PrescriptionRecord {
    id: string;
    recipeNumber: string;
    branchId: string;
    branchName: string;
    branchAddress?: string;
    branchPhone?: string;
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
    verifiedByName?: string | null;
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

  function formatTodayDdMmYyyy(): string {
    return new Date().toLocaleDateString("id-ID");
  }

  function defaultBudIsoDate(daysAhead = 30): string {
    return new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
  }

  function getUnitResepPrice(unitObj: any): number {
    if (!unitObj) return 0;
    return Number(
      unitObj.salePriceResep ??
        unitObj.prices?.prescription ??
        unitObj.salePriceGeneral ??
        unitObj.prices?.general ??
        0
    );
  }

  function roundQty(val: number): number {
    return Math.round(val * 10000) / 10000;
  }

  function formatQty(val: number): string {
    return Number(val || 0).toLocaleString("id-ID", { maximumFractionDigits: 4 });
  }

  const isPrivilegedBranchSwitcher = $derived(
    authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"
  );

  // Master Data State (100% dari Database API)
  let doctors = $state<DoctorRecord[]>([]);
  let customers = $state<any[]>([]);
  let branchProducts = $state<any[]>([]);
  let isLoadingBranchProducts = $state(false);
  let loadedProductsBranchId = $state("");
  let branches = $state<any[]>([]);

  // Data Pelayanan Kefarmasian
  let prescriptions = $state<PrescriptionRecord[]>([]);
  let counselingRecords = $state<CounselingRecord[]>([]);
  let isLoadingData = $state(true);

  // Filter & Navigation State
  let selectedBranchId = $state(
    authStore.user?.role === "SUPERADMIN" || authStore.user?.role === "OWNER"
      ? "ALL"
      : authStore.user?.branchId || "ALL"
  );
  let activeTab = $state<"resep" | "etiket" | "konseling">("resep");
  let statusFilter = $state<"ALL" | "DRAFT" | "VERIFIED" | "DISPENSED">("ALL");
  let searchQuery = $state("");
  let pioSearchQuery = $state("");

  // Modals State
  let isAddResepModalOpen = $state(false);
  let isEtiketModalOpen = $state(false);
  let isDetailModalOpen = $state(false);
  let isPioModalOpen = $state(false);

  // Action Loading States
  let isSubmittingResep = $state(false);
  let isSubmittingPio = $state(false);
  let verifyingPrescriptionId = $state<string | null>(null);
  let isPrintingEtiket = $state(false);
  let cleanupEtiketPrint: (() => void) | null = null;

  interface EtiketLabelItem {
    id: string;
    labelTag: string;
    enabled: boolean;
    recipeNumber: string;
    branchName: string;
    branchAddress: string;
    branchPhone: string;
    pharmacistName: string;
    patientName: string;
    drugName: string;
    signa: string;
    instruction: string;
    date: string;
    budDate: string;
    type: "PUTIH" | "BIRU";
  }

  let selectedPrescription = $state<PrescriptionRecord | null>(null);
  let etiketSourcePrescription = $state<PrescriptionRecord | null>(null);
  let etiketSplitMode = $state<"per_item" | "combined">("per_item");
  let etiketModalLabels = $state<EtiketLabelItem[]>([]);
  let enabledEtiketLabels = $derived(etiketModalLabels.filter((e) => e.enabled));

  // Active Branch Info for Etiket & Defaults
  let activeBranchObj = $derived.by(() => {
    if (selectedBranchId && selectedBranchId !== "ALL") {
      return branches.find((b) => b.id === selectedBranchId) || branches[0] || null;
    }
    if (authStore.user?.branchId) {
      return branches.find((b) => b.id === authStore.user?.branchId) || branches[0] || null;
    }
    return branches[0] || null;
  });

  // Interactive Etiket State (used by Modal & Tab 2 Generator)
  let selectedEtiket = $state({
    recipeNumber: "",
    branchName: authStore.user?.branchName || tenantStore.current.name,
    branchAddress: tenantStore.current.address,
    branchPhone: tenantStore.current.phone,
    pharmacistName: authStore.user?.fullName || tenantStore.current.pharmacistName,
    patientName: "",
    drugName: "",
    signa: "",
    instruction: "Sesudah Makan",
    date: formatTodayDdMmYyyy(),
    budDate: defaultBudIsoDate(30),
    type: "PUTIH" as "PUTIH" | "BIRU"
  });

  // Sinkronkan identitas cabang & apoteker ke etiket selama user belum mengklik cetak resep tertentu
  $effect(() => {
    if (activeBranchObj && !selectedEtiket.recipeNumber) {
      selectedEtiket.branchName = activeBranchObj.name || tenantStore.current.name;
      selectedEtiket.branchAddress = activeBranchObj.address || "";
      selectedEtiket.branchPhone = activeBranchObj.phone || "";
    }
    if (authStore.user?.fullName) {
      selectedEtiket.pharmacistName = authStore.user.fullName;
    }
  });

  // Form Input Resep Baru State (bersih tanpa dummy data)
  let patientInputMode = $state<"select" | "manual">("select");
  let selectedCustomerId = $state("");
  let manualPatientName = $state("");

  let isQuickAddDoctorOpen = $state(false);
  let isSavingDoctor = $state(false);
  let quickDoctorForm = $state({
    name: "",
    sip: "",
    specialization: "Dokter Umum",
    hospital: ""
  });
  let selectedDoctorId = $state("");
  let manualDoctorName = $state("");

  let newResepForm = $state({
    branchId: authStore.user?.branchId || "",
    type: "NON_RACIKAN" as "RACIKAN" | "NON_RACIKAN",
    compoundForm: "KAPSUL",
    compoundQty: 10,
    etiketType: "PUTIH" as "PUTIH" | "BIRU",
    signa: "3 x Sehari 1",
    instruction: "Sesudah Makan",
    budDate: defaultBudIsoDate(30),
    tuslah: 0,
    embalase: 0,
    notes: "",
    allergyHistory: "Tidak ada",
    prescriptionImageUrl: "",
    items: [] as PrescriptionItem[]
  });

  // Draft item selector inside New Prescription Modal (relatif terhadap stok cabang aktif)
  let draftItemProductId = $state("");
  let draftItemUnit = $state("");
  let draftItemQty = $state(1);
  let draftItemDosageNote = $state("");

  function getQueuedBaseForProduct(productId: string): number {
    if (!productId) return 0;
    return roundQty(
      newResepForm.items
        .filter((i) => i.productId === productId)
        .reduce((sum, i) => sum + Number(i.qty || 0) * Math.max(1, Number(i.conversionFactor || 1)), 0)
    );
  }

  function getRemainingBaseForProduct(prod: any): number {
    if (!prod) return 0;
    return roundQty(Math.max(0, Number(prod.totalStockBase || 0) - getQueuedBaseForProduct(prod.id)));
  }

  let selectedModalBranchName = $derived(
    branches.find((b) => b.id === newResepForm.branchId)?.name || activeBranchObj?.name || "Cabang Aktif"
  );

  let selectedDraftProduct = $derived(
    branchProducts.find((p) => p.id === draftItemProductId) || branchProducts[0] || null
  );

  let draftProductUnits = $derived.by(() => {
    if (!selectedDraftProduct) return [];
    return Array.isArray(selectedDraftProduct.units) ? selectedDraftProduct.units : [];
  });

  let selectedDraftRemainingBase = $derived(
    selectedDraftProduct ? getRemainingBaseForProduct(selectedDraftProduct) : 0
  );

  let selectedUnitMeta = $derived.by(() => {
    if (!selectedDraftProduct || draftProductUnits.length === 0) return null;
    return (
      draftProductUnits.find((u: any) => u.unitName === draftItemUnit) ||
      draftProductUnits[0] ||
      null
    );
  });

  let selectedConversionFactor = $derived(
    Math.max(1, Number(selectedUnitMeta?.conversionFactor || 1))
  );

  let maxDraftQty = $derived(
    selectedDraftProduct && selectedConversionFactor > 0
      ? Math.floor((selectedDraftRemainingBase + 1e-6) / selectedConversionFactor)
      : 0
  );

  let draftUnitOptions = $derived.by(() => {
    if (!selectedDraftProduct) return [];
    return draftProductUnits.map((u: any) => ({
      value: u.unitName,
      label: u.unitName
    }));
  });

  let draftValidationError = $derived.by(() => {
    if (!selectedDraftProduct) return "";
    if (selectedDraftRemainingBase <= 0) {
      return `Stok ${selectedDraftProduct.name} pada cabang ini sudah habis atau seluruhnya masuk ke daftar R/.`;
    }
    if (maxDraftQty <= 0) {
      return `Stok tersisa (${formatQty(selectedDraftRemainingBase)} ${selectedDraftProduct.baseUnit}) kurang dari 1 ${draftItemUnit} (${formatQty(selectedConversionFactor)} ${selectedDraftProduct.baseUnit}). Pilih satuan lebih kecil.`;
    }
    const q = Number(draftItemQty);
    if (!Number.isFinite(q) || q <= 0) {
      return "Qty harus minimal 1.";
    }
    if (q > maxDraftQty) {
      return `Melebihi stok cabang tersedia (maksimal ${formatQty(maxDraftQty)} ${draftItemUnit} = ${formatQty(selectedDraftRemainingBase)} ${selectedDraftProduct.baseUnit}).`;
    }
    return "";
  });

  function syncDraftDefaultsForProduct(prod: any) {
    if (!prod) {
      draftItemProductId = "";
      draftItemUnit = "";
      draftItemQty = 0;
      return;
    }

    draftItemProductId = prod.id;
    const availBase = getRemainingBaseForProduct(prod);
    const units = Array.isArray(prod.units) ? prod.units : [];
    const preferredUnit =
      units.find((u: any) => u.isBaseUnit && availBase >= Math.max(1, Number(u.conversionFactor || 1))) ||
      units.find((u: any) => availBase >= Math.max(1, Number(u.conversionFactor || 1))) ||
      units[0];

    draftItemUnit = preferredUnit?.unitName || prod.baseUnit || "TABLET";
    const factor = Math.max(1, Number(preferredUnit?.conversionFactor || 1));
    const maxForUnit = Math.floor((availBase + 1e-6) / factor);
    draftItemQty = maxForUnit >= 1 ? 1 : 0;
  }

  function handleDraftProductChange(productId: string) {
    const prod = branchProducts.find((p) => p.id === productId);
    syncDraftDefaultsForProduct(prod);
  }

  function handleDraftUnitChange(unitName: string) {
    draftItemUnit = unitName;
    const unitMeta = draftProductUnits.find((u: any) => u.unitName === unitName) || draftProductUnits[0];
    const factor = Math.max(1, Number(unitMeta?.conversionFactor || 1));
    const maxForUnit = Math.floor((selectedDraftRemainingBase + 1e-6) / factor);
    if (maxForUnit <= 0) {
      draftItemQty = 0;
    } else {
      const curr = Number(draftItemQty) || 1;
      draftItemQty = Math.min(Math.max(1, curr), maxForUnit);
    }
  }

  let isUploadingPrescription = $state(false);
  let uploadError = $state("");

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
      "Pasien telah diedukasi cara pakai obat sesuai Signa, waktu minum obat, potensi efek samping, dan cara penyimpanan (BUD).",
    pharmacistName: authStore.user?.fullName || "Apoteker Penjaga"
  });

  async function loadBranchProducts(branchId: string) {
    if (!branchId || branchId === "ALL") {
      branchProducts = [];
      loadedProductsBranchId = "";
      syncDraftDefaultsForProduct(undefined);
      return;
    }
    isLoadingBranchProducts = true;
    try {
      const res = await api.transfer.getBranchProducts(branchId);
      if (res?.success && Array.isArray(res.data)) {
        branchProducts = res.data;
        loadedProductsBranchId = branchId;
        if (branchProducts.length > 0) {
          syncDraftDefaultsForProduct(branchProducts[0]);
        } else {
          syncDraftDefaultsForProduct(undefined);
        }
      } else {
        throw new Error(res?.error || "Gagal memuat stok obat cabang");
      }
    } catch (err: any) {
      branchProducts = [];
      loadedProductsBranchId = "";
      syncDraftDefaultsForProduct(undefined);
      alertStore.toast(err?.message || "Gagal memuat stok obat cabang", "danger", "Stok Cabang");
    } finally {
      isLoadingBranchProducts = false;
    }
  }

  async function resetNewResepModal() {
    const fallbackBranchId =
      selectedBranchId !== "ALL"
        ? selectedBranchId
        : authStore.user?.branchId || branches[0]?.id || "";

    patientInputMode = customers.length > 0 ? "select" : "manual";
    selectedCustomerId = customers[0]?.id || "";
    manualPatientName = "";

    isQuickAddDoctorOpen = false;
    selectedDoctorId = doctors[0]?.id || "";
    manualDoctorName = "";

    newResepForm = {
      branchId: fallbackBranchId,
      type: "NON_RACIKAN",
      compoundForm: "KAPSUL",
      compoundQty: 10,
      etiketType: "PUTIH",
      signa: "3 x Sehari 1",
      instruction: "Sesudah Makan",
      budDate: defaultBudIsoDate(30),
      tuslah: 0,
      embalase: 0,
      notes: "",
      allergyHistory: "Tidak ada",
      prescriptionImageUrl: "",
      items: []
    };

    uploadError = "";
    draftItemDosageNote = "";
    isAddResepModalOpen = true;
    await loadBranchProducts(fallbackBranchId);
  }

  async function loadPrescriptionData(targetBranchId = selectedBranchId) {
    isLoadingData = true;
    try {
      const [prescRes, pioRes] = await Promise.all([
        api.prescription.list({ branchId: targetBranchId || "ALL", limit: 100 }),
        api.prescription.listCounselings({ branchId: targetBranchId || "ALL", limit: 100 })
      ]);

      if (prescRes?.success && Array.isArray(prescRes.data)) {
        prescriptions = prescRes.data;
      } else {
        prescriptions = [];
      }

      if (pioRes?.success && Array.isArray(pioRes.data)) {
        counselingRecords = pioRes.data;
      } else {
        counselingRecords = [];
      }
    } catch (err: any) {
      console.error("[Pelayanan] Gagal memuat data resep / PIO:", err);
      alertStore.danger("Gagal Memuat Data", err?.message || "Tidak dapat terhubung ke server pelayanan.");
    } finally {
      isLoadingData = false;
    }
  }

  onMount(async () => {
    try {
      const [branchRes, custRes, docRes] = await Promise.all([
        api.erp.getBranches(),
        api.erp.getCustomers(),
        api.prescription.listDoctors()
      ]);

      if (branchRes?.success && Array.isArray(branchRes.data)) {
        branches = branchRes.data;
        if (!isPrivilegedBranchSwitcher) {
          const matchedUserBranch = branches.find((b) => b.id === authStore.user?.branchId);
          selectedBranchId = matchedUserBranch?.id || branches[0]?.id || "ALL";
        }
        newResepForm.branchId =
          selectedBranchId !== "ALL"
            ? selectedBranchId
            : authStore.user?.branchId || branches[0]?.id || "";
      }

      if (custRes?.success && Array.isArray(custRes.data)) {
        customers = custRes.data;
      }

      if (docRes?.success && Array.isArray(docRes.data)) {
        doctors = docRes.data;
        if (doctors[0]?.id) {
          selectedDoctorId = doctors[0].id;
        }
      }

      const initialProductsBranch =
        newResepForm.branchId || branches[0]?.id || "";

      await Promise.all([
        loadPrescriptionData(selectedBranchId),
        initialProductsBranch ? loadBranchProducts(initialProductsBranch) : Promise.resolve()
      ]);
    } catch (err: any) {
      console.error("[Pelayanan] Inisialisasi gagal:", err);
      isLoadingData = false;
    }
  });

  onDestroy(() => {
    cleanupEtiketPrint?.();
  });

  async function handleBranchChange(branchId: string) {
    selectedBranchId = branchId;
    const productsBranch = branchId !== "ALL" ? branchId : branches[0]?.id || "";
    await Promise.all([
      loadPrescriptionData(branchId),
      productsBranch ? loadBranchProducts(productsBranch) : Promise.resolve()
    ]);
  }

  async function handleModalBranchChange(branchId: string) {
    const previousBranchId = newResepForm.branchId;
    newResepForm.branchId = branchId;
    if (previousBranchId !== branchId && newResepForm.items.length > 0) {
      newResepForm.items = [];
      alertStore.toast("Daftar R/ direset agar sesuai stok cabang terpilih", "info", "Cabang Diubah");
    }
    await loadBranchProducts(branchId);
  }

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
      const q = searchQuery.trim().toLowerCase();
      if (!q) return matchStatus;
      const matchSearch =
        (r.recipeNumber || "").toLowerCase().includes(q) ||
        (r.patientName || "").toLowerCase().includes(q) ||
        (r.doctorName || "").toLowerCase().includes(q) ||
        (r.notes || "").toLowerCase().includes(q);
      return matchStatus && matchSearch;
    })
  );

  let filteredCounselings = $derived(
    counselingRecords.filter((c) => {
      const matchBranch =
        selectedBranchId === "ALL" || c.branchId === selectedBranchId;
      const q = pioSearchQuery.trim().toLowerCase();
      if (!q) return matchBranch;
      const matchSearch =
        (c.recipeNumber || "").toLowerCase().includes(q) ||
        (c.patientName || "").toLowerCase().includes(q) ||
        (c.drugSummary || "").toLowerCase().includes(q) ||
        (c.doctorName || "").toLowerCase().includes(q);
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
    const prod = selectedDraftProduct;
    if (!prod) {
      alertStore.warning("Obat Belum Dipilih", "Cabang aktif belum memiliki obat tersedia atau belum dipilih.");
      return;
    }
    if (draftValidationError) {
      alertStore.warning("Qty Melebihi / Tidak Valid", draftValidationError);
      return;
    }

    const chosenUnit = selectedUnitMeta || draftProductUnits[0];
    const prescriptionPrice = getUnitResepPrice(chosenUnit);
    const unitName = chosenUnit?.unitName || prod.baseUnit || "TABLET";
    const conversionFactor = Math.max(1, Number(chosenUnit?.conversionFactor || 1));
    const requestedQty = Number(draftItemQty);

    newResepForm.items = [
      ...newResepForm.items,
      {
        productId: prod.id,
        productName: prod.name,
        qty: requestedQty,
        conversionFactor,
        unit: unitName,
        unitPrice: prescriptionPrice,
        dosageNote: draftItemDosageNote.trim() || "-"
      }
    ];

    const remainingAfterAdd = getRemainingBaseForProduct(prod);
    const maxAfterAdd = Math.floor((remainingAfterAdd + 1e-6) / conversionFactor);
    draftItemQty = maxAfterAdd >= 1 ? 1 : 0;
    draftItemDosageNote = "";
  }

  function removeDraftItemFromResep(idx: number) {
    const removed = newResepForm.items[idx];
    newResepForm.items = newResepForm.items.filter((_, i) => i !== idx);
    if (removed && selectedDraftProduct?.id === removed.productId && draftItemQty <= 0) {
      const maxAfter = Math.floor(
        (getRemainingBaseForProduct(selectedDraftProduct) + 1e-6) / selectedConversionFactor
      );
      if (maxAfter >= 1) draftItemQty = 1;
    }
  }

  async function submitQuickDoctor() {
    if (!quickDoctorForm.name.trim()) {
      alertStore.warning("Nama Dokter Kosong", "Masukkan nama lengkap dokter perujuk.");
      return;
    }
    isSavingDoctor = true;
    try {
      const res = await api.prescription.createDoctor({
        name: quickDoctorForm.name.trim(),
        sip: quickDoctorForm.sip.trim(),
        specialization: quickDoctorForm.specialization.trim(),
        hospital: quickDoctorForm.hospital.trim()
      });
      if (!res?.success || !res.data) {
        throw new Error(res?.error || "Gagal menyimpan data dokter");
      }
      doctors = [...doctors, res.data].sort((a, b) => a.name.localeCompare(b.name));
      selectedDoctorId = res.data.id;
      manualDoctorName = "";
      isQuickAddDoctorOpen = false;
      quickDoctorForm = {
        name: "",
        sip: "",
        specialization: "Dokter Umum",
        hospital: ""
      };
      alertStore.toast(`Dokter ${res.data.name} berhasil disimpan`, "success", "Data Dokter");
    } catch (err: any) {
      alertStore.danger("Gagal Menambah Dokter", err?.message || "Terjadi kesalahan saat menyimpan dokter.");
    } finally {
      isSavingDoctor = false;
    }
  }

  function resolvePatientName(): string {
    if (patientInputMode === "manual") {
      return manualPatientName.trim();
    }
    const cust = customers.find((c) => c.id === selectedCustomerId);
    return cust ? cust.name : "";
  }

  function resolveDoctorName(): string {
    if (doctors.length > 0 && selectedDoctorId) {
      const doc = doctors.find((d) => d.id === selectedDoctorId);
      if (doc) return doc.hospital ? `${doc.name} (${doc.hospital})` : doc.name;
    }
    return manualDoctorName.trim();
  }

  async function submitNewPrescription(initialStatus: "DRAFT" | "VERIFIED" = "VERIFIED") {
    const resolvedPatient = resolvePatientName();
    const resolvedDoctor = resolveDoctorName();

    if (!resolvedPatient) {
      alertStore.warning("Pasien Belum Dipilih", "Pilih pasien dari daftar atau ketik nama pasien.");
      return;
    }
    if (!resolvedDoctor) {
      alertStore.warning("Dokter Belum Diisi", "Pilih dokter perujuk, tambahkan dokter baru, atau ketik nama dokter.");
      return;
    }
    if (!newResepForm.signa.trim()) {
      alertStore.warning("Signa Kosong", "Aturan pakai (Signa) wajib diisi.");
      return;
    }
    if (newResepForm.items.length === 0) {
      alertStore.warning("Komposisi Resep Kosong", "Tambahkan minimal 1 item obat ke daftar R/.");
      return;
    }

    isSubmittingResep = true;
    try {
      const targetBranchId =
        newResepForm.branchId ||
        (selectedBranchId !== "ALL" ? selectedBranchId : branches[0]?.id || "");

      const res = await api.prescription.create({
        branchId: targetBranchId,
        doctorName: resolvedDoctor,
        patientName: resolvedPatient,
        type: newResepForm.type,
        compoundForm: newResepForm.type === "RACIKAN" ? newResepForm.compoundForm : undefined,
        compoundQty: newResepForm.type === "RACIKAN" ? Number(newResepForm.compoundQty) || 10 : undefined,
        etiketType: newResepForm.etiketType,
        signa: newResepForm.signa.trim(),
        instruction: newResepForm.instruction.trim(),
        budDate: newResepForm.budDate,
        tuslah: Number(newResepForm.tuslah) || 0,
        embalase: Number(newResepForm.embalase) || 0,
        notes: newResepForm.notes.trim(),
        allergyHistory: newResepForm.allergyHistory.trim() || "Tidak ada",
        initialStatus,
        verifiedByName: initialStatus === "VERIFIED" ? authStore.user?.fullName || "Apoteker" : undefined,
        prescriptionImageUrl: newResepForm.prescriptionImageUrl || undefined,
        items: newResepForm.items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          qty: i.qty,
          conversionFactor: i.conversionFactor || 1,
          unit: i.unit,
          unitPrice: i.unitPrice,
          dosageNote: i.dosageNote
        }))
      });

      if (!res?.success || !res.data) {
        throw new Error(res?.error || "Gagal menyimpan resep ke database");
      }

      if (selectedBranchId === "ALL" || res.data.branchId === selectedBranchId) {
        prescriptions = [res.data, ...prescriptions];
      } else {
        selectedBranchId = res.data.branchId;
        await loadPrescriptionData(res.data.branchId);
      }

      isAddResepModalOpen = false;
      alertStore.toast(
        initialStatus === "VERIFIED"
          ? `Resep ${res.data.recipeNumber} diverifikasi & tersimpan`
          : `Draft skrining resep ${res.data.recipeNumber} tersimpan`,
        "success",
        "Resep Tersimpan"
      );
    } catch (err: any) {
      alertStore.danger("Gagal Menyimpan Resep", err?.message || "Tidak dapat menyimpan resep ke server.");
    } finally {
      isSubmittingResep = false;
    }
  }

  async function verifyPrescription(r: PrescriptionRecord) {
    verifyingPrescriptionId = r.id;
    try {
      const res = await api.prescription.verify(r.id, {
        adminComplete: true,
        doseVerified: true,
        noInteraction: true,
        allergyHistory: r.clinicalScreening.allergyHistory || "Tidak ada",
        verifiedByName: authStore.user?.fullName || "Apoteker"
      });
      if (!res?.success || !res.data) {
        throw new Error(res?.error || "Gagal memverifikasi skrining resep");
      }
      prescriptions = prescriptions.map((item) => (item.id === r.id ? res.data : item));
      alertStore.toast(`Resep ${r.recipeNumber} lolos skrining klinis`, "success", "Terverifikasi");
    } catch (err: any) {
      alertStore.danger("Verifikasi Gagal", err?.message || "Tidak dapat memverifikasi resep.");
    } finally {
      verifyingPrescriptionId = null;
    }
  }

  function openPioHandoverModal(r: PrescriptionRecord) {
    pioForm = {
      recipeId: r.id,
      recipeNumber: r.recipeNumber,
      patientName: r.patientName,
      doctorName: r.doctorName,
      drugSummary: r.notes || r.items.map((i) => i.productName).join(", "),
      signa: `${r.signa} (${r.instruction})`,
      allergyNote: r.clinicalScreening.allergyHistory || "Tidak ada alergi obat",
      pioPoints:
        "Pasien telah diedukasi cara pakai obat sesuai Signa, aturan waktu minum, serta batas simpan obat (BUD).",
      pharmacistName: authStore.user?.fullName || "Apoteker Penjaga"
    };
    isPioModalOpen = true;
  }

  async function submitPioHandover() {
    if (!pioForm.pioPoints.trim() || !pioForm.pharmacistName.trim()) {
      alertStore.warning("Data PIO Belum Lengkap", "Isi materi edukasi PIO dan nama apoteker penyerah.");
      return;
    }

    isSubmittingPio = true;
    try {
      const res = await api.prescription.dispense(pioForm.recipeId, {
        allergyNote: pioForm.allergyNote,
        pioPoints: pioForm.pioPoints,
        pharmacistName: pioForm.pharmacistName,
        drugSummary: pioForm.drugSummary,
        signa: pioForm.signa
      });

      if (!res?.success || !res.data) {
        throw new Error(res?.error || "Gagal menyimpan penyerahan & PIO");
      }

      if (res.data.prescription) {
        prescriptions = prescriptions.map((item) =>
          item.id === pioForm.recipeId ? res.data.prescription : item
        );
      }
      if (res.data.counseling) {
        counselingRecords = [res.data.counseling, ...counselingRecords];
      }

      isPioModalOpen = false;
      alertStore.toast(`Penyerahan obat & log PIO ${pioForm.recipeNumber} tersimpan`, "success", "Selesai (PIO)");
    } catch (err: any) {
      alertStore.danger("Gagal Menyimpan PIO", err?.message || "Tidak dapat menyimpan dokumentasi PIO.");
    } finally {
      isSubmittingPio = false;
    }
  }

  function buildEtiketLabelsForPrescription(
    r: PrescriptionRecord,
    mode: "per_item" | "combined"
  ): EtiketLabelItem[] {
    const baseHeader = {
      recipeNumber: r.recipeNumber,
      branchName: (r.branchName || activeBranchObj?.name || tenantStore.current.name).toUpperCase(),
      branchAddress: r.branchAddress || activeBranchObj?.address || tenantStore.current.address,
      branchPhone: r.branchPhone || activeBranchObj?.phone || tenantStore.current.phone,
      pharmacistName: r.verifiedByName || authStore.user?.fullName || tenantStore.current.pharmacistName,
      patientName: r.patientName,
      instruction: r.instruction || "Sesudah Makan",
      date: r.date.split(" ")[0] || formatTodayDdMmYyyy(),
      budDate: r.budDate || defaultBudIsoDate(30),
      type: r.etiketType
    };

    const items = Array.isArray(r.items) ? r.items : [];
    if (mode === "per_item" && items.length > 0) {
      return items.map((item, idx) => {
        const dosageSuffix =
          item.dosageNote && item.dosageNote !== "-" ? ` • ${item.dosageNote}` : "";
        return {
          id: `${r.id}-item-${idx}`,
          labelTag: `R/${idx + 1}`,
          enabled: true,
          ...baseHeader,
          drugName: `${item.productName} (${item.qty} ${item.unit})${dosageSuffix}`,
          signa: r.signa || "Sesuai aturan pakai"
        };
      });
    }

    const combinedSummary =
      r.notes || items.map((i) => `${i.productName} (${i.qty} ${i.unit})`).join(", ");

    return [
      {
        id: `${r.id}-combined`,
        labelTag: r.type === "RACIKAN" ? "Racikan" : "Gabungan",
        enabled: true,
        ...baseHeader,
        drugName: combinedSummary || "Obat Resep",
        signa: r.signa || "Sesuai aturan pakai"
      }
    ];
  }

  function openEtiketForPrescription(r: PrescriptionRecord) {
    etiketSourcePrescription = r;
    const initialMode: "per_item" | "combined" =
      r.type !== "RACIKAN" && r.items && r.items.length > 0 ? "per_item" : "combined";

    etiketSplitMode = initialMode;
    etiketModalLabels = buildEtiketLabelsForPrescription(r, initialMode);

    const first = etiketModalLabels[0];
    if (first) {
      selectedEtiket = {
        recipeNumber: first.recipeNumber,
        branchName: first.branchName,
        branchAddress: first.branchAddress,
        branchPhone: first.branchPhone,
        pharmacistName: first.pharmacistName,
        patientName: first.patientName,
        drugName: first.drugName,
        signa: first.signa,
        instruction: first.instruction,
        date: first.date,
        budDate: first.budDate,
        type: first.type
      };
    }

    isEtiketModalOpen = true;
  }

  function toggleEtiketSplitMode(mode: "per_item" | "combined") {
    if (!etiketSourcePrescription) return;
    etiketSplitMode = mode;
    etiketModalLabels = buildEtiketLabelsForPrescription(etiketSourcePrescription, mode);
  }

  function openManualEtiketModal() {
    etiketSourcePrescription = null;
    etiketSplitMode = "combined";
    etiketModalLabels = [
      {
        id: "manual-1",
        labelTag: "Manual",
        enabled: true,
        ...selectedEtiket
      }
    ];
    isEtiketModalOpen = true;
  }

  function openDetailModal(r: PrescriptionRecord) {
    selectedPrescription = r;
    isDetailModalOpen = true;
  }

  async function handlePrintEtiket() {
    if (typeof window === "undefined") return;
    if (enabledEtiketLabels.length === 0) {
      alertStore.warning("Etiket Belum Dipilih", "Centang minimal 1 etiket obat untuk dicetak.");
      return;
    }

    cleanupEtiketPrint?.();
    isPrintingEtiket = true;
    document.body.classList.add("printing-etiket");
    await tick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const handleAfterPrint = () => {
      document.body.classList.remove("printing-etiket");
      isPrintingEtiket = false;
    };
    window.addEventListener("afterprint", handleAfterPrint, { once: true });
    cleanupEtiketPrint = () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      document.body.classList.remove("printing-etiket");
    };

    window.print();
    isEtiketModalOpen = false;
  }
</script>

<svelte:head>
  <title>Pelayanan &bull; Hafidz Farma</title>
</svelte:head>

<div class="space-y-6">
  <!-- PAGE HEADER -->
  <PageHeader
    title="Pelayanan & Resep"
    subtitle="Skrining klinis resep dokter dan obat"
    icon={FileText}
    breadcrumbs={[{ label: "Pelayanan Kefarmasian" }]}
  >
    {#snippet actions()}
      <div class="grid grid-rows-2 sm:justify-items-end gap-2">
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onclick={openManualEtiketModal}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs"
          >
            <Printer class="w-4 h-4 text-brand-blue" />
            <span>Etiket Manual</span>
          </button>

          <button
            type="button"
            onclick={resetNewResepModal}
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 to-brand-blue-700 hover:from-brand-red-700 hover:to-brand-blue-800 text-white text-xs font-bold transition-all shadow-sm"
          >
            <Plus class="w-4 h-4" />
            <span>Input Resep Dokter</span>
          </button>
        </div>

        <!-- Branch selector (for Superadmin/Owner) or locked badge (for Staff) -->
        {#if isPrivilegedBranchSwitcher}
          <div class="w-56">
            <Select
              value={selectedBranchId}
              onchange={handleBranchChange}
              options={[
                { value: "ALL", label: "Semua Cabang Apotek" },
                ...branches.map((b) => ({ value: b.id, label: b.name }))
              ]}
            />
          </div>
        {:else}
          <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs" title="Cabang Penugasan">
            <Store class="w-3.5 h-3.5 text-brand-blue" />
            <span>{authStore.user?.branchName || activeBranchObj?.name || "Apotek Hafidz Farma"}</span>
          </div>
        {/if}
      </div>
    {/snippet}
  </PageHeader>

  <!-- METRIC CARDS -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      title="Total Resep Terdata"
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
  <div class="flex items-center gap-2 border-b border-slate-200 text-xs font-bold overflow-x-auto pb-1 no-scrollbar">
    <button
      type="button"
      onclick={() => (activeTab = "resep")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'resep' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Daftar Resep Masuk ({branchFilteredPrescriptions.length})</span>
      {#if activeTab === "resep"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "etiket")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'etiket' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
    >
      <span>Generator Etiket Obat</span>
      {#if activeTab === "etiket"}
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue-700 rounded-full"></div>
      {/if}
    </button>

    <button
      type="button"
      onclick={() => (activeTab = "konseling")}
      class="pb-3 px-3 transition-colors relative whitespace-nowrap {activeTab === 'konseling' ? 'text-brand-blue-700' : 'text-slate-500 hover:text-slate-800'}"
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
        <th class="py-3 px-4">Pasien</th>
        <th class="py-3 px-4 text-right">Tuslah & Embalase</th>
        <th class="py-3 px-4 text-right">Total Resep</th>
        <th class="py-3 px-4 text-center">Status</th>
        <th class="py-3 px-4 text-center">Aksi</th>
      {/snippet}

      {#snippet rows()}
        {#if isLoadingData}
          <tr>
            <td colspan="7" class="py-12 text-center text-xs text-slate-400">
              Memuat data pelayanan resep dari server...
            </td>
          </tr>
        {:else if filteredPrescriptions.length === 0}
          <tr>
            <td colspan="7" class="py-12 text-center text-xs text-slate-400">
              <div class="flex flex-col items-center justify-center gap-2">
                <FileText class="w-8 h-8 text-slate-300" />
                <span>Belum ada antrian resep dokter di database. Klik tombol "Input Resep Dokter Baru" atau lakukan transaksi resep di POS.</span>
              </div>
            </td>
          </tr>
        {:else}
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
                      disabled={verifyingPrescriptionId === r.id}
                      onclick={() => verifyPrescription(r)}
                      class="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-[11px] font-bold transition-colors shadow-xs"
                      title="Verifikasi Skrining Klinis & Mulai Racik"
                    >
                      {verifyingPrescriptionId === r.id ? "Memproses..." : "Verifikasi"}
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
        {/if}
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
              placeholder="RSP-..."
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
            />
          </div>
          <div class="col-span-2">
            <label for="gen-patient" class="font-bold text-slate-700 block mb-1">Nama Pasien</label>
            <input
              id="gen-patient"
              type="text"
              bind:value={selectedEtiket.patientName}
              placeholder="Nama pasien penerima obat..."
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
            />
          </div>
          <div class="col-span-2">
            <label for="gen-drug" class="font-bold text-slate-700 block mb-1">Nama Obat / Sediaan Racikan</label>
            <input
              id="gen-drug"
              type="text"
              bind:value={selectedEtiket.drugName}
              placeholder="Nama obat atau ringkasan racikan..."
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label for="gen-signa" class="font-bold text-slate-700 block mb-1">Aturan Pakai (Signa)</label>
            <input
              id="gen-signa"
              type="text"
              bind:value={selectedEtiket.signa}
              placeholder="Contoh: 3 x Sehari 1 Kapsul"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-brand-blue"
            />
          </div>
          <div>
            <label for="gen-inst" class="font-bold text-slate-700 block mb-1">Waktu / Instruksi</label>
            <input
              id="gen-inst"
              type="text"
              bind:value={selectedEtiket.instruction}
              placeholder="Sesudah Makan"
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
            onclick={openManualEtiketModal}
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
            <div class="font-black text-sm text-slate-900 tracking-tight uppercase">{selectedEtiket.branchName}</div>
            {#if selectedEtiket.branchAddress}
              <div class="text-[10px] text-slate-600">{selectedEtiket.branchAddress}</div>
            {/if}
            <div class="text-[10px] text-slate-600">
              {selectedEtiket.branchPhone ? `Telp: ${selectedEtiket.branchPhone} | ` : ""}Apoteker: {selectedEtiket.pharmacistName}
            </div>
          </div>

          <div class="space-y-2 text-xs">
            <div class="flex justify-between border-b border-dashed border-slate-200 pb-1">
              <span>No: <strong>{selectedEtiket.recipeNumber || "-"}</strong></span>
              <span>Tgl: <strong>{selectedEtiket.date}</strong></span>
            </div>
            <div>Pasien: <strong class="text-slate-900 text-sm">{selectedEtiket.patientName || "-"}</strong></div>
            <div class="py-3 text-center bg-blue-50/50 rounded-xl border border-blue-100 font-extrabold text-brand-blue text-sm">
              {selectedEtiket.signa || "Aturan pakai..."}<br />
              <span class="text-xs font-semibold text-slate-600">{selectedEtiket.instruction || "-"}</span>
            </div>
            <div class="flex justify-between text-[11px] text-slate-600 pt-1">
              <span>Obat: <strong>{selectedEtiket.drugName || "-"}</strong></span>
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
            <div class="font-black text-sm text-blue-950 tracking-tight uppercase">{selectedEtiket.branchName}</div>
            {#if selectedEtiket.branchAddress}
              <div class="text-[10px] text-blue-800">{selectedEtiket.branchAddress}</div>
            {/if}
            <div class="text-[10px] text-blue-800">
              {selectedEtiket.branchPhone ? `Telp: ${selectedEtiket.branchPhone} | ` : ""}Apoteker: {selectedEtiket.pharmacistName}
            </div>
          </div>

          <div class="space-y-2 text-xs">
            <div class="flex justify-between border-b border-dashed border-blue-200 pb-1">
              <span>No: <strong>{selectedEtiket.recipeNumber || "-"}</strong></span>
              <span>Tgl: <strong>{selectedEtiket.date}</strong></span>
            </div>
            <div>Pasien: <strong class="text-blue-950 text-sm">{selectedEtiket.patientName || "-"}</strong></div>
            <div class="py-3 text-center bg-white rounded-xl border border-blue-200 font-extrabold text-blue-900 text-sm">
              {selectedEtiket.signa || "Oleskan / gunakan sesuai petunjuk"}<br />
              <span class="text-xs font-semibold text-blue-700">
                {selectedEtiket.instruction || "Pemakaian Luar"}
              </span>
            </div>
            <div class="text-[11px] text-blue-900">
              Obat: <strong>{selectedEtiket.drugName || "-"}</strong>
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
      title="Log Pelayanan Informasi Obat (PIO)"
      searchPlaceholder="Cari nomor resep, nama pasien, atau obat..."
      bind:searchValue={pioSearchQuery}
      totalCount={filteredCounselings.length}
    >
      {#snippet header()}
        <th class="py-3 px-4">Waktu</th>
        <th class="py-3 px-4">Pasien</th>
        <th class="py-3 px-4">Obat & Signa</th>
        <th class="py-3 px-4">Alergi</th>
        <th class="py-3 px-4">Edukasi PIO</th>
        <th class="py-3 px-4">Apoteker</th>
      {/snippet}

      {#snippet rows()}
        {#if isLoadingData}
          <tr>
            <td colspan="6" class="text-center py-12 text-xs text-slate-400">
              Memuat log konseling PIO dari server...
            </td>
          </tr>
        {:else if filteredCounselings.length === 0}
          <tr>
            <td colspan="6" class="text-center py-12 text-slate-400">
              <ClipboardCheck class="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p class="font-medium text-sm">Belum ada catatan dokumentasi PIO & konseling</p>
              <p class="text-xs text-slate-400">Catatan konseling akan otomatis terekam di database saat resep diselesaikan (PIO).</p>
            </td>
          </tr>
        {:else}
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
        {/if}
      {/snippet}
    </DataTable>
  {/if}
</div>

<!-- MODAL INPUT RESEP DOKTER BARU -->
{#if isAddResepModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay print:!hidden fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isAddResepModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] overflow-y-auto scrollbar-minimalist">
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

      {#if isPrivilegedBranchSwitcher && branches.length > 0}
        <div class="text-xs">
          <label for="rsp-branch" class="font-bold text-slate-700 block mb-1">Cabang Apotek Penerima Resep</label>
          <Select
            id="rsp-branch"
            value={newResepForm.branchId}
            onchange={handleModalBranchChange}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>
      {/if}

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <!-- PASIEN -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label for="rsp-patient" class="font-bold text-slate-700">Nama Pasien</label>
            <button
              type="button"
              onclick={() => (patientInputMode = patientInputMode === "select" ? "manual" : "select")}
              class="text-[11px] font-bold text-brand-blue hover:underline"
            >
              {patientInputMode === "select" ? "Ketik Manual" : "Pilih dari Daftar"}
            </button>
          </div>
          {#if patientInputMode === "select"}
            <SearchableSelect
              id="rsp-patient"
              variant="default"
              value={selectedCustomerId}
              onchange={(val) => (selectedCustomerId = val)}
              placeholder="Pilih pasien terdaftar..."
              searchPlaceholder="Cari nama pasien atau kode..."
              options={customers.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.code})`,
                sublabel: c.phone ? `${c.phone}${c.address ? ` • ${c.address}` : ""}` : c.address || "Pasien Terdaftar"
              }))}
            />
          {:else}
            <input
              id="rsp-patient"
              type="text"
              bind:value={manualPatientName}
              placeholder="Ketik nama pasien..."
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
            />
          {/if}
        </div>

        <!-- DOKTER PENULIS -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label for="rsp-doctor" class="font-bold text-slate-700">Dokter Penulis</label>
            <button
              type="button"
              onclick={() => (isQuickAddDoctorOpen = !isQuickAddDoctorOpen)}
              class="text-[11px] font-bold text-brand-blue hover:underline"
            >
              {isQuickAddDoctorOpen ? "Batal Tambah" : "+ Dokter Baru"}
            </button>
          </div>
          {#if doctors.length > 0}
            <SearchableSelect
              id="rsp-doctor"
              variant="default"
              value={selectedDoctorId}
              onchange={(val) => (selectedDoctorId = val)}
              placeholder="Pilih dokter perujuk..."
              searchPlaceholder="Cari nama dokter atau RS/klinik..."
              options={doctors.map((d) => ({
                value: d.id,
                label: `${d.name}${d.hospital ? ` (${d.hospital})` : ""}`,
                sublabel: `SIP: ${d.sip || "-"} • ${d.specialization}`
              }))}
            />
          {:else}
            <input
              id="rsp-doctor"
              type="text"
              bind:value={manualDoctorName}
              placeholder="Ketik nama dokter atau klik + Dokter Baru..."
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
            />
          {/if}
        </div>
      </div>

      <!-- QUICK ADD DOKTER KE DATABASE -->
      {#if isQuickAddDoctorOpen}
        <div class="bg-blue-50/70 border border-blue-200 rounded-xl p-3 space-y-2.5 text-xs">
          <div class="font-bold text-slate-800 flex items-center gap-1.5">
            <Stethoscope class="w-4 h-4 text-brand-blue" />
            <span>Simpan Dokter Perujuk Baru ke Database</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              bind:value={quickDoctorForm.name}
              placeholder="Nama Lengkap Dokter (mis. dr. Budi, Sp.PD)"
              class="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold"
            />
            <input
              type="text"
              bind:value={quickDoctorForm.sip}
              placeholder="Nomor SIP (opsional)"
              class="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
            />
            <input
              type="text"
              bind:value={quickDoctorForm.specialization}
              placeholder="Spesialisasi"
              class="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
            />
            <input
              type="text"
              bind:value={quickDoctorForm.hospital}
              placeholder="RS / Klinik / Puskesmas"
              class="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
            />
          </div>
          <div class="flex justify-end">
            <button
              type="button"
              disabled={isSavingDoctor}
              onclick={submitQuickDoctor}
              class="px-3 py-1.5 rounded-lg bg-brand-blue-700 hover:bg-brand-blue-800 disabled:opacity-60 text-white font-bold text-xs"
            >
              {isSavingDoctor ? "Menyimpan..." : "Simpan Dokter"}
            </button>
          </div>
        </div>
      {/if}

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label for="rsp-type" class="font-bold text-slate-700 block mb-1">Bentuk Resep</label>
          <Select
            id="rsp-type"
            value={newResepForm.type}
            onchange={(val) => (newResepForm.type = val as "RACIKAN" | "NON_RACIKAN")}
            options={[
              { value: "NON_RACIKAN", label: "Non-Racikan (Obat Jadi)" },
              { value: "RACIKAN", label: "Racikan (Puyer / Kapsul / Salep)" }
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

        {#if newResepForm.type === "RACIKAN"}
          <div>
            <label for="rsp-compound-form" class="font-bold text-slate-700 block mb-1">Bentuk Sediaan Racikan</label>
            <Select
              id="rsp-compound-form"
              value={newResepForm.compoundForm}
              onchange={(val) => (newResepForm.compoundForm = val)}
              options={[
                { value: "KAPSUL", label: "Kapsul" },
                { value: "PUYER", label: "Puyer / Pulveres" },
                { value: "SALEP", label: "Salep / Krim" },
                { value: "SIRUP", label: "Sirup Racikan" }
              ]}
            />
          </div>
          <div>
            <label for="rsp-compound-qty" class="font-bold text-slate-700 block mb-1">Jumlah Sediaan Jadi</label>
            <input
              id="rsp-compound-qty"
              type="number"
              min="1"
              bind:value={newResepForm.compoundQty}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
            />
          </div>
        {/if}

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
            min="0"
            bind:value={newResepForm.tuslah}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
          />
        </div>

        <div>
          <label for="rsp-embalase" class="font-bold text-slate-700 block mb-1">Embalase Wadah/Kapsul (Rp)</label>
          <input
            id="rsp-embalase"
            type="number"
            min="0"
            bind:value={newResepForm.embalase}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
          />
        </div>

        <div class="col-span-2">
          <label for="rsp-bud" class="font-bold text-slate-700 block mb-1">Beyond Use Date (BUD / Batas Simpan)</label>
          <input
            id="rsp-bud"
            type="date"
            bind:value={newResepForm.budDate}
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
          />
        </div>
      </div>

      <!-- KOMPOSISI OBAT / BAHAN RACIKAN (R/) -->
      <div class="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 space-y-3 text-xs">

        {#if isLoadingBranchProducts}
          <div class="text-center py-3 text-slate-500 bg-white rounded-xl border border-slate-200">
            Memuat daftar obat & stok cabang {selectedModalBranchName}...
          </div>
        {:else if branchProducts.length === 0}
          <div class="text-center py-3 text-amber-700 font-semibold bg-amber-50 rounded-xl border border-amber-200">
            Cabang {selectedModalBranchName} belum memiliki stok obat tersedia (qty &gt; 0).
          </div>
        {:else}
          <div class="grid grid-cols-12 gap-2 items-end">
            <div class="col-span-12 sm:col-span-5">
              <label for="rsp-add-prod" class="text-[11px] font-semibold text-slate-600 block mb-1">
                Pilih Obat ({branchProducts.length} tersedia)
              </label>
              <SearchableSelect
                id="rsp-add-prod"
                value={draftItemProductId}
                onchange={handleDraftProductChange}
                placeholder="Pilih obat tersedia di cabang..."
                searchPlaceholder="Cari nama obat atau SKU..."
                options={branchProducts.map((p) => {
                  const remBase = getRemainingBaseForProduct(p);
                  const baseUnitMeta =
                    p.units?.find((u: any) => u.isBaseUnit) || p.units?.[0];
                  const hargaResep = getUnitResepPrice(baseUnitMeta);
                  const unitLabel = baseUnitMeta?.unitName || p.baseUnit || "UNIT";
                  return {
                    value: p.id,
                    label: p.name,
                    sublabel: `Stok: ${formatQty(remBase)} ${p.baseUnit} • Resep: ${formatRupiah(hargaResep)} / ${unitLabel}`,
                    badge: `${formatQty(remBase)} ${p.baseUnit}`,
                    badgeClass:
                      remBase > 0
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                  };
                })}
              />
            </div>
            <div class="col-span-5 sm:col-span-2">
              <label for="rsp-add-unit" class="text-[11px] font-semibold text-slate-600 block mb-1">Satuan</label>
              <Select
                id="rsp-add-unit"
                value={draftItemUnit}
                onchange={handleDraftUnitChange}
                options={
                  draftUnitOptions.length > 0
                    ? draftUnitOptions
                    : [{ value: selectedDraftProduct?.baseUnit || "TABLET", label: selectedDraftProduct?.baseUnit || "TABLET" }]
                }
              />
            </div>
            <div class="col-span-3 sm:col-span-2">
              <label for="rsp-add-qty" class="text-[11px] font-semibold text-slate-600 block mb-1">
                Qty
              </label>
              <input
                id="rsp-add-qty"
                type="number"
                min={maxDraftQty > 0 ? 1 : 0}
                max={Math.max(1, maxDraftQty)}
                bind:value={draftItemQty}
                class="w-full bg-white border rounded-xl px-2 py-2 font-mono font-bold text-center {draftValidationError ? 'border-red-400 text-red-700 bg-red-50/40' : 'border-slate-200'}"
              />
            </div>
            <div class="col-span-3 sm:col-span-2">
              <label for="rsp-add-dose" class="text-[11px] font-semibold text-slate-600 block mb-1">Dosis</label>
              <input
                id="rsp-add-dose"
                type="text"
                bind:value={draftItemDosageNote}
                placeholder="250mg"
                class="w-full bg-white border border-slate-200 rounded-xl px-2 py-2"
              />
            </div>
            <div class="col-span-1">
              <button
                type="button"
                disabled={Boolean(draftValidationError) || maxDraftQty <= 0}
                onclick={addDraftItemToResep}
                class="w-full py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center"
                title="Tambah R/"
              >
                <Plus class="w-4 h-4" />
              </button>
            </div>
          </div>

          {#if selectedDraftProduct}
            <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] px-1">
              <span class="text-slate-600">
                Tersedia: <strong class="font-mono text-slate-900">{formatQty(maxDraftQty)} {draftItemUnit}</strong>
                {#if selectedConversionFactor > 1}
                  <span class="text-slate-500">(= {formatQty(selectedDraftRemainingBase)} {selectedDraftProduct.baseUnit}, 1 {draftItemUnit} = {formatQty(selectedConversionFactor)} {selectedDraftProduct.baseUnit})</span>
                {:else}
                  <span class="text-slate-500">• Harga Resep: <strong class="font-mono">{formatRupiah(getUnitResepPrice(selectedUnitMeta))}</strong> / {draftItemUnit}</span>
                {/if}
              </span>
              {#if selectedConversionFactor > 1}
                <span class="text-slate-600">
                  Harga Resep: <strong class="font-mono text-slate-900">{formatRupiah(getUnitResepPrice(selectedUnitMeta))}</strong> / {draftItemUnit}
                </span>
              {/if}
            </div>
          {/if}

          {#if draftValidationError}
            <div class="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
              {draftValidationError}
            </div>
          {/if}
        {/if}

        {#if newResepForm.items.length > 0}
          <div class="divide-y divide-slate-200/70 bg-white rounded-xl border border-slate-200 overflow-hidden">
            {#each newResepForm.items as item, idx}
              <div class="px-3 py-2 flex items-center justify-between text-xs">
                <div>
                  <span class="font-bold text-slate-800">R/{idx + 1} {item.productName}</span>
                  {#if item.dosageNote && item.dosageNote !== "-"}
                    <span class="text-slate-500 ml-1">({item.dosageNote})</span>
                  {/if}
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
        {:else}
          <div class="text-center py-3 text-slate-400 italic bg-white rounded-xl border border-dashed border-slate-200">
            Belum ada item obat dipilih. Pilih obat di atas lalu klik tombol +.
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

      <div class="border-t border-slate-100 pt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onclick={() => (isAddResepModalOpen = false)}
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={isSubmittingResep}
          onclick={() => submitNewPrescription("DRAFT")}
          class="px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-60 text-amber-800 font-bold text-xs"
        >
          Simpan Draft Skrining
        </button>
        <button
          type="button"
          disabled={isSubmittingResep}
          onclick={() => submitNewPrescription("VERIFIED")}
          class="px-4 py-2 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 disabled:opacity-60 text-white font-bold text-xs shadow-sm"
        >
          {isSubmittingResep ? "Menyimpan..." : "Verifikasi & Simpan Resep"}
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
    class="modal-overlay print:!hidden fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
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
          disabled={isSubmittingPio}
          onclick={submitPioHandover}
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs shadow-sm"
        >
          {isSubmittingPio ? "Menyimpan..." : "Selesaikan & Simpan PIO"}
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
    class="modal-overlay print:!hidden fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
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
        <div class="col-span-2 flex flex-wrap gap-2 pt-1 text-[11px]">
          <span class="px-2 py-0.5 rounded font-semibold {selectedPrescription.clinicalScreening.adminComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}">
            Administratif: {selectedPrescription.clinicalScreening.adminComplete ? "Lolos" : "Belum"}
          </span>
          <span class="px-2 py-0.5 rounded font-semibold {selectedPrescription.clinicalScreening.doseVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}">
            Dosis: {selectedPrescription.clinicalScreening.doseVerified ? "Terverifikasi" : "Belum"}
          </span>
          <span class="px-2 py-0.5 rounded font-semibold {selectedPrescription.clinicalScreening.noInteraction ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}">
            Bebas Interaksi: {selectedPrescription.clinicalScreening.noInteraction ? "Aman" : "Perlu Cek"}
          </span>
        </div>
      </div>

      {#if selectedPrescription.prescriptionImageUrl}
        <div class="flex items-center justify-between bg-blue-50/60 p-2.5 rounded-xl border border-blue-100 text-xs">
          <span class="font-semibold text-slate-700 flex items-center gap-1.5">
            <Paperclip class="w-4 h-4 text-brand-blue" />
            Lampiran Resep Fisik Tersedia
          </span>
          <a
            href={selectedPrescription.prescriptionImageUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 font-bold text-brand-blue hover:underline"
          >
            <span>Lihat Berkas</span>
            <ExternalLink class="w-3.5 h-3.5" />
          </a>
        </div>
      {/if}

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

<!-- MODAL CETAK ETIKET (MENDUKUNG MULTI-OBAT: 1 ETIKET PER OBAT) -->
{#if isEtiketModalOpen}
  <div
    use:portal
    data-modal-overlay
    class="modal-overlay print:!hidden fixed inset-0 top-0 left-0 right-0 bottom-0 !m-0 !mt-0 !p-4 bg-[#0a192f]/50 backdrop-blur-md z-[100] flex items-center justify-center overflow-y-auto w-screen h-screen"
    onclick={(e) => {
      if (e.target === e.currentTarget) isEtiketModalOpen = false;
    }}
    role="presentation"
  >
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl {etiketModalLabels.length > 1 ? 'max-w-2xl' : 'max-w-md'} w-full p-6 shadow-2xl border border-white/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] overflow-y-auto scrollbar-minimalist">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2 text-slate-900 font-bold">
          <Printer class="w-5 h-5 text-brand-blue" />
          <span>Cetak Etiket Obat</span>
          {#if etiketModalLabels.length > 1}
            <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-brand-blue border border-blue-200">
              {enabledEtiketLabels.length}/{etiketModalLabels.length} Etiket Dipilih
            </span>
          {/if}
        </div>
        <button
          onclick={() => (isEtiketModalOpen = false)}
          class="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Tutup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      {#if etiketSourcePrescription && etiketSourcePrescription.items.length > 1}
        <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
          <span class="font-semibold text-slate-600">
            Resep memuat {etiketSourcePrescription.items.length} item obat:
          </span>
          <div class="inline-flex rounded-lg bg-white border border-slate-200 p-0.5 gap-1">
            <button
              type="button"
              onclick={() => toggleEtiketSplitMode("per_item")}
              class="px-2.5 py-1 rounded-md font-bold text-[11px] transition-colors {etiketSplitMode === 'per_item' ? 'bg-brand-blue-700 text-white' : 'text-slate-600 hover:bg-slate-50'}"
            >
              Per Obat ({etiketSourcePrescription.items.length} Etiket)
            </button>
            <button
              type="button"
              onclick={() => toggleEtiketSplitMode("combined")}
              class="px-2.5 py-1 rounded-md font-bold text-[11px] transition-colors {etiketSplitMode === 'combined' ? 'bg-brand-blue-700 text-white' : 'text-slate-600 hover:bg-slate-50'}"
            >
              Gabung 1 Etiket
            </button>
          </div>
        </div>
      {/if}

      <div class="space-y-4">
        {#each etiketModalLabels as label, idx (label.id)}
          <div class="rounded-2xl border p-4 space-y-3 transition-opacity {label.enabled ? 'bg-white border-slate-200 shadow-2xs' : 'bg-slate-50/70 border-slate-200/70 opacity-60'}">
            <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <label class="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  bind:checked={label.enabled}
                  class="w-4 h-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                />
                <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                  {label.labelTag}
                </span>
                <span>Etiket #{idx + 1}</span>
              </label>
              <span class="text-[11px] font-mono text-slate-400">{label.recipeNumber || "-"}</span>
            </div>

            <div class="grid grid-cols-2 gap-2.5 text-xs">
              <div class="col-span-2 sm:col-span-1">
                <label for="mdl-etk-type-{idx}" class="font-bold text-slate-700 block mb-1">Jenis Etiket</label>
                <Select
                  id="mdl-etk-type-{idx}"
                  value={label.type}
                  onchange={(val) => (label.type = val as "PUTIH" | "BIRU")}
                  options={[
                    { value: "PUTIH", label: "Etiket Putih (Obat Dalam)" },
                    { value: "BIRU", label: "Etiket Biru (Obat Luar)" }
                  ]}
                />
              </div>
              <div class="col-span-2 sm:col-span-1">
                <label for="mdl-etk-patient-{idx}" class="font-bold text-slate-700 block mb-1">Pasien</label>
                <input
                  id="mdl-etk-patient-{idx}"
                  type="text"
                  bind:value={label.patientName}
                  placeholder="Nama pasien..."
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-bold"
                />
              </div>
              <div>
                <label for="mdl-etk-signa-{idx}" class="font-bold text-slate-700 block mb-1">Signa</label>
                <input
                  id="mdl-etk-signa-{idx}"
                  type="text"
                  bind:value={label.signa}
                  placeholder="3 x Sehari 1..."
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-brand-blue"
                />
              </div>
              <div>
                <label for="mdl-etk-inst-{idx}" class="font-bold text-slate-700 block mb-1">Instruksi</label>
                <input
                  id="mdl-etk-inst-{idx}"
                  type="text"
                  bind:value={label.instruction}
                  placeholder="Sesudah Makan..."
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5"
                />
              </div>
              <div class="col-span-2">
                <label for="mdl-etk-drug-{idx}" class="font-bold text-slate-700 block mb-1">Nama Obat & Jumlah</label>
                <input
                  id="mdl-etk-drug-{idx}"
                  type="text"
                  bind:value={label.drugName}
                  placeholder="Nama obat..."
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5"
                />
              </div>
            </div>

            <!-- LIVE LABEL PREVIEW -->
            <div class="p-3.5 border-2 rounded-xl text-center space-y-1.5 text-xs {label.type === 'BIRU' ? 'bg-blue-50/80 border-blue-400 text-blue-950' : 'bg-white border-slate-300 text-slate-900'}">
              <div class="font-extrabold uppercase text-[11px]">{label.branchName}</div>
              <div class="text-[10px] opacity-75">
                No: <strong>{label.recipeNumber || "-"}</strong> • Pasien: <strong>{label.patientName || "-"}</strong>
              </div>
              <div class="p-2 rounded-lg font-black {label.type === 'BIRU' ? 'bg-white text-blue-900 border border-blue-200' : 'bg-blue-50 text-brand-blue'}">
                {label.signa || "-"}
                <div class="text-[10px] font-semibold opacity-80">{label.instruction || "-"}</div>
              </div>
              <div class="text-[11px] font-semibold">{label.drugName || "-"}</div>
              {#if label.type === "BIRU"}
                <div class="text-[10px] font-black text-brand-red-600 uppercase pt-1 border-t border-blue-200">
                  OBAT LUAR - TIDAK BOLEH DITELAN
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button
          type="button"
          onclick={() => (isEtiketModalOpen = false)}
          class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={enabledEtiketLabels.length === 0}
          onclick={handlePrintEtiket}
          class="px-4 py-1.5 rounded-xl bg-brand-blue-700 hover:bg-brand-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs shadow-sm"
        >
          {enabledEtiketLabels.length > 1 ? `Cetak ${enabledEtiketLabels.length} Etiket` : "Cetak Sekarang"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- LEMBAR CETAK KHUSUS LABEL ETIKET (58mm x 40mm PER LABEL, HANYA TAMPIL SAAT PRINT) -->
{#if isPrintingEtiket}
  <div
    use:portal
    id="etiket-print-sheet"
    class="etiket-print-sheet hidden print:block"
    aria-hidden="true"
  >
    {#each enabledEtiketLabels as label (label.id)}
      <div class="etiket-print-card text-[10px] leading-tight">
        <div class="text-center border-b border-black pb-1 mb-1">
          <div class="font-bold text-[10px] uppercase">{label.branchName}</div>
          {#if label.branchAddress}
            <div class="text-[8px]">{label.branchAddress}</div>
          {/if}
          <div class="text-[8px]">Apoteker: {label.pharmacistName}</div>
        </div>

        <div class="flex justify-between text-[8.5px] border-b border-dashed border-black pb-0.5 mb-1">
          <span>No: <strong>{label.recipeNumber || "-"}</strong></span>
          <span>Tgl: {label.date}</span>
        </div>

        <div class="text-[9.5px] mb-1">
          Pasien: <strong>{label.patientName || "-"}</strong>
        </div>

        <div class="text-center border border-black py-1 px-1 mb-1 font-bold text-[10.5px]">
          <div>{label.signa || "-"}</div>
          <div class="text-[8.5px] font-semibold">{label.instruction || "-"}</div>
        </div>

        <div class="text-[9px] font-semibold break-words">
          {label.drugName || "-"}
        </div>

        <div class="flex justify-between items-center text-[8px] pt-1 mt-1 border-t border-black">
          <span>BUD: {label.budDate}</span>
          <span class="font-bold uppercase">
            {label.type === "BIRU" ? "OBAT LUAR" : "OBAT DALAM"}
          </span>
        </div>
      </div>
    {/each}
  </div>
{/if}
