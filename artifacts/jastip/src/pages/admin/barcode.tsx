import { useEffect, useMemo, useRef, useState } from "react";
import { useListPackages, getListPackagesQueryKey, useListBatches } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/pagination";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, Printer, Search, ArrowLeft, QrCode, CheckCircle2, Pencil, Trash2, Ship, ChevronDown, ChevronUp, Lock, Archive, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { labelDocumentHtml, labelPageHtml, qrSectionHtml, groupQrValue } from "@/lib/print-label";

const PAGE_SIZE = 15;
const BATCH_PAGE_SIZE = 5;

const SERVICE_TYPES = [
  { value: "jastip pesawat", label: "Jastip Pesawat" },
  { value: "jastip hemat+", label: "Jastip Hemat+" },
  { value: "jastip kargo", label: "Jastip Kargo" },
  { value: "jastip pelni", label: "Jastip Pelni" },
];

function formatRp(n: any) {
  if (n == null) return "-";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

const serviceLabel: Record<string, string> = {
  "jastip pesawat": "Jastip Pesawat",
  "jastip hemat+": "Jastip Hemat+",
  "jastip kargo": "Jastip Kargo",
  "jastip pelni": "Jastip Pelni",
};

const deliveryRouteOptions: Record<string, { value: string; label: string }[]> = {
  "jastip pesawat": [{ value: "Jakarta → Manokwari", label: "Jakarta → Manokwari" }],
  "jastip hemat+": [{ value: "Surabaya → Manokwari", label: "Surabaya → Manokwari" }],
  "jastip kargo": [{ value: "Jakarta/Surabaya → Manokwari", label: "Jakarta/Surabaya → Manokwari" }],
  "jastip pelni": [
    { value: "Jakarta → Manokwari", label: "Jakarta → Manokwari" },
    { value: "Surabaya → Manokwari", label: "Surabaya → Manokwari" },
  ],
};

interface EditForm {
  resiNumber: string;
  packageNumber: string;
  customerName: string;
  itemName: string;
  serviceType: string;
  deliveryRoute: string;
  packagingType: string;
  packageDate: string;
  realWeight: string;
  length: string;
  width: string;
  height: string;
}

function buildSinglePrintHtml(pkg: any, qrDataUrl: string, qrValue: string, batchLabel?: string) {
  const pkgDate = pkg.packageDate
    ? new Date(pkg.packageDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
    : "-";
  const serviceType = pkg.serviceType ? pkg.serviceType.replace("jastip ", "Jastip ") : "-";
  const ongkir = pkg.totalShipping != null ? "Rp " + Number(pkg.totalShipping).toLocaleString("id-ID") : "-";
  const batchRow = batchLabel
    ? `<div class="field full"><div class="fl">Batch Pengiriman</div><div class="fv" style="color:#1d4ed8;">${batchLabel}</div></div>`
    : "";
  const isKargo = (pkg.serviceType || "").toLowerCase() === "jastip kargo";
  const inner = `${qrSectionHtml(qrDataUrl, qrValue)}
    <div class="info${isKargo ? " compact" : ""}">
      <div class="cust">${pkg.customerName || "-"}</div>
      <div class="grid">
        <div class="field"><div class="fl">No. Resi</div><div class="fv mono">${pkg.resiNumber || "-"}</div></div>
        <div class="field"><div class="fl">No. Paket</div><div class="fv mono">${pkg.packageNumber || "-"}</div></div>
        <div class="field"><div class="fl">Tanggal</div><div class="fv">${pkgDate}</div></div>
        <div class="field"><div class="fl">Jenis Jastip</div><div class="fv">${serviceType}</div></div>
        <div class="field full"><div class="fl">Rute</div><div class="fv">${pkg.deliveryRoute || "-"}</div></div>
        <div class="field"><div class="fl">Berat Real</div><div class="fv">${pkg.realWeight != null ? pkg.realWeight + " Kg" : "-"}</div></div>
        <div class="field"><div class="fl">Berat Digunakan</div><div class="fv">${pkg.usedWeight != null ? pkg.usedWeight + " Kg" : "-"}</div></div>
        <div class="field"><div class="fl">Jenis Paking</div><div class="fv">${pkg.packagingType || "-"}</div></div>
        <div class="field"><div class="fl">Total Ongkir</div><div class="fv red">${ongkir}</div></div>
        ${batchRow}
      </div>
    </div>`;
  return labelDocumentHtml(`Label Paket - ${pkg.resiNumber || pkg.barcode}`, labelPageHtml(inner));
}

function buildGroupedPrintHtml(pkgs: any[], qrDataUrl: string, qrValue: string, batchLabel?: string) {
  const first = pkgs[0];
  const totalWeight = pkgs.reduce((s, p) => s + (p.usedWeight ?? p.realWeight ?? 0), 0);
  const totalShipping = pkgs.reduce((s, p) => s + (p.totalShipping ?? 0), 0);
  const batchRow = batchLabel
    ? `<div class="field full"><div class="fl">Batch Pengiriman</div><div class="fv" style="color:#1d4ed8;">${batchLabel}</div></div>`
    : "";
  const inner = `${qrSectionHtml(qrDataUrl, qrValue)}
    <div class="info">
      <div class="cust">${first?.customerName || "-"}</div>
      <div class="grid">
        <div class="field"><div class="fl">Total Paket</div><div class="fv">${pkgs.length} pkt</div></div>
        <div class="field"><div class="fl">Total Berat</div><div class="fv">${totalWeight.toFixed(3)} Kg</div></div>
        <div class="field"><div class="fl">Jenis Jastip</div><div class="fv">${first?.serviceType ? first.serviceType.replace("jastip ", "Jastip ") : "-"}</div></div>
        <div class="field"><div class="fl">Total Ongkir</div><div class="fv red">Rp ${totalShipping.toLocaleString("id-ID")}</div></div>
        <div class="field full"><div class="fl">Rute</div><div class="fv">${first?.deliveryRoute || "-"}</div></div>
        ${batchRow}
      </div>
    </div>`;
  return labelDocumentHtml(`Label Grup - ${first?.customerName}`, labelPageHtml(inner));
}

function BarcodeItem({
  pkg,
  onEdit,
  onDelete,
  batchLabel,
}: {
  pkg: any;
  onEdit: (pkg: any) => void;
  onDelete: (pkg: any) => void;
  batchLabel?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, pkg.barcode || pkg.resiNumber || pkg.id.toString(), {
        width: 160,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).catch(() => {});
    }
  }, [pkg]);

  async function printBarcode() {
    const qrValue = pkg.barcode || pkg.resiNumber || pkg.id.toString();
    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL(qrValue, { width: 400, margin: 3, color: { dark: "#000000", light: "#ffffff" } });
    } catch { return; }
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(buildSinglePrintHtml(pkg, qrDataUrl, qrValue, batchLabel));
    win.document.close();
  }

  function downloadBarcode() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `qr-${pkg.barcode || pkg.resiNumber || pkg.id}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate font-mono">{pkg.barcode || pkg.resiNumber || "No Barcode"}</p>
            <p className="text-xs text-muted-foreground">No Resi: {pkg.resiNumber || "-"}</p>
            <p className="text-xs text-muted-foreground">Konsumen: {pkg.customerName || "-"}</p>
            {pkg.serviceType && (
              <p className="text-xs text-muted-foreground capitalize">{pkg.serviceType}</p>
            )}
            {batchLabel && (
              <p className="text-xs font-semibold text-blue-700 mt-0.5">📦 {batchLabel}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
            <Badge
              variant="outline"
              className={`text-xs ${pkg.status === "diserahkan" ? "bg-green-100 text-green-800 border-green-300" : "bg-amber-100 text-amber-800 border-amber-300"}`}
            >
              {pkg.status === "diserahkan" ? "Diserahkan" : "Pending"}
            </Badge>
          </div>
        </div>
        <div className="flex justify-center bg-white border rounded-lg p-2 mb-3">
          <canvas ref={canvasRef} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mb-2 text-xs text-muted-foreground">
          {pkg.usedWeight != null && <span>Berat: {pkg.usedWeight} Kg</span>}
          {pkg.totalShipping != null && <span>Ongkir: {formatRp(pkg.totalShipping)}</span>}
        </div>
        <div className="flex gap-1.5 mb-1.5">
          <Button size="sm" variant="outline" className="flex-1 min-w-0 px-2 text-xs" onClick={printBarcode}>
            <Printer className="w-3 h-3 mr-1 shrink-0" /> <span className="truncate">Cetak</span>
          </Button>
          <Button size="sm" variant="outline" className="flex-1 min-w-0 px-2 text-xs" onClick={downloadBarcode}>
            <Download className="w-3 h-3 mr-1 shrink-0" /> <span className="truncate">Unduh</span>
          </Button>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="flex-1 min-w-0 px-2 text-xs border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => onEdit(pkg)}>
            <Pencil className="w-3 h-3 mr-1 shrink-0" /> <span className="truncate">Edit</span>
          </Button>
          {user?.role === "owner" && (
            <Button size="sm" variant="outline" className="flex-1 min-w-0 px-2 text-xs border-red-300 text-red-600 hover:bg-red-50" onClick={() => onDelete(pkg)}>
              <Trash2 className="w-3 h-3 mr-1 shrink-0" /> <span className="truncate">Hapus</span>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GroupedBarcodeItem({
  pkgs,
  batchLabel,
}: {
  pkgs: any[];
  batchLabel?: string;
  onEdit?: (pkg: any) => void;
  onDelete?: (pkg: any) => void;
}) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const base = user?.role === "owner" ? "/owner" : "/admin";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const first = pkgs[0];
  const qrValue = groupQrValue(pkgs);
  const totalWeight = pkgs.reduce((s, p) => s + (p.usedWeight ?? p.realWeight ?? 0), 0);
  const totalShipping = pkgs.reduce((s, p) => s + (p.totalShipping ?? 0), 0);
  const allPending = pkgs.every((p) => p.status !== "diserahkan");
  const allDone = pkgs.every((p) => p.status === "diserahkan");

  useEffect(() => {
    if (canvasRef.current && qrValue) {
      QRCode.toCanvas(canvasRef.current, qrValue, {
        width: 160, margin: 2, color: { dark: "#000000", light: "#ffffff" },
      }).catch(() => {});
    }
  }, [qrValue]);

  async function printBarcode() {
    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL(qrValue, { width: 400, margin: 3, color: { dark: "#000000", light: "#ffffff" } });
    } catch { return; }
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(buildGroupedPrintHtml(pkgs, qrDataUrl, qrValue, batchLabel));
    win.document.close();
  }

  function downloadBarcode() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `qr-grup-${first?.customerName || first?.id}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  return (
    <Card className="hover:shadow-md transition-shadow border-blue-200">
      <CardContent className="pt-4 pb-3">
        <div className="mb-2">
          <p className="font-bold text-sm leading-snug break-words line-clamp-2" title={first?.customerName || "-"}>
            {first?.customerName || "-"}
          </p>
          <div className="flex items-center justify-between gap-2 mt-1">
            <p className="text-xs text-muted-foreground truncate">{pkgs.length} paket · {totalWeight.toFixed(3)} Kg</p>
            <Badge
              variant="outline"
              className={`text-xs shrink-0 ${allDone ? "bg-green-100 text-green-800 border-green-300" : allPending ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-blue-100 text-blue-800 border-blue-300"}`}
            >
              {allDone ? "Diserahkan" : allPending ? "Pending" : "Sebagian"}
            </Badge>
          </div>
          {first?.serviceType && (
            <p className="text-xs text-muted-foreground capitalize truncate">{first.serviceType}</p>
          )}
          {batchLabel && (
            <p className="text-xs font-semibold text-blue-700 mt-0.5 truncate">📦 {batchLabel}</p>
          )}
        </div>
        <div className="flex justify-center bg-white border rounded-lg p-2 mb-2">
          <canvas ref={canvasRef} />
        </div>
        <div className="mb-2 space-y-0.5">
          {pkgs.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono truncate max-w-[120px]">#{i + 1} {p.resiNumber || "-"}</span>
              <span>{p.usedWeight != null ? p.usedWeight + " Kg" : "-"}</span>
            </div>
          ))}
        </div>
        <div className="text-xs font-semibold text-primary mb-2">Total Ongkir: {formatRp(totalShipping)}</div>
        <div className="flex gap-1.5 mb-1.5">
          <Button size="sm" variant="outline" className="flex-1 min-w-0 px-2 text-xs" onClick={printBarcode}>
            <Printer className="w-3 h-3 mr-1 shrink-0" /> <span className="truncate">Cetak</span>
          </Button>
          <Button size="sm" variant="outline" className="flex-1 min-w-0 px-2 text-xs" onClick={downloadBarcode}>
            <Download className="w-3 h-3 mr-1 shrink-0" /> <span className="truncate">Unduh</span>
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
          onClick={() => {
            const params = new URLSearchParams({ name: first?.customerName || "" });
            if (first?.serviceType) params.set("serviceType", first.serviceType);
            if (first?.batchId != null) params.set("batchId", String(first.batchId));
            setLocation(`${base}/barcode-group?${params.toString()}`);
          }}
        >
          <Pencil className="w-3 h-3 mr-1" /> Edit / Kelola Paket
        </Button>
      </CardContent>
    </Card>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

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

function fmtDate(d: string) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function groupPkgsByCustomer(pkgs: any[]) {
  const map = new Map<string, any[]>();
  for (const p of pkgs) {
    // Paket Cargo (jastip kargo) tidak digabung — tiap paket jadi kartu sendiri
    const key = (p.serviceType || "").toLowerCase() === "jastip kargo"
      ? `__kargo__|${p.id}`
      : [
          (p.customerName || "").trim().toLowerCase(),
          (p.serviceType || "").toLowerCase(),
          String(p.batchId ?? ""),
        ].join("|");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return [...map.values()];
}

// ── BatchBarcodeSection ───────────────────────────────────────────────────────

function BatchBarcodeSection({
  batch,
  packages,
  batchLabel,
  search,
  filterServiceType,
  onEdit,
  onDelete,
}: {
  batch: any;
  packages: any[];
  batchLabel: string;
  search: string;
  filterServiceType: string;
  onEdit: (pkg: any) => void;
  onDelete: (pkg: any) => void;
}) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const base = user?.role === "owner" ? "/owner" : "/admin";

  // packages sudah pre-filtered by batchId + active status di parent (useMemo)
  const batchPkgs = packages;

  const filtered = batchPkgs.filter((p: any) =>
    (filterServiceType === "all" || (p.serviceType || "").toLowerCase() === filterServiceType) &&
    (!search ||
      (p.barcode || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.resiNumber || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.packageNumber || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.customerName || "").toLowerCase().includes(search.toLowerCase()))
  );

  const totalBatchPkgs = batchPkgs.length;
  const hasFilter = filterServiceType !== "all" || !!search;

  async function printBatch() {
    if (!batchPkgs.length) return;
    const pages: string[] = [];
    for (const pkg of batchPkgs) {
      const qrValue = pkg.barcode || pkg.resiNumber || String(pkg.id);
      let qrDataUrl = "";
      try {
        qrDataUrl = await QRCode.toDataURL(qrValue, { width: 400, margin: 3, color: { dark: "#000000", light: "#ffffff" } });
      } catch { continue; }
      const isKargoPkg = (pkg.serviceType || "").toLowerCase() === "jastip kargo";
      pages.push(labelPageHtml(`${qrSectionHtml(qrDataUrl, qrValue)}
        <div class="info${isKargoPkg ? " compact" : ""}">
          <div class="cust">${pkg.customerName || "-"}</div>
          <div class="grid">
            <div class="field"><div class="fl">No. Resi</div><div class="fv mono">${pkg.resiNumber || "-"}</div></div>
            <div class="field"><div class="fl">No. Paket</div><div class="fv mono">${pkg.packageNumber || "-"}</div></div>
            <div class="field"><div class="fl">Tanggal</div><div class="fv">${pkg.packageDate ? new Date(pkg.packageDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "-"}</div></div>
            <div class="field"><div class="fl">Jenis Jastip</div><div class="fv">${pkg.serviceType ? pkg.serviceType.replace("jastip ", "Jastip ") : "-"}</div></div>
            <div class="field full"><div class="fl">Rute</div><div class="fv">${pkg.deliveryRoute || "-"}</div></div>
            <div class="field"><div class="fl">Berat Digunakan</div><div class="fv">${pkg.usedWeight != null ? pkg.usedWeight + " Kg" : "-"}</div></div>
            <div class="field"><div class="fl">Total Ongkir</div><div class="fv red">${pkg.totalShipping != null ? "Rp " + Number(pkg.totalShipping).toLocaleString("id-ID") : "-"}</div></div>
            <div class="field full"><div class="fl">Batch Pengiriman</div><div class="fv" style="color:#1d4ed8;">${batchLabel}</div></div>
          </div>
        </div>`));
    }
    if (!pages.length) return;
    const html = labelDocumentHtml(`Print Barcode — ${batchLabel}`, pages.join(""));
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  return (
    <Card
      className={`border-2 cursor-pointer hover:shadow-md transition-shadow ${batch.statusBatch === "OPEN" ? "border-blue-200" : "border-gray-200"}`}
      onClick={() => setLocation(`${base}/barcode/batch/${batch.id}`)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${batch.statusBatch === "OPEN" ? "bg-blue-100" : "bg-gray-100"}`}>
              <Ship className={`w-5 h-5 ${batch.statusBatch === "OPEN" ? "text-blue-700" : "text-gray-500"}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-base leading-snug">{batch.namaKapal}</span>
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${batchStatusColor(batch.statusBatch)}`}>
                  {batchStatusIcon(batch.statusBatch)}
                  {batchStatusLabel(batch.statusBatch)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {batch.kotaAsal} → {batch.tujuan} &nbsp;·&nbsp;
                ETD: {fmtDate(batch.etd)} &nbsp;·&nbsp;
                Closing: {fmtDate(batch.periodeClosingMulai)} – {fmtDate(batch.periodeClosingSelesai)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-semibold text-foreground">{totalBatchPkgs} paket aktif</span>
                {hasFilter && filtered.length !== totalBatchPkgs && (
                  <span className="ml-1 text-primary font-medium">· {filtered.length} ditampilkan (filter aktif)</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {totalBatchPkgs > 0 && (
              <button
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors"
                onClick={(e) => { e.stopPropagation(); printBatch(); }}
                title="Cetak semua barcode batch ini"
              >
                <Printer className="w-3.5 h-3.5" /> Cetak
              </button>
            )}
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

// ── NoBatchSection ────────────────────────────────────────────────────────────

function NoBatchSection({
  packages,
  search,
  filterServiceType,
  onEdit,
  onDelete,
}: {
  packages: any[];
  search: string;
  filterServiceType: string;
  onEdit: (pkg: any) => void;
  onDelete: (pkg: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const noBatch = packages.filter(
    (p: any) => p.batchId == null && p.statusPengambilan !== "SUDAH_DIAMBIL" && p.status !== "diserahkan"
  );

  const filtered = noBatch.filter((p: any) =>
    (filterServiceType === "all" || (p.serviceType || "").toLowerCase() === filterServiceType) &&
    (!search ||
      (p.barcode || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.resiNumber || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.packageNumber || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.customerName || "").toLowerCase().includes(search.toLowerCase()))
  );

  const groups = groupPkgsByCustomer(filtered);

  if (noBatch.length === 0) return null;

  return (
    <Card className="border-2 border-dashed border-gray-300">
      <CardHeader
        className="pb-3 cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-t-lg"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 rounded-lg bg-gray-100 shrink-0">
              <Clock className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base">Paket Tanpa Batch</span>
                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium bg-gray-100 text-gray-600 border-gray-200">
                  Belum diassign
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-semibold text-foreground">{noBatch.length} paket</span> — belum dimasukkan ke batch pengiriman manapun
              </p>
            </div>
          </div>
          {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 pb-4">
          <div className="border-t pt-4">
            {groups.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">Tidak ada paket yang cocok dengan filter saat ini.</p>
            ) : (
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                {groups.map((pkgs) =>
                  (pkgs[0]?.serviceType || "").toLowerCase() === "jastip kargo" ? (
                    <BarcodeItem
                      key={`kargo|${pkgs[0].id}`}
                      pkg={pkgs[0]}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ) : (
                    <GroupedBarcodeItem
                      key={`${pkgs[0]?.customerName}|${pkgs[0]?.serviceType}|nobatch`}
                      pkgs={pkgs}
                    />
                  )
                )}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── AdminBarcode ──────────────────────────────────────────────────────────────

export default function AdminBarcode() {
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  // Tidak pakai filter status=pending agar cache key sama dengan halaman lain (arsip, dll)
  // sehingga data tidak di-fetch ulang saat pindah halaman.
  const { data: packages, isLoading } = useListPackages();
  const { data: batches } = useListBatches();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const base = user?.role === "owner" ? "/owner" : "/admin";

  const [editPkg, setEditPkg] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    resiNumber: "", packageNumber: "", customerName: "", itemName: "",
    serviceType: "", deliveryRoute: "", packagingType: "", packageDate: "",
    realWeight: "", length: "", width: "", height: "",
  });
  const [isEditSaving, setIsEditSaving] = useState(false);

  const [deletePkg, setDeletePkg] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [filterServiceType, setFilterServiceType] = useState<string>("all");
  const [batchPage, setBatchPage] = useState(1);

  const idsParam = new URLSearchParams(window.location.search).get("ids");
  const highlightIds = idsParam ? idsParam.split(",").map(Number).filter(Boolean) : null;

  const allPackages = useMemo(() => packages || [], [packages]);
  const allBatches = useMemo(() => batches || [], [batches]);

  // Paket aktif (belum diserahkan) — dihitung sekali, tidak diulang tiap render
  const activePackages = useMemo(
    () => allPackages.filter((p: any) => p.statusPengambilan !== "SUDAH_DIAMBIL" && p.status !== "diserahkan"),
    [allPackages]
  );

  const sudahDiambilCount = useMemo(
    () => allPackages.filter((p: any) => p.statusPengambilan === "SUDAH_DIAMBIL" || p.status === "diserahkan").length,
    [allPackages]
  );

  const noBatchPkgs = useMemo(
    () => activePackages.filter((p: any) => p.batchId == null),
    [activePackages]
  );

  // Pre-group paket aktif per batchId — O(N) sekali, bukan O(N×M) tiap render
  const packagesByBatch = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const p of activePackages) {
      if (p.batchId != null) {
        if (!map.has(p.batchId)) map.set(p.batchId, []);
        map.get(p.batchId)!.push(p);
      }
    }
    return map;
  }, [activePackages]);

  const batchMap = useMemo(
    () => new Map<number, string>((allBatches).map((b: any) => [b.id, b.name || `Batch #${b.id}`])),
    [allBatches]
  );

  const totalBatchPages = useMemo(() => Math.max(1, Math.ceil(allBatches.length / BATCH_PAGE_SIZE)), [allBatches]);
  const safeBatchPage = Math.min(batchPage, totalBatchPages);
  const paginatedBatches = useMemo(
    () => allBatches.slice((safeBatchPage - 1) * BATCH_PAGE_SIZE, safeBatchPage * BATCH_PAGE_SIZE),
    [allBatches, safeBatchPage]
  );

  const totalActive = activePackages.length;

  // Hitung jumlah paket per jenis jastip sekali saja, bukan di tiap render JSX
  const serviceTypeCounts = useMemo(() => ({
    "jastip pesawat": activePackages.filter((p: any) => (p.serviceType || "").toLowerCase() === "jastip pesawat").length,
    "jastip hemat+": activePackages.filter((p: any) => (p.serviceType || "").toLowerCase() === "jastip hemat+").length,
    "jastip kargo": activePackages.filter((p: any) => (p.serviceType || "").toLowerCase() === "jastip kargo").length,
    "jastip pelni": activePackages.filter((p: any) => (p.serviceType || "").toLowerCase() === "jastip pelni").length,
  }), [activePackages]);

  function handleSearch(v: string) { setSearch(v); }

  function openEdit(pkg: any) {
    setEditPkg(pkg);
    setEditForm({
      resiNumber: pkg.resiNumber || "",
      packageNumber: pkg.packageNumber || "",
      customerName: pkg.customerName || "",
      itemName: pkg.itemName || "",
      serviceType: pkg.serviceType || "",
      deliveryRoute: pkg.deliveryRoute || "",
      packagingType: pkg.packagingType || "",
      packageDate: pkg.packageDate ? pkg.packageDate.split("T")[0] : "",
      realWeight: pkg.realWeight != null ? String(pkg.realWeight) : "",
      length: pkg.length != null ? String(pkg.length) : "",
      width: pkg.width != null ? String(pkg.width) : "",
      height: pkg.height != null ? String(pkg.height) : "",
    });
  }

  async function saveEdit() {
    if (!editPkg) return;
    setIsEditSaving(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const r = await fetch(`/api/packages/${editPkg.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          resiNumber: editForm.resiNumber,
          packageNumber: editForm.packageNumber || null,
          customerName: editForm.customerName,
          itemName: editForm.itemName || null,
          serviceType: editForm.serviceType || null,
          deliveryRoute: editForm.deliveryRoute || null,
          packagingType: editForm.packagingType || null,
          packageDate: editForm.packageDate || null,
          realWeight: editForm.realWeight ? Number(editForm.realWeight) : null,
          length: editForm.length ? Number(editForm.length) : null,
          width: editForm.width ? Number(editForm.width) : null,
          height: editForm.height ? Number(editForm.height) : null,
        }),
      });
      if (!r.ok) throw new Error("Gagal menyimpan perubahan");
      await queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
      toast({ title: "Berhasil", description: "Data paket berhasil diperbarui." });
      setEditPkg(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gagal", description: err.message });
    } finally {
      setIsEditSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deletePkg) return;
    setIsDeleting(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const r = await fetch(`/api/packages/${deletePkg.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Gagal menghapus paket");
      await queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
      toast({ title: "Berhasil", description: `Paket ${deletePkg.resiNumber} berhasil dihapus.` });
      setDeletePkg(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gagal", description: err.message });
    } finally {
      setIsDeleting(false);
    }
  }

  async function doPrintBarcodes(pkgs: any[], title = "Print Barcode — Jastip Anggun Jaya") {
    if (!pkgs.length) return;
    const pages: string[] = [];
    for (const pkg of pkgs) {
      const qrValue = pkg.barcode || pkg.resiNumber || String(pkg.id);
      let qrDataUrl = "";
      try {
        qrDataUrl = await QRCode.toDataURL(qrValue, { width: 400, margin: 3, color: { dark: "#000000", light: "#ffffff" } });
      } catch { continue; }
      const isKargoBulk = (pkg.serviceType || "").toLowerCase() === "jastip kargo";
      pages.push(labelPageHtml(`${qrSectionHtml(qrDataUrl, qrValue)}
        <div class="info${isKargoBulk ? " compact" : ""}">
          <div class="cust">${pkg.customerName || "-"}</div>
          <div class="grid">
            <div class="field"><div class="fl">No. Resi</div><div class="fv mono">${pkg.resiNumber || "-"}</div></div>
            <div class="field"><div class="fl">No. Paket</div><div class="fv mono">${pkg.packageNumber || "-"}</div></div>
            <div class="field"><div class="fl">Tanggal</div><div class="fv">${pkg.packageDate ? new Date(pkg.packageDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "-"}</div></div>
            <div class="field"><div class="fl">Status</div><div class="fv"><span class="status" style="background:${pkg.status === "diserahkan" ? "#dcfce7" : "#fef9c3"};color:${pkg.status === "diserahkan" ? "#166534" : "#713f12"}">${pkg.status === "diserahkan" ? "✓ Diserahkan" : "● Pending"}</span></div></div>
            <div class="field"><div class="fl">Jenis Jastip</div><div class="fv">${pkg.serviceType ? pkg.serviceType.replace("jastip ", "Jastip ") : "-"}</div></div>
            <div class="field full"><div class="fl">Rute</div><div class="fv">${pkg.deliveryRoute || "-"}</div></div>
            <div class="field"><div class="fl">Berat Digunakan</div><div class="fv">${pkg.usedWeight != null ? pkg.usedWeight + " Kg" : "-"}</div></div>
            <div class="field"><div class="fl">Total Ongkir</div><div class="fv red">${pkg.totalShipping != null ? "Rp " + Number(pkg.totalShipping).toLocaleString("id-ID") : "-"}</div></div>
          </div>
        </div>`));
    }
    if (!pages.length) return;
    const html = labelDocumentHtml(title, pages.join(""));
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  async function printAllBarcodes() {
    await doPrintBarcodes(allPackages, "Print Semua Barcode — Jastip Anggun Jaya");
  }

  const editIsKargo = editForm.serviceType === "jastip kargo";
  const editRouteOpts = deliveryRouteOptions[editForm.serviceType] || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setLocation(`${base}/packages`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <QrCode className="h-7 w-7 text-primary" />
              Label Barcode Paket
            </h1>
            <p className="text-muted-foreground mt-1">
              Barcode dikelompokkan per batch pengiriman. Klik batch untuk melihat &amp; cetak barcode.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 items-center">
          <Button
            variant="outline"
            onClick={printAllBarcodes}
            disabled={activePackages.length === 0}
            className="flex items-center gap-2"
          >
            <Printer className="h-4 w-4" /> Print Semua
          </Button>
        </div>
      </div>

      {/* Notif paket baru dari input grup */}
      {highlightIds && highlightIds.length > 0 && (
        <Card className="border-green-500 bg-green-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-800">Barcode siap — {highlightIds.length} paket baru ditambahkan</p>
                <p className="text-sm text-green-700 mt-0.5">Cari batch yang sesuai dan klik untuk melihat barcode.</p>
              </div>
              <Button size="sm" variant="outline" className="border-green-400 text-green-700" onClick={() => setLocation(`${base}/barcode`)}>
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter jenis jastip + search */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { value: "all", label: "Semua Jastip" },
          { value: "jastip pesawat", label: "Pesawat" },
          { value: "jastip hemat+", label: "Hemat+" },
          { value: "jastip kargo", label: "Kargo" },
          { value: "jastip pelni", label: "Pelni" },
        ].map((opt) => {
          const count = opt.value === "all"
            ? totalActive
            : serviceTypeCounts[opt.value as keyof typeof serviceTypeCounts] ?? 0;
          return (
            <Button
              key={opt.value}
              size="sm"
              variant={filterServiceType === opt.value ? "default" : "outline"}
              onClick={() => setFilterServiceType(opt.value)}
              className="text-xs"
            >
              {opt.label}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${filterServiceType === opt.value ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`}>
                {count}
              </span>
            </Button>
          );
        })}
        {sudahDiambilCount > 0 && (
          <Button size="sm" variant="outline" className="text-xs border-green-300 text-green-700 hover:bg-green-50"
            onClick={() => setLocation(`${base}/arsip`)}>
            <span className="mr-1">✓</span> Arsip ({sudahDiambilCount})
          </Button>
        )}
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari konsumen, resi..."
            className="pl-9 w-56 text-sm"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Main content: batch cards */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse"><CardContent className="pt-4 h-20 bg-muted/20 rounded-xl" /></Card>
          ))}
        </div>
      ) : allBatches.length === 0 && noBatchPkgs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <QrCode className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">Belum ada paket</p>
          <p className="text-sm mt-1">Buat batch dan tambah paket terlebih dahulu</p>
          <div className="flex gap-2 justify-center mt-4">
            <Button variant="outline" onClick={() => setLocation(`${base}/batches`)}>Kelola Batch</Button>
            <Button onClick={() => setLocation(`${base}/packages/type`)}>Input Paket</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedBatches.map((batch: any) => {
            const label = batch.namaKapal || `Batch #${batch.id}`;
            return (
              <BatchBarcodeSection
                key={batch.id}
                batch={batch}
                packages={packagesByBatch.get(batch.id) || []}
                batchLabel={label}
                search={search}
                filterServiceType={filterServiceType}
                onEdit={openEdit}
                onDelete={(pkg) => setDeletePkg(pkg)}
              />
            );
          })}

          {noBatchPkgs.length > 0 && safeBatchPage === totalBatchPages && (
            <NoBatchSection
              packages={allPackages}
              search={search}
              filterServiceType={filterServiceType}
              onEdit={openEdit}
              onDelete={(pkg) => setDeletePkg(pkg)}
            />
          )}

          <Pagination
            page={safeBatchPage}
            totalPages={totalBatchPages}
            total={allBatches.length}
            pageSize={BATCH_PAGE_SIZE}
            onPageChange={setBatchPage}
          />
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editPkg} onOpenChange={(o) => { if (!o) setEditPkg(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Paket — {editPkg?.barcode}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">No Resi *</label>
              <Input value={editForm.resiNumber} onChange={e => setEditForm(f => ({ ...f, resiNumber: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">No Paket</label>
              <Input value={editForm.packageNumber} onChange={e => setEditForm(f => ({ ...f, packageNumber: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nama Konsumen *</label>
              <Input value={editForm.customerName} onChange={e => setEditForm(f => ({ ...f, customerName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tanggal</label>
              <Input type="date" value={editForm.packageDate} onChange={e => setEditForm(f => ({ ...f, packageDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Jenis Jastip</label>
              <Select value={editForm.serviceType} onValueChange={v => setEditForm(f => ({
                ...f,
                serviceType: v,
                deliveryRoute: deliveryRouteOptions[v]?.[0]?.value || "",
              }))}>
                <SelectTrigger><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jastip pesawat">Jastip Pesawat</SelectItem>
                  <SelectItem value="jastip hemat+">Jastip Hemat+</SelectItem>
                  <SelectItem value="jastip kargo">Jastip Kargo</SelectItem>
                  <SelectItem value="jastip pelni">Jastip Pelni</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Rute Pengiriman</label>
              {editRouteOpts.length <= 1 ? (
                <div className="flex items-center h-10 px-3 rounded-md border border-input bg-muted/40 text-sm">
                  {editForm.deliveryRoute || "-"}
                </div>
              ) : (
                <Select value={editForm.deliveryRoute} onValueChange={v => setEditForm(f => ({ ...f, deliveryRoute: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih rute" /></SelectTrigger>
                  <SelectContent>
                    {editRouteOpts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            {editIsKargo && (
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">Jenis Barang (Kargo)</label>
                <Input value={editForm.itemName} onChange={e => setEditForm(f => ({ ...f, itemName: e.target.value }))} placeholder="Contoh: Elektronik, Mesin..." />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Berat Real (Kg)</label>
              <Input type="number" step="0.001" value={editForm.realWeight} onChange={e => setEditForm(f => ({ ...f, realWeight: e.target.value }))} placeholder="0.000" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Jenis Paking</label>
              <Input value={editForm.packagingType} onChange={e => setEditForm(f => ({ ...f, packagingType: e.target.value }))} placeholder="Karton, Plastik, Kayu..." />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Panjang (cm)</label>
              <Input type="number" step="0.1" value={editForm.length} onChange={e => setEditForm(f => ({ ...f, length: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Lebar (cm)</label>
              <Input type="number" step="0.1" value={editForm.width} onChange={e => setEditForm(f => ({ ...f, width: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tinggi (cm)</label>
              <Input type="number" step="0.1" value={editForm.height} onChange={e => setEditForm(f => ({ ...f, height: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Berat volume, berat digunakan, tarif, dan total ongkir akan dihitung ulang otomatis saat disimpan.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPkg(null)}>Batal</Button>
            <Button onClick={saveEdit} disabled={isEditSaving || !editForm.resiNumber || !editForm.customerName}>
              {isEditSaving ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Single Package Confirmation */}
      <AlertDialog open={!!deletePkg} onOpenChange={(o) => { if (!o) setDeletePkg(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Paket?</AlertDialogTitle>
            <AlertDialogDescription>
              Paket <strong>{deletePkg?.resiNumber}</strong> — {deletePkg?.customerName} akan dihapus permanen dan tidak dapat dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Menghapus..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
