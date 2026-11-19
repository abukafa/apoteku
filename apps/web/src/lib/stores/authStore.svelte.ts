import { browser } from "$app/environment";
import { api } from "../services/api";
import { tenantStore } from "./tenantStore.svelte";
import {
  hasPermission,
  hasAnyPermission,
  canAccessRoute,
  resolveEffectivePermissions,
  ROLE_DEFAULT_ROUTES,
  type UserRole as CoreUserRole,
  type PermissionKey
} from "@apoteku/core";

export type UserRole = CoreUserRole | "INVENTORY_STAFF";

export function toCoreRole(role?: string | null): CoreUserRole {
  if (role === "INVENTORY_STAFF") return "INVENTORY";
  return (role || "GUEST") as CoreUserRole;
}

export interface ActiveUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  tenantId: string;
  branchId: string;
  assignedBranchId?: string;
  branchName: string;
  pin: string;
  avatarUrl?: string;
  isActive: boolean;
  customPermissions?: string[];
  permissions?: string[];
}

const STORAGE_KEY_USER = "apoteku_session_user";
const STORAGE_KEY_TOKEN = "apoteku_session_token";
const STORAGE_KEY_LOCKED = "apoteku_pos_terminal_locked";

const DEFAULT_SUPERADMIN: ActiveUser = {
  id: "usr-superadmin",
  username: "superadmin",
  fullName: "Darajat Rahmatulloh",
  email: "admin@hafidzfarma.com",
  role: "SUPERADMIN",
  tenantId: "tenant-hafidz-farma",
  branchId: "ALL",
  assignedBranchId: "ALL",
  branchName: "Semua Cabang",
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
  isAllBranches = $derived(
    !this.user?.assignedBranchId && !this.user?.branchId
      ? true
      : (this.user?.assignedBranchId ?? this.user?.branchId) === "ALL"
  );
  canSelectBranch = $derived(
    !this.user?.assignedBranchId && !this.user?.branchId
      ? true
      : (this.user?.assignedBranchId ?? this.user?.branchId) === "ALL"
  );

  constructor() {
    if (browser) {
      try {
        const storedUser = localStorage.getItem(STORAGE_KEY_USER);
        const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
        const storedLocked = localStorage.getItem(STORAGE_KEY_LOCKED);
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          if (parsed.avatarUrl && parsed.avatarUrl.includes("unsplash.com")) {
            parsed.avatarUrl = undefined;
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(parsed));
          }
          this.user = parsed;
          this.accessToken = storedToken || "jwt-session-access";
          this.refreshToken = "jwt-session-refresh";
          this.isLockedOffline = storedLocked === "true";
        } else {
          this.user = null;
          this.isLockedOffline = false;
        }
      } catch (err) {
        console.error("Failed to restore auth session:", err);
        this.user = null;
      }
    } else {
      this.user = null;
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
      localStorage.removeItem(STORAGE_KEY_LOCKED);
    }
  }

  // Sinkronisasi data sesi & wewenang hak akses terbaru dari database
  async syncUserSession(): Promise<void> {
    if (!browser || !this.user?.id) return;
    try {
      const res = await api.auth.me();
      if (res?.success && res.data?.user) {
        const u = res.data.user;
        const customUserPerms = (u.customPermissions || []) as string[];
        const effectivePerms = u.permissions || resolveEffectivePermissions(toCoreRole(u.role), customUserPerms);
        const isAll = !u.branchId || u.branchId === "ALL" || u.assignedBranchId === "ALL";
        const assignedBranch = u.assignedBranchId || (isAll ? "ALL" : u.branchId);
        const activeUser: ActiveUser = {
          ...this.user,
          fullName: u.fullName || this.user.fullName,
          role: (u.role || this.user.role) as UserRole,
          branchId: u.branchId || this.user.branchId,
          assignedBranchId: assignedBranch,
          branchName: u.branchName || this.user.branchName,
          avatarUrl: u.avatarUrl || this.user.avatarUrl,
          customPermissions: customUserPerms,
          permissions: effectivePerms
        };
        this.setUserSession(activeUser, {
          access: this.accessToken || `token-${u.id}`,
          refresh: this.refreshToken || `refresh-${u.id}`
        });
      }
    } catch (_) {
      // Abaikan jika offline / server belum aktif
    }
  }

  // Live Database Login via API
  async loginWithApi(identifier: string, pin: string, branchId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await api.auth.login({ identifier, pin, branchId });
      if (res?.success && res.data?.user) {
        const u = res.data.user;
        const customPerms = (u.customPermissions || []) as string[];
        const effectivePerms = u.permissions || resolveEffectivePermissions(toCoreRole(u.role), customPerms);
        const isAll = !u.branchId || u.branchId === "ALL" || u.assignedBranchId === "ALL";
        const assignedBranch = u.assignedBranchId || (isAll ? "ALL" : u.branchId);
        const activeUser: ActiveUser = {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          email: u.email || `${u.username}@hafidzfarma.com`,
          role: u.role as UserRole,
          tenantId: u.tenantId || "tenant-hafidz-farma",
          branchId: u.branchId || branchId || (isAll ? "ALL" : "1"),
          assignedBranchId: assignedBranch,
          branchName: u.branchName || (isAll ? "Semua Cabang" : "Apotek Hafidz Farma Pusat"),
          pin,
          avatarUrl: u.avatarUrl,
          isActive: true,
          customPermissions: customPerms,
          permissions: effectivePerms
        };

        this.setUserSession(activeUser, {
          access: res.data.token || `token-${u.id}`,
          refresh: `refresh-${u.id}`
        });

        return { success: true };
      }
      return { success: false, error: res?.error || "Gagal masuk" };
    } catch (err: any) {
      const rawMsg = String(err?.message || "");
      // Jika error berasal dari respons HTTP 4xx server (PIN salah / user tidak aktif), jangan fallback ke mode offline
      if (rawMsg.startsWith("API 4")) {
        const jsonStart = rawMsg.indexOf("{");
        if (jsonStart !== -1) {
          try {
            const parsedErr = JSON.parse(rawMsg.slice(jsonStart));
            if (parsedErr?.error) {
              return { success: false, error: parsedErr.error };
            }
          } catch {
            // Gunakan pesan fallback di bawah
          }
        }
        return { success: false, error: "Kredensial atau PIN yang dimasukkan tidak valid" };
      }

      console.warn("API login unreachable, checking offline credentials", err);
      // Fallback offline authentication hanya saat server tidak terjangkau (network error)
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
        const isAll = !u.branchId || u.branchId === "ALL" || u.assignedBranchId === "ALL";
        const assignedBranch = u.assignedBranchId || (isAll ? "ALL" : u.branchId);
        const activeUser: ActiveUser = {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          email: u.email || `${u.username}@apoteku.local`,
          role: u.role as UserRole,
          tenantId: u.tenantId || "tenant-hafidz-farma",
          branchId: u.branchId || (isAll ? "ALL" : "1"),
          assignedBranchId: assignedBranch,
          branchName: u.branchName || (isAll ? "Semua Cabang" : (tenantStore.current.name ? `${tenantStore.current.name} Pusat` : "Apotek Hafidz Farma Pusat")),
          pin: payload.pin,
          isActive: true,
          customPermissions: u.customPermissions || [],
          permissions: u.permissions || resolveEffectivePermissions(toCoreRole(u.role), u.customPermissions)
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
        const isAll = !u.branchId || u.branchId === "ALL" || u.assignedBranchId === "ALL";
        const assignedBranch = u.assignedBranchId || (isAll ? "ALL" : u.branchId);
        const activeUser: ActiveUser = {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          email: u.email,
          role: u.role as UserRole,
          tenantId: u.tenantId || "tenant-hafidz-farma",
          branchId: u.branchId || (isAll ? "ALL" : "1"),
          assignedBranchId: assignedBranch,
          branchName: u.branchName || (isAll ? "Semua Cabang" : (tenantStore.current.name ? `${tenantStore.current.name} Pusat` : "Apotek Hafidz Farma Pusat")),
          pin: u.pin || "123456",
          avatarUrl: u.avatarUrl,
          isActive: true,
          customPermissions: u.customPermissions || [],
          permissions: u.permissions || resolveEffectivePermissions(toCoreRole(u.role), u.customPermissions)
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
      const isSuperOrOwner = match.role === "SUPERADMIN" || match.role === "OWNER";
      this.setUserSession({
        id: `usr-${match.username}`,
        username: match.username,
        fullName: match.name,
        email: `${match.username}@hafidzfarma.com`,
        role: match.role,
        tenantId: "tenant-hafidz-farma",
        branchId: branchId || (isSuperOrOwner ? "ALL" : "1"),
        assignedBranchId: isSuperOrOwner ? "ALL" : (branchId || "1"),
        branchName: isSuperOrOwner && (!branchId || branchId === "ALL")
          ? "Semua Cabang"
          : (tenantStore.current.name ? `${tenantStore.current.name} Pusat` : "Apotek Hafidz Farma Pusat"),
        pin: p,
        isActive: true,
        customPermissions: [],
        permissions: resolveEffectivePermissions(toCoreRole(match.role), [])
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
    if (browser) {
      localStorage.setItem(STORAGE_KEY_LOCKED, "true");
    }
  }

  unlockWithPin(pin: string): boolean {
    const expectedPin = (this.user?.pin || "123456").trim();
    if (this.user && expectedPin === pin.trim()) {
      this.isLockedOffline = false;
      if (browser) {
        localStorage.removeItem(STORAGE_KEY_LOCKED);
      }
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
      localStorage.removeItem(STORAGE_KEY_LOCKED);
    }
  }

  /**
   * Cek apakah user saat ini memiliki izin (permission) tertentu
   */
  can(permission: PermissionKey): boolean {
    if (!this.user) return false;
    const role = (this.user.role === "INVENTORY_STAFF" ? "INVENTORY" : this.user.role) as CoreUserRole;
    return hasPermission(role, permission, this.user.permissions);
  }

  /**
   * Cek apakah user memiliki setidaknya salah satu dari daftar izin
   */
  canAny(permissions: PermissionKey[]): boolean {
    if (!this.user) return false;
    const role = (this.user.role === "INVENTORY_STAFF" ? "INVENTORY" : this.user.role) as CoreUserRole;
    return hasAnyPermission(role, permissions, this.user.permissions);
  }

  /**
   * Mengambil rute default berdasarkan peran pengguna
   */
  getDefaultRoute(): string {
    if (!this.user) return "/login";
    const role = (this.user.role === "INVENTORY_STAFF" ? "INVENTORY" : this.user.role) as CoreUserRole;
    return ROLE_DEFAULT_ROUTES[role] || "/";
  }
}

export const authStore = new AuthState();
