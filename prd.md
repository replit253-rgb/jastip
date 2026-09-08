# PRD — Jastip Anggun Jaya

> **Status dokumen:** As-is / reverse-engineered dari source code proyek saat ini  
> **Tanggal pemetaan:** 2026-09-08  
> **Tujuan dokumen:** mendeskripsikan halaman, navigasi, role, fitur, alur bisnis, API, database, aturan perhitungan, keamanan, dan batasan yang benar-benar tersedia pada aplikasi saat ini. Dokumen ini bukan daftar fitur baru dan bukan target redesign.

---

## 1. Ringkasan Produk

Jastip Anggun Jaya adalah aplikasi operasional ekspedisi/jasa titip untuk mengelola paket dari kota asal (terutama Jakarta dan Surabaya) menuju Manokwari, Papua Barat.

Sistem mencakup:

- autentikasi pengguna berbasis nomor HP dan password;
- pencatatan paket satuan, paket grup, dan import Excel;
- pengelompokan paket berdasarkan customer, layanan, dan batch pengiriman;
- perhitungan berat volume, berat pakai, dan ongkir;
- pembuatan QR/barcode unik untuk setiap paket;
- pencetakan label;
- scan paket melalui kamera, gambar, atau input manual;
- proses verifikasi paket yang datang;
- penyerahan paket dan pencatatan pembayaran;
- riwayat pembayaran/piutang;
- monitoring paket dan dashboard operasional;
- batch pengiriman dengan periode closing dan status penguncian;
- laporan operasional;
- keuangan dan pengeluaran harian;
- konfigurasi tarif oleh Owner;
- manajemen akun Admin.

### 1.1 Stack dan struktur

| Bagian | Implementasi |
|---|---|
| Frontend | React + Vite + TypeScript di `artifacts/jastip` |
| Routing frontend | Wouter |
| Data fetching | TanStack React Query |
| UI | Tailwind CSS, Radix UI/shadcn-style components, Lucide icons |
| Backend | Node.js + Express + TypeScript di `artifacts/api-server` |
| Database | PostgreSQL dengan Drizzle ORM di `lib/db` |
| API client | Generated client dari OpenAPI di `lib/api-client-react` |
| Spreadsheet | `xlsx` untuk import/export Excel |
| QR/barcode | `qrcode`, `html5-qrcode`, `jsbarcode` |
| PDF/print | jsPDF/autotable serta HTML print window |
| Port frontend | 5000 |
| Port API | 8080 |
| Prefix API | `/api` |

---

## 2. Role dan Hak Akses

### 2.1 Role yang tersedia pada model data

Kolom `users.role` mendukung:

- `owner`
- `admin`
- `customer`

### 2.2 Role aktif di website

#### Owner

Owner adalah pemilik/administrator penuh. Owner dapat:

- melihat dashboard agregat seluruh operasional;
- melihat dan memonitor seluruh paket;
- menggunakan seluruh Admin Tools;
- mengelola akun Admin;
- mengelola tarif;
- melihat keuangan dan laporan;
- mencatat serta mengelola pengeluaran;
- mengubah profil sendiri;
- melakukan operasi paket, batch, barcode, scan, verifikasi, dan pembayaran.

#### Admin

Admin adalah operator harian. Admin dapat:

- melihat dashboard operasional;
- membuat, melihat, mengubah, dan menghapus paket;
- memilih dan mengelola batch;
- import Excel;
- mencetak label;
- scan barcode;
- menyerahkan atau menolak paket di keranjang scan;
- mencatat pembayaran;
- memverifikasi paket;
- melihat riwayat pembayaran;
- mengubah profil sendiri.

#### Customer — legacy/tidak aktif pada routing saat ini

Role `customer` masih:

- ada pada enum database;
- dibuat oleh endpoint `POST /api/auth/register`;
- diarahkan oleh login/register ke `/customer/dashboard`;
- memiliki halaman lama di `src/pages/customer`.

Namun halaman customer tidak didaftarkan di `App.tsx`, sehingga route customer tidak aktif dan akan jatuh ke halaman 404. Menu customer juga tidak dirender oleh `AppLayout`. Tidak ada route `/register` aktif pada router frontend saat ini.

### 2.3 Proteksi route

`ProtectedRoute`:

1. mengarahkan pengguna tanpa sesi ke `/login`;
2. mengarahkan pengguna dengan role salah ke dashboard rolenya sendiri;
3. menampilkan loading screen saat status sesi masih diperiksa;
4. membungkus halaman aktif dengan `AppLayout`.

---

## 3. Autentikasi, Sesi, dan Profil

### 3.1 Login

URL: `/login`

Input:

- Nomor HP;
- password.

Perilaku:

- login menggunakan `POST /api/auth/login`;
- token disimpan di `localStorage` dengan key `jaj_token`;
- pengguna diarahkan sesuai role:
  - Admin → `/admin/dashboard`;
  - Owner → `/owner/dashboard`;
  - Customer → `/customer/dashboard` (route saat ini tidak aktif).

Password di-hash dengan:

```text
SHA-256(password + "jaj_salt_2024")
```

Sesi:

- token dibuat dari random bytes 32 byte dan disimpan sebagai hexadecimal;
- masa berlaku sesi 7 hari;
- request API memakai header `Authorization: Bearer <token>`;
- sesi hanya valid jika belum expired dan user masih aktif.

### 3.2 Akun demo

| Role | Nomor HP | Password |
|---|---|---|
| Owner | `081200000000` | `owner123` |
| Admin | `081200000001` | `admin123` |

### 3.3 Profil

Route:

- `/admin/profile`
- `/owner/profile`

Fitur:

- mengubah nama;
- mengubah password;
- perubahan password memerlukan password lama;
- nomor HP tidak diubah dari halaman profil.

### 3.4 Logout

Tombol **Keluar** tersedia di footer sidebar. Logout:

- memanggil `POST /api/auth/logout`;
- menghapus sesi server untuk token aktif;
- menghapus `jaj_token` dari localStorage;
- mengarahkan ke `/login`.

---

## 4. Layout dan Menu Navigasi

Semua halaman terproteksi memakai layout dengan:

- sidebar responsif;
- logo dan identitas JASTIP ANGUN JAYA;
- nama dan role pengguna;
- tanggal hari ini dalam locale Indonesia;
- tombol buka/tutup sidebar di mobile;
- tombol Keluar;
- area konten dengan lebar maksimum.

### 4.1 Menu Admin

| Label | URL | Keterangan |
|---|---|---|
| Dashboard | `/admin/dashboard` | Ringkasan operasional |
| Semua Paket | `/admin/packages` | Daftar semua paket Admin |
| Batch Pengiriman | `/admin/batches` | Daftar dan pengaturan batch |
| Input Paket | `/admin/packages/type` | Memilih mode input |
| Import Excel | `/admin/packages/import` | Import massal |
| Label Barcode | `/admin/barcode` | Cari dan cetak barcode |
| Arsip Sudah Diambil | `/admin/arsip` | Paket yang sudah diambil/diarsipkan |
| Scan Barcode dan Pembayaran | `/admin/scan` | Scan, keranjang serah, pembayaran |
| Verifikasi Paket | `/admin/verify` | Pencocokan paket fisik |
| Riwayat Pembayaran | `/admin/riwayat-pembayaran` | Riwayat transaksi dan piutang |
| Profil | `/admin/profile` | Profil Admin |

### 4.2 Menu Owner

#### Section Owner

| Label | URL |
|---|---|
| Dashboard | `/owner/dashboard` |
| Monitor Paket | `/owner/packages` |
| Data Admin | `/owner/admins` |
| Keuangan | `/owner/finance` |
| Pengeluaran Harian | `/owner/pengeluaran` |
| Laporan | `/owner/reports` |
| Pengaturan Tarif | `/owner/tarif` |
| Manajemen User | `/owner/users` |
| Profil | `/owner/profile` |

#### Section Admin Tools

| Label | URL |
|---|---|
| Batch Pengiriman | `/owner/batches` |
| Input Paket | `/owner/packages/type` |
| Import Excel | `/owner/packages/import` |
| Label Barcode | `/owner/barcode` |
| Arsip Sudah Diambil | `/owner/arsip` |
| Scan Barcode dan Pembayaran | `/owner/scan` |
| Verifikasi Paket | `/owner/verify` |

---

## 5. Daftar Halaman dan Route

### 5.1 Route publik dan sistem

| URL | Komponen | Status |
|---|---|---|
| `/` | RedirectToDashboard | Mengarah ke dashboard sesuai sesi atau login |
| `/login` | Login | Aktif |
| route tidak dikenal | NotFound | Aktif |

### 5.2 Route Admin

| URL | Halaman | Fitur utama |
|---|---|---|
| `/admin/dashboard` | Dashboard Admin | KPI paket, grafik tren, 10 paket terbaru |
| `/admin/packages` | Semua Paket | Daftar paket yang diinput Admin |
| `/admin/packages/type` | Pilih Jenis Input | Pilihan satu paket, grup, atau import |
| `/admin/packages/new` | Input Paket | Input satuan dan grup |
| `/admin/packages/import` | Import Excel | Template, upload, preview, validasi, import |
| `/admin/packages/:id` | Detail Paket | Detail dan edit paket |
| `/admin/batches` | Batch Pengiriman | Daftar batch, buat/edit/tutup/arsip/hapus |
| `/admin/barcode` | Label Barcode | Tab paket satuan dan grup, cari, filter, cetak |
| `/admin/barcode/batch/:id` | Detail Barcode Batch | Paket per batch, cetak individual/grup |
| `/admin/barcode-group` | Detail Grup Barcode | Detail grup berdasarkan customer/layanan/batch |
| `/admin/scan` | Scan dan Pembayaran | Scan barcode, keranjang serah, bayar |
| `/admin/verify` | Verifikasi Paket | Pilih customer/batch, scan, export hasil |
| `/admin/verify/batch/:id` | Verifikasi Batch | Verifikasi paket dalam batch tertentu |
| `/admin/riwayat-pembayaran` | Riwayat Pembayaran | Ringkasan pembayaran yang dikelompokkan batch |
| `/admin/riwayat-pembayaran/batch/:id` | Pembayaran Batch | Detail transaksi pada batch |
| `/admin/riwayat-pembayaran/batch/:id/detail` | Detail Pembayaran | Detail paket/transaksi pada batch |
| `/admin/arsip` | Arsip | Paket yang sudah diambil, filter/export |
| `/admin/arsip/batch/:id` | Arsip Batch | Detail dan cetak arsip per batch |
| `/admin/settings` | Settings lama | Route terdaftar, menggunakan komponen OwnerSettings, tidak ada di menu Admin |
| `/admin/profile` | Profil | Ganti nama/password |

### 5.3 Route Owner

| URL | Halaman | Fitur utama |
|---|---|---|
| `/owner/dashboard` | Dashboard Owner | KPI seluruh data, grafik, total ongkir |
| `/owner/packages` | Monitor Paket | Monitoring semua paket, filter, scan manual, export |
| `/owner/admins` | Data Admin | Daftar Admin dan jumlah paket yang diinput |
| `/owner/finance` | Keuangan | KPI, breakdown layanan/metode, transaksi, export |
| `/owner/finance/:service` | Detail Keuangan Layanan | Detail per layanan dengan filter |
| `/owner/reports` | Laporan | Harian, bulanan, tahunan, export/cetak |
| `/owner/users` | Manajemen User | Tambah Admin, aktif/nonaktif, reset password |
| `/owner/settings` | Pengaturan lama | Route terdaftar, menggunakan OwnerSettings, tidak ada di menu |
| `/owner/pengeluaran` | Pengeluaran Harian | CRUD pengeluaran, filter, export |
| `/owner/tarif` | Pengaturan Tarif | Tarif dasar, tier Pelni, alasan perubahan, riwayat |
| `/owner/profile` | Profil | Ganti nama/password |
| `/owner/batches` | Admin Tools Batch | Sama dengan halaman batch Admin |
| `/owner/packages/type` | Admin Tools Input | Sama dengan pemilih input Admin |
| `/owner/packages/new` | Admin Tools Input | Sama dengan input Admin |
| `/owner/packages/import` | Admin Tools Import | Sama dengan import Admin |
| `/owner/packages/:id` | Admin Tools Detail | Sama dengan detail Admin |
| `/owner/barcode` | Admin Tools Barcode | Sama dengan barcode Admin |
| `/owner/barcode/batch/:id` | Admin Tools Barcode Batch | Sama dengan detail barcode Admin |
| `/owner/barcode-group` | Admin Tools Barcode Grup | Sama dengan detail grup Admin |
| `/owner/scan` | Admin Tools Scan | Sama dengan scan Admin |
| `/owner/verify` | Admin Tools Verifikasi | Sama dengan verifikasi Admin |
| `/owner/verify/batch/:id` | Admin Tools Verifikasi Batch | Sama dengan verifikasi batch Admin |
| `/owner/arsip` | Admin Tools Arsip | Sama dengan arsip Admin |
| `/owner/arsip/batch/:id` | Admin Tools Arsip Batch | Sama dengan detail arsip Admin |

### 5.4 Halaman yang ada di source tetapi tidak terhubung

File berikut ada di source, tetapi tidak memiliki route aktif di `App.tsx`:

- `pages/customer/dashboard.tsx`;
- `pages/customer/history.tsx`;
- `pages/customer/packages.tsx`;
- `pages/customer/scan.tsx`;
- `pages/owner/customers.tsx`;
- `pages/register.tsx`.

---

## 6. Fitur Paket

### 6.1 Input paket satuan

Route UI: `/admin/packages/new` atau `/owner/packages/new`.

Field yang digunakan:

- tanggal paket;
- nama customer;
- customer ID legacy opsional;
- nama barang;
- nomor resi — wajib pada validasi form;
- nomor paket;
- jenis packaging;
- jenis layanan;
- mode paket (`single` atau `grup`);
- rute pengiriman;
- berat real;
- panjang, lebar, tinggi;
- berat volume;
- berat pakai;
- tarif pengiriman;
- total berat;
- total ongkir.

Aturan form:

- layanan non-kargo memerlukan berat real lebih besar dari 0;
- kargo memerlukan tarif ongkir per M³/Ton lebih besar dari 0;
- batch pengiriman wajib dipilih;
- daftar batch yang tersedia untuk input hanya batch `OPEN`;
- batch terakhir disimpan di localStorage dengan key `jaj_last_batch_id`;
- jika batch terakhir sudah tidak tersedia, sistem memilih batch `OPEN` pertama;
- setelah berhasil disimpan, barcode dibuat server dan form tetap berada di halaman input dengan notifikasi sukses serta akses cetak barcode.

### 6.2 Input grup

Mode grup dipakai ketika beberapa paket mempunyai customer dan layanan yang sama dalam batch yang sama.

Perilaku:

- customer, layanan, rute, tanggal, dan batch dipilih sekali;
- operator menambahkan item paket satu per satu;
- semua item disimpan sekaligus;
- nama customer dapat dipatch ke item yang baru dibuat pada alur pengelompokan;
- ongkir layanan tertentu dihitung ulang berdasarkan total paket customer dalam batch;
- grup dapat dicetak sebagai satu label grup.

Aturan pengelompokan kritis:

```text
customerName + serviceType + batchId
```

Nama customer saja tidak cukup untuk membentuk grup.

### 6.3 Import Excel/CSV

Route UI: `/admin/packages/import` atau `/owner/packages/import`.

Tahapan:

1. pilih jenis layanan;
2. pilih rute;
3. pilih tanggal;
4. pilih batch `OPEN` atau buat batch baru;
5. unduh template standard atau kargo;
6. upload file `.xlsx`/`.csv`;
7. preview baris;
8. validasi baris;
9. konfirmasi import;
10. tampilkan jumlah berhasil, gagal, total, error, dan ID paket yang dibuat.

Template standard:

| Kolom | Wajib |
|---|---|
| Nama Konsumen | Ya |
| No Resi | Ya |
| No Paket | Tidak |
| Berat Real (Kg) | Ya |
| Panjang (cm) | Tidak |
| Lebar (cm) | Tidak |
| Tinggi (cm) | Tidak |
| Jenis Paking | Tidak |

Template kargo:

| Kolom | Wajib |
|---|---|
| Nama Konsumen | Ya |
| Toko/Kurir | Tidak |
| Total Koli | Tidak |
| Koli | Tidak |
| Jenis Barang | Tidak |
| Ukuran Barang | Tidak |
| Panjang (cm) | Tidak |
| Lebar (cm) | Tidak |
| Tinggi (cm) | Tidak |
| Pakai (m3) | Tidak |
| Harga Kubikasi | Tidak |
| Berat Real (Ton) | Tidak |
| Ongkir Paket | Ya |

Aturan import:

- baris tanpa `resiNumber` atau `customerName` gagal;
- baris duplikat `resiNumber` dalam batch yang sama dilewati;
- duplikat dikecualikan untuk mode kargo `single`, karena nilai Toko/Kurir tidak dianggap nomor resi unik;
- baris valid tetap diimport walaupun ada baris lain yang gagal;
- ongkir dan berat volume dihitung saat parsing/server;
- setelah seluruh baris dibuat, Pesawat, Pelni, dan Hemat+ dihitung ulang per customer dalam batch.

### 6.4 Daftar, detail, edit, hapus

Paket dapat:

- dicari berdasarkan resi, barcode, nomor paket, customer, atau nama barang;
- difilter berdasarkan status, status pengambilan, status verifikasi, batch, layanan, Admin, customer, dan rentang tanggal melalui API;
- dilihat detailnya;
- diedit sebelum diserahkan;
- dihapus permanen dengan konfirmasi.

Paket yang sudah diserahkan terkunci. PATCH ditolak, kecuali PATCH khusus `customerName` yang dipakai untuk alur grup.

---

## 7. Batch Pengiriman

Batch mengisolasi paket berdasarkan periode pengiriman.

### 7.1 Data batch

- nama kapal;
- ETD/tanggal berangkat;
- periode closing mulai;
- periode closing selesai;
- kota asal;
- tujuan, default `Manokwari`;
- status batch;
- pembuat;
- waktu dibuat dan diperbarui;
- jumlah paket terhitung.

Label batch ditampilkan dengan format:

```text
Nama Kapal - ETD <tanggal> - Closing <tanggal mulai> s/d <tanggal selesai>
```

### 7.2 Status batch

| Status | Arti |
|---|---|
| `OPEN` | Batch aktif dan dapat menerima paket |
| `CLOSED` | Batch ditutup; input paket baru ditolak |
| `ARSIP` | Read-only/selesai |
| `HAPUS` | Nilai yang ditangani route untuk operasi penghapusan |

Catatan aktual: schema mendeklarasikan enum `OPEN`, `CLOSED`, `ARSIP`, sedangkan handler PATCH juga menangani `HAPUS` dengan menghapus seluruh paket batch lalu menghapus row batch secara permanen. Jadi operasi “hapus batch” bukan soft delete pada implementasi handler saat ini.

### 7.3 Aturan batch

- input paket dan import wajib menyertakan `batchId`;
- batch `CLOSED` menolak paket baru;
- batch `ARSIP` menolak paket baru;
- Owner dapat menangani paket susulan setelah batch ditutup sesuai hak akses yang sama;
- detail batch mengelompokkan paket berdasarkan `serviceType + customerName`;
- semua view paket wajib mempertahankan konteks `batchId` agar paket antar periode tidak tercampur.

---

## 8. Barcode, QR, dan Label

### 8.1 Barcode paket

Barcode dibuat saat paket pertama kali disimpan.

Format aktual server:

```text
JAJ-<timestamp-base36-uppercase>-<6 hex uppercase>
```

Contoh pola:

```text
JAJ-LXK7A2B-4F9E12
```

Barcode disimpan unik pada database dan ditampilkan sebagai QR pada label.

### 8.2 Barcode grup

Barcode grup memakai prefix:

```text
JAJ-GRUP-
```

Diikuti daftar ID paket yang dipisahkan tanda `-`. API scan dapat:

- mengenali barcode grup;
- mengambil seluruh paket berdasarkan ID;
- mengembalikan `group: true`;
- mengembalikan daftar paket grup.

### 8.3 Halaman barcode

Fitur:

- tab `1 Paket`;
- tab `Grup Paket`;
- pencarian customer, resi, barcode, nomor paket, dan nama barang;
- filter layanan;
- filter status;
- filter batch;
- pagination;
- cetak satu label;
- cetak semua label;
- cetak label grup;
- unduh/cetak label dengan format yang sesuai.

Label memuat minimal:

- logo Jastip Anggun Jaya;
- barcode/QR;
- kode JAJ;
- nama customer;
- nama barang;
- nomor resi/nomor paket;
- layanan;
- rute;
- tanggal;
- berat real, volume, dan pakai;
- ongkir;
- batch.

Konvensi printer label yang ada di source:

- ukuran label thermal: 100 mm × 150 mm;
- builder label bersama berada di `src/lib/print-label.ts`.

---

## 9. Scan, Verifikasi, Penyerahan, dan Pembayaran

### 9.1 Scan Barcode dan Pembayaran

Route UI: `/admin/scan` dan `/owner/scan`.

Sumber scan:

- kamera perangkat;
- upload foto barcode;
- input manual kode JAJ, nomor resi, atau nomor paket.

Hasil scan dimasukkan ke Keranjang Serah. Beberapa paket dapat diproses sebelum konfirmasi.

Per metode pembayaran:

- Tunai (`tunai`);
- Transfer (`transfer`);
- Piutang (`piutang`).

Input tambahan:

- diskon nominal dalam Rupiah;
- alasan diskon wajib bila diskon diisi;
- jumlah uang tunai;
- catatan pembayaran.

Perhitungan UI:

```text
totalTagihan = jumlah totalShipping paket
totalAkhir = MAX(0, totalTagihan - diskon)
kembalian = uangDiterima - totalAkhir
```

Operasi:

- **Serahkan**: status menjadi `diserahkan`;
- **Serahkan Semua**: menyerahkan seluruh keranjang dengan metode pembayaran yang dipilih;
- **Tolak**: mengeluarkan paket dari keranjang dan mengembalikannya ke `pending`;
- riwayat scan sesi tampil di bawah keranjang;
- scan duplikat ditahan dengan tiga lapis guard: kode terakhir, lock proses async, dan Set ID paket.

Catatan data: tabel `payments` menyimpan `totalAmount`, `paidAmount`, `changeAmount`, paket, metode, dan catatan. Field diskon/alasan diskon tidak memiliki kolom khusus pada schema pembayaran yang terlihat saat ini.

### 9.2 Status paket

Status legacy/utama:

| Field | Nilai | Arti |
|---|---|---|
| `status` | `pending` | Belum diserahkan |
| `status` | `diserahkan` | Sudah diserahkan |

Status granular:

| Field | Nilai |
|---|---|
| `statusVerifikasi` | `BELUM_DIVERIFIKASI`, `SUDAH_DIVERIFIKASI` |
| `statusPengambilan` | `BELUM_DIAMBIL`, `SUDAH_DIAMBIL` |
| `statusPembayaran` | `BELUM_DIBAYAR`, `DP`, `SUDAH_DIBAYAR` |

Konsekuensi:

- `serahkan` mengubah `status` menjadi `diserahkan`, `statusPengambilan` menjadi `SUDAH_DIAMBIL`, dan mengisi `pickedUpAt`;
- `tolak` hanya diizinkan bila paket belum diambil;
- paket yang sudah diambil tidak dapat dikembalikan ke pending;
- paket yang sudah diambil tidak dapat diedit atau dihapus melalui aturan lock;
- pembayaran piutang tidak mengubah status paket; paket tetap `diserahkan`.

### 9.3 Verifikasi Paket

Route UI: `/admin/verify` dan `/owner/verify`.

Alur:

1. pilih customer;
2. pilih konteks/batch bila tersedia;
3. scan kamera, upload foto, atau input manual;
4. cocokkan barcode dengan paket customer;
5. tampilkan hasil cocok/tidak cocok;
6. tandai paket cocok sebagai terverifikasi;
7. export hasil ke Excel.

Endpoint verify mengubah dua field secara bersamaan:

- `verified = sudah_diverifikasi`;
- `statusVerifikasi = SUDAH_DIVERIFIKASI`;
- `verifiedAt` diisi waktu saat verifikasi.

### 9.4 Riwayat pembayaran dan piutang

Halaman Admin mengelompokkan transaksi berdasarkan batch dan menyediakan:

- total keseluruhan;
- total tunai;
- total transfer;
- total piutang;
- filter metode pembayaran;
- detail batch;
- detail paket transaksi;
- aksi menandai piutang menjadi lunas.

Dalam implementasi API, pelunasan piutang dilakukan dengan mengubah payment dari `piutang` menjadi `tunai` atau `transfer`, mengisi `paidAmount`, dan mengisi `changeAmount`.

---

## 10. Dashboard, Monitoring, Keuangan, dan Laporan

### 10.1 Dashboard Admin

Route: `/admin/dashboard`

Komponen:

- Total Paket;
- Paket Saya;
- Belum Diambil;
- Sudah Diambil;
- tren paket;
- grafik incoming vs outgoing;
- pilihan periode 7 hari, bulan, tahun;
- 10 paket terbaru.

### 10.2 Dashboard Owner

Route: `/owner/dashboard`

Komponen:

- Total Paket;
- Belum Diambil;
- Sudah Diambil;
- Total Pelanggan;
- Total Admin aktif;
- Total Ongkir;
- grafik tren;
- paket terbaru seluruh Admin.

### 10.3 Monitor Paket Owner

Route: `/owner/packages`

Fitur:

- melihat paket seluruh Admin;
- mencari customer, resi, barcode, dan barang;
- filter `Semua`, `Pending`, `Diserahkan`;
- melihat detail berat, ongkir, tanggal, layanan, dan Admin input;
- export Excel;
- scan manual/darurat dari halaman monitor;
- menampilkan apakah paket sudah diserahkan.

### 10.4 Keuangan

Route: `/owner/finance`.

Ringkasan:

- total pembayaran diterima;
- total pengeluaran;
- saldo/hasil bersih berdasarkan data yang ditampilkan;
- breakdown layanan;
- breakdown metode pembayaran;
- paket diserahkan;
- piutang;
- filter periode dan batch;
- grafik/visualisasi pendapatan;
- export Excel.

Detail layanan:

Route: `/owner/finance/:service`

Tab yang tersedia:

- Ringkasan;
- Transaksi;
- Pembayaran;
- Paket.

Filter detail:

- Admin;
- batch;
- status pembayaran;
- status paket;
- rentang tanggal.

### 10.5 Laporan

Route: `/owner/reports`.

Jenis:

- Harian: 24 slot jam;
- Bulanan: per hari;
- Tahunan: 12 bulan.

Output:

- label periode;
- paket masuk;
- paket keluar/diserahkan;
- total paket;
- total pending;
- total picked up;
- export CSV/cetak sesuai kemampuan halaman.

### 10.6 Pengeluaran Harian

Route: `/owner/pengeluaran`.

Fitur:

- tambah pengeluaran;
- edit;
- hapus;
- filter tanggal mulai/akhir;
- filter kategori;
- filter metode pembayaran;
- filter pencatat;
- export Excel.

Metode pengeluaran:

- `cash`;
- `transfer`;
- `lainnya`.

---

## 11. Pengaturan Tarif

Route: `/owner/tarif`.

Hanya Owner yang boleh menyimpan perubahan tarif.

Pengaturan:

- `pesawatRate`;
- `hematRate`;
- `kargoRate`;
- `pelniTiersJakarta`;
- `pelniTiersSurabaya`.

Fitur UI:

- memuat tarif saat halaman dibuka;
- edit tarif Pesawat, Hemat+, dan Kargo;
- edit tier Pelni;
- tambah tier;
- hapus tier, minimal satu tier tetap dipertahankan;
- baris terakhir dinormalisasi menjadi batas atas `999999`;
- isi alasan perubahan;
- simpan semua tarif;
- lihat maksimal 100 riwayat perubahan.

Tarif baru berlaku untuk paket yang diinput setelah perubahan menurut notifikasi UI. Data historinya menyimpan tarif lama, tarif baru, alasan, user, nama user, dan waktu.

---

## 12. Rumus Berat dan Ongkir

### 12.1 Berat volume

```text
beratVolume = panjang × lebar × tinggi ÷ divisor
beratPakai = MAX(beratReal, beratVolume)
```

Divisor:

| Layanan | Divisor |
|---|---:|
| Jastip Pesawat | 5.000 |
| Jastip Hemat+ | 4.000 |
| Jastip Pelni | 4.000 |
| Jastip Kargo | 1.000.000 |

### 12.2 Pesawat

Tarif acuan: Rp77.000/kg, rute Jakarta → Manokwari.

Pembulatan berat gabungan customer dalam batch:

- sampai 0,20 kg → 0,20 kg;
- sampai 0,40 kg → 0,40 kg;
- sampai 0,50 kg → 0,50 kg;
- di atas 0,50 kg → berat total sebenarnya.

```text
totalOngkirGrup = beratBulat × 77.000
```

Jika customer memiliki beberapa paket, total ongkir didistribusikan proporsional ke setiap paket dan paket terakhir menerima sisa pembulatan agar jumlahnya tepat.

### 12.3 Hemat+

Tarif: Rp10.000/kg, rute Surabaya → Manokwari.

- satu paket dengan total berat di bawah 1 kg menggunakan minimum 1 kg;
- lebih dari satu paket memakai total berat gabungan tanpa pembulatan per paket;
- total ongkir didistribusikan proporsional.

```text
totalOngkir = beratDigunakan × 10.000
```

### 12.4 Kargo

Rute: Jakarta/Surabaya → Manokwari.

Kargo memerlukan tarif manual per M³/Ton pada input paket.

```text
kubikasi = panjang × lebar × tinggi ÷ 1.000.000
totalOngkir = kubikasi × tarifKargo
```

UI memakai tarif default Kargo sebagai panduan, tetapi tarif dapat diisi/diubah per paket. Dimensi dan tarif kargo wajib untuk input kargo. Implementasi form/server menyimpan `volumeWeight`, `usedWeight`, `shippingRate`, dan `totalShipping`.

### 12.5 Pelni

Rute tersedia:

- Jakarta → Manokwari;
- Surabaya → Manokwari.

Tarif ditentukan berdasarkan total berat gabungan customer dalam batch, bukan tarif berlapis per bagian.

Default Jakarta:

| Total berat | Tarif/kg |
|---:|---:|
| sampai sekitar 10 kg | Rp20.000 |
| sampai sekitar 20 kg | Rp19.000 |
| sampai sekitar 40 kg | Rp18.000 |
| sampai sekitar 80 kg | Rp17.000 |
| di atasnya | Rp16.000 |

Default Surabaya:

| Total berat | Tarif/kg |
|---:|---:|
| sampai 10 kg | Rp18.000 |
| sampai 20 kg | Rp17.000 |
| sampai 40 kg | Rp16.000 |
| di atasnya | Rp15.500 |

```text
totalOngkirPaket = beratPaket × tarifTierTotalBerat
```

---

## 13. API

Base URL internal frontend: `/api`  
Content type: JSON  
Auth: `Authorization: Bearer <session-token>` kecuali endpoint publik.

### 13.1 Health

| Method | Endpoint | Auth | Fungsi |
|---|---|---|---|
| GET | `/api/healthz` | Publik | Mengembalikan `{ status: "ok" }` |

### 13.2 Auth

| Method | Endpoint | Role | Fungsi |
|---|---|---|---|
| POST | `/api/auth/login` | Publik | Login nomor HP/password |
| POST | `/api/auth/register` | Publik | Membuat user customer |
| GET | `/api/auth/me` | Login | User sesi saat ini |
| PATCH | `/api/auth/profile` | Login | Update nama/password |
| POST | `/api/auth/logout` | Login | Menghapus sesi token |

### 13.3 Packages

Semua endpoint paket memerlukan role Admin atau Owner.

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/packages` | List dengan filter status, batch, layanan, user, tanggal, search |
| POST | `/api/packages` | Membuat satu paket |
| POST | `/api/packages/import` | Membuat paket massal |
| GET | `/api/packages/scan/:barcode` | Cari barcode/resi/nomor paket atau barcode grup |
| GET | `/api/packages/:id` | Detail paket |
| PATCH | `/api/packages/:id` | Edit paket dan hitung ulang |
| DELETE | `/api/packages/:id` | Hapus paket permanen |
| POST | `/api/packages/:id/serahkan` | Menandai diserahkan |
| POST | `/api/packages/:id/tolak` | Mengembalikan ke pending jika belum diambil |
| POST | `/api/packages/:id/verify` | Menandai terverifikasi |
| GET | `/api/packages/:id/barcode` | Data singkat untuk label |

Filter `GET /api/packages`:

```text
status
customerId
adminId
dateFrom
dateTo
search
batchId
serviceTypeId
statusPengambilan
statusVerifikasi
```

`search` mencocokkan resi, barcode, nomor paket, nama customer, dan nama barang.

### 13.4 Batches

Role: Admin atau Owner.

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/batches` | List batch dan jumlah paket, filter status |
| POST | `/api/batches` | Membuat batch |
| GET | `/api/batches/:id` | Detail batch dan grup paket |
| PATCH | `/api/batches/:id` | Update detail/status batch |
| GET | `/api/batches/service-types/list` | List jenis layanan |

Field wajib create batch:

```text
namaKapal
etd
periodeClosingMulai
periodeClosingSelesai
kotaAsal
```

`tujuan` default `Manokwari`.

### 13.5 Payments

Role: Admin atau Owner.

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/payments` | List pembayaran, dapat filter `paymentType` |
| POST | `/api/payments` | Simpan transaksi pembayaran |
| PATCH | `/api/payments/:id/bayar` | Melunasi/mengubah piutang menjadi tunai atau transfer |

Jenis pembayaran:

```text
tunai
transfer
piutang
```

### 13.6 Dashboard dan report

| Method | Endpoint | Role | Fungsi |
|---|---|---|---|
| GET | `/api/dashboard/summary` | Login | KPI dashboard |
| GET | `/api/dashboard/chart` | Login | Grafik incoming/outgoing; `period=week|month|year` |
| GET | `/api/reports` | Owner | Laporan `type=daily|monthly|yearly` |

Parameter report:

```text
type
date
month
year
```

### 13.7 Customers

Role: Admin atau Owner.

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/customers` | List customer, search/status dan statistik paket |
| GET | `/api/customers/:id` | Detail customer dan statistik paket |

Endpoint ini ada untuk kompatibilitas role customer/fitur lama, walaupun halaman customer/owner customer tidak aktif dari menu saat ini.

### 13.8 Admin management

Role: Owner saja.

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/admins` | List Admin dan jumlah paket input |
| POST | `/api/admins` | Buat akun Admin |
| PATCH | `/api/admins/:id` | Ubah nama/nomor HP Admin |
| POST | `/api/admins/:id/toggle-active` | Aktif/nonaktif Admin |
| POST | `/api/admins/:id/reset-password` | Reset password Admin |

### 13.9 Settings/tarif

| Method | Endpoint | Role | Fungsi |
|---|---|---|---|
| GET | `/api/settings` | Admin/Owner | Membaca semua settings |
| PATCH | `/api/settings` | Owner | Menyimpan tarif yang diizinkan |
| GET | `/api/settings/history` | Owner | Maksimal 100 riwayat tarif terbaru |

Key yang boleh diubah:

```text
kargoRate
pesawatRate
hematRate
pelniTiersJakarta
pelniTiersSurabaya
```

Body dapat membawa `_alasan` untuk histori.

### 13.10 Pengeluaran

Role: Admin atau Owner.

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/pengeluaran` | List dengan filter tanggal/kategori/metode/pencatat |
| POST | `/api/pengeluaran` | Tambah pengeluaran |
| PATCH | `/api/pengeluaran/:id` | Edit pengeluaran |
| DELETE | `/api/pengeluaran/:id` | Hapus pengeluaran |

---

## 14. Database

Database menggunakan PostgreSQL dan Drizzle ORM.

### 14.1 `users`

| Kolom | Tipe/aturan |
|---|---|
| `id` | serial primary key |
| `name` | text wajib |
| `phone` | text wajib, unique |
| `password` | text wajib, hash SHA-256 + salt aplikasi |
| `role` | `customer`, `admin`, `owner` |
| `is_active` | boolean default true |
| `created_at` | timestamp with timezone |
| `updated_at` | timestamp with timezone |

### 14.2 `sessions`

| Kolom | Tipe/aturan |
|---|---|
| `id` | serial primary key |
| `user_id` | FK ke users |
| `token` | text wajib, unique |
| `created_at` | timestamp with timezone |
| `expires_at` | timestamp with timezone |

### 14.3 `service_types`

| Kolom | Tipe/aturan |
|---|---|
| `id` | serial primary key |
| `name` | text wajib, unique; contoh `jastip hemat+` |
| `label` | text wajib; contoh `Jastip Hemat+` |

### 14.4 `batches`

| Kolom | Tipe/aturan |
|---|---|
| `id` | serial primary key |
| `nama_kapal` | text wajib |
| `etd` | date wajib |
| `periode_closing_mulai` | date wajib |
| `periode_closing_selesai` | date wajib |
| `kota_asal` | text wajib |
| `tujuan` | text default `Manokwari` |
| `status_batch` | `OPEN`, `CLOSED`, `ARSIP` pada schema |
| `created_by` | FK ke users |
| `created_at` | timestamp |
| `updated_at` | timestamp |

### 14.5 `packages`

| Kolom | Tipe/aturan |
|---|---|
| `id` | serial primary key |
| `barcode` | text wajib, unique |
| `resi_number` | text wajib |
| `package_number` | text nullable |
| `item_name` | text nullable |
| `package_mode` | text nullable; `single`/`grup` |
| `real_weight` | numeric(10,2) |
| `length` | numeric(10,2) |
| `width` | numeric(10,2) |
| `height` | numeric(10,2) |
| `volume_weight` | numeric(10,2) |
| `packaging_type` | text |
| `service_type` | text |
| `delivery_route` | text |
| `used_weight` | numeric(10,2) |
| `shipping_rate` | numeric(15,2) |
| `total_weight` | numeric(10,2) |
| `price` | numeric(15,2) |
| `total_shipping` | numeric(15,2) |
| `weight` | numeric legacy |
| `notes` | text |
| `status` | `pending`/`diserahkan` |
| `verified` | `belum_diverifikasi`/`sudah_diverifikasi` |
| `verified_at` | timestamp |
| `status_verifikasi` | `BELUM_DIVERIFIKASI`/`SUDAH_DIVERIFIKASI` |
| `status_pengambilan` | `BELUM_DIAMBIL`/`SUDAH_DIAMBIL` |
| `status_pembayaran` | `BELUM_DIBAYAR`/`DP`/`SUDAH_DIBAYAR` |
| `batch_id` | FK ke batches |
| `service_type_id` | FK ke service_types |
| `customer_name` | text wajib |
| `customer_id` | FK ke users nullable |
| `admin_id` | FK ke users nullable |
| `package_date` | timestamp |
| `picked_up_at` | timestamp |
| `created_at` | timestamp |
| `updated_at` | timestamp |

Index yang tersedia:

- status;
- status pengambilan;
- batch ID;
- batch + status + status pengambilan;
- created at;
- customer name;
- service type.

### 14.6 `payments`

| Kolom | Tipe/aturan |
|---|---|
| `id` | serial primary key |
| `payment_type` | `tunai`, `transfer`, `piutang` |
| `total_amount` | numeric(15,2) wajib |
| `paid_amount` | numeric nullable |
| `change_amount` | numeric nullable |
| `package_ids` | JSONB array number |
| `package_summary` | JSONB ringkasan paket |
| `admin_id` | FK ke users |
| `admin_name` | text snapshot |
| `notes` | text |
| `created_at` | timestamp |

### 14.7 `settings`

| Kolom | Tipe/aturan |
|---|---|
| `key` | text primary key |
| `value` | text wajib; angka/array disimpan sebagai string/JSON |
| `updated_at` | timestamp |

### 14.8 `tarif_history`

| Kolom | Tipe/aturan |
|---|---|
| `id` | serial primary key |
| `jenis_jastip` | text wajib |
| `tarif_lama` | text nullable |
| `tarif_baru` | text wajib |
| `alasan` | text nullable |
| `diubah_oleh` | FK ke users |
| `nama_ubah` | text snapshot |
| `created_at` | timestamp |

### 14.9 `pengeluaran`

| Kolom | Tipe/aturan |
|---|---|
| `id` | serial primary key |
| `tanggal` | date wajib |
| `kategori` | text wajib |
| `nominal` | numeric(15,2) wajib |
| `metode_pembayaran` | `cash`, `transfer`, `lainnya` |
| `dicatat_oleh` | FK ke users |
| `nama_pencatat` | text snapshot |
| `catatan` | text |
| `created_at` | timestamp |
| `updated_at` | timestamp |

---

## 15. Aturan Bisnis dan Invarian

1. Paket baru harus memiliki nomor resi dan nama customer atau customer ID.
2. Paket baru dan import harus memiliki batch.
3. Paket hanya boleh masuk batch `OPEN`.
4. Status operasional paket hanya `pending` atau `diserahkan`.
5. Penyerahan resmi dilakukan melalui endpoint `serahkan`.
6. Paket yang sudah `SUDAH_DIAMBIL` bersifat permanen/terkunci.
7. Paket yang sudah diambil tidak boleh ditolak atau diedit.
8. `tolak` memakai kondisi atomic agar tidak dapat membatalkan paket yang sudah diambil secara bersamaan.
9. Verifikasi paket terpisah dari status penyerahan.
10. Grup harus dipisahkan berdasarkan customer, service type, dan batch.
11. Barcode paket harus unik.
12. Barcode grup harus memakai prefix `JAJ-GRUP-`.
13. Kargo membutuhkan dimensi dan tarif kubikasi.
14. Perhitungan Pesawat, Hemat+, dan Pelni dapat bergantung pada total berat customer dalam satu batch.
15. Piutang tidak berarti paket masih pending; paket dapat tetap `diserahkan`.
16. Admin nonaktif tidak bisa login.
17. Hanya Owner yang dapat membuat/mengubah/mengaktifkan/reset akun Admin.
18. Hanya Owner yang dapat mengubah tarif.
19. Perubahan tarif menyimpan histori.
20. Pengeluaran harus bernominal positif saat dibuat.
21. Penghapusan paket adalah hard delete.
22. Penghapusan batch yang ditangani route juga menghapus paket batch secara permanen.

---

## 16. Alur Operasional Utama

### 16.1 Alur paket normal

```text
Login Admin/Owner
  → pilih batch OPEN
  → input paket satuan/grup/import
  → sistem menghitung berat dan ongkir
  → sistem membuat barcode
  → cetak label
  → customer mengambil paket
  → scan barcode
  → pilih metode pembayaran/diskon
  → serahkan
  → paket menjadi diserahkan
  → jika piutang, lunasi dari Riwayat Pembayaran
```

### 16.2 Alur batch

```text
Buat batch
  → batch OPEN menerima paket
  → periode closing
  → ubah CLOSED
  → paket baru ditolak
  → Owner dapat menangani kebutuhan susulan
  → selesai menjadi ARSIP/read-only
```

### 16.3 Alur verifikasi

```text
Paket tiba dari kota asal
  → buka Verifikasi Paket
  → pilih customer/batch
  → scan barcode fisik
  → cocokkan dengan data
  → tandai terverifikasi
  → export hasil ke Excel
```

### 16.4 Alur Owner

```text
Dashboard
  → Monitor Paket
  → Keuangan
  → Pengeluaran
  → Laporan
  → Tarif
  → Manajemen User
```

---

## 17. Error dan Respons Umum API

| Status | Kondisi umum |
|---:|---|
| 400 | Input wajib kurang, batch tidak valid, status/jenis pembayaran salah, nominal tidak valid |
| 401 | Tidak ada Bearer token, sesi expired, password salah, user nonaktif |
| 403 | Role tidak memiliki izin |
| 404 | Paket, batch, user, atau pembayaran tidak ditemukan |
| 500 | Error server/database |

Pesan penting:

- batch `CLOSED`: hubungi Owner untuk paket susulan;
- batch `ARSIP`: tidak dapat menerima paket baru;
- paket sudah diserahkan: tidak dapat diproses ulang;
- paket sudah diambil: tidak dapat diedit/ditolak.

---

## 18. Catatan Teknis dan Batasan Aktual

1. Frontend dan API adalah dua proses/workflow berbeda.
2. Frontend menggunakan URL API relatif `/api`, sehingga routing proxy/deployment harus meneruskannya ke API server.
3. Query frontend memiliki `staleTime` 30 detik dan `gcTime` 5 menit.
4. API menerima JSON dan URL-encoded body sampai 100 MB.
5. CORS aktif pada Express.
6. Logging HTTP menggunakan pino/pino-http.
7. Customer UI dan register page masih berupa source/legacy tetapi tidak terhubung ke route aktif.
8. `users` masih mempertahankan role customer walaupun produk aktif berfokus pada Admin dan Owner.
9. Schema packages masih menyimpan field legacy (`status`, `verified`, `weight`) bersamaan dengan status granular baru.
10. Dokumentasi/route lama `/admin/settings` dan `/owner/settings` masih ada, tetapi menu aktif menggunakan `/owner/tarif`.
11. Endpoint service type dideklarasikan setelah route parameter batch `/:id`; implementasi routing perlu dipastikan saat endpoint tersebut dipanggil.
12. Nilai `HAPUS` ditangani oleh handler batch untuk penghapusan permanen walaupun enum schema batch hanya mencantumkan OPEN/CLOSED/ARSIP.
13. Diskon terlihat diproses pada UI scan, tetapi schema payment tidak menyediakan kolom khusus untuk menyimpan nominal/alasan diskon.
14. Export dilakukan di sisi browser menggunakan library `xlsx` atau utilitas export halaman.
15. Sesi/token disimpan pada localStorage; aplikasi tidak menggunakan cookie session untuk frontend.
16. Password menggunakan SHA-256 dengan salt statis aplikasi; perubahan desain keamanan password akan berdampak pada akun existing.

---

## 19. Kebutuhan Environment dan Menjalankan Aplikasi

Workspace:

```bash
pnpm install
```

Database:

```bash
pnpm --filter @workspace/db run push
npx tsx scripts/migrate-batch-legacy.ts
pnpm --filter @workspace/scripts run seed-demo
```

Frontend:

```bash
PORT=5000 pnpm --filter @workspace/jastip run dev
```

API:

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```

Urutan database penting karena migration batch:

- mengisi `service_types`;
- membuat legacy batch `ARSIP`;
- melakukan backfill relasi batch/service pada paket lama.

Tanpa migration tersebut, paket yang memiliki service type dapat kehilangan `serviceTypeId` dan pengelompokan/laporan batch dapat tidak lengkap.

---

## 20. Ringkasan Implementasi vs Status

| Area | Status aktual |
|---|---|
| Login Admin/Owner | Aktif |
| Register Customer | Endpoint aktif, UI route tidak aktif |
| Dashboard Admin | Aktif |
| Dashboard Owner | Aktif |
| CRUD paket | Aktif |
| Input grup | Aktif |
| Import Excel | Aktif |
| Batch | Aktif |
| Barcode/QR | Aktif |
| Scan kamera/upload/manual | Aktif |
| Penyerahan/penolakan | Aktif |
| Verifikasi | Aktif |
| Riwayat pembayaran | Aktif |
| Piutang/lunas | Aktif melalui perubahan payment |
| Monitor Owner | Aktif |
| Keuangan | Aktif |
| Laporan | Aktif |
| Pengeluaran | Aktif |
| Pengaturan tarif | Aktif untuk Owner |
| Manajemen Admin | Aktif untuk Owner |
| Customer dashboard | Source ada, route tidak aktif |
| Customer history/packages/scan | Source ada, route tidak aktif |
| Owner Data Customer | Source ada, route tidak aktif |
| Soft delete batch | Tidak sesuai komentar lama; handler melakukan delete permanen |
