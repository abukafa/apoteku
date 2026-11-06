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
  });
