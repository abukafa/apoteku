import { describe, expect, it } from "bun:test";
import {
  hasPermission,
  hasAnyPermission,
  canAccessRoute,
  canAccessApi,
  resolveEffectivePermissions,
  filterNavigationGroups,
  type UserRole,
  type PermissionKey
} from "../rbac/index.js";

describe("RBAC Engine - Core Permission Checks", () => {
  it("SUPERADMIN has wildcard access to all permissions", () => {
    expect(hasPermission("SUPERADMIN", "pos:access")).toBe(true);
    expect(hasPermission("SUPERADMIN", "finance:debt:pay")).toBe(true);
    expect(hasPermission("SUPERADMIN", "settings:users:manage")).toBe(true);
    expect(hasPermission("SUPERADMIN", "reports:sipnap:export")).toBe(true);
  });

  it("OWNER has comprehensive management permissions but limited to owner scope", () => {
    expect(hasPermission("OWNER", "dashboard:view")).toBe(true);
    expect(hasPermission("OWNER", "finance:read")).toBe(true);
    expect(hasPermission("OWNER", "reports:financial:view")).toBe(true);
    expect(hasPermission("OWNER", "settings:tenant:edit")).toBe(true);
  });

  it("PHARMACIST has clinical, drug stock, and SIPNAP permissions, but no cashflow manage", () => {
    expect(hasPermission("PHARMACIST", "prescription:read")).toBe(true);
    expect(hasPermission("PHARMACIST", "prescription:verify")).toBe(true);
    expect(hasPermission("PHARMACIST", "inventory:read")).toBe(true);
    expect(hasPermission("PHARMACIST", "reports:sipnap:export")).toBe(true);

    // Forbidden for Pharmacist:
    expect(hasPermission("PHARMACIST", "finance:read")).toBe(false);
    expect(hasPermission("PHARMACIST", "finance:debt:pay")).toBe(false);
    expect(hasPermission("PHARMACIST", "settings:tenant:edit")).toBe(false);
  });

  it("CASHIER has POS and sales checkout permissions, but no managerial access", () => {
    expect(hasPermission("CASHIER", "pos:access")).toBe(true);
    expect(hasPermission("CASHIER", "pos:checkout")).toBe(true);
    expect(hasPermission("CASHIER", "pos:shift:close")).toBe(true);
    expect(hasPermission("CASHIER", "sales:read")).toBe(true);

    // Forbidden for Cashier:
    expect(hasPermission("CASHIER", "dashboard:view")).toBe(false);
    expect(hasPermission("CASHIER", "inventory:adjust")).toBe(false);
    expect(hasPermission("CASHIER", "finance:read")).toBe(false);
    expect(hasPermission("CASHIER", "reports:view")).toBe(false);
    expect(hasPermission("CASHIER", "settings:tenant:edit")).toBe(false);
    expect(hasPermission("CASHIER", "settings:users:manage")).toBe(false);

    // Allowed for Cashier: Profil & PIN Saya
    expect(hasPermission("CASHIER", "settings:view")).toBe(true);
  });

  it("INVENTORY has logistics, warehouse, and supplier order permissions", () => {
    expect(hasPermission("INVENTORY", "inventory:read")).toBe(true);
    expect(hasPermission("INVENTORY", "inventory:adjust")).toBe(true);
    expect(hasPermission("INVENTORY", "inventory:transfer")).toBe(true);
    expect(hasPermission("INVENTORY", "purchase:read")).toBe(true);

    // Forbidden for Inventory:
    expect(hasPermission("INVENTORY", "pos:access")).toBe(false);
    expect(hasPermission("INVENTORY", "finance:debt:pay")).toBe(false);
    expect(hasPermission("INVENTORY", "prescription:compound")).toBe(false);
  });

  it("FINANCE has debt settlement, receivables, and financial reports permissions", () => {
    expect(hasPermission("FINANCE", "finance:read")).toBe(true);
    expect(hasPermission("FINANCE", "finance:debt:pay")).toBe(true);
    expect(hasPermission("FINANCE", "finance:receivable:collect")).toBe(true);
    expect(hasPermission("FINANCE", "reports:financial:view")).toBe(true);

    // Forbidden for Finance:
    expect(hasPermission("FINANCE", "pos:access")).toBe(false);
    expect(hasPermission("FINANCE", "inventory:adjust")).toBe(false);
    expect(hasPermission("FINANCE", "prescription:compound")).toBe(false);
  });

  it("GUEST has only profile settings view permission", () => {
    expect(hasPermission("GUEST", "settings:view")).toBe(true);
    expect(hasPermission("GUEST", "pos:access")).toBe(false);
    expect(hasPermission("GUEST", "dashboard:view")).toBe(false);
    expect(hasPermission("GUEST", "sales:read")).toBe(false);
  });

  it("respects custom user permissions override", () => {
    // Regular Cashier normally cannot do inventory:adjust
    expect(hasPermission("CASHIER", "inventory:adjust")).toBe(false);

    // Cashier with special override
    expect(hasPermission("CASHIER", "inventory:adjust", ["inventory:adjust"])).toBe(true);

    // Cashier granted prescription:read
    expect(hasPermission("CASHIER", "prescription:read", ["prescription:read"])).toBe(true);
    expect(canAccessRoute("CASHIER", "/pelayanan", ["prescription:read"]).allowed).toBe(true);
    expect(canAccessApi("CASHIER", "/api/prescriptions", "GET", ["prescription:read"]).allowed).toBe(true);
  });

  it("resolves effective permissions by combining role defaults with custom permissions", () => {
    const cashierPerms = resolveEffectivePermissions("CASHIER", ["prescription:read", "prescription:verify"]);
    expect(cashierPerms).toContain("pos:access");
    expect(cashierPerms).toContain("sales:read");
    expect(cashierPerms).toContain("prescription:read");
    expect(cashierPerms).toContain("prescription:verify");

    const superPerms = resolveEffectivePermissions("SUPERADMIN", []);
    expect(superPerms).toEqual(["*"]);
  });
});

describe("RBAC Engine - Web Route Access Control", () => {
  it("allows CASHIER to access /pos, /penjualan, /retur, and /pengaturan for profile", () => {
    expect(canAccessRoute("CASHIER", "/pos").allowed).toBe(true);
    expect(canAccessRoute("CASHIER", "/penjualan").allowed).toBe(true);
    expect(canAccessRoute("CASHIER", "/retur").allowed).toBe(true);
    expect(canAccessRoute("CASHIER", "/pengaturan").allowed).toBe(true);
  });

  it("redirects CASHIER away from managerial routes to /pos", () => {
    const dashCheck = canAccessRoute("CASHIER", "/");
    expect(dashCheck.allowed).toBe(false);
    expect(dashCheck.redirectTo).toBe("/pos");

    const financeCheck = canAccessRoute("CASHIER", "/keuangan");
    expect(financeCheck.allowed).toBe(false);
    expect(financeCheck.redirectTo).toBe("/pos");

    const reportCheck = canAccessRoute("CASHIER", "/laporan");
    expect(reportCheck.allowed).toBe(false);
    expect(reportCheck.redirectTo).toBe("/pos");

    const supplierCheck = canAccessRoute("CASHIER", "/supplier");
    expect(supplierCheck.allowed).toBe(false);
    expect(supplierCheck.redirectTo).toBe("/pos");
  });

  it("allows PHARMACIST to access /pelayanan, /stok, /laporan, but not /keuangan", () => {
    expect(canAccessRoute("PHARMACIST", "/pelayanan").allowed).toBe(true);
    expect(canAccessRoute("PHARMACIST", "/stok").allowed).toBe(true);
    expect(canAccessRoute("PHARMACIST", "/laporan").allowed).toBe(true);
    expect(canAccessRoute("PHARMACIST", "/").allowed).toBe(true);

    const finCheck = canAccessRoute("PHARMACIST", "/keuangan");
    expect(finCheck.allowed).toBe(false);
    expect(finCheck.redirectTo).toBe("/");
  });

  it("allows FINANCE to access /keuangan and /pelanggan, but redirects from /pos", () => {
    expect(canAccessRoute("FINANCE", "/keuangan").allowed).toBe(true);
    expect(canAccessRoute("FINANCE", "/pelanggan").allowed).toBe(true);

    const posCheck = canAccessRoute("FINANCE", "/pos");
    expect(posCheck.allowed).toBe(false);
    expect(posCheck.redirectTo).toBe("/keuangan");
  });

  it("restricts GUEST strictly to /pengaturan", () => {
    expect(canAccessRoute("GUEST", "/pengaturan?tab=profil").allowed).toBe(true);
    expect(canAccessRoute("GUEST", "/pos").allowed).toBe(false);
    expect(canAccessRoute("GUEST", "/").allowed).toBe(false);
    expect(canAccessRoute("GUEST", "/").redirectTo).toBe("/pengaturan?tab=profil");
  });
});

describe("RBAC Engine - API Access Control", () => {
  it("allows public endpoints for any role or unauthenticated callers", () => {
    expect(canAccessApi("GUEST", "/health", "GET").allowed).toBe(true);
    expect(canAccessApi("GUEST", "/auth/login", "POST").allowed).toBe(true);
    expect(canAccessApi("CASHIER", "/swagger", "GET").allowed).toBe(true);
  });

  it("allows CASHIER to sync sales and close shifts, but blocks debt payments", () => {
    expect(canAccessApi("CASHIER", "/pos/sync-sales", "POST").allowed).toBe(true);
    expect(canAccessApi("CASHIER", "/shifts/close", "POST").allowed).toBe(true);

    const debtPayCheck = canAccessApi("CASHIER", "/finance/debt/pay", "POST");
    expect(debtPayCheck.allowed).toBe(false);
    expect(debtPayCheck.requiredPermission).toBe("finance:debt:pay");

    const sipnapCheck = canAccessApi("CASHIER", "/reports/sipnap", "GET");
    expect(sipnapCheck.allowed).toBe(false);
    expect(sipnapCheck.requiredPermission).toBe("reports:sipnap:export");
  });

  it("allows PHARMACIST to manage prescriptions and SIPNAP, but blocks finance debt payment", () => {
    expect(canAccessApi("PHARMACIST", "/prescriptions", "POST").allowed).toBe(true);
    expect(canAccessApi("PHARMACIST", "/reports/sipnap", "GET").allowed).toBe(true);

    expect(canAccessApi("PHARMACIST", "/finance/debt/pay", "POST").allowed).toBe(false);
  });

  it("allows FINANCE to process debt payments", () => {
    expect(canAccessApi("FINANCE", "/finance/debt/pay", "POST").allowed).toBe(true);
    expect(canAccessApi("FINANCE", "/finance/cashflow", "POST").allowed).toBe(true);
    expect(canAccessApi("FINANCE", "/shifts/open", "POST").allowed).toBe(false);
  });

  it("handles custom delegation for stock and opname accurately", () => {
    // CASHIER dengan custom izin inventory:read saja
    const cashierRead = canAccessRoute("CASHIER", "/stok", ["inventory:read"]);
    expect(cashierRead.allowed).toBe(true);

    // CASHIER dengan custom izin inventory:read saja TIDAK BISA submit opname
    const opnameBlocked = canAccessApi("CASHIER", "/inventory/opname", "POST", ["inventory:read"]);
    expect(opnameBlocked.allowed).toBe(false);
    expect(opnameBlocked.requiredPermission).toBe("inventory:opname");

    // CASHIER dengan tambahan custom izin inventory:opname BISA submit opname
    const opnameAllowed = canAccessApi("CASHIER", "/inventory/opname", "POST", [
      "inventory:read",
      "inventory:opname"
    ]);
    expect(opnameAllowed.allowed).toBe(true);

    // Saat izin inventory:opname dicabut (uncheck), akses opname kembali ditolak
    const opnameRevoked = canAccessApi("CASHIER", "/inventory/opname", "POST", ["inventory:read"]);
    expect(opnameRevoked.allowed).toBe(false);
    expect(opnameRevoked.requiredPermission).toBe("inventory:opname");
  });

  it("enforces granular report permissions (reports:sales, reports:inventory, reports:financial, reports:sipnap)", () => {
    // Financial report: blocked for Pharmacist & Cashier, allowed for Finance & Owner
    const pharmFin = canAccessApi("PHARMACIST", "/reports/financial", "GET");
    expect(pharmFin.allowed).toBe(false);
    expect(pharmFin.requiredPermission).toBe("reports:financial:view");

    const cashFin = canAccessApi("CASHIER", "/reports/financial", "GET");
    expect(cashFin.allowed).toBe(false);

    const finFin = canAccessApi("FINANCE", "/reports/financial", "GET");
    expect(finFin.allowed).toBe(true);

    const ownerFin = canAccessApi("OWNER", "/reports/financial", "GET");
    expect(ownerFin.allowed).toBe(true);

    // Sales shift report: allowed for Pharmacist & Finance, blocked for Cashier & Inventory
    expect(canAccessApi("PHARMACIST", "/reports/sales-shifts", "GET").allowed).toBe(true);
    expect(canAccessApi("FINANCE", "/reports/sales-shifts", "GET").allowed).toBe(true);
    expect(canAccessApi("CASHIER", "/reports/sales-shifts", "GET").allowed).toBe(false);
    expect(canAccessApi("INVENTORY", "/reports/sales-shifts", "GET").allowed).toBe(false);

    // Pareto inventory analysis: allowed for Inventory, Pharmacist & Owner, blocked for Cashier
    expect(canAccessApi("INVENTORY", "/reports/pareto", "GET").allowed).toBe(true);
    expect(canAccessApi("PHARMACIST", "/reports/pareto", "GET").allowed).toBe(true);
    expect(canAccessApi("CASHIER", "/reports/pareto", "GET").allowed).toBe(false);

    // SIPNAP export: allowed for Pharmacist & Owner, blocked for Finance & Cashier
    expect(canAccessApi("PHARMACIST", "/reports/sipnap", "GET").allowed).toBe(true);
    expect(canAccessApi("FINANCE", "/reports/sipnap", "GET").allowed).toBe(false);
    expect(canAccessApi("CASHIER", "/reports/sipnap", "GET").allowed).toBe(false);
  });

  it("enforces tenant, organization, and staff management permissions (settings:tenant:edit, settings:users:manage)", () => {
    // User management: blocked for Cashier, Pharmacist, and Finance
    const cashUserGet = canAccessApi("CASHIER", "/users", "GET");
    expect(cashUserGet.allowed).toBe(false);
    expect(cashUserGet.requiredPermission).toBe("settings:users:manage");

    const pharmUserPost = canAccessApi("PHARMACIST", "/users", "POST");
    expect(pharmUserPost.allowed).toBe(false);
    expect(pharmUserPost.requiredPermission).toBe("settings:users:manage");

    const ownerUserPost = canAccessApi("OWNER", "/users", "POST");
    expect(ownerUserPost.allowed).toBe(true);

    // Tenant & Branch management: blocked for staff, allowed for Owner & Superadmin
    const pharmTenantPut = canAccessApi("PHARMACIST", "/tenant", "PUT");
    expect(pharmTenantPut.allowed).toBe(false);
    expect(pharmTenantPut.requiredPermission).toBe("settings:tenant:edit");

    const cashBranchPost = canAccessApi("CASHIER", "/branches", "POST");
    expect(cashBranchPost.allowed).toBe(false);
    expect(cashBranchPost.requiredPermission).toBe("settings:tenant:edit");

    const ownerTenantPut = canAccessApi("OWNER", "/tenant", "PUT");
    expect(ownerTenantPut.allowed).toBe(true);

    const ownerBranchPost = canAccessApi("OWNER", "/branches", "POST");
    expect(ownerBranchPost.allowed).toBe(true);
  });
});

describe("RBAC Engine - Navigation Menu Filtering", () => {
  const sampleMenuGroups = [
    {
      title: "OPERASIONAL",
      items: [
        { name: "Kasir POS", href: "/pos", permission: "pos:access" as PermissionKey },
        { name: "Riwayat Penjualan", href: "/penjualan", permission: "sales:read" as PermissionKey },
        { name: "Pelayanan Resep", href: "/pelayanan", permission: "prescription:read" as PermissionKey },
        { name: "Stok Obat", href: "/stok", permission: "inventory:read" as PermissionKey }
      ]
    },
    {
      title: "MANAJEMEN",
      items: [
        { name: "Dashboard", href: "/", permission: "dashboard:view" as PermissionKey },
        { name: "Keuangan", href: "/keuangan", permission: "finance:read" as PermissionKey },
        { name: "Laporan", href: "/laporan", permission: "reports:view" as PermissionKey },
        { name: "Pengaturan Sistem", href: "/pengaturan", permission: "settings:tenant:edit" as PermissionKey }
      ]
    }
  ];

  it("filters menu groups for CASHIER: hides Pelayanan, Stok, and entire MANAJEMEN group", () => {
    const cashierGroups = filterNavigationGroups("CASHIER", sampleMenuGroups);
    expect(cashierGroups.length).toBe(1);
    expect(cashierGroups[0].title).toBe("OPERASIONAL");
    expect(cashierGroups[0].items.map((i) => i.name)).toEqual(["Kasir POS", "Riwayat Penjualan"]);
  });

  it("filters menu groups for PHARMACIST: displays Operasional and Laporan, hides Keuangan & Pengaturan Sistem", () => {
    const pharmacistGroups = filterNavigationGroups("PHARMACIST", sampleMenuGroups);
    expect(pharmacistGroups.length).toBe(2);

    const operasional = pharmacistGroups.find((g) => g.title === "OPERASIONAL");
    expect(operasional?.items.map((i) => i.name)).toEqual([
      "Kasir POS",
      "Riwayat Penjualan",
      "Pelayanan Resep",
      "Stok Obat"
    ]);

    const manajemen = pharmacistGroups.find((g) => g.title === "MANAJEMEN");
    expect(manajemen?.items.map((i) => i.name)).toEqual(["Dashboard", "Laporan"]);
  });

  it("keeps all menu groups for SUPERADMIN", () => {
    const adminGroups = filterNavigationGroups("SUPERADMIN", sampleMenuGroups);
    expect(adminGroups.length).toBe(2);
    expect(adminGroups[0].items.length).toBe(4);
    expect(adminGroups[1].items.length).toBe(4);
  });
});
