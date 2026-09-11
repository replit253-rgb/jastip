import {
  formatNumber,
  formatRp,
  formatWeight,
  type ExportCell,
} from "./export-utils";

export const PACKAGE_EXPORT_COLUMNS = [
  "No",
  "Tanggal",
  "No Resi",
  "No Paket",
  "Nama Konsumen",
  "Jenis Jastip",
  "Jenis Barang",
  "Berat Real (Kg)",
  "Berat Digunakan (Kg)",
  "Total Berat (Kg)",
  "Total Ongkir",
  "Status",
];

export const CARGO_EXPORT_COLUMNS = [
  "No",
  "Nama Konsumen",
  "Tgl Masuk",
  "No Resi / Kurir",
  "Total Koli",
  "Koli",
  "Jenis Barang",
  "Ukuran (cm)",
  "Pakai (M³)",
  "Harga Kubikasi",
  "Ongkir Paket",
  "Status",
];

export const ARSIP_EXPORT_COLUMNS = [
  "No",
  "Tanggal Paket",
  "Nama Penerima",
  "No Resi",
  "No Paket",
  "Jenis Jastip",
  "Jenis Barang",
  "Rute Pengiriman",
  "Berat Real (Kg)",
  "Berat Digunakan (Kg)",
  "Total Ongkir",
  "Status Pembayaran",
  "Tanggal Diambil",
];

export const PENGELUARAN_EXPORT_COLUMNS = [
  "No",
  "Tanggal",
  "Kategori",
  "Nominal",
  "Metode Pembayaran",
  "Dicatat Oleh",
  "Catatan",
];

export const FINANCE_TRANSACTION_COLUMNS = [
  "Jenis Data",
  "Waktu/Tanggal",
  "Admin/Kategori",
  "Metode",
  "Nominal",
  "Keterangan",
];

const SERVICE_LABELS: Record<string, string> = {
  "jastip kargo": "Jastip Kargo",
  "jastip cargo": "Jastip Cargo",
  "jastip hemat+": "Jastip Hemat+",
  "jastip pelni": "Jastip Pelni",
  "jastip pesawat": "Jastip Pesawat",
  "jasa belanja": "Jasa Belanja",
};

export function packageDate(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

export function serviceTypeLabel(value: unknown) {
  if (!value) return "-";
  const key = String(value).toLowerCase();
  return SERVICE_LABELS[key] || String(value);
}

export function isPackagePickedUp(pkg: any) {
  return (
    pkg.statusPengambilan === "SUDAH_DIAMBIL" ||
    pkg.status === "diserahkan"
  );
}

export function filterPackagesForExport(
  packages: any[],
  options: {
    batchId?: string;
    serviceType?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {},
) {
  const { batchId, serviceType = "all", status = "all", dateFrom, dateTo } =
    options;
  return packages.filter((pkg) => {
    if (batchId && String(pkg.batchId) !== batchId) return false;
    if (
      serviceType !== "all" &&
      String(pkg.serviceType || "").toLowerCase() !== serviceType.toLowerCase()
    ) {
      return false;
    }
    if (status === "diserahkan" && !isPackagePickedUp(pkg)) return false;
    if (status === "pending" && isPackagePickedUp(pkg)) return false;
    const rawDate = pkg.packageDate || pkg.createdAt;
    if (dateFrom && String(rawDate).slice(0, 10) < dateFrom) return false;
    if (dateTo && String(rawDate).slice(0, 10) > dateTo) return false;
    return true;
  });
}

export function buildPackageExportRows(packages: any[]): ExportCell[][] {
  return packages.map((pkg, index) => [
    index + 1,
    packageDate(pkg.packageDate || pkg.createdAt),
    pkg.resiNumber || "-",
    pkg.packageNumber || "-",
    pkg.customerName || "-",
    serviceTypeLabel(pkg.serviceType),
    pkg.itemName || "-",
    formatNumber(pkg.realWeight, 2, "-"),
    formatNumber(pkg.usedWeight, 2, "-"),
    formatNumber(pkg.totalWeight ?? pkg.usedWeight, 2, "-"),
    formatRp(pkg.totalShipping),
    isPackagePickedUp(pkg) ? "Diserahkan" : "Pending",
  ]);
}

export const buildSharedPackageExportRows = buildPackageExportRows;

export function buildCargoExportRows(packages: any[]): ExportCell[][] {
  return packages.map((pkg, index) => [
    index + 1,
    pkg.customerName || "-",
    packageDate(pkg.packageDate || pkg.createdAt),
    pkg.resiNumber || "-",
    pkg.packageNumber || "-",
    pkg.packagingType || "-",
    pkg.itemName || "-",
    pkg.length && pkg.width && pkg.height
      ? `${pkg.length}×${pkg.width}×${pkg.height}`
      : "-",
    formatNumber(pkg.usedWeight, 2, "-"),
    formatRp(pkg.shippingRate),
    formatRp(pkg.totalShipping),
    isPackagePickedUp(pkg) ? "Diserahkan" : "Pending",
  ]);
}

export function buildArsipExportRows(arsipPackages: any[]): ExportCell[][] {
  return arsipPackages.map((p: any, i: number) => [
    i + 1,
    packageDate(p.packageDate || p.createdAt),
    p.customerName || "-",
    p.resiNumber || "-",
    p.packageNumber || "-",
    serviceTypeLabel(p.serviceType),
    p.itemName || "-",
    p.deliveryRoute || "-",
    formatNumber(p.realWeight, 2, "-"),
    formatNumber(p.usedWeight, 2, "-"),
    formatRp(p.totalShipping),
    p.statusPembayaran || "Lunas",
    packageDate(p.pickedUpAt),
  ]);
}

export function buildPengeluaranExportRows(items: any[], totalNominal?: number): ExportCell[][] {
  const rows: ExportCell[][] = items.map((d: any, idx: number) => [
    idx + 1,
    packageDate(d.tanggal),
    d.kategori || "-",
    formatRp(d.nominal),
    d.metodePembayaran || "-",
    d.namaPencatat || "-",
    d.catatan || d.keterangan || "-",
  ]);
  if (totalNominal !== undefined) {
    rows.push(["TOTAL", "", "", formatRp(totalNominal), "", "", ""]);
  }
  return rows;
}

export function buildFinanceTransactionRows(payments: any[], pengeluaran: any[]): ExportCell[][] {
  return [
    ...payments.map((p: any) => [
      "Pembayaran",
      p.createdAt
        ? new Date(p.createdAt).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "-",
      p.adminName || "-",
      p.paymentType || "-",
      formatRp(p.totalAmount || 0),
      p.notes || "-",
    ]),
    ...pengeluaran.map((e: any) => [
      "Pengeluaran",
      e.tanggal || "-",
      e.kategori || "-",
      e.metodePembayaran || "-",
      formatRp(e.nominal || 0),
      e.catatan || e.keterangan || "-",
    ]),
  ];
}
