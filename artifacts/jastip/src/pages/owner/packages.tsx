import { useListPackages, useListBatches, PackageStatus, getListPackagesQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useLocation } from "wouter";
import { Search, Download, ScanLine, CheckCircle2, XCircle, AlertCircle, Hash, Trash2, AlertTriangle, FileDown, X, Filter, Printer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { isPackageInBarcodeOrArchive } from "@/lib/package-page-filter";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  addExportInfoSheet,
  applyExportFooters,
  createExportSheet,
  drawExportFooter,
  formatRp as formatExportRp,
  saveTabularPdf,
} from "@/lib/export-utils";
import {
  buildCargoExportRows,
  buildPackageExportRows as buildSharedPackageExportRows,
  CARGO_EXPORT_COLUMNS,
  filterPackagesForExport,
  PACKAGE_EXPORT_COLUMNS,
} from "@/lib/package-export";
import { useAuth } from "@/lib/auth";

const PAGE_SIZE = 10;

const JENIS_JASTIP = ["Jastip Kargo", "Jastip Hemat+", "Jastip Pelni", "Jastip Pesawat"];
const GROUPED_JENIS = ["jastip hemat+", "jastip pelni", "jastip pesawat"];
const KARGO_JENIS   = ["jastip kargo", "jastip cargo"];

function formatRp(n: any) {
  if (!n) return "-";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}
function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function packagingLabel(t: string | null | undefined) {
  const map: Record<string, string> = { karton: "Karton", plastik: "Plastik", kayu: "Kayu", bubble_wrap: "Bubble Wrap", sack: "Karung", lainnya: "Lainnya" };
  return t ? (map[t] || t) : "-";
}
function fNum(n: any, decimals = 1) {
  if (n == null || n === "") return "";
  const v = Number(n);
  return isNaN(v) ? "" : v.toFixed(decimals);
}

export default function OwnerPackages() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [filterJenis, setFilterJenis] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // PDF export state
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBatchId, setPdfBatchId] = useState<string>("");
  const [pdfJenis, setPdfJenis] = useState<string>("all");
  const [pdfNamaKapal, setPdfNamaKapal] = useState("");

  // Excel export state
  const XLSX_ALL = "__all__";
  const [xlsxOpen, setXlsxOpen] = useState(false);
  const [xlsxBatchId, setXlsxBatchId] = useState<string>("__all__");

  // Scan verification state
  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [scanError, setScanError] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isActioning, setIsActioning] = useState(false);

  const { data: allPackages, isLoading, refetch } = useListPackages({
    search: search || undefined,
    status: status === "all" ? undefined : (status as any),
  });
  const packages = allPackages?.filter(isPackageInBarcodeOrArchive);

  const { data: batches } = useListBatches();
  const sortedBatches = [...(batches || [])].sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const selectedPdfBatch = sortedBatches.find((b: any) => String(b.id) === pdfBatchId);

  function applyTableFilters(data: any[]): any[] {
    let filtered = [...data];
    if (filterJenis !== "all") {
      filtered = filtered.filter((p) =>
        (p.serviceType || "").toLowerCase() === filterJenis.toLowerCase()
      );
    }
    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      from.setHours(0, 0, 0, 0);
      filtered = filtered.filter((p) => new Date(p.packageDate || p.createdAt) >= from);
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((p) => new Date(p.packageDate || p.createdAt) <= to);
    }
    return filtered;
  }

  const displayed = applyTableFilters(packages || []);
  const total = displayed.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const paginated = displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasTableFilter = filterJenis !== "all" || filterDateFrom || filterDateTo;

  function handleSearch(v: string) { setSearch(v); setPage(1); }
  function handleStatus(v: string) { setStatus(v); setPage(1); }
  function handleFilterJenis(v: string) { setFilterJenis(v); setPage(1); }
  function resetTableFilters() { setFilterJenis("all"); setFilterDateFrom(""); setFilterDateTo(""); setPage(1); }

  function handlePdfOpenChange(open: boolean) {
    setPdfOpen(open);
    if (open) { setPdfBatchId(""); setPdfJenis("all"); setPdfNamaKapal(""); }
  }

  function handleXlsxOpenChange(open: boolean) {
    setXlsxOpen(open);
    if (open) setXlsxBatchId(XLSX_ALL);
  }

  const selectedXlsxBatch = xlsxBatchId !== XLSX_ALL
    ? sortedBatches.find((b: any) => String(b.id) === xlsxBatchId)
    : undefined;

  function getPackagesForExport(batchId = "", serviceType = "all") {
    return filterPackagesForExport(packages || [], { batchId, serviceType });
  }

  function getFilteredPackages() {
    return getPackagesForExport(pdfBatchId, pdfJenis);
  }

  function isGroupedExport() { return GROUPED_JENIS.includes(pdfJenis.toLowerCase()); }
  function isKargoExport()   { return KARGO_JENIS.includes(pdfJenis.toLowerCase()); }

  function exportPdf() {
    if (!packages || packages.length === 0 || !pdfBatchId) return;
    if (isKargoExport()) exportPdfKargo();
    else if (isGroupedExport()) exportPdfGrouped();
    else exportPdfFlat();
  }

  function exportPdfKargo() {
    const filtered = getFilteredPackages();
    if (filtered.length === 0) { toast({ variant: "destructive", title: "Tidak ada data", description: "Tidak ada paket yang cocok dengan filter." }); return; }
    filtered.sort((a: any, b: any) => (a.customerName || "").localeCompare(b.customerName || "", "id"));
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = 297; const margin = 10;
    const batchLabel = selectedPdfBatch ? `${selectedPdfBatch.namaKapal} (${selectedPdfBatch.kotaAsal} → ${selectedPdfBatch.tujuan})` : "-";
    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("JASTIP CARGO — JASTIP ANGGUN JAYA", pageW / 2, 11, { align: "center" });
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`Batch: ${batchLabel}`, margin, 17);
    doc.text(`Total Paket: ${filtered.length} paket`, margin, 21);
    doc.text(`Dicetak: ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`, margin, 25);
    doc.text(`Filter: Layanan ${pdfJenis === "all" ? "Semua" : pdfJenis} · Tanggal Semua · Status ${status === "all" ? "Semua" : status} · Kasir Semua`, margin, 29);
    const hasCustomerName = filtered.some(
      (p: any) => p.customerName && p.customerName.trim() !== "" && p.customerName.trim() !== "-",
    );
    const cargoColumns = hasCustomerName
      ? CARGO_EXPORT_COLUMNS
      : [
          "No", "Tgl Masuk", "No Resi / Kurir", "Total Koli", "Koli",
          "Jenis Barang", "Ukuran (cm)", "Pakai (M³)", "Harga Kubikasi",
          "Ongkir Paket", "Biaya Tambahan", "Keterangan Biaya", "Total Tagihan", "Status"
        ];
    const fullRows = buildCargoExportRows(filtered);
    const rows = (hasCustomerName
      ? fullRows
      : fullRows.map((r) => [r[0], ...r.slice(2)])
    ).map((row) => row.map((cell) => (cell == null ? "" : String(cell))));

    const totalOngkir = filtered.reduce((s: number, p: any) => s + (Number(p.totalShipping) || 0), 0);
    const totalAdditionalFee = filtered.reduce((s: number, p: any) => s + (Number(p.additionalFee) || 0), 0);
    const grandTotal = totalOngkir + totalAdditionalFee;

    const columnStyles = hasCustomerName
      ? {
          0: { cellWidth: 7, halign: "center" },
          1: { cellWidth: 22, overflow: "linebreak" },
          2: { cellWidth: 14, halign: "center" },
          3: { cellWidth: 22 },
          4: { cellWidth: 10, halign: "center" },
          5: { cellWidth: 10, halign: "center" },
          6: { cellWidth: 24, overflow: "linebreak" },
          7: { cellWidth: 16, halign: "center" },
          8: { cellWidth: 15, halign: "right" },
          9: { cellWidth: 20, halign: "right" },
          10: { cellWidth: 22, halign: "right" },
          11: { cellWidth: 20, halign: "right" },
          12: { cellWidth: 22, overflow: "linebreak" },
          13: { cellWidth: 22, halign: "right" },
          14: { cellWidth: 17, halign: "center" },
        }
      : {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 16, halign: "center" },
          2: { cellWidth: 24 },
          3: { cellWidth: 12, halign: "center" },
          4: { cellWidth: 12, halign: "center" },
          5: { cellWidth: 32, overflow: "linebreak" },
          6: { cellWidth: 18, halign: "center" },
          7: { cellWidth: 16, halign: "right" },
          8: { cellWidth: 22, halign: "right" },
          9: { cellWidth: 24, halign: "right" },
          10: { cellWidth: 22, halign: "right" },
          11: { cellWidth: 26, overflow: "linebreak" },
          12: { cellWidth: 24, halign: "right" },
          13: { cellWidth: 18, halign: "center" },
        };

    autoTable(doc, {
      startY: 34,
      head: [cargoColumns],
      body: rows,
      didDrawPage: () => drawExportFooter(doc, user?.name || "Pengguna aktif"),
      styles: { fontSize: 6.5, cellPadding: 1.3, overflow: "linebreak", lineColor: [200,200,200], lineWidth: 0.1 },
      headStyles: { fillColor: [234,88,12], textColor: 255, fontStyle: "bold", fontSize: 6.5, halign: "center", valign: "middle" },
      alternateRowStyles: { fillColor: [255,247,237] },
      rowPageBreak: "avoid",
      showHead: "everyPage",
      columnStyles,
      margin: { left: margin, right: margin },
    });
    const finalY = (doc as any).lastAutoTable.finalY + 5;
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    const summaryText = `Total Ongkir: Rp ${totalOngkir.toLocaleString("id-ID")}${totalAdditionalFee > 0 ? ` · Biaya Tambahan: Rp ${totalAdditionalFee.toLocaleString("id-ID")} · Total Tagihan: Rp ${grandTotal.toLocaleString("id-ID")}` : ""}`;
    doc.text(summaryText, pageW - margin, finalY, { align: "right" });
    applyExportFooters(doc, user?.name || "Pengguna aktif");
    const safeBatch = selectedPdfBatch ? `-${selectedPdfBatch.namaKapal.replace(/\s+/g, "-").toLowerCase()}` : "";
    doc.save(`laporan-kargo${safeBatch}.pdf`);
    setPdfOpen(false);
  }

  function printCargoHtml() {
    const filtered = getFilteredPackages();
    if (filtered.length === 0) {
      toast({ variant: "destructive", title: "Tidak ada data", description: "Tidak ada paket yang cocok dengan filter." });
      return;
    }
    const sorted = [...filtered].sort((a: any, b: any) =>
      (a.customerName || "").localeCompare(b.customerName || "", "id"),
    );
    const batchLabel = selectedPdfBatch
      ? `${selectedPdfBatch.namaKapal} (${selectedPdfBatch.kotaAsal} → ${selectedPdfBatch.tujuan})`
      : "-";
    const hasCustomerName = sorted.some(
      (p: any) => p.customerName && p.customerName.trim() !== "" && p.customerName.trim() !== "-",
    );
    const cargoColumns = hasCustomerName
      ? CARGO_EXPORT_COLUMNS
      : [
          "No", "Tgl Masuk", "No Resi / Kurir", "Total Koli", "Koli",
          "Jenis Barang", "Ukuran (cm)", "Pakai (M³)", "Harga Kubikasi",
          "Ongkir Paket", "Biaya Tambahan", "Keterangan Biaya", "Total Tagihan", "Status"
        ];
    const fullRows = buildCargoExportRows(sorted);
    const rows = hasCustomerName
      ? fullRows
      : fullRows.map((r) => [r[0], ...r.slice(2)]);
    const totalOngkir = sorted.reduce(
      (sum: number, p: any) => sum + (Number(p.totalShipping) || 0),
      0,
    );
    const totalAdditionalFee = sorted.reduce(
      (sum: number, p: any) => sum + (Number(p.additionalFee) || 0),
      0,
    );
    const grandTotal = totalOngkir + totalAdditionalFee;

    const colWidths = hasCustomerName
      ? ["3%", "9%", "5%", "10%", "4%", "3.5%", "10.5%", "6%", "5%", "7%", "8%", "6%", "8%", "8%", "7%"]
      : ["3%", "6%", "11%", "5%", "4%", "12%", "7%", "6%", "8%", "9%", "6%", "8%", "8%", "7%"];

    const printWin = window.open("", "_blank");
    if (!printWin) {
      toast({ variant: "destructive", title: "Popup diblokir", description: "Izinkan popup untuk mencetak laporan." });
      return;
    }
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Laporan Jastip Cargo — ${batchLabel}</title>
  <style>
    @page { size: A4 landscape; margin: 6mm 8mm; }
    @media print {
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      tr { page-break-inside: avoid; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 7.5pt; margin: 0; color: #111; line-height: 1.25; }
    .header { text-align: center; margin-bottom: 6px; }
    .header h1 { font-size: 13pt; margin: 0 0 3px 0; font-weight: 800; color: #ea580c; }
    .meta { font-size: 8pt; color: #444; margin-bottom: 8px; display: flex; justify-content: space-between; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 0.5pt solid #bbb; padding: 2.5pt 2.5pt; font-size: 6.5pt; word-break: break-word; overflow-wrap: break-word; }
    th { background-color: #ea580c; color: #fff; font-weight: bold; text-align: center; }
    tr:nth-child(even) td { background-color: #fff7ed; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .summary { margin-top: 8px; text-align: right; font-size: 8pt; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1>JASTIP CARGO — JASTIP ANGGUN JAYA</h1>
  </div>
  <div class="meta">
    <div>
      <div><strong>Batch:</strong> ${batchLabel}</div>
      <div><strong>Total Paket:</strong> ${sorted.length} paket</div>
    </div>
    <div style="text-align: right;">
      <div><strong>Dicetak:</strong> ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</div>
      <div><strong>Diekspor Oleh:</strong> ${user?.name || "Pengguna aktif"}</div>
    </div>
  </div>
  <table>
    <colgroup>
      ${colWidths.map((w) => `<col style="width: ${w};" />`).join("")}
    </colgroup>
    <thead>
      <tr>${cargoColumns.map((c, i) => `<th style="width: ${colWidths[i]};">${c}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${rows.map((r) => `<tr>${r.map((cell, idx) => {
        let cls = "text-left";
        if (idx === 0 || idx === 1 || idx === 3 || idx === 4 || idx === 6 || idx === cargoColumns.length - 1) cls = "text-center";
        if ([7, 8, 9, 10, 12].includes(idx)) cls = "text-right";
        return `<td class="${cls}">${cell == null ? "-" : cell}</td>`;
      }).join("")}</tr>`).join("")}
    </tbody>
  </table>
  <div class="summary">
    Total Ongkir: Rp ${totalOngkir.toLocaleString("id-ID")}${totalAdditionalFee > 0 ? ` · Biaya Tambahan: Rp ${totalAdditionalFee.toLocaleString("id-ID")} · Total Tagihan: Rp ${grandTotal.toLocaleString("id-ID")}` : ""}
  </div>
</body>
</html>`;
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
    }, 250);
  }

  function exportPdfGrouped() {
    const filtered = getFilteredPackages();
    if (filtered.length === 0) { toast({ variant: "destructive", title: "Tidak ada data", description: "Tidak ada paket yang cocok dengan filter." }); return; }
    filtered.sort((a: any, b: any) => (a.customerName || "").localeCompare(b.customerName || "", "id"));
    const groups = new Map<string, any[]>();
    for (const pkg of filtered) {
      const name = (pkg.customerName || "(Tanpa Nama)").trim();
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(pkg);
    }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = 297; const margin = 10;
    const serviceUpper: Record<string, string> = { "jastip pelni":"JASTIP PELNI","jastip hemat+":"JASTIP HEMAT+","jastip pesawat":"JASTIP PESAWAT" };
    const jenisKey = pdfJenis.toLowerCase();
    const titleText = (serviceUpper[jenisKey] || pdfJenis.toUpperCase()) + (pdfNamaKapal ? " " + pdfNamaKapal.toUpperCase() : "");
    const rute = selectedPdfBatch ? `${selectedPdfBatch.kotaAsal} - ${selectedPdfBatch.tujuan}`.toUpperCase() : "-";
    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text(titleText, pageW / 2, 11, { align: "center" });
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    let y = 17;
     for (const [lbl, val] of [["Rute", rute], ["Jumlah Paket", `${filtered.length} Item`], ["Filter", `Layanan ${pdfJenis === "all" ? "Semua" : pdfJenis} · Tanggal Semua · Status ${status === "all" ? "Semua" : status} · Kasir Semua`]] as [string,string][]) {
      doc.text(lbl, 45, y); doc.text(val, 95, y); y += 4.2;
    }
    y += 3;
    const tableHead = [[
      "TANGGAL", "NO RESI", "SCAN PAKET",
      "STATUS NO\nSCAN PAKET",
      "NO\nPAKET",
      "NAMA\nKONSUMEN",
      "BERAT\nREAL", "P", "L", "T",
      "BERAT\nVOLUME",
      "JENIS\nPAKING",
      "BERAT YANG\nDI GUNAKAN",
      "ONGKIR PER\nPAKET",
      "TOTAL\nBERAT",
      "HARGA",
      "TOTAL ONGKIR\nJASTIP",
      "BIAYA\nTAMBAHAN",
      "KET. BIAYA\nTAMBAHAN",
      "TOTAL\nTAGIHAN",
    ]];
    const colStyles: Record<number, object> = {
      0:  { cellWidth: 14 },
      1:  { cellWidth: 20 },
      2:  { cellWidth: 20 },
      3:  { cellWidth: 12, halign: "center" },
      4:  { cellWidth: 10, halign: "center" },
      5:  { cellWidth: 16 },
      6:  { cellWidth: 8,  halign: "right" },
      7:  { cellWidth: 6,  halign: "right" },
      8:  { cellWidth: 6,  halign: "right" },
      9:  { cellWidth: 6,  halign: "right" },
      10: { cellWidth: 9,  halign: "right" },
      11: { cellWidth: 12, halign: "center" },
      12: { cellWidth: 12, halign: "right" },
      13: { cellWidth: 16, halign: "right" },
      14: { cellWidth: 12, halign: "right" },
      15: { cellWidth: 14, halign: "right" },
      16: { cellWidth: 17, halign: "right" },
      17: { cellWidth: 16, halign: "right" },
      18: { cellWidth: 24, overflow: "linebreak" },
      19: { cellWidth: 19, halign: "right" },
    };
    for (const [customerName, pkgs] of groups) {
      const isPelni = pkgs.some((p: any) => (p.serviceType || "").toLowerCase() === "jastip pelni") || pdfJenis === "jastip pelni";
      const totalBeratGrup = pkgs.reduce((s: number, p: any) => s + (Number(p.usedWeight) || 0), 0);
      let rawTotalOngkirGrup = pkgs.reduce((s: number, p: any) => s + (Number(p.totalShipping) || 0), 0);
      const totalOngkirGrup = (isPelni && rawTotalOngkirGrup > 0 && rawTotalOngkirGrup < 20000) ? 20000 : rawTotalOngkirGrup;
      const totalAddFeeGrup = pkgs.reduce((s: number, p: any) => s + (Number(p.additionalFee) || 0), 0);
      const grandTotalGrup = totalOngkirGrup + totalAddFeeGrup;
      const hargaPerKg = pkgs.find((p: any) => p.shippingRate != null)?.shippingRate ?? (isPelni ? 20000 : null);
      if (210 - y < 22) { doc.addPage(); y = 10; }
      doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
      doc.text(`NAMA KONSUMEN       ${customerName}`, margin, y + 3);
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
      const summaryLine = `Jumlah Paket: ${pkgs.length} pkt · Total Ongkir: ${formatExportRp(totalOngkirGrup)}${totalAddFeeGrup > 0 ? ` · Biaya Tambahan: ${formatExportRp(totalAddFeeGrup)} · Total Tagihan: ${formatExportRp(grandTotalGrup)}` : ""}`;
      doc.text(`  ${summaryLine}`, margin, y + 7.5);
      y += 12;
      const rows = pkgs.map((p: any, i: number) => {
        let ongkirPaket = Number(p.totalShipping) || 0;
        if (isPelni && rawTotalOngkirGrup > 0 && rawTotalOngkirGrup < 20000) {
          ongkirPaket = pkgs.length === 1 ? 20000 : Math.round((Number(p.usedWeight || 0) / (totalBeratGrup || 1)) * 20000);
        }
        const addFee = Number(p.additionalFee) || 0;
        const totalTagihanPaket = ongkirPaket + addFee;
        return [
          formatDate(p.packageDate || p.createdAt), p.resiNumber || "-", p.barcode || p.resiNumber || "-",
          p.statusVerifikasi === "SUDAH_DIVERIFIKASI" ? "SUDAH\nSCAN" : "BELUM\nSCAN",
          p.packageNumber || "-", p.customerName || "-",
          fNum(p.realWeight,1), fNum(p.length,0), fNum(p.width,0), fNum(p.height,0),
          p.volumeWeight != null ? fNum(p.volumeWeight,1) : "0.0", p.packagingType || "-",
          fNum(p.usedWeight,1),
          ongkirPaket > 0 ? `Rp ${Number(ongkirPaket).toLocaleString("id-ID")}` : "-",
          i === 0 ? totalBeratGrup.toFixed(1) : "",
          i === 0 && hargaPerKg != null ? `Rp ${Number(hargaPerKg).toLocaleString("id-ID")}` : (i === 0 ? "-" : ""),
          i === 0 ? `Rp ${totalOngkirGrup.toLocaleString("id-ID")}` : "",
          addFee > 0 ? formatExportRp(addFee) : "-",
          p.additionalFeeReason || "-",
          formatExportRp(totalTagihanPaket),
        ];
      });
      autoTable(doc, {
        startY: y, head: tableHead, body: rows,
        didDrawPage: () => drawExportFooter(doc, user?.name || "Pengguna aktif"),
        styles: { fontSize: 5.6, cellPadding: 1.0, overflow: "linebreak", lineColor: [200,200,200], lineWidth: 0.1 },
        headStyles: { fillColor: [185,28,28], textColor: 255, fontStyle: "bold", fontSize: 5.6, halign: "center", valign: "middle" },
        alternateRowStyles: { fillColor: [253,248,248] },
        columnStyles: colStyles, margin: { left: margin, right: margin },
        tableLineColor: [200,200,200], tableLineWidth: 0.1,
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
    applyExportFooters(doc, user?.name || "Pengguna aktif");
    const safeJenis = pdfJenis.replace(/\+/g, "plus").replace(/\s+/g, "-").toLowerCase();
    const safeKapal = pdfNamaKapal ? `-${pdfNamaKapal.replace(/\s+/g, "-")}` : "";
    const safeBatch = selectedPdfBatch ? `-${selectedPdfBatch.namaKapal.replace(/\s+/g, "-").toLowerCase()}` : "";
    doc.save(`laporan-${safeJenis}${safeBatch}${safeKapal}.pdf`);
    setPdfOpen(false);
  }

  function exportPdfFlat() {
    const filtered = getFilteredPackages();
    if (filtered.length === 0) { toast({ variant: "destructive", title: "Tidak ada data", description: "Tidak ada paket yang cocok dengan filter." }); return; }
    const batchLabel = selectedPdfBatch ? `${selectedPdfBatch.namaKapal} (${selectedPdfBatch.kotaAsal} → ${selectedPdfBatch.tujuan})` : "-";
    const totalOngkir = filtered.reduce((s: number, p: any) => s + (Number(p.totalShipping) || 0), 0);
    const totalAdditionalFee = filtered.reduce((s: number, p: any) => s + (Number(p.additionalFee) || 0), 0);
    const grandTotal = totalOngkir + totalAdditionalFee;

    saveTabularPdf({
      filename: [
        "laporan-paket",
        selectedPdfBatch ? selectedPdfBatch.namaKapal.replace(/\s+/g, "-").toLowerCase() : "batch",
        pdfJenis !== "all" ? pdfJenis.replace(/\s+/g, "-").toLowerCase() : "semua",
      ].join("_") + ".pdf",
      title: "Jastip Anggun Jaya — Laporan Paket",
      filters: {
        Batch: batchLabel,
        Layanan: pdfJenis === "all" ? "Semua" : pdfJenis,
        Tanggal: "Semua",
        Status: status === "all" ? "Semua" : status,
        Kasir: "Semua",
      },
      columns: PACKAGE_EXPORT_COLUMNS,
      rows: buildSharedPackageExportRows(filtered),
      summaryRows: [[
        "Total", "", "", "", "", "", "", "", "", "",
        formatExportRp(totalOngkir),
        formatExportRp(totalAdditionalFee),
        "",
        formatExportRp(grandTotal),
        "",
      ]],
      landscape: true,
      exportedBy: user?.name || "Pengguna aktif",
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { cellWidth: 16 },
        2: { cellWidth: 20 },
        3: { cellWidth: 14 },
        4: { cellWidth: 24 },
        5: { cellWidth: 18 },
        6: { cellWidth: 26, overflow: "linebreak" },
        7: { halign: "right", cellWidth: 14 },
        8: { halign: "right", cellWidth: 14 },
        9: { halign: "right", cellWidth: 14 },
        10: { halign: "right", cellWidth: 22 },
        11: { halign: "right", cellWidth: 20 },
        12: { cellWidth: 26, overflow: "linebreak" },
        13: { halign: "right", cellWidth: 24 },
        14: { halign: "center", cellWidth: 17 },
      },
    });
    setPdfOpen(false);
  }

  function exportExcel() {
    if (!packages || packages.length === 0) return;
    const data = getPackagesForExport(xlsxBatchId === XLSX_ALL ? "" : xlsxBatchId);
    if (!data.length) {
      toast({ variant: "destructive", title: "Tidak ada data", description: "Tidak ada paket untuk batch yang dipilih." });
      return;
    }
    const batchInfo = selectedXlsxBatch
      ? `${selectedXlsxBatch.namaKapal} (${selectedXlsxBatch.kotaAsal} → ${selectedXlsxBatch.tujuan})`
      : "Semua Batch";
    const isXlsxCargo = (selectedPdfBatch?.namaKapal || "").toLowerCase().includes("kargo") || false;
    const columns = isXlsxCargo ? CARGO_EXPORT_COLUMNS : PACKAGE_EXPORT_COLUMNS;
    const exportRows = isXlsxCargo ? buildCargoExportRows(data) : buildSharedPackageExportRows(data);
    const ws = createExportSheet({
      title: "Monitor Paket — Jastip Anggun Jaya",
      filters: {
        Layanan: "Semua",
        Batch: batchInfo,
        Tanggal: "Semua",
        Status: status === "all" ? "Semua" : status,
        Kasir: "Semua",
        "Diekspor Oleh": user?.name || "Pengguna aktif",
      },
      columns,
      rows: exportRows,
      columnWidths: isXlsxCargo
        ? [
            { wch: 5 }, { wch: 24 }, { wch: 14 }, { wch: 22 }, { wch: 12 },
            { wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 18 },
            { wch: 20 }, { wch: 18 }, { wch: 26 }, { wch: 20 }, { wch: 16 },
          ]
        : [
            { wch: 5 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 24 },
            { wch: 18 }, { wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 16 },
            { wch: 20 }, { wch: 18 }, { wch: 26 }, { wch: 20 }, { wch: 16 },
          ],
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Paket");
    addExportInfoSheet(wb, "Monitor Paket — Jastip Anggun Jaya", {
      Layanan: "Semua",
      Batch: batchInfo,
      Tanggal: "Semua",
      Status: status === "all" ? "Semua" : status,
      Kasir: "Semua",
    });

    const safeBatch = selectedXlsxBatch
      ? `-${selectedXlsxBatch.namaKapal.replace(/\s+/g, "-").toLowerCase()}`
      : "";
    XLSX.writeFile(wb, `monitor-paket${safeBatch}-${new Date().toISOString().split("T")[0]}.xlsx`);
    setXlsxOpen(false);
  }

  async function deletePackage(id: number, resiNumber: string) {
    setDeletingId(id);
    try {
      const token = localStorage.getItem("jaj_token");
      const res = await fetch(`/api/packages/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Gagal menghapus");
      }
      await queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      toast({ title: "Paket dihapus", description: `Paket ${resiNumber} berhasil dihapus.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal menghapus", description: e.message });
    } finally {
      setDeletingId(null);
    }
  }

  async function doScan(code: string) {
    if (!code.trim()) return;
    setIsScanning(true);
    setScanResult(null);
    setScanError("");
    try {
      const token = localStorage.getItem("jaj_token");
      const r = await fetch(`/api/packages/scan/${encodeURIComponent(code.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (data.package) {
        setScanResult(data.package);
      } else {
        const r2 = await fetch(`/api/packages?search=${encodeURIComponent(code.trim())}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const pkgs = await r2.json();
        if (Array.isArray(pkgs) && pkgs.length > 0) {
          setScanResult(pkgs[0]);
        } else {
          setScanError("Paket tidak ditemukan. Periksa kembali nomor resi atau barcode.");
        }
      }
    } catch {
      setScanError("Terjadi kesalahan saat mencari paket.");
    } finally {
      setIsScanning(false);
    }
  }

  async function serahkan() {
    if (!scanResult) return;
    setIsActioning(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const r = await fetch(`/api/packages/${scanResult.id}/serahkan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error("Gagal");
      const updated = await r.json();
      setScanResult(updated);
      refetch();
      toast({ title: "Diserahkan", description: `Paket ${scanResult.resiNumber} berhasil diserahkan.` });
    } catch {
      toast({ variant: "destructive", title: "Gagal menyerahkan paket" });
    } finally {
      setIsActioning(false);
    }
  }

  async function tolak() {
    if (!scanResult) return;
    setIsActioning(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const r = await fetch(`/api/packages/${scanResult.id}/tolak`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error("Gagal");
      const updated = await r.json();
      setScanResult(updated);
      refetch();
      toast({ title: "Dikembalikan", description: `Status paket ${scanResult.resiNumber} dikembalikan ke Pending.` });
    } catch {
      toast({ variant: "destructive", title: "Gagal memperbarui status" });
    } finally {
      setIsActioning(false);
    }
  }

  const isDiserahkan = scanResult?.status === "diserahkan";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monitor Paket</h1>
          <p className="text-muted-foreground mt-1">Pantau paket yang sudah tercatat di Barcode atau Arsip.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePdfOpenChange(true)}
            disabled={!packages || packages.length === 0}
          >
            <FileDown className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleXlsxOpenChange(true)}
            disabled={!packages || packages.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <span className="font-semibold">Sumber data:</span>{" "}
        halaman ini hanya menampilkan paket yang sudah memiliki barcode
        (tercatat di halaman Barcode) atau paket yang sudah diserahkan/diambil
        (tercatat di halaman Arsip).
      </div>

      {/* Scan Verification Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-primary" />
            Verifikasi Paket via Scan / Resi
          </CardTitle>
          <CardDescription>Masukkan nomor resi, barcode, atau no paket untuk memverifikasi dan mengubah status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); doScan(scanInput); }}
          >
            <div className="relative flex-1">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 font-mono"
                placeholder="Contoh: JAJ-ABC123 atau JNE123456789"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={!scanInput.trim() || isScanning}>
              {isScanning ? "Mencari..." : "Cari"}
            </Button>
            {(scanResult || scanError) && (
              <Button type="button" variant="outline" onClick={() => { setScanResult(null); setScanError(""); setScanInput(""); }}>
                Reset
              </Button>
            )}
          </form>

          {scanError && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm">{scanError}</p>
            </div>
          )}

          {scanResult && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{scanResult.customerName}</p>
                  <p className="text-sm text-muted-foreground font-mono">{scanResult.resiNumber} · {scanResult.barcode}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isDiserahkan ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                  {isDiserahkan ? "✓ Diserahkan" : "● Pending"}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div><span className="text-xs text-muted-foreground block">Jenis Jastip</span>{scanResult.serviceType?.replace("jastip ", "Jastip ") || "-"}</div>
                <div><span className="text-xs text-muted-foreground block">Tanggal</span>{formatDate(scanResult.packageDate)}</div>
                <div><span className="text-xs text-muted-foreground block">Berat Digunakan</span>{scanResult.usedWeight != null ? `${scanResult.usedWeight} Kg` : "-"}</div>
                <div><span className="text-xs text-muted-foreground block">Total Ongkir</span>{formatRp(scanResult.totalShipping)}</div>
              </div>
              {!isDiserahkan ? (
                <div className="flex gap-2">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1.5" onClick={serahkan} disabled={isActioning}>
                    <CheckCircle2 className="w-4 h-4" /> {isActioning ? "..." : "Serahkan"}
                  </Button>
                  <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 gap-1.5" onClick={tolak} disabled={isActioning}>
                    <XCircle className="w-4 h-4" /> Tolak
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-800 font-medium">Sudah diserahkan</span>
                  {scanResult.pickedUpAt && (
                    <span className="text-xs text-muted-foreground">pada {formatDate(scanResult.pickedUpAt)}</span>
                  )}
                  <Button size="sm" variant="outline" className="ml-auto border-amber-300 text-amber-700" onClick={tolak} disabled={isActioning}>
                    Kembalikan ke Pending
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <div className="p-4 border-b space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari resi, no paket, customer..." className="pl-9" value={search} onChange={(e) => handleSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium shrink-0">
              <Filter className="w-3.5 h-3.5" /> Filter:
            </div>
            <Select value={status} onValueChange={handleStatus}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="diserahkan">Diserahkan</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterJenis} onValueChange={handleFilterJenis}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="Jenis Jastip" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Jenis</SelectItem>
                {JENIS_JASTIP.map((j) => (
                  <SelectItem key={j} value={j}>{j}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 w-full sm:w-auto">
              <span className="text-xs text-muted-foreground shrink-0">Tanggal:</span>
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <Input
                  type="date"
                  className="w-full sm:w-[145px] text-sm"
                  value={filterDateFrom}
                  onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
                />
                <span className="text-xs text-muted-foreground shrink-0">–</span>
                <Input
                  type="date"
                  className="w-full sm:w-[145px] text-sm"
                  value={filterDateTo}
                  onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
                />
              </div>
            </div>
            {hasTableFilter && (
              <button
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground flex items-center gap-1"
                onClick={resetTableFilters}
              >
                <X className="w-3 h-3" /> Reset filter
              </button>
            )}
          </div>
          {hasTableFilter && (
            <p className="text-xs text-muted-foreground">
              Menampilkan <span className="font-semibold text-foreground">{total}</span> paket
              {filterJenis !== "all" && <> · Jenis: <span className="font-medium text-foreground">{filterJenis}</span></>}
              {filterDateFrom && <> · Dari: <span className="font-medium text-foreground">{new Date(filterDateFrom).toLocaleDateString("id-ID")}</span></>}
              {filterDateTo && <> · s/d: <span className="font-medium text-foreground">{new Date(filterDateTo).toLocaleDateString("id-ID")}</span></>}
            </p>
          )}
        </div>
        
        {/* Mobile card view */}
        <CardContent className="p-0 md:hidden">
          {isLoading ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">Memuat data...</div>
          ) : paginated && paginated.length > 0 ? (
            <div className="divide-y">
              {paginated.map((pkg) => (
                <div
                  key={pkg.id}
                  className="p-4 cursor-pointer hover:bg-muted/20 active:bg-muted/30 transition-colors"
                  onClick={() => setLocation(`/owner/packages/${pkg.id}`)}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{pkg.customerName || "-"}</p>
                      <p className="text-xs font-mono text-muted-foreground truncate">{pkg.resiNumber || "-"}{(pkg as any).packageNumber ? ` · #${(pkg as any).packageNumber}` : ""}</p>
                    </div>
                    <StatusBadge status={pkg.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                    <span>{(pkg as any).serviceType?.replace("jastip ", "Jastip ") || "-"}</span>
                    <span>{formatDate((pkg as any).packageDate || pkg.createdAt)}</span>
                    {(pkg as any).usedWeight && <span>{(pkg as any).usedWeight} Kg</span>}
                  </div>
                  <span className="font-bold text-primary text-sm mt-1 block">{(pkg as any).totalShipping ? formatRp((pkg as any).totalShipping) : "-"}</span>
                  <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 flex-1"
                      onClick={() => setLocation(`/owner/packages/${pkg.id}`)}
                    >
                      Detail
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 flex-1" disabled={deletingId === pkg.id}>
                          <Trash2 className="w-3.5 h-3.5" /> {deletingId === pkg.id ? "Menghapus..." : "Hapus"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-500" /> Hapus paket ini?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Data paket <span className="font-semibold">{pkg.resiNumber}</span> akan dihapus permanen dan tidak bisa dikembalikan.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Batal</AlertDialogCancel>
                          <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deletePackage(pkg.id, pkg.resiNumber || String(pkg.id))}>
                            Ya, Hapus
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Data paket tidak ditemukan.</div>
          )}
        </CardContent>
        {/* Desktop table */}
        <CardContent className="p-0 overflow-x-auto hidden md:block">
          <table className="w-full text-sm min-w-[1400px]">
            <thead>
              <tr className="border-b bg-muted/30">
                {["Tanggal","No Resi","No Paket","Nama Konsumen","Jenis Jastip","Berat Real (Kg)","P (cm)","L (cm)","T (cm)","Berat Volume","Jenis Paking","Berat Digunakan","Ongkir/Kg","Total Berat","Total Ongkir","Status","Aksi"].map((h, i) => (
                  <th key={i} className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={17} className="h-24 text-center text-muted-foreground py-10">Memuat data...</td></tr>
              ) : paginated && paginated.length > 0 ? (
                paginated.map((pkg) => (
                  <tr
                    key={pkg.id}
                    className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/owner/packages/${pkg.id}`)}
                  >
                    <td className="py-3 px-3 whitespace-nowrap text-muted-foreground">{formatDate((pkg as any).packageDate || pkg.createdAt)}</td>
                    <td className="py-3 px-3 font-mono font-medium whitespace-nowrap">{pkg.resiNumber || "-"}</td>
                    <td className="py-3 px-3 font-mono whitespace-nowrap">{(pkg as any).packageNumber || "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-medium">{pkg.customerName || "-"}</div>
                      <div className="text-xs text-muted-foreground">{pkg.customerPhone}</div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-xs">{(pkg as any).serviceType?.replace("jastip ", "Jastip ") || "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).realWeight ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).length ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).width ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).height ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).volumeWeight ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-xs">{packagingLabel((pkg as any).packagingType)}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right font-medium">{(pkg as any).usedWeight ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).shippingRate ? formatRp((pkg as any).shippingRate) : "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).totalWeight ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right font-semibold text-primary">{(pkg as any).totalShipping ? formatRp((pkg as any).totalShipping) : "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap"><StatusBadge status={pkg.status} /></td>
                    <td className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setLocation(`/owner/packages/${pkg.id}`)}>Detail</Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" disabled={deletingId === pkg.id}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-red-500" /> Hapus paket ini?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Data paket <span className="font-semibold">{pkg.resiNumber}</span> akan dihapus permanen dan tidak bisa dikembalikan.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Batal</AlertDialogCancel>
                              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deletePackage(pkg.id, pkg.resiNumber || String(pkg.id))}>
                                Ya, Hapus
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={17} className="h-32 text-center text-muted-foreground">Data paket tidak ditemukan.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
       </Card>
      
      {/* PDF Export Dialog */}
      <Dialog open={pdfOpen} onOpenChange={handlePdfOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="w-5 h-5 text-primary" />
              Export PDF
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Batch Pengiriman</Label>
              <Select value={pdfBatchId} onValueChange={setPdfBatchId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih batch" />
                </SelectTrigger>
                <SelectContent>
                  {sortedBatches.map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.namaKapal} · {b.kotaAsal} → {b.tujuan}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 shrink-0">
            <Button variant="outline" onClick={() => setPdfOpen(false)}>Batal</Button>
            <Button onClick={exportPdf} disabled={!canExport}>
              <FileDown className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Excel Export Dialog */}
      <Dialog open={xlsxOpen} onOpenChange={handleXlsxOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" />
              Export Excel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Batch Pengiriman</Label>
              <Select value={xlsxBatchId} onValueChange={setXlsxBatchId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih batch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={XLSX_ALL}>Semua batch</SelectItem>
                  {sortedBatches.map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.namaKapal} · {b.kotaAsal} → {b.tujuan}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setXlsxOpen(false)}>Batal</Button>
            <Button onClick={exportExcel}>Download Excel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

