import { Elysia, t } from "elysia";
import { db, schema } from "@apoteku/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export const opnameRoutes = new Elysia({ prefix: "/api/inventory" })
  .derive(({ headers }) => {
    const tenantId = (headers["x-tenant-id"] as string) || undefined;
    const branchId = (headers["x-branch-id"] as string) || undefined;
    const userId = (headers["x-user-id"] as string) || undefined;
    return { tenantId, branchId, userId };
  })

  // 1. GET OPNAME HISTORY
  .get("/opname", async ({ query, branchId }) => {
    try {
      const targetBranch = query.branch_id || branchId;
      const limit = query.limit ? Number(query.limit) : 100;

      let conditions = [];
      if (targetBranch && targetBranch !== "ALL") {
        conditions.push(eq(schema.stockAdjustments.branchId, targetBranch));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const adjustments = await db
        .select({
          id: schema.stockAdjustments.id,
          adjustmentNumber: schema.stockAdjustments.adjustmentNumber,
          adjustmentDate: schema.stockAdjustments.adjustmentDate,
          reason: schema.stockAdjustments.reason,
          status: schema.stockAdjustments.status,
          branchId: schema.stockAdjustments.branchId,
          branchName: schema.branches.name,
          createdAt: schema.stockAdjustments.createdAt
        })
        .from(schema.stockAdjustments)
        .leftJoin(schema.branches, eq(schema.stockAdjustments.branchId, schema.branches.id))
        .where(whereClause)
        .orderBy(desc(schema.stockAdjustments.createdAt))
        .limit(limit);

      if (adjustments.length === 0) return { success: true, data: [] };

      const adjIds = adjustments.map((a) => a.id);

      const items = await db
        .select({
          id: schema.stockAdjustmentItems.id,
          adjustmentId: schema.stockAdjustmentItems.adjustmentId,
          lineNo: schema.stockAdjustmentItems.lineNo,
          productId: schema.stockAdjustmentItems.productId,
          productName: schema.products.name,
          sku: schema.products.sku,
          unit: schema.products.baseUnit,
          batchId: schema.stockAdjustmentItems.batchId,
          batchNumber: schema.productBatches.batchNo,
          systemQty: schema.stockAdjustmentItems.systemQtyBase,
          actualQty: schema.stockAdjustmentItems.actualQtyBase,
          differenceQty: schema.stockAdjustmentItems.differenceQtyBase,
          costPerUnit: schema.stockAdjustmentItems.costPerUnit,
          notes: schema.stockAdjustmentItems.notes
        })
        .from(schema.stockAdjustmentItems)
        .leftJoin(schema.products, eq(schema.stockAdjustmentItems.productId, schema.products.id))
        .leftJoin(schema.productBatches, eq(schema.stockAdjustmentItems.batchId, schema.productBatches.id))
        .where(inArray(schema.stockAdjustmentItems.adjustmentId, adjIds))
        .orderBy(schema.stockAdjustmentItems.lineNo);

      const itemsByAdjId = new Map<string, any[]>();
      for (const it of items) {
        const arr = itemsByAdjId.get(it.adjustmentId) || [];
        arr.push({
          id: it.id,
          productId: it.productId,
          productName: it.productName || "Obat",
          sku: it.sku || "-",
          unit: it.unit || "TABLET",
          batchId: it.batchId,
          batchNumber: it.batchNumber || "-",
          systemQty: Number(it.systemQty),
          actualQty: Number(it.actualQty),
          differenceQty: Number(it.differenceQty),
          costPerUnit: Number(it.costPerUnit),
          valueDifference: Number(it.differenceQty) * Number(it.costPerUnit),
          notes: it.notes || ""
        });
        itemsByAdjId.set(it.adjustmentId, arr);
      }

      return {
        success: true,
        data: adjustments.map((a) => ({
          id: a.id,
          docNumber: a.adjustmentNumber,
          date: a.adjustmentDate,
          branchId: a.branchId,
          branchName: a.branchName || "Cabang",
          reason: a.reason,
          status: a.status,
          items: itemsByAdjId.get(a.id) || []
        }))
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 2. RECORD STOCK OPNAME & AUTO-UPDATE STOCKS & STOCK LEDGER
  .post("/opname", async ({ body, tenantId: headerTenantId, branchId: headerBranchId, userId }: { body: any; tenantId?: string; branchId?: string; userId?: string }) => {
    try {
      const isUuid = (val?: string) =>
        Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

      // 1. Resolve Tenant
      let tenantId = isUuid(headerTenantId) ? headerTenantId : undefined;
      if (!tenantId) {
        const [t] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
        if (!t) throw new Error("Tenant aktif tidak ditemukan");
        tenantId = t.id;
      }

      // 2. Resolve Branch
      let branchId = isUuid(body.branchId) ? body.branchId : headerBranchId;
      if (!branchId) {
        const [b] = await db.select({ id: schema.branches.id }).from(schema.branches).where(eq(schema.branches.tenantId, tenantId)).limit(1);
        branchId = b ? b.id : crypto.randomUUID();
      }

      // 3. Resolve Location
      let locationId = isUuid(body.locationId) ? body.locationId : undefined;
      if (!locationId) {
        const [loc] = await db
          .select({ id: schema.inventoryLocations.id })
          .from(schema.inventoryLocations)
          .where(and(eq(schema.inventoryLocations.branchId, branchId), eq(schema.inventoryLocations.isDefault, true)))
          .limit(1);
        if (loc) {
          locationId = loc.id;
        } else {
          const [anyLoc] = await db
            .select({ id: schema.inventoryLocations.id })
            .from(schema.inventoryLocations)
            .where(eq(schema.inventoryLocations.branchId, branchId))
            .limit(1);
          if (anyLoc) {
            locationId = anyLoc.id;
          } else {
            locationId = crypto.randomUUID();
            await db.insert(schema.inventoryLocations).values({
              id: locationId,
              tenantId,
              branchId,
              code: "DEPO-UTAMA",
              name: "Etalase Depo Utama",
              isDefault: true,
              isActive: true
            });
          }
        }
      }

      // 4. Resolve User
      let performedBy = isUuid(userId) ? userId : undefined;
      if (!performedBy) {
        const [u] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
        performedBy = u ? u.id : crypto.randomUUID();
      }

      const adjustmentId = crypto.randomUUID();
      const now = new Date();
      const yyyymm = now.toISOString().slice(0, 7).replace("-", "");
      const randomSeq = Math.floor(1000 + Math.random() * 9000);
      const adjustmentNumber = body.adjustmentNumber || `RJK-${yyyymm}-${randomSeq}`;
      const adjustmentDate = body.adjustmentDate || now.toISOString().slice(0, 10);
      const reason = body.reason || "Stok Opname & Rekonsiliasi Fisik Rutin";

      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (rawItems.length === 0) {
        throw new Error("Daftar item rekonsiliasi opname tidak boleh kosong");
      }

      // Jalankan transaksi database atomik
      const result = await db.transaction(async (tx) => {
        // A. Insert ke stock_adjustments
        const [createdAdjustment] = await tx
          .insert(schema.stockAdjustments)
          .values({
            id: adjustmentId,
            tenantId,
            branchId,
            locationId,
            adjustmentNumber,
            adjustmentDate,
            reason,
            status: "COMMITTED",
            performedBy
          })
          .returning();

        let lineNo = 1;
        const insertedItems = [];

        for (const item of rawItems) {
          // Resolve Product
          let productId = isUuid(item.productId) ? item.productId : undefined;
          if (!productId && item.productName) {
            const [p] = await tx
              .select({ id: schema.products.id })
              .from(schema.products)
              .where(sql`${schema.products.name} ILIKE ${item.productName}`)
              .limit(1);
            if (p) productId = p.id;
          }
          if (!productId) {
            const [firstP] = await tx.select({ id: schema.products.id }).from(schema.products).limit(1);
            if (!firstP) continue;
            productId = firstP.id;
          }

          // Resolve Batch
          let batchId: string | null = isUuid(item.batchId) ? item.batchId : null;
          if (!batchId && (item.batchNo || item.batchNumber)) {
            const cleanBatchNo = (item.batchNo || item.batchNumber).trim().toUpperCase();
            const [b] = await tx
              .select({ id: schema.productBatches.id })
              .from(schema.productBatches)
              .where(and(eq(schema.productBatches.productId, productId), eq(schema.productBatches.batchNo, cleanBatchNo)))
              .limit(1);
            if (b) {
              batchId = b.id;
            } else {
              batchId = crypto.randomUUID();
              await tx.insert(schema.productBatches).values({
                id: batchId,
                tenantId,
                productId,
                batchNo: cleanBatchNo,
                expiredDate: item.expiredDate || "2027-12-31"
              });
            }
          }

          const systemQty = Number(item.systemQty || 0);
          const actualQty = Math.max(0, Number(item.actualQty || 0));
          const diffQty = actualQty - systemQty;
          const costPerUnit = Number(item.costPerUnit || 0);
          const notes = item.notes || `Fisik: ${actualQty}, Sistem: ${systemQty}`;

          // B. Insert ke stock_adjustment_items
          await tx.insert(schema.stockAdjustmentItems).values({
            id: crypto.randomUUID(),
            adjustmentId,
            productId,
            batchId,
            lineNo: lineNo++,
            systemQtyBase: String(systemQty),
            actualQtyBase: String(actualQty),
            differenceQtyBase: String(diffQty),
            costPerUnit: String(costPerUnit),
            notes
          });

          // C. Update Saldo Batch Fisik (branch_batch_stocks)
          if (batchId) {
            const [existingBatchStock] = await tx
              .select({ id: schema.branchBatchStocks.id })
              .from(schema.branchBatchStocks)
              .where(
                and(
                  eq(schema.branchBatchStocks.branchId, branchId),
                  eq(schema.branchBatchStocks.locationId, locationId),
                  eq(schema.branchBatchStocks.productId, productId),
                  eq(schema.branchBatchStocks.batchId, batchId)
                )
              )
              .limit(1);

            if (existingBatchStock) {
              await tx
                .update(schema.branchBatchStocks)
                .set({
                  qtyBase: String(actualQty),
                  buyPrice: costPerUnit > 0 ? String(costPerUnit) : undefined,
                  updatedAt: new Date()
                })
                .where(eq(schema.branchBatchStocks.id, existingBatchStock.id));
            } else {
              await tx.insert(schema.branchBatchStocks).values({
                id: crypto.randomUUID(),
                tenantId,
                branchId,
                locationId,
                productId,
                batchId,
                qtyBase: String(actualQty),
                buyPrice: String(costPerUnit),
                updatedAt: new Date()
              });
            }
          }

          // D. Update Saldo Total Stok Cabang (branch_stocks)
          const [existingBranchStock] = await tx
            .select({ id: schema.branchStocks.id, totalQtyBase: schema.branchStocks.totalQtyBase })
            .from(schema.branchStocks)
            .where(and(eq(schema.branchStocks.locationId, locationId), eq(schema.branchStocks.productId, productId)))
            .limit(1);

          if (existingBranchStock) {
            const currentTotal = Number(existingBranchStock.totalQtyBase || 0);
            const newTotal = Math.max(0, currentTotal + diffQty);
            await tx
              .update(schema.branchStocks)
              .set({
                totalQtyBase: String(newTotal),
                updatedAt: new Date()
              })
              .where(eq(schema.branchStocks.id, existingBranchStock.id));
          } else {
            await tx.insert(schema.branchStocks).values({
              id: crypto.randomUUID(),
              tenantId,
              branchId,
              locationId,
              productId,
              totalQtyBase: String(actualQty),
              unbatchedQtyBase: "0",
              updatedAt: new Date()
            });
          }

          // E. Tulis ke stock_ledger jika ada selisih (diffQty !== 0)
          if (diffQty !== 0) {
            await tx.insert(schema.stockLedger).values({
              id: crypto.randomUUID(),
              tenantId,
              branchId,
              locationId,
              productId,
              batchId,
              mutationType: "ADJUSTMENT",
              quantityBase: String(diffQty),
              costPerUnit: String(costPerUnit),
              referenceId: adjustmentId,
              notes: `Stok Opname ${adjustmentNumber}: ${notes}`,
              createdBy: performedBy,
              createdAt: now
            });
          }

          insertedItems.push({
            productId,
            batchId,
            actualQty,
            diffQty
          });
        }

        return {
          adjustment: createdAdjustment,
          itemsCount: insertedItems.length
        };
      });

      return {
        success: true,
        message: `Stok Opname ${adjustmentNumber} berhasil dikomit. Saldo batch, stok total, dan kartu stok telah sinkron.`,
        data: result
      };
    } catch (err: any) {
      console.error("[Inventory POST /opname error]:", err);
      return { success: false, error: err.message };
    }
  });
