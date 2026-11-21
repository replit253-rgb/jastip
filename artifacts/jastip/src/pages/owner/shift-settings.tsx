import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useShift } from "@/lib/shift";
import {
  ArrowLeft,
  CheckCircle2,
  History,
  Info,
  Loader2,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

const PRESET_TOLERANCES = [0, 5000, 10000, 25000, 50000, 100000];

function formatRp(value: number | string | null | undefined) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

export default function OwnerShiftSettings() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { refresh: refreshShift } = useShift();
  const { toast } = useToast();

  const [tolerance, setTolerance] = useState<string>("0");
  const [ownerBypass, setOwnerBypass] = useState<boolean>(true);
  const [adminAllowWithReason, setAdminAllowWithReason] = useState<boolean>(false);
  const [alasan, setAlasan] = useState<string>("");
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  async function loadData() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const headers = { Authorization: `Bearer ${token}` };
      const [settingsRes, historyRes] = await Promise.all([
        fetch("/api/settings", { headers }),
        fetch("/api/settings/history", { headers }),
      ]);
      if (!settingsRes.ok) throw new Error("Gagal memuat pengaturan toleransi");
      const settingsData = await settingsRes.json();
      setTolerance(
        settingsData.cash_variance_tolerance != null
          ? String(settingsData.cash_variance_tolerance)
          : "0",
      );
      setOwnerBypass(settingsData.cash_variance_owner_bypass !== false && settingsData.cash_variance_owner_bypass !== "false");
      setAdminAllowWithReason(
        settingsData.cash_variance_admin_allow_with_reason === true ||
          settingsData.cash_variance_admin_allow_with_reason === "true",
      );

      if (historyRes.ok) {
        const histRows = await historyRes.json();
        if (Array.isArray(histRows)) {
          setHistory(
            histRows.filter((row: any) =>
              [
                "Toleransi Selisih Kas",
                "Closing Owner Tanpa Blokir Selisih",
                "Admin Closing Selisih Dengan Alasan",
              ].includes(row.jenisJastip),
            ),
          );
        }
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Gagal memuat pengaturan",
        description: err.message || "Terjadi kesalahan saat mengambil data dari server.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleSave() {
    const parsedTolerance = Number(tolerance);
    if (!Number.isInteger(parsedTolerance) || parsedTolerance < 0) {
      toast({
        variant: "destructive",
        title: "Nominal toleransi tidak valid",
        description: "Masukkan angka Rupiah bulat minimal 0.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cash_variance_tolerance: parsedTolerance,
          cash_variance_owner_bypass: ownerBypass,
          cash_variance_admin_allow_with_reason: adminAllowWithReason,
          _alasan: alasan.trim() || "Pembaruan aturan toleransi selisih kas shift oleh Owner",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan pengaturan");

      setAlasan("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        refreshShift(),
        loadData(),
      ]);
      toast({
        title: "Aturan Closing Shift Tersimpan",
        description: `Toleransi selisih kas aktif: ${formatRp(parsedTolerance)}.`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Gagal menyimpan pengaturan",
        description: err.message || "Terjadi kesalahan pada server.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setLocation("/owner/shift")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Pengaturan Toleransi &amp; Closing Shift
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Atur batas toleransi selisih kas dan kebijakan closing untuk Owner maupun Admin kasir.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setLocation("/owner/settings")}>
          Buka Pengaturan Kas Lainnya
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 p-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat pengaturan toleransi...
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  Batas Toleransi Selisih Kas
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  Aktif: {formatRp(tolerance)}
                </Badge>
              </div>
              <CardDescription>
                Selisih antara kas fisik aktual dan kas sistem sampai nominal ini dianggap wajar dan langsung lolos closing tanpa perlu penyesuaian tambahan.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tolerance-input">Nominal Toleransi Selisih Kas (Rp)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    Rp
                  </span>
                  <Input
                    id="tolerance-input"
                    type="number"
                    min="0"
                    step="1000"
                    className="pl-9"
                    value={tolerance}
                    onChange={(e) => setTolerance(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {PRESET_TOLERANCES.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      variant={Number(tolerance) === preset ? "default" : "outline"}
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setTolerance(String(preset))}
                    >
                      {formatRp(preset)}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Kebijakan Closing Saat Selisih Melewati Toleransi
              </CardTitle>
              <CardDescription>
                Tentukan bagaimana sistem merespons ketika hasil hitung kas fisik berbeda melebihi batas toleransi di atas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-xl border p-4 bg-emerald-50/40 border-emerald-200/80">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">
                      Izinkan Owner Closing Langsung Tanpa Alasan Wajib
                    </p>
                    <Badge variant="outline" className="text-[11px] bg-emerald-100 text-emerald-800 border-emerald-200">
                      Direkomendasikan
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Saat aktif, akun Owner selalu dapat menyelesaikan closing shift meski terdapat selisih kas di luar toleransi (alasan otomatis dicatat bila tidak diisi).
                  </p>
                </div>
                <Switch
                  checked={ownerBypass}
                  onCheckedChange={(checked) => setOwnerBypass(Boolean(checked))}
                />
              </div>

              <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    Izinkan Admin Closing Sendiri Jika Mengisi Alasan
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Jika nonaktif (bawaan), Admin kasir tetap wajib meminta persetujuan/closing oleh Owner bila selisih melebihi toleransi. Jika aktif, Admin dapat closing asal mengisi alasan selisih.
                  </p>
                </div>
                <Switch
                  checked={adminAllowWithReason}
                  onCheckedChange={(checked) => setAdminAllowWithReason(Boolean(checked))}
                />
              </div>

              <div className="space-y-1.5 pt-2">
                <Label htmlFor="tolerance-reason">Catatan Perubahan (opsional)</Label>
                <Input
                  id="tolerance-reason"
                  placeholder="Contoh: Penyesuaian toleransi uang kembalian harian"
                  value={alasan}
                  onChange={(e) => setAlasan(e.target.value)}
                />
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 flex items-start gap-2.5 text-xs text-blue-900">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  Perubahan ini langsung berlaku saat itu juga di halaman{" "}
                  <strong>Shift &amp; Closing</strong> untuk Owner maupun Admin tanpa perlu restart server.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menyimpan...</>
                  ) : (
                    <><Save className="mr-2 h-4 w-4" /> Simpan Pengaturan Toleransi</>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setLocation("/owner/shift")}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Kembali ke Shift &amp; Closing
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                Riwayat Perubahan Aturan Toleransi Shift
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada riwayat perubahan pengaturan toleransi shift.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Pengaturan</TableHead>
                        <TableHead>Nilai Lama</TableHead>
                        <TableHead>Nilai Baru</TableHead>
                        <TableHead>Oleh</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((row) => {
                        const isTol = row.jenisJastip === "Toleransi Selisih Kas";
                        const fmtVal = (v: any) => {
                          if (v == null || v === "") return "-";
                          if (isTol) return formatRp(v);
                          if (v === "true") return "Aktif";
                          if (v === "false") return "Nonaktif";
                          return String(v);
                        };
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {new Date(row.createdAt).toLocaleString("id-ID")}
                            </TableCell>
                            <TableCell className="text-xs font-medium">{row.jenisJastip}</TableCell>
                            <TableCell className="text-xs">{fmtVal(row.tarifLama)}</TableCell>
                            <TableCell className="text-xs font-semibold">{fmtVal(row.tarifBaru)}</TableCell>
                            <TableCell className="text-xs">{row.namaUbah || `User #${row.diubahOleh ?? "-"}`}</TableCell>
                          </TableRow>
                        );
                      })}
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
