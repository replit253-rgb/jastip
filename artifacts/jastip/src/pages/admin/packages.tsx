import { useListPackages, useListBatches, PackageStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Search, FileDown, Download, X, Filter } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { isPackageInBarcodeOrArchive } from "@/lib/package-page-filter";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  addExportInfoSheet,
  createExportSheet,
  drawExportFooter,
  formatNumber,
  formatRp as formatExportRp,
  saveTabularPdf,
} from "@/lib/export-utils";
import { useAuth } from "@/lib/auth";

const PAGE_SIZE = 10;

const JENIS_JASTIP = [
  "Jastip Kargo",
  "Jastip Hemat+",
  "Jastip Pelni",
  "Jastip Pesawat",
];

const GROUPED_JENIS = ["jastip hemat+", "jastip pelni", "jastip pesawat"];
const KARGO_JENIS   = ["jastip kargo", "jastip cargo"];

function formatRp(n: any) {
  if (n == null || n === "" || n === 0) return "-";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}
function formatRpForce(n: any) {
  if (n == null || n === "") return "-";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}
function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function serviceTypeLabel(t: string | null | undefined) {
  if (!t) return "-";
  const map: Record<string, string> = {
    "jastip kargo": "Jastip Kargo",
    "jastip hemat+": "Jastip Hemat+",
    "jastip pelni": "Jastip Pelni",
    "jastip pesawat": "Jastip Pesawat",
    "jasa belanja": "Jasa Belanja",
  };
  return map[t.toLowerCase()] || t;
}

function fNum(n: any, decimals = 1) {
  if (n == null || n === "") return "";
  const v = Number(n);
  return isNaN(v) ? "" : v.toFixed(decimals);
}

const PACKAGE_EXPORT_COLUMNS = [
  "No", "Tanggal", "No Resi", "No Paket", "Nama Konsumen",
  "Jenis Jastip", "Jenis Barang", "Berat Real (Kg)",
  "Berat Digunakan (Kg)", "Total Berat (Kg)", "Total Ongkir", "Status",
];

function buildPackageExportRows(data: any[]) {
  return data.map((p: any, i: number) => [
    i + 1,
    formatDate(p.packageDate || p.createdAt),
    p.resiNumber || "-",
    p.packageNumber || "-",
    p.customerName || "-",
    serviceTypeLabel(p.serviceType),
    p.itemName || "-",
    formatNumber(p.realWeight, 2),
    formatNumber(p.usedWeight, 2),
    formatNumber(p.totalWeight, 2),
    formatExportRp(p.totalShipping),
    p.status === "diserahkan" ? "Diserahkan" : "Pending",
  ]);
}

export default function AdminPackages() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [filterJenis, setFilterJenis] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBatchId, setPdfBatchId] = useState<string>("");
  const [pdfJenis, setPdfJenis] = useState<string>("all");
  const [pdfNamaKapal, setPdfNamaKapal] = useState("");

  const [xlsxOpen, setXlsxOpen] = useState(false);
  const [xlsxBatchId, setXlsxBatchId] = useState<string>("__all__");

  const { data: allPackages, isLoading } = useListPackages({
    search: search || undefined,
    status: status === "all" ? undefined : (status as any),
  });
  const packages = allPackages?.filter(isPackageInBarcodeOrArchive);

  const { data: batches } = useListBatches();
  const sortedBatches = [...(batches || [])].sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const selectedPdfBatch = sortedBatches.find((b: any) => String(b.id) === pdfBatchId);

  function handlePdfOpenChange(open: boolean) {
    setPdfOpen(open);
    if (open) {
      setPdfBatchId("");
      setPdfJenis("all");
      setPdfNamaKapal("");
    }
  }

  const XLSX_ALL = "__all__";

  function handleXlsxOpenChange(open: boolean) {
    setXlsxOpen(open);
    if (open) setXlsxBatchId(XLSX_ALL);
  }

  const selectedXlsxBatch = xlsxBatchId !== XLSX_ALL
    ? sortedBatches.find((b: any) => String(b.id) === xlsxBatchId)
    : undefined;

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

  function getPackagesForExport(batchId = "", serviceType = "all") {
    if (!packages) return [];
    return (packages as any[]).filter((p) =>
      (!batchId || String(p.batchId) === batchId) &&
      (serviceType === "all" ||
        (p.serviceType || "").toLowerCase() === serviceType.toLowerCase())
    );
  }

  function getFilteredPackages() {
    return getPackagesForExport(pdfBatchId, pdfJenis);
  }

  function isGroupedExport() {
    return GROUPED_JENIS.includes(pdfJenis.toLowerCase());
  }

  function isKargoExport() {
    return KARGO_JENIS.includes(pdfJenis.toLowerCase());
  }

  function exportPdf() {
    if (!packages || packages.length === 0) return;
    if (!pdfBatchId) return;
    if (isKargoExport()) {
      exportPdfKargo();
    } else if (isGroupedExport()) {
      exportPdfGrouped();
    } else {
      exportPdfFlat();
    }
  }

  function exportPdfKargo() {
    const filtered = getFilteredPackages();
    if (filtered.length === 0) {
      toast({
        variant: "destructive",
        title: "Tidak ada data",
        description: "Tidak ada paket yang cocok dengan filter yang dipilih.",
      });
      return;
    }

    const sorted = [...filtered].sort((a: any, b: any) =>
      (a.customerName || "").localeCompare(b.customerName || "", "id"),
    );
    const batchLabel = selectedPdfBatch
      ? `${selectedPdfBatch.namaKapal} (${selectedPdfBatch.kotaAsal} → ${selectedPdfBatch.tujuan})`
      : "-";
    const filters = {
      Batch: batchLabel,
      Layanan: pdfJenis === "all" ? "Semua" : pdfJenis,
      Tanggal: "Semua",
      Status: status === "all" ? "Semua" : status,
      Kasir: "Semua",
    };
    const cargoColumns = [
      "No", "Nama Konsumen", "Tgl Masuk", "No Resi / Kurir",
      "Total Koli", "Koli", "Jenis Barang", "Ukuran (cm)",
      "Pakai (M³)", "Harga Kubikasi", "Ongkir Paket", "Status",
    ];
    const cargoRows = sorted.map((p: any, i: number) => [
      i + 1,
      p.customerName || "-",
      formatDate(p.packageDate || p.createdAt),
      p.resiNumber || "-",
      p.packageNumber || "-",
      p.packagingType || "-",
      p.itemName || "-",
      p.length && p.width && p.height ? `${p.length}×${p.width}×${p.height}` : "-",
      formatNumber(p.usedWeight, 2),
      formatExportRp(p.shippingRate),
      formatExportRp(p.totalShipping),
      p.status === "diserahkan" ? "Diserahkan" : "Pending",
    ]);
    const totalOngkir = sorted.reduce(
      (sum: number, p: any) => sum + (Number(p.totalShipping) || 0),
      0,
    );

    saveTabularPdf({
      filename: `laporan-kargo${selectedPdfBatch ? `-${selectedPdfBatch.namaKapal.replace(/\s+/g, "-").toLowerCase()}` : ""}.pdf`,
      title: "JASTIP CARGO — JASTIP ANGGUN JAYA",
      filters,
      columns: cargoColumns,
      rows: cargoRows,
      summaryRows: [[
        "Total Paket", sorted.length, "", "", "", "", "", "", "", "",
        formatExportRp(totalOngkir), "",
      ]],
      landscape: true,
      exportedBy: user?.name || "Pengguna aktif",
      fontSize: 6.5,
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 28 },
        2: { cellWidth: 16 },
        3: { cellWidth: 26 },
        4: { cellWidth: 13, halign: "center" },
        5: { cellWidth: 13 },
        6: { cellWidth: 46, overflow: "linebreak" },
        7: { cellWidth: 21, halign: "center" },
        8: { cellWidth: 16, halign: "right" },
        9: { cellWidth: 24, halign: "right" },
        10: { cellWidth: 24, halign: "right" },
        11: { cellWidth: 17, halign: "center" },
      },
    });
    setPdfOpen(false);
  }

  function exportPdfGrouped() {
    const filtered = getFilteredPackages();
    if (filtered.length === 0) { toast({ variant: "destructive", title: "Tidak ada data", description: "Tidak ada paket yang cocok dengan filter yang dipilih." }); return; }

    filtered.sort((a: any, b: any) =>
      (a.customerName || "").localeCompare(b.customerName || "", "id")
    );

    const groups = new Map<string, any[]>();
    for (const pkg of filtered) {
      const name = (pkg.customerName || "(Tanpa Nama)").trim();
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(pkg);
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = 297;
    const margin = 10;

    const totalPaket = filtered.length;
    const totalBeratAll = filtered.reduce((s: number, p: any) => s + (Number(p.usedWeight) || 0), 0);

    const serviceUpper: Record<string, string> = {
      "jastip pelni": "JASTIP PELNI",
      "jastip hemat+": "JASTIP HEMAT+",
      "jastip pesawat": "JASTIP PESAWAT",
    };
    const jenisKey = pdfJenis.toLowerCase();
    const titleText = (serviceUpper[jenisKey] || pdfJenis.toUpperCase()) +
      (pdfNamaKapal ? " " + pdfNamaKapal.toUpperCase() : "");
    // Rute selalu diambil dari batch pengiriman yang dipilih, bukan tabel per jenis jastip
    const rute = selectedPdfBatch
      ? `${selectedPdfBatch.kotaAsal} - ${selectedPdfBatch.tujuan}`.toUpperCase()
      : "-";
    // ── Header halaman ──────────────────────────────────────────────────────
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(titleText, pageW / 2, 11, { align: "center" });

    const infoRows: [string, string][] = [
      ["Rute", rute],
      ["Jumlah Paket", `${totalPaket} Item`],
      ["Filter", `Layanan ${pdfJenis === "all" ? "Semua" : pdfJenis} · Tanggal Semua · Status ${status === "all" ? "Semua" : status} · Kasir Semua`],
    ];

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const labelX = 45;
    const valX = 95;
    let y = 17;
    for (const [lbl, val] of infoRows) {
      doc.text(lbl, labelX, y);
      doc.text(val, valX, y);
      y += 4.2;
    }
    y += 3;

    // ── Header tabel (reusable) ─────────────────────────────────────────────
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
    ]];

    const colStyles: Record<number, object> = {
      0:  { cellWidth: 15 },
      1:  { cellWidth: 25 },
      2:  { cellWidth: 25 },
      3:  { cellWidth: 13, halign: "center" },
      4:  { cellWidth: 12, halign: "center" },
      5:  { cellWidth: 18 },
      6:  { cellWidth: 9,  halign: "right" },
      7:  { cellWidth: 7,  halign: "right" },
      8:  { cellWidth: 7,  halign: "right" },
      9:  { cellWidth: 7,  halign: "right" },
      10: { cellWidth: 10, halign: "right" },
      11: { cellWidth: 13, halign: "center" },
      12: { cellWidth: 14, halign: "right" },
      13: { cellWidth: 18, halign: "right" },
      14: { cellWidth: 13, halign: "right" },
      15: { cellWidth: 16, halign: "right" },
      16: { cellWidth: 20, halign: "right" },
    };

    // ── Loop per grup konsumen ──────────────────────────────────────────────
    for (const [customerName, pkgs] of groups) {
      const totalBeratGrup = pkgs.reduce((s: number, p: any) => s + (Number(p.usedWeight) || 0), 0);
      const totalOngkirGrup = pkgs.reduce((s: number, p: any) => s + (Number(p.totalShipping) || 0), 0);
      const hargaPerKg = pkgs.find((p: any) => p.shippingRate != null)?.shippingRate ?? null;

      if (210 - y < 22) { doc.addPage(); y = 10; }

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.text(`NAMA KONSUMEN       ${customerName}`, margin, y + 3);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.text(`  Jumlah Paket:     ${pkgs.length}.0`, margin, y + 7.5);
      y += 12;

      const rows = pkgs.map((p: any, i: number) => [
        formatDate(p.packageDate || p.createdAt),
        p.resiNumber || "-",
        p.barcode || p.resiNumber || "-",
        p.statusVerifikasi === "SUDAH_DIVERIFIKASI" ? "SUDAH\nSCAN" : "BELUM\nSCAN",
        p.packageNumber || "-",
        p.customerName || "-",
        fNum(p.realWeight, 1),
        fNum(p.length, 0),
        fNum(p.width, 0),
        fNum(p.height, 0),
        p.volumeWeight != null ? fNum(p.volumeWeight, 1) : "0.0",
        p.packagingType || "-",
        fNum(p.usedWeight, 1),
        formatExportRp(p.totalShipping),
        i === 0 ? formatNumber(totalBeratGrup, 2) : "",
        i === 0 ? formatExportRp(hargaPerKg) : "",
        i === 0 ? formatExportRp(totalOngkirGrup) : "",
      ]);

      autoTable(doc, {
        startY: y,
        head: tableHead,
        body: rows,
        didDrawPage: () => drawExportFooter(doc, user?.name || "Pengguna aktif"),
        styles: { fontSize: 5.8, cellPadding: 1.1, overflow: "linebreak", lineColor: [200, 200, 200], lineWidth: 0.1 },
        headStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: "bold", fontSize: 5.8, halign: "center", valign: "middle" },
        alternateRowStyles: { fillColor: [253, 248, 248] },
        showHead: "everyPage",
        rowPageBreak: "avoid",
        columnStyles: colStyles,
        margin: { left: margin, right: margin },
        tableLineColor: [200, 200, 200],
        tableLineWidth: 0.1,
      });

      y = (doc as any).lastAutoTable.finalY + 8;
    }

    const safeJenis = pdfJenis.replace(/\+/g, "plus").replace(/\s+/g, "-").toLowerCase();
    const safeKapal = pdfNamaKapal ? `-${pdfNamaKapal.replace(/\s+/g, "-")}` : "";
    const safeBatch = selectedPdfBatch ? `-${selectedPdfBatch.namaKapal.replace(/\s+/g, "-").toLowerCase()}` : "";
    doc.save(`laporan-${safeJenis}${safeBatch}${safeKapal}.pdf`);
    setPdfOpen(false);
  }

  function exportPdfFlat() {
    const filtered = getFilteredPackages();
    if (filtered.length === 0) {
      toast({
        variant: "destructive",
        title: "Tidak ada data",
        description: "Tidak ada paket yang cocok dengan filter yang dipilih.",
      });
      return;
    }
    const batchLabel = selectedPdfBatch
      ? `${selectedPdfBatch.namaKapal} (${selectedPdfBatch.kotaAsal} → ${selectedPdfBatch.tujuan})`
      : "-";
    const filters = {
      Batch: batchLabel,
      Layanan: pdfJenis === "all" ? "Semua" : pdfJenis,
      Tanggal: "Semua",
      Status: status === "all" ? "Semua" : status,
      Kasir: "Semua",
    };
    const safeBatch = selectedPdfBatch
      ? selectedPdfBatch.namaKapal.replace(/\s+/g, "-").toLowerCase()
      : "batch";
    const safeJenis = pdfJenis === "all"
      ? "semua"
      : pdfJenis.replace(/\s+/g, "-").toLowerCase();
    saveTabularPdf({
      filename: `laporan-paket_${safeBatch}_${safeJenis}.pdf`,
      title: "Jastip Anggun Jaya — Laporan Paket",
      filters,
      columns: PACKAGE_EXPORT_COLUMNS,
      rows: buildPackageExportRows(filtered),
      landscape: true,
      exportedBy: user?.name || "Pengguna aktif",
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { cellWidth: 18 },
        2: { cellWidth: 22 },
        3: { cellWidth: 18 },
        6: { cellWidth: 30, overflow: "linebreak" },
        7: { halign: "right", cellWidth: 16 },
        8: { halign: "right", cellWidth: 18 },
        9: { halign: "right", cellWidth: 16 },
        10: { halign: "right", cellWidth: 24 },
        11: { halign: "center", cellWidth: 18 },
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
    const filters = {
      Layanan: "Semua",
      Batch: batchInfo,
      Tanggal: "Semua",
      Status: status === "all" ? "Semua" : status,
      Kasir: user?.name || "Pengguna aktif",
      "Diekspor Oleh": user?.name || "Pengguna aktif",
    };
    const rows = buildPackageExportRows(data);

    const wb = XLSX.utils.book_new();
    const sheet = createExportSheet({
      title: "Laporan Paket — Jastip Anggun Jaya",
      filters,
      columns: PACKAGE_EXPORT_COLUMNS,
      rows,
      columnWidths: [
        { wch: 5 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 24 },
        { wch: 18 }, { wch: 32 }, { wch: 16 }, { wch: 20 }, { wch: 17 },
        { wch: 20 }, { wch: 16 },
      ],
    });
    XLSX.utils.book_append_sheet(wb, sheet, "Paket");
    addExportInfoSheet(wb, "Laporan Paket — Jastip Anggun Jaya", filters);

    const safeBatch = selectedXlsxBatch
      ? `-${selectedXlsxBatch.namaKapal.replace(/\s+/g, "-").toLowerCase()}`
      : "";
    XLSX.writeFile(wb, `laporan-paket${safeBatch}-${new Date().toISOString().split("T")[0]}.xlsx`);
    setXlsxOpen(false);
  }

  const showGroupedFields = isGroupedExport();
  const showNamaKapal = pdfJenis.toLowerCase() === "jastip pelni";
  const canExport = !!pdfBatchId && !!packages && packages.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Semua Paket</h1>
          <p className="text-muted-foreground mt-1">Kelola paket yang sudah tercatat di Barcode atau Arsip.</p>
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

      <Card>
        <div className="p-4 border-b space-y-3">
          {/* Row 1: search + export */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari resi, no paket, nama customer..." className="pl-9" value={search} onChange={(e) => handleSearch(e.target.value)} />
            </div>
          </div>
          {/* Row 2: filters */}
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
          {/* Active filter summary */}
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
                  onClick={() => setLocation(`/admin/packages/${pkg.id}`)}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{pkg.customerName || "-"}</p>
                      <p className="text-xs font-mono text-muted-foreground truncate">{pkg.resiNumber || "-"}{(pkg as any).packageNumber ? ` · #${(pkg as any).packageNumber}` : ""}</p>
                    </div>
                    <StatusBadge status={pkg.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 bg-primary/10 text-primary font-medium">{serviceTypeLabel((pkg as any).serviceType)}</span>
                    <span>{formatDate((pkg as any).packageDate || pkg.createdAt)}</span>
                    {(pkg as any).usedWeight && <span>{(pkg as any).usedWeight} Kg</span>}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold text-primary text-sm">{(pkg as any).totalShipping ? formatRp((pkg as any).totalShipping) : "-"}</span>
                    <span className="text-xs text-primary font-medium">Detail →</span>
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
                {["Tanggal","No Resi","No Paket","Nama Konsumen","Jenis Jastip","Berat Real (Kg)","P (cm)","L (cm)","T (cm)","Berat Volume","Berat Digunakan","Ongkir/Kg","Total Berat","Total Ongkir","Status","Aksi"].map(h => (
                  <th key={h} className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={16} className="h-24 text-center text-muted-foreground py-10">Memuat data...</td></tr>
              ) : paginated && paginated.length > 0 ? (
                paginated.map((pkg) => (
                  <tr key={pkg.id} className="border-b hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setLocation(`/admin/packages/${pkg.id}`)}>
                    <td className="py-3 px-3 whitespace-nowrap text-muted-foreground">{formatDate((pkg as any).packageDate || pkg.createdAt)}</td>
                    <td className="py-3 px-3 font-mono font-medium whitespace-nowrap">{pkg.resiNumber || "-"}</td>
                    <td className="py-3 px-3 font-mono whitespace-nowrap">{(pkg as any).packageNumber || "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-medium">{pkg.customerName || "-"}</div>
                      <div className="text-xs text-muted-foreground">{pkg.customerPhone || ""}</div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                        {serviceTypeLabel((pkg as any).serviceType)}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).realWeight ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).length ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).width ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).height ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).volumeWeight ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right font-medium">{(pkg as any).usedWeight ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).shippingRate ? formatRp((pkg as any).shippingRate) : "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).totalWeight ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right font-semibold text-primary">{(pkg as any).totalShipping ? formatRp((pkg as any).totalShipping) : "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap"><StatusBadge status={pkg.status} /></td>
                    <td className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => setLocation(`/admin/packages/${pkg.id}`)}>Detail</Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={16} className="h-32 text-center text-muted-foreground">Data paket tidak ditemukan.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </Card>

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
                <SelectTrigger className="w-full overflow-hidden">
                  <span className="truncate block text-left">
                    {xlsxBatchId !== XLSX_ALL
                      ? (() => { const b = sortedBatches.find((b: any) => String(b.id) === xlsxBatchId); return b ? `${b.namaKapal} · ${b.kotaAsal} → ${b.tujuan}` : "Pilih batch"; })()
                      : "Semua batch (tidak difilter)"}
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-[260px] overflow-y-auto max-w-[420px]">
                  <SelectItem value={XLSX_ALL}>Semua batch</SelectItem>
                  {sortedBatches.map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)} className="flex-col items-start">
                      <div className="flex flex-col w-full">
                        <span className="font-medium text-sm truncate max-w-[360px]">{b.namaKapal}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[360px]">
                          {b.kotaAsal} → {b.tujuan}
                          {b.statusBatch === "OPEN" ? " · Aktif" : b.statusBatch === "CLOSED" ? " · Ditutup" : " · Arsip"}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Kosongkan untuk ekspor semua paket tanpa filter batch.</p>
            </div>

            {/* Preview counts */}
            {packages && (
              <div className="rounded-md bg-muted/40 border px-4 py-3 space-y-1.5 text-sm">
                {(() => {
                  const preview = xlsxBatchId !== XLSX_ALL
                    ? packages.filter((p: any) => String(p.batchId) === xlsxBatchId)
                    : packages;
                  return (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total paket</span>
                        <span className="font-semibold">{preview.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sudah generate barcode</span>
                        <span className="font-semibold">{preview.filter((p: any) => !!p.barcode).length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sudah diverifikasi</span>
                        <span className="font-semibold">{preview.filter((p: any) => (p as any).statusVerifikasi === "SUDAH_DIVERIFIKASI").length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sudah diambil</span>
                        <span className="font-semibold text-green-600">{preview.filter((p: any) => p.status === "diserahkan").length}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setXlsxOpen(false)}>Batal</Button>
            <Button onClick={exportExcel} disabled={!packages || packages.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Download Excel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pdfOpen} onOpenChange={handlePdfOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="w-5 h-5 text-primary" />
              Export Laporan PDF
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Batch Pengiriman</Label>
              <Select value={pdfBatchId} onValueChange={(v) => { setPdfBatchId(v); setPdfJenis("all"); }}>
                <SelectTrigger className="w-full overflow-hidden">
                  <span className="truncate block text-left">
                    {pdfBatchId
                      ? (() => { const b = sortedBatches.find((b: any) => String(b.id) === pdfBatchId); return b ? `${b.namaKapal} · ${b.kotaAsal} → ${b.tujuan}` : "Pilih batch pengiriman"; })()
                      : "Pilih batch pengiriman"}
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-[260px] overflow-y-auto max-w-[420px]">
                  {sortedBatches.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Belum ada batch pengiriman.</div>
                  )}
                  {sortedBatches.map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)} className="flex-col items-start">
                      <div className="flex flex-col w-full">
                        <span className="font-medium text-sm truncate max-w-[360px]">{b.namaKapal}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[360px]">
                          {b.kotaAsal} → {b.tujuan}
                          {b.statusBatch === "OPEN" ? " · Aktif" : b.statusBatch === "CLOSED" ? " · Ditutup" : " · Arsip"}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Pilih batch pengiriman terlebih dahulu untuk melanjutkan.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Jenis Jastip</Label>
              <Select value={pdfJenis} onValueChange={setPdfJenis} disabled={!pdfBatchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih jenis jastip" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Jenis</SelectItem>
                  {JENIS_JASTIP.map((j) => (
                    <SelectItem key={j} value={j}>{j}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showGroupedFields && (
              <>
                {showNamaKapal && (
                  <div className="space-y-1.5">
                    <Label>Nama Kapal <span className="text-muted-foreground font-normal text-xs">(Opsional)</span></Label>
                    <Input
                      placeholder="Contoh: KM DEMPO"
                      value={pdfNamaKapal}
                      onChange={(e) => setPdfNamaKapal(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}

            {(pdfBatchId || pdfJenis !== "all" || pdfNamaKapal) && (
              <button
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => { setPdfBatchId(""); setPdfJenis("all"); setPdfNamaKapal(""); }}
              >
                <X className="w-3 h-3 inline mr-1" />
                Reset filter
              </button>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPdfOpen(false)}>Batal</Button>
            <Button onClick={exportPdf} disabled={!canExport}>
              <FileDown className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
