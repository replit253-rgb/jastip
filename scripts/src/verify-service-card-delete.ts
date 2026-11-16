import assert from "node:assert/strict";
import http from "node:http";
import { inArray } from "drizzle-orm";
import { db, batchesTable, packagesTable } from "@workspace/db";
import app from "../../artifacts/api-server/src/app";

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
  console.log(`\n=== Verifikasi Hapus Per Card Layanan (${isMock ? "Mock DB" : "PostgreSQL"}) ===`);

  const createdBatchIds: number[] = [];
  const createdPackageIds: number[] = [];

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  try {
    const ownerLogin = await reqJson(baseUrl, "POST", "/auth/login", undefined, {
      phone: "081200000000",
      password: "owner123",
    });
    assert.equal(ownerLogin.status, 200);
    const ownerToken = ownerLogin.data.token as string;

    const adminLogin = await reqJson(baseUrl, "POST", "/auth/login", undefined, {
      phone: "081200000001",
      password: "admin123",
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token as string;

    const uniq = Date.now();
    const [batch] = await db
      .insert(batchesTable)
      .values({
        batchNumber: `TEST-CARD-DEL-${uniq}`,
        namaKapal: "KM Test Hapus Card",
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
    createdBatchIds.push(batch.id);

    // Seed paket seperti kondisi produksi:
    // 1. Card "Jastip Hemat+": 2 paket data lama (tanpa tag), 1 paket manual, 1 paket sudah diverifikasi
    // 2. Card "Lainnya": 1 paket data lama (tanpa tag, serviceType null), 1 paket manual
    const inserted = await db
      .insert(packagesTable)
      .values([
        {
          barcode: `CARD-H1-${uniq}`,
          resiNumber: `RESI-H1-${uniq}`,
          customerName: "Budi",
          serviceType: "jastip hemat+",
          deliveryRoute: "Surabaya → Manokwari",
          realWeight: "2",
          usedWeight: "2",
          shippingRate: "10000",
          totalShipping: "20000",
          status: "pending",
          statusVerifikasi: "BELUM_DIVERIFIKASI",
          verified: "belum_diverifikasi",
          inputSource: null,
          importId: null,
          batchId: batch.id,
        },
        {
          barcode: `CARD-H2-${uniq}`,
          resiNumber: `RESI-H2-${uniq}`,
          customerName: "Sari",
          serviceType: "jastip hemat+",
          deliveryRoute: "Surabaya → Manokwari",
          realWeight: "3",
          usedWeight: "3",
          shippingRate: "10000",
          totalShipping: "30000",
          status: "pending",
          statusVerifikasi: "BELUM_DIVERIFIKASI",
          verified: "belum_diverifikasi",
          inputSource: "import",
          importId: null,
          batchId: batch.id,
        },
        {
          barcode: `CARD-HM-${uniq}`,
          resiNumber: `RESI-HM-${uniq}`,
          customerName: "Tono",
          serviceType: "jastip hemat+",
          deliveryRoute: "Surabaya → Manokwari",
          realWeight: "1",
          usedWeight: "1",
          shippingRate: "10000",
          totalShipping: "10000",
          status: "pending",
          statusVerifikasi: "BELUM_DIVERIFIKASI",
          verified: "belum_diverifikasi",
          inputSource: "manual",
          importId: null,
          batchId: batch.id,
        },
        {
          barcode: `CARD-HV-${uniq}`,
          resiNumber: `RESI-HV-${uniq}`,
          customerName: "Dina",
          serviceType: "jastip hemat+",
          deliveryRoute: "Surabaya → Manokwari",
          realWeight: "1",
          usedWeight: "1",
          shippingRate: "10000",
          totalShipping: "10000",
          status: "pending",
          statusVerifikasi: "SUDAH_DIVERIFIKASI",
          verified: "sudah_diverifikasi",
          inputSource: null,
          importId: null,
          batchId: batch.id,
        },
        {
          barcode: `CARD-L1-${uniq}`,
          resiNumber: `RESI-L1-${uniq}`,
          customerName: "Eko",
          serviceType: null,
          deliveryRoute: "Surabaya → Manokwari",
          realWeight: "1",
          usedWeight: "1",
          status: "pending",
          statusVerifikasi: "BELUM_DIVERIFIKASI",
          verified: "belum_diverifikasi",
          inputSource: null,
          importId: null,
          batchId: batch.id,
        },
        {
          barcode: `CARD-LM-${uniq}`,
          resiNumber: `RESI-LM-${uniq}`,
          customerName: "Fajar",
          serviceType: "reguler",
          deliveryRoute: "Surabaya → Manokwari",
          realWeight: "1",
          usedWeight: "1",
          status: "pending",
          statusVerifikasi: "BELUM_DIVERIFIKASI",
          verified: "belum_diverifikasi",
          inputSource: "manual",
          importId: null,
          batchId: batch.id,
        },
      ])
      .returning();

    for (const row of inserted) createdPackageIds.push(row.id);

    // 1. Cek RBAC: Admin ditolak (403)
    const adminCheck1 = await reqJson(baseUrl, "GET", `/packages/imports?batchId=${batch.id}`, adminToken);
    assert.equal(adminCheck1.status, 403);
    const adminCheck2 = await reqJson(baseUrl, "DELETE", `/packages/batch/${batch.id}/service-card`, adminToken, {
      serviceKey: "lainnya",
    });
    assert.equal(adminCheck2.status, 403);
    console.log("   ✓ RBAC non-owner (Admin) diblokir dengan HTTP 403.");

    // 2. Cek breakdown serviceCards pada GET /api/packages/imports
    const summaryRes = await reqJson(baseUrl, "GET", `/packages/imports?batchId=${batch.id}`, ownerToken);
    assert.equal(summaryRes.status, 200);
    const cards = summaryRes.data.serviceCards as any[];
    const hematCard = cards.find((c) => c.serviceKey === "jastip hemat+");
    const lainnyaCard = cards.find((c) => c.serviceKey === "lainnya");
    assert.ok(hematCard, "Card Jastip Hemat+ harus muncul");
    assert.ok(lainnyaCard, "Card Lainnya harus muncul");
    assert.equal(hematCard.activeCardCount, 4);
    assert.equal(hematCard.deletableImportCount, 2);
    assert.equal(hematCard.deletableManualCount, 1);
    assert.equal(hematCard.lockedCount, 1);
    assert.equal(lainnyaCard.activeCardCount, 2);
    assert.equal(lainnyaCard.deletableImportCount, 1);
    assert.equal(lainnyaCard.deletableManualCount, 1);
    console.log("   ✓ Ringkasan per-card akurat.");

    // 3. Owner hapus card "Lainnya" (tanpa includeManual dulu -> hanya import/legacy yang terhapus; manual aman)
    const delLainnya1 = await reqJson(baseUrl, "DELETE", `/packages/batch/${batch.id}/service-card`, ownerToken, {
      serviceKey: "lainnya",
      includeLegacy: true,
      includeManual: false,
    });
    assert.equal(delLainnya1.status, 200);
    assert.equal(delLainnya1.data.deletedCount, 1);
    assert.equal(delLainnya1.data.skippedCount, 1);

    // Pastikan paket Jastip Hemat+ masih lengkap (4 paket)
    const afterLainnya1 = await db
      .select()
      .from(packagesTable)
      .where(inArray(packagesTable.batchId, [batch.id]));
    assert.equal(afterLainnya1.filter((p: any) => p.serviceType === "jastip hemat+").length, 4);
    assert.equal(afterLainnya1.filter((p: any) => !p.serviceType || p.serviceType === "reguler").length, 1);

    // Hapus sisa paket manual pada card "Lainnya" (includeManual: true) -> card Lainnya hilang 100%, Hemat+ tetap utuh
    const delLainnya2 = await reqJson(baseUrl, "DELETE", `/packages/batch/${batch.id}/service-card`, ownerToken, {
      serviceKey: "lainnya",
      includeLegacy: true,
      includeManual: true,
    });
    assert.equal(delLainnya2.status, 200);
    assert.equal(delLainnya2.data.deletedCount, 1);

    const afterLainnya2 = await db
      .select()
      .from(packagesTable)
      .where(inArray(packagesTable.batchId, [batch.id]));
    assert.equal(afterLainnya2.filter((p: any) => !p.serviceType || p.serviceType === "reguler").length, 0);
    assert.equal(afterLainnya2.filter((p: any) => p.serviceType === "jastip hemat+").length, 4);
    console.log("   ✓ Hapus card Lainnya menghapus paket card tersebut tanpa menyentuh card Jastip Hemat+.");

    // 4. Owner hapus impor per card via DELETE /api/packages/imports/batch/:batchId?includeLegacy=true&serviceKey=jastip%20hemat%2B
    const delHematImp = await reqJson(
      baseUrl,
      "DELETE",
      `/packages/imports/batch/${batch.id}?includeLegacy=true&serviceKey=${encodeURIComponent("jastip hemat+")}`,
      ownerToken,
    );
    assert.equal(delHematImp.status, 200);
    assert.equal(delHematImp.data.deletedCount, 2); // 1 legacy + 1 tracked import
    assert.equal(delHematImp.data.skippedCount, 1); // 1 verified (manual tidak dimasukkan kandidat impor)
    assert.equal(delHematImp.data.skippedReasons.verified, 1);

    // 5. Uji includeManual: true pada card Hemat+ -> paket manual ikut terhapus, tapi paket SUDAH_DIVERIFIKASI tetap aman!
    const delHematAllUnlocked = await reqJson(baseUrl, "DELETE", `/packages/batch/${batch.id}/service-card`, ownerToken, {
      serviceKey: "jastip hemat+",
      includeLegacy: true,
      includeManual: true,
    });
    assert.equal(delHematAllUnlocked.status, 200);
    assert.equal(delHematAllUnlocked.data.deletedCount, 1); // manual terhapus
    assert.equal(delHematAllUnlocked.data.skippedCount, 1); // verified tetap terlindungi
    assert.equal(delHematAllUnlocked.data.skippedReasons.verified, 1);

    const remainingFinal = await db
      .select()
      .from(packagesTable)
      .where(inArray(packagesTable.batchId, [batch.id]));
    assert.equal(remainingFinal.length, 1);
    assert.equal(remainingFinal[0].statusVerifikasi, "SUDAH_DIVERIFIKASI");
    console.log("   ✓ Paket terkunci (SUDAH_DIVERIFIKASI) tetap terlindungi dan tidak ikut terhapus.");

    console.log("\n✅ SEMUA PENGUJIAN HAPUS PER CARD LAYANAN LULUS!\n");
  } finally {
    if (createdPackageIds.length > 0) {
      await db.delete(packagesTable).where(inArray(packagesTable.id, createdPackageIds)).catch(() => {});
    }
    if (createdBatchIds.length > 0) {
      await db.delete(batchesTable).where(inArray(batchesTable.id, createdBatchIds)).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

run().catch((err) => {
  console.error("❌ TEST GAGAL:", err);
  process.exit(1);
});
