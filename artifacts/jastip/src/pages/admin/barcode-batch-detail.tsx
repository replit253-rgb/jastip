import { useEffect, useRef, useState } from "react";
import {
  useListPackages,
  useListBatches,
  getListPackagesQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Printer,
  Download,
  Ship,
  CheckCircle2,
  Lock,
  Archive,
  QrCode,
  Pencil,
  Search,
  Eye,
  RefreshCw,
  Save,
  Trash2,
  FileSpreadsheet,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Pagination } from "@/components/pagination";
import {
  labelDocumentHtml,
  labelPageHtml,
  qrSectionHtml,
  groupQrValue,
} from "@/lib/print-label";

const PAGE_SIZE = 15;

// ── helpers ───────────────────────────────────────────────────────────────────

function formatRp(n: any) {
  if (n == null) return "-";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

function fmtDate(d: string) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function batchStatusColor(status: string) {
  if (status === "OPEN") return "bg-green-100 text-green-800 border-green-200";
  if (status === "CLOSED")
    return "bg-yellow-100 text-yellow-800 border-yellow-200";
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

// ── grouping helper ───────────────────────────────────────────────────────────

function groupPkgsByCustomer(pkgs: any[]) {
  const map = new Map<string, any[]>();
  for (const p of pkgs) {
    // Paket Cargo (jastip kargo) tidak digabung — tiap paket jadi kartu sendiri
    const key =
      (p.serviceType || "").toLowerCase() === "jastip kargo"
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

// Pesawat: pembulatan berat gabungan sesuai spec
// 0.01–0.20→0.20 kg | 0.21–0.40→0.40 kg | 0.41–0.50→0.50 kg | >0.50→berat asli
function roundPesawatGroupWeight(totalRealWeight: number): number {
  if (totalRealWeight <= 0) return 0;
  if (totalRealWeight <= 0.2) return 0.2;
  if (totalRealWeight <= 0.4) return 0.4;
  if (totalRealWeight <= 0.5) return 0.5;
  return totalRealWeight;
}

interface PelniTierConfig {
  maxKg: number | null;
  rate: number;
}

interface BaseRatesConfig {
  pesawatRate: number;
  hematRate: number;
  kargoRate: number;
  pelniTiersJakarta: PelniTierConfig[];
  pelniTiersSurabaya: PelniTierConfig[];
}

const DEFAULT_BASE_RATES: BaseRatesConfig = {
  pesawatRate: 77000,
  hematRate: 10000,
  kargoRate: 1900000,
  pelniTiersJakarta: [
    { maxKg: 10.1, rate: 20000 },
    { maxKg: 20.1, rate: 19000 },
    { maxKg: 40.1, rate: 18000 },
    { maxKg: 80.1, rate: 17000 },
    { maxKg: null, rate: 16000 },
  ],
  pelniTiersSurabaya: [
    { maxKg: 10, rate: 18000 },
    { maxKg: 20, rate: 17000 },
    { maxKg: 40, rate: 16000 },
    { maxKg: null, rate: 15500 },
  ],
};

// Pelni: tarif bertingkat berdasarkan total berat gabungan konsumen dalam batch
function getPelniRateByTotalWeight(
  totalWeight: number,
  deliveryRoute: string,
  baseRates: BaseRatesConfig = DEFAULT_BASE_RATES,
): number | null {
  if (!deliveryRoute || !totalWeight || totalWeight <= 0) return null;
  const routeNorm = deliveryRoute.trim().toLowerCase();
  const tiers =
    routeNorm.startsWith("jakarta") && !routeNorm.includes("surabaya")
      ? baseRates.pelniTiersJakarta
      : routeNorm.startsWith("surabaya") && !routeNorm.includes("jakarta")
        ? baseRates.pelniTiersSurabaya
        : null;
  if (!tiers || tiers.length === 0) return null;

  for (const tier of tiers) {
    const maxVal = tier.maxKg;
    if (maxVal === null || maxVal === undefined || maxVal >= 999999 || totalWeight <= maxVal) {
      return Number(tier.rate);
    }
  }
  return Number(tiers[tiers.length - 1].rate);
}

// Hitung estimasi total ongkir grup sesuai aturan & tarif aktif dari settings:
// - Pesawat: sum realWeight → bulatkan → × baseRates.pesawatRate
// - Pelni  : sum usedWeight → tarif bertingkat → × rate
// - Lain   : sum totalShipping per paket
function calcGroupTotalShipping(
  pkgs: any[],
  baseRates: BaseRatesConfig = DEFAULT_BASE_RATES,
): number {
  const first = pkgs[0];
  const svc = (first?.serviceType || "").toLowerCase();

  if (svc === "jastip pesawat") {
    const totalRealWeight = pkgs.reduce(
      (s, p) => s + (Number(p.realWeight) || 0),
      0,
    );
    const rounded = roundPesawatGroupWeight(totalRealWeight);
    return Math.round(rounded * baseRates.pesawatRate);
  }

  if (svc === "jastip pelni") {
    const totalWeight = pkgs.reduce(
      (s, p) => s + (Number(p.usedWeight) || Number(p.realWeight) || 0),
      0,
    );
    const route = first?.deliveryRoute || "";
    const fallbackFirst = route.toLowerCase().includes("surabaya")
      ? baseRates.pelniTiersSurabaya[0]?.rate
      : baseRates.pelniTiersJakarta[0]?.rate;
    const rate =
      getPelniRateByTotalWeight(totalWeight, route, baseRates) ??
      fallbackFirst ??
      20000;
    const calc = rate
      ? Math.round(totalWeight * rate)
      : pkgs.reduce((s, p) => s + (Number(p.totalShipping) || 0), 0);
    return Math.max(fallbackFirst ?? 20000, calc);
  }

  return pkgs.reduce((s, p) => s + (Number(p.totalShipping) || 0), 0);
}

// Returns the labelPageHtml string (one page) for a group — shared by single-card print and printAll.
function buildGroupedPage(
  pkgs: any[],
  qrDataUrl: string,
  qrValue: string,
  batchLabel?: string,
  baseRates: BaseRatesConfig = DEFAULT_BASE_RATES,
): string {
  const first = pkgs[0];
  const svc = (first?.serviceType || "").toLowerCase();
  const isPesawat = svc === "jastip pesawat";
  const isPelni = svc === "jastip pelni";
  const totalWeight = pkgs.reduce(
    (s, p) => s + (Number(p.usedWeight) || Number(p.realWeight) || 0),
    0,
  );
  const totalAdditionalFee = pkgs.reduce(
    (s, p) => s + (Number(p.additionalFee) || 0),
    0,
  );
  const totalShipping = calcGroupTotalShipping(pkgs, baseRates);
  const pelniRate = isPelni
    ? getPelniRateByTotalWeight(totalWeight, first?.deliveryRoute || "", baseRates)
    : null;

  // Pesawat: tampilkan total berat real dan berat dibulatkan
  const pesawatTotalRealWeight = isPesawat
    ? pkgs.reduce((s, p) => s + (Number(p.realWeight) || 0), 0)
    : 0;
  const pesawatRoundedWeight = isPesawat
    ? roundPesawatGroupWeight(pesawatTotalRealWeight)
    : 0;

  const batchRow = batchLabel
    ? `<div class="field full"><div class="fl">Batch Pengiriman</div><div class="fv" style="color:#1d4ed8;">${batchLabel}</div></div>`
    : "";
  const pelniRateRow =
    isPelni && pelniRate
      ? `<div class="field"><div class="fl">Harga/Kg</div><div class="fv">Rp ${pelniRate.toLocaleString("id-ID")}</div></div>`
      : "";
  const pesawatRoundRow = isPesawat
    ? `<div class="field"><div class="fl">Berat Dibulatkan</div><div class="fv">${pesawatRoundedWeight.toFixed(3)} Kg</div></div>`
    : "";
  const feeReasons = pkgs
    .filter((p) => (Number(p.additionalFee) || 0) > 0 && p.additionalFeeReason)
    .map((p) => p.additionalFeeReason)
    .filter(Boolean)
    .join(", ");
  const feeRow = totalAdditionalFee > 0
    ? `<div class="field"><div class="fl">Biaya Tambahan</div><div class="fv" style="color:#b45309;">Rp ${totalAdditionalFee.toLocaleString("id-ID")}</div></div>
       ${feeReasons ? `<div class="field full"><div class="fl">Ket. Biaya Tambahan</div><div class="fv">${feeReasons}</div></div>` : ""}
       <div class="field full"><div class="fl">Total Tagihan</div><div class="fv red" style="color:#15803d;font-size:13.5pt;">Rp ${(totalShipping + totalAdditionalFee).toLocaleString("id-ID")}</div></div>`
    : "";

  const inner = `${qrSectionHtml(qrDataUrl, qrValue)}
    <div class="info">
      <div class="cust">${first?.customerName || "-"}</div>
      <div class="grid">
        <div class="field"><div class="fl">Total Paket</div><div class="fv">${pkgs.length} pkt</div></div>
        <div class="field"><div class="fl">Total Berat Real</div><div class="fv">${isPesawat ? pesawatTotalRealWeight.toFixed(3) : totalWeight.toFixed(3)} Kg</div></div>
        <div class="field"><div class="fl">Jenis Jastip</div><div class="fv">${first?.serviceType ? first.serviceType.replace("jastip ", "Jastip ") : "-"}</div></div>
        ${pesawatRoundRow}
        ${pelniRateRow}
        <div class="field"><div class="fl">Total Ongkir</div><div class="fv red">Rp ${totalShipping.toLocaleString("id-ID")}</div></div>
        ${feeRow}
        <div class="field full"><div class="fl">Rute</div><div class="fv">${first?.deliveryRoute || "-"}</div></div>
        ${batchRow}
      </div>
    </div>`;
  return labelPageHtml(inner);
}

function buildGroupedPrintHtml(
  pkgs: any[],
  qrDataUrl: string,
  qrValue: string,
  batchLabel?: string,
  baseRates: BaseRatesConfig = DEFAULT_BASE_RATES,
) {
  const first = pkgs[0];
  return labelDocumentHtml(
    `Label Grup - ${first?.customerName}`,
    buildGroupedPage(pkgs, qrDataUrl, qrValue, batchLabel, baseRates),
  );
}

// ── SingleBarcodeCard — Cargo (packageMode: "single") ────────────────────────

function SingleBarcodeCard({
  pkg,
  batchLabel,
}: {
  pkg: any;
  batchLabel?: string;
}) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const base = user?.role === "owner" ? "/owner" : "/admin";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qrValue = pkg.barcode || pkg.resiNumber || String(pkg.id);
  const isDone = pkg.status === "diserahkan";

  useEffect(() => {
    if (canvasRef.current && qrValue) {
      QRCode.toCanvas(canvasRef.current, qrValue, {
        width: 160,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).catch(() => {});
    }
  }, [qrValue]);

  async function printBarcode() {
    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL(qrValue, {
        width: 400,
        margin: 3,
        color: { dark: "#000000", light: "#ffffff" },
      });
    } catch {
      return;
    }
    const pkgDate = pkg.packageDate
      ? new Date(pkg.packageDate).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "-";
    const html = labelDocumentHtml(
      `Label Paket — ${pkg.resiNumber || qrValue}`,
      labelPageHtml(`${qrSectionHtml(qrDataUrl, qrValue)}
        <div class="info compact">
          <div class="cust">${pkg.customerName || "-"}</div>
          <div class="grid">
            <div class="field"><div class="fl">No. Resi</div><div class="fv mono">${pkg.resiNumber || "-"}</div></div>
            <div class="field"><div class="fl">No. Paket</div><div class="fv mono">${pkg.packageNumber || "-"}</div></div>
            <div class="field"><div class="fl">Tanggal</div><div class="fv">${pkgDate}</div></div>
            <div class="field"><div class="fl">Jenis Jastip</div><div class="fv">Jastip Kargo</div></div>
            <div class="field full"><div class="fl">Jenis Barang</div><div class="fv">${pkg.itemName || "-"}</div></div>
            <div class="field full"><div class="fl">Rute</div><div class="fv">${pkg.deliveryRoute || "-"}</div></div>
            <div class="field"><div class="fl">Ongkir Paket</div><div class="fv red">${pkg.totalShipping != null ? "Rp " + Number(pkg.totalShipping).toLocaleString("id-ID") : "-"}</div></div>
            ${(pkg.additionalFee ?? 0) > 0 ? `<div class="field"><div class="fl">Biaya Tambahan</div><div class="fv" style="color:#b45309;">Rp ${Number(pkg.additionalFee).toLocaleString("id-ID")}${pkg.additionalFeeReason ? ` (${pkg.additionalFeeReason})` : ""}</div></div>
            <div class="field full"><div class="fl">Total Tagihan</div><div class="fv red" style="color:#15803d;font-size:13.5pt;">Rp ${(Number(pkg.totalShipping || 0) + Number(pkg.additionalFee || 0)).toLocaleString("id-ID")}</div></div>` : ""}
            <div class="field full"><div class="fl">Batch Pengiriman</div><div class="fv" style="color:#1d4ed8;">${batchLabel || "-"}</div></div>
          </div>
        </div>`),
    );
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
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
    <Card className="hover:shadow-md transition-shadow border-orange-200">
      <CardContent className="pt-4 pb-3">
        <div className="mb-2">
          <p
            className="font-bold text-sm leading-snug break-words line-clamp-2"
            title={pkg.customerName || "-"}
          >
            {pkg.customerName || "-"}
          </p>
          <div className="flex items-center justify-between gap-2 mt-1">
            <p className="text-xs text-muted-foreground font-mono truncate">
              {pkg.resiNumber || pkg.barcode || "-"}
            </p>
            <Badge
              variant="outline"
              className={`text-xs shrink-0 ${isDone ? "bg-green-100 text-green-800 border-green-300" : "bg-amber-100 text-amber-800 border-amber-300"}`}
            >
              {isDone ? "Diserahkan" : "Pending"}
            </Badge>
          </div>
          {pkg.packageNumber && (
            <p className="text-xs text-muted-foreground">
              No. Paket: {pkg.packageNumber}
            </p>
          )}
          {pkg.itemName && (
            <p
              className="text-xs text-muted-foreground truncate"
              title={pkg.itemName}
            >
              {pkg.itemName}
            </p>
          )}
        </div>
        <div className="flex justify-center bg-white border rounded-lg p-2 mb-2">
          <canvas ref={canvasRef} />
        </div>
        <div className="text-xs font-semibold text-primary mb-1">
          Ongkir:{" "}
          {pkg.totalShipping != null
            ? `Rp ${Number(pkg.totalShipping).toLocaleString("id-ID")}`
            : "-"}
        </div>
        {Number(pkg.additionalFee) > 0 && (
          <div className="text-xs font-medium text-amber-700 mb-1">
            + Biaya Tambahan: {formatRp(pkg.additionalFee)}
            {pkg.additionalFeeReason ? ` (${pkg.additionalFeeReason})` : ""}
          </div>
        )}
        {Number(pkg.additionalFee) > 0 && (
          <div className="text-xs font-bold text-green-700 mb-2">
            Total Tagihan: {formatRp((Number(pkg.totalShipping) || 0) + Number(pkg.additionalFee))}
          </div>
        )}
        <div className="flex gap-1.5 mb-1.5">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 min-w-0 px-2 text-xs"
            onClick={printBarcode}
          >
            <Printer className="w-3 h-3 mr-1 shrink-0" />{" "}
            <span className="truncate">Cetak</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 min-w-0 px-2 text-xs"
            onClick={downloadBarcode}
          >
            <Download className="w-3 h-3 mr-1 shrink-0" />{" "}
            <span className="truncate">Unduh</span>
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
          onClick={() => {
            const params = new URLSearchParams({
              ids: String(pkg.id),
              name: pkg.customerName || "",
            });
            if (pkg.serviceType) params.set("serviceType", pkg.serviceType);
            if (pkg.batchId != null) params.set("batchId", String(pkg.batchId));
            setLocation(`${base}/barcode-group?${params.toString()}`);
          }}
        >
          <Eye className="w-3 h-3 mr-1" /> Detail / Edit Paket
        </Button>
      </CardContent>
    </Card>
  );
}

// ── GroupedBarcodeCard ────────────────────────────────────────────────────────

function GroupedBarcodeCard({
  pkgs,
  batchLabel,
  baseRates,
}: {
  pkgs: any[];
  batchLabel?: string;
  baseRates: BaseRatesConfig;
}) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const base = user?.role === "owner" ? "/owner" : "/admin";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const first = pkgs[0];
  const svcCard = (first?.serviceType || "").toLowerCase();
  const isPelniCard = svcCard === "jastip pelni";
  const isPesawatCard = svcCard === "jastip pesawat";
  const qrValue = groupQrValue(pkgs);
  const totalWeight = pkgs.reduce(
    (s, p) => s + (Number(p.usedWeight) || Number(p.realWeight) || 0),
    0,
  );
  const totalShipping = calcGroupTotalShipping(pkgs, baseRates);
  const totalAdditionalFee = pkgs.reduce(
    (s, p) => s + (Number(p.additionalFee) || 0),
    0,
  );
  const pelniRate = isPelniCard
    ? getPelniRateByTotalWeight(totalWeight, first?.deliveryRoute || "", baseRates)
    : null;
  // Pesawat: sum realWeight → bulatkan (untuk ditampilkan di kartu)
  const pesawatTotalReal = isPesawatCard
    ? pkgs.reduce((s, p) => s + (Number(p.realWeight) || 0), 0)
    : 0;
  const pesawatRounded = isPesawatCard
    ? roundPesawatGroupWeight(pesawatTotalReal)
    : 0;
  const allPending = pkgs.every((p) => p.status !== "diserahkan");
  const allDone = pkgs.every((p) => p.status === "diserahkan");

  useEffect(() => {
    if (canvasRef.current && qrValue) {
      QRCode.toCanvas(canvasRef.current, qrValue, {
        width: 160,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).catch(() => {});
    }
  }, [qrValue]);

  async function printBarcode() {
    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL(qrValue, {
        width: 400,
        margin: 3,
        color: { dark: "#000000", light: "#ffffff" },
      });
    } catch {
      return;
    }
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(
      buildGroupedPrintHtml(pkgs, qrDataUrl, qrValue, batchLabel, baseRates),
    );
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
          <p
            className="font-bold text-sm leading-snug break-words line-clamp-2"
            title={first?.customerName || "-"}
          >
            {first?.customerName || "-"}
          </p>
          <div className="flex items-center justify-between gap-2 mt-1">
            <p className="text-xs text-muted-foreground truncate">
              {pkgs.length} paket · {totalWeight.toFixed(3)} Kg
            </p>
            <Badge
              variant="outline"
              className={`text-xs shrink-0 ${allDone ? "bg-green-100 text-green-800 border-green-300" : allPending ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-blue-100 text-blue-800 border-blue-300"}`}
            >
              {allDone ? "Diserahkan" : allPending ? "Pending" : "Sebagian"}
            </Badge>
          </div>
          {first?.serviceType && (
            <p className="text-xs text-muted-foreground capitalize truncate">
              {first.serviceType}
            </p>
          )}
        </div>
        <div className="flex justify-center bg-white border rounded-lg p-2 mb-2">
          <canvas ref={canvasRef} />
        </div>
        <div className="mb-2 space-y-1">
          {pkgs.map((p, i) => {
            const addFee = Number(p.additionalFee) || 0;
            return (
              <div
                key={p.id}
                className="text-xs text-muted-foreground border-b border-dashed border-gray-100 pb-0.5 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono truncate max-w-[120px]">
                    #{i + 1} {p.resiNumber || "-"}
                  </span>
                  <span>{p.usedWeight != null ? p.usedWeight + " Kg" : "-"}</span>
                </div>
                {addFee > 0 && (
                  <div className="text-[11px] text-amber-700 font-medium">
                    + Biaya Tambahan: {formatRp(addFee)}
                    {p.additionalFeeReason ? ` (${p.additionalFeeReason})` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {isPesawatCard && (
          <div className="text-xs text-blue-600 mb-0.5">
            ✈️ Real: {pesawatTotalReal.toFixed(3)} Kg → Dibulatkan:{" "}
            {pesawatRounded.toFixed(3)} Kg × {formatRp(baseRates.pesawatRate)}
          </div>
        )}
        {isPelniCard && pelniRate && (
          <div className="text-xs text-indigo-600 mb-0.5">
            🚢 Harga/kg: {formatRp(pelniRate)} · Berat total:{" "}
            {totalWeight.toFixed(3)} Kg
          </div>
        )}
        <div className="text-xs font-semibold text-primary mb-1">
          Total Ongkir: {formatRp(totalShipping)}
        </div>
        {totalAdditionalFee > 0 && (
          <div className="text-xs font-medium text-amber-700 mb-1">
            + Biaya Tambahan: {formatRp(totalAdditionalFee)}
            {(() => {
              const reasons = pkgs
                .filter((p) => (Number(p.additionalFee) || 0) > 0 && p.additionalFeeReason)
                .map((p) => p.additionalFeeReason)
                .filter(Boolean)
                .join(", ");
              return reasons ? ` (${reasons})` : "";
            })()}
          </div>
        )}
        {totalAdditionalFee > 0 && (
          <div className="text-xs font-bold text-green-700 mb-2">
            Total Tagihan: {formatRp(totalShipping + totalAdditionalFee)}
          </div>
        )}
        <div className="flex gap-1.5 mb-1.5">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 min-w-0 px-2 text-xs"
            onClick={printBarcode}
          >
            <Printer className="w-3 h-3 mr-1 shrink-0" />{" "}
            <span className="truncate">Cetak</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 min-w-0 px-2 text-xs"
            onClick={downloadBarcode}
          >
            <Download className="w-3 h-3 mr-1 shrink-0" />{" "}
            <span className="truncate">Unduh</span>
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
          onClick={() => {
            const params = new URLSearchParams({
              name: first?.customerName || "",
            });
            if (first?.serviceType)
              params.set("serviceType", first.serviceType);
            if (first?.batchId != null)
              params.set("batchId", String(first.batchId));
            setLocation(`${base}/barcode-group?${params.toString()}`);
          }}
        >
          {pkgs.length > 1 ? (
            <>
              <Eye className="w-3 h-3 mr-1" /> Lihat Semua Paket
            </>
          ) : (
            <>
              <Pencil className="w-3 h-3 mr-1" /> Edit / Kelola Paket
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BarcodeBatchDetail({
  params: propsParams,
}: {
  params?: { id: string };
} = {}) {
  const routerParams = useParams();
  const rawId = propsParams?.id || routerParams?.id || "0";
  const batchId = Number(rawId);
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const base = isOwner ? "/owner" : "/admin";

  const rawQueryFromWouter = location.split("?")[1] || "";
  const rawQueryFromWindow =
    typeof window !== "undefined"
      ? (window.location.search || "").replace(/^\?/, "")
      : "";
  const batchQuery = new URLSearchParams(
    rawQueryFromWouter || rawQueryFromWindow,
  );
  const initialServiceTypeFromUrl = batchQuery.get("serviceType") || null;
  const initialSearchFromUrl = batchQuery.get("search") || "";

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState(initialSearchFromUrl);
  const [filterServiceType, setFilterServiceType] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedServiceType, setSelectedServiceType] = useState<string | null>(
    initialServiceTypeFromUrl,
  );

  useEffect(() => {
    const nextServiceType = batchQuery.get("serviceType") || null;
    const nextSearch = batchQuery.get("search") || "";
    setSelectedServiceType(nextServiceType);
    setSearch(nextSearch);
    setPage(1);
  }, [location]);

  // ── Tarif dasar dari /api/settings/base-rates ──────────────────────────────
  const { data: baseRates = DEFAULT_BASE_RATES } = useQuery<BaseRatesConfig>({
    queryKey: ["settings", "base-rates"],
    queryFn: async () => {
      const token = localStorage.getItem("jaj_token");
      const res = await fetch("/api/settings/base-rates", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return DEFAULT_BASE_RATES;
      return res.json();
    },
    staleTime: 60_000,
  });

  // ── Sinkronisasi ongkir Kargo ─────────────────────────────────────────────
  const kargoRate = baseRates.kargoRate;
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncRows, setSyncRows] = useState<
    {
      id: number;
      customerName: string;
      resiNumber: string;
      packageNumber: string;
      itemName: string;
      usedWeight: number | null;
      calcOngkir: number | null; // berat/kubikasi × kargoRate (settings)
      currentOngkir: string;
      newOngkir: string;
    }[]
  >([]);
  const [syncing, setSyncing] = useState(false);

  // ── Hapus Data Hasil Impor & Hapus Card (Owner only) ──────────────────────
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSummary, setImportSummary] = useState<any | null>(null);
  const [loadingImports, setLoadingImports] = useState(false);
  const [includeLegacyImports, setIncludeLegacyImports] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    | { mode: "single"; importId: number; fileName: string; deletableCount: number; lockedCount: number }
    | { mode: "service-card"; serviceKey: string; serviceLabel: string; deletableCount: number; lockedCount: number }
    | { mode: "batch"; deletableCount: number; includeLegacy: boolean }
    | null
  >(null);
  const [isDeletingImports, setIsDeletingImports] = useState(false);
  const [lastDeleteResult, setLastDeleteResult] = useState<any | null>(null);

  // Hapus langsung dari salah satu Card Jenis Jastip
  const [cardDeleteTarget, setCardDeleteTarget] = useState<{
    serviceKey: string;
    serviceLabel: string;
    activeCount: number;
  } | null>(null);
  const [includeManualInCardDelete, setIncludeManualInCardDelete] = useState(false);

  async function fetchImportSummary() {
    if (!isOwner || !batchId) return;
    setLoadingImports(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const res = await fetch(`/api/packages/imports?batchId=${batchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat data impor");
      setImportSummary(json);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Gagal memuat daftar impor",
        description: err.message || "Terjadi kesalahan",
      });
    } finally {
      setLoadingImports(false);
    }
  }

  function openImportDeleteModal() {
    if (!isOwner) return;
    setLastDeleteResult(null);
    setIncludeLegacyImports(false);
    setImportModalOpen(true);
    fetchImportSummary();
  }

  function openServiceCardDeleteConfirm(svc: { key: string; label: string; count: number }) {
    if (!isOwner) return;
    setIncludeManualInCardDelete(false);
    setCardDeleteTarget({
      serviceKey: svc.key,
      serviceLabel: svc.label,
      activeCount: svc.count,
    });
    fetchImportSummary();
  }

  async function handleConfirmDeleteServiceCard() {
    if (!cardDeleteTarget || !isOwner) return;
    setIsDeletingImports(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const res = await fetch(`/api/packages/batch/${batchId}/service-card`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceKey: cardDeleteTarget.serviceKey,
          includeLegacy: true,
          includeManual: includeManualInCardDelete,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menghapus paket pada card ini");

      setCardDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
      if (importModalOpen) await fetchImportSummary();
      toast({
        title: json.deletedCount > 0 ? "Card & Paket Dihapus" : "Tidak Ada Paket Dihapus",
        description: json.message,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Gagal menghapus card",
        description: err.message || "Terjadi kesalahan",
      });
    } finally {
      setIsDeletingImports(false);
    }
  }

  async function handleConfirmDeleteImport() {
    if (!deleteTarget || !isOwner) return;
    setIsDeletingImports(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const url =
        deleteTarget.mode === "single"
          ? `/api/packages/imports/${deleteTarget.importId}`
          : deleteTarget.mode === "service-card"
            ? `/api/packages/imports/batch/${batchId}?includeLegacy=true&serviceKey=${encodeURIComponent(deleteTarget.serviceKey)}`
            : `/api/packages/imports/batch/${batchId}?includeLegacy=${deleteTarget.includeLegacy ? "true" : "false"}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menghapus data impor");

      setLastDeleteResult(json);
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
      await fetchImportSummary();
      toast({
        title: json.deletedCount > 0 ? "Data Impor Dihapus" : "Tidak Ada Paket Dihapus",
        description: json.message,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Gagal menghapus data impor",
        description: err.message || "Terjadi kesalahan",
      });
    } finally {
      setIsDeletingImports(false);
    }
  }

  const { data: batches } = useListBatches();
  const { data: packages, isLoading } = useListPackages({ batchId });

  const batch = (batches || []).find((b: any) => b.id === batchId);
  const batchLabel = batch
    ? batch.namaKapal || `Batch #${batchId}`
    : `Batch #${batchId}`;

  const batchPkgs = (packages || []).filter(
    (p: any) =>
      p.statusPengambilan !== "SUDAH_DIAMBIL" &&
      p.status !== "diserahkan",
  );

  // ── Service type stats ────────────────────────────────────────────────────────
  const SVC_DEFS = [
    {
      key: "jastip pesawat",
      label: "Jastip Pesawat",
      emoji: "✈️",
      border: "border-blue-200",
      bg: "bg-blue-50/60",
      num: "text-blue-700",
    },
    {
      key: "jastip hemat+",
      label: "Jastip Hemat+",
      emoji: "📦",
      border: "border-emerald-200",
      bg: "bg-emerald-50/60",
      num: "text-emerald-700",
    },
    {
      key: "jastip kargo",
      label: "Jastip Kargo",
      emoji: "🚛",
      border: "border-orange-200",
      bg: "bg-orange-50/60",
      num: "text-orange-700",
    },
    {
      key: "jastip pelni",
      label: "Jastip Pelni",
      emoji: "🚢",
      border: "border-indigo-200",
      bg: "bg-indigo-50/60",
      num: "text-indigo-700",
    },
  ];
  const knownSvcKeys = SVC_DEFS.map((d) => d.key);
  const svcStats = [
    ...SVC_DEFS.map((def) => {
      const pkgs = batchPkgs.filter(
        (p: any) => (p.serviceType || "").toLowerCase() === def.key,
      );
      if (!pkgs.length) return null;
      return {
        ...def,
        count: pkgs.length,
        weight: pkgs.reduce(
          (s: number, p: any) => s + Number(p.realWeight || 0),
          0,
        ),
        ongkir: pkgs.reduce(
          (s: number, p: any) => s + Number(p.totalShipping || 0),
          0,
        ),
      };
    }).filter(Boolean),
    (() => {
      const pkgs = batchPkgs.filter(
        (p: any) => !knownSvcKeys.includes((p.serviceType || "").toLowerCase()),
      );
      return pkgs.length
        ? {
            key: "lainnya",
            label: "Lainnya",
            emoji: "📋",
            border: "border-gray-200",
            bg: "bg-gray-50/60",
            num: "text-gray-700",
            count: pkgs.length,
            weight: pkgs.reduce(
              (s: number, p: any) => s + Number(p.realWeight || 0),
              0,
            ),
            ongkir: pkgs.reduce(
              (s: number, p: any) => s + Number(p.totalShipping || 0),
              0,
            ),
          }
        : null;
    })(),
  ].filter(Boolean) as {
    key: string;
    label: string;
    emoji: string;
    border: string;
    bg: string;
    num: string;
    count: number;
    weight: number;
    ongkir: number;
  }[];

  const selectedSvcDef = SVC_DEFS.find((d) => d.key === selectedServiceType);
  const selectedSvcLabel =
    selectedSvcDef?.label ??
    (selectedServiceType === "lainnya" ? "Lainnya" : "");

  const effectiveFilter = selectedServiceType ?? filterServiceType;

  const filtered = batchPkgs.filter(
    (p: any) =>
      (effectiveFilter === "all" ||
        (p.serviceType || "").toLowerCase() === effectiveFilter) &&
      (!search ||
        (p.barcode || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.resiNumber || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.packageNumber || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.customerName || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.itemName || "").toLowerCase().includes(search.toLowerCase())),
  );

  const groupedFiltered = groupPkgsByCustomer(filtered);
  const totalPages = Math.max(1, Math.ceil(groupedFiltered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedGroups = groupedFiltered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const totalWeight = batchPkgs.reduce((s: number, p: any) => {
    const real = Number(p.realWeight || 0);
    const vol  = Number(p.volumeWeight || 0);
    const chargeable = p.usedWeight != null ? Number(p.usedWeight) : Math.max(real, vol);
    return s + chargeable;
  }, 0);
  const totalShipping = batchPkgs.reduce(
    (s: number, p: any) => s + Number(p.totalShipping || 0),
    0,
  );

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }
  function handleFilter(v: string) {
    setFilterServiceType(v);
    setPage(1);
  }

  // ── Sinkronisasi ongkir Kargo ─────────────────────────────────────────────
  function calcKargoOngkir(berat: number | null): number | null {
    if (!berat || berat <= 0) return null;
    return Math.round(berat * kargoRate);
  }

  function openSync() {
    const kargoPkgs = batchPkgs.filter(
      (p: any) => (p.serviceType || "").toLowerCase() === "jastip kargo",
    );
    setSyncRows(
      kargoPkgs
        .slice()
        .sort((a: any, b: any) =>
          (a.customerName || "").localeCompare(b.customerName || ""),
        )
        .map((p: any) => {
          const berat = Number(p.usedWeight ?? p.realWeight ?? 0) || null;
          const calc = calcKargoOngkir(berat);
          return {
            id: p.id,
            customerName: p.customerName || "-",
            resiNumber: p.resiNumber || "-",
            packageNumber: p.packageNumber || "",
            itemName: p.itemName || "",
            usedWeight: berat,
            calcOngkir: calc,
            currentOngkir:
              p.totalShipping != null ? String(p.totalShipping) : "",
            // pre-fill dengan hasil formula jika ada berat, else pakai nilai tersimpan
            newOngkir:
              calc != null
                ? String(calc)
                : p.totalShipping != null
                  ? String(p.totalShipping)
                  : "",
          };
        }),
    );
    setSyncOpen(true);
  }

  function recalcAll() {
    setSyncRows((rows) =>
      rows.map((r) => ({
        ...r,
        newOngkir: r.calcOngkir != null ? String(r.calcOngkir) : r.newOngkir,
      })),
    );
  }

  async function saveSync() {
    const changed = syncRows.filter(
      (r) => r.newOngkir !== r.currentOngkir && r.newOngkir !== "",
    );
    if (!changed.length) {
      toast({
        title: "Tidak ada perubahan",
        description: "Semua ongkir sudah sesuai.",
      });
      return;
    }
    setSyncing(true);
    let ok = 0;
    let fail = 0;
    const token = localStorage.getItem("jaj_token");
    for (const row of changed) {
      try {
        const res = await fetch(`/api/packages/${row.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ totalShipping: Number(row.newOngkir) }),
        });
        if (res.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    await queryClient.invalidateQueries({
      queryKey: getListPackagesQueryKey(),
    });
    setSyncing(false);
    setSyncOpen(false);
    toast({
      title: fail ? `Selesai (${fail} gagal)` : "Sinkronisasi berhasil",
      description: `${ok} paket ongkir berhasil diperbarui.`,
      variant: fail ? "destructive" : "default",
    });
  }

  // ── Print All ────────────────────────────────────────────────────────────────
  // Prints one label per GROUP (same grouping as the cards), not one per package.
  async function printAll() {
    if (!batchPkgs.length) return;
    const groups = groupPkgsByCustomer(batchPkgs);
    const pages: string[] = [];
    for (const pkgs of groups) {
      const first = pkgs[0];
      const svc = (first?.serviceType || "").toLowerCase();
      const isKargo = svc === "jastip kargo";

      if (isKargo) {
        // Kargo: single-package label (same as SingleBarcodeCard)
        const pkg = first;
        const qrValue = pkg.barcode || pkg.resiNumber || String(pkg.id);
        let qrDataUrl = "";
        try {
          qrDataUrl = await QRCode.toDataURL(qrValue, {
            width: 400,
            margin: 3,
            color: { dark: "#000000", light: "#ffffff" },
          });
        } catch {
          continue;
        }
        const pkgDate = pkg.packageDate
          ? new Date(pkg.packageDate).toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
          : "-";
        pages.push(
          labelPageHtml(`${qrSectionHtml(qrDataUrl, qrValue)}
          <div class="info compact">
            <div class="cust">${pkg.customerName || "-"}</div>
            <div class="grid">
              <div class="field"><div class="fl">No. Resi</div><div class="fv mono">${pkg.resiNumber || "-"}</div></div>
              <div class="field"><div class="fl">No. Paket</div><div class="fv mono">${pkg.packageNumber || "-"}</div></div>
              <div class="field"><div class="fl">Tanggal</div><div class="fv">${pkgDate}</div></div>
              <div class="field"><div class="fl">Jenis Jastip</div><div class="fv">Jastip Kargo</div></div>
              <div class="field full"><div class="fl">Jenis Barang</div><div class="fv">${pkg.itemName || "-"}</div></div>
              <div class="field full"><div class="fl">Rute</div><div class="fv">${pkg.deliveryRoute || "-"}</div></div>
              <div class="field"><div class="fl">Ongkir Paket</div><div class="fv red">${pkg.totalShipping != null ? "Rp " + Number(pkg.totalShipping).toLocaleString("id-ID") : "-"}</div></div>
              ${Number(pkg.additionalFee || 0) > 0 ? `<div class="field"><div class="fl">Biaya Tambahan</div><div class="fv" style="color:#b45309;">Rp ${Number(pkg.additionalFee).toLocaleString("id-ID")}${pkg.additionalFeeReason ? ` (${pkg.additionalFeeReason})` : ""}</div></div>
              <div class="field full"><div class="fl">Total Tagihan</div><div class="fv red" style="color:#15803d;font-size:13.5pt;">Rp ${(Number(pkg.totalShipping || 0) + Number(pkg.additionalFee || 0)).toLocaleString("id-ID")}</div></div>` : ""}
              <div class="field full"><div class="fl">Batch Pengiriman</div><div class="fv" style="color:#1d4ed8;">${batchLabel}</div></div>
            </div>
          </div>`),
        );
      } else {
        // Grouped services (Pesawat, Pelni, Hemat+, dll): one group label per customer
        const qrValue = groupQrValue(pkgs);
        let qrDataUrl = "";
        try {
          qrDataUrl = await QRCode.toDataURL(qrValue, {
            width: 400,
            margin: 3,
            color: { dark: "#000000", light: "#ffffff" },
          });
        } catch {
          continue;
        }
        pages.push(buildGroupedPage(pkgs, qrDataUrl, qrValue, batchLabel, baseRates));
      }
    }
    if (!pages.length) return;
    const html = labelDocumentHtml(
      `Print Barcode — ${batchLabel}`,
      pages.join(""),
    );
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setLocation(`${base}/barcode`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className={`p-1.5 rounded-lg ${batch?.statusBatch === "OPEN" ? "bg-blue-100" : "bg-gray-100"}`}
            >
              <Ship
                className={`w-5 h-5 ${batch?.statusBatch === "OPEN" ? "text-blue-700" : "text-gray-500"}`}
              />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {batch?.namaKapal || batchLabel}
            </h1>
            {batch && (
              <span
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${batchStatusColor(batch.statusBatch)}`}
              >
                {batchStatusIcon(batch.statusBatch)}
                {batchStatusLabel(batch.statusBatch)}
              </span>
            )}
          </div>
          {batch && (
            <p className="text-sm text-muted-foreground mt-1">
              {batch.kotaAsal} → {batch.tujuan}
              &nbsp;·&nbsp; ETD: {fmtDate(batch.etd)}
              &nbsp;·&nbsp; Closing: {fmtDate(batch.periodeClosingMulai)} –{" "}
              {fmtDate(batch.periodeClosingSelesai)}
            </p>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="font-semibold text-foreground">
              {batchPkgs.length} paket
            </span>
            &nbsp;·&nbsp; Berat {totalWeight.toFixed(3)} Kg &nbsp;·&nbsp; Total
            Ongkir {formatRp(totalShipping)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isOwner && batch?.statusBatch !== "ARSIP" && (
            <Button
              variant="outline"
              onClick={openImportDeleteModal}
              className="gap-2 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <Trash2 className="h-4 w-4" /> Hapus Data Impor
            </Button>
          )}
          <Button
            onClick={printAll}
            disabled={batchPkgs.length === 0}
            className="gap-2"
          >
            <Printer className="h-4 w-4" /> Cetak Semua
          </Button>
        </div>
      </div>

      {!selectedServiceType ? (
        /* ── Pilih Jenis Jastip ───────────────────────────────────────────────── */
        isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="h-40 pt-4 bg-muted/20" />
              </Card>
            ))}
          </div>
        ) : svcStats.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <QrCode className="w-14 h-14 mx-auto mb-4 opacity-20" />
            <p className="font-semibold">Belum ada paket dalam batch ini</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {svcStats.map((svc) => (
              <Card
                key={svc.key}
                className={`cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all border-2 ${svc.border} ${svc.bg}`}
                onClick={() => {
                  setSelectedServiceType(svc.key);
                  setSearch("");
                  setPage(1);
                }}
              >
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-bold leading-snug ${svc.num}`}>
                      {svc.label}
                    </p>
                    {isOwner && batch?.statusBatch !== "ARSIP" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        title={`Hapus semua paket di card ${svc.label}`}
                        className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-100/70 -mr-1.5 -mt-1 shrink-0 gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          openServiceCardDeleteConfirm(svc);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </Button>
                    )}
                  </div>
                  <div className="mt-3 space-y-1">
                    <div>
                      <span className={`text-3xl font-black ${svc.num}`}>
                        {svc.count}
                      </span>
                      <span className="text-sm text-muted-foreground ml-1">
                        paket
                      </span>
                    </div>
                    {svc.ongkir > 0 && (
                      <p className="text-xs font-semibold text-primary">
                        {formatRp(svc.ongkir)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        /* ── Barcode grid (per jenis jastip) ─────────────────────────────────── */
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedServiceType(null);
                setSearch("");
                setPage(1);
              }}
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Jenis Jastip
            </Button>
            <span className="text-base font-bold">{selectedSvcLabel}</span>
            <Badge variant="secondary">{filtered.length} paket</Badge>
            {selectedServiceType === "jastip kargo" && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto border-orange-300 text-orange-700 hover:bg-orange-50 gap-1.5"
                onClick={openSync}
              >
                <RefreshCw className="w-3.5 h-3.5" /> Sinkronisasi Ongkir
              </Button>
            )}
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari resi, barcode, nama..."
              className="pl-9"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="h-64 pt-4 bg-muted/20" />
                </Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <QrCode className="w-14 h-14 mx-auto mb-4 opacity-20" />
              <p className="font-semibold text-base">
                Tidak ada paket yang cocok
              </p>
              {search && (
                <p className="text-sm mt-1">Coba ubah kata kunci pencarian</p>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {paginatedGroups.map((pkgs: any[]) =>
                  (pkgs[0]?.serviceType || "").toLowerCase() ===
                  "jastip kargo" ? (
                    <SingleBarcodeCard
                      key={`kargo|${pkgs[0].id}`}
                      pkg={pkgs[0]}
                      batchLabel={batchLabel}
                    />
                  ) : (
                    <GroupedBarcodeCard
                      key={`${pkgs[0]?.customerName}|${pkgs[0]?.serviceType}|${pkgs[0]?.batchId}`}
                      pkgs={pkgs}
                      batchLabel={batchLabel}
                      baseRates={baseRates}
                    />
                  ),
                )}
              </div>
              <Pagination
                page={safePage}
                totalPages={totalPages}
                total={groupedFiltered.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </>
          )}
        </>
      )}

      {/* ── Dialog Sinkronisasi Ongkir Kargo ─────────────────────────────── */}
      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-orange-600" />
              Sinkronisasi Ongkir — Jastip Kargo
            </DialogTitle>
            <div className="mt-2 rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-800 space-y-0.5">
              <p className="font-semibold">Rumus: Berat/Kubikasi Paket × {formatRp(kargoRate)}</p>
              <p className="text-orange-600">
                Kolom <b>Ongkir Baru</b> sudah dihitung otomatis. Edit manual
                jika ada perbedaan, lalu klik <b>Simpan Semua</b>.
              </p>
            </div>
          </DialogHeader>

          {/* Toolbar: Hitung Ulang Semua */}
          {syncRows.length > 0 && (
            <div className="flex items-center gap-2 -mt-1">
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-orange-300 text-orange-700 hover:bg-orange-50 gap-1"
                onClick={recalcAll}
              >
                <RefreshCw className="w-3 h-3" /> Hitung Ulang Semua (Berat × {formatRp(kargoRate)})
              </Button>
              <span className="text-xs text-muted-foreground">
                {syncRows.filter((r) => r.usedWeight == null).length > 0 &&
                  `⚠ ${syncRows.filter((r) => r.usedWeight == null).length} paket tanpa data berat — isi manual`}
              </span>
            </div>
          )}

          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="border-b bg-muted/40">
                  <th className="text-left py-2 px-2 font-medium text-xs text-muted-foreground uppercase">
                    Konsumen
                  </th>
                  <th className="text-left py-2 px-2 font-medium text-xs text-muted-foreground uppercase">
                    Resi / Paket
                  </th>
                  <th className="text-left py-2 px-2 font-medium text-xs text-muted-foreground uppercase">
                    Barang
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-xs text-muted-foreground uppercase">
                    Berat (Kg)
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-xs text-blue-600 uppercase">
                    Hitung ({formatRp(kargoRate)})
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-xs text-muted-foreground uppercase">
                    Saat Ini
                  </th>
                  <th className="py-2 px-2 font-medium text-xs text-orange-700 uppercase text-right">
                    Ongkir Baru (Rp)
                  </th>
                </tr>
              </thead>
              <tbody>
                {syncRows.map((row, i) => {
                  const changed =
                    row.newOngkir !== row.currentOngkir && row.newOngkir !== "";
                  const noWeight = row.usedWeight == null;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b text-xs ${i % 2 === 0 ? "" : "bg-muted/20"} ${changed ? "bg-orange-50" : ""} ${noWeight ? "bg-yellow-50/60" : ""}`}
                    >
                      <td className="py-1.5 px-2 font-medium">
                        {row.customerName}
                      </td>
                      <td className="py-1.5 px-2 font-mono">
                        <div>{row.resiNumber}</div>
                        {row.packageNumber && (
                          <div className="text-muted-foreground text-[10px]">
                            #{row.packageNumber}
                          </div>
                        )}
                      </td>
                      <td
                        className="py-1.5 px-2 text-muted-foreground max-w-[100px] truncate"
                        title={row.itemName}
                      >
                        {row.itemName || "-"}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {row.usedWeight != null ? (
                          <span className="font-mono">{row.usedWeight} Kg</span>
                        ) : (
                          <span className="text-yellow-600 font-semibold">
                            —
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right text-blue-700 font-semibold">
                        {row.calcOngkir != null ? (
                          `Rp ${row.calcOngkir.toLocaleString("id-ID")}`
                        ) : (
                          <span className="text-yellow-600">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right text-muted-foreground">
                        {row.currentOngkir
                          ? `Rp ${Number(row.currentOngkir).toLocaleString("id-ID")}`
                          : "-"}
                      </td>
                      <td className="py-1.5 px-2">
                        <Input
                          type="number"
                          min={0}
                          className={`h-7 text-right text-xs w-32 ml-auto ${changed ? "border-orange-400 ring-1 ring-orange-300" : ""} ${noWeight ? "border-yellow-400" : ""}`}
                          value={row.newOngkir}
                          onChange={(e) =>
                            setSyncRows((rows) =>
                              rows.map((r, j) =>
                                j === i
                                  ? { ...r, newOngkir: e.target.value }
                                  : r,
                              ),
                            )
                          }
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {syncRows.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                Tidak ada paket Cargo di batch ini.
              </div>
            )}
          </div>

          <div className="border-t pt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {
                  syncRows.filter(
                    (r) =>
                      r.newOngkir !== r.currentOngkir && r.newOngkir !== "",
                  ).length
                }
              </span>{" "}
              paket akan diubah &nbsp;·&nbsp;Total baru:&nbsp;
              <span className="font-semibold text-primary">
                {formatRp(
                  syncRows.reduce(
                    (s, r) =>
                      s +
                      (r.newOngkir !== ""
                        ? Number(r.newOngkir)
                        : Number(r.currentOngkir || 0)),
                    0,
                  ),
                )}
              </span>
            </p>
            <DialogFooter className="flex-row gap-2 pt-0">
              <Button
                variant="outline"
                onClick={() => setSyncOpen(false)}
                disabled={syncing}
              >
                Batal
              </Button>
              <Button
                onClick={saveSync}
                disabled={
                  syncing ||
                  syncRows.filter(
                    (r) =>
                      r.newOngkir !== r.currentOngkir && r.newOngkir !== "",
                  ).length === 0
                }
                className="gap-2 bg-orange-600 hover:bg-orange-700"
              >
                <Save className="w-4 h-4" />
                {syncing ? "Menyimpan..." : "Simpan Semua"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Kelola & Hapus Data Hasil Impor (Owner only) */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-red-600" />
              Hapus Data Hasil Impor — {batch?.namaKapal || batchLabel}
            </DialogTitle>
            <DialogDescription>
              Bersihkan paket hasil impor Excel yang salah/dobel pada batch ini. Paket input manual dan paket yang sudah diverifikasi/diambil/masuk transaksi tidak akan dihapus.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {lastDeleteResult && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs space-y-1">
                <p className="font-semibold text-blue-900">{lastDeleteResult.message}</p>
                {lastDeleteResult.skippedCount > 0 && lastDeleteResult.skippedReasons && (
                  <p className="text-blue-800">
                    Rincian dilewati — Diverifikasi: {lastDeleteResult.skippedReasons.verified || 0}, Sudah diambil:{" "}
                    {lastDeleteResult.skippedReasons.pickedUp || 0}, Masuk transaksi:{" "}
                    {lastDeleteResult.skippedReasons.inTransaction || 0}, Masuk invoice:{" "}
                    {lastDeleteResult.skippedReasons.inInvoice || 0}, Input manual:{" "}
                    {lastDeleteResult.skippedReasons.manual || 0}.
                  </p>
                )}
              </div>
            )}

            {loadingImports ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Memuat daftar sesi impor...
              </div>
            ) : !importSummary ? null : (
              <>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg border p-2.5 bg-muted/20">
                    <p className="text-muted-foreground">Hasil Impor Terlacak</p>
                    <p className="text-lg font-bold">{importSummary.trackedPackageCount ?? 0} paket</p>
                  </div>
                  <div className="rounded-lg border p-2.5 bg-muted/20">
                    <p className="text-muted-foreground">Input Manual (Aman)</p>
                    <p className="text-lg font-bold text-emerald-700">{importSummary.manualCount ?? 0} paket</p>
                  </div>
                  <div className="rounded-lg border p-2.5 bg-muted/20">
                    <p className="text-muted-foreground">Data Lama (Tanpa Tag)</p>
                    <p className="text-lg font-bold text-amber-700">{importSummary.legacyUnlinkedCount ?? 0} paket</p>
                  </div>
                </div>

                {/* Daftar sesi impor */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Daftar Sesi Impor Excel ({importSummary.imports?.length ?? 0})
                  </p>
                  {!importSummary.imports?.length ? (
                    <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                      Belum ada sesi impor Excel terlacak di batch ini.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {importSummary.imports.map((imp: any) => (
                        <div
                          key={imp.importId}
                          className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm truncate">{imp.fileName}</span>
                              <Badge variant="outline" className="text-[11px]">
                                ID #{imp.importId}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(imp.createdAt).toLocaleString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {imp.importedByName ? ` · oleh ${imp.importedByName}` : ""}
                            </p>
                            <p className="text-xs">
                              Tersisa <strong>{imp.currentPackageCount}</strong> dari {imp.packageCount} paket{" "}
                              <span className="text-emerald-700">({imp.deletableCount} bisa dihapus</span>
                              {imp.lockedCount > 0 ? (
                                <span className="text-amber-700">, {imp.lockedCount} terkunci</span>
                              ) : null}
                              )
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={isDeletingImports || imp.deletableCount === 0}
                            onClick={() =>
                              setDeleteTarget({
                                mode: "single",
                                importId: imp.importId,
                                fileName: imp.fileName,
                                deletableCount: imp.deletableCount,
                                lockedCount: imp.lockedCount,
                              })
                            }
                            className="shrink-0 gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Hapus Sesi Ini
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Hapus data impor per card (jenis layanan) */}
                {Array.isArray(importSummary.serviceCards) && importSummary.serviceCards.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Hapus Data Impor Per Card Layanan ({importSummary.serviceCards.length})
                    </p>
                    <div className="space-y-2">
                      {importSummary.serviceCards.map((card: any) => (
                        <div
                          key={card.serviceKey}
                          className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{card.serviceLabel}</span>
                              <Badge variant="outline" className="text-[11px]">
                                {card.activeCardCount} paket aktif
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Impor terlacak: {card.deletableTrackedCount} · Data lama (tanpa tag):{" "}
                              {card.deletableLegacyCount}
                              {card.manualCount > 0 ? ` · Manual (aman): ${card.manualCount}` : ""}
                              {card.lockedCount > 0 ? ` · Terkunci: ${card.lockedCount}` : ""}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={isDeletingImports || card.deletableImportCount === 0}
                            onClick={() =>
                              setDeleteTarget({
                                mode: "service-card",
                                serviceKey: card.serviceKey,
                                serviceLabel: card.serviceLabel,
                                deletableCount: card.deletableImportCount,
                                lockedCount: card.lockedCount + card.manualCount,
                              })
                            }
                            className="shrink-0 gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Hapus Card Ini ({card.deletableImportCount})
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hapus semua data impor batch */}
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-3.5 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <p className="font-semibold text-red-900">Hapus Semua Data Hasil Impor Batch Ini</p>
                      <p className="text-red-800/90">
                        Menghapus seluruh paket hasil impor pada batch ini yang masih aman dihapus (belum diverifikasi, belum diambil, dan belum masuk transaksi/invoice). Paket input manual tidak akan disentuh.
                      </p>
                    </div>
                  </div>

                  {(importSummary.legacyUnlinkedCount ?? 0) > 0 && (
                    <div className="flex items-start space-x-2 rounded border border-amber-200 bg-amber-50/70 p-2.5">
                      <Checkbox
                        id="include-legacy-imports"
                        checked={includeLegacyImports}
                        onCheckedChange={(v) => setIncludeLegacyImports(Boolean(v))}
                      />
                      <Label
                        htmlFor="include-legacy-imports"
                        className="text-xs leading-snug text-amber-950 cursor-pointer"
                      >
                        Sertakan <strong>{importSummary.legacyUnlinkedCount} paket data lama</strong> (diimpor sebelum fitur pelacakan impor; {importSummary.deletableLegacyCount} memenuhi syarat aman dihapus). Paket input manual baru tetap tidak tersentuh.
                      </Label>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={
                        isDeletingImports ||
                        ((importSummary.deletableTrackedCount ?? 0) === 0 &&
                          (!includeLegacyImports || (importSummary.deletableLegacyCount ?? 0) === 0))
                      }
                      onClick={() =>
                        setDeleteTarget({
                          mode: "batch",
                          deletableCount:
                            (importSummary.deletableTrackedCount ?? 0) +
                            (includeLegacyImports ? (importSummary.deletableLegacyCount ?? 0) : 0),
                          includeLegacy: includeLegacyImports,
                        })
                      }
                      className="gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus Semua Impor (
                      {(importSummary.deletableTrackedCount ?? 0) +
                        (includeLegacyImports ? (importSummary.deletableLegacyCount ?? 0) : 0)}{" "}
                      paket)
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportModalOpen(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi AlertDialog hapus data impor (per sesi / per card / batch) */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !isDeletingImports) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Hapus Data Impor</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.mode === "single" ? (
                <>
                  Anda akan menghapus secara permanen paket dari sesi impor{" "}
                  <strong className="text-foreground">{deleteTarget.fileName}</strong> ({" "}
                  <strong className="text-foreground">{deleteTarget.deletableCount} paket</strong> akan dihapus
                  {deleteTarget.lockedCount > 0 ? `, ${deleteTarget.lockedCount} paket terkunci akan dilewati` : ""}).
                </>
              ) : deleteTarget?.mode === "service-card" ? (
                <>
                  Anda akan menghapus secara permanen paket hasil impor / data lama pada card{" "}
                  <strong className="text-foreground">{deleteTarget.serviceLabel}</strong> ({" "}
                  <strong className="text-foreground">{deleteTarget.deletableCount} paket</strong> akan dihapus
                  {deleteTarget.lockedCount > 0 ? `, ${deleteTarget.lockedCount} paket terkunci/manual akan dilewati` : ""}).
                </>
              ) : (
                <>
                  Anda akan menghapus secara permanen seluruh paket hasil impor pada batch ini ({" "}
                  <strong className="text-foreground">{deleteTarget?.deletableCount ?? 0} paket</strong> akan dihapus
                  {deleteTarget?.includeLegacy ? ", termasuk data lama tanpa tag impor" : ""}).
                </>
              )}
              <br />
              <br />
              Tindakan ini tidak dapat dibatalkan. Paket input manual, paket sudah diverifikasi, sudah diambil, atau sudah masuk transaksi/invoice tetap aman.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingImports}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDeleteImport();
              }}
              disabled={isDeletingImports}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeletingImports ? "Menghapus..." : "Ya, Hapus Permanen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Konfirmasi AlertDialog hapus langsung 1 Card Jenis Jastip beserta paketnya (Owner only) */}
      <AlertDialog
        open={Boolean(cardDeleteTarget)}
        onOpenChange={(open) => {
          if (!open && !isDeletingImports) setCardDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hapus Card &ldquo;{cardDeleteTarget?.serviceLabel}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              {(() => {
                const cardInfo = importSummary?.serviceCards?.find(
                  (c: any) => c.serviceKey === cardDeleteTarget?.serviceKey,
                );
                if (loadingImports && !cardInfo) {
                  return (
                    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Memeriksa data paket pada card ini...
                    </div>
                  );
                }
                const deletableImport = cardInfo?.deletableImportCount ?? 0;
                const deletableManual = cardInfo?.deletableManualCount ?? 0;
                const locked = cardInfo?.lockedCount ?? 0;
                const willDelete =
                  deletableImport + (includeManualInCardDelete ? deletableManual : 0);

                return (
                  <div className="text-sm text-muted-foreground space-y-3">
                    <p>
                      Card <strong className="text-foreground">{cardDeleteTarget?.serviceLabel}</strong> memiliki{" "}
                      <strong className="text-foreground">{cardDeleteTarget?.activeCount ?? 0} paket aktif</strong> pada batch ini (hanya card ini yang terdampak, card lainnya tetap aman).
                    </p>
                    <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                      <p>
                        Paket hasil impor / data lama siap dihapus:{" "}
                        <strong className="text-foreground">{deletableImport} paket</strong>
                      </p>
                      {deletableManual > 0 && (
                        <p>
                          Paket input manual di card ini:{" "}
                          <strong className="text-foreground">{deletableManual} paket</strong>
                        </p>
                      )}
                      {locked > 0 && (
                        <p className="text-amber-700">
                          Paket terkunci (sudah diverifikasi / diambil / masuk transaksi / invoice):{" "}
                          <strong>{locked} paket</strong> (tetap aman, tidak dihapus)
                        </p>
                      )}
                    </div>

                    {deletableManual > 0 && (
                      <div className="flex items-start space-x-2 rounded border border-amber-200 bg-amber-50/70 p-2.5">
                        <Checkbox
                          id="include-manual-card-delete"
                          checked={includeManualInCardDelete}
                          onCheckedChange={(v) => setIncludeManualInCardDelete(Boolean(v))}
                        />
                        <Label
                          htmlFor="include-manual-card-delete"
                          className="text-xs leading-snug text-amber-950 cursor-pointer"
                        >
                          Sertakan <strong>{deletableManual} paket input manual</strong> di dalam card{" "}
                          <strong>{cardDeleteTarget?.serviceLabel}</strong> agar seluruh paket pada card ini ikut terhapus.
                        </Label>
                      </div>
                    )}

                    <p className="text-xs text-red-700 font-medium">
                      Total yang akan dihapus permanen: <strong>{willDelete} paket</strong>. Tindakan ini tidak dapat dibatalkan.
                    </p>
                  </div>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingImports}>Batal</AlertDialogCancel>
            {(() => {
              const cardInfo = importSummary?.serviceCards?.find(
                (c: any) => c.serviceKey === cardDeleteTarget?.serviceKey,
              );
              const willDelete =
                (cardInfo?.deletableImportCount ?? 0) +
                (includeManualInCardDelete ? (cardInfo?.deletableManualCount ?? 0) : 0);
              return (
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleConfirmDeleteServiceCard();
                  }}
                  disabled={isDeletingImports || loadingImports || willDelete === 0}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isDeletingImports ? "Menghapus..." : `Ya, Hapus Card (${willDelete} paket)`}
                </AlertDialogAction>
              );
            })()}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
