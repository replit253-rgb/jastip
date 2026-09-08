import { Router } from "express";
import { db, batchesTable, packagesTable, serviceTypesTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

/** Format a batch for the API response. */
function formatBatch(batch: typeof batchesTable.$inferSelect) {
  const etd = batch.etd; // already a string date from pg
  const mulai = batch.periodeClosingMulai;
  const selesai = batch.periodeClosingSelesai;
  return {
    ...batch,
    // Tampilan label: "Dobonsolo - ETD 3 Juli 2026 - Closing 18 Juni s/d 1 Juli 2026"
    label: buildLabel(batch.namaKapal, etd, mulai, selesai),
  };
}

function buildLabel(
  namaKapal: string,
  etd: string,
  mulai: string,
  selesai: string,
) {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const fmtNoYear = (d: string) =>
    new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long" });
  return `${namaKapal} - ETD ${fmt(etd)} - Closing ${fmtNoYear(mulai)} s/d ${fmtNoYear(selesai)}`;
}

// GET /api/batches — list all batches with package count
router.get("/", requireAuth, requireRole("admin", "owner"), async (req, res) => {
  try {
    const { statusBatch } = req.query as Record<string, string>;

    const rows = await db
      .select({
        batch: batchesTable,
        packageCount: sql<number>`count(${packagesTable.id})::int`,
      })
      .from(batchesTable)
      .leftJoin(packagesTable, eq(packagesTable.batchId, batchesTable.id))
      .groupBy(batchesTable.id)
      .orderBy(desc(batchesTable.createdAt));

    let result = rows.map((r) => ({
      ...formatBatch(r.batch),
      packageCount: r.packageCount ?? 0,
    }));

    if (statusBatch) {
      result = result.filter((b) => b.statusBatch === statusBatch);
    } else {
      // Sembunyikan batch yang sudah dihapus (soft delete) dari tampilan default
      result = result.filter((b) => String(b.statusBatch) !== "HAPUS");
    }

    res.json(result);
  } catch (err) {
    (req as any).log?.error?.(err);
    res.status(500).json({ error: "Gagal mengambil data batch" });
  }
});

// POST /api/batches — create a new batch
router.post("/", requireAuth, requireRole("admin", "owner"), async (req, res) => {
  try {
    const user = (req as any).user;
    const { namaKapal, etd, periodeClosingMulai, periodeClosingSelesai, kotaAsal, tujuan } = req.body;

    if (!namaKapal || !etd || !periodeClosingMulai || !periodeClosingSelesai || !kotaAsal) {
      res.status(400).json({
        error: "namaKapal, etd, periodeClosingMulai, periodeClosingSelesai, dan kotaAsal wajib diisi",
      });
      return;
    }

    const [batch] = await db
      .insert(batchesTable)
      .values({
        namaKapal,
        etd,
        periodeClosingMulai,
        periodeClosingSelesai,
        kotaAsal,
        tujuan: tujuan || "Manokwari",
        statusBatch: "OPEN",
        createdBy: user.id,
      })
      .returning();

    res.status(201).json(formatBatch(batch));
  } catch (err) {
    (req as any).log?.error?.(err);
    res.status(500).json({ error: "Gagal membuat batch" });
  }
});

// GET /api/batches/:id — batch detail + packages grouped by serviceType + customerName
router.get("/:id", requireAuth, requireRole("admin", "owner"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const batches = await db
      .select()
      .from(batchesTable)
      .where(eq(batchesTable.id, id))
      .limit(1);
    const batch = batches[0];
    if (!batch) {
      res.status(404).json({ error: "Batch tidak ditemukan" });
      return;
    }

    // Load packages for this batch
    const packages = await db
      .select({
        id: packagesTable.id,
        barcode: packagesTable.barcode,
        resiNumber: packagesTable.resiNumber,
        packageNumber: packagesTable.packageNumber,
        itemName: packagesTable.itemName,
        customerName: packagesTable.customerName,
        serviceType: packagesTable.serviceType,
        serviceTypeId: packagesTable.serviceTypeId,
        realWeight: packagesTable.realWeight,
        usedWeight: packagesTable.usedWeight,
        totalShipping: packagesTable.totalShipping,
        statusVerifikasi: packagesTable.statusVerifikasi,
        statusPengambilan: packagesTable.statusPengambilan,
        statusPembayaran: packagesTable.statusPembayaran,
        status: packagesTable.status,
        verified: packagesTable.verified,
        packageDate: packagesTable.packageDate,
        createdAt: packagesTable.createdAt,
      })
      .from(packagesTable)
      .where(eq(packagesTable.batchId, id))
      .orderBy(packagesTable.customerName);

    // Group by serviceType + customerName
    type GroupKey = string;
    const groups: Record<
      GroupKey,
      {
        serviceType: string | null;
        customerName: string;
        packages: typeof packages;
        totalShipping: number;
        totalWeight: number;
      }
    > = {};

    for (const pkg of packages) {
      const key = `${pkg.serviceType ?? ""}||${pkg.customerName}`;
      if (!groups[key]) {
        groups[key] = {
          serviceType: pkg.serviceType,
          customerName: pkg.customerName,
          packages: [],
          totalShipping: 0,
          totalWeight: 0,
        };
      }
      groups[key].packages.push(pkg);
      groups[key].totalShipping += Number(pkg.totalShipping ?? 0);
      groups[key].totalWeight += Number(pkg.usedWeight ?? pkg.realWeight ?? 0);
    }

    res.json({
      ...formatBatch(batch),
      packageCount: packages.length,
      groups: Object.values(groups),
    });
  } catch (err) {
    (req as any).log?.error?.(err);
    res.status(500).json({ error: "Gagal mengambil detail batch" });
  }
});

// PATCH /api/batches/:id — update status or details
router.patch("/:id", requireAuth, requireRole("admin", "owner"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { namaKapal, etd, periodeClosingMulai, periodeClosingSelesai, kotaAsal, tujuan, statusBatch } =
      req.body;

    const existing = await db
      .select()
      .from(batchesTable)
      .where(eq(batchesTable.id, id))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: "Batch tidak ditemukan" });
      return;
    }

    // ARSIP batches are fully locked
    if (existing[0].statusBatch === "ARSIP" && statusBatch !== "ARSIP") {
      res.status(400).json({ error: "Batch ARSIP tidak dapat diubah" });
      return;
    }

    const updates: Partial<typeof batchesTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (namaKapal) updates.namaKapal = namaKapal;
    if (etd) updates.etd = etd;
    if (periodeClosingMulai) updates.periodeClosingMulai = periodeClosingMulai;
    if (periodeClosingSelesai) updates.periodeClosingSelesai = periodeClosingSelesai;
    if (kotaAsal) updates.kotaAsal = kotaAsal;
    if (tujuan) updates.tujuan = tujuan;
    if (statusBatch) updates.statusBatch = statusBatch;

    // Jika statusBatch = "HAPUS": hapus permanen semua paket lalu hapus batch itu sendiri
    if (statusBatch === "HAPUS") {
      await db.delete(packagesTable).where(eq(packagesTable.batchId, id));
      await db.delete(batchesTable).where(eq(batchesTable.id, id));
      res.json({ success: true, id, deleted: true });
      return;
    }

    const [updated] = await db
      .update(batchesTable)
      .set(updates)
      .where(eq(batchesTable.id, id))
      .returning();

    res.json(formatBatch(updated));
  } catch (err) {
    (req as any).log?.error?.(err);
    res.status(500).json({ error: "Gagal memperbarui batch" });
  }
});

// GET /api/batches/service-types — reference list of service types
router.get("/service-types/list", requireAuth, requireRole("admin", "owner"), async (req, res) => {
  try {
    const types = await db.select().from(serviceTypesTable).orderBy(serviceTypesTable.id);
    res.json(types);
  } catch (err) {
    (req as any).log?.error?.(err);
    res.status(500).json({ error: "Gagal mengambil jenis layanan" });
  }
});

export default router;
