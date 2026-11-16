import { db, schema } from "@apoteku/db";
import { eq, or, and } from "drizzle-orm";

async function seedSipnapSample() {
  console.log("Starting SIPNAP Sample Seeding...");

  // 1. Ambil Master Data Tenant, Branch, User, Location, Supplier
  const [tenant] = await db.select().from(schema.tenants).limit(1);
  if (!tenant) throw new Error("Tenant not found");

  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.id, "81d3bcff-9577-47b6-9a35-7d510c0d4225"));
  const branchId = branch?.id || (await db.select().from(schema.branches).limit(1))[0].id;

  const [user] = await db.select().from(schema.users).limit(1);
  const userId = user.id;

  const [location] = await db
    .select()
    .from(schema.inventoryLocations)
    .where(eq(schema.inventoryLocations.branchId, branchId));
  const locationId = location?.id;

  let [kfSupplier] = await db
    .select()
    .from(schema.suppliers)
    .where(eq(schema.suppliers.id, "1a33459a-dd05-42e2-99b8-8ebb5ed828e1"));
  if (!kfSupplier) {
    const [firstSupplier] = await db.select().from(schema.suppliers).limit(1);
    kfSupplier = firstSupplier;
  }

  console.log(`Using Tenant: ${tenant.id}, Branch: ${branchId}, Supplier: ${kfSupplier.name}`);

  // 2. Daftar 3 Obat Contoh Terkontrol
  const targetProducts = [
    {
      sku: "NAR-001",
      name: "Codikaf 10mg Tablet (Codeine HCl)",
      activeSubstance: "Codeine HCl 10mg",
      drugClass: "NARKOTIKA",
      baseUnit: "TABLET",
      buyPrice: "4500",
      salePrice: "6500",
      batchNo: "B-NAR2601",
      expDate: "2028-12-31",
      initialStock: 25,
      qtyIn: 50,
      qtyOut: 15,
      finalStock: 60,
      spNumber: "SP-NAR-HF-2026-0001",
      invNumber: "INV/KF/2026/1101",
      rxTrxNo: "TRX-RSP-2026-001",
      patientName: "Bpk. Rahmat Subagja",
      doctorName: "dr. Sp.P Hendra Gunawan, Sp.P"
    },
    {
      sku: "PSI-001",
      name: "Valisanbe 2mg Tablet (Diazepam)",
      activeSubstance: "Diazepam 2mg",
      drugClass: "PSIKOTROPIKA",
      baseUnit: "TABLET",
      buyPrice: "2800",
      salePrice: "4200",
      batchNo: "B-PSI2601",
      expDate: "2028-10-31",
      initialStock: 40,
      qtyIn: 100,
      qtyOut: 20,
      finalStock: 120,
      spNumber: "SP-PSI-HF-2026-0001",
      invNumber: "INV/KF/2026/1102",
      rxTrxNo: "TRX-RSP-2026-002",
      patientName: "Ibu Siti Aminah",
      doctorName: "dr. Maya Wijaya, Sp.KJ"
    },
    {
      sku: "PRE-001",
      name: "Rhinos SR Kapsul (Pseudoephedrine HCl)",
      activeSubstance: "Pseudoephedrine HCl 120mg",
      drugClass: "PREKURSOR",
      baseUnit: "KAPSUL",
      buyPrice: "8500",
      salePrice: "11500",
      batchNo: "B-PRE2601",
      expDate: "2028-09-30",
      initialStock: 30,
      qtyIn: 60,
      qtyOut: 10,
      finalStock: 80,
      spNumber: "SP-PRE-HF-2026-0001",
      invNumber: "INV/KF/2026/1103",
      rxTrxNo: "TRX-RSP-2026-003",
      patientName: "Tn. Dedi Kusnadi",
      doctorName: "dr. Anita Fitri, Sp.THT"
    }
  ];

  const now = new Date();
  const orderDateStr = "2026-11-05";
  const receiveDateStr = "2026-11-08";
  const saleDate = new Date(2026, 10, 12, 14, 30, 0);

  for (const item of targetProducts) {
    console.log(`\nProcessing ${item.drugClass}: ${item.name}...`);

    // A. Pastikan Produk Tersedia
    let [prod] = await db
      .select()
      .from(schema.products)
      .where(and(eq(schema.products.tenantId, tenant.id), eq(schema.products.sku, item.sku)));

    if (!prod) {
      [prod] = await db
        .insert(schema.products)
        .values({
          tenantId: tenant.id,
          sku: item.sku,
          name: item.name,
          activeSubstance: item.activeSubstance,
          drugClass: item.drugClass,
          baseUnit: item.baseUnit,
          referenceBuyPriceBase: item.buyPrice,
          minStock: "10",
          isActive: true
        })
        .returning();
      console.log(` Created product ${prod.name} (${prod.id})`);
    } else {
      await db
        .update(schema.products)
        .set({
          name: item.name,
          activeSubstance: item.activeSubstance,
          drugClass: item.drugClass,
          baseUnit: item.baseUnit
        })
        .where(eq(schema.products.id, prod.id));
      console.log(` Updated product ${prod.name}`);
    }

    // B. Product Unit
    const [existingUnit] = await db
      .select()
      .from(schema.productUnits)
      .where(and(eq(schema.productUnits.productId, prod.id), eq(schema.productUnits.unitName, item.baseUnit)));

    if (!existingUnit) {
      await db.insert(schema.productUnits).values({
        tenantId: tenant.id,
        productId: prod.id,
        unitName: item.baseUnit,
        conversionFactor: "1",
        buyPrice: item.buyPrice,
        salePriceGeneral: item.salePrice,
        salePriceResep: item.salePrice,
        isBaseUnit: true,
        isSellable: true,
        isPurchaseUnit: true
      });
    }

    // C. Product Batch
    let [batch] = await db
      .select()
      .from(schema.productBatches)
      .where(
        and(
          eq(schema.productBatches.tenantId, tenant.id),
          eq(schema.productBatches.productId, prod.id),
          eq(schema.productBatches.batchNo, item.batchNo)
        )
      );

    if (!batch) {
      [batch] = await db
        .insert(schema.productBatches)
        .values({
          tenantId: tenant.id,
          productId: prod.id,
          batchNo: item.batchNo,
          expiredDate: item.expDate
        })
        .returning();
    }

    // D. Branch Stock
    if (locationId) {
      const [existingStock] = await db
        .select()
        .from(schema.branchStocks)
        .where(and(eq(schema.branchStocks.locationId, locationId), eq(schema.branchStocks.productId, prod.id)));

      if (!existingStock) {
        await db.insert(schema.branchStocks).values({
          tenantId: tenant.id,
          branchId,
          locationId,
          productId: prod.id,
          totalQtyBase: String(item.finalStock),
          unbatchedQtyBase: "0"
        });
      } else {
        await db
          .update(schema.branchStocks)
          .set({ totalQtyBase: String(item.finalStock) })
          .where(eq(schema.branchStocks.id, existingStock.id));
      }

      // Branch Batch Stock
      const [existingBatchStock] = await db
        .select()
        .from(schema.branchBatchStocks)
        .where(
          and(
            eq(schema.branchBatchStocks.locationId, locationId),
            eq(schema.branchBatchStocks.productId, prod.id),
            eq(schema.branchBatchStocks.batchId, batch.id)
          )
        );

      if (!existingBatchStock) {
        await db.insert(schema.branchBatchStocks).values({
          tenantId: tenant.id,
          branchId,
          locationId,
          productId: prod.id,
          batchId: batch.id,
          qtyBase: String(item.finalStock),
          buyPrice: item.buyPrice
        });
      } else {
        await db
          .update(schema.branchBatchStocks)
          .set({ qtyBase: String(item.finalStock) })
          .where(eq(schema.branchBatchStocks.id, existingBatchStock.id));
      }
    }

    // E. Purchase Order (Surat Pesanan Resmi)
    let [po] = await db
      .select()
      .from(schema.purchaseOrders)
      .where(and(eq(schema.purchaseOrders.tenantId, tenant.id), eq(schema.purchaseOrders.poNumber, item.spNumber)));

    const poAmount = String(item.qtyIn * Number(item.buyPrice));

    if (!po) {
      [po] = await db
        .insert(schema.purchaseOrders)
        .values({
          tenantId: tenant.id,
          branchId,
          supplierId: kfSupplier.id,
          poNumber: item.spNumber,
          status: "RECEIVED",
          orderDate: orderDateStr,
          expectedDeliveryDate: receiveDateStr,
          totalAmount: poAmount,
          notes: `Surat Pesanan Resmi ${item.drugClass} untuk SIPNAP Kemenkes`,
          createdBy: userId
        })
        .returning();

      await db.insert(schema.purchaseOrderItems).values({
        purchaseOrderId: po.id,
        productId: prod.id,
        lineNo: 1,
        unitName: item.baseUnit,
        qtyOrdered: String(item.qtyIn),
        qtyReceived: String(item.qtyIn),
        estimatedPrice: item.buyPrice,
        subtotal: poAmount
      });
      console.log(` Created Purchase Order ${po.poNumber}`);
    }

    // F. Purchase Invoice (Faktur Pembelian PBF Masuk)
    let [inv] = await db
      .select()
      .from(schema.purchaseInvoices)
      .where(
        and(
          eq(schema.purchaseInvoices.tenantId, tenant.id),
          eq(schema.purchaseInvoices.invoiceNumber, item.invNumber)
        )
      );

    if (!inv) {
      [inv] = await db
        .insert(schema.purchaseInvoices)
        .values({
          tenantId: tenant.id,
          branchId,
          supplierId: kfSupplier.id,
          purchaseOrderId: po.id,
          invoiceNumber: item.invNumber,
          receiveDate: receiveDateStr,
          invoiceDate: orderDateStr,
          dueDate: "2026-12-08",
          isCredit: true,
          subtotal: poAmount,
          discountAmount: "0",
          taxAmount: String(Math.round(Number(poAmount) * 0.11)),
          grandTotal: String(Math.round(Number(poAmount) * 1.11)),
          paidAmount: "0",
          isPaidOff: false,
          receivedBy: userId
        })
        .returning();

      if (locationId) {
        await db.insert(schema.purchaseInvoiceItems).values({
          invoiceId: inv.id,
          productId: prod.id,
          locationId,
          batchId: batch.id,
          lineNo: 1,
          unitName: item.baseUnit,
          conversionFactor: "1",
          qty: String(item.qtyIn),
          qtyBase: String(item.qtyIn),
          buyPrice: item.buyPrice,
          subtotal: poAmount
        });
      }
      console.log(` Created Purchase Invoice ${inv.invoiceNumber}`);
    }

    // G. Resep Penjualan Kasir (Pelayanan Resep Dokter)
    let [saleTrx] = await db
      .select()
      .from(schema.salesTransactions)
      .where(
        and(
          eq(schema.salesTransactions.tenantId, tenant.id),
          eq(schema.salesTransactions.invoiceNo, item.rxTrxNo)
        )
      );

    const saleAmount = String(item.qtyOut * Number(item.salePrice));

    if (!saleTrx) {
      const trxId = crypto.randomUUID();
      [saleTrx] = await db
        .insert(schema.salesTransactions)
        .values({
          id: trxId,
          tenantId: tenant.id,
          branchId,
          invoiceNo: item.rxTrxNo,
          customerType: "RESEP",
          patientName: item.patientName,
          doctorName: item.doctorName,
          paymentMethod: "CASH",
          subtotal: saleAmount,
          discountAmount: "0",
          taxAmount: "0",
          tuslahAmount: "3000",
          embalaseAmount: "2000",
          grandTotal: String(Number(saleAmount) + 5000),
          paidAmount: String(Number(saleAmount) + 5000),
          changeAmount: "0",
          createdAt: saleDate
        })
        .returning();

      if (locationId) {
        await db.insert(schema.salesTransactionItems).values({
          id: crypto.randomUUID(),
          transactionId: saleTrx.id,
          productId: prod.id,
          lineNo: 1,
          locationId,
          batchId: batch.id,
          unitName: item.baseUnit,
          conversionFactor: "1",
          qty: String(item.qtyOut),
          qtyBase: String(item.qtyOut),
          unitPrice: item.salePrice,
          subtotal: saleAmount,
          dosageRules: "3 x 1 tablet sesudah makan"
        });
      }
      console.log(` Created Prescription Sale ${saleTrx.invoiceNo} (Dr: ${item.doctorName})`);
    }

    // H. Audit Trail Stock Ledger
    if (locationId) {
      // Mutasi Masuk
      await db.insert(schema.stockLedger).values({
        tenantId: tenant.id,
        branchId,
        productId: prod.id,
        locationId,
        batchId: batch.id,
        mutationType: "PURCHASE_RECEIPT",
        quantityBase: String(item.qtyIn),
        costPerUnit: item.buyPrice,
        referenceId: inv.id,
        notes: `Penerimaan Pembelian PBF Faktur ${inv.invoiceNumber} (SP: ${po.poNumber})`,
        createdBy: userId,
        createdAt: new Date(2026, 10, 8, 10, 0, 0)
      });

      // Mutasi Keluar
      await db.insert(schema.stockLedger).values({
        tenantId: tenant.id,
        branchId,
        productId: prod.id,
        locationId,
        batchId: batch.id,
        mutationType: "POS_SALE",
        quantityBase: String(-item.qtyOut),
        costPerUnit: item.buyPrice,
        referenceId: saleTrx.id,
        notes: `Penyerahan Resep Kasir ${saleTrx.invoiceNo} (Pasien: ${item.patientName})`,
        createdBy: userId,
        createdAt: saleDate
      });
    }
  }

  console.log("\n✅ SIPNAP Sample Seeding Finished Successfully!");
  process.exit(0);
}

seedSipnapSample().catch((err) => {
  console.error("❌ Seeding Error:", err);
  process.exit(1);
});
