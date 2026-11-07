import { Elysia } from "elysia";
import { db, schema } from "@apoteku/db";
import { desc, count, sql, eq } from "drizzle-orm";

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
          poNumber: body.poNumber || `SP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
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
