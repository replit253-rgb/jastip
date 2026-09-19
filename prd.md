# PRD — Jastip Anggun Jaya

> **Status dokumen:** As-is / reverse-engineered dan sinkronisasi penuh dari source code proyek aktif  
> **Tanggal pembaruan:** 2026-09-19  
> **Tujuan dokumen:** Mendeskripsikan arsitektur, halaman, navigasi, role, fitur operasional, sistem Invoice A4, verifikasi scan, manajemen shift kasir, keuangan & VOID, database schema Drizzle ORM, rumus tarif, dan panduan testing yang benar-benar ada dan berjalan di sistem saat ini.

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
2. **Monitor Paket** (`/owner/packages`) — Pemantauan seluruh paket dari semua admin.
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

### 4.1 Modul Invoice A4 (Pencarian, Pemilihan Manual, & Penanda Status)

Modul Invoice A4 (`/admin/invoices` & `/owner/invoices`) dirancang untuk memenuhi kebutuhan pembuatan tagihan resmi multi-paket per customer:

1. **Alur Pencarian Customer Manual**:
   - Admin memasukkan nama customer (contoh: *"Andi"*) pada kotak pencarian nama.
   - Sistem secara dinamis mencari dan menampilkan seluruh daftar paket yang terdaftar atas nama pelanggan tersebut dari database.
   - Pada setiap baris paket ditampilkan informasi lengkap: No. Resi, No. Paket, Nama Barang, Layanan (Pesawat/Pelni/Hemat+/Kargo), Berat Pakai, Rute, Batch Kapal, dan Total Ongkir.

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
   - Sistem otomatis menghitung subtotal ongkir dari seluruh paket yang dicentang.
   - Input opsional:
     - **Diskon (Potongan Harga)** + Keterangan Alasan Diskon.
     - **Uang Muka / Down Payment (DP)** yang telah diserahkan pelanggan.
     - **Catatan Tambahan** (misal instruksi pembayaran bank atau syarat pengambilan).
   - Status invoice ditentukan otomatis:
     - `BELUM_LUNAS` (jika DP = Rp 0).
     - `DIBAYAR_SEBAGIAN` (jika DP > 0 dan DP < Total).
     - `LUNAS` (jika DP >= Total).

5. **Format Dokumen Cetak Snapshot A4**:
   - Desain tata letak standar ukuran A4 yang rapi dan elegan saat di-print (`window.print` / popup print dialog).
   - Header resmi Jastip Anggun Jaya (kontak, rute Jakarta/Surabaya → Manokwari).
   - Informasi Invoice No, Tanggal Terbit, Jatuh Tempo, Kasir Pembuat, dan Identitas Pelanggan.
   - Tabel rincian paket bergaris dengan kolom: No, Resi / Identitas, Nama Barang, Layanan & Rute, Berat / Kubikasi, Ongkir Satuan, Biaya Tambahan, dan Subtotal.
   - Box rekapitulasi: Subtotal, Diskon, Total Akhir, Uang Muka (DP), dan **Sisa Tagihan**.
   - Kolom tanda tangan resmi pengirim dan penerima.
   - Fitur audit cetak: Mencatat log cetak (`print_logs`) dan jumlah cetak (`printCount`).

6. **Riwayat & Audit Invoice**:
   - Tab **Riwayat Invoice Terbit** menampilkan daftar seluruh invoice yang pernah diterbitkan.
   - Fitur pencarian invoice berdasarkan nomor invoice (`INV-...`) atau nama pelanggan serta filter status pembayaran.
   - Tombol **Cetak / PDF A4** (membuka kembali snapshot dokumen cetak A4).
   - Tombol **Batalkan Invoice** (mengubah status menjadi `BATAL` dan melepaskan status penanda pada paket-paket terkait).

---

### 4.2 Modul Verifikasi Paket Fisik (Gudang & Bongkar Muat)

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
| **Jastip Pesawat** | Tarif acuan default: Rp77.000/kg.<br>Pembulatan berat kumulatif per customer per batch: $\le 0.2\text{ kg} \rightarrow 0.2\text{ kg}$; $\le 0.4\text{ kg} \rightarrow 0.4\text{ kg}$; $\le 0.5\text{ kg} \rightarrow 0.5\text{ kg}$; $> 0.5\text{ kg} \rightarrow \text{Berat Aktual}$. Ongkir didistribusikan proporsional ke paket-paketnya. |
| **Jastip Hemat+** | Tarif acuan default: Rp10.000/kg.<br>Satu paket tunggal berat $< 1\text{ kg}$ dikenakan minimum $1\text{ kg}$. Lebih dari satu paket milik customer yang sama dalam batch dihitung berdasarkan total berat gabungan tanpa pembulatan ke atas per paket. |
| **Jastip Pelni** | Tarif tiering berdasarkan total berat gabungan customer dalam batch yang sama:<br>Contoh Jakarta $\rightarrow$ Manokwari: $\le 10.1\text{ kg}: \text{Rp}20.000/\text{kg}$; $\le 20.1\text{ kg}: \text{Rp}19.000/\text{kg}$; $\le 40.1\text{ kg}: \text{Rp}18.000/\text{kg}$; $\le 80.1\text{ kg}: \text{Rp}17.000/\text{kg}$; $> 80.1\text{ kg}: \text{Rp}16.000/\text{kg}$. |
| **Jastip Kargo** | Dihitung berdasarkan kubikasi $\text{M}^3$ ($\frac{P \times L \times T}{1.000.000}$) dikalikan tarif kargo khusus per rute atau tarif kesepakatan manual per paket. |

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
| **`shift_sessions`** | Sesi shift kerja kasir (`id`, `adminId`, `shiftType` [PAGI/MALAM], `terminalId`, `openingBalance`, `status` [OPEN/CLOSED], `actualStart`, `actualEnd`). |
| **`shift_closings`** | Rekapitulasi penutupan shift laci (`id`, `shiftSessionId`, `systemCash`, `actualCash`, `selisih`, `alasanSelisih`, `closedAt`, `approvedBy`). |
| **`void_requests`** | Log permohonan pembatalan transaksi (`id`, `transactionId`, `reasonCode`, `notes`, `requestedBy`, `reversalAmount`, `packageIdsReturned`, `statusBefore`, `statusAfter` [MENUNGGU_APPROVAL/VOID/DITOLAK], `approvedBy`, `approvedAt`). |
| **`pengeluaran`** | Pengeluaran kas operasional (`id`, `nominal`, `kategori`, `keterangan`, `metodePembayaran` [cash/transfer/lainnya], `adminId`, `createdAt`). |
| **`service_types`** | Master jenis layanan jastip (`id`, `name`, `code`, `divisor`, `defaultRate`). |
| **`settings`** | Konfigurasi tarif umum & tiering Pelni dalam format JSON key-value. |
| **`tarif_history`** | Riwayat audit perubahan tarif oleh Owner (`id`, `serviceType`, `oldRate`, `newRate`, `changedBy`, `createdAt`). |

---

## 7. Prosedur Pengujian & Verifikasi Kualitas

Sistem dilengkapi suite pengujian otomatis untuk memastikan integritas logika bisnis:

1. **Linting & Type Safety**:
   ```bash
   npm run lint
   npm run typecheck
   ```

2. **Pengujian Regresi End-to-End (15 Langkah Kritis)**:
   ```bash
   npx tsx scripts/src/verify-full-regression-e2e.ts
   ```
   *Cakupan:* Bootstrap DB, Login Multi-role, Transaksi Tunai/Transfer/QRIS/Piutang, Pelunasan Piutang 2 Tahap, VOID & Reversal Saldo Kas, Proteksi Anti-Repeat VOID, Struk Termal, Invariansi Snapshot Tarif, Blind Closing Shift, Rekonsiliasi Excel vs DB, dan Proteksi Role Admin (HTTP 403).

3. **Pengujian Alur Invoice A4, Package Map, & Print**:
   ```bash
   ./node_modules/.bin/tsx scripts/src/test-invoices-flow.ts
   ```
   *Cakupan:* Query `/api/invoices/package-map`, Penerbitan Invoice A4 dari paket terpilih, query detail items, dan pencatatan audit log print snapshot.

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
