import {
  db,
  pengeluaranTable,
  paymentsTable,
  shiftSessionsTable,
  type ShiftSession,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

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

  const cashPayments = payments.filter((payment) => payment.paymentType === "tunai");
  const transferPayments = payments.filter((payment) => payment.paymentType === "transfer");
  const receivablePayments = payments.filter((payment) => payment.paymentType === "piutang");

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

  // Refunds and cash deposits do not have source tables in the existing system.
  // Keep them explicit so later phases can add the real components without
  // changing the formula shape.
  const refundCash = 0;
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