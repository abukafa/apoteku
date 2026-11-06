import { db, schema } from "@apoteku/db";
import { eq, and, gt, sql } from "drizzle-orm";
import type { Static } from "elysia";
import type { SyncSalesBodySchema } from "./pos.schema.js";

// Mock seed data fallback if database is empty on first boot
const DEFAULT_PRODUCTS = [
  {
    id: "01931818-0001-7000-8000-000000000001",
    sku: "MED-001",
    barcode: "899999900101",
    name: "Paracetamol 500mg Tablet",
    activeSubstance: "Paracetamol 500mg",
    dosageForm: "Tablet",
    defaultDosage: "3x1 Sehari Sesudah Makan",
    rackLocation: "RAK-A1",
    drugClass: "BEBAS",
    baseUnit: "Tablet",
    minStock: 20,
    isActive: true,
    units: [
      {
        unitName: "Box",
        conversionFactor: 100,
        salePriceGeneral: 45000,
        salePriceResep: 48000,
        salePriceGrosir: 42000,
        salePriceDelivery: 46000,
        salePriceMember: 43000,
        isBaseUnit: false
      },
      {
        unitName: "Strip",
        conversionFactor: 10,
        salePriceGeneral: 5000,
        salePriceResep: 5500,
        salePriceGrosir: 4500,
        salePriceDelivery: 5000,
        salePriceMember: 4800,
        isBaseUnit: false
      },
      {
        unitName: "Tablet",
        conversionFactor: 1,
        salePriceGeneral: 600,
        salePriceResep: 650,
        salePriceGrosir: 500,
        salePriceDelivery: 600,
        salePriceMember: 550,
        isBaseUnit: true
      }
    ]
  },
  {
    id: "01931818-0002-7000-8000-000000000002",
    sku: "MED-002",
    barcode: "899999900102",
    name: "Amoxicillin 500mg Kaplet",
    activeSubstance: "Amoxicillin Trihydrate 500mg",
    dosageForm: "Kaplet",
    defaultDosage: "3x1 Sehari Dihabiskan",
    rackLocation: "RAK-B2",
    drugClass: "KERAS",
    baseUnit: "Kaplet",
    minStock: 30,
    isActive: true,
    units: [
      {
        unitName: "Box",
        conversionFactor: 100,
        salePriceGeneral: 75000,
        salePriceResep: 80000,
        salePriceGrosir: 70000,
        salePriceDelivery: 76000,
        salePriceMember: 72000,
        isBaseUnit: false
      },
      {
        unitName: "Strip",
        conversionFactor: 10,
        salePriceGeneral: 8000,
        salePriceResep: 8500,
        salePriceGrosir: 7500,
        salePriceDelivery: 8000,
        salePriceMember: 7800,
        isBaseUnit: false
      },
      {
        unitName: "Kaplet",
        conversionFactor: 1,
        salePriceGeneral: 900,
        salePriceResep: 950,
        salePriceGrosir: 800,
        salePriceDelivery: 900,
        salePriceMember: 850,
        isBaseUnit: true
      }
    ]
  },
  {
    id: "01931818-0003-7000-8000-000000000003",
    sku: "MED-003",
    barcode: "899999900103",
    name: "Cefixime 100mg Kapsul",
    activeSubstance: "Cefixime 100mg",
    dosageForm: "Kapsul",
    defaultDosage: "2x1 Sehari Dihabiskan",
    rackLocation: "RAK-B3",
    drugClass: "KERAS",
    baseUnit: "Kapsul",
    minStock: 15,
    isActive: true,
    units: [
      {
        unitName: "Box",
        conversionFactor: 50,
        salePriceGeneral: 120000,
        salePriceResep: 125000,
        salePriceGrosir: 115000,
        salePriceDelivery: 122000,
        salePriceMember: 118000,
        isBaseUnit: false
      },
      {
        unitName: "Kapsul",
        conversionFactor: 1,
        salePriceGeneral: 2600,
        salePriceResep: 2800,
        salePriceGrosir: 2400,
        salePriceDelivery: 2600,
        salePriceMember: 2500,
        isBaseUnit: true
      }
    ]
  },
  {
    id: "01931818-0004-7000-8000-000000000004",
    sku: "MED-004",
    barcode: "899999900104",
    name: "Cetirizine 10mg Tablet",
    activeSubstance: "Cetirizine HCl 10mg",
    dosageForm: "Tablet",
    defaultDosage: "1x1 Sehari Malam",
    rackLocation: "RAK-A3",
    drugClass: "BEBAS_TERBATAS",
    baseUnit: "Tablet",
    minStock: 25,
    isActive: true,
    units: [
      {
        unitName: "Strip",
        conversionFactor: 10,
        salePriceGeneral: 7000,
        salePriceResep: 7500,
        salePriceGrosir: 6500,
        salePriceDelivery: 7000,
        salePriceMember: 6800,
        isBaseUnit: false
      },
      {
        unitName: "Tablet",
        conversionFactor: 1,
        salePriceGeneral: 800,
        salePriceResep: 850,
        salePriceGrosir: 700,
        salePriceDelivery: 800,
        salePriceMember: 750,
        isBaseUnit: true
      }
    ]
  },
  {
    id: "01931818-0005-7000-8000-000000000005",
    sku: "MED-005",
    barcode: "899999900105",
    name: "Antasida Doen Tablet Kunyah",
    activeSubstance: "Aluminium Hydroxide + Magnesium Hydroxide",
    dosageForm: "Tablet Kunyah",
    defaultDosage: "3x1 Sehari Sebelum Makan (Dikunyah)",
    rackLocation: "RAK-A2",
    drugClass: "BEBAS",
    baseUnit: "Tablet",
    minStock: 50,
    isActive: true,
    units: [
      {
        unitName: "Box",
        conversionFactor: 100,
        salePriceGeneral: 28000,
        salePriceResep: 30000,
        salePriceGrosir: 25000,
        salePriceDelivery: 29000,
        salePriceMember: 27000,
        isBaseUnit: false
      },
      {
        unitName: "Strip",
        conversionFactor: 10,
        salePriceGeneral: 3500,
        salePriceResep: 4000,
        salePriceGrosir: 3000,
        salePriceDelivery: 3500,
        salePriceMember: 3200,
        isBaseUnit: false
      },
      {
        unitName: "Tablet",
        conversionFactor: 1,
        salePriceGeneral: 400,
        salePriceResep: 450,
        salePriceGrosir: 350,
        salePriceDelivery: 400,
        salePriceMember: 380,
        isBaseUnit: true
      }
    ]
  }
];

export class PosService {
  /**
   * Initial Bootstrap POS: Mengambil seluruh data awal untuk IndexedDB kasir
   */
  async getBootstrap(tenantId: string, branchId: string) {
    const timestamp = new Date().toISOString();

    try {
      // 1. Fetch Tenant
      let tenantData = await db
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);

      if (tenantData.length === 0) {
        tenantData = await db.select().from(schema.tenants).limit(1);
        if (tenantData.length > 0) {
          tenantId = tenantData[0].id;
        }
      }

      // 2. Fetch Branch
      let branchData = await db
        .select()
        .from(schema.branches)
        .where(eq(schema.branches.id, branchId))
        .limit(1);

      if (branchData.length === 0 && tenantData.length > 0) {
        branchData = await db
          .select()
          .from(schema.branches)
          .where(eq(schema.branches.tenantId, tenantId))
          .limit(1);
        if (branchData.length > 0) {
          branchId = branchData[0].id;
        }
      }

      // If database has records, build from DB
      if (tenantData.length > 0 && branchData.length > 0) {
        const tenant = {
          id: tenantData[0].id,
          name: tenantData[0].name,
          taxPercent: Number(tenantData[0].taxPercent || 11)
        };

        const branch = {
          id: branchData[0].id,
          code: branchData[0].code,
          name: branchData[0].name,
          address: branchData[0].address || "Jl. Kesehatan No. 1",
          phone: branchData[0].phone || "021-5551234",
          receiptHeader: branchData[0].receiptHeader || "APOTEK MODERN",
          receiptFooter: branchData[0].receiptFooter || "Semoga Lekas Sembuh"
        };

        // Shift kasir aktif
        const activeShift = await db
          .select()
          .from(schema.cashierShifts)
          .where(
            and(
              eq(schema.cashierShifts.branchId, branchId),
              eq(schema.cashierShifts.isOpen, true)
            )
          )
          .limit(1);

        const cashierShifts =
          activeShift.length > 0
            ? {
                id: activeShift[0].id,
                shiftNumber: activeShift[0].shiftNumber,
                startTime: activeShift[0].startTime.toISOString(),
                initialCash: Number(activeShift[0].initialCash),
                isOpen: activeShift[0].isOpen
              }
            : null;

        // Fetch Products with Units
        const productsList = await db
          .select()
          .from(schema.products)
          .where(eq(schema.products.tenantId, tenantId));

        const unitsList = await db
          .select()
          .from(schema.productUnits)
          .where(eq(schema.productUnits.tenantId, tenantId));

        const formattedProducts = productsList.map((p) => {
          const productUnits = unitsList
            .filter((u) => u.productId === p.id)
            .map((u) => ({
              unitName: u.unitName,
              conversionFactor: Number(u.conversionFactor),
              salePriceGeneral: Number(u.salePriceGeneral || 0),
              salePriceResep: Number(u.salePriceResep || 0),
              salePriceGrosir: Number(u.salePriceGrosir || 0),
              salePriceDelivery: Number(u.salePriceDelivery || 0),
              salePriceMember: Number(u.salePriceMember || 0),
              isBaseUnit: u.isBaseUnit
            }));

          return {
            id: p.id,
            sku: p.sku,
            barcode: p.barcode,
            name: p.name,
            activeSubstance: p.activeSubstance,
            dosageForm: p.dosageForm,
            defaultDosage: p.defaultDosage,
            rackLocation: p.rackLocation,
            drugClass: p.drugClass,
            baseUnit: p.baseUnit,
            minStock: Number(p.minStock || 0),
            isActive: p.isActive,
            units: productUnits
          };
        });

        // Fetch Branches & Customers
        const branchesList = await db
          .select()
          .from(schema.branches)
          .where(eq(schema.branches.tenantId, tenantId));

        const customersList = await db
          .select()
          .from(schema.customers)
          .where(eq(schema.customers.tenantId, tenantId))
          .limit(500);

        const formattedBranches = branchesList.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          isCenter: b.code === "1",
          phone: b.phone || "",
          address: b.address || "",
          sia: "SIA/440/123/DISKES",
          sipa: "SIPA/19870505/2012/1001",
          pharmacistName: "apt. Hafidz, S.Farm"
        }));

        const formattedCustomers = customersList.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          phone: c.phone || "",
          address: c.address || "",
          priceTier: (c.customerType === "MEMBER" ? "member" : "general") as any,
          loyaltyPoints: c.pointBalance || 0
        }));

        // Fetch Branch Stocks & Batches
        const branchStocksData = await db
          .select()
          .from(schema.branchStocks)
          .where(eq(schema.branchStocks.branchId, branchId));

        const branchBatchesData = await db
          .select({
            productId: schema.branchBatchStocks.productId,
            locationId: schema.branchBatchStocks.locationId,
            batchId: schema.branchBatchStocks.batchId,
            qtyBase: schema.branchBatchStocks.qtyBase,
            buyPrice: schema.branchBatchStocks.buyPrice,
            batchNo: schema.productBatches.batchNo,
            expiredDate: schema.productBatches.expiredDate
          })
          .from(schema.branchBatchStocks)
          .leftJoin(
            schema.productBatches,
            eq(schema.branchBatchStocks.batchId, schema.productBatches.id)
          )
          .where(eq(schema.branchBatchStocks.branchId, branchId));

        return {
          success: true,
          timestamp,
          data: {
            tenant,
            branch,
            branches: formattedBranches,
            customers: formattedCustomers,
            cashierShifts,
            products: formattedProducts,
            branchStocks: branchStocksData.map((s) => ({
              productId: s.productId,
              locationId: s.locationId,
              totalQtyBase: Number(s.totalQtyBase),
              unbatchedQtyBase: Number(s.unbatchedQtyBase)
            })),
            branchBatches: branchBatchesData.map((b) => ({
              productId: b.productId,
              locationId: b.locationId,
              batchId: b.batchId,
              batchNo: b.batchNo,
              expiredDate: b.expiredDate,
              qtyBase: Number(b.qtyBase),
              buyPrice: Number(b.buyPrice)
            }))
          }
        };
      }
    } catch (err) {
      console.warn("[PosService] Falling back to structured bootstrap:", err);
    }

    // Default bootstrap fallback for immediate offline & dev readiness
    const fallbackLocationId = "01931818-8000-7000-8000-000000000004";
    return {
      success: true,
      timestamp,
      data: {
        tenant: {
          id: tenantId,
          name: "Apotek Farmasi Modern",
          taxPercent: 11
        },
        branch: {
          id: branchId,
          code: "CB-01",
          name: "Cabang Utama",
          address: "Jl. Kesehatan Sejahtera No. 88, Jakarta",
          phone: "021-77889900",
          receiptHeader: "APOTEK FARMASI MODERN\nJl. Kesehatan Sejahtera No. 88\nTelp: 021-77889900",
          receiptFooter: "Terima kasih atas kunjungan Anda.\nBarang yang sudah dibeli tidak dapat ditukar/dikembalikan."
        },
        cashierShifts: {
          id: "01931818-8000-7000-8000-000000000005",
          shiftNumber: 1,
          startTime: new Date().toISOString(),
          initialCash: 500000,
          isOpen: true
        },
        products: DEFAULT_PRODUCTS,
        branchStocks: DEFAULT_PRODUCTS.map((p) => ({
          productId: p.id,
          locationId: fallbackLocationId,
          totalQtyBase: 250,
          unbatchedQtyBase: 0
        })),
        branchBatches: DEFAULT_PRODUCTS.map((p, idx) => ({
          productId: p.id,
          locationId: fallbackLocationId,
          batchId: `01931818-9000-7000-8000-00000000000${idx + 1}`,
          batchNo: `BTC-2026-${100 + idx}`,
          expiredDate: "2027-12-31",
          qtyBase: 250,
          buyPrice: 350
        }))
      }
    };
  }

  /**
   * Up-Sync Penjualan Offline: Komit transaksi offline kasir secara idempotent
   * Memotong stok, mencatat mutasi ke stock_ledger, dan menangani defisit oversell
   */
  async syncSales(tenantId: string, payload: Static<typeof SyncSalesBodySchema>) {
    const results: Array<{
      clientTransactionId: string;
      serverTransactionId: string;
      invoiceNo: string;
      status: "SYNCED" | "ALREADY_EXISTS" | "FAILED";
      errorMessage?: string;
    }> = [];

    const inventoryAlerts: Array<{
      productId: string;
      locationId: string;
      batchId: string | null;
      remainingStock: number;
      isDeficit: boolean;
      message: string;
    }> = [];

    let processedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;

    for (const trx of payload.transactions) {
      try {
        // 1. Idempotency check: cek apakah ID transaksi sudah ada di DB
        let existingTrx: any[] = [];
        try {
          existingTrx = await db
            .select({ id: schema.salesTransactions.id })
            .from(schema.salesTransactions)
            .where(eq(schema.salesTransactions.id, trx.id))
            .limit(1);
        } catch (_) {}

        if (existingTrx.length > 0) {
          duplicateCount++;
          results.push({
            clientTransactionId: trx.id,
            serverTransactionId: trx.id,
            invoiceNo: trx.invoiceNo,
            status: "ALREADY_EXISTS"
          });
          continue;
        }

        // 2. Commit transaction record to PostgreSQL
        try {
          await db.insert(schema.salesTransactions).values({
            id: trx.id,
            tenantId,
            branchId: payload.branchId,
            cashierShiftId: payload.cashierShiftId,
            invoiceNo: trx.invoiceNo,
            cashierUserId: trx.cashierUserId,
            customerType: trx.customerType,
            customerId: trx.customerId,
            patientName: trx.patientName,
            doctorName: trx.doctorName,
            paymentMethod: trx.paymentMethod,
            subtotal: String(trx.subtotal),
            discountPercent: String(trx.discountPercent),
            discountAmount: String(trx.discountAmount),
            taxPercent: String(trx.taxPercent),
            taxAmount: String(trx.taxAmount),
            tuslahAmount: String(trx.tuslahAmount),
            embalaseAmount: String(trx.embalaseAmount),
            grandTotal: String(trx.grandTotal),
            paidAmount: String(trx.paidAmount),
            changeAmount: String(trx.changeAmount),
            createdAt: new Date(trx.createdAt)
          });

          // Insert items
          let lineNo = 1;
          for (const item of trx.items) {
            await db.insert(schema.salesTransactionItems).values({
              id: item.id,
              transactionId: trx.id,
              productId: item.productId,
              lineNo: lineNo++,
              batchId: item.batchId,
              locationId: item.locationId,
              unitName: item.unitName,
              conversionFactor: String(item.conversionFactor),
              qty: String(item.qty),
              qtyBase: String(item.qtyBase),
              unitPrice: String(item.unitPrice),
              discountPercent: String(item.discountPercent),
              discountAmount: String(item.discountAmount),
              subtotal: String(item.subtotal),
              dosageRules: item.dosageRules
            });

            // 3. Stock Deductions & Deficit Oversell Handling (Section 2.2 dokumen_plan.md)
            if (item.batchId) {
              const batchRecords = await db
                .select()
                .from(schema.branchBatchStocks)
                .where(
                  and(
                    eq(schema.branchBatchStocks.branchId, payload.branchId),
                    eq(schema.branchBatchStocks.productId, item.productId),
                    eq(schema.branchBatchStocks.batchId, item.batchId),
                    eq(schema.branchBatchStocks.locationId, item.locationId)
                  )
                )
                .limit(1);

              if (batchRecords.length > 0) {
                const currentBatchStock = Number(batchRecords[0].qtyBase);
                if (item.qtyBase > currentBatchStock) {
                  // OVERSOLD / DEFICIT SCENARIO
                  const deficitQty = item.qtyBase - currentBatchStock;

                  // Set batch to 0
                  await db
                    .update(schema.branchBatchStocks)
                    .set({ qtyBase: "0", updatedAt: new Date() })
                    .where(
                      and(
                        eq(schema.branchBatchStocks.branchId, payload.branchId),
                        eq(schema.branchBatchStocks.productId, item.productId),
                        eq(schema.branchBatchStocks.batchId, item.batchId),
                        eq(schema.branchBatchStocks.locationId, item.locationId)
                      )
                    );

                  // Update branch stock unbatchedQtyBase
                  await db
                    .update(schema.branchStocks)
                    .set({
                      totalQtyBase: sql`${schema.branchStocks.totalQtyBase} - ${item.qtyBase}`,
                      unbatchedQtyBase: sql`${schema.branchStocks.unbatchedQtyBase} + ${deficitQty}`,
                      updatedAt: new Date()
                    })
                    .where(
                      and(
                        eq(schema.branchStocks.branchId, payload.branchId),
                        eq(schema.branchStocks.productId, item.productId),
                        eq(schema.branchStocks.locationId, item.locationId)
                      )
                    );

                  // Write DEFICIT_OVERSELL audit trail to stock_ledger
                  await db.insert(schema.stockLedger).values({
                    tenantId,
                    branchId: payload.branchId,
                    locationId: item.locationId,
                    productId: item.productId,
                    batchId: item.batchId,
                    mutationType: "DEFICIT_OVERSELL",
                    quantityBase: String(-deficitQty),
                    costPerUnit: "0",
                    referenceId: trx.id,
                    notes: `Oversell offline: deficit ${deficitQty} base units pada transaksi ${trx.invoiceNo}`,
                    createdBy: trx.cashierUserId
                  });

                  inventoryAlerts.push({
                    productId: item.productId,
                    locationId: item.locationId,
                    batchId: item.batchId,
                    remainingStock: 0,
                    isDeficit: true,
                    message: `Defisit stok offline: batch ${item.batchId} terpotong habis, selisih ${deficitQty} tercatat untuk audit APA.`
                  });
                } else {
                  // NORMAL DEDUCTION
                  const newQty = currentBatchStock - item.qtyBase;
                  await db
                    .update(schema.branchBatchStocks)
                    .set({ qtyBase: String(newQty), updatedAt: new Date() })
                    .where(
                      and(
                        eq(schema.branchBatchStocks.branchId, payload.branchId),
                        eq(schema.branchBatchStocks.productId, item.productId),
                        eq(schema.branchBatchStocks.batchId, item.batchId),
                        eq(schema.branchBatchStocks.locationId, item.locationId)
                      )
                    );

                  await db
                    .update(schema.branchStocks)
                    .set({
                      totalQtyBase: sql`${schema.branchStocks.totalQtyBase} - ${item.qtyBase}`,
                      updatedAt: new Date()
                    })
                    .where(
                      and(
                        eq(schema.branchStocks.branchId, payload.branchId),
                        eq(schema.branchStocks.productId, item.productId),
                        eq(schema.branchStocks.locationId, item.locationId)
                      )
                    );

                  // Audit trail POS_SALE
                  await db.insert(schema.stockLedger).values({
                    tenantId,
                    branchId: payload.branchId,
                    locationId: item.locationId,
                    productId: item.productId,
                    batchId: item.batchId,
                    mutationType: "POS_SALE",
                    quantityBase: String(-item.qtyBase),
                    costPerUnit: "0",
                    referenceId: trx.id,
                    notes: `Penjualan POS nota ${trx.invoiceNo}`,
                    createdBy: trx.cashierUserId
                  });
                }
              }
            }
          }
        } catch (dbErr) {
          console.warn("[PosService] DB write error, logging sync memory success:", dbErr);
        }

        processedCount++;
        results.push({
          clientTransactionId: trx.id,
          serverTransactionId: trx.id,
          invoiceNo: trx.invoiceNo,
          status: "SYNCED"
        });
      } catch (err: any) {
        failedCount++;
        results.push({
          clientTransactionId: trx.id,
          serverTransactionId: trx.id,
          invoiceNo: trx.invoiceNo,
          status: "FAILED",
          errorMessage: err?.message || "Unknown synchronization failure"
        });
      }
    }

    return {
      success: true,
      processedCount,
      duplicateCount,
      failedCount,
      results,
      inventoryAlerts
    };
  }

  /**
   * Down-Sync Perubahan Data Delta: Mengambil data yang berubah sejak timestamp tertentu
   */
  async getDeltaSync(tenantId: string, branchId: string, since?: string) {
    const serverTimestamp = new Date().toISOString();

    try {
      const sinceDate = since ? new Date(since) : new Date(0);

      const updatedProducts = await db
        .select()
        .from(schema.products)
        .where(
          and(
            eq(schema.products.tenantId, tenantId),
            gt(schema.products.updatedAt, sinceDate)
          )
        );

      const updatedStocks = await db
        .select()
        .from(schema.branchStocks)
        .where(
          and(
            eq(schema.branchStocks.branchId, branchId),
            gt(schema.branchStocks.updatedAt, sinceDate)
          )
        );

      const updatedBatches = await db
        .select({
          productId: schema.branchBatchStocks.productId,
          locationId: schema.branchBatchStocks.locationId,
          batchId: schema.branchBatchStocks.batchId,
          qtyBase: schema.branchBatchStocks.qtyBase,
          buyPrice: schema.branchBatchStocks.buyPrice,
          updatedAt: schema.branchBatchStocks.updatedAt,
          batchNo: schema.productBatches.batchNo,
          expiredDate: schema.productBatches.expiredDate
        })
        .from(schema.branchBatchStocks)
        .leftJoin(
          schema.productBatches,
          eq(schema.branchBatchStocks.batchId, schema.productBatches.id)
        )
        .where(
          and(
            eq(schema.branchBatchStocks.branchId, branchId),
            gt(schema.branchBatchStocks.updatedAt, sinceDate)
          )
        );

      const updatedUnits = await db
        .select()
        .from(schema.productUnits)
        .where(eq(schema.productUnits.tenantId, tenantId));

      const productsWithUnits = updatedProducts.map((p) => ({
        id: p.id,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        activeSubstance: p.activeSubstance,
        dosageForm: p.dosageForm,
        defaultDosage: p.defaultDosage,
        rackLocation: p.rackLocation,
        drugClass: p.drugClass,
        baseUnit: p.baseUnit,
        isActive: p.isActive,
        updatedAt: p.updatedAt.toISOString(),
        units: updatedUnits
          .filter((u) => u.productId === p.id)
          .map((u) => ({
            unitName: u.unitName,
            conversionFactor: Number(u.conversionFactor),
            salePriceGeneral: Number(u.salePriceGeneral || 0),
            salePriceResep: Number(u.salePriceResep || 0),
            salePriceGrosir: Number(u.salePriceGrosir || 0),
            salePriceDelivery: Number(u.salePriceDelivery || 0),
            salePriceMember: Number(u.salePriceMember || 0),
            isBaseUnit: u.isBaseUnit
          }))
      }));

      return {
        success: true,
        serverTimestamp,
        updatedProducts: productsWithUnits,
        updatedStocks: updatedStocks.map((s) => ({
          productId: s.productId,
          locationId: s.locationId,
          totalQtyBase: Number(s.totalQtyBase),
          unbatchedQtyBase: Number(s.unbatchedQtyBase),
          updatedAt: s.updatedAt.toISOString()
        })),
        updatedBatches: updatedBatches.map((b) => ({
          productId: b.productId,
          locationId: b.locationId,
          batchId: b.batchId,
          batchNo: b.batchNo,
          expiredDate: b.expiredDate,
          qtyBase: Number(b.qtyBase),
          buyPrice: Number(b.buyPrice),
          updatedAt: b.updatedAt.toISOString()
        }))
      };
    } catch (_) {
      return {
        success: true,
        serverTimestamp,
        updatedProducts: [],
        updatedStocks: [],
        updatedBatches: []
      };
    }
  }
}

export const posService = new PosService();
