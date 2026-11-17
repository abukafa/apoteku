import { db, schema } from "@apoteku/db";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { generatePrescriptionNumber } from "@apoteku/core";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreatePrescriptionItem {
  productId: string;
  productName?: string;
  qty: number;
  conversionFactor?: number;
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
  allergyHistory?: string;
  initialStatus?: "DRAFT" | "VERIFIED";
  verifiedByName?: string;
  prescriptionImageUrl?: string;
  items: CreatePrescriptionItem[];
}

export interface VerifyPrescriptionPayload {
  tenantId?: string;
  adminComplete?: boolean;
  doseVerified?: boolean;
  noInteraction?: boolean;
  allergyHistory?: string;
  verifiedByName?: string;
}

export interface DispensePrescriptionPayload {
  tenantId?: string;
  allergyNote?: string;
  pioPoints: string;
  pharmacistName: string;
  drugSummary?: string;
  signa?: string;
}

export interface CreateDoctorPayload {
  tenantId?: string;
  name: string;
  sip?: string;
  specialization?: string;
  hospital?: string;
  phone?: string;
}

function formatDateTimeMinute(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || "-");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

class PrescriptionService {
  private async getTenantId(candidate?: string): Promise<string> {
    if (candidate && UUID_RE.test(candidate)) return candidate;
    const [t] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
    if (!t) throw new Error("No active tenant found in database");
    return t.id;
  }

  private async hydratePrescriptions(trxs: any[]) {
    if (trxs.length === 0) return [];

    const trxIds = trxs.map((t) => t.id);

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

    const allCompounds = await db
      .select()
      .from(schema.salesCompounds)
      .where(inArray(schema.salesCompounds.transactionId, trxIds));

    return trxs.map((t) => {
      const items = allItems.filter((i) => i.transactionId === t.id);
      const compound = allCompounds.find((c) => c.transactionId === t.id);
      const isRacikan = t.profileType ? t.profileType === "RACIKAN" : !!compound;
      const statusRaw = String(t.profileStatus || "DRAFT").toUpperCase();
      const status =
        statusRaw === "DISPENSED" || statusRaw === "VERIFIED" || statusRaw === "DRAFT"
          ? (statusRaw as "DRAFT" | "VERIFIED" | "DISPENSED")
          : "DRAFT";

      const defaultBud = new Date(new Date(t.date).getTime() + 30 * 86400000).toISOString().slice(0, 10);
      const itemSummary = items.map((i) => `${i.productName || "Obat"} (${Number(i.qty)} ${i.unit || "UNIT"})`).join(", ");

      return {
        id: t.id,
        recipeNumber: t.recipeNumber,
        branchId: t.branchId,
        branchName: t.branchName || "Apotek Hafidz Farma",
        branchAddress: t.branchAddress || "",
        branchPhone: t.branchPhone || "",
        doctorName: t.doctorName || "Dokter Umum",
        patientName: t.patientName || "Pasien Resep",
        date: formatDateTimeMinute(t.date),
        type: isRacikan ? ("RACIKAN" as const) : ("NON_RACIKAN" as const),
        compoundForm: t.compoundForm || compound?.dosageForm || (isRacikan ? "KAPSUL" : undefined),
        compoundQty: t.compoundQty ?? (compound ? Number(compound.quantity) : undefined),
        etiketType: (t.etiketType === "BIRU" ? "BIRU" : "PUTIH") as "PUTIH" | "BIRU",
        signa: t.signa || compound?.dosageRules || items[0]?.dosageNote || "Sesuai aturan pakai",
        instruction: t.instruction || "Sesudah Makan",
        budDate: t.budDate || defaultBud,
        rCount: items.length || (isRacikan ? 1 : 0),
        tuslah: Number(t.tuslah || 0),
        embalase: Number(t.embalase || 0),
        drugSubtotal: Number(t.subtotal || 0),
        totalPrice: Number(t.grandTotal || 0),
        status,
        prescriptionImageUrl: t.prescriptionImageUrl || null,
        notes:
          t.profileNotes ||
          (compound ? `${compound.compoundName} (${Number(compound.quantity)} ${compound.dosageForm})` : itemSummary || "Resep Non-Racikan"),
        clinicalScreening: {
          adminComplete: Boolean(t.adminComplete),
          doseVerified: Boolean(t.doseVerified),
          noInteraction: Boolean(t.noInteraction),
          allergyHistory: t.allergyHistory || "Tidak ada"
        },
        verifiedByName: t.verifiedByName || null,
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.productName || "Obat Resep",
          qty: Number(i.qty),
          unit: i.unit || "TABLET",
          unitPrice: Number(i.unitPrice),
          dosageNote: i.dosageNote || ""
        }))
      };
    });
  }

  private prescriptionSelectFields() {
    return {
      id: schema.salesTransactions.id,
      recipeNumber: schema.salesTransactions.invoiceNo,
      branchId: schema.salesTransactions.branchId,
      branchName: schema.branches.name,
      branchAddress: schema.branches.address,
      branchPhone: schema.branches.phone,
      doctorName: schema.salesTransactions.doctorName,
      patientName: schema.salesTransactions.patientName,
      date: schema.salesTransactions.createdAt,
      prescriptionImageUrl: schema.salesTransactions.prescriptionImageUrl,
      tuslah: schema.salesTransactions.tuslahAmount,
      embalase: schema.salesTransactions.embalaseAmount,
      subtotal: schema.salesTransactions.subtotal,
      grandTotal: schema.salesTransactions.grandTotal,
      paymentMethod: schema.salesTransactions.paymentMethod,
      profileType: schema.prescriptionProfiles.prescriptionType,
      compoundForm: schema.prescriptionProfiles.compoundForm,
      compoundQty: schema.prescriptionProfiles.compoundQty,
      etiketType: schema.prescriptionProfiles.etiketType,
      signa: schema.prescriptionProfiles.signa,
      instruction: schema.prescriptionProfiles.instruction,
      budDate: schema.prescriptionProfiles.budDate,
      profileNotes: schema.prescriptionProfiles.notes,
      profileStatus: schema.prescriptionProfiles.status,
      adminComplete: schema.prescriptionProfiles.adminComplete,
      doseVerified: schema.prescriptionProfiles.doseVerified,
      noInteraction: schema.prescriptionProfiles.noInteraction,
      allergyHistory: schema.prescriptionProfiles.allergyHistory,
      verifiedByName: schema.prescriptionProfiles.verifiedByName
    };
  }

  async getPrescriptionById(id: string) {
    if (!UUID_RE.test(id)) return null;
    const rows = await db
      .select(this.prescriptionSelectFields())
      .from(schema.salesTransactions)
      .leftJoin(schema.branches, eq(schema.salesTransactions.branchId, schema.branches.id))
      .leftJoin(
        schema.prescriptionProfiles,
        eq(schema.salesTransactions.id, schema.prescriptionProfiles.transactionId)
      )
      .where(eq(schema.salesTransactions.id, id))
      .limit(1);

    const hydrated = await this.hydratePrescriptions(rows);
    return hydrated[0] || null;
  }

  async getPrescriptions(tenantId?: string, branchId?: string, limit = 100) {
    const resolvedTenantId = await this.getTenantId(tenantId);
    const conditions: any[] = [
      eq(schema.salesTransactions.tenantId, resolvedTenantId),
      sql`(${schema.salesTransactions.customerType} = 'RESEP' OR ${schema.salesTransactions.doctorName} IS NOT NULL OR ${schema.salesTransactions.prescriptionImageUrl} IS NOT NULL)`
    ];

    if (branchId && branchId !== "ALL") {
      if (!UUID_RE.test(branchId)) return [];
      conditions.push(eq(schema.salesTransactions.branchId, branchId));
    }

    const trxs = await db
      .select(this.prescriptionSelectFields())
      .from(schema.salesTransactions)
      .leftJoin(schema.branches, eq(schema.salesTransactions.branchId, schema.branches.id))
      .leftJoin(
        schema.prescriptionProfiles,
        eq(schema.salesTransactions.id, schema.prescriptionProfiles.transactionId)
      )
      .where(and(...conditions))
      .orderBy(desc(schema.salesTransactions.createdAt))
      .limit(limit);

    return this.hydratePrescriptions(trxs);
  }

  async createPrescription(payload: CreatePrescriptionPayload) {
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error("Resep wajib memiliki minimal 1 item obat");
    }

    const tenantId = await this.getTenantId(payload.tenantId);

    // Resolve valid branchId in PostgreSQL
    let branchId = payload.branchId;
    if (!branchId || branchId === "ALL" || !UUID_RE.test(branchId)) {
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
    const recipeNumber = generatePrescriptionNumber(undefined, now);

    let drugSubtotal = 0;
    const itemsToInsert: Array<{
      id: string;
      transactionId: string;
      productId: string;
      lineNo: number;
      unitName: string;
      conversionFactor: string;
      qty: string;
      qtyBase: string;
      unitPrice: string;
      discountPercent: string;
      discountAmount: string;
      subtotal: string;
      dosageRules: string;
    }> = [];

    for (let idx = 0; idx < payload.items.length; idx++) {
      const it = payload.items[idx];
      if (!UUID_RE.test(it.productId)) {
        throw new Error(`Produk tidak valid (${it.productName || it.productId})`);
      }
      const qty = Number(it.qty) || 1;
      const factor = Math.max(1, Number(it.conversionFactor || 1));
      const price = Number(it.unitPrice) || 0;
      const sub = qty * price;
      drugSubtotal += sub;

      itemsToInsert.push({
        id: crypto.randomUUID(),
        transactionId,
        productId: it.productId,
        lineNo: idx + 1,
        unitName: it.unit || "TABLET",
        conversionFactor: String(factor),
        qty: String(qty),
        qtyBase: String(qty * factor),
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
    const initialStatus = payload.initialStatus === "VERIFIED" ? "VERIFIED" : "DRAFT";
    const isVerified = initialStatus === "VERIFIED";
    const itemSummary = payload.items.map((i) => `${i.productName || "Obat"} (${i.qty} ${i.unit || "TAB"})`).join(", ");
    const resolvedNotes = payload.notes?.trim() || itemSummary;

    await db.transaction(async (tx) => {
      await tx.insert(schema.salesTransactions).values({
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

      if (itemsToInsert.length > 0) {
        await tx.insert(schema.salesTransactionItems).values(itemsToInsert);
      }

      if (payload.type === "RACIKAN") {
        const compoundId = crypto.randomUUID();
        const compoundForm = payload.compoundForm || "KAPSUL";
        const compoundQty = Number(payload.compoundQty || 10);

        await tx.insert(schema.salesCompounds).values({
          id: compoundId,
          tenantId,
          transactionId,
          compoundName: resolvedNotes || `Racikan ${compoundForm} (${compoundQty} ${compoundForm})`,
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
          await tx.insert(schema.salesCompoundItems).values(compoundItemsToInsert);
        }
      }

      await tx.insert(schema.prescriptionProfiles).values({
        tenantId,
        transactionId,
        prescriptionType: payload.type,
        compoundForm: payload.type === "RACIKAN" ? payload.compoundForm || "KAPSUL" : null,
        compoundQty: payload.type === "RACIKAN" ? Number(payload.compoundQty || 10) : null,
        etiketType: payload.etiketType || "PUTIH",
        signa: payload.signa,
        instruction: payload.instruction || "Sesudah Makan",
        budDate: payload.budDate || new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10),
        notes: resolvedNotes,
        status: initialStatus,
        adminComplete: isVerified,
        doseVerified: isVerified,
        noInteraction: isVerified,
        allergyHistory: payload.allergyHistory?.trim() || "Tidak ada",
        verifiedByName: isVerified ? payload.verifiedByName || null : null,
        verifiedAt: isVerified ? now : null,
        updatedAt: now
      });

      // 4. Potong stok fisik cabang & catat mutasi di stock_ledger
      const [defaultLocation] = await tx
        .select({ id: schema.inventoryLocations.id })
        .from(schema.inventoryLocations)
        .where(
          and(
            eq(schema.inventoryLocations.branchId, branchId),
            eq(schema.inventoryLocations.isDefault, true)
          )
        )
        .limit(1);

      const anyLocation = defaultLocation || (await tx
        .select({ id: schema.inventoryLocations.id })
        .from(schema.inventoryLocations)
        .where(eq(schema.inventoryLocations.branchId, branchId))
        .limit(1)
        .then((r) => r[0]));

      const targetLocationId = anyLocation?.id;

      if (targetLocationId) {
        for (const item of itemsToInsert) {
          const qtyToDeduct = Number(item.qtyBase) || 0;
          if (qtyToDeduct <= 0) continue;

          // Cari batch aktif dengan stok di branchBatchStocks
          const batchStocks = await tx
            .select({
              id: schema.branchBatchStocks.id,
              batchId: schema.branchBatchStocks.batchId,
              qtyBase: schema.branchBatchStocks.qtyBase
            })
            .from(schema.branchBatchStocks)
            .where(
              and(
                eq(schema.branchBatchStocks.branchId, branchId),
                eq(schema.branchBatchStocks.productId, item.productId),
                sql`${schema.branchBatchStocks.qtyBase} > 0`
              )
            )
            .orderBy(desc(schema.branchBatchStocks.qtyBase))
            .limit(1);

          const activeBatch = batchStocks[0];

          // Update saldo stok total cabang
          await tx
            .update(schema.branchStocks)
            .set({
              totalQtyBase: sql`${schema.branchStocks.totalQtyBase} - ${qtyToDeduct}`,
              updatedAt: now
            })
            .where(
              and(
                eq(schema.branchStocks.branchId, branchId),
                eq(schema.branchStocks.productId, item.productId),
                eq(schema.branchStocks.locationId, targetLocationId)
              )
            );

          // Update saldo per batch jika ada
          if (activeBatch) {
            await tx
              .update(schema.branchBatchStocks)
              .set({
                qtyBase: sql`GREATEST(0, ${schema.branchBatchStocks.qtyBase} - ${qtyToDeduct})`,
                updatedAt: now
              })
              .where(eq(schema.branchBatchStocks.id, activeBatch.id));
          }

          // Catat audit trail pengeluaran di stock_ledger
          await tx.insert(schema.stockLedger).values({
            id: crypto.randomUUID(),
            tenantId,
            branchId,
            locationId: targetLocationId,
            productId: item.productId,
            batchId: activeBatch?.batchId || null,
            mutationType: "POS_SALE",
            quantityBase: String(-qtyToDeduct),
            costPerUnit: "0",
            referenceId: transactionId,
            notes: `Pelayanan resep dokter nota ${recipeNumber} (${payload.patientName || "Pasien"})`,
            createdBy: crypto.randomUUID(),
            createdAt: now
          });
        }
      }
    });

    const createdRecord = await this.getPrescriptionById(transactionId);
    return {
      success: true,
      message: `Resep ${recipeNumber} berhasil disimpan ke database`,
      data: createdRecord
    };
  }

  async verifyPrescription(id: string, payload: VerifyPrescriptionPayload) {
    if (!UUID_RE.test(id)) throw new Error("ID resep tidak valid");
    const [trx] = await db
      .select()
      .from(schema.salesTransactions)
      .where(eq(schema.salesTransactions.id, id))
      .limit(1);
    if (!trx) throw new Error("Data resep tidak ditemukan");

    const now = new Date();
    const adminComplete = payload.adminComplete ?? true;
    const doseVerified = payload.doseVerified ?? true;
    const noInteraction = payload.noInteraction ?? true;
    const allergyHistory = payload.allergyHistory || "Tidak ada";

    await db
      .insert(schema.prescriptionProfiles)
      .values({
        tenantId: trx.tenantId,
        transactionId: trx.id,
        prescriptionType: "NON_RACIKAN",
        etiketType: "PUTIH",
        status: "VERIFIED",
        adminComplete,
        doseVerified,
        noInteraction,
        allergyHistory,
        verifiedByName: payload.verifiedByName || null,
        verifiedAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: schema.prescriptionProfiles.transactionId,
        set: {
          status: "VERIFIED",
          adminComplete,
          doseVerified,
          noInteraction,
          allergyHistory,
          verifiedByName: payload.verifiedByName || null,
          verifiedAt: now,
          updatedAt: now
        }
      });

    const updated = await this.getPrescriptionById(id);
    return {
      success: true,
      message: `Skrining klinis resep ${trx.invoiceNo} diverifikasi`,
      data: updated
    };
  }

  async dispensePrescription(id: string, payload: DispensePrescriptionPayload) {
    if (!UUID_RE.test(id)) throw new Error("ID resep tidak valid");
    const existing = await this.getPrescriptionById(id);
    if (!existing) throw new Error("Data resep tidak ditemukan");

    const [trx] = await db
      .select()
      .from(schema.salesTransactions)
      .where(eq(schema.salesTransactions.id, id))
      .limit(1);
    if (!trx) throw new Error("Transaksi resep tidak ditemukan");

    const now = new Date();
    const allergyNote = payload.allergyNote?.trim() || existing.clinicalScreening.allergyHistory || "Tidak ada alergi obat";
    const drugSummary = payload.drugSummary?.trim() || existing.notes || "Obat Resep";
    const signa = payload.signa?.trim() || `${existing.signa} (${existing.instruction})`;

    let createdCounseling: any = null;

    await db.transaction(async (tx) => {
      await tx
        .insert(schema.prescriptionProfiles)
        .values({
          tenantId: trx.tenantId,
          transactionId: trx.id,
          prescriptionType: existing.type,
          etiketType: existing.etiketType,
          status: "DISPENSED",
          adminComplete: true,
          doseVerified: true,
          noInteraction: true,
          allergyHistory: allergyNote,
          dispensedAt: now,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: schema.prescriptionProfiles.transactionId,
          set: {
            status: "DISPENSED",
            adminComplete: true,
            doseVerified: true,
            noInteraction: true,
            allergyHistory: allergyNote,
            dispensedAt: now,
            updatedAt: now
          }
        });

      const [cRow] = await tx
        .insert(schema.prescriptionCounselings)
        .values({
          tenantId: trx.tenantId,
          branchId: trx.branchId,
          transactionId: trx.id,
          recipeNumber: existing.recipeNumber,
          patientName: existing.patientName,
          doctorName: existing.doctorName,
          drugSummary,
          signa,
          allergyNote,
          pioPoints: payload.pioPoints,
          pharmacistName: payload.pharmacistName,
          counseledAt: now
        })
        .returning();

      createdCounseling = {
        id: cRow.id,
        recipeNumber: cRow.recipeNumber,
        branchId: cRow.branchId,
        date: formatDateTimeMinute(cRow.counseledAt),
        patientName: cRow.patientName,
        doctorName: cRow.doctorName || "Dokter Umum",
        drugSummary: cRow.drugSummary,
        signa: cRow.signa || "",
        allergyNote: cRow.allergyNote || "Tidak ada",
        pioPoints: cRow.pioPoints,
        pharmacistName: cRow.pharmacistName
      };
    });

    const updatedPrescription = await this.getPrescriptionById(id);
    return {
      success: true,
      message: `Obat diserahkan & dokumentasi PIO untuk ${existing.recipeNumber} tersimpan`,
      data: {
        prescription: updatedPrescription,
        counseling: createdCounseling
      }
    };
  }

  async getCounselings(tenantId?: string, branchId?: string, limit = 100) {
    const resolvedTenantId = await this.getTenantId(tenantId);
    const conditions: any[] = [eq(schema.prescriptionCounselings.tenantId, resolvedTenantId)];

    if (branchId && branchId !== "ALL") {
      if (!UUID_RE.test(branchId)) return [];
      conditions.push(eq(schema.prescriptionCounselings.branchId, branchId));
    }

    const rows = await db
      .select()
      .from(schema.prescriptionCounselings)
      .where(and(...conditions))
      .orderBy(desc(schema.prescriptionCounselings.counseledAt))
      .limit(limit);

    return rows.map((c) => ({
      id: c.id,
      recipeNumber: c.recipeNumber,
      branchId: c.branchId,
      date: formatDateTimeMinute(c.counseledAt),
      patientName: c.patientName,
      doctorName: c.doctorName || "Dokter Umum",
      drugSummary: c.drugSummary,
      signa: c.signa || "",
      allergyNote: c.allergyNote || "Tidak ada",
      pioPoints: c.pioPoints,
      pharmacistName: c.pharmacistName
    }));
  }

  async getDoctors(tenantId?: string) {
    const resolvedTenantId = await this.getTenantId(tenantId);
    const rows = await db
      .select()
      .from(schema.doctors)
      .where(and(eq(schema.doctors.tenantId, resolvedTenantId), eq(schema.doctors.isActive, true)))
      .orderBy(asc(schema.doctors.name));

    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      sip: d.sip || "-",
      specialization: d.specialization || "Dokter Umum",
      hospital: d.hospital || "Praktek Mandiri",
      phone: d.phone || ""
    }));
  }

  async createDoctor(payload: CreateDoctorPayload) {
    if (!payload.name?.trim()) {
      throw new Error("Nama dokter wajib diisi");
    }
    const tenantId = await this.getTenantId(payload.tenantId);

    const [created] = await db
      .insert(schema.doctors)
      .values({
        tenantId,
        name: payload.name.trim(),
        sip: payload.sip?.trim() || null,
        specialization: payload.specialization?.trim() || "Dokter Umum",
        hospital: payload.hospital?.trim() || "Praktek Mandiri",
        phone: payload.phone?.trim() || null,
        isActive: true
      })
      .returning();

    return {
      success: true,
      message: `Dokter "${created.name}" berhasil ditambahkan`,
      data: {
        id: created.id,
        name: created.name,
        sip: created.sip || "-",
        specialization: created.specialization || "Dokter Umum",
        hospital: created.hospital || "Praktek Mandiri",
        phone: created.phone || ""
      }
    };
  }
}

export const prescriptionService = new PrescriptionService();
