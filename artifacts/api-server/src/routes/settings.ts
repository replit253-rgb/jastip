import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import {
  db,
  settingsTable,
  settingsShippingMinimumTable,
  serviceTypesTable,
  tarifHistoryTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { safeIsoString } from "../lib/dates";
import { getBaseRates } from "../lib/base-rates";

const router = Router();

// Keys yang bisa diubah via API
const ALLOWED_KEYS = [
  "kargoRate",
  "pesawatRate",
  "hematRate",
  "pelniTiersJakarta",
  "pelniTiersSurabaya",
  "cash_variance_tolerance",
  "receipt_print_mode",
  "qris_image_url",
] as const;

// Mapping key → label jenis jastip untuk history
const KEY_LABEL: Record<string, string> = {
  kargoRate: "Jastip Kargo",
  pesawatRate: "Jastip Pesawat",
  hematRate: "Jastip Hemat+",
  pelniTiersJakarta: "Jastip Pelni (Jakarta)",
  pelniTiersSurabaya: "Jastip Pelni (Surabaya)",
  cash_variance_tolerance: "Toleransi Selisih Kas",
  receipt_print_mode: "Mode Cetak Struk",
  qris_image_url: "QRIS — Upload Gambar",
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

// GET /api/settings/base-rates — normalized tariff rates + fallback defaults (admin + owner)
router.get("/base-rates", requireAuth, requireRole("admin", "owner"), async (req, res) => {
  try {
    const rates = await getBaseRates();
    res.json(rates);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Gagal memuat tarif dasar" });
  }
});

// GET /api/settings/qris — get current active QRIS image URL (admin + owner)
router.get("/qris", requireAuth, requireRole("admin", "owner"), async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, "qris_image_url"))
      .limit(1);
    res.json({ qrisImageUrl: row?.value || null });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Gagal memuat pengaturan QRIS" });
  }
});

// POST /api/settings/qris-image — upload QRIS image (Owner only)
router.post(
  "/qris-image",
  requireAuth,
  requireRole("owner"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const { image, dataBase64, mimeType: providedMimeType, _alasan } = body;

      let mimeType = providedMimeType || "";
      let base64Data = "";

      if (typeof image === "string" && image.startsWith("data:")) {
        const matches = image.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1].toLowerCase();
          base64Data = matches[2];
        } else {
          res.status(400).json({ error: "Format data gambar base64 tidak valid" });
          return;
        }
      } else if (typeof dataBase64 === "string" && dataBase64.trim()) {
        base64Data = dataBase64.trim();
      } else if (typeof image === "string" && image.trim()) {
        base64Data = image.trim();
      } else {
        res.status(400).json({ error: "File gambar QRIS wajib diunggah" });
        return;
      }

      // Validasi tipe MIME
      const allowedMimes: Record<string, string> = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
      };

      if (!mimeType || !allowedMimes[mimeType]) {
        // Deteksi dari header base64 jika ada
        const bufferProbe = Buffer.from(base64Data.slice(0, 32), "base64");
        if (bufferProbe.length >= 4) {
          if (bufferProbe[0] === 0x89 && bufferProbe[1] === 0x50 && bufferProbe[2] === 0x4e && bufferProbe[3] === 0x47) {
            mimeType = "image/png";
          } else if (bufferProbe[0] === 0xff && bufferProbe[1] === 0xd8) {
            mimeType = "image/jpeg";
          } else if (bufferProbe[0] === 0x52 && bufferProbe[1] === 0x49 && bufferProbe[2] === 0x46 && bufferProbe[3] === 0x46) {
            mimeType = "image/webp";
          }
        }
      }

      if (!mimeType || !allowedMimes[mimeType]) {
        res.status(400).json({
          error: "Hanya file gambar (PNG, JPEG, WEBP) yang diizinkan",
        });
        return;
      }

      const buffer = Buffer.from(base64Data, "base64");
      const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
      if (buffer.length > MAX_SIZE_BYTES) {
        res.status(400).json({
          error: "Ukuran gambar melebihi batas maksimal 2MB",
        });
        return;
      }

      if (buffer.length === 0) {
        res.status(400).json({ error: "File gambar kosong" });
        return;
      }

      // Simpan ke disk
      const ext = allowedMimes[mimeType] || ".png";
      const fileName = `qris-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
      const uploadDir = path.resolve(process.cwd(), "uploads", "qris");
      await fs.mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, fileName);
      await fs.writeFile(filePath, buffer);

      const publicUrl = `/uploads/qris/${fileName}`;

      // Ambil nilai lama
      const [oldRow] = await db
        .select()
        .from(settingsTable)
        .where(eq(settingsTable.key, "qris_image_url"))
        .limit(1);
      const oldUrl = oldRow?.value || null;

      // Update settings
      await db
        .insert(settingsTable)
        .values({ key: "qris_image_url", value: publicUrl })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value: publicUrl, updatedAt: new Date() },
        });

      // Audit trail
      await db.insert(tarifHistoryTable).values({
        jenisJastip: "QRIS — Upload Gambar",
        tarifLama: oldUrl,
        tarifBaru: publicUrl,
        alasan: _alasan || "Pembaruan gambar QRIS oleh Owner",
        diubahOleh: user?.id ?? null,
        namaUbah: user?.name ?? null,
      });

      res.status(200).json({
        success: true,
        qrisImageUrl: publicUrl,
        message: "Gambar QRIS berhasil diunggah",
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Gagal mengunggah gambar QRIS" });
    }
  },
);

const DEFAULT_SHIPPING_MINIMUM_SEED = [
  { serviceName: "jastip pelni", originCity: "Jakarta", enabled: true, minimumAmount: "20000" },
  { serviceName: "jastip pelni", originCity: "Surabaya", enabled: true, minimumAmount: "20000" },
  { serviceName: "jastip hemat+", originCity: "Surabaya", enabled: true, minimumAmount: "10000" },
  { serviceName: "jastip hemat+", originCity: "Jakarta", enabled: false, minimumAmount: "10000" },
  { serviceName: "jastip kargo", originCity: "Jakarta", enabled: false, minimumAmount: "0" },
  { serviceName: "jastip kargo", originCity: "Surabaya", enabled: false, minimumAmount: "0" },
  { serviceName: "jastip pesawat", originCity: "Jakarta", enabled: true, minimumAmount: "15400" },
  { serviceName: "jastip pesawat", originCity: "Surabaya", enabled: false, minimumAmount: "15400" },
];

async function getEnrichedShippingMinimumRows() {
  let services = await db.select().from(serviceTypesTable);
  if (services.length === 0) {
    await db
      .insert(serviceTypesTable)
      .values([
        { name: "jastip pelni", label: "Jastip Pelni", description: "Layanan kapal Pelni", divisor: 4000, isActive: true },
        { name: "jastip hemat+", label: "Jastip Hemat+", description: "Layanan hemat Surabaya-Manokwari", divisor: 4000, isActive: true },
        { name: "jastip kargo", label: "Jastip Kargo", description: "Layanan kargo pelabuhan", divisor: 1000000, isActive: true },
        { name: "jastip pesawat", label: "Jastip Pesawat", description: "Layanan kilat udara", divisor: 5000, isActive: true },
      ])
      .onConflictDoNothing();
    services = await db.select().from(serviceTypesTable);
  }

  const serviceById = new Map<number, any>(services.map((s: any) => [s.id, s]));
  const serviceByName = new Map<string, any>(
    services.map((s: any) => [String(s.name || "").toLowerCase(), s]),
  );

  let rows = await db.select().from(settingsShippingMinimumTable);
  const existingKeys = new Set(
    rows.map((r: any) => `${r.serviceId}|${String(r.originCity || "").trim().toLowerCase()}`),
  );

  for (const seed of DEFAULT_SHIPPING_MINIMUM_SEED) {
    const svc = serviceByName.get(seed.serviceName);
    if (!svc) continue;
    const key = `${svc.id}|${seed.originCity.toLowerCase()}`;
    if (!existingKeys.has(key)) {
      await db
        .insert(settingsShippingMinimumTable)
        .values({
          serviceId: svc.id,
          originCity: seed.originCity,
          enabled: seed.enabled,
          minimumAmount: seed.minimumAmount,
        })
        .onConflictDoNothing();
      existingKeys.add(key);
    }
  }

  rows = await db.select().from(settingsShippingMinimumTable);
  return rows
    .map((row: any) => {
      const svc = serviceById.get(row.serviceId);
      return {
        id: row.id,
        serviceId: row.serviceId,
        serviceName:
          svc?.name ||
          (row.serviceId === 1
            ? "jastip pelni"
            : row.serviceId === 2
              ? "jastip hemat+"
              : row.serviceId === 3
                ? "jastip kargo"
                : "jastip pesawat"),
        serviceLabel:
          svc?.label ||
          (row.serviceId === 1
            ? "Jastip Pelni"
            : row.serviceId === 2
              ? "Jastip Hemat+"
              : row.serviceId === 3
                ? "Jastip Kargo"
                : "Jastip Pesawat"),
        originCity: row.originCity,
        enabled: Boolean(row.enabled),
        minimumAmount: Number(row.minimumAmount) || 0,
        updatedBy: row.updatedBy ?? null,
        updatedAt: safeIsoString(row.updatedAt),
      };
    })
    .sort((a: any, b: any) => {
      const lbl = String(a.serviceLabel).localeCompare(String(b.serviceLabel), "id");
      if (lbl !== 0) return lbl;
      return String(a.originCity).localeCompare(String(b.originCity), "id");
    });
}

// GET /api/settings/shipping-minimum (or /shipping-minimums) — Owner only
router.get(
  ["/shipping-minimum", "/shipping-minimums"],
  requireAuth,
  requireRole("owner"),
  async (req, res) => {
    try {
      const enrichedRows = await getEnrichedShippingMinimumRows();
      res.json(enrichedRows);
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Gagal memuat pengaturan harga minimum" });
    }
  },
);

// PATCH /api/settings/shipping-minimum (or /shipping-minimums) — Owner only, with tarif_history audit.
router.patch(
  ["/shipping-minimum", "/shipping-minimums"],
  requireAuth,
  requireRole("owner"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body as {
        _alasan?: string;
        settings?: Array<{
          serviceId?: number;
          serviceName?: string;
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

      const allServices = await db.select().from(serviceTypesTable);

      await db.transaction(async (tx) => {
        for (const input of settings) {
          let service: any = null;
          if (input.serviceId !== undefined && input.serviceId !== null) {
            const sid = Number(input.serviceId);
            if (!Number.isInteger(sid) || sid <= 0) {
              throw new Error("Format pengaturan harga minimum tidak valid");
            }
            service = allServices.find((s: any) => Number(s.id) === sid) || null;
          } else if (input.serviceName) {
            const sname = String(input.serviceName).trim().toLowerCase();
            service = allServices.find((s: any) => String(s.name || "").toLowerCase() === sname) || null;
          }

          const originCity = String(input.originCity || "").trim();
          const minimumAmount = Number(input.minimumAmount);
          if (
            !originCity ||
            typeof input.enabled !== "boolean" ||
            !Number.isInteger(minimumAmount) ||
            minimumAmount < 0
          ) {
            throw new Error("Format pengaturan harga minimum tidak valid");
          }
          if (!service) throw new Error("Layanan tidak ditemukan");

          const existing = await tx
            .select()
            .from(settingsShippingMinimumTable)
            .where(
              and(
                eq(settingsShippingMinimumTable.serviceId, service.id),
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
              serviceId: service.id,
              originCity,
              enabled: next.enabled,
              minimumAmount: String(next.minimumAmount),
              updatedBy: user?.id ?? null,
            });
          }

          await tx.insert(tarifHistoryTable).values({
            jenisJastip: `${service.label} — Harga Minimum ${originCity}`,
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

      const enrichedRows = await getEnrichedShippingMinimumRows();
      res.json(enrichedRows);
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
        if (key === "receipt_print_mode" && !["AUTO", "ASK", "OFF"].includes(String(val))) {
          res.status(400).json({
            error: "receipt_print_mode harus AUTO, ASK, atau OFF",
          });
          return;
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

// GET /api/settings/history or /api/settings/tarif-history — tarif change history (owner only)
router.get(["/history", "/tarif-history"], requireAuth, requireRole("owner"), async (req, res) => {
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
