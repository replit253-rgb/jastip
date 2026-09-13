# Panduan Lengkap Penggunaan Sistem Jastip Anggun Jaya

Selamat datang di Panduan Penggunaan Sistem **Jastip Anggun Jaya**. Dokumen ini dirancang khusus untuk mempermudah **Owner** dan **Admin (Kasir)** dalam memahami fungsi setiap halaman, menu, fitur, serta alur kerja operasional (SOP) harian secara rinci dan mudah dipahami.

---

## 📌 DAFTAR ISI
1. [Pendahuluan & Alur Kerja Utama](#1-pendahuluan--alur-kerja-utama)
2. [Akses Masuk & Kredensial](#2-akses-masuk--kredensial)
3. [Panduan Menu & Fitur - Role OWNER](#3-panduan-menu--fitur---role-owner)
4. [Panduan Menu & Fitur - Role ADMIN (KASIR)](#4-panduan-menu--fitur---role-admin-kasir)
5. [Standar Operasional Prosedur (SOP) Harian](#5-standar-operasional-prosedur-sop-harian)
6. [Panduan Cetak Struk & Label](#6-panduan-cetak-struk--label)

---

## 1. PENDAHULUAN & ALUR KERJA UTAMA

Sistem **Jastip Anggun Jaya** adalah aplikasi manajemen kargo jasa titip (jastip) terintegrasi yang menggabungkan pencatatan paket, verifikasi pengiriman ekspedisi, kasir POS (Point of Sales) multi-metode pembayaran, manajemen laci kas (*cash drawer/shift*), hingga audit keuangan langsung oleh Owner.

### **Alur Logistik & Keuangan Utama:**
```text
[Kasir Buka Shift] ──> [Terima Paket / Input] ──> [Cetak Label Barcode]
                                                         │
[Pelunasan Kasir]  <──  [Verifikasi Tiba]   <──  [Masuk Batch Kirim]
       │
[Kasir Tutup Shift] ──> [Owner Audit & Cetak Struk Closing]
```

---

## 2. AKSES MASUK & KREDENSIAL

Sistem ini diakses melalui peramban web (browser). Untuk masuk ke sistem, gunakan nomor telepon dan kata sandi yang telah terdaftar di database.

### **Kredensial Akun Utama:**
*   **Role Owner (Pemilik)**:
    *   **No. Telepon**: `081200000000` *(Dapat disesuaikan melalui file `.env` di server)*
    *   **Password**: `owner123` *(Dapat disesuaikan melalui file `.env` di server)*
*   **Role Admin (Kasir Utama)**:
    *   **No. Telepon**: `081200000001`
    *   **Password**: `admin123`

---

## 3. PANDUAN MENU & FITUR - ROLE OWNER

Akun **Owner** memiliki hak akses penuh (*Super-Administrator*) untuk memantau bisnis, mengaudit kas masuk/keluar kasir, memberikan persetujuan pembatalan transaksi (VOID), mengatur tarif ekspedisi, serta mengelola pengguna sistem.

Berikut adalah fungsionalitas setiap menu pada role Owner:

### **A. Kategori OWNER (Utama)**

#### **1. Dashboard**
*   **Fungsi**: Menampilkan ringkasan eksekutif performa bisnis secara visual dan instan.
*   **Fitur Utama**:
    *   **Metrik Utama**: Total paket masuk (Kg), total transaksi terkumpul, piutang aktif yang belum dibayar, serta pengeluaran operasional terdaftar.
    *   **Grafik Pendapatan**: Tren keuangan harian/bulanan interaktif.
    *   **Status Kas Laci saat Ini**: Menampilkan saldo kasir aktif secara transparan.

#### **2. Monitor Paket**
*   **Fungsi**: Database pusat untuk memantau seluruh paket kargo tanpa batas ruang dan waktu.
*   **Fitur Utama**:
    *   Pencarian paket berdasarkan nomor resi, nama pengirim/penerima, atau barcode.
    *   Filter status paket (*pending, received, verified, delivered, void*).
    *   Melihat detail riwayat log perjalanan paket (kapan diinput, kapan masuk kapal, kapan tiba di gudang tujuan).

#### **3. Data Admin**
*   **Fungsi**: Mengawasi kinerja dan aktivitas seluruh kasir (Admin).
*   **Fitur Utama**:
    *   Melihat daftar nama kasir yang sedang bertugas aktif.
    *   Melihat total transaksi yang diproses oleh masing-masing kasir secara individu.

#### **4. Keuangan**
*   **Fungsi**: Pencatatan mutasi kas masuk dari seluruh jenis transaksi pembayaran paket.
*   **Fitur Utama**:
    *   **Riwayat Pembayaran**: Log pembayaran tunai, transfer bank, QRIS, dan cicilan pelunasan piutang.
    *   Melihat detail transaksi lengkap beserta metode pembayaran yang digunakan pelanggan.

#### **5. Invoice A4**
*   **Fungsi**: Membuat, melihat, dan mencetak Invoice/Faktur resmi berukuran A4 untuk pelanggan korporat atau pengiriman partai besar.
*   **Fitur Utama**:
    *   Mencetak invoice berformat A4 profesional langsung ke PDF.
    *   Pelacakan status invoice (*Lunas* atau *Belum Bayar*).

#### **6. Laporan VOID**
*   **Fungsi**: Panel kontrol otorisasi pengajuan pembatalan transaksi dari kasir.
*   **Fitur Utama**:
    *   **Approve (Setujui)**: Menyetujui pembatalan transaksi. Uang kas laci otomatis direversal (dikurangi kembali) secara aman dan status paket dikembalikan menjadi belum bayar.
    *   **Reject (Tolak)**: Menolak pembatalan transaksi, menjaga kas laci tetap sesuai.

#### **7. Pengeluaran Harian**
*   **Fungsi**: Mencatat beban pengeluaran operasional (misal: beli bensin, lakban, bayar listrik gudang) langsung dari laci kas.
*   **Fitur Utama**:
    *   Input nominal pengeluaran, kategori beban, dan catatan detail tujuan pengeluaran.
    *   Pengeluaran tunai otomatis memotong hitungan saldo kas sistem kasir pada shift aktif.

#### **8. Shift & Closing (Fitur Unggulan Baru 💳)**
*   **Fungsi**: Pusat audit harian untuk mengawasi kejujuran kasir dan akurasi uang fisik di laci kas.
*   **Fitur Utama**:
    *   **Daftar Riwayat Shift**: Menampilkan rekap shift pagi/malam dari semua kasir.
    *   **Audit Selisih Kas**: Menampilkan nominal Kas Sistem vs Kas Aktual (Fisik) yang dihitung kasir secara transparan beserta alasan jika terdapat selisih.
    *   **Cetak Struk Rekonsiliasi**: Tombol **"Cetak"** untuk mencetak struk ringkasan closing shift format struk POS untuk arsip kertas fisik Owner.

#### **9. Laporan**
*   **Fungsi**: Generator laporan bisnis berkala.
*   **Fitur Utama**:
    *   Filter Laporan: **Harian**, **Bulanan**, atau **Tahunan**.
    *   **Export Excel**: Mengunduh data operasional lengkap ke format Microsoft Excel.
    *   **Export PDF / Cetak**: Menghasilkan dokumen laporan resmi siap cetak.

#### **10. Pengaturan Tarif**
*   **Fungsi**: Konfigurasi harga jastip per kilogram atau per volume (kubikasi) berdasarkan kota asal dan kota tujuan.
*   **Fitur Utama**:
    *   Menambah, mengedit, atau menghapus rute pengiriman (misal: Surabaya → Manokwari).
    *   Mengatur tarif dasar per Kg untuk kargo udara/laut dan jastip retail.

#### **11. Pengaturan Kas**
*   **Fungsi**: Mengatur batas toleransi selisih kas laci dan metode pencetakan struk.
*   **Fitur Utama**:
    *   **Toleransi Selisih Kas**: Batas maksimal selisih uang kasir (misal: Rp 10.000) yang boleh diselesaikan tanpa memerlukan persetujuan manual Owner.
    *   Mengatur mode cetak struk (*Otomatis*, *Konfirmasi*, atau *Mati*).

#### **12. Manajemen User**
*   **Fungsi**: Pendaftaran pengguna sistem baru.
*   **Fitur Utama**:
    *   Mendaftarkan akun Admin (Kasir) baru dengan nomor telepon terverifikasi.
    *   Mengaktifkan atau menonaktifkan sementara akun kasir demi keamanan data gudang.

---

## 4. PANDUAN MENU & FITUR - ROLE ADMIN (KASIR)

Akun **Admin** difokuskan pada operasional harian gudang, pencatatan paket masuk, logistik batch pengiriman, pelunasan pembayaran pelanggan (POS), serta penyerahan barang.

### **A. Kategori JASTIP (Logistik & Kasir)**

#### **1. Shift Kasir (Wajib Pertama Kali 🔑)**
*   **Fungsi**: Mengunci aktivitas kasir sebelum laci kas resmi dibuka.
*   **Fitur Utama**:
    *   **Buka Shift**: Memilih tipe shift (Pagi/Malam) dan menginput modal kas awal (*opening balance*) di laci.
    *   **Tutup Shift (Blind Closing)**: Sebelum pulang, kasir wajib melakukan input jumlah lembaran uang fisik aktual di laci tanpa mengetahui nominal kas di komputer (menjaga akurasi dan kejujuran kasir).

#### **2. Scan & Pembayaran (Kasir POS 📷)**
*   **Fungsi**: Kasir pembayaran saat paket akan diambil oleh pelanggan.
*   **Fitur Utama**:
    *   **Scan Kamera**: Membuka kamera HP/Laptop untuk scan barcode paket secara cepat berturut-turut tanpa henti.
    *   **Upload Gambar**: Membuka galeri foto untuk memindai foto barcode paket.
    *   **Kalkulator Kasir**: Otomatis menghitung akumulasi total berat dan harga pengiriman dari seluruh paket yang di-scan.
    *   **Input Diskon**: Menambahkan potongan harga opsional beserta alasannya.
    *   **Proses Bayar**: Membuka dialog pembayaran interaktif multi-metode (Tunai, Transfer Bank, QRIS Dinamis di Layar, atau Piutang Jatuh Tempo).

#### **3. Input Paket**
*   **Fungsi**: Formulir pencatatan paket baru yang diterima di gudang asal.
*   **Fitur Utama**:
    *   Mencatat detail nama pengirim, penerima, nomor telepon, rute pengiriman, dan nama barang.
    *   **Kalkulator Dimensi**: Menginput Berat Real (Kg) atau Dimensi (Panjang x Lebar x Tinggi) untuk menghitung berat volume otomatis sesuai standar ekspedisi kargo.
    *   Menentukan tarif ongkos kirim otomatis berdasarkan tarif rute yang diatur Owner.

#### **4. Import Excel**
*   **Fungsi**: Mencatat ratusan paket kargo sekaligus dalam satu klik menggunakan template Excel.
*   **Fitur Utama**:
    *   Mengunduh template Excel Jastip resmi.
    *   Mengunggah file Excel isi paket untuk dimasukkan massal ke database sistem.

#### **5. Label Barcode**
*   **Fungsi**: Membuat dan mencetak label stiker barcode pengiriman yang ditempel pada fisik paket.
*   **Fitur Utama**:
    *   Pencetakan label barcode tunggal atau massal dalam ukuran kertas printer label stiker thermal standard.

#### **6. Arsip Sudah Diambil**
*   **Fungsi**: Tempat penyimpanan data paket-paket yang sudah lunas dibayar dan sukses diserahkan kepada pelanggan.

#### **7. Verifikasi Paket**
*   **Fungsi**: Digunakan saat kapal/pesawat pengangkut tiba di gudang kota tujuan.
*   **Fitur Utama**:
    *   Memilih batch pengiriman, lalu melakukan scan barcode fisik barang satu per satu untuk memastikan barang benar-benar tiba dengan selamat di tujuan (pencocokan manifes logistik).

#### **8. Riwayat Pembayaran**
*   **Fungsi**: Melacak kembali transaksi kasir POS yang telah diproses.
*   **Fitur Utama**:
    *   Mencetak ulang (*reprint*) struk transaksi pelanggan.
    *   Mengajukan permohonan **VOID (Pembatalan Transaksi)** jika kasir melakukan salah input nominal pembayaran barang.

#### **9. Transaksi & VOID**
*   **Fungsi**: Memantau daftar transaksi kasir harian dan melihat status persetujuan pembatalan VOID dari Owner.

---

## 5. STANDAR OPERASIONAL PROSEDUR (SOP) HARIAN

Untuk menjaga kerapian administrasi keuangan dan logistik, sangat disarankan menerapkan SOP harian berikut:

### **🌅 SOP PAGI (Membuka Hari)**
1.  Kasir masuk ke sistem, lalu buka menu **Shift Kasir**.
2.  Lakukan serah terima laci kas, hitung modal awal laci, pilih **Shift Pagi**, masukkan nominal modal awal, lalu klik **"Buka Shift"**.
3.  Menu **"Scan & Pembayaran"** kini aktif dan kasir siap melayani transaksi.

### **📦 SOP SIANG (Proses Penerimaan & Logistik)**
1.  **Paket Datang**: Kasir menginput paket lewat menu **Input Paket** atau **Import Excel**.
2.  **Cetak Label**: Cetak label stiker melalui menu **Label Barcode** dan tempelkan ke fisik kardus/karung paket.
3.  **Pengiriman**: Masukkan paket-paket tersebut ke dalam **Batch Pengiriman** sesuai armada transportasi laut/udara yang berangkat.
4.  **Tiba di Tujuan**: Kasir di kota tujuan membuka menu **Verifikasi Paket**, mencocokkan fisik barang yang turun dengan manifest komputer menggunakan barcode scanner.

### **🛍️ SOP SORE (Pengambilan Barang & POS Kasir)**
1.  Pelanggan datang ke gudang tujuan membawa nomor resi/nama barang.
2.  Kasir membuka menu **Scan & Pembayaran**, lalu memindai barcode stiker barang.
3.  Sistem menampilkan tagihan ongkir. Klik **"Bayar & Serahkan"**.
4.  Pilih metode pembayaran (misal: QRIS, Kasir menyuruh pelanggan memindai kode QR di layar komputer).
5.  Setelah lunas, klik selesai. Printer kasir akan otomatis mencetak struk belanja thermal, kasir menyerahkan barang kepada pelanggan.

### **🌃 SOP MALAM (Menutup Hari & Pelaporan)**
1.  Kasir membuka menu **Shift Kasir**, lalu klik **"Closing Shift"**.
2.  **Proses Blind Closing**: Kasir menghitung fisik uang kertas di laci kasir (misal: lembar Rp 100rb ada 5, lembar Rp 50rb ada 2, dst). Masukkan jumlah lembar tersebut di kolom pecahan yang disediakan, lalu klik **"Submit Kas Aktual"**.
3.  Aplikasi ditutup dan kasir keluar (*Log Out*).
4.  **Audit Owner**: Owner masuk ke sistem menggunakan akun Owner, membuka menu **Shift & Closing**, mengecek apakah laci kasir "SESUAI" atau "SELISIH". Klik **"Cetak"** pada baris closing shift tersebut untuk mencetak arsip laporan penutupan harian kasir sebagai bukti fisik yang sah.

---

## 6. PANDUAN CETAK STRUK & LABEL

Sistem Jastip Anggun Jaya didesain kompatibel dengan berbagai perangkat keras printer standar:

### **A. Cetak Label Barcode Paket**
*   **Perangkat**: Printer Label Stiker Thermal (ukuran standard stiker barcode e-commerce).
*   **Cara**: Di menu **Label Barcode**, klik **"Cetak Label"**. Dialog print browser akan terbuka, pastikan memilih printer thermal Anda dan set ukuran margin ke *None (Tanpa Margin)* untuk hasil presisi.

### **B. Cetak Struk Belanja Pelanggan**
*   **Perangkat**: Printer thermal struk POS (lebar kertas 80mm).
*   **Cara**: Setelah menekan tombol pembayaran berhasil di menu **Scan & Pembayaran**, struk belanja thermal akan langsung terbuka di jendela popup dan langsung mencetak otomatis ke printer POS kasir Anda.

### **C. Cetak Laporan Closing Shift**
*   **Perangkat**: Printer thermal struk POS (80mm) atau printer kantor standar A4.
*   **Cara**: Di menu **Shift & Closing** pada akun Owner, klik tombol **"Cetak"**. Format struk yang ringkas, detail, dan rapi akan tercetak secara instan sebagai bukti rekap harian kas laci Anda.
