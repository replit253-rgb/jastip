import { useState, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListBatches, useListPackages, getListPackagesQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import {
  Settings, Save, Loader2, History, Printer, QrCode, Upload, CheckCircle2, Image as ImageIcon, AlertCircle, RefreshCw, ShieldAlert, Info,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ShippingMinimumRow {
  id: number;
  serviceId: number;
  serviceName: string;
  serviceLabel: string;
  originCity: string;
  enabled: boolean;
  minimumAmount: number;
  updatedAt?: string;
}

async function fetchShippingMinimums(): Promise<ShippingMinimumRow[]> {
  const res = await fetch("/api/settings/shipping-minimum", {
    headers: { Authorization: `Bearer ${localStorage.getItem("jaj_token")}` },
  });
  if (!res.ok) return [];
  return res.json();
}

async function fetchSettings(): Promise<Record<string, any>> {
  const token = localStorage.getItem("jaj_token");
  const res = await fetch("/api/settings", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Gagal memuat pengaturan");
  return res.json();
}

async function patchSettings(data: Record<string, any>): Promise<Record<string, any>> {
  const token = localStorage.getItem("jaj_token");
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Gagal menyimpan pengaturan");
  return res.json();
}

async function fetchSettingsHistory(): Promise<any[]> {
  const res = await fetch("/api/settings/history", {
    headers: { Authorization: `Bearer ${localStorage.getItem("jaj_token")}` },
  });
  if (!res.ok) return [];
  return res.json();
}

export default function OwnerSettings() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [kargoRate, setKargoRate] = useState<string>("");
  const [cashVarianceTolerance, setCashVarianceTolerance] = useState<string>("0");
  const [receiptPrintMode, setReceiptPrintMode] = useState<"AUTO" | "ASK" | "OFF">("ASK");
  const [qrisImageUrl, setQrisImageUrl] = useState<string | null>(null);

  // QRIS upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [qrisUploadReason, setQrisUploadReason] = useState<string>("");
  const [isUploadingQris, setIsUploadingQris] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  // Harga Minimum Ongkir (Owner only)
  const [shippingMinimums, setShippingMinimums] = useState<ShippingMinimumRow[]>([]);
  const [isSavingMinimums, setIsSavingMinimums] = useState(false);

  // Hitung Ulang Ongkir (Owner only)
  const { data: batches = [] } = useListBatches(undefined, { query: { enabled: isOwner } } as any);
  const { data: allPackages = [] } = useListPackages(undefined, { query: { enabled: isOwner } } as any);
  const [recalcBatchId, setRecalcBatchId] = useState<string>("all");
  const [recalcService, setRecalcService] = useState<string>("jastip kargo");
  const [confirmRecalcOpen, setConfirmRecalcOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const affectedPackagesCount = useMemo(() => {
    const pkgs = Array.isArray(allPackages) ? allPackages : [];
    return pkgs.filter((p: any) => {
      const matchBatch =
        recalcBatchId === "all" ? true : Number(p.batchId) === Number(recalcBatchId);
      const matchSvc =
        recalcService === "all"
          ? true
          : String(p.serviceType || "").toLowerCase() === recalcService.toLowerCase();
      return matchBatch && matchSvc;
    }).length;
  }, [allPackages, recalcBatchId, recalcService]);

  const selectedBatchLabel = useMemo(() => {
    if (recalcBatchId === "all") return "Semua Batch";
    const found = (batches as any[]).find((b) => String(b.id) === recalcBatchId);
    return found ? `${found.namaKapal || found.batchNumber} (${found.batchNumber})` : `Batch #${recalcBatchId}`;
  }, [batches, recalcBatchId]);

  const selectedServiceLabel = useMemo(() => {
    switch (recalcService) {
      case "jastip kargo":
        return "Jastip Kargo";
      case "jastip pelni":
        return "Jastip Pelni";
      case "jastip pesawat":
        return "Jastip Pesawat";
      case "jastip hemat+":
        return "Jastip Hemat+";
      default:
        return "Semua Layanan";
    }
  }, [recalcService]);

  useEffect(() => {
    Promise.all([
      fetchSettings(),
      isOwner ? fetchSettingsHistory() : Promise.resolve([]),
      isOwner ? fetchShippingMinimums() : Promise.resolve([]),
    ])
      .then(([d, historyRows, minRows]) => {
        setKargoRate(d.kargoRate != null ? String(d.kargoRate) : "");
        setCashVarianceTolerance(d.cash_variance_tolerance != null ? String(d.cash_variance_tolerance) : "0");
        setReceiptPrintMode(d.receipt_print_mode === "AUTO" || d.receipt_print_mode === "OFF" ? d.receipt_print_mode : "ASK");
        setQrisImageUrl(d.qris_image_url || null);
        setHistory(historyRows as any[]);
        setShippingMinimums(Array.isArray(minRows) ? minRows : []);
      })
      .catch(() => {
        toast({ variant: "destructive", title: "Gagal memuat pengaturan" });
      })
      .finally(() => setIsLoading(false));
  }, [isOwner]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Format file tidak didukung",
        description: "Hanya gambar dengan format PNG, JPG, atau WEBP yang diizinkan.",
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Ukuran file terlalu besar",
        description: "Ukuran file maksimal adalah 2MB.",
      });
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleUploadQris() {
    if (!previewDataUrl) {
      toast({
        variant: "destructive",
        title: "Belum ada file",
        description: "Pilih file gambar QRIS terlebih dahulu.",
      });
      return;
    }

    setIsUploadingQris(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const res = await fetch("/api/settings/qris-image", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: previewDataUrl,
          _alasan: qrisUploadReason.trim() || "Pembaruan gambar QRIS oleh Owner",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengunggah gambar QRIS");

      setQrisImageUrl(data.qrisImageUrl);
      setSelectedFile(null);
      setPreviewDataUrl(null);
      setQrisUploadReason("");
      if (fileInputRef.current) fileInputRef.current.value = "";

      const updatedHistory = await fetchSettingsHistory();
      setHistory(updatedHistory);

      toast({
        title: "QRIS Berhasil Diperbarui",
        description: "Gambar QRIS aktif telah diperbarui dan langsung tersedia di layar kasir.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Gagal mengunggah",
        description: err.message || "Terjadi kesalahan saat upload gambar.",
      });
    } finally {
      setIsUploadingQris(false);
    }
  }

  async function handleSave() {
    const data: Record<string, any> = { _alasan: "Pembaruan pengaturan Owner" };
    if (kargoRate.trim()) {
      const rate = Number(kargoRate);
      if (!Number.isInteger(rate) || rate <= 0) {
        toast({ variant: "destructive", title: "Tarif tidak valid", description: "Masukkan tarif kargo bulat yang benar." });
        return;
      }
      data.kargoRate = rate;
    }
    const tolerance = Number(cashVarianceTolerance);
    if (!Number.isInteger(tolerance) || tolerance < 0) {
      toast({ variant: "destructive", title: "Toleransi tidak valid", description: "Masukkan toleransi kas dalam Rupiah bulat, minimal 0." });
      return;
    }
    data.cash_variance_tolerance = tolerance;
    data.receipt_print_mode = receiptPrintMode;
    if (Object.keys(data).length === 1) {
      toast({ variant: "destructive", title: "Tarif tidak valid", description: "Masukkan tarif kargo yang benar." });
      return;
    }
    setIsSaving(true);
    try {
      const updated = await patchSettings(data);
      setKargoRate(updated.kargoRate != null ? String(updated.kargoRate) : kargoRate);
      setCashVarianceTolerance(updated.cash_variance_tolerance != null ? String(updated.cash_variance_tolerance) : String(tolerance));
      setReceiptPrintMode(updated.receipt_print_mode === "AUTO" || updated.receipt_print_mode === "OFF" ? updated.receipt_print_mode : receiptPrintMode);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      setHistory(await fetchSettingsHistory());
      toast({ title: "Tersimpan", description: `Pengaturan berhasil diperbarui. Toleransi kas saat ini Rp ${tolerance.toLocaleString("id-ID")}.` });
    } catch {
      toast({ variant: "destructive", title: "Gagal menyimpan", description: "Terjadi kesalahan. Coba lagi." });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExecuteRecalc() {
    if (!isOwner) return;
    setIsRecalculating(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const isAllKargoOnly = recalcBatchId === "all" && recalcService === "jastip kargo";
      const url = isAllKargoOnly
        ? "/api/packages/recalculate-kargo"
        : "/api/packages/recalculate-batch";
      const body = isAllKargoOnly
        ? { batchId: "all" }
        : {
            batchId: recalcBatchId === "all" ? "all" : Number(recalcBatchId),
            serviceType: recalcService,
          };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menghitung ulang ongkir");

      await queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
      toast({
        title: "Hitung Ulang Ongkir Selesai",
        description: json.message || `${json.updatedCount ?? 0} paket berhasil dihitung ulang.`,
      });
      setConfirmRecalcOpen(false);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Gagal menghitung ulang ongkir",
        description: err.message || "Terjadi kesalahan pada server.",
      });
    } finally {
      setIsRecalculating(false);
    }
  }

  function updateShippingMinimumRow(
    serviceId: number,
    originCity: string,
    patch: Partial<Pick<ShippingMinimumRow, "enabled" | "minimumAmount">>,
  ) {
    setShippingMinimums((prev) =>
      prev.map((row) =>
        row.serviceId === serviceId && row.originCity === originCity
          ? { ...row, ...patch }
          : row,
      ),
    );
  }

  async function handleSaveShippingMinimums() {
    if (!isOwner || shippingMinimums.length === 0) return;

    for (const row of shippingMinimums) {
      const amt = Number(row.minimumAmount);
      if (!Number.isInteger(amt) || amt < 0) {
        toast({
          variant: "destructive",
          title: "Nominal minimum tidak valid",
          description: `Harga minimum ${row.serviceLabel} (${row.originCity}) harus berupa bilangan bulat ≥ 0.`,
        });
        return;
      }
    }

    setIsSavingMinimums(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const res = await fetch("/api/settings/shipping-minimum", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          _alasan: "Pembaruan harga minimum ongkir oleh Owner",
          settings: shippingMinimums.map((row) => ({
            serviceId: row.serviceId,
            originCity: row.originCity,
            enabled: Boolean(row.enabled),
            minimumAmount: Math.round(Number(row.minimumAmount) || 0),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan harga minimum ongkir");

      setShippingMinimums(Array.isArray(json) ? json : shippingMinimums);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      setHistory(await fetchSettingsHistory());
      toast({
        title: "Harga Minimum Tersimpan",
        description:
          "Aturan baru berlaku untuk paket baru yang dibuat/diimpor. Gunakan Hitung Ulang Ongkir jika ingin menerapkan ke paket lama.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Gagal menyimpan harga minimum",
        description: err.message || "Terjadi kesalahan pada server.",
      });
    } finally {
      setIsSavingMinimums(false);
    }
  }

  const groupedShippingMinimums = useMemo(() => {
    const groups = new Map<string, { serviceId: number; serviceName: string; serviceLabel: string; rows: ShippingMinimumRow[] }>();
    for (const row of shippingMinimums) {
      const key = String(row.serviceId);
      if (!groups.has(key)) {
        groups.set(key, {
          serviceId: row.serviceId,
          serviceName: row.serviceName,
          serviceLabel: row.serviceLabel,
          rows: [],
        });
      }
      groups.get(key)!.rows.push(row);
    }
    return Array.from(groups.values());
  }, [shippingMinimums]);

  const toleranceHistory = history.filter((h) => h.jenisJastip === "Toleransi Selisih Kas");
  const qrisHistory = history.filter((h) => h.jenisJastip === "QRIS — Upload Gambar");

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pengaturan Kas &amp; Tarif</h1>
        <p className="text-muted-foreground mt-1">
          {isOwner
            ? "Atur tarif default, perilaku cetak struk, toleransi selisih kas, gambar QRIS resmi, harga minimum, dan hitung ulang ongkir."
            : "Tampilan pengaturan sistem saat ini (hanya Owner yang dapat mengubah pengaturan atau menjalankan hitung ulang ongkir)."}
        </p>
      </div>

      {!isOwner && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3 text-sm text-amber-900">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Mode Baca Saja (Akses Admin)</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Perubahan pengaturan kas, upload QRIS, pengaturan harga minimum ongkir, dan hitung ulang ongkir hanya dapat dilakukan oleh akun Owner.
            </p>
          </div>
        </div>
      )}

      {/* Card QRIS */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode className="w-4 h-4 text-purple-600" />
              Pengaturan QRIS Resmi
            </CardTitle>
            {qrisImageUrl ? (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 gap-1 text-xs">
                <CheckCircle2 className="w-3 h-3" /> QRIS Aktif
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1 text-xs">
                <AlertCircle className="w-3 h-3" /> Belum Diatur
              </Badge>
            )}
          </div>
          <CardDescription>
            Upload barcode / QRIS toko untuk ditampilkan langsung di layar kasir saat customer memilih metode pembayaran QRIS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat pengaturan...
            </div>
          ) : (
            <>
              {/* Gambar Aktif */}
              <div className="rounded-xl border bg-muted/20 p-4 text-center">
                <p className="text-xs font-semibold text-muted-foreground mb-3">Gambar QRIS yang Sedang Aktif:</p>
                {qrisImageUrl ? (
                  <div className="flex flex-col items-center">
                    <div className="bg-white p-3 rounded-lg border shadow-sm inline-block">
                      <img
                        src={qrisImageUrl}
                        alt="QRIS Aktif"
                        className="max-h-48 max-w-full object-contain rounded"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Gambar ini aktif dan dapat dipindai oleh customer di meja kasir.
                    </p>
                  </div>
                ) : (
                  <div className="py-6 text-muted-foreground">
                    <ImageIcon className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-xs">Belum ada gambar QRIS yang diatur.</p>
                  </div>
                )}
              </div>

              {/* Form Upload Baru (Owner Only) */}
              {isOwner && (
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-sm font-semibold">Upload Gambar QRIS Baru</Label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center gap-2 border-dashed border-2 py-6"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    {selectedFile ? selectedFile.name : "Pilih File Gambar (PNG, JPG, max 2MB)"}
                  </Button>
                </div>

                {previewDataUrl && (
                  <div className="rounded-lg border bg-purple-50/50 p-3 space-y-3">
                    <p className="text-xs font-semibold text-purple-900">Pratinjau Gambar Baru:</p>
                    <div className="flex justify-center">
                      <div className="bg-white p-2 rounded border shadow-sm">
                        <img
                          src={previewDataUrl}
                          alt="Pratinjau Baru"
                          className="max-h-40 object-contain"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-purple-950">Catatan / Alasan Perubahan (opsional):</Label>
                      <Input
                        placeholder="Contoh: Penggantian rekening QRIS BCA / ShopeePay"
                        value={qrisUploadReason}
                        onChange={(e) => setQrisUploadReason(e.target.value)}
                        className="text-xs bg-white"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={handleUploadQris}
                        disabled={isUploadingQris}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        {isUploadingQris ? (
                          <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Menyimpan...</>
                        ) : (
                          <><Save className="w-3.5 h-3.5 mr-1.5" /> Simpan &amp; Aktifkan QRIS</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedFile(null);
                          setPreviewDataUrl(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                      >
                        Batal
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Tarif Jastip Kargo &amp; Kas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat pengaturan...
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Harga Kubikasi Default (per M³/Ton)</Label>
                <p className="text-xs text-muted-foreground">
                  Tarif ini akan otomatis terisi saat admin membuka form input paket Jastip Kargo.
                  Admin tetap bisa mengubahnya per paket jika diperlukan.
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
                  <Input
                    type="number"
                    step="1000"
                    min="0"
                    placeholder="Contoh: 7000"
                    className="pl-9"
                    value={kargoRate}
                    onChange={(e) => setKargoRate(e.target.value)}
                  />
                </div>
                {kargoRate && !isNaN(Number(kargoRate)) && Number(kargoRate) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    = <strong>Rp {Number(kargoRate).toLocaleString("id-ID")}</strong> per M³/Ton
                  </p>
                )}
              </div>

              <div className="space-y-1.5 border-t pt-4">
                <Label>Toleransi Selisih Kas (Rp)</Label>
                <p className="text-xs text-muted-foreground">
                  Selisih sampai nominal ini dapat ditutup tanpa alasan tambahan. Nilai Rp0 berarti setiap selisih harus diberi alasan.
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    className="pl-9"
                    value={cashVarianceTolerance}
                    onChange={(e) => setCashVarianceTolerance(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <Label className="flex items-center gap-2">
                  <Printer className="h-4 w-4" /> Cetak Struk
                </Label>
                <p className="text-xs text-muted-foreground">
                  Pengaturan ini berlaku setelah pembayaran transaksi berhasil.
                  Cetak ulang dari halaman Transaksi &amp; VOID tetap tersedia.
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    ["AUTO", "Otomatis", "Langsung membuka dialog cetak"],
                    ["ASK", "Tanya sebelum cetak", "Kasir memilih cetak atau lewati"],
                    ["OFF", "Nonaktif", "Tidak membuka cetak otomatis"],
                  ] as const).map(([value, label, description]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReceiptPrintMode(value)}
                      className={`rounded-lg border-2 p-3 text-left transition-colors ${
                        receiptPrintMode === value
                          ? "border-primary bg-primary/5"
                          : "border-muted hover:border-primary/40"
                      }`}
                    >
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                Ongkir kargo = MAX(M³, Ton digunakan) × tarif ini. Jika Owner mengaktifkan harga minimum untuk Jastip Kargo di bawah, ongkir minimal akan mengikuti pengaturan tersebut.
              </div>

              {isOwner && (
                <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
                  {isSaving ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...</>
                  ) : (
                    <><Save className="w-4 h-4 mr-2" /> Simpan Pengaturan</>
                  )}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Harga Minimum Ongkir per Layanan & Kota Asal (Owner Only) */}
      {isOwner && (
        <Card className="border-indigo-200/80">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="w-4 h-4 text-indigo-600" />
              Harga Minimum Ongkir
            </CardTitle>
            <CardDescription>
              Aktifkan atau ubah batas minimum ongkir per layanan dan kota asal (berlaku per total customer/layanan untuk grup, atau per paket untuk Kargo).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Memuat pengaturan minimum...
              </div>
            ) : groupedShippingMinimums.length === 0 ? (
              <p className="text-sm text-muted-foreground">Data pengaturan harga minimum belum tersedia.</p>
            ) : (
              <>
                <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 flex items-start gap-2.5 text-xs text-blue-900">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <p>
                    Perubahan harga minimum hanya berlaku untuk <strong>paket baru</strong> yang dibuat atau diimpor setelah perubahan. Paket lama tetap memakai nominal sebelumnya sampai Anda menjalankan <strong>Hitung Ulang Ongkir</strong> di bawah.
                  </p>
                </div>

                <div className="space-y-3">
                  {groupedShippingMinimums.map((group) => (
                    <div key={group.serviceId} className="rounded-xl border p-3.5 space-y-3 bg-card">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{group.serviceLabel}</p>
                        <Badge variant="outline" className="text-[11px] capitalize">
                          {group.serviceName}
                        </Badge>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {group.rows.map((row) => (
                          <div
                            key={`${row.serviceId}-${row.originCity}`}
                            className={`rounded-lg border p-3 space-y-2.5 transition-colors ${
                              row.enabled ? "bg-indigo-50/30 border-indigo-200" : "bg-muted/20 border-muted"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold">
                                Asal {row.originCity}
                              </span>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[11px] font-medium ${
                                    row.enabled ? "text-indigo-700" : "text-muted-foreground"
                                  }`}
                                >
                                  {row.enabled ? "Aktif" : "Nonaktif"}
                                </span>
                                <Switch
                                  checked={row.enabled}
                                  onCheckedChange={(checked) =>
                                    updateShippingMinimumRow(row.serviceId, row.originCity, {
                                      enabled: Boolean(checked),
                                    })
                                  }
                                />
                              </div>
                            </div>

                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                                Rp
                              </span>
                              <Input
                                type="number"
                                min="0"
                                step="1000"
                                className="pl-8 h-9 text-sm bg-background"
                                value={row.minimumAmount}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  updateShippingMinimumRow(row.serviceId, row.originCity, {
                                    minimumAmount: raw === "" ? 0 : Math.max(0, Math.round(Number(raw) || 0)),
                                  });
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  onClick={handleSaveShippingMinimums}
                  disabled={isSavingMinimums}
                  className="w-full sm:w-auto"
                >
                  {isSavingMinimums ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan Minimum...</>
                  ) : (
                    <><Save className="w-4 h-4 mr-2" /> Simpan Harga Minimum</>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Hitung Ulang Ongkir (Owner Only) */}
      {isOwner && (
        <Card className="border-amber-200/80">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-600" />
              Hitung Ulang Ongkir
            </CardTitle>
            <CardDescription>
              Terapkan ulang kalkulasi ongkir (termasuk tarif Cargo &amp; aturan harga minimum terbaru) untuk paket yang sudah ada di batch terpilih.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Pilih Batch</Label>
                <Select value={recalcBatchId} onValueChange={setRecalcBatchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Batch</SelectItem>
                    {(batches as any[]).map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.namaKapal || b.batchNumber} ({b.batchNumber}) — {b.statusBatch}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Pilih Layanan</Label>
                <Select value={recalcService} onValueChange={setRecalcService}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih layanan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jastip kargo">Jastip Kargo</SelectItem>
                    <SelectItem value="jastip pelni">Jastip Pelni</SelectItem>
                    <SelectItem value="jastip pesawat">Jastip Pesawat</SelectItem>
                    <SelectItem value="jastip hemat+">Jastip Hemat+</SelectItem>
                    <SelectItem value="all">Semua Layanan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 px-3.5 py-2.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Jumlah paket yang akan terdampak</p>
                <p className="text-xs text-muted-foreground/80 mt-0.5">
                  Scope: <span className="font-semibold text-foreground">{selectedBatchLabel}</span> ·{" "}
                  <span className="font-semibold text-foreground">{selectedServiceLabel}</span>
                </p>
              </div>
              <Badge variant={affectedPackagesCount > 0 ? "default" : "secondary"} className="text-sm px-3 py-1">
                {affectedPackagesCount} paket
              </Badge>
            </div>

            <Button
              type="button"
              variant="outline"
              className="border-amber-300 text-amber-800 hover:bg-amber-50"
              disabled={isRecalculating || affectedPackagesCount === 0}
              onClick={() => setConfirmRecalcOpen(true)}
            >
              {isRecalculating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menghitung Ulang...</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" /> Jalankan Hitung Ulang Ongkir</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmRecalcOpen} onOpenChange={setConfirmRecalcOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Hitung Ulang Ongkir</AlertDialogTitle>
            <AlertDialogDescription>
              Anda akan menghitung ulang ongkir untuk{" "}
              <strong className="text-foreground">{affectedPackagesCount} paket</strong> pada{" "}
              <strong className="text-foreground">{selectedBatchLabel}</strong> dengan layanan{" "}
              <strong className="text-foreground">{selectedServiceLabel}</strong>.
              <br />
              <br />
              Total ongkir paket yang terdampak akan diperbarui sesuai rumus layanan dan pengaturan harga minimum yang aktif saat ini. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRecalculating}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleExecuteRecalc();
              }}
              disabled={isRecalculating}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isRecalculating ? "Memproses..." : "Ya, Hitung Ulang"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Histori QRIS & Toleransi Kas (Owner Only) */}
      {isOwner && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4 text-purple-600" />
                Histori Perubahan Gambar QRIS
              </CardTitle>
            </CardHeader>
            <CardContent>
              {qrisHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada riwayat perubahan gambar QRIS.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Alasan / Keterangan</TableHead>
                        <TableHead>Diubah oleh</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {qrisHistory.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(row.createdAt).toLocaleString("id-ID")}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.alasan || "-"}
                          </TableCell>
                          <TableCell className="text-xs">{row.namaUbah || `User #${row.diubahOleh ?? "-"}`}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4" />
                Histori Toleransi Selisih Kas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {toleranceHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada perubahan. Nilai awal yang berlaku adalah Rp0.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Nilai Lama</TableHead>
                        <TableHead>Nilai Baru</TableHead>
                        <TableHead>Diubah oleh</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {toleranceHistory.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(row.createdAt).toLocaleString("id-ID")}
                          </TableCell>
                          <TableCell>Rp {Number(row.tarifLama ?? 0).toLocaleString("id-ID")}</TableCell>
                          <TableCell className="font-semibold">
                            Rp {Number(row.tarifBaru).toLocaleString("id-ID")}
                          </TableCell>
                          <TableCell>{row.namaUbah || `User #${row.diubahOleh ?? "-"}`}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
