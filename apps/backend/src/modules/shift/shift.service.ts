import { db, schema } from "@apoteku/db";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { calculateCashierShiftReconciliation, resolveShiftName } from "@apoteku/core";

export interface OpenShiftParams {
  tenantId?: string;
  branchId: string;
  userId?: string;
  initialCash: number;
  shiftNumber?: number;
  notes?: string;
}

export interface CloseShiftParams {
  shiftId: string;
  actualCash: number;
  notes?: string;
}

export interface GetShiftsParams {
  branchId?: string;
  status?: "ALL" | "OPEN" | "CLOSED";
  limit?: number;
}

class ShiftService {
  private async getTenantId(candidate?: string): Promise<string> {
    if (candidate) return candidate;
    const [t] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
    if (!t) throw new Error("No active tenant found in database");
    return t.id;
  }

  async getCurrentShift(branchId: string, tenantIdCandidate?: string) {
    const tenantId = await this.getTenantId(tenantIdCandidate);

    const [shift] = await db
      .select({
        id: schema.cashierShifts.id,
        tenantId: schema.cashierShifts.tenantId,
        branchId: schema.cashierShifts.branchId,
        branchName: schema.branches.name,
        shiftNumber: schema.cashierShifts.shiftNumber,
        startTime: schema.cashierShifts.startTime,
        endTime: schema.cashierShifts.endTime,
        initialCash: schema.cashierShifts.initialCash,
        expectedCash: schema.cashierShifts.expectedCash,
        actualCash: schema.cashierShifts.actualCash,
        cashDifference: schema.cashierShifts.cashDifference,
        totalNonCash: schema.cashierShifts.totalNonCash,
        totalSales: schema.cashierShifts.totalSales,
        notes: schema.cashierShifts.notes,
        isOpen: schema.cashierShifts.isOpen
      })
      .from(schema.cashierShifts)
      .leftJoin(schema.branches, eq(schema.cashierShifts.branchId, schema.branches.id))
      .where(
        and(
          eq(schema.cashierShifts.branchId, branchId),
          eq(schema.cashierShifts.isOpen, true)
        )
      )
      .limit(1);

    if (!shift) return null;

    // Calculate real-time sales since shift start
    const salesAgg = await db
      .select({
        cashSales: sql<number>`COALESCE(SUM(CASE WHEN ${schema.salesTransactions.paymentMethod} = 'CASH' THEN ${schema.salesTransactions.grandTotal} ELSE 0 END), 0)::numeric`,
        nonCashSales: sql<number>`COALESCE(SUM(CASE WHEN ${schema.salesTransactions.paymentMethod} != 'CASH' THEN ${schema.salesTransactions.grandTotal} ELSE 0 END), 0)::numeric`,
        totalSales: sql<number>`COALESCE(SUM(${schema.salesTransactions.grandTotal}), 0)::numeric`,
        trxCount: sql<number>`COUNT(*)::int`
      })
      .from(schema.salesTransactions)
      .where(
        and(
          eq(schema.salesTransactions.branchId, branchId),
          gte(schema.salesTransactions.createdAt, shift.startTime)
        )
      );

    // Hitung total refund tunai dari retur penjualan kasir selama shift ini
    const [refundsAgg] = await db
      .select({
        totalCashRefunds: sql<number>`COALESCE(SUM(${schema.customerReturns.refundAmount}), 0)::numeric`,
        refundCount: sql<number>`COUNT(*)::int`
      })
      .from(schema.customerReturns)
      .where(
        and(
          eq(schema.customerReturns.branchId, branchId),
          eq(schema.customerReturns.compensationType, "REFUND_TUNAI"),
          eq(schema.customerReturns.status, "APPROVED"),
          gte(schema.customerReturns.createdAt, shift.startTime)
        )
      );

    // Hitung mutasi kas laci kasir (KAS_LACI) selama shift ini (pengeluaran kas kecil & penambahan modal/piutang)
    const [mutationsAgg] = await db
      .select({
        cashIn: sql<number>`COALESCE(SUM(CASE WHEN ${schema.cashMutations.type} = 'IN' THEN ${schema.cashMutations.amount} ELSE 0 END), 0)::numeric`,
        cashOut: sql<number>`COALESCE(SUM(CASE WHEN ${schema.cashMutations.type} = 'OUT' THEN ${schema.cashMutations.amount} ELSE 0 END), 0)::numeric`
      })
      .from(schema.cashMutations)
      .where(
        and(
          eq(schema.cashMutations.branchId, branchId),
          eq(schema.cashMutations.account, "KAS_LACI"),
          sql`${schema.cashMutations.category} != 'RETUR_PENJUALAN'`,
          gte(schema.cashMutations.transactionDate, shift.startTime)
        )
      );

    const agg = salesAgg[0] || { cashSales: 0, nonCashSales: 0, totalSales: 0, trxCount: 0 };
    const initial = Number(shift.initialCash);
    const cashSales = Number(agg.cashSales);
    const nonCashSales = Number(agg.nonCashSales);
    const totalSales = Number(agg.totalSales);
    const cashRefunds = Number(refundsAgg?.totalCashRefunds || 0);
    const drawerMutIn = Number(mutationsAgg?.cashIn || 0);
    const drawerMutOut = Number(mutationsAgg?.cashOut || 0);
    const reconciliation = calculateCashierShiftReconciliation({
      initialCash: initial,
      cashSales,
      actualCash: 0,
      cashRefunds,
      pettyCashIn: drawerMutIn,
      pettyCashOut: drawerMutOut
    });
    const expectedCash = reconciliation.expectedCash;

    return {
      ...shift,
      initialCash: initial,
      currentCashSales: cashSales,
      currentNonCashSales: nonCashSales,
      currentTotalSales: totalSales,
      currentCashRefunds: cashRefunds,
      drawerMutIn,
      drawerMutOut,
      pettyCashIn: drawerMutIn,
      pettyCashOut: drawerMutOut,
      expectedCash,
      trxCount: agg.trxCount
    };
  }

  async openShift(params: OpenShiftParams) {
    const tenantId = await this.getTenantId(params.tenantId);

    // Verify branch exists
    const [branch] = await db
      .select({ id: schema.branches.id, name: schema.branches.name })
      .from(schema.branches)
      .where(eq(schema.branches.id, params.branchId))
      .limit(1);

    if (!branch) {
      throw new Error(`Branch with ID ${params.branchId} does not exist`);
    }

    // Check if open shift already exists
    const existing = await this.getCurrentShift(params.branchId, tenantId);
    if (existing) {
      return {
        success: false,
        message: `Shift aktif #${existing.shiftNumber} masih terbuka untuk cabang ini`,
        data: existing
      };
    }

    // Determine shift number for today
    const [todayCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.cashierShifts)
      .where(
        and(
          eq(schema.cashierShifts.branchId, params.branchId),
          sql`DATE(${schema.cashierShifts.startTime}) = CURRENT_DATE`
        )
      );

    const shiftNumber = params.shiftNumber || (Number(todayCount?.count || 0) + 1);
    const shiftId = crypto.randomUUID();
    const userId = params.userId || crypto.randomUUID();

    const [created] = await db
      .insert(schema.cashierShifts)
      .values({
        id: shiftId,
        tenantId,
        branchId: params.branchId,
        userId,
        shiftNumber,
        startTime: new Date(),
        initialCash: String(params.initialCash || 0),
        expectedCash: String(params.initialCash || 0),
        actualCash: "0",
        cashDifference: "0",
        totalNonCash: "0",
        totalSales: "0",
        notes: params.notes || null,
        isOpen: true
      })
      .returning();

    return {
      success: true,
      message: `Shift #${shiftNumber} berhasil dibuka dengan modal Rp ${Number(params.initialCash).toLocaleString("id-ID")}`,
      data: {
        ...created,
        branchName: branch.name,
        initialCash: Number(created.initialCash),
        expectedCash: Number(created.expectedCash)
      }
    };
  }

  async closeShift(params: CloseShiftParams) {
    const [shift] = await db
      .select()
      .from(schema.cashierShifts)
      .where(eq(schema.cashierShifts.id, params.shiftId))
      .limit(1);

    if (!shift) {
      throw new Error(`Shift dengan ID ${params.shiftId} tidak ditemukan`);
    }

    if (!shift.isOpen) {
      return {
        success: false,
        message: "Shift ini sudah ditutup sebelumnya",
        data: shift
      };
    }

    // Calculate final sales since shift start
    const salesAgg = await db
      .select({
        cashSales: sql<number>`COALESCE(SUM(CASE WHEN ${schema.salesTransactions.paymentMethod} = 'CASH' THEN ${schema.salesTransactions.grandTotal} ELSE 0 END), 0)::numeric`,
        nonCashSales: sql<number>`COALESCE(SUM(CASE WHEN ${schema.salesTransactions.paymentMethod} != 'CASH' THEN ${schema.salesTransactions.grandTotal} ELSE 0 END), 0)::numeric`,
        totalSales: sql<number>`COALESCE(SUM(${schema.salesTransactions.grandTotal}), 0)::numeric`
      })
      .from(schema.salesTransactions)
      .where(
        and(
          eq(schema.salesTransactions.branchId, shift.branchId),
          gte(schema.salesTransactions.createdAt, shift.startTime)
        )
      );

    // Hitung total refund tunai dari retur penjualan kasir selama shift ini
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
          gte(schema.customerReturns.createdAt, shift.startTime)
        )
      );

    // Hitung mutasi kas laci kasir (KAS_LACI) selama shift ini
    const [mutationsAgg] = await db
      .select({
        cashIn: sql<number>`COALESCE(SUM(CASE WHEN ${schema.cashMutations.type} = 'IN' THEN ${schema.cashMutations.amount} ELSE 0 END), 0)::numeric`,
        cashOut: sql<number>`COALESCE(SUM(CASE WHEN ${schema.cashMutations.type} = 'OUT' THEN ${schema.cashMutations.amount} ELSE 0 END), 0)::numeric`
      })
      .from(schema.cashMutations)
      .where(
        and(
          eq(schema.cashMutations.branchId, shift.branchId),
          eq(schema.cashMutations.account, "KAS_LACI"),
          sql`${schema.cashMutations.category} != 'RETUR_PENJUALAN'`,
          gte(schema.cashMutations.transactionDate, shift.startTime)
        )
      );

    const agg = salesAgg[0] || { cashSales: 0, nonCashSales: 0, totalSales: 0 };
    const initial = Number(shift.initialCash);
    const cashSales = Number(agg.cashSales);
    const totalNonCash = Number(agg.nonCashSales);
    const totalSales = Number(agg.totalSales);
    const cashRefunds = Number(refundsAgg?.totalCashRefunds || 0);
    const drawerMutIn = Number(mutationsAgg?.cashIn || 0);
    const drawerMutOut = Number(mutationsAgg?.cashOut || 0);
    const actualCash = Number(params.actualCash);
    const reconciliation = calculateCashierShiftReconciliation({
      initialCash: initial,
      cashSales,
      actualCash,
      cashRefunds,
      pettyCashIn: drawerMutIn,
      pettyCashOut: drawerMutOut
    });
    const expectedCash = reconciliation.expectedCash;
    const cashDifference = reconciliation.cashDifference;

    const [updated] = await db
      .update(schema.cashierShifts)
      .set({
        endTime: new Date(),
        actualCash: String(actualCash),
        expectedCash: String(expectedCash),
        cashDifference: String(cashDifference),
        totalNonCash: String(totalNonCash),
        totalSales: String(totalSales),
        notes: params.notes || shift.notes,
        isOpen: false
      })
      .where(eq(schema.cashierShifts.id, params.shiftId))
      .returning();

    return {
      success: true,
      message: `Shift #${updated.shiftNumber} berhasil ditutup. Selisih kas: Rp ${cashDifference.toLocaleString("id-ID")}`,
      data: {
        ...updated,
        initialCash: Number(updated.initialCash),
        expectedCash: Number(updated.expectedCash),
        actualCash: Number(updated.actualCash),
        cashDifference: Number(updated.cashDifference),
        totalSales: Number(updated.totalSales),
        totalNonCash: Number(updated.totalNonCash)
      }
    };
  }

  async getShifts(params: GetShiftsParams = {}) {
    const limit = Math.min(params.limit || 50, 100);

    let conditions = [];
    if (params.branchId && params.branchId !== "ALL") {
      conditions.push(eq(schema.cashierShifts.branchId, params.branchId));
    }
    if (params.status === "OPEN") {
      conditions.push(eq(schema.cashierShifts.isOpen, true));
    } else if (params.status === "CLOSED") {
      conditions.push(eq(schema.cashierShifts.isOpen, false));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const shifts = await db
      .select({
        id: schema.cashierShifts.id,
        tenantId: schema.cashierShifts.tenantId,
        branchId: schema.cashierShifts.branchId,
        branchName: schema.branches.name,
        shiftNumber: schema.cashierShifts.shiftNumber,
        startTime: schema.cashierShifts.startTime,
        endTime: schema.cashierShifts.endTime,
        initialCash: schema.cashierShifts.initialCash,
        expectedCash: schema.cashierShifts.expectedCash,
        actualCash: schema.cashierShifts.actualCash,
        cashDifference: schema.cashierShifts.cashDifference,
        totalNonCash: schema.cashierShifts.totalNonCash,
        totalSales: schema.cashierShifts.totalSales,
        notes: schema.cashierShifts.notes,
        isOpen: schema.cashierShifts.isOpen
      })
      .from(schema.cashierShifts)
      .leftJoin(schema.branches, eq(schema.cashierShifts.branchId, schema.branches.id))
      .where(whereClause)
      .orderBy(desc(schema.cashierShifts.startTime))
      .limit(limit);

    return await Promise.all(
      shifts.map(async (s) => {
        const baseShift = resolveShiftName(s.shiftNumber, s.notes);
        const shiftLabel = s.notes && s.notes.startsWith("[") ? baseShift : `Shift ${s.shiftNumber} - ${baseShift}`;

        let expectedCash = Number(s.expectedCash);
        let totalNonCash = Number(s.totalNonCash);
        let totalSales = Number(s.totalSales);
        let pettyCashOut = 0;
        let pettyCashIn = 0;
        let cashRefunds = 0;

        if (s.isOpen) {
          try {
            const live = await this.getCurrentShift(s.branchId, s.tenantId);
            if (live) {
              expectedCash = live.expectedCash;
              totalNonCash = live.currentNonCashSales;
              totalSales = live.currentTotalSales;
              pettyCashOut = live.drawerMutOut || 0;
              pettyCashIn = live.drawerMutIn || 0;
              cashRefunds = live.currentCashRefunds || 0;
            }
          } catch (_) {}
        }

        return {
          id: s.id,
          shiftCode: `SHF-${s.shiftNumber.toString().padStart(3, "0")}`,
          branchId: s.branchId,
          branchName: s.branchName || "Cabang",
          cashierName: "Kasir Petugas",
          shiftLabel,
          startTime: s.startTime.toISOString(),
          endTime: s.endTime ? s.endTime.toISOString() : "",
          initialCash: Number(s.initialCash),
          expectedCash,
          actualCash: Number(s.actualCash),
          cashDifference: Number(s.cashDifference),
          totalNonCash,
          totalSales,
          pettyCashOut,
          pettyCashIn,
          cashRefunds,
          isOpen: s.isOpen,
          notes: s.notes || ""
        };
      })
    );
  }
}

export const shiftService = new ShiftService();
