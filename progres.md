Progres Pembaruan Sistem Jastip Anggun Jaya
Terakhir diperbarui: 2026-09-09

## Ringkasan Status

| Fase | Status | Selesai | Blocker |
|---|---|---:|---|
| 0 — Persiapan Skema Database | Selesai | 100% | — |
| 1 — Shift Kasir | Selesai | 100% | — |
| 2 — Transaksi/Payment | Selesai | 100% | — |
| 3 — VOID | Belum mulai | 0% | Tunggu Fase 2 dan keputusan hard delete |
| 4 — Harga Minimum | Belum mulai | 0% | Independen, belum dimulai |
| 5 — Nominal Cepat | Belum mulai | 0% | Independen, belum dimulai |
| 6 — Struk | Belum mulai | 0% | Tunggu Fase 1–2 |
| 7 — Invoice A4 | Belum mulai | 0% | Tunggu Fase 2 |
| 8 — Fix Export | Belum mulai | 0% | Independen, belum dimulai |

## Catatan Fase 0

- Schema baru dan migration additive berhasil diterapkan ke database development.
- Tujuh tabel fondasi dibuat: `shift_sessions`, `transactions`, `voids`, `invoices`, `invoice_items`, `print_logs`, dan `settings_shipping_minimum`.
- `payments` mendapat `shift_session_id` dan `transaction_id`, keduanya nullable untuk transisi bertahap.
- Backfill payment legacy bersifat idempotent dan tidak menemukan row yang perlu diproses pada database development.
- Perilaku hard delete paket dan batch tetap dipertahankan sampai Fase 3.
- UAT relevan: database reachable, schema terverifikasi, API health 200, endpoint paket/payment/batch tetap hidup dan menolak request tanpa autentikasi dengan 401.
- Validasi tambahan: typecheck API/web/libs dan build API/web berhasil. Typecheck workspace `scripts` masih memiliki dua error baseline di `seed-batch2.ts` yang tidak terkait Fase 0.

## Catatan Fase 1

- Schema `shift_closings` dan `shift_handovers` berhasil ditambahkan secara additive dan dipush ke database development.
- Backend menyediakan buka shift, status shift, blind closing dua langkah, serah terima dua pihak, dan perhitungan kas.
- Mutation payment sekarang menolak request tanpa shift aktif dengan kode `ACTIVE_SHIFT_REQUIRED`; payment yang berhasil menyimpan `shift_session_id`.
- Toleransi selisih tersimpan di `settings.cash_variance_tolerance`, default Rp0, dan dapat diubah Owner melalui Pengaturan.
- UI menyediakan Buka Shift, status shift di header, dashboard shift, input pecahan untuk closing, dan halaman serah terima.
- Menu Scan disembunyikan ketika tidak ada shift aktif.
- Refund/setoran tunai belum memiliki sumber data pada sistem existing sehingga komponen rumus tersebut sementara bernilai nol.
- UAT-14 dan UAT-15: typecheck API/web/libs, build API/web, database push, dan smoke endpoint berhasil. Verifikasi interaktif autentikasi/dua akun masih memerlukan kredensial UAT Owner/Admin.
- Workflow artifact API duplikat tidak dapat dihapus karena dikelola artifact manager; ini bukan workflow utama aplikasi dan tetap gagal hanya karena bentrok port 8080.

## Laporan Akhir Fase 2 — Transaksi & Payment

### Ringkasan kerjaan

- Bootstrap database development diselesaikan ulang secara idempotent: schema push, migrasi batch legacy/service type, dan seed 6 akun demo.
- Dependency workspace dipasang ulang dari `pnpm-lock.yaml`. Workflow utama `API Server` (port 8080) dan `Start application` (port 5000) direstart dan terkonfirmasi RUNNING.
- Jalur transaksi piutang dan multi-payment diverifikasi pada transaksi nyata. Tidak ada perubahan pada alur VOID, `DELETE /api/packages/:id`, atau `PATCH /api/batches/:id` dengan `statusBatch=HAPUS`.

### UAT-12 dan UAT-13 — angka aktual

Skenario memakai transaksi `TRX-20260908-00001`, `transaction_id=1`, total Rp500.000:

| Tahap | Aksi | total | sisa_piutang | payment_status | Jumlah payment | Jumlah transaction |
|---|---|---:|---:|---|---:|---:|
| Awal | Transaksi piutang dibuat, belum bayar | Rp500.000 | Rp500.000 | `BELUM_BAYAR` | 0 | 1 |
| Cicilan pertama | Bayar tunai Rp200.000 | Rp500.000 | Rp300.000 | `BAYAR_SEBAGIAN` | 1 | 1 |
| Cicilan kedua | Bayar tunai Rp300.000 | Rp500.000 | Rp0 | `LUNAS` | 2 | 1 |

Validasi tambahan: `transaction_id` tetap 1 pada kedua payment, `matching_transaction_rows=1`, dan jumlah transaksi berubah hanya saat pembuatan awal (`0 → 1`), bukan saat cicilan kedua.

### Verifikasi seed-batch2.ts

- `git diff -- scripts/src/seed-batch2.ts` kosong (`exit 0`).
- Histori tracked script hanya menunjukkan nilai `statusBatch: "ARSIP"`; tidak ada `ARCHIVED` pada file aktif.
- Schema batch tetap `enum: ["OPEN", "CLOSED", "ARSIP"]`; tidak ada diff schema enum.
- `seed-batch2.ts` tidak dijalankan selama bootstrap/UAT. Migrasi hanya membuat batch legacy `ARSIP` dan tidak mengubah enum; row count packages sebelum/sesudah migrasi tetap 0.
- Kesimpulan: perubahan `ARCHIVED → ARSIP` adalah perbaikan tipe pada script seed saja, bukan perubahan enum dan bukan perubahan data batch development atau data lama hasil migrasi.

### Smoke test penutup dan tampilan Owner

- `/api/healthz` → HTTP 200, `{"status":"ok"}`.
- `/api/packages` → sukses terautentikasi, 1 row.
- `/api/payments` → sukses terautentikasi, 2 rows.
- `/api/batches` → sukses terautentikasi, 2 rows.
- `/api/transactions` → sukses terautentikasi, 1 row.
- Typecheck workspace, build API, dan build frontend → lulus.
- Workflow utama: `API Server=RUNNING (8080)`, `Start application=RUNNING (5000)`. Workflow artifact duplikat tetap FAILED karena bentrok port/auto-managed; tidak digunakan sebagai workflow utama.
- `/owner/dashboard` tervalidasi sebagai route Owner yang dilindungi: tanpa sesi menampilkan redirect ke `/login`; sesi Owner terautentikasi berhasil dipakai untuk API Owner dan UAT.

### Log Keputusan & Asumsi baru

- Database development yang kosong diperlakukan sebagai instance development aktif; bootstrap wajib diulang sebelum UAT bila tabel hilang/reset.
- `seed-batch2.ts` tidak dijalankan sebagai bagian smoke test agar tidak menambah batch/paket uji di luar skenario yang dikontrol.
- Fase 3 (VOID) belum dimulai dan menunggu review/approval eksplisit Owner atas laporan Fase 2.
