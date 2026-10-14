import {
  db,
  pengeluaranTable,
  paymentsTable,
  transactionsTable,
  shiftSessionsTable,
  usersTable,
  voidRequestsTable,
} from "@workspace/db";
import { eq, desc, asc, and, gte, lte } from "drizzle-orm";

async function runAudit() {
  console.log("=== MEMULAI AUDIT MENDALAM DATABASE (READ-ONLY) ===");

  // 1. PENGELUARAN
  const pengeluaranRows = await db.select().from(pengeluaranTable);
  console.log("\n--- 1. PENGELUARAN ---");
  console.log("Total pengeluaran tercatat:", pengeluaranRows.length);
  if (pengeluaranRows.length > 0) {
    console.log("Contoh row pengeluaran:", JSON.stringify(pengeluaranRows[0], null, 2));
  }
  const hasShiftId = pengeluaranRows[0] && 'shiftSessionId' in pengeluaranRows[0];
  const hasDicatatOleh = pengeluaranRows[0] && 'dicatatOleh' in pengeluaranRows[0];
  console.log("Apakah ada kolom shiftSessionId di pengeluaran?", hasShiftId);
  console.log("Apakah ada kolom dicatatOleh di pengeluaran?", hasDicatatOleh);

  // 20 shift CLOSED terakhir
  const closedShifts = await db
    .select()
    .from(shiftSessionsTable)
    .where(eq(shiftSessionsTable.status, "CLOSED"))
    .orderBy(desc(shiftSessionsTable.id))
    .limit(20);

  console.log("\n--- 20 Shift CLOSED Terakhir ---", closedShifts.length);
  for (const shift of closedShifts) {
    const start = shift.actualStart ?? shift.createdAt;
    const end = shift.actualEnd ?? new Date();
    const shiftExp = pengeluaranRows.filter((e) => {
      const t = e.createdAt ? new Date(e.createdAt) : null;
      return t && t >= start && t <= end;
    });
    console.log(`Shift ID #${shift.id} (Admin #${shift.adminId}, ${shift.actualStart} - ${shift.actualEnd}): ${shiftExp.length} pengeluaran, total nominal: ${shiftExp.reduce((s, x) => s + Number(x.nominal || 0), 0)}`);
  }

  // 2. METODE PIUTANG
  const allPayments = await db.select().from(paymentsTable);
  console.log("\n--- 2. METODE PIUTANG ---");
  const piutangPayments = allPayments.filter(
    (p) => (p.paymentMethod === "piutang" || !["tunai", "transfer", "qris"].includes(String(p.paymentMethod))) && Number(p.paidAmount ?? 0) > 0
  );
  console.log("Jumlah payment metode piutang / lainnya dengan paidAmount > 0:", piutangPayments.length);
  console.log("10 Contoh baris piutang:", JSON.stringify(piutangPayments.slice(0, 10), null, 2));

  // 3. KONSISTENSI TUNAI
  console.log("\n--- 3. KONSISTENSI TUNAI ---");
  const cashPays = allPayments.filter((p) => p.paymentMethod === "tunai" || p.paymentType === "tunai");
  let inconsistentCount = 0;
  let totalDiff = 0;
  const inconsistencies: any[] = [];
  for (const p of cashPays) {
    const paid = Number(p.paidAmount ?? p.totalAmount);
    const change = Number(p.changeAmount ?? 0);
    const total = Number(p.totalAmount ?? 0);
    if ((paid - change !== total) && p.paymentType !== "VOID_REVERSAL") {
      inconsistentCount++;
      const diff = Math.abs((paid - change) - total);
      totalDiff += diff;
      inconsistencies.push({ id: p.id, type: p.paymentType, paid, change, total, diff });
    }
  }
  console.log("Jumlah inkonsistensi (paid - change !== total):", inconsistentCount, "Total selisih:", totalDiff);
  if (inconsistencies.length > 0) {
    console.log("Contoh inkonsistensi:", JSON.stringify(inconsistencies.slice(0, 5), null, 2));
  }

  // 4. HITUNG GANDA TOTAL
  console.log("\n--- 4. HITUNG GANDA TOTAL (receivableOmzet in totalPaymentsReceived) ---");
  console.log("Analisis: receivableOmzet menjumlahkan semua PELUNASAN_PIUTANG terlepas dari metodenya.");
  console.log("Jika pelunasan piutang dibayar tunai, ia sudah masuk di cashOmzet (dan cashReceived), lalu ditambahkan lagi via receivableOmzet ke totalPaymentsReceived.");

  // 5. VOID
  console.log("\n--- 5. VOID ---");
  const voidReqs = await db.select().from(voidRequestsTable);
  console.log("Total void requests:", voidReqs.length);
  const reversals = allPayments.filter((p) => p.paymentType === "VOID_REVERSAL");
  console.log("Total VOID_REVERSAL payments:", reversals.length);
  for (const rev of reversals) {
    const trx = await db.select().from(transactionsTable).where(eq(transactionsTable.id, rev.transactionId!)).limit(1);
    console.log(`Reversal Payment #${rev.id}: transactionId #${rev.transactionId}, shiftSessionId #${rev.shiftSessionId}, original transaction shiftSessionId #${trx[0]?.shiftSessionId}`);
  }

  // 6. KOLOM WAKTU
  console.log("\n--- 6. KOLOM WAKTU ---");
  console.log("Tipe data waktu: pengeluaran.createdAt, shift_sessions.actualStart/actualEnd, payments.createdAt menggunakan TIMESTAMP / DATETIME disimpan sebagai UTC timestamp atau ISO string, dibandingkan secara direct comparison (> / <) di JavaScript.");

  // 7. SHIFT #32
  console.log("\n--- 7. SHIFT #32 (Admin Wina, 14 Okt 2026) ---");
  const shift32 = closedShifts.find((s) => s.id === 32) || closedShifts[0];
  if (shift32) {
    console.log("Shift ditemukan:", shift32);
    const summaryShift32 = await db.select().from(paymentsTable).where(eq(paymentsTable.shiftSessionId, shift32.id));
    console.log("Payments di shift #32:", summaryShift32.length);
  } else {
    console.log("Shift 32 tidak ada dalam 20 shift terakhir.");
  }

  console.log("=== AUDIT SELESAI ===");
}

runAudit().catch(console.error);
