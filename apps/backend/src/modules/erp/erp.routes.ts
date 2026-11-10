import { Elysia } from "elysia";
import { db, schema } from "@apoteku/db";
import { desc, count, sql, eq, and } from "drizzle-orm";
import { generateOrderNumber } from "@apoteku/core";
import { consignmentService } from "./consignment.service.js";

export const erpRoutes = new Elysia({ prefix: "/api" })
  // 1. STATISTIK SISTEM & DASHBOARD
  .get("/stats", async () => {
    try {
      const [prodCount] = await db.select({ val: count() }).from(schema.products);
      const [unitCount] = await db.select({ val: count() }).from(schema.productUnits);
      const [custCount] = await db.select({ val: count() }).from(schema.customers);
      const [suppCount] = await db.select({ val: count() }).from(schema.suppliers);
      const [saleCount] = await db.select({ val: count() }).from(schema.salesTransactions);
      const [pbCount] = await db.select({ val: count() }).from(schema.purchaseInvoices);

      return {
        success: true,
        data: {
          totalProducts: Number(prodCount?.val || 0),
          totalUnits: Number(unitCount?.val || 0),
          totalCustomers: Number(custCount?.val || 0),
          totalSuppliers: Number(suppCount?.val || 0),
          totalSalesTransactions: Number(saleCount?.val || 0),
          totalPurchaseInvoices: Number(pbCount?.val || 0)
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 1B. LIST CABANG APOTEK
  .get("/branches", async () => {
    try {
      const branches = await db
        .select()
        .from(schema.branches)
        .orderBy(schema.branches.name);

      return {
        success: true,
        data: branches.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          address: b.address || "",
          phone: b.phone || ""
        }))
      };
    } catch (err: any) {
      return { success: false, error: err.message, data: [] };
    }
  })

  // 1C. LIST PRODUK DENGAN SATUAN & HARGA
  .get("/products", async () => {
    try {
      const prods = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.isActive, true))
        .orderBy(schema.products.name)
        .limit(5000);

      const prodIds = prods.map((p) => p.id);
      const unitsMap = new Map<string, any[]>();

      if (prodIds.length > 0) {
        const units = await db
          .select()
          .from(schema.productUnits)
          .where(sql`${schema.productUnits.productId} IN ${prodIds}`);

        for (const u of units) {
          const list = unitsMap.get(u.productId) || [];
          list.push({
            id: u.id,
            unitName: u.unitName,
            conversionFactor: Number(u.conversionFactor),
            salePriceGeneral: Number(u.salePriceGeneral || 0),
            isBaseUnit: u.isBaseUnit
          });
          unitsMap.set(u.productId, list);
        }
      }

      const latestPrices = await db
        .select({
          productId: schema.branchBatchStocks.productId,
          buyPrice: schema.branchBatchStocks.buyPrice
        })
        .from(schema.branchBatchStocks)
        .orderBy(desc(schema.branchBatchStocks.updatedAt));

      const priceMap = new Map<string, number>();
      for (const lp of latestPrices) {
        if (!priceMap.has(lp.productId)) {
          priceMap.set(lp.productId, Number(lp.buyPrice || 0));
        }
      }

      return {
        success: true,
        data: prods.map((p) => {
          const uList = unitsMap.get(p.id) || [];
          const baseUnitObj = uList.find((u) => u.isBaseUnit) || uList[0];

          let defaultBuyPrice = priceMap.get(p.id);
          if (!defaultBuyPrice || defaultBuyPrice <= 0) {
            if (baseUnitObj && Number(baseUnitObj.salePriceGeneral) > 0) {
              const basePrice = Number(baseUnitObj.salePriceGeneral) / Number(baseUnitObj.conversionFactor || 1);
              defaultBuyPrice = Math.round(basePrice * 0.8);
            } else {
              defaultBuyPrice = 1000;
            }
          }

          const basePrice = defaultBuyPrice;
          const formattedUnits = (uList.length > 0 ? uList : [{ unitName: p.baseUnit, conversionFactor: 1, isBaseUnit: true }]).map((u) => {
            const factor = Number(u.conversionFactor || 1);
            return {
              id: u.id,
              unitName: u.unitName,
              conversionFactor: factor,
              isBaseUnit: Boolean(u.isBaseUnit),
              estimatedBuyPrice: Math.round(basePrice * factor)
            };
          });

          return {
            id: p.id,
            sku: p.sku,
            barcode: p.barcode || "",
            name: p.name,
            activeSubstance: p.activeSubstance || "",
            dosageForm: p.dosageForm || "",
            rackLocation: p.rackLocation || "",
            drugClass: p.drugClass,
            baseUnit: p.baseUnit,
            isConsignment: Boolean(p.isConsignment),
            buyPrice: defaultBuyPrice,
            units: formattedUnits
          };
        })
      };
    } catch (err: any) {
      return { success: false, error: err.message, data: [] };
    }
  })

  // 1D. TAMBAH MASTER PRODUK BARU
  .post("/products", async ({ body }: { body: any }) => {
    try {
      if (!body.name || !String(body.name).trim()) {
        return { success: false, error: "Nama obat wajib diisi" };
      }
      const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      if (!tenant) throw new Error("Tenant aktif tidak ditemukan");

      let sku = (body.sku || "").trim();
      if (!sku) {
        sku = `SKU-${Date.now().toString().slice(-6)}`;
      }
      const [dupSku] = await db
        .select({ id: schema.products.id })
        .from(schema.products)
        .where(and(eq(schema.products.tenantId, tenant.id), eq(schema.products.sku, sku)))
        .limit(1);
      if (dupSku) {
        sku = `${sku}-${Date.now().toString().slice(-3)}`;
      }

      const baseUnit = String(body.baseUnit || body.units?.[0]?.unitName || "PCS").trim().toUpperCase();
      const prodId = crypto.randomUUID();
      const now = new Date();

      const created = await db.transaction(async (tx) => {
        const [p] = await tx
          .insert(schema.products)
          .values({
            id: prodId,
            tenantId: tenant.id,
            sku,
            barcode: body.barcode ? String(body.barcode).trim() : null,
            name: String(body.name).trim(),
            activeSubstance: body.genericName || body.activeSubstance || null,
            dosageForm: body.dosageForm || null,
            drugClass: body.drugClass || "BEBAS",
            baseUnit,
            isConsignment: Boolean(body.isConsignment),
            isActive: body.isActive ?? true,
            updatedAt: now
          })
          .returning();

        const rawUnits =
          Array.isArray(body.units) && body.units.length > 0
            ? body.units
            : [
                {
                  unitName: baseUnit,
                  conversionFactor: 1,
                  salePriceGeneral: Number(body.unitPrices?.general || 0),
                  salePriceResep: Number(body.unitPrices?.prescription || 0),
                  salePriceGrosir: Number(body.unitPrices?.wholesale || 0),
                  salePriceDelivery: Number(body.unitPrices?.general || 0),
                  salePriceMember: Number(body.unitPrices?.wholesale || 0),
                  isBaseUnit: true
                }
              ];

        const seenUnitNames = new Set<string>();
        for (let i = 0; i < rawUnits.length; i++) {
          const u = rawUnits[i];
          const unitName = String(u.unitName || (i === 0 ? baseUnit : `UNIT${i + 1}`)).trim().toUpperCase();
          if (seenUnitNames.has(unitName)) continue;
          seenUnitNames.add(unitName);

          await tx.insert(schema.productUnits).values({
            id: crypto.randomUUID(),
            tenantId: tenant.id,
            productId: prodId,
            unitName,
            conversionFactor: String(i === 0 ? 1 : Math.max(1, Number(u.conversionFactor || 1))),
            salePriceGeneral: String(Number(u.salePriceGeneral || 0)),
            salePriceResep: String(Number(u.salePriceResep || u.salePriceGeneral || 0)),
            salePriceGrosir: String(Number(u.salePriceGrosir || u.salePriceGeneral || 0)),
            salePriceDelivery: String(Number(u.salePriceDelivery || u.salePriceGeneral || 0)),
            salePriceMember: String(Number(u.salePriceMember || u.salePriceGrosir || u.salePriceGeneral || 0)),
            isBaseUnit: i === 0 || Boolean(u.isBaseUnit)
          });
        }

        const initStock = Number(body.initialStock || 0);
        if (initStock > 0) {
          let branchId = body.branchId;
          if (!branchId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId)) {
            const [b] = await tx.select({ id: schema.branches.id }).from(schema.branches).limit(1);
            branchId = b?.id;
          }
          if (branchId) {
            let [loc] = await tx
              .select({ id: schema.inventoryLocations.id })
              .from(schema.inventoryLocations)
              .where(eq(schema.inventoryLocations.branchId, branchId))
              .limit(1);
            if (!loc) {
              const newLocId = crypto.randomUUID();
              await tx.insert(schema.inventoryLocations).values({
                id: newLocId,
                tenantId: tenant.id,
                branchId,
                code: "DEPO-UTAMA",
                name: "Etalase Depo Utama",
                isDefault: true,
                isActive: true
              });
              loc = { id: newLocId };
            }

            const batchId = crypto.randomUUID();
            await tx.insert(schema.productBatches).values({
              id: batchId,
              tenantId: tenant.id,
              productId: prodId,
              batchNo: String(body.initialBatch || `BCH-${Date.now().toString().slice(-6)}`).trim().toUpperCase(),
              expiredDate: body.initialExpiry || "2028-01-01"
            });

            await tx.insert(schema.branchBatchStocks).values({
              id: crypto.randomUUID(),
              tenantId: tenant.id,
              branchId,
              locationId: loc.id,
              productId: prodId,
              batchId,
              qtyBase: String(initStock),
              buyPrice: String(Number(body.buyPrice || 0)),
              updatedAt: now
            });

            await tx.insert(schema.branchStocks).values({
              id: crypto.randomUUID(),
              tenantId: tenant.id,
              branchId,
              locationId: loc.id,
              productId: prodId,
              totalQtyBase: String(initStock),
              unbatchedQtyBase: "0",
              updatedAt: now
            });
          }
        }

        return p;
      });

      return {
        success: true,
        message: `Produk "${created.name}" berhasil ditambahkan ke database.`,
        data: {
          ...created,
          isConsignment: Boolean(created.isConsignment)
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 1E. UPDATE MASTER PRODUK
  .put("/products/:id", async ({ params, body }: { params: { id: string }; body: any }) => {
    try {
      const [existing] = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.id, params.id))
        .limit(1);

      if (!existing) {
        return { success: false, error: "Produk tidak ditemukan di database" };
      }

      const now = new Date();
      const updated = await db.transaction(async (tx) => {
        const updateFields: any = { updatedAt: now };
        if (body.name !== undefined) updateFields.name = String(body.name).trim();
        if (body.sku !== undefined) updateFields.sku = String(body.sku).trim();
        if (body.barcode !== undefined) updateFields.barcode = body.barcode ? String(body.barcode).trim() : null;
        if (body.genericName !== undefined || body.activeSubstance !== undefined) {
          updateFields.activeSubstance = body.genericName ?? body.activeSubstance ?? null;
        }
        if (body.drugClass !== undefined) updateFields.drugClass = body.drugClass;
        if (body.baseUnit !== undefined) updateFields.baseUnit = String(body.baseUnit).trim().toUpperCase();
        if (body.isConsignment !== undefined) updateFields.isConsignment = Boolean(body.isConsignment);
        if (body.isActive !== undefined) updateFields.isActive = Boolean(body.isActive);

        const [p] = await tx
          .update(schema.products)
          .set(updateFields)
          .where(eq(schema.products.id, params.id))
          .returning();

        if (Array.isArray(body.units) && body.units.length > 0) {
          await tx
            .delete(schema.productUnits)
            .where(eq(schema.productUnits.productId, params.id));

          const seenUnits = new Set<string>();
          for (let i = 0; i < body.units.length; i++) {
            const u = body.units[i];
            const unitName = String(u.unitName || u.unit || (i === 0 ? p.baseUnit : `UNIT${i + 1}`))
              .trim()
              .toUpperCase();
            if (seenUnits.has(unitName)) continue;
            seenUnits.add(unitName);

            await tx.insert(schema.productUnits).values({
              id: crypto.randomUUID(),
              tenantId: existing.tenantId,
              productId: params.id,
              unitName,
              conversionFactor: String(i === 0 ? 1 : Math.max(1, Number(u.conversionFactor || 1))),
              salePriceGeneral: String(Number(u.salePriceGeneral || 0)),
              salePriceResep: String(Number(u.salePriceResep || u.salePriceGeneral || 0)),
              salePriceGrosir: String(Number(u.salePriceGrosir || u.salePriceGeneral || 0)),
              salePriceDelivery: String(Number(u.salePriceDelivery || u.salePriceGeneral || 0)),
              salePriceMember: String(Number(u.salePriceMember || u.salePriceGrosir || u.salePriceGeneral || 0)),
              isBaseUnit: i === 0 || Boolean(u.isBaseUnit)
            });
          }
        }

        return p;
      });

      return {
        success: true,
        message: `Produk "${updated.name}" berhasil diperbarui.`,
        data: {
          ...updated,
          isConsignment: Boolean(updated.isConsignment)
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 1F. HAPUS / NONAKTIFKAN PRODUK
  .delete("/products/:id", async ({ params }: { params: { id: string } }) => {
    try {
      const [existing] = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.id, params.id))
        .limit(1);

      if (!existing) {
        return { success: false, error: "Produk tidak ditemukan" };
      }

      const [saleRef] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.salesTransactionItems)
        .where(eq(schema.salesTransactionItems.productId, params.id));
      const [purRef] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.purchaseInvoiceItems)
        .where(eq(schema.purchaseInvoiceItems.productId, params.id));
      const [ksnRef] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.consignmentReceiptItems)
        .where(eq(schema.consignmentReceiptItems.productId, params.id));

      const hasHistory =
        Number(saleRef?.count || 0) + Number(purRef?.count || 0) + Number(ksnRef?.count || 0) > 0;

      if (hasHistory) {
        await db
          .update(schema.products)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(schema.products.id, params.id));

        return {
          success: true,
          action: "soft_deleted",
          message: `Produk "${existing.name}" dinonaktifkan karena sudah memiliki riwayat transaksi.`
        };
      }

      await db.delete(schema.products).where(eq(schema.products.id, params.id));
      return {
        success: true,
        action: "hard_deleted",
        message: `Produk "${existing.name}" berhasil dihapus.`
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 2. SUPPLIERS (PBF)
  .get("/suppliers", async () => {
    try {
      const suppliers = await db
        .select()
        .from(schema.suppliers)
        .orderBy(schema.suppliers.name)
        .limit(500);

      return {
        success: true,
        data: suppliers.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          phone: s.phone || "",
          email: s.email || "",
          address: s.address || "",
          topDays: s.paymentTermDays,
          paymentTermDays: s.paymentTermDays,
          contactPerson: s.contactPerson || "",
          pbfLicense: s.code,
          isConsignment: Boolean(s.isConsignment),
          isActive: s.isActive
        }))
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 2B. TAMBAH SUPPLIER (PBF) BARU
  .post("/suppliers", async ({ body }: { body: any }) => {
    try {
      if (!body.name || !body.name.trim()) {
        return { success: false, error: "Nama distributor / PBF wajib diisi" };
      }

      const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      if (!tenant) throw new Error("Tenant aktif tidak ditemukan");

      let code = (body.code || "").trim();
      if (!code) {
        const [countRow] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(schema.suppliers);
        code = `PBF-${String(Number(countRow?.count || 0) + 1).padStart(3, "0")}`;
      }

      const [existing] = await db
        .select({ id: schema.suppliers.id })
        .from(schema.suppliers)
        .where(and(eq(schema.suppliers.tenantId, tenant.id), eq(schema.suppliers.code, code)))
        .limit(1);

      if (existing) {
        code = `${code}-${Date.now().toString().slice(-4)}`;
      }

      const [created] = await db
        .insert(schema.suppliers)
        .values({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          code,
          name: body.name.trim(),
          phone: body.phone ? body.phone.trim() : null,
          email: body.email ? body.email.trim() : null,
          address: body.address ? body.address.trim() : null,
          contactPerson: body.contactPerson ? body.contactPerson.trim() : null,
          paymentTermDays: Number(body.paymentTermDays ?? body.topDays ?? 30),
          leadTimeDays: Number(body.leadTimeDays ?? 3),
          isConsignment: Boolean(body.isConsignment),
          isActive: body.isActive ?? true
        })
        .returning();

      return {
        success: true,
        message: `Distributor "${created.name}" berhasil ditambahkan`,
        data: {
          id: created.id,
          code: created.code,
          name: created.name,
          phone: created.phone || "",
          email: created.email || "",
          address: created.address || "",
          topDays: created.paymentTermDays,
          paymentTermDays: created.paymentTermDays,
          contactPerson: created.contactPerson || "",
          pbfLicense: created.code,
          isConsignment: Boolean(created.isConsignment),
          isActive: created.isActive
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 2C. UPDATE SUPPLIER (PBF)
  .put("/suppliers/:id", async ({ params, body }: { params: { id: string }; body: any }) => {
    try {
      const [supplier] = await db
        .select()
        .from(schema.suppliers)
        .where(eq(schema.suppliers.id, params.id))
        .limit(1);

      if (!supplier) {
        return { success: false, error: "Distributor tidak ditemukan" };
      }

      const updateData: any = {};
      if (body.name !== undefined) updateData.name = body.name.trim();
      if (body.code !== undefined) updateData.code = body.code.trim();
      if (body.phone !== undefined) updateData.phone = body.phone ? body.phone.trim() : null;
      if (body.email !== undefined) updateData.email = body.email ? body.email.trim() : null;
      if (body.address !== undefined) updateData.address = body.address ? body.address.trim() : null;
      if (body.contactPerson !== undefined) updateData.contactPerson = body.contactPerson ? body.contactPerson.trim() : null;
      if (body.paymentTermDays !== undefined || body.topDays !== undefined) {
        updateData.paymentTermDays = Number(body.paymentTermDays ?? body.topDays);
      }
      if (body.leadTimeDays !== undefined) updateData.leadTimeDays = Number(body.leadTimeDays);
      if (body.isConsignment !== undefined) updateData.isConsignment = Boolean(body.isConsignment);
      if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);

      const [updated] = await db
        .update(schema.suppliers)
        .set(updateData)
        .where(eq(schema.suppliers.id, params.id))
        .returning();

      return {
        success: true,
        message: `Distributor "${updated.name}" berhasil diperbarui`,
        data: {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          phone: updated.phone || "",
          email: updated.email || "",
          address: updated.address || "",
          topDays: updated.paymentTermDays,
          paymentTermDays: updated.paymentTermDays,
          contactPerson: updated.contactPerson || "",
          pbfLicense: updated.code,
          isConsignment: Boolean(updated.isConsignment),
          isActive: updated.isActive
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 2D. HAPUS / NONAKTIFKAN SUPPLIER (PBF)
  .delete("/suppliers/:id", async ({ params }: { params: { id: string } }) => {
    try {
      const [supplier] = await db
        .select()
        .from(schema.suppliers)
        .where(eq(schema.suppliers.id, params.id))
        .limit(1);

      if (!supplier) {
        return { success: false, error: "Distributor tidak ditemukan" };
      }

      const [invoiceUsage] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.purchaseInvoices)
        .where(eq(schema.purchaseInvoices.supplierId, params.id));

      const [poUsage] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.purchaseOrders)
        .where(eq(schema.purchaseOrders.supplierId, params.id));

      const [ksnUsage] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.consignmentReceipts)
        .where(eq(schema.consignmentReceipts.supplierId, params.id));

      const hasHistory =
        (Number(invoiceUsage?.count || 0) + Number(poUsage?.count || 0) + Number(ksnUsage?.count || 0)) > 0;

      if (hasHistory) {
        await db
          .update(schema.suppliers)
          .set({ isActive: false })
          .where(eq(schema.suppliers.id, params.id));

        return {
          success: true,
          action: "soft_deleted",
          message: `Distributor "${supplier.name}" dinonaktifkan karena memiliki riwayat transaksi faktur / SP.`
        };
      } else {
        await db
          .delete(schema.suppliers)
          .where(eq(schema.suppliers.id, params.id));

        return {
          success: true,
          action: "hard_deleted",
          message: `Distributor "${supplier.name}" berhasil dihapus permanen.`
        };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 3. CUSTOMERS (PELANGGAN & PASIEN)
  .get("/customers", async () => {
    try {
      const customers = await db
        .select()
        .from(schema.customers)
        .orderBy(schema.customers.name)
        .limit(500);

      return {
        success: true,
        data: customers.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          phone: c.phone || "",
          address: c.address || "",
          priceTier: c.customerType === "MEMBER" ? "member" : "general",
          loyaltyPoints: c.pointBalance || 0
        }))
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 3B. TAMBAH CUSTOMER BARU
  .post("/customers", async ({ body }: { body: any }) => {
    try {
      if (!body.name || !body.name.trim()) {
        return { success: false, error: "Nama pelanggan wajib diisi" };
      }

      const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      if (!tenant) throw new Error("Tenant aktif tidak ditemukan");

      let code = (body.code || "").trim();
      if (!code) {
        const [countRow] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(schema.customers);
        code = `CUST-${String(Number(countRow?.count || 0) + 1).padStart(4, "0")}`;
      }

      const [created] = await db
        .insert(schema.customers)
        .values({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          code,
          name: body.name.trim(),
          phone: body.phone ? body.phone.trim() : null,
          address: body.address ? body.address.trim() : null,
          customerType: body.priceTier === "member" ? "MEMBER" : "UMUM",
          pointBalance: Number(body.loyaltyPoints || 0),
          isActive: true
        })
        .returning();

      return {
        success: true,
        message: `Pelanggan "${created.name}" berhasil ditambahkan`,
        data: {
          id: created.id,
          code: created.code,
          name: created.name,
          phone: created.phone || "",
          address: created.address || "",
          priceTier: created.customerType === "MEMBER" ? "member" : "general",
          loyaltyPoints: created.pointBalance || 0
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 3C. UPDATE CUSTOMER
  .put("/customers/:id", async ({ params, body }: { params: { id: string }; body: any }) => {
    try {
      const updateData: any = {};
      if (body.name !== undefined) updateData.name = body.name.trim();
      if (body.code !== undefined) updateData.code = body.code.trim();
      if (body.phone !== undefined) updateData.phone = body.phone ? body.phone.trim() : null;
      if (body.address !== undefined) updateData.address = body.address ? body.address.trim() : null;
      if (body.priceTier !== undefined) {
        updateData.customerType = body.priceTier === "member" ? "MEMBER" : "UMUM";
      }
      if (body.loyaltyPoints !== undefined) {
        updateData.pointBalance = Number(body.loyaltyPoints);
      }

      const [updated] = await db
        .update(schema.customers)
        .set(updateData)
        .where(eq(schema.customers.id, params.id))
        .returning();

      return {
        success: true,
        message: `Pelanggan "${updated.name}" berhasil diperbarui`,
        data: {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          phone: updated.phone || "",
          address: updated.address || "",
          priceTier: updated.customerType === "MEMBER" ? "member" : "general",
          loyaltyPoints: updated.pointBalance || 0
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 3D. HAPUS CUSTOMER
  .delete("/customers/:id", async ({ params }: { params: { id: string } }) => {
    try {
      await db.delete(schema.customers).where(eq(schema.customers.id, params.id));
      return { success: true, message: "Pelanggan berhasil dihapus" };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 4. RIWAYAT PENJUALAN KASIR
  .get("/sales", async ({ query }) => {
    try {
      const limit = Number(query.limit || 200);
      const salesData = await db
        .select({
          id: schema.salesTransactions.id,
          invoiceNo: schema.salesTransactions.invoiceNo,
          createdAt: schema.salesTransactions.createdAt,
          customerType: schema.salesTransactions.customerType,
          customerId: schema.salesTransactions.customerId,
          customerName: schema.customers.name,
          patientName: schema.salesTransactions.patientName,
          doctorName: schema.salesTransactions.doctorName,
          cashierUserId: schema.salesTransactions.cashierUserId,
          cashierName: schema.users.fullName,
          shiftNumber: schema.cashierShifts.shiftNumber,
          paymentMethod: schema.salesTransactions.paymentMethod,
          subtotal: schema.salesTransactions.subtotal,
          discountAmount: schema.salesTransactions.discountAmount,
          taxAmount: schema.salesTransactions.taxAmount,
          tuslahAmount: schema.salesTransactions.tuslahAmount,
          embalaseAmount: schema.salesTransactions.embalaseAmount,
          grandTotal: schema.salesTransactions.grandTotal,
          paidAmount: schema.salesTransactions.paidAmount,
          changeAmount: schema.salesTransactions.changeAmount
        })
        .from(schema.salesTransactions)
        .leftJoin(
          schema.customers,
          eq(schema.salesTransactions.customerId, schema.customers.id)
        )
        .leftJoin(
          schema.users,
          eq(schema.salesTransactions.cashierUserId, schema.users.id)
        )
        .leftJoin(
          schema.cashierShifts,
          eq(schema.salesTransactions.cashierShiftId, schema.cashierShifts.id)
        )
        .orderBy(desc(schema.salesTransactions.createdAt))
        .limit(limit);

      // Fetch items for each transaction
      const saleIds = salesData.map((s) => s.id);
      const itemsBySaleId = new Map<string, any[]>();

      if (saleIds.length > 0) {
        const itemsData = await db
          .select({
            id: schema.salesTransactionItems.id,
            transactionId: schema.salesTransactionItems.transactionId,
            productId: schema.salesTransactionItems.productId,
            productName: schema.products.name,
            batchId: schema.salesTransactionItems.batchId,
            batchNo: schema.productBatches.batchNo,
            expDate: schema.productBatches.expiredDate,
            qty: schema.salesTransactionItems.qty,
            unitName: schema.salesTransactionItems.unitName,
            unitPrice: schema.salesTransactionItems.unitPrice,
            subtotal: schema.salesTransactionItems.subtotal,
            dosageRules: schema.salesTransactionItems.dosageRules
          })
          .from(schema.salesTransactionItems)
          .leftJoin(
            schema.products,
            eq(schema.salesTransactionItems.productId, schema.products.id)
          )
          .leftJoin(
            schema.productBatches,
            eq(schema.salesTransactionItems.batchId, schema.productBatches.id)
          )
          .where(sql`${schema.salesTransactionItems.transactionId} IN ${saleIds}`);

        for (const item of itemsData) {
          const list = itemsBySaleId.get(item.transactionId) || [];
          list.push({
            id: item.id,
            productId: item.productId,
            productName: item.productName || "Obat",
            batchNo: item.batchNo || "BATCH-REG",
            expDate: item.expDate || "-",
            qty: Number(item.qty),
            unit: item.unitName,
            price: Number(item.unitPrice),
            subtotal: Number(item.subtotal),
            dosageRules: item.dosageRules
          });
          itemsBySaleId.set(item.transactionId, list);
        }
      }

      return {
        success: true,
        data: salesData.map((s) => {
          const items = itemsBySaleId.get(s.id) || [];
          const paid = Number(s.paidAmount);
          const total = Number(s.grandTotal);
          let paymentStatus = "PAID";
          if (paid < total) {
            paymentStatus = paid > 0 ? "PARTIAL" : "UNPAID";
          }

          return {
            id: s.id,
            invoiceNo: s.invoiceNo,
            invoiceNumber: s.invoiceNo,
            createdAt: s.createdAt.toLocaleString("id-ID", {
              dateStyle: "medium",
              timeStyle: "short"
            }),
            transactionTime: s.createdAt.toISOString(),
            cashierName: s.cashierName || "Kasir Utama",
            cashierShift:
              s.shiftNumber === 1
                ? "Shift Pagi"
                : s.shiftNumber === 2
                ? "Shift Siang"
                : "Shift Malam",
            customerName:
              s.customerName ||
              (s.customerType === "MEMBER" ? "Member Pasien" : "Pelanggan Umum"),
            patientName: s.patientName || null,
            doctorName: s.doctorName || null,
            transactionType: s.customerType || "UMUM",
            paymentMethod: s.paymentMethod,
            paymentStatus,
            subtotal: Number(s.subtotal),
            discountAmount: Number(s.discountAmount),
            taxAmount: Number(s.taxAmount),
            tuslahAmount: Number(s.tuslahAmount || 0),
            embalaseAmount: Number(s.embalaseAmount || 0),
            grandTotal: total,
            paidAmount: paid,
            changeAmount: Number(s.changeAmount),
            itemsCount: items.length,
            items
          };
        })
      };
    } catch (err: any) {
      console.error("[ERP] /sales error:", err);
      return { success: false, error: err.message, data: [] };
    }
  })

  // 5. FAKTUR PEMBELIAN PBF
  .get("/purchases", async ({ query }) => {
    try {
      const limit = Number(query.limit || 100);
      const purchases = await db
        .select({
          id: schema.purchaseInvoices.id,
          branchId: schema.purchaseInvoices.branchId,
          branchName: schema.branches.name,
          supplierId: schema.purchaseInvoices.supplierId,
          supplierName: schema.suppliers.name,
          purchaseOrderId: schema.purchaseInvoices.purchaseOrderId,
          poNumber: schema.purchaseOrders.poNumber,
          invoiceNumber: schema.purchaseInvoices.invoiceNumber,
          receiveDate: schema.purchaseInvoices.receiveDate,
          invoiceDate: schema.purchaseInvoices.invoiceDate,
          dueDate: schema.purchaseInvoices.dueDate,
          isCredit: schema.purchaseInvoices.isCredit,
          subtotal: schema.purchaseInvoices.subtotal,
          discountAmount: schema.purchaseInvoices.discountAmount,
          taxAmount: schema.purchaseInvoices.taxAmount,
          grandTotal: schema.purchaseInvoices.grandTotal,
          paidAmount: schema.purchaseInvoices.paidAmount,
          isPaidOff: schema.purchaseInvoices.isPaidOff
        })
        .from(schema.purchaseInvoices)
        .leftJoin(
          schema.suppliers,
          eq(schema.purchaseInvoices.supplierId, schema.suppliers.id)
        )
        .leftJoin(
          schema.branches,
          eq(schema.purchaseInvoices.branchId, schema.branches.id)
        )
        .leftJoin(
          schema.purchaseOrders,
          eq(schema.purchaseInvoices.purchaseOrderId, schema.purchaseOrders.id)
        )
        .orderBy(desc(schema.purchaseInvoices.receiveDate), desc(schema.purchaseInvoices.createdAt))
        .limit(limit);

      const invoiceIds = purchases.map((p) => p.id);
      const itemsCountMap = new Map<string, number>();

      if (invoiceIds.length > 0) {
        const itemCounts = await db
          .select({
            invoiceId: schema.purchaseInvoiceItems.invoiceId,
            cnt: count()
          })
          .from(schema.purchaseInvoiceItems)
          .where(sql`${schema.purchaseInvoiceItems.invoiceId} IN ${invoiceIds}`)
          .groupBy(schema.purchaseInvoiceItems.invoiceId);

        for (const ic of itemCounts) {
          itemsCountMap.set(ic.invoiceId, Number(ic.cnt));
        }
      }

      return {
        success: true,
        data: purchases.map((p) => ({
          id: p.id,
          invoiceNumber: p.invoiceNumber,
          poNumber: p.poNumber || (p.purchaseOrderId ? `SP-${p.invoiceNumber.slice(0, 6)}` : undefined),
          supplierId: p.supplierId,
          supplierName: p.supplierName || "PBF",
          branchId: p.branchId,
          branchName: p.branchName || "Apotek Hafidz Farma",
          invoiceDate: p.invoiceDate || p.receiveDate,
          receiveDate: p.receiveDate,
          dueDate: p.dueDate,
          isCredit: p.isCredit,
          subtotal: Number(p.subtotal),
          discountAmount: Number(p.discountAmount),
          taxAmount: Number(p.taxAmount),
          grandTotal: Number(p.grandTotal),
          totalAmount: Number(p.grandTotal),
          paidAmount: Number(p.paidAmount),
          isPaidOff: p.isPaidOff,
          itemsCount: itemsCountMap.get(p.id) || 1,
          taxPercent: 11,
          notes: "Faktur Pembelian PBF Terverifikasi"
        }))
      };
    } catch (err: any) {
      return { success: false, error: err.message, data: [] };
    }
  })

  // 5A-1. DETAIL 1 FAKTUR PEMBELIAN LENGKAP DENGAN ITEM ROWS & RIWAYAT PEMBAYARAN
  .get("/purchases/:id", async ({ params }) => {
    try {
      const [invoice] = await db
        .select({
          id: schema.purchaseInvoices.id,
          branchId: schema.purchaseInvoices.branchId,
          branchName: schema.branches.name,
          supplierId: schema.purchaseInvoices.supplierId,
          supplierName: schema.suppliers.name,
          purchaseOrderId: schema.purchaseInvoices.purchaseOrderId,
          poNumber: schema.purchaseOrders.poNumber,
          invoiceNumber: schema.purchaseInvoices.invoiceNumber,
          receiveDate: schema.purchaseInvoices.receiveDate,
          invoiceDate: schema.purchaseInvoices.invoiceDate,
          dueDate: schema.purchaseInvoices.dueDate,
          isCredit: schema.purchaseInvoices.isCredit,
          subtotal: schema.purchaseInvoices.subtotal,
          discountAmount: schema.purchaseInvoices.discountAmount,
          taxAmount: schema.purchaseInvoices.taxAmount,
          grandTotal: schema.purchaseInvoices.grandTotal,
          paidAmount: schema.purchaseInvoices.paidAmount,
          isPaidOff: schema.purchaseInvoices.isPaidOff
        })
        .from(schema.purchaseInvoices)
        .leftJoin(schema.suppliers, eq(schema.purchaseInvoices.supplierId, schema.suppliers.id))
        .leftJoin(schema.branches, eq(schema.purchaseInvoices.branchId, schema.branches.id))
        .leftJoin(schema.purchaseOrders, eq(schema.purchaseInvoices.purchaseOrderId, schema.purchaseOrders.id))
        .where(eq(schema.purchaseInvoices.id, params.id))
        .limit(1);

      if (!invoice) {
        return { success: false, error: "Faktur pembelian tidak ditemukan" };
      }

      const items = await db
        .select({
          id: schema.purchaseInvoiceItems.id,
          productId: schema.purchaseInvoiceItems.productId,
          productName: schema.products.name,
          batchNo: schema.productBatches.batchNo,
          expiredDate: schema.productBatches.expiredDate,
          unit: schema.purchaseInvoiceItems.unitName,
          qty: schema.purchaseInvoiceItems.qty,
          buyPrice: schema.purchaseInvoiceItems.buyPrice,
          disc1: schema.purchaseInvoiceItems.discountPercent,
          discountAmount: schema.purchaseInvoiceItems.discountAmount,
          subtotal: schema.purchaseInvoiceItems.subtotal
        })
        .from(schema.purchaseInvoiceItems)
        .leftJoin(schema.products, eq(schema.purchaseInvoiceItems.productId, schema.products.id))
        .leftJoin(schema.productBatches, eq(schema.purchaseInvoiceItems.batchId, schema.productBatches.id))
        .where(eq(schema.purchaseInvoiceItems.invoiceId, invoice.id))
        .orderBy(schema.purchaseInvoiceItems.lineNo);

      const payments = await db
        .select({
          id: schema.debtPayments.id,
          paymentNumber: schema.debtPayments.paymentNumber,
          paymentDate: schema.debtPayments.paymentDate,
          paymentMethod: schema.debtPayments.paymentMethod,
          amountPaid: schema.debtPayments.amountPaid
        })
        .from(schema.debtPayments)
        .where(eq(schema.debtPayments.purchaseInvoiceId, invoice.id))
        .orderBy(desc(schema.debtPayments.paymentDate));

      return {
        success: true,
        data: {
          ...invoice,
          subtotal: Number(invoice.subtotal),
          discountAmount: Number(invoice.discountAmount),
          taxAmount: Number(invoice.taxAmount),
          grandTotal: Number(invoice.grandTotal),
          totalAmount: Number(invoice.grandTotal),
          paidAmount: Number(invoice.paidAmount),
          itemsCount: items.length,
          taxPercent: 11,
          notes: "Faktur Pembelian PBF Terverifikasi",
          items: items.map((it) => ({
            productId: it.productId,
            productName: it.productName || "Obat",
            batchNo: it.batchNo || "BATCH",
            expiredDate: it.expiredDate || "-",
            unit: it.unit,
            qty: Number(it.qty),
            hna: Number(it.buyPrice),
            disc1: Number(it.disc1),
            disc2: 0,
            subtotal: Number(it.subtotal)
          })),
          payments: payments.map((p) => ({
            paymentNumber: p.paymentNumber,
            paymentDate: p.paymentDate,
            paymentMethod: p.paymentMethod,
            amountPaid: Number(p.amountPaid)
          }))
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 5A-2. BATALKAN / VOID FAKTUR PEMBELIAN (REVERSI STOK, PULIHKAN SP, & AUDIT TRAIL)
  .delete("/purchases/:id", async ({ params }) => {
    try {
      const [invoice] = await db
        .select()
        .from(schema.purchaseInvoices)
        .where(eq(schema.purchaseInvoices.id, params.id))
        .limit(1);

      if (!invoice) {
        return { success: false, error: "Faktur pembelian tidak ditemukan" };
      }

      const [paymentCount] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.debtPayments)
        .where(eq(schema.debtPayments.purchaseInvoiceId, invoice.id));

      if (Number(invoice.paidAmount) > 0 || Number(paymentCount?.count || 0) > 0) {
        return {
          success: false,
          error: "Faktur yang sudah memiliki riwayat pembayaran tidak dapat dihapus langsung. Batalkan pembayaran terlebih dahulu."
        };
      }

      const now = new Date();
      let restoredPoStatus: string | null = null;
      let restoredPoNumber: string | null = null;

      await db.transaction(async (tx) => {
        const items = await tx
          .select()
          .from(schema.purchaseInvoiceItems)
          .where(eq(schema.purchaseInvoiceItems.invoiceId, invoice.id));

        // 1. Validasi stok batch mencukupi sebelum menarik stok (cegah void faktur yang sudah terjual)
        for (const item of items) {
          const qtyBase = Number(item.qtyBase || 0);
          if (qtyBase <= 0) continue;

          if (item.batchId) {
            const [batchStock] = await tx
              .select()
              .from(schema.branchBatchStocks)
              .where(
                and(
                  eq(schema.branchBatchStocks.branchId, invoice.branchId),
                  eq(schema.branchBatchStocks.locationId, item.locationId),
                  eq(schema.branchBatchStocks.productId, item.productId),
                  eq(schema.branchBatchStocks.batchId, item.batchId)
                )
              )
              .limit(1);

            const availableBatch = Number(batchStock?.qtyBase || 0);
            if (!batchStock || availableBatch < qtyBase - 0.0001) {
              throw new Error(
                `Faktur ${invoice.invoiceNumber} tidak dapat dibatalkan karena sebagian stok batch dari faktur ini sudah berkurang atau terjual (tersedia ${availableBatch}, dibutuhkan ${qtyBase}).`
              );
            }
          }
        }

        // 2. Reversi stok fisik per item, tulis stock_ledger, dan sentuh updatedAt produk
        for (const item of items) {
          const qtyBase = Number(item.qtyBase || 0);
          if (item.batchId) {
            const [batchStock] = await tx
              .select()
              .from(schema.branchBatchStocks)
              .where(
                and(
                  eq(schema.branchBatchStocks.branchId, invoice.branchId),
                  eq(schema.branchBatchStocks.locationId, item.locationId),
                  eq(schema.branchBatchStocks.productId, item.productId),
                  eq(schema.branchBatchStocks.batchId, item.batchId)
                )
              )
              .limit(1);

            if (batchStock) {
              const newQty = Number(batchStock.qtyBase) - qtyBase;
              if (newQty <= 0.0001) {
                await tx
                  .delete(schema.branchBatchStocks)
                  .where(eq(schema.branchBatchStocks.id, batchStock.id));
              } else {
                await tx
                  .update(schema.branchBatchStocks)
                  .set({ qtyBase: String(newQty), updatedAt: now })
                  .where(eq(schema.branchBatchStocks.id, batchStock.id));
              }
            }
          }

          const [branchStock] = await tx
            .select()
            .from(schema.branchStocks)
            .where(
              and(
                eq(schema.branchStocks.locationId, item.locationId),
                eq(schema.branchStocks.productId, item.productId)
              )
            )
            .limit(1);

          if (branchStock) {
            const newTotal = Math.max(0, Number(branchStock.totalQtyBase) - qtyBase);
            await tx
              .update(schema.branchStocks)
              .set({ totalQtyBase: String(newTotal), updatedAt: now })
              .where(eq(schema.branchStocks.id, branchStock.id));
          }

          const voidFactor = Math.max(1, Number(item.conversionFactor || 1));
          const voidCostPerBase = Number(item.buyPrice || 0) / voidFactor;

          await tx.insert(schema.stockLedger).values({
            id: crypto.randomUUID(),
            tenantId: invoice.tenantId,
            branchId: invoice.branchId,
            locationId: item.locationId,
            productId: item.productId,
            batchId: item.batchId,
            mutationType: "PURCHASE_VOID",
            quantityBase: String(-qtyBase),
            costPerUnit: String(voidCostPerBase),
            referenceId: invoice.id,
            notes: `Pembatalan / Void Faktur Pembelian ${invoice.invoiceNumber}`,
            createdBy: invoice.receivedBy || invoice.tenantId,
            createdAt: now
          });

          await tx
            .update(schema.products)
            .set({ updatedAt: now })
            .where(eq(schema.products.id, item.productId));
        }

        // 3. Cari SP terkait (via purchaseOrderId atau fallback tag catatan faktur di purchase_order_items)
        let targetPoId = invoice.purchaseOrderId || null;
        if (!targetPoId) {
          const noteNeedle = `%[Faktur ${invoice.invoiceNumber}:%`;
          const [matchedPoItem] = await tx
            .select({ purchaseOrderId: schema.purchaseOrderItems.purchaseOrderId })
            .from(schema.purchaseOrderItems)
            .where(sql`${schema.purchaseOrderItems.notes} ILIKE ${noteNeedle}`)
            .limit(1);
          if (matchedPoItem) {
            targetPoId = matchedPoItem.purchaseOrderId;
          }
        }

        // 4. Hapus item faktur & header faktur
        await tx.delete(schema.purchaseInvoiceItems).where(eq(schema.purchaseInvoiceItems.invoiceId, invoice.id));
        await tx.delete(schema.purchaseInvoices).where(eq(schema.purchaseInvoices.id, invoice.id));

        // 5. Pulihkan qtyReceived, catatan, dan status Surat Pesanan (PO) terkait
        if (targetPoId) {
          const [poHeader] = await tx
            .select()
            .from(schema.purchaseOrders)
            .where(eq(schema.purchaseOrders.id, targetPoId))
            .limit(1);

          if (poHeader) {
            restoredPoNumber = poHeader.poNumber;
            const remainingInvoices = await tx
              .select({ id: schema.purchaseInvoices.id })
              .from(schema.purchaseInvoices)
              .where(eq(schema.purchaseInvoices.purchaseOrderId, targetPoId));

            const remainingQtyByProduct = new Map<string, number>();
            if (remainingInvoices.length > 0) {
              const remInvIds = remainingInvoices.map((r) => r.id);
              const remInvItems = await tx
                .select({
                  productId: schema.purchaseInvoiceItems.productId,
                  qty: schema.purchaseInvoiceItems.qty
                })
                .from(schema.purchaseInvoiceItems)
                .where(sql`${schema.purchaseInvoiceItems.invoiceId} IN ${remInvIds}`);

              for (const rit of remInvItems) {
                remainingQtyByProduct.set(
                  rit.productId,
                  (remainingQtyByProduct.get(rit.productId) || 0) + Number(rit.qty || 0)
                );
              }
            }

            const poItems = await tx
              .select()
              .from(schema.purchaseOrderItems)
              .where(eq(schema.purchaseOrderItems.purchaseOrderId, targetPoId))
              .orderBy(schema.purchaseOrderItems.lineNo);

            let allFulfilled = poItems.length > 0;
            let anyReceived = false;

            for (let idx = 0; idx < poItems.length; idx++) {
              const pit = poItems[idx];
              const ordered = Number(pit.qtyOrdered || 0);
              const availForProd = remainingQtyByProduct.get(pit.productId) || 0;
              const isLastRowForProd = !poItems.slice(idx + 1).some((x) => x.productId === pit.productId);
              const newReceived = isLastRowForProd ? availForProd : Math.min(ordered, availForProd);
              remainingQtyByProduct.set(pit.productId, Math.max(0, availForProd - newReceived));

              if (newReceived > 0) anyReceived = true;
              if (newReceived < ordered) allFulfilled = false;

              const cleanedNotes = (pit.notes || "")
                .split(" | ")
                .map((s) => s.trim())
                .filter((s) => s && !s.startsWith(`[Faktur ${invoice.invoiceNumber}:`))
                .join(" | ");

              await tx
                .update(schema.purchaseOrderItems)
                .set({
                  qtyReceived: String(newReceived),
                  notes: cleanedNotes || null
                })
                .where(eq(schema.purchaseOrderItems.id, pit.id));
            }

            restoredPoStatus = allFulfilled ? "RECEIVED" : anyReceived ? "PARTIAL" : "ORDERED";
            await tx
              .update(schema.purchaseOrders)
              .set({ status: restoredPoStatus })
              .where(eq(schema.purchaseOrders.id, targetPoId));
          }
        }
      });

      const poSuffix = restoredPoNumber
        ? ` dan status ${restoredPoNumber} dikembalikan ke ${restoredPoStatus}.`
        : ".";

      return {
        success: true,
        message: `Faktur Pembelian ${invoice.invoiceNumber} berhasil dibatalkan, stok ditarik kembali${poSuffix}`
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 5B. INPUT FAKTUR PEMBELIAN MASUK PBF (GOOD RECEIPT & AUTO-FILL STOK KELOMPOK C)
  .post("/purchases", async ({ body }: { body: any }) => {
    try {
      const isUuid = (val?: string) =>
        Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

      // 1. Resolve Tenant
      const [t] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      if (!t) throw new Error("Tenant aktif tidak ditemukan");
      const tenantId = t.id;

      // 2. Resolve Branch
      let branchId = isUuid(body.branchId) ? body.branchId : undefined;
      if (!branchId) {
        const [b] = await db
          .select({ id: schema.branches.id })
          .from(schema.branches)
          .where(eq(schema.branches.tenantId, tenantId))
          .limit(1);
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

      // 4. Resolve Supplier
      let supplierId = isUuid(body.supplierId) ? body.supplierId : undefined;
      if (!supplierId && body.supplierName) {
        const [s] = await db
          .select({ id: schema.suppliers.id })
          .from(schema.suppliers)
          .where(sql`${schema.suppliers.name} ILIKE ${body.supplierName}`)
          .limit(1);
        if (s) supplierId = s.id;
      }
      if (!supplierId) {
        const [anySup] = await db.select({ id: schema.suppliers.id }).from(schema.suppliers).limit(1);
        supplierId = anySup ? anySup.id : crypto.randomUUID();
      }

      // 5. Resolve User (ReceivedBy)
      const [u] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
      const receivedBy = u ? u.id : crypto.randomUUID();

      const invoiceId = crypto.randomUUID();
      const invoiceNumber = (body.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`).trim().toUpperCase();
      const now = new Date();
      const receiveDate = body.receiveDate || now.toISOString().slice(0, 10);
      const invoiceDate = body.invoiceDate || receiveDate;
      const dueDate = body.dueDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const subtotal = Number(body.subtotal || 0);
      const discountAmount = Number(body.discountAmount || 0);
      const taxAmount = Number(body.taxAmount || 0);
      const grandTotal = Number(body.grandTotal || (subtotal - discountAmount + taxAmount));

      // Jalankan transaksi database atomik
      const result = await db.transaction(async (tx) => {
        // Resolve Surat Pesanan (PO) lebih awal agar purchaseOrderId pada faktur selalu terisi konsisten
        let targetPoId: string | null = null;
        if (body.purchaseOrderId && isUuid(body.purchaseOrderId)) {
          targetPoId = body.purchaseOrderId;
        } else if (body.poNumber && body.poNumber !== "NONE") {
          const [foundPo] = await tx
            .select({ id: schema.purchaseOrders.id })
            .from(schema.purchaseOrders)
            .where(
              and(
                eq(schema.purchaseOrders.tenantId, tenantId),
                eq(schema.purchaseOrders.poNumber, body.poNumber)
              )
            )
            .limit(1);
          if (foundPo) targetPoId = foundPo.id;
        }

        // A. Insert ke purchase_invoices
        const [createdInvoice] = await tx
          .insert(schema.purchaseInvoices)
          .values({
            id: invoiceId,
            tenantId,
            branchId,
            supplierId,
            purchaseOrderId: targetPoId,
            invoiceNumber,
            receiveDate,
            invoiceDate,
            dueDate,
            isCredit: body.isCredit ?? true,
            subtotal: String(subtotal),
            discountAmount: String(discountAmount),
            taxAmount: String(taxAmount),
            grandTotal: String(grandTotal),
            paidAmount: "0",
            isPaidOff: false,
            receivedBy
          })
          .returning();

        const rawItems = Array.isArray(body.items) ? body.items : [];
        let lineNo = 1;
        const insertedItems = [];

        for (const item of rawItems) {
          const isItemRejected = Boolean(item.isRejected || Number(item.qty || 0) <= 0);
          if (isItemRejected) {
            // Lewati pencatatan stok dan faktur hutang untuk barang yang ditolak / kosong
            continue;
          }

          // Resolve Product ID
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

          const batchNo = (item.batchNo || item.batchNumber || `BCH-${Date.now().toString().slice(-4)}`).trim().toUpperCase();
          const expDate = item.expiredDate || item.expiryDate || "2027-12-31";
          const rawUnitName = String(item.unitName || item.unit || "").trim().toUpperCase();

          // Resolve authoritative conversionFactor dari product_units sesuai satuan faktur (mis. BOX = 100 TABLET)
          const prodUnits = await tx
            .select()
            .from(schema.productUnits)
            .where(eq(schema.productUnits.productId, productId));
          const matchedUnit =
            prodUnits.find((pu) => String(pu.unitName || "").trim().toUpperCase() === rawUnitName) ||
            prodUnits.find((pu) => pu.isBaseUnit) ||
            prodUnits[0];

          const unitName = matchedUnit?.unitName || rawUnitName || "BOX";
          const dbFactor = matchedUnit ? Number(matchedUnit.conversionFactor || 1) : 1;
          const conversionFactor = Math.max(
            1,
            dbFactor > 1 ? dbFactor : Number(item.conversionFactor || dbFactor || 1)
          );
          const qty = Number(item.qty || 1);
          const qtyBase =
            item.qtyBase && Number(item.qtyBase) >= qty * conversionFactor
              ? Number(item.qtyBase)
              : qty * conversionFactor;
          const buyPrice = Number(item.buyPrice || 0);
          const costPerBase = conversionFactor > 0 ? buyPrice / conversionFactor : buyPrice;
          const itemDiscountPercent = Number(item.discountPercent || 0);
          const itemDiscountAmount = Number(item.discountAmount || 0);
          const itemSubtotal = Number(item.subtotal || (qty * buyPrice - itemDiscountAmount));

          // B. Resolve or Insert into product_batches
          let batchId: string;
          const [existingBatch] = await tx
            .select({ id: schema.productBatches.id })
            .from(schema.productBatches)
            .where(
              and(
                eq(schema.productBatches.productId, productId),
                eq(schema.productBatches.batchNo, batchNo)
              )
            )
            .limit(1);

          if (existingBatch) {
            batchId = existingBatch.id;
          } else {
            batchId = crypto.randomUUID();
            await tx.insert(schema.productBatches).values({
              id: batchId,
              tenantId,
              productId,
              batchNo,
              expiredDate: expDate
            });
          }

          // C. Insert ke purchase_invoice_items (buyPrice = harga beli per unitName faktur)
          const itemId = crypto.randomUUID();
          await tx.insert(schema.purchaseInvoiceItems).values({
            id: itemId,
            invoiceId,
            productId,
            locationId,
            batchId,
            lineNo: lineNo++,
            unitName,
            conversionFactor: String(conversionFactor),
            qty: String(qty),
            qtyBase: String(qtyBase),
            buyPrice: String(buyPrice),
            discountPercent: String(itemDiscountPercent),
            discountAmount: String(itemDiscountAmount),
            subtotal: String(itemSubtotal)
          });

          // D. Update or Insert ke branch_batch_stocks (buyPrice = harga pokok per satuan dasar)
          const [existingBatchStock] = await tx
            .select({ id: schema.branchBatchStocks.id, qtyBase: schema.branchBatchStocks.qtyBase })
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
            const newBatchQty = Number(existingBatchStock.qtyBase || 0) + qtyBase;
            await tx
              .update(schema.branchBatchStocks)
              .set({
                qtyBase: String(newBatchQty),
                buyPrice: String(costPerBase),
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
              qtyBase: String(qtyBase),
              buyPrice: String(costPerBase),
              updatedAt: new Date()
            });
          }

          // E. Update or Insert ke branch_stocks (Saldo Total Stok per Produk di Lokasi)
          const [existingBranchStock] = await tx
            .select({ id: schema.branchStocks.id, totalQtyBase: schema.branchStocks.totalQtyBase })
            .from(schema.branchStocks)
            .where(
              and(
                eq(schema.branchStocks.locationId, locationId),
                eq(schema.branchStocks.productId, productId)
              )
            )
            .limit(1);

          if (existingBranchStock) {
            const newTotalQty = Number(existingBranchStock.totalQtyBase || 0) + qtyBase;
            await tx
              .update(schema.branchStocks)
              .set({
                totalQtyBase: String(newTotalQty),
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
              totalQtyBase: String(qtyBase),
              unbatchedQtyBase: "0",
              updatedAt: new Date()
            });
          }

          // F. Catat Buku Besar Audit Trail (stock_ledger)
          await tx.insert(schema.stockLedger).values({
            id: crypto.randomUUID(),
            tenantId,
            branchId,
            locationId,
            productId,
            batchId,
            mutationType: "PURCHASE_RECEIPT",
            quantityBase: String(qtyBase),
            costPerUnit: String(costPerBase),
            referenceId: invoiceId,
            notes: `Penerimaan Faktur ${invoiceNumber} dari PBF (${qty} ${unitName} = ${qtyBase} satuan dasar)`,
            createdBy: receivedBy,
            createdAt: now
          });

          // G. Auto-update Master Produk
          await tx
            .update(schema.products)
            .set({
              updatedAt: new Date()
            })
            .where(eq(schema.products.id, productId));

          insertedItems.push({
            productId,
            batchId,
            batchNo,
            qtyBase,
            buyPrice
          });
        }

        // H. Rekonsiliasi Pesanan (Discrepancy Resolution) jika terkait Surat Pesanan (PO)
        if (targetPoId) {
          const poItems = await tx
            .select()
            .from(schema.purchaseOrderItems)
            .where(eq(schema.purchaseOrderItems.purchaseOrderId, targetPoId));

          const discrepancies: string[] = [];

          for (const item of rawItems) {
            let matchingPoItem = null;
            if (item.poItemId && isUuid(item.poItemId)) {
              matchingPoItem = poItems.find((p) => p.id === item.poItemId);
            }
            if (!matchingPoItem && item.productId) {
              matchingPoItem = poItems.find((p) => p.productId === item.productId);
            }

            if (matchingPoItem) {
              const prevReceived = Number(matchingPoItem.qtyReceived || 0);
              const isItemRejected = Boolean(item.isRejected || Number(item.qty || 0) <= 0);
              const qtyAccepted = isItemRejected ? 0 : Number(item.qty || 0);
              const newReceived = prevReceived + qtyAccepted;
              const ordered = Number(matchingPoItem.qtyOrdered || 0);

              let noteAppend = "";
              if (isItemRejected) {
                const reason = item.discrepancyReason || "Ditolak saat pemeriksaan fisik";
                noteAppend = `[Faktur ${invoiceNumber}: Ditolak (${reason})]`;
                discrepancies.push(`${matchingPoItem.unitName}: Ditolak (${reason})`);
              } else if (newReceived < ordered) {
                const remaining = ordered - newReceived;
                noteAppend = `[Faktur ${invoiceNumber}: Terima ${qtyAccepted}/${ordered} (Sisa ${remaining})]`;
                discrepancies.push(`${matchingPoItem.unitName}: Kurang ${remaining}`);
              } else if (newReceived > ordered) {
                const bonus = newReceived - ordered;
                noteAppend = `[Faktur ${invoiceNumber}: Lebih kirim (+${bonus})]`;
              } else {
                noteAppend = `[Faktur ${invoiceNumber}: Lengkap (${newReceived}/${ordered})]`;
              }

              const existingNotes = matchingPoItem.notes || "";
              const updatedNotes = existingNotes ? `${existingNotes} | ${noteAppend}` : noteAppend;

              await tx
                .update(schema.purchaseOrderItems)
                .set({
                  qtyReceived: String(newReceived),
                  notes: updatedNotes
                })
                .where(eq(schema.purchaseOrderItems.id, matchingPoItem.id));
            }
          }

          // Periksa pemenuhan seluruh item SP
          const updatedPoItems = await tx
            .select({
              qtyOrdered: schema.purchaseOrderItems.qtyOrdered,
              qtyReceived: schema.purchaseOrderItems.qtyReceived
            })
            .from(schema.purchaseOrderItems)
            .where(eq(schema.purchaseOrderItems.purchaseOrderId, targetPoId));

          let allFulfilled = true;
          let anyReceived = false;

          for (const pit of updatedPoItems) {
            const ord = Number(pit.qtyOrdered || 0);
            const rcv = Number(pit.qtyReceived || 0);
            if (rcv > 0) anyReceived = true;
            if (rcv < ord) {
              allFulfilled = false;
            }
          }

          let poStatus = "ORDERED";
          if (allFulfilled && updatedPoItems.length > 0) {
            poStatus = "RECEIVED";
          } else if (anyReceived) {
            poStatus = "PARTIAL";
          }

          await tx
            .update(schema.purchaseOrders)
            .set({ status: poStatus })
            .where(eq(schema.purchaseOrders.id, targetPoId));
        }

        return {
          invoice: createdInvoice,
          itemsCount: insertedItems.length
        };
      });

      return {
        success: true,
        message: `Faktur Pembelian ${invoiceNumber} berhasil dicatat. Stok batch dan buku besar (stock_ledger) telah otomatis terisi.`,
        data: result
      };
    } catch (err: any) {
      console.error("[ERP POST /purchases error]:", err);
      return { success: false, error: err.message };
    }
  })

  // 6. SURAT PESANAN (PURCHASE ORDERS / SP)
  .get("/purchase-orders", async ({ query }) => {
    try {
      const limit = Number(query.limit || 100);
      const orders = await db
        .select({
          id: schema.purchaseOrders.id,
          poNumber: schema.purchaseOrders.poNumber,
          orderDate: schema.purchaseOrders.orderDate,
          status: schema.purchaseOrders.status,
          totalAmount: schema.purchaseOrders.totalAmount,
          notes: schema.purchaseOrders.notes,
          supplierName: schema.suppliers.name,
          supplierId: schema.suppliers.id,
          branchName: schema.branches.name,
          branchId: schema.branches.id
        })
        .from(schema.purchaseOrders)
        .leftJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
        .leftJoin(schema.branches, eq(schema.purchaseOrders.branchId, schema.branches.id))
        .orderBy(desc(schema.purchaseOrders.orderDate))
        .limit(limit);

      // Ambil seluruh items untuk PO yang ditemukan
      const orderIds = orders.map((o) => o.id);
      let itemsMap = new Map<string, any[]>();

      if (orderIds.length > 0) {
        const allItems = await db
          .select({
            id: schema.purchaseOrderItems.id,
            purchaseOrderId: schema.purchaseOrderItems.purchaseOrderId,
            productId: schema.purchaseOrderItems.productId,
            productName: schema.products.name,
            lineNo: schema.purchaseOrderItems.lineNo,
            unitName: schema.purchaseOrderItems.unitName,
            qtyOrdered: schema.purchaseOrderItems.qtyOrdered,
            qtyReceived: schema.purchaseOrderItems.qtyReceived,
            estimatedPrice: schema.purchaseOrderItems.estimatedPrice,
            subtotal: schema.purchaseOrderItems.subtotal,
            notes: schema.purchaseOrderItems.notes
          })
          .from(schema.purchaseOrderItems)
          .leftJoin(schema.products, eq(schema.purchaseOrderItems.productId, schema.products.id))
          .where(sql`${schema.purchaseOrderItems.purchaseOrderId} IN ${orderIds}`);

        for (const it of allItems) {
          const list = itemsMap.get(it.purchaseOrderId) || [];
          const ordered = Number(it.qtyOrdered || 0);
          const received = Number(it.qtyReceived || 0);
          list.push({
            id: it.id,
            productId: it.productId,
            productName: it.productName || "Obat Pesanan",
            unit: it.unitName,
            qty: ordered,
            qtyOrdered: ordered,
            qtyReceived: received,
            qtyRemaining: Math.max(0, ordered - received),
            estimatedHna: Number(it.estimatedPrice),
            subtotal: Number(it.subtotal),
            notes: it.notes || ""
          });
          itemsMap.set(it.purchaseOrderId, list);
        }
      }

      return {
        success: true,
        data: orders.map((o) => {
          const items = itemsMap.get(o.id) || [];
          return {
            id: o.id,
            orderNumber: o.poNumber,
            orderType: o.notes || "REGULER",
            supplierId: o.supplierId || "supp-1",
            supplierName: o.supplierName || "PT. Kimia Farma Trading & Distribution",
            branchId: o.branchId || "1",
            branchName: o.branchName || "Apotek Hafidz Farma 1",
            orderDate: o.orderDate,
            status: o.status,
            pharmacistName: "apt. Ghina Nadhifah, S.Farm.",
            sipa: "500.16.7.2/0289/SIPA/DPMPTSP/II/2026",
            totalItems: items.length > 0 ? items.length : 1,
            estimatedAmount: Number(o.totalAmount || 0),
            items
          };
        })
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 6B. GET DETAIL 1 SURAT PESANAN (UNTUK CETAK SP RESMI BPOM)
  .get("/purchase-orders/:id", async ({ params }) => {
    try {
      const [order] = await db
        .select({
          id: schema.purchaseOrders.id,
          poNumber: schema.purchaseOrders.poNumber,
          orderDate: schema.purchaseOrders.orderDate,
          status: schema.purchaseOrders.status,
          totalAmount: schema.purchaseOrders.totalAmount,
          notes: schema.purchaseOrders.notes,
          supplierName: schema.suppliers.name,
          supplierAddress: schema.suppliers.address,
          supplierPhone: schema.suppliers.phone,
          branchName: schema.branches.name,
          branchAddress: schema.branches.address
        })
        .from(schema.purchaseOrders)
        .leftJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
        .leftJoin(schema.branches, eq(schema.purchaseOrders.branchId, schema.branches.id))
        .where(eq(schema.purchaseOrders.id, params.id))
        .limit(1);

      if (!order) {
        return { success: false, error: "Surat Pesanan tidak ditemukan" };
      }

      const items = await db
        .select({
          id: schema.purchaseOrderItems.id,
          productId: schema.purchaseOrderItems.productId,
          productName: schema.products.name,
          lineNo: schema.purchaseOrderItems.lineNo,
          unitName: schema.purchaseOrderItems.unitName,
          qtyOrdered: schema.purchaseOrderItems.qtyOrdered,
          qtyReceived: schema.purchaseOrderItems.qtyReceived,
          estimatedPrice: schema.purchaseOrderItems.estimatedPrice,
          subtotal: schema.purchaseOrderItems.subtotal,
          notes: schema.purchaseOrderItems.notes
        })
        .from(schema.purchaseOrderItems)
        .leftJoin(schema.products, eq(schema.purchaseOrderItems.productId, schema.products.id))
        .where(eq(schema.purchaseOrderItems.purchaseOrderId, order.id))
        .orderBy(schema.purchaseOrderItems.lineNo);

      return {
        success: true,
        data: {
          ...order,
          items: items.map((it) => {
            const ord = Number(it.qtyOrdered || 0);
            const rcv = Number(it.qtyReceived || 0);
            return {
              id: it.id,
              productId: it.productId,
              productName: it.productName || "Obat",
              unit: it.unitName,
              qty: ord,
              qtyOrdered: ord,
              qtyReceived: rcv,
              qtyRemaining: Math.max(0, ord - rcv),
              estimatedHna: Number(it.estimatedPrice),
              subtotal: Number(it.subtotal),
              notes: it.notes || ""
            };
          })
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 7. BUAT SURAT PESANAN (PO) BARU BESERTA DETAIL ITEMS
  .post("/purchase-orders", async ({ body }: { body: any }) => {
    try {
      const isUuid = (val?: string) =>
        Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

      const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      if (!tenant) throw new Error("Tenant not found");

      // Resolve branch
      let branchId = isUuid(body.branchId) ? body.branchId : undefined;
      if (!branchId) {
        const [b] = await db.select({ id: schema.branches.id }).from(schema.branches).limit(1);
        branchId = b ? b.id : crypto.randomUUID();
      }

      // Resolve supplier
      let supplierId = isUuid(body.supplierId) ? body.supplierId : undefined;
      if (!supplierId && body.supplierName) {
        const [s] = await db
          .select({ id: schema.suppliers.id })
          .from(schema.suppliers)
          .where(sql`${schema.suppliers.name} ILIKE ${body.supplierName}`)
          .limit(1);
        if (s) supplierId = s.id;
      }
      if (!supplierId) {
        const [anySup] = await db.select({ id: schema.suppliers.id }).from(schema.suppliers).limit(1);
        supplierId = anySup ? anySup.id : crypto.randomUUID();
      }

      const [adminUser] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
      const createdBy = adminUser ? adminUser.id : crypto.randomUUID();
      const poId = crypto.randomUUID();

      let poNumber = (
        body.poNumber ||
        (body.orderType === "KONSINYASI"
          ? `SP-KSN-HF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
          : generateOrderNumber(body.orderType || "REGULER"))
      ).trim();
      let isDuplicate = true;
      let counter = 1;
      const basePoNumber = poNumber;

      while (isDuplicate) {
        const [existing] = await db
          .select({ id: schema.purchaseOrders.id })
          .from(schema.purchaseOrders)
          .where(and(eq(schema.purchaseOrders.tenantId, tenant.id), eq(schema.purchaseOrders.poNumber, poNumber)))
          .limit(1);

        if (!existing) {
          isDuplicate = false;
        } else {
          poNumber = `${basePoNumber}-${String(counter++).padStart(2, "0")}`;
        }
      }

      const orderDate = body.orderDate || new Date().toISOString().slice(0, 10);
      const rawItems = Array.isArray(body.items) ? body.items : [];

      const totalAmount = rawItems.reduce(
        (sum: number, it: any) => sum + (Number(it.qty || 1) * Number(it.estimatedHna || it.buyPrice || 0)),
        0
      );

      const result = await db.transaction(async (tx) => {
        // A. Insert PO Header
        const [createdOrder] = await tx
          .insert(schema.purchaseOrders)
          .values({
            id: poId,
            tenantId: tenant.id,
            branchId,
            supplierId,
            poNumber,
            orderDate,
            status: "ORDERED",
            totalAmount: String(body.totalAmount || totalAmount),
            notes: body.orderType || "REGULER",
            createdBy
          })
          .returning();

        // B. Insert PO Items
        let lineNo = 1;
        const insertedItems = [];

        for (const item of rawItems) {
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

          const qty = Number(item.qty || 1);
          const price = Number(item.estimatedHna || item.buyPrice || 0);
          const itemSubtotal = qty * price;

          const [insertedItem] = await tx
            .insert(schema.purchaseOrderItems)
            .values({
              id: crypto.randomUUID(),
              purchaseOrderId: poId,
              productId,
              lineNo: lineNo++,
              unitName: item.unit || item.unitName || "BOX",
              qtyOrdered: String(qty),
              qtyReceived: "0",
              estimatedPrice: String(price),
              subtotal: String(itemSubtotal),
              notes: item.notes || null
            })
            .returning();

          insertedItems.push(insertedItem);
        }

        return {
          order: createdOrder,
          items: insertedItems
        };
      });

      return {
        success: true,
        message: `Surat Pesanan ${poNumber} berhasil diterbitkan dengan ${result.items.length} item obat.`,
        data: result
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 8. LIST KONSINYASI MASUK (TERINTEGRASI DENGAN STOK & PENJUALAN POS RIIL)
  .get("/consignments", async ({ query }) => {
    try {
      const list = await consignmentService.listConsignments(query?.branchId);
      return {
        success: true,
        data: list
      };
    } catch (err: any) {
      return { success: false, error: err.message, data: [] };
    }
  })

  // 8A. RIWAYAT SETORAN & RETUR KONSINYASI
  .get("/consignments/settlements", async ({ query }) => {
    try {
      const data = await consignmentService.listSettlements(query?.branchId);
      return {
        success: true,
        data
      };
    } catch (err: any) {
      return { success: false, error: err.message, data: [] };
    }
  })

  // 8B. PENERIMAAN KONSINYASI TITIPAN BARU (+ TAMBAH STOK BATCH & KARTU STOK)
  .post("/consignments", async ({ body }: { body: any }) => {
    try {
      const result = await consignmentService.createConsignment(body);
      return {
        success: true,
        message: `Penerimaan titipan konsinyasi ${result.receiptNumber} (${result.itemsCount} item) berhasil disimpan & stok jual langsung bertambah.`,
        data: result
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 8C. PENYETORAN BAGI HASIL & RETUR SISA KONSINYASI (+ CATAT KE /keuangan)
  .post("/consignments/:id/settle", async ({ params, body }: { params: { id: string }; body: any }) => {
    try {
      const result = await consignmentService.settleConsignment(params.id, body || {});
      return {
        success: true,
        message: `Setoran konsinyasi ${result.settlementNumber} berhasil dicatat (${result.soldQtySettled} terjual dibayar${result.returnedQty > 0 ? `, ${result.returnedQty} diretur` : ""}).`,
        data: result
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 8D. BATALKAN / HAPUS PENERIMAAN KONSINYASI (JIKA BELUM ADA PENJUALAN/SETORAN)
  .delete("/consignments/:id", async ({ params }: { params: { id: string } }) => {
    try {
      const result = await consignmentService.deleteConsignment(params.id);
      return {
        success: true,
        message: `Titipan konsinyasi ${result.receiptNumber} berhasil dibatalkan & saldo stok telah ditarik kembali.`
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
