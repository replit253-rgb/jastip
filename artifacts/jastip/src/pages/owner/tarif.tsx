import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Settings, Save, Loader2, Plane, Ship, Package, Truck, History, Plus, Trash2, RefreshCw, CheckCircle2, Info, ArrowRight,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PelniTier {
  maxKg: number | "";
  rate: number | "";
}

interface TarifData {
  pesawatRate?: number;
  hematRate?: number;
  kargoRate?: number;
  pelniTiersJakarta?: PelniTier[];
  pelniTiersSurabaya?: PelniTier[];
}

interface ShippingMinimumRow {
  id: number;
  serviceId: number;
  serviceName: string;
  serviceLabel: string;
  originCity: string;
  enabled: boolean;
  minimumAmount: number;
  updatedAt: string;
}

interface HistoryRow {
  id: number;
  jenisJastip: string;
  tarifLama: string | null;
  tarifBaru: string;
  alasan: string | null;
  namaUbah: string | null;
  createdAt: string;
}

// ── Default tiers ─────────────────────────────────────────────────────────────
const DEFAULT_TIERS_JKT: PelniTier[] = [
  { maxKg: 10.1, rate: 20000 },
  { maxKg: 20.1, rate: 19000 },
  { maxKg: 40.1, rate: 18000 },
  { maxKg: 80.1, rate: 17000 },
  { maxKg: 999999, rate: 16000 },
];
const DEFAULT_TIERS_SBY: PelniTier[] = [
  { maxKg: 10, rate: 18000 },
  { maxKg: 20, rate: 17000 },
  { maxKg: 40, rate: 16000 },
  { maxKg: 999999, rate: 15500 },
];

function authHeaders() {
  const token = localStorage.getItem("jaj_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function formatRp(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "-";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function parseTiers(raw: any, defaults: PelniTier[]): PelniTier[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((t: any) => ({ maxKg: Number(t.maxKg), rate: Number(t.rate) }));
  }
  return defaults;
}

// ── Tier Editor Component ─────────────────────────────────────────────────────
function TierEditor({ tiers, onChange }: { tiers: PelniTier[]; onChange: (t: PelniTier[]) => void }) {
  function updateTier(i: number, field: keyof PelniTier, val: string) {
    const updated = tiers.map((t, idx) => {
      if (idx !== i) return t;
      return { ...t, [field]: val === "" ? "" : Number(val) };
    });
    onChange(updated);
  }

  function addTier() {
    onChange([...tiers, { maxKg: "", rate: "" }]);
  }

  function removeTier(i: number) {
    onChange(tiers.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr,1fr,auto] gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
        <span>Maks Berat (Kg)</span>
        <span>Tarif/Kg (Rp)</span>
        <span></span>
      </div>
      {tiers.map((tier, i) => (
        <div key={i} className="grid grid-cols-[1fr,1fr,auto] gap-2 items-center">
          <Input
            type="number"
            step="0.1"
            placeholder="Contoh: 10.1"
            value={tier.maxKg === 999999 ? "" : tier.maxKg}
            onChange={(e) => updateTier(i, "maxKg", e.target.value || (i === tiers.length - 1 ? "999999" : ""))}
            className="text-sm"
          />
          <Input
            type="number"
            step="500"
            placeholder="Contoh: 20000"
            value={tier.rate}
            onChange={(e) => updateTier(i, "rate", e.target.value)}
            className="text-sm font-medium"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive"
            onClick={() => removeTier(i)}
            disabled={tiers.length <= 1}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">* Baris terakhir berlaku untuk semua berat di atasnya (isi bebas atau kosongkan kolom Maks Berat)</p>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={addTier}>
        <Plus className="w-3.5 h-3.5" /> Tambah Tier
      </Button>
    </div>
  );
}

// ── Minimum Rounding Control Component ───────────────────────────────────────
function MinimumRoundingControl({
  row,
  onUpdate,
  exampleNote,
}: {
  row?: ShippingMinimumRow;
  onUpdate: (id: number, key: "enabled" | "minimumAmount", val: any) => void;
  exampleNote?: string;
}) {
  if (!row) return null;

  return (
    <div
      className={`rounded-xl border p-4 transition-all space-y-3 ${
        row.enabled
          ? "bg-primary/5 border-primary/30 shadow-2xs"
          : "bg-muted/20 border-border/80"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-border/60">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">Pembulatan Otomatis Minimal</span>
            <Badge variant="outline" className="text-[11px] bg-background font-normal">
              {row.originCity} → Manokwari
            </Badge>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                row.enabled
                  ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              {row.enabled ? "AKTIF" : "NONAKTIF"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {row.enabled
              ? `Status: Total ongkir di bawah ${formatRp(row.minimumAmount)} otomatis dibulatkan ke ${formatRp(row.minimumAmount)}.`
              : "Status: Pembulatan nonaktif (ongkir dihitung murni sesuai kalkulasi tarif)."
            }
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto bg-background px-3 py-1.5 rounded-lg border">
          <Switch
            id={`switch-min-${row.id}`}
            checked={row.enabled}
            onCheckedChange={(enabled) => onUpdate(row.id, "enabled", enabled)}
          />
          <Label htmlFor={`switch-min-${row.id}`} className="text-xs font-semibold cursor-pointer">
            {row.enabled ? "Pembulatan Aktif" : "Pembulatan Matikan"}
          </Label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr,240px] items-center">
        <div>
          <Label className="text-xs font-semibold text-foreground">
            Atur Nominal Pembulatan Otomatis Minimal (Rp)
          </Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Nominal dasar pembulatan ke atas jika total kalkulasi harga berada di bawah angka ini.
          </p>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
            Rp
          </span>
          <Input
            type="number"
            min="0"
            step="1000"
            className="pl-9 h-9 font-semibold"
            value={row.minimumAmount}
            disabled={!row.enabled}
            onChange={(e) => {
              const val = e.target.value === "" ? 0 : Number(e.target.value);
              onUpdate(row.id, "minimumAmount", val);
            }}
            placeholder="Contoh: 10000"
          />
        </div>
      </div>

      {exampleNote && (
        <div className="text-[11px] text-muted-foreground bg-background/80 p-2.5 rounded-lg border border-border/50 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <span>{exampleNote}</span>
        </div>
      )}
    </div>
  );
}

// ── History Modal ─────────────────────────────────────────────────────────────
function HistoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/settings/history", { headers: authHeaders() })
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open]);

  function formatTarif(val: string | null) {
    if (!val) return "-";
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed.map((t: any) => `≤${t.maxKg}kg→Rp${Number(t.rate).toLocaleString("id-ID")}`).join(" | ");
      }
      if (typeof parsed === "object" && parsed !== null && "minimumAmount" in parsed) {
        return `${parsed.enabled ? "AKTIF" : "NONAKTIF"} (Rp ${Number(parsed.minimumAmount).toLocaleString("id-ID")})`;
      }
    } catch {}
    return isNaN(Number(val)) ? val : `Rp ${Number(val).toLocaleString("id-ID")}`;
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" /> Riwayat Perubahan Harga & Pembulatan
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Memuat...</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Belum ada riwayat perubahan.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Layanan / Jenis</TableHead>
                  <TableHead>Harga / Status Lama</TableHead>
                  <TableHead>Harga / Status Baru</TableHead>
                  <TableHead>Alasan</TableHead>
                  <TableHead>Diubah Oleh</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="font-medium text-xs">{r.jenisJastip}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatTarif(r.tarifLama)}</TableCell>
                    <TableCell className="text-xs font-semibold">{formatTarif(r.tarifBaru)}</TableCell>
                    <TableCell className="text-xs">{r.alasan || "-"}</TableCell>
                    <TableCell className="text-xs">{r.namaUbah || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OwnerTarif() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [alasan, setAlasan] = useState("");

  // Aktif tarif saat ini (untuk badge display)
  const [activePesawatRate, setActivePesawatRate] = useState<number | null>(null);
  const [activeHematRate, setActiveHematRate] = useState<number | null>(null);
  const [activeKargoRate, setActiveKargoRate] = useState<number | null>(null);

  // State input tarif baru
  const [pesawatRate, setPesawatRate] = useState<string>("");
  const [hematRate, setHematRate] = useState<string>("");
  const [kargoRate, setKargoRate] = useState<string>("");
  const [pelniTiersJakarta, setPelniTiersJakarta] = useState<PelniTier[]>(DEFAULT_TIERS_JKT);
  const [pelniTiersSurabaya, setPelniTiersSurabaya] = useState<PelniTier[]>(DEFAULT_TIERS_SBY);
  const [shippingMinimums, setShippingMinimums] = useState<ShippingMinimumRow[]>([]);
  const [isRecalculatingKargo, setIsRecalculatingKargo] = useState(false);

  // Tab state untuk Pelni
  const [pelniTab, setPelniTab] = useState<"jakarta" | "surabaya">("jakarta");

  function getMinRow(serviceName: string, originCity?: string) {
    return shippingMinimums.find((r) => {
      const matchName = (r.serviceName || "").toLowerCase() === serviceName.toLowerCase();
      if (!originCity) return matchName;
      return matchName && (r.originCity || "").toLowerCase() === originCity.toLowerCase();
    });
  }

  function handleUpdateMinimum(id: number, key: "enabled" | "minimumAmount", val: any) {
    setShippingMinimums((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [key]: val } : item))
    );
  }

  async function handleRecalcKargo() {
    setIsRecalculatingKargo(true);
    try {
      const res = await fetch("/api/packages/recalculate-kargo", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ defaultRate: kargoRate ? Number(kargoRate) : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghitung ulang");
      toast({
        title: "Hitung Ulang Kargo Selesai",
        description: data.message || `Berhasil memperbarui ${data.updatedCount} paket Kargo.`,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gagal", description: err.message });
    } finally {
      setIsRecalculatingKargo(false);
    }
  }

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setIsLoading(true);
    try {
      const [settingsRes, minimumRes] = await Promise.all([
        fetch("/api/settings", { headers: authHeaders() }),
        fetch("/api/settings/shipping-minimum", { headers: authHeaders() }),
      ]);
      if (!settingsRes.ok || !minimumRes.ok) throw new Error("Gagal memuat");
      const d: TarifData = await settingsRes.json();
      const minimumRows: ShippingMinimumRow[] = await minimumRes.json();

      if (d.pesawatRate) {
        setPesawatRate(String(d.pesawatRate));
        setActivePesawatRate(d.pesawatRate);
      }
      if (d.hematRate) {
        setHematRate(String(d.hematRate));
        setActiveHematRate(d.hematRate);
      }
      if (d.kargoRate) {
        setKargoRate(String(d.kargoRate));
        setActiveKargoRate(d.kargoRate);
      }

      setPelniTiersJakarta(parseTiers(d.pelniTiersJakarta, DEFAULT_TIERS_JKT));
      setPelniTiersSurabaya(parseTiers(d.pelniTiersSurabaya, DEFAULT_TIERS_SBY));
      setShippingMinimums(minimumRows);
    } catch {
      toast({ variant: "destructive", title: "Gagal memuat tarif" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveAll() {
    const pRate = Number(pesawatRate);
    const hRate = Number(hematRate);
    const kRate = Number(kargoRate);

    if (pesawatRate && (isNaN(pRate) || pRate <= 0)) {
      toast({ variant: "destructive", title: "Tarif Pesawat tidak valid" }); return;
    }
    if (hematRate && (isNaN(hRate) || hRate <= 0)) {
      toast({ variant: "destructive", title: "Tarif Hemat tidak valid" }); return;
    }
    if (kargoRate && (isNaN(kRate) || kRate <= 0)) {
      toast({ variant: "destructive", title: "Tarif Kargo tidak valid" }); return;
    }

    if (shippingMinimums.some((row) => !Number.isInteger(Number(row.minimumAmount)) || Number(row.minimumAmount) < 0)) {
      toast({ variant: "destructive", title: "Nominal minimum pembulatan tidak valid" });
      return;
    }

    setIsSaving(true);
    try {
      // 1. Save main rates
      const payload: Record<string, any> = { _alasan: alasan };
      if (pesawatRate) payload.pesawatRate = pRate;
      if (hematRate) payload.hematRate = hRate;
      if (kargoRate) payload.kargoRate = kRate;

      const normJkt = pelniTiersJakarta.map((t, i) => ({
        maxKg: (i === pelniTiersJakarta.length - 1 || !t.maxKg) ? 999999 : Number(t.maxKg),
        rate: Number(t.rate) || 0,
      }));
      const normSby = pelniTiersSurabaya.map((t, i) => ({
        maxKg: (i === pelniTiersSurabaya.length - 1 || !t.maxKg) ? 999999 : Number(t.maxKg),
        rate: Number(t.rate) || 0,
      }));
      payload.pelniTiersJakarta = normJkt;
      payload.pelniTiersSurabaya = normSby;

      const resRates = await fetch("/api/settings", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!resRates.ok) throw new Error("Gagal menyimpan tarif utama");

      // 2. Save shipping minimums
      const resMin = await fetch("/api/settings/shipping-minimum", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          _alasan: alasan,
          settings: shippingMinimums.map((row) => ({
            serviceId: row.serviceId,
            originCity: row.originCity,
            enabled: row.enabled,
            minimumAmount: Number(row.minimumAmount),
          })),
        }),
      });
      if (!resMin.ok) throw new Error("Gagal menyimpan pembulatan otomatis");

      toast({
        title: "✓ Tarif & Pembulatan Otomatis Berhasil Disimpan",
        description: "Perubahan berlaku untuk paket baru yang diinput setelah ini.",
      });
      setAlasan("");
      fetchSettings();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Gagal menyimpan data",
        description: err?.message || "Terjadi kesalahan saat menyimpan data.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> Memuat pengaturan tarif & pembulatan...
      </div>
    );
  }

  const pesawatMinRow = getMinRow("jastip pesawat", "Jakarta");
  const hematMinRow = getMinRow("jastip hemat+", "Surabaya");
  const kargoMinJkt = getMinRow("jastip kargo", "Jakarta");
  const kargoMinSby = getMinRow("jastip kargo", "Surabaya");
  const pelniMinJkt = getMinRow("jastip pelni", "Jakarta");
  const pelniMinSby = getMinRow("jastip pelni", "Surabaya");

  return (
    <div className="space-y-6 max-w-3xl pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            Pengaturan Tarif & Pembulatan Otomatis Jastip
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Kelola tarif dasar saat ini, tarif baru, serta batas nominal pembulatan otomatis minimal untuk setiap jenis jastip.
          </p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => setShowHistory(true)}>
          <History className="w-4 h-4 text-primary" /> Riwayat Perubahan
        </Button>
      </div>

      {/* ── CARD 1: Jastip Pesawat ────────────────────────────────────────── */}
      <Card className="border-blue-200/80 shadow-xs">
        <CardHeader className="pb-3 border-b bg-blue-50/50 dark:bg-blue-950/20">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2 text-blue-950 dark:text-blue-100">
              <Plane className="w-5 h-5 text-blue-600" /> Jastip Pesawat
            </CardTitle>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 border-blue-200">
              Jakarta → Manokwari
            </Badge>
          </div>
          <CardDescription>
            Pengiriman via udara. Pembulatan berat: ≤0,20 kg→0,20 | ≤0,40→0,40 | ≤0,50→0,50 | &gt;0,50 kg asli.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Section Tarif Dasar */}
          <div className="space-y-2 p-3.5 rounded-xl bg-muted/30 border">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">1. Tarif Per Kg</Label>
              {activePesawatRate && (
                <div className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-300 font-semibold bg-blue-50 dark:bg-blue-900/40 px-2.5 py-1 rounded-md border border-blue-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  Tarif Aktif Saat Ini: {formatRp(activePesawatRate)} / kg
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-1">
              <Label className="text-xs">Atur Tarif Baru (Rp / kg)</Label>
              <div className="relative max-w-sm">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
                <Input
                  type="number" step="1000" min="0"
                  placeholder="Contoh: 77000"
                  className="pl-9 font-semibold"
                  value={pesawatRate}
                  onChange={(e) => setPesawatRate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section Pembulatan Otomatis */}
          <MinimumRoundingControl
            row={pesawatMinRow}
            onUpdate={handleUpdateMinimum}
            exampleNote="Contoh: Jika total kalkulasi ongkir paket pesawat dibawah batas minimal (misal Rp 10.000), harganya otomatis dibulatkan ke batas minimal yang diaktifkan."
          />
        </CardContent>
      </Card>

      {/* ── CARD 2: Jastip Hemat+ ────────────────────────────────────────── */}
      <Card className="border-green-200/80 shadow-xs">
        <CardHeader className="pb-3 border-b bg-green-50/50 dark:bg-green-950/20">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2 text-green-950 dark:text-green-100">
              <Package className="w-5 h-5 text-green-600" /> Jastip Hemat+
            </CardTitle>
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200 border-green-200">
              Surabaya → Manokwari
            </Badge>
          </div>
          <CardDescription>
            Pengiriman laut ekonomis flat per kg (minimal 1 kg per pengiriman).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Section Tarif Dasar */}
          <div className="space-y-2 p-3.5 rounded-xl bg-muted/30 border">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">1. Tarif Per Kg</Label>
              {activeHematRate && (
                <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-300 font-semibold bg-green-50 dark:bg-green-900/40 px-2.5 py-1 rounded-md border border-green-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  Tarif Aktif Saat Ini: {formatRp(activeHematRate)} / kg
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-1">
              <Label className="text-xs">Atur Tarif Baru (Rp / kg)</Label>
              <div className="relative max-w-sm">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
                <Input
                  type="number" step="500" min="0"
                  placeholder="Contoh: 10000"
                  className="pl-9 font-semibold"
                  value={hematRate}
                  onChange={(e) => setHematRate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section Pembulatan Otomatis */}
          <MinimumRoundingControl
            row={hematMinRow}
            onUpdate={handleUpdateMinimum}
            exampleNote="Contoh Kasus: Paket Anton dihitung total ongkirnya Rp 5.000 untuk Jastip Hemat. Jika pembulatan otomatis diaktifkan sebesar Rp 10.000, maka berapapun harga dibawah Rp 10.000 (seperti 1k, 5k) akan otomatis dibulatkan ke Rp 10.000."
          />
        </CardContent>
      </Card>

      {/* ── CARD 3: Jastip Kargo ────────────────────────────────────────── */}
      <Card className="border-orange-200/80 shadow-xs">
        <CardHeader className="pb-3 border-b bg-orange-50/50 dark:bg-orange-950/20">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2 text-orange-950 dark:text-orange-100">
              <Truck className="w-5 h-5 text-orange-600" /> Jastip Kargo
            </CardTitle>
            <div className="flex gap-1.5">
              <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200 border-orange-200 text-[11px]">
                Jakarta → Manokwari
              </Badge>
              <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200 border-orange-200 text-[11px]">
                Surabaya → Manokwari
              </Badge>
            </div>
          </div>
          <CardDescription>
            Pengiriman barang besar / kontainer berdasarkan MAX(M³, Ton) × tarif.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Section Tarif Dasar */}
          <div className="space-y-3 p-3.5 rounded-xl bg-muted/30 border">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">1. Tarif Default per M³ / Ton</Label>
              {activeKargoRate && (
                <div className="flex items-center gap-1.5 text-xs text-orange-700 dark:text-orange-300 font-semibold bg-orange-50 dark:bg-orange-900/40 px-2.5 py-1 rounded-md border border-orange-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-orange-600" />
                  Tarif Aktif Saat Ini: {formatRp(activeKargoRate)} / M³
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-1">
              <Label className="text-xs">Atur Tarif Baru (Rp / M³ / Ton)</Label>
              <div className="relative max-w-sm">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
                <Input
                  type="number" step="1000" min="0"
                  placeholder="Contoh: 7000"
                  className="pl-9 font-semibold"
                  value={kargoRate}
                  onChange={(e) => setKargoRate(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Kalkulasi ulang seluruh paket Kargo tersimpan menggunakan tarif ini:
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRecalcKargo}
                disabled={isRecalculatingKargo}
                className="border-orange-300 text-orange-700 hover:bg-orange-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRecalculatingKargo ? "animate-spin" : ""}`} />
                {isRecalculatingKargo ? "Menghitung Ulang..." : "Hitung Ulang Semua Paket Kargo"}
              </Button>
            </div>
          </div>

          {/* Section Pembulatan Otomatis Per Rute */}
          <div className="space-y-3">
            <Label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider block">
              2. Pembulatan Otomatis Per Rute Kargo
            </Label>
            <MinimumRoundingControl
              row={kargoMinJkt}
              onUpdate={handleUpdateMinimum}
            />
            <MinimumRoundingControl
              row={kargoMinSby}
              onUpdate={handleUpdateMinimum}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── CARD 4: Jastip Pelni ────────────────────────────────────────── */}
      <Card className="border-indigo-200/80 shadow-xs">
        <CardHeader className="pb-3 border-b bg-indigo-50/50 dark:bg-indigo-950/20">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2 text-indigo-950 dark:text-indigo-100">
              <Ship className="w-5 h-5 text-indigo-600" /> Jastip Pelni
            </CardTitle>
            <div className="flex gap-1.5">
              <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200 border-indigo-200 text-[11px]">
                Tarif Bertingkat (Tiers)
              </Badge>
            </div>
          </div>
          <CardDescription>
            Harga bertingkat per-kg berdasarkan total berat gabungan konsumen dalam 1 batch.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-5">
          {/* Tabs Rute */}
          <div className="space-y-3 p-3.5 rounded-xl bg-muted/30 border">
            <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
              <Label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                1. Atur Tarif Bertingkat Per Rute
              </Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant={pelniTab === "jakarta" ? "default" : "outline"}
                  onClick={() => setPelniTab("jakarta")}
                  className="h-8 text-xs"
                >
                  Jakarta → Manokwari
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant={pelniTab === "surabaya" ? "default" : "outline"}
                  onClick={() => setPelniTab("surabaya")}
                  className="h-8 text-xs"
                >
                  Surabaya → Manokwari
                </Button>
              </div>
            </div>

            {pelniTab === "jakarta" ? (
              <TierEditor tiers={pelniTiersJakarta} onChange={setPelniTiersJakarta} />
            ) : (
              <TierEditor tiers={pelniTiersSurabaya} onChange={setPelniTiersSurabaya} />
            )}
          </div>

          {/* Section Pembulatan Otomatis Per Rute Pelni */}
          <div className="space-y-3">
            <Label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider block">
              2. Pembulatan Otomatis Per Rute Pelni
            </Label>
            <MinimumRoundingControl
              row={pelniMinJkt}
              onUpdate={handleUpdateMinimum}
              exampleNote="Rute Jakarta: Bila total ongkir kelompok konsumen Pelni di bawah nominal minimal, harganya dibulatkan ke nominal ini."
            />
            <MinimumRoundingControl
              row={pelniMinSby}
              onUpdate={handleUpdateMinimum}
              exampleNote="Rute Surabaya: Bila total ongkir kelompok konsumen Pelni di bawah nominal minimal, harganya dibulatkan ke nominal ini."
            />
          </div>
        </CardContent>
      </Card>

      {/* ── CARD 5: Save Section ────────────────────────────────────────── */}
      <Card className="border-primary/30 shadow-md">
        <CardContent className="pt-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="font-semibold">Alasan Perubahan <span className="text-muted-foreground font-normal">(opsional)</span></Label>
            <Input
              placeholder="Contoh: Penyesuaian tarif operasional & pembulatan minimal baru..."
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
            />
          </div>

          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-3.5 text-xs text-amber-800 dark:text-amber-300 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              Catatan Penting Perubahan:
            </div>
            <p className="pl-5">
              Perubahan tarif dan aturan pembulatan otomatis <strong>hanya berlaku untuk paket baru</strong> yang diinput setelah perubahan disimpan. Paket yang sudah ada tidak akan berubah secara otomatis.
            </p>
          </div>

          <Button onClick={handleSaveAll} disabled={isSaving} className="w-full sm:w-auto h-11 px-6 text-sm font-semibold gap-2 shadow-sm">
            {isSaving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan Semua Tarif & Pembulatan...</>
            ) : (
              <><Save className="w-4 h-4" /> Simpan Perubahan Tarif & Pembulatan Otomatis</>
            )}
          </Button>
        </CardContent>
      </Card>

      <HistoryModal open={showHistory} onClose={() => setShowHistory(false)} />
    </div>
  );
}
