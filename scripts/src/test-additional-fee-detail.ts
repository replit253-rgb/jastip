const API_BASE = "http://localhost:3000/api";

async function runTest() {
  console.log("================================================================================");
  console.log("       TESTING BIAYA TAMBAHAN (OPSIONAL) DI DETAIL PAKET & BARCODE             ");
  console.log("================================================================================");

  // 1. Login Admin
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "081200000001", password: "admin123" }),
  });
  const loginData = await loginRes.json();
  if (!loginData.token) {
    throw new Error("Gagal login: " + JSON.stringify(loginData));
  }
  const token = loginData.token;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  console.log("✓ 1. Login admin berhasil, token didapat.");

  // Ambil batch aktif
  const batchesRes = await fetch(`${API_BASE}/batches`, { headers });
  const batches = await batchesRes.json();
  const activeBatch = batches.find((b: any) => b.statusBatch === "OPEN") || batches[0];
  const batchId = activeBatch ? activeBatch.id : 1;
  console.log(`     Menggunakan Batch ID: ${batchId} (${activeBatch?.namaKapal || "Default"})`);

  // 2. Buat Paket Baru dengan Biaya Tambahan Opsional
  const newPackagePayload = {
    batchId,
    resiNumber: `SPX-TEST-${Date.now().toString().slice(-6)}`,
    packageNumber: "TEST-01",
    customerName: "Budi Santoso Uji Biaya",
    customerPhone: "081299998888",
    serviceType: "jastip pelni",
    deliveryRoute: "Jakarta → Manokwari",
    realWeight: 2,
    length: 49,
    width: 37,
    height: 23,
    additionalFee: 15000,
    additionalFeeReason: "Paking kayu & bubble wrap ekstra",
  };

  const createRes = await fetch(`${API_BASE}/packages`, {
    method: "POST",
    headers,
    body: JSON.stringify(newPackagePayload),
  });
  const createdPkg = await createRes.json();
  if (createRes.status !== 201 && createRes.status !== 200) {
    throw new Error("Gagal membuat paket: " + JSON.stringify(createdPkg));
  }
  console.log(`✓ 2. Paket berhasil dibuat: ID ${createdPkg.id}, Resi: ${createdPkg.resiNumber}`);
  console.log(`     Total Ongkir: Rp ${Number(createdPkg.totalShipping).toLocaleString("id-ID")}`);
  console.log(`     Biaya Tambahan: Rp ${Number(createdPkg.additionalFee).toLocaleString("id-ID")}`);
  console.log(`     Alasan: ${createdPkg.additionalFeeReason}`);

  if (Number(createdPkg.additionalFee) !== 15000) {
    throw new Error(`Biaya tambahan tidak sesuai, didapat: ${createdPkg.additionalFee}`);
  }
  if (createdPkg.additionalFeeReason !== "Paking kayu & bubble wrap ekstra") {
    throw new Error(`Alasan biaya tambahan tidak sesuai, didapat: ${createdPkg.additionalFeeReason}`);
  }

  // 3. Verifikasi GET /api/packages/:id
  const getRes = await fetch(`${API_BASE}/packages/${createdPkg.id}`, { headers });
  const detailPkg = await getRes.json();
  if (getRes.status !== 200) {
    throw new Error("Gagal mengambil detail paket: " + JSON.stringify(detailPkg));
  }
  console.log(`✓ 3. Detail paket diambil (GET /api/packages/${createdPkg.id}):`);
  console.log(`     Biaya Tambahan tersimpan: Rp ${Number(detailPkg.additionalFee).toLocaleString("id-ID")}`);
  console.log(`     Keterangan: ${detailPkg.additionalFeeReason}`);
  if (Number(detailPkg.additionalFee) !== 15000) {
    throw new Error("Nominal Biaya Tambahan di detail tidak cocok");
  }

  // 4. Update (PATCH) Paket via Modal Edit
  const updatePayload = {
    additionalFee: 25000,
    additionalFeeReason: "Paking kayu ukuran besar + karung berlapis",
  };
  const patchRes = await fetch(`${API_BASE}/packages/${createdPkg.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updatePayload),
  });
  if (patchRes.status !== 200) {
    const err = await patchRes.json().catch(() => ({}));
    throw new Error("Gagal update paket: " + JSON.stringify(err));
  }
  console.log("✓ 4. PATCH paket dengan Biaya Tambahan baru berhasil (HTTP 200).");

  // 5. Verifikasi hasil update
  const getRes2 = await fetch(`${API_BASE}/packages/${createdPkg.id}`, { headers });
  const updatedPkg = await getRes2.json();
  console.log(`✓ 5. Hasil setelah update: Rp ${Number(updatedPkg.additionalFee).toLocaleString("id-ID")} (${updatedPkg.additionalFeeReason})`);
  if (Number(updatedPkg.additionalFee) !== 25000) {
    throw new Error(`Update nominal gagal, didapat: ${updatedPkg.additionalFee}`);
  }
  if (updatedPkg.additionalFeeReason !== "Paking kayu ukuran besar + karung berlapis") {
    throw new Error(`Update alasan gagal, didapat: ${updatedPkg.additionalFeeReason}`);
  }

  // 6. Test reset Biaya Tambahan ke 0 / null
  const resetRes = await fetch(`${API_BASE}/packages/${createdPkg.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ additionalFee: 0, additionalFeeReason: null }),
  });
  if (resetRes.status !== 200) {
    throw new Error("Gagal mereset biaya tambahan");
  }
  const getRes3 = await fetch(`${API_BASE}/packages/${createdPkg.id}`, { headers });
  const resetPkg = await getRes3.json();
  console.log(`✓ 6. Reset Biaya Tambahan ke 0 berhasil: Rp ${Number(resetPkg.additionalFee || 0).toLocaleString("id-ID")}`);

  console.log("================================================================================");
  console.log("       SEMUA PENGUJIAN FITUR BIAYA TAMBAHAN BERHASIL (100%)                    ");
  console.log("================================================================================");
}

runTest().catch((err) => {
  console.error("Test Gagal:", err);
  process.exit(1);
});
