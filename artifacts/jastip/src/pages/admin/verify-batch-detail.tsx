import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useListPackages, useListBatches, useVerifyPackage } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Camera, Upload, ScanLine, X, CheckCircle2, XCircle,
  Users, Package, Hash, ShieldCheck, RotateCcw, Ship, Lock, Archive,
  Search, Clock,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const GROUP_PAGE_SIZE = 15;

interface PkgGroup {
  customerName: string;
  serviceType: string;
  batchId: number | null;
  packages: any[];
}

function groupPackages(pkgs: any[]): PkgGroup[] {
  const map: Record<string, any[]> = {};
  for (const p of pkgs) {
    if (!p.customerName) continue;
    const key = [
      p.customerName.trim().toLowerCase(),
      (p.serviceType || "").toLowerCase(),
    ].join("|");
    if (!map[key]) map[key] = [];
    map[key].push(p);
  }
  return Object.entries(map).map(([, pkgs]) => ({
    customerName: pkgs[0].customerName,
    serviceType: pkgs[0].serviceType || "",
    batchId: pkgs[0].batchId ?? null,
    packages: pkgs,
  }));
}

type VerifyResult = "match" | "mismatch" | null;

function formatTgl(val: any) {
  if (!val) return "";
  try { return new Date(val).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return String(val); }
}

function batchStatusColor(s: string) {
  if (s === "OPEN") return "bg-green-100 text-green-800 border-green-200";
  if (s === "CLOSED") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}
function batchStatusIcon(s: string) {
  if (s === "OPEN") return <CheckCircle2 className="w-3 h-3" />;
  if (s === "CLOSED") return <Lock className="w-3 h-3" />;
  return <Archive className="w-3 h-3" />;
}
function batchStatusLabel(s: string) {
  if (s === "OPEN") return "Aktif";
  if (s === "CLOSED") return "Ditutup";
  return "Arsip";
}

export default function VerifyBatchDetail({ params }: { params: { id: string } }) {
  const isNoBatch = params?.id === "no-batch";
  const batchId = isNoBatch ? null : Number(params?.id);

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const base = user?.role === "owner" ? "/owner" : "/admin";

  const { data: allPackages, isLoading: pkgLoading, refetch: refetchPackages } = useListPackages();
  const { data: batches } = useListBatches();
  const verifyMutation = useVerifyPackage();

  // ── Step 0: service type selector ────────────────────────────────────────────
  const [selectedServiceType, setSelectedServiceType] = useState<string | null>(null);

  // ── Filters (Step 1) ────────────────────────────────────────────────────────
  const [searchGroup, setSearchGroup] = useState("");
  const [filterServiceType, setFilterServiceType] = useState("all");
  const [filterVerified, setFilterVerified] = useState("all"); // "all" | "verified" | "unverified"
  const [groupPage, setGroupPage] = useState(1);

  // ── Verify (Step 2) ─────────────────────────────────────────────────────────
  const [selectedGroup, setSelectedGroup] = useState<PkgGroup | null>(null);
  const [scanMode, setScanMode] = useState<"idle" | "camera" | "manual">("idle");
  const [verifyResult, setVerifyResult] = useState<VerifyResult>(null);
  const [resultPkg, setResultPkg] = useState<any | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [scanHistory, setScanHistory] = useState<{ barcode: string; result: VerifyResult; pkg: any | null }[]>([]);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lookupRef = useRef<(code: string) => Promise<void>>(async () => {});
  const SCANNER_ID = "verify-qr-scanner";

  // ── Derived data ─────────────────────────────────────────────────────────────
  const batch = isNoBatch ? null : (batches || []).find((b: any) => b.id === batchId);
  const batchLabel = isNoBatch ? "Paket Tanpa Batch" : (batch?.namaKapal || `Batch #${batchId}`);

  // Packages for this batch (active only)
  const batchPkgs = (allPackages || []).filter((p: any) =>
    isNoBatch ? p.batchId == null : p.batchId === batchId
  );

  const allGroups = groupPackages(batchPkgs);

  // Counts for summary
  const activePkgs = batchPkgs;
  const totalPkgs = activePkgs.length;
  const totalVerified = batchPkgs.filter((p: any) => p.statusVerifikasi === "SUDAH_DIVERIFIKASI").length;

  // ── Service type stats ────────────────────────────────────────────────────────
  const SVC_DEFS = [
    { key: "jastip pesawat", label: "Jastip Pesawat", emoji: "✈️", border: "border-blue-200", bg: "bg-blue-50/60", num: "text-blue-700" },
    { key: "jastip hemat+",  label: "Jastip Hemat+",  emoji: "📦", border: "border-emerald-200", bg: "bg-emerald-50/60", num: "text-emerald-700" },
    { key: "jastip kargo",   label: "Jastip Kargo",   emoji: "🚛", border: "border-orange-200", bg: "bg-orange-50/60", num: "text-orange-700" },
    { key: "jastip pelni",   label: "Jastip Pelni",   emoji: "🚢", border: "border-indigo-200", bg: "bg-indigo-50/60", num: "text-indigo-700" },
  ];
  const knownSvcKeys = SVC_DEFS.map(d => d.key);
  const svcStats = [
    ...SVC_DEFS.map(def => {
      const pkgs = activePkgs.filter((p: any) => (p.serviceType || "").toLowerCase() === def.key);
      if (!pkgs.length) return null;
      const verified = pkgs.filter((p: any) => p.statusVerifikasi === "SUDAH_DIVERIFIKASI").length;
      return { ...def, count: pkgs.length, verified, unverified: pkgs.length - verified };
    }).filter(Boolean),
    (() => { const pkgs = activePkgs.filter((p: any) => !knownSvcKeys.includes((p.serviceType || "").toLowerCase())); if (!pkgs.length) return null; const verified = pkgs.filter((p: any) => p.statusVerifikasi === "SUDAH_DIVERIFIKASI").length; return { key: "lainnya", label: "Lainnya", emoji: "📋", border: "border-gray-200", bg: "bg-gray-50/60", num: "text-gray-700", count: pkgs.length, verified, unverified: pkgs.length - verified }; })(),
  ].filter(Boolean) as { key: string; label: string; emoji: string; border: string; bg: string; num: string; count: number; verified: number; unverified: number }[];
  const selectedSvcLabel = SVC_DEFS.find(d => d.key === selectedServiceType)?.label ?? (selectedServiceType === "lainnya" ? "Lainnya" : "");
  const selectedSvcEmoji = SVC_DEFS.find(d => d.key === selectedServiceType)?.emoji ?? "📋";

  // Live-update selectedGroup when data refetches
  useEffect(() => {
    if (!selectedGroup || !allPackages) return;
    const fresh = (allPackages || []).filter(
      (p: any) =>
        (isNoBatch ? p.batchId == null : p.batchId === batchId) &&
        p.customerName?.toLowerCase().trim() === selectedGroup.customerName.toLowerCase().trim() &&
        (p.serviceType || "").toLowerCase() === selectedGroup.serviceType.toLowerCase()
    );
    if (fresh.length > 0) {
      setSelectedGroup((prev) => prev ? { ...prev, packages: fresh } : prev);
    }
  }, [allPackages]);

  // Filter groups
  const filteredGroups = allGroups.filter((g) => {
    const q = searchGroup.trim().toLowerCase();
    // When there's a search query, bypass service-type filter so all types are searched
    if (!q && filterServiceType !== "all" && (g.serviceType || "").toLowerCase() !== filterServiceType) return false;
    if (filterVerified === "verified" && g.packages.some((p) => p.statusVerifikasi !== "SUDAH_DIVERIFIKASI")) {
      // keep only if ALL are verified
      if (!g.packages.every((p) => p.statusVerifikasi === "SUDAH_DIVERIFIKASI")) return false;
    }
    if (filterVerified === "unverified" && g.packages.every((p) => p.statusVerifikasi === "SUDAH_DIVERIFIKASI")) return false;
    if (q) {
      const nameMatch = g.customerName.toLowerCase().includes(q);
      const resiMatch = g.packages.some(
        (p) =>
          (p.resiNumber || "").toLowerCase().includes(q) ||
          (p.barcode || "").toLowerCase().includes(q) ||
          (p.packageNumber || "").toLowerCase().includes(q)
      );
      if (!nameMatch && !resiMatch) return false;
    }
    return true;
  });

  const totalGroupPages = Math.max(1, Math.ceil(filteredGroups.length / GROUP_PAGE_SIZE));
  const safePage = Math.min(groupPage, totalGroupPages);
  const paginated = filteredGroups.slice((safePage - 1) * GROUP_PAGE_SIZE, safePage * GROUP_PAGE_SIZE);

  // ── Verify logic ─────────────────────────────────────────────────────────────
  async function lookupAndVerify(rawCode: string) {
    if (!selectedGroup) return;
    const code = rawCode.trim();
    if (!code) return;

    setIsSearching(true);
    setVerifyResult(null);
    setResultPkg(null);
    try {
      const token = localStorage.getItem("jaj_token");
      const batchParam = !isNoBatch && batchId ? `?batchId=${batchId}` : "";
      const r = await fetch(`/api/packages/scan/${encodeURIComponent(code)}${batchParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();

      let targetPkgs: any[] = [];

      if (data.valid && data.group && Array.isArray(data.packages) && data.packages.length > 0) {
        targetPkgs = data.packages;
      } else if (data.valid && data.package) {
        targetPkgs = [data.package];
      } else if (data.package) {
        targetPkgs = [data.package];
      } else if (Array.isArray(data.packages) && data.packages.length > 0) {
        targetPkgs = data.packages;
      } else {
        // Fallback: search in local allPackages strictly matching code/IDs
        if (code.startsWith("JAJ-GRUP-")) {
          const ids = code
            .replace("JAJ-GRUP-", "")
            .split("-")
            .map(Number)
            .filter((n) => Number.isInteger(n) && n > 0);
          if (ids.length && allPackages) {
            targetPkgs = (allPackages || []).filter((p: any) => ids.includes(p.id));
          }
        }

        if (!targetPkgs.length && allPackages) {
          const lower = code.toLowerCase();
          const found = (allPackages || []).filter(
            (p: any) =>
              p.barcode?.toLowerCase() === lower ||
              p.resiNumber?.toLowerCase() === lower ||
              p.packageNumber?.toLowerCase() === lower ||
              String(p.id) === code
          );
          if (found.length > 0) {
            const inBatch = !isNoBatch && batchId
              ? found.find((p: any) => p.batchId === batchId)
              : null;
            targetPkgs = inBatch ? [inBatch] : [found[0]];
          }
        }
      }

      if (!targetPkgs.length) {
        setVerifyResult("mismatch");
        setResultPkg(null);
        setScanHistory((h) => [{ barcode: code, result: "mismatch", pkg: null }, ...h]);
        toast({ variant: "destructive", title: "Paket tidak ditemukan", description: `Kode: ${code}` });
        return;
      }

      const firstTarget = targetPkgs[0];
      const isMatch =
        firstTarget.customerName?.toLowerCase().trim() === selectedGroup.customerName.toLowerCase().trim() &&
        (isNoBatch ? firstTarget.batchId == null : firstTarget.batchId === batchId);

      if (isMatch) {
        let newlyVerifiedCount = 0;
        for (const p of targetPkgs) {
          if (
            p.customerName?.toLowerCase().trim() === selectedGroup.customerName.toLowerCase().trim() &&
            (isNoBatch ? p.batchId == null : p.batchId === batchId) &&
            p.statusVerifikasi !== "SUDAH_DIVERIFIKASI"
          ) {
            try {
              await verifyMutation.mutateAsync({ id: p.id });
              newlyVerifiedCount++;
            } catch {}
          }
        }
        refetchPackages();
        setVerifyResult("match");
        setResultPkg(firstTarget);
        setScanHistory((h) => [{ barcode: code, result: "match", pkg: firstTarget }, ...h]);
        toast({
          title: "✓ Verifikasi Berhasil",
          description: `${firstTarget.customerName} (${targetPkgs.length > 1 ? `${targetPkgs.length} paket` : (firstTarget.resiNumber || firstTarget.barcode || "1 paket")})`,
        });
      } else {
        setVerifyResult("mismatch");
        setResultPkg(firstTarget);
        setScanHistory((h) => [{ barcode: code, result: "mismatch", pkg: firstTarget }, ...h]);
      }
    } catch {
      toast({ variant: "destructive", title: "Gagal mencari paket" });
    } finally {
      setIsSearching(false);
    }
  }

  // Keep lookupRef always pointing to latest closure (avoids stale-ref in keyboard listener)
  useEffect(() => { lookupRef.current = lookupAndVerify; });

  // ── External barcode scanner (USB/Bluetooth HID keyboard wedge) ──────────────
  // Scanners type chars very fast then send Enter. Accumulate chars and fire on Enter.
  useEffect(() => {
    if (!selectedGroup) return;
    let buffer = "";
    let lastKeyTime = 0;

    function onKeyDown(e: KeyboardEvent) {
      // Ignore when user is typing inside an input / textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const now = Date.now();

      if (e.key === "Enter") {
        const trimmed = buffer.trim();
        buffer = "";
        if (trimmed.length >= 4) {
          e.preventDefault();
          lookupRef.current(trimmed);
        }
        return;
      }

      // Only printable single characters
      if (e.key.length !== 1) return;

      // If gap since last char > 100 ms the user is typing manually (not a scanner)
      if (buffer.length > 0 && now - lastKeyTime > 100) {
        buffer = "";
      }

      buffer += e.key;
      lastKeyTime = now;
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedGroup]);

  const handleScanSuccess = useCallback(async (code: string) => {
    await stopCamera();
    await lookupAndVerify(code);
  }, [selectedGroup]);

  async function startCamera() {
    setScanMode("camera");
    try {
      const devices = await Html5Qrcode.getCameras();
      if (!devices.length) {
        toast({ variant: "destructive", title: "Kamera tidak tersedia" });
        setScanMode("idle"); return;
      }
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      await scanner.start(
        devices[devices.length - 1].id,
        { fps: 10, qrbox: { width: 260, height: 120 } },
        handleScanSuccess, undefined
      );
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gagal akses kamera", description: err?.message });
      setScanMode("idle");
    }
  }

  async function stopCamera() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    setScanMode("idle");
  }

  useEffect(() => () => { stopCamera(); }, []);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const tempId = "verify-qr-temp-" + Date.now();
    const tempDiv = document.createElement("div");
    tempDiv.id = tempId; tempDiv.style.display = "none";
    document.body.appendChild(tempDiv);
    const scanner = new Html5Qrcode(tempId);
    scanner.scanFile(file, false)
      .then(async (code) => {
        scanner.clear(); document.body.removeChild(tempDiv);
        await lookupAndVerify(code);
      })
      .catch(() => {
        scanner.clear(); document.body.removeChild(tempDiv);
        toast({ variant: "destructive", title: "Gagal membaca barcode" });
      });
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualInput.trim()) return;
    await lookupAndVerify(manualInput.trim());
    setManualInput("");
  }

  function resetResult() { setVerifyResult(null); setResultPkg(null); }

  function changeGroup() {
    stopCamera();
    setSelectedGroup(null);
    setScanHistory([]);
    setVerifyResult(null);
    setResultPkg(null);
    setScanMode("idle");
  }

  const matchCount = scanHistory.filter((h) => h.result === "match").length;
  const mismatchCount = scanHistory.filter((h) => h.result === "mismatch").length;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="outline" size="icon" onClick={() => { if (selectedGroup) { changeGroup(); } else { setLocation(`${base}/verify`); } }}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            {isNoBatch ? (
              <div className="p-1.5 rounded-lg bg-gray-100">
                <Package className="w-5 h-5 text-gray-500" />
              </div>
            ) : (
              <div className={`p-1.5 rounded-lg ${batch?.statusBatch === "OPEN" ? "bg-blue-100" : "bg-gray-100"}`}>
                <Ship className={`w-5 h-5 ${batch?.statusBatch === "OPEN" ? "text-blue-700" : "text-gray-500"}`} />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight">{batchLabel}</h1>
            {batch && (
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${batchStatusColor(batch.statusBatch)}`}>
                {batchStatusIcon(batch.statusBatch)}
                {batchStatusLabel(batch.statusBatch)}
              </span>
            )}
          </div>
          {batch && (
            <p className="text-sm text-muted-foreground mt-1">
              {batch.kotaAsal} → {batch.tujuan}
              &nbsp;·&nbsp; ETD: {formatTgl(batch.etd)}
              &nbsp;·&nbsp; Closing: {formatTgl(batch.periodeClosingMulai)} – {formatTgl(batch.periodeClosingSelesai)}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-700">
              <CheckCircle2 className="w-4 h-4" /> {totalVerified} terverifikasi
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700">
              <Clock className="w-4 h-4" /> {totalPkgs - totalVerified} belum
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">{allGroups.length} penerima</span>
          </div>
        </div>
      </div>

      {/* ── STEP 0: pilih jenis jastip ──────────────────────────────────────────── */}
      {!selectedServiceType ? (
        pkgLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Card key={i} className="animate-pulse"><CardContent className="h-40 pt-4 bg-muted/20"/></Card>)}
          </div>
        ) : svcStats.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <ShieldCheck className="w-14 h-14 mx-auto mb-4 opacity-20" />
            <p className="font-semibold">Tidak ada paket aktif dalam batch ini</p>
            <p className="text-sm mt-1">Paket mungkin sudah diserahkan semua</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {svcStats.map(svc => (
              <Card
                key={svc.key}
                className={`cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all border-2 ${svc.border} ${svc.bg}`}
                onClick={() => { setSelectedServiceType(svc.key); setFilterServiceType(svc.key); setGroupPage(1); }}
              >
                <CardContent className="pt-5 pb-4">
                  <div className="text-4xl mb-2">{svc.emoji}</div>
                  <p className={`text-sm font-bold leading-snug ${svc.num}`}>{svc.label}</p>
                  <div className="mt-3 space-y-1.5">
                    <div>
                      <span className={`text-3xl font-black ${svc.num}`}>{svc.count}</span>
                      <span className="text-sm text-muted-foreground ml-1">paket</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> {svc.verified} ✓
                      </span>
                      {svc.unverified > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                          <Clock className="w-3 h-3" /> {svc.unverified} belum
                        </span>
                      )}
                    </div>
                    {svc.count > 0 && (
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.round((svc.verified / svc.count) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
      /* ── STEP 1 + 2 (setelah jenis jastip dipilih) ───────────────────────── */
      <>
        {/* Breadcrumb back */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => { changeGroup(); setSelectedServiceType(null); setFilterServiceType("all"); }}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Jenis Jastip
          </Button>
          <span className="text-base font-bold">{selectedSvcEmoji} {selectedSvcLabel}</span>
        </div>

      {/* ── STEP 1: pilih penerima ─────────────────────────────────────────────── */}
      {!selectedGroup ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama atau nomor resi..."
                className="pl-9"
                value={searchGroup}
                onChange={(e) => { setSearchGroup(e.target.value); setGroupPage(1); }}
              />
            </div>

            {/* Filter jenis jastip */}
            <Select value={filterServiceType} onValueChange={(v) => { setFilterServiceType(v); setGroupPage(1); }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Semua Jenis Jastip" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Jenis Jastip</SelectItem>
                <SelectItem value="jastip pesawat">Jastip Pesawat</SelectItem>
                <SelectItem value="jastip hemat+">Jastip Hemat+</SelectItem>
                <SelectItem value="jastip kargo">Jastip Kargo</SelectItem>
                <SelectItem value="jastip pelni">Jastip Pelni</SelectItem>
              </SelectContent>
            </Select>

            {/* Filter status verifikasi */}
            <Select value={filterVerified} onValueChange={(v) => { setFilterVerified(v); setGroupPage(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="unverified">⏳ Belum Diverifikasi</SelectItem>
                <SelectItem value="verified">✓ Sudah Diverifikasi</SelectItem>
              </SelectContent>
            </Select>

            <Badge variant="secondary">{filteredGroups.length} penerima</Badge>
          </div>

          {/* Group cards */}
          {pkgLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Card key={i} className="animate-pulse"><CardContent className="h-24 pt-4 bg-muted/20" /></Card>
              ))}
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">
                {allGroups.length === 0 ? "Tidak ada paket aktif dalam batch ini" : "Tidak ada penerima yang cocok"}
              </p>
              <p className="text-sm mt-1">
                {allGroups.length === 0 ? "Paket mungkin sudah diserahkan semua" : "Coba ubah filter atau kata kunci"}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {paginated.map((group) => {
                  const belum = group.packages.filter((p) => p.statusVerifikasi !== "SUDAH_DIVERIFIKASI").length;
                  const sudah = group.packages.filter((p) => p.statusVerifikasi === "SUDAH_DIVERIFIKASI").length;
                  const allDone = belum === 0;
                  return (
                    <Card
                      key={`${group.customerName}|${group.serviceType}`}
                      className={`cursor-pointer hover:shadow-md transition-all ${allDone ? "border-green-300 bg-green-50/30" : "hover:border-primary/50"}`}
                      onClick={() => setSelectedGroup(group)}
                    >
                      <CardContent className="pt-4 pb-3">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-start justify-between gap-1">
                            <p className="font-semibold text-sm leading-tight flex-1 min-w-0">{group.customerName}</p>
                            {allDone && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />}
                          </div>
                          {group.serviceType && (
                            <Badge variant="outline" className="text-xs w-fit capitalize">
                              {group.serviceType.replace("jastip ", "")}
                            </Badge>
                          )}
                          <p className="text-xs text-muted-foreground">{group.packages.length} paket</p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {belum > 0 && (
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                                {belum} belum
                              </Badge>
                            )}
                            {sudah > 0 && (
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                                {sudah} ✓
                              </Badge>
                            )}
                          </div>
                          {/* Mini progress */}
                          {group.packages.length > 0 && (
                            <div className="h-1 bg-gray-200 rounded-full overflow-hidden mt-0.5">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${Math.round((sudah / group.packages.length) * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <Pagination
                page={safePage}
                totalPages={totalGroupPages}
                total={filteredGroups.length}
                pageSize={GROUP_PAGE_SIZE}
                onPageChange={setGroupPage}
              />
            </>
          )}
        </div>
      ) : (
        /* ── STEP 2: scan & verifikasi ─────────────────────────────────────────── */
        <div className="space-y-4">
          {/* Selected group card */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-base">{selectedGroup.customerName}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedGroup.packages.length} paket
                    {selectedGroup.serviceType ? " · " + selectedGroup.serviceType.replace("jastip ", "Jastip ") : ""}
                    {" · "}Scan barcode untuk verifikasi
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {scanHistory.length > 0 && (
                    <>
                      <Badge className="bg-green-600 text-white text-xs">{matchCount} ✓</Badge>
                      {mismatchCount > 0 && <Badge variant="destructive" className="text-xs">{mismatchCount} ✗</Badge>}
                    </>
                  )}
                  <Button variant="outline" size="sm" onClick={changeGroup}>← Ganti</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Camera scanner */}
          <div id={SCANNER_ID} className={scanMode === "camera" ? "w-full rounded-xl overflow-hidden border" : "hidden"} />

          {/* Verify result */}
          {verifyResult && !isSearching && (
            <Card className={`border-2 ${verifyResult === "match" ? "border-green-500 bg-green-50" : "border-red-400 bg-red-50"}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  {verifyResult === "match"
                    ? <CheckCircle2 className="w-7 h-7 text-green-600 shrink-0 mt-0.5" />
                    : <XCircle className="w-7 h-7 text-red-500 shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    {verifyResult === "match" ? (
                      <>
                        <p className="font-bold text-green-800 text-lg">✓ COCOK — Paket milik {selectedGroup.customerName}</p>
                        {resultPkg && (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 text-sm text-green-700">
                            <span>Resi: <strong className="font-mono">{resultPkg.resiNumber}</strong></span>
                            <span>Berat: {resultPkg.realWeight != null ? resultPkg.realWeight + " Kg" : "-"}</span>
                            <span>Jastip: {resultPkg.serviceType || "-"}</span>
                            <span>Jenis Paking: <strong>{resultPkg.packagingType || "—"}</strong></span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-red-700 text-lg">✗ TIDAK COCOK</p>
                        {resultPkg ? (
                          <p className="text-sm text-red-600 mt-1">
                            Paket ini milik <strong>{resultPkg.customerName || "tidak diketahui"}</strong>, bukan {selectedGroup.customerName}.
                          </p>
                        ) : (
                          <p className="text-sm text-red-600 mt-1">Barcode tidak ditemukan dalam sistem.</p>
                        )}
                      </>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={resetResult} className="shrink-0">
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isSearching && (
            <Card>
              <CardContent className="flex items-center justify-center py-8 text-muted-foreground gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                Memverifikasi paket...
              </CardContent>
            </Card>
          )}

          {/* Scan controls */}
          <div className="grid sm:grid-cols-2 gap-3">
            {scanMode !== "camera" ? (
              <Card className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all" onClick={startCamera}>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Camera className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Scan Kamera</p>
                    <p className="text-xs text-muted-foreground">Arahkan ke barcode</p>
                  </div>
                  <Button size="sm" className="ml-auto">Buka</Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-primary/50">
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Camera className="w-5 h-5 text-primary animate-pulse" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-primary">Kamera Aktif</p>
                    <p className="text-xs text-muted-foreground">Arahkan ke barcode paket</p>
                  </div>
                  <Button size="sm" variant="outline" className="ml-auto" onClick={stopCamera}>
                    <X className="w-3 h-3 mr-1" /> Tutup
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Upload Gambar</p>
                  <p className="text-xs text-muted-foreground">Foto barcode dari galeri</p>
                </div>
                <Button size="sm" className="ml-auto bg-secondary hover:bg-secondary/90" onClick={() => fileInputRef.current?.click()}>Pilih</Button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </CardContent>
            </Card>
          </div>

          {/* Manual input */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Hash className="h-4 w-4" />Input Manual</CardTitle>
              <CardDescription className="text-xs">Ketik nomor resi atau barcode secara manual</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <Input
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Contoh: JAJ-ABC123 atau JNE123456789"
                  className="font-mono"
                />
                <Button type="submit" disabled={!manualInput.trim() || isSearching}>Verifikasi</Button>
              </form>
            </CardContent>
          </Card>

          {/* Scan history */}
          {scanHistory.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <ScanLine className="h-4 w-4" /> Riwayat Scan — {scanHistory.length} item
                <Button variant="ghost" size="sm" className="ml-auto text-xs h-6" onClick={() => setScanHistory([])}>Hapus</Button>
              </p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {scanHistory.map((h, i) => (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${h.result === "match" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    {h.result === "match"
                      ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                    <span className="font-mono flex-1 truncate">{h.pkg?.barcode || h.pkg?.resiNumber || h.barcode}</span>
                    {h.result === "match" ? (
                      <Badge className="bg-green-600 text-white text-xs shrink-0">✓ Cocok</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs shrink-0">
                        {h.pkg ? `Milik ${h.pkg.customerName}` : "Tidak ditemukan"}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daftar paket */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" /> Daftar Paket — {selectedGroup.customerName}
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {selectedGroup.packages.map((p: any) => {
                const isVerified = p.statusVerifikasi === "SUDAH_DIVERIFIKASI";
                return (
                  <div key={p.id} className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${isVerified ? "bg-green-50 border-green-200" : "bg-muted/30"}`}>
                    {isVerified
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                      : <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <span className="font-mono block truncate">{p.resiNumber || p.barcode}</span>
                      {p.packagingType ? (
                        <span className="text-muted-foreground">{p.packagingType}</span>
                      ) : (
                        <span className="text-muted-foreground/40 italic">Paking: —</span>
                      )}
                    </div>
                    <Badge variant="outline" className={`text-xs shrink-0 ${isVerified ? "bg-green-100 text-green-800 border-green-300" : "bg-amber-100 text-amber-800 border-amber-300"}`}>
                      {isVerified ? "✓ Diverifikasi" : "Belum"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
