import { Router } from "express";
import {
  db,
  packagesTable,
  usersTable,
  serviceTypesTable,
  batchesTable,
  settingsShippingMinimumTable,
  packageImportsTable,
  transactionsTable,
  invoiceItemsTable,
} from "@workspace/db";
import { eq, and, ne, inArray, ilike, sql, gte, lte, or, desc, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  applyShippingMinimum,
  distributeShippingTotal,
} from "../lib/shipping-minimum";
import {
  type BaseRates,
  getBaseRates,
  getPelniRateByTotalWeightFromTiers,
} from "../lib/base-rates";
import { safeIsoString, safeIsoStringOrNull } from "../lib/dates";
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

async function resolveOriginCity(
  deliveryRoute: string | null | undefined,
  batchId?: number | null,
): Promise<string> {
  if (deliveryRoute && String(deliveryRoute).trim()) {
    const firstPart = String(deliveryRoute).split("→")[0]?.split("->")[0]?.trim();
    if (firstPart) return firstPart;
  }
  if (batchId) {
    try {
      const [batch] = await db
        .select({ kotaAsal: batchesTable.kotaAsal })
        .from(batchesTable)
        .where(eq(batchesTable.id, Number(batchId)))
        .limit(1);
      if (batch?.kotaAsal) return String(batch.kotaAsal).trim();
    } catch {
      // ignore fallback
    }
  }
  return "";
}

async function getShippingMinimum(
  serviceType: string | null | undefined,
  deliveryRoute: string | null | undefined,
  batchId?: number | null,
) {
  if (!serviceType) return null;
  const svcLower = String(serviceType).trim().toLowerCase();
  const originCity = await resolveOriginCity(deliveryRoute, batchId);

  try {
    const services = await db.select().from(serviceTypesTable);
    const svc = services.find(
      (s: any) => String(s.name || "").trim().toLowerCase() === svcLower,
    );
    if (svc) {
      const rows = await db
        .select()
        .from(settingsShippingMinimumTable)
        .where(eq(settingsShippingMinimumTable.serviceId, svc.id));

      const matched = originCity
        ? rows.find(
            (r: any) =>
              String(r.originCity || "").trim().toLowerCase() === originCity.toLowerCase(),
          )
        : rows[0];

      if (matched) {
        return {
          enabled: Boolean(matched.enabled),
          minimumAmount: Number(matched.minimumAmount) || 0,
        };
      }
    }
  } catch {
    // Ignore query fallback
  }

  // Default minimum rules ONLY when not configured in database:
  if (svcLower === "jastip pelni") {
    return { enabled: true, minimumAmount: 20000 };
  }
  if (svcLower === "jastip hemat+") {
    return { enabled: true, minimumAmount: 10000 };
  }
  if (svcLower === "jastip pesawat") {
    return { enabled: false, minimumAmount: 15400 };
  }
  if (svcLower === "jastip kargo") {
    return { enabled: false, minimumAmount: 0 };
  }
  return null;
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
  preloadedRates?: BaseRates,
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

  const baseRates = preloadedRates ?? (await getBaseRates());

  // Tiap paket: gunakan max(berat_real, berat_volume) sebagai berat efektif
  const pkgEffectiveWeights = customerPkgs.map((p) => {
    const real = Number(p.realWeight) || 0;
    const vol = Number(p.volumeWeight) || 0;
    return Math.max(real, vol);
  });
  const totalEffectiveWeight = pkgEffectiveWeights.reduce((s, w) => s + w, 0);
  const roundedWeight = roundPesawatGroupWeight(totalEffectiveWeight);
  const normalTotalOngkir = Math.round(roundedWeight * baseRates.pesawatRate);
  const minimum = await getShippingMinimum(
    "jastip pesawat",
    customerPkgs[0].deliveryRoute,
    batchId,
  );
  const totalGroupOngkir = applyShippingMinimum(normalTotalOngkir, minimum);
  const distributedTotals = distributeShippingTotal(
    totalGroupOngkir,
    pkgEffectiveWeights,
  );

  // Distribusi ongkir proporsional ke setiap paket agar sum = totalGroupOngkir
  await Promise.all(
    customerPkgs.map((pkg, index) =>
      db
        .update(packagesTable)
        .set({
          shippingRate: String(baseRates.pesawatRate),
          totalShipping: String(distributedTotals[index]),
          updatedAt: new Date(),
        })
        .where(eq(packagesTable.id, pkg.id)),
    ),
  );
}

// ── Hemat+: hitung ongkir berdasarkan TOTAL BERAT GABUNGAN konsumen dalam satu batch
// Aturan:
//   - 1 paket & total_berat < 1 kg  → berat_digunakan = 1 kg
//   - 1 paket & total_berat >= 1 kg → berat_digunakan = total_berat
//   - >1 paket                       → berat_digunakan = total_berat (TANPA pembulatan per paket)
// Total ongkir = berat_digunakan × tarif Hemat+ (settings.hematRate), didistribusikan proporsional ke tiap paket.
async function recalcHematCustomerOngkir(
  batchId: number,
  customerName: string,
  preloadedRates?: BaseRates,
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

  const baseRates = preloadedRates ?? (await getBaseRates());

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

  const normalTotalOngkir = Math.round(beratDigunakan * baseRates.hematRate);
  const minimum = await getShippingMinimum(
    "jastip hemat+",
    customerPkgs[0].deliveryRoute,
    batchId,
  );
  const totalGroupOngkir = applyShippingMinimum(normalTotalOngkir, minimum);
  const distributedTotals = distributeShippingTotal(
    totalGroupOngkir,
    customerPkgs.map((pkg) => Number(pkg.usedWeight) || 0),
  );

  // Distribusi proporsional ke tiap paket agar sum = totalGroupOngkir
  await Promise.all(
    customerPkgs.map((pkg, index) =>
      db
        .update(packagesTable)
        .set({
          shippingRate: String(baseRates.hematRate),
          totalShipping: String(distributedTotals[index]),
          updatedAt: new Date(),
        })
        .where(eq(packagesTable.id, pkg.id)),
    ),
  );
}

// ── Pelni: tarif per-kg berdasarkan TOTAL BERAT GABUNGAN konsumen dalam satu batch
// (bukan berdasarkan berat per paket)
// Recalculate shippingRate + totalShipping untuk SEMUA paket Pelni milik satu
// konsumen dalam satu batch, berdasarkan total berat gabungan mereka.
async function recalcPelniCustomerOngkir(
  batchId: number,
  customerName: string,
  deliveryRoute?: string | null,
  preloadedRates?: BaseRates,
): Promise<void> {
  if (!batchId || !customerName) return;

  // Resolve deliveryRoute jika kosong
  let effectiveRoute = deliveryRoute;
  if (!effectiveRoute) {
    try {
      const b = await db
        .select()
        .from(batchesTable)
        .where(eq(batchesTable.id, batchId))
        .limit(1);
      if (b[0]?.kotaAsal && b[0]?.tujuan) {
        effectiveRoute = `${b[0].kotaAsal} → ${b[0].tujuan}`;
      } else {
        effectiveRoute = "Jakarta → Manokwari";
      }
    } catch {
      effectiveRoute = "Jakarta → Manokwari";
    }
  }

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
    (s, p) => s + (Number(p.usedWeight) || Number(p.realWeight) || 0),
    0,
  );
  if (totalWeight <= 0 && customerPkgs.length === 0) return;

  const baseRates = preloadedRates ?? (await getBaseRates());

  // Tarif dari tabel bertingkat (settings.pelniTiersJakarta / pelniTiersSurabaya) berdasarkan total berat
  const fallbackFirstRate = String(effectiveRoute).toLowerCase().includes("surabaya")
    ? baseRates.pelniTiersSurabaya[0]?.rate
    : baseRates.pelniTiersJakarta[0]?.rate;
  const rate =
    getPelniRateByTotalWeightFromTiers(totalWeight, effectiveRoute, baseRates) ??
    fallbackFirstRate ??
    baseRates.pelniTiersJakarta[0]?.rate ??
    20000;

  const normalTotals = customerPkgs.map((pkg) =>
    Math.round((Number(pkg.usedWeight) || Number(pkg.realWeight) || 0) * rate),
  );
  const normalTotalOngkir = normalTotals.reduce((sum, amount) => sum + amount, 0);
  const minimum = await getShippingMinimum("jastip pelni", effectiveRoute, batchId);
  const totalGroupOngkir =
    minimum !== null
      ? applyShippingMinimum(normalTotalOngkir, minimum)
      : Math.max(normalTotalOngkir, fallbackFirstRate ?? 20000);
  const distributedTotals = distributeShippingTotal(
    totalGroupOngkir,
    customerPkgs.map((pkg) => Number(pkg.usedWeight) || Number(pkg.realWeight) || 0),
  );

  // Update setiap paket: shippingRate = rate, totalShipping dibagi dari total customer
  await Promise.all(
    customerPkgs.map((pkg, index) => {
      return db
        .update(packagesTable)
        .set({
          shippingRate: String(rate),
          totalShipping: String(distributedTotals[index]),
          updatedAt: new Date(),
        })
        .where(eq(packagesTable.id, pkg.id));
    }),
  );
}

async function applyShippingMinimumToKargoPackages(
  packageIds: number[],
): Promise<void> {
  const validIds = packageIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (validIds.length === 0) return;

  const targetPkgs = await db
    .select()
    .from(packagesTable)
    .where(inArray(packagesTable.id, validIds));

  for (const pkg of targetPkgs) {
    if (String(pkg.serviceType || "").toLowerCase() !== "jastip kargo") continue;
    const minimum = await getShippingMinimum(
      "jastip kargo",
      pkg.deliveryRoute,
      pkg.batchId,
    );
    if (!minimum) continue;

    const currentTotal = Number(pkg.totalShipping);
    const rate = Number(pkg.shippingRate) || 0;
    const used = Number(pkg.usedWeight) || Number(pkg.volumeWeight) || Number(pkg.realWeight) || 0;
    const baseTotal =
      !isNaN(currentTotal) && currentTotal >= 0
        ? Math.round(currentTotal)
        : rate > 0 && used > 0
          ? Math.round(used * rate)
          : 0;
    const finalTotal = applyShippingMinimum(baseTotal, minimum);
    if (finalTotal !== currentTotal) {
      await db
        .update(packagesTable)
        .set({
          totalShipping: String(finalTotal),
          updatedAt: new Date(),
        })
        .where(eq(packagesTable.id, pkg.id));
    }
  }
}

function getShippingRate(
  serviceType: string | null | undefined,
  deliveryRoute: string | null | undefined,
  weight: number | null | undefined,
  baseRates: BaseRates,
): number | null {
  if (!serviceType || !weight || weight <= 0) return null;
  if (serviceType === "jastip pesawat") return baseRates.pesawatRate;
  if (serviceType === "jastip hemat+") return baseRates.hematRate;
  if (serviceType === "jastip kargo") return baseRates.kargoRate;
  // Pelni: gunakan getPelniRateByTotalWeightFromTiers (tarif berdasarkan total berat konsumen)
  // Fungsi ini hanya dipakai sebagai estimasi awal; recalcPelniCustomerOngkir akan
  // menghitung ulang dengan benar setelah semua paket tersimpan.
  if (serviceType === "jastip pelni")
    return getPelniRateByTotalWeightFromTiers(weight, deliveryRoute, baseRates);
  return null;
}

function getTotalShipping(
  serviceType: string | null | undefined,
  deliveryRoute: string | null | undefined,
  weight: number | null | undefined,
  baseRates: BaseRates,
): number | null {
  if (!serviceType || !weight || weight <= 0) return null;

  // Pesawat: estimasi per-paket (server akan recalc berdasarkan total berat gabungan)
  // Aturan pembulatan: ≤0.20→0.20kg | ≤0.40→0.40kg | ≤0.50→0.50kg | >0.50→berat asli
  if (
    serviceType === "jastip pesawat" &&
    deliveryRoute === "Jakarta → Manokwari"
  ) {
    const rounded = roundPesawatGroupWeight(weight);
    return Math.round(rounded * baseRates.pesawatRate);
  }

  if (
    serviceType === "jastip hemat+" &&
    deliveryRoute === "Surabaya → Manokwari"
  ) {
    return Math.round(weight * baseRates.hematRate);
  }

  // Kargo: setiap paket dihitung sendiri — berat/M³ × baseRates.kargoRate
  if (serviceType === "jastip kargo") {
    return Math.round(weight * baseRates.kargoRate);
  }

  if (serviceType === "jastip pelni") {
    const fallbackFirst = String(deliveryRoute || "").toLowerCase().includes("surabaya")
      ? baseRates.pelniTiersSurabaya[0]?.rate
      : baseRates.pelniTiersJakarta[0]?.rate;
    const rate =
      getPelniRateByTotalWeightFromTiers(weight, deliveryRoute, baseRates) ??
      fallbackFirst ??
      20000;
    if (rate) return Math.round(weight * rate);
  }

  return null;
}

let hasAutoRecalcedPelni = false;
async function ensurePelniPackagesMinimum() {
  if (hasAutoRecalcedPelni) return;
  try {
    const allPelni = await db
      .select({
        id: packagesTable.id,
        batchId: packagesTable.batchId,
        customerName: packagesTable.customerName,
        deliveryRoute: packagesTable.deliveryRoute,
        totalShipping: packagesTable.totalShipping,
      })
      .from(packagesTable)
      .where(eq(packagesTable.serviceType, "jastip pelni"));

    const needRecalcGroups = new Map<string, { batchId: number; customerName: string; deliveryRoute: string }>();
    const minCache = new Map<string, { enabled: boolean; minimumAmount: number } | null>();
    for (const p of allPelni) {
      if (!p.batchId || !p.customerName) continue;
      const route = p.deliveryRoute || "Jakarta → Manokwari";
      const cacheKey = `${p.batchId}|${route}`;
      if (!minCache.has(cacheKey)) {
        minCache.set(cacheKey, await getShippingMinimum("jastip pelni", route, p.batchId));
      }
      const minCfg = minCache.get(cacheKey);
      if (minCfg?.enabled && minCfg.minimumAmount > 0 && Number(p.totalShipping || 0) < minCfg.minimumAmount) {
        const key = `${p.batchId}__${p.customerName.trim().toLowerCase()}`;
        if (!needRecalcGroups.has(key)) {
          needRecalcGroups.set(key, {
            batchId: p.batchId,
            customerName: p.customerName.trim(),
            deliveryRoute: route,
          });
        }
      }
    }

    for (const g of needRecalcGroups.values()) {
      await recalcPelniCustomerOngkir(g.batchId, g.customerName, g.deliveryRoute);
    }
    hasAutoRecalcedPelni = true;
  } catch {
    // ignore
  }
}

let hasAutoFixedKargo = false;
async function ensureKargoPackagesNoMinimum() {
  if (hasAutoFixedKargo) return;
  try {
    const allKargo = await db
      .select({
        id: packagesTable.id,
        batchId: packagesTable.batchId,
        deliveryRoute: packagesTable.deliveryRoute,
        serviceType: packagesTable.serviceType,
        totalShipping: packagesTable.totalShipping,
        shippingRate: packagesTable.shippingRate,
        volumeWeight: packagesTable.volumeWeight,
        usedWeight: packagesTable.usedWeight,
        realWeight: packagesTable.realWeight,
        length: packagesTable.length,
        width: packagesTable.width,
        height: packagesTable.height,
      })
      .from(packagesTable)
      .where(eq(packagesTable.serviceType, "jastip kargo"));

    for (const p of allKargo) {
      const minKargo = await getShippingMinimum("jastip kargo", p.deliveryRoute, p.batchId);
      if (minKargo?.enabled && minKargo.minimumAmount > 0) continue;
      const rate = Number(p.shippingRate) || 0;
      if (rate > 0) {
        let vol = Number(p.volumeWeight) || 0;
        if (!vol && p.length && p.width && p.height) {
          vol = (Number(p.length) * Number(p.width) * Number(p.height)) / 1000000;
        }
        const real = Number(p.realWeight) || 0;
        const used = Number(p.usedWeight) || Math.max(real, vol) || vol;
        const correctTotal = Math.round(used * rate);
        if (p.totalShipping === "70000" && correctTotal !== 70000 && correctTotal > 0) {
          await db
            .update(packagesTable)
            .set({
              totalShipping: String(correctTotal),
              volumeWeight: String(vol),
              usedWeight: String(used),
              updatedAt: new Date(),
            })
            .where(eq(packagesTable.id, p.id));
        }
      }
    }
    hasAutoFixedKargo = true;
  } catch {
    // ignore
  }
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
    packageDate: safeIsoStringOrNull(pkg.packageDate),
    pickedUpAt: safeIsoStringOrNull(pkg.pickedUpAt),
    importId: pkg.importId ?? null,
    importedAt: safeIsoStringOrNull(pkg.importedAt),
    inputSource: pkg.inputSource ?? null,
    createdAt: safeIsoString(pkg.createdAt),
    updatedAt: safeIsoString(pkg.updatedAt),
  };
}

// GET /api/packages
router.get(
  "/",
  requireAuth,
  requireRole("admin", "owner", "customer"),
  async (req, res) => {
    try {
      await ensurePelniPackagesMinimum();
      await ensureKargoPackagesNoMinimum();
      const user = (req as any).user;
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

      if (user.role === "customer") {
        conditions.push(
          or(
            eq(packagesTable.customerId, user.id),
            ilike(packagesTable.customerName, `%${user.name}%`),
          ) as any,
        );
      } else if (customerId) {
        conditions.push(eq(packagesTable.customerId, Number(customerId)));
      }

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
              .orderBy(desc(packagesTable.createdAt), desc(packagesTable.id))
          : db
              .select()
              .from(packagesTable)
              .orderBy(desc(packagesTable.createdAt), desc(packagesTable.id)),
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
        additionalFee,
        additionalFeeReason,
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
      const baseRates = await getBaseRates();

      // Kargo: gunakan shippingRate dari user bila diisi; bila kosong pakai baseRates.kargoRate dari settings
      const hasExplicitTotalShipping =
        totalShippingInput !== undefined &&
        totalShippingInput !== null &&
        totalShippingInput !== "";
      const effectiveShippingRate =
        serviceType === "jastip kargo"
          ? shippingRate
            ? Number(shippingRate)
            : hasExplicitTotalShipping
              ? null
              : baseRates.kargoRate
          : (getShippingRate(serviceType, deliveryRoute, usedWeight, baseRates) ??
            (shippingRate ? Number(shippingRate) : null));

      let totalShipping: number | null = null;
      if (hasExplicitTotalShipping) {
        totalShipping = Number(totalShippingInput);
      } else if (
        serviceType === "jastip kargo" &&
        (usedWeight !== null || volumeWeight !== null) &&
        effectiveShippingRate !== null
      ) {
        // Kargo: totalShipping = Berat Kubikasi (atau usedWeight) × Ongkir/M3
        const kargoWeight = usedWeight ?? volumeWeight ?? 0;
        totalShipping = Math.round(kargoWeight * effectiveShippingRate);
      } else {
        totalShipping = getTotalShipping(
          serviceType,
          deliveryRoute,
          usedWeight,
          baseRates,
        );
      }

      const barcode = generateBarcode();
      const insertData: Record<string, any> = {
        barcode,
        resiNumber,
        itemName: itemName || null,
        status: "pending",
        adminId: user.id,
        importId: null,
        importedAt: null,
        inputSource: "manual",
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
        ...(additionalFee !== undefined && additionalFee !== null && additionalFee !== ""
          ? { additionalFee: String(additionalFee) }
          : {}),
        ...(additionalFeeReason ? { additionalFeeReason } : {}),
      };
      const inserted = await db
        .insert(packagesTable)
        .values(insertData as any)
        .returning();

      let pkg = inserted[0];

      // Pesawat: hitung ulang ongkir berdasarkan total berat gabungan konsumen dalam batch
      if (serviceType === "jastip pesawat" && pkg.batchId && pkg.customerName) {
        await recalcPesawatCustomerOngkir(pkg.batchId, pkg.customerName, baseRates);
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
        pkg.customerName
      ) {
        await recalcPelniCustomerOngkir(
          pkg.batchId,
          pkg.customerName,
          pkg.deliveryRoute,
          baseRates,
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
        await recalcHematCustomerOngkir(pkg.batchId, pkg.customerName, baseRates);
        const refreshed = await db
          .select()
          .from(packagesTable)
          .where(eq(packagesTable.id, pkg.id))
          .limit(1);
        if (refreshed[0]) pkg = refreshed[0];
      }

      if (serviceType === "jastip kargo" && pkg.batchId) {
        await applyShippingMinimumToKargoPackages([pkg.id]);
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
      const importNow = new Date();
      const rawFileName =
        typeof req.body?.fileName === "string" && req.body.fileName.trim()
          ? req.body.fileName.trim()
          : null;
      const [importRecord] = await db
        .insert(packageImportsTable)
        .values({
          batchId: Number(batchId),
          fileName: rawFileName,
          packageCount: 0,
          importedBy: user.id,
          createdAt: importNow,
        })
        .returning();

      const baseRates = await getBaseRates();
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
            additionalFee: additionalFeeRow,
            additionalFeeReason: additionalFeeReasonRow,
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

          // Kargo: gunakan ongkir dari data row jika tersedia, atau hitung kubikasi × tarif (row / baseRates.kargoRate)
          const hasExplicitRowTotal =
            totalShippingRow !== undefined &&
            totalShippingRow !== null &&
            totalShippingRow !== "";
          const effectiveRowRate =
            serviceType === "jastip kargo"
              ? shippingRate
                ? Number(shippingRate)
                : hasExplicitRowTotal
                  ? null
                  : baseRates.kargoRate
              : (getShippingRate(serviceType, deliveryRoute, usedWeight, baseRates) ??
                (shippingRate ? Number(shippingRate) : null));

          let totalShipping: number | null;
          if (hasExplicitRowTotal) {
            totalShipping = Number(totalShippingRow);
          } else if (
            serviceType === "jastip kargo" &&
            (usedWeight !== null || volumeWeight !== null) &&
            effectiveRowRate !== null
          ) {
            const kargoWeight = usedWeight ?? volumeWeight ?? 0;
            totalShipping = Math.round(kargoWeight * effectiveRowRate);
          } else {
            totalShipping = getTotalShipping(
              serviceType,
              deliveryRoute,
              usedWeight,
              baseRates,
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
              shippingRate:
                effectiveRowRate !== null ? String(effectiveRowRate) : null,
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
              importId: importRecord?.id ?? null,
              importedAt: importNow,
              inputSource: "import",
              additionalFee: additionalFeeRow !== undefined && additionalFeeRow !== null && additionalFeeRow !== ""
                ? String(additionalFeeRow)
                : "0",
              additionalFeeReason: additionalFeeReasonRow ? String(additionalFeeReasonRow) : null,
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
          await recalcPesawatCustomerOngkir(Number(batchId), customerName, baseRates);
        }
      }

      // Pelni: setelah semua paket diinsert, hitung ulang ongkir per konsumen
      // berdasarkan total berat gabungan mereka dalam batch ini
      const pelniRows = (rows as any[]).filter(
        (r: any) => r.serviceType === "jastip pelni",
      );
      if (pelniRows.length > 0) {
        const defaultBatchRoute =
          batches[0]?.kotaAsal && batches[0]?.tujuan
            ? `${batches[0].kotaAsal} → ${batches[0].tujuan}`
            : "Jakarta → Manokwari";
        const pelniGroups = new Map<
          string,
          { customerName: string; deliveryRoute: string }
        >();
        for (const r of pelniRows) {
          if (!r.customerName) continue;
          const effRoute = r.deliveryRoute ? String(r.deliveryRoute) : defaultBatchRoute;
          const key = `${(r.customerName as string).trim().toLowerCase()}|${effRoute}`;
          if (!pelniGroups.has(key)) {
            pelniGroups.set(key, {
              customerName: String(r.customerName),
              deliveryRoute: effRoute,
            });
          }
        }
        for (const { customerName, deliveryRoute } of pelniGroups.values()) {
          await recalcPelniCustomerOngkir(
            Number(batchId),
            customerName,
            deliveryRoute,
            baseRates,
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
          await recalcHematCustomerOngkir(Number(batchId), customerName, baseRates);
        }
      }

      if (createdIds.length > 0) {
        await applyShippingMinimumToKargoPackages(createdIds);
      }

      if (importRecord?.id) {
        if (createdIds.length > 0) {
          await db
            .update(packageImportsTable)
            .set({ packageCount: createdIds.length })
            .where(eq(packageImportsTable.id, importRecord.id));
        } else {
          await db
            .delete(packageImportsTable)
            .where(eq(packageImportsTable.id, importRecord.id));
        }
      }

      res.json({
        success,
        failed,
        total: rows.length,
        errors,
        ids: createdIds,
        importId: createdIds.length > 0 ? (importRecord?.id ?? null) : null,
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
  requireRole("admin", "owner", "customer"),
  async (req, res) => {
    try {
      const user = (req as any).user;
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

        if (user.role === "customer") {
          const userHasPkg = groupPkgs.some(
            (p) =>
              p.customerId === user.id ||
              (p.customerPhone && p.customerPhone === user.phone) ||
              (p.customerName &&
                p.customerName.trim().toLowerCase() ===
                  user.name.trim().toLowerCase()),
          );
          if (!userHasPkg) {
            res.json({ valid: false, message: "Bukan barcode dari paket kamu" });
            return;
          }
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
        const candidates = all.filter(
          (p) => p.packageNumber === barcode || String(p.id) === barcode
        );
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

      if (user.role === "customer") {
        const isOwner =
          pkg.customerId === user.id ||
          (pkg.customerPhone && pkg.customerPhone === user.phone) ||
          (pkg.customerName &&
            pkg.customerName.trim().toLowerCase() ===
              user.name.trim().toLowerCase());
        if (!isOwner) {
          res.json({ valid: false, message: "Bukan barcode dari paket kamu" });
          return;
        }
      }

      if (
        pkg.statusPengambilan === "SUDAH_DIAMBIL" ||
        pkg.status === "diserahkan"
      ) {
        res.json({
          valid: false,
          message: "Paket sudah diambil sebelumnya",
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

// POST /api/packages/:id/customer-pickup
router.post(
  "/:id/customer-pickup",
  requireAuth,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const user = (req as any).user;
      const pkgs = await db
        .select()
        .from(packagesTable)
        .where(eq(packagesTable.id, id))
        .limit(1);
      const pkg = pkgs[0];
      if (!pkg) {
        res.status(404).json({ error: "Paket tidak ditemukan" });
        return;
      }

      if (user.role === "customer") {
        const isOwner =
          pkg.customerId === user.id ||
          (pkg.customerPhone && pkg.customerPhone === user.phone) ||
          (pkg.customerName &&
            pkg.customerName.trim().toLowerCase() ===
              user.name.trim().toLowerCase());
        if (!isOwner) {
          res.status(403).json({ error: "Paket ini bukan milik Anda" });
          return;
        }
      }

      if (
        pkg.statusPengambilan === "SUDAH_DIAMBIL" ||
        pkg.status === "diserahkan"
      ) {
        res.status(400).json({ error: "Paket sudah diambil sebelumnya" });
        return;
      }

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

      const refreshed = updated[0] || pkg;
      res.json({
        success: true,
        message: "Paket berhasil diambil",
        package: formatPackage(refreshed, new Map(), new Map()),
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

type ImportLockReason = "manual" | "verified" | "pickedUp" | "inTransaction" | "inInvoice";

async function collectLockedPackageSets(executor: any) {
  const allTxs = await executor.select().from(transactionsTable);
  const txPkgIds = new Set<number>();
  for (const tx of allTxs) {
    if (String(tx.transactionStatus || "").toUpperCase() === "VOID") continue;
    const ids = Array.isArray(tx.packageIds) ? tx.packageIds : [];
    for (const pid of ids) {
      const n = Number(pid);
      if (Number.isInteger(n) && n > 0) txPkgIds.add(n);
    }
  }

  const allInvItems = await executor.select().from(invoiceItemsTable);
  const invPkgIds = new Set<number>();
  for (const item of allInvItems) {
    const pid = Number(item.packageId);
    if (Number.isInteger(pid) && pid > 0) invPkgIds.add(pid);
  }

  return { txPkgIds, invPkgIds };
}

function getPackageImportDeleteLock(
  pkg: any,
  txPkgIds: Set<number>,
  invPkgIds: Set<number>,
): { deletable: boolean; reason?: ImportLockReason } {
  if (pkg.inputSource === "manual") {
    return { deletable: false, reason: "manual" };
  }
  if (
    pkg.statusVerifikasi === "SUDAH_DIVERIFIKASI" ||
    pkg.verified === "sudah_diverifikasi"
  ) {
    return { deletable: false, reason: "verified" };
  }
  if (
    pkg.statusPengambilan === "SUDAH_DIAMBIL" ||
    pkg.status === "diserahkan"
  ) {
    return { deletable: false, reason: "pickedUp" };
  }
  if (txPkgIds.has(Number(pkg.id))) {
    return { deletable: false, reason: "inTransaction" };
  }
  if (invPkgIds.has(Number(pkg.id))) {
    return { deletable: false, reason: "inInvoice" };
  }
  return { deletable: true };
}

async function recalcAffectedGroupsAfterImportDelete(
  batchId: number,
  deletedPackages: any[],
) {
  const remaining = await db
    .select()
    .from(packagesTable)
    .where(eq(packagesTable.batchId, batchId));

  const touchedKeys = new Set<string>();
  const remainingByGroup = new Map<string, { serviceType: string; customerName: string; deliveryRoute?: string | null }>();

  for (const p of deletedPackages) {
    const svc = String(p.serviceType || "").toLowerCase();
    const cname = String(p.customerName || "").trim().toLowerCase();
    if (!svc || !cname) continue;
    touchedKeys.add(`${svc}|${cname}`);
  }

  for (const p of remaining) {
    const svc = String(p.serviceType || "").toLowerCase();
    const cname = String(p.customerName || "").trim().toLowerCase();
    const key = `${svc}|${cname}`;
    if (touchedKeys.has(key) && !remainingByGroup.has(key)) {
      remainingByGroup.set(key, {
        serviceType: svc,
        customerName: p.customerName,
        deliveryRoute: p.deliveryRoute,
      });
    }
  }

  for (const g of remainingByGroup.values()) {
    if (g.serviceType === "jastip pelni") {
      await recalcPelniCustomerOngkir(batchId, g.customerName, g.deliveryRoute);
    } else if (g.serviceType === "jastip pesawat") {
      await recalcPesawatCustomerOngkir(batchId, g.customerName);
    } else if (g.serviceType === "jastip hemat+") {
      await recalcHematCustomerOngkir(batchId, g.customerName);
    }
  }
}

async function executeSafeImportDelete(
  executor: any,
  batchId: number,
  candidates: any[],
) {
  const { txPkgIds, invPkgIds } = await collectLockedPackageSets(executor);

  const deletablePkgs: any[] = [];
  const skippedReasons: Record<ImportLockReason, number> = {
    manual: 0,
    verified: 0,
    pickedUp: 0,
    inTransaction: 0,
    inInvoice: 0,
  };
  const skippedDetails: Array<{ id: number; resiNumber: string; customerName: string; reason: ImportLockReason }> = [];

  for (const pkg of candidates) {
    const lock = getPackageImportDeleteLock(pkg, txPkgIds, invPkgIds);
    if (lock.deletable) {
      deletablePkgs.push(pkg);
    } else if (lock.reason) {
      skippedReasons[lock.reason] += 1;
      skippedDetails.push({
        id: pkg.id,
        resiNumber: pkg.resiNumber,
        customerName: pkg.customerName,
        reason: lock.reason,
      });
    }
  }

  const deletableIds = deletablePkgs.map((p) => Number(p.id));
  if (deletableIds.length > 0) {
    if ((db as any)._isMock) {
      for (const delId of deletableIds) {
        await executor.delete(packagesTable).where(eq(packagesTable.id, delId));
      }
    } else {
      await executor
        .delete(packagesTable)
        .where(inArray(packagesTable.id, deletableIds));
    }
  }

  // Clean up empty package_imports rows in this batch
  const importBatches = await executor
    .select()
    .from(packageImportsTable)
    .where(eq(packageImportsTable.batchId, batchId));
  const batchPackagesAfter = await executor
    .select({ id: packagesTable.id, importId: packagesTable.importId })
    .from(packagesTable)
    .where(eq(packagesTable.batchId, batchId));

  for (const imp of importBatches) {
    const remainingCount = batchPackagesAfter.filter(
      (p: any) => Number(p.importId) === Number(imp.id),
    ).length;
    if (remainingCount === 0) {
      await executor
        .delete(packageImportsTable)
        .where(eq(packageImportsTable.id, imp.id));
    }
  }

  return {
    deletedCount: deletableIds.length,
    skippedCount: skippedDetails.length,
    skippedReasons,
    skippedDetails: skippedDetails.slice(0, 50),
    deletedPackages: deletablePkgs,
  };
}

// GET /api/packages/imports?batchId=... — List import sessions in a batch (Owner only)
router.get(
  "/imports",
  requireAuth,
  requireRole("owner"),
  async (req, res) => {
    try {
      const batchId = Number(req.query.batchId);
      if (!Number.isInteger(batchId) || batchId <= 0) {
        res.status(400).json({ error: "batchId wajib diisi dan valid" });
        return;
      }

      const [batch] = await db
        .select()
        .from(batchesTable)
        .where(eq(batchesTable.id, batchId))
        .limit(1);
      if (!batch) {
        res.status(404).json({ error: "Batch tidak ditemukan" });
        return;
      }

      const imports = await db
        .select()
        .from(packageImportsTable)
        .where(eq(packageImportsTable.batchId, batchId))
        .orderBy(desc(packageImportsTable.createdAt));

      const batchPkgs = await db
        .select()
        .from(packagesTable)
        .where(eq(packagesTable.batchId, batchId));

      const users = await db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable);
      const userMap = new Map(users.map((u: any) => [u.id, u.name]));

      const { txPkgIds, invPkgIds } = await collectLockedPackageSets(db);

      const formattedImports = imports
        .map((imp: any) => {
          const linkedPkgs = batchPkgs.filter(
            (p: any) => Number(p.importId) === Number(imp.id),
          );
          let deletableCount = 0;
          let lockedCount = 0;
          for (const p of linkedPkgs) {
            const lock = getPackageImportDeleteLock(p, txPkgIds, invPkgIds);
            if (lock.deletable) deletableCount++;
            else lockedCount++;
          }
          return {
            importId: imp.id,
            batchId: imp.batchId,
            fileName: imp.fileName || "Import Excel",
            packageCount: imp.packageCount ?? linkedPkgs.length,
            currentPackageCount: linkedPkgs.length,
            deletableCount,
            lockedCount,
            importedBy: imp.importedBy ?? null,
            importedByName: imp.importedBy
              ? (userMap.get(imp.importedBy) ?? `User #${imp.importedBy}`)
              : null,
            createdAt: safeIsoString(imp.createdAt),
          };
        })
        .sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

      const trackedPkgs = batchPkgs.filter(
        (p: any) => p.importId != null || p.inputSource === "import",
      );
      const legacyUnlinkedPkgs = batchPkgs.filter(
        (p: any) => p.importId == null && (p.inputSource == null || p.inputSource === ""),
      );
      const manualPkgs = batchPkgs.filter(
        (p: any) => p.inputSource === "manual",
      );

      let deletableTrackedCount = 0;
      for (const p of trackedPkgs) {
        if (getPackageImportDeleteLock(p, txPkgIds, invPkgIds).deletable) {
          deletableTrackedCount++;
        }
      }

      let deletableLegacyCount = 0;
      for (const p of legacyUnlinkedPkgs) {
        if (getPackageImportDeleteLock(p, txPkgIds, invPkgIds).deletable) {
          deletableLegacyCount++;
        }
      }

      res.json({
        batchId,
        statusBatch: batch.statusBatch,
        imports: formattedImports,
        trackedPackageCount: trackedPkgs.length,
        deletableTrackedCount,
        legacyUnlinkedCount: legacyUnlinkedPkgs.length,
        deletableLegacyCount,
        manualCount: manualPkgs.length,
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Gagal memuat daftar data impor" });
    }
  },
);

// DELETE /api/packages/imports/batch/:batchId — Delete all imported packages in a batch (Owner only)
router.delete(
  "/imports/batch/:batchId",
  requireAuth,
  requireRole("owner"),
  async (req, res) => {
    try {
      const batchId = Number(req.params.batchId);
      if (!Number.isInteger(batchId) || batchId <= 0) {
        res.status(400).json({ error: "batchId tidak valid" });
        return;
      }

      const includeLegacy =
        req.query.includeLegacy === "true" || req.body?.includeLegacy === true;

      const [batch] = await db
        .select()
        .from(batchesTable)
        .where(eq(batchesTable.id, batchId))
        .limit(1);
      if (!batch) {
        res.status(404).json({ error: "Batch tidak ditemukan" });
        return;
      }
      if (batch.statusBatch === "ARSIP") {
        res.status(400).json({
          error: "Batch sudah diarsipkan sehingga data paket tidak dapat dihapus.",
        });
        return;
      }

      const result = await db.transaction(async (tx) => {
        const batchPkgs = await tx
          .select()
          .from(packagesTable)
          .where(eq(packagesTable.batchId, batchId));

        const candidates = batchPkgs.filter((p: any) => {
          if (p.inputSource === "manual") return false;
          const isTrackedImport = p.importId != null || p.inputSource === "import";
          const isLegacyUnlinked = p.importId == null && (p.inputSource == null || p.inputSource === "");
          return isTrackedImport || (includeLegacy && isLegacyUnlinked);
        });

        return executeSafeImportDelete(tx, batchId, candidates);
      });

      if (result.deletedPackages.length > 0) {
        await recalcAffectedGroupsAfterImportDelete(batchId, result.deletedPackages);
      }

      res.json({
        success: true,
        batchId,
        includeLegacy,
        deletedCount: result.deletedCount,
        skippedCount: result.skippedCount,
        skippedReasons: result.skippedReasons,
        skippedDetails: result.skippedDetails,
        message:
          result.deletedCount > 0
            ? `${result.deletedCount} paket hasil impor berhasil dihapus.${result.skippedCount > 0 ? ` ${result.skippedCount} paket dilewati karena terkunci.` : ""}`
            : result.skippedCount > 0
              ? `Tidak ada paket yang dihapus (${result.skippedCount} paket terkunci / input manual).`
              : "Tidak ada paket hasil impor yang dapat dihapus pada batch ini.",
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Gagal menghapus data impor batch" });
    }
  },
);

// DELETE /api/packages/imports/:importId — Delete packages from a specific import batch (Owner only)
router.delete(
  "/imports/:importId",
  requireAuth,
  requireRole("owner"),
  async (req, res) => {
    try {
      const importId = Number(req.params.importId);
      if (!Number.isInteger(importId) || importId <= 0) {
        res.status(400).json({ error: "importId tidak valid" });
        return;
      }

      const [imp] = await db
        .select()
        .from(packageImportsTable)
        .where(eq(packageImportsTable.id, importId))
        .limit(1);
      if (!imp) {
        res.status(404).json({ error: "Data sesi impor tidak ditemukan" });
        return;
      }

      const [batch] = await db
        .select()
        .from(batchesTable)
        .where(eq(batchesTable.id, imp.batchId))
        .limit(1);
      if (batch?.statusBatch === "ARSIP") {
        res.status(400).json({
          error: "Batch sudah diarsipkan sehingga data paket tidak dapat dihapus.",
        });
        return;
      }

      const result = await db.transaction(async (tx) => {
        const candidates = await tx
          .select()
          .from(packagesTable)
          .where(eq(packagesTable.importId, importId));

        return executeSafeImportDelete(tx, imp.batchId, candidates);
      });

      if (result.deletedPackages.length > 0) {
        await recalcAffectedGroupsAfterImportDelete(imp.batchId, result.deletedPackages);
      }

      res.json({
        success: true,
        importId,
        batchId: imp.batchId,
        deletedCount: result.deletedCount,
        skippedCount: result.skippedCount,
        skippedReasons: result.skippedReasons,
        skippedDetails: result.skippedDetails,
        message:
          result.deletedCount > 0
            ? `${result.deletedCount} paket dari impor "${imp.fileName || `#${importId}`}" berhasil dihapus.${result.skippedCount > 0 ? ` ${result.skippedCount} paket dilewati karena terkunci.` : ""}`
            : result.skippedCount > 0
              ? `Tidak ada paket yang dihapus (${result.skippedCount} paket terkunci).`
              : "Tidak ada paket yang tersisa dari sesi impor ini.",
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Gagal menghapus data sesi impor" });
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
        additionalFee,
        additionalFeeReason,
      } = req.body;

      const updateData: any = { updatedAt: new Date() };

      if (additionalFee !== undefined) {
        updateData.additionalFee = additionalFee !== null && additionalFee !== "" ? String(additionalFee) : "0";
      }
      if (additionalFeeReason !== undefined) {
        updateData.additionalFeeReason = additionalFeeReason || null;
      }

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
      const hasShippingRate = shippingRate !== undefined;

      const baseRates =
        hasPhysical || hasService || hasShippingRate ? await getBaseRates() : undefined;

      if (hasPhysical || hasService || hasShippingRate) {
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
        const effectiveRates = baseRates!;

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

        const isChangingToKargo =
          serviceType !== undefined &&
          String(serviceType || "").toLowerCase() === "jastip kargo" &&
          String(e.serviceType || "").toLowerCase() !== "jastip kargo";

        // Kargo: gunakan shippingRate dari body, atau rate lama paket, atau baseRates.kargoRate
        const rate =
          effService === "jastip kargo"
            ? shippingRate !== undefined
              ? shippingRate
                ? Number(shippingRate)
                : effectiveRates.kargoRate
              : isChangingToKargo
                ? effectiveRates.kargoRate
                : (toNum(e.shippingRate) ?? effectiveRates.kargoRate)
            : getShippingRate(effService, effRoute, uw ?? undefined, effectiveRates);
        updateData.shippingRate = rate != null ? String(rate) : null;

        if (effService !== "jastip kargo") {
          const total = getTotalShipping(
            effService,
            effRoute,
            uw ?? undefined,
            effectiveRates,
          );
          if (total != null) updateData.totalShipping = String(total);
        } else if (
          totalShippingInput === undefined ||
          totalShippingInput === null ||
          totalShippingInput === ""
        ) {
          // Kargo: recalculate totalShipping = (usedWeight || volumeWeight) × shippingRate
          const kargoWeight = uw ?? vw;
          if (kargoWeight != null && rate != null) {
            updateData.totalShipping = String(Math.round(kargoWeight * rate));
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
        await recalcPesawatCustomerOngkir(pkg.batchId, pkg.customerName, baseRates);
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
        pkg.customerName
      ) {
        await recalcPelniCustomerOngkir(
          pkg.batchId,
          pkg.customerName,
          pkg.deliveryRoute,
          baseRates,
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
        await recalcHematCustomerOngkir(pkg.batchId, pkg.customerName, baseRates);
        const refreshed = await db
          .select()
          .from(packagesTable)
          .where(eq(packagesTable.id, pkg.id))
          .limit(1);
        if (refreshed[0]) pkg = refreshed[0];
      }

      if (
        pkg.serviceType === "jastip kargo" &&
        (totalShippingInput === undefined || totalShippingInput === null || totalShippingInput === "")
      ) {
        await applyShippingMinimumToKargoPackages([pkg.id]);
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

// POST /api/packages/verify-all — mark multiple packages as verified simultaneously (Owner only)
router.post(
  "/verify-all",
  requireAuth,
  requireRole("owner"),
  async (req, res) => {
    try {
      const { batchId, packageIds, serviceType } = req.body;
      const now = new Date();
      let updatedCount = 0;

      if (Array.isArray(packageIds) && packageIds.length > 0) {
        const ids = packageIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
        if (ids.length > 0) {
          const updated = await db
            .update(packagesTable)
            .set({
              verified: "sudah_diverifikasi",
              verifiedAt: now,
              statusVerifikasi: "SUDAH_DIVERIFIKASI",
              updatedAt: now,
            })
            .where(inArray(packagesTable.id, ids))
            .returning({ id: packagesTable.id });

          if (updated.length === 0 && (db as any)._isMock) {
            for (const id of ids) {
              await db
                .update(packagesTable)
                .set({
                  verified: "sudah_diverifikasi",
                  verifiedAt: now,
                  statusVerifikasi: "SUDAH_DIVERIFIKASI",
                  updatedAt: now,
                })
                .where(eq(packagesTable.id, id));
            }
            updatedCount = ids.length;
          } else {
            updatedCount = updated.length;
          }
        }
      } else if (batchId !== undefined) {
        const conditions: any[] = [];
        if (batchId === null || batchId === "no-batch") {
          conditions.push(isNull(packagesTable.batchId));
        } else {
          conditions.push(eq(packagesTable.batchId, Number(batchId)));
        }
        if (serviceType && serviceType !== "all") {
          conditions.push(eq(packagesTable.serviceType, serviceType));
        }

        const updated = await db
          .update(packagesTable)
          .set({
            verified: "sudah_diverifikasi",
            verifiedAt: now,
            statusVerifikasi: "SUDAH_DIVERIFIKASI",
            updatedAt: now,
          })
          .where(and(...conditions))
          .returning({ id: packagesTable.id });

        if (updated.length === 0 && (db as any)._isMock) {
          const all = await db.select().from(packagesTable);
          const target = all.filter((p: any) => {
            const matchBatch = (batchId === null || batchId === "no-batch") ? p.batchId == null : p.batchId === Number(batchId);
            const matchSvc = (!serviceType || serviceType === "all") ? true : (p.serviceType || "").toLowerCase() === serviceType.toLowerCase();
            return matchBatch && matchSvc;
          });
          for (const item of target) {
            await db
              .update(packagesTable)
              .set({
                verified: "sudah_diverifikasi",
                verifiedAt: now,
                statusVerifikasi: "SUDAH_DIVERIFIKASI",
                updatedAt: now,
              })
              .where(eq(packagesTable.id, item.id));
          }
          updatedCount = target.length;
        } else {
          updatedCount = updated.length;
        }
      } else {
        res.status(400).json({ error: "batchId atau packageIds wajib diisi" });
        return;
      }

      res.json({
        success: true,
        count: updatedCount,
        message: `${updatedCount} paket berhasil diverifikasi`,
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Gagal memverifikasi paket" });
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

// POST /api/packages/recalculate-batch — Recalculate packages in a specific batch (or all batches), Owner only
router.post(
  "/recalculate-batch",
  requireAuth,
  requireRole("owner"),
  async (req, res) => {
    try {
      const { batchId, serviceType, defaultKargoRate } = req.body || {};
      const hasSpecificBatch =
        batchId !== undefined && batchId !== null && batchId !== "" && batchId !== "all";
      const numBatchId = hasSpecificBatch ? Number(batchId) : null;
      if (hasSpecificBatch && (!Number.isInteger(numBatchId) || (numBatchId ?? 0) <= 0)) {
        res.status(400).json({ error: "batchId tidak valid" });
        return;
      }

      const targetService = serviceType && serviceType !== "all"
        ? String(serviceType).toLowerCase().trim()
        : null;

      const batchPkgs = numBatchId !== null
        ? await db
            .select()
            .from(packagesTable)
            .where(eq(packagesTable.batchId, numBatchId))
        : await db.select().from(packagesTable);

      const scopedPkgs = targetService
        ? batchPkgs.filter((p) => (p.serviceType || "").toLowerCase() === targetService)
        : batchPkgs;

      const baseRates = await getBaseRates();
      let updatedCount = 0;

      // 1. Kargo packages: MAX(M³, Ton) × rate + optional minimum from settings
      const kargoPkgs = scopedPkgs.filter(
        (p) => (p.serviceType || "").toLowerCase() === "jastip kargo",
      );
      for (const p of kargoPkgs) {
        let vol = Number(p.volumeWeight) || 0;
        const l = Number(p.length) || 0;
        const w = Number(p.width) || 0;
        const h = Number(p.height) || 0;
        if ((!vol || vol <= 0) && l > 0 && w > 0 && h > 0) {
          vol = (l * w * h) / 1000000;
        }
        const rw = Number(p.realWeight) || 0;
        const usedWeight = Math.max(rw, vol) || vol || rw || 0.01;
        const rate = Number(defaultKargoRate) || baseRates.kargoRate;
        const baseTotal = Math.round(usedWeight * rate);
        const minKargo = await getShippingMinimum("jastip kargo", p.deliveryRoute, p.batchId);
        const calculatedTotal = applyShippingMinimum(baseTotal, minKargo);

        await db
          .update(packagesTable)
          .set({
            volumeWeight: String(vol > 0 ? vol : usedWeight),
            usedWeight: String(usedWeight),
            shippingRate: String(rate),
            totalShipping: String(calculatedTotal),
            updatedAt: new Date(),
          })
          .where(eq(packagesTable.id, p.id));
        updatedCount++;
      }

      // 2. Pelni packages: group per batchId + customerName
      const pelniPkgs = scopedPkgs.filter(
        (p) => (p.serviceType || "").toLowerCase() === "jastip pelni",
      );
      const pelniGroups = new Map<string, { batchId: number; customerName: string; deliveryRoute?: string | null }>();
      for (const p of pelniPkgs) {
        if (!p.batchId || !p.customerName) continue;
        const key = `${p.batchId}|${p.customerName.trim().toLowerCase()}`;
        if (!pelniGroups.has(key)) {
          pelniGroups.set(key, {
            batchId: p.batchId,
            customerName: p.customerName,
            deliveryRoute: p.deliveryRoute,
          });
        }
      }
      for (const g of pelniGroups.values()) {
        await recalcPelniCustomerOngkir(g.batchId, g.customerName, g.deliveryRoute, baseRates);
      }
      updatedCount += pelniPkgs.filter((p) => p.batchId && p.customerName).length;

      // 3. Pesawat packages: group per batchId + customerName
      const pesawatPkgs = scopedPkgs.filter(
        (p) => (p.serviceType || "").toLowerCase() === "jastip pesawat",
      );
      const pesawatGroups = new Map<string, { batchId: number; customerName: string }>();
      for (const p of pesawatPkgs) {
        if (!p.batchId || !p.customerName) continue;
        const key = `${p.batchId}|${p.customerName.trim().toLowerCase()}`;
        if (!pesawatGroups.has(key)) {
          pesawatGroups.set(key, { batchId: p.batchId, customerName: p.customerName });
        }
      }
      for (const g of pesawatGroups.values()) {
        await recalcPesawatCustomerOngkir(g.batchId, g.customerName, baseRates);
      }
      updatedCount += pesawatPkgs.filter((p) => p.batchId && p.customerName).length;

      // 4. Hemat+ packages: group per batchId + customerName
      const hematPkgs = scopedPkgs.filter(
        (p) => (p.serviceType || "").toLowerCase() === "jastip hemat+",
      );
      const hematGroups = new Map<string, { batchId: number; customerName: string }>();
      for (const p of hematPkgs) {
        if (!p.batchId || !p.customerName) continue;
        const key = `${p.batchId}|${p.customerName.trim().toLowerCase()}`;
        if (!hematGroups.has(key)) {
          hematGroups.set(key, { batchId: p.batchId, customerName: p.customerName });
        }
      }
      for (const g of hematGroups.values()) {
        await recalcHematCustomerOngkir(g.batchId, g.customerName, baseRates);
      }
      updatedCount += hematPkgs.filter((p) => p.batchId && p.customerName).length;

      res.json({
        success: true,
        batchId: numBatchId,
        serviceType: targetService || "all",
        updatedCount,
        message:
          numBatchId !== null
            ? `Berhasil menghitung ulang ${updatedCount} paket pada Batch #${numBatchId}.`
            : `Berhasil menghitung ulang ${updatedCount} paket di semua batch.`,
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Gagal menghitung ulang ongkir batch" });
    }
  },
);

// POST /api/packages/recalculate-kargo — Bulk recalculate Kargo packages, Owner only
router.post(
  "/recalculate-kargo",
  requireAuth,
  requireRole("owner"),
  async (req, res) => {
    try {
      const { batchId, defaultRate } = req.body || {};
      const baseRates = await getBaseRates();

      const allKargo = await db
        .select()
        .from(packagesTable)
        .where(eq(packagesTable.serviceType, "jastip kargo"));

      const targetPkgs = batchId && batchId !== "all"
        ? allKargo.filter((p) => p.batchId === Number(batchId))
        : allKargo;
      let updatedCount = 0;

      for (const p of targetPkgs) {
        let vol = Number(p.volumeWeight) || 0;
        const l = Number(p.length) || 0;
        const w = Number(p.width) || 0;
        const h = Number(p.height) || 0;
        if ((!vol || vol <= 0) && l > 0 && w > 0 && h > 0) {
          vol = (l * w * h) / 1000000;
        }
        const rw = Number(p.realWeight) || 0;
        const usedWeight = Math.max(rw, vol) || vol || rw || 0.01;

        // Rate priority: body defaultRate -> baseRates.kargoRate (dari settings)
        const rate = Number(defaultRate) || baseRates.kargoRate;
        const baseTotal = Math.round(usedWeight * rate);
        const minKargo = await getShippingMinimum("jastip kargo", p.deliveryRoute, p.batchId);
        const calculatedTotal = applyShippingMinimum(baseTotal, minKargo);

        await db
          .update(packagesTable)
          .set({
            volumeWeight: String(vol > 0 ? vol : usedWeight),
            usedWeight: String(usedWeight),
            shippingRate: String(rate),
            totalShipping: String(calculatedTotal),
            updatedAt: new Date(),
          })
          .where(eq(packagesTable.id, p.id));
        updatedCount++;
      }

      res.json({
        success: true,
        updatedCount,
        message: batchId && batchId !== "all"
          ? `Berhasil menghitung ulang ${updatedCount} paket Kargo pada Batch #${batchId}.`
          : `Berhasil menghitung ulang ${updatedCount} paket Jastip Kargo.`,
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Gagal menghitung ulang ongkir kargo" });
    }
  },
);

export default router;
