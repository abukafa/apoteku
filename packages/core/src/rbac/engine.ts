import type { UserRole } from "./roles.js";
import type { PermissionKey } from "./permissions.js";
import { ROLE_PERMISSIONS } from "./matrix.js";
import { ROUTE_ACCESS_RULES, ROLE_DEFAULT_ROUTES } from "./route-rules.js";
import { API_ACCESS_RULES, PUBLIC_API_PREFIXES } from "./api-rules.js";

export interface RouteAccessResult {
  allowed: boolean;
  redirectTo?: string;
  requiredPermission?: PermissionKey;
  reason?: string;
}

export interface ApiAccessResult {
  allowed: boolean;
  requiredPermission?: PermissionKey;
  reason?: string;
}

/**
 * Mengecek apakah suatu peran (atau user dengan customPermissions) memiliki izin tertentu.
 */
export function hasPermission(
  role: UserRole,
  permission: PermissionKey,
  customPermissions?: string[] | null
): boolean {
  if (role === "SUPERADMIN") return true;
  if (permission === "*") return true;

  // Cek custom override permissions (jika ada di user profile)
  if (customPermissions && Array.isArray(customPermissions)) {
    if (customPermissions.includes("*")) return true;
    if (customPermissions.includes(permission)) return true;
  }

  // Cek matrix bawaan role
  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;
  if (rolePerms.includes("*")) return true;
  return rolePerms.includes(permission);
}

/**
 * Mengecek apakah suatu peran memiliki setidaknya salah satu dari daftar izin yang diberikan.
 */
export function hasAnyPermission(
  role: UserRole,
  permissions: PermissionKey[],
  customPermissions?: string[] | null
): boolean {
  return permissions.some((p) => hasPermission(role, p, customPermissions));
}

/**
 * Menggabungkan hak akses default bawaan peran dengan izin kustom pengguna (customPermissions).
 */
export function resolveEffectivePermissions(
  role: UserRole,
  customPermissions?: string[] | null
): string[] {
  if (role === "SUPERADMIN") return ["*"];
  const roleDefaultPerms = (ROLE_PERMISSIONS[role] || []) as string[];
  const customUserPerms = (customPermissions || []) as string[];
  if (roleDefaultPerms.includes("*") || customUserPerms.includes("*")) {
    return ["*"];
  }
  return Array.from(new Set([...roleDefaultPerms, ...customUserPerms]));
}

/**
 * Mengecek hak akses ke rute URL halaman web.
 */
export function canAccessRoute(
  role: UserRole,
  pathname: string,
  customPermissions?: string[] | null
): RouteAccessResult {
  if (role === "SUPERADMIN") return { allowed: true };

  // Khusus Guest: hanya diizinkan di /pengaturan
  if (role === "GUEST") {
    if (pathname.startsWith("/pengaturan")) {
      return { allowed: true };
    }
    return {
      allowed: false,
      redirectTo: ROLE_DEFAULT_ROUTES.GUEST,
      reason: "Pengguna berstatus Tamu hanya dapat mengakses pengaturan profil."
    };
  }

  // Cari aturan rute yang cocok (prioritaskan rute spesifik terlebih dahulu)
  const sortedRules = [...ROUTE_ACCESS_RULES].sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);

  for (const rule of sortedRules) {
    const isMatch = rule.exact
      ? pathname === rule.pathPrefix
      : pathname === rule.pathPrefix || pathname.startsWith(rule.pathPrefix + "/") || pathname.startsWith(rule.pathPrefix + "?");

    if (isMatch) {
      const allowed = hasPermission(role, rule.requiredPermission, customPermissions);
      if (!allowed) {
        return {
          allowed: false,
          redirectTo: ROLE_DEFAULT_ROUTES[role] || "/",
          requiredPermission: rule.requiredPermission,
          reason: `Peran '${role}' tidak memiliki izin '${rule.requiredPermission}' untuk rute '${rule.pathPrefix}'`
        };
      }
      return { allowed: true, requiredPermission: rule.requiredPermission };
    }
  }

  // Jika tidak ada aturan rute spesifik yang membatasi, izinkan akses
  return { allowed: true };
}

/**
 * Mengecek hak akses ke endpoint API backend.
 */
export function canAccessApi(
  role: UserRole,
  pathname: string,
  method: string = "GET",
  customPermissions?: string[] | null
): ApiAccessResult {
  if (role === "SUPERADMIN") return { allowed: true };

  const normPath = pathname.startsWith("/api") ? pathname.slice(4) || "/" : pathname;

  // 1. Cek endpoint publik yang di-whitelist
  const isPublic = PUBLIC_API_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(prefix + "/") ||
      normPath === prefix ||
      normPath.startsWith(prefix + "/")
  );
  if (isPublic) return { allowed: true };

  const normMethod = method.toUpperCase();

  // 2. Cari aturan API yang cocok (paling spesifik path & kecocokan method)
  const candidateRules = API_ACCESS_RULES.filter((rule) => {
    const pathMatch =
      pathname === rule.pathPrefix ||
      pathname.startsWith(rule.pathPrefix + "/") ||
      normPath === rule.pathPrefix ||
      normPath.startsWith(rule.pathPrefix + "/");
    if (!pathMatch) return false;
    if (rule.method && rule.method.toUpperCase() !== normMethod) return false;
    return true;
  });

  if (candidateRules.length > 0) {
    // Urutkan berdasarkan spesifisitas (aturan dengan method spesifik didahulukan)
    candidateRules.sort((a, b) => {
      const aMethodScore = a.method ? 2 : 1;
      const bMethodScore = b.method ? 2 : 1;
      if (aMethodScore !== bMethodScore) return bMethodScore - aMethodScore;
      return b.pathPrefix.length - a.pathPrefix.length;
    });

    const rule = candidateRules[0];
    const allowed = hasPermission(role, rule.requiredPermission, customPermissions);
    if (!allowed) {
      return {
        allowed: false,
        requiredPermission: rule.requiredPermission,
        reason: `Peran '${role}' tidak memiliki hak akses '${rule.requiredPermission}' untuk endpoint [${normMethod}] ${pathname}`
      };
    }
    return { allowed: true, requiredPermission: rule.requiredPermission };
  }

  // Jika tidak ada aturan spesifik yang memblokir, izinkan secara default
  return { allowed: true };
}

/**
 * Filter grup menu navigasi Sidebar secara dinamis berdasarkan wewenang pengguna.
 */
export function filterNavigationGroups<
  TItem extends { href?: string; permission?: PermissionKey },
  TGroup extends { items: TItem[] }
>(
  role: UserRole,
  groups: TGroup[],
  customPermissions?: string[] | null
): TGroup[] {
  return groups
    .map((group) => {
      const filteredItems = group.items.filter((item) => {
        if (item.permission) {
          return hasPermission(role, item.permission, customPermissions);
        }
        if (item.href) {
          return canAccessRoute(role, item.href, customPermissions).allowed;
        }
        return true;
      });

      return {
        ...group,
        items: filteredItems
      };
    })
    .filter((group) => group.items.length > 0);
}
