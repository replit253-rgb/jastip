import { Router } from "express";
import {
  db,
  packagesTable,
  paymentsTable,
  transactionsTable,
  voidsTable,
} from "@workspace/db";
import { and, desc, eq, gte, like, inArray } from "drizzle-orm";
import { requireActiveShift } from "../middlewares/shift";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();
const paymentMethods = new Set(["tunai", "transfer"]);

function getPaymentMethod(body: any) {
  return String(body.paymentMethod ?? body.paymentType ?? "");
}

function amount(value: unknown, fieldName: string, allowZero = true): number {
  const parsed = Number(value ?? 0);
  if (
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    (allowZero ? parsed < 0 : parsed <= 0)
  ) {
    throw new Error(`${fieldName} harus berupa angka Rupiah bulat`);
  }
  return parsed;
}

function datePrefix() {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

async function nextTransactionNo(tx: any) {
  const prefix = `TRX-${datePrefix()}-`;
  const rows = await tx
    .select({ transactionNo: transactionsTable.transactionNo })
    .from(transactionsTable)
    .where(like(transactionsTable.transactionNo, `${prefix}%`));
  const largest = rows.reduce((max: number, row: { transactionNo: string }) => {
    const suffix = Number(row.transactionNo.slice(prefix.length));
    return Number.isInteger(suffix) ? Math.max(max, suffix) : max;
  }, 0);
  return `${prefix}${String(largest + 1).padStart(5, "0")}`;
}

function statusFor(total: number, paid: number) {
  if (paid <= 0) return "BELUM_BAYAR" as const;
  if (paid >= total) return "LUNAS" as const;
  return "BAYAR_SEBAGIAN" as const;
}

function getCustomerName(body: any) {
  const summary = Array.isArray(body.packageSummary) ? body.packageSummary : [];
  return String(
    body.customerName ??
      summary[0]?.customerName ??
      "Pelanggan umum",
  ).trim();
}

function getPackageIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0),
  )];
}

function getIdempotencyKey(req: any) {
  const key = String(req.get("Idempotency-Key") ?? req.body?.idempotencyKey ?? "").trim();
  if (!key || key.length > 128) {
    throw new Error("Idempotency key wajib diisi dan maksimal 128 karakter");
  }
  return key;
}

function isUniqueViolation(err: unknown) {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "23505",
  );
}

router.get(
  "/",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const { paymentStatus, transactionStatus } = req.query as Record<
        string,
        string
      >;
      const conditions = [];
      if (paymentStatus && paymentStatus !== "all") {
        conditions.push(eq(transactionsTable.paymentStatus, paymentStatus as any));
      }
      if (transactionStatus && transactionStatus !== "all") {
        conditions.push(
          eq(transactionsTable.transactionStatus, transactionStatus as any),
        );
      }

      const transactions = await db
        .select()
        .from(transactionsTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(transactionsTable.createdAt));
      const payments = await db
        .select()
        .from(paymentsTable)
        .orderBy(desc(paymentsTable.createdAt));

      res.json(
        transactions.map((transaction) => ({
          ...transaction,
          payments: payments.filter(
            (payment) => payment.transactionId === transaction.id,
          ),
        })),
      );
    } catch (err) {
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal mengambil data transaksi" });
    }
  },
);

// POST /api/transactions/:id/void — ajukan VOID, approval dilakukan Owner.
router.post(
  "/:id/void",
  requireAuth,
  requireRole("admin", "owner"),
  requireActiveShift,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const reasonCode = String(req.body?.reasonCode ?? "").trim();
      const notes = String(req.body?.notes ?? "").trim() || null;
      if (!reasonCode) {
        res.status(400).json({ error: "Alasan VOID wajib diisi" });
        return;
      }

      const [transaction] = await db
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.id, id))
        .limit(1);
      if (!transaction) {
        res.status(404).json({ error: "Transaksi tidak ditemukan" });
        return;
      }
      if (transaction.transactionStatus !== "AKTIF") {
        res.status(400).json({ error: "Transaksi sudah VOID dan tidak dapat diajukan ulang" });
        return;
      }

      const existing = await db
        .select()
        .from(voidsTable)
        .where(eq(voidsTable.transactionId, id));
      if (existing.some((record) => record.statusAfter === "MENUNGGU_APPROVAL")) {
        res.status(400).json({ error: "Pengajuan VOID transaksi ini masih menunggu approval" });
        return;
      }

      const user = (req as any).user;
      const [record] = await db
        .insert(voidsTable)
        .values({
          transactionId: id,
          reasonCode,
          notes,
          requestedBy: user.id,
          reversalAmount: "0",
          packageIdsReturned: [],
          statusBefore: "AKTIF",
          statusAfter: "MENUNGGU_APPROVAL",
        })
        .returning();
      res.status(201).json(record);
    } catch (err) {
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal mengajukan VOID" });
    }
  },
);

router.post(
  "/",
  requireAuth,
  requireRole("admin", "owner"),
  requireActiveShift,
  async (req, res) => {
    try {
      const body = req.body ?? {};
      const idempotencyKey = getIdempotencyKey(req);
      const packageIds = getPackageIds(body.packageIds);
      const subtotal = amount(body.subtotal ?? body.totalAmount, "Subtotal");
      const discount = amount(body.discount ?? 0, "Diskon");
      const total = amount(
        body.total ?? subtotal - discount,
        "Total",
      );
      if (discount > subtotal || total !== subtotal - discount) {
        res.status(400).json({ error: "Total transaksi tidak valid" });
        return;
      }
      if (!packageIds.length) {
        res.status(400).json({ error: "Minimal satu paket harus dipilih" });
        return;
      }

       const method = String(body.paymentMethod ?? body.paymentType ?? "piutang");
      if (method !== "piutang" && !paymentMethods.has(method)) {
        res.status(400).json({ error: "Jenis pembayaran tidak valid" });
        return;
      }

      if (method === "piutang") {
        if (!String(body.penanggungJawab ?? "").trim()) {
          res.status(400).json({ error: "Nama penanggung jawab wajib diisi untuk piutang" });
          return;
        }
        if (!String(body.jatuhTempo ?? "").trim()) {
          res.status(400).json({ error: "Jatuh tempo wajib diisi untuk piutang" });
          return;
        }
        if (!String(body.notes ?? "").trim()) {
          res.status(400).json({ error: "Catatan wajib diisi untuk piutang" });
          return;
        }
        if (body.paidAmount == null || String(body.paidAmount).trim() === "") {
          res.status(400).json({ error: "Nominal piutang wajib diisi" });
          return;
        }
      }

      const received = method === "piutang"
        ? amount(body.paidAmount, "Nominal pembayaran")
        : amount(body.paidAmount ?? 0, "Nominal diterima");
       if (method === "piutang" && received >= total && total > 0) {
         res.status(400).json({
           error: "Transaksi piutang harus menyisakan saldo piutang",
         });
         return;
       }
       const credited = Math.min(received, total);
      if (credited > total) {
        res.status(400).json({ error: "Nominal pembayaran melebihi total" });
        return;
      }
      if (method !== "piutang" && credited <= 0) {
        res.status(400).json({ error: "Nominal pembayaran wajib diisi" });
        return;
      }
      if (method === "transfer" && received !== total) {
        res.status(400).json({ error: "Pembayaran transfer harus sama dengan total" });
        return;
      }

      const user = (req as any).user;
      const activeShift = (req as any).activeShift;
      let replayed = false;
      let created;
      try {
        created = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(transactionsTable)
            .where(eq(transactionsTable.idempotencyKey, idempotencyKey))
            .limit(1);
          if (existing) {
            replayed = true;
            const existingPayments = await tx
              .select()
              .from(paymentsTable)
              .where(eq(paymentsTable.transactionId, existing.id))
              .orderBy(desc(paymentsTable.createdAt));
            return { transaction: existing, payment: existingPayments[0] ?? null };
          }

          const lockedPackages = await tx
            .select({
              id: packagesTable.id,
              status: packagesTable.status,
              statusPengambilan: packagesTable.statusPengambilan,
            })
            .from(packagesTable)
            .where(inArray(packagesTable.id, packageIds))
            .for("update");
          if (lockedPackages.length !== packageIds.length) {
            throw new Error("Satu atau lebih paket tidak ditemukan");
          }
          if (lockedPackages.some((pkg) =>
            pkg.status === "diserahkan" || pkg.statusPengambilan === "SUDAH_DIAMBIL"
          )) {
            throw new Error("Satu atau lebih paket sudah diserahkan");
          }

        const [transaction] = await tx
          .insert(transactionsTable)
          .values({
            transactionNo: await nextTransactionNo(tx),
            idempotencyKey,
            customerId: body.customerId ? Number(body.customerId) : null,
            customerName: getCustomerName(body),
            packageIds,
            subtotal: String(subtotal),
            discount: String(discount),
            discountReason: body.discountReason ?? null,
            total: String(total),
            paymentStatus: statusFor(total, credited),
            transactionStatus: "AKTIF",
            sisaPiutang: String(Math.max(0, total - credited)),
            jenisJastip: body.jenisJastip ?? null,
            jatuhTempo: body.jatuhTempo || null,
            penanggungJawab: body.penanggungJawab ?? null,
            shiftSessionId: activeShift.id,
            cashierId: user.id,
          })
          .returning();

        let payment = null;
        if (credited > 0) {
          const [insertedPayment] = await tx
            .insert(paymentsTable)
            .values({
              paymentType: credited >= total ? "TRANSAKSI_BARU" : "CICILAN",
              paymentMethod: method === "piutang" ? null : method as "tunai" | "transfer",
              totalAmount: String(credited),
              paidAmount: String(received),
              changeAmount: String(Math.max(0, received - credited)),
              paymentReference: method === "transfer"
                ? String(body.paymentReference ?? "").trim() || null
                : null,
              packageIds,
              packageSummary: Array.isArray(body.packageSummary)
                ? body.packageSummary
                : null,
              adminId: user.id,
              adminName: user.name,
              shiftSessionId: activeShift.id,
              transactionId: transaction.id,
              notes: body.notes ?? null,
            })
            .returning();
          payment = insertedPayment;
        }
        await tx
          .update(packagesTable)
          .set({
            status: "diserahkan",
            statusPengambilan: "SUDAH_DIAMBIL",
            pickedUpAt: new Date(),
            updatedAt: new Date(),
          })
          .where(inArray(packagesTable.id, packageIds));
        return { transaction, payment };
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const [existing] = await db
          .select()
          .from(transactionsTable)
          .where(eq(transactionsTable.idempotencyKey, idempotencyKey))
          .limit(1);
        if (!existing) throw err;
        const existingPayments = await db
          .select()
          .from(paymentsTable)
          .where(eq(paymentsTable.transactionId, existing.id))
          .orderBy(desc(paymentsTable.createdAt));
        replayed = true;
        created = { transaction: existing, payment: existingPayments[0] ?? null };
      }

      res.status(replayed ? 200 : 201).json(created);
    } catch (err: any) {
      (req as any).log?.error?.(err);
      const message = err instanceof Error ? err.message : "Data transaksi tidak valid";
      const isClientError = /wajib|harus|tidak valid|tidak ditemukan|sudah diserahkan/i.test(message);
      res.status(isClientError ? 400 : 500).json({
        error: isClientError ? message : "Gagal membuat transaksi",
      });
    }
  },
);

router.get(
  "/:id",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [transaction] = await db
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.id, id))
        .limit(1);
      if (!transaction) {
        res.status(404).json({ error: "Transaksi tidak ditemukan" });
        return;
      }
      const payments = await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.transactionId, id))
        .orderBy(desc(paymentsTable.createdAt));
      res.json({ transaction, payments });
    } catch (err) {
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal mengambil detail transaksi" });
    }
  },
);

router.post(
  "/:id/payments",
  requireAuth,
  requireRole("admin", "owner"),
  requireActiveShift,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
       const method = getPaymentMethod(req.body);
      if (!paymentMethods.has(method)) {
        res.status(400).json({ error: "Jenis pembayaran harus tunai atau transfer" });
        return;
      }
      const paymentMethod = method as "tunai" | "transfer";

      const received = amount(
        req.body?.amount ?? req.body?.paidAmount ?? req.body?.totalAmount,
        "Nominal pembayaran",
        false,
      );
      const user = (req as any).user;
      const activeShift = (req as any).activeShift;
      const result = await db.transaction(async (tx) => {
         const [transaction] = await tx
          .select()
          .from(transactionsTable)
          .where(eq(transactionsTable.id, id))
           .limit(1)
           .for("update");
        if (!transaction) throw new Error("Transaksi tidak ditemukan");
        if (transaction.transactionStatus !== "AKTIF") {
          throw new Error("Transaksi sudah VOID");
        }

        const outstanding = amount(transaction.sisaPiutang, "Sisa piutang");
        if (outstanding <= 0) throw new Error("Transaksi sudah lunas");
        if (received > outstanding && paymentMethod === "transfer") {
          throw new Error("Nominal transfer melebihi sisa piutang");
        }
         const credited = Math.min(received, outstanding);
        const change = Math.max(0, received - credited);
        const [payment] = await tx
          .insert(paymentsTable)
          .values({
            paymentType: "PELUNASAN_PIUTANG",
            paymentMethod,
            totalAmount: String(credited),
            paidAmount: String(received),
            changeAmount: String(change),
            packageIds: Array.isArray(transaction.packageIds)
              ? transaction.packageIds
              : [],
            adminId: user.id,
            adminName: user.name,
            shiftSessionId: activeShift.id,
            transactionId: id,
            notes: req.body?.notes ?? null,
          })
          .returning();
        const remaining = outstanding - credited;
         const [updated] = await tx
          .update(transactionsTable)
          .set({
            sisaPiutang: String(remaining),
            paymentStatus: statusFor(Number(transaction.total), Number(transaction.total) - remaining),
          })
           .where(
             and(
               eq(transactionsTable.id, id),
               eq(transactionsTable.transactionStatus, "AKTIF"),
               gte(transactionsTable.sisaPiutang, String(credited)),
             ),
           )
          .returning();
         if (!updated) {
           throw new Error("Saldo piutang berubah. Muat ulang transaksi lalu coba lagi.");
         }
        return { transaction: updated, payment };
      });

      res.status(201).json(result);
    } catch (err: any) {
      (req as any).log?.error?.(err);
      const message = err instanceof Error ? err.message : "Gagal mencatat pembayaran";
      res.status(message === "Transaksi tidak ditemukan" ? 404 : 400).json({
        error: message,
      });
    }
  },
);

export default router;