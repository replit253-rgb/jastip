# PRD — Jastip Anggun Jaya

> **Status dokumen:** As-is / reverse-engineered dari source code proyek saat ini  
> **Tanggal pemetaan:** 2026-09-10  
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
- penyerahan paket, pencatatan pembayaran multi-metode, dan manajemen shift kasir harian;
- riwayat pembayaran/piutang dan penanganan VOID transaksi;
- monitoring paket dan dashboard operasional;
- batch pengiriman dengan periode closing dan status penguncian;
- laporan operasional dan penutupan kas laci (*drawer*);
- keuangan, pengeluaran harian, dan pembukuan arus kas;
- konfigurasi tarif oleh Owner;
- manajemen akun Admin dan staf kasir.

### 1.1 Stack dan struktur

| Bagian | Implementasi |
|---|---|
| Frontend | React + Vite + TypeScript di `artifacts/jastip` |
| Routing frontend | Wouter |
| Data fetching | TanStack React Query |
| UI | Tailwind CSS, Radix UI/shadcn-style components, Lucide icons |
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
- melihat keuangan, memproses/menyetujui laporan pengajuan VOID transaksi dan mengesahkan penyesuaian kas (*reversal*);
- mencatat serta mengelola pengeluaran harian;
- mengubah profil sendiri;
- melakukan semua operasi admin harian (paket, batch, barcode, scan, verifikasi, shift kasir, dan pembayaran).

#### Admin

Admin adalah operator harian dan staf kasir. Admin dapat:

- melihat dashboard operasional harian;
- melakukan alur shift: membuka shift (mengisi modal awal), mencatat transaksi, menerima pembayaran, mencetak struk, dan melakukan penutupan (*closing shift*) dengan mencatat kas aktual fisik per denominasi;
- membuat, melihat, mengubah, dan menghapus paket;
- memilih dan mengelola batch;
- import Excel;
- mencetak label barcode;
- memverifikasi paket;
- mengajukan pembatalan (VOID) transaksi pembayaran;
- melihat riwayat pembayaran;
- mengubah profil sendiri.

#### Customer — tidak aktif pada routing saat ini

Role `customer` tidak didaftarkan di `App.tsx`, sehingga route customer tidak aktif dan akan jatuh ke halaman 404.

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
  - Owner → `/owner/dashboard`.

Sesi:
- token dibuat dari random bytes 32 byte dan disimpan sebagai hexadecimal;
- masa berlaku sesi 7 hari;
- request API memakai header `Authorization: Bearer <token>`;
- sesi hanya valid jika belum expired dan user masih aktif.

### 3.2 Profil

Route: `/admin/profile` dan `/owner/profile`

Fitur:
- mengubah nama;
- mengubah password (memerlukan konfirmasi password lama).

### 3.3 Logout

Tombol **Keluar** tersedia di footer sidebar. Logout:
- memanggil `POST /api/auth/logout`;
- menghapus sesi server untuk token aktif;
- menghapus `jaj_token` dari localStorage;
- mengarahkan ke `/login`.

---

## 4. Layout dan Menu Navigasi

Semua halaman terproteksi memakai layout dengan sidebar responsif, identitas Jastip Anggun Jaya, nama & role pengguna, tanggal terformat Indonesia, dan tombol Keluar.

### 4.1 Menu Admin (Tepat 13 Item)

| No | Label | URL | Keterangan |
|---|---|---|---|
| 1 | Dashboard | `/admin/dashboard` | Ringkasan operasional harian |
| 2 | Semua Paket | `/admin/packages` | Daftar paket yang diinput oleh Admin |
| 3 | Batch Pengiriman | `/admin/batches` | Daftar dan pengaturan batch pengiriman |
| 4 | Input Paket | `/admin/packages/type` | Pemilihan mode input (Satuan/Grup/Excel) |
| 5 | Import Excel | `/admin/packages/import` | Unggah data paket massal via Excel |
| 6 | Label Barcode | `/admin/barcode` | Pencarian dan pencetakan label barcode paket |
| 7 | Arsip Sudah Diambil | `/admin/arsip` | Daftar paket yang sudah diambil/diarsipkan |
| 8 | Verifikasi Paket | `/admin/verify` | Proses pencocokan paket fisik pasca-bongkar |
| 9 | Riwayat Pembayaran | `/admin/riwayat-pembayaran` | Daftar transaksi terbayar per batch |
| 10 | Transaksi & VOID | `/admin/finance` | Monitoring pembayaran dan pengajuan pembatalan (VOID) |
| 11 | Invoice A4 | `/admin/invoices` | Cetak dokumen invoice ukuran A4 untuk customer |
| 12 | Shift Kasir | `/admin/shift` | Siklus buka shift kasir, hitung denominasi laci, dan closing |
| 13 | Profil | `/admin/profile` | Ganti profil nama dan password |

### 4.2 Menu Owner

#### Section Owner
- **Dashboard** (`/owner/dashboard`)
- **Monitor Paket** (`/owner/packages`)
- **Data Admin** (`/owner/admins`)
- **Keuangan** (`/owner/finance`)
- **Invoice A4** (`/owner/invoices`)
- **Laporan VOID** (`/owner/voids`)
- **Pengeluaran Harian** (`/owner/pengeluaran`)
- **Laporan** (`/owner/reports`)
- **Pengaturan Tarif** (`/owner/tarif`)
- **Pengaturan Kas** (`/owner/settings`)
- **Manajemen User** (`/owner/users`)
- **Profil** (`/owner/profile`)

#### Section Admin Tools (Tepat 6 Item - Selaras dengan Alat Operasional Admin)
- **Batch Pengiriman** (`/owner/batches`)
- **Input Paket** (`/owner/packages/type`)
- **Import Excel** (`/owner/packages/import`)
- **Label Barcode** (`/owner/barcode`)
- **Arsip Sudah Diambil** (`/owner/arsip`)
- **Verifikasi Paket** (`/owner/verify`)

---

## 5. Fitur Shift Kasir dan Alur Keuangan (Korektif & Rekonsiliasi)

Fitur penunjang kasir di sistem ini dirancang dengan pengawasan ketat dari Owner guna mencegah selisih atau kecurangan kas laci.

### 5.1 Siklus Hidup Shift
1.  **Buka Shift**: Kasir menginput **Jenis Shift** (Pagi/Malam), **Terminal ID** opsional, dan **Saldo Awal** kas modal laci.
2.  **Transaksi Harian**: Selama shift berlangsung, pembayaran tunai dicatat ke dalam *System Cash*. Pembayaran digital (Transfer/QRIS) tidak memengaruhi saldo uang kertas fisik di laci namun dicatat di rekap keuangan.
3.  **Tutup Shift (Blind Closing)**:
    *   Kasir menutup shift tanpa mengetahui saldo akhir menurut komputer (*Blind Closing*).
    *   Kasir wajib menginput jumlah lembar uang fisik berdasarkan pecahan denominasi (Rp 100.000, Rp 50.000, Rp 20.000, Rp 10.000, Rp 5.000, Rp 2.000, Rp 1.000, Rp 500, Rp 200).
    *   Sistem menghitung total uang aktual secara matematis.
    *   Jika terjadi selisih (*discrepancy*), kasir diwajibkan menulis alasan selisih sebelum shift resmi ditutup.
    *   Status shift berubah menjadi `CLOSED` dan laporan rekap selisih dikirim ke Owner.

### 5.2 Alur Transaksi, Pembayaran, dan Cetak Struk
*   **Keranjang Serah**: Paket hasil scan barcode masuk ke antrean keranjang.
*   **Metode Pembayaran**: Mendukung **Tunai**, **Transfer**, dan **Piutang** (baik belum bayar sama sekali maupun cicilan/DP sebagian).
*   **Penerbitan Struk**: Struk termal ukuran 58mm atau 80mm diterbitkan seketika, lengkap dengan detail diskon, total ongkir, nominal diterima, kembalian, sisa piutang, dan informasi shift kasir yang bertanggung jawab.

### 5.3 Laporan VOID dan Reversal Kas
*   Admin dapat mengajukan **VOID** atas transaksi yang salah input atau salah bayar.
*   Aksi pengajuan VOID akan membekukan transaksi namun saldo kas belum berkurang secara otomatis.
*   **Approval Owner**: Owner memeriksa pengajuan pada halaman **Laporan VOID** (`/owner/voids`). Begitu disetujui (*Approved*), sistem akan membalik saldo kas (*reversal amount*) dan mereset status paket menjadi belum diambil (*pending*) agar dapat diproses ulang dengan benar.

---

## 6. Rumus Berat, Ongkir, dan Perhitungan Tarif

### 6.1 Berat Volume & Berat Pakai
```text
beratVolume = panjang × lebar × tinggi ÷ divisor
beratPakai = MAX(beratReal, beratVolume)
```

**Divisor Layanan:**
*   Jastip Pesawat: 5.000
*   Jastip Hemat+: 4.000
*   Jastip Pelni: 4.000
*   Jastip Kargo: 1.000.000 (menghasilkan M³)

### 6.2 Jastip Pesawat
*   Tarif acuan default: Rp77.000/kg.
*   Pembulatan berat gabungan per customer dalam satu batch:
    *   Sampai 0,20 kg → Bulatkan menjadi 0,20 kg
    *   Sampai 0,40 kg → Bulatkan menjadi 0,40 kg
    *   Sampai 0,50 kg → Bulatkan menjadi 0,50 kg
    *   Di atas 0,50 kg → Berat total sebenarnya
*   Ongkir didistribusikan secara proporsional ke tiap paket milik customer tersebut.

### 6.3 Jastip Hemat+
*   Tarif default: Rp10.000/kg.
*   Satu paket tunggal dengan berat < 1 kg menggunakan nilai minimum 1 kg.
*   Lebih dari satu paket milik customer dalam batch yang sama dihitung berdasarkan total berat gabungan tanpa dibulatkan ke atas per paket.

### 6.4 Jastip Kargo
*   Membutuhkan dimensi barang dan tarif kubikasi/tonase yang diisi manual per paket.
```text
kubikasi = panjang × lebar × tinggi ÷ 1.000.000
totalOngkir = kubikasi × tarifKargoManual
```

### 6.5 Jastip Pelni (Tarif Tier Berkelompok)
*   Tarif ditentukan berdasarkan total berat gabungan seluruh paket milik customer tersebut dalam satu batch.
*   Sistem mencocokkan total berat ke tingkatan (*tiers*) tarif aktif yang diset oleh Owner (misal: 0-10 kg, 10-20 kg, dll) kemudian mengalikan berat paket individual dengan tarif tingkat tersebut.

---

## 7. Komponen Pagination Seluruh Halaman

Untuk mengoptimalkan performa halaman saat data berjumlah ribuan, seluruh tampilan tabel dan kartu telah menggunakan komponen **Pagination** dinamis:

*   **Semua Paket & Monitor Paket**: Paginasi data paket di sisi server (*Server-side pagination*).
*   **Riwayat Pembayaran**: Mengelompokkan transaksi per batch kapal dengan pagination kartu batch (6 batch per halaman).
*   **Laporan VOID**: Menampilkan riwayat usulan pembatalan dengan paginasi 5 data per halaman.
*   **Pengeluaran Harian**: Pembukuan pengeluaran harian dilengkapi paginasi 10 data per halaman dengan fitur reset otomatis ke halaman 1 ketika pencarian atau filter disesuaikan.
*   **Riwayat Multi-payment (Transaksi & VOID)**: Paginasi daftar struk transaksi (10 transaksi per halaman).
*   **Manajemen User & Data Admin**: Pagination daftar akun staf kasir dan admin.

---

## 8. Database Schema (Drizzle ORM)

### 8.1 Tabel Utama & Relasi

1.  **`users`**: Data admin, owner, dan user aktif. Menyimpan status keaktifan (`is_active`).
2.  **`sessions`**: Token login sesi pengguna (masa aktif 7 hari).
3.  **`service_types`**: Referensi jenis layanan (Pesawat, Hemat+, Pelni, Kargo).
4.  **`batches`**: Manajemen batch pengiriman kapal dengan status (`OPEN`, `CLOSED`, `ARSIP`).
5.  **`packages`**: Data paket lengkap dengan detail dimensi, berat, ongkir, status verifikasi (`BELUM_DIVERIFIKASI` / `SUDAH_DIVERIFIKASI`), status pengambilan (`BELUM_DIAMBIL` / `SUDAH_DIAMBIL`), dan barcode ter-generate otomatis (`JAJ-<base36-timestamp>-<hex>`).
6.  **`payments`**: Menyimpan data transaksi pembayaran, tipe pembayaran (`tunai`, `transfer`, `piutang`), nominal diterima, kembalian, sisa piutang, dan referensi array ID paket (`package_ids`).
7.  **`shift_sessions`**: Pencatatan shift kasir harian, tipe shift, modal awal, waktu buka, waktu tutup, dan status (`OPEN`, `CLOSED`).
8.  **`shift_closings`**: Laporan penutupan kas laci, berisi hitungan sistem (*systemCash*), kas fisik aktual (*actualCash*), nominal selisih, dan alasan selisih.
9.  **`void_requests`**: Log permohonan VOID transaksi, status usulan (`MENUNGGU_APPROVAL`, `VOID`, `DITOLAK`), pembuat usulan, nama penyetuju, nominal reversal, dan status sebelum void.
10. **`pengeluaran`**: Pencatatan arus kas keluar, nominal, kategori, metode pembayaran (`cash`, `transfer`, `lainnya`), dan staf pencatat.
11. **`settings`**: Penyimpanan nilai tarif dasar dan tiering Pelni.
12. **`tarif_history`**: Log riwayat perubahan tarif oleh Owner untuk audit transparansi.

---

## 9. Aturan Bisnis & Invarian Kritis

1.  **Larangan Transaksi Tanpa Shift**: Kasir tidak diperbolehkan melayani pembayaran atau serah terima paket sebelum shift kasir pada hari itu resmi dibuka dan modal kas awal dideklarasikan.
2.  **Imutabilitas Paket Diserahkan**: Paket dengan status pengambilan `SUDAH_DIAMBIL` terkunci dari segala jenis perubahan data ataupun pembatalan (PATCH/DELETE dilarang keras), kecuali diajukan VOID secara formal dan disetujui Owner.
3.  **Proteksi Batch Tertutup**: Batch berkode status `CLOSED` atau `ARSIP` menolak segala bentuk input atau import paket baru. Hanya Owner yang dapat menyisipkan paket darurat/susulan ke batch tersebut.
4.  **Invariansi Snapshot Invoice**: Perubahan pengaturan tarif oleh Owner tidak boleh memengaruhi nominal harga pada transaksi/invoice yang sudah terjadi sebelumnya di masa lampau. Data total pengiriman harus terkunci kokoh berdasarkan snapshot saat pembuatan paket.
5.  **Larangan Nilai Negatif**: Input nominal keuangan (saldo awal shift, nominal pengeluaran, nominal bayar) wajib bernilai positif dan bilangan bulat positif.
6.  **Keunikan Barcode**: Barcode paket individual tidak boleh duplikat. Barcode grup wajib ber-prefix `JAJ-GRUP-` diikuti gabungan ID paket terpisah strip `-`.

---

## 10. Panduan Pengoperasian & Perintah Developer

### 10.1 Pemasangan Awal
```bash
pnpm install
```

### 10.2 Sinkronisasi Skema Database & Migrasi Data
```bash
# Push skema ke database PostgreSQL
pnpm --filter @workspace/db run push

# Jalankan migrasi data relasi batch legacy
npx tsx scripts/migrate-batch-legacy.ts

# Suntik data akun demo awal dan pengaturan tarif default
pnpm --filter @workspace/scripts run seed-demo
```

### 10.3 Menjalankan Server Pengembangan (Dev Mode)
```bash
# Jalankan UI Frontend (Port 5000/3000)
PORT=5000 pnpm --filter @workspace/jastip run dev

# Jalankan API Server Backend (Port 8080)
PORT=8080 pnpm --filter @workspace/api-server run dev
```
