import { Router } from "express";
import {
  db,
  packagesTable,
  paymentsTable,
  printLogsTable,
  shiftSessionsTable,
  transactionsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

const paymentLabels: Record<string, string> = {
  tunai: "Tunai",
  transfer: "Transfer / QRIS",
  TRANSAKSI_BARU: "Pembayaran transaksi",
  PELUNASAN_PIUTANG: "Pelunasan piutang",
  CICILAN: "Cicilan",
  VOID_REVERSAL: "Pembalikan VOID",
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getReceipt(transactionId: number) {
  const [transaction] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, transactionId))
    .limit(1);
  if (!transaction) return null;

  const packageIds = Array.isArray(transaction.packageIds)
    ? transaction.packageIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    : [];
  const [payments, packages, shift, cashier] = await Promise.all([
    db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.transactionId, transactionId))
      .orderBy(paymentsTable.createdAt),
    packageIds.length
      ? db.select().from(packagesTable).where(inArray(packagesTable.id, packageIds))
      : Promise.resolve([]),
    transaction.shiftSessionId
      ? db
          .select()
          .from(shiftSessionsTable)
          .where(eq(shiftSessionsTable.id, transaction.shiftSessionId))
          .limit(1)
      : Promise.resolve([]),
    transaction.cashierId
      ? db
          .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
          .from(usersTable)
          .where(eq(usersTable.id, transaction.cashierId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return {
    business: {
      name: "JASTIP ANGGUN JAYA",
      subtitle: "Ekspedisi Jawa — Manokwari, Papua Barat",
    },
    transaction: {
      id: transaction.id,
      transactionNo: transaction.transactionNo,
      customerName: transaction.customerName,
      subtotal: numberValue(transaction.subtotal),
      discount: numberValue(transaction.discount),
      discountReason: transaction.discountReason,
      total: numberValue(transaction.total),
      paymentStatus: transaction.paymentStatus,
      transactionStatus: transaction.transactionStatus,
      sisaPiutang: numberValue(transaction.sisaPiutang),
      createdAt: transaction.createdAt.toISOString(),
      packageIds,
    },
    payments: payments.map((payment) => ({
      id: payment.id,
      paymentType: payment.paymentType,
      paymentTypeLabel: paymentLabels[payment.paymentType] ?? payment.paymentType,
      paymentMethod: payment.paymentMethod,
      paymentMethodLabel:
        paymentLabels[payment.paymentMethod ?? ""] ?? payment.paymentMethod ?? "Piutang",
      totalAmount: numberValue(payment.totalAmount),
      paidAmount: numberValue(payment.paidAmount),
      changeAmount: numberValue(payment.changeAmount),
      paymentReference: payment.paymentReference,
      notes: payment.notes,
      createdAt: payment.createdAt.toISOString(),
    })),
    packages: packages.map((pkg) => ({
      id: pkg.id,
      barcode: pkg.barcode,
      resiNumber: pkg.resiNumber,
      packageNumber: pkg.packageNumber,
      itemName: pkg.itemName,
      serviceType: pkg.serviceType,
      deliveryRoute: pkg.deliveryRoute,
      usedWeight: numberValue(pkg.usedWeight),
      totalShipping: numberValue(pkg.totalShipping),
    })),
    cashier: cashier[0] ?? null,
    shift: shift[0]
      ? {
          id: shift[0].id,
          shiftType: shift[0].shiftType,
          terminalId: shift[0].terminalId,
        }
      : null,
  };
}

router.get(
  "/transactions/:id/receipt",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "ID transaksi tidak valid" });
        return;
      }
      const receipt = await getReceipt(id);
      if (!receipt) {
        res.status(404).json({ error: "Transaksi tidak ditemukan" });
        return;
      }
      res.json(receipt);
    } catch (err) {
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal mengambil data struk" });
    }
  },
);

router.post(
  "/transactions/:id/receipt/print",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "ID transaksi tidak valid" });
        return;
      }

      const receipt = await getReceipt(id);
      if (!receipt) {
        res.status(404).json({ error: "Transaksi tidak ditemukan" });
        return;
      }

      const user = (req as any).user;
      const result = await db.transaction(async (tx) => {
        const previous = await tx
          .select({ id: printLogsTable.id })
          .from(printLogsTable)
          .where(
            and(
              eq(printLogsTable.entityType, "transaction"),
              eq(printLogsTable.entityId, id),
              eq(printLogsTable.printType, "STRUK_TRANSAKSI"),
            ),
          );
        const copyNumber = previous.length + 1;
        const [printLog] = await tx
          .insert(printLogsTable)
          .values({
            entityType: "transaction",
            entityId: id,
            printType: "STRUK_TRANSAKSI",
            printedBy: user.id,
            copyNumber,
            isReprint: copyNumber > 1,
          })
          .returning();
        return { printLog, copyNumber };
      });

      res.json({
        receipt,
        print: {
          copyNumber: result.copyNumber,
          isReprint: result.copyNumber > 1,
          label: result.copyNumber > 1 ? "SALINAN / REPRINT" : null,
        },
      });
    } catch (err) {
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal mencatat pencetakan struk" });
    }
  },
);

export default router;