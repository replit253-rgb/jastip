import { Router } from "express";
import { db, usersTable, packagesTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { safeIsoString } from "../lib/dates";

const router = Router();

// GET /api/customers
router.get("/", requireAuth, requireRole("admin", "owner"), async (req, res) => {
  try {
    const { search, status } = req.query as any;

    let customers = await db.select().from(usersTable).where(eq(usersTable.role, "customer"));

    if (search) {
      const s = search.toLowerCase();
      customers = customers.filter(c =>
        c.name.toLowerCase().includes(s) || c.phone.includes(s)
      );
    }
    if (status === "active") {
      customers = customers.filter(c => c.isActive);
    } else if (status === "inactive") {
      customers = customers.filter(c => !c.isActive);
    }

    const allPackages = await db.select().from(packagesTable);
    const result = customers.map(c => {
      const pkgs = allPackages.filter(p => p.customerId === c.id);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        isActive: c.isActive,
        createdAt: safeIsoString(c.createdAt),
        totalPackages: pkgs.length,
        pendingPackages: pkgs.filter(p => p.status === "pending").length,
        pickedUpPackages: pkgs.filter(p => p.status === "diserahkan").length,
      };
    });
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/customers/:id
router.get("/:id", requireAuth, requireRole("admin", "owner"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const customers = await db.select().from(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.role, "customer"))).limit(1);
    const c = customers[0];
    if (!c) { res.status(404).json({ error: "Not found" }); return; }

    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.customerId, id));
    res.json({
      id: c.id,
      name: c.name,
      phone: c.phone,
      isActive: c.isActive,
      createdAt: safeIsoString(c.createdAt),
      totalPackages: pkgs.length,
      pendingPackages: pkgs.filter(p => p.status === "pending").length,
      pickedUpPackages: pkgs.filter(p => p.status === "diserahkan").length,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
