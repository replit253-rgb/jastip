import {
  db,
  pengeluaranTable,
  paymentsTable,
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

  const payments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.shiftSessionId, shift.id));

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

  const cashPayments = payments.filter(
    (payment) =>
      payment.paymentMethod === "tunai" || payment.paymentType === "tunai",
  );
  const transferPayments = payments.filter(
    (payment) =>
      payment.paymentMethod === "transfer" || payment.paymentType === "transfer",
  );
  const receivablePayments = payments.filter(
    (payment) => payment.paymentType === "piutang",
  );

  const cashReceived = cashPayments.reduce(
    (sum, payment) =>
      sum + toRupiahInteger(payment.paidAmount ?? payment.totalAmount),
    0,
  );
  const changeGiven = cashPayments.reduce(
    (sum, payment) => sum + toRupiahInteger(payment.changeAmount),
    0,
  );

  const cashExpenses = (
    await db
      .select()
      .from(pengeluaranTable)
      .where(eq(pengeluaranTable.metodePembayaran, "cash"))
  )
    .filter((expense) => isWithinShift(expense.createdAt, start, end))
    .reduce((sum, expense) => sum + toRupiahInteger(expense.nominal), 0);

  // A VOID reversal is stored as one negative aggregate payment. Only the
  // portion backed by original cash payments returned money to the drawer;
  // transfer reversals never entered physical cash and must not reduce it.
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
    paymentCount: payments.length,
    cashPaymentCount: cashPayments.length,
    transferPaymentCount: transferPayments.length,
    receivablePaymentCount: receivablePayments.length,
    cashReceived,
    changeGiven,
    cashExpenses,
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