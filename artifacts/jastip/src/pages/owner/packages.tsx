import { useListPackages, useListBatches, PackageStatus, getListPackagesQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useLocation } from "wouter";
import { Search, Download, ScanLine, CheckCircle2, XCircle, AlertCircle, Hash, Trash2, AlertTriangle, FileDown, X } from "lucide-react";
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
import { addExportInfoSheet, drawExportFooter } from "@/lib/export-utils";
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

  const total = packages?.length || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const paginated = packages?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearch(v: string) { setSearch(v); setPage(1); }
  function handleStatus(v: string) { setStatus(v); setPage(1); }

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
    const head = [["No","Nama Konsumen","Tgl Masuk","No Resi / Kurir","Total Koli","Koli","Jenis Barang","Ukuran (cm)","Pakai (M³)","Ongkir Paket","Status"]];
    const rows = filtered.map((p: any, i: number) => [
      i + 1, p.customerName || "-", formatDate(p.packageDate || p.createdAt), p.resiNumber || "-",
      p.packageNumber || "-", p.packagingType || "-", p.itemName || "-",
      (p.length && p.width && p.height) ? `${p.length}×${p.width}×${p.height}` : "-",
      p.usedWeight != null ? Number(p.usedWeight).toFixed(4) : "-",
      p.totalShipping != null ? `Rp ${Number(p.totalShipping).toLocaleString("id-ID")}` : "-",
      p.status === "diserahkan" ? "Diserahkan" : "Pending",
    ]);
    autoTable(doc, {
      startY: 34, head, body: rows,
      didDrawPage: () => drawExportFooter(doc, user?.name || "Pengguna aktif"),
      styles: { fontSize: 6.5, cellPadding: 1.3, overflow: "ellipsize", lineColor: [200,200,200], lineWidth: 0.1 },
      headStyles: { fillColor: [234,88,12], textColor: 255, fontStyle: "bold", fontSize: 6.5, halign: "center", valign: "middle" },
      alternateRowStyles: { fillColor: [255,247,237] },
      columnStyles: { 0:{cellWidth:8,halign:"center"},1:{cellWidth:28},2:{cellWidth:16},3:{cellWidth:28},4:{cellWidth:14,halign:"center"},5:{cellWidth:20},6:{cellWidth:25},7:{cellWidth:20,halign:"center"},8:{cellWidth:16,halign:"right"},9:{cellWidth:23,halign:"right"},10:{cellWidth:16,halign:"center"} },
      margin: { left: margin, right: margin },
    });
    const totalOngkir = filtered.reduce((s: number, p: any) => s + (Number(p.totalShipping) || 0), 0);
    const finalY = (doc as any).lastAutoTable.finalY + 5;
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.text(`Total Ongkir Keseluruhan: Rp ${totalOngkir.toLocaleString("id-ID")}`, pageW - margin, finalY, { align: "right" });
    const safeBatch = selectedPdfBatch ? `-${selectedPdfBatch.namaKapal.replace(/\s+/g, "-").toLowerCase()}` : "";
    doc.save(`laporan-kargo${safeBatch}.pdf`);
    setPdfOpen(false);
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
    const tableHead = [["TANGGAL","NO RESI","SCAN PAKET","STATUS NO\nSCAN PAKET","NO\nPAKET","NAMA\nKONSUMEN","BERAT\nREAL","P","L","T","BERAT\nVOLUME","JENIS\nPAKING","BERAT YANG\nDI GUNAKAN","ONGKIR PER\nPAKET","TOTAL\nBERAT","HARGA","TOTAL ONGKIR\nJASTIP"]];
    const colStyles: Record<number, object> = { 0:{cellWidth:15},1:{cellWidth:25},2:{cellWidth:25},3:{cellWidth:13,halign:"center"},4:{cellWidth:12,halign:"center"},5:{cellWidth:18},6:{cellWidth:9,halign:"right"},7:{cellWidth:7,halign:"right"},8:{cellWidth:7,halign:"right"},9:{cellWidth:7,halign:"right"},10:{cellWidth:10,halign:"right"},11:{cellWidth:13,halign:"center"},12:{cellWidth:14,halign:"right"},13:{cellWidth:18,halign:"right"},14:{cellWidth:13,halign:"right"},15:{cellWidth:16,halign:"right"},16:{cellWidth:20,halign:"right"} };
    for (const [customerName, pkgs] of groups) {
      const totalBeratGrup = pkgs.reduce((s: number, p: any) => s + (Number(p.usedWeight) || 0), 0);
      const totalOngkirGrup = pkgs.reduce((s: number, p: any) => s + (Number(p.totalShipping) || 0), 0);
      const hargaPerKg = pkgs.find((p: any) => p.shippingRate != null)?.shippingRate ?? null;
      if (210 - y < 22) { doc.addPage(); y = 10; }
      doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
      doc.text(`NAMA KONSUMEN       ${customerName}`, margin, y + 3);
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
      doc.text(`  Jumlah Paket:     ${pkgs.length}.0`, margin, y + 7.5);
      y += 12;
      const rows = pkgs.map((p: any, i: number) => [
        formatDate(p.packageDate || p.createdAt), p.resiNumber || "-", p.barcode || p.resiNumber || "-",
        p.statusVerifikasi === "SUDAH_DIVERIFIKASI" ? "SUDAH\nSCAN" : "BELUM\nSCAN",
        p.packageNumber || "-", p.customerName || "-",
        fNum(p.realWeight,1), fNum(p.length,0), fNum(p.width,0), fNum(p.height,0),
        p.volumeWeight != null ? fNum(p.volumeWeight,1) : "0.0", p.packagingType || "-",
        fNum(p.usedWeight,1),
        p.totalShipping != null ? `Rp ${Number(p.totalShipping).toLocaleString("id-ID")}` : "-",
        i === 0 ? totalBeratGrup.toFixed(1) : "",
        i === 0 && hargaPerKg != null ? `Rp ${Number(hargaPerKg).toLocaleString("id-ID")}` : (i === 0 ? "-" : ""),
        i === 0 ? `Rp ${totalOngkirGrup.toLocaleString("id-ID")}` : "",
      ]);
      autoTable(doc, {
        startY: y, head: tableHead, body: rows,
        didDrawPage: () => drawExportFooter(doc, user?.name || "Pengguna aktif"),
        styles: { fontSize: 5.8, cellPadding: 1.1, overflow: "ellipsize", lineColor: [200,200,200], lineWidth: 0.1 },
        headStyles: { fillColor: [185,28,28], textColor: 255, fontStyle: "bold", fontSize: 5.8, halign: "center", valign: "middle" },
        alternateRowStyles: { fillColor: [253,248,248] },
        columnStyles: colStyles, margin: { left: margin, right: margin },
        tableLineColor: [200,200,200], tableLineWidth: 0.1,
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
    if (filtered.length === 0) { toast({ variant: "destructive", title: "Tidak ada data", description: "Tidak ada paket yang cocok dengan filter." }); return; }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const judul = pdfJenis !== "all" ? pdfJenis : "Semua Jenis Jastip";
    const batchLabel = selectedPdfBatch ? `${selectedPdfBatch.namaKapal} (${selectedPdfBatch.kotaAsal} → ${selectedPdfBatch.tujuan})` : "-";
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("Jastip Anggun Jaya — Laporan Paket", 14, 14);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`Batch Pengiriman : ${batchLabel}`, 14, 21);
    doc.text(`Jenis Jastip     : ${judul}`, 14, 26);
    doc.text(`Dicetak          : ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`, 14, 31);
    doc.text(`Total Paket      : ${filtered.length} paket`, 14, 36);
    doc.text(`Filter           : Layanan ${pdfJenis === "all" ? "Semua" : pdfJenis} · Tanggal Semua · Status ${status === "all" ? "Semua" : status} · Kasir Semua`, 14, 41);
    const rows = filtered.map((p: any, i: number) => [
      i+1, formatDate(p.packageDate||p.createdAt), p.resiNumber||"-", p.packageNumber||"-",
      p.customerName||"-", p.serviceType||"-", p.itemName||"-",
      p.realWeight??"-", p.usedWeight??"-", p.totalWeight??"-",
      p.totalShipping ? `Rp ${Number(p.totalShipping).toLocaleString("id-ID")}` : "-",
      p.status==="diserahkan"?"Diserahkan":"Pending",
    ]);
    autoTable(doc, {
      startY: 46,
      head: [["No","Tanggal","No Resi","No Paket","Nama Konsumen","Jenis Jastip","Jenis Barang","Berat Real","Berat Digunakan","Total Berat","Total Ongkir","Status"]],
      body: rows,
      didDrawPage: () => drawExportFooter(doc, user?.name || "Pengguna aktif"),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [200,30,30], textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [250,245,245] },
      columnStyles: { 0:{halign:"center",cellWidth:8},1:{cellWidth:18},2:{cellWidth:22},3:{cellWidth:18},7:{halign:"right",cellWidth:16},8:{halign:"right",cellWidth:18},9:{halign:"right",cellWidth:16},10:{halign:"right",cellWidth:24},11:{halign:"center",cellWidth:18} },
      margin: { left: 14, right: 14 },
    });
    const namaFile = ["laporan-paket", selectedPdfBatch?selectedPdfBatch.namaKapal.replace(/\s+/g,"-").toLowerCase():"batch", pdfJenis!=="all"?pdfJenis.replace(/\s+/g,"-").toLowerCase():"semua"].join("_")+".pdf";
    doc.save(namaFile);
    setPdfOpen(false);
  }

  const showGroupedFields = isGroupedExport();
  const showNamaKapal = pdfJenis.toLowerCase() === "jastip pelni";
  const canExport = !!pdfBatchId && !!packages && packages.length > 0;

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

    const rows = data.map((p: any, i: number) => ({
      "No": i + 1,
      "Tanggal": formatDate(p.packageDate || p.createdAt),
      "No Resi": p.resiNumber || "",
      "No Paket": p.packageNumber || "",
      "Nama Konsumen": p.customerName || "",
      "No HP": p.customerPhone || "",
      "Batch": p.batchId ? (() => { const b = sortedBatches.find((b: any) => b.id === p.batchId); return b ? `${b.namaKapal} · ${b.kotaAsal}→${b.tujuan}` : String(p.batchId); })() : "",
      "Jenis Jastip": p.serviceType || "",
      "Rute": p.deliveryRoute || "",
      "Jenis Barang": p.itemName || "",
      "Berat Real (Kg)": p.realWeight != null ? Number(p.realWeight) : "",
      "P (cm)": p.length != null ? Number(p.length) : "",
      "L (cm)": p.width != null ? Number(p.width) : "",
      "T (cm)": p.height != null ? Number(p.height) : "",
      "Berat Volume (Kg)": p.volumeWeight != null ? Number(p.volumeWeight) : "",
      "Jenis Paking": packagingLabel(p.packagingType),
      "Berat Digunakan (Kg)": p.usedWeight != null ? Number(p.usedWeight) : "",
      "Ongkir/Kg": p.shippingRate != null ? Number(p.shippingRate) : "",
      "Total Berat (Kg)": p.totalWeight != null ? Number(p.totalWeight) : "",
      "Total Ongkir": p.totalShipping != null ? Number(p.totalShipping) : "",
      "Barcode": p.barcode || "",
      "Sudah Generate Barcode": p.barcode ? "Ya" : "Belum",
      "Sudah Diverifikasi": p.statusVerifikasi === "SUDAH_DIVERIFIKASI" ? "Ya" : "Belum",
      "Sudah Diambil": p.status === "diserahkan" ? "Ya" : "Belum",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 4 }, { wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 14 },
      { wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 20 },
      { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 14 },
      { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Paket");
    addExportInfoSheet(wb, "Monitor Paket — Jastip Anggun Jaya", {
      Layanan: "Semua",
      Batch: batchInfo,
      Tanggal: "Semua",
      Status: status === "all" ? "Semua" : status,
      Kasir: "Semua",
    });

    // Info sheet
    const infoRows = [
      ["Monitor Paket — Jastip Anggun Jaya"],
      ["Batch", batchInfo],
      ["Tanggal Ekspor", new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })],
      ["Total Paket", data.length],
      ["Sudah Generate Barcode", data.filter((p: any) => !!p.barcode).length],
      ["Sudah Diverifikasi", data.filter((p: any) => p.statusVerifikasi === "SUDAH_DIVERIFIKASI").length],
      ["Sudah Diambil", data.filter((p: any) => p.status === "diserahkan").length],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(infoRows);
    wsInfo["!cols"] = [{ wch: 24 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, "Info");

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
        <div className="p-4 border-b flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cari resi, no paket, customer..." className="pl-9" value={search} onChange={(e) => handleSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={handleStatus}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="diserahkan">Diserahkan</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Mobile card view */}
        <CardContent className="p-0 md:hidden">
          {isLoading ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">Memuat data...</div>
          ) : paginated && paginated.length > 0 ? (
            <div className="divide-y">
              {paginated.map((pkg) => (
                <div key={pkg.id} className="p-4 hover:bg-muted/20 transition-colors">
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
                  <div className="mt-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 w-full" disabled={deletingId === pkg.id}>
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
                {["Tanggal","No Resi","No Paket","Nama Konsumen","Jenis Jastip","Berat Real (Kg)","P (cm)","L (cm)","T (cm)","Berat Volume","Jenis Paking","Berat Digunakan","Ongkir/Kg","Total Berat","Total Ongkir","Status",""].map((h, i) => (
                  <th key={i} className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={16} className="h-24 text-center text-muted-foreground py-10">Memuat data...</td></tr>
              ) : paginated && paginated.length > 0 ? (
                paginated.map((pkg) => (
                  <tr key={pkg.id} className="border-b hover:bg-muted/20 transition-colors">
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
                    <td className="py-3 px-3 whitespace-nowrap">{packagingLabel((pkg as any).packagingType)}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right font-medium">{(pkg as any).usedWeight ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).shippingRate ? formatRp((pkg as any).shippingRate) : "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right">{(pkg as any).totalWeight ?? "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right font-semibold text-primary">{(pkg as any).totalShipping ? formatRp((pkg as any).totalShipping) : "-"}</td>
                    <td className="py-3 px-3 whitespace-nowrap"><StatusBadge status={pkg.status} /></td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50" disabled={deletingId === pkg.id}>
                            <Trash2 className="w-3.5 h-3.5" /> {deletingId === pkg.id ? "..." : "Hapus"}
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
                    <SelectItem key={b.id} value={String(b.id)}>
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
                        <span className="font-semibold">{preview.filter((p: any) => !!(p as any).barcode).length}</span>
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

      {/* PDF Export Dialog */}
      <Dialog open={pdfOpen} onOpenChange={handlePdfOpenChange}>
        <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="w-5 h-5 text-primary" />
              Export Laporan PDF
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
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
                    <SelectItem key={b.id} value={String(b.id)}>
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

            {showGroupedFields && showNamaKapal && (
              <div className="space-y-1.5">
                <Label>Nama Kapal <span className="text-muted-foreground font-normal text-xs">(Opsional)</span></Label>
                <input
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Contoh: KM DEMPO"
                  value={pdfNamaKapal}
                  onChange={(e) => setPdfNamaKapal(e.target.value)}
                />
              </div>
            )}

            {(pdfBatchId || pdfJenis !== "all" || pdfNamaKapal) && (
              <button
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground flex items-center gap-1"
                onClick={() => { setPdfBatchId(""); setPdfJenis("all"); setPdfNamaKapal(""); }}
              >
                <X className="w-3 h-3" /> Reset filter
              </button>
            )}
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
    </div>
  );
}
