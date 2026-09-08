/**
 * Backfill legacy payments into the new transactions table.
 *
 * The script is intentionally idempotent: only payments without a
 * transaction_id are processed. Legacy tunai/transfer payments become LUNAS;
 * legacy piutang payments become BELUM_BAYAR so historical debt is not lost.
 *
 * Run with:
 *   pnpm --filter @workspace/scripts run migrate-finance-foundation
 */

import {
  db,
  paymentsTable,
  transactionsTable,
} from "@workspace/db";
import { eq, isNull } from "drizzle-orm";

function getCustomerName(payment: typeof paymentsTable.$inferSelect): string {
  const firstPackage = Array.isArray(payment.packageSummary)
    ? payment.packageSummary[0]
    : null;
  return firstPackage?.customerName || `Legacy Payment #${payment.id}`;
}

async function main() {
  const legacyPayments = await db
    .select()
    .from(paymentsTable)
    .where(isNull(paymentsTable.transactionId));

  if (legacyPayments.length === 0) {
    console.log("No legacy payments require backfill.");
    return;
  }

  await db.transaction(async (tx) => {
    for (const payment of legacyPayments) {
      const isFinal = payment.paymentType !== "piutang";
      const total = String(payment.totalAmount);
      const packageIds = Array.isArray(payment.packageIds)
        ? payment.packageIds
        : [];

      const [transaction] = await tx
        .insert(transactionsTable)
        .values({
          transactionNo: `LEGACY-${String(payment.id).padStart(8, "0")}`,
          customerName: getCustomerName(payment),
          packageIds,
          subtotal: total,
          discount: "0",
          total,
          paymentStatus: isFinal ? "LUNAS" : "BELUM_BAYAR",
          transactionStatus: "AKTIF",
          sisaPiutang: isFinal ? "0" : total,
          cashierId: payment.adminId,
          createdAt: payment.createdAt,
        })
        .returning({ id: transactionsTable.id });

      await tx
        .update(paymentsTable)
        .set({ transactionId: transaction.id })
        .where(eq(paymentsTable.id, payment.id));
    }
  });

  console.log(`Backfilled ${legacyPayments.length} legacy payments.`);
}

main()
  .catch((error) => {
    console.error("Finance foundation backfill failed:", error);
    process.exitCode = 1;
  });