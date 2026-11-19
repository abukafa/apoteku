import { Elysia } from "elysia";
import { canAccessApi, isValidRole, type UserRole } from "@apoteku/core";
import { db, schema } from "@apoteku/db";
import { eq } from "drizzle-orm";

const userPermsCache = new Map<string, { perms: string[]; ts: number }>();
const CACHE_TTL_MS = 30000; // 30 detik

export function invalidateUserPermsCache(userId?: string) {
  if (userId) {
    userPermsCache.delete(userId);
  } else {
    userPermsCache.clear();
  }
}

/**
 * Middleware RBAC Guard Global untuk API Server Elysia.js
 * Memeriksa kesesuaian peran pengguna (x-user-role) & izin kustom terhadap aturan API di @apoteku/core.
 */
export const rbacGuard = new Elysia({ name: "rbac-guard" })
  .derive({ as: "global" }, ({ headers }) => {
    const rawRole = (headers["x-user-role"] || "").toUpperCase();
    const role: UserRole = isValidRole(rawRole) ? (rawRole as UserRole) : "GUEST";
    const userId = headers["x-user-id"] as string | undefined;

    let customPermissions: string[] = [];
    const rawCustom = headers["x-custom-permissions"];
    if (rawCustom && typeof rawCustom === "string") {
      try {
        const parsed = JSON.parse(rawCustom);
        if (Array.isArray(parsed) && parsed.length > 0) {
          customPermissions = parsed;
        }
      } catch (_) {}
    }

    return {
      currentUserRole: role,
      currentUserId: userId,
      currentUserPermissions: customPermissions
    };
  })
  .onBeforeHandle({ as: "global" }, async ({ currentUserRole, currentUserId, currentUserPermissions, request, set }) => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    let perms: string[] = [];

    // Jika bukan SUPERADMIN dan ada currentUserId, ambil izin kustom yang valid dari cache/DB (Database sebagai Source of Truth)
    if (currentUserRole !== "SUPERADMIN") {
      const normPath = pathname.startsWith("/api") ? pathname.slice(4) || "/" : pathname;
      const isPublic =
        pathname === "/health" ||
        pathname.startsWith("/health/") ||
        pathname === "/auth" ||
        pathname.startsWith("/auth/") ||
        normPath === "/health" ||
        normPath.startsWith("/health/") ||
        normPath === "/auth" ||
        normPath.startsWith("/auth/");

      if (!isPublic && currentUserId) {
        const cached = userPermsCache.get(currentUserId);
        const now = Date.now();
        if (cached && now - cached.ts < CACHE_TTL_MS) {
          perms = cached.perms;
        } else {
          try {
            const [u] = await db
              .select({ customPermissions: schema.users.customPermissions })
              .from(schema.users)
              .where(eq(schema.users.id, currentUserId))
              .limit(1);
            if (u && Array.isArray(u.customPermissions)) {
              perms = u.customPermissions as string[];
              userPermsCache.set(currentUserId, { perms, ts: now });
            }
          } catch (_) {}
        }
      }
    }

    const access = canAccessApi(currentUserRole, pathname, method, perms);
    if (!access.allowed) {
      set.status = 403;
      return {
        success: false,
        error: "FORBIDDEN",
        message: access.reason || `Akses ditolak: Peran '${currentUserRole}' tidak memiliki wewenang untuk tindakan ini.`,
        requiredPermission: access.requiredPermission
      };
    }
  });
