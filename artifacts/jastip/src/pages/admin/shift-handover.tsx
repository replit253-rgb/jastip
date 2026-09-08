import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useShiftRequest, useShift } from "@/lib/shift";
import { ArrowLeft, ArrowRightLeft, CheckCircle2, Loader2 } from "lucide-react";

function formatRp(value: number | string) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

export default function ShiftHandover() {
  const { user } = useAuth();
  const { shift } = useShift();
  const request = useShiftRequest();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeShifts, setActiveShifts] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [targetId, setTargetId] = useState("");
  const [amount, setAmount] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const [activeBody, pendingBody] = await Promise.all([
        request("/active"),
        request("/handovers/pending"),
      ]);
      setActiveShifts(activeBody);
      setPending(pendingBody);
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal memuat serah terima", description: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function confirmGiver() {
    if (!shift || !targetId || !amount) {
      toast({ variant: "destructive", title: "Data belum lengkap", description: "Pilih shift penerima dan masukkan nominal." });
      return;
    }
    setIsSaving(true);
    try {
      await request(`/${shift.id}/handover`, {
        method: "POST",
        body: JSON.stringify({ toShiftSessionId: Number(targetId), handoverAmount: Number(amount), confirmAs: "giver" }),
      });
      toast({ title: "Konfirmasi penyerah tersimpan", description: "Minta penerima melakukan konfirmasi dari akunnya." });
      setTargetId("");
      setAmount("");
      await load();
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal konfirmasi penyerah", description: (error as Error).message });
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmReceiver(id: number) {
    setIsSaving(true);
    try {
      const result = await request(`/${pending.find((item) => item.id === id)?.fromShiftSessionId || 0}/handover`, {
        method: "POST",
        body: JSON.stringify({ handoverId: id, confirmAs: "receiver" }),
      });
      toast({ title: "Serah terima dikonfirmasi", description: result.confirmed ? "Saldo sudah masuk ke shift penerima." : "Konfirmasi tersimpan." });
      setPendingId("");
      await load();
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal konfirmasi penerima", description: (error as Error).message });
    } finally {
      setIsSaving(false);
    }
  }

  const receiverOptions = activeShifts.filter((candidate) => candidate.id !== shift?.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation(user?.role === "owner" ? "/owner/shift" : "/admin/shift")}><ArrowLeft className="h-4 w-4" /></Button>
        <div><h1 className="text-3xl font-bold tracking-tight">Serah Terima Shift</h1><p className="mt-1 text-muted-foreground">Saldo berpindah setelah penyerah dan penerima mengonfirmasi.</p></div>
      </div>

      {isLoading ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat data...</div> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5 text-primary" />Konfirmasi Penyerah</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!shift ? <p className="text-sm text-muted-foreground">Buka shift terlebih dahulu untuk menjadi penyerah.</p> : (
                <>
                  <div className="space-y-2"><Label>Shift penerima</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Pilih shift aktif</option>{receiverOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.adminName || `Admin #${candidate.adminId}`} · Shift {candidate.shiftType} · #{candidate.id}</option>)}</select></div>
                  <div className="space-y-2"><Label>Nominal serah terima (Rp)</Label><Input type="number" min="0" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></div>
                  <Button onClick={confirmGiver} disabled={isSaving || !receiverOptions.length}><CheckCircle2 className="mr-2 h-4 w-4" />Konfirmasi sebagai Penyerah</Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-600" />Konfirmasi Penerima</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {pending.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada serah terima yang menunggu konfirmasi Anda.</p> : pending.map((item) => (
                <div key={item.id} className={`rounded-lg border p-3 ${pendingId === String(item.id) ? "border-primary bg-primary/5" : ""}`}>
                  <div className="flex items-center justify-between gap-3"><div><p className="font-medium">Serah terima #{item.id}</p><p className="text-sm text-muted-foreground">{formatRp(item.handoverAmount)} · Shift tujuan #{item.toShiftSessionId}</p></div><Button size="sm" onClick={() => { setPendingId(String(item.id)); void confirmReceiver(item.id); }} disabled={isSaving}>Terima</Button></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}