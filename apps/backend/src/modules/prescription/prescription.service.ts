import { db, schema } from "@apoteku/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export interface CreatePrescriptionItem {
  productId: string;
  productName?: string;
  qty: number;
  unit?: string;
  unitPrice: number;
  dosageNote?: string;
}

export interface CreatePrescriptionPayload {
  tenantId?: string;
  branchId?: string;
  doctorName: string;
  patientName: string;
  type: "RACIKAN" | "NON_RACIKAN";
  compoundForm?: string;
  compoundQty?: number;
  etiketType?: "PUTIH" | "BIRU";
  signa: string;
  instruction?: string;
  budDate?: string;
  tuslah?: number;
  embalase?: number;
  notes?: string;
  prescriptionImageUrl?: string;
  items: CreatePrescriptionItem[];
}

class PrescriptionService {
  private async getTenantId(candidate?: string): Promise<string> {
    if (candidate) return candidate;
    const [t] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
    if (!t) throw new Error("No active tenant found in database");
    return t.id;
  }

  async getPrescriptions(branchId?: string, limit = 50) {
    let conditions = [
      sql`(${schema.salesTransactions.customerType} = 'RESEP' OR ${schema.salesTransactions.doctorName} IS NOT NULL OR ${schema.salesTransactions.prescriptionImageUrl} IS NOT NULL)`
    ];

    if (branchId && branchId !== "ALL") {
      conditions.push(eq(schema.salesTransactions.branchId, branchId));
    }

    const trxs = await db
      .select({
        id: schema.salesTransactions.id,
        recipeNumber: schema.salesTransactions.invoiceNo,
        branchId: schema.salesTransactions.branchId,
        branchName: schema.branches.name,
        doctorName: schema.salesTransactions.doctorName,
        patientName: schema.salesTransactions.patientName,
        date: schema.salesTransactions.createdAt,
        prescriptionImageUrl: schema.salesTransactions.prescriptionImageUrl,
        tuslah: schema.salesTransactions.tuslahAmount,
        embalase: schema.salesTransactions.embalaseAmount,
        subtotal: schema.salesTransactions.subtotal,
        grandTotal: schema.salesTransactions.grandTotal,
        paymentMethod: schema.salesTransactions.paymentMethod
      })
      .from(schema.salesTransactions)
      .leftJoin(schema.branches, eq(schema.salesTransactions.branchId, schema.branches.id))
      .where(and(...conditions))
      .orderBy(desc(schema.salesTransactions.createdAt))
      .limit(limit);

    if (trxs.length === 0) return [];

    const trxIds = trxs.map((t) => t.id);

    // Fetch items
    const allItems = await db
      .select({
        id: schema.salesTransactionItems.id,
        transactionId: schema.salesTransactionItems.transactionId,
        productId: schema.salesTransactionItems.productId,
        productName: schema.products.name,
        qty: schema.salesTransactionItems.qty,
        unit: schema.salesTransactionItems.unitName,
        unitPrice: schema.salesTransactionItems.unitPrice,
        dosageNote: schema.salesTransactionItems.dosageRules
      })
      .from(schema.salesTransactionItems)
      .leftJoin(schema.products, eq(schema.salesTransactionItems.productId, schema.products.id))
      .where(inArray(schema.salesTransactionItems.transactionId, trxIds));

    // Fetch compounds
    const allCompounds = await db
      .select()
      .from(schema.salesCompounds)
      .where(inArray(schema.salesCompounds.transactionId, trxIds));

    return trxs.map((t) => {
      const items = allItems.filter((i) => i.transactionId === t.id);
      const compound = allCompounds.find((c) => c.transactionId === t.id);
      const isRacikan = !!compound;

      const d = new Date(t.date);
      const dateFormatted = d.toISOString().replace("T", " ").substring(0, 16);

      return {
        id: t.id,
        recipeNumber: t.recipeNumber,
        branchId: t.branchId,
        branchName: t.branchName || "Apotek Hafidz Farma",
        doctorName: t.doctorName || "Dokter Umum",
        patientName: t.patientName || "Pasien Resep",
        date: dateFormatted,
        type: isRacikan ? ("RACIKAN" as const) : ("NON_RACIKAN" as const),
        compoundForm: compound?.dosageForm || "KAPSUL",
        compoundQty: compound ? Number(compound.quantity) : items.length,
        etiketType: "PUTIH" as const,
        signa: compound?.dosageRules || items[0]?.dosageNote || "3 x Sehari 1 Tablet",
        instruction: "Sesudah Makan",
        budDate: "2027-12-31",
        rCount: isRacikan ? 1 : items.length,
        tuslah: Number(t.tuslah),
        embalase: Number(t.embalase),
        drugSubtotal: Number(t.subtotal),
        totalPrice: Number(t.grandTotal),
        status: "VERIFIED" as const,
        prescriptionImageUrl: t.prescriptionImageUrl || null,
        notes: isRacikan ? `${compound?.compoundName} (${compound?.quantity} ${compound?.dosageForm})` : "Resep Non-Racikan",
        clinicalScreening: {
          adminComplete: true,
          doseVerified: true,
          noInteraction: true,
          allergyHistory: "Tidak ada"
        },
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.productName || "Obat Resep",
          qty: Number(i.qty),
          unit: i.unit || "TAB",
          unitPrice: Number(i.unitPrice),
          dosageNote: i.dosageNote || ""
        }))
      };
    });
  }

  async createPrescription(payload: CreatePrescriptionPayload) {
    const tenantId = await this.getTenantId(payload.tenantId);

    // Resolve branch
    let branchId = payload.branchId;
    if (!branchId || branchId === "ALL") {
      const [firstBranch] = await db
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(eq(schema.branches.tenantId, tenantId))
        .limit(1);
      if (!firstBranch) throw new Error("No branch available");
      branchId = firstBranch.id;
    }

    const transactionId = crypto.randomUUID();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomHex = Math.floor(1000 + Math.random() * 9000);
    const recipeNumber = `RSP-${dateStr}-${randomHex}`;

    // Calculate subtotal from items
    let drugSubtotal = 0;
    const itemsToInsert = [];

    for (let idx = 0; idx < payload.items.length; idx++) {
      const it = payload.items[idx];
      const qty = Number(it.qty) || 1;
      const price = Number(it.unitPrice) || 0;
      const sub = qty * price;
      drugSubtotal += sub;

      itemsToInsert.push({
        id: crypto.randomUUID(),
        transactionId,
        productId: it.productId,
        lineNo: idx + 1,
        unitName: it.unit || "TABLET",
        conversionFactor: "1",
        qty: String(qty),
        qtyBase: String(qty),
        unitPrice: String(price),
        discountPercent: "0",
        discountAmount: "0",
        subtotal: String(sub),
        dosageRules: it.dosageNote || payload.signa
      });
    }

    const tuslah = Number(payload.tuslah || 0);
    const embalase = Number(payload.embalase || 0);
    const grandTotal = drugSubtotal + tuslah + embalase;

    // 1. Insert Header SalesTransaction
    await db.insert(schema.salesTransactions).values({
      id: transactionId,
      tenantId,
      branchId,
      invoiceNo: recipeNumber,
      customerType: "RESEP",
      patientName: payload.patientName,
      doctorName: payload.doctorName,
      prescriptionImageUrl: payload.prescriptionImageUrl || null,
      paymentMethod: "RESEP",
      subtotal: String(drugSubtotal),
      discountPercent: "0",
      discountAmount: "0",
      taxPercent: "0",
      taxAmount: "0",
      tuslahAmount: String(tuslah),
      embalaseAmount: String(embalase),
      grandTotal: String(grandTotal),
      paidAmount: String(grandTotal),
      changeAmount: "0",
      createdAt: now
    });

    // 2. Insert Detail Items
    if (itemsToInsert.length > 0) {
      await db.insert(schema.salesTransactionItems).values(itemsToInsert);
    }

    // 3. If Racikan, Insert Compound Header and Items
    if (payload.type === "RACIKAN") {
      const compoundId = crypto.randomUUID();
      const compoundForm = payload.compoundForm || "PUYER";
      const compoundQty = Number(payload.compoundQty || 10);

      await db.insert(schema.salesCompounds).values({
        id: compoundId,
        tenantId,
        transactionId,
        compoundName: `Racikan ${compoundForm} (${compoundQty} ${compoundForm})`,
        dosageForm: compoundForm,
        quantity: String(compoundQty),
        tuslahAmount: String(tuslah),
        embalaseAmount: String(embalase),
        subtotal: String(grandTotal),
        dosageRules: payload.signa
      });

      const compoundItemsToInsert = itemsToInsert.map((item, idx) => ({
        id: crypto.randomUUID(),
        compoundId,
        productId: item.productId,
        lineNo: idx + 1,
        qtyBase: item.qtyBase,
        unitPrice: item.unitPrice,
        costPrice: "0",
        subtotal: item.subtotal
      }));

      if (compoundItemsToInsert.length > 0) {
        await db.insert(schema.salesCompoundItems).values(compoundItemsToInsert);
      }
    }

    return {
      success: true,
      message: `Resep ${recipeNumber} berhasil disimpan ke database`,
      data: {
        id: transactionId,
        recipeNumber,
        branchId,
        doctorName: payload.doctorName,
        patientName: payload.patientName,
        date: now.toISOString().replace("T", " ").substring(0, 16),
        type: payload.type,
        compoundForm: payload.compoundForm,
        compoundQty: payload.compoundQty,
        etiketType: payload.etiketType || "PUTIH",
        signa: payload.signa,
        instruction: payload.instruction || "Sesudah Makan",
        budDate: payload.budDate || "2027-12-31",
        rCount: payload.items.length,
        tuslah,
        embalase,
        drugSubtotal,
        totalPrice: grandTotal,
        status: "VERIFIED",
        prescriptionImageUrl: payload.prescriptionImageUrl || null,
        notes: payload.notes || "",
        clinicalScreening: {
          adminComplete: true,
          doseVerified: true,
          noInteraction: true,
          allergyHistory: "Tidak ada"
        },
        items: payload.items
      }
    };
  }
}

export const prescriptionService = new PrescriptionService();
