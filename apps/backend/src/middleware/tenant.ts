import { Elysia } from "elysia";

export interface TenantContext {
  tenantId: string;
  branchId: string;
  userId: string;
}

export const tenantMiddleware = new Elysia({ name: "tenant-context" }).derive(
  ({ headers }) => {
    // Default tenant & branch IDs for local or fallback context
    const tenantId =
      (headers["x-tenant-id"] as string) ||
      "01931818-8000-7000-8000-000000000001";
    const rawBranchId = headers["x-branch-id"] as string;
    const branchId =
      rawBranchId && rawBranchId !== "ALL"
        ? rawBranchId
        : "01931818-8000-7000-8000-000000000002";
    const userId =
      (headers["x-user-id"] as string) ||
      "01931818-8000-7000-8000-000000000003";

    return {
      tenant: {
        tenantId,
        branchId,
        userId
      }
    };
  }
);
