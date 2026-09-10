import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Plus, Wallet, Pencil, Trash2, Download, FileDown, TrendingDown, Filter,
} from "lucide-react";
import * as XLSX from "xlsx";
import { addExportInfoSheet, saveTabularPdf } from "@/lib/export-utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Pengeluaran {
  id: number;
  tanggal: string;
  kategori: string;
  nominal: string;
  metodePembayaran: string;
  namaPencatat?: string;
  catatan?: string;
  createdAt: string;
}

type MetodePembayaran = "cash" | "transfer" | "lainnya";

// ── Constants ─────────────────────────────────────────────────────────────────
const KATEGORI_LIST = [
  "Bensin",
  "Parkir",
  "Bongkar muat",
  "Uang makan kurir",
  "Biaya kendaraan",
  "Biaya ekspedisi",
  "Biaya cetak label",
  "Biaya packing",
  "Biaya operasional kantor",
  "Lain-lain",
];

const METODE_LIST: { value: MetodePembayaran; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "transfer", label: "Transfer" },
  { value: "lainnya", label: "Lainnya" },
];

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function formatRp(n: number | string | null | undefined) {
  if (n == null || n === "") return "Rp 0";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function authHeaders() {
  const token = localStorage.getItem("jaj_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ── Form Dialog ───────────────────────────────────────────────────────────────
interface FormData {
  tanggal: string;
  kategori: string;
  kategoriLain: string;
  nominal: string;
  metodePembayaran: MetodePembayaran;
  catatan: string;
}

function emptyForm(): FormData {
  return {
    tanggal: todayStr(),
    kategori: "",
    kategoriLain: "",
    nominal: "",
    metodePembayaran: "cash",
    catatan: "",
  };
}

interface PengeluaranDialogProps {
  open: boolean;
  editData: Pengeluaran | null;
  onClose: () => void;
  onSaved: () => void;
}

function PengeluaranDialog({ open, editData, onClose, onSaved }: PengeluaranDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormData>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (editData) {
      const isCustom = !KATEGORI_LIST.includes(editData.kategori);
      setForm({
        tanggal: editData.tanggal,
        kategori: isCustom ? "Lain-lain" : editData.kategori,
        kategoriLain: isCustom ? editData.kategori : "",
        nominal: String(Math.round(Number(editData.nominal))),
        metodePembayaran: (editData.metodePembayaran as MetodePembayaran) || "cash",
        catatan: editData.catatan || "",
      });
    } else {
      setForm(emptyForm());
    }
  }, [editData, open]);

  const finalKategori =
    form.kategori === "Lain-lain" && form.kategoriLain.trim()
      ? form.kategoriLain.trim()
      : form.kategori;

  async function handleSave() {
    if (!form.tanggal) { toast({ variant: "destructive", title: "Tanggal wajib diisi" }); return; }
    if (!finalKategori) { toast({ variant: "destructive", title: "Kategori wajib diisi" }); return; }
    const nom = Number(form.nominal.replace(/\D/g, ""));
    if (!nom || nom <= 0) { toast({ variant: "destructive", title: "Nominal harus lebih dari 0" }); return; }

    setIsSaving(true);
    try {
      const payload = {
        tanggal: form.tanggal,
        kategori: finalKategori,
        nominal: nom,
        metodePembayaran: form.metodePembayaran,
        catatan: form.catatan || null,
      };

      if (editData) {
        const res = await fetch(`/api/pengeluaran/${editData.id}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Gagal memperbarui");
        toast({ title: "Pengeluaran diperbarui" });
      } else {
        const res = await fetch("/api/pengeluaran", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Gagal menyimpan");
        toast({ title: "Pengeluaran berhasil dicatat" });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gagal", description: err.message });
    } finally {
      setIsSaving(false);
    }
  }

  function handleNominalChange(val: string) {
    const digits = val.replace(/\D/g, "");
    setForm((f) => ({ ...f, nominal: digits ? Number(digits).toLocaleString("id-ID") : "" }));
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            {editData ? "Edit Pengeluaran" : "Tambah Pengeluaran"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Tanggal *</Label>
            <Input
              type="date"
              value={form.tanggal}
              onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Kategori *</Label>
            <Select
              value={form.kategori}
              onValueChange={(v) => setForm((f) => ({ ...f, kategori: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {KATEGORI_LIST.map((k) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.kategori === "Lain-lain" && (
              <Input
                placeholder="Isi kategori lainnya..."
                value={form.kategoriLain}
                onChange={(e) => setForm((f) => ({ ...f, kategoriLain: e.target.value }))}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Nominal *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
              <Input
                className="pl-9 text-lg font-bold"
                placeholder="0"
                value={form.nominal}
                onChange={(e) => handleNominalChange(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Metode Pembayaran</Label>
            <Select
              value={form.metodePembayaran}
              onValueChange={(v) => setForm((f) => ({ ...f, metodePembayaran: v as MetodePembayaran }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METODE_LIST.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Catatan <span className="text-muted-foreground font-normal">(opsional)</span></Label>
            <Input
              placeholder="Keterangan tambahan..."
              value={form.catatan}
              onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OwnerPengeluaran() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [data, setData] = useState<Pengeluaran[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [dari, setDari] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [sampai, setSampai] = useState(todayStr());
  const [filterKategori, setFilterKategori] = useState("");
  const [filterMetode, setFilterMetode] = useState("");

  // Dialog state
  const [showForm, setShowForm] = useState(false);
  const [editData, setEditData] = useState<Pengeluaran | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Pengeluaran | null>(null);

  async function loadData() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (dari) params.set("dari", dari);
      if (sampai) params.set("sampai", sampai);
      if (filterKategori) params.set("kategori", filterKategori);
      if (filterMetode) params.set("metodePembayaran", filterMetode);

      const token = localStorage.getItem("jaj_token");
      const res = await fetch(`/api/pengeluaran?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Gagal memuat data");
      setData(await res.json());
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gagal memuat", description: err.message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [dari, sampai, filterKategori, filterMetode]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const token = localStorage.getItem("jaj_token");
      const res = await fetch(`/api/pengeluaran/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Gagal menghapus");
      toast({ title: "Pengeluaran dihapus" });
      setDeleteTarget(null);
      loadData();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gagal menghapus", description: err.message });
    }
  }

  function exportExcel() {
    const rows = data.map((d) => ({
      Tanggal: formatDate(d.tanggal),
      Kategori: d.kategori,
      "Nominal (Rp)": Number(d.nominal),
      "Metode Pembayaran": d.metodePembayaran,
      "Dicatat Oleh": d.namaPencatat || "-",
      Catatan: d.catatan || "",
    }));
    const wb = XLSX.utils.book_new();
    addExportInfoSheet(wb, "Pengeluaran Harian — Jastip Anggun Jaya", {
      Dari: dari,
      Sampai: sampai,
      Kategori: filterKategori || "Semua",
      Metode: filterMetode || "Semua",
      Layanan: "Semua",
      Status: "Semua",
      Kasir: "Semua",
      "Diekspor Oleh": user?.name || "Pengguna aktif",
    });
    rows.push({
      Tanggal: "TOTAL",
      Kategori: "",
      "Nominal (Rp)": totalNominal,
      "Metode Pembayaran": "",
      "Dicatat Oleh": "",
      Catatan: "",
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Pengeluaran");
    XLSX.writeFile(wb, `pengeluaran_${dari}_${sampai}.xlsx`);
  }

  function exportPdf() {
    saveTabularPdf({
      filename: `pengeluaran_${dari}_${sampai}.pdf`,
      title: "Pengeluaran Harian — Jastip Anggun Jaya",
      filters: {
        Dari: dari,
        Sampai: sampai,
        Kategori: filterKategori || "Semua",
        Metode: filterMetode || "Semua",
        Layanan: "Semua",
        Status: "Semua",
        Kasir: "Semua",
        "Diekspor Oleh": user?.name || "Pengguna aktif",
      },
      columns: ["Tanggal", "Kategori", "Nominal (Rp)", "Metode Pembayaran", "Dicatat Oleh", "Catatan"],
      rows: data.map((d) => [
        formatDate(d.tanggal),
        d.kategori,
        Number(d.nominal),
        d.metodePembayaran,
        d.namaPencatat || "-",
        d.catatan || "",
      ]),
      summaryRows: [["TOTAL", "", totalNominal, "", "", ""]],
      landscape: true,
      exportedBy: user?.name || "Pengguna aktif",
    });
  }

  const totalNominal = data.reduce((s, d) => s + Number(d.nominal), 0);

  // Ringkasan per kategori
  const byKategori = data.reduce<Record<string, number>>((acc, d) => {
    acc[d.kategori] = (acc[d.kategori] || 0) + Number(d.nominal);
    return acc;
  }, {});
  const topKategori = Object.entries(byKategori)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const metodeColor: Record<string, string> = {
    cash: "bg-green-100 text-green-800",
    transfer: "bg-blue-100 text-blue-800",
    lainnya: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingDown className="w-6 h-6 text-red-500" />
            Pengeluaran Harian
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Catat biaya operasional harian Jastip Anggun Jaya
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-1.5" onClick={exportExcel} disabled={data.length === 0}>
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={exportPdf} disabled={data.length === 0}>
            <FileDown className="w-4 h-4" /> Export PDF
          </Button>
          <Button className="gap-1.5" onClick={() => { setEditData(null); setShowForm(true); }}>
            <Plus className="w-4 h-4" /> Tambah Pengeluaran
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Filter</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Dari</label>
              <Input type="date" value={dari} onChange={(e) => setDari(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Sampai</label>
              <Input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Kategori</label>
              <Select value={filterKategori || "__all"} onValueChange={(v) => setFilterKategori(v === "__all" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Semua Kategori</SelectItem>
                  {KATEGORI_LIST.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Metode</label>
              <Select value={filterMetode || "__all"} onValueChange={(v) => setFilterMetode(v === "__all" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Semua Metode</SelectItem>
                  {METODE_LIST.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Total Pengeluaran</p>
            <p className="text-2xl font-black text-red-700 mt-1">{formatRp(totalNominal)}</p>
            <p className="text-xs text-red-500 mt-1">{data.length} transaksi</p>
          </CardContent>
        </Card>

        {topKategori.length > 0 && (
          <Card className="sm:col-span-1 lg:col-span-2">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pengeluaran Terbesar</p>
              <div className="space-y-1.5">
                {topKategori.map(([kat, nom]) => (
                  <div key={kat} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground truncate">{kat}</span>
                    <span className="font-semibold text-foreground ml-2">{formatRp(nom)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daftar Pengeluaran</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Memuat...</div>
          ) : data.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Wallet className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p>Belum ada data pengeluaran</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-y">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Tanggal</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Kategori</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Nominal</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Metode</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">Dicatat Oleh</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden lg:table-cell">Catatan</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d) => (
                    <tr key={d.id} className="border-b last:border-b-0 hover:bg-muted/20">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(d.tanggal)}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{d.kategori}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-red-700">{formatRp(d.nominal)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${metodeColor[d.metodePembayaran] || "bg-gray-100 text-gray-700"}`}>
                          {d.metodePembayaran}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{d.namaPencatat || "-"}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">{d.catatan || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => { setEditData(d); setShowForm(true); }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(d)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 font-bold text-sm">TOTAL</td>
                    <td className="px-4 py-3 text-right font-black text-red-700">{formatRp(totalNominal)}</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <PengeluaranDialog
        open={showForm}
        editData={editData}
        onClose={() => setShowForm(false)}
        onSaved={loadData}
      />

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pengeluaran ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong>{deleteTarget.kategori}</strong> — {formatRp(deleteTarget.nominal)} ({formatDate(deleteTarget.tanggal)})
                  <br />Data ini akan dihapus permanen.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
