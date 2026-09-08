import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save, Loader2, History } from "lucide-react";
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

export default function OwnerSettings() {
  const { toast } = useToast();
  const [kargoRate, setKargoRate] = useState<string>("");
  const [cashVarianceTolerance, setCashVarianceTolerance] = useState<string>("0");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetchSettings(),
      fetch("/api/settings/history", {
        headers: { Authorization: `Bearer ${localStorage.getItem("jaj_token")}` },
      }).then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([d, historyRows]) => {
        setKargoRate(d.kargoRate != null ? String(d.kargoRate) : "");
        setCashVarianceTolerance(d.cash_variance_tolerance != null ? String(d.cash_variance_tolerance) : "0");
        setHistory(
          (historyRows as any[]).filter(
            (row) => row.jenisJastip === "Toleransi Selisih Kas",
          ),
        );
      })
      .catch(() => {
        toast({ variant: "destructive", title: "Gagal memuat pengaturan" });
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function handleSave() {
    const rate = Number(kargoRate);
    if (!kargoRate || isNaN(rate) || rate <= 0) {
      toast({ variant: "destructive", title: "Tarif tidak valid", description: "Masukkan tarif kargo yang benar." });
      return;
    }
    const tolerance = Number(cashVarianceTolerance);
    if (!Number.isInteger(tolerance) || tolerance < 0) {
      toast({ variant: "destructive", title: "Toleransi tidak valid", description: "Masukkan toleransi kas dalam Rupiah bulat, minimal 0." });
      return;
    }
    setIsSaving(true);
    try {
      await patchSettings({ kargoRate: rate, cash_variance_tolerance: tolerance, _alasan: "Pembaruan pengaturan Owner" });
      toast({ title: "Tersimpan", description: `Tarif kargo dan toleransi kas Rp ${tolerance.toLocaleString("id-ID")} berhasil diperbarui.` });
    } catch {
      toast({ variant: "destructive", title: "Gagal menyimpan", description: "Terjadi kesalahan. Coba lagi." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pengaturan Tarif</h1>
        <p className="text-muted-foreground mt-1">
          Atur tarif default yang digunakan saat input paket.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Tarif Jastip Kargo
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

              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                Ongkir kargo = MAX(M³, Ton digunakan) × tarif ini. Minimum tagihan = 10 M³/Ton.
              </div>

              <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" /> Simpan Tarif</>
                )}
              </Button>
            </>
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
          {history.length === 0 ? (
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
                  {history.map((row) => (
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
