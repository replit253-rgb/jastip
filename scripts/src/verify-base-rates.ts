import assert from "node:assert/strict";
import http from "node:http";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  batchesTable,
  packagesTable,
  settingsTable,
  packageImportsTable,
  tarifHistoryTable,
} from "@workspace/db";
import app from "../../artifacts/api-server/src/app";
import {
  DEFAULT_BASE_RATES,
  getBaseRates,
  getPelniRateByTotalWeightFromTiers,
} from "../../artifacts/api-server/src/lib/base-rates";

async function reqJson(
  baseUrl: string,
  method: string,
  path: string,
  token?: string,
  body?: any,
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, data: json };
}

async function run() {
  const isMock = Boolean((db as any)._isMock);
  console.log(`\n=== Verifikasi Tarif Dasar Dinamis (${isMock ? "Mock DB" : "PostgreSQL"}) ===`);

  // Snapshot settings awal untuk restore di blok finally
  const originalSettings = await db.select().from(settingsTable);
  const createdBatchIds: number[] = [];
  const createdPackageIds: number[] = [];
  const createdImportIds: number[] = [];

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  try {
    // ── 1. Uji fallback getBaseRates() saat tabel settings kosong ─────────────
    console.log("1. Uji fallback getBaseRates() saat key tarif belum ada di database...");
    const rateKeys = [
      "pesawatRate",
      "hematRate",
      "kargoRate",
      "pelniTiersJakarta",
      "pelniTiersSurabaya",
    ];
    for (const k of rateKeys) {
      await db.delete(settingsTable).where(eq(settingsTable.key, k));
    }
    const fallbackRates = await getBaseRates();
    assert.equal(fallbackRates.pesawatRate, 77000);
    assert.equal(fallbackRates.hematRate, 10000);
    assert.equal(fallbackRates.kargoRate, 1900000);
    assert.deepEqual(fallbackRates.pelniTiersJakarta, DEFAULT_BASE_RATES.pelniTiersJakarta);
    assert.deepEqual(fallbackRates.pelniTiersSurabaya, DEFAULT_BASE_RATES.pelniTiersSurabaya);

    // Uji helper tier lookup dengan default fallback
    assert.equal(getPelniRateByTotalWeightFromTiers(5, "Jakarta → Manokwari", fallbackRates), 20000);
    assert.equal(getPelniRateByTotalWeightFromTiers(15, "Jakarta → Manokwari", fallbackRates), 19000);
    assert.equal(getPelniRateByTotalWeightFromTiers(30, "Jakarta → Manokwari", fallbackRates), 18000);
    assert.equal(getPelniRateByTotalWeightFromTiers(50, "Jakarta → Manokwari", fallbackRates), 17000);
    assert.equal(getPelniRateByTotalWeightFromTiers(100, "Jakarta → Manokwari", fallbackRates), 16000);
    assert.equal(getPelniRateByTotalWeightFromTiers(5, "Surabaya → Manokwari", fallbackRates), 18000);
    assert.equal(getPelniRateByTotalWeightFromTiers(15, "Surabaya → Manokwari", fallbackRates), 17000);
    assert.equal(getPelniRateByTotalWeightFromTiers(30, "Surabaya → Manokwari", fallbackRates), 16000);
    assert.equal(getPelniRateByTotalWeightFromTiers(50, "Surabaya → Manokwari", fallbackRates), 15500);
    console.log("   ✓ Fallback default identik dengan konstanta sebelumnya.");

    // Restore settings asli sebelum uji API default
    for (const row of originalSettings) {
      await db
        .insert(settingsTable)
        .values({ key: row.key, value: row.value })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value: row.value, updatedAt: new Date() },
        });
    }

    // ── 2. Login Owner & Admin + buat batch pengujian ─────────────────────────
    const ownerLogin = await reqJson(baseUrl, "POST", "/auth/login", undefined, {
      phone: "081200000000",
      password: "owner123",
    });
    assert.equal(ownerLogin.status, 200, `Owner login gagal: ${JSON.stringify(ownerLogin.data)}`);
    const ownerToken = ownerLogin.data.token as string;

    const adminLogin = await reqJson(baseUrl, "POST", "/auth/login", undefined, {
      phone: "081200000001",
      password: "admin123",
    });
    assert.equal(adminLogin.status, 200, `Admin login gagal: ${JSON.stringify(adminLogin.data)}`);
    const adminToken = adminLogin.data.token as string;

    // Pastikan tarif default aktif di settings untuk Bagian A
    const resetRes = await reqJson(baseUrl, "PATCH", "/settings", ownerToken, {
      _alasan: "Test reset ke tarif default",
      pesawatRate: 77000,
      hematRate: 10000,
      kargoRate: 1900000,
      pelniTiersJakarta: [
        { maxKg: 10.1, rate: 20000 },
        { maxKg: 20.1, rate: 19000 },
        { maxKg: 40.1, rate: 18000 },
        { maxKg: 80.1, rate: 17000 },
        { maxKg: 999999, rate: 16000 },
      ],
      pelniTiersSurabaya: [
        { maxKg: 10, rate: 18000 },
        { maxKg: 20, rate: 17000 },
        { maxKg: 40, rate: 16000 },
        { maxKg: 999999, rate: 15500 },
      ],
    });
    assert.equal(resetRes.status, 200);

    const apiRatesDefault = await reqJson(baseUrl, "GET", "/settings/base-rates", adminToken);
    assert.equal(apiRatesDefault.status, 200);
    assert.equal(apiRatesDefault.data.pesawatRate, 77000);
    assert.equal(apiRatesDefault.data.hematRate, 10000);
    assert.equal(apiRatesDefault.data.kargoRate, 1900000);

    const uniq = Date.now();
    const [batchJkt] = await db
      .insert(batchesTable)
      .values({
        batchNumber: `TEST-RATE-JKT-${uniq}`,
        namaKapal: "KM Test Jakarta",
        kotaAsal: "Jakarta",
        tujuan: "Manokwari",
        originCity: "Jakarta",
        destinationCity: "Manokwari",
        deliveryRoute: "Jakarta → Manokwari",
        status: "open",
        statusBatch: "OPEN",
        isLocked: false,
      })
      .returning();
    createdBatchIds.push(batchJkt.id);

    const [batchSby] = await db
      .insert(batchesTable)
      .values({
        batchNumber: `TEST-RATE-SBY-${uniq}`,
        namaKapal: "KM Test Surabaya",
        kotaAsal: "Surabaya",
        tujuan: "Manokwari",
        originCity: "Surabaya",
        destinationCity: "Manokwari",
        deliveryRoute: "Surabaya → Manokwari",
        status: "open",
        statusBatch: "OPEN",
        isLocked: false,
      })
      .returning();
    createdBatchIds.push(batchSby.id);

    const createPkg = async (payload: Record<string, any>) => {
      const r = await reqJson(baseUrl, "POST", "/packages", adminToken, payload);
      assert.equal(r.status, 201, `Gagal buat paket: ${JSON.stringify(r.data)}`);
      createdPackageIds.push(r.data.id);
      return r.data;
    };

    // ── 3. BAGIAN A: Uji ongkir identik pada tarif default ───────────────────
    console.log("2. Uji kalkulasi dengan tarif default (Pesawat, Hemat+, Pelni JKT/SBY semua tier, Kargo)...");

    // Pesawat (Jakarta -> Manokwari, 77.000/kg)
    const psw1 = await createPkg({
      batchId: batchJkt.id,
      resiNumber: `PSW1-${uniq}`,
      customerName: `Test Pesawat 015 ${uniq}`,
      serviceType: "jastip pesawat",
      deliveryRoute: "Jakarta → Manokwari",
      realWeight: 0.15,
    });
    assert.equal(psw1.shippingRate, 77000);
    assert.equal(psw1.totalShipping, 15400); // 0.2 * 77000

    const psw2 = await createPkg({
      batchId: batchJkt.id,
      resiNumber: `PSW2-${uniq}`,
      customerName: `Test Pesawat 035 ${uniq}`,
      serviceType: "jastip pesawat",
      deliveryRoute: "Jakarta → Manokwari",
      realWeight: 0.35,
    });
    assert.equal(psw2.totalShipping, 30800); // 0.4 * 77000

    const psw3 = await createPkg({
      batchId: batchJkt.id,
      resiNumber: `PSW3-${uniq}`,
      customerName: `Test Pesawat 045 ${uniq}`,
      serviceType: "jastip pesawat",
      deliveryRoute: "Jakarta → Manokwari",
      realWeight: 0.45,
    });
    assert.equal(psw3.totalShipping, 38500); // 0.5 * 77000

    const psw4 = await createPkg({
      batchId: batchJkt.id,
      resiNumber: `PSW4-${uniq}`,
      customerName: `Test Pesawat 120 ${uniq}`,
      serviceType: "jastip pesawat",
      deliveryRoute: "Jakarta → Manokwari",
      realWeight: 1.2,
    });
    assert.equal(psw4.totalShipping, 92400); // 1.2 * 77000

    // Hemat+ (Surabaya -> Manokwari, 10.000/kg)
    const hmt1 = await createPkg({
      batchId: batchSby.id,
      resiNumber: `HMT1-${uniq}`,
      customerName: `Test Hemat Single ${uniq}`,
      serviceType: "jastip hemat+",
      deliveryRoute: "Surabaya → Manokwari",
      realWeight: 0.5,
    });
    assert.equal(hmt1.shippingRate, 10000);
    assert.equal(hmt1.totalShipping, 10000);

    const hmt2 = await createPkg({
      batchId: batchSby.id,
      resiNumber: `HMT2-${uniq}`,
      customerName: `Test Hemat Multi ${uniq}`,
      serviceType: "jastip hemat+",
      deliveryRoute: "Surabaya → Manokwari",
      realWeight: 1.5,
    });
    const hmt3 = await createPkg({
      batchId: batchSby.id,
      resiNumber: `HMT3-${uniq}`,
      customerName: `Test Hemat Multi ${uniq}`,
      serviceType: "jastip hemat+",
      deliveryRoute: "Surabaya → Manokwari",
      realWeight: 2.0,
    });
    const hmtMultiSum =
      Number((await reqJson(baseUrl, "GET", `/packages/${hmt2.id}`, adminToken)).data.totalShipping) +
      Number(hmt3.totalShipping);
    assert.equal(hmtMultiSum, 35000); // 3.5 * 10000

    // Pelni Jakarta (semua 5 tier)
    const jktCases = [
      { weight: 5, rate: 20000, total: 100000 },
      { weight: 15, rate: 19000, total: 285000 },
      { weight: 30, rate: 18000, total: 540000 },
      { weight: 50, rate: 17000, total: 850000 },
      { weight: 100, rate: 16000, total: 1600000 },
    ];
    const oldPelniJktIds: number[] = [];
    for (const c of jktCases) {
      const p = await createPkg({
        batchId: batchJkt.id,
        resiNumber: `PJKT-${c.weight}-${uniq}`,
        customerName: `Test Pelni JKT ${c.weight} ${uniq}`,
        serviceType: "jastip pelni",
        deliveryRoute: "Jakarta → Manokwari",
        realWeight: c.weight,
      });
      assert.equal(p.shippingRate, c.rate, `JKT tier ${c.weight}kg rate`);
      assert.equal(p.totalShipping, c.total, `JKT tier ${c.weight}kg total`);
      oldPelniJktIds.push(p.id);
    }

    // Pelni Surabaya (semua 4 tier)
    const sbyCases = [
      { weight: 5, rate: 18000, total: 90000 },
      { weight: 15, rate: 17000, total: 255000 },
      { weight: 30, rate: 16000, total: 480000 },
      { weight: 50, rate: 15500, total: 775000 },
    ];
    const oldPelniSbyIds: number[] = [];
    for (const c of sbyCases) {
      const p = await createPkg({
        batchId: batchSby.id,
        resiNumber: `PSBY-${c.weight}-${uniq}`,
        customerName: `Test Pelni SBY ${c.weight} ${uniq}`,
        serviceType: "jastip pelni",
        deliveryRoute: "Surabaya → Manokwari",
        realWeight: c.weight,
      });
      assert.equal(p.shippingRate, c.rate, `SBY tier ${c.weight}kg rate`);
      assert.equal(p.totalShipping, c.total, `SBY tier ${c.weight}kg total`);
      oldPelniSbyIds.push(p.id);
    }

    // Kargo default: dengan tarif eksplisit & tanpa tarif eksplisit (fallback settings.kargoRate = 1.900.000)
    const krgExplicit = await createPkg({
      batchId: batchJkt.id,
      resiNumber: `KRG1-${uniq}`,
      customerName: `Test Kargo Explicit ${uniq}`,
      serviceType: "jastip kargo",
      deliveryRoute: "Jakarta/Surabaya → Manokwari",
      packageMode: "single",
      length: 34,
      width: 30,
      height: 21,
      shippingRate: 1900000,
    });
    assert.equal(krgExplicit.totalShipping, 40698);

    const krgDefault = await createPkg({
      batchId: batchJkt.id,
      resiNumber: `KRG2-${uniq}`,
      customerName: `Test Kargo Default ${uniq}`,
      serviceType: "jastip kargo",
      deliveryRoute: "Jakarta/Surabaya → Manokwari",
      packageMode: "single",
      length: 100,
      width: 100,
      height: 50, // 0.5 M3
    });
    assert.equal(krgDefault.shippingRate, 1900000);
    assert.equal(krgDefault.totalShipping, 950000);
    console.log("   ✓ Semua sampel default Pesawat, Hemat+, Pelni (JKT 5 tier & SBY 4 tier), dan Kargo LULUS.");

    // ── 4. BAGIAN B: Owner mengubah tarif, paket lama TIDAK berubah ─────────
    console.log("3. Ubah tarif di settings, pastikan paket lama tetap & paket baru ikut tarif baru...");
    const updateRatesRes = await reqJson(baseUrl, "PATCH", "/settings", ownerToken, {
      _alasan: "Uji perubahan tarif dinamis",
      pesawatRate: 90000,
      hematRate: 12000,
      kargoRate: 2500000,
      pelniTiersJakarta: [
        { maxKg: 10.1, rate: 22000 },
        { maxKg: 20.1, rate: 21000 },
        { maxKg: 40.1, rate: 20000 },
        { maxKg: 80.1, rate: 19000 },
        { maxKg: 999999, rate: 18000 },
      ],
      pelniTiersSurabaya: [
        { maxKg: 10, rate: 19500 },
        { maxKg: 20, rate: 18500 },
        { maxKg: 40, rate: 17500 },
        { maxKg: 999999, rate: 16500 },
      ],
    });
    assert.equal(updateRatesRes.status, 200);

    const apiRatesUpdated = await reqJson(baseUrl, "GET", "/settings/base-rates", adminToken);
    assert.equal(apiRatesUpdated.status, 200);
    assert.equal(apiRatesUpdated.data.pesawatRate, 90000);
    assert.equal(apiRatesUpdated.data.hematRate, 12000);
    assert.equal(apiRatesUpdated.data.kargoRate, 2500000);
    assert.equal(apiRatesUpdated.data.pelniTiersJakarta[0].rate, 22000);
    assert.equal(apiRatesUpdated.data.pelniTiersJakarta[4].maxKg, null);
    assert.equal(apiRatesUpdated.data.pelniTiersSurabaya[3].rate, 16500);

    // Pastikan paket lama TIDAK ikut berubah otomatis
    const oldPswCheck = await reqJson(baseUrl, "GET", `/packages/${psw4.id}`, adminToken);
    assert.equal(oldPswCheck.data.totalShipping, 92400);
    const oldHmtCheck = await reqJson(baseUrl, "GET", `/packages/${hmt1.id}`, adminToken);
    assert.equal(oldHmtCheck.data.totalShipping, 10000);
    const oldPelniCheck = await reqJson(baseUrl, "GET", `/packages/${oldPelniJktIds[0]}`, adminToken);
    assert.equal(oldPelniCheck.data.totalShipping, 100000);
    const oldKrgCheck = await reqJson(baseUrl, "GET", `/packages/${krgDefault.id}`, adminToken);
    assert.equal(oldKrgCheck.data.totalShipping, 950000);
    console.log("   ✓ Paket lama tidak berubah otomatis setelah update settings.");

    // Buat paket BARU via input manual (POST /api/packages)
    const newPsw = await createPkg({
      batchId: batchJkt.id,
      resiNumber: `NEW-PSW-${uniq}`,
      customerName: `New Pesawat ${uniq}`,
      serviceType: "jastip pesawat",
      deliveryRoute: "Jakarta → Manokwari",
      realWeight: 1.0,
    });
    assert.equal(newPsw.shippingRate, 90000);
    assert.equal(newPsw.totalShipping, 90000);

    const newHmt = await createPkg({
      batchId: batchSby.id,
      resiNumber: `NEW-HMT-${uniq}`,
      customerName: `New Hemat ${uniq}`,
      serviceType: "jastip hemat+",
      deliveryRoute: "Surabaya → Manokwari",
      realWeight: 2.0,
    });
    assert.equal(newHmt.shippingRate, 12000);
    assert.equal(newHmt.totalShipping, 24000);

    const newPelniJkt = await createPkg({
      batchId: batchJkt.id,
      resiNumber: `NEW-PJKT-${uniq}`,
      customerName: `New Pelni JKT ${uniq}`,
      serviceType: "jastip pelni",
      deliveryRoute: "Jakarta → Manokwari",
      realWeight: 100,
    });
    assert.equal(newPelniJkt.shippingRate, 18000);
    assert.equal(newPelniJkt.totalShipping, 1800000);

    const newPelniSby = await createPkg({
      batchId: batchSby.id,
      resiNumber: `NEW-PSBY-${uniq}`,
      customerName: `New Pelni SBY ${uniq}`,
      serviceType: "jastip pelni",
      deliveryRoute: "Surabaya → Manokwari",
      realWeight: 15,
    });
    assert.equal(newPelniSby.shippingRate, 18500);
    assert.equal(newPelniSby.totalShipping, 277500);

    const newKrg = await createPkg({
      batchId: batchJkt.id,
      resiNumber: `NEW-KRG-${uniq}`,
      customerName: `New Kargo ${uniq}`,
      serviceType: "jastip kargo",
      deliveryRoute: "Jakarta/Surabaya → Manokwari",
      packageMode: "single",
      length: 100,
      width: 100,
      height: 50,
    });
    assert.equal(newKrg.shippingRate, 2500000);
    assert.equal(newKrg.totalShipping, 1250000);
    console.log("   ✓ Paket baru via POST /api/packages mengikuti tarif baru.");

    // Uji Import Excel (POST /api/packages/import)
    const impRes = await reqJson(baseUrl, "POST", "/packages/import", adminToken, {
      batchId: batchJkt.id,
      fileName: "test-import-rates.xlsx",
      packages: [
        {
          resiNumber: `IMP-PSW-${uniq}`,
          customerName: `Import Pesawat ${uniq}`,
          serviceType: "jastip pesawat",
          deliveryRoute: "Jakarta → Manokwari",
          realWeight: 1.0,
        },
        {
          resiNumber: `IMP-HMT-${uniq}`,
          customerName: `Import Hemat ${uniq}`,
          serviceType: "jastip hemat+",
          deliveryRoute: "Surabaya → Manokwari",
          realWeight: 3.0,
        },
        {
          resiNumber: `IMP-PJKT-${uniq}`,
          customerName: `Import Pelni ${uniq}`,
          serviceType: "jastip pelni",
          deliveryRoute: "Jakarta → Manokwari",
          realWeight: 25,
        },
        {
          resiNumber: `IMP-KRG-${uniq}`,
          customerName: `Import Kargo ${uniq}`,
          serviceType: "jastip kargo",
          deliveryRoute: "Jakarta/Surabaya → Manokwari",
          packageMode: "single",
          length: 100,
          width: 100,
          height: 20, // 0.2 M3
        },
      ],
    });
    assert.equal(impRes.status, 200, `Import gagal: ${JSON.stringify(impRes.data)}`);
    assert.equal(impRes.data.success, 4);
    if (impRes.data.importId) createdImportIds.push(impRes.data.importId);
    for (const id of impRes.data.ids || []) createdPackageIds.push(id);

    const impPkgs = await Promise.all(
      (impRes.data.ids as number[]).map((id) =>
        reqJson(baseUrl, "GET", `/packages/${id}`, adminToken).then((r) => r.data),
      ),
    );
    assert.equal(impPkgs[0].totalShipping, 90000);
    assert.equal(impPkgs[1].totalShipping, 36000);
    assert.equal(impPkgs[2].shippingRate, 20000);
    assert.equal(impPkgs[2].totalShipping, 500000);
    assert.equal(impPkgs[3].shippingRate, 2500000);
    assert.equal(impPkgs[3].totalShipping, 500000);
    console.log("   ✓ Import Excel (POST /api/packages/import) mengikuti tarif baru.");

    // Uji Edit Paket (PATCH /api/packages/:id)
    const editPsw = await reqJson(baseUrl, "PATCH", `/packages/${newPsw.id}`, adminToken, {
      realWeight: 2.0,
    });
    assert.equal(editPsw.status, 200);
    assert.equal(editPsw.data.shippingRate, 90000);
    assert.equal(editPsw.data.totalShipping, 180000);
    console.log("   ✓ Edit paket (PATCH /api/packages/:id) mengikuti tarif baru.");

    // ── 5. Uji Hitung Ulang (recalculate-batch & recalculate-kargo) ──────────
    console.log("4. Uji Hitung Ulang Ongkir (hanya setelah Owner jalankan Hitung Ulang)...");
    const recalcJkt = await reqJson(baseUrl, "POST", "/packages/recalculate-batch", ownerToken, {
      batchId: batchJkt.id,
      serviceType: "all",
    });
    assert.equal(recalcJkt.status, 200);

    const recalcSby = await reqJson(baseUrl, "POST", "/packages/recalculate-batch", ownerToken, {
      batchId: batchSby.id,
      serviceType: "all",
    });
    assert.equal(recalcSby.status, 200);

    const afterPsw4 = await reqJson(baseUrl, "GET", `/packages/${psw4.id}`, ownerToken);
    assert.equal(afterPsw4.data.shippingRate, 90000);
    assert.equal(afterPsw4.data.totalShipping, 108000); // 1.2 * 90000

    const afterHmt1 = await reqJson(baseUrl, "GET", `/packages/${hmt1.id}`, ownerToken);
    assert.equal(afterHmt1.data.shippingRate, 12000);
    assert.equal(afterHmt1.data.totalShipping, 12000); // 1 * 12000

    const afterPelniJkt5 = await reqJson(baseUrl, "GET", `/packages/${oldPelniJktIds[0]}`, ownerToken);
    assert.equal(afterPelniJkt5.data.shippingRate, 22000);
    assert.equal(afterPelniJkt5.data.totalShipping, 110000); // 5 * 22000

    const afterPelniSby5 = await reqJson(baseUrl, "GET", `/packages/${oldPelniSbyIds[0]}`, ownerToken);
    assert.equal(afterPelniSby5.data.shippingRate, 19500);
    assert.equal(afterPelniSby5.data.totalShipping, 97500); // 5 * 19500

    const afterKrg = await reqJson(baseUrl, "GET", `/packages/${krgDefault.id}`, ownerToken);
    assert.equal(afterKrg.data.shippingRate, 2500000);
    assert.equal(afterKrg.data.totalShipping, 1250000);

    // Juga uji endpoint recalculate-kargo khusus batch
    const recalcKargo = await reqJson(baseUrl, "POST", "/packages/recalculate-kargo", ownerToken, {
      batchId: batchJkt.id,
    });
    assert.equal(recalcKargo.status, 200);
    const afterKrg2 = await reqJson(baseUrl, "GET", `/packages/${krgExplicit.id}`, ownerToken);
    assert.equal(afterKrg2.data.shippingRate, 2500000);
    assert.equal(afterKrg2.data.totalShipping, Math.round(0.02142 * 2500000)); // 53550
    console.log("   ✓ Paket lama berhasil ikut tarif baru setelah Owner menjalankan Hitung Ulang.");

    console.log("\n✅ SEMUA PENGUJIAN TARIF DASAR DINAMIS LULUS!\n");
  } finally {
    // Cleanup data test & restore settings
    if (createdPackageIds.length > 0) {
      await db.delete(packagesTable).where(inArray(packagesTable.id, createdPackageIds)).catch(() => {});
    }
    if (createdImportIds.length > 0) {
      await db.delete(packageImportsTable).where(inArray(packageImportsTable.id, createdImportIds)).catch(() => {});
    }
    if (createdBatchIds.length > 0) {
      await db.delete(batchesTable).where(inArray(batchesTable.id, createdBatchIds)).catch(() => {});
    }
    for (const k of ["pesawatRate", "hematRate", "kargoRate", "pelniTiersJakarta", "pelniTiersSurabaya"]) {
      await db.delete(settingsTable).where(eq(settingsTable.key, k)).catch(() => {});
    }
    for (const row of originalSettings) {
      await db
        .insert(settingsTable)
        .values({ key: row.key, value: row.value })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value: row.value, updatedAt: new Date() },
        })
        .catch(() => {});
    }
    await db
      .delete(tarifHistoryTable)
      .where(eq(tarifHistoryTable.alasan, "Test reset ke tarif default"))
      .catch(() => {});
    await db
      .delete(tarifHistoryTable)
      .where(eq(tarifHistoryTable.alasan, "Uji perubahan tarif dinamis"))
      .catch(() => {});

    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

run().catch((err) => {
  console.error("❌ TEST GAGAL:", err);
  process.exit(1);
});
