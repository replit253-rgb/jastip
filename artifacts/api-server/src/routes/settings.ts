import { Router } from "express";
import {
  db,
  settingsTable,
  settingsShippingMinimumTable,
  serviceTypesTable,
  tarifHistoryTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
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

// GET /api/settings/shipping-minimum — Owner configuration for Phase 4.
router.get(
  "/shipping-minimum",
  requireAuth,
  requireRole("owner"),
  async (req, res) => {
    try {
      const rows = await db
        .select({
          id: settingsShippingMinimumTable.id,
          serviceId: settingsShippingMinimumTable.serviceId,
          serviceName: serviceTypesTable.name,
          serviceLabel: serviceTypesTable.label,
          originCity: settingsShippingMinimumTable.originCity,
          enabled: settingsShippingMinimumTable.enabled,
          minimumAmount: settingsShippingMinimumTable.minimumAmount,
          updatedBy: settingsShippingMinimumTable.updatedBy,
          updatedAt: settingsShippingMinimumTable.updatedAt,
        })
        .from(settingsShippingMinimumTable)
        .innerJoin(
          serviceTypesTable,
          eq(settingsShippingMinimumTable.serviceId, serviceTypesTable.id),
        )
        .orderBy(serviceTypesTable.label, settingsShippingMinimumTable.originCity);
      res.json(
        rows.map((row) => ({
          ...row,
          minimumAmount: Number(row.minimumAmount) || 0,
          updatedAt: row.updatedAt.toISOString(),
        })),
      );
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Gagal memuat pengaturan harga minimum" });
    }
  },
);

// PATCH /api/settings/shipping-minimum — Owner only, with tarif_history audit.
router.patch(
  "/shipping-minimum",
  requireAuth,
  requireRole("owner"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body as {
        _alasan?: string;
        settings?: Array<{
          serviceId?: number;
          originCity?: string;
          enabled?: boolean;
          minimumAmount?: number;
        }>;
      };
      const settings = Array.isArray(body.settings) ? body.settings : [];
      if (settings.length === 0) {
        res.status(400).json({ error: "settings wajib berisi minimal satu baris" });
        return;
      }

      await db.transaction(async (tx) => {
        for (const input of settings) {
          const serviceId = Number(input.serviceId);
          const originCity = String(input.originCity || "").trim();
          const minimumAmount = Number(input.minimumAmount);
          if (
            !Number.isInteger(serviceId) ||
            !originCity ||
            typeof input.enabled !== "boolean" ||
            !Number.isInteger(minimumAmount) ||
            minimumAmount < 0
          ) {
            throw new Error("Format pengaturan harga minimum tidak valid");
          }

          const service = await tx
            .select({ id: serviceTypesTable.id, label: serviceTypesTable.label })
            .from(serviceTypesTable)
            .where(eq(serviceTypesTable.id, serviceId))
            .limit(1);
          if (!service[0]) throw new Error("Layanan tidak ditemukan");

          const existing = await tx
            .select()
            .from(settingsShippingMinimumTable)
            .where(
              and(
                eq(settingsShippingMinimumTable.serviceId, serviceId),
                eq(settingsShippingMinimumTable.originCity, originCity),
              ),
            )
            .limit(1);
          const previous = existing[0];
          const next = { enabled: input.enabled, minimumAmount };

          if (previous) {
            await tx
              .update(settingsShippingMinimumTable)
              .set({
                enabled: next.enabled,
                minimumAmount: String(next.minimumAmount),
                updatedBy: user?.id ?? null,
                updatedAt: new Date(),
              })
              .where(eq(settingsShippingMinimumTable.id, previous.id));
          } else {
            await tx.insert(settingsShippingMinimumTable).values({
              serviceId,
              originCity,
              enabled: next.enabled,
              minimumAmount: String(next.minimumAmount),
              updatedBy: user?.id ?? null,
            });
          }

          await tx.insert(tarifHistoryTable).values({
            jenisJastip: `${service[0].label} — Harga Minimum ${originCity}`,
            tarifLama: previous
              ? JSON.stringify({
                  enabled: previous.enabled,
                  minimumAmount: Number(previous.minimumAmount) || 0,
                })
              : null,
            tarifBaru: JSON.stringify(next),
            alasan: body._alasan || null,
            diubahOleh: user?.id ?? null,
            namaUbah: user?.name ?? null,
          });
        }
      });

      const rows = await db
        .select({
          id: settingsShippingMinimumTable.id,
          serviceId: settingsShippingMinimumTable.serviceId,
          serviceName: serviceTypesTable.name,
          serviceLabel: serviceTypesTable.label,
          originCity: settingsShippingMinimumTable.originCity,
          enabled: settingsShippingMinimumTable.enabled,
          minimumAmount: settingsShippingMinimumTable.minimumAmount,
          updatedBy: settingsShippingMinimumTable.updatedBy,
          updatedAt: settingsShippingMinimumTable.updatedAt,
        })
        .from(settingsShippingMinimumTable)
        .innerJoin(
          serviceTypesTable,
          eq(settingsShippingMinimumTable.serviceId, serviceTypesTable.id),
        )
        .orderBy(serviceTypesTable.label, settingsShippingMinimumTable.originCity);
      res.json(
        rows.map((row) => ({
          ...row,
          minimumAmount: Number(row.minimumAmount) || 0,
          updatedAt: row.updatedAt.toISOString(),
        })),
      );
    } catch (err) {
      req.log.error(err);
      const message = err instanceof Error ? err.message : "Server error";
      const isValidation =
        message.includes("Format pengaturan") ||
        message.includes("Layanan tidak ditemukan");
      res.status(isValidation ? 400 : 500).json({ error: message });
    }
  },
);

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
