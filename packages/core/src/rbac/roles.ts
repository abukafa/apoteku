export type UserRole =
  | "SUPERADMIN"
  | "OWNER"
  | "PHARMACIST"
  | "CASHIER"
  | "INVENTORY"
  | "FINANCE"
  | "GUEST";

export const ALL_ROLES: UserRole[] = [
  "SUPERADMIN",
  "OWNER",
  "PHARMACIST",
  "CASHIER",
  "INVENTORY",
  "FINANCE",
  "GUEST"
];

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPERADMIN: "Super Administrator",
  OWNER: "Pemilik Apotek (Owner)",
  PHARMACIST: "Apoteker (APA / TTK)",
  CASHIER: "Kasir Operasional",
  INVENTORY: "Staf Logistik & Gudang",
  FINANCE: "Staf Keuangan & Kas",
  GUEST: "Tamu (Akses Terbatas)"
};

export function isValidRole(role: string): role is UserRole {
  return ALL_ROLES.includes(role as UserRole);
}
