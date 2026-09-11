import { Router } from "express";
import { db, usersTable, packagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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
    const admins = await db.select().from(usersTable).where(eq(usersTable.role, "admin"));
    const allPackages = await db.select().from(packagesTable);
    const result = admins.map(a => ({
      id: a.id,
      name: a.name,
      phone: a.phone,
      isActive: a.isActive,
      createdAt: safeIsoString(a.createdAt),
      packagesInputted: allPackages.filter(p => p.adminId === a.id).length,
    }));
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
      name, phone,
      password: hashPassword(password),
      role: "admin",
      isActive: true,
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
    const { name, phone } = req.body;
    const updateData: any = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    const updated = await db.update(usersTable).set(updateData).where(and(eq(usersTable.id, id), eq(usersTable.role, "admin"))).returning();
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

export default router;
