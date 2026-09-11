import { useEffect, useMemo, useState } from "react";
import { Ban, Banknote, CircleDollarSign, Clock3, CreditCard, ReceiptText, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { buildReceiptDocument, type ReceiptPrintPayload } from "@/lib/print-receipt";
import { Pagination } from "@/components/pagination";

type FinanceSummary = {
  transactionsToday: number;
  paymentsReceivedToday: number;
  newReceivablesToday: number;
  oldReceivablesReceivedToday: number;
  activeReceivables: number;
};

function formatRp(value: unknown) {
  return `Rp${Math.round(Number(value ?? 0)).toLocaleString("id-ID")}`;
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("jaj_token")}` };
}

export default function OwnerFinanceTransactions() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<FinanceSummary>({
    transactionsToday: 0,
    paymentsReceivedToday: 0,
    newReceivablesToday: 0,
    oldReceivablesReceivedToday: 0,
    activeReceivables: 0,
  });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const total = transactions.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pagedTransactions = useMemo(() => {
    return transactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [transactions, page]);
  const [selectedId, setSelectedId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"tunai" | "transfer">("tunai");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [voidTarget, setVoidTarget] = useState<any | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidNotes, setVoidNotes] = useState("");
  const [voidSaving, setVoidSaving] = useState(false);

  async function load() {
    const headers = authHeaders();
    const [summaryResponse, transactionsResponse] = await Promise.all([
      fetch("/api/dashboard/summary", { headers }),
      fetch("/api/transactions", { headers }),
    ]);
    if (summaryResponse.ok) {
      const data = await summaryResponse.json();
      setSummary((current) => ({ ...current, ...(data.finance ?? {}) }));
    }
    if (transactionsResponse.ok) {
      setTransactions(await transactionsResponse.json());
    }
  }

  async function printReceipt(transactionId: number) {
    const printWindow = window.open("", "_blank", "width=420,height=720");
    if (!printWindow) {
      setMessage("Popup diblokir. Izinkan popup browser untuk mencetak struk.");
      return;
    }
    printWindow.document.write("<p style='font:14px Arial;padding:20px'>Menyiapkan struk...</p>");
    printWindow.document.close();
    try {
      const response = await fetch(`/api/transactions/${transactionId}/receipt/print`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal menyiapkan struk.");
      printWindow.document.open();
      printWindow.document.write(buildReceiptDocument(body.receipt as ReceiptPrintPayload, body.print));
      printWindow.document.close();
      printWindow.focus();
      setMessage(body.print?.isReprint ? "Salinan struk berhasil dicatat." : "Struk berhasil dicatat.");
    } catch (error: any) {
      printWindow.close();
      setMessage(error.message || "Gagal mencetak struk.");
    }
  }

  useEffect(() => {
    load().catch(() => setMessage("Gagal memuat transaksi dan ringkasan keuangan."));
  }, []);

  const receivables = useMemo(
    () =>
      transactions.filter(
        (transaction) =>
          transaction.transactionStatus === "AKTIF" &&
          Number(transaction.sisaPiutang) > 0,
      ),
    [transactions],
  );
  const selected = receivables.find((transaction) => String(transaction.id) === selectedId);

  async function submitPayment() {
    if (!selected || Number(amount) <= 0) {
      setMessage("Pilih transaksi dan isi nominal pelunasan.");
      return;
    }
    if (Number(amount) > Number(selected.sisaPiutang)) {
      setMessage("Nominal tidak boleh melebihi sisa piutang.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/transactions/${selected.id}/payments`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ paymentType: method, amount: Number(amount) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal mencatat pelunasan.");
      setAmount("");
      setSelectedId("");
      setMessage("Pelunasan berhasil dicatat pada transaksi asal.");
      await load();
    } catch (error: any) {
      setMessage(error.message || "Gagal mencatat pelunasan.");
    } finally {
      setSaving(false);
    }
  }

  async function submitVoid() {
    if (!voidTarget || !voidReason.trim()) {
      setMessage("Alasan VOID wajib diisi.");
      return;
    }
    setVoidSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/transactions/${voidTarget.id}/void`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reasonCode: voidReason.trim(), notes: voidNotes.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal mengajukan VOID.");
      setVoidTarget(null);
      setVoidReason("");
      setVoidNotes("");
      setMessage("Pengajuan VOID tersimpan dan menunggu approval Owner.");
      await load();
    } catch (error: any) {
      setMessage(error.message || "Gagal mengajukan VOID.");
    } finally {
      setVoidSaving(false);
    }
  }

  const cards = [
    { label: "Transaksi hari ini", value: summary.transactionsToday, icon: ReceiptText, tone: "bg-sky-50 text-sky-900" },
    { label: "Pembayaran diterima", value: summary.paymentsReceivedToday, icon: CircleDollarSign, tone: "bg-emerald-50 text-emerald-900" },
    { label: "Piutang baru", value: summary.newReceivablesToday, icon: Clock3, tone: "bg-amber-50 text-amber-900" },
    { label: "Penerimaan piutang lama", value: summary.oldReceivablesReceivedToday, icon: Banknote, tone: "bg-violet-50 text-violet-900" },
    { label: "Total piutang aktif", value: summary.activeReceivables, icon: CreditCard, tone: "bg-rose-50 text-rose-900" },
  ];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Transaksi &amp; piutang</h2>
        <p className="text-sm text-muted-foreground">
          Nilai jasa dan uang masuk dipisahkan; pelunasan selalu menempel pada transaksi asal.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className={tone}>
            <CardContent className="p-4">
              <Icon className="mb-3 h-5 w-5 opacity-70" />
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
              <p className="mt-1 text-xl font-black">{formatRp(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pelunasan piutang</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger aria-label="Pilih transaksi piutang">
                <SelectValue placeholder="Pilih transaksi asal" />
              </SelectTrigger>
              <SelectContent>
                {receivables.map((transaction) => (
                  <SelectItem key={transaction.id} value={String(transaction.id)}>
                    {transaction.transactionNo} · {transaction.customerName} · sisa {formatRp(transaction.sisaPiutang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              inputMode="numeric"
              type="number"
              min="1"
              placeholder="Nominal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <Select value={method} onValueChange={(value) => setMethod(value as "tunai" | "transfer")}>
              <SelectTrigger aria-label="Metode pelunasan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tunai">Tunai</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={submitPayment} disabled={saving || !selected}>
              {saving ? "Menyimpan..." : "Catat pembayaran"}
            </Button>
          </div>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          <p className="text-xs text-muted-foreground">
            Pembayaran membutuhkan shift aktif dan tidak mengubah tanggal transaksi asal.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Riwayat multi-payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {pagedTransactions.map((transaction) => (
              <div key={transaction.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{transaction.transactionNo} · {transaction.customerName}</p>
                  <p className="text-xs text-muted-foreground">
                    Nilai {formatRp(transaction.total)} · dibuat {new Date(transaction.createdAt).toLocaleDateString("id-ID")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={transaction.paymentStatus === "LUNAS" ? "default" : "outline"}>
                    {transaction.paymentStatus}
                  </Badge>
                  <span className="text-sm font-semibold">
                    {transaction.payments?.length ?? 0} pembayaran · sisa {formatRp(transaction.sisaPiutang)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => void printReceipt(transaction.id)}
                  >
                    <Printer className="h-3.5 w-3.5" /> Cetak Struk
                  </Button>
                  {transaction.transactionStatus === "AKTIF" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setVoidTarget(transaction)}
                    >
                      <Ban className="h-3.5 w-3.5" /> Ajukan VOID
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!transactions.length ? (
            <p className="text-sm text-muted-foreground">Belum ada transaksi baru.</p>
          ) : (
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!voidTarget} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajukan VOID Transaksi</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {voidTarget?.transactionNo} · {voidTarget?.customerName}
            </p>
            <Input
              placeholder="Alasan VOID (wajib)"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
            />
            <Textarea
              placeholder="Catatan tambahan (opsional)"
              value={voidNotes}
              onChange={(event) => setVoidNotes(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>Batal</Button>
            <Button variant="destructive" onClick={submitVoid} disabled={voidSaving || !voidReason.trim()}>
              {voidSaving ? "Mengajukan..." : "Ajukan VOID"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}