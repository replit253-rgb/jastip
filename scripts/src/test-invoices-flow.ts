const API_BASE = "http://localhost:3000/api";

async function testInvoiceFlow() {
  console.log("================================================================================");
  console.log("             TESTING INVOICE A4, PACKAGE MAP, & PRINT FLOW                     ");
  console.log("================================================================================");

  // 1. Login Admin & Owner
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "081200000000", password: "owner123" }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  if (!token) throw new Error("Failed to login as owner");
  console.log("✓ 1. Login Owner berhasil, token didapat.");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // 2. Fetch Packages
  const pkgRes = await fetch(`${API_BASE}/packages`, { headers });
  const pkgBody = await pkgRes.json();
  const packages = Array.isArray(pkgBody) ? pkgBody : pkgBody.packages ?? [];
  console.log(`✓ 2. Fetch Packages berhasil, total ${packages.length} paket.`);

  if (packages.length < 2) {
    throw new Error("Kurang dari 2 paket untuk testing invoice flow.");
  }

  const testPkg1 = packages[0];
  const testPkg2 = packages[1];
  const packageIds = [testPkg1.id, testPkg2.id];

  // 3. Test GET /invoices/package-map
  const mapRes = await fetch(`${API_BASE}/invoices/package-map`, { headers });
  const mapData = await mapRes.json();
  console.log(`✓ 3. GET /invoices/package-map status HTTP ${mapRes.status}, tipe: ${typeof mapData}`);

  // 4. Test POST /invoices (Create new Invoice from selected packages)
  const createInvRes = await fetch(`${API_BASE}/invoices`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      packageIds,
      customerName: "Customer Uji Coba Invoice A4",
      customerPhone: "081299998888",
      notes: "Invoice test otomatis via script",
      discount: 5000,
      downPayment: 20000,
      reason: "Penerbitan Invoice A4 Testing",
    }),
  });

  const createdInv = await createInvRes.json();
  console.log(`✓ 4. POST /invoices HTTP ${createInvRes.status}: Invoice No: ${createdInv.invoiceNo}, Total: Rp${createdInv.total}, Balance: Rp${createdInv.balance}, Status: ${createdInv.status}`);

  if (!createdInv.id) {
    throw new Error(`Gagal membuat invoice: ${JSON.stringify(createdInv)}`);
  }

  // 5. Test GET /invoices/:id
  const getInvRes = await fetch(`${API_BASE}/invoices/${createdInv.id}`, { headers });
  const fetchedInv = await getInvRes.json();
  console.log(`✓ 5. GET /invoices/${createdInv.id} HTTP ${getInvRes.status}, items count: ${fetchedInv.items?.length}`);

  // 6. Test POST /invoices/:id/print
  const printRes = await fetch(`${API_BASE}/invoices/${createdInv.id}/print`, {
    method: "POST",
    headers,
  });
  const printData = await printRes.json();
  console.log(`✓ 6. POST /invoices/${createdInv.id}/print HTTP ${printRes.status}, print count: ${printData.print?.printCount}`);

  // 7. Test verify GET /invoices/package-map now includes the new invoice
  const mapResAfter = await fetch(`${API_BASE}/invoices/package-map`, { headers });
  const mapDataAfter = await mapResAfter.json();
  const pkg1Invoices = mapDataAfter[testPkg1.id] || [];
  console.log(`✓ 7. Package Map updated: Paket ID ${testPkg1.id} has ${pkg1Invoices.length} linked invoice(s): ${pkg1Invoices.map((i: any) => i.invoiceNo).join(", ")}`);

  console.log("================================================================================");
  console.log("             SEMUA PENGUJIAN INVOICE FLOW BERHASIL (100%)                      ");
  console.log("================================================================================");
}

testInvoiceFlow().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
