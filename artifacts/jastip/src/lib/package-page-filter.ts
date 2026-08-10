type PackageLike = {
  barcode?: string | null;
  status?: string | null;
  statusPengambilan?: string | null;
};

export function isArchivedPackage(pkg: PackageLike) {
  return (
    pkg.statusPengambilan === "SUDAH_DIAMBIL" ||
    pkg.status === "diserahkan"
  );
}

/**
 * The package monitor is intentionally limited to records represented by
 * either the Barcode page or the Archive page:
 * - a generated barcode means the package is in Barcode;
 * - a delivered package means it is in Archive.
 */
export function isPackageInBarcodeOrArchive(pkg: PackageLike) {
  return Boolean(pkg.barcode) || isArchivedPackage(pkg);
}