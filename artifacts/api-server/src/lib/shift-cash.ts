import {
  db,
  pengeluaranTable,
  paymentsTable,
  transactionsTable,
  shiftSessionsTable,
  type ShiftSession,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

export function toRupiahInteger(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function isWithinShift(
  value: Date | null | undefined,
  start: Date,
  end: Date,
): boolean {
  if (!value) return false;
  return value >= start && value <= end;
}

export async function calculateShiftCash(shift: ShiftSession) {
  const start = shift.actualStart ?? shift.createdAt;
  const end = shift.actualEnd ?? new Date();

  const [payments, transactions, pengeluaranList] = await Promise.all([
    db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.shiftSessionId, shift.id)),
    db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.shiftSessionId, shift.id)),
    db.select().from(pengeluaranTable),
  ]);

  const reversalPayments = payments.filter(
    (payment) => payment.paymentType === "VOID_REVERSAL",
  );
  const reversedTransactionIds = [
    ...new Set(
      reversalPayments
        .map((payment) => payment.transactionId)
        .filter((id): id is number => Number.isInteger(id)),
    ),
  ];
  const originalPayments = reversedTransactionIds.length
    ? await db
        .select()
        .from(paymentsTable)
        .where(inArray(paymentsTable.transactionId, reversedTransactionIds))
    : [];

  // Sah / active transactions (not VOID)
  const sahTransactions = transactions.filter(
    (t) => t.transactionStatus !== "VOID",
  );
  const totalOmzet = sahTransactions.reduce(
    (sum, t) => sum + toRupiahInteger(t.total),
    0,
  );
  const totalTransactions = sahTransactions.length;

  const cashPayments = payments.filter(
    (payment) =>
      (payment.paymentMethod === "tunai" || payment.paymentType === "tunai") &&
      payment.paymentType !== "VOID_REVERSAL",
  );
  const transferPayments = payments.filter(
    (payment) =>
      (payment.paymentMethod === "transfer" ||
        payment.paymentType === "transfer") &&
      payment.paymentType !== "VOID_REVERSAL",
  );
  const qrisPayments = payments.filter(
    (payment) =>
      (payment.paymentMethod === "qris" || payment.paymentType === "qris") &&
      payment.paymentType !== "VOID_REVERSAL",
  );
  const receivablePayments = payments.filter(
    (payment) => payment.paymentType === "PELUNASAN_PIUTANG",
  );

  const cashOmzet = cashPayments.reduce(
    (sum, p) => sum + toRupiahInteger(p.totalAmount),
    0,
  );
  const transferOmzet = transferPayments.reduce(
    (sum, p) => sum + toRupiahInteger(p.totalAmount),
    0,
  );
  const qrisOmzet = qrisPayments.reduce(
    (sum, p) => sum + toRupiahInteger(p.totalAmount),
    0,
  );
  const receivableOmzet = receivablePayments.reduce(
    (sum, p) => sum + toRupiahInteger(p.totalAmount),
    0,
  );

  const totalPaymentsReceived =
    cashOmzet + transferOmzet + qrisOmzet;

  // New receivables created in this shift
  const newReceivables = sahTransactions
    .filter((t) => t.paymentStatus === "BELUM_BAYAR" || t.paymentStatus === "BAYAR_SEBAGIAN")
    .reduce((sum, t) => {
      if (t.paymentStatus === "BELUM_BAYAR") return sum + toRupiahInteger(t.total);
      return sum + toRupiahInteger(t.sisaPiutang);
    }, 0);

  const cashReceived = cashPayments.reduce(
    (sum, payment) =>
      sum + toRupiahInteger(payment.paidAmount ?? payment.totalAmount),
    0,
  );
  const changeGiven = cashPayments.reduce(
    (sum, payment) => sum + toRupiahInteger(payment.changeAmount),
    0,
  );

  const shiftExpenses = pengeluaranList.filter((expense) =>
    isWithinShift(expense.createdAt, start, end),
  );
  const cashExpenses = shiftExpenses
    .filter(
      (expense) =>
        String(expense.metodePembayaran || "").toLowerCase() === "cash" ||
        String(expense.metodePembayaran || "").toLowerCase() === "tunai",
    )
    .reduce((sum, expense) => sum + toRupiahInteger(expense.nominal), 0);

  const nonCashExpenses = shiftExpenses
    .filter(
      (expense) =>
        String(expense.metodePembayaran || "").toLowerCase() !== "cash" &&
        String(expense.metodePembayaran || "").toLowerCase() !== "tunai",
    )
    .reduce((sum, expense) => sum + toRupiahInteger(expense.nominal), 0);

  const refundCash = reversalPayments.reduce((sum, reversal) => {
    const originalCash = originalPayments
      .filter(
        (payment) =>
          payment.transactionId === reversal.transactionId &&
          payment.paymentType !== "VOID_REVERSAL" &&
          (payment.paymentMethod === "tunai" ||
            payment.paymentType === "tunai"),
      )
      .reduce(
        (cashSum, payment) =>
          cashSum + Math.max(0, toRupiahInteger(payment.totalAmount)),
        0,
      );
    const reversalAmount = Math.abs(toRupiahInteger(reversal.totalAmount));
    return sum + Math.min(reversalAmount, originalCash);
  }, 0);

  const cashDeposits = 0;
  const openingBalance = toRupiahInteger(shift.openingBalance);
  const systemCash =
    openingBalance +
    cashReceived -
    changeGiven -
    cashExpenses -
    refundCash -
    cashDeposits;

  return {
    openingBalance,
    paymentCount: payments.filter((p) => p.paymentType !== "VOID_REVERSAL").length,
    cashPaymentCount: cashPayments.length,
    transferPaymentCount: transferPayments.length,
    qrisPaymentCount: qrisPayments.length,
    receivablePaymentCount: receivablePayments.length,
    totalOmzet,
    totalTransactions,
    cashOmzet,
    transferOmzet,
    qrisOmzet,
    receivableOmzet,
    totalPaymentsReceived,
    newReceivables,
    oldReceivablesReceived: receivableOmzet,
    cashReceived,
    changeGiven,
    cashExpenses,
    nonCashExpenses,
    refundCash,
    cashDeposits,
    systemCash,
  };
}

export async function getActiveShiftForUser(userId: number) {
  const rows = await db
    .select()
    .from(shiftSessionsTable)
    .where(
      and(
        eq(shiftSessionsTable.adminId, userId),
        eq(shiftSessionsTable.status, "AKTIF"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}