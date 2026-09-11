import { Router } from "express";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "jaj_salt_2024").digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      res.status(400).json({ error: "Phone and password required" });
      return;
    }
    const users = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    const user = users[0];
    if (!user || user.password !== hashPassword(password)) {
      res.status(401).json({ error: "Nomor HP atau password salah" });
      return;
    }
    if (!user.isActive) {
      res.status(401).json({ error: "Akun tidak aktif" });
      return;
    }
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await db.insert(sessionsTable).values({ userId: user.id, token, expiresAt });
    res.json({
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role, isActive: user.isActive, createdAt: user.createdAt },
      token,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) {
      res.status(400).json({ error: "Name, phone, and password required" });
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
    }).returning();
    const user = inserted[0];
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(sessionsTable).values({ userId: user.id, token, expiresAt });
    res.status(201).json({
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role, isActive: user.isActive, createdAt: user.createdAt },
      token,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  const user = (req as any).user;
  res.json({ id: user.id, name: user.name, phone: user.phone, role: user.role, isActive: user.isActive, createdAt: user.createdAt });
});

// PATCH /api/auth/profile
router.patch("/profile", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { name, currentPassword, newPassword } = req.body;
    if (!name && !newPassword) {
      res.status(400).json({ error: "Provide name or newPassword" });
      return;
    }
    const updates: any = { updatedAt: new Date() };
    if (name && name.trim()) updates.name = name.trim();
    if (newPassword) {
      if (!currentPassword) {
        res.status(400).json({ error: "Password lama wajib diisi" });
        return;
      }
      const users = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
      if (!users[0] || users[0].password !== hashPassword(currentPassword)) {
        res.status(400).json({ error: "Password lama salah" });
        return;
      }
      updates.password = hashPassword(newPassword);
    }
    const updated = await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id)).returning();
    const u = updated[0];
    res.json({ id: u.id, name: u.name, phone: u.phone, role: u.role, isActive: u.isActive, createdAt: u.createdAt });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/logout
router.post("/logout", requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization!.slice(7);
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    res.json({ message: "Logged out" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
