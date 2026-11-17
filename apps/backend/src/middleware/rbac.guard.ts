import { Elysia } from "elysia";
import { canAccessApi, isValidRole, type UserRole } from "@apoteku/core";

/**
 * Middleware RBAC Guard Global untuk API Server Elysia.js
 * Memeriksa kesesuaian peran pengguna (x-user-role) terhadap aturan API di @apoteku/core.
 */
export const rbacGuard = new Elysia({ name: "rbac-guard" })
  .derive(({ headers }) => {
    const rawRole = (headers["x-user-role"] || "").toUpperCase();
    const role: UserRole = isValidRole(rawRole) ? (rawRole as UserRole) : "GUEST";
    return {
      currentUserRole: role
    };
  })
  .onBeforeHandle(({ currentUserRole, request, set }) => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    const access = canAccessApi(currentUserRole, pathname, method);
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
