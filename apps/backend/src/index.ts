import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { staticPlugin } from "@elysiajs/static";
import { existsSync, mkdirSync } from "node:fs";
import { queryClient } from "@apoteku/db/client";
import { posRoutes } from "./modules/pos/pos.routes.js";
import { mediaRoutes, UPLOADS_ROOT } from "./modules/media/media.routes.js";
import { erpRoutes } from "./modules/erp/erp.routes.js";
import { shiftRoutes } from "./modules/shift/shift.routes.js";
import { prescriptionRoutes } from "./modules/prescription/prescription.routes.js";
import { transferRoutes } from "./modules/inventory/transfer.routes.js";
import { opnameRoutes } from "./modules/inventory/opname.routes.js";
import { financeRoutes } from "./modules/finance/finance.routes.js";
import { returnsRoutes } from "./modules/returns/returns.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { reportsRoutes } from "./modules/reports/reports.routes.js";
import { notificationRoutes } from "./modules/notifications/notification.routes.js";
import { rbacGuard } from "./middleware/rbac.guard.js";

const PORT = Number(process.env.PORT || 3001);

// Ensure uploads folder exists before staticPlugin mounts
if (!existsSync(UPLOADS_ROOT)) {
  mkdirSync(UPLOADS_ROOT, { recursive: true });
}

export const app = new Elysia()
  .use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-tenant-id",
        "x-branch-id",
        "x-user-id",
        "x-user-role"
      ]
    })
  )
  .use(
    swagger({
      path: "/swagger",
      documentation: {
        info: {
          title: "Apoteku Backend Engine API",
          version: "1.0.0",
          description:
            "High-Performance Pharmacy ERP & POS Sync Engine (Bun + Elysia + Drizzle PostgreSQL)"
        }
      }
    })
  )
  .use(
    staticPlugin({
      assets: UPLOADS_ROOT,
      prefix: "/uploads"
    })
  )
  .get("/health", async () => {
    let dbStatus: "connected" | "disconnected" = "disconnected";
    try {
      await queryClient`SELECT 1`;
      dbStatus = "connected";
    } catch {
      dbStatus = "disconnected";
    }

    return {
      status: "ok",
      db: dbStatus,
      service: "apoteku-backend",
      engine: "Bun + Elysia.js",
      timestamp: new Date().toISOString()
    };
  })
  .use(rbacGuard)
  .use(posRoutes)
  .use(mediaRoutes)
  .use(erpRoutes)
  .use(shiftRoutes)
  .use(prescriptionRoutes)
  .use(transferRoutes)
  .use(opnameRoutes)
  .use(financeRoutes)
  .use(returnsRoutes)
  .use(authRoutes)
  .use(reportsRoutes)
  .use(notificationRoutes)
  .listen(PORT, ({ hostname, port }) => {
    console.log(`🚀 [Apoteku Backend] Server running at http://${hostname}:${port}`);
    console.log(`📚 [Swagger Docs] Available at http://${hostname}:${port}/swagger`);
  });

export type App = typeof app;
