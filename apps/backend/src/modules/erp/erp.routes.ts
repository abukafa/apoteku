import { Elysia } from "elysia";
import { db, schema } from "@apoteku/db";
import { desc, count, sql, eq, and } from "drizzle-orm";
import { generateOrderNumber } from "@apoteku/core";

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
          address: s.address || "",
          topDays: s.paymentTermDays,
          contactPerson: s.contactPerson || "",
          pbfLicense: s.code
        }))
      };
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

  // 4. RIWAYAT PENJUALAN KASIR
  .get("/sales", async ({ query }) => {
    try {
      const limit = Number(query.limit || 100);
      const sales = await db
        .select()
        .from(schema.salesTransactions)
        .orderBy(desc(schema.salesTransactions.createdAt))
        .limit(limit);

      return {
        success: true,
        data: sales.map((s) => ({
          id: s.id,
          invoiceNumber: s.invoiceNo,
          transactionTime: s.createdAt.toISOString(),
          customerType: s.customerType,
          paymentMethod: s.paymentMethod,
          subtotal: Number(s.subtotal),
          discountAmount: Number(s.discountAmount),
          taxAmount: Number(s.taxAmount),
          grandTotal: Number(s.grandTotal),
          paidAmount: Number(s.paidAmount),
          changeAmount: Number(s.changeAmount)
        }))
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 5. FAKTUR PEMBELIAN PBF
  .get("/purchases", async ({ query }) => {
    try {
      const limit = Number(query.limit || 100);
      const purchases = await db
        .select({
          id: schema.purchaseInvoices.id,
          invoiceNumber: schema.purchaseInvoices.invoiceNumber,
          receiveDate: schema.purchaseInvoices.receiveDate,
          dueDate: schema.purchaseInvoices.dueDate,
          isCredit: schema.purchaseInvoices.isCredit,
          subtotal: schema.purchaseInvoices.subtotal,
          discountAmount: schema.purchaseInvoices.discountAmount,
          taxAmount: schema.purchaseInvoices.taxAmount,
          grandTotal: schema.purchaseInvoices.grandTotal,
          paidAmount: schema.purchaseInvoices.paidAmount,
          isPaidOff: schema.purchaseInvoices.isPaidOff,
          supplierName: schema.suppliers.name
        })
        .from(schema.purchaseInvoices)
        .leftJoin(
          schema.suppliers,
          eq(schema.purchaseInvoices.supplierId, schema.suppliers.id)
        )
        .orderBy(desc(schema.purchaseInvoices.receiveDate))
        .limit(limit);

      return {
        success: true,
        data: purchases.map((p) => ({
          id: p.id,
          invoiceNumber: p.invoiceNumber,
          receiveDate: p.receiveDate,
          dueDate: p.dueDate,
          supplierName: p.supplierName || "PBF",
          isCredit: p.isCredit,
          subtotal: Number(p.subtotal),
          discountAmount: Number(p.discountAmount),
          taxAmount: Number(p.taxAmount),
          grandTotal: Number(p.grandTotal),
          paidAmount: Number(p.paidAmount),
          isPaidOff: p.isPaidOff
        }))
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
        // A. Insert ke purchase_invoices
        const [createdInvoice] = await tx
          .insert(schema.purchaseInvoices)
          .values({
            id: invoiceId,
            tenantId,
            branchId,
            supplierId,
            purchaseOrderId: isUuid(body.purchaseOrderId) ? body.purchaseOrderId : null,
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
          const conversionFactor = Math.max(1, Number(item.conversionFactor || 1));
          const qty = Number(item.qty || 1);
          const qtyBase = Number(item.qtyBase || (qty * conversionFactor));
          const buyPrice = Number(item.buyPrice || 0);
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

          // C. Insert ke purchase_invoice_items
          const itemId = crypto.randomUUID();
          await tx.insert(schema.purchaseInvoiceItems).values({
            id: itemId,
            invoiceId,
            productId,
            locationId,
            batchId,
            lineNo: lineNo++,
            unitName: item.unitName || item.unit || "BOX",
            conversionFactor: String(conversionFactor),
            qty: String(qty),
            qtyBase: String(qtyBase),
            buyPrice: String(buyPrice),
            discountPercent: String(itemDiscountPercent),
            discountAmount: String(itemDiscountAmount),
            subtotal: String(itemSubtotal)
          });

          // D. Update or Insert ke branch_batch_stocks (Saldo Fisik Obat per Batch)
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
                buyPrice: String(buyPrice),
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
              buyPrice: String(buyPrice),
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
            costPerUnit: String(buyPrice),
            referenceId: invoiceId,
            notes: `Penerimaan Faktur ${invoiceNumber} dari PBF`,
            createdBy: receivedBy,
            createdAt: now
          });

          insertedItems.push({
            productId,
            batchId,
            batchNo,
            qtyBase,
            buyPrice
          });
        }

        // G. Jika ada PO Number / purchaseOrderId, update status PO ke 'RECEIVED'
        if (body.purchaseOrderId && isUuid(body.purchaseOrderId)) {
          await tx
            .update(schema.purchaseOrders)
            .set({ status: "RECEIVED" })
            .where(eq(schema.purchaseOrders.id, body.purchaseOrderId));
        } else if (body.poNumber && body.poNumber !== "NONE") {
          await tx
            .update(schema.purchaseOrders)
            .set({ status: "RECEIVED" })
            .where(eq(schema.purchaseOrders.poNumber, body.poNumber));
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

      return {
        success: true,
        data: orders.map((o) => ({
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
          totalItems: 5,
          estimatedAmount: Number(o.totalAmount || 0)
        }))
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // 7. BUAT SURAT PESANAN (PO) BARU
  .post("/purchase-orders", async ({ body }: { body: any }) => {
    try {
      const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      if (!tenant) throw new Error("Tenant not found");

      const [adminUser] = await db.select({ id: sql<string>`id` }).from(sql`users`).limit(1);
      const createdBy = adminUser ? adminUser.id : crypto.randomUUID();

      const [created] = await db
        .insert(schema.purchaseOrders)
        .values({
          tenantId: tenant.id,
          branchId: body.branchId || crypto.randomUUID(),
          supplierId: body.supplierId || crypto.randomUUID(),
          poNumber: body.poNumber || generateOrderNumber(body.orderType || "REGULER"),
          orderDate: body.orderDate || new Date().toISOString().slice(0, 10),
          status: "ORDERED",
          totalAmount: String(body.totalAmount || 0),
          notes: body.orderType || "REGULER",
          createdBy
        })
        .returning();

      return {
        success: true,
        message: `Surat Pesanan ${created.poNumber} berhasil dibuat`,
        data: created
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
