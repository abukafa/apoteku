import { db, schema } from "@apoteku/db";
import { eq, and, gt, sql, or, gte } from "drizzle-orm";
import type { Static } from "elysia";
import type { SyncSalesBodySchema } from "./pos.schema.js";

function resolveShiftName(shiftNumber: number, notes?: string | null): string {
  if (notes && notes.startsWith("[")) {
    const match = notes.match(/^\[(.*?)\]/);
    if (match && match[1]) return match[1];
  }
  if (shiftNumber === 1) return "Pagi";
  if (shiftNumber === 2) return "Siang";
  if (shiftNumber === 3) return "Malam";
  if (shiftNumber === 4) return "Lembur";
  return `Shift ${shiftNumber}`;
}

export class PosService {
  private formatProductUnits(
    units: Array<typeof schema.productUnits.$inferSelect>,
    includeAllUnits = false
  ) {
    const sorted = [...units].sort(
      (a, b) => Number(a.conversionFactor) - Number(b.conversionFactor)
    );
    const filtered = includeAllUnits
      ? sorted
      : sorted.filter(
          (u) =>
            u.isSellable !== false &&
            (Number(u.salePriceGeneral || 0) > 0 || Boolean(u.isBaseUnit))
        );
    const selected = filtered.length > 0 ? filtered : sorted.filter((u) => u.isBaseUnit);

    return selected.map((u) => ({
      unitName: u.unitName,
      conversionFactor: Number(u.conversionFactor),
      buyPrice: Number(u.buyPrice || 0),
      salePriceGeneral: Math.round(Number(u.salePriceGeneral || 0)),
      salePriceResep: Math.round(Number(u.salePriceResep || 0)),
      salePriceGrosir: Math.round(Number(u.salePriceGrosir || 0)),
      salePriceDelivery: Math.round(Number(u.salePriceDelivery || 0)),
      salePriceMember: Math.round(Number(u.salePriceMember || 0)),
      isBaseUnit: Boolean(u.isBaseUnit),
      isSellable: Boolean(u.isSellable),
      isPurchaseUnit: Boolean(u.isPurchaseUnit)
    }));
  }

  /**
   * Initial Bootstrap POS: Mengambil seluruh data awal untuk IndexedDB kasir
   */
  async getBootstrap(tenantId: string, branchId: string, includeAllUnits = false) {
    const timestamp = new Date().toISOString();

    try {
      const isUuid = (val?: string | null) =>
        Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim()));

      // 1. Fetch Tenant (validasi UUID agar string legacy tidak memicu error SQL)
      let tenantData = isUuid(tenantId)
        ? await db
            .select()
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId.trim()))
            .limit(1)
        : [];

      if (tenantData.length === 0) {
        tenantData = await db.select().from(schema.tenants).limit(1);
        if (tenantData.length > 0) {
          tenantId = tenantData[0].id;
        }
      }

      // 2. Fetch Branch (cek UUID dulu, lalu code cabang, lalu fallback cabang pertama tenant)
      let branchData = isUuid(branchId)
        ? await db
            .select()
            .from(schema.branches)
            .where(eq(schema.branches.id, branchId.trim()))
            .limit(1)
        : [];

      if (branchData.length === 0 && branchId && tenantData.length > 0) {
        branchData = await db
          .select()
          .from(schema.branches)
          .where(
            and(
              eq(schema.branches.tenantId, tenantId),
              eq(sql`LOWER(${schema.branches.code})`, branchId.trim().toLowerCase())
            )
          )
          .limit(1);
      }

      if (branchData.length === 0 && tenantData.length > 0) {
        branchData = await db
          .select()
          .from(schema.branches)
          .where(eq(schema.branches.tenantId, tenantId))
          .limit(1);
      }

      if (branchData.length > 0) {
        branchId = branchData[0].id;
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

        // Fetch Products with Units (indexed O(N + M) via Map)
        const productsList = await db
          .select()
          .from(schema.products)
          .where(eq(schema.products.tenantId, tenantId));

        const unitsList = await db
          .select()
          .from(schema.productUnits)
          .where(eq(schema.productUnits.tenantId, tenantId));

        const rawUnitsByProductId = new Map<string, Array<typeof schema.productUnits.$inferSelect>>();
        for (const u of unitsList) {
          const existing = rawUnitsByProductId.get(u.productId) || [];
          existing.push(u);
          rawUnitsByProductId.set(u.productId, existing);
        }

        const formattedProducts = productsList.map((p) => ({
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
          defaultPurchaseUnit: p.defaultPurchaseUnit,
          referenceBuyPriceBase: Number(p.referenceBuyPriceBase || 0),
          minStock: Number(p.minStock || 0),
          isConsignment: Boolean(p.isConsignment),
          isActive: p.isActive,
          units: this.formatProductUnits(rawUnitsByProductId.get(p.id) || [], includeAllUnits)
        }));

        // Fetch Branches & Customers
        const branchesList = await db
          .select()
          .from(schema.branches)
          .where(eq(schema.branches.tenantId, tenantId));

        const customersList = await db
          .select()
          .from(schema.customers)
          .where(eq(schema.customers.tenantId, tenantId));

        const formattedBranches = branchesList.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          isCenter: b.code === "1" || b.code === "GUDANG",
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

        // Fetch Inventory Locations khusus cabang ini (tanpa fallback ke cabang lain)
        let locationsList = await db
          .select()
          .from(schema.inventoryLocations)
          .where(eq(schema.inventoryLocations.branchId, branchId));

        if (locationsList.length === 0) {
          const [newLoc] = await db
            .insert(schema.inventoryLocations)
            .values({
              tenantId,
              branchId,
              code: "DEPO-UTAMA",
              name: "Etalase Depo Utama",
              isDefault: true,
              isActive: true
            })
            .returning();
          if (newLoc) locationsList = [newLoc];
        }

        // Fetch Branch Stocks & Batches STRICTLY scoped to branchId (NEVER fallback to tenant-wide stocks!)
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
            locations: locationsList.map((l) => ({
              id: l.id,
              code: l.code,
              name: l.name,
              isDefault: l.isDefault
            })),
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
      console.error("[PosService] Failed to fetch bootstrap from DB:", err);
    }

    return {
      success: false,
      timestamp,
      data: {
        tenant: {
          id: tenantId,
          name: "Apotek",
          taxPercent: 11
        },
        branch: {
          id: branchId,
          code: "-",
          name: "-",
          address: "",
          phone: "",
          receiptHeader: "",
          receiptFooter: ""
        },
        branches: [],
        customers: [],
        locations: [],
        cashierShifts: null,
        products: [],
        branchStocks: [],
        branchBatches: []
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

    const isValidUuid = (str: string | null | undefined): boolean =>
      Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

    // Validasi shift kasir aktif
    let validShiftId: string | null = isValidUuid(payload.cashierShiftId) ? payload.cashierShiftId : null;
    if (validShiftId) {
      try {
        const shiftRec = await db
          .select({ id: schema.cashierShifts.id })
          .from(schema.cashierShifts)
          .where(eq(schema.cashierShifts.id, validShiftId))
          .limit(1);
        if (shiftRec.length === 0) validShiftId = null;
      } catch (_) {
        validShiftId = null;
      }
    }

    // Cari lokasi inventaris default untuk cabang ini
    let defaultLocationId: string | null = null;
    try {
      const locList = await db
        .select({ id: schema.inventoryLocations.id })
        .from(schema.inventoryLocations)
        .where(eq(schema.inventoryLocations.branchId, payload.branchId))
        .limit(1);
      if (locList.length > 0) {
        defaultLocationId = locList[0].id;
      } else {
        const anyLoc = await db
          .select({ id: schema.inventoryLocations.id })
          .from(schema.inventoryLocations)
          .where(eq(schema.inventoryLocations.tenantId, tenantId))
          .limit(1);
        if (anyLoc.length > 0) {
          defaultLocationId = anyLoc[0].id;
        } else {
          const anyLocAll = await db
            .select({ id: schema.inventoryLocations.id })
            .from(schema.inventoryLocations)
            .limit(1);
          if (anyLocAll.length > 0) defaultLocationId = anyLocAll[0].id;
        }
      }
    } catch (_) {}

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

        // Sanitasi Foreign Key Pelanggan & Kasir
        let validCustomerId: string | null = isValidUuid(trx.customerId) ? trx.customerId : null;
        if (validCustomerId) {
          try {
            const custRec = await db
              .select({ id: schema.customers.id })
              .from(schema.customers)
              .where(eq(schema.customers.id, validCustomerId))
              .limit(1);
            if (custRec.length === 0) validCustomerId = null;
          } catch (_) {
            validCustomerId = null;
          }
        }

        const validCashierUserId = isValidUuid(trx.cashierUserId) ? trx.cashierUserId : null;
        const cashierAuditUserId = validCashierUserId || "01931818-8000-7000-8000-000000000003";

        // 1B. Validasi satuan jual POS: tolak jika item secara eksplisit ditandai isSellable = false
        for (const item of trx.items) {
          if (!isValidUuid(item.productId) || !item.unitName) continue;
          const unitUpper = String(item.unitName).trim().toUpperCase();
          const [matchedUnit] = await db
            .select({
              isSellable: schema.productUnits.isSellable,
              unitName: schema.productUnits.unitName
            })
            .from(schema.productUnits)
            .where(
              and(
                eq(schema.productUnits.productId, item.productId),
                sql`UPPER(${schema.productUnits.unitName}) = ${unitUpper}`
              )
            )
            .limit(1);
          if (matchedUnit && matchedUnit.isSellable === false) {
            throw new Error(
              `Satuan "${matchedUnit.unitName}" bukan satuan jual kasir POS (khusus pembelian/PBF).`
            );
          }
        }

        // 2. Commit transaction record to PostgreSQL
        try {
          await db.insert(schema.salesTransactions).values({
            id: trx.id,
            tenantId,
            branchId: payload.branchId,
            cashierShiftId: validShiftId,
            invoiceNo: trx.invoiceNo,
            cashierUserId: validCashierUserId,
            customerType: trx.customerType,
            customerId: validCustomerId,
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
            let validBatchId: string | null = isValidUuid(item.batchId) ? item.batchId : null;
            if (validBatchId) {
              try {
                const batchRec = await db
                  .select({ id: schema.productBatches.id })
                  .from(schema.productBatches)
                  .where(eq(schema.productBatches.id, validBatchId))
                  .limit(1);
                if (batchRec.length === 0) validBatchId = null;
              } catch (_) {
                validBatchId = null;
              }
            }

            // Validasi & Sanitasi Lokasi Inventaris
            let itemLocationId: string | null = null;
            if (isValidUuid(item.locationId)) {
              try {
                const locCheck = await db
                  .select({ id: schema.inventoryLocations.id })
                  .from(schema.inventoryLocations)
                  .where(eq(schema.inventoryLocations.id, item.locationId!))
                  .limit(1);
                if (locCheck.length > 0) itemLocationId = locCheck[0].id;
              } catch (_) {}
            }
            if (!itemLocationId) {
              itemLocationId = defaultLocationId;
            }

            // Validasi & Sanitasi Foreign Key Product
            let validProductId: string | null = null;
            if (isValidUuid(item.productId)) {
              try {
                const prodRec = await db
                  .select({ id: schema.products.id })
                  .from(schema.products)
                  .where(eq(schema.products.id, item.productId))
                  .limit(1);
                if (prodRec.length > 0) validProductId = prodRec[0].id;
              } catch (_) {}
            }
            if (!validProductId) {
              try {
                const fallbackProd = await db
                  .select({ id: schema.products.id })
                  .from(schema.products)
                  .limit(1);
                if (fallbackProd.length > 0) validProductId = fallbackProd[0].id;
              } catch (_) {}
            }
            if (!validProductId) {
              console.warn(`[PosService] Skip item without valid product ID:`, item);
              continue;
            }

            const validItemId = isValidUuid(item.id)
              ? item.id
              : crypto.randomUUID();

            await db.insert(schema.salesTransactionItems).values({
              id: validItemId,
              transactionId: trx.id,
              productId: validProductId,
              lineNo: lineNo++,
              batchId: validBatchId,
              locationId: itemLocationId,
              unitName: item.unitName || "TABLET",
              conversionFactor: String(item.conversionFactor || 1),
              qty: String(item.qty || 1),
              qtyBase: String(item.qtyBase || 1),
              unitPrice: String(item.unitPrice || 0),
              discountPercent: String(item.discountPercent || 0),
              discountAmount: String(item.discountAmount || 0),
              subtotal: String(item.subtotal || 0),
              dosageRules: item.dosageRules || null
            });

            // 3. Stock Deductions & Deficit Oversell Handling (Section 2.2 dokumen_plan.md)
            if (validBatchId && itemLocationId) {
              const batchRecords = await db
                .select()
                .from(schema.branchBatchStocks)
                .where(
                  and(
                    eq(schema.branchBatchStocks.branchId, payload.branchId),
                    eq(schema.branchBatchStocks.productId, validProductId),
                    eq(schema.branchBatchStocks.batchId, validBatchId),
                    eq(schema.branchBatchStocks.locationId, itemLocationId)
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
                        eq(schema.branchBatchStocks.productId, validProductId),
                        eq(schema.branchBatchStocks.batchId, validBatchId),
                        eq(schema.branchBatchStocks.locationId, itemLocationId)
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
                        eq(schema.branchStocks.productId, validProductId),
                        eq(schema.branchStocks.locationId, itemLocationId)
                      )
                    );

                  // Write DEFICIT_OVERSELL audit trail to stock_ledger
                  await db.insert(schema.stockLedger).values({
                    tenantId,
                    branchId: payload.branchId,
                    locationId: itemLocationId,
                    productId: validProductId,
                    batchId: validBatchId,
                    mutationType: "DEFICIT_OVERSELL",
                    quantityBase: String(-deficitQty),
                    costPerUnit: "0",
                    referenceId: trx.id,
                    notes: `Oversell offline: deficit ${deficitQty} base units pada transaksi ${trx.invoiceNo}`,
                    createdBy: cashierAuditUserId
                  });

                  inventoryAlerts.push({
                    productId: validProductId,
                    locationId: itemLocationId,
                    batchId: validBatchId,
                    remainingStock: 0,
                    isDeficit: true,
                    message: `Defisit stok offline: batch ${validBatchId} terpotong habis, selisih ${deficitQty} tercatat untuk audit APA.`
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
                        eq(schema.branchBatchStocks.productId, validProductId),
                        eq(schema.branchBatchStocks.batchId, validBatchId),
                        eq(schema.branchBatchStocks.locationId, itemLocationId)
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
                        eq(schema.branchStocks.productId, validProductId),
                        eq(schema.branchStocks.locationId, itemLocationId)
                      )
                    );

                  // Audit trail POS_SALE
                  await db.insert(schema.stockLedger).values({
                    tenantId,
                    branchId: payload.branchId,
                    locationId: itemLocationId,
                    productId: validProductId,
                    batchId: validBatchId,
                    mutationType: "POS_SALE",
                    quantityBase: String(-item.qtyBase),
                    costPerUnit: "0",
                    referenceId: trx.id,
                    notes: `Penjualan POS nota ${trx.invoiceNo}`,
                    createdBy: cashierAuditUserId
                  });
                }
              }
            } else if (itemLocationId) {
              // Pemotongan jika tidak ada batchId spesifik (unbatched deduction)
              await db
                .update(schema.branchStocks)
                .set({
                  totalQtyBase: sql`${schema.branchStocks.totalQtyBase} - ${item.qtyBase}`,
                  updatedAt: new Date()
                })
                .where(
                  and(
                    eq(schema.branchStocks.branchId, payload.branchId),
                    eq(schema.branchStocks.productId, validProductId),
                    eq(schema.branchStocks.locationId, itemLocationId)
                  )
                );

              await db.insert(schema.stockLedger).values({
                tenantId,
                branchId: payload.branchId,
                locationId: itemLocationId,
                productId: validProductId,
                batchId: null,
                mutationType: "POS_SALE",
                quantityBase: String(-item.qtyBase),
                costPerUnit: "0",
                referenceId: trx.id,
                notes: `Penjualan POS nota ${trx.invoiceNo} (unbatched)`,
                createdBy: cashierAuditUserId
              });
            }
          }
        } catch (dbErr) {
          console.error("[PosService] DB write error during transaction sync:", dbErr);
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
        defaultPurchaseUnit: p.defaultPurchaseUnit,
        referenceBuyPriceBase: Number(p.referenceBuyPriceBase || 0),
        isConsignment: Boolean(p.isConsignment),
        isActive: p.isActive,
        updatedAt: p.updatedAt.toISOString(),
        units: this.formatProductUnits(
          updatedUnits.filter((u) => u.productId === p.id),
          false
        )
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

  /**
   * Mengambil Shift Kasir Aktif & Rekap Penjualan Shift Tersebut
   */
  async getActiveShift(tenantId: string, branchId: string) {
    try {
      const isUuid = (val?: string | null) =>
        Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val?.trim() || ""));

      let targetBranch = branchId;
      if (!isUuid(targetBranch)) {
        const [b] = await db.select({ id: schema.branches.id }).from(schema.branches).limit(1);
        if (b) targetBranch = b.id;
      }

      const shiftConditions = [
        eq(schema.cashierShifts.branchId, targetBranch),
        eq(schema.cashierShifts.isOpen, true)
      ];
      if (tenantId && isUuid(tenantId) && !tenantId.startsWith("01931818-8000")) {
        shiftConditions.push(eq(schema.cashierShifts.tenantId, tenantId));
      }

      const shiftRows = await db
        .select()
        .from(schema.cashierShifts)
        .where(and(...shiftConditions))
        .limit(1);

      if (shiftRows.length === 0) {
        return {
          success: true,
          shift: null
        };
      }

      const shift = shiftRows[0];

      // Ambil seluruh penjualan pada shift ini untuk rekonsiliasi kas laci
      const sales = await db
        .select({
          paymentMethod: schema.salesTransactions.paymentMethod,
          grandTotal: schema.salesTransactions.grandTotal,
          paidAmount: schema.salesTransactions.paidAmount,
          changeAmount: schema.salesTransactions.changeAmount
        })
        .from(schema.salesTransactions)
        .where(
          or(
            eq(schema.salesTransactions.cashierShiftId, shift.id),
            and(
              eq(schema.salesTransactions.branchId, shift.branchId),
              gte(schema.salesTransactions.createdAt, shift.startTime)
            )
          )
        );

      let cashSales = 0;
      let nonCashSales = 0;
      let qrisSales = 0;

      for (const s of sales) {
        const netCash = Math.max(0, Number(s.paidAmount) - Number(s.changeAmount));
        const total = Number(s.grandTotal);

        if (s.paymentMethod === "CASH") {
          cashSales += netCash > 0 ? netCash : total;
        } else {
          nonCashSales += total;
          if (s.paymentMethod === "QRIS") {
            qrisSales += total;
          }
        }
      }

      // Ambil refund tunai dari customer_returns selama shift ini
      const [refundsAgg] = await db
        .select({
          totalCashRefunds: sql<number>`COALESCE(SUM(${schema.customerReturns.refundAmount}), 0)::numeric`
        })
        .from(schema.customerReturns)
        .where(
          and(
            eq(schema.customerReturns.branchId, shift.branchId),
            eq(schema.customerReturns.compensationType, "REFUND_TUNAI"),
            eq(schema.customerReturns.status, "APPROVED"),
            or(
              eq(schema.customerReturns.cashierShiftId, shift.id),
              gte(schema.customerReturns.createdAt, shift.startTime)
            )
          )
        );

      const cashRefunds = Number(refundsAgg?.totalCashRefunds || 0);
      const initialCash = Number(shift.initialCash);
      const expectedCash = initialCash + cashSales - cashRefunds;
      const totalSales = cashSales + nonCashSales;

      const shiftName = resolveShiftName(shift.shiftNumber, shift.notes);

      return {
        success: true,
        shift: {
          id: shift.id,
          branchId: shift.branchId,
          userId: shift.userId,
          shiftNumber: shift.shiftNumber,
          shiftName,
          startTime: shift.startTime.toISOString(),
          initialCash,
          startingCash: initialCash,
          cashSales,
          currentCashSales: cashSales,
          qrisSales,
          nonCashSales,
          currentNonCashSales: nonCashSales,
          totalSales,
          currentTotalSales: totalSales,
          cashRefunds,
          currentCashRefunds: cashRefunds,
          expectedCash,
          isOpen: shift.isOpen,
          notes: shift.notes
        }
      };
    } catch (err: any) {
      console.error("[PosService] getActiveShift error:", err);
      return { success: false, error: err?.message, shift: null };
    }
  }

  /**
   * Buka Shift Kasir Baru
   */
  async openShift(
    tenantId: string,
    branchId: string,
    userId: string,
    initialCash: number,
    shiftNumber = 1,
    notes?: string
  ) {
    try {
      // Cek apakah sudah ada shift yang sedang terbuka di cabang ini
      const existing = await db
        .select()
        .from(schema.cashierShifts)
        .where(
          and(
            eq(schema.cashierShifts.tenantId, tenantId),
            eq(schema.cashierShifts.branchId, branchId),
            eq(schema.cashierShifts.isOpen, true)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const shift = existing[0];
        const shiftName = resolveShiftName(shift.shiftNumber, shift.notes);
        return {
          success: true,
          message: "Shift aktif sudah dibuka sebelumnya",
          shift: {
            id: shift.id,
            branchId: shift.branchId,
            userId: shift.userId,
            shiftNumber: shift.shiftNumber,
            shiftName,
            startTime: shift.startTime.toISOString(),
            initialCash: Number(shift.initialCash),
            startingCash: Number(shift.initialCash),
            isOpen: shift.isOpen
          }
        };
      }

      const [newShift] = await db
        .insert(schema.cashierShifts)
        .values({
          tenantId,
          branchId,
          userId,
          shiftNumber,
          initialCash: String(initialCash),
          expectedCash: String(initialCash),
          actualCash: "0",
          cashDifference: "0",
          totalNonCash: "0",
          totalSales: "0",
          notes: notes || null,
          isOpen: true
        })
        .returning();

      const shiftName = resolveShiftName(newShift.shiftNumber, newShift.notes);

      return {
        success: true,
        shift: {
          id: newShift.id,
          branchId: newShift.branchId,
          userId: newShift.userId,
          shiftNumber: newShift.shiftNumber,
          shiftName,
          startTime: newShift.startTime.toISOString(),
          initialCash: Number(newShift.initialCash),
          startingCash: Number(newShift.initialCash),
          isOpen: newShift.isOpen,
          notes: newShift.notes
        }
      };
    } catch (err: any) {
      console.error("[PosService] openShift error:", err);
      return { success: false, error: err?.message };
    }
  }

  /**
   * Tutup Shift Kasir & Rekonsiliasi Kas Laci
   */
  async closeShift(
    tenantId: string,
    shiftId: string,
    actualCash: number,
    notes?: string
  ) {
    try {
      const shiftRows = await db
        .select()
        .from(schema.cashierShifts)
        .where(
          and(
            eq(schema.cashierShifts.id, shiftId),
            eq(schema.cashierShifts.tenantId, tenantId)
          )
        )
        .limit(1);

      if (shiftRows.length === 0) {
        return { success: false, error: "Shift tidak ditemukan" };
      }

      const shift = shiftRows[0];

      // Ambil transaksi penjualan pada shift ini
      const sales = await db
        .select({
          paymentMethod: schema.salesTransactions.paymentMethod,
          grandTotal: schema.salesTransactions.grandTotal,
          paidAmount: schema.salesTransactions.paidAmount,
          changeAmount: schema.salesTransactions.changeAmount
        })
        .from(schema.salesTransactions)
        .where(
          or(
            eq(schema.salesTransactions.cashierShiftId, shift.id),
            and(
              eq(schema.salesTransactions.branchId, shift.branchId),
              gte(schema.salesTransactions.createdAt, shift.startTime)
            )
          )
        );

      let cashSales = 0;
      let nonCashSales = 0;

      for (const s of sales) {
        const netCash = Math.max(0, Number(s.paidAmount) - Number(s.changeAmount));
        const total = Number(s.grandTotal);
        if (s.paymentMethod === "CASH") {
          cashSales += netCash > 0 ? netCash : total;
        } else {
          nonCashSales += total;
        }
      }

      // Ambil refund tunai dari customer_returns selama shift ini
      const [refundsAgg] = await db
        .select({
          totalCashRefunds: sql<number>`COALESCE(SUM(${schema.customerReturns.refundAmount}), 0)::numeric`
        })
        .from(schema.customerReturns)
        .where(
          and(
            eq(schema.customerReturns.branchId, shift.branchId),
            eq(schema.customerReturns.compensationType, "REFUND_TUNAI"),
            eq(schema.customerReturns.status, "APPROVED"),
            or(
              eq(schema.customerReturns.cashierShiftId, shift.id),
              gte(schema.customerReturns.createdAt, shift.startTime)
            )
          )
        );

      const cashRefunds = Number(refundsAgg?.totalCashRefunds || 0);
      const initialCash = Number(shift.initialCash);
      const expectedCash = initialCash + cashSales - cashRefunds;
      const cashDifference = actualCash - expectedCash;
      const totalSales = cashSales + nonCashSales;
      const endTime = new Date();

      await db
        .update(schema.cashierShifts)
        .set({
          endTime,
          expectedCash: String(expectedCash),
          actualCash: String(actualCash),
          cashDifference: String(cashDifference),
          totalNonCash: String(nonCashSales),
          totalSales: String(totalSales),
          notes: notes || shift.notes,
          isOpen: false
        })
        .where(eq(schema.cashierShifts.id, shift.id));

      return {
        success: true,
        summary: {
          shiftId: shift.id,
          startTime: shift.startTime.toISOString(),
          endTime: endTime.toISOString(),
          initialCash,
          cashSales,
          nonCashSales,
          totalSales,
          expectedCash,
          actualCash,
          cashDifference,
          notes: notes || shift.notes
        }
      };
    } catch (err: any) {
      console.error("[PosService] closeShift error:", err);
      return { success: false, error: err?.message };
    }
  }
}

export const posService = new PosService();
