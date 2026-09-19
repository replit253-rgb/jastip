const API_BASE = "http://localhost:3000/api";

interface TestCheck {
  section: string;
  name: string;
  passed: boolean;
  notes: string;
}

const testResults: TestCheck[] = [];

function check(section: string, name: string, condition: boolean, notes: string) {
  testResults.push({
    section,
    name,
    passed: condition,
    notes,
  });
  const symbol = condition ? "✓ [LULUS]" : "✗ [GAGAL]";
  console.log(`${symbol} [${section}] ${name} -> ${notes}`);
}

async function runComprehensiveTests() {
  console.log("================================================================================");
  console.log("       PENGUJIAN KOMPREHENSIF SEMUA FITUR, MENU, & HALAMAN JAJ                  ");
  console.log("================================================================================");

  let ownerToken = "";
  let adminToken = "";

  // 1. HEALTH & SYSTEM BOOTSTRAP
  try {
    const res = await fetch(`${API_BASE}/healthz`);
    const data = await res.json();
    check("1. System Bootstrap", "Health Check", res.status === 200 && data.status === "ok", `HTTP ${res.status}`);
  } catch (err: any) {
    check("1. System Bootstrap", "Health Check", false, err.message);
  }

  // 2. AUTHENTICATION & PROFILE
  try {
    // Owner Login
    const ownerRes = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "081200000000", password: "owner123" }),
    });
    const ownerData = await ownerRes.json();
    ownerToken = ownerData.token;
    check("2. Autentikasi", "Login Akun Owner", ownerRes.status === 200 && !!ownerToken, `Role: ${ownerData.user?.role}`);

    // Admin Login
    const adminRes = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "081200000001", password: "admin123" }),
    });
    const adminData = await adminRes.json();
    adminToken = adminData.token;
    check("2. Autentikasi", "Login Akun Admin", adminRes.status === 200 && !!adminToken, `Role: ${adminData.user?.role}`);

    // Verify current profile
    const profileRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const profileData = await profileRes.json();
    check("2. Autentikasi", "Query Profile (/auth/me)", profileRes.status === 200 && !!profileData.name, `Nama: ${profileData.name}`);
  } catch (err: any) {
    check("2. Autentikasi", "Auth Flow", false, err.message);
  }

  const ownerHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ownerToken}`,
  };

  const adminHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken}`,
  };

  // 3. BATCH PENGIRIMAN
  let testBatchId = 1;
  try {
    const listBatchesRes = await fetch(`${API_BASE}/batches`, { headers: adminHeaders });
    const batches = await listBatchesRes.json();
    check("3. Batch Pengiriman", "List Semua Batch", listBatchesRes.status === 200 && Array.isArray(batches), `Total: ${batches.length} batch`);

    // Create New Test Batch
    const createBatchRes = await fetch(`${API_BASE}/batches`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        namaKapal: `KM Dobonsolo Uji ${Date.now().toString().slice(-4)}`,
        etd: "2026-09-25",
        periodeClosingMulai: "2026-09-15",
        periodeClosingSelesai: "2026-09-23",
        kotaAsal: "Jakarta",
        tujuan: "Manokwari",
      }),
    });
    const createdBatch = await createBatchRes.json();
    if (createdBatch.id) testBatchId = createdBatch.id;
    check("3. Batch Pengiriman", "Buat Batch Baru (Owner)", createBatchRes.status === 201 && !!createdBatch.id, `Batch ID: ${createdBatch.id}`);
  } catch (err: any) {
    check("3. Batch Pengiriman", "Batch Ops", false, err.message);
  }

  // 4. INPUT PAKET (SATUAN, BULK/GRUP, & KALKULASI ONGKIR)
  let createdPkgIds: number[] = [];
  try {
    // 4.1 Input Paket Pesawat Satuan
    const pkg1Res = await fetch(`${API_BASE}/packages`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        customerName: "Budi Santoso",
        customerPhone: "081234567890",
        itemName: "Sepatu Olahraga & Pakaian",
        resiNumber: `RESI-AIR-${Date.now()}`,
        serviceType: "jastip pesawat",
        deliveryRoute: "Jakarta → Manokwari",
        realWeight: 1.2,
        length: 30,
        width: 20,
        height: 15,
        packagingType: "kardus",
        additionalFee: 5000,
        additionalFeeReason: "Paking bubble wrap",
        batchId: testBatchId,
      }),
    });
    const pkg1 = await pkg1Res.json();
    if (pkg1.id) createdPkgIds.push(pkg1.id);
    check("4. Input Paket", "Input Satuan Jastip Pesawat", pkg1Res.status === 201 && pkg1.totalShipping > 0, `ID: ${pkg1.id}, Ongkir: Rp${pkg1.totalShipping}`);

    // 4.2 Input Paket Pelni Satuan
    const pkg2Res = await fetch(`${API_BASE}/packages`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        customerName: "Budi Santoso",
        customerPhone: "081234567890",
        itemName: "Alat Elektronik Monitor",
        resiNumber: `RESI-PELNI-${Date.now()}`,
        serviceType: "jastip pelni",
        deliveryRoute: "Surabaya → Manokwari",
        realWeight: 4.5,
        length: 50,
        width: 40,
        height: 20,
        packagingType: "kayu",
        additionalFee: 15000,
        additionalFeeReason: "Paking kayu proteksi",
        batchId: testBatchId,
      }),
    });
    const pkg2 = await pkg2Res.json();
    if (pkg2.id) createdPkgIds.push(pkg2.id);
    check("4. Input Paket", "Input Satuan Jastip Pelni (Kayu)", pkg2Res.status === 201 && pkg2.totalShipping > 0, `ID: ${pkg2.id}, Ongkir: Rp${pkg2.totalShipping}`);

    // 4.3 Input Bulk / Import
    const bulkRes = await fetch(`${API_BASE}/packages/bulk`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        batchId: testBatchId,
        packages: [
          {
            customerName: "Siti Aminah",
            customerPhone: "081399887766",
            itemName: "Kosmetik & Skincare Paket 1",
            resiNumber: `RESI-GRP1-${Date.now()}`,
            serviceType: "jastip hemat+",
            deliveryRoute: "Jakarta → Manokwari",
            realWeight: 0.8,
            length: 15,
            width: 10,
            height: 10,
            packagingType: "plastik",
            additionalFee: 0,
          },
          {
            customerName: "Siti Aminah",
            customerPhone: "081399887766",
            itemName: "Kosmetik & Skincare Paket 2",
            resiNumber: `RESI-GRP2-${Date.now()}`,
            serviceType: "jastip hemat+",
            deliveryRoute: "Jakarta → Manokwari",
            realWeight: 1.1,
            length: 20,
            width: 15,
            height: 10,
            packagingType: "plastik",
            additionalFee: 0,
          },
        ],
      }),
    });
    const bulkData = await bulkRes.json();
    check("4. Input Paket", "Input Bulk / Import Jastip Hemat+ (Multi-Resi)", bulkRes.status === 200 && bulkData.success === 2, `Success: ${bulkData.success}, Total: ${bulkData.total}`);
  } catch (err: any) {
    check("4. Input Paket", "Package Creation", false, err.message);
  }

  // 5. BARCODE & LABEL CETAK
  try {
    const barcodeRes = await fetch(`${API_BASE}/packages?batchId=${testBatchId}`, { headers: adminHeaders });
    const barcodeData = await barcodeRes.json();
    const batchPkgs = Array.isArray(barcodeData) ? barcodeData : barcodeData.packages ?? [];
    const allHaveBarcode = batchPkgs.length > 0 && batchPkgs.every((p: any) => p.barcode && p.barcode.startsWith("JAJ-"));
    check("5. Label Barcode", "Barcode Otomatis Tiap Paket", allHaveBarcode, `Total Paket Berbarcode: ${batchPkgs.length}`);
  } catch (err: any) {
    check("5. Label Barcode", "Barcode Check", false, err.message);
  }

  // 6. VERIFIKASI PAKET (SCAN INDIVIDUAL & QR GRUP)
  try {
    if (createdPkgIds.length > 0) {
      const targetPkgId = createdPkgIds[0];
      const verifyRes = await fetch(`${API_BASE}/packages/${targetPkgId}/verify`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ verified: true }),
      });
      const verifyData = await verifyRes.json();
      check("6. Verifikasi Paket", "Verifikasi Fisik Paket Individual", verifyRes.status === 200 && verifyData.status === "verified", `Status: ${verifyData.status}`);
    }
  } catch (err: any) {
    check("6. Verifikasi Paket", "Verification", false, err.message);
  }

  // 7. SHIFT KASIR
  let shiftSessionId = 0;
  try {
    const checkShift = await fetch(`${API_BASE}/shifts/current`, { headers: adminHeaders });
    const currShift = await checkShift.json();
    if (currShift.shift?.status === "OPEN") {
      shiftSessionId = currShift.shift.id;
    } else {
      const openShiftRes = await fetch(`${API_BASE}/shifts/open`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          shiftType: "PAGI",
          openingBalance: 150000,
          terminalId: "TERM-TEST-01",
        }),
      });
      const shiftData = await openShiftRes.json();
      shiftSessionId = shiftData.shift?.id || shiftData.id;
    }
    check("7. Shift Kasir", "Status Shift Kasir Aktif", !!shiftSessionId, `Shift ID: ${shiftSessionId}`);
  } catch (err: any) {
    check("7. Shift Kasir", "Shift Operations", false, err.message);
  }

  // 8. TRANSAKSI PEMBAYARAN, PIUTANG, & CETAK STRUK
  let createdTrxId = 0;
  try {
    if (createdPkgIds.length > 0) {
      const payPkgId = createdPkgIds[0];
      const payRes = await fetch(`${API_BASE}/transactions`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          customerName: "Budi Santoso",
          packageIds: [payPkgId],
          paymentMethod: "tunai",
          paymentType: "PELUNASAN_LANGSUNG",
          paidAmount: 200000,
          idempotencyKey: `test-trx-${Date.now()}`,
        }),
      });
      const payData = await payRes.json();
      createdTrxId = payData.transaction?.id;
      check("8. Transaksi Kasir", "Transaksi Tunai Lunas & Kembalian", payRes.status === 201 && payData.transaction?.paymentStatus === "LUNAS", `Trx No: ${payData.transaction?.transactionNo}, Kembalian: Rp${payData.payment?.changeAmount}`);

      const receiptRes = await fetch(`${API_BASE}/transactions/${createdTrxId}/receipt`, { headers: adminHeaders });
      const receiptData = await receiptRes.json();
      check("8. Transaksi Kasir", "Penerbitan Format Struk Kasir", receiptRes.status === 200 && !!receiptData.transaction, `Struk No: ${receiptData.transaction?.transactionNo}`);
    }
  } catch (err: any) {
    check("8. Transaksi Kasir", "Transaction Flow", false, err.message);
  }

  // 9. PENERBITAN INVOICE A4 (MANUAL & DARI TRANSAKSI)
  let createdInvoiceId = 0;
  try {
    // 9.1 Package Map
    const mapRes = await fetch(`${API_BASE}/invoices/package-map`, { headers: adminHeaders });
    const mapData = await mapRes.json();
    check("9. Invoice A4", "Mapping Penanda Invoice Paket", mapRes.status === 200 && typeof mapData === "object", `Total Map Keys: ${Object.keys(mapData).length}`);

    // 9.2 Create Invoice from Packages
    if (createdPkgIds.length >= 2) {
      const invRes = await fetch(`${API_BASE}/invoices`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          packageIds: [createdPkgIds[1]],
          customerName: "Budi Santoso",
          customerPhone: "081234567890",
          notes: "Invoice resmi pengiriman jastip",
          discount: 2000,
          downPayment: 10000,
          reason: "Tagihan A4 Jastip",
        }),
      });
      const invData = await invRes.json();
      createdInvoiceId = invData.id;
      check("9. Invoice A4", "Penerbitan Invoice Manual A4", invRes.status === 201 && !!createdInvoiceId, `Invoice No: ${invData.invoiceNo}, Status: ${invData.status}`);

      // 9.3 Print Invoice Document Snapshot
      const printRes = await fetch(`${API_BASE}/invoices/${createdInvoiceId}/print`, {
        method: "POST",
        headers: adminHeaders,
      });
      const printData = await printRes.json();
      check("9. Invoice A4", "Render & Snapshot Cetak Invoice A4", printRes.status === 200 && !!printData.invoice, `Invoice No: ${printData.invoice?.invoiceNo}`);
    }
  } catch (err: any) {
    check("9. Invoice A4", "Invoice Operations", false, err.message);
  }

  // 10. VOID TRANSAKSI & REVERSAL KAS
  try {
    if (createdTrxId > 0) {
      const reqVoidRes = await fetch(`${API_BASE}/transactions/${createdTrxId}/void`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          reasonCode: "Salah pilih paket customer",
          notes: "Permohonan pembatalan oleh admin",
        }),
      });
      const voidReqData = await reqVoidRes.json();
      const voidId = voidReqData.id;
      check("10. Transaksi & VOID", "Pengajuan VOID oleh Admin", reqVoidRes.status === 201 && !!voidId, `Void Request ID: ${voidId}`);

      const approveRes = await fetch(`${API_BASE}/voids/${voidId}/approve`, {
        method: "POST",
        headers: ownerHeaders,
      });
      const approveData = await approveRes.json();
      check("10. Transaksi & VOID", "Persetujuan VOID & Reversal Saldo Kas oleh Owner", approveRes.status === 200 && approveData.void?.statusAfter === "VOID", `Reversal: Rp${approveData.void?.reversalAmount}`);
    }
  } catch (err: any) {
    check("10. Transaksi & VOID", "Void Workflow", false, err.message);
  }

  // 11. PENGELUARAN HARIAN OPERASIONAL
  try {
    const createExpRes = await fetch(`${API_BASE}/pengeluaran`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        nominal: 45000,
        kategori: "operasional",
        keterangan: "Beli lakban cokelat & karung packing",
        metodePembayaran: "cash",
      }),
    });
    const expData = await createExpRes.json();
    check("11. Pengeluaran Harian", "Pencatatan Pengeluaran Kas Operasional", createExpRes.status === 201 && !!expData.id, `ID: ${expData.id}, Nominal: Rp${expData.nominal}`);

    const listExpRes = await fetch(`${API_BASE}/pengeluaran`, { headers: ownerHeaders });
    const listExpData = await listExpRes.json();
    check("11. Pengeluaran Harian", "List Riwayat Pengeluaran Kas", listExpRes.status === 200 && Array.isArray(listExpData), `Total Data: ${listExpData.length}`);
  } catch (err: any) {
    check("11. Pengeluaran Harian", "Expense Operations", false, err.message);
  }

  // 12. PENGATURAN TARIF & AUDIT TRAIL
  try {
    const listTarifRes = await fetch(`${API_BASE}/tarif`, { headers: ownerHeaders });
    const tarifData = await listTarifRes.json();
    check("12. Pengaturan Tarif", "Daftar Tarif Aktif", listTarifRes.status === 200, `Layanan Terkonfigurasi: ${Object.keys(tarifData).length}`);

    const historyRes = await fetch(`${API_BASE}/tarif/history`, { headers: ownerHeaders });
    const historyData = await historyRes.json();
    check("12. Pengaturan Tarif", "Histori Audit Perubahan Tarif", historyRes.status === 200 && Array.isArray(historyData), `Total Log Histori: ${historyData.length}`);
  } catch (err: any) {
    check("12. Pengaturan Tarif", "Tariff Settings", false, err.message);
  }

  // 13. MANAJEMEN USER & ADMIN (OWNER ACCESS)
  try {
    const listUsersRes = await fetch(`${API_BASE}/users`, { headers: ownerHeaders });
    const usersData = await listUsersRes.json();
    check("13. Manajemen User", "List Data Admin & Staf (Owner)", listUsersRes.status === 200 && Array.isArray(usersData), `Total User: ${usersData.length}`);
  } catch (err: any) {
    check("13. Manajemen User", "Users Operations", false, err.message);
  }

  // 14. LAPORAN OPERASIONAL & KEUANGAN
  try {
    const reportsRes = await fetch(`${API_BASE}/reports/summary`, { headers: ownerHeaders });
    const repData = await reportsRes.json();
    check("14. Laporan & Keuangan", "Ringkasan Laporan Laba/Rugi & Arus Kas", reportsRes.status === 200, `Status Laporan: OK`);
  } catch (err: any) {
    check("14. Laporan & Keuangan", "Reports Operations", false, err.message);
  }

  console.log("================================================================================");
  const totalPassed = testResults.filter((r) => r.passed).length;
  const totalFailed = testResults.filter((r) => !r.passed).length;
  console.log(`HASIL AKHIR: ${totalPassed} LULUS, ${totalFailed} GAGAL dari ${testResults.length} pengujian.`);
  console.log("================================================================================");

  process.exit(totalFailed > 0 ? 1 : 0);
}

runComprehensiveTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
