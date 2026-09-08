import { Router } from "express";
import { db, paymentsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { requireActiveShift } from "../middlewares/shift";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const { paymentType } = req.query as Record<string, string>;
      let rows = await db
        .select()
        .from(paymentsTable)
        .orderBy(desc(paymentsTable.createdAt));

      if (paymentType && paymentType !== "all") {
        rows = rows.filter((r) => r.paymentType === paymentType);
      }

      res.json(rows);
    } catch (err) {
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal mengambil data pembayaran" });
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
      const {
        paymentType,
        totalAmount,
        paidAmount,
        changeAmount,
        packageIds,
        packageSummary,
        notes,
      } = req.body;

      if (!paymentType || !totalAmount || !packageIds?.length) {
        res.status(400).json({ error: "Data tidak lengkap" });
        return;
      }

      const user = (req as any).user;
      const activeShift = (req as any).activeShift;

      const [payment] = await db
        .insert(paymentsTable)
        .values({
          paymentType,
          totalAmount: String(totalAmount),
          paidAmount: paidAmount != null ? String(paidAmount) : null,
          changeAmount: changeAmount != null ? String(changeAmount) : null,
          packageIds,
          packageSummary: packageSummary ?? null,
          adminId: user?.id ?? null,
          adminName: user?.name ?? null,
          shiftSessionId: activeShift.id,
          notes: notes ?? null,
        })
        .returning();

      res.status(201).json(payment);
    } catch (err) {
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal menyimpan pembayaran" });
    }
  },
);

router.patch(
  "/:id/bayar",
  requireAuth,
  requireRole("admin", "owner"),
  requireActiveShift,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { paymentType, paidAmount, changeAmount } = req.body;

      if (!paymentType || !["tunai", "transfer"].includes(paymentType)) {
        return res.status(400).json({ error: "Jenis pembayaran tidak valid" });
      }

      const existing = await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.id, id))
        .limit(1);

      if (!existing[0]) {
        return res.status(404).json({ error: "Data pembayaran tidak ditemukan" });
      }

      if (existing[0].paymentType !== "piutang") {
        return res.status(400).json({ error: "Hanya pembayaran piutang yang dapat diubah" });
      }

      const [updated] = await db
        .update(paymentsTable)
        .set({
          paymentType,
          paidAmount: paidAmount != null ? String(paidAmount) : String(existing[0].totalAmount),
          changeAmount: changeAmount != null ? String(changeAmount) : "0",
          shiftSessionId: (req as any).activeShift.id,
        })
        .where(eq(paymentsTable.id, id))
        .returning();

      return res.json(updated);
    } catch (err) {
      (req as any).log?.error?.(err);
      return res.status(500).json({ error: "Gagal memperbarui pembayaran" });
    }
  },
);

export default router;
