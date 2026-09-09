import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Camera, Upload, ScanLine, X, Hash, Trash2, CheckCircle2,
  ShoppingCart, RotateCcw, Banknote, CreditCard, Clock, ChevronDown, ChevronUp,
  AlertTriangle, Users, Tag, Printer,
} from "lucide-react";
import { buildReceiptDocument, type ReceiptPrintPayload } from "@/lib/print-receipt";

function formatRp(n: number | string | null | undefined) {
  if (n == null || n === "") return "Rp 0";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}
function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const serviceLabel: Record<string, string> = {
  "jastip pesawat": "Jastip Pesawat",
  "jastip hemat+": "Jastip Hemat+",
  "jastip kargo": "Jastip Kargo",
  "jastip pelni": "Jastip Pelni",
};

interface ScannedItem {
  id: number;
  barcode: string;
  resiNumber: string;
  packageNumber?: string;
  customerName: string;
  serviceType: string;
  deliveryRoute?: string;
  packagingType?: string;
  itemName?: string;
  adminName?: string;
  packageDate?: string;
  realWeight?: number | null;
  volumeWeight?: number | null;
  usedWeight?: number | null;
  shippingRate?: number | null;
  totalShipping: number;
  length?: number | null;
  width?: number | null;
  height?: number | null;
}

type PaymentType = "tunai" | "transfer" | "piutang";

const PAYMENT_TYPES: { value: PaymentType; label: string; icon: any; desc: string; color: string }[] = [
  { value: "tunai", label: "Tunai", icon: Banknote, desc: "Bayar cash langsung", color: "green" },
  { value: "transfer", label: "Transfer", icon: CreditCard, desc: "Transfer bank / QRIS", color: "blue" },
  { value: "piutang", label: "Piutang", icon: Clock, desc: "Bayar nanti / hutang", color: "orange" },
];

function toItem(pkg: any): ScannedItem {
  return {
    id: pkg.id,
    barcode: pkg.barcode || "",
    resiNumber: pkg.resiNumber || "",
    packageNumber: pkg.packageNumber || "",
    customerName: pkg.customerName || "-",
    serviceType: pkg.serviceType || "",
    deliveryRoute: pkg.deliveryRoute || "",
    packagingType: pkg.packagingType || "",
    itemName: pkg.itemName || "",
    adminName: pkg.adminName || "",
    packageDate: pkg.packageDate || "",
    realWeight: pkg.realWeight != null ? Number(pkg.realWeight) : null,
    volumeWeight: pkg.volumeWeight != null ? Number(pkg.volumeWeight) : null,
    usedWeight: pkg.usedWeight != null ? Number(pkg.usedWeight) : null,
    shippingRate: pkg.shippingRate != null ? Number(pkg.shippingRate) : null,
    totalShipping: Number(pkg.totalShipping ?? 0),
    length: pkg.length != null ? Number(pkg.length) : null,
    width: pkg.width != null ? Number(pkg.width) : null,
    height: pkg.height != null ? Number(pkg.height) : null,
  };
}

export default function AdminScan() {
  const { toast } = useToast();

  const [scanMode, setScanMode] = useState<"idle" | "camera">("idle");
  const [manualInput, setManualInput] = useState("");
  const [isLooking, setIsLooking] = useState(false);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [alreadyDelivered, setAlreadyDelivered] = useState<any>(null);

  const [showPayModal, setShowPayModal] = useState(false);
  const [uangDibayar, setUangDibayar] = useState("");
  const [quickCashAmount, setQuickCashAmount] = useState<number | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType>("tunai");
  const [paymentReference, setPaymentReference] = useState("");
  const [penanggungJawab, setPenanggungJawab] = useState("");
  const [nominalPiutang, setNominalPiutang] = useState("0");
  const [jatuhTempo, setJatuhTempo] = useState("");
  const [catatanPiutang, setCatatanPiutang] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [receiptPrintMode, setReceiptPrintMode] = useState<"AUTO" | "ASK" | "OFF">("ASK");
  const [receiptPromptTransactionId, setReceiptPromptTransactionId] = useState<number | null>(null);

  // ── Diskon State ─────────────────────────────────────────────────────────
  const [diskon, setDiskon] = useState<string>("");
  const [alasanDiskon, setAlasanDiskon] = useState("");
  // ─────────────────────────────────────────────────────────────────────────

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const manualRef = useRef<HTMLInputElement>(null);
  const lastScannedCodeRef = useRef<string>("");
  const isScanProcessingRef = useRef<boolean>(false);
  const isSavingRef = useRef<boolean>(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const itemsRef = useRef<ScannedItem[]>([]);
  const addedIdsRef = useRef<Set<number>>(new Set());
  const SCANNER_ID = "admin-scan-pos-scanner";

  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => {
    const token = localStorage.getItem("jaj_token");
    fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((settings) => {
        if (settings?.receipt_print_mode === "AUTO" || settings?.receipt_print_mode === "OFF") {
          setReceiptPrintMode(settings.receipt_print_mode);
        } else if (settings?.receipt_print_mode === "ASK") {
          setReceiptPrintMode("ASK");
        }
      })
      .catch(() => {
        // Receipt printing remains opt-in when settings cannot be loaded.
      });
  }, []);

  const totalTagihan = items.reduce((s, i) => s + i.totalShipping, 0);
  const diskonNum = Number(diskon.replace(/\D/g, "")) || 0;
  const totalAkhir = Math.max(0, totalTagihan - diskonNum);
  const uangNum = Number(uangDibayar.replace(/\D/g, "")) || 0;
  const kembalian = uangNum - totalAkhir;

  async function fetchJson(url: string) {
    const token = localStorage.getItem("jaj_token");
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return r.json();
  }

  function addPackageItem(pkg: any): "added" | "duplicate" | "delivered" {
    if (pkg.status === "diserahkan") return "delivered";
    if (addedIdsRef.current.has(pkg.id)) return "duplicate";
    addedIdsRef.current.add(pkg.id);
    const newItem = toItem(pkg);
    setItems((prev) => [...prev, newItem]);
    return "added";
  }

  async function lookupAndAdd(code: string): Promise<boolean> {
    const trimmed = code.trim();
    if (!trimmed) return true;
    setIsLooking(true);
    setAlreadyDelivered(null);
    try {
      const data = await fetchJson(`/api/packages/scan/${encodeURIComponent(trimmed)}`);

      if (data.group && Array.isArray(data.packages)) {
        const groupPkgs = data.packages;
        if (!groupPkgs.length) {
          toast({ variant: "destructive", title: "Paket grup tidak ditemukan", description: `Barcode: ${trimmed}` });
          return true;
        }

        let added = 0, duplicate = 0, delivered = 0;
        let lastDelivered: any = null;
        for (const pkg of groupPkgs) {
          const result = addPackageItem(pkg);
          if (result === "added") added++;
          else if (result === "duplicate") duplicate++;
          else { delivered++; lastDelivered = pkg; }
        }

        if (added > 0) {
          toast({
            title: `✓ ${added} paket grup ditambahkan`,
            description: `${groupPkgs[0]?.customerName ?? ""}${duplicate ? ` · ${duplicate} sudah ada` : ""}${delivered ? ` · ${delivered} sudah diserahkan` : ""}`,
          });
        } else if (delivered > 0 && duplicate === 0) {
          setAlreadyDelivered(lastDelivered);
          toast({ title: "Grup sudah diserahkan sebelumnya", description: `${lastDelivered?.customerName ?? ""}` });
        } else {
          toast({ title: "Semua paket grup sudah ada dalam daftar" });
        }
        return false;
      }

      let pkg: any = data.package ?? null;
      if (!pkg) {
        const list = await fetchJson(`/api/packages?search=${encodeURIComponent(trimmed)}`);
        if (Array.isArray(list) && list.length > 0) pkg = list[0];
      }

      if (!pkg) {
        toast({ variant: "destructive", title: "Paket tidak ditemukan", description: `Barcode: ${trimmed}` });
        return true;
      }

      if (pkg.status === "diserahkan") {
        setAlreadyDelivered(pkg);
        toast({ title: "Sudah diserahkan sebelumnya", description: `${pkg.customerName} — ${pkg.resiNumber || pkg.barcode}` });
        return false;
      }

      if (addedIdsRef.current.has(pkg.id)) {
        toast({ title: "Sudah ditambahkan", description: `${pkg.resiNumber || pkg.barcode} sudah ada dalam daftar.` });
        return false;
      }
      addedIdsRef.current.add(pkg.id);

      const newItem = toItem(pkg);
      setItems((prev) => [...prev, newItem]);
      toast({
        title: "✓ Paket ditambahkan",
        description: `${pkg.customerName} — ${formatRp(newItem.totalShipping)}`,
      });
      return false;
    } catch {
      toast({ variant: "destructive", title: "Gagal mencari paket" });
      return true;
    } finally {
      setIsLooking(false);
    }
  }

  const handleScanSuccess = useCallback(async (code: string) => {
    if (code === lastScannedCodeRef.current) return;
    if (isScanProcessingRef.current) return;
    isScanProcessingRef.current = true;
    lastScannedCodeRef.current = code;
    try {
      const allowRetry = await lookupAndAdd(code);
      if (allowRetry) lastScannedCodeRef.current = "";
    } finally {
      isScanProcessingRef.current = false;
    }
  }, []);

  async function startCamera() {
    setScanMode("camera");
    try {
      const devices = await Html5Qrcode.getCameras();
      if (!devices.length) {
        toast({ variant: "destructive", title: "Kamera tidak tersedia" });
        setScanMode("idle");
        return;
      }
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      await scanner.start(
        devices[devices.length - 1].id,
        { fps: 10, qrbox: { width: 220, height: 220 } },
        handleScanSuccess,
        undefined,
      );
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gagal akses kamera", description: err?.message });
      setScanMode("idle");
    }
  }

  function resetScanDebounce() {
    lastScannedCodeRef.current = "";
    isScanProcessingRef.current = false;
  }

  async function stopCamera() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    resetScanDebounce();
    setScanMode("idle");
  }

  useEffect(() => () => { stopCamera(); }, []);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const tempId = "admin-scan-qr-temp-" + Date.now();
    const tempDiv = document.createElement("div");
    tempDiv.id = tempId;
    tempDiv.style.display = "none";
    document.body.appendChild(tempDiv);
    const scanner = new Html5Qrcode(tempId);
    scanner.scanFile(file, false)
      .then(async (code) => {
        scanner.clear();
        document.body.removeChild(tempDiv);
        await lookupAndAdd(code);
      })
      .catch(() => {
        scanner.clear();
        document.body.removeChild(tempDiv);
        toast({ variant: "destructive", title: "Gagal membaca barcode", description: "Pastikan gambar berisi barcode yang jelas." });
      });
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualInput.trim()) return;
    const val = manualInput.trim();
    setManualInput("");
    await lookupAndAdd(val);
    manualRef.current?.focus();
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setExpandedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    addedIdsRef.current.delete(id);
  }

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function resetAll() {
    setItems([]);
    setExpandedIds(new Set());
    setManualInput("");
    setUangDibayar("");
    setQuickCashAmount(null);
    setPaymentType("tunai");
    setPaymentReference("");
    setPenanggungJawab("");
    setNominalPiutang("0");
    setJatuhTempo("");
    setCatatanPiutang("");
    setAlreadyDelivered(null);
    setDiskon("");
    setAlasanDiskon("");
    addedIdsRef.current.clear();
    stopCamera();
  }

  function openPayModal() {
    setUangDibayar("");
    setQuickCashAmount(null);
    setPaymentType("tunai");
    setPaymentReference("");
    setPenanggungJawab("");
    setNominalPiutang("0");
    setJatuhTempo("");
    setCatatanPiutang("");
    setDiskon("");
    setAlasanDiskon("");
    setShowPayModal(true);
  }

  function handleUangInput(val: string) {
    const digits = val.replace(/\D/g, "");
    setQuickCashAmount(null);
    setUangDibayar(digits ? Number(digits).toLocaleString("id-ID") : "");
  }

  function handleQuickCash(amount: number) {
    setQuickCashAmount(amount);
    setUangDibayar(amount.toLocaleString("id-ID"));
  }

  function handlePiutangNominalInput(val: string) {
    const digits = val.replace(/\D/g, "");
    setNominalPiutang(digits ? Number(digits).toLocaleString("id-ID") : "");
  }

  function handleDiskonInput(val: string) {
    const digits = val.replace(/\D/g, "");
    setDiskon(digits ? Number(digits).toLocaleString("id-ID") : "");
  }

  async function printReceipt(transactionId: number) {
    const printWindow = window.open("", "_blank", "width=420,height=720");
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Popup diblokir",
        description: "Izinkan popup browser untuk mencetak struk.",
      });
      return;
    }
    printWindow.document.write("<p style='font:14px Arial;padding:20px'>Menyiapkan struk...</p>");
    printWindow.document.close();
    try {
      const response = await fetch(`/api/transactions/${transactionId}/receipt/print`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("jaj_token")}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal menyiapkan struk");
      printWindow.document.open();
      printWindow.document.write(
        buildReceiptDocument(body.receipt as ReceiptPrintPayload, body.print),
      );
      printWindow.document.close();
      printWindow.focus();
    } catch (error: any) {
      printWindow.close();
      toast({
        variant: "destructive",
        title: "Gagal mencetak struk",
        description: error?.message || "Coba lagi.",
      });
    }
  }

  async function handleKonfirmasiBayar() {
    if (isSavingRef.current) return;
    // Validasi diskon: jika ada diskon, alasan wajib diisi
    if (diskonNum > 0 && !alasanDiskon.trim()) {
      toast({ variant: "destructive", title: "Alasan diskon wajib diisi", description: "Isi alasan/catatan diskon sebelum konfirmasi." });
      return;
    }
    if (
      paymentType === "piutang" &&
      (!penanggungJawab.trim() || !nominalPiutang.trim() || !jatuhTempo || !catatanPiutang.trim())
    ) {
      toast({
        variant: "destructive",
        title: "Data piutang belum lengkap",
        description: "Isi penanggung jawab, nominal, jatuh tempo, dan catatan.",
      });
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const idempotencyKey = idempotencyKeyRef.current ?? crypto.randomUUID();
      idempotencyKeyRef.current = idempotencyKey;
      const discountNote = diskonNum > 0
        ? `Diskon: ${formatRp(diskonNum)} | Total ongkir: ${formatRp(totalTagihan)} | Total setelah diskon: ${formatRp(totalAkhir)} | Alasan: ${alasanDiskon}`
        : null;
      const notes = paymentType === "piutang"
        ? [catatanPiutang.trim(), discountNote].filter(Boolean).join(" | ")
        : discountNote;
      const body = {
        paymentType,
        paymentMethod: paymentType,
        subtotal: totalTagihan,
        totalAmount: totalAkhir,
        paidAmount: paymentType === "tunai"
          ? uangNum
          : paymentType === "transfer"
            ? totalAkhir
            : Number(nominalPiutang.replace(/\D/g, "")) || 0,
        changeAmount: paymentType === "tunai" ? kembalian : 0,
        paymentReference: paymentType === "transfer" ? paymentReference.trim() || null : null,
        penanggungJawab: paymentType === "piutang" ? penanggungJawab.trim() : null,
        jatuhTempo: paymentType === "piutang" ? jatuhTempo : null,
        packageIds: items.map((i) => i.id),
        packageSummary: items.map((i) => ({
          id: i.id,
          resiNumber: i.resiNumber,
          packageNumber: i.packageNumber,
          customerName: i.customerName,
          serviceType: i.serviceType,
          deliveryRoute: i.deliveryRoute,
          packagingType: i.packagingType,
          realWeight: i.realWeight,
          usedWeight: i.usedWeight,
          totalShipping: i.totalShipping,
          packageDate: i.packageDate,
        })),
        notes,
      };

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        throw new Error(errorBody?.error || "Gagal menyimpan pembayaran");
      }
      const created = await res.json();
      const transactionId = Number(created?.transaction?.id);

      const typeLabel = PAYMENT_TYPES.find((t) => t.value === paymentType)?.label || paymentType;
      const diskonInfo = diskonNum > 0 ? ` | Diskon: ${formatRp(diskonNum)}` : "";
      toast({
        title: "✓ Pembayaran & Serah Terima Selesai",
        description: `${typeLabel} — ${formatRp(totalAkhir)}${diskonInfo}${paymentType === "tunai" ? ` | Kembalian: ${formatRp(kembalian)}` : ""}`,
      });
      setShowPayModal(false);
      idempotencyKeyRef.current = null;
      resetAll();
      if (Number.isInteger(transactionId) && transactionId > 0) {
        if (receiptPrintMode === "AUTO") {
          await printReceipt(transactionId);
        } else if (receiptPrintMode === "ASK") {
          setReceiptPromptTransactionId(transactionId);
        }
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal menyimpan pembayaran",
        description: error?.message || "Coba lagi dengan tombol yang sama.",
      });
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  const canConfirm =
    (diskonNum === 0 || alasanDiskon.trim().length > 0) && (
      paymentType === "transfer" ||
      (paymentType === "piutang" &&
        penanggungJawab.trim().length > 0 &&
        nominalPiutang.trim().length > 0 &&
        jatuhTempo.length > 0 &&
        catatanPiutang.trim().length > 0) ||
      (paymentType === "tunai" && uangNum >= totalAkhir)
    );

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ScanLine className="h-7 w-7 text-primary" />
            Scan Barcode &amp; Pembayaran
          </h1>
          <p className="text-muted-foreground mt-1">
            Scan barcode paket, hitung tagihan, dan proses pembayaran sekaligus
          </p>
        </div>
        {items.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={resetAll}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        )}
      </div>

      {alreadyDelivered && (
        <Card className="border-amber-400 bg-amber-50">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                Paket sudah diserahkan: <strong>{alreadyDelivered.customerName}</strong>
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {alreadyDelivered.resiNumber || alreadyDelivered.barcode}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">Status tidak dapat diubah kembali.</p>
            </div>
            <Button size="icon" variant="ghost" className="shrink-0" onClick={() => setAlreadyDelivered(null)}>
              <X className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-5 gap-5">
        {/* LEFT: Scan controls */}
        <div className="lg:col-span-2 space-y-4">
          <div
            id={SCANNER_ID}
            className={scanMode === "camera" ? "w-full rounded-xl overflow-hidden border shadow-sm" : "hidden"}
          />

          {scanMode === "idle" ? (
            <Card className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all" onClick={startCamera}>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Camera className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">Scan Kamera</p>
                  <p className="text-xs text-muted-foreground">Terus scan tanpa berhenti</p>
                </div>
                <Button size="sm">Buka</Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-primary/50">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Camera className="w-5 h-5 text-primary animate-pulse" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-primary">Kamera Aktif</p>
                  <p className="text-xs text-muted-foreground">Arahkan ke barcode...</p>
                </div>
                <Button size="sm" variant="outline" onClick={stopCamera}>
                  <X className="w-3 h-3 mr-1" /> Tutup
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                <Upload className="w-5 h-5 text-secondary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">Upload Gambar</p>
                <p className="text-xs text-muted-foreground">Foto barcode dari galeri</p>
              </div>
              <Button size="sm" className="bg-secondary hover:bg-secondary/90" onClick={() => fileInputRef.current?.click()}>
                Pilih
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Hash className="h-4 w-4" /> Input Manual
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <Input
                  ref={manualRef}
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="No resi / barcode..."
                  className="font-mono text-sm"
                  disabled={isLooking}
                />
                <Button type="submit" size="sm" disabled={!manualInput.trim() || isLooking}>
                  {isLooking ? "..." : "Tambah"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Items list + total */}
        <div className="lg:col-span-3 space-y-4">
          <Card className={`border-2 ${items.length > 0 ? "border-primary/40 bg-primary/5" : "border-dashed"}`}>
            <CardContent className="py-4 px-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Total Tagihan</p>
                  <p className="text-3xl font-black text-primary mt-0.5">{formatRp(totalTagihan)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{items.length} paket discan</p>
                </div>
                <div className="text-right">
                  {isLooking && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                      Mencari...
                    </div>
                  )}
                  <Button
                    size="lg"
                    className="bg-green-600 hover:bg-green-700 gap-2 text-base font-bold"
                    disabled={items.length === 0}
                    onClick={openPayModal}
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    Bayar &amp; Serahkan
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
              <ShoppingCart className="h-12 w-12 mb-3 opacity-20" />
              <p className="font-medium">Belum ada paket discan</p>
              <p className="text-sm mt-1">Scan barcode untuk menambahkan paket</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => {
                const isExpanded = expandedIds.has(item.id);
                return (
                  <Card key={item.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm truncate">{item.customerName}</p>
                            {item.serviceType && (
                              <Badge variant="outline" className="text-xs capitalize shrink-0">
                                {serviceLabel[item.serviceType]?.replace("Jastip ", "") || item.serviceType.replace("jastip ", "")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                            {item.resiNumber || item.barcode}
                            {item.packageNumber ? ` · #${item.packageNumber}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-primary text-sm">{formatRp(item.totalShipping)}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground h-7 w-7"
                          onClick={() => toggleExpand(item.id)}
                          title="Lihat detail"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive h-7 w-7"
                          onClick={() => removeItem(item.id)}
                          title="Hapus dari daftar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {isExpanded && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs border-t mt-3 pt-3">
                          <div>
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Tanggal</p>
                            <p>{item.packageDate ? new Date(item.packageDate).toLocaleDateString("id-ID") : "-"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Admin Input</p>
                            <p>{item.adminName || "-"}</p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Rute Pengiriman</p>
                            <p>{item.deliveryRoute || "-"}</p>
                          </div>
                          {item.itemName && (
                            <div>
                              <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Nama Barang</p>
                              <p>{item.itemName}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Berat Real</p>
                            <p className="font-semibold">{item.realWeight != null ? `${item.realWeight} Kg` : "-"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Berat Volume</p>
                            <p>{item.volumeWeight != null ? `${item.volumeWeight} Kg` : "-"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Berat Digunakan</p>
                            <p className="font-semibold">{item.usedWeight != null ? `${item.usedWeight} Kg` : "-"}</p>
                          </div>
                          {(item.length || item.width || item.height) && (
                            <div>
                              <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Dimensi (cm)</p>
                              <p className="font-mono">{item.length || "?"} × {item.width || "?"} × {item.height || "?"}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Tarif Ongkir/kg</p>
                            <p>{formatRp(item.shippingRate)}</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              <div className="flex items-center justify-between px-4 py-2 bg-muted/50 rounded-lg border">
                <span className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> {items.length} paket
                </span>
                <span className="font-black text-primary">{formatRp(totalTagihan)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      <Dialog open={showPayModal} onOpenChange={setShowPayModal}>
        <DialogContent className="max-w-sm flex flex-col max-h-[90vh] overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <ScanLine className="h-5 w-5 text-primary" /> Pembayaran &amp; Serah Terima
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            {/* Bill summary */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Jumlah Paket</span>
                <span className="font-semibold text-foreground">{items.length} paket</span>
              </div>
              <div
                className="overflow-y-auto max-h-8 space-y-1 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: "none" }}
              >
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-xs text-muted-foreground">
                    <span className="truncate max-w-[180px]">{item.customerName} ({item.resiNumber || item.barcode})</span>
                    <span className="shrink-0 ml-2">{formatRp(item.totalShipping)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="font-semibold text-sm text-muted-foreground">Total Ongkir</span>
                <span className="font-bold text-foreground">{formatRp(totalTagihan)}</span>
              </div>
            </div>

            {/* Diskon / Potongan Harga */}
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-orange-500" /> Diskon / Potongan Harga
                <span className="font-normal text-xs text-muted-foreground">(opsional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
                <Input
                  className="pl-9 font-bold"
                  placeholder="0"
                  value={diskon}
                  onChange={(e) => handleDiskonInput(e.target.value)}
                />
              </div>
              {diskonNum > 0 && (
                <Input
                  placeholder="Alasan diskon (wajib diisi) *"
                  value={alasanDiskon}
                  onChange={(e) => setAlasanDiskon(e.target.value)}
                  className={!alasanDiskon.trim() ? "border-orange-400 focus-visible:ring-orange-400" : ""}
                />
              )}
              {diskonNum > 0 && !alasanDiskon.trim() && (
                <p className="text-xs text-orange-600">Alasan diskon wajib diisi jika ada potongan harga.</p>
              )}
            </div>

            {/* Total setelah diskon */}
            {diskonNum > 0 && (
              <div className="rounded-xl p-3 border-2 border-orange-200 bg-orange-50 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Ongkir</span>
                  <span className="font-semibold">{formatRp(totalTagihan)}</span>
                </div>
                <div className="flex justify-between text-sm text-orange-700">
                  <span>Diskon / Potongan</span>
                  <span className="font-semibold">- {formatRp(diskonNum)}</span>
                </div>
                <div className="flex justify-between text-base font-black border-t pt-1 mt-1">
                  <span>Total Setelah Diskon</span>
                  <span className="text-green-700">{formatRp(totalAkhir)}</span>
                </div>
              </div>
            )}

            {/* Total akhir kalau tidak ada diskon */}
            {diskonNum === 0 && (
              <div className="flex justify-between items-center px-1">
                <span className="font-bold text-base">Total Tagihan</span>
                <span className="font-black text-xl text-primary">{formatRp(totalAkhir)}</span>
              </div>
            )}

            {/* Payment type */}
            <div>
              <p className="text-sm font-semibold mb-2">Jenis Pembayaran</p>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_TYPES.map((pt) => {
                  const Icon = pt.icon;
                  const isSelected = paymentType === pt.value;
                  const colorMap: Record<string, string> = {
                    green: isSelected ? "border-green-500 bg-green-50 text-green-700" : "hover:border-green-300",
                    blue: isSelected ? "border-blue-500 bg-blue-50 text-blue-700" : "hover:border-blue-300",
                    orange: isSelected ? "border-orange-500 bg-orange-50 text-orange-700" : "hover:border-orange-300",
                  };
                  return (
                    <button
                      key={pt.value}
                      type="button"
                      onClick={() => {
                        setPaymentType(pt.value);
                        setQuickCashAmount(null);
                      }}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${colorMap[pt.color]} ${!isSelected ? "border-muted" : ""}`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-bold">{pt.label}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{pt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {paymentType === "tunai" && (
              <>
                <div>
                  <p className="text-sm font-semibold mb-2">Nominal Cepat</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[totalAkhir, 50_000, 100_000, 150_000, 200_000].map((amount, index) => (
                      <Button
                        key={`${amount}-${index}`}
                        type="button"
                        variant="outline"
                        size="sm"
                        className={`px-1 text-xs ${quickCashAmount === amount ? "border-green-500 bg-green-50 text-green-700 ring-1 ring-green-500" : ""}`}
                        onClick={() => handleQuickCash(amount)}
                      >
                        {index === 0 ? "Pas" : `${amount / 1000}rb`}
                      </Button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Pilih nominal untuk mengisi Uang Diterima. Input manual akan mengganti pilihan.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1.5">Uang Diterima dari Customer</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
                    <Input
                      className="pl-9 text-lg font-bold"
                      placeholder="0"
                      value={uangDibayar}
                      onChange={(e) => handleUangInput(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>

                <div className={`rounded-xl p-4 border-2 ${
                  uangNum === 0 ? "border-dashed bg-muted/30"
                    : kembalian >= 0 ? "border-green-400 bg-green-50"
                    : "border-red-400 bg-red-50"
                }`}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Kembalian</p>
                  {uangNum === 0 ? (
                    <p className="text-2xl font-black text-muted-foreground">—</p>
                  ) : kembalian >= 0 ? (
                    <p className="text-2xl font-black text-green-700">{formatRp(kembalian)}</p>
                  ) : (
                    <div>
                      <p className="text-2xl font-black text-red-600">{formatRp(kembalian)}</p>
                      <p className="text-xs text-red-500 mt-1">Uang kurang {formatRp(Math.abs(kembalian))}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {paymentType === "transfer" && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
                <label className="text-sm font-semibold text-blue-900 block">
                  Referensi Pembayaran <span className="font-normal text-xs text-blue-700">(opsional)</span>
                </label>
                <Input
                  placeholder="No. referensi transfer / QRIS"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  maxLength={120}
                />
                <p className="text-xs text-blue-700">
                  Total transfer otomatis ditetapkan sebesar {formatRp(totalAkhir)}.
                </p>
              </div>
            )}

            {paymentType === "piutang" && (
              <div className="rounded-xl p-4 border-2 border-orange-200 bg-orange-50 text-orange-800 text-sm space-y-3">
                <div className="text-center">
                  <Clock className="w-6 h-6 mx-auto mb-1" />
                  <p className="font-semibold">Piutang / Bayar Nanti</p>
                  <p className="text-xs text-orange-600 mt-1">Tercatat sebagai hutang customer. Paket tetap diserahkan sekarang.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">Penanggung jawab *</label>
                  <Input
                    placeholder="Nama pihak yang bertanggung jawab"
                    value={penanggungJawab}
                    onChange={(e) => setPenanggungJawab(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">Nominal dibayar sekarang (Rp) *</label>
                  <Input
                    className="font-bold"
                    placeholder="0 = seluruhnya piutang"
                    value={nominalPiutang}
                    onChange={(e) => handlePiutangNominalInput(e.target.value)}
                  />
                  <p className="text-[11px] text-orange-700 mt-1">Isi 0 jika belum ada pembayaran awal.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">Jatuh tempo *</label>
                  <Input
                    type="date"
                    value={jatuhTempo}
                    onChange={(e) => setJatuhTempo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">Catatan *</label>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Alasan atau kesepakatan piutang"
                    value={catatanPiutang}
                    onChange={(e) => setCatatanPiutang(e.target.value)}
                    maxLength={500}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPayModal(false)} disabled={isSaving}>Batal</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 flex-1 gap-2"
              disabled={!canConfirm || isSaving}
              onClick={handleKonfirmasiBayar}
            >
              {isSaving ? (
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Konfirmasi Bayar &amp; Serahkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={receiptPromptTransactionId !== null}
        onOpenChange={(open) => !open && setReceiptPromptTransactionId(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" /> Cetak struk transaksi?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pembayaran berhasil disimpan. Cetak struk sekarang atau lewati dan
            gunakan tombol Cetak Struk dari histori transaksi untuk mencetak ulang.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptPromptTransactionId(null)}>
              Lewati
            </Button>
            <Button
              onClick={async () => {
                if (receiptPromptTransactionId === null) return;
                const id = receiptPromptTransactionId;
                setReceiptPromptTransactionId(null);
                await printReceipt(id);
              }}
            >
              <Printer className="h-4 w-4" /> Cetak Struk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
