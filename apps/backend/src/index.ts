import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { staticPlugin } from "@elysiajs/static";
import { existsSync, mkdirSync } from "node:fs";
import { posRoutes } from "./modules/pos/pos.routes.js";
import { mediaRoutes } from "./modules/media/media.routes.js";
import { erpRoutes } from "./modules/erp/erp.routes.js";
import { shiftRoutes } from "./modules/shift/shift.routes.js";
import { prescriptionRoutes } from "./modules/prescription/prescription.routes.js";
import { transferRoutes } from "./modules/inventory/transfer.routes.js";
import { financeRoutes } from "./modules/finance/finance.routes.js";
import { returnsRoutes } from "./modules/returns/returns.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { reportsRoutes } from "./modules/reports/reports.routes.js";

const PORT = Number(process.env.PORT || 3001);

// Ensure uploads folder exists before staticPlugin mounts
if (!existsSync("uploads")) {
  mkdirSync("uploads", { recursive: true });
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
        "x-user-id"
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
      assets: "uploads",
      prefix: "/uploads"
    })
  )
  .get("/health", () => ({
    status: "ok",
    service: "apoteku-backend",
    engine: "Bun + Elysia.js",
    timestamp: new Date().toISOString()
  }))
  .use(posRoutes)
  .use(mediaRoutes)
  .use(erpRoutes)
  .use(shiftRoutes)
  .use(prescriptionRoutes)
  .use(transferRoutes)
  .use(financeRoutes)
  .use(returnsRoutes)
  .use(authRoutes)
  .use(reportsRoutes)
  .listen(PORT, ({ hostname, port }) => {
    console.log(`🚀 [Apoteku Backend] Server running at http://${hostname}:${port}`);
    console.log(`📚 [Swagger Docs] Available at http://${hostname}:${port}/swagger`);
  });

export type App = typeof app;
