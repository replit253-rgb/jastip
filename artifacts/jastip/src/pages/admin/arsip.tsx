import { useState } from "react";
import { useListPackages, useListBatches } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/pagination";
import {
  Archive, Search, Ship, CheckCircle2, Lock, Clock,
  ChevronDown, Download, FileDown, Package,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import * as XLSX from "xlsx";
import {
  addExportInfoSheet,
  createExportSheet,
  formatNumber,
  formatRp as formatExportRp,
  saveTabularPdf,
} from "@/lib/export-utils";

const PAGE_SIZE = 5;

function formatRp(n: any) {
  if (n == null) return "-";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

function formatTgl(val: any) {
  if (!val) return "";
  try { return new Date(val).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return String(val); }
}

function batchStatusColor(status: string) {
  if (status === "OPEN") return "bg-green-100 text-green-800 border-green-200";
  if (status === "CLOSED") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function batchStatusIcon(status: string) {
  if (status === "OPEN") return <CheckCircle2 className="w-3 h-3" />;
  if (status === "CLOSED") return <Lock className="w-3 h-3" />;
  return <Archive className="w-3 h-3" />;
}

function batchStatusLabel(status: string) {
  if (status === "OPEN") return "Aktif";
  if (status === "CLOSED") return "Ditutup";
  return "Arsip";
}

const ARSIP_EXPORT_COLUMNS = [
  "No", "Tanggal Paket", "Nama Penerima", "No Resi", "No Paket",
  "Jenis Jastip", "Jenis Barang", "Rute Pengiriman", "Berat Real (Kg)",
  "Berat Digunakan (Kg)", "Total Ongkir", "Status Pembayaran", "Tanggal Diambil",
];

function buildArsipExportRows(arsipPackages: any[]) {
  return arsipPackages.map((p: any, i: number) => [
    i + 1,
    formatTgl(p.packageDate),
    p.customerName || "",
    p.resiNumber || "",
    p.packageNumber || "",
    p.serviceType || "",
    p.itemName || "",
    p.deliveryRoute || "",
    formatNumber(p.realWeight, 2, ""),
    formatNumber(p.usedWeight, 2, ""),
    formatExportRp(p.totalShipping, ""),
    p.statusPembayaran || "",
    formatTgl(p.pickedUpAt),
  ]);
}

export default function AdminArsip() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const base = user?.role === "owner" ? "/owner" : "/admin";

  const { data: packages, isLoading: pkgLoading } = useListPackages();
  const { data: batches, isLoading: batchLoading } = useListBatches();
  const isLoading = pkgLoading || batchLoading;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const allPackages = packages || [];
  const allBatches = batches || [];

  // Semua paket yang sudah diserahkan/diambil
  const arsipPackages = allPackages.filter(
    (p: any) => p.statusPengambilan === "SUDAH_DIAMBIL" || p.status === "diserahkan"
  );

  // Untuk export: semua arsip
  function exportExcel() {
    const filters = {
      Layanan: "Semua",
      Batch: "Semua",
      Tanggal: "Semua",
      Status: "Diserahkan",
      Kasir: "Semua",
      "Diekspor Oleh": user?.name || "Pengguna aktif",
    };
    const rows = buildArsipExportRows(arsipPackages);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, createExportSheet({
      title: "Arsip Paket — Jastip Anggun Jaya",
      filters,
      columns: ARSIP_EXPORT_COLUMNS,
      rows,
    }), "Arsip Paket");
    addExportInfoSheet(wb, "Arsip Paket — Jastip Anggun Jaya", filters);
    XLSX.writeFile(wb, `arsip-paket-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportPdf() {
    const filters = {
      Layanan: "Semua",
      Batch: "Semua",
      Tanggal: "Semua",
      Status: "Diserahkan",
      Kasir: "Semua",
      "Diekspor Oleh": user?.name || "Pengguna aktif",
    };
    saveTabularPdf({
      filename: `arsip-paket-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: "Arsip Paket — Jastip Anggun Jaya",
      filters,
      columns: ARSIP_EXPORT_COLUMNS,
      rows: buildArsipExportRows(arsipPackages),
      landscape: true,
      exportedBy: user?.name || "Pengguna aktif",
    });
  }

  // Hitung per batch
  type BatchStat = {
    batch: any;
    diserahkan: number;
    pending: number;
    total: number;
  };

  const batchStats: BatchStat[] = allBatches
    .map((batch: any) => {
      const batchPkgs = allPackages.filter((p: any) => p.batchId === batch.id);
      const diserahkan = batchPkgs.filter(
        (p: any) => p.statusPengambilan === "SUDAH_DIAMBIL" || p.status === "diserahkan"
      ).length;
      const pending = batchPkgs.filter(
        (p: any) => p.statusPengambilan !== "SUDAH_DIAMBIL" && p.status !== "diserahkan"
      ).length;
      return { batch, diserahkan, pending, total: batchPkgs.length };
    })
    // Only show batches that have at least 1 package (total > 0)
    .filter((s: BatchStat) => s.total > 0);

  // Paket tanpa batch yang sudah diserahkan
  const noBatchArsip = arsipPackages.filter((p: any) => p.batchId == null);
  const noBatchPending = allPackages.filter(
    (p: any) => p.batchId == null && p.statusPengambilan !== "SUDAH_DIAMBIL" && p.status !== "diserahkan"
  ).length;

  // Filter by search (batch name)
  const filteredStats = batchStats.filter((s: BatchStat) =>
    !search ||
    (s.batch.namaKapal || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.batch.kotaAsal || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.batch.tujuan || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredStats.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filteredStats.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const totalDiserahkan = arsipPackages.length;
  const totalPending = allPackages.filter(
    (p: any) => p.statusPengambilan !== "SUDAH_DIAMBIL" && p.status !== "diserahkan"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Archive className="h-7 w-7 text-green-600" /> Arsip Paket
          </h1>
          <p className="text-muted-foreground mt-1">
            Paket dikelompokkan per batch. Klik batch untuk melihat barcode paket yang sudah diserahkan.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={exportExcel} disabled={arsipPackages.length === 0} className="flex items-center gap-2">
            <Download className="h-4 w-4" /> Export Excel
          </Button>
          <Button variant="outline" onClick={exportPdf} disabled={arsipPackages.length === 0} className="flex items-center gap-2">
            <FileDown className="h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground font-medium">Total Batch</p>
            <p className="text-xl font-bold mt-0.5 text-blue-600">{allBatches.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground font-medium">Sudah Diserahkan</p>
            <p className="text-xl font-bold mt-0.5 text-green-600">{totalDiserahkan} paket</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground font-medium">Belum Diserahkan</p>
            <p className="text-xl font-bold mt-0.5 text-amber-600">{totalPending} paket</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground font-medium">Total Ongkir Arsip</p>
            <p className="text-xl font-bold mt-0.5 text-primary">
              {formatRp(arsipPackages.reduce((s: number, p: any) => s + (p.totalShipping ?? 0), 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari nama batch, kota..."
          className="pl-9"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {/* Batch list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-24 pt-4 bg-muted/20" />
            </Card>
          ))}
        </div>
      ) : filteredStats.length === 0 && noBatchArsip.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Archive className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">
            {allBatches.length === 0 ? "Belum ada batch" : "Tidak ada batch yang cocok"}
          </p>
          <p className="text-sm mt-1">
            {allBatches.length === 0
              ? "Buat batch pengiriman terlebih dahulu"
              : "Coba ubah kata kunci pencarian"}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginated.map(({ batch, diserahkan, pending, total }) => {
              const pct = total > 0 ? Math.round((diserahkan / total) * 100) : 0;
              return (
                <Card
                  key={batch.id}
                  className={`border-2 cursor-pointer hover:shadow-md transition-shadow ${
                    batch.statusBatch === "OPEN" ? "border-blue-200" : "border-gray-200"
                  }`}
                  onClick={() => setLocation(`${base}/arsip/batch/${batch.id}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: icon + info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${batch.statusBatch === "OPEN" ? "bg-blue-100" : "bg-gray-100"}`}>
                          <Ship className={`w-5 h-5 ${batch.statusBatch === "OPEN" ? "text-blue-700" : "text-gray-500"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-base leading-snug">{batch.namaKapal}</span>
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${batchStatusColor(batch.statusBatch)}`}>
                              {batchStatusIcon(batch.statusBatch)}
                              {batchStatusLabel(batch.statusBatch)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {batch.kotaAsal} → {batch.tujuan}
                            &nbsp;·&nbsp; ETD: {formatTgl(batch.etd)}
                            &nbsp;·&nbsp; Closing: {formatTgl(batch.periodeClosingMulai)} – {formatTgl(batch.periodeClosingSelesai)}
                          </p>

                          {/* Status counts */}
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                              {diserahkan} diserahkan
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3" />
                              {pending} belum diserahkan
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {total} total paket
                            </span>
                          </div>

                          {/* Progress bar */}
                          {total > 0 && (
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-green-500 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0">{pct}% selesai</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: chevron */}
                      <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </CardHeader>
                </Card>
              );
            })}

            {/* Paket tanpa batch */}
            {noBatchArsip.length > 0 && !search && (
              <Card className="border-2 border-dashed border-gray-300 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setLocation(`${base}/arsip/batch/no-batch`)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gray-100 shrink-0">
                      <Package className="w-5 h-5 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base">Paket Tanpa Batch</span>
                        <Badge variant="outline" className="text-xs">Tidak ada batch</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> {noBatchArsip.length} diserahkan
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" /> {noBatchPending} belum diserahkan
                        </span>
                      </div>
                    </div>
                    <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                  </div>
                </CardHeader>
              </Card>
            )}
          </div>

          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={filteredStats.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
