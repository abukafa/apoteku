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

function getStoredAuthHeaders(): Record<string, string> {
  if (!browser) return {};
  const authHeaders: Record<string, string> = {};
  try {
    const rawToken = localStorage.getItem("apoteku_session_token");
    if (rawToken) {
      authHeaders["Authorization"] = `Bearer ${rawToken}`;
    }
    const rawUser = localStorage.getItem("apoteku_session_user");
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      if (parsed?.tenantId) authHeaders["x-tenant-id"] = String(parsed.tenantId);
      if (parsed?.branchId) authHeaders["x-branch-id"] = String(parsed.branchId);
      if (parsed?.id) authHeaders["x-user-id"] = String(parsed.id);
      if (parsed?.role) authHeaders["x-user-role"] = String(parsed.role);
    }
  } catch {
    // Ignore storage read errors
  }
  return authHeaders;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { tenantId, branchId, userId, headers, ...rest } = options;

  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...getStoredAuthHeaders(),
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
    async getBootstrap(branchId?: string, includeAllUnits = false) {
      const params = new URLSearchParams();
      if (branchId) params.set("branch_id", branchId);
      if (includeAllUnits) params.set("include_all_units", "1");
      const query = params.toString() ? `?${params.toString()}` : "";
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
    },
    async getActiveShift(branchId?: string) {
      const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : "";
      return await apiFetch<any>(`/api/pos/shifts/active${query}`, { branchId });
    },
    async openShift(payload: { branchId: string; initialCash: number; shiftNumber?: number; notes?: string }) {
      return await apiFetch<any>("/api/pos/shifts/open", {
        method: "POST",
        branchId: payload.branchId,
        body: JSON.stringify(payload)
      });
    },
    async closeShift(shiftId: string, payload: { actualCash: number; notes?: string }) {
      return await apiFetch<any>(`/api/pos/shifts/${shiftId}/close`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  },
  media: {
    async uploadFile(
      file: File,
      category: "prescriptions" | "invoices" | "general" | "branding" | "signatures" = "general"
    ) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);

      const res = await fetch(`${API_BASE_URL}/api/uploads`, {
        method: "POST",
        headers: getStoredAuthHeaders(),
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
    async getDashboard() {
      return await apiFetch<any>("/api/dashboard");
    },
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
    async createPurchase(payload: any) {
      return await apiFetch<any>("/api/purchases", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async getPurchaseOrders(limit = 100) {
      return await apiFetch<any>(`/api/purchase-orders?limit=${limit}`);
    },
    async createPurchaseOrder(payload: any) {
      return await apiFetch<any>("/api/purchase-orders", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async getPurchaseOrderById(id: string) {
      return await apiFetch<any>(`/api/purchase-orders/${id}`);
    },
    async getBranches() {
      return await apiFetch<any>("/api/branches");
    },
    async getProducts() {
      return await apiFetch<any>("/api/products");
    },
    async getPurchaseById(id: string) {
      return await apiFetch<any>(`/api/purchases/${id}`);
    },
    async deletePurchase(id: string) {
      return await apiFetch<any>(`/api/purchases/${id}`, {
        method: "DELETE"
      });
    },
    async getConsignments(branchId?: string) {
      const qs = branchId && branchId !== "ALL" ? `?branchId=${encodeURIComponent(branchId)}` : "";
      return await apiFetch<any>(`/api/consignments${qs}`);
    },
    async getConsignmentSettlements(branchId?: string) {
      const qs = branchId && branchId !== "ALL" ? `?branchId=${encodeURIComponent(branchId)}` : "";
      return await apiFetch<any>(`/api/consignments/settlements${qs}`);
    },
    async createConsignment(payload: any) {
      return await apiFetch<any>("/api/consignments", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async settleConsignment(id: string, payload?: any) {
      return await apiFetch<any>(`/api/consignments/${id}/settle`, {
        method: "POST",
        body: payload ? JSON.stringify(payload) : "{}"
      });
    },
    async deleteConsignment(id: string) {
      return await apiFetch<any>(`/api/consignments/${id}`, {
        method: "DELETE"
      });
    }
  },
  customers: {
    async list() {
      return await apiFetch<any>("/api/customers");
    },
    async create(payload: {
      name: string;
      code?: string;
      phone?: string;
      address?: string;
      customerType?: string;
      priceTier?: string;
      pointBalance?: number;
      isActive?: boolean;
    }) {
      return await apiFetch<any>("/api/customers", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async update(
      id: string,
      payload: {
        name?: string;
        code?: string;
        phone?: string;
        address?: string;
        customerType?: string;
        priceTier?: string;
        pointBalance?: number;
        isActive?: boolean;
      }
    ) {
      return await apiFetch<any>(`/api/customers/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    },
    async delete(id: string) {
      return await apiFetch<any>(`/api/customers/${id}`, {
        method: "DELETE"
      });
    },
    async getReceivables() {
      return await apiFetch<any>("/api/customers/receivables");
    },
    async payReceivable(payload: {
      transactionId: string;
      amountPaid: number;
      paymentMethod?: string;
      operator?: string;
    }) {
      return await apiFetch<any>("/api/customers/receivables/pay", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  },
  suppliers: {
    async list() {
      return await apiFetch<any>("/api/suppliers");
    },
    async create(payload: {
      name: string;
      code?: string;
      phone?: string;
      email?: string;
      address?: string;
      contactPerson?: string;
      paymentTermDays?: number;
      topDays?: number;
      isConsignment?: boolean;
      isActive?: boolean;
    }) {
      return await apiFetch<any>("/api/suppliers", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async update(
      id: string,
      payload: {
        name?: string;
        code?: string;
        phone?: string;
        email?: string;
        address?: string;
        contactPerson?: string;
        paymentTermDays?: number;
        topDays?: number;
        isConsignment?: boolean;
        isActive?: boolean;
      }
    ) {
      return await apiFetch<any>(`/api/suppliers/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    },
    async delete(id: string) {
      return await apiFetch<any>(`/api/suppliers/${id}`, {
        method: "DELETE"
      });
    }
  },
  products: {
    async create(payload: any) {
      return await apiFetch<any>("/api/products", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async update(id: string, payload: any) {
      return await apiFetch<any>(`/api/products/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    },
    async delete(id: string) {
      return await apiFetch<any>(`/api/products/${id}`, {
        method: "DELETE"
      });
    }
  },
  auth: {
    async login(payload: { identifier: string; pin: string; branchId?: string }) {
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
  tenant: {
    async get() {
      return await apiFetch<any>("/api/tenant");
    },
    async update(payload: {
      id?: string;
      code?: string;
      name?: string;
      legalName?: string;
      tagline?: string;
      logoUrl?: string;
      pharmacistName?: string;
      responsiblePerson?: string;
      sipaNumber?: string;
      sipaExpiry?: string;
      siaNumber?: string;
      nib?: string;
      npwp?: string;
      address?: string;
      city?: string;
      province?: string;
      postalCode?: string;
      phone?: string;
      whatsapp?: string;
      email?: string;
      website?: string;
      bankName?: string;
      bankAccountNumber?: string;
      bankAccountHolder?: string;
      bankAccounts?: any;
      signatureUrl?: string;
      stampUrl?: string;
      receiptHeader?: string;
      receiptFooter?: string;
      taxPercent?: number;
      isActive?: boolean;
      [key: string]: any;
    }) {
      return await apiFetch<any>("/api/tenant", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    }
  },
  branches: {
    async list() {
      return await apiFetch<any>("/api/branches");
    },
    async create(payload: {
      code: string;
      name: string;
      address?: string;
      phone?: string;
      receiptHeader?: string;
      receiptFooter?: string;
      createDefaultLocation?: boolean;
      defaultLocationCode?: string;
      defaultLocationName?: string;
    }) {
      return await apiFetch<any>("/api/branches", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async update(id: string, payload: any) {
      return await apiFetch<any>(`/api/branches/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    }
  },
  locations: {
    async list(branchId?: string) {
      const q = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : "";
      return await apiFetch<any>(`/api/inventory-locations${q}`);
    },
    async create(payload: {
      branchId: string;
      code: string;
      name: string;
      isDefault?: boolean;
      isActive?: boolean;
    }) {
      return await apiFetch<any>("/api/inventory-locations", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async update(
      id: string,
      payload: {
        branchId?: string;
        code?: string;
        name?: string;
        isDefault?: boolean;
        isActive?: boolean;
      }
    ) {
      return await apiFetch<any>(`/api/inventory-locations/${id}`, {
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
    },
    async verify(id: string, payload: any = {}) {
      return await apiFetch<any>(`/api/prescriptions/${encodeURIComponent(id)}/verify`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    },
    async dispense(id: string, payload: any) {
      return await apiFetch<any>(`/api/prescriptions/${encodeURIComponent(id)}/dispense`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async listCounselings(params: { branchId?: string; limit?: number } = {}) {
      const sp = new URLSearchParams();
      if (params.branchId) sp.append("branch_id", params.branchId);
      if (params.limit) sp.append("limit", String(params.limit));
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return await apiFetch<any>(`/api/prescriptions/counselings${qs}`);
    },
    async listDoctors() {
      return await apiFetch<any>("/api/prescriptions/doctors");
    },
    async createDoctor(payload: any) {
      return await apiFetch<any>("/api/prescriptions/doctors", {
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
    async getBranchProducts(branchId: string) {
      const qs = `?branch_id=${encodeURIComponent(branchId)}`;
      return await apiFetch<any>(`/api/inventory/transfers/branch-products${qs}`, { branchId });
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
    async dispatch(transferId: string, courierName?: string, operator?: string) {
      return await apiFetch<any>(`/api/inventory/transfers/${transferId}/dispatch`, {
        method: "POST",
        body: JSON.stringify({ courierName, operator })
      });
    }
  },
  inventory: {
    async recordOpname(payload: any) {
      return await apiFetch<any>("/api/inventory/opname", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async getOpnameHistory(params: { branchId?: string; limit?: number } = {}) {
      const sp = new URLSearchParams();
      if (params.branchId) sp.append("branch_id", params.branchId);
      if (params.limit) sp.append("limit", String(params.limit));
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return await apiFetch<any>(`/api/inventory/opname${qs}`);
    },
    async getLedger(params: { branchId?: string; productId?: string; limit?: number } = {}) {
      const sp = new URLSearchParams();
      if (params.branchId) sp.append("branch_id", params.branchId);
      if (params.productId) sp.append("product_id", params.productId);
      if (params.limit) sp.append("limit", String(params.limit));
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return await apiFetch<any>(`/api/inventory/ledger${qs}`);
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
    async deleteDebtPayment(paymentId: string) {
      return await apiFetch<any>(`/api/finance/debt-payments/${paymentId}`, {
        method: "DELETE"
      });
    },
    async getCashflow(branchId?: string) {
      const q = branchId && branchId !== "ALL" ? `?branch_id=${encodeURIComponent(branchId)}` : "";
      return await apiFetch<any>(`/api/finance/cashflow${q}`);
    },
    async recordCashMutation(payload: {
      branchId?: string;
      type: "IN" | "OUT";
      category: string;
      account?: string;
      refNumber?: string;
      amount: number;
      description?: string;
      operator?: string;
    }) {
      return await apiFetch<any>("/api/finance/cash-mutations", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async recordQrisPayout(payload: {
      branchId?: string;
      amount: number;
      operator?: string;
    }) {
      return await apiFetch<any>("/api/finance/qris-payout", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    async deleteCashMutation(id: string) {
      return await apiFetch<any>(`/api/finance/cash-mutations/${id}`, {
        method: "DELETE"
      });
    }
  },
  reports: {
    async getFinancialSummary() {
      return await apiFetch<any>("/api/reports/financial");
    },
    async getSalesShifts(params: { branchId?: string; period?: string } = {}) {
      const sp = new URLSearchParams();
      if (params.branchId) sp.append("branchId", params.branchId);
      if (params.period) sp.append("period", params.period);
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return await apiFetch<any>(`/api/reports/sales-shifts${qs}`);
    },
    async getSipnap(params: { category?: string; branchId?: string; period?: string } | string = "ALL") {
      const sp = new URLSearchParams();
      if (typeof params === "string") {
        if (params && params !== "ALL") sp.append("category", params);
      } else {
        if (params.category && params.category !== "ALL") sp.append("category", params.category);
        if (params.branchId) sp.append("branchId", params.branchId);
        if (params.period) sp.append("period", params.period);
      }
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return await apiFetch<any>(`/api/reports/sipnap${qs}`);
    },
    async getPareto(params: { branchId?: string; period?: string } = {}) {
      const sp = new URLSearchParams();
      if (params.branchId) sp.append("branchId", params.branchId);
      if (params.period) sp.append("period", params.period);
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return await apiFetch<any>(`/api/reports/pareto${qs}`);
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
    async approveCustomerReturn(id: string) {
      return await apiFetch<any>(`/api/returns/customer/${id}/approve`, {
        method: "POST"
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
  },
  notifications: {
    async list(params?: { limit?: number; unread?: boolean; category?: string }) {
      const q = new URLSearchParams();
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.unread) q.set("unread", "true");
      if (params?.category) q.set("category", params.category);
      const qs = q.toString() ? `?${q.toString()}` : "";
      return await apiFetch<{
        success: boolean;
        data: any[];
        unreadCount: number;
        error?: string;
      }>(`/api/notifications${qs}`);
    },
    async syncAlerts() {
      return await apiFetch<{ success: boolean; synced: number; error?: string }>(
        "/api/notifications/sync-alerts",
        { method: "POST" }
      );
    },
    async markAsRead(id: string) {
      return await apiFetch<{ success: boolean; error?: string }>(
        `/api/notifications/${id}/read`,
        { method: "PATCH" }
      );
    },
    async markAllRead() {
      return await apiFetch<{ success: boolean; error?: string }>(
        "/api/notifications/mark-all-read",
        { method: "POST" }
      );
    },
    async delete(id: string) {
      return await apiFetch<{ success: boolean; error?: string }>(
        `/api/notifications/${id}`,
        { method: "DELETE" }
      );
    }
  }
};
