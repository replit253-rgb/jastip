import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save, Loader2, History, Printer, QrCode, Upload, CheckCircle2, Image as ImageIcon, AlertCircle } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

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

  useEffect(() => {
    Promise.all([
      fetchSettings(),
      fetchSettingsHistory(),
    ])
      .then(([d, historyRows]) => {
        setKargoRate(d.kargoRate != null ? String(d.kargoRate) : "");
        setCashVarianceTolerance(d.cash_variance_tolerance != null ? String(d.cash_variance_tolerance) : "0");
        setReceiptPrintMode(d.receipt_print_mode === "AUTO" || d.receipt_print_mode === "OFF" ? d.receipt_print_mode : "ASK");
        setQrisImageUrl(d.qris_image_url || null);
        setHistory(historyRows as any[]);
      })
      .catch(() => {
        toast({ variant: "destructive", title: "Gagal memuat pengaturan" });
      })
      .finally(() => setIsLoading(false));
  }, []);

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
      setHistory(await fetchSettingsHistory());
      toast({ title: "Tersimpan", description: `Pengaturan berhasil diperbarui. Toleransi kas saat ini Rp ${tolerance.toLocaleString("id-ID")}.` });
    } catch {
      toast({ variant: "destructive", title: "Gagal menyimpan", description: "Terjadi kesalahan. Coba lagi." });
    } finally {
      setIsSaving(false);
    }
  }

  const toleranceHistory = history.filter((h) => h.jenisJastip === "Toleransi Selisih Kas");
  const qrisHistory = history.filter((h) => h.jenisJastip === "QRIS — Upload Gambar");

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pengaturan Kas & Tarif</h1>
        <p className="text-muted-foreground mt-1">
          Atur tarif default, perilaku cetak struk, toleransi selisih kas, dan gambar QRIS resmi toko.
        </p>
      </div>

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

              {/* Form Upload Baru */}
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
                Ongkir kargo = MAX(M³, Ton digunakan) × tarif ini. Minimum tagihan = 10 M³/Ton.
              </div>

              <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" /> Simpan Pengaturan</>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Histori QRIS */}
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

      {/* Histori Toleransi Kas */}
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
    </div>
  );
}
