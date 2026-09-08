Rencana Implementasi & Progres — Pembaruan Sistem Jastip Anggun Jaya

Untuk: AI coding agent yang mengerjakan pembaruan sistem Status dokumen: Living document — update checkbox [ ] → [x] setiap task selesai, dan isi kolom Catatan bila ada penyimpangan dari rencana. Basis: 3 dokumen rekomendasi Tim IT (shift kasir, piutang & closing, transaksi/struk/invoice) dipetakan ke kondisi sistem as-is (PRD reverse-engineered per 2026-09-08).

0. Cara Pakai Dokumen Ini (untuk AI agent)
Kerjakan fase secara berurutan (Fase 0 → Fase 8). Fase lebih besar bergantung pada tabel/endpoint dari fase sebelumnya (terutama shift_sessions dan transactions, yang jadi fondasi hampir semua fase lain).
Sebelum mengerjakan satu fase, baca ulang bagian "Prinsip Wajib" di bawah — semua fase harus tunduk pada prinsip ini.
Setiap task punya checkbox. Setelah task selesai dan diverifikasi (build jalan, tidak merusak fitur existing), centang dan tulis ringkas apa yang dilakukan di kolom Catatan Implementasi di bawah task tersebut.
Jika ada keputusan desain yang tidak dijelaskan dokumen (ambiguitas), jangan menebak diam-diam — tulis di bagian "Log Keputusan & Asumsi" di akhir file, lalu lanjutkan dengan asumsi yang paling konservatif (tidak menghapus data, tidak mengubah rumus ongkir existing).
Jangan hapus/rombak fitur yang sudah "Aktif" di PRD as-is kecuali dokumen sumber secara eksplisit memintanya (contoh: hard delete paket harus diganti pola VOID setelah ada pembayaran — lihat Fase 3).
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
  2026-09-08 — Utang teknis terpisah: `scripts/src/seed-batch2.ts` masih memiliki error tipe `ARCHIVED` dan `totalShipping`; sengaja tidak dikerjakan dalam Fase 1.

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

Catatan Implementasi: (isi setelah selesai)

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
 Keputusan yang perlu ditegaskan ke Owner (tandai TODO_KONFIRMASI_OWNER): apakah DELETE /api/packages/:id dan penghapusan batch tetap boleh hard-delete untuk paket yang belum pernah punya transaksi/payment sama sekali (misal salah input), atau semua penghapusan setelah titik tertentu wajib lewat VOID. Sampai ada kepastian, implementasikan aturan konservatif: begitu paket memiliki transaksi apa pun (termasuk BELUM_BAYAR), DELETE ditolak dan diarahkan ke alur VOID.
3.4 Backend & Frontend
 POST /api/transactions/:id/void — ajukan VOID.
 POST /api/voids/:id/approve — approval dengan PIN/role.
 Halaman Laporan VOID (Owner): daftar VOID + alasan + siapa approve.
 UI: tombol "Ajukan VOID" di detail transaksi; modal alasan wajib; modal approval PIN untuk Owner/Supervisor.

Catatan Implementasi: (isi setelah selesai)

FASE 4 — Harga Ongkir Minimum

Referensi: Transaksi, Struk & Invoice, Bagian 3.

4.1 Skema
 Tabel settings_shipping_minimum: id, service_id, origin_city, enabled (boolean), minimum_amount, updated_by, updated_at. Riwayat perubahan pakai pola tarif_history (tambah entri baru, jangan overwrite tanpa jejak).
4.2 Nilai awal migrasi (sesuai dokumen, Bagian 15)
 Pelni Jakarta: Rp20.000
 Pelni Surabaya: Rp18.000
 Hemat: Rp10.000
 Cargo: Rp25.000
 Semua toggle default: perlu konfirmasi Owner apakah langsung ON saat rilis atau OFF dulu (TODO_KONFIRMASI_OWNER).
4.3 Logika
 Terapkan di titik perhitungan ongkir yang sudah ada (server-side, bagian 12 PRD as-is): Total Ongkir Final = toggle_ON ? MAX(hasil_normal, minimum) : hasil_normal.
 Berlaku terhadap total ongkir per customer dalam satu transaksi/layanan, bukan per baris paket individual (cek ulang contoh Doni: 2 item 0.2+0.5kg dihitung gabungan, bukan per item).
 Perubahan setting hanya berlaku ke transaksi baru; transaksi lama tidak dihitung ulang otomatis.
4.4 UI
 Tambah section di /owner/tarif: toggle ON/OFF + nilai minimum per layanan+kota, dengan riwayat perubahan.

Kriteria selesai Fase 4: 4 skenario uji di dokumen (Bagian 3.3) menghasilkan angka yang tepat — jadikan ini test case otomatis.

Catatan Implementasi: (isi setelah selesai)

FASE 5 — Tombol Nominal Cepat & UX Pembayaran

Referensi: Transaksi, Struk & Invoice, Bagian 4.

 Tombol: Pas / Rp50.000 / Rp100.000 / Rp150.000 / Rp200.000 — hanya tampil saat metode = Tunai.
 Klik tombol mengisi field "Uang Diterima"; input manual tetap bisa menimpa (dan membatalkan status "aktif" tombol).
 Kembalian dihitung real-time.
 Tombol konfirmasi nonaktif jika uang diterima < total tagihan.
 Transfer/QRIS: sembunyikan field uang diterima/kembalian, tampilkan field referensi pembayaran (opsional).
 Piutang: wajib isi nama penanggung jawab, nominal, jatuh tempo, catatan.
 Simpan transaksi+payment+kasir+waktu sebagai satu proses atomik (gunakan DB transaction, cegah race condition/double submit — idempotency key per klik konfirmasi).

Catatan Implementasi: (isi setelah selesai)

FASE 6 — Struk Transaksi

Referensi: Sistem Kasir Berbasis Shift Bagian 8–9 + Transaksi/Struk/Invoice Bagian 6.

 Setting Owner: PENGATURAN > KASIR > CETAK STRUK — Otomatis / Tanya Sebelum Cetak / Nonaktif.
 Template struk thermal 80mm (fallback A4/PDF), pakai pola builder dari print-label.ts sebagai referensi struktur, bukan reuse langsung (isinya beda — struk = bukti pembayaran, label = identitas paket fisik).
 Isi minimum struk sesuai daftar dokumen Bagian 9 (identitas usaha, no. transaksi, kasir+shift, rincian, keuangan, status).
 Cetak ulang → label "SALINAN/REPRINT" + catat di print_logs (siapa, kapan, berapa kali).

Catatan Implementasi: (isi setelah selesai)

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

Catatan Implementasi: (isi setelah selesai)

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
 UAT-05 Tombol Pas + 4 nominal cepat mengisi nilai tepat; input manual tetap berfungsi.
 UAT-06 Konfirmasi tunai gagal jika uang diterima kurang; kembalian dihitung benar.
 UAT-07 VOID mengembalikan status paket & membuat reversal tanpa menghapus riwayat.
 UAT-08 Struk menampilkan subtotal, diskon, total, metode bayar, uang diterima, kembalian.
 UAT-09 Cetak otomatis ON/OFF berfungsi; cetak ulang tercatat di print_logs.
 UAT-10 Invoice A4 dibuat dari transaksi, simpan DP/sisa, cetak PDF tanpa layout terpotong.
 UAT-11 Closing shift menampilkan transaksi + koreksi VOID dengan jelas.
 UAT-12 (baru, dari dokumen piutang) Skenario Tanggal 1 (diserahkan belum bayar) → Tanggal 3 (pelunasan) menghasilkan angka laporan persis sesuai contoh Bagian 2 & 7 dokumen piutang (tidak ada pendapatan ganda).
 UAT-13 (baru) Cicilan 2 tahap (Rp200rb + Rp300rb) menghasilkan sisa_piutang dan status yang benar di tiap tahap, nilai transaksi tetap Rp500rb.
  UAT-14 (baru) Admin tanpa shift aktif tidak bisa memproses pembayaran. **LULUS** — setelah login sebagai Admin tanpa shift aktif, `POST /api/payments/` mengembalikan HTTP 409 dengan kode `ACTIVE_SHIFT_REQUIRED` dan pesan "Buka shift terlebih dahulu"; tidak ada payment yang dibuat.
  UAT-15 (baru) Blind closing: kas sistem tidak terlihat sebelum kasir submit kas aktual. **LULUS** — langkah pertama `POST /api/shifts/:id/close` hanya mengembalikan `closingId`, status `WAITING_ACTUAL_CASH`, dan instruksi memasukkan kas aktual tanpa `systemCash`; setelah `actualCash` dikirim, hasil closing mengembalikan `systemCash`, `actualCash`, `selisih`, dan hasil `SESUAI`.

  Verifikasi akhir Fase 1 (2026-09-08):
  - Database development reachable; tabel `payments`, `settings`, `shift_sessions`, `shift_closings`, dan `shift_handovers` tersedia.
  - Setting toleransi mandiri terverifikasi melalui endpoint Owner: PATCH `cash_variance_tolerance=0` dan GET mengembalikan nilai `0`.
  - Endpoint `/api/healthz` mengembalikan HTTP 200 `{"status":"ok"}`; route terlindungi tanpa autentikasi tetap menolak request dengan HTTP 401.
  - Typecheck dan build khusus API/web berhasil. Typecheck workspace penuh masih menampilkan dua error lama di `scripts/src/seed-batch2.ts`, yang sudah dicatat sebagai utang teknis terpisah.
  - Preview web berhasil dimuat pada halaman login melalui screenshot; browser hanya melaporkan peringatan aksesibilitas `autocomplete` pada input password.
4. Log Keputusan & Asumsi (WAJIB diisi agent selama proses)

Setiap kali agent mengambil keputusan karena dokumen sumber tidak menjelaskan detail, catat di sini dengan format di bawah. Ini jadi bahan konfirmasi ke Owner nanti — jangan biarkan keputusan diam-diam terkubur di kode.

Tanggal	Area	Ambiguitas	Asumsi yang dipakai	Perlu konfirmasi Owner?
(contoh)	VOID vs hard delete	Dokumen tidak jelas soal paket yang belum pernah dibayar	Hard delete tetap diizinkan hanya jika paket belum punya transaksi sama sekali	Ya
2026-09-08	Hard delete sampai Fase 3	Owner meminta perilaku DELETE paket dan HAPUS batch tidak disentuh pada Fase 0	Perilaku existing dibiarkan; evaluasi aturan konservatif dilakukan di Fase 3	Ya, saat mulai Fase 3
2026-09-08	Backfill payment legacy	Tabel payments lama tidak memiliki penanda final eksplisit	Tunai/transfer dianggap final dan dibuat sebagai transaksi LUNAS; piutang dibuat sebagai transaksi BELUM_BAYAR	Ya, sebelum laporan transaksi Fase 2
2026-09-08	Waktu WIT	Schema baru memakai timestamp with time zone, tetapi endpoint shift/transaksi belum dibuat	Instan waktu dipertahankan oleh database; normalisasi tampilan dan aturan WIT diverifikasi saat Fase 1–2	Ya, sebelum rilis transaksi
2026-09-08	Rumus kas shift (Fase 1)	Belum ada tabel untuk mencatat Refund Tunai dan Setoran Kas	Nilai keduanya sementara 0 karena belum ada sumber data; formula kas AKURAT hanya selama belum ada VOID/refund. Begitu VOID menghasilkan reversal tunai, rumus kas shift di Fase 1 WAJIB diupdate untuk menariknya, atau closing shift akan selalu tampak SESUAI padahal ada refund yang belum tercermin.	Ya — Owner perlu mengonfirmasi apakah Setoran Kas (uang disetor ke brankas/bank di tengah shift) dibutuhkan sekarang atau bisa ditunda sampai ada kebutuhan nyata
  Batas toleransi selisih kas	Tidak disebutkan angka pastinya	—	Ya, wajib sebelum Fase 1 rilis
  Default toggle harga minimum saat rilis	Tidak disebutkan ON/OFF default	—	Ya, wajib sebelum Fase 4 rilis
  Role Supervisor	Disebut "opsional" tanpa kepastian	Diimplementasikan sebagai role opsional (kode siap, tidak wajib dipakai)	Ya
5. Ringkasan Status per Fase (update terus)
 Fase	Status	% Selesai	Blocker
0 — Skema DB	Selesai	100%	—
 1 — Shift Kasir	Selesai	100%	Konfirmasi Owner atas toleransi bisnis dan kebutuhan Setoran Kas
2 — Transaksi/Payment	Belum mulai	0%	Tunggu Fase 0, 1
3 — VOID	Belum mulai	0%	Tunggu Fase 2; keputusan hard-delete
4 — Harga Minimum	Belum mulai	0%	Independen, bisa paralel dengan Fase 1–2
5 — Nominal Cepat	Belum mulai	0%	Independen, bisa paralel
6 — Struk	Belum mulai	0%	Tunggu Fase 1, 2
7 — Invoice A4	Belum mulai	0%	Tunggu Fase 2
8 — Fix Export	Belum mulai	0%	Independen, bisa dikerjakan kapan saja/duluan