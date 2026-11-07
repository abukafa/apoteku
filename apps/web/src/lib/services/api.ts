import { browser } from "$app/environment";
import { env } from "$env/dynamic/public";

const API_BASE_URL =
  (browser && (window as any).__API_BASE_URL__) ||
  env.PUBLIC_API_URL ||
  (browser ? "" : "http://localhost:3001");

export interface ApiFetchOptions extends RequestInit {
  tenantId?: string;
  branchId?: string;
  userId?: string;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { tenantId, branchId, userId, headers, ...rest } = options;

  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>)
  };

  if (tenantId) reqHeaders["x-tenant-id"] = tenantId;
  if (branchId) reqHeaders["x-branch-id"] = branchId;
  if (userId) reqHeaders["x-user-id"] = userId;

  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    ...rest,
    headers: reqHeaders
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown network error");
    throw new Error(`API ${res.status} [${res.statusText}]: ${errorText}`);
  }

  return (await res.json()) as T;
}

export const api = {
  pos: {
    async getBootstrap(branchId?: string) {
      const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : "";
      return await apiFetch<any>(`/api/pos/bootstrap${query}`, { branchId });
    },
    async syncSales(payload: any) {
      return await apiFetch<any>("/api/pos/sync-sales", {
        method: "POST",
        branchId: payload.branchId,
        body: JSON.stringify(payload)
      });
    },
    async getDelta(branchId: string, since?: string) {
      const params = new URLSearchParams({ branch_id: branchId });
      if (since) params.append("since", since);
      return await apiFetch<any>(`/api/pos/sync-delta?${params.toString()}`, { branchId });
    }
  },
  media: {
    async uploadFile(file: File, category: "prescriptions" | "invoices" | "general" = "general") {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);

      const res = await fetch(`${API_BASE_URL}/api/uploads`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) throw new Error("Upload failed");
      return await res.json();
    }
  },
  system: {
    async checkHealth() {
      try {
        return await apiFetch<{ status: string }>("/health");
      } catch (_) {
        return { status: "offline" };
      }
    }
  },
  erp: {
    async getStats() {
      return await apiFetch<any>("/api/stats");
    },
    async getSuppliers() {
      return await apiFetch<any>("/api/suppliers");
    },
    async getCustomers() {
      return await apiFetch<any>("/api/customers");
    },
    async getSales(limit = 100) {
      return await apiFetch<any>(`/api/sales?limit=${limit}`);
    },
    async getPurchases(limit = 100) {
      return await apiFetch<any>(`/api/purchases?limit=${limit}`);
    },
    async getPurchaseOrders(limit = 100) {
      return await apiFetch<any>(`/api/purchase-orders?limit=${limit}`);
    },
    async createPurchaseOrder(payload: any) {
      return await apiFetch<any>("/api/purchase-orders", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  },
  auth: {
    async login(payload: { identifier: string; pin: string }) {
      return await apiFetch<any>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async register(payload: {
      fullName: string;
      username: string;
      pin: string;
      email?: string;
      phone?: string;
      password?: string;
      branchId?: string;
      role?: string;
    }) {
      return await apiFetch<any>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async getStatus() {
      return await apiFetch<any>("/api/auth/status");
    },
    async getGoogleConfig() {
      return await apiFetch<{ success: boolean; data: { clientId: string; isConfigured: boolean } }>(
        "/api/auth/google/config"
      );
    },
    async google(payload: { credential?: string; idToken?: string; accessToken?: string; branchId?: string }) {
      return await apiFetch<any>("/api/auth/google", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  },
  users: {
    async list() {
      return await apiFetch<any>("/api/users");
    },
    async create(payload: any) {
      return await apiFetch<any>("/api/users", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async update(id: string, payload: any) {
      return await apiFetch<any>(`/api/users/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    },
    async delete(id: string) {
      return await apiFetch<any>(`/api/users/${id}`, {
        method: "DELETE"
      });
    }
  },
  branches: {
    async list() {
      return await apiFetch<any>("/api/branches");
    },
    async update(id: string, payload: any) {
      return await apiFetch<any>(`/api/branches/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    }
  },
  shift: {
    async getCurrent(branchId?: string) {
      const q = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : "";
      return await apiFetch<any>(`/api/shifts/current${q}`);
    },
    async list(params: { branchId?: string; status?: "ALL" | "OPEN" | "CLOSED"; limit?: number } = {}) {
      const sp = new URLSearchParams();
      if (params.branchId) sp.append("branch_id", params.branchId);
      if (params.status) sp.append("status", params.status);
      if (params.limit) sp.append("limit", String(params.limit));
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return await apiFetch<any>(`/api/shifts${qs}`);
    },
    async open(payload: { branchId?: string; initialCash: number; shiftNumber?: number; notes?: string }) {
      return await apiFetch<any>("/api/shifts/open", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async close(payload: { shiftId: string; actualCash: number; notes?: string }) {
      return await apiFetch<any>("/api/shifts/close", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  },
  prescription: {
    async list(params: { branchId?: string; limit?: number } = {}) {
      const sp = new URLSearchParams();
      if (params.branchId) sp.append("branch_id", params.branchId);
      if (params.limit) sp.append("limit", String(params.limit));
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return await apiFetch<any>(`/api/prescriptions${qs}`);
    },
    async create(payload: any) {
      return await apiFetch<any>("/api/prescriptions", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  },
  transfer: {
    async list(params: { branchId?: string; limit?: number } = {}) {
      const sp = new URLSearchParams();
      if (params.branchId) sp.append("branch_id", params.branchId);
      if (params.limit) sp.append("limit", String(params.limit));
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return await apiFetch<any>(`/api/inventory/transfers${qs}`);
    },
    async create(payload: any) {
      return await apiFetch<any>("/api/inventory/transfers", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async receive(transferId: string, payload: any) {
      return await apiFetch<any>(`/api/inventory/transfers/${transferId}/receive`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async dispatch(transferId: string, courierName?: string) {
      return await apiFetch<any>(`/api/inventory/transfers/${transferId}/dispatch`, {
        method: "POST",
        body: JSON.stringify({ courierName })
      });
    }
  },
  finance: {
    async getDebtPayments(params: { branchId?: string; invoiceId?: string; limit?: number } = {}) {
      const sp = new URLSearchParams();
      if (params.branchId) sp.append("branch_id", params.branchId);
      if (params.invoiceId) sp.append("invoice_id", params.invoiceId);
      if (params.limit) sp.append("limit", String(params.limit));
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return await apiFetch<any>(`/api/finance/debt-payments${qs}`);
    },
    async getDebtSummary(branchId?: string) {
      const qs = branchId ? `?branch_id=${branchId}` : "";
      return await apiFetch<any>(`/api/finance/debt-summary${qs}`);
    },
    async recordDebtPayment(payload: {
      purchaseInvoiceId: string;
      branchId?: string;
      amountPaid: number;
      paymentMethod: string;
      paymentDate?: string;
      paymentNumber?: string;
      receiptScanUrl?: string;
      paidBy?: string;
    }) {
      return await apiFetch<any>("/api/finance/debt-payments", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async getCashflow() {
      return await apiFetch<any>("/api/finance/cashflow");
    }
  },
  reports: {
    async getFinancialSummary() {
      return await apiFetch<any>("/api/reports/financial");
    },
    async getSipnap(category = "ALL") {
      const q = category ? `?category=${encodeURIComponent(category)}` : "";
      return await apiFetch<any>(`/api/reports/sipnap${q}`);
    }
  },
  returns: {
    async getCustomerReturns(params: { branchId?: string; limit?: number } = {}) {
      const sp = new URLSearchParams();
      if (params.branchId) sp.append("branch_id", params.branchId);
      if (params.limit) sp.append("limit", String(params.limit));
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return await apiFetch<any>(`/api/returns/customer${qs}`);
    },
    async createCustomerReturn(payload: {
      branchId?: string;
      customerName: string;
      originalTrx?: string;
      productId?: string;
      productName: string;
      batchNo?: string;
      qty: number;
      unit?: string;
      refundAmount: number;
      stockDisposition: "LAYAK_JUAL" | "KARANTINA";
      compensationType: "REFUND_TUNAI" | "TUKAR_BARANG";
      reason?: string;
      cashier?: string;
    }) {
      return await apiFetch<any>("/api/returns/customer", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async getSupplierReturns(params: { branchId?: string; limit?: number } = {}) {
      const sp = new URLSearchParams();
      if (params.branchId) sp.append("branch_id", params.branchId);
      if (params.limit) sp.append("limit", String(params.limit));
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return await apiFetch<any>(`/api/returns/supplier${qs}`);
    },
    async createSupplierReturn(payload: {
      branchId?: string;
      supplierName: string;
      invoiceRef?: string;
      productId?: string;
      productName: string;
      batchNo?: string;
      qty: number;
      unit?: string;
      totalValue: number;
      settlementType: "NOTA_KREDIT" | "TUKAR_BATCH";
      reason?: string;
      pic?: string;
    }) {
      return await apiFetch<any>("/api/returns/supplier", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async resolveSupplierReturn(id: string, payload: { settlementType?: string; creditNoteNo?: string } = {}) {
      return await apiFetch<any>(`/api/returns/supplier/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  }
};
