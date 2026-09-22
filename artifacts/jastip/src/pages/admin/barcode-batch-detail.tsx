import { useEffect, useRef, useState } from "react";
import {
  useListPackages,
  useListBatches,
  getListPackagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
} from "@/components/ui/dialog";
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

// Pelni: tarif bertingkat berdasarkan total berat gabungan konsumen dalam batch
function getPelniRateByTotalWeight(
  totalWeight: number,
  deliveryRoute: string,
): number | null {
  if (!deliveryRoute || !totalWeight || totalWeight <= 0) return null;
  if (deliveryRoute === "Jakarta → Manokwari") {
    if (totalWeight <= 10.1) return 20000;
    if (totalWeight <= 20.1) return 19000;
    if (totalWeight <= 40.1) return 18000;
    if (totalWeight <= 80.1) return 17000;
    return 16000;
  }
  if (deliveryRoute === "Surabaya → Manokwari") {
    if (totalWeight <= 10) return 18000;
    if (totalWeight <= 20) return 17000;
    if (totalWeight <= 40) return 16000;
    return 15500;
  }
  return null;
}

// Hitung total ongkir grup sesuai aturan masing-masing layanan:
// - Pesawat: sum realWeight → bulatkan → × 77000
// - Pelni  : sum usedWeight → tarif bertingkat → × rate
// - Lain   : sum totalShipping per paket
function calcGroupTotalShipping(pkgs: any[]): number {
  const first = pkgs[0];
  const svc = (first?.serviceType || "").toLowerCase();

  if (svc === "jastip pesawat") {
    const totalRealWeight = pkgs.reduce(
      (s, p) => s + (Number(p.realWeight) || 0),
      0,
    );
    const rounded = roundPesawatGroupWeight(totalRealWeight);
    return Math.round(rounded * 77000);
  }

  if (svc === "jastip pelni") {
    const totalWeight = pkgs.reduce(
      (s, p) => s + (Number(p.usedWeight) || Number(p.realWeight) || 0),
      0,
    );
    const rate = getPelniRateByTotalWeight(
      totalWeight,
      first?.deliveryRoute || "",
    ) || 20000;
    const calc = rate
      ? Math.round(totalWeight * rate)
      : pkgs.reduce((s, p) => s + (Number(p.totalShipping) || 0), 0);
    return Math.max(20000, calc);
  }

  return pkgs.reduce((s, p) => s + (Number(p.totalShipping) || 0), 0);
}

// Returns the labelPageHtml string (one page) for a group — shared by single-card print and printAll.
function buildGroupedPage(
  pkgs: any[],
  qrDataUrl: string,
  qrValue: string,
  batchLabel?: string,
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
  const totalShipping = calcGroupTotalShipping(pkgs);
  const pelniRate = isPelni
    ? getPelniRateByTotalWeight(totalWeight, first?.deliveryRoute || "")
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
  const feeRow = totalAdditionalFee > 0
    ? `<div class="field"><div class="fl">Biaya Tambahan</div><div class="fv" style="color:#b45309;">Rp ${totalAdditionalFee.toLocaleString("id-ID")}</div></div>`
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
) {
  const first = pkgs[0];
  return labelDocumentHtml(
    `Label Grup - ${first?.customerName}`,
    buildGroupedPage(pkgs, qrDataUrl, qrValue, batchLabel),
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
            ${(pkg.additionalFee ?? 0) > 0 ? `<div class="field"><div class="fl">Biaya Tambahan</div><div class="fv" style="color:#b45309;">Rp ${Number(pkg.additionalFee).toLocaleString("id-ID")}${pkg.additionalFeeReason ? ` (${pkg.additionalFeeReason})` : ""}</div></div>` : ""}
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
        <div className="text-xs font-semibold text-primary mb-2">
          Ongkir:{" "}
          {pkg.totalShipping != null
            ? `Rp ${Number(pkg.totalShipping).toLocaleString("id-ID")}`
            : "-"}
        </div>
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
}: {
  pkgs: any[];
  batchLabel?: string;
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
  const totalShipping = calcGroupTotalShipping(pkgs);
  const pelniRate = isPelniCard
    ? getPelniRateByTotalWeight(totalWeight, first?.deliveryRoute || "")
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
      buildGroupedPrintHtml(pkgs, qrDataUrl, qrValue, batchLabel),
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
        <div className="mb-2 space-y-0.5">
          {pkgs.map((p, i) => (
            <div
              key={p.id}
              className="flex items-center justify-between text-xs text-muted-foreground"
            >
              <span className="font-mono truncate max-w-[120px]">
                #{i + 1} {p.resiNumber || "-"}
              </span>
              <span>{p.usedWeight != null ? p.usedWeight + " Kg" : "-"}</span>
            </div>
          ))}
        </div>
        {isPesawatCard && (
          <div className="text-xs text-blue-600 mb-0.5">
            ✈️ Real: {pesawatTotalReal.toFixed(3)} Kg → Dibulatkan:{" "}
            {pesawatRounded.toFixed(3)} Kg × Rp77.000
          </div>
        )}
        {isPelniCard && pelniRate && (
          <div className="text-xs text-indigo-600 mb-0.5">
            🚢 Harga/kg: {formatRp(pelniRate)} · Berat total:{" "}
            {totalWeight.toFixed(3)} Kg
          </div>
        )}
        <div className="text-xs font-semibold text-primary mb-2">
          Total Ongkir: {formatRp(totalShipping)}
        </div>
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
  params,
}: {
  params: { id: string };
}) {
  const batchId = Number(params?.id);
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const base = user?.role === "owner" ? "/owner" : "/admin";

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

  // ── Sinkronisasi ongkir Kargo ─────────────────────────────────────────────
  const KARGO_RATE = 7000;
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncRows, setSyncRows] = useState<
    {
      id: number;
      customerName: string;
      resiNumber: string;
      packageNumber: string;
      itemName: string;
      usedWeight: number | null;
      calcOngkir: number | null; // berat × 7.000
      currentOngkir: string;
      newOngkir: string;
    }[]
  >([]);
  const [syncing, setSyncing] = useState(false);

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
    return Math.round(berat * KARGO_RATE);
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
        pages.push(buildGroupedPage(pkgs, qrDataUrl, qrValue, batchLabel));
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
        <Button
          onClick={printAll}
          disabled={batchPkgs.length === 0}
          className="gap-2 shrink-0"
        >
          <Printer className="h-4 w-4" /> Cetak Semua
        </Button>
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
                  <p className={`text-sm font-bold leading-snug ${svc.num}`}>
                    {svc.label}
                  </p>
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
              <p className="font-semibold">Rumus: Berat Paket × Rp 7.000</p>
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
                <RefreshCw className="w-3 h-3" /> Hitung Ulang Semua (Berat × Rp
                7.000)
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
                    Hitung (×7rb)
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
    </div>
  );
}
