import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useShift } from "@/lib/shift";
import { buildShiftClosingDocument } from "@/lib/print-shift-closing";
import {
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  Loader2,
  LogOut,
  Receipt,
  ShieldAlert,
  WalletCards,
  Printer,
} from "lucide-react";

const DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200];

function formatRp(value: number | string | null | undefined) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

function shiftLabel(value: string) {
  return value === "PAGI" ? "Pagi" : "Malam";
}

export default function AdminShift() {
  const { user } = useAuth();
  const { shift, summary, isLoading, openShift, beginClosing, completeClosing } = useShift();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [shiftType, setShiftType] = useState<"PAGI" | "MALAM">("PAGI");
  const [terminalId, setTerminalId] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [cashCounts, setCashCounts] = useState<Record<number, string>>({});
  const [alasanSelisih, setAlasanSelisih] = useState("");
  const [closingResult, setClosingResult] = useState<any>(null);

  const actualCash = useMemo(
    () =>
      DENOMINATIONS.reduce(
        (total, denomination) =>
          total + denomination * Number(cashCounts[denomination] || 0),
        0,
      ),
    [cashCounts],
  );

  async function handleOpen() {
    const balance = Number(openingBalance || 0);
    if (!Number.isInteger(balance) || balance < 0) {
      toast({
        variant: "destructive",
        title: "Saldo awal tidak valid",
        description: "Masukkan nominal Rupiah bulat yang tidak negatif.",
      });
      return;
    }
    setIsSaving(true);
    try {
      await openShift({ shiftType, terminalId: terminalId.trim() || undefined, openingBalance: balance });
      toast({ title: "Shift dibuka", description: `Shift ${shiftLabel(shiftType)} siap digunakan.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal membuka shift", description: (error as Error).message });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleBeginClosing() {
    if (!shift) return;
    setIsSaving(true);
    try {
      const result = await beginClosing(shift.id);
      setClosingId(result.closingId);
      setCashCounts({});
      setAlasanSelisih("");
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal memulai closing", description: (error as Error).message });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCompleteClosing() {
    if (!shift || !closingId) return;
    setIsSaving(true);
    try {
      const result = await completeClosing(shift.id, closingId, actualCash, alasanSelisih);
      setClosingResult(result);
      setClosingId(null);
      toast({ title: "Closing selesai", description: `Hasil kas: ${result.result}.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Closing belum selesai", description: (error as Error).message });
    } finally {
      setIsSaving(false);
    }
  }

  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!shift) {
      setLoadingHistory(true);
      fetch("/api/shifts/history")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setHistory(data);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingHistory(false));
    }
  }, [shift]);

  const handlePrintCurrentClosing = () => {
    if (!closingResult) return;
    const { shift: cShift, closing: cClosing, result, summary: cSummary } = closingResult;
    const printWindow = window.open("", "_blank", "width=420,height=720");
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Popup diblokir",
        description: "Mohon aktifkan popup di browser untuk mencetak laporan.",
      });
      return;
    }
    printWindow.document.write(
      buildShiftClosingDocument({
        shift: {
          id: cShift.id,
          adminName: user?.name,
          shiftType: cShift.shiftType,
          terminalId: cShift.terminalId,
          actualStart: cShift.actualStart,
          actualEnd: cShift.actualEnd,
          openingBalance: cShift.openingBalance,
        },
        closing: {
          systemCash: Number(cClosing.systemCash || 0),
          actualCash: Number(cClosing.actualCash || 0),
          selisih: Number(cClosing.selisih || 0),
          alasanSelisih: cClosing.alasanSelisih,
          closedAt: cClosing.closedAt,
        },
        summary: cSummary,
        result: result,
      }),
    );
    printWindow.document.close();
    printWindow.focus();
  };

  async function handlePrintClosing(item: any) {
    const printWindow = window.open("", "_blank", "width=420,height=720");
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Popup diblokir",
        description: "Mohon aktifkan popup di browser untuk mencetak laporan.",
      });
      return;
    }
    printWindow.document.write("<p style='font:14px Arial;padding:20px'>Menyiapkan laporan closing...</p>");
    printWindow.document.close();

    try {
      const response = await fetch(`/api/shifts/${item.id}/summary`);
      if (!response.ok) throw new Error("Gagal memuat ringkasan kas");
      const summaryData = await response.json();

      printWindow.document.open();
      printWindow.document.write(
        buildShiftClosingDocument({
          shift: {
            id: item.id,
            adminName: item.adminName,
            shiftType: item.shiftType,
            terminalId: item.terminalId,
            actualStart: item.actualStart,
            actualEnd: item.actualEnd,
            openingBalance: item.openingBalance,
          },
          closing: {
            systemCash: Number(item.systemCash || 0),
            actualCash: Number(item.actualCash || 0),
            selisih: Number(item.selisih || 0),
            alasanSelisih: item.alasanSelisih,
            closedAt: item.closedAt,
          },
          summary: summaryData,
          result: item.selisih === 0 ? "SESUAI" : item.selisih > 0 ? "LEBIH" : "KURANG",
        }),
      );
      printWindow.document.close();
      printWindow.focus();
    } catch (e) {
      printWindow.close();
      toast({
        variant: "destructive",
        title: "Gagal mencetak",
        description: "Tidak dapat memuat detail data closing dari server.",
      });
    }
  }

  if (isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat status shift...</div>;
  }

  if (!shift) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Buka Shift Kasir</h1>
          <p className="mt-1 text-muted-foreground">Buka shift sebelum mengakses scan dan transaksi pembayaran.</p>
        </div>
        {closingResult && (
          <Card className="border-green-200 bg-green-50/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Laporan Closing Sukses — Shift #{closingResult.shift.id}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-green-700">
                Shift <strong>{shiftLabel(closingResult.shift.shiftType)}</strong> berhasil ditutup dengan status hasil kas: <strong className="text-green-900 underline">{closingResult.result}</strong>.
              </p>
              
              <div className="grid gap-3 sm:grid-cols-3 bg-white p-4 rounded-lg border border-green-100 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Kas Sistem</span>
                  <span className="font-semibold text-gray-900">{formatRp(closingResult.closing.systemCash)}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Kas Fisik Aktual</span>
                  <span className="font-semibold text-gray-900">{formatRp(closingResult.closing.actualCash)}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Selisih</span>
                  <span className={`font-semibold ${closingResult.closing.selisih === 0 ? "text-green-600" : "text-red-600"}`}>
                    {closingResult.closing.selisih >= 0 ? "+" : ""}{formatRp(closingResult.closing.selisih)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={handlePrintCurrentClosing} className="bg-green-700 hover:bg-green-800 text-white">
                  <Printer className="mr-2 h-4 w-4" /> Cetak Laporan Shift (Struk)
                </Button>
                <Button variant="outline" onClick={() => setClosingResult(null)} className="text-gray-600 border-gray-300">
                  Tutup Notifikasi
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-primary" />Data Shift</CardTitle></CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Jenis Shift</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={shiftType} onChange={(event) => setShiftType(event.target.value as "PAGI" | "MALAM")}>
                <option value="PAGI">Pagi</option>
                <option value="MALAM">Malam</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Terminal (opsional)</Label>
              <Input value={terminalId} onChange={(event) => setTerminalId(event.target.value)} placeholder="Contoh: KASIR-01" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Saldo Awal (Rp)</Label>
              <Input type="number" min="0" step="1" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="0" />
              <p className="text-xs text-muted-foreground">Jika ada serah-terima, saldo akan disesuaikan otomatis setelah kedua pihak mengonfirmasi.</p>
            </div>
            <Button onClick={handleOpen} disabled={isSaving} className="md:col-span-2">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Banknote className="mr-2 h-4 w-4" />}
              Buka Shift {shiftLabel(shiftType)}
            </Button>
          </CardContent>
        </Card>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation(user?.role === "owner" ? "/owner/shift/handover" : "/admin/shift/handover")}>
            <ArrowRightLeft className="mr-2 h-4 w-4" /> Lihat Serah Terima
          </Button>
        </div>

        <div className="space-y-4 pt-4">
          <h2 className="text-xl font-bold tracking-tight">Riwayat Closing Shift</h2>
          <Card>
            <CardContent className="p-0">
              {loadingHistory ? (
                <div className="p-6 text-center text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Memuat riwayat...
                </div>
              ) : history.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  Belum ada riwayat shift yang ditutup.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-muted/50 border-b text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="p-3 font-semibold">ID / Tipe</th>
                        <th className="p-3 font-semibold">Kasir</th>
                        <th className="p-3 font-semibold">Waktu Tutup</th>
                        <th className="p-3 font-semibold text-right">Kas Sistem</th>
                        <th className="p-3 font-semibold text-right">Kas Aktual</th>
                        <th className="p-3 font-semibold text-right">Selisih</th>
                        <th className="p-3 font-semibold text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {history.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <div className="font-semibold text-primary">#{item.id}</div>
                            <div className="text-xs text-muted-foreground">{shiftLabel(item.shiftType)}</div>
                          </td>
                          <td className="p-3 font-medium text-gray-900">{item.adminName || "Admin"}</td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {item.closedAt ? new Date(item.closedAt).toLocaleString("id-ID") : "-"}
                          </td>
                          <td className="p-3 text-right font-mono text-gray-600">{formatRp(item.systemCash)}</td>
                          <td className="p-3 text-right font-mono font-semibold text-gray-900">{formatRp(item.actualCash)}</td>
                          <td className="p-3 text-right font-mono">
                            <span className={Number(item.selisih || 0) === 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                              {Number(item.selisih || 0) >= 0 ? "+" : ""}{formatRp(item.selisih)}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <Button size="sm" variant="outline" onClick={() => handlePrintClosing(item)}>
                              <Printer className="mr-1.5 h-3.5 w-3.5" /> Cetak
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const cards = [
    { label: "Total transaksi", value: summary?.paymentCount || 0, icon: Receipt },
    { label: "Pembayaran tunai", value: formatRp(summary?.cashReceived), icon: Banknote },
    { label: "Transfer", value: summary?.transferPaymentCount || 0, icon: WalletCards },
    { label: "Piutang", value: summary?.receivablePaymentCount || 0, icon: Coins },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Shift {shiftLabel(shift.shiftType)}</h1>
          <p className="mt-1 text-muted-foreground">Shift aktif sejak {shift.actualStart ? new Date(shift.actualStart).toLocaleString("id-ID") : "-"}. Kas sistem tetap disembunyikan sampai closing.</p>
        </div>
        <div className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-700">Aktif</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div>
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-bold">{value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {closingId ? (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />Input Kas Aktual</CardTitle>
            <p className="text-sm text-muted-foreground">Masukkan jumlah pecahan. Nilai kas sistem belum ditampilkan untuk menjaga blind closing.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DENOMINATIONS.map((denomination) => (
                <div key={denomination} className="flex items-center gap-2">
                  <Label className="w-24 shrink-0">{formatRp(denomination)}</Label>
                  <Input type="number" min="0" step="1" value={cashCounts[denomination] || ""} onChange={(event) => setCashCounts((current) => ({ ...current, [denomination]: event.target.value }))} placeholder="lembar" />
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-muted/50 p-4"><p className="text-sm text-muted-foreground">Total kas aktual</p><p className="text-2xl font-bold">{formatRp(actualCash)}</p></div>
            <div className="space-y-2">
              <Label>Alasan selisih (wajib jika melewati toleransi)</Label>
              <Input value={alasanSelisih} onChange={(event) => setAlasanSelisih(event.target.value)} placeholder="Contoh: uang kembalian tertukar" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleCompleteClosing} disabled={isSaving}><ClipboardCheck className="mr-2 h-4 w-4" />Submit Kas Aktual</Button>
              <Button variant="outline" onClick={() => setClosingId(null)} disabled={isSaving}>Batal</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Button onClick={() => setLocation(user?.role === "owner" ? "/owner/pengeluaran" : "/admin/pengeluaran")} variant="outline" className="h-12 justify-start"><LogOut className="mr-2 h-4 w-4" />Pengeluaran</Button>
          <Button onClick={() => setLocation(user?.role === "owner" ? "/owner/shift/handover" : "/admin/shift/handover")} variant="outline" className="h-12 justify-start"><ArrowRightLeft className="mr-2 h-4 w-4" />Serah Terima</Button>
          <Button onClick={handleBeginClosing} disabled={isSaving} variant="destructive" className="h-12 justify-start"><ShieldAlert className="mr-2 h-4 w-4" />Closing Shift</Button>
        </div>
      )}
    </div>
  );
}