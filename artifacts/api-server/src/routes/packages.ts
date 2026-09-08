import { Router } from "express";
import {
  db,
  packagesTable,
  usersTable,
  serviceTypesTable,
  batchesTable,
} from "@workspace/db";
import { eq, and, ne, inArray, ilike, sql, gte, lte, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import crypto from "crypto";

const router = Router();

function requireOwnerForPermanentDelete(req: any, res: any, next: any) {
  if (req.user?.role !== "owner") {
    res.status(403).json({ error: "Hanya Owner yang dapat menghapus paket secara permanen" });
    return;
  }
  next();
}

function generateBarcode(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `JAJ-${ts}-${rnd}`;
}

function toNum(val: any): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

// ── Pesawat: pembulatan berat gabungan & recalc ongkir ──────────────────────
// Spec: tiap paket gunakan max(berat_real, berat_volume), jumlahkan, baru bulatkan.
// 0.01–0.20 → 0.20 kg | 0.21–0.40 → 0.40 kg | 0.41–0.50 → 0.50 kg | >0.50 → berat asli
function roundPesawatGroupWeight(totalRealWeight: number): number {
  if (totalRealWeight <= 0) return 0;
  if (totalRealWeight <= 0.2) return 0.2;
  if (totalRealWeight <= 0.4) return 0.4;
  if (totalRealWeight <= 0.5) return 0.5;
  return totalRealWeight; // >0.50 kg: tidak dibulatkan ke atas
}

async function recalcPesawatCustomerOngkir(
  batchId: number,
  customerName: string,
): Promise<void> {
  if (!batchId || !customerName) return;

  // Ambil semua paket Pesawat dalam batch ini
  const allBatchPesawat = await db
    .select()
    .from(packagesTable)
    .where(
      and(
        eq(packagesTable.batchId, batchId),
        eq(packagesTable.serviceType, "jastip pesawat"),
      ),
    );

  const customerLower = customerName.trim().toLowerCase();
  const customerPkgs = allBatchPesawat.filter(
    (p) => (p.customerName || "").trim().toLowerCase() === customerLower,
  );
  if (!customerPkgs.length) return;

  // Tiap paket: gunakan max(berat_real, berat_volume) sebagai berat efektif
  const pkgEffectiveWeights = customerPkgs.map((p) => {
    const real = Number(p.realWeight) || 0;
    const vol = Number(p.volumeWeight) || 0;
    return Math.max(real, vol);
  });
  const totalEffectiveWeight = pkgEffectiveWeights.reduce((s, w) => s + w, 0);
  const roundedWeight = roundPesawatGroupWeight(totalEffectiveWeight);
  const totalGroupOngkir = Math.round(roundedWeight * 77000);

  // Distribusi ongkir proporsional ke setiap paket agar sum = totalGroupOngkir
  const updates: Array<{ id: number; pkgOngkir: number }> = [];
  let distributed = 0;
  for (let i = 0; i < customerPkgs.length; i++) {
    const pkg = customerPkgs[i];
    const pkgEffWeight = pkgEffectiveWeights[i];
    let pkgOngkir: number;
    if (customerPkgs.length === 1) {
      pkgOngkir = totalGroupOngkir;
    } else if (i === customerPkgs.length - 1) {
      pkgOngkir = totalGroupOngkir - distributed; // sisa agar total tepat
    } else {
      pkgOngkir =
        totalEffectiveWeight > 0
          ? Math.round((pkgEffWeight / totalEffectiveWeight) * totalGroupOngkir)
          : Math.round(totalGroupOngkir / customerPkgs.length);
      distributed += pkgOngkir;
    }
    updates.push({ id: pkg.id, pkgOngkir });
  }
  await Promise.all(
    updates.map(({ id, pkgOngkir }) =>
      db
        .update(packagesTable)
        .set({
          shippingRate: "77000",
          totalShipping: String(pkgOngkir),
          updatedAt: new Date(),
        })
        .where(eq(packagesTable.id, id)),
    ),
  );
}

// ── Hemat+: hitung ongkir berdasarkan TOTAL BERAT GABUNGAN konsumen dalam satu batch
// Aturan:
//   - 1 paket & total_berat < 1 kg  → berat_digunakan = 1 kg
//   - 1 paket & total_berat >= 1 kg → berat_digunakan = total_berat
//   - >1 paket                       → berat_digunakan = total_berat (TANPA pembulatan per paket)
// Total ongkir = berat_digunakan × Rp10.000, didistribusikan proporsional ke tiap paket.
async function recalcHematCustomerOngkir(
  batchId: number,
  customerName: string,
): Promise<void> {
  if (!batchId || !customerName) return;

  const allBatchHemat = await db
    .select()
    .from(packagesTable)
    .where(
      and(
        eq(packagesTable.batchId, batchId),
        eq(packagesTable.serviceType, "jastip hemat+"),
      ),
    );

  const customerLower = customerName.trim().toLowerCase();
  const customerPkgs = allBatchHemat.filter(
    (p) => (p.customerName || "").trim().toLowerCase() === customerLower,
  );
  if (!customerPkgs.length) return;

  const jumlahPaket = customerPkgs.length;
  const totalBerat = customerPkgs.reduce(
    (s, p) => s + (Number(p.usedWeight) || 0),
    0,
  );

  let beratDigunakan: number;
  if (jumlahPaket === 1 && totalBerat < 1) {
    beratDigunakan = 1;
  } else {
    beratDigunakan = totalBerat; // >1 paket: jumlah langsung, tanpa pembulatan per paket
  }

  const totalGroupOngkir = Math.round(beratDigunakan * 10000);

  // Distribusi proporsional ke tiap paket agar sum = totalGroupOngkir
  const updates: Array<{ id: number; pkgOngkir: number }> = [];
  let distributed = 0;
  for (let i = 0; i < customerPkgs.length; i++) {
    const pkg = customerPkgs[i];
    let pkgOngkir: number;
    if (customerPkgs.length === 1) {
      pkgOngkir = totalGroupOngkir;
    } else if (i === customerPkgs.length - 1) {
      pkgOngkir = totalGroupOngkir - distributed;
    } else {
      pkgOngkir =
        totalBerat > 0
          ? Math.round(
              ((Number(pkg.usedWeight) || 0) / totalBerat) * totalGroupOngkir,
            )
          : Math.round(totalGroupOngkir / customerPkgs.length);
      distributed += pkgOngkir;
    }
    updates.push({ id: pkg.id, pkgOngkir });
  }
  await Promise.all(
    updates.map(({ id, pkgOngkir }) =>
      db
        .update(packagesTable)
        .set({
          shippingRate: "10000",
          totalShipping: String(pkgOngkir),
          updatedAt: new Date(),
        })
        .where(eq(packagesTable.id, id)),
    ),
  );
}

// ── Pelni: tarif per-kg berdasarkan TOTAL BERAT GABUNGAN konsumen dalam satu batch
// (bukan berdasarkan berat per paket)
function getPelniRateByTotalWeight(
  totalWeight: number,
  deliveryRoute: string | null | undefined,
): number | null {
  if (!deliveryRoute || !totalWeight || totalWeight <= 0) return null;
  if (deliveryRoute === "Jakarta → Manokwari") {
    if (totalWeight <= 10.1) return 20000;
    if (totalWeight <= 20.1) return 19000;
    if (totalWeight <= 40.1) return 18000;
    if (totalWeight <= 80.1) return 17000;
    return 16000; // 81–200 kg
  }
  if (deliveryRoute === "Surabaya → Manokwari") {
    if (totalWeight <= 10) return 18000;
    if (totalWeight <= 20) return 17000;
    if (totalWeight <= 40) return 16000;
    return 15500;
  }
  return null;
}

// Recalculate shippingRate + totalShipping untuk SEMUA paket Pelni milik satu
// konsumen dalam satu batch, berdasarkan total berat gabungan mereka.
async function recalcPelniCustomerOngkir(
  batchId: number,
  customerName: string,
  deliveryRoute: string,
): Promise<void> {
  if (!batchId || !customerName || !deliveryRoute) return;

  // Ambil semua paket Pelni dalam batch ini
  const allBatchPelni = await db
    .select()
    .from(packagesTable)
    .where(
      and(
        eq(packagesTable.batchId, batchId),
        eq(packagesTable.serviceType, "jastip pelni"),
      ),
    );

  // Filter per konsumen (case-insensitive)
  const customerLower = customerName.trim().toLowerCase();
  const customerPkgs = allBatchPelni.filter(
    (p) => (p.customerName || "").trim().toLowerCase() === customerLower,
  );
  if (!customerPkgs.length) return;

  // Total berat gabungan
  const totalWeight = customerPkgs.reduce(
    (s, p) => s + (Number(p.usedWeight) || 0),
    0,
  );
  if (!totalWeight) return;

  // Tarif dari tabel bertingkat berdasarkan total berat
  const rate = getPelniRateByTotalWeight(totalWeight, deliveryRoute);
  if (!rate) return;

  // Update setiap paket: shippingRate = rate, totalShipping = usedWeight × rate
  await Promise.all(
    customerPkgs.map((pkg) => {
      const pkgWeight = Number(pkg.usedWeight) || 0;
      const pkgTotalShipping = Math.round(pkgWeight * rate);
      return db
        .update(packagesTable)
        .set({
          shippingRate: String(rate),
          totalShipping: String(pkgTotalShipping),
          updatedAt: new Date(),
        })
        .where(eq(packagesTable.id, pkg.id));
    }),
  );
}

function getShippingRate(
  serviceType: string | null | undefined,
  deliveryRoute: string | null | undefined,
  weight: number | null | undefined,
): number | null {
  if (!serviceType || !weight || weight <= 0) return null;
  if (serviceType === "jastip pesawat") return 77000;
  if (serviceType === "jastip hemat+") return 10000;
  if (serviceType === "jastip kargo") return 7000;
  // Pelni: gunakan getPelniRateByTotalWeight (tarif berdasarkan total berat konsumen)
  // Fungsi ini hanya dipakai sebagai estimasi awal; recalcPelniCustomerOngkir akan
  // menghitung ulang dengan benar setelah semua paket tersimpan.
  if (serviceType === "jastip pelni")
    return getPelniRateByTotalWeight(weight, deliveryRoute);
  return null;
}

function getTotalShipping(
  serviceType: string | null | undefined,
  deliveryRoute: string | null | undefined,
  weight: number | null | undefined,
): number | null {
  if (!serviceType || !weight || weight <= 0) return null;

  // Pesawat: estimasi per-paket (server akan recalc berdasarkan total berat gabungan)
  // Aturan pembulatan: ≤0.20→0.20kg | ≤0.40→0.40kg | ≤0.50→0.50kg | >0.50→berat asli
  if (
    serviceType === "jastip pesawat" &&
    deliveryRoute === "Jakarta → Manokwari"
  ) {
    const rounded = roundPesawatGroupWeight(weight);
    return Math.round(rounded * 77000);
  }

  if (
    serviceType === "jastip hemat+" &&
    deliveryRoute === "Surabaya → Manokwari"
  ) {
    return Math.round(weight * 10000);
  }

  // Kargo: setiap paket dihitung sendiri — berat × Rp 7.000
  if (serviceType === "jastip kargo") {
    return Math.round(weight * 7000);
  }

  if (serviceType === "jastip pelni") {
    const rate = getPelniRateByTotalWeight(weight, deliveryRoute);
    if (rate) return Math.round(weight * rate);
  }

  return null;
}

function getVolumeDivisor(serviceType: string | null | undefined) {
  if (serviceType === "jastip pesawat") return 5000;
  if (serviceType === "jastip hemat+") return 4000;
  if (serviceType === "jastip pelni") return 4000;
  if (serviceType === "jastip kargo") return 1000000;
  return 6000;
}

function formatPackage(
  pkg: any,
  customerMap: Map<number, any>,
  adminMap: Map<number, any>,
) {
  return {
    ...pkg,
    weight: toNum(pkg.weight),
    realWeight: toNum(pkg.realWeight),
    length: toNum(pkg.length),
    width: toNum(pkg.width),
    height: toNum(pkg.height),
    volumeWeight: toNum(pkg.volumeWeight),
    usedWeight: toNum(pkg.usedWeight),
    shippingRate: toNum(pkg.shippingRate),
    totalWeight: toNum(pkg.totalWeight),
    price: toNum(pkg.price),
    totalShipping: toNum(pkg.totalShipping),
    deliveryRoute: pkg.deliveryRoute || null,
    customerName:
      (pkg.customerName || customerMap.get(pkg.customerId)?.name) ?? "",
    customerPhone: customerMap.get(pkg.customerId)?.phone ?? "",
    adminName: pkg.adminId ? (adminMap.get(pkg.adminId)?.name ?? null) : null,
    packageDate: pkg.packageDate?.toISOString() ?? null,
    pickedUpAt: pkg.pickedUpAt?.toISOString() ?? null,
    createdAt: pkg.createdAt.toISOString(),
    updatedAt: pkg.updatedAt.toISOString(),
  };
}

// GET /api/packages
router.get(
  "/",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const {
        status,
        customerId,
        adminId,
        dateFrom,
        dateTo,
        search,
        batchId,
        serviceTypeId,
        statusPengambilan,
        statusVerifikasi,
      } = req.query as any;

      // Build WHERE conditions pushed to the database — avoids loading all rows
      // into Node then filtering in JS (the old approach was O(n) in memory).
      const conditions: ReturnType<typeof eq>[] = [];

      if (status) conditions.push(eq(packagesTable.status, status));
      if (statusPengambilan)
        conditions.push(eq(packagesTable.statusPengambilan, statusPengambilan));
      if (statusVerifikasi)
        conditions.push(eq(packagesTable.statusVerifikasi, statusVerifikasi));
      if (batchId)
        conditions.push(eq(packagesTable.batchId, Number(batchId)));
      if (serviceTypeId)
        conditions.push(eq(packagesTable.serviceTypeId, Number(serviceTypeId)));
      if (customerId)
        conditions.push(eq(packagesTable.customerId, Number(customerId)));
      if (adminId)
        conditions.push(eq(packagesTable.adminId, Number(adminId)));
      if (dateFrom)
        conditions.push(gte(packagesTable.createdAt, new Date(dateFrom)));
      if (dateTo)
        conditions.push(
          lte(packagesTable.createdAt, new Date(dateTo + "T23:59:59Z")),
        );
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            ilike(packagesTable.resiNumber, pattern),
            ilike(packagesTable.barcode, pattern),
            ilike(packagesTable.packageNumber, pattern),
            ilike(packagesTable.customerName, pattern),
            ilike(packagesTable.itemName, pattern),
          ) as ReturnType<typeof eq>,
        );
      }

      const [rows, admins] = await Promise.all([
        conditions.length > 0
          ? db
              .select()
              .from(packagesTable)
              .where(and(...conditions))
              .orderBy(packagesTable.createdAt)
          : db.select().from(packagesTable).orderBy(packagesTable.createdAt),
        db
          .select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.role, "admin")),
      ]);

      const adminMap = new Map(admins.map((a) => [a.id, a]));
      const customerMap = new Map<number, any>();

      res.json(rows.map((p) => formatPackage(p, customerMap, adminMap)));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /api/packages
router.post(
  "/",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const {
        resiNumber,
        packageNumber,
        packageMode,
        itemName,
        realWeight,
        length,
        width,
        height,
        serviceType,
        deliveryRoute,
        packagingType,
        shippingRate,
        totalShipping: totalShippingInput,
        totalWeight,
        price,
        weight,
        notes,
        customerId,
        customerName,
        packageDate,
        batchId,
      } = req.body;

      if (!resiNumber || (!customerId && !customerName)) {
        res.status(400).json({
          error: "resiNumber and customerName or customerId required",
        });
        return;
      }

      if (!batchId) {
        res
          .status(400)
          .json({
            error:
              "batchId wajib diisi — pilih Batch Pengiriman terlebih dahulu",
          });
        return;
      }

      // Validate batch exists and is OPEN
      const batches = await db
        .select()
        .from(batchesTable)
        .where(eq(batchesTable.id, Number(batchId)))
        .limit(1);
      if (!batches[0]) {
        res.status(400).json({ error: "Batch tidak ditemukan" });
        return;
      }
      if (batches[0].statusBatch === "CLOSED") {
        res
          .status(400)
          .json({
            error:
              "Batch sudah ditutup. Hubungi Owner untuk menambah paket susulan.",
          });
        return;
      }
      if (batches[0].statusBatch === "ARSIP") {
        res
          .status(400)
          .json({
            error: "Batch sudah diarsip dan tidak dapat menerima paket baru",
          });
        return;
      }

      // Resolve serviceTypeId from serviceType text
      let serviceTypeId: number | null = null;
      if (serviceType) {
        const stRows = await db
          .select()
          .from(serviceTypesTable)
          .where(eq(serviceTypesTable.name, serviceType))
          .limit(1);
        serviceTypeId = stRows[0]?.id ?? null;
      }

      const divisor = getVolumeDivisor(serviceType);
      let volumeWeight: number | null = null;
      if (length && width && height) {
        volumeWeight =
          (Number(length) * Number(width) * Number(height)) / divisor;
      }
      const effectiveRealWeight = realWeight ? Number(realWeight) : null;
      const usedWeight =
        effectiveRealWeight !== null && volumeWeight !== null
          ? Math.max(effectiveRealWeight, volumeWeight)
          : (effectiveRealWeight ?? volumeWeight);
      // Kargo: shippingRate diisi user (tarif/M3), bukan hardcoded 7000
      const effectiveShippingRate =
        serviceType === "jastip kargo"
          ? shippingRate
            ? Number(shippingRate)
            : null
          : (getShippingRate(serviceType, deliveryRoute, usedWeight) ??
            (shippingRate ? Number(shippingRate) : null));

      let totalShipping: number | null = null;
      if (
        totalShippingInput !== undefined &&
        totalShippingInput !== null &&
        totalShippingInput !== ""
      ) {
        totalShipping = Number(totalShippingInput);
      } else if (
        serviceType === "jastip kargo" &&
        volumeWeight !== null &&
        effectiveShippingRate !== null
      ) {
        // Kargo: totalShipping = Berat Kubikasi × Ongkir/M3
        totalShipping = Math.round(volumeWeight * effectiveShippingRate);
      } else {
        totalShipping = getTotalShipping(
          serviceType,
          deliveryRoute,
          usedWeight,
        );
      }

      const barcode = generateBarcode();
      const insertData: Record<string, any> = {
        barcode,
        resiNumber,
        itemName: itemName || null,
        status: "pending",
        adminId: user.id,
        packageDate: packageDate ? new Date(packageDate) : new Date(),
        ...(packageNumber ? { packageNumber } : {}),
        ...(packageMode ? { packageMode } : {}),
        ...(realWeight ? { realWeight: String(realWeight) } : {}),
        ...(length ? { length: String(length) } : {}),
        ...(width ? { width: String(width) } : {}),
        ...(height ? { height: String(height) } : {}),
        ...(volumeWeight !== null
          ? { volumeWeight: String(volumeWeight) }
          : {}),
        ...(serviceType ? { serviceType } : {}),
        ...(deliveryRoute ? { deliveryRoute } : {}),
        ...(packagingType ? { packagingType } : {}),
        ...(usedWeight !== null ? { usedWeight: String(usedWeight) } : {}),
        ...(effectiveShippingRate !== null
          ? { shippingRate: String(effectiveShippingRate) }
          : {}),
        ...(totalWeight ? { totalWeight: String(totalWeight) } : {}),
        ...(price ? { price: String(price) } : {}),
        ...(totalShipping !== null
          ? { totalShipping: String(totalShipping) }
          : {}),
        ...(weight ? { weight: String(weight) } : {}),
        ...(notes ? { notes } : {}),
        ...(customerName ? { customerName } : {}),
        ...(customerId ? { customerId: Number(customerId) } : {}),
        batchId: Number(batchId),
        ...(serviceTypeId !== null ? { serviceTypeId } : {}),
      };
      const inserted = await db
        .insert(packagesTable)
        .values(insertData as any)
        .returning();

      let pkg = inserted[0];

      // Pesawat: hitung ulang ongkir berdasarkan total berat gabungan konsumen dalam batch
      if (serviceType === "jastip pesawat" && pkg.batchId && pkg.customerName) {
        await recalcPesawatCustomerOngkir(pkg.batchId, pkg.customerName);
        const refreshed = await db
          .select()
          .from(packagesTable)
          .where(eq(packagesTable.id, pkg.id))
          .limit(1);
        if (refreshed[0]) pkg = refreshed[0];
      }

      // Pelni: hitung ulang ongkir berdasarkan total berat gabungan konsumen dalam batch
      if (
        serviceType === "jastip pelni" &&
        pkg.batchId &&
        pkg.customerName &&
        pkg.deliveryRoute
      ) {
        await recalcPelniCustomerOngkir(
          pkg.batchId,
          pkg.customerName,
          pkg.deliveryRoute,
        );
        // Re-fetch agar nilai yang dikembalikan sudah benar
        const refreshed = await db
          .select()
          .from(packagesTable)
          .where(eq(packagesTable.id, pkg.id))
          .limit(1);
        if (refreshed[0]) pkg = refreshed[0];
      }

      // Hemat+: hitung ulang ongkir berdasarkan total berat gabungan konsumen dalam batch
      if (serviceType === "jastip hemat+" && pkg.batchId && pkg.customerName) {
        await recalcHematCustomerOngkir(pkg.batchId, pkg.customerName);
        const refreshed = await db
          .select()
          .from(packagesTable)
          .where(eq(packagesTable.id, pkg.id))
          .limit(1);
        if (refreshed[0]) pkg = refreshed[0];
      }

      const adminMap = new Map<number, any>();
      if (pkg.adminId) {
        const admin = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, pkg.adminId))
          .limit(1);
        if (admin[0]) adminMap.set(admin[0].id, admin[0]);
      }

      res.status(201).json(formatPackage(pkg, new Map(), adminMap));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /api/packages/import
router.post(
  "/import",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const { packages: rows, batchId } = req.body;
      if (!rows || !Array.isArray(rows)) {
        res.status(400).json({ error: "packages array required" });
        return;
      }
      if (!batchId) {
        res
          .status(400)
          .json({
            error:
              "batchId wajib diisi — pilih Batch Pengiriman terlebih dahulu",
          });
        return;
      }
      // Validate batch
      const batches = await db
        .select()
        .from(batchesTable)
        .where(eq(batchesTable.id, Number(batchId)))
        .limit(1);
      if (!batches[0] || batches[0].statusBatch === "ARSIP") {
        res.status(400).json({ error: "Batch tidak valid atau sudah diarsip" });
        return;
      }
      if (batches[0].statusBatch === "CLOSED") {
        res
          .status(400)
          .json({
            error:
              "Batch sudah ditutup. Hubungi Owner untuk menambah paket susulan.",
          });
        return;
      }
      // Pre-load service type map for fast lookup
      const allServiceTypes = await db.select().from(serviceTypesTable);
      const serviceTypeByName = new Map(
        allServiceTypes.map((t) => [t.name, t.id]),
      );
      let success = 0,
        failed = 0;
      const errors: string[] = [];
      const createdIds: number[] = [];

      for (const row of rows) {
        try {
          const {
            resiNumber,
            packageNumber,
            customerName,
            itemName,
            realWeight,
            length,
            width,
            height,
            packagingType,
            shippingRate,
            totalWeight,
            price,
            notes,
            packageDate,
            serviceType,
            deliveryRoute,
            packageMode,
            totalShipping: totalShippingRow,
          } = row;

          if (!resiNumber || !customerName) {
            failed++;
            errors.push(
              `Row missing resiNumber or customerName: ${JSON.stringify(row)}`,
            );
            continue;
          }

          // Skip jika resiNumber sudah ada di batch yang sama (cegah duplikat import ulang).
          // Kargo (packageMode="single") dikecualikan: kolom Toko/Kurir bukan nomor resi unik,
          // banyak paket bisa berasal dari kurir yang sama (JNE, JNT, SPX, dst).
          if (packageMode !== "single") {
            const existing = await db
              .select({ id: packagesTable.id })
              .from(packagesTable)
              .where(
                and(
                  eq(packagesTable.resiNumber, String(resiNumber)),
                  eq(packagesTable.batchId, Number(batchId)),
                ),
              )
              .limit(1);
            if (existing[0]) {
              failed++;
              errors.push(`Duplikat dilewati — resi ${resiNumber} sudah ada di batch ini`);
              continue;
            }
          }

          const divisor = getVolumeDivisor(serviceType);
          let volumeWeight: number | null = null;
          if (length && width && height) {
            volumeWeight =
              (Number(length) * Number(width) * Number(height)) / divisor;
          }
          const effectiveRealWeight = realWeight ? Number(realWeight) : null;
          const usedWeight =
            effectiveRealWeight !== null && volumeWeight !== null
              ? Math.max(effectiveRealWeight, volumeWeight)
              : (effectiveRealWeight ?? volumeWeight);

          // Kargo: gunakan ongkir dari data row jika tersedia, bukan rumus berat × tarif
          let totalShipping: number | null;
          if (
            totalShippingRow !== undefined &&
            totalShippingRow !== null &&
            totalShippingRow !== ""
          ) {
            totalShipping = Number(totalShippingRow);
          } else {
            totalShipping = getTotalShipping(
              serviceType,
              deliveryRoute,
              usedWeight,
            );
          }

          const barcode = generateBarcode();
          const inserted = await db
            .insert(packagesTable)
            .values({
              barcode,
              resiNumber: String(resiNumber),
              packageNumber: packageNumber ? String(packageNumber) : null,
              itemName: itemName ? String(itemName) : null,
              customerName: String(customerName),
              realWeight: realWeight ? String(realWeight) : null,
              length: length ? String(length) : null,
              width: width ? String(width) : null,
              height: height ? String(height) : null,
              volumeWeight: volumeWeight !== null ? String(volumeWeight) : null,
              packagingType: packagingType ? String(packagingType) : null,
              usedWeight: usedWeight !== null ? String(usedWeight) : null,
              shippingRate: shippingRate ? String(shippingRate) : null,
              totalWeight: totalWeight ? String(totalWeight) : null,
              price: price ? String(price) : null,
              totalShipping:
                totalShipping !== null ? String(totalShipping) : null,
              notes: notes ? String(notes) : null,
              status: "pending",
              adminId: user.id,
              serviceType: serviceType ? String(serviceType) : null,
              deliveryRoute: deliveryRoute ? String(deliveryRoute) : null,
              packageDate: packageDate
                ? new Date(String(packageDate))
                : new Date(),
              packageMode: packageMode ? String(packageMode) : "grup",
              batchId: Number(batchId),
              serviceTypeId: serviceType
                ? (serviceTypeByName.get(String(serviceType)) ?? null)
                : null,
            })
            .returning({ id: packagesTable.id });
          if (inserted[0]?.id) createdIds.push(inserted[0].id);
          success++;
        } catch (e) {
          failed++;
          errors.push(`Error processing row: ${String(e)}`);
        }
      }
      // Pesawat: setelah semua paket diinsert, hitung ulang ongkir per konsumen
      const pesawatRows = (rows as any[]).filter(
        (r: any) => r.serviceType === "jastip pesawat",
      );
      if (pesawatRows.length > 0) {
        const pesawatCustomers = new Set<string>();
        for (const r of pesawatRows) {
          if (r.customerName) pesawatCustomers.add(String(r.customerName));
        }
        for (const customerName of pesawatCustomers) {
          await recalcPesawatCustomerOngkir(Number(batchId), customerName);
        }
      }

      // Pelni: setelah semua paket diinsert, hitung ulang ongkir per konsumen
      // berdasarkan total berat gabungan mereka dalam batch ini
      const pelniRows = (rows as any[]).filter(
        (r: any) => r.serviceType === "jastip pelni",
      );
      if (pelniRows.length > 0) {
        const pelniGroups = new Map<
          string,
          { customerName: string; deliveryRoute: string }
        >();
        for (const r of pelniRows) {
          if (!r.customerName || !r.deliveryRoute) continue;
          const key = `${(r.customerName as string).trim().toLowerCase()}|${r.deliveryRoute}`;
          if (!pelniGroups.has(key)) {
            pelniGroups.set(key, {
              customerName: String(r.customerName),
              deliveryRoute: String(r.deliveryRoute),
            });
          }
        }
        for (const { customerName, deliveryRoute } of pelniGroups.values()) {
          await recalcPelniCustomerOngkir(
            Number(batchId),
            customerName,
            deliveryRoute,
          );
        }
      }

      // Hemat+: setelah semua paket diinsert, hitung ulang ongkir per konsumen
      const hematRows = (rows as any[]).filter(
        (r: any) => r.serviceType === "jastip hemat+",
      );
      if (hematRows.length > 0) {
        const hematCustomers = new Set<string>();
        for (const r of hematRows) {
          if (r.customerName) hematCustomers.add(String(r.customerName));
        }
        for (const customerName of hematCustomers) {
          await recalcHematCustomerOngkir(Number(batchId), customerName);
        }
      }

      res.json({
        success,
        failed,
        total: rows.length,
        errors,
        ids: createdIds,
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Prefix used by "grup" barcode labels (see print-label.ts groupQrValue) that
// stand for several packages belonging to the same customer/trip. Must stay
// in sync with GROUP_BARCODE_PREFIX in artifacts/jastip/src/lib/print-label.ts.
const GROUP_BARCODE_PREFIX = "JAJ-GRUP-";

// GET /api/packages/scan/:barcode
router.get(
  "/scan/:barcode",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const barcode = String(req.params.barcode);

      if (barcode.startsWith(GROUP_BARCODE_PREFIX)) {
        const ids = barcode
          .slice(GROUP_BARCODE_PREFIX.length)
          .split("-")
          .map((s) => Number(s))
          .filter((n) => Number.isInteger(n) && n > 0);

        if (!ids.length) {
          res.json({ valid: false, message: "Barcode grup tidak valid" });
          return;
        }

        const groupPkgs = await db
          .select()
          .from(packagesTable)
          .where(inArray(packagesTable.id, ids));

        if (!groupPkgs.length) {
          res.json({ valid: false, message: "Paket grup tidak ditemukan" });
          return;
        }

        const adminIds = [
          ...new Set(
            groupPkgs
              .map((p) => p.adminId)
              .filter((v): v is number => v != null),
          ),
        ];
        const adminMap = new Map<number, any>();
        if (adminIds.length) {
          const admins = await db
            .select()
            .from(usersTable)
            .where(inArray(usersTable.id, adminIds));
          for (const a of admins) adminMap.set(a.id, a);
        }

        res.json({
          valid: true,
          group: true,
          message: "Paket grup ditemukan",
          packages: groupPkgs.map((p) => formatPackage(p, new Map(), adminMap)),
        });
        return;
      }

      // Optional batchId hint: prefer the package belonging to this batch
      const hintBatchId = req.query.batchId ? Number(req.query.batchId) : null;

      let pkgs = await db
        .select()
        .from(packagesTable)
        .where(sql`lower(${packagesTable.barcode}) = lower(${barcode})`)
        .limit(1);
      if (!pkgs[0]) {
        // Search all matching resiNumber rows (case-insensitive), then prefer the one in hintBatchId
        const byResi = await db
          .select()
          .from(packagesTable)
          .where(sql`lower(${packagesTable.resiNumber}) = lower(${barcode})`);
        if (byResi.length > 0) {
          const inBatch = hintBatchId != null ? byResi.find((p) => p.batchId === hintBatchId) : null;
          pkgs = [inBatch ?? byResi[0]];
        }
      }
      if (!pkgs[0] && barcode) {
        const all = await db.select().from(packagesTable);
        const candidates = all.filter((p) => p.packageNumber === barcode);
        if (candidates.length > 0) {
          const inBatch = hintBatchId != null ? candidates.find((p) => p.batchId === hintBatchId) : null;
          pkgs = [inBatch ?? candidates[0]];
        }
      }
      const pkg = pkgs[0];

      if (!pkg) {
        res.json({ valid: false, message: "Paket tidak ditemukan" });
        return;
      }
      if (
        pkg.statusPengambilan === "SUDAH_DIAMBIL" ||
        pkg.status === "diserahkan"
      ) {
        res.json({
          valid: false,
          message: "Paket sudah diserahkan sebelumnya",
          package: formatPackage(pkg, new Map(), new Map()),
        });
        return;
      }

      const adminMap = new Map<number, any>();
      if (pkg.adminId) {
        const admin = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, pkg.adminId))
          .limit(1);
        if (admin[0]) adminMap.set(admin[0].id, admin[0]);
      }

      res.json({
        valid: true,
        message: "Paket ditemukan",
        package: formatPackage(pkg, new Map(), adminMap),
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// GET /api/packages/:id
router.get(
  "/:id",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const pkgs = await db
        .select()
        .from(packagesTable)
        .where(eq(packagesTable.id, id))
        .limit(1);
      const pkg = pkgs[0];
      if (!pkg) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const adminMap = new Map<number, any>();
      if (pkg.adminId) {
        const admin = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, pkg.adminId))
          .limit(1);
        if (admin[0]) adminMap.set(admin[0].id, admin[0]);
      }
      res.json(formatPackage(pkg, new Map(), adminMap));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// PATCH /api/packages/:id — full update including recalculating weights
router.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      // Lock: packages that have been picked up cannot be changed.
      // For customerName-only patches (grup flow), lock does not apply — check separately.
      const keys = Object.keys(req.body);
      const isCustomerNameOnly =
        keys.length === 1 && keys[0] === "customerName";

      if (!isCustomerNameOnly) {
        // Atomic lock check: read the package and verify it is not locked before proceeding
        const lockCheck = await db
          .select({
            statusPengambilan: packagesTable.statusPengambilan,
            status: packagesTable.status,
          })
          .from(packagesTable)
          .where(eq(packagesTable.id, id))
          .limit(1);
        if (
          lockCheck[0]?.statusPengambilan === "SUDAH_DIAMBIL" ||
          lockCheck[0]?.status === "diserahkan"
        ) {
          res
            .status(400)
            .json({ error: "Paket sudah diambil dan tidak dapat diubah lagi" });
          return;
        }
      }

      const {
        status,
        notes,
        resiNumber,
        packageNumber,
        customerName,
        itemName,
        serviceType,
        deliveryRoute,
        packagingType,
        packageDate,
        realWeight,
        length,
        width,
        height,
        shippingRate,
        totalShipping: totalShippingInput,
      } = req.body;

      const updateData: any = { updatedAt: new Date() };

      if (status) {
        updateData.status = status;
        if (status === "diserahkan") updateData.pickedUpAt = new Date();
      }
      if (notes !== undefined) updateData.notes = notes;
      if (resiNumber !== undefined) updateData.resiNumber = resiNumber;
      if (packageNumber !== undefined)
        updateData.packageNumber = packageNumber || null;
      if (customerName !== undefined) updateData.customerName = customerName;
      if (itemName !== undefined) updateData.itemName = itemName || null;
      if (serviceType !== undefined)
        updateData.serviceType = serviceType || null;
      if (deliveryRoute !== undefined)
        updateData.deliveryRoute = deliveryRoute || null;
      if (packagingType !== undefined)
        updateData.packagingType = packagingType || null;
      if (packageDate !== undefined)
        updateData.packageDate = packageDate ? new Date(packageDate) : null;

      // Kargo: izinkan update ongkir langsung dari body
      if (
        totalShippingInput !== undefined &&
        totalShippingInput !== null &&
        totalShippingInput !== ""
      ) {
        updateData.totalShipping = String(Number(totalShippingInput));
      }

      const hasPhysical =
        realWeight !== undefined ||
        length !== undefined ||
        width !== undefined ||
        height !== undefined;
      const hasService =
        serviceType !== undefined || deliveryRoute !== undefined;

      if (hasPhysical || hasService) {
        const existing = await db
          .select()
          .from(packagesTable)
          .where(eq(packagesTable.id, id))
          .limit(1);
        if (!existing[0]) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const e = existing[0];

        const effService =
          serviceType !== undefined ? serviceType || null : e.serviceType;
        const effRoute =
          deliveryRoute !== undefined ? deliveryRoute || null : e.deliveryRoute;
        const rw =
          realWeight !== undefined
            ? realWeight
              ? Number(realWeight)
              : null
            : toNum(e.realWeight);
        const l =
          length !== undefined
            ? length
              ? Number(length)
              : null
            : toNum(e.length);
        const w =
          width !== undefined ? (width ? Number(width) : null) : toNum(e.width);
        const h =
          height !== undefined
            ? height
              ? Number(height)
              : null
            : toNum(e.height);

        if (realWeight !== undefined)
          updateData.realWeight = rw != null ? String(rw) : null;
        if (length !== undefined)
          updateData.length = l != null ? String(l) : null;
        if (width !== undefined)
          updateData.width = w != null ? String(w) : null;
        if (height !== undefined)
          updateData.height = h != null ? String(h) : null;

        const divisor = getVolumeDivisor(effService);
        const vw = l && w && h ? (l * w * h) / divisor : null;
        updateData.volumeWeight = vw != null ? String(vw) : null;

        const uw = rw != null && vw != null ? Math.max(rw, vw) : (rw ?? vw);
        updateData.usedWeight = uw != null ? String(uw) : null;

        // Kargo: gunakan shippingRate dari body (tarif/M3 user-input), bukan hardcoded 7000
        const rate =
          effService === "jastip kargo"
            ? shippingRate !== undefined
              ? shippingRate
                ? Number(shippingRate)
                : null
              : toNum(e.shippingRate)
            : getShippingRate(effService, effRoute, uw ?? undefined);
        updateData.shippingRate = rate != null ? String(rate) : null;

        if (effService !== "jastip kargo") {
          const total = getTotalShipping(effService, effRoute, uw ?? undefined);
          if (total != null) updateData.totalShipping = String(total);
        } else if (
          totalShippingInput === undefined ||
          totalShippingInput === null ||
          totalShippingInput === ""
        ) {
          // Kargo: recalculate totalShipping = volumeWeight × shippingRate
          if (vw != null && rate != null) {
            updateData.totalShipping = String(Math.round(vw * rate));
          }
        }
      }

      const updated = await db
        .update(packagesTable)
        .set(updateData)
        .where(eq(packagesTable.id, id))
        .returning();
      let pkg = updated[0];
      if (!pkg) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      // Pesawat: hitung ulang ongkir berdasarkan total berat gabungan konsumen dalam batch
      if (
        pkg.serviceType === "jastip pesawat" &&
        pkg.batchId &&
        pkg.customerName
      ) {
        await recalcPesawatCustomerOngkir(pkg.batchId, pkg.customerName);
        const refreshedP = await db
          .select()
          .from(packagesTable)
          .where(eq(packagesTable.id, pkg.id))
          .limit(1);
        if (refreshedP[0]) pkg = refreshedP[0];
      }

      // Pelni: hitung ulang ongkir berdasarkan total berat gabungan konsumen dalam batch
      if (
        pkg.serviceType === "jastip pelni" &&
        pkg.batchId &&
        pkg.customerName &&
        pkg.deliveryRoute
      ) {
        await recalcPelniCustomerOngkir(
          pkg.batchId,
          pkg.customerName,
          pkg.deliveryRoute,
        );
        const refreshed = await db
          .select()
          .from(packagesTable)
          .where(eq(packagesTable.id, pkg.id))
          .limit(1);
        if (refreshed[0]) pkg = refreshed[0];
      }

      // Hemat+: hitung ulang ongkir berdasarkan total berat gabungan konsumen dalam batch
      if (
        pkg.serviceType === "jastip hemat+" &&
        pkg.batchId &&
        pkg.customerName
      ) {
        await recalcHematCustomerOngkir(pkg.batchId, pkg.customerName);
        const refreshed = await db
          .select()
          .from(packagesTable)
          .where(eq(packagesTable.id, pkg.id))
          .limit(1);
        if (refreshed[0]) pkg = refreshed[0];
      }

      res.json(formatPackage(pkg, new Map(), new Map()));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// DELETE /api/packages/:id — hard delete (data dihapus permanen dari database)
router.delete(
  "/:id",
  requireAuth,
  requireOwnerForPermanentDelete,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const deleted = await db
        .delete(packagesTable)
        .where(eq(packagesTable.id, id))
        .returning();
      if (!deleted[0]) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json({ success: true, id });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Gagal menghapus paket secara permanen" });
    }
  },
);

// POST /api/packages/:id/serahkan
router.post(
  "/:id/serahkan",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updated = await db
        .update(packagesTable)
        .set({
          status: "diserahkan",
          statusPengambilan: "SUDAH_DIAMBIL",
          pickedUpAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(packagesTable.id, id))
        .returning();
      const pkg = updated[0];
      if (!pkg) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(formatPackage(pkg, new Map(), new Map()));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /api/packages/:id/tolak
router.post(
  "/:id/tolak",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      // Atomic lock: update only if package is NOT already picked up
      const updated = await db
        .update(packagesTable)
        .set({
          status: "pending",
          statusPengambilan: "BELUM_DIAMBIL",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(packagesTable.id, id),
            ne(packagesTable.statusPengambilan, "SUDAH_DIAMBIL"),
          ),
        )
        .returning();
      if (!updated.length) {
        // Either package not found or it was locked
        const exists = await db
          .select({ id: packagesTable.id })
          .from(packagesTable)
          .where(eq(packagesTable.id, id))
          .limit(1);
        if (!exists.length) {
          res.status(404).json({ error: "Paket tidak ditemukan" });
        } else {
          res
            .status(400)
            .json({
              error: "Paket sudah diambil dan tidak dapat ditolak lagi",
            });
        }
        return;
      }
      const pkg = updated[0];
      res.json(formatPackage(pkg, new Map(), new Map()));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /api/packages/:id/verify — mark package as verified (sudah_diverifikasi)
router.post(
  "/:id/verify",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updated = await db
        .update(packagesTable)
        .set({
          verified: "sudah_diverifikasi",
          verifiedAt: new Date(),
          statusVerifikasi: "SUDAH_DIVERIFIKASI",
          updatedAt: new Date(),
        })
        .where(eq(packagesTable.id, id))
        .returning();
      const pkg = updated[0];
      if (!pkg) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(formatPackage(pkg, new Map(), new Map()));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// GET /api/packages/:id/barcode
router.get(
  "/:id/barcode",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const pkgs = await db
        .select()
        .from(packagesTable)
        .where(eq(packagesTable.id, id))
        .limit(1);
      const pkg = pkgs[0];
      if (!pkg) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json({
        barcode: pkg.barcode,
        packageId: pkg.id,
        resiNumber: pkg.resiNumber,
        itemName: pkg.itemName,
        customerName: pkg.customerName ?? "",
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

export default router;
