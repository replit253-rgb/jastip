# PRD — Jastip Anggun Jaya

> **Status Dokumen:** As-is (disusun dan disinkronkan 100% langsung dari source code aktif pada repositori)  
> **Tanggal Pembaruan:** 2026-11-16  
> **Tujuan Dokumen:** Mendokumentasikan arsitektur teknis, peran & kontrol akses, navigasi & rute frontend, spesifikasi seluruh modul operasional, mekanisme tarif & ongkir minimum, daftar lengkap endpoint API, skema 18 tabel database Drizzle ORM, serta daftar skrip dan catatan kondisi aktual sistem *apa adanya*.

---

## 1. Ringkasan Produk & Arsitektur Sistem

**Jastip Anggun Jaya** adalah sistem informasi operasional ekspedisi dan jasa titip (jastip) terpadu untuk mengelola alur pengiriman barang dari kota asal (**Jakarta** dan **Surabaya**) menuju **Manokwari, Papua Barat**.

Cakupan operasional sistem meliputi:
1. **Autentikasi & Manajemen Akses**: Login berbasis nomor HP & kata sandi dengan Bearer Token session, proteksi rute per role (`owner` & `admin`), serta manajemen akun staf (termasuk soft-delete/hard-delete).
2. **Manajemen Batch Pengiriman**: Pengaturan jadwal keberangkatan kapal, periode closing, serta siklus status `OPEN`, `CLOSED`, dan `ARSIP` (read-only), plus penghapusan batch oleh Owner.
3. **Pencatatan & Import Paket**: Input paket satuan/multi-resi (`Jastip Pesawat`, `Jastip Hemat+`, `Jastip Pelni`, `Jastip Kargo`), perhitungan berat volume otomatis, biaya tambahan opsional, dan import massal file `.xlsx` dengan template standar & kargo.
4. **Label Barcode & QR Code**: Pembuatan kode unik `JAJ-...` (paket individual) dan `JAJ-GRUP-...` (grup paket per customer-layanan-batch) serta cetak stiker termal ukuran **100mm × 150mm** dan export PNG barcode Code128.
5. **Verifikasi Fisik Paket Bongkar Muat**: Alur verifikasi 3 tahap berbasis batch → layanan → customer group menggunakan kamera QR (`html5-qrcode`), HID scanner, upload foto barcode, input manual, serta fitur **Verifikasi Sekaligus** (tingkat batch, layanan, maupun penerima).
6. **Manajemen Shift Kasir, Blind Closing & Serah Terima**: Siklus buka shift (`PAGI` / `MALAM`) dengan modal awal laci, pelacakan kas laci real-time, penutupan buta (*blind closing*) 2 tahap dengan hitung pecahan fisik uang, batas toleransi selisih kas dengan approval Owner, serah terima shift dua pihak, dan cetak laporan closing termal **80mm**.
7. **Kasir Scan, Multi-Pembayaran, Piutang & Struk**: Penyerahan paket dengan wajib shift aktif, pembayaran **Tunai**, **Transfer Bank**, **QRIS** (gambar QR dinamis unggahan Owner), dan **Piutang** (DP/tanpa bayar + cicilan bertahap), pencegahan duplikasi submit (*Idempotency Key*), serta cetak & download PDF struk **80mm** dengan mode `AUTO` / `ASK` / `OFF`.
8. **Invoice A4 Terpadu**: Pembuatan tagihan A4 baik secara manual (pencarian nama customer, filter batch, penanda paket yang sudah/belum masuk invoice) maupun dari transaksi kasir, cetak snapshot HTML A4, Download PDF `jsPDF`, serta pencatatan audit reprint (`print_logs`).
9. **Pengajuan & Persetujuan VOID**: Pengajuan pembatalan transaksi kasir oleh Admin/Owner dan persetujuan VOID oleh Owner untuk membalik saldo kas (`VOID_REVERSAL`), mendeteksi VOID pasca-closing, serta mengembalikan status paket ke `BELUM_DIAMBIL`.
10. **Pengeluaran Operasional, Keuangan, Laporan & Pengaturan**: Pencatatan kas keluar harian, analisis keuangan per layanan, laporan harian/bulanan/tahunan beserta export `.xlsx` dan `.pdf`, serta konfigurasi tarif, ongkir minimum, QRIS, toleransi kas, dan mode cetak struk.

### 1.1 Stack Teknologi & Arsitektur Runtime

| Komponen | Teknologi & Versi Aktual | Keterangan |
|---|---|---|
| **Server Terpadu** | Node.js + Express `^5.2.1` + `tsx ^4.21.0` | Entrypoint tunggal `/server.ts` pada **Port `3000`** (`0.0.0.0:3000`). Menjalankan Express API (`/artifacts/api-server/src/app.ts`) dan Vite middleware (mode dev, HMR dinonaktifkan) atau static bundle `/artifacts/jastip/dist/public` (mode produksi). |
| **API Standalone** | Express `5.2.1` + Pino / `pino-http` + CORS | Berlokasi di `/artifacts/api-server`. Limit payload JSON & URL-encoded `100mb`. Menyajikan file statis unggahan di prefix `/uploads` (`process.cwd()/uploads`). |
| **Frontend UI** | **React `19.1.0`** + **Vite `7.3.2`** + **TypeScript `~5.9.3`** | Berlokasi di `/artifacts/jastip`. Proxy standalone dev (`vite.config.ts`) mengarahkan `/api` ke `http://localhost:8080`, sedangkan server terpadu `server.ts` melayani `/api` langsung di Port `3000`. |
| **Routing & State** | **Wouter `^3.3.5`** + **TanStack React Query `^5.90.21`** | `staleTime: 30_000` (30 detik), `gcTime: 5 * 60_000` (5 menit). |
| **Styling & Komponen** | **Tailwind CSS v4 (`@tailwindcss/vite ^4.1.14`)** + Radix UI / shadcn/ui + Lucide React | Antarmuka responsif desktop & mobile dengan komponen Sidebar & Dialog/AlertDialog. |
| **Barcode, QR & Grafik** | `qrcode`, `html5-qrcode`, `jsbarcode`, `recharts` | Pemindaian kamera & gambar QR, rendering SVG/PNG barcode, dan grafik dashboard/laporan. |
| **Ekspor PDF & Excel** | `jspdf ^4.2.1`, `jspdf-autotable ^5.0.8`, `xlsx ^0.18.5` | Generate PDF struk 80mm, Invoice A4, laporan tabel, serta import/export spreadsheet `.xlsx`. |
| **Database & ORM** | **PostgreSQL (`pg`)** + **Drizzle ORM `^0.45.2`** | Skema modular di `/lib/db/src/schema/*.ts` (18 tabel) + 9 file migrasi SQL di `/lib/db/migrations/`. |
| **Fallback Mock DB** | In-Memory Mock DB (`/lib/db/src/index.ts`) | Jika `DATABASE_URL`/`PGHOST` tidak diset atau koneksi PostgreSQL gagal saat startup, sistem otomatis beralih ke mode in-memory (`_isMock = true`) dengan data seed demo bawaan. |

### 1.2 Variabel Lingkungan (`.env`)

Variabel lingkungan yang digunakan oleh server dan database (nilai rahasia tidak dicantumkan dalam dokumen):
- `DATABASE_URL` atau konfigurasi terpisah `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — koneksi PostgreSQL.
- `NODE_ENV` — menentukan mode `development` (Vite middleware) atau `production` (static `dist/public`) dan konfigurasi SSL/logging.
- `PORT` — dipakai oleh standalone API server (`/artifacts/api-server/src/index.ts`), sedangkan `/server.ts` selalu mendengarkan di port `3000`.
- `BASE_PATH` — base path aplikasi frontend pada konfigurasi Vite (`artifacts/jastip/vite.config.ts`).
- `OWNER_PHONE` & `OWNER_PASSWORD` — kredensial bootstrap/seed akun Owner saat inisialisasi atau skrip pengujian/seed.

---

## 2. Autentikasi, Sesi & Kontrol Akses

### 2.1 Mekanisme Autentikasi & Sesi
- **Login (`POST /api/auth/login`)**: Menggunakan nomor HP (`phone`) dan kata sandi (`password`). Kata sandi di-hash dengan **SHA-256** menggunakan salt statis `jaj_salt_2024`.
- **Validasi Status Akun**: Pengguna yang memiliki `isActive = false`, `isHidden = true`, atau `deletedAt != null` ditolak login-nya (HTTP `403`).
- **Token Sesi**: Setiap login menerbitkan token acak 64-hex yang disimpan di tabel `sessions` dengan masa berlaku **7 hari**, dikirim frontend melalui header `Authorization: Bearer <token>`.
- **Registrasi (`POST /api/auth/register`)**: Endpoint API publik tersedia dan selalu membuat akun dengan role `admin` (`isActive = true`), namun halaman UI `/login` (`artifacts/jastip/src/pages/login.tsx`) saat ini **hanya menampilkan form login** (tidak ada tautan atau tab pendaftaran).

### 2.2 Role Pengguna & Hak Akses
Pada skema database `users.role`, hanya terdapat dua nilai enum resmi: **`owner`** dan **`admin`**.
> *Catatan as-is:* Pada beberapa filter lama di API (`customers.ts`, `packages.ts`) dan route redirect `App.tsx` (`/customer`), masih terdapat penanganan nama legacy `"customer"`, namun sistem saat ini seluruhnya beroperasi sebagai aplikasi internal staf (`owner` dan `admin`).

1. **Role `owner` (Pemilik / Super-Admin)**:
   - Melalui komponen `ProtectedRoute` (`App.tsx`), role `owner` otomatis diizinkan mengakses seluruh rute yang bertanda `role="admin"` maupun `role="owner"`.
   - Memiliki akses eksklusif untuk: Dashboard eksekutif & grafik, Keuangan per layanan, Approval VOID (`/owner/voids`), Laporan Harian/Bulanan/Tahunan (`/owner/reports`), Pengaturan Tarif & Ongkir Minimum (`/owner/tarif`), Pengaturan Kas/QRIS/Mode Struk/Toleransi Kas (`/owner/settings`), Data Admin (`/owner/admins`), Manajemen User (`/owner/users`), serta aksi destruktif **Hapus Paket (`DELETE /api/packages/:id`)** dan **Hapus Batch (`statusBatch = "HAPUS"`)**.
2. **Role `admin` (Operator & Kasir)**:
   - Menjalankan operasional harian: pengelolaan batch (`OPEN` / `CLOSED` / `ARSIP`), input & import paket, cetak label barcode, verifikasi paket fisik, penerbitan & cetak Invoice A4, manajemen shift & blind closing, transaksi kasir (`Scan & Pembayaran`), pelunasan piutang, riwayat pembayaran, pencatatan pengeluaran (via rute `/admin/pengeluaran`), pengajuan VOID, serta melihat pengaturan kas/tarif jika mengakses `/admin/settings` atau `/admin/tarif`.

---

## 3. Struktur Navigasi & Daftar Rute Frontend

### 3.1 Navigasi Sidebar (`artifacts/jastip/src/components/layout.tsx`)

Header atas pada layout selalu menampilkan indikator status shift aktif milik user yang login (`<Nama> • Shift Pagi/Malam • Aktif` atau `Shift belum dibuka`) yang menaut ke `/admin/shift` atau `/owner/shift`.

#### A. Menu Admin (`adminNav` — 14 Item)
| No | Label Menu | Route | Ikon | Keterangan |
|:-:|:---|:---|:---|:---|
| 1 | **Dashboard** | `/admin/dashboard` | `LayoutDashboard` | Statistik ringkas paket & aktivitas admin |
| 2 | **Semua Paket** | `/admin/packages` | `Package` | Tabel inventaris seluruh paket |
| 3 | **Batch Pengiriman** | `/admin/batches` | `Ship` | Kelola daftar batch kapal & periode closing |
| 4 | **Input Paket** | `/admin/packages/type` | `FileInput` | Pilih jenis layanan untuk input paket baru |
| 5 | **Import Excel** | `/admin/packages/import` | `FileSpreadsheet` | Upload massal data paket via `.xlsx` |
| 6 | **Label Barcode** | `/admin/barcode` | `Barcode` | Pilih batch untuk cetak label barcode/QR |
| 7 | **Arsip Sudah Diambil** | `/admin/arsip` | `Archive` | Daftar batch & paket yang sudah diserahkan |
| 8 | **Verifikasi Paket** | `/admin/verify` | `ShieldCheck` | Verifikasi fisik paket bongkar kapal per batch |
| 9 | **Riwayat Pembayaran** | `/admin/riwayat-pembayaran` | `History` | Daftar batch & rincian pelunasan/pembayaran |
| 10 | **Transaksi & VOID** | `/admin/finance` | `ShieldCheck` | Daftar transaksi kasir & ajukan VOID |
| 11 | **Invoice A4** | `/admin/invoices` | `FileText` | Buat & cetak Invoice A4 |
| 12 | **Shift Kasir** | `/admin/shift` | `WalletCards` | Buka shift, pantau kas laci, & blind closing |
| 13 | **Scan & Pembayaran** | `/admin/scan` | `ScanLine` | **Kondisional**: hanya tampil di sidebar bila user memiliki shift `AKTIF` |
| 14 | **Profil** | `/admin/profile` | `UserCircle` | Ubah nama dan kata sandi akun |

#### B. Menu Owner (`ownerSections` — Total 20 Item dalam 2 Seksi)
- **Seksi 1: `Owner` (13 Item)**:
  1. **Dashboard** (`/owner/dashboard`)
  2. **Monitor Paket** (`/owner/packages`)
  3. **Data Admin** (`/owner/admins`)
  4. **Keuangan** (`/owner/finance`)
  5. **Invoice A4** (`/owner/invoices`)
  6. **Laporan VOID** (`/owner/voids`)
  7. **Pengeluaran Harian** (`/owner/pengeluaran`)
  8. **Shift & Closing** (`/owner/shift`)
  9. **Laporan** (`/owner/reports`)
  10. **Pengaturan Tarif** (`/owner/tarif`)
  11. **Pengaturan Kas** (`/owner/settings`)
  12. **Manajemen User** (`/owner/users`)
  13. **Profil** (`/owner/profile`)
- **Seksi 2: `Admin Tools` (7 Item)**:
  1. **Batch Pengiriman** (`/owner/batches`)
  2. **Input Paket** (`/owner/packages/type`)
  3. **Import Excel** (`/owner/packages/import`)
  4. **Label Barcode** (`/owner/barcode`)
  5. **Arsip Sudah Diambil** (`/owner/arsip`)
  6. **Verifikasi Paket** (`/owner/verify`)
  7. **Scan & Pembayaran** (`/owner/scan`) — **Kondisional**: hanya tampil saat Owner membuka shift `AKTIF`

### 3.2 Daftar Lengkap Rute Detail & Terdaftar (`App.tsx`)

Selain item di sidebar, `Router()` mendaftarkan rute detail dan rute bersama berikut:
- **Rute Publik / Pengalihan**: `/`, `/admin`, `/owner`, `/customer` (mengalihkan otomatis ke `/${user.role}/dashboard` atau `/login`), `/login`, serta fallback `NotFound`.
- **Rute Detail & Sub-halaman Admin**:
  - `/admin/packages/new` — Form input paket (satuan/grup/kargo)
  - `/admin/packages/:id` — Rincian paket & edit atribut + download PNG barcode
  - `/admin/barcode/batch/:id` — Daftar paket & grup dalam batch, cetak label batch, hitung ulang ongkir batch (`recalculate-batch`)
  - `/admin/barcode-group` — Rincian paket per grup customer-layanan-batch & cetak QR grup
  - `/admin/verify/batch/:id` — Halaman 3 langkah verifikasi fisik & Verifikasi Sekaligus
  - `/admin/riwayat-pembayaran/batch/:id` — Rekap pembayaran per customer pada batch tertentu
  - `/admin/riwayat-pembayaran/batch/:id/detail` — Rincian transaksi/pelunasan customer dalam batch
  - `/admin/arsip/batch/:id` — Rincian paket berstatus sudah diambil pada batch tertentu
  - `/admin/shift/handover` — Serah terima kas shift antar kasir
  - `/admin/pengeluaran` — Pencatatan pengeluaran operasional
  - `/admin/settings` & `/admin/tarif` (`roles={["admin", "owner"]}`) — Akses komponen pengaturan kas & tarif
  - `/admin/admins`, `/admin/reports`, `/admin/users`, `/admin/voids` (terdaftar di router dengan guard `role="owner"`)
- **Rute Detail & Sub-halaman Owner**:
  - `/owner/packages/new`, `/owner/packages/:id`
  - `/owner/barcode/batch/:id`, `/owner/barcode-group`
  - `/owner/verify/batch/:id`
  - `/owner/arsip/batch/:id`
  - `/owner/shift/handover`
  - `/owner/finance/:service` — Rincian paket & transaksi untuk satu jenis layanan (`pesawat`, `hemat`, `pelni`, `kargo`)

---

## 4. Spesifikasi Lengkap Modul & Fitur Operasional

### 4.1 Manajemen Batch Pengiriman (`/admin/batches`, `/owner/batches`)
- **Data Batch**: `namaKapal`, `etd` (tanggal berangkat), `periodeClosingMulai`, `periodeClosingSelesai`, `kotaAsal` (Jakarta / Surabaya / dll), `tujuan` (default `Manokwari`), dan `statusBatch`.
- **Siklus Status**:
  - `OPEN`: Batch aktif menerima input dan import paket baru.
  - `CLOSED`: Batch dikunci dari operasional input normal atau sedang dalam proses pengiriman/bongkar.
  - `ARSIP`: Batch selesai dan bersifat *read-only* — API `PATCH /api/batches/:id` menolak mutasi apa pun pada batch yang sudah berstatus `ARSIP`.
  - `HAPUS`: Aksi khusus pada `PATCH /api/batches/:id` (hanya `owner`) untuk menghapus seluruh paket yang terkait dengan batch tersebut beserta record batch-nya secara permanen.
- **Tampilan**: Dikelompokkan dalam tab status (`OPEN`, `CLOSED`, `ARSIP`) dengan paginasi **5 item/halaman**.

### 4.2 Input Paket, Mode Grup, & Import Excel
- **Input Paket Baru (`/admin/packages/type` → `/admin/packages/new`)**:
  - Mendukung 4 layanan: **Jastip Pesawat**, **Jastip Hemat+**, **Jastip Pelni**, dan **Jastip Kargo**.
  - Mendukung mode input **Satuan/Grup Multi-Resi** dan **Kargo (`packageMode: "single"` atau kubikasi)** dalam satu atau beberapa resi per customer.
  - Menyimpan data berat fisik (`realWeight`), dimensi `P × L × T` (cm), `volumeWeight`, `usedWeight`, `packagingType`, `serviceType`, `deliveryRoute`, `totalShipping`, serta field **Biaya Tambahan (`additionalFee`)** dan alasan biaya tambahan pada UI.
- **Import Excel (`/admin/packages/import`)**:
  - Menyediakan unduhan dua template `.xlsx`: **Template Standard** (Pesawat, Hemat+, Pelni) dan **Template Kargo** (`packageMode: "single"`).
  - Saat import (`POST /api/packages/import`), nomor resi (`resiNumber`) yang sudah ada pada `batchId` yang sama otomatis dilewati (*skip duplicate*) untuk mencegah impor ganda — **kecuali** paket dengan `packageMode === "single"` (Kargo) yang diizinkan mengulang resi/item terpisah.
- **Detail & Edit Paket (`/admin/packages/:id` & `/owner/packages/:id`)**:
  - Menampilkan seluruh atribut berat, dimensi, ongkir, biaya tambahan, status verifikasi/pengambilan/pembayaran, serta tombol unduh barcode Code128 sebagai gambar PNG.
  - Pengeditan (`PATCH /api/packages/:id`) mengunci seluruh field finansial/berat/layanan apabila paket sudah berstatus `SUDAH_DIAMBIL` / `diserahkan` (hanya pembaruan `customerName` yang masih diizinkan).
  - Penghapusan paket (`DELETE /api/packages/:id`) hanya dapat dilakukan oleh **Owner**.
  - > *Catatan Skema As-Is (`additionalFeeReason`):* Kolom `additional_fee` tersimpan penuh di PostgreSQL (`packages.additional_fee`), namun tabel `packages` pada Drizzle schema belum memiliki kolom `additional_fee_reason` (hanya tersedia di tabel `transactions` dan payload runtime/mock DB). Akibatnya, di mode PostgreSQL alasan biaya tambahan per paket belum dipersistensikan di baris `packages` setelah reload, sedangkan nominal rupiah biaya tambahannya tersimpan normal dan ikut terjumlah dalam total tagihan kasir/invoice.

### 4.3 Modul Label Barcode & QR Code (`/admin/barcode`, `/admin/barcode/batch/:id`, `/admin/barcode-group`)
- **Format Barcode**:
  - Paket individual: `JAJ-<timestamp>-<random/urut>`.
  - Paket grup (multi-paket milik customer + layanan + batch yang sama): kode QR grup **`JAJ-GRUP-<id1>-<id2>-...`**.
- **Cetak Stiker Termal (`artifacts/jastip/src/lib/print-label.ts`)**:
  - Menghasilkan jendela cetak HTML berukuran stiker **100mm × 150mm** (`@page { size: 100mm 150mm; margin: 0; }`) berisi QR code beresolusi tinggi, identitas Jastip Anggun Jaya, nama penerima, rute pengiriman, batch kapal/ETD, jenis layanan, no resi, berat, catatan/biaya tambahan (jika > 0), dan ringkasan ongkir.
  - Mendukung cetak satu paket, cetak grup QR (`JAJ-GRUP-...`), maupun cetak semua label paket pada satu batch.
- **Halaman Detail Batch Barcode (`/admin/barcode/batch/:id` & `/owner/barcode/batch/:id`)**:
  - Menampilkan daftar customer group & paket dengan paginasi **15 item/halaman**.
  - Dilengkapi tombol **Hitung Ulang Batch Ini** (`POST /api/packages/recalculate-batch`) untuk menghitung ulang ongkir seluruh paket di batch tersebut berdasarkan aturan tiering dan minimum ongkir aktif saat itu.
- **Halaman Detail Grup Barcode (`/admin/barcode-group` & `/owner/barcode-group`)**:
  - Menampilkan ringkasan total paket, total berat, total ongkir, total biaya tambahan, grand total tagihan, paginasi **10 paket/halaman**, dan dialog edit paket langsung.

### 4.4 Modul Verifikasi Paket Fisik (`/admin/verify`, `/admin/verify/batch/:id`, `/owner/verify/batch/:id`)
Alur verifikasi fisik barang pasca-bongkar muat kapal pada `verify-batch-detail.tsx` menggunakan **3 langkah terstruktur**:
- **Langkah 0 — Pilih Jenis Jastip**: Menampilkan ringkasan progres verifikasi per layanan (`Jastip Pesawat`, `Jastip Hemat+`, `Jastip Pelni`, `Jastip Kargo`) di dalam batch tersebut.
- **Langkah 1 — Daftar Penerima (Customer Group)**:
  - Menampilkan kartu grup customer dengan paginasi **15 grup/halaman**, pencarian nama/resi/barcode, dan filter status (*Semua*, *Belum Selesai*, *Selesai*).
- **Langkah 2 — Verifikasi Paket per Penerima**:
  - Mendukung 4 metode scan: **Kamera QR (`Html5Qrcode`)**, **USB/Bluetooth HID Barcode Scanner** (deteksi input cepat/Enter), **Upload Foto Barcode/QR**, dan **Input Manual** (via `GET /api/packages/scan/:barcode?batchId=...`).
  - **Validasi Keamanan Scan**:
    - Mendukung format individual (`JAJ-...`), grup (`JAJ-GRUP-...`), nomor resi, nomor paket, dan ID.
    - Menolak dengan peringatan keras jika paket berasal dari **batch berbeda** atau milik **customer yang berbeda** dengan tab customer yang sedang dibuka.
    - Menolak duplikasi verifikasi jika paket sudah berstatus `SUDAH_DIVERIFIKASI`.
- **Fitur Verifikasi Sekaligus (Bulk Verify — `POST /api/packages/verify-all`)**:
  - Tersedia di ketiga level UI dengan dialog konfirmasi `AlertDialog` untuk mencegah klik tidak disengaja:
    1. **Level Batch (Langkah 0)**: Tombol *Verifikasi Semua Paket (N)* untuk memverifikasi seluruh paket belum terverifikasi di batch aktif.
    2. **Level Layanan (Langkah 1)**: Tombol *Verifikasi Semua {Jenis Layanan} (N)* untuk memverifikasi seluruh paket pada layanan terpilih di batch aktif.
    3. **Level Penerima (Langkah 2)**: Tombol *Verifikasi Penerima Ini (N)* untuk memverifikasi sekaligus semua paket milik customer group yang sedang dibuka.
  - Endpoint `POST /api/packages/verify-all` mendukung filter `packageIds[]`, `batchId` (termasuk `"no-batch"` / `null`), dan opsional `serviceType`, serta dapat dijalankan baik pada PostgreSQL maupun mode Mock DB.

### 4.5 Modul Invoice A4 (`/admin/invoices`, `/owner/invoices`)
- **3 Tab Antarmuka**:
  1. **Pilih Paket & Buat Invoice**: Pencarian paket berdasarkan nama customer, filter dropdown batch pengiriman, filter status invoice (*Semua Status*, *Belum Ber-Invoice*, *Sudah Ber-Invoice*), paginasi **10 paket/halaman**, tombol *Pilih Semua yang Belum di-Invoice*, serta checklist manual paket.
  2. **Daftar Invoice Terbit**: Pencarian nomor invoice (`INV-YYYYMMDD-NNNN`) atau nama customer, filter status pembayaran, paginasi **10 invoice/halaman**, tombol Preview & Cetak A4, serta Download PDF.
  3. **Dari Transaksi**: Daftar transaksi kasir berstatus `AKTIF` (paginasi **6 transaksi/halaman**) untuk menerbitkan invoice langsung via `POST /api/invoices/from-transaction/:transactionId`.
- **Penanda Paket (`GET /api/invoices/package-map`)**: Menandai paket mana saja yang sudah terikat pada invoice non-batal (badge hijau nomor invoice yang dapat diklik untuk membuka detail/cetak).
- **Kalkulasi Status Invoice**:
  - Input opsional: Diskon, Uang Muka (DP), Jatuh Tempo, Catatan.
  - Penentuan status otomatis: `BELUM_LUNAS` (DP = 0), `DIBAYAR_SEBAGIAN` (0 < DP < Total), `LUNAS` (DP >= Total).
- **Cetak HTML A4 & Download PDF (`artifacts/jastip/src/lib/print-invoice.ts`)**:
  - Cetak snapshot dokumen A4 standar via jendela print browser serta generator PDF langsung menggunakan `jsPDF` + `jspdf-autotable`.
  - Setiap aksi cetak memanggil `POST /api/invoices/:id/print` yang menyimpan audit ke tabel `print_logs` dan mengembalikan `copyNumber` serta label `"SALINAN / REPRINT"` bila `copyNumber > 1`.
- > *Catatan As-Is:* Nilai enum `"BATAL"` sudah ada di definisi database `invoices.status` dan sudah dikecualikan oleh endpoint `/api/invoices/package-map`, namun saat ini **belum terdapat tombol maupun endpoint API untuk membatalkan (`BATAL`) invoice yang sudah terbit**.

### 4.6 Modul Shift Kasir, Blind Closing & Serah Terima (`/admin/shift`, `/owner/shift`, `/admin/shift/handover`)
- **Pembukaan Shift (`POST /api/shifts/open`)**:
  - Kasir memilih `shiftType` (`PAGI` atau `MALAM`), opsional `terminalId`, dan mengisi modal awal laci (`openingBalance` bilangan bulat $\ge 0$).
  - Satu user hanya dapat memiliki satu shift berstatus `AKTIF` dalam satu waktu. Selama tidak ada shift `AKTIF`, menu & akses kasir (`Scan & Pembayaran` + `POST /api/transactions` + `POST /api/transactions/:id/pay`) diblokir oleh middleware `requireActiveShift`.
- **Formula Kas Sistem (`artifacts/api-server/src/lib/shift-cash.ts`)**:
  $$\text{System Cash} = \text{Modal Awal} + \text{Kas Masuk Tunai} - \text{Kembalian} - \text{Pengeluaran Tunai} - \text{Refund Tunai VOID} - \text{Setoran Kas}$$
  *(Catatan: Pengeluaran `cash` pada tabel `pengeluaran` dipetakan ke shift apabila waktu `createdAt`-nya berada di antara `actualStart` dan `actualEnd` shift tersebut.)*
- **Blind Closing 2 Tahap (`POST /api/shifts/:id/close`)**:
  - **Tahap 1 (Inisiasi tanpa `closingId`)**: Server menghitung `systemCash`, membuat record di `shift_closings`, tetapi **menyembunyikan nilai `systemCash` dari kasir** agar kasir menghitung fisik uang secara jujur (*blind closing*).
  - **Tahap 2 (Konfirmasi Hitung Fisik dengan `closingId`)**: Pada UI kasir memasukkan jumlah lembar/koin untuk **9 pecahan uang** (`100.000`, `50.000`, `20.000`, `10.000`, `5.000`, `2.000`, `1.000`, `500`, `200`).
  - **Validasi Toleransi Selisih Kas**: Selisih (`actualCash - systemCash`) dibandingkan terhadap pengaturan `cash_variance_tolerance` (default Rp 0). Jika selisih melebihi toleransi dan dilakukan bukan oleh Owner (tanpa `overrideByOwner`), API mengembalikan **HTTP `403`** dengan kode `OWNER_APPROVAL_REQUIRED` sampai Owner menyetujui/mengambil alih penutupan shift. Jika selisih $\neq 0$, `alasanSelisih` wajib diisi.
- **Cetak Laporan Closing Shift (`artifacts/jastip/src/lib/print-shift-closing.ts`)**:
  - Mencetak ringkasan closing shift (modal awal, penerimaan tunai/transfer/QRIS, pengeluaran tunai, system cash, actual cash, selisih, dan alasan) ke format struk termal **80mm**.
- **Serah Terima Shift (`POST /api/shifts/:id/handover`, `/admin/shift/handover`, `/owner/shift/handover`)**:
  - Mencatat perpindahan kas (`handoverAmount`) dari `fromShiftSessionId` ke `toShiftSessionId` pada tabel `shift_handovers` dengan mekanisme konfirmasi dua sisi (`confirmedByGiver` dan `confirmedByReceiver`) serta opsi `manualOverride` + `manualReason`.
- **Riwayat Shift**: Tabel riwayat shift di `/admin/shift` dan `/owner/shift` dipaginasi **10 shift/halaman**.

### 4.7 Modul Scan Kasir, Pembayaran, Piutang & Struk (`/admin/scan`, `/admin/riwayat-pembayaran`)
- **Kasir Scan (`/admin/scan` & `/owner/scan`)**:
  - Dilindungi oleh middleware `requireActiveShift`.
  - Mendukung scan kamera, HID scanner, upload gambar, dan cari manual. Jika memindai QR grup `JAJ-GRUP-...`, seluruh paket dalam grup tersebut langsung dimuat ke keranjang kasir.
  - Dapat menambahkan biaya tambahan transaksi (`additionalFee` + `additionalFeeReason`) serta potongan diskon (`discount` + wajib `discountReason` jika diskon > 0).
- **4 Metode Pembayaran (`POST /api/transactions`)**:
  - **Tunai**: Validasi uang diterima $\ge$ total tagihan, hitung kembalian otomatis.
  - **Transfer Bank**: Pencatatan nomor referensi transfer (`paymentReference`).
  - **QRIS**: Menampilkan gambar QRIS toko yang diambil dari pengaturan `qris_image_url` (`/api/settings/qris-image` yang disimpan di `/uploads/qris/...`) + nomor referensi pembayaran.
  - **Piutang**: Pilihan bayar sebagian (DP) atau `Rp 0` dengan wajib mengisi estimasi jatuh tempo (`jatuhTempo`) dan nama penanggung jawab (`penanggungJawab`).
- **Integritas Transaksi**:
  - Mendukung `Idempotency-Key` (header HTTP atau body `idempotencyKey`) dan penguncian baris PostgreSQL (`FOR UPDATE`) pada paket yang sedang diproses agar tidak terjadi pembayaran ganda dari klik/jaringan lambat.
- **Pelunasan Piutang Bertahap (`POST /api/transactions/:id/pay` & `/admin/riwayat-pembayaran`)**:
  - Halaman riwayat pembayaran menampilkan daftar batch, rekap tagihan & sisa piutang per customer (paginasi **10 customer/halaman** pada `/admin/riwayat-pembayaran/batch/:id`), dan rincian pembayaran cicilan bertahap (tunai/transfer/QRIS) hingga `sisaPiutang = 0` (`LUNAS`).
- **Struk Kasir 80mm (`artifacts/jastip/src/lib/print-receipt.ts`)**:
  - Mendukung cetak HTML termal **80mm** dan **Download PDF** langsung (`jsPDF` ukuran lebar 80mm).
  - Perilaku otomatis setelah pembayaran dikontrol oleh pengaturan `receipt_print_mode`:
    - `AUTO`: Langsung memicu cetak struk setelah transaksi sukses.
    - `ASK`: Menampilkan dialog konfirmasi pilihan cetak/download/lewati.
    - `OFF`: Tidak memunculkan prompt cetak otomatis (masih bisa dicetak ulang dari riwayat).
  - Setiap pencetakan struk dicatat ke `print_logs` melalui `POST /api/transactions/:id/receipt/print`.

### 4.8 Modul Pengajuan & Persetujuan VOID (`/admin/finance`, `/owner/voids`)
- **Pengajuan VOID (`POST /api/transactions/:id/void`)**:
  - Admin atau Owner dapat mengajukan pembatalan untuk transaksi yang masih berstatus `AKTIF` dengan memilih kode alasan (`reasonCode`) dan catatan (`notes`). Record tersimpan di tabel `voids` dengan `statusAfter = "MENUNGGU_APPROVAL"`.
  - Pengajuan ganda pada transaksi yang sudah `VOID` atau sedang menunggu approval ditolak oleh server.
- **Approval VOID oleh Owner (`POST /api/voids/:id/approve` di `/owner/voids`)**:
  - Paginasi daftar pengajuan VOID pada `/owner/voids` adalah **5 item/halaman**.
  - Saat Owner menekan tombol **Setujui VOID**:
    1. Status transaksi diubah menjadi `VOID`, `paymentStatus = "BELUM_BAYAR"`, dan `sisaPiutang = 0`.
    2. Seluruh paket dalam transaksi tersebut dikembalikan ke status `status = "pending"`, `statusPengambilan = "BELUM_DIAMBIL"`, `pickedUpAt = null`.
    3. Sistem membuat entri pembayaran negatif bertipe `VOID_REVERSAL` sebesar total yang pernah dibayarkan.
    4. **Deteksi Pasca-Closing (`isPostClosing`)**: Jika shift asal transaksi sudah berstatus `CLOSED`, `isPostClosing` ditandai `true`. Jika Owner sedang membuka shift aktif, reversal diarahkan ke shift aktif Owner tersebut; jika tidak, reversal pasca-closing dibiarkan `shiftSessionId = null` sebagai koreksi pusat.
- > *Catatan As-Is:* Antarmuka `/owner/voids` dan backend `routes/voids.ts` saat ini **hanya menyediakan aksi Approve (`POST /api/voids/:id/approve`)**; tombol atau endpoint penolakan (`Reject VOID`) belum diimplementasikan.

### 4.9 Modul Keuangan, Pengeluaran, Dashboard, Laporan, User & Pengaturan
- **Dashboard Admin (`/admin/dashboard`) & Owner (`/owner/dashboard`)**:
  - Ringkasan jumlah paket masuk, belum diverifikasi, siap diambil, sudah diambil, omzet harian/total, piutang belum lunas, pengeluaran, dan grafik tren periode `week` / `month` / `year` (`GET /api/dashboard/chart`).
- **Keuangan Owner (`/owner/finance` & `/owner/finance/:service`)**:
  - Rekap pemasukan per layanan (`pesawat`, `hemat`, `pelni`, `kargo`) dan rincian transaksi/paket per layanan dengan paginasi **10 item/halaman**.
- **Pengeluaran Operasional (`/owner/pengeluaran` & `/admin/pengeluaran`)**:
  - CRUD pengeluaran (`tanggal`, `kategori`, `nominal`, `metodePembayaran`: `cash` | `transfer` | `lainnya`, `catatan`), filter pencarian, export `.xlsx`/`.pdf`, dan paginasi **10 item/halaman**.
- **Laporan Komprehensif (`/owner/reports`)**:
  - Mode laporan **Harian**, **Bulanan**, dan **Tahunan** (`GET /api/reports?type=daily|monthly|yearly`), menampilkan metrik pendapatan, piutang, pengeluaran, ringkasan transaksi, dan tombol export Excel/PDF (paginasi **10 item/halaman**).
- **Data Admin (`/owner/admins`) & Manajemen User (`/owner/users`)**:
  - CRUD akun staf `admin` (tambah akun, ubah nama/HP, aktifkan/nonaktifkan, reset kata sandi, hapus akun). Paginasi **10 item/halaman**.
  - **Aturan Hapus Admin (`DELETE /api/admins/:id`)**: Jika admin memiliki riwayat data (paket, transaksi, pembayaran, atau shift), sistem melakukan **Soft Delete** (`isActive = false`, `isHidden = true`, `deletedAt = now()`) agar integritas data historis terjaga; jika belum memiliki riwayat sama sekali, dilakukan **Hard Delete**.
- **Pengaturan Kas & Operasional (`/owner/settings`)**:
  - Mengelola konfigurasi pada tabel `settings`: `qris_image_url` (upload gambar PNG/JPG/JPEG/WEBP maks 2MB ke `/uploads/qris/...`), `cash_variance_tolerance` (batas toleransi selisih kas laci), dan `receipt_print_mode` (`AUTO` / `ASK` / `OFF`). Setiap perubahan dicatat juga ke `tarif_history`.
- **Tabel Inventaris Paket (`/admin/packages`, `/owner/packages`, `/admin/arsip`, `/owner/arsip`)**:
  - Mendukung filter layanan, batch, status, pencarian resi/customer, export Excel/PDF (`package-export.ts`), dengan paginasi **10 item/halaman** (`packages.tsx`) dan **5 batch/halaman** (`arsip.tsx`).

---

## 5. Rumus Berat, Tarif & Mekanisme Ongkir Minimum

### 5.1 Rumus Berat Volume & Berat Pakai
$$\text{Berat Volume} = \frac{\text{Panjang (cm)} \times \text{Lebar (cm)} \times \text{Tinggi (cm)}}{\text{Divisor Layanan}}$$
$$\text{Berat Pakai} = \max(\text{Berat Aktual (kg)}, \text{Berat Volume (kg)})$$

**Divisor per Layanan (`routes/packages.ts`):**
- **Jastip Pesawat**: `5.000`
- **Jastip Hemat+**: `4.000`
- **Jastip Pelni**: `4.000`
- **Jastip Kargo**: `1.000.000` *(menghasilkan volume kubikasi $\text{M}^3$)*

### 5.2 Aturan Tarif & Pembulatan Layanan (`routes/packages.ts`)

| Layanan | Ketentuan & Perhitungan As-Is Saat Ini |
|---|---|
| **Jastip Pesawat** | Tarif default `Rp 77.000 / kg`. Akumulasi berat per customer dalam batch yang sama dibulatkan: $\le 0{,}2\text{ kg} \rightarrow 0{,}2\text{ kg}$; $\le 0{,}4\text{ kg} \rightarrow 0{,}4\text{ kg}$; $\le 0{,}5\text{ kg} \rightarrow 0{,}5\text{ kg}$; $> 0{,}5\text{ kg} \rightarrow$ sesuai total berat pakai. Ongkir didistribusikan secara proporsional ke paket-paket milik customer pada batch tersebut, lalu dicek terhadap `settings_shipping_minimum`. |
| **Jastip Hemat+** | Tarif default `Rp 10.000 / kg`. Untuk paket tunggal berbobot $< 1\text{ kg}$ dibulatkan menjadi `1 kg`. Jika customer mengirim lebih dari 1 paket dalam batch yang sama, berat digabung apa adanya lalu dikalikan tarif, kemudian dicek terhadap `settings_shipping_minimum`. |
| **Jastip Pelni** | Tarif berjenjang (*tiering*) berdasarkan total berat gabungan customer pada batch & rute yang sama:<br>- **Jakarta $\rightarrow$ Manokwari**: $\le 10{,}1\text{ kg} = \text{Rp } 20.000$; $\le 20{,}1\text{ kg} = \text{Rp } 19.000$; $\le 40{,}1\text{ kg} = \text{Rp } 18.000$; $\le 80{,}1\text{ kg} = \text{Rp } 17.000$; $> 80{,}1\text{ kg} = \text{Rp } 16.000$/kg.<br>- **Surabaya $\rightarrow$ Manokwari**: $\le 10\text{ kg} = \text{Rp } 18.000$; $\le 20\text{ kg} = \text{Rp } 17.000$; $\le 40\text{ kg} = \text{Rp } 16.000$; $> 40\text{ kg} = \text{Rp } 15.500$/kg.<br>Setelah ongkir per paket dihitung, sistem mengecek minimum ongkir dari `settings_shipping_minimum` (default floor `Rp 20.000` jika enabled/fallback aktif). |
| **Jastip Kargo** | Dihitung dari kubikasi $\text{M}^3$ ($\frac{P \times L \times T}{1.000.000}$) atau berat aktual dikalikan tarif kargo per $\text{M}^3$/kg. Secara default konfigurasi `settings_shipping_minimum` untuk Kargo bernilai `enabled: false, minimumAmount: 0` (tidak ada minimum ongkir bawaan). Pada `recalculate-batch` & `recalculate-kargo`, minimum hanya diterapkan apabila Owner secara eksplisit mengaktifkan minimum Kargo di `/owner/tarif`. |

### 5.3 Sistem Ongkir Minimum (`settings_shipping_minimum`) & Hitung Ulang
- Tabel `settings_shipping_minimum` menyimpan konfigurasi per kombinasi `(serviceId, originCity)` dengan kolom `enabled` (boolean) dan `minimumAmount` (numeric).
- **Redistribusi Customer-Level Minimum (`lib/shipping-minimum.ts` & `routes/packages.ts`)**:
  - Jika total ongkir seluruh paket milik satu customer (pada layanan & batch yang sama) lebih kecil dari `minimumAmount`, maka kekurangan menuju `minimumAmount` didistribusikan secara proporsional ke tiap paket berdasarkan bobot `usedWeight` (atau merata bila seluruh berat bernilai 0).
- **Hitung Ulang Batch**:
  - `POST /api/packages/recalculate-batch` menghitung ulang ongkir seluruh paket pada satu `batchId` tertentu sesuai aturan layanan, tiering, dan `settings_shipping_minimum` yang aktif di database.
  - `POST /api/packages/recalculate-kargo` menghitung ulang khusus paket layanan `kargo`.

> **Catatan Kondisi Aktual (Sinkronisasi Pengaturan Tarif vs Kalkulasi Paket):**  
> Halaman `/owner/tarif` menyimpan nilai baru `pesawatRate`, `hematRate`, `kargoRate`, `pelniTiersJakarta`, dan `pelniTiersSurabaya` ke tabel `settings` serta mencatat log ke `tarif_history`. Namun pada source code `artifacts/api-server/src/routes/packages.ts` saat ini, kalkulasi harga dasar per kg pada endpoint input/edit/import/recalculate **masih membaca konstanta tarif default kode** (`77000` untuk Pesawat, `10000` untuk Hemat+, dan tabel tier Pelni di kode), sedangkan konfigurasi **ongkir minimum (`settings_shipping_minimum`) sudah dibaca langsung secara dinamis dari database** oleh `getShippingMinimum()`.

---

## 6. Daftar Lengkap Endpoint Backend API (`/api/*`)

Seluruh endpoint berada di bawah prefix `/api` pada `/artifacts/api-server/src/routes/`.

| Modul | Method & Endpoint | Autentikasi / Role / Guard | Deskripsi Singkat |
|---|---|---|---|
| **Health** | `GET /api/healthz`, `GET /api/health` | Publik | Cek status server (`status: "ok"`) |
| **Auth** | `POST /api/auth/login` | Publik | Login HP & password, terbitkan Bearer token |
| | `POST /api/auth/register` | Publik | Buat akun `admin` baru (API) |
| | `GET /api/auth/me` | `requireAuth` | Ambil profil user yang sedang login |
| | `PATCH /api/auth/profile` | `requireAuth` | Ubah nama dan/atau kata sandi sendiri |
| | `POST /api/auth/logout` | `requireAuth` | Hapus sesi token aktif |
| **Batches** | `GET /api/batches` | `requireAuth` | Daftar semua batch pengiriman |
| | `POST /api/batches` | `requireAuth` | Buat batch kapal baru |
| | `GET /api/batches/:id` | `requireAuth` | Detail batch & statistik paket |
| | `PATCH /api/batches/:id` | `requireAuth` (`HAPUS`: `owner`) | Ubah metadata/status batch (`ARSIP` locked; `HAPUS` hapus permanen) |
| | `GET /api/batches/service-types/list` | `requireAuth` | Daftar master `service_types` |
| **Packages** | `GET /api/packages` | `requireAuth` | Daftar paket (filter query status, batch, search, admin) |
| | `POST /api/packages` | `requireAuth` | Input paket baru + kalkulasi berat/ongkir/minimum |
| | `POST /api/packages/import` | `requireAuth` | Import massal paket dari hasil parsing Excel |
| | `GET /api/packages/scan/:barcode` | `requireAuth` | Cari paket/grup via barcode (`JAJ-...` / `JAJ-GRUP-...`), resi, no paket, atau ID |
| | `GET /api/packages/:id` | `requireAuth` | Rincian satu paket |
| | `PATCH /api/packages/:id` | `requireAuth` | Edit data paket (terkunci bila `SUDAH_DIAMBIL`, kecuali `customerName`) |
| | `DELETE /api/packages/:id` | `requireAuth`, `owner` | Hapus paket permanen |
| | `GET /api/packages/:id/barcode` | `requireAuth` | Informasi payload barcode paket |
| | `POST /api/packages/:id/verify` | `requireAuth` | Verifikasi fisik satu paket |
| | `POST /api/packages/verify-all` | `requireAuth` | Verifikasi massal (`packageIds[]` atau `batchId` + opsional `serviceType`) |
| | `POST /api/packages/:id/serahkan` | `requireAuth` | Tandai penyerahan paket (legacy/direct pickup) |
| | `POST /api/packages/:id/customer-pickup` | `requireAuth` | Tandai pengambilan oleh customer |
| | `POST /api/packages/:id/tolak` | `requireAuth` | Tandai penolakan / batalkan serah paket |
| | `POST /api/packages/recalculate-batch` | `requireAuth` | Hitung ulang ongkir semua paket pada 1 batch |
| | `POST /api/packages/recalculate-kargo` | `requireAuth` | Hitung ulang ongkir paket layanan Kargo |
| **Transactions** | `GET /api/transactions` | `requireAuth` | Daftar transaksi kasir |
| | `POST /api/transactions` | `requireAuth`, `requireActiveShift` | Proses pembayaran kasir & penyerahan paket (idempotent + row lock) |
| | `POST /api/transactions/:id/pay` | `requireAuth`, `requireActiveShift` | Bayar cicilan / pelunasan piutang bertahap |
| | `POST /api/transactions/:id/void` | `requireAuth` | Ajukan permohonan VOID transaksi (`MENUNGGU_APPROVAL`) |
| **Receipts** | `GET /api/transactions/:id/receipt` | `requireAuth` | Ambil data payload struk transaksi |
| | `POST /api/transactions/:id/receipt/print` | `requireAuth` | Catat audit cetak struk ke `print_logs` |
| **Voids** | `GET /api/voids` | `requireAuth`, `owner` | Daftar pengajuan & riwayat VOID |
| | `POST /api/voids/:id/approve` | `requireAuth`, `owner` | Setujui VOID, reversal saldo, & kembalikan status paket |
| **Shifts** | `GET /api/shifts/current` | `requireAuth` | Ambil shift aktif user (atau `null`) |
| | `GET /api/shifts/active` | `requireAuth` | Daftar shift berstatus `AKTIF` |
| | `GET /api/shifts/history` | `requireAuth` | Riwayat shift & hasil closing |
| | `GET /api/shifts/handovers/pending` | `requireAuth` | Daftar serah terima shift yang menunggu konfirmasi |
| | `GET /api/shifts/:id/summary` | `requireAuth` | Rincian ringkasan transaksi & kas shift tertentu |
| | `POST /api/shifts/open` | `requireAuth` | Buka shift baru (`PAGI`/`MALAM` + modal awal) |
| | `POST /api/shifts/:id/close` | `requireAuth` | Penutupan shift 2 tahap (*blind closing* + toleransi selisih kas) |
| | `POST /api/shifts/:id/handover` | `requireAuth` | Buat/konfirmasi serah terima shift (`giver`/`receiver`) |
| **Invoices** | `GET /api/invoices` | `requireAuth`, `admin`/`owner` | Daftar seluruh invoice terbit |
| | `GET /api/invoices/package-map` | `requireAuth`, `admin`/`owner` | Pemetaan paket ke nomor invoice aktif (kecuali `BATAL`) |
| | `GET /api/invoices/:id` | `requireAuth`, `admin`/`owner` | Detail invoice + daftar `invoice_items` |
| | `POST /api/invoices` | `requireAuth`, `admin`/`owner` | Terbitkan Invoice A4 manual dari checklist paket |
| | `POST /api/invoices/from-transaction/:transactionId` | `requireAuth`, `admin`/`owner` | Terbitkan Invoice A4 dari transaksi kasir aktif |
| | `POST /api/invoices/:id/print` | `requireAuth`, `admin`/`owner` | Catat log cetak A4 (`print_logs`) & info salinan/reprint |
| **Payments** | `GET /api/payments` | `requireAuth` | Riwayat mutasi pembayaran |
| | `POST /api/payments` | `requireAuth` | Catat entri pembayaran |
| | `PATCH /api/payments/:id` | `requireAuth` | Update entri pembayaran |
| **Pengeluaran** | `GET /api/pengeluaran` | `requireAuth` | Daftar catatan pengeluaran operasional |
| | `POST /api/pengeluaran` | `requireAuth` | Tambah pengeluaran baru |
| | `PATCH /api/pengeluaran/:id` | `requireAuth` | Ubah pengeluaran |
| | `DELETE /api/pengeluaran/:id` | `requireAuth` | Hapus pengeluaran |
| **Settings & Tarif** | `GET /api/settings` | `requireAuth` | Ambil seluruh pengaturan & konfigurasi tarif |
| | `PATCH /api/settings` | `requireAuth`, `owner` | Ubah key pengaturan (`kargoRate`, `pesawatRate`, `hematRate`, `pelniTiersJakarta`, `pelniTiersSurabaya`, `cash_variance_tolerance`, `receipt_print_mode`, `qris_image_url`) + log ke `tarif_history` |
| | `GET /api/settings/qris` | `requireAuth` | Ambil URL gambar QRIS aktif |
| | `POST /api/settings/qris-image` | `requireAuth`, `owner` | Unggah gambar QRIS base64 (maks 2MB) ke `/uploads/qris/` |
| | `GET /api/settings/shipping-minimums` | `requireAuth` | Daftar konfigurasi ongkir minimum per layanan & rute |
| | `PATCH /api/settings/shipping-minimums` | `requireAuth`, `owner` | Simpan perubahan aktif/nominal minimum + log ke `tarif_history` |
| | `GET /api/settings/history`, `/tarif-history` | `requireAuth`, `owner` | Audit riwayat perubahan tarif & pengaturan |
| **Admins & Users** | `GET /api/admins` | `requireAuth`, `owner` | Daftar staf admin |
| | `POST /api/admins` | `requireAuth`, `owner` | Tambah akun admin baru |
| | `PATCH /api/admins/:id` | `requireAuth`, `owner` | Ubah nama/HP admin |
| | `POST /api/admins/:id/toggle-active` | `requireAuth`, `owner` | Aktifkan / nonaktifkan akun admin |
| | `POST /api/admins/:id/reset-password` | `requireAuth`, `owner` | Reset kata sandi admin |
| | `DELETE /api/admins/:id` | `requireAuth`, `owner` | Soft delete (jika berisikan histori) atau hard delete admin |
| **Customers** | `GET /api/customers` | `requireAuth` | Daftar ringkasan customer |
| | `GET /api/customers/:id` | `requireAuth` | Detail customer & daftar paketnya |
| **Dashboard & Reports** | `GET /api/dashboard/summary` | `requireAuth` | Ringkasan metrik dashboard |
| | `GET /api/dashboard/chart` | `requireAuth` | Data grafik tren (`period=week|month|year`) |
| | `GET /api/reports` | `requireAuth`, `owner` | Laporan keuangan (`type=daily|monthly|yearly`) |

---

## 7. Skema Database Lengkap (18 Tabel Drizzle ORM)

Seluruh skema berada di `/lib/db/src/schema/` dan diekspor melalui `/lib/db/src/schema/index.ts`.

| No | Nama Tabel | File Skema | Kolom, Enum, Relasi & Index Aktual |
|:-:|:---|:---|:---|
| 1 | **`users`** | `users.ts` | `id`, `name`, `phone` (unique), `password` (SHA-256), `role` (`admin` \| `owner`), `isActive` (bool), `isHidden` (bool), `deletedAt`, `createdAt`, `updatedAt`. |
| 2 | **`sessions`** | `sessions.ts` | `id`, `userId` (FK `users`), `token` (unique), `createdAt`, `expiresAt`. |
| 3 | **`batches`** | `batches.ts` | `id`, `namaKapal`, `etd`, `periodeClosingMulai`, `periodeClosingSelesai`, `kotaAsal`, `tujuan` (default `"Manokwari"`), `statusBatch` (`OPEN` \| `CLOSED` \| `ARSIP`), `createdBy` (FK `users`), `createdAt`, `updatedAt`. |
| 4 | **`packages`** | `packages.ts` | `id`, `barcode` (unique), `resiNumber`, `packageNumber`, `itemName`, `packageMode`, `realWeight`, `length`, `width`, `height`, `volumeWeight`, `packagingType`, `serviceType`, `deliveryRoute`, `usedWeight`, `shippingRate`, `totalWeight`, `price`, `totalShipping`, `additionalFee` (default `0`), `weight` (legacy), `notes`, `status` (`pending` \| `diserahkan`), `verified` (`belum_diverifikasi` \| `sudah_diverifikasi`), `verifiedAt`, `statusVerifikasi` (`BELUM_DIVERIFIKASI` \| `SUDAH_DIVERIFIKASI`), `statusPengambilan` (`BELUM_DIAMBIL` \| `SUDAH_DIAMBIL`), `statusPembayaran` (`BELUM_DIBAYAR` \| `DP` \| `SUDAH_DIBAYAR`), `batchId` (FK `batches`), `serviceTypeId` (FK `service_types`), `customerName`, `customerId` (FK `users`), `adminId` (FK `users`), `packageDate`, `pickedUpAt`, `createdAt`, `updatedAt`. **Index:** `idx_packages_status`, `idx_packages_status_pengambilan`, `idx_packages_batch_id`, `idx_packages_batch_status`, `idx_packages_created_at`, `idx_packages_customer_name`, `idx_packages_service_type`. *(Catatan: kolom `additional_fee_reason` belum ada pada tabel ini).* |
| 5 | **`transactions`** | `transactions.ts` | `id`, `transactionNo` (unique), `idempotencyKey` (unique), `customerId` (FK `users`), `customerName`, `packageIds` (`jsonb number[]`), `subtotal`, `additionalFee`, `additionalFeeReason`, `discount`, `discountReason`, `total`, `paymentStatus` (`BELUM_BAYAR` \| `BAYAR_SEBAGIAN` \| `LUNAS`), `transactionStatus` (`AKTIF` \| `VOID`), `sisaPiutang`, `jenisJastip`, `jatuhTempo`, `penanggungJawab`, `shiftSessionId` (FK `shift_sessions`), `cashierId` (FK `users`), `createdAt`. **Index:** `transactions_created_at_idx`, `transactions_payment_status_idx`. |
| 6 | **`payments`** | `payments.ts` | `id`, `paymentType` (`tunai` \| `transfer` \| `qris` \| `piutang` \| `TRANSAKSI_BARU` \| `PELUNASAN_PIUTANG` \| `CICILAN` \| `VOID_REVERSAL`), `paymentMethod` (`tunai` \| `transfer` \| `qris`), `totalAmount`, `paidAmount`, `changeAmount`, `paymentReference`, `packageIds` (`jsonb`), `packageSummary` (`jsonb`), `adminId` (FK `users`), `adminName`, `shiftSessionId` (FK `shift_sessions`), `transactionId` (FK `transactions`), `notes`, `createdAt`. **Index:** `payments_transaction_created_at_idx`, `payments_shift_created_at_idx`. |
| 7 | **`invoices`** | `invoices.ts` | `id`, `invoiceNo` (unique), `transactionId` (FK `transactions`), `customerSnapshot` (`jsonb`), `issuedAt`, `dueAt`, `subtotal`, `discount`, `downPayment`, `total`, `balance`, `status` (`DRAFT` \| `BELUM_LUNAS` \| `DIBAYAR_SEBAGIAN` \| `LUNAS` \| `BATAL`), `manualReason`. |
| 8 | **`invoice_items`** | `invoice-items.ts` | `id`, `invoiceId` (FK `invoices`), `packageId` (FK `packages`), `description`, `qty`, `weight`, `volume`, `unitPrice`, `lineTotal`. |
| 9 | **`print_logs`** | `print-logs.ts` | `id`, `entityType`, `entityId`, `printType`, `printedBy` (FK `users`), `printedAt`, `copyNumber`, `isReprint` (bool). |
| 10 | **`shift_sessions`** | `shift-sessions.ts` | `id`, `adminId` (FK `users`), `shiftType` (`PAGI` \| `MALAM`), `terminalId`, `scheduledStart`, `scheduledEnd`, `actualStart`, `actualEnd`, `openingBalance`, `status` (`AKTIF` \| `CLOSED`), `createdAt`. |
| 11 | **`shift_closings`** | `shift-closings.ts` | `id`, `shiftSessionId` (FK `shift_sessions`), `systemCash` (int), `actualCash` (int), `selisih` (int), `alasanSelisih`, `approvedBy` (FK `users`), `closedAt`, `createdAt`. |
| 12 | **`shift_handovers`** | `shift-handovers.ts` | `id`, `fromShiftSessionId` (FK `shift_sessions`), `toShiftSessionId` (FK `shift_sessions`), `handoverAmount` (int), `confirmedByGiver` (bool), `confirmedByReceiver` (bool), `manualOverride` (bool), `manualReason`, `createdAt`. |
| 13 | **`voids`** | `voids.ts` | `id`, `transactionId` (FK `transactions`), `reasonCode`, `notes`, `requestedBy` (FK `users`), `approvedBy` (FK `users`), `approvedAt`, `reversalAmount`, `packageIdsReturned` (`jsonb number[]`), `statusBefore`, `statusAfter` (bernilai `"MENUNGGU_APPROVAL"` lalu `"VOID"`), `isPostClosing` (bool), `createdAt`. |
| 14 | **`pengeluaran`** | `pengeluaran.ts` | `id`, `tanggal` (date), `kategori`, `nominal`, `metodePembayaran` (`cash` \| `transfer` \| `lainnya`), `dicatatOleh` (FK `users`), `namaPencatat`, `catatan`, `createdAt`, `updatedAt`. |
| 15 | **`service_types`** | `service-types.ts` | `id`, `name` (unique, mis. `"jastip hemat+"`), `label` (mis. `"Jastip Hemat+"`). |
| 16 | **`settings`** | `settings.ts` | `key` (PK), `value` (text/JSON), `updatedAt`. |
| 17 | **`settings_shipping_minimum`** | `settings-shipping-minimum.ts` | `id`, `serviceId` (FK `service_types`), `originCity`, `enabled` (bool), `minimumAmount` (numeric), `updatedBy` (FK `users`), `updatedAt`. **Unique Index:** `settings_shipping_minimum_service_origin_idx (serviceId, originCity)`. |
| 18 | **`tarif_history`** | `tarif-history.ts` | `id`, `jenisJastip`, `tarifLama`, `tarifBaru`, `alasan`, `diubahOleh` (FK `users`), `namaUbah`, `createdAt`. |

---

## 8. Skrip Proyek, Utilitas & Panduan Menjalankan

### 8.1 Perintah Utama (`package.json`)

```bash
# 1. Jalankan server terpadu mode development (Express API + Vite di Port 3000)
npm run dev

# 2. Build bundle produksi frontend (artifacts/jastip/dist/public)
npm run build

# 3. Jalankan server mode production (Express API + static dist di Port 3000)
npm start

# 4. Pengecekan TypeScript seluruh workspace (lint & typecheck)
npm run lint
npm run typecheck

# 5. Sinkronisasi skema Drizzle ke PostgreSQL
npm run db:push

# 6. Seed data pengguna & data awal demo
npm run db:seed
```

### 8.2 Daftar Skrip Utilitas & Pengujian yang Tersedia (`/scripts/src/`)
Direktori `/scripts/src/` berisi skrip TypeScript/ESM untuk inisialisasi, migrasi, audit, dan pengujian API/alur kerja (dijalankan manual sesuai kebutuhan dengan `npx --prefix scripts tsx scripts/src/<nama-skrip>`):
- **Bootstrap & Migrasi**: `seed-demo.ts`, `seed-batches.ts`, `seed-batch2.ts`, `migrate-finance-foundation.ts`, `migrate-shipping-minimum.ts`
- **Audit & Debug**: `check-db-info.ts`, `audit-deep-dive.ts`, `test-auth-debug.ts`, `test-login.ts`, `test-cond.ts`, `test-and-cond.ts`, `hello.ts` + SQL `/scripts/sql/export-closing-audit.sql`
- **Pengujian Fitur & Regresi**: `verify-all-system-features.ts`, `verify-full-regression-e2e.ts`, `verify-fase2-closing.ts`, `verify-fase8-uat.ts`, `verify-qris-runtime.ts`, `test-kargo-calc.ts`, `test-additional-fee-detail.ts`, `test-invoices-flow.ts`, `test-shipping-minimum.mjs`, `test-bulk.ts`
