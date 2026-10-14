import { Router } from "express";
import {
  db,
  usersTable,
  packagesTable,
  transactionsTable,
  paymentsTable,
  shiftSessionsTable,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { safeIsoString } from "../lib/dates";
import crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "jaj_salt_2024").digest("hex");
}

// GET /api/admins
router.get("/", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const admins = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, "admin"),
          eq(usersTable.isHidden, false),
          isNull(usersTable.deletedAt),
        ),
      );

    const [allPackages, allTransactions, allPayments, allShifts] = await Promise.all([
      db.select({ adminId: packagesTable.adminId }).from(packagesTable),
      db.select({ cashierId: transactionsTable.cashierId }).from(transactionsTable),
      db.select({ adminId: paymentsTable.adminId }).from(paymentsTable),
      db.select({ adminId: shiftSessionsTable.adminId }).from(shiftSessionsTable),
    ]);

    const result = admins.map((a) => {
      const packagesInputted = allPackages.filter((p) => p.adminId === a.id).length;
      const transactionsCount = allTransactions.filter((t) => t.cashierId === a.id).length;
      const paymentsCount = allPayments.filter((p) => p.adminId === a.id).length;
      const shiftsCount = allShifts.filter((s) => s.adminId === a.id).length;
      const hasActivity = packagesInputted > 0 || transactionsCount > 0 || paymentsCount > 0 || shiftsCount > 0;

      return {
        id: a.id,
        name: a.name,
        phone: a.phone,
        isActive: a.isActive,
        createdAt: safeIsoString(a.createdAt),
        packagesInputted,
        transactionsCount,
        paymentsCount,
        shiftsCount,
        hasActivity,
      };
    });
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/admins
router.post("/", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) {
      res.status(400).json({ error: "name, phone, password required" });
      return;
    }
    const existing = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    if (existing[0]) {
      res.status(400).json({ error: "Nomor HP sudah terdaftar" });
      return;
    }
    const inserted = await db.insert(usersTable).values({
      name,
      phone,
      password: hashPassword(password),
      role: "admin",
      isActive: true,
      isHidden: false,
    }).returning();
    const u = inserted[0];
    res.status(201).json({ id: u.id, name: u.name, phone: u.phone, role: u.role, isActive: u.isActive, createdAt: safeIsoString(u.createdAt) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/admins/:id
router.patch("/:id", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, phone, isActive } = req.body;
    const updateData: any = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (typeof isActive === "boolean") updateData.isActive = isActive;
    const updated = await db
      .update(usersTable)
      .set(updateData)
      .where(and(eq(usersTable.id, id), eq(usersTable.role, "admin")))
      .returning();
    const u = updated[0];
    if (!u) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: u.id, name: u.name, phone: u.phone, role: u.role, isActive: u.isActive, createdAt: safeIsoString(u.createdAt) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/admins/:id/toggle-active
router.post("/:id/toggle-active", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const currentUser = (req as any).user;
    if (currentUser?.id === id) {
      res.status(403).json({ error: "Owner tidak boleh menonaktifkan dirinya sendiri." });
      return;
    }
    const admins = await db.select().from(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.role, "admin"))).limit(1);
    if (!admins[0]) { res.status(404).json({ error: "Not found" }); return; }
    const updated = await db.update(usersTable).set({ isActive: !admins[0].isActive, updatedAt: new Date() }).where(eq(usersTable.id, id)).returning();
    const u = updated[0];
    res.json({ id: u.id, name: u.name, phone: u.phone, role: u.role, isActive: u.isActive, createdAt: safeIsoString(u.createdAt) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/admins/:id/reset-password
router.post("/:id/reset-password", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { newPassword } = req.body;
    if (!newPassword) { res.status(400).json({ error: "newPassword required" }); return; }
    await db.update(usersTable).set({ password: hashPassword(newPassword), updatedAt: new Date() }).where(and(eq(usersTable.id, id), eq(usersTable.role, "admin")));
    res.json({ message: "Password berhasil direset" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/admins/:id
router.delete("/:id", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const currentUser = (req as any).user;
    if (currentUser?.id === id) {
      res.status(403).json({ error: "Owner tidak boleh menghapus dirinya sendiri." });
      return;
    }

    const [admin] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    if (!admin) {
      res.status(404).json({ error: "Admin tidak ditemukan" });
      return;
    }

    if (admin.role === "owner") {
      res.status(403).json({ error: "Akun owner tidak dapat dihapus." });
      return;
    }

    // Check historical activities
    const [packages, transactions, payments, shifts] = await Promise.all([
      db.select({ id: packagesTable.id }).from(packagesTable).where(eq(packagesTable.adminId, id)).limit(1),
      db.select({ id: transactionsTable.id }).from(transactionsTable).where(eq(transactionsTable.cashierId, id)).limit(1),
      db.select({ id: paymentsTable.id }).from(paymentsTable).where(eq(paymentsTable.adminId, id)).limit(1),
      db.select({ id: shiftSessionsTable.id }).from(shiftSessionsTable).where(eq(shiftSessionsTable.adminId, id)).limit(1),
    ]);

    const hasActivity = packages.length > 0 || transactions.length > 0 || payments.length > 0 || shifts.length > 0;

    if (hasActivity) {
      // Soft delete: deactivate and hide, keeping historical audit integrity
      await db
        .update(usersTable)
        .set({
          isHidden: true,
          isActive: false,
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, id));

      res.json({
        success: true,
        mode: "soft_deleted",
        message: "Admin memiliki riwayat transaksi/aktivitas sehingga dinonaktifkan dan disembunyikan dari sistem.",
      });
    } else {
      // Hard delete: completely delete if no activities exist
      await db.delete(usersTable).where(eq(usersTable.id, id));

      res.json({
        success: true,
        mode: "hard_deleted",
        message: "Admin belum memiliki riwayat aktivitas dan telah dihapus secara permanen.",
      });
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
