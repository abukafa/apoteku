import { browser } from "$app/environment";
import { api } from "../services/api";

export type UserRole =
  | "SUPERADMIN"
  | "OWNER"
  | "PHARMACIST"
  | "CASHIER"
  | "INVENTORY"
  | "FINANCE"
  | "INVENTORY_STAFF"
  | "GUEST";

export interface ActiveUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  tenantId: string;
  branchId: string;
  branchName: string;
  pin: string;
  avatarUrl?: string;
  isActive: boolean;
  permissions?: string[];
}

const STORAGE_KEY_USER = "apoteku_session_user";
const STORAGE_KEY_TOKEN = "apoteku_session_token";

const DEFAULT_SUPERADMIN: ActiveUser = {
  id: "usr-superadmin",
  username: "superadmin",
  fullName: "Darajat Rahmatulloh",
  email: "admin@hafidzfarma.com",
  role: "SUPERADMIN",
  tenantId: "tenant-hafidz-farma",
  branchId: "1",
  branchName: "Apotek Hafidz Farma Pusat",
  pin: "123456",
  avatarUrl: undefined,
  isActive: true,
  permissions: ["*"]
};

export class AuthState {
  user = $state<ActiveUser | null>(null);
  accessToken = $state<string | null>(null);
  refreshToken = $state<string | null>(null);
  isLockedOffline = $state<boolean>(false);

  isAuthenticated = $derived(this.user !== null);

  constructor() {
    if (browser) {
      try {
        const storedUser = localStorage.getItem(STORAGE_KEY_USER);
        const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          if (parsed.avatarUrl && parsed.avatarUrl.includes("unsplash.com")) {
            parsed.avatarUrl = undefined;
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(parsed));
          }
          this.user = parsed;
          this.accessToken = storedToken || "jwt-session-access";
          this.refreshToken = "jwt-session-refresh";
        } else {
          this.setUserSession(DEFAULT_SUPERADMIN, {
            access: "jwt-token-access-superadmin",
            refresh: "jwt-token-refresh-superadmin"
          });
        }
      } catch (err) {
        console.error("Failed to restore auth session:", err);
      }
    } else {
      this.user = DEFAULT_SUPERADMIN;
    }
  }

  setUserSession(
    user: ActiveUser,
    tokens: { access: string; refresh: string } = {
      access: "jwt-access-token",
      refresh: "jwt-refresh-token"
    }
  ) {
    this.user = user;
    this.accessToken = tokens.access;
    this.refreshToken = tokens.refresh;
    this.isLockedOffline = false;

    if (browser) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      localStorage.setItem(STORAGE_KEY_TOKEN, tokens.access);
    }
  }

  // Live Database Login via API
  async loginWithApi(identifier: string, pin: string, branchId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await api.auth.login({ identifier, pin });
      if (res?.success && res.data?.user) {
        const u = res.data.user;
        const activeUser: ActiveUser = {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          email: u.email || `${u.username}@hafidzfarma.com`,
          role: u.role as UserRole,
          tenantId: u.tenantId || "tenant-hafidz-farma",
          branchId: branchId || u.branchId || "1",
          branchName: u.branchName || "Apotek Hafidz Farma Pusat",
          pin,
          avatarUrl: u.avatarUrl,
          isActive: true,
          permissions: u.permissions
        };

        this.setUserSession(activeUser, {
          access: res.data.token || `token-${u.id}`,
          refresh: `refresh-${u.id}`
        });

        return { success: true };
      }
      return { success: false, error: res?.error || "Gagal masuk" };
    } catch (err: any) {
      console.warn("API login failed, checking offline credentials", err);
      // Fallback offline authentication
      const isSuccess = this.loginWithCredentials(identifier, pin, branchId);
      if (isSuccess) return { success: true };
      return { success: false, error: err.message || "Terjadi kesalahan saat masuk" };
    }
  }

  // Register new user (Pengguna pertama otomatis SUPERADMIN / Level Teratas)
  async register(payload: {
    fullName: string;
    username: string;
    pin: string;
    email?: string;
    phone?: string;
    password?: string;
    branchId?: string;
    role?: string;
  }): Promise<{ success: boolean; isFirstUser?: boolean; message?: string; error?: string }> {
    try {
      const res = await api.auth.register(payload);
      if (res?.success && res.data?.user) {
        const u = res.data.user;
        const activeUser: ActiveUser = {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          email: u.email || `${u.username}@apoteku.local`,
          role: u.role as UserRole,
          tenantId: u.tenantId || "tenant-hafidz-farma",
          branchId: u.branchId || "1",
          branchName: u.branchName || "Apotek Hafidz Farma Pusat",
          pin: payload.pin,
          isActive: true,
          permissions: u.permissions || (u.role === "SUPERADMIN" ? ["*"] : ["pos:read", "pos:write", "stok:read"])
        };

        this.setUserSession(activeUser, {
          access: res.data.token || `token-${u.id}`,
          refresh: `refresh-${u.id}`
        });

        return {
          success: true,
          isFirstUser: res.isFirstUser,
          message: res.message
        };
      }
      return { success: false, error: res?.error || "Pendaftaran gagal" };
    } catch (err: any) {
      return { success: false, error: err.message || "Terjadi kesalahan saat pendaftaran" };
    }
  }

  // Google OAuth Login
  async loginWithGoogle(
    payload: string | { credential?: string; accessToken?: string; branchId?: string },
    branchId?: string
  ): Promise<{ success: boolean; isFirstUser?: boolean; isNewUser?: boolean; message?: string; error?: string }> {
    try {
      const body =
        typeof payload === "string"
          ? { credential: payload, branchId }
          : { ...payload, branchId: payload.branchId || branchId };

      const res = await api.auth.google(body);
      if (res?.success && res.data?.user) {
        const u = res.data.user;
        const activeUser: ActiveUser = {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          email: u.email,
          role: u.role as UserRole,
          tenantId: u.tenantId || "tenant-hafidz-farma",
          branchId: u.branchId || "1",
          branchName: u.branchName || "Apotek Hafidz Farma Pusat",
          pin: u.pin || "123456",
          avatarUrl: u.avatarUrl,
          isActive: true,
          permissions: u.permissions || (u.role === "SUPERADMIN" ? ["*"] : ["pos:read", "pos:write", "stok:read"])
        };

        this.setUserSession(activeUser, {
          access: res.data.token || `google-token-${u.id}`,
          refresh: `google-refresh-${u.id}`
        });

        return {
          success: true,
          isFirstUser: res.isFirstUser,
          isNewUser: res.isNewUser,
          message: res.message
        };
      }
      return { success: false, error: res?.error || "Gagal masuk dengan Google" };
    } catch (err: any) {
      return { success: false, error: err.message || "Gagal memproses autentikasi Google" };
    }
  }

  // Fast PIN login (POS & Quick Switcher)
  loginWithPin(pin: string, branchId?: string): boolean {
    const p = pin.trim();
    if (this.user && this.user.pin === p) {
      this.isLockedOffline = false;
      return true;
    }

    // Role-based PIN quick access
    const rolePinMap: Record<string, { role: UserRole; name: string; username: string }> = {
      "123456": { role: "SUPERADMIN", name: "Darajat Rahmatulloh", username: "superadmin" },
      "888888": { role: "OWNER", name: "H. Arief Rahman, M.M.", username: "owner" },
      "112233": { role: "PHARMACIST", name: "apt. Ghina Nadhifah, S.Farm.", username: "apoteker" },
      "654321": { role: "CASHIER", name: "Nida Farida", username: "kasir" },
      "777777": { role: "INVENTORY", name: "Tita Nurrohmat", username: "gudang" },
      "999999": { role: "FINANCE", name: "Dewi Rahmawati", username: "keuangan" }
    };

    if (rolePinMap[p]) {
      const match = rolePinMap[p];
      this.setUserSession({
        id: `usr-${match.username}`,
        username: match.username,
        fullName: match.name,
        email: `${match.username}@hafidzfarma.com`,
        role: match.role,
        tenantId: "tenant-hafidz-farma",
        branchId: branchId || "1",
        branchName: "Apotek Hafidz Farma Pusat",
        pin: p,
        isActive: true,
        permissions: ["*"]
      });
      return true;
    }

    return false;
  }

  loginWithCredentials(
    identifier: string,
    secret: string,
    branchId?: string
  ): boolean {
    const idTrim = identifier.toLowerCase().trim();
    const secTrim = secret.trim();

    return this.loginWithPin(secTrim, branchId);
  }

  switchBranch(branchId: string, branchName?: string) {
    if (!this.user) return;
    this.user = {
      ...this.user,
      branchId,
      branchName: branchName || this.user.branchName
    };
    if (browser) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(this.user));
    }
  }

  lockScreen() {
    this.isLockedOffline = true;
  }

  unlockWithPin(pin: string): boolean {
    if (this.user && this.user.pin === pin.trim()) {
      this.isLockedOffline = false;
      return true;
    }
    return false;
  }

  clearSession() {
    this.user = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.isLockedOffline = false;

    if (browser) {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_TOKEN);
    }
  }
}

export const authStore = new AuthState();
