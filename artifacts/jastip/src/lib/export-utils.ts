import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export type ExportFilters = Record<string, string | number | null | undefined>;
export type ExportCell = string | number | null | undefined;

function exportTimestamp() {
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

export function addExportInfoSheet(
  workbook: XLSX.WorkBook,
  title: string,
  filters: ExportFilters,
) {
  const rows = [
    [title],
    ["Waktu Export", exportTimestamp()],
    ...exportFilterRows(filters),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 28 }, { wch: 58 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Info Export");
}

export function drawExportFooter(doc: jsPDF, exportedBy = "Pengguna aktif") {
  const margin = 12;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setTextColor(110);
  doc.text(`Jastip Anggun Jaya · Diekspor oleh: ${exportedBy}`, margin, pageHeight - 7);
  doc.text(`Halaman ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 7, {
    align: "right",
  });
  doc.setTextColor(0);
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
}: {
  filename: string;
  title: string;
  filters: ExportFilters;
  columns: string[];
  rows: ExportCell[][];
  summaryRows?: ExportCell[][];
  landscape?: boolean;
  exportedBy?: string;
}) {
  const doc = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const generatedAt = exportTimestamp();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Waktu export: ${generatedAt}`, margin, 20);

  let metadataY = 26;
  for (const [label, value] of exportFilterRows(filters)) {
    doc.text(`${label}: ${value}`, margin, metadataY);
    metadataY += 4;
  }

  autoTable(doc, {
    startY: metadataY + 2,
    head: [columns],
    body: rows.map((row) => row.map((cell) => cell == null ? "" : String(cell))),
    margin: { left: margin, right: margin, top: 12, bottom: 14 },
    styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 245, 245] },
    didDrawPage: () => {
      drawExportFooter(doc, exportedBy);
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY;
  if (summaryRows.length && typeof finalY === "number") {
    autoTable(doc, {
      startY: finalY + 5,
      body: summaryRows.map((row) => row.map((cell) => cell == null ? "" : String(cell))),
      theme: "plain",
      styles: { fontSize: 8, fontStyle: "bold" },
      margin: { left: margin, right: margin },
    });
  }

  doc.save(filename);
}