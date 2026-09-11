import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export type ExportFilters = Record<string, string | number | null | undefined>;
export type ExportCell = string | number | null | undefined;

export function withExportContext(
  filters: ExportFilters,
  exportedBy = "Pengguna aktif",
) {
  const tanggalVal =
    filters["Tanggal"] ??
    (filters["Dari"] || filters["Sampai"]
      ? `${filters["Dari"] || "—"} s/d ${filters["Sampai"] || "—"}`
      : filters["Periode"] ?? "Semua");

  return {
    Layanan: filters["Layanan"] ?? "Semua",
    Batch: filters["Batch"] ?? "Semua",
    Tanggal: tanggalVal,
    Status: filters["Status"] ?? "Semua",
    Kasir: filters["Kasir"] ?? "Semua",
    ...filters,
    "Diekspor Oleh": filters["Diekspor Oleh"] || exportedBy,
  };
}

export function formatRp(value: unknown, emptyValue = "-"): string {
  if (value === null || value === undefined || value === "") return emptyValue;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return emptyValue;
  return `Rp ${Math.round(amount).toLocaleString("id-ID")}`;
}

export function formatWeight(value: unknown, emptyValue = "-"): string {
  if (value === null || value === undefined || value === "") return emptyValue;
  const weight = Number(value);
  if (!Number.isFinite(weight)) return emptyValue;
  return `${weight.toFixed(2).replace(/\.?0+$/, "")} Kg`;
}

export function formatNumber(value: unknown, decimals = 2, emptyValue = "-"): string {
  if (value === null || value === undefined || value === "") return emptyValue;
  const number = Number(value);
  if (!Number.isFinite(number)) return emptyValue;
  return number.toFixed(decimals).replace(/\.?0+$/, "");
}

export function exportTimestamp() {
  return new Date().toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function exportFilterRows(filters: ExportFilters) {
  return Object.entries(filters).map(([label, value]) => [
    label,
    value == null || value === "" ? "Semua" : String(value),
  ]);
}

export function exportInfoRows(title: string, filters: ExportFilters, timestamp = exportTimestamp()) {
  const normalizedFilters = withExportContext(filters);
  return [
    [title],
    ["Waktu Export", timestamp],
    ...exportFilterRows(normalizedFilters),
  ];
}

export function addExportInfoSheet(
  workbook: XLSX.WorkBook,
  title: string,
  filters: ExportFilters,
  timestamp?: string,
) {
  const rows = exportInfoRows(title, filters, timestamp);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 28 }, { wch: 58 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Info Export");
}

export function createExportSheet({
  title,
  filters,
  columns,
  rows,
  columnWidths,
  timestamp,
}: {
  title: string;
  filters: ExportFilters;
  columns: string[];
  rows: ExportCell[][];
  columnWidths?: { wch: number }[];
  timestamp?: string;
}) {
  const curTimestamp = timestamp || exportTimestamp();
  const normalizedFilters = withExportContext(filters);
  const sheet = XLSX.utils.aoa_to_sheet([
    ...exportInfoRows(title, normalizedFilters, curTimestamp),
    [],
    columns,
    ...rows,
  ]);
  if (columnWidths) sheet["!cols"] = columnWidths;
  return sheet;
}

export function applyExportFooters(
  doc: jsPDF,
  exportedBy = "Pengguna aktif",
  generatedAt = exportTimestamp(),
) {
  const totalPages = doc.getNumberOfPages();
  const margin = 12;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text(
      `Jastip Anggun Jaya · Diekspor oleh: ${exportedBy} · Waktu export: ${generatedAt}`,
      margin,
      pageHeight - 6,
    );
    doc.text(
      `Halaman ${i} dari ${totalPages}`,
      pageWidth - margin,
      pageHeight - 6,
      { align: "right" },
    );
  }
  doc.setTextColor(0);
}

export function drawExportFooter(
  doc: jsPDF,
  exportedBy = "Pengguna aktif",
  generatedAt = exportTimestamp(),
) {
  applyExportFooters(doc, exportedBy, generatedAt);
}

export function saveTabularPdf({
  filename,
  title,
  filters,
  columns,
  rows,
  summaryRows = [],
  landscape = true,
  exportedBy = "Pengguna aktif",
  columnStyles,
  fontSize = 7,
  generatedAt: suppliedGeneratedAt,
}: {
  filename: string;
  title: string;
  filters: ExportFilters;
  columns: string[];
  rows: ExportCell[][];
  summaryRows?: ExportCell[][];
  landscape?: boolean;
  exportedBy?: string;
  columnStyles?: Record<number, object>;
  fontSize?: number;
  generatedAt?: string;
}) {
  const doc = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const generatedAt = suppliedGeneratedAt || exportTimestamp();
  const normalizedFilters = withExportContext(filters, exportedBy);

  // Header Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, margin, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(60);

  // Split standard filters into 2 balanced columns for compact, clean layout
  const filterEntries = [
    ["Waktu Export", generatedAt],
    ["Layanan", normalizedFilters.Layanan],
    ["Batch", normalizedFilters.Batch],
    ["Tanggal", normalizedFilters.Tanggal],
    ["Status", normalizedFilters.Status],
    ["Kasir", normalizedFilters.Kasir],
    ["Diekspor Oleh", normalizedFilters["Diekspor Oleh"]],
  ];

  // Also include any extra custom filters
  Object.entries(normalizedFilters).forEach(([k, v]) => {
    if (!["Layanan", "Batch", "Tanggal", "Status", "Kasir", "Diekspor Oleh", "Periode", "Dari", "Sampai"].includes(k)) {
      filterEntries.push([k, String(v ?? "-")]);
    }
  });

  const col1X = margin;
  const col2X = landscape ? margin + 125 : margin + 95;
  const half = Math.ceil(filterEntries.length / 2);

  let metaY1 = 17;
  for (let i = 0; i < half; i++) {
    const [lbl, val] = filterEntries[i];
    doc.text(`${lbl}: ${val}`, col1X, metaY1);
    metaY1 += 3.8;
  }

  let metaY2 = 17;
  for (let i = half; i < filterEntries.length; i++) {
    const [lbl, val] = filterEntries[i];
    doc.text(`${lbl}: ${val}`, col2X, metaY2);
    metaY2 += 3.8;
  }

  const startY = Math.max(metaY1, metaY2) + 1.5;
  doc.setTextColor(0);

  autoTable(doc, {
    startY,
    head: [columns],
    body: rows.map((row) => row.map((cell) => cell == null ? "" : String(cell))),
    margin: { left: margin, right: margin, top: 12, bottom: 12 },
    styles: { fontSize, cellPadding: 1.4, overflow: "linebreak" },
    headStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 245, 245] },
    columnStyles,
    showHead: "everyPage",
    rowPageBreak: "avoid",
  });

  const finalY = (doc as any).lastAutoTable?.finalY;
  if (summaryRows.length && typeof finalY === "number") {
    autoTable(doc, {
      startY: finalY + 4,
      body: summaryRows.map((row) => row.map((cell) => cell == null ? "" : String(cell))),
      theme: "plain",
      styles: { fontSize: 8, fontStyle: "bold" },
      margin: { left: margin, right: margin, top: 12, bottom: 12 },
      rowPageBreak: "avoid",
    });
  }

  // Draw footers with accurate total page count on every single page
  applyExportFooters(doc, exportedBy, generatedAt);

  doc.save(filename);
}