import { api } from "$lib/services/api";

export interface BankAccountItem {
  bank: string;
  accountNumber: string;
  accountHolder: string;
  isDefault?: boolean;
}

export interface TenantProfile {
  id: string;
  code: string;
  name: string;
  legalName: string;
  tagline: string;
  logoUrl: string;
  pharmacistName: string;
  responsiblePerson: string;
  sipaNumber: string;
  sipaExpiry: string;
  siaNumber: string;
  nib: string;
  npwp: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  bankAccounts: BankAccountItem[];
  signatureUrl: string;
  stampUrl: string;
  receiptHeader: string;
  receiptFooter: string;
  taxPercent: number;
  isActive: boolean;
  createdAt?: string;
}

const DEFAULT_TENANT_PROFILE: TenantProfile = {
  id: "bdc6fb84-837c-4c51-9744-b503b212c1fc",
  code: "AHF",
  name: "Apotek Hafidz Farma",
  legalName: "PT Hafidz Farma Medika",
  tagline: "Ikhtiar Sehat Keluarga",
  logoUrl: "/img/brand.png",
  pharmacistName: "apt. Ghina Nadhifah, S.Farm.",
  responsiblePerson: "apt. Ghina Nadhifah, S.Farm.",
  sipaNumber: "500.16.7.2/0289/SIPA/DPMPTSP/II/2026",
  sipaExpiry: "2029-12-31",
  siaNumber: "503/0124/SIA/DPMPTSP/2024",
  nib: "1234000567891",
  npwp: "01.234.567.8-123.000",
  address: "Jl. Raya Cirebon - Kuningan No. 45, Cilimus",
  city: "Kuningan",
  province: "Jawa Barat",
  postalCode: "45553",
  phone: "(0232) 876543",
  whatsapp: "0812-3456-7890",
  email: "info@hafidzfarma.com",
  website: "https://hafidzfarma.com",
  bankName: "BCA",
  bankAccountNumber: "0541238910",
  bankAccountHolder: "Apotek Hafidz Farma",
  bankAccounts: [
    { bank: "BCA", accountNumber: "0541238910", accountHolder: "Apotek Hafidz Farma", isDefault: true },
    { bank: "Mandiri", accountNumber: "1310098765432", accountHolder: "Apotek Hafidz Farma", isDefault: false },
    { bank: "BSI", accountNumber: "7123456789", accountHolder: "Apotek Hafidz Farma", isDefault: false }
  ],
  signatureUrl: "/signatures/apt-ghina.png",
  stampUrl: "/stamps/apotek-hafidz-farma.png",
  receiptHeader: "APOTEK HAFIDZ FARMA\nJl. Raya Cirebon - Kuningan No. 45\nTelp: (0232) 876543 / WA: 0812-3456-7890",
  receiptFooter: "Semoga Lekas Sembuh • Terima Kasih atas Kepercayaan Anda\nObat yang sudah dibeli tidak dapat ditukar/dikembalikan",
  taxPercent: 11,
  isActive: true
};

const STORAGE_KEY = "apoteku_tenant_profile_cache";

function parseBankAccounts(raw: any): BankAccountItem[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  return DEFAULT_TENANT_PROFILE.bankAccounts;
}

class TenantStore {
  current = $state<TenantProfile>(DEFAULT_TENANT_PROFILE);
  isLoading = $state(false);
  error = $state<string | null>(null);
  private isInitialized = false;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          this.current = {
            ...DEFAULT_TENANT_PROFILE,
            ...parsed,
            bankAccounts: parseBankAccounts(parsed.bankAccounts)
          };
        }
      } catch (e) {
        console.warn("[TenantStore] Failed to load cached tenant:", e);
      }
    }
  }

  async fetchTenant(force = false): Promise<TenantProfile> {
    if (this.isInitialized && !force) {
      return this.current;
    }

    this.isLoading = true;
    this.error = null;

    try {
      const res = await api.tenant.get();
      if (res?.success && res.data) {
        const d = res.data;
        const normalized: TenantProfile = {
          id: d.id || this.current.id,
          code: d.code || this.current.code,
          name: d.name || this.current.name,
          legalName: d.legalName || this.current.legalName,
          tagline: d.tagline || this.current.tagline,
          logoUrl: d.logoUrl || this.current.logoUrl,
          pharmacistName: d.pharmacistName || this.current.pharmacistName,
          responsiblePerson: d.responsiblePerson || d.pharmacistName || this.current.responsiblePerson,
          sipaNumber: d.sipaNumber || this.current.sipaNumber,
          sipaExpiry: d.sipaExpiry || this.current.sipaExpiry,
          siaNumber: d.siaNumber || this.current.siaNumber,
          nib: d.nib || this.current.nib,
          npwp: d.npwp || this.current.npwp,
          address: d.address || this.current.address,
          city: d.city || this.current.city,
          province: d.province || this.current.province,
          postalCode: d.postalCode || this.current.postalCode,
          phone: d.phone || this.current.phone,
          whatsapp: d.whatsapp || this.current.whatsapp,
          email: d.email || this.current.email,
          website: d.website || this.current.website,
          bankName: d.bankName || this.current.bankName,
          bankAccountNumber: d.bankAccountNumber || this.current.bankAccountNumber,
          bankAccountHolder: d.bankAccountHolder || d.name || this.current.bankAccountHolder,
          bankAccounts: parseBankAccounts(d.bankAccounts),
          signatureUrl: d.signatureUrl || this.current.signatureUrl,
          stampUrl: d.stampUrl || this.current.stampUrl,
          receiptHeader: d.receiptHeader || this.current.receiptHeader,
          receiptFooter: d.receiptFooter || this.current.receiptFooter,
          taxPercent: Number(d.taxPercent ?? this.current.taxPercent),
          isActive: d.isActive !== false,
          createdAt: d.createdAt
        };

        this.current = normalized;
        this.isInitialized = true;

        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          } catch {}
        }
      }
    } catch (e: any) {
      console.warn("[TenantStore] Failed to fetch tenant from API:", e);
      this.error = e?.message || "Gagal memuat profil organisasi";
    } finally {
      this.isLoading = false;
    }

    return this.current;
  }

  async updateTenant(payload: Partial<TenantProfile>): Promise<{ success: boolean; data?: TenantProfile; error?: string }> {
    this.isLoading = true;
    this.error = null;

    try {
      const res = await api.tenant.update({
        ...payload,
        id: this.current.id,
        bankAccounts: payload.bankAccounts ? JSON.stringify(payload.bankAccounts) : undefined
      });

      if (res?.success && res.data) {
        const d = res.data;
        const updated: TenantProfile = {
          ...this.current,
          ...d,
          bankAccounts: parseBankAccounts(d.bankAccounts ?? payload.bankAccounts)
        };
        this.current = updated;

        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          } catch {}
        }

        return { success: true, data: updated };
      } else {
        throw new Error(res?.error || "Gagal memperbarui profil organisasi");
      }
    } catch (e: any) {
      const msg = e?.message || "Gagal memperbarui profil organisasi";
      this.error = msg;
      return { success: false, error: msg };
    } finally {
      this.isLoading = false;
    }
  }
}

export const tenantStore = new TenantStore();
