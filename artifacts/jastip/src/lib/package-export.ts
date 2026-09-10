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

const SERVICE_LABELS: Record<string, string> = {
  "jastip kargo": "Jastip Kargo",
  "jastip cargo": "Jastip Cargo",
  "jastip hemat+": "Jastip Hemat+",
  "jastip pelni": "Jastip Pelni",
  "jastip pesawat": "Jastip Pesawat",
  "jasa belanja": "Jasa Belanja",
};

function packageDate(value: unknown) {
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
    formatWeight(pkg.realWeight, ""),
    formatWeight(pkg.usedWeight, ""),
    formatWeight(pkg.totalWeight, ""),
    formatRp(pkg.totalShipping),
    isPackagePickedUp(pkg) ? "Diserahkan" : "Pending",
  ]);
}

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
    formatNumber(pkg.usedWeight, 2),
    formatRp(pkg.shippingRate),
    formatRp(pkg.totalShipping),
    isPackagePickedUp(pkg) ? "Diserahkan" : "Pending",
  ]);
}
