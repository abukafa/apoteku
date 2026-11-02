import { browser } from "$app/environment";
import usersData from "../mocks/users.json";
import branchesData from "../mocks/branches.json";

export type UserRole =
  | "SUPERADMIN"
  | "OWNER"
  | "PHARMACIST"
  | "CASHIER"
  | "INVENTORY_STAFF";

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
}

const STORAGE_KEY_USER = "apoteku_session_user";
const STORAGE_KEY_TOKEN = "apoteku_session_token";

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
          this.user = JSON.parse(storedUser);
          this.accessToken = storedToken || "mock-jwt-token-access-7d";
          this.refreshToken = "mock-jwt-token-refresh-30d";
        } else {
          // Default initial session: Darajat Rahmatulloh
          const defaultUser = (usersData as ActiveUser[])[0];
          this.setUserSession(defaultUser, {
            access: "mock-jwt-token-access-darajat",
            refresh: "mock-jwt-token-refresh-darajat"
          });
        }
      } catch (err) {
        console.error("Failed to restore auth session:", err);
      }
    } else {
      // SSR fallback
      this.user = (usersData as ActiveUser[])[0];
    }
  }

  setUserSession(
    user: ActiveUser,
    tokens: { access: string; refresh: string } = {
      access: "mock-jwt-access-token",
      refresh: "mock-jwt-refresh-token"
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

  // Google OAuth 1-Click login simulation
  loginWithGoogle(email: string): boolean {
    const matched = (usersData as ActiveUser[]).find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );

    if (matched) {
      this.setUserSession(matched, {
        access: `mock-google-token-${matched.id}`,
        refresh: `mock-google-refresh-${matched.id}`
      });
      return true;
    }
    return false;
  }

  // Login with PIN 6-digit (Kasir & Fast POS switcher)
  loginWithPin(pin: string, branchId?: string): boolean {
    const matched = (usersData as ActiveUser[]).find((u) => {
      const pinMatch = u.pin === pin.trim();
      if (!pinMatch) return false;
      if (branchId && u.branchId !== branchId) return false;
      return true;
    });

    if (matched) {
      // Update branch if switched
      let branchName = matched.branchName;
      if (branchId) {
        const br = branchesData.find((b) => b.id === branchId);
        if (br) branchName = br.name;
      }

      this.setUserSession(
        { ...matched, branchId: branchId || matched.branchId, branchName },
        {
          access: `mock-pin-token-${matched.id}`,
          refresh: `mock-pin-refresh-${matched.id}`
        }
      );
      return true;
    }
    return false;
  }

  // Login with username/email & password/pin
  loginWithCredentials(
    identifier: string,
    secret: string,
    branchId?: string
  ): boolean {
    const idTrim = identifier.toLowerCase().trim();
    const secTrim = secret.trim();

    const matched = (usersData as ActiveUser[]).find(
      (u) =>
        (u.username.toLowerCase() === idTrim || u.email.toLowerCase() === idTrim) &&
        (u.pin === secTrim || secTrim === "password123" || secTrim === "123456")
    );

    if (matched) {
      let branchName = matched.branchName;
      if (branchId) {
        const br = branchesData.find((b) => b.id === branchId);
        if (br) branchName = br.name;
      }

      this.setUserSession(
        { ...matched, branchId: branchId || matched.branchId, branchName },
        {
          access: `mock-cred-token-${matched.id}`,
          refresh: `mock-cred-refresh-${matched.id}`
        }
      );
      return true;
    }
    return false;
  }

  switchBranch(branchId: string) {
    if (!this.user) return;
    const br = branchesData.find((b) => b.id === branchId);
    if (br) {
      this.user = {
        ...this.user,
        branchId: br.id,
        branchName: br.name
      };
      if (browser) {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(this.user));
      }
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
