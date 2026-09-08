Progres Pembaruan Sistem Jastip Anggun Jaya
Terakhir diperbarui: 2026-09-08

## Ringkasan Status

| Fase | Status | Selesai | Blocker |
|---|---|---:|---|
| 0 — Persiapan Skema Database | Selesai | 100% | — |
| 1 — Shift Kasir | Belum mulai | 0% | Menunggu konfirmasi laporan Fase 0 |
| 2 — Transaksi/Payment | Belum mulai | 0% | Tunggu Fase 1 |
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
