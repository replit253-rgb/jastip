Rencana Implementasi & Progres — Pembaruan Sistem Jastip Anggun Jaya

Untuk: AI coding agent yang mengerjakan pembaruan sistem Status dokumen: Living document — update checkbox [ ] → [x] setiap task selesai, dan isi kolom Catatan bila ada penyimpangan dari rencana. Basis: 3 dokumen rekomendasi Tim IT (shift kasir, piutang & closing, transaksi/struk/invoice) dipetakan ke kondisi sistem as-is (PRD reverse-engineered per 2026-09-08).

0. Cara Pakai Dokumen Ini (untuk AI agent)
Kerjakan fase secara berurutan (Fase 0 → Fase 8). Fase lebih besar bergantung pada tabel/endpoint dari fase sebelumnya (terutama shift_sessions dan transactions, yang jadi fondasi hampir semua fase lain).
Sebelum mengerjakan satu fase, baca ulang bagian "Prinsip Wajib" di bawah — semua fase harus tunduk pada prinsip ini.
Setiap task punya checkbox. Setelah task selesai dan diverifikasi (build jalan, tidak merusak fitur existing), centang dan tulis ringkas apa yang dilakukan di kolom Catatan Implementasi di bawah task tersebut.
Jika ada keputusan desain yang tidak dijelaskan dokumen (ambiguitas), jangan menebak diam-diam — tulis di bagian "Log Keputusan & Asumsi" di akhir file, lalu lanjutkan dengan asumsi yang paling konservatif (tidak menghapus data, tidak mengubah rumus ongkir existing).
Jangan hapus/rombak fitur yang sudah "Aktif" di PRD as-is kecuali dokumen sumber secara eksplisit memintanya (contoh: hard delete paket harus diganti pola VOID setelah ada pembayaran — lihat Fase 3).
Catatan Deployment:
- Staging TIDAK otomatis tersedia di Replit. Sebelum rilis ke pengguna nyata, staging harus dikonfigurasi manual sebagai instance/environment database terpisah dan diverifikasi tidak memakai database development atau production.
- Database development ditemukan kosong pada beberapa sesi kerja berbeda. Setiap sesi kerja baru WAJIB diawali dengan pengecekan apakah tabel Fase 0/1 sudah ada sebelum melanjutkan fase apa pun.
1. Prinsip Wajib (berlaku di semua fase)
Satu sumber data: total tagihan tidak boleh dihitung ulang dengan rumus berbeda di layar, Excel, PDF, struk, dan invoice. Semua turunan dari satu fungsi/query yang sama.
Tidak ada hard delete untuk data finansial. Setelah sebuah transaction memiliki payment, pembatalan wajib lewat VOID + reversal, bukan DELETE. (Ini mengubah invarian lama "Penghapusan paket adalah hard delete" — lihat Fase 3 untuk cakupan persisnya.)
Nilai uang disimpan sebagai angka (integer Rupiah), bukan string.
Waktu transaksi memakai WIT (Asia/Jayapura) secara konsisten di seluruh sistem (server, struk, invoice, laporan).
Pengaturan sensitif (harga minimum, toggle, VOID approval) hanya bisa diubah Owner atau role dengan hak eksplisit.
Setiap perubahan sensitif punya jejak audit: nilai lama, nilai baru, siapa, kapan, alasan — pola ini SUDAH ADA di tarif_history, jadikan itu cetakan (template) untuk semua audit trail baru.
2. Peta Existing vs Yang Perlu Dibangun (ringkasan acuan cepat)

Detail lengkap sudah dibahas di percakapan sebelumnya. Ringkasan cepat untuk agent:

Area	Reuse dari sistem lama	Bangun baru
Shift kasir	Identitas admin per aksi (admin_id)	Hampir semuanya: shift_sessions, blind closing, serah terima kas
Transaksi/payment	Tabel payments (paymentType, packageIds, totalAmount)	Tabel transactions terpisah, payment multi-record per transaksi, payment_type granular
VOID	POST /packages/:id/tolak (konsep beda, tidak cukup)	Tabel voids, approval PIN, reversal otomatis
Struk	print-label.ts sebagai pola builder	Template struk 80mm, print_logs, setting mode cetak
Invoice	jsPDF/autotable sudah dipakai di tempat lain	Tabel invoices/invoice_items, penomoran, snapshot data
Harga minimum	Pola settings + tarif_history	Entitas settings_shipping_minimum, logika MAX() di rumus ongkir
Nominal cepat	Input tunai & kembalian di halaman Scan sudah ada	Tombol cepat + validasi tombol konfirmasi
Export Excel/PDF	Sudah jalan di beberapa halaman	Perbaikan bug: samakan sumber data Excel vs PDF (bukan fitur baru — perbaikan)
Audit trail	tarif_history sebagai pola	Generalisasi ke VOID, diskon, invoice, koreksi shift
FASE 0 — Persiapan Skema Database

Tujuan: siapkan fondasi tabel baru tanpa merusak data/fitur lama. Semua migrasi bersifat additive (tambah tabel/kolom), tidak mengubah struktur tabel packages yang sudah dipakai fitur aktif.

  [x] Buat migrasi Drizzle untuk tabel baru: shift_sessions, transactions, voids, invoices, invoice_items, print_logs, settings_shipping_minimum.
  [x] Tambah kolom shift_session_id (nullable, FK) ke tabel payments yang sudah ada.
  [x] Tambah kolom transaction_id (nullable, FK) ke tabel payments — untuk transisi bertahap, payment lama tanpa transaction tetap valid.
  [x] Tambah kolom discount (numeric, default 0) dan discount_reason (text, nullable) ke tabel yang relevan (transactions baru, bukan payments lama).
  [x] Jalankan migrasi di environment dev, verifikasi tidak ada breaking change pada endpoint existing (/api/packages, /api/payments, /api/batches).
  [x] Tulis script backfill: payment lama yang statusnya sudah final → buatkan 1 transaction retroaktif per payment agar laporan baru tetap bisa menghitung data historis (jangan biarkan data lama "hilang" dari laporan baru).

 Catatan Implementasi:
 2026-09-08 — Menambahkan tujuh tabel fondasi Fase 0 melalui schema Drizzle dan migration additive `lib/db/migrations/0001_finance_foundation.sql`. Menambahkan dua FK nullable pada `payments`, tanpa mengubah kolom existing.
 2026-09-08 — Menambahkan `scripts/src/migrate-finance-foundation.ts` yang idempotent. Payment legacy tunai/transfer dipetakan ke transaksi LUNAS, sedangkan piutang dipetakan ke BELUM_BAYAR agar histori piutang tidak hilang. Tidak ada payment legacy yang perlu diproses di database development saat verifikasi.
 2026-09-08 — `pnpm --filter @workspace/db run push` berhasil. Smoke test `/api/healthz` = 200; `/api/packages`, `/api/payments`, `/api/batches` tetap merespons 401 tanpa autentikasi. Typecheck API/web/libs dan build API/web berhasil.
 2026-09-08 — Hard delete `DELETE /api/packages/:id` dan `statusBatch=HAPUS` sengaja tidak diubah; keputusan ini ditunda ke Fase 3 sesuai arahan Owner. Perbaikan type-only pada guard existing di `routes/batches.ts` dan `routes/settings.ts` tidak mengubah perilaku runtime.

FASE 1 — Modul Shift Kasir

Referensi: Rekomendasi Sistem Kasir Berbasis Shift.

1.1 Skema
 Tabel shift_sessions: id, admin_id, shift_type (PAGI/MALAM), terminal_id, scheduled_start, scheduled_end, actual_start, actual_end, opening_balance, status (AKTIF/CLOSED), created_at.
 Tabel shift_closings: id, shift_session_id, system_cash, actual_cash, selisih, alasan_selisih (nullable), approved_by (nullable, untuk selisih di luar toleransi), closed_at.
 Tabel shift_handovers: id, from_shift_session_id, to_shift_session_id, handover_amount, confirmed_by_giver, confirmed_by_receiver, manual_override (boolean), manual_reason (nullable), created_at.
1.2 Backend
 [x] POST /api/shifts/open — validasi: admin tidak boleh punya shift AKTIF lain; simpan actual_start = waktu request, bukan waktu jadwal.
 [x] POST /api/shifts/:id/close — alur 2 langkah: (a) hitung system_cash dari formula kas (lihat 1.3), simpan tanpa ditampilkan ke kasir dulu; (b) terima actual_cash dari kasir, baru hitung selisih dan kembalikan hasil. Jangan bocorkan system_cash sebelum langkah (b) — ini yang membuat blind closing efektif.
 [x] POST /api/shifts/:id/handover — butuh konfirmasi dua pihak (giver + receiver) sebelum saldo otomatis masuk ke shift berikutnya.
 [x] Middleware: semua endpoint pembayaran (Fase 2) WAJIB memvalidasi ada shift_session AKTIF milik admin yang login. Jika tidak ada, tolak dengan pesan jelas ("Buka shift terlebih dahulu").
 [x] Endpoint blokir buka shift baru bila shift sebelumnya (shift lain milik admin yang sama, atau shift Pagi yang belum closing saat mau buka Malam di terminal sama) belum closing.
1.3 Rumus Kas (implementasi persis sesuai dokumen)
Kas Akhir Sistem = Saldo Awal
                  + Pembayaran Tunai (transaksi baru + pelunasan piutang)
                  - Kembalian
                  - Pengeluaran Tunai
                  - Refund Tunai
                  - Setoran Kas
 Pastikan pembayaran Transfer/QRIS tidak masuk komponen kas fisik ini (hanya masuk total penerimaan shift, bukan kas laci).
 [x] Set batas toleransi selisih: tersimpan sebagai `cash_variance_tolerance` di settings dengan default Rp0; nilai bisnis tetap TODO_KONFIRMASI_OWNER.
1.4 Frontend
 [x] Halaman "Buka Shift" setelah login (pilih Pagi/Malam, input saldo awal; saldo handover masuk setelah dua pihak konfirmasi).
 [x] Header aplikasi menampilkan status shift aktif dan identitas user.
 [x] Dashboard shift: jumlah transaksi, total pembayaran per metode, tombol Pengeluaran & Closing Shift.
 [x] Halaman input kas aktual (pecahan uang) — blind closing, hasil (SESUAI/LEBIH/KURANG) baru muncul setelah submit.
 [x] Halaman serah terima shift (dua tombol konfirmasi terpisah: penyerah & penerima).
 [x] Kunci navigasi: tombol Scan disembunyikan bila tidak ada shift aktif; mutation payment dijaga backend.

Kriteria selesai Fase 1: admin tidak bisa memproses pembayaran tanpa shift aktif; closing menyembunyikan kas sistem sebelum input aktual; serah terima kas tercatat dan tervalidasi dua pihak.

Catatan Implementasi Fase 1:
  2026-09-08 — Menambahkan tabel `shift_closings` dan `shift_handovers` melalui migration additive. Nominal uang pada tabel baru memakai integer Rupiah.
  2026-09-08 — Menambahkan endpoint buka/status/daftar shift, blind closing dua langkah, serah terima dua pihak, helper rumus kas, dan guard mutation payment.
  2026-09-08 — Blind closing tidak mengembalikan `system_cash` sebelum `actual_cash` dikirim. Selisih di luar toleransi wajib beralasan dan memerlukan penyelesaian Owner.
  2026-09-08 — Refund/setoran kas belum memiliki sumber data pada sistem existing sehingga komponen tersebut sementara bernilai nol.
  2026-09-08 — Toleransi selisih disimpan sebagai `settings.cash_variance_tolerance` agar Owner dapat mengubahnya tanpa deploy ulang.
  2026-09-08 — Workflow `artifacts/api-server: API Server` terkonfirmasi auto-managed artifact dan tidak dapat dihapus dari konfigurasi lokal; workflow utama tetap `API Server` di port 8080.
  2026-09-08 — Dependency `orval` dikunci ke `8.29.0` karena `8.9.1` diblokir registry firewall dan `8.30.0` belum melewati minimum release age; tidak ada regenerasi API client pada Fase 1.
  2026-09-09 — Verifikasi ulang `scripts/src/seed-batch2.ts`: nilai `statusBatch` yang dilacak adalah `ARSIP` (bukan `ARCHIVED`) dan field `totalShipping` sudah ada. `pnpm typecheck` workspace lulus; tidak ada diff tracked pada script. Perubahan ini hanya type-fix pada script seed, tidak mengubah enum schema atau data database, dan script seed-batch2 tidak dijalankan selama bootstrap/verifikasi Fase 2.

Log Keputusan & Asumsi Fase 1:
  - Timestamp shift memakai waktu request server dengan timezone; penyelarasan tampilan WIT lintas laporan tetap perlu konfirmasi Owner.
  - Default toleransi Rp0 dipilih konservatif dan disimpan di settings, bukan sebagai angka tetap di kode.
  - Pengeluaran cash existing dihitung berdasarkan waktu pencatatan selama rentang shift karena tabel lama belum memiliki foreign key shift.

FASE 2 — Transaksi & Payment (Piutang, Cicilan, Diskon)

Referensi: Rekomendasi Pencatatan Piutang & Closing Kasir + bagian relevan Transaksi, Struk & Invoice.

2.1 Skema
 Tabel transactions: id, transaction_no (TRX-YYYYMMDD-#####, unik, server-side), customer_id/customer_name, package_ids (JSONB), subtotal, discount, discount_reason, total, payment_status (BELUM_BAYAR/BAYAR_SEBAGIAN/LUNAS), transaction_status (AKTIF/VOID), sisa_piutang, jenis_jastip, shift_session_id, cashier_id, created_at.
 Ubah payments: setiap row wajib transaction_id (untuk data baru), payment_type (TRANSAKSI_BARU/PELUNASAN_PIUTANG/CICILAN), shift_session_id.
 Field piutang tambahan bila relevan: jatuh_tempo (nullable), penanggung_jawab (untuk kasus piutang atas nama pihak lain).
2.2 Aturan bisnis (implementasi persis)
 Saat paket diserahkan tanpa dibayar penuh: buat transaction senilai total tagihan, payment_status = BELUM_BAYAR, TIDAK membuat entry kas closing.
 Saat piutang dibayar (hari lain): JANGAN buat transaction baru. Buat payment baru dengan payment_type = PELUNASAN_PIUTANG, tertaut ke transaction_id asal, masuk ke shift_session_id kasir yang menerima uang saat itu (bukan shift transaksi asal).
 Cicilan/bayar sebagian: transaksi bisa punya banyak payment. Total payment.nominal per transaksi tidak boleh melebihi transaction.total. Update sisa_piutang dan payment_status otomatis setiap payment baru masuk.
 Larangan eksplisit: kasir tidak boleh mengubah tanggal transaksi asal saat mencatat pelunasan piutang. Field created_at transaksi immutable setelah dibuat.
 Setelah shift closing, payment dalam shift tersebut terkunci — tidak bisa diedit/dihapus oleh kasir biasa.
2.3 Backend
 POST /api/transactions — membuat transaksi dari keranjang serah (menggantikan/melengkapi alur POST /api/payments lama untuk kasus baru).
 POST /api/transactions/:id/payments — tambah payment baru ke transaksi existing (piutang/cicilan).
 GET /api/transactions/:id — detail transaksi + riwayat semua payment terkait.
 Update GET /api/dashboard & laporan keuangan agar memisahkan "Transaksi Hari Ini" (nilai jasa terjadi) vs "Pembayaran Diterima Hari Ini" (uang benar-benar masuk) vs "Piutang Baru Hari Ini" vs "Penerimaan Piutang Lama" — sesuai contoh dashboard di dokumen (Bagian 6).
2.4 Frontend
 Dashboard Keuangan Owner: tambah 5 kartu sesuai dokumen (Transaksi Hari Ini, Pembayaran Diterima, Piutang Baru, Penerimaan Piutang Lama, Total Piutang Aktif).
 Halaman Riwayat Pembayaran: tampilkan riwayat multi-payment per transaksi (bukan hanya satu baris payment).
 Form pelunasan piutang: pilih transaksi asal, input nominal (boleh sebagian), metode, tanpa opsi ubah tanggal transaksi asal.

Kriteria selesai Fase 2: pelunasan piutang tidak pernah tercatat sebagai pendapatan jasa baru; laporan pendapatan dan laporan kas closing menunjukkan angka yang konsisten dengan contoh kasus di dokumen (Bagian 2, 7, 8).

Catatan Implementasi:
  2026-09-09 — Menyelesaikan jalur transaksi/payment Fase 2 di atas schema yang diverifikasi ulang: `payment_method` tetap nullable untuk piutang, POST/GET transaksi dan endpoint multi-payment memakai payment method yang eksplisit, serta pelunasan mengunci row transaksi saat menghitung saldo agar cicilan bersamaan tidak melewati total.
  2026-09-09 — Dashboard dan laporan memisahkan nilai transaksi, pembayaran diterima, piutang baru, dan pelunasan piutang lama; record legacy `payment_type=piutang` tidak dihitung sebagai kas diterima. Halaman Owner memuat seluruh transaksi agar piutang sebagian tetap dapat dilunasi.
  2026-09-09 — Laporan akhir Fase 2: database development yang kosong dibootstrap idempotently (schema push, 4 service types, batch legacy ARSIP, 6 akun demo, tolerance Rp0), lalu UAT-12/UAT-13 dijalankan pada transaksi nyata `TRX-20260908-00001` (ID transaksi tetap 1).
  2026-09-09 — UAT-12/UAT-13 angka konkret: awal `total=Rp500.000`, `sisa_piutang=Rp500.000`, `payment_status=BELUM_BAYAR`, `payments=0`; setelah cicilan pertama Rp200.000, `sisa_piutang=Rp300.000`, `payment_status=BAYAR_SEBAGIAN`; setelah cicilan kedua Rp300.000, `sisa_piutang=Rp0`, `payment_status=LUNAS`, `total` tetap Rp500.000, terdapat 2 payment dan hanya 1 row transaction (`transaction_count 0→1`, bukan transaksi baru saat pelunasan).
  2026-09-09 — Smoke test penutup: `/api/healthz` HTTP 200 `{"status":"ok"}`; endpoint terautentikasi packages/payments/batches/transactions merespons sukses dengan masing-masing 1/2/2/1 row. Typecheck workspace, build API, dan build frontend lulus.
  2026-09-09 — Status workflow utama setelah instalasi ulang dependency dan restart: `API Server` RUNNING di port 8080 dan `Start application` RUNNING di port 5000. Tiga workflow artifact duplikat tetap FAILED karena dikelola artifact manager/bentrok port; tidak dipakai sebagai workflow utama dan tidak menandakan regresi pada dua workflow utama.
  2026-09-09 — Tampilan route Owner diuji pada `/owner/dashboard`: tanpa sesi, `ProtectedRoute` mengarahkan ke `/login` dan screenshot menampilkan halaman login dengan akun demo Owner/Admin; API Owner terautentikasi juga berhasil dipakai untuk UAT dan smoke test.

FASE 3 — VOID / Pembatalan Transaksi

Referensi: Transaksi, Struk & Invoice, Bagian 5.

3.1 Skema
 Tabel voids: id, transaction_id, reason_code, notes, requested_by, approved_by, approved_at, reversal_amount, package_ids_returned (JSONB), status_before, status_after, created_at.
3.2 Aturan bisnis
 VOID hanya bisa diajukan terhadap transaction, bukan hapus langsung dari UI paket.
 Alur: kasir ajukan (alasan wajib) → Owner/Supervisor approve (PIN atau hak akses) → sistem ubah transaction_status = VOID, kembalikan status paket terkait ke sebelum-diserahkan, buat reversal kas/pendapatan otomatis.
 Larangan: transaksi VOID tidak bisa di-VOID ulang; paket tidak bisa dikembalikan ke "Belum Diambil" jika sudah terkait transaksi aktif lain (misal sudah masuk transaksi/grup baru).
 VOID setelah shift closing → ditandai koreksi pasca-closing, muncul di laporan shift berikutnya/laporan koreksi terpisah — bukan mengubah angka closing shift yang sudah terkunci.
3.3 Perubahan pada endpoint lama
 Keputusan Owner: `DELETE /api/packages/:id` dan `PATCH /api/batches/:id` dengan `statusBatch=HAPUS` tetap merupakan hard delete, tetapi hanya dapat dilakukan oleh role Owner. Admin menerima HTTP 403 dengan pesan yang jelas. Keputusan ini berlaku baik untuk paket yang belum maupun sudah memiliki transaksi.
3.4 Backend & Frontend
 POST /api/transactions/:id/void — ajukan VOID.
 POST /api/voids/:id/approve — approval dengan PIN/role.
 Halaman Laporan VOID (Owner): daftar VOID + alasan + siapa approve.
 UI: tombol "Ajukan VOID" di detail transaksi; modal alasan wajib; modal approval PIN untuk Owner/Supervisor.

Catatan Implementasi:
  2026-09-09 — Fase 3 selesai. `POST /api/transactions/:id/void` membuat pengajuan dengan alasan wajib; `POST /api/voids/:id/approve` hanya dapat dilakukan Owner, mengunci transaksi, mencegah paket dipakai transaksi aktif lain, mengembalikan paket ke pending, membuat reversal payment, dan menandai koreksi pasca-closing.
  2026-09-09 — Hard delete paket dan batch dikunci Owner-only. Tombol hard delete disembunyikan dari seluruh halaman Admin; aktivitas edit/input normal Admin tetap tersedia.
  2026-09-09 — Laporan VOID Owner tersedia di `/owner/voids`, dan pengajuan VOID tersedia dari halaman transaksi Owner. Role Supervisor belum menjadi role aktif pada schema users, sehingga approval aktif saat ini adalah Owner-only sampai role tersebut ditetapkan.
  2026-09-09 — Gap rumus kas shift diperbaiki: `VOID_REVERSAL` sekarang mengurangi hanya porsi pembayaran asli yang ber-metode tunai. Jika approval Owner tidak memiliki shift aktif, reversal transaksi pada shift yang masih aktif tetap diatribusikan ke shift sumber; VOID pasca-closing tetap menjadi koreksi tanpa mengubah closing lama. Reversal transfer tidak mengurangi kas fisik.
  2026-09-09 — Bukti runtime UAT-07 diperkuat. Shift 3 dibuka dengan saldo awal Rp0; transaksi `TRX-20260909-00003` (ID 3) dibayar penuh tunai Rp100.000. Query SQL langsung sebelum VOID menunjukkan `cash_received=Rp100.000`, `refund_cash=Rp0`, `system_cash=Rp100.000`. Setelah pengajuan VOID ID 3 disetujui Owner, status transaksi berubah `AKTIF → VOID`, status paket ID 3 tetap tercatat dan dikembalikan ke `pending`/`BELUM_DIAMBIL`, reversal `VOID_REVERSAL` payment ID 6 bernilai `-Rp100.000`, dan `voids.reversal_amount=Rp100.000`. Query SQL langsung sesudahnya menunjukkan `refund_cash=Rp100.000`, `system_cash=Rp0`. Closing blind shift 3 dengan `actual_cash=Rp0` menghasilkan `systemCash=Rp0`, `selisih=Rp0`, hasil `SESUAI`.
  2026-09-09 — Query audit langsung memastikan row transaksi ID 3, payment asli ID 5, reversal ID 6, dan void ID 3 tetap ada; tidak ada hard delete. Uji VOID ganda pada transaksi ID 2 (`TRX-20260909-00002`) ditolak HTTP 400 dengan error `Transaksi sudah VOID dan tidak dapat diajukan ulang`. Kontrol transfer juga diuji pada transaksi ID 2: sebelum dan sesudah VOID `system_cash=Rp0`, reversal transfer tidak masuk kas fisik; closing blind shift 2 dengan kas aktual Rp0 menghasilkan `SESUAI`.
  2026-09-09 — UAT cicilan campuran dijalankan melalui runtime API. Shift 1 dibuka dengan saldo awal Rp0; transaksi `TRX-20260909-00001` (ID 1) menerima cicilan pertama Rp200.000 tunai dan cicilan kedua Rp300.000 transfer sehingga status menjadi `LUNAS`. Query SQL langsung sebelum VOID menunjukkan `cash_received=Rp200.000`, `refund_cash=Rp0`, `system_cash=Rp200.000`. Setelah pengajuan dan approval Owner, reversal agregat `VOID_REVERSAL` tercatat `-Rp500.000`, tetapi query SQL langsung sesudah VOID menghitung `original_cash_portion=Rp200.000`, `refund_cash=Rp200.000`, dan `system_cash=Rp0`. Dengan demikian system_cash berkurang hanya Rp200.000, bukan Rp500.000; porsi transfer tidak mengurangi kas fisik.

FASE 4 — Harga Ongkir Minimum

Referensi: Transaksi, Struk & Invoice, Bagian 3.

4.1 Skema
 Tabel settings_shipping_minimum: id, service_id, origin_city, enabled (boolean), minimum_amount, updated_by, updated_at. Riwayat perubahan pakai pola tarif_history (tambah entri baru, jangan overwrite tanpa jejak).
4.2 Nilai awal migrasi (sesuai dokumen, Bagian 15)
 Pelni Jakarta: Rp20.000
 Pelni Surabaya: Rp18.000
 Hemat: Rp10.000
 Cargo: Rp25.000
  Semua toggle default: OFF saat rilis. Toggle hanya dapat diaktifkan Owner melalui `/owner/tarif`.
4.3 Logika
 Terapkan di titik perhitungan ongkir yang sudah ada (server-side, bagian 12 PRD as-is): Total Ongkir Final = toggle_ON ? MAX(hasil_normal, minimum) : hasil_normal.
 Berlaku terhadap total ongkir per customer dalam satu transaksi/layanan, bukan per baris paket individual (cek ulang contoh Doni: 2 item 0.2+0.5kg dihitung gabungan, bukan per item).
 Perubahan setting hanya berlaku ke transaksi baru; transaksi lama tidak dihitung ulang otomatis.
4.4 UI
 Tambah section di /owner/tarif: toggle ON/OFF + nilai minimum per layanan+kota, dengan riwayat perubahan.

Kriteria selesai Fase 4: 4 skenario uji di dokumen (Bagian 3.3) menghasilkan angka yang tepat — jadikan ini test case otomatis.

Catatan Implementasi:
  2026-09-09 — Skema `settings_shipping_minimum` ditegaskan unik per `service_id + origin_city` melalui migration additive `0005_shipping_minimum_unique.sql`. Nilai awal di-seed idempoten untuk Pelni Jakarta Rp20.000, Pelni Surabaya Rp18.000, Hemat Surabaya Rp10.000, dan Kargo Jakarta/Surabaya Rp25.000; seluruh toggle OFF.
  2026-09-09 — Logika minimum diterapkan server-side pada total ongkir gabungan customer/layanan. Toggle OFF mempertahankan rumus lama; toggle ON memakai `MAX(ongkir_normal, minimum)` dan hasilnya didistribusikan kembali ke baris paket agar jumlah tepat tanpa menerapkan minimum per baris.
  2026-09-09 — Endpoint Owner `GET/PATCH /api/settings/shipping-minimum` dan section `/owner/tarif` selesai. PATCH mencatat nilai lama, nilai baru, Owner, waktu, serta alasan ke `tarif_history`. Perubahan setting tidak menjalankan recalculate otomatis terhadap paket lama.
  2026-09-09 — UAT-03 lulus melalui pembatasan route Owner-only dan UI toggle per layanan/kota. UAT-04 lulus melalui 4 skenario otomatis: OFF mempertahankan Rp4.000; Hemat Rp2.000→Rp10.000; Pelni Jakarta Rp10.000→Rp20.000; total Kargo dua baris Rp15.000→Rp25.000 dengan distribusi tepat Rp8.334 + Rp16.666.

FASE 5 — Tombol Nominal Cepat & UX Pembayaran

Referensi: Transaksi, Struk & Invoice, Bagian 4.

 Tombol: Pas / Rp50.000 / Rp100.000 / Rp150.000 / Rp200.000 — hanya tampil saat metode = Tunai.
 Klik tombol mengisi field "Uang Diterima"; input manual tetap bisa menimpa (dan membatalkan status "aktif" tombol).
 Kembalian dihitung real-time.
 Tombol konfirmasi nonaktif jika uang diterima < total tagihan.
 Transfer/QRIS: sembunyikan field uang diterima/kembalian, tampilkan field referensi pembayaran (opsional).
 Piutang: wajib isi nama penanggung jawab, nominal, jatuh tempo, catatan.
 Simpan transaksi+payment+kasir+waktu sebagai satu proses atomik (gunakan DB transaction, cegah race condition/double submit — idempotency key per klik konfirmasi).

 Catatan Implementasi Fase 5 — selesai dan diverifikasi runtime (2026-09-09):
 - Idempotency server-side ditambahkan pada transaksi baru menggunakan `Idempotency-Key`, unique index database, row lock paket, dan satu DB transaction untuk transaksi + payment + update status paket.
 - Uji request POST `/api/transactions` yang sama persis dua kali dengan key `f5-idempotency-001`: request pertama HTTP 201 menghasilkan `TRX-20260909-00001`/transaction ID 1 dan payment ID 1; request kedua HTTP 200 mengembalikan transaksi/payment yang sama. Query SQL: `transactions.id=1`, `idempotency_key=f5-idempotency-001`, `payment_rows=1`. Tidak ada row duplikat.
 - UAT-05 lulus melalui endpoint sungguhan. Nominal `Pas` dan `Rp50.000` menghasilkan `paid_amount=Rp50.000`, `change_amount=Rp0`; nominal `Rp100.000` menghasilkan kembalian Rp50.000; `Rp150.000` menghasilkan Rp100.000; `Rp200.000` menghasilkan Rp150.000. Semua request sukses HTTP 201 dan tercatat sebagai transaksi/payment nyata.
 - UAT-06 lulus melalui endpoint sungguhan setelah validasi server-side ditambahkan. Request tunai tagihan Rp500.000 dengan uang diterima Rp400.000 ditolak HTTP 400 dengan response `{"error":"Uang diterima kurang dari total tagihan"}`. Cicilan tetap dilakukan melalui alur piutang/pelunasan, bukan konfirmasi tunai transaksi baru.
 - UAT-13 regresi lulus: transaksi nyata `TRX-20260909-00008`/ID 8 total Rp500.000 dibuat dengan `sisa_piutang=Rp500.000`, `payment_status=BELUM_BAYAR`, lalu payment Rp200.000 menghasilkan `sisa_piutang=Rp300.000`, `BAYAR_SEBAGIAN`; payment Rp300.000 menghasilkan `sisa_piutang=Rp0`, `LUNAS`. Query akhir menunjukkan tepat 2 payment (`Rp200.000 + Rp300.000 = Rp500.000`) dan tetap 1 transaction.
 - UAT-07 regresi lulus dengan skenario terisolasi: `TRX-20260909-00010`/ID 10 pada shift 2 dibayar tunai Rp100.000. Query sebelum VOID: `cash_received=Rp100.000`, `refund_cash=Rp0`, `system_cash=Rp100.000`. Setelah request VOID dan approval Owner, reversal `VOID_REVERSAL=-Rp100.000` tercatat, query sesudahnya: `cash_received=Rp100.000`, `refund_cash=Rp100.000`, `system_cash=Rp0`; transaksi menjadi `VOID`, `void.status_after=VOID`, paket ID 11 kembali `pending/BELUM_DIAMBIL`. Row histori tidak dihapus.
 - Validasi server-side field piutang wajib lulus. POST `/api/transactions` tanpa `penanggungJawab`, `jatuhTempo`, dan `notes` ditolak HTTP 400 dengan response `{"error":"Nama penanggung jawab wajib diisi untuk piutang"}`; query `missing_debt_transactions=0`.
 - `pnpm typecheck` seluruh workspace lulus. Build API dan frontend lulus; warning build frontend hanya sourcemap/chunk-size non-fatal. Workflow utama API Server (8080) dan Start application (5000) berjalan RUNNING; `/api/healthz` HTTP 200.

FASE 6 — Struk Transaksi

Referensi: Sistem Kasir Berbasis Shift Bagian 8–9 + Transaksi/Struk/Invoice Bagian 6.

 Setting Owner: PENGATURAN > KASIR > CETAK STRUK — Otomatis / Tanya Sebelum Cetak / Nonaktif.
 Template struk thermal 80mm (fallback A4/PDF), pakai pola builder dari print-label.ts sebagai referensi struktur, bukan reuse langsung (isinya beda — struk = bukti pembayaran, label = identitas paket fisik).
 Isi minimum struk sesuai daftar dokumen Bagian 9 (identitas usaha, no. transaksi, kasir+shift, rincian, keuangan, status).
 Cetak ulang → label "SALINAN/REPRINT" + catat di print_logs (siapa, kapan, berapa kali).

 Catatan Implementasi Fase 6:
  2026-09-10 — Bukti payload struk untuk skenario piutang Rp90.000 dengan pembayaran awal Rp30.000 diuji melalui endpoint sungguhan `GET /api/transactions/1/receipt`. Field response persis: `transaction.total = 90000`, `transaction.paymentStatus = "BAYAR_SEBAGIAN"`, `transaction.sisaPiutang = 60000`, dan `payments[0].totalAmount = 30000`; response TIDAK mengembalikan status `LUNAS`.
  2026-09-10 — Bukti cetak ulang diuji melalui `POST /api/transactions/1/receipt/print`: pencetakan pertama mengembalikan `copyNumber = 1`, `isReprint = false`, `label = null`; endpoint mencatat row `print_logs`.
  2026-09-10 — Untuk setting cetak, bukti runtime browser/network otomatis belum dapat direkam di lingkungan ini. Bukti yang tersedia dan dinyatakan secara eksplisit sebagai bukti tingkat kode: setelah pembayaran sukses di `artifacts/jastip/src/pages/admin/scan.tsx`, nilai `AUTO` memanggil `await printReceipt(transactionId)` (yang melakukan `POST /api/transactions/:id/receipt/print`), `ASK` hanya membuka dialog konfirmasi yang baru memanggil fungsi itu setelah Kasir memilih Cetak, dan `OFF` tidak masuk kedua cabang tersebut sehingga tidak memanggil endpoint print otomatis. Ini bukan klaim bukti runtime UI.
  2026-09-10 — Orval/codegen tetap ditunda sesuai keputusan Owner; incompatibility generator dicatat sebagai backlog, bukan dianggap selesai atau terlewat.

 Laporan Akhir Fase 6:
  - Payload receipt piutang sudah terbukti mengembalikan `BAYAR_SEBAGIAN` untuk total Rp90.000, bayar Rp30.000, sisa Rp60.000.
  - Reprint sudah menghasilkan label `SALINAN / REPRINT` pada pencetakan kedua dan tercatat di `print_logs`.
  - Perilaku AUTO/ASK/OFF baru memiliki bukti tingkat kode, bukan bukti network/runtime browser. Dokumentasi tidak mengaburkan batas bukti ini.
  - Teks blocker Fase 5 sudah dibersihkan; Fase 5 berstatus Selesai tanpa blocker tersisa.

FASE 7 — Invoice A4

Referensi: Transaksi, Struk & Invoice, Bagian 7–9.

7.1 Skema
 Tabel invoices: id, invoice_no (INV-YYYYMMDD-####, unik server-side), transaction_id (nullable — invoice manual boleh tanpa transaksi tapi wajib alasan+Owner), customer_snapshot (JSONB), issued_at, due_at, subtotal, discount, down_payment, total, balance, status (DRAFT/BELUM_LUNAS/DIBAYAR_SEBAGIAN/LUNAS/BATAL).
 Tabel invoice_items: invoice_id, package_id (nullable), description, qty, weight, volume, unit_price, line_total.
7.2 Aturan
 Cara utama: "Buat Invoice" dari detail transaksi — data auto-terisi dari transaksi, tidak input ulang manual.
 Invoice manual (dari menu Invoice, pilih paket lepas) hanya untuk Owner/Supervisor, wajib catatan alasan.
 Snapshot wajib: harga, diskon, nama customer, rincian paket disalin ke invoice_items/customer_snapshot saat terbit — perubahan master data setelahnya tidak boleh mengubah invoice lama.
 Invoice DRAFT/BELUM LUNAS tidak dihitung sebagai penerimaan kas di laporan manapun.
7.3 UI
 Halaman buat invoice dari transaksi (cara utama).
 Halaman invoice manual (Owner/Supervisor only).
 Layout cetak A4 sesuai contoh dokumen Bagian 8 (header usaha, ditagihkan kepada, rincian kiriman, ringkasan keuangan, info rekening, pengesahan).

 Catatan Implementasi Fase 7:
  2026-09-10 — Skema `invoices` dan `invoice_items` yang sudah tersedia dipakai tanpa migrasi destruktif. Ditambahkan endpoint `POST /api/invoices/from-transaction/:transactionId`, `GET /api/invoices`, `GET /api/invoices/:id`, `POST /api/invoices`, dan `POST /api/invoices/:id/print`. Penomoran invoice dibuat server-side dengan format `INV-YYYYMMDD-####` memakai tanggal WIT.
  2026-09-10 — Invoice dari transaksi mengambil subtotal, diskon, DP, sisa piutang, customer, dan rincian paket dari data server. Invoice manual hanya Owner, wajib memilih paket dan mengisi alasan; bukan jalur default transaksi.
  2026-09-10 — Snapshot diuji melalui endpoint sungguhan dengan transaksi `TRX-20260910-00001`: invoice `INV-20260910-0001` terbit dengan subtotal/total Rp90.000, DP Rp30.000, sisa Rp60.000, status `DIBAYAR_SEBAGIAN`, dan item Rp90.000. Setelah master `packages.total_shipping` diubah langsung dari Rp90.000 menjadi Rp125.000, query SQL before-after tetap menunjukkan invoice `subtotal/total = Rp90.000`, `invoice_items.unit_price/line_total = Rp90.000`, sedangkan hanya master paket menjadi Rp125.000.
  2026-09-10 — UI `/admin/invoices` dan `/owner/invoices` menampilkan daftar invoice, pembuatan dari transaksi, invoice manual Owner, serta layout cetak A4 dengan tombol Cetak / PDF. Layout memakai ukuran halaman A4 dan isi snapshot invoice, bukan query ulang master saat print.
  2026-09-10 — UAT-10 lulus melalui endpoint runtime dan query SQL langsung untuk pembuatan, DP/sisa, serta invariansi snapshot; pencetakan dicatat di `print_logs` dan HTML cetak memakai CSS `@page { size: A4; }`.

FASE 8 — Perbaikan Export Excel/PDF & Konsistensi Data

Referensi: Transaksi, Struk & Invoice, Bagian 2. Ini perbaikan bug pada fitur existing, prioritas tinggi karena user secara eksplisit melaporkan hasil Excel dan PDF sekarang berbeda.

 Audit semua titik export existing (Arsip, Keuangan, Laporan, Pengeluaran, Barcode) — pastikan Excel dan PDF memakai query/fungsi sumber data yang sama, bukan dua implementasi terpisah.
 Tambahkan info filter (layanan, batch, tanggal, status, kasir, waktu export) di header semua file export.
 Format nominal: Rp + pemisah ribuan konsisten; berat maksimal 2 desimal.
 PDF Cargo: lebarkan kolom "Jenis Barang" + aktifkan text wrapping (jangan sampai teks >60 karakter terpotong).
 Header tabel berulang di setiap halaman PDF; baris tidak boleh terpotong antar halaman.
 Footer PDF: nomor halaman, waktu export, nama user yang export.
 Test: dengan filter identik, jumlah baris & grand total Excel = PDF (jadikan test case).

Catatan Implementasi: (isi setelah selesai)

3. Checklist UAT Gabungan (jalankan sebelum rilis tiap fase)

Diambil & diperluas dari dokumen sumber (Bagian 14, dokumen 3):

 UAT-01 Excel dan PDF menghasilkan jumlah baris serta total yang sama untuk 3 sampel batch berbeda.
 UAT-02 Kolom Jenis Barang PDF Cargo tidak terpotong untuk teks ≥60 karakter.
 UAT-03 Toggle harga minimum ON/OFF bekerja per layanan, hanya bisa diubah Owner.
 UAT-04 Semua contoh harga minimum (Bagian 3 dokumen) menghasilkan nilai benar.
   UAT-05 Tombol Pas + 4 nominal cepat mengisi nilai tepat; input manual tetap berfungsi. **LULUS lewat endpoint runtime** — Rp50.000/Rp50.000 menghasilkan kembalian Rp0; Rp100.000 menghasilkan Rp50.000; Rp150.000 menghasilkan Rp100.000; Rp200.000 menghasilkan Rp150.000.
 UAT-06 Konfirmasi tunai gagal jika uang diterima kurang; kembalian dihitung benar. **LULUS lewat endpoint runtime** — uang diterima Rp400.000 untuk tagihan Rp500.000 ditolak HTTP 400 dengan pesan `Uang diterima kurang dari total tagihan`.
   UAT-07 VOID mengembalikan status paket & membuat reversal tanpa menghapus riwayat. **LULUS secara implementasi** — approval berjalan dalam transaksi database, status transaksi menjadi `VOID`, paket kembali ke `BELUM_DIAMBIL`, reversal tercatat sebagai `VOID_REVERSAL`, dan row transaksi/payment/void tetap tersimpan.
 UAT-08 Struk menampilkan subtotal, diskon, total, metode bayar, uang diterima, kembalian. **LULUS melalui endpoint runtime** — tiga transaksi nyata diuji: tunai dengan subtotal Rp60.000, diskon Rp10.000, total Rp50.000, uang diterima Rp60.000, kembalian Rp10.000; transfer Rp70.000 tanpa kembalian; dan piutang Rp90.000 dengan pembayaran awal Rp30.000.
  UAT-09 Cetak otomatis ON/OFF berfungsi; cetak ulang tercatat di print_logs. **Bukti endpoint setting dan endpoint print lulus; cabang AUTO/ASK/OFF terbukti pada tingkat kode, bukan network/runtime browser** — `receipt_print_mode` berubah `OFF → AUTO → ASK` melalui `PATCH /api/settings`, dan tiga cetak awal + satu cetak ulang menambah `print_logs` dari 0 menjadi 4; cetak ulang transaksi pertama menghasilkan `copyNumber=2`, `isReprint=true`, dan label `SALINAN / REPRINT`.
  UAT-10 Invoice A4 dibuat dari transaksi, simpan DP/sisa, cetak PDF tanpa layout terpotong. **LULUS melalui endpoint runtime + query SQL langsung** — invoice `INV-20260910-0001` menyimpan subtotal/total Rp90.000, DP Rp30.000, sisa Rp60.000; setelah master paket diubah dari Rp90.000 menjadi Rp125.000, nilai invoice tetap Rp90.000.
 UAT-11 Closing shift menampilkan transaksi + koreksi VOID dengan jelas.
 UAT-12 (baru, dari dokumen piutang) Skenario Tanggal 1 (diserahkan belum bayar) → Tanggal 3 (pelunasan) menghasilkan angka laporan persis sesuai contoh Bagian 2 & 7 dokumen piutang (tidak ada pendapatan ganda). **LULUS** — transaksi dibuat tanpa payment saat belum bayar, tanggal transaksi tetap tersimpan di hari awal, pelunasan hari berikutnya masuk sebagai `PELUNASAN_PIUTANG`, dan dashboard hari pelunasan tidak menggandakan nilai transaksi sebagai pendapatan baru.
 UAT-13 (baru) Cicilan 2 tahap (Rp200rb + Rp300rb) menghasilkan sisa_piutang dan status yang benar di tiap tahap, nilai transaksi tetap Rp500rb. **LULUS** — tahap pertama menghasilkan `BAYAR_SEBAGIAN` dengan sisa Rp300.000; tahap kedua menghasilkan `LUNAS`, sisa Rp0, dua payment, dan total payment Rp500.000.
  UAT-14 (baru) Admin tanpa shift aktif tidak bisa memproses pembayaran. **LULUS** — setelah login sebagai Admin tanpa shift aktif, `POST /api/payments/` mengembalikan HTTP 409 dengan kode `ACTIVE_SHIFT_REQUIRED` dan pesan "Buka shift terlebih dahulu"; tidak ada payment yang dibuat.
  UAT-15 (baru) Blind closing: kas sistem tidak terlihat sebelum kasir submit kas aktual. **LULUS** — langkah pertama `POST /api/shifts/:id/close` hanya mengembalikan `closingId`, status `WAITING_ACTUAL_CASH`, dan instruksi memasukkan kas aktual tanpa `systemCash`; setelah `actualCash` dikirim, hasil closing mengembalikan `systemCash`, `actualCash`, `selisih`, dan hasil `SESUAI`.

  Verifikasi akhir Fase 0–2 (2026-09-09):
  - Database development reachable dan tabel Fase 0/1 serta Fase 2 tersedia: `shift_sessions`, `shift_closings`, `shift_handovers`, `transactions`, `voids`, `invoices`, `invoice_items`, `print_logs`, `settings_shipping_minimum`, `payments`, `packages`, `batches`, `service_types`, dan `settings`.
  - Kolom `payments.payment_method` terverifikasi nullable; `transaction_id` dan `shift_session_id` tetap nullable untuk kompatibilitas data lama.
  - Bootstrap idempotent selesai: 4 service types, batch legacy, 6 akun demo, dan default `cash_variance_tolerance=0`.
  - Endpoint `/api/healthz` mengembalikan HTTP 200 `{"status":"ok"}`; endpoint protected tanpa autentikasi menolak request dengan HTTP 401.
  - Typecheck API/web/scripts dan build API/web berhasil. Script `seed-batch2.ts` juga diperbaiki agar typecheck workspace penuh bersih.
   - UAT-12, UAT-13, dan UAT-14 lulus; blind closing diuji ulang tanpa membocorkan `systemCash` dan hasil closing `SESUAI`.
    - Fase 5 diverifikasi lewat runtime endpoint + query SQL: idempotency menghasilkan 1 transaction/1 payment, UAT-05/UAT-06 lulus, UAT-07/UAT-13 tidak regresi, dan field piutang wajib ditolak server-side. Fase 6 diverifikasi lewat payload receipt runtime, endpoint print/reprint, serta bukti tingkat kode untuk cabang setting AUTO/ASK/OFF; Fase 6 selesai dan Fase 7 selesai dengan UAT snapshot before-after.
4. Log Keputusan & Asumsi (WAJIB diisi agent selama proses)

Setiap kali agent mengambil keputusan karena dokumen sumber tidak menjelaskan detail, catat di sini dengan format di bawah. Ini jadi bahan konfirmasi ke Owner nanti — jangan biarkan keputusan diam-diam terkubur di kode.

Tanggal	Area	Ambiguitas	Asumsi yang dipakai	Perlu konfirmasi Owner?
(contoh)	VOID vs hard delete	Dokumen tidak jelas soal paket yang belum pernah dibayar	Hard delete tetap diizinkan hanya jika paket belum punya transaksi sama sekali	Ya
2026-09-09	Hard delete paket dan batch	Owner menegaskan hak hapus permanen tanpa membatasi status transaksi	Hard delete tetap tersedia untuk Owner; Admin menerima 403 dan tidak melihat tombol hapus permanen. Edit/input normal Admin tetap diizinkan	Tidak
2026-09-08	Backfill payment legacy	Tabel payments lama tidak memiliki penanda final eksplisit	Tunai/transfer dianggap final dan dibuat sebagai transaksi LUNAS; piutang dibuat sebagai transaksi BELUM_BAYAR	Ya, sebelum laporan transaksi Fase 2
2026-09-08	Waktu WIT	Schema baru memakai timestamp with time zone, tetapi endpoint shift/transaksi belum dibuat	Instan waktu dipertahankan oleh database; normalisasi tampilan dan aturan WIT diverifikasi saat Fase 1–2	Ya, sebelum rilis transaksi
2026-09-09	Rumus kas shift (Fase 1)	Belum ada tabel khusus Refund Tunai	Refund tunai dihitung dari porsi pembayaran asli tunai pada `VOID_REVERSAL`; reversal transfer dikecualikan. Reversal pada shift yang masih aktif memakai shift sumber, sedangkan VOID pasca-closing tidak mengubah closing yang sudah terkunci.	Tidak — disetujui Owner 2026-09-09
2026-09-09	Setoran Kas (Fase 1)	Belum ada sumber data setoran kas	Nilai Setoran Kas tetap 0; Owner sudah diberi pertanyaan dan secara sadar menunda keputusan sampai ada kebutuhan nyata. Rumus kas tetap berjalan normal dan asumsi ini tidak menghalangi fase berikutnya.	Ya — keputusan ditunda oleh Owner, bukan pertanyaan yang terlewat
2026-09-08	State database development saat import	Database reachable tetapi tabel Fase 1 belum tersedia; bukti lokal tidak membedakan database baru/reset dari schema yang belum pernah diterapkan	Anggap ini sebagai development database aktif untuk workspace ini; schema, migrasi legacy, dan seed dijalankan ulang sesuai prosedur setup. Database production/staging wajib diverifikasi sebagai instance/environment terpisah sebelum dipakai.	Ya, Owner perlu memastikan environment staging/production memakai database terpisah dan persistence yang benar
2026-09-08	Versi Orval untuk codegen	`orval@8.9.1` terblokir registry firewall dan versi terbaru saat itu belum melewati minimum release age	Dependency dikunci persis ke `orval@8.29.0`; codegen tidak dijalankan setelah penggantian dependency, sehingga file generated API client tidak berubah dan diff output codegen kosong.	Ya, pertahankan pin ini dan jangan mengubah versi diam-diam di fase berikutnya
2026-09-08	Catatan keamanan kredensial	`.env.example` sempat berisi kredensial database development dan berstatus untracked, sehingga tidak pernah masuk commit tetapi tetap dianggap berpotensi terekspos	File tersebut dihapus; `.gitignore` kini memakai pola `.env*` dan verifikasi `git check-ignore` mengonfirmasi `.env` serta `.env.example` dikecualikan. Rotasi kredensial database development masih menunggu tindakan pada Database tool Replit karena binding `DATABASE_URL`/`PG*` bersifat runtime-managed; Fase 2 tidak dimulai sebelum rotasi dan smoke test koneksi selesai.	Ya, Owner perlu melakukan/menyetujui rotasi melalui Database tool dan mengonfirmasi koneksi baru
2026-09-09	Payment method pada piutang	Dokumen meminta `payment_method` nullable, sementara payment pelunasan memiliki metode aktual	Piutang tanpa pembayaran tidak membuat row payment; payment saat pelunasan menyimpan metode aktual (`tunai`/`transfer`), sedangkan `payment_method` tetap null hanya untuk kompatibilitas record hutang legacy.	Ya, konfirmasi jika QRIS perlu ditambahkan sebagai metode tersendiri
2026-09-09	Bootstrap database development	Tabel schema dapat hilang/reset antar sesi kerja tanpa error pada kode	Prosedur rutin dimulai dengan pengecekan tabel Fase 0/1, lalu `db push`, migrasi legacy, dan seed idempotent sebelum melanjutkan fase berikutnya; prosedur ini dipakai ulang sebelum UAT penutup.	Ya, pastikan staging/production tidak memakai instance development
2026-09-09	`seed-batch2.ts`: ARCHIVED → ARSIP	Semantik perubahan script seed perlu dibedakan dari perubahan schema/data	Verifikasi tracked diff = kosong; histori tracked hanya memuat `ARSIP`, schema enum tetap `OPEN/CLOSED/ARSIP`, dan script seed-batch2 tidak dijalankan. Perubahan murni perbaikan tipe pada script, tanpa update enum atau row batch pada database development maupun data lama hasil migrasi.	Ya, jangan jalankan seed-batch2 di production tanpa review data tujuan
2026-09-09	Workflow setelah bootstrap	Dua workflow utama dan tiga workflow artifact duplikat memiliki status berbeda	Gunakan `API Server` port 8080 dan `Start application` port 5000 sebagai workflow utama yang harus RUNNING; workflow artifact duplikat dibiarkan dikelola artifact manager agar tidak menambah bentrok port.	Tidak, hanya perlu dipantau saat deployment
2026-09-09	Batas toleransi selisih kas	Owner ingin menentukan nilai sendiri lewat pengaturan	Nilai disimpan di `settings.cash_variance_tolerance`, default Rp0, dapat diubah dari Pengaturan Owner, dan setiap perubahan masuk `tarif_history`	Tidak
  2026-09-10	Codegen OpenAPI setelah kontrak receipt/invoice baru	Generator `orval` yang sudah dipin sejak Fase 1 terbukti tidak kompatibel dengan sebagian kontrak baru: output memakai `zod.int()` dan `Headers.entries()`, sementara dependency/lib proyek tidak menyediakan API tersebut.	Frontend Fase 6–7 memakai `fetch` langsung, sehingga incompatibility generated client tidak menghalangi UAT receipt maupun invoice. Ini backlog yang ditunda atas keputusan Owner, bukan pekerjaan yang terlewat; upgrade Orval atau penggantian pendekatan codegen diputuskan kemudian.	Ya — ditunda oleh Owner
  2026-09-10	Bukti runtime UI setting cetak AUTO/ASK/OFF	Bukti network/browser otomatis belum tersedia di lingkungan ini, sehingga yang terbukti baru cabang tingkat kode, bukan perilaku runtime UI.	Risiko residual diterima untuk saat ini. Owner/kasir direkomendasikan melakukan pengujian klik manual langsung di browser untuk mode AUTO, ASK, dan OFF sebelum sistem dipakai pada transaksi nyata di lapangan.	Ya — validasi manual disarankan sebelum operasional
   TODO_KONFIRMASI_OWNER — Default toggle harga minimum saat rilis	Tidak disebutkan ON/OFF default	Toggle dirilis OFF agar tidak mengubah perilaku ongkir existing; Owner dapat mengaktifkannya secara eksplisit melalui `/owner/tarif`.	Ya — Owner perlu mengaktifkan per layanan/kota bila sudah siap
  Role Supervisor	Disebut "opsional" tanpa kepastian	Diimplementasikan sebagai role opsional (kode siap, tidak wajib dipakai)	Ya
5. Ringkasan Status per Fase (update terus)
 Fase	Status	% Selesai	Blocker
0 — Skema DB	Selesai	100%	—
 1 — Shift Kasir	Selesai	100%	Konfirmasi Owner atas toleransi bisnis dan kebutuhan Setoran Kas
 2 — Transaksi/Payment	Selesai	100%	—
 3 — VOID	Selesai, disetujui Owner 2026-09-09	100%	—
 4 — Harga Minimum	Selesai, default OFF	100%	Menunggu Owner mengaktifkan toggle bila diperlukan
 5 — Nominal Cepat	Selesai	100%	—
 6 — Struk	Selesai	100%	Bukti AUTO/ASK/OFF masih tingkat kode, bukan network/runtime UI
 7 — Invoice A4	Selesai	100%	—
8 — Fix Export	Belum mulai	0%	Independen, bisa dikerjakan kapan saja/duluan