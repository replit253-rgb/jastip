Progres Pembaruan Sistem Jastip Anggun Jaya
Terakhir diperbarui: 2026-09-09

## Ringkasan Status

| Fase | Status | Selesai | Blocker |
|---|---|---:|---|
| 0 — Persiapan Skema Database | Selesai | 100% | — |
| 1 — Shift Kasir | Selesai | 100% | — |
| 2 — Transaksi/Payment | Selesai | 100% | — |
| 3 — VOID | Selesai | 100% | — |
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
- Hard delete paket dan batch sekarang hanya dapat dilakukan Owner; Admin menerima 403 dan tombol hapus permanen disembunyikan. Edit/input normal Admin tetap diizinkan.
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
- UAT-14 dan UAT-15: typecheck API/web/libs, build API/web, database push, dan smoke endpoint berhasil. Verifikasi interaktif autentikasi/dua akun telah dibuktikan dengan login akun Owner/Admin pada sesi sebelumnya.
- Workflow artifact API duplikat tidak dapat dihapus karena dikelola artifact manager; ini bukan workflow utama aplikasi dan tetap gagal hanya karena bentrok port 8080.

## Laporan Akhir Fase 2 — Transaksi & Payment

### Ringkasan kerjaan

- Bootstrap database development diselesaikan ulang secara idempotent: schema push, migrasi batch legacy/service type, dan seed 6 akun demo.
- Dependency workspace dipasang ulang dari `pnpm-lock.yaml`. Workflow utama `API Server` (port 8080) dan `Start application` (port 5000) direstart dan terkonfirmasi RUNNING.
- Jalur transaksi piutang dan multi-payment diverifikasi pada transaksi nyata. Alur VOID dan hard delete Owner-only diselesaikan setelah keputusan Owner.

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
- Fase 3 (VOID) selesai setelah keputusan Owner tentang hard delete diterapkan.

## Laporan Akhir Fase 3 — VOID & hard delete

- `DELETE /api/packages/:id` dan `PATCH /api/batches/:id` dengan `statusBatch=HAPUS` memakai guard Owner-only. Admin mendapat HTTP 403 dengan pesan yang jelas.
- Tombol hard delete disembunyikan pada halaman Admin; Owner tetap dapat menghapus paket/batch secara permanen.
- `settings.cash_variance_tolerance` tetap default Rp0 dan sekarang dapat diubah Owner melalui `/owner/settings` tanpa wajib mengubah tarif kargo. Histori nilai lama, nilai baru, user, waktu, dan alasan tercatat di `tarif_history`.
- `POST /api/transactions/:id/void` dan approval Owner menyelesaikan alur VOID: alasan wajib, transaksi menjadi `VOID`, paket dikembalikan ke pending, reversal `VOID_REVERSAL` tercatat, serta VOID pasca-closing ditandai sebagai koreksi.
- UAT-07: LULUS dengan bukti runtime konkret. Shift 3 dibuka dengan saldo awal Rp0; transaksi nyata `TRX-20260909-00003` (ID 3) dibayar penuh tunai Rp100.000. Query SQL langsung sebelum VOID: `cash_received=Rp100.000`, `refund_cash=Rp0`, `system_cash=Rp100.000`. Setelah VOID ID 3 disetujui Owner, status transaksi `AKTIF → VOID`, paket ID 3 kembali ke `pending`/`BELUM_DIAMBIL`, `voids.reversal_amount=Rp100.000`, dan reversal payment `VOID_REVERSAL` bernilai `-Rp100.000`. Query langsung sesudah VOID: `refund_cash=Rp100.000`, `system_cash=Rp0`. Closing blind dengan `actual_cash=Rp0` menghasilkan `systemCash=Rp0`, `selisih=Rp0`, `SESUAI`. Row transaksi, payment asli, reversal, dan void tetap ada di database. Uji VOID ganda pada `TRX-20260909-00002` (ID 2) ditolak HTTP 400: `Transaksi sudah VOID dan tidak dapat diajukan ulang`. VOID transfer pada shift 2 juga diverifikasi tidak memengaruhi kas fisik: `system_cash` sebelum/sesudah Rp0 dan closing Rp0 menghasilkan `SESUAI`.
