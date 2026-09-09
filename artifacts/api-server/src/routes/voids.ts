import { Router } from "express";
import {
  db,
  packagesTable,
  paymentsTable,
  shiftSessionsTable,
  transactionsTable,
  usersTable,
  voidsTable,
} from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

function packageIdsOf(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
}

// GET /api/voids — laporan VOID dan audit approval, Owner only.
router.get("/", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const records = await db
      .select({
        void: voidsTable,
        transactionNo: transactionsTable.transactionNo,
        customerName: transactionsTable.customerName,
        requesterName: usersTable.name,
      })
      .from(voidsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, voidsTable.transactionId))
      .leftJoin(usersTable, eq(usersTable.id, voidsTable.requestedBy))
      .orderBy(desc(voidsTable.createdAt));
    res.json(records);
  } catch (err) {
    (req as any).log?.error?.(err);
    res.status(500).json({ error: "Gagal mengambil laporan VOID" });
  }
});

// POST /api/voids/:id/approve — Owner menyetujui dan membuat reversal.
router.post("/:id/approve", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = (req as any).user;

    const result = await db.transaction(async (tx) => {
      const [voidRecord] = await tx
        .select()
        .from(voidsTable)
        .where(eq(voidsTable.id, id))
        .limit(1)
        .for("update");
      if (!voidRecord) throw new Error("Pengajuan VOID tidak ditemukan");
      if (voidRecord.statusAfter !== "MENUNGGU_APPROVAL" || voidRecord.approvedBy) {
        throw new Error("Pengajuan VOID sudah diproses");
      }

      const [transaction] = await tx
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.id, voidRecord.transactionId))
        .limit(1)
        .for("update");
      if (!transaction) throw new Error("Transaksi tidak ditemukan");
      if (transaction.transactionStatus !== "AKTIF") {
        throw new Error("Transaksi sudah VOID dan tidak dapat diproses ulang");
      }

      const packageIds = packageIdsOf(transaction.packageIds);
      const activeTransactions = await tx
        .select({
          id: transactionsTable.id,
          packageIds: transactionsTable.packageIds,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.transactionStatus, "AKTIF"));
      const usedByOtherTransaction = activeTransactions.some(
        (other) =>
          other.id !== transaction.id &&
          packageIdsOf(other.packageIds).some((packageId) => packageIds.includes(packageId)),
      );
      if (usedByOtherTransaction) {
        throw new Error("Paket terkait sudah masuk transaksi aktif lain");
      }

      const payments = await tx
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.transactionId, transaction.id));
      const reversalAmount = payments.reduce(
        (sum, payment) => sum + Number(payment.totalAmount ?? 0),
        0,
      );

      const [sourceShift] = transaction.shiftSessionId
        ? await tx
            .select()
            .from(shiftSessionsTable)
            .where(eq(shiftSessionsTable.id, transaction.shiftSessionId))
            .limit(1)
        : [];
      const isPostClosing = sourceShift?.status === "CLOSED";
      const activeShiftId = (req as any).activeShift?.id ?? null;
      // Approval is Owner-only and does not require the approver to have a
      // cashier shift. If the source shift is still active, attribute the
      // refund to that shift so its physical cash formula includes it. A
      // post-closing VOID intentionally stays unassigned as a correction.
      const reversalShiftId =
        activeShiftId ?? (isPostClosing ? null : transaction.shiftSessionId ?? null);

      if (packageIds.length) {
        await tx
          .update(packagesTable)
          .set({
            status: "pending",
            statusPengambilan: "BELUM_DIAMBIL",
            pickedUpAt: null,
            updatedAt: new Date(),
          })
          .where(inArray(packagesTable.id, packageIds));
      }

      if (reversalAmount > 0) {
        await tx.insert(paymentsTable).values({
          paymentType: "VOID_REVERSAL",
          paymentMethod: null,
          totalAmount: String(-reversalAmount),
          paidAmount: String(-reversalAmount),
          changeAmount: "0",
          packageIds,
          packageSummary: null,
          adminId: user.id,
          adminName: user.name,
          shiftSessionId: reversalShiftId,
          transactionId: transaction.id,
          notes: isPostClosing
            ? "Koreksi pasca-closing: reversal VOID"
            : "Reversal VOID",
        });
      }

      const [updatedTransaction] = await tx
        .update(transactionsTable)
        .set({
          transactionStatus: "VOID",
          paymentStatus: "BELUM_BAYAR",
          sisaPiutang: "0",
        })
        .where(eq(transactionsTable.id, transaction.id))
        .returning();
      const [updatedVoid] = await tx
        .update(voidsTable)
        .set({
          approvedBy: user.id,
          approvedAt: new Date(),
          reversalAmount: String(reversalAmount),
          packageIdsReturned: packageIds,
          statusAfter: "VOID",
          isPostClosing,
        })
        .where(eq(voidsTable.id, id))
        .returning();

      return { void: updatedVoid, transaction: updatedTransaction };
    });

    res.json(result);
  } catch (err: any) {
    (req as any).log?.error?.(err);
    const message = err instanceof Error ? err.message : "Gagal menyetujui VOID";
    const status = message.includes("tidak ditemukan") ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

export default router;