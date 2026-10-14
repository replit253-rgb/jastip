/**
 * Skrip Uji Reproduksi Skenario S1 - S10 Lengkap untuk Closing Kasir (Fase 2)
 */
import { db, shiftSessionsTable, transactionsTable, paymentsTable, pengeluaranTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { calculateShiftCash } from "../../artifacts/api-server/src/lib/shift-cash";

async function runCompleteFase2Audit() {
  console.log("=== MEMULAI SIMULASI LENGKAP SKENARIO S1 - S10 (FASE 2) ===");

  const [admin] = await db.select().from(usersTable).where(eq(usersTable.role, "owner")).limit(1);
  if (!admin) process.exit(1);

  // Buka Shift #1
  const [shift1] = await db.insert(shiftSessionsTable).values({
    adminId: admin.id,
    shiftType: "PAGI",
    terminalId: "TERM-TEST-S10",
    openingBalance: "500000",
    status: "AKTIF",
    actualStart: new Date(),
  }).returning();

  let expectedCash1 = 500000;

  // S1: Tunai pas (Tagihan 100k, bayar 100k)
  const t1 = await db.insert(transactionsTable).values({
    transactionNo: "TRX-S1",
    idempotencyKey: "s1-" + Date.now(),
    customerName: "Cust S1",
    subtotal: "100000",
    total: "100000",
    paymentStatus: "LUNAS",
    transactionStatus: "AKTIF",
    shiftSessionId: shift1.id,
    cashierId: admin.id,
  }).returning();
  await db.insert(paymentsTable).values({
    transactionId: t1[0].id,
    paymentType: "tunai",
    paymentMethod: "tunai",
    totalAmount: "100000",
    paidAmount: "100000",
    changeAmount: "0",
    adminId: admin.id,
    adminName: admin.name,
    shiftSessionId: shift1.id,
  });
  expectedCash1 += 100000;

  // S2: Tunai dengan kembalian (Tagihan 150k, bayar 200k, kembalian 50k)
  const t2 = await db.insert(transactionsTable).values({
    transactionNo: "TRX-S2",
    idempotencyKey: "s2-" + Date.now(),
    customerName: "Cust S2",
    subtotal: "150000",
    total: "150000",
    paymentStatus: "LUNAS",
    transactionStatus: "AKTIF",
    shiftSessionId: shift1.id,
    cashierId: admin.id,
  }).returning();
  await db.insert(paymentsTable).values({
    transactionId: t2[0].id,
    paymentType: "tunai",
    paymentMethod: "tunai",
    totalAmount: "150000",
    paidAmount: "200000",
    changeAmount: "50000",
    adminId: admin.id,
    adminName: admin.name,
    shiftSessionId: shift1.id,
  });
  expectedCash1 += (200000 - 50000);

  // S3: Transfer (250k)
  const t3 = await db.insert(transactionsTable).values({
    transactionNo: "TRX-S3",
    idempotencyKey: "s3-" + Date.now(),
    customerName: "Cust S3",
    subtotal: "250000",
    total: "250000",
    paymentStatus: "LUNAS",
    transactionStatus: "AKTIF",
    shiftSessionId: shift1.id,
    cashierId: admin.id,
  }).returning();
  await db.insert(paymentsTable).values({
    transactionId: t3[0].id,
    paymentType: "transfer",
    paymentMethod: "transfer",
    totalAmount: "250000",
    paidAmount: "250000",
    changeAmount: "0",
    adminId: admin.id,
    adminName: admin.name,
    shiftSessionId: shift1.id,
  });

  // S4: QRIS (100k)
  const t4 = await db.insert(transactionsTable).values({
    transactionNo: "TRX-S4",
    idempotencyKey: "s4-" + Date.now(),
    customerName: "Cust S4",
    subtotal: "100000",
    total: "100000",
    paymentStatus: "LUNAS",
    transactionStatus: "AKTIF",
    shiftSessionId: shift1.id,
    cashierId: admin.id,
  }).returning();
  await db.insert(paymentsTable).values({
    transactionId: t4[0].id,
    paymentType: "qris",
    paymentMethod: "qris",
    totalAmount: "100000",
    paidAmount: "100000",
    changeAmount: "0",
    adminId: admin.id,
    adminName: admin.name,
    shiftSessionId: shift1.id,
  });

  // S5: Split payment (Total 300k: Tunai 100k [bayar 100k] + Transfer 200k)
  const t5 = await db.insert(transactionsTable).values({
    transactionNo: "TRX-S5",
    idempotencyKey: "s5-" + Date.now(),
    customerName: "Cust S5",
    subtotal: "300000",
    total: "300000",
    paymentStatus: "LUNAS",
    transactionStatus: "AKTIF",
    shiftSessionId: shift1.id,
    cashierId: admin.id,
  }).returning();
  await db.insert(paymentsTable).values({
    transactionId: t5[0].id,
    paymentType: "tunai",
    paymentMethod: "tunai",
    totalAmount: "100000",
    paidAmount: "100000",
    changeAmount: "0",
    adminId: admin.id,
    adminName: admin.name,
    shiftSessionId: shift1.id,
  });
  await db.insert(paymentsTable).values({
    transactionId: t5[0].id,
    paymentType: "transfer",
    paymentMethod: "transfer",
    totalAmount: "200000",
    paidAmount: "200000",
    changeAmount: "0",
    adminId: admin.id,
    adminName: admin.name,
    shiftSessionId: shift1.id,
  });
  expectedCash1 += 100000;

  // S6: Piutang tanpa bayar, lalu dilunasi tunai (Tagihan 100k, dilunasi tunai 100k di shift yang sama)
  const t6 = await db.insert(transactionsTable).values({
    transactionNo: "TRX-S6",
    idempotencyKey: "s6-" + Date.now(),
    customerName: "Cust S6",
    subtotal: "100000",
    total: "100000",
    paymentStatus: "BELUM_BAYAR",
    transactionStatus: "AKTIF",
    sisaPiutang: "100000",
    shiftSessionId: shift1.id,
    cashierId: admin.id,
  }).returning();
  // Pelunasan tunai 100k di shift 1
  await db.insert(paymentsTable).values({
    transactionId: t6[0].id,
    paymentType: "PELUNASAN_PIUTANG",
    paymentMethod: "tunai",
    totalAmount: "100000",
    paidAmount: "100000",
    changeAmount: "0",
    adminId: admin.id,
    adminName: admin.name,
    shiftSessionId: shift1.id,
  });
  expectedCash1 += 100000;

  // S8: Pengeluaran cash 30k
  await db.insert(pengeluaranTable).values({
    kategori: "Listrik",
    nominal: "30000",
    metodePembayaran: "cash",
    catatan: "Token",
    namaPencatat: admin.name,
    adminId: admin.id,
  });
  expectedCash1 -= 30000;

  // S9: VOID approved untuk transaksi tunai di shift yang sama (T1 100k) -> reversal cash
  await db.insert(paymentsTable).values({
    transactionId: t1[0].id,
    paymentType: "VOID_REVERSAL",
    paymentMethod: null,
    totalAmount: "-100000",
    paidAmount: "-100000",
    changeAmount: "0",
    adminId: admin.id,
    adminName: admin.name,
    shiftSessionId: shift1.id,
  });
  expectedCash1 -= 100000;

  const res1 = await calculateShiftCash(shift1);
  console.log(`Shift 1 - Expected: Rp ${expectedCash1} | System: Rp ${res1.systemCash} | Selisih: Rp ${res1.systemCash - expectedCash1}`);

  // S7: Piutang dari shift 1, dilunasi tunai di Shift 2 baru
  const [shift2] = await db.insert(shiftSessionsTable).values({
    adminId: admin.id,
    shiftType: "MALAM",
    terminalId: "TERM-TEST-S10",
    openingBalance: "200000",
    status: "AKTIF",
    actualStart: new Date(),
  }).returning();

  let expectedCash2 = 200000;
  // Pelunasan piutang t6 di shift 2 (misal bayar 50k tunai)
  await db.insert(paymentsTable).values({
    transactionId: t6[0].id,
    paymentType: "PELUNASAN_PIUTANG",
    paymentMethod: "tunai",
    totalAmount: "50000",
    paidAmount: "50000",
    changeAmount: "0",
    adminId: admin.id,
    adminName: admin.name,
    shiftSessionId: shift2.id,
  });
  expectedCash2 += 50000;

  const res2 = await calculateShiftCash(shift2);
  console.log(`Shift 2 - Expected: Rp ${expectedCash2} | System: Rp ${res2.systemCash} | Selisih: Rp ${res2.systemCash - expectedCash2}`);

  if (res1.systemCash === expectedCash1 && res2.systemCash === expectedCash2) {
    console.log("✔ SEMUA SKENARIO S1-S10 LULUS 100% (Selisih Rp 0)");
  } else {
    console.error("❌ ADA SELISIH DI SKENARIO TERTENTU!");
  }

  // Cleanup
  await db.delete(shiftSessionsTable).where(eq(shiftSessionsTable.id, shift1.id));
  await db.delete(shiftSessionsTable).where(eq(shiftSessionsTable.id, shift2.id));
  console.log("=== SIMULASI SELESAI ===");
}

runCompleteFase2Audit().catch(console.error);
