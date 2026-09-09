import { Router } from "express";
import { db, settingsTable, tarifHistoryTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

// Keys yang bisa diubah via API
const ALLOWED_KEYS = [
  "kargoRate",
  "pesawatRate",
  "hematRate",
  "pelniTiersJakarta",
  "pelniTiersSurabaya",
  "cash_variance_tolerance",
] as const;

// Mapping key → label jenis jastip untuk history
const KEY_LABEL: Record<string, string> = {
  kargoRate: "Jastip Kargo",
  pesawatRate: "Jastip Pesawat",
  hematRate: "Jastip Hemat+",
  pelniTiersJakarta: "Jastip Pelni (Jakarta)",
  pelniTiersSurabaya: "Jastip Pelni (Surabaya)",
  cash_variance_tolerance: "Toleransi Selisih Kas",
};

// GET /api/settings — returns all app settings (admin + owner)
router.get("/", requireAuth, requireRole("admin", "owner"), async (req, res) => {
  try {
    const rows = await db.select().from(settingsTable);
    const result: Record<string, any> = {};
    for (const row of rows) {
      // Coba parse sebagai JSON dulu (untuk tier arrays), jika gagal coba number
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = isNaN(Number(row.value)) ? row.value : Number(row.value);
      }
    }
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/settings — update one or more settings (owner only)
router.patch("/", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const user = (req as any).user;
    const body = req.body as Record<string, any>;
    const alasan: string = body._alasan || "";
    const updates: { key: string; value: string }[] = [];

    for (const key of ALLOWED_KEYS) {
      if (key in body && String(key) !== "_alasan") {
        const val = body[key];
        if (val == null || val === "") continue;
        if (key === "cash_variance_tolerance") {
          const tolerance = Number(val);
          if (!Number.isInteger(tolerance) || tolerance < 0) {
            res.status(400).json({
              error: "cash_variance_tolerance harus berupa angka Rupiah bulat minimal 0",
            });
            return;
          }
        }
        // Simpan sebagai JSON string jika nilai adalah object/array
        const strVal = typeof val === "object" ? JSON.stringify(val) : String(val);
        updates.push({ key, value: strVal });
      }
    }

    if (updates.length === 0) {
      res.status(400).json({ error: "No valid settings provided" });
      return;
    }

    // Ambil nilai lama untuk history
    const oldRows = await db.select().from(settingsTable);
    const oldMap: Record<string, string> = {};
    for (const row of oldRows) oldMap[row.key] = row.value;

    for (const { key, value } of updates) {
      await db
        .insert(settingsTable)
        .values({ key, value })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });

      // Simpan ke history
      await db.insert(tarifHistoryTable).values({
        jenisJastip: KEY_LABEL[key] || key,
        tarifLama: oldMap[key] ?? null,
        tarifBaru: value,
        alasan: alasan || null,
        diubahOleh: user?.id ?? null,
        namaUbah: user?.name ?? null,
      });
    }

    const rows = await db.select().from(settingsTable);
    const result: Record<string, any> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = isNaN(Number(row.value)) ? row.value : Number(row.value);
      }
    }
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/settings/history — tarif change history (owner only)
router.get("/history", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(tarifHistoryTable)
      .orderBy(desc(tarifHistoryTable.createdAt))
      .limit(100);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
