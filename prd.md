# PRD — Jastip Anggun Jaya

> **Status dokumen:** As-is / reverse-engineered dan sinkronisasi penuh dari source code proyek aktif  
> **Tanggal pembaruan:** 2026-09-27  
> **Tujuan dokumen:** Mendeskripsikan arsitektur, halaman, navigasi, role, fitur operasional, sistem Invoice A4, modul barcode & detail paket (termasuk biaya tambahan opsional & navigasi detail /owner/packages), verifikasi scan, manajemen shift kasir, keuangan & VOID, database schema Drizzle ORM, rumus tarif & komponen pembulatan otomatis minimal terintegrasi di `/owner/tarif`, dan panduan testing yang benar-benar ada dan berjalan di sistem saat ini.

---

## 1. Ringkasan Produk

Jastip Anggun Jaya adalah aplikasi operasional ekspedisi dan jasa titip (jastip) terpadu untuk mengelola alur pengiriman paket dari kota asal (Jakarta dan Surabaya) menuju Manokwari, Papua Barat.

Sistem mencakup seluruh tahapan operasional logistik:
- **Autentikasi & Otorisasi**: Login berbasis nomor HP dan kata sandi dengan kontrol hak akses multi-role (Owner dan Admin/Kasir).
- **Manajemen Batch Pengiriman**: Penjadwalan keberangkatan kapal (KM Dobonsolo, KM Gunung Dempo, KM Ciremai, dsb), periode closing pengiriman, dan proteksi arsip.
- **Pencatatan Paket**: Mode input satuan (Pesawat, Pelni, Hemat+, Kargo), mode grup multi-resi satu pemesan, serta import massal data Excel (.xlsx).
- **Kalkulasi Otomatis Tarif & Ongkir**: Perhitungan berat volume, berat pakai aktual, pembulatan tarif berjenjang, minimum ongkir, dan biaya tambahan (*additional fee*).
- **Label Barcode & QR Code**: Otomatisasi generate kode unik `JAJ-...` untuk paket individual dan `JAJ-GRUP-...` untuk paket gabungan beserta antarmuka cetak label stiker.
- **Verifikasi Fisik Bongkar Muat**: Scan QR/barcode via webcam/kamera, upload gambar barcode, atau input manual dengan pencocokan nama penerima dan batch kapal.
- **Sistem Invoice A4 Terpadu**: Modul pembuatan dokumen tagihan A4 resmi dengan pencarian customer manual, checklist seleksi paket, penanda status paket yang sudah/belum di-invoice, form diskon/DP, cetak snapshot A4, dan riwayat invoice.
- **Shift Kasir Harian & Blind Closing**: Siklus buka shift dengan deklarasi modal awal laci (*opening balance*), pencatatan transaksi tunai/non-tunai, dan penutupan shift buta (*blind closing*) berbasis hitung lembar fisik denominasi uang kertas untuk mencegah kecurangan.
- **Kasir & Multi-Metode Pembayaran**: Penerimaan pembayaran tunai (dengan kalkulasi kembalian otomatis), transfer bank (input nomor referensi), QRIS dinamis, dan sistem pencatatan piutang bertahap.
- **Cetak Struk Kasir**: Penerbitan struk termal (58mm / 80mm) transaksi langsung maupun pelunasan piutang.
- **Pengawasan VOID & Reversal Saldo**: Pengajuan pembatalan transaksi oleh Admin kasir yang wajib disetujui (*Approved*) oleh Owner untuk membalikkan saldo kas (*cash reversal*) dan mengembalikan status paket menjadi belum diambil.
- **Pengeluaran Harian Kas**: Pencatatan arus kas keluar operasional toko/kantor dengan klasifikasi kategori pengeluaran.
- **Manajemen & Audit Tarif**: Pengaturan tarif per rute dan per layanan oleh Owner dengan histori audit perubahan harga (*tariff audit trail*).
- **Laporan & Rekonsiliasi**: Laporan laba/rugi, performa pendapatan per layanan, status piutang, dan rekapitulasi shift kasir.

### 1.1 Stack dan Arsitektur Sistem

| Komponen | Teknologi | Keterangan |
|---|---|---|
| **Runtime & Server** | Node.js + Express 5 + TypeScript (`tsx`) | Server terpadu di root `server.ts` |
| **Frontend UI** | React 18 + Vite + TypeScript | Berlokasi di `artifacts/jastip` |
| **Routing Frontend** | Wouter | Client-side routing dengan `ProtectedRoute` |
| **State & Fetching** | TanStack React Query v5 | Cache time 30s, gcTime 5m |
| **Desain & Komponen** | Tailwind CSS + Radix UI / shadcn/ui + Lucide React | Desain responsif desktop & mobile |
| **Database & ORM** | PostgreSQL + Drizzle ORM | Schema di `lib/db/src/schema.ts` |
| **Barcode & QR** | `qrcode`, `html5-qrcode`, `jsbarcode` | Render SVG barcode & QR scanner |
| **Spreadsheet** | `xlsx` | Import/export data paket & laporan Excel |
| **Port Akses** | **Port 3000** | Reverse-proxy tunggal untuk Express API & Vite UI |
| **Prefix API** | `/api/*` | Semua endpoint server dilayani di bawah `/api` |

---

## 2. Role dan Hak Akses Pengguna

### 2.1 Role Owner
Owner memiliki kendali penuh atas sistem:
1. **Dashboard Eksekutif**: Melihat metrik omzet keseluruhan, laba bersih, piutang tertagih/belum tertagih, grafik performa layanan, dan ringkasan shift kasir.
2. **Monitoring Seluruh Paket**: Memantau paket dari seluruh admin dan batch tanpa batas.
3. **Persetujuan VOID**: Mengesahkan (*Approve*) atau menolak (*Reject*) permohonan pembatalan transaksi dari admin kasir dan mengesahkan *reversal* saldo kas.
4. **Pengaturan Tarif**: Mengubah tarif dasar per kg, batas tiering Pelni, dan konfigurasi minimum ongkir.
5. **Pengaturan Kas & QRIS**: Menyesuaikan nomor rekening transfer, unggah gambar QRIS statis/dinamis toko, dan saldo awal acuan.
6. **Pengeluaran Kas**: Menyetujui dan mencatat pengeluaran operasional toko/kantor.
7. **Manajemen User**: Menambah, mengedit status aktif/non-aktif, dan mereset akun staf Admin.
8. **Admin Tools**: Memiliki akses langsung ke seluruh perkakas kerja Admin.

### 2.2 Role Admin (Operator & Staf Kasir)
Admin bertanggung jawab atas alur harian logistik dan kasir:
1. **Operasional Shift**: Wajib membuka shift dengan input modal awal laci sebelum dapat memproses transaksi kasir, serta melakukan penutupan *blind closing*.
2. **Pencatatan Paket**: Input paket satuan, paket grup multi-resi, dan import file Excel.
3. **Cetak Label Barcode**: Mencetak stiker barcode paket individual maupun QR grup.
4. **Verifikasi Paket Fisik**: Melakukan scan barcode paket yang tiba pasca-bongkar kapal.
5. **Scan & Kasir**: Melayani pengambilan barang, menerima pembayaran (Tunai, Transfer, QRIS, Piutang), dan mencetak struk termal.
6. **Invoice A4**: Mencari paket customer secara manual, memilih paket via checklist, menerbitkan tagihan invoice resmi A4, dan mencetak dokumen snapshot.
7. **Pengajuan VOID**: Mengajukan permohonan pembatalan jika terjadi salah input pada transaksi kasir.
8. **Arsip Paket**: Memeriksa riwayat paket yang telah selesai diserahkan ke pelanggan.

---

## 3. Struktur Navigasi Menu

### 3.1 Menu Navigasi Admin (`adminNav` — 14 Item)

| No | Label Menu | URL Route | Ikon | Keterangan |
|:--:|---|---|---|---|
| 1 | **Dashboard** | `/admin/dashboard` | `LayoutDashboard` | Ringkasan operasional & statistik harian |
| 2 | **Semua Paket** | `/admin/packages` | `Package` | Manajemen tabel paket yang diinput |
| 3 | **Batch Pengiriman** | `/admin/batches` | `Ship` | Daftar batch kapal dan status periode |
| 4 | **Input Paket** | `/admin/packages/type` | `FileInput` | Pemilihan mode input (Satuan, Grup, Kargo) |
| 5 | **Import Excel** | `/admin/packages/import` | `FileSpreadsheet` | Unggah data paket massal via file .xlsx |
| 6 | **Label Barcode** | `/admin/barcode` | `Barcode` | Pencarian & cetak lembar label barcode |
| 7 | **Arsip Sudah Diambil** | `/admin/arsip` | `Archive` | Daftar paket berstatus selesai/diambil |
| 8 | **Verifikasi Paket** | `/admin/verify` | `ShieldCheck` | Pencocokan fisik paket di gudang |
| 9 | **Riwayat Pembayaran** | `/admin/riwayat-pembayaran` | `History` | Rekapitulasi transaksi pembayaran per batch |
| 10 | **Transaksi & VOID** | `/admin/finance` | `ShieldCheck` | Daftar transaksi aktif dan pengajuan VOID |
| 11 | **Invoice A4** | `/admin/invoices` | `FileText` | Modul pembuatan & pencetakan invoice A4 |
| 12 | **Shift Kasir** | `/admin/shift` | `WalletCards` | Manajemen shift & penutupan laci kasir |
| 13 | **Scan & Pembayaran** | `/admin/scan` | `ScanLine` | Kasir serah paket (*memerlukan shift aktif*) |
| 14 | **Profil** | `/admin/profile` | `UserCircle` | Pengaturan profil nama dan kata sandi |

### 3.2 Menu Navigasi Owner (`ownerSections`)

#### Section 1: Menu Utama Owner (13 Item)
1. **Dashboard** (`/owner/dashboard`) — Analisis grafik performa omzet dan laporan kas.
2. **Monitor Paket** (`/owner/packages`) — Pemantauan seluruh paket dari semua admin, dilengkapi navigasi klik baris/kartu & tombol **Detail** ke rincian paket `/owner/packages/:id`.
3. **Data Admin** (`/owner/admins`) — Daftar dan evaluasi kinerja staf admin.
4. **Keuangan** (`/owner/finance`) — Arus kas masuk/keluar, pendapatan per layanan.
5. **Invoice A4** (`/owner/invoices`) — Akses penuh penerbitan dan audit invoice A4.
6. **Laporan VOID** (`/owner/voids`) — Antarmuka approval/reject permohonan VOID.
7. **Pengeluaran Harian** (`/owner/pengeluaran`) — Pencatatan dan audit beban kas toko.
8. **Shift & Closing** (`/owner/shift`) — Monitoring status shift kasir & audit selisih kas laci.
9. **Laporan** (`/owner/reports`) — Laporan komprehensif laba-rugi, piutang, dan volume.
10. **Pengaturan Tarif** (`/owner/tarif`) — Konfigurasi harga per kg/m³ dan riwayat audit tarif.
11. **Pengaturan Kas** (`/owner/settings`) — Pengaturan rekening, QRIS, dan batas toleransi selisih.
12. **Manajemen User** (`/owner/users`) — Kelola data kredensial staf dan status aktif/nonaktif.
13. **Profil** (`/owner/profile`) — Profil dan ganti password akun Owner.

#### Section 2: Admin Tools (12 Item)
Menyediakan akses cepat bagi Owner untuk menjalankan seluruh alat operasional Admin (`/owner/batches`, `/owner/packages/type`, `/owner/packages/import`, `/owner/barcode`, `/owner/arsip`, `/owner/verify`, `/owner/riwayat-pembayaran`, `/owner/scan`, dsb).

---

## 4. Spesifikasi Modul & Fitur Utama

### 4.1 Modul Invoice A4 (Pencarian, Pemilihan Manual, Penanda Status, & Cetak PDF)

Modul Invoice A4 (`/admin/invoices` & `/owner/invoices`) dirancang untuk memenuhi kebutuhan pembuatan tagihan resmi multi-paket per customer:

1. **Alur Pencarian Customer Manual & Tab Transaksi**:
   - **Mode Manual (Pilih Paket & Buat Invoice)**: Admin memasukkan nama customer (contoh: *"Andi"*) pada kotak pencarian nama. Sistem secara dinamis mencari dan menampilkan seluruh daftar paket yang terdaftar atas nama pelanggan tersebut dari database.
   - **Filter Batch Pengiriman**: Dilengkapi filter dropdown batch pengiriman kapal yang memungkinkan admin menyaring paket khusus pada batch tertentu atau menampilkan dari semua batch.
   - **Mode Dari Transaksi**: Memungkinkan pembuatan invoice langsung dari transaksi kasir yang telah dicatat sebelumnya.
   - Pada setiap baris paket ditampilkan informasi lengkap: No. Resi, No. Paket, Nama Barang, Layanan (Pesawat/Pelni/Hemat+/Kargo), Berat Pakai, Rute, Batch Kapal, Biaya Tambahan, dan Total Ongkir.

2. **Penanda Visual Status Invoice Paket (Package Invoicing Indicator)**:
   - Sistem memanfaatkan endpoint `/api/invoices/package-map` untuk memetakan paket mana saja yang sudah pernah dibuatkan invoice.
   - **Badge Hijau ("Sudah di-Invoice")**: Menandakan paket sudah masuk dalam invoice aktif, dilengkapi tombol nomor invoice terkait (misal `INV-20260919-0001`) yang dapat diklik langsung untuk preview/cetak.
   - **Badge Netral/Abu-abu ("Belum Ber-Invoice")**: Menandakan paket belum pernah ditagihkan via Invoice A4.
   - Filter cepat disediakan: *"Semua Status Invoice"*, *"Hanya Belum Ber-Invoice"*, atau *"Sudah Ber-Invoice"*.

3. **Checklist Seleksi Manual**:
   - Admin dapat mencentang satu per satu (*checkbox*) paket yang benar-benar milik customer tersebut dan valid untuk ditagihkan.
   - Tombol *"Pilih Semua yang Belum di-Invoice"* mempermudah seleksi instan tanpa memilih ulang paket yang sudah ber-invoice.
   - Tombol *"Cek Detail Paket"* memungkinkan modal dialog inspeksi rincian fisik, resi, nomor grup, dan histori paket.

4. **Kalkulasi & Form Penerbitan Invoice**:
   - Sistem otomatis menghitung subtotal ongkir dan biaya tambahan dari seluruh paket yang dicentang.
   - Input opsional:
     - **Diskon (Potongan Harga)** + Keterangan Alasan Diskon.
     - **Uang Muka / Down Payment (DP)** yang telah diserahkan pelanggan.
     - **Catatan Tambahan** (misal instruksi pembayaran bank atau syarat pengambilan).
   - Status invoice ditentukan otomatis:
     - `BELUM_LUNAS` (jika DP = Rp 0).
     - `DIBAYAR_SEBAGIAN` (jika DP > 0 dan DP < Total).
     - `LUNAS` (jika DP >= Total).

5. **Format Dokumen Cetak & Download PDF Snapshot A4**:
   - Desain tata letak standar ukuran A4 yang rapi dan elegan saat di-print (`window.print()` / popup browser print preview / *Save as PDF*).
   - Header resmi Jastip Anggun Jaya (kontak, rute Jakarta/Surabaya → Manokwari).
   - Informasi Invoice No, Tanggal Terbit, Jatuh Tempo, Kasir Pembuat, dan Identitas Pelanggan.
   - Tabel rincian paket bergaris dengan kolom: No, Resi / Identitas, Nama Barang, Layanan & Rute, Berat / Kubikasi, Ongkir Satuan, Biaya Tambahan, dan Subtotal.
   - Box rekapitulasi: Subtotal, Diskon, Total Akhir, Uang Muka (DP), dan **Sisa Tagihan**.
   - Kolom tanda tangan resmi pengirim dan penerima.
   - Fitur audit cetak: Mencatat log cetak (`print_logs`) dan jumlah cetak (`printCount`).

6. **Riwayat & Audit Invoice**:
   - Tab **Riwayat Invoice Terbit** menampilkan daftar seluruh invoice yang pernah diterbitkan.
   - Fitur pencarian invoice berdasarkan nomor invoice (`INV-...`) atau nama pelanggan serta filter status pembayaran.
   - Tombol **Cetak / PDF A4** (membuka kembali snapshot dokumen cetak A4 dan memanggil dialog cetak/PDF).
   - Tombol **Batalkan Invoice** (mengubah status menjadi `BATAL` dan melepaskan status penanda pada paket-paket terkait).

---

### 4.2 Modul Barcode & Detail Paket (Termasuk Biaya Tambahan Opsional)

Modul Barcode dan Detail Paket dirancang untuk menyajikan transparansi seluruh komponen data paket yang diinput oleh admin:

1. **Halaman Detail Barcode / Detail Grup Paket (`/admin/barcode-group` & `/owner/barcode-group`)**:
   - Menampilkan kartu detail lengkap setiap paket:
     - **No Resi**: Nomor resi kurir asal (misal `spxid069821994619`).
     - **No Paket**: Nomor urut paket per pemesan (`#1`, `#2`, dst).
     - **Tanggal**: Tanggal pencatatan paket fisik.
     - **Jenis Jastip**: Pesawat, Pelni, Hemat+, atau Kargo.
     - **Rute Pengiriman**: Rute asal ke tujuan (misal *Jakarta → Manokwari*).
     - **Nama Barang**: Identitas jenis isi barang (wajib/penting untuk Kargo dan Pelni).
     - **Berat Real**: Bobot timbangan fisik (kg).
     - **Berat Volume**: Hasil kalkulasi dimensi kubikasi ($P \times L \times T / \text{Divisor}$).
     - **Berat Digunakan**: Bobot pakai penentu ongkir ($\max(\text{Berat Real}, \text{Berat Volume})$).
     - **Dimensi (cm)**: Ukuran fisik Panjang $\times$ Lebar $\times$ Tinggi.
     - **Total Ongkir**: Ongkir murni berdasarkan berat dan tarif layanan.
     - **Nominal Biaya Tambahan (Rp)**: Biaya perlindungan/layanan ekstra (misal *Rp 15.000*, default *Rp 0* jika tidak ada biaya tambahan).
     - **Keterangan Biaya Tambahan**: Penjelasan jenis biaya tambahan (contoh: *Paking kayu, bubble wrap ekstra, karung berlapis*).
     - **Total Tagihan**: Penjumlahan $\text{Total Ongkir} + \text{Biaya Tambahan}$ dengan penyorotan warna hijau tegas saat biaya tambahan aktif.
   - **Header Ringkasan Grup**: Menampilkan akumulasi jumlah paket, total berat, total ongkir, total biaya tambahan, dan grand total.
   - **Dialog Edit Paket**: Menyediakan form penyuntingan lengkap termasuk box *Biaya Tambahan (Opsional)* untuk mengubah nominal dan alasan biaya tambahan secara langsung.

2. **Halaman Detail Paket Individual (`/admin/packages/:id` & `/owner/packages/:id`)**:
   - Menampilkan tabel atribut lengkap dengan pemisahan baris *Nominal Biaya Tambahan (Rp)*, *Keterangan Biaya Tambahan*, dan *Total Tagihan*.
   - Mode edit form mendukung pembaruan nominal serta keterangan biaya tambahan yang langsung tersimpan ke PostgreSQL melalui endpoint PATCH `/api/packages/:id`.
   - Modul Cetak Stiker Label Barcode/QR (`BarcodeDisplay`) menyertakan baris Biaya Tambahan bila bernilai $> 0$.

3. **Input Paket Baru & Import Excel**:
   - Form input (`/admin/packages/new`): Komponen khusus bergaris putus-putus amber dengan field *Nominal Biaya Tambahan (Rp)* dan *Keterangan Biaya Tambahan*.
   - Import file Excel (`/admin/packages/import`): Kolom *Biaya Tambahan* dan *Ket Biaya Tambahan* yang langsung terpetakan ke database.

---

### 4.3 Modul Verifikasi Paket Fisik (Gudang & Bongkar Muat)

1. **Scan Barcode & QR Code**:
   - Menggunakan webcam/kamera scanner (`Html5QrcodeScanner`), upload file foto barcode, atau input manual nomor barcode/resi.
   - Mendukung pencarian instan via:
     - Barcode individual (`JAJ-...`).
     - Barcode grup (`JAJ-GRUP-...`).
     - Nomor resi pengiriman kurir asal.
     - Nomor urut paket / nomor item.

2. **Validasi & Proteksi Kesalahan Scan**:
   - **Pencocokan Batch Kapal**: Jika paket yang di-scan berasal dari batch yang berbeda dengan batch yang sedang diverifikasi, sistem memberikan peringatan kesalahan.
   - **Pencocokan Nama Customer & Barcode Grup**: Pada mode verifikasi per penerima, scan barcode individu atau scan QR grup mencocokkan identitas pemilik paket. Jika paket di-scan milik customer lain (misal Customer Rina saat verifikasi tab Customer edu), sistem menolak dan menampilkan banner peringatan *"TIDAK COCOK: Paket ini milik Customer Rina, bukan edu"*.
   - **Pencegahan Double Verify**: Paket yang sudah diverifikasi ditandai visual centang hijau dan dicegah dari duplikasi verifikasi.

---

### 4.3 Navigasi & Paginasi Komponen Card / Tabel

Untuk menjaga performa rendering pada antarmuka dengan volume data ribuan item, komponen `<Pagination />` (`@/components/pagination.tsx`) diintegrasikan pada seluruh halaman kartu dan tabel:

1. **`/admin/invoices` & `/owner/invoices`**:
   - Paginasi daftar paket customer pada Tab 1 (*Pilih Paket & Buat Invoice*, 10 item/halaman).
   - Paginasi riwayat invoice terbit pada Tab 2 (*Riwayat Invoice Terbit*, 10 invoice/halaman).
2. **`/admin/barcode/group/:id` & `/owner/barcode/group/:id`**:
   - Paginasi daftar card paket dalam grup barcode multi-resi (10 paket/halaman).
3. **`/admin/riwayat-pembayaran/:batchId` & `/owner/riwayat-pembayaran/:batchId`**:
   - Paginasi card rekapitulasi pembayaran per customer pada batch pengiriman tertentu (10 customer/halaman).
4. **`/admin/shift` & `/owner/shift`**:
   - Paginasi tabel riwayat closing shift kasir terdahulu (10 shift/halaman).
5. **`/owner/finance/:service` (Finance Detail)**:
   - Paginasi tabel transaksi dan tabel paket per jenis layanan (10 transaksi/paket per halaman).
6. **`/admin/packages`, `/owner/packages`, `/admin/arsip`, `/owner/arsip`**:
   - Paginasi tabel inventaris paket dengan opsi ukuran per halaman fleksibel.

---

### 4.4 Modul Shift Kasir & Blind Closing

1. **Siklus Pembukaan Shift**:
   - Kasir memilih tipe shift (`PAGI` / `MALAM`) dan mengisi saldo kas awal laci (*opening balance*).
   - Tombol kasir (`Scan & Pembayaran`) hanya aktif jika kasir telah memiliki shift aktif berstatus `OPEN`.

2. **Pencatatan Keuangan Real-time (*System Cash*)**:
   - Sistem mengakumulasi kas fisik laci:
     $$\text{System Cash} = \text{Modal Awal} + \text{Kas Masuk Tunai} - \text{Kembalian} - \text{Pengeluaran Tunai} - \text{Refund VOID}$$
   - Pembayaran non-tunai (Transfer & QRIS) dicatat pada rekap omzet terpisah tanpa mencemari hitungan uang kertas laci.

3. **Penutupan Shift Buta (*Blind Closing*)**:
   - Kasir menutup shift tanpa diperlihatkan saldo akhir menurut komputer (*System Cash disembunyikan*).
   - Kasir wajib menghitung dan menginput jumlah lembar/koin fisik untuk setiap pecahan (Rp 100.000, Rp 50.000, Rp 20.000, Rp 10.000, Rp 5.000, Rp 2.000, Rp 1.000, Rp 500, Rp 200, Rp 100).
   - Sistem mengkalkulasi kas fisik aktual (*Actual Cash*).
   - Jika terdapat selisih ($\text{Selisih} \neq 0$), kasir wajib menyertakan keterangan alasan selisih sebelum finalisasi tutup shift.

---

### 4.5 Modul Transaksi Pembayaran, Piutang, dan VOID

1. **Multi-Metode Pembayaran**:
   - **Tunai**: Validasi nominal bayar $\ge$ total tagihan, penghitungan kembalian otomatis.
   - **Transfer Bank**: Pilihan rekening bank tujuan dan pencatatan nomor referensi transfer unik.
   - **QRIS**: Tampilan QR code pembayaran statis/dinamis dan pencatatan nomor RRN/referensi QRIS.
   - **Piutang**: Opsi cicilan uang muka sebagian (*BAYAR_SEBAGIAN*) atau tanpa bayar sama sekali (*BELUM_BAYAR*) dengan penetapan tanggal jatuh tempo dan penanggung jawab.

2. **Pelunasan Piutang Bertahap**:
   - Pencarian transaksi piutang berdasarkan nama customer.
   - Pembayaran angsuran bertahap dengan metode fleksibel (misal tahap 1 Tunai Rp 100.000, tahap 2 QRIS Rp 200.000) hingga sisa piutang mencapai Rp 0 (`LUNAS`).

3. **Alur Pengajuan & Approval VOID**:
   - **Pengajuan Admin**: Admin memilih transaksi, memilih kode alasan VOID, dan mengirim usulan status `MENUNGGU_APPROVAL`.
   - **Approval Owner**: Owner mengevaluasi pengajuan pada menu `/owner/voids`. Saat disetujui:
     - Status transaksi berubah menjadi `VOID`.
     - Dana tunai ditarik balik (*cash reversal*) dari shift aktif.
     - Seluruh paket terkait dikembalikan statusnya menjadi `BELUM_DIAMBIL` (*pending*) agar dapat diproses ulang.
   - **Proteksi Anti-Duplikasi**: Transaksi yang sudah berstatus `VOID` ditolak secara ketat dari pengajuan ulang.

---

## 5. Rumus Berat, Dimensi, & Perhitungan Ongkir

### 5.1 Rumus Berat Volume & Berat Pakai
$$\text{Berat Volume} = \frac{\text{Panjang (cm)} \times \text{Lebar (cm)} \times \text{Tinggi (cm)}}{\text{Divisor Layanan}}$$
$$\text{Berat Pakai} = \max(\text{Berat Aktual (kg)}, \text{Berat Volume (kg)})$$

**Divisor Layanan:**
- **Jastip Pesawat**: $5.000$
- **Jastip Hemat+**: $4.000$
- **Jastip Pelni**: $4.000$
- **Jastip Kargo**: $1.000.000$ (menghasilkan volume dalam satuan $\text{M}^3$)

### 5.2 Aturan Per Layanan

| Layanan | Rumus / Ketentuan Perhitungan Ongkir |
|---|---|
| **Jastip Pesawat** | Tarif acuan default: Rp77.000/kg.<br>Pembulatan berat kumulatif per customer per batch: $\le 0.2\text{ kg} \rightarrow 0.2\text{ kg}$; $\le 0.4\text{ kg} \rightarrow 0.4\text{ kg}$; $\le 0.5\text{ kg} \rightarrow 0.5\text{ kg}$; $> 0.5\text{ kg} \rightarrow \text{Berat Aktual}$. Ongkir didistribusikan proporsional ke paket-paketnya. Memiliki floor batas bawah pembulatan berat minimum 0.2 kg (setara ongkir minimum Rp15.400). |
| **Jastip Hemat+** | Tarif acuan default: Rp10.000/kg.<br>Satu paket tunggal berat $< 1\text{ kg}$ dikenakan minimum $1\text{ kg}$ (minimum ongkir Rp10.000). Lebih dari satu paket milik customer yang sama dalam batch dihitung berdasarkan total berat gabungan tanpa pembulatan ke atas per paket, dengan floor batas minimum total ongkir grup Rp10.000. |
| **Jastip Pelni** | Tarif tiering bertingkat berdasarkan total berat gabungan customer dalam batch yang sama:<br>Contoh Jakarta $\rightarrow$ Manokwari: $\le 10.1\text{ kg}: \text{Rp}20.000/\text{kg}$; $\le 20.1\text{ kg}: \text{Rp}19.000/\text{kg}$; $\le 40.1\text{ kg}: \text{Rp}18.000/\text{kg}$; $\le 80.1\text{ kg}: \text{Rp}17.000/\text{kg}$; $> 80.1\text{ kg}: \text{Rp}16.000/\text{kg}$.<br>Surabaya $\rightarrow$ Manokwari: $\le 10\text{ kg}: \text{Rp}18.000/\text{kg}$; $\le 20\text{ kg}: \text{Rp}17.000/\text{kg}$; $\le 40\text{ kg}: \text{Rp}16.000/\text{kg}$; $> 40\text{ kg}: \text{Rp}15.500/\text{kg}$.<br>**Ongkir Minimum Pelni**: Dikenakan minimum Rp20.000 per customer (ongkir total di bawah Rp20.000 otomatis dibulatkan menjadi Rp20.000). |
| **Jastip Kargo** | Dihitung berdasarkan kubikasi $\text{M}^3$ ($\frac{P \times L \times T}{1.000.000}$) atau berat aktual (Ton) dikalikan tarif kargo per $\text{M}^3$. **TIDAK ADA MINIMAL ONGKIR** (tidak ada batas minimum Rp70.000, Rp25.000, maupun angka batas minimum lainnya; total ongkir dihitung murni sesuai hasil perkalian volume kubikasi $\text{M}^3 \times \text{Tarif/M}^3$, misalnya $0{,}02142\text{ M}^3 \times \text{Rp } 1.900.000 = \text{Rp } 40.698$). Dilengkapi fitur **Hitung Ulang Batch Ini** (`POST /api/packages/recalculate-batch`) langsung pada halaman detail barcode batch (`/owner/barcode/batch/:id` & `/admin/barcode/batch/:id`) untuk memperbarui ongkir seluruh paket khusus pada batch tersebut dalam 1 klik tanpa mempengaruhi batch lain. |

### 5.3 Sistem & Spesifikasi Ongkir Minimum (Shipping Minimums)

Sistem menerapkan arsitektur ongkir minimum berbasis grup konsumen dan layanan dalam satu batch pengiriman:

1. **Matriks Ongkir Minimum Default Sistem**:
   | Jenis Jastip | Rute Pengiriman | Default Ongkir Minimum | Mekanisme & Keterangan |
   |---|---|---|---|
   | **Jastip Pelni** | Jakarta $\rightarrow$ Manokwari | **Rp 20.000** | Floor otomatis sistem & form input. Paket dengan total ongkir $< \text{Rp } 20.000$ (misal 0.5 kg $\times$ Rp 20.000 = Rp 10.000) otomatis dibulatkan menjadi Rp 20.000. |
   | **Jastip Pelni** | Surabaya $\rightarrow$ Manokwari | **Rp 18.000 / Rp 20.000** | Terdaftar pada konfigurasi minimum dengan batas dasar Rp 18.000 (Surabaya) dan floor rekalkulasi aktif Rp 20.000. |
   | **Jastip Hemat+** | Surabaya $\rightarrow$ Manokwari | **Rp 10.000** | Berlaku aturan minimum 1 kg (1 kg $\times$ Rp 10.000 = Rp 10.000) untuk paket tunggal, serta batas bawah total ongkir customer Rp 10.000. |
   | **Jastip Kargo** | Jakarta/Surabaya $\rightarrow$ Manokwari | **Tidak Ada Minimal (Rp 0)** | Jastip Kargo **tidak memberlakukan tarif minimum sama sekali**. Total ongkir berapapun hasilnya (misal Rp 40.698 atau Rp 7.000) dihitung murni dari hasil volume M³ / berat Ton dikalikan tarif per M³, tanpa pembulatan minimum. |
   | **Jastip Pesawat** | Jakarta $\rightarrow$ Manokwari | **Rp 15.400** *(Weight Floor)* | Menggunakan floor pembulatan berat efektif terkecil $0.20\text{ kg} \times \text{Rp } 77.000 = \text{Rp } 15.400$. |

2. **Aturan Berlaku Per Grup Konsumen (Customer-Level Minimum)**:
   - Ongkir minimum diperlakukan sebagai batas **total ongkir per customer** dalam batch yang sama, bukan membebani setiap paket secara terpisah jika customer mengirim banyak paket kecil.
   - **1 Paket Tunggal**: Jika total ongkir paket di bawah batas minimum, ongkir paket tersebut langsung dinaikkan ke nilai minimum.
   - **Multi-Paket (Lebih dari 1 Paket)**: Jika penjumlahan ongkir seluruh paket customer dalam batch tersebut masih di bawah batas minimum, selisih menuju nilai minimum didistribusikan secara proporsional ke masing-masing paket berdasarkan bobot berat pakai (`usedWeight` / `pkgEffectiveWeights`), sehingga penjumlahan seluruh `totalShipping` paket tepat setara dengan nominal minimum.
   - **Pengecualian Kargo**: Jastip Kargo dikecualikan dari segala mekanisme redistribusi atau batas minimum, memastikan tarif murni per meter kubik / ton.

3. **Manajemen Terintegrasi oleh Owner (`/owner/tarif`)**:
   - Menu *Pengaturan Tarif* Owner menyajikan kartu terintegrasi untuk masing-masing jenis jastip (**Jastip Pesawat**, **Jastip Hemat+**, **Jastip Kargo**, dan **Jastip Pelni**).
   - Setiap kartu layanan menampilkan secara berdampingan:
     1. **Tarif Aktif Saat Ini**: Badge indikator visual yang menampilkan tarif dasar yang sedang digunakan di sistem (misal `Tarif Aktif Saat Ini: Rp 77.000 / kg`, `Rp 10.000 / kg`, `Rp 7.000 / M³`, atau tiering Pelni).
     2. **Input Tarif Baru**: Form input langsung untuk mengubah tarif dasar per kg / per M³ / tiering Pelni.
     3. **Pembulatan Otomatis Minimal**: Komponen kontrol pembulatan otomatis yang terintegrasi di dalam setiap kartu layanan, dilengkapi dengan:
        - **Toggle Sakelar (AKTIF / NONAKTIF)**: Mengaktifkan atau mematikan pembulatan otomatis minimal untuk jenis jastip tersebut secara mandiri.
        - **Input Nominal Pembulatan Otomatis**: Form input untuk menentukan batas nominal minimal baru (misal diset ke **Rp 10.000**).
        - **Keterangan Skenario**: Penjelasan contoh kasus (seperti paket Anton dengan harga kalkulasi Rp 5.000 yang otomatis dibulatkan ke Rp 10.000 jika pembulatan aktif).
   - **Simpan Sekaligus**: Tombol *"Simpan Perubahan Tarif & Pembulatan Otomatis"* menyimpan tarif utama dan aturan pembulatan secara simultan dalam satu transaksi dengan audit log lengkap di `tarif_history`.

---

## 6. Struktur Database (Drizzle ORM)

| Nama Tabel | Deskripsi & Kolom Utama |
|---|---|
| **`users`** | Akun pengguna (`id`, `name`, `phone`, `password` (SHA-256), `role` [owner/admin], `isActive`, `createdAt`). |
| **`sessions`** | Sesi login token (`id`, `userId`, `token`, `expiresAt`, `createdAt`). |
| **`batches`** | Data batch pengiriman kapal (`id`, `namaKapal`, `etd`, `periodeClosingMulai`, `periodeClosingSelesai`, `kotaAsal`, `tujuan`, `statusBatch` [OPEN/CLOSED/ARSIP/HAPUS], `createdBy`). |
| **`packages`** | Data paket fisik (`id`, `barcode`, `resiNumber`, `packageNumber`, `customerName`, `customerPhone`, `itemName`, `serviceType`, `deliveryRoute`, `realWeight`, `length`, `width`, `height`, `volumeWeight`, `usedWeight`, `packagingType`, `totalShipping`, `additionalFee`, `additionalFeeReason`, `statusVerifikasi`, `statusPengambilan`, `statusPembayaran`, `batchId`, `adminId`). |
| **`transactions`** | Transaksi kasir (`id`, `transactionNo`, `customerName`, `packageIds` (array), `subtotal`, `additionalFee`, `discount`, `total`, `paymentStatus` [LUNAS/BAYAR_SEBAGIAN/BELUM_BAYAR], `transactionStatus` [AKTIF/VOID/MENUNGGU_APPROVAL], `sisaPiutang`, `shiftSessionId`, `cashierId`, `idempotencyKey`). |
| **`payments`** | Riwayat mutasi pembayaran kasir (`id`, `transactionId`, `paymentType` [PELUNASAN_LANGSUNG/PELUNASAN_PIUTANG], `paymentMethod` [tunai/transfer/qris/piutang], `totalAmount`, `paidAmount`, `changeAmount`, `shiftSessionId`, `adminId`). |
| **`invoices`** | Dokumen tagihan Invoice A4 (`id`, `invoiceNo`, `customerName`, `customerPhone`, `subtotal`, `discount`, `discountReason`, `downPayment`, `total`, `balance`, `status` [BELUM_LUNAS/DIBAYAR_SEBAGIAN/LUNAS/BATAL], `notes`, `createdById`, `createdByName`, `issuedAt`, `dueDate`, `printCount`, `lastPrintedAt`, `history`). |
| **`invoice_items`** | Rincian baris paket dalam invoice (`id`, `invoiceId`, `packageId`, `resiNumber`, `packageNumber`, `itemName`, `serviceType`, `deliveryRoute`, `usedWeight`, `shippingRate`, `additionalFee`, `additionalFeeReason`, `price`, `itemDate`). |
| **`print_logs`** | Log audit cetak dokumen (`id`, `documentType` [INVOICE/RECEIPT/LABEL], `documentId`, `printedById`, `printedByName`, `printedAt`, `reason`). |
| **`shift_sessions`** | Sesi shift kerja kasir (`id`, `adminId`, `shiftType` [PAGI/MALAM], `terminalId`, `openingBalance`, `status` [AKTIF/CLOSED], `actualStart`, `actualEnd`). |
| **`shift_closings`** | Rekapitulasi penutupan shift laci (`id`, `shiftSessionId`, `systemCash`, `actualCash`, `selisih`, `alasanSelisih`, `closedAt`, `approvedBy`). |
| **`void_requests`** | Log permohonan pembatalan transaksi (`id`, `transactionId`, `reasonCode`, `notes`, `requestedBy`, `reversalAmount`, `packageIdsReturned`, `statusBefore`, `statusAfter` [MENUNGGU_APPROVAL/VOID/DITOLAK], `approvedBy`, `approvedAt`). |
| **`pengeluaran`** | Pengeluaran kas operasional (`id`, `tanggal`, `nominal`, `kategori`, `catatan`, `metodePembayaran` [cash/transfer/lainnya], `dicatatOleh`, `namaPencatat`, `createdAt`). |
| **`service_types`** | Master jenis layanan jastip (`id`, `name`, `code`, `divisor`, `defaultRate`). |
| **`settings`** | Konfigurasi tarif umum & tiering Pelni dalam format JSON key-value. |
| **`settings_shipping_minimum`** | Pengaturan harga ongkir minimum per layanan dan rute (`id`, `serviceId`, `originCity`, `enabled` (boolean), `minimumAmount` (numeric), `updatedBy`, `createdAt`, `updatedAt`). |
| **`tarif_history`** | Riwayat audit perubahan tarif dan ongkir minimum oleh Owner (`id`, `jenisJastip`, `tarifLama`, `tarifBaru`, `alasan`, `diubahOleh`, `namaUbah`, `createdAt`). |

---

## 7. Prosedur Pengujian & Verifikasi Kualitas

Sistem dilengkapi suite pengujian otomatis untuk memastikan integritas logika bisnis dan fungsionalitas UI/API:

1. **Linting & Type Safety**:
   ```bash
   npm run lint
   npm run typecheck
   ```
   *Status:* **100% LULUS** (Zero type / syntax errors).

2. **Pengujian Komprehensif Seluruh Modul & Fitur Sistem (26 Poin Uji)**:
   ```bash
   npx --prefix scripts tsx scripts/src/verify-all-system-features.ts
   ```
   *Cakupan:*
   - [x] **System Bootstrap & Health**: Endpoint `/healthz` merespons HTTP 200 `status: ok`.
   - [x] **Autentikasi & Profile**: Login Owner & Admin, token session, dan endpoint `/api/auth/me`.
   - [x] **Batch Pengiriman**: Query list batch dan pembuatan batch baru oleh Owner.
   - [x] **Input Paket**: Satuan Pesawat, Pelni (dengan proteksi paking kayu), Kargo (murni M³ tanpa batas minimal: 34×30×21 cm $\rightarrow$ Rp40.698), dan Bulk Import Multi-Resi.
   - [x] **Label Barcode**: Generate otomatis kode barcode `JAJ-...` pada seluruh paket.
   - [x] **Verifikasi Paket**: Scan fisik dan update status verifikasi paket di gudang.
   - [x] **Shift Kasir**: Deteksi status shift `AKTIF` dan pembukaan shift dengan modal awal.
   - [x] **Transaksi Kasir**: Transaksi tunai lunas, perhitungan kembalian laci kas, dan penerbitan format struk termal.
   - [x] **Invoice A4**: Pemetaan status `package-map`, penerbitan Invoice A4 resmi dengan DP/Diskon, dan render cetak snapshot.
   - [x] **Transaksi & VOID**: Pengajuan permohonan VOID oleh kasir dan persetujuan approval + *cash reversal* oleh Owner.
   - [x] **Pengeluaran Kas**: Pencatatan beban harian operasional dan rekapitulasi riwayat kas keluar.
   - [x] **Pengaturan Tarif**: Query daftar pengaturan tarif aktif dan audit histori perubahan.
   - [x] **Manajemen User**: Pengelolaan akun staf/admin oleh Owner.
   - [x] **Laporan & Keuangan**: Ringkasan laporan keuangan dan arus kas.
   *Status:* **26 / 26 PENGUJIAN LULUS (100%)**.

3. **Pengujian Kalkulasi Jastip Kargo (Tanpa Batas Minimum)**:
   ```bash
   npx --prefix scripts tsx scripts/src/test-kargo-calc.ts
   ```
   *Cakupan:*
   - Kasus 1 (Rak Sepatu 34×30×21 cm): $0{,}02142\text{ M}^3 \times \text{Rp } 1.900.000 = \text{Rp } 40.698$ (Bukan Rp70.000 atau Rp25.000).
   - Kasus 2 (Kereta Bayi 66×64×13 cm): $0{,}054912\text{ M}^3 \times \text{Rp } 1.900.000 = \text{Rp } 104.333$.
   - Kasus 3 (Kasur 200×90×26 cm): $0{,}468\text{ M}^3 \times \text{Rp } 1.500.000 = \text{Rp } 702.000$.
   *Status:* **100% LULUS**.

4. **Pengujian Biaya Tambahan (Opsional) di Detail Paket & Barcode**:
   ```bash
   npx --prefix scripts tsx scripts/src/test-additional-fee-detail.ts
   ```
   *Status:* **100% LULUS**.

5. **Pengujian Regresi Penuh End-to-End (15 Langkah)**:
   ```bash
   npx --prefix scripts tsx scripts/src/verify-full-regression-e2e.ts
   ```
   *Status:* **15 / 15 LANGKAH REGRESI LULUS 100%**.

6. **Pengujian Batas Minimal Semua Jenis Jastip & Hitung Ulang Per-Batch**:
   - [x] Pengaturan Batas Minimal Jastip Pesawat, Pelni, Hemat+, dan Kargo (Jakarta & Surabaya).
   - [x] Sinkronisasi toggle ON/OFF dan nominal custom batas minimal di database & audit history (`tarif_history`).
   - [x] Eksekusi Hitung Ulang Khusus Per-Batch (`POST /api/packages/recalculate-batch`) langsung di halaman `/owner/barcode/batch/:id`.
   - [x] Verifikasi API & UI Build Linter: **10 / 10 PENGUJIAN LULUS (100%)**.

---

## 8. Panduan Menjalankan Aplikasi (Deployment & Development)

```bash
# 1. Menjalankan server pengembangan (Express API + Vite Frontend di Port 3000)
npm run dev

# 2. Build produksi
npm run build

# 3. Menjalankan server produksi
npm start

# 4. Sinkronisasi skema database Drizzle
npm run db:push

# 5. Inisialisasi data demo awal (Seed Demo Users & Data)
npm run db:seed
```
