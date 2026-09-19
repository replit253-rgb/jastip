import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useGetPackage, getListPackagesQueryKey, getGetPackageQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Printer, User, Phone, Pencil, Save, X, Trash2, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import JsBarcode from "jsbarcode";
import { labelDocumentHtml, labelPageHtml, qrSectionHtml } from "@/lib/print-label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function formatRp(n: any) {
  if (n === null || n === undefined || n === "") return "-";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}
function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  try { return format(new Date(d), "dd MMM yyyy", { locale: localeId }); } catch { return d; }
}
function packagingLabel(t: string | null | undefined) {
  const map: Record<string, string> = { karton:"Karton", plastik:"Plastik", kayu:"Kayu", bubble_wrap:"Bubble Wrap", sack:"Karung", lainnya:"Lainnya" };
  return t ? (map[t] || t) : "-";
}

function BarcodeDisplay({ value, pkg }: { value: string; pkg?: any }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128", width: 2, height: 80, displayValue: true,
          fontSize: 13, margin: 10, background: "#ffffff", lineColor: "#000000",
        });
      } catch {}
    }
  }, [value]);

  function printLabel() {
    const win = window.open("", "_blank");
    if (!win) { toast({ variant: "destructive", title: "Pop-up diblokir", description: "Izinkan pop-up untuk mencetak." }); return; }
    const resiNumber = pkg?.resiNumber || value;
    const pkgNumber = pkg?.packageNumber || "-";
    const serviceType = pkg?.serviceType ? pkg.serviceType.replace("jastip ", "Jastip ") : "-";
    const pkgDate = pkg?.packageDate ? new Date(pkg.packageDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "-";
    const usedWeight = pkg?.usedWeight != null ? pkg.usedWeight + " Kg" : "-";
    const realWeight = pkg?.realWeight != null ? pkg.realWeight + " Kg" : "-";
    const packaging = pkg?.packagingType || "-";
    const ongkir = pkg?.totalShipping != null ? "Rp " + Number(pkg.totalShipping).toLocaleString("id-ID") : "-";
    const route = pkg?.deliveryRoute || "-";

    import("qrcode").then((QRCode) => {
      QRCode.default.toDataURL(value, { width: 300, margin: 2 }).then((qrDataUrl) => {
        const inner = `${qrSectionHtml(qrDataUrl, value)}
          <div class="info">
            <div class="cust">${pkg?.customerName || resiNumber}</div>
            <div class="grid">
              <div class="field"><div class="fl">No. Resi</div><div class="fv mono">${resiNumber}</div></div>
              <div class="field"><div class="fl">No. Paket</div><div class="fv mono">${pkgNumber}</div></div>
              <div class="field"><div class="fl">Tanggal</div><div class="fv">${pkgDate}</div></div>
              <div class="field"><div class="fl">Jenis Jastip</div><div class="fv">${serviceType}</div></div>
              <div class="field full"><div class="fl">Rute</div><div class="fv">${route}</div></div>
              <div class="field"><div class="fl">Berat Real</div><div class="fv">${realWeight}</div></div>
              <div class="field"><div class="fl">Berat Digunakan</div><div class="fv">${usedWeight}</div></div>
              <div class="field"><div class="fl">Jenis Paking</div><div class="fv">${packaging}</div></div>
              <div class="field"><div class="fl">Total Ongkir</div><div class="fv red">${ongkir}</div></div>
              ${(pkg?.additionalFee ?? 0) > 0 ? `<div class="field"><div class="fl">Biaya Tambahan</div><div class="fv" style="color:#b45309;">Rp ${Number(pkg.additionalFee).toLocaleString("id-ID")}${pkg.additionalFeeReason ? ` (${pkg.additionalFeeReason})` : ""}</div></div>` : ""}
            </div>
          </div>`;
        win.document.write(labelDocumentHtml(`Label - ${resiNumber}`, labelPageHtml(inner)));
        win.document.close();
      }).catch(() => win.close());
    });
  }

  function downloadPNG() {
    const svg = svgRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
      }
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.download = `barcode-${value}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = url;
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-6 w-full flex items-center justify-center">
        <svg ref={svgRef} />
      </div>
      <div className="flex gap-3 w-full">
        <Button variant="outline" className="flex-1" onClick={printLabel}>
          <Printer className="w-4 h-4 mr-2" /> Cetak Label
        </Button>
        <Button variant="outline" className="flex-1" onClick={downloadPNG}>
          Unduh PNG
        </Button>
      </div>
    </div>
  );
}

const READ_FIELDS: { label: string; key: string; format?: (v: any, pkg: any) => string }[] = [
  { label: "Tanggal", key: "packageDate", format: (v, p) => formatDate(v || p.createdAt) },
  { label: "No Resi", key: "resiNumber" },
  { label: "No Paket", key: "packageNumber", format: v => v || "-" },
  { label: "Nama Konsumen", key: "customerName", format: v => v || "-" },
  { label: "Berat Real (Kg)", key: "realWeight", format: v => v ?? "-" },
  { label: "P (cm)", key: "length", format: v => v ?? "-" },
  { label: "L (cm)", key: "width", format: v => v ?? "-" },
  { label: "T (cm)", key: "height", format: v => v ?? "-" },
  { label: "Berat Kubikasi", key: "volumeWeight", format: v => v ?? "-" },
  { label: "Jenis Paking", key: "packagingType", format: v => packagingLabel(v) },
  { label: "Berat Digunakan (Kg)", key: "usedWeight", format: v => v ?? "-" },
  { label: "Ongkir/M3", key: "shippingRate", format: v => formatRp(v) },
  { label: "Total Berat (Kg)", key: "totalWeight", format: v => v ?? "-" },
  { label: "Harga Barang", key: "price", format: v => formatRp(v) },
  { label: "Total Ongkir", key: "totalShipping", format: v => formatRp(v) },
  { label: "Biaya Tambahan", key: "additionalFee", format: (v, p) => v ? `${formatRp(v)}${p.additionalFeeReason ? ` (${p.additionalFeeReason})` : ""}` : "-" },
];

// Fields editable for Cargo packages (and generally)
interface EditForm {
  customerName: string;
  resiNumber: string;
  packageNumber: string;
  itemName: string;
  packageDate: string;
  totalShipping: string;
  notes: string;
}

function toDateInput(d: string | null | undefined) {
  if (!d) return "";
  try { return format(new Date(d), "yyyy-MM-dd"); } catch { return ""; }
}

export default function AdminPackagesDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<EditForm>({
    customerName: "", resiNumber: "", packageNumber: "",
    itemName: "", packageDate: "", totalShipping: "", notes: "",
  });

  const { data: pkg, isLoading } = useGetPackage(id, { query: { queryKey: ["package", id], enabled: !!id } });

  const isKargo = (pkg?.serviceType || "").toLowerCase() === "jastip kargo";
  const isLocked = pkg?.status === "diserahkan" || (pkg as any)?.statusPengambilan === "SUDAH_DIAMBIL";

  function startEdit() {
    if (!pkg) return;
    setForm({
      customerName: (pkg as any).customerName || "",
      resiNumber: (pkg as any).resiNumber || "",
      packageNumber: (pkg as any).packageNumber || "",
      itemName: (pkg as any).itemName || "",
      packageDate: toDateInput((pkg as any).packageDate),
      totalShipping: (pkg as any).totalShipping != null ? String((pkg as any).totalShipping) : "",
      notes: (pkg as any).notes || "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const body: any = {
        customerName: form.customerName,
        resiNumber: form.resiNumber,
        packageNumber: form.packageNumber || null,
        itemName: form.itemName || null,
        packageDate: form.packageDate || null,
        notes: form.notes || null,
      };
      if (isKargo && form.totalShipping !== "") {
        body.totalShipping = Number(form.totalShipping);
      }

      const token = localStorage.getItem("jaj_token");
      const res = await fetch(`/api/packages/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Gagal menyimpan");
      }
      await queryClient.invalidateQueries({ queryKey: getGetPackageQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
      setEditing(false);
      toast({ title: "Tersimpan", description: "Data paket berhasil diperbarui." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal menyimpan", description: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function deletePackage() {
    setDeleting(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const res = await fetch(`/api/packages/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Gagal menghapus");
      }
      await queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      toast({ title: "Paket dihapus" });
      setLocation(`/admin/barcode/batch/${(pkg as any).batchId}`);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal menghapus", description: e.message });
      setDeleting(false);
    }
  }

  if (isLoading) return <div className="p-12 text-center animate-pulse text-muted-foreground">Memuat detail paket...</div>;
  if (!pkg) return <div className="p-12 text-center text-destructive">Paket tidak ditemukan.</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 print:hidden">
        <Button variant="outline" size="icon" onClick={() => setLocation("/admin/packages")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Detail Paket</h1>
          <p className="text-muted-foreground mt-1 font-mono">{(pkg as any).resiNumber}</p>
        </div>
        {!editing ? (
          <div className="flex gap-2">
            {!isLocked && (
              <Button variant="outline" onClick={startEdit} className="gap-2">
                <Pencil className="w-4 h-4" /> Edit
              </Button>
            )}
            {isOwner && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="gap-2 border-red-300 text-red-600 hover:bg-red-50">
                    <Trash2 className="w-4 h-4" /> Hapus
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-500" /> Hapus paket ini?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Data paket <span className="font-semibold">{(pkg as any).resiNumber}</span> akan dihapus permanen dan tidak bisa dikembalikan.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={deletePackage}
                      disabled={deleting}
                    >
                      {deleting ? "Menghapus..." : "Ya, Hapus"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              <X className="w-4 h-4 mr-2" /> Batal
            </Button>
            <Button onClick={saveEdit} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" /> {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left: info */}
        <div className="md:col-span-2 space-y-4">

          {/* Customer Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informasi Konsumen</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <Label>Nama Konsumen</Label>
                    <Input className="mt-1" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Nama Konsumen</div>
                      <div className="font-semibold text-base">{(pkg as any).customerName || "-"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Phone className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Nomor Telepon</div>
                      <div className="font-semibold text-base">{(pkg as any).customerPhone || "-"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Status</div>
                      <div className="mt-1"><StatusBadge status={(pkg as any).status} /></div>
                    </div>
                  </div>
                </div>
              )}
              {!editing && (pkg as any).pickedUpAt && (
                <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                  Diambil pada: <span className="text-foreground font-medium">{format(new Date((pkg as any).pickedUpAt), "dd MMM yyyy, HH:mm", { locale: localeId })}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Edit Form / Data Table */}
          {editing ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Edit Data Paket</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>No. Resi</Label>
                    <Input className="mt-1 font-mono" value={form.resiNumber} onChange={e => setForm(f => ({ ...f, resiNumber: e.target.value }))} />
                  </div>
                  <div>
                    <Label>No. Paket</Label>
                    <Input className="mt-1 font-mono" value={form.packageNumber} onChange={e => setForm(f => ({ ...f, packageNumber: e.target.value }))} placeholder="Opsional" />
                  </div>
                  <div>
                    <Label>Tanggal</Label>
                    <Input className="mt-1" type="date" value={form.packageDate} onChange={e => setForm(f => ({ ...f, packageDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Jenis Barang</Label>
                    <Input className="mt-1" value={form.itemName} onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} placeholder="Opsional" />
                  </div>
                  {isKargo && (
                    <div>
                      <Label>Ongkir/M3 (Rp)</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        min={0}
                        value={form.totalShipping}
                        onChange={e => setForm(f => ({ ...f, totalShipping: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  )}
                  <div className="col-span-2">
                    <Label>Catatan</Label>
                    <Input className="mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opsional" />
                  </div>
                </div>
                {!isKargo && (
                  <p className="text-xs text-muted-foreground">Untuk mengubah berat dan ongkir, gunakan halaman manajemen paket.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Data Paket</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase">Field</th>
                        <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase">Nilai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {READ_FIELDS.map(({ label, key, format: fmt }, idx) => {
                        const val = (pkg as any)[key];
                        const display = fmt ? fmt(val, pkg) : (val ?? "-");
                        return (
                          <tr key={key} className={`border-b ${idx % 2 === 0 ? "" : "bg-muted/20"}`}>
                            <td className="py-2.5 px-4 text-muted-foreground font-medium whitespace-nowrap">{label}</td>
                            <td className={`py-2.5 px-4 font-medium ${key === "totalShipping" ? "text-primary font-bold" : ""} ${key === "resiNumber" || key === "packageNumber" ? "font-mono" : ""}`}>
                              {display}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Barcode */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Label Barcode</CardTitle>
            </CardHeader>
            <CardContent>
              <BarcodeDisplay value={(pkg as any).barcode || (pkg as any).resiNumber} pkg={pkg} />
              <div className="mt-4 text-center">
                <div className="text-xs text-muted-foreground">Kode Barcode</div>
                <div className="font-mono font-bold text-sm mt-1 break-all">{(pkg as any).barcode}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dibuat</span>
                  <span className="font-medium">{formatDate((pkg as any).createdAt)}</span>
                </div>
                {(pkg as any).adminName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Admin Input</span>
                    <span className="font-medium">{(pkg as any).adminName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Jenis Barang</span>
                  <span className="font-medium text-right">{(pkg as any).itemName || "-"}</span>
                </div>
                {isKargo && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ongkir/M3</span>
                    <span className="font-bold text-primary">{formatRp((pkg as any).totalShipping)}</span>
                  </div>
                )}
                {isLocked && (
                  <p className="text-xs text-amber-600 pt-1 border-t">Paket sudah diserahkan — tidak dapat diedit.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
