-- =========================================================================
-- SCRIPT EXPORT SQL READ-ONLY UNTUK AUDIT CLOSING SHIFT & KEUANGAN
-- Target Database: PostgreSQL (Staging / Lokal / Production Export)
-- Instruksi: Jalankan skrip ini melalui klien PostgreSQL (psql, DBeaver, pgAdmin)
-- atau gunakan perintah ekspor CSV PostgreSQL (\copy)
-- =========================================================================

-- 1. TABEL SHIFTS (20 Shift CLOSED Terakhir)
\echo '=== EXPORTING SHIFTS ==='
COPY (
  SELECT 
    s.id,
    s.admin_id AS "adminId",
    COALESCE(u.name, s.admin_id) AS "namaAdmin",
    s.shift_type AS "shiftType",
    s.actual_start AS "actualStart",
    s.actual_end AS "actualEnd",
    s.opening_balance AS "openingBalance",
    s.system_cash AS "systemCashTersimpan",
    s.actual_cash AS "actualCash",
    s.discrepancy AS "selisih",
    s.notes AS "alasanSelisih"
  FROM shift_sessions s
  LEFT JOIN users u ON u.id = s.admin_id
  WHERE s.status = 'CLOSED'
  ORDER BY s.actual_end DESC
  LIMIT 20
) TO STDOUT WITH CSV HEADER;

-- 2. TABEL PAYMENTS
\echo '=== EXPORTING PAYMENTS ==='
COPY (
  SELECT 
    p.id,
    p.transaction_id AS "transactionId",
    p.payment_type AS "paymentType",
    p.payment_method AS "paymentMethod",
    p.total_amount AS "totalAmount",
    p.paid_amount AS "paidAmount",
    p.change_amount AS "changeAmount",
    p.shift_session_id AS "shiftSessionId",
    p.admin_id AS "adminId",
    p.created_at AS "createdAt"
  FROM payments p
  ORDER BY p.created_at DESC
  LIMIT 1000
) TO STDOUT WITH CSV HEADER;

-- 3. TABEL TRANSACTIONS
\echo '=== EXPORTING TRANSACTIONS ==='
COPY (
  SELECT 
    t.id,
    t.transaction_no AS "transactionNo",
    t.total,
    t.payment_status AS "paymentStatus",
    t.transaction_status AS "transactionStatus",
    t.sisa_piutang AS "sisaPiutang",
    t.shift_session_id AS "shiftSessionId",
    t.cashier_id AS "cashierId",
    t.created_at AS "createdAt"
  FROM transactions t
  ORDER BY t.created_at DESC
  LIMIT 1000
) TO STDOUT WITH CSV HEADER;

-- 4. TABEL PENGELUARAN
\echo '=== EXPORTING PENGELUARAN ==='
COPY (
  SELECT 
    pg.id,
    pg.tanggal,
    pg.nominal,
    pg.metode_pembayaran AS "metodePembayaran",
    pg.dicatat_oleh AS "dicatatOleh",
    pg.created_at AS "createdAt"
  FROM pengeluaran pg
  ORDER BY pg.created_at DESC
  LIMIT 500
) TO STDOUT WITH CSV HEADER;

-- 5. TABEL VOID_REQUESTS
\echo '=== EXPORTING VOID_REQUESTS ==='
COPY (
  SELECT 
    vr.id,
    vr.transaction_id AS "transactionId",
    vr.reversal_amount AS "reversalAmount",
    vr.requested_by AS "requestedBy",
    vr.approved_by AS "approvedBy",
    vr.approved_at AS "approvedAt",
    vr.status_after AS "statusAfter"
  FROM void_requests vr
  ORDER BY vr.approved_at DESC
  LIMIT 200
) TO STDOUT WITH CSV HEADER;
