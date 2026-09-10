import { useEffect, useMemo, useState } from "react";
import { FileText, Printer, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildInvoiceDocument, type InvoicePrintPayload } from "@/lib/print-invoice";
import { useAuth } from "@/lib/auth";

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("jaj_token")}` };
}

function formatRp(value: unknown) {
  return `Rp${Math.round(Number(value ?? 0)).toLocaleString("id-ID")}`;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [invoices, setInvoices] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [transactionId, setTransactionId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [reason, setReason] = useState("");
  const [discount, setDiscount] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const headers = authHeaders();
    const responses = await Promise.all([
      fetch("/api/invoices", { headers }),
      fetch("/api/transactions", { headers }),
      isOwner ? fetch("/api/packages", { headers }) : Promise.resolve(null),
    ]);
    if (responses[0].ok) setInvoices(await responses[0].json());
    if (responses[1].ok) setTransactions(await responses[1].json());
    if (responses[2]?.ok) {
      const body = await responses[2].json();
      setPackages(Array.isArray(body) ? body : body.packages ?? []);
    }
  }

  useEffect(() => {
    load().catch(() => setMessage("Gagal memuat data invoice."));
  }, [isOwner]);

  const eligibleTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.transactionStatus === "AKTIF"),
    [transactions],
  );

  async function createFromTransaction() {
    if (!transactionId) return setMessage("Pilih transaksi terlebih dahulu.");
    setSaving(true);
    try {
      const response = await fetch(`/api/invoices/from-transaction/${transactionId}`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal membuat invoice.");
      setMessage(`Invoice ${body.invoiceNo} berhasil dibuat dari snapshot transaksi.`);
      await load();
    } catch (error: any) {
      setMessage(error.message || "Gagal membuat invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function createManual() {
    if (!packageId || !customerName.trim() || !reason.trim()) {
      setMessage("Paket, nama customer, dan alasan wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          packageIds: [Number(packageId)],
          customerName: customerName.trim(),
          reason: reason.trim(),
          discount: Number(discount || 0),
          downPayment: Number(downPayment || 0),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal membuat invoice manual.");
      setMessage(`Invoice ${body.invoiceNo} berhasil dibuat.`);
      setCustomerName("");
      setReason("");
      setDiscount("");
      setDownPayment("");
      await load();
    } catch (error: any) {
      setMessage(error.message || "Gagal membuat invoice manual.");
    } finally {
      setSaving(false);
    }
  }

  async function printInvoice(id: number) {
    const printWindow = window.open("", "_blank", "width=900,height=1000");
    if (!printWindow) return setMessage("Popup diblokir. Izinkan popup untuk mencetak atau menyimpan PDF.");
    printWindow.document.write("<p style='font:14px Arial;padding:20px'>Menyiapkan invoice...</p>");
    printWindow.document.close();
    try {
      const response = await fetch(`/api/invoices/${id}/print`, { method: "POST", headers: authHeaders() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal menyiapkan invoice.");
      printWindow.document.open();
      printWindow.document.write(buildInvoiceDocument(body.invoice as InvoicePrintPayload, body.print));
      printWindow.document.close();
      printWindow.focus();
      setMessage("Invoice siap dicetak atau disimpan sebagai PDF dari dialog print browser.");
    } catch (error: any) {
      printWindow.close();
      setMessage(error.message || "Gagal mencetak invoice.");
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Invoice A4</h1>
          <p className="text-sm text-muted-foreground">Invoice menyimpan snapshot harga dan rincian saat diterbitkan.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()}><RefreshCw className="mr-2 h-4 w-4" /> Muat ulang</Button>
      </div>
      {message && <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">{message}</p>}

      <div className={`grid gap-4 ${isOwner ? "lg:grid-cols-2" : ""}`}>
        <Card>
          <CardHeader><CardTitle className="text-base">Buat dari transaksi</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Data customer, tarif, diskon, DP, dan sisa diambil dari transaksi server tanpa input ulang.</p>
            <Select value={transactionId} onValueChange={setTransactionId}>
              <SelectTrigger><SelectValue placeholder="Pilih transaksi aktif" /></SelectTrigger>
              <SelectContent>{eligibleTransactions.map((transaction) => (
                <SelectItem key={transaction.id} value={String(transaction.id)}>
                  {transaction.transactionNo} · {transaction.customerName} · {formatRp(transaction.total)}
                </SelectItem>
              ))}</SelectContent>
            </Select>
            <Button onClick={createFromTransaction} disabled={saving || !transactionId}><Plus className="mr-2 h-4 w-4" /> Terbitkan invoice</Button>
          </CardContent>
        </Card>

        {isOwner && <Card>
          <CardHeader><CardTitle className="text-base">Invoice manual — Owner</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Untuk paket lepas. Alasan wajib dicatat agar penerbitan dapat diaudit.</p>
            <Select value={packageId} onValueChange={setPackageId}>
              <SelectTrigger><SelectValue placeholder="Pilih paket" /></SelectTrigger>
              <SelectContent>{packages.map((pkg) => (
                <SelectItem key={pkg.id} value={String(pkg.id)}>{pkg.customerName} · {pkg.resiNumber} · {formatRp(pkg.totalShipping)}</SelectItem>
              ))}</SelectContent>
            </Select>
            <div><Label>Nama customer</Label><Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Diskon</Label><Input type="number" min="0" value={discount} onChange={(event) => setDiscount(event.target.value)} /></div>
              <div><Label>DP / terbayar</Label><Input type="number" min="0" value={downPayment} onChange={(event) => setDownPayment(event.target.value)} /></div>
            </div>
            <div><Label>Alasan</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Contoh: invoice paket lepas atas permintaan customer" /></div>
            <Button variant="secondary" onClick={createManual} disabled={saving}><Plus className="mr-2 h-4 w-4" /> Buat invoice manual</Button>
          </CardContent>
        </Card>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Invoice terbit</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold">{invoice.invoiceNo} · {invoice.customerSnapshot?.customerName || "Pelanggan umum"}</p><p className="text-xs text-muted-foreground">Total {formatRp(invoice.total)} · Sisa {formatRp(invoice.balance)}</p></div>
              <div className="flex items-center gap-2"><Badge variant={invoice.status === "LUNAS" ? "default" : "outline"}>{statusLabel(invoice.status)}</Badge><Button size="sm" variant="outline" onClick={() => printInvoice(invoice.id)}><Printer className="mr-2 h-4 w-4" /> Cetak / PDF</Button></div>
            </div>
          ))}
          {!invoices.length && <p className="text-sm text-muted-foreground">Belum ada invoice.</p>}
        </CardContent>
      </Card>
    </section>
  );
}