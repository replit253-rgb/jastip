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
  Settings, Save, Loader2, Plane, Ship, Package, Truck, History, Plus, Trash2,
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
  if (n == null) return "-";
  return `Rp ${n.toLocaleString("id-ID")}`;
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
            className="text-sm"
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
    } catch {}
    return isNaN(Number(val)) ? val : `Rp ${Number(val).toLocaleString("id-ID")}`;
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" /> Riwayat Perubahan Harga
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
                  <TableHead>Layanan</TableHead>
                  <TableHead>Harga Lama</TableHead>
                  <TableHead>Harga Baru</TableHead>
                  <TableHead>Alasan</TableHead>
                  <TableHead>Diubah Oleh</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="font-medium">{r.jenisJastip}</TableCell>
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
  const [isSavingMinimum, setIsSavingMinimum] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [alasan, setAlasan] = useState("");

  // State untuk setiap tarif
  const [pesawatRate, setPesawatRate] = useState<string>("");
  const [hematRate, setHematRate] = useState<string>("");
  const [kargoRate, setKargoRate] = useState<string>("");
  const [pelniTiersJakarta, setPelniTiersJakarta] = useState<PelniTier[]>(DEFAULT_TIERS_JKT);
  const [pelniTiersSurabaya, setPelniTiersSurabaya] = useState<PelniTier[]>(DEFAULT_TIERS_SBY);
  const [shippingMinimums, setShippingMinimums] = useState<ShippingMinimumRow[]>([]);

  // Tab state untuk Pelni
  const [pelniTab, setPelniTab] = useState<"jakarta" | "surabaya">("jakarta");

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
      if (d.pesawatRate) setPesawatRate(String(d.pesawatRate));
      if (d.hematRate) setHematRate(String(d.hematRate));
      if (d.kargoRate) setKargoRate(String(d.kargoRate));
      setPelniTiersJakarta(parseTiers(d.pelniTiersJakarta, DEFAULT_TIERS_JKT));
      setPelniTiersSurabaya(parseTiers(d.pelniTiersSurabaya, DEFAULT_TIERS_SBY));
      setShippingMinimums(minimumRows);
    } catch {
      toast({ variant: "destructive", title: "Gagal memuat tarif" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveMinimums() {
    if (shippingMinimums.some((row) => !Number.isInteger(Number(row.minimumAmount)) || Number(row.minimumAmount) < 0)) {
      toast({ variant: "destructive", title: "Nominal minimum tidak valid" });
      return;
    }
    setIsSavingMinimum(true);
    try {
      const res = await fetch("/api/settings/shipping-minimum", {
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
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "Gagal menyimpan");
      }
      setShippingMinimums(await res.json());
      toast({
        title: "✓ Harga minimum berhasil disimpan",
        description: "Pengaturan hanya berlaku untuk paket baru; toggle awal tetap OFF.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal menyimpan harga minimum",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsSavingMinimum(false);
    }
  }

  async function handleSave() {
    // Validate
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

    const payload: Record<string, any> = { _alasan: alasan };
    if (pesawatRate) payload.pesawatRate = pRate;
    if (hematRate) payload.hematRate = hRate;
    if (kargoRate) payload.kargoRate = kRate;

    // Normalize tiers: set last tier maxKg to 999999
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

    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      toast({ title: "✓ Tarif berhasil disimpan", description: "Harga baru berlaku untuk paket yang diinput setelah perubahan ini." });
      setAlasan("");
      fetchSettings();
    } catch {
      toast({ variant: "destructive", title: "Gagal menyimpan tarif" });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> Memuat pengaturan tarif...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            Pengaturan Harga / Tarif Jastip
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Hanya Owner yang bisa mengubah tarif. Harga baru hanya berlaku untuk paket yang diinput setelah perubahan.
          </p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => setShowHistory(true)}>
          <History className="w-4 h-4" /> Riwayat Perubahan
        </Button>
      </div>

      {/* Pesawat */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plane className="w-4 h-4 text-blue-500" /> Jastip Pesawat
          </CardTitle>
          <CardDescription>Tarif per kg — Jakarta → Manokwari. Pembulatan berat: ≤0,20 kg→0,20 | ≤0,40→0,40 | ≤0,50→0,50</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tarif per Kg</Label>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
              <Input
                type="number" step="1000" min="0"
                placeholder="Contoh: 77000"
                className="pl-9"
                value={pesawatRate}
                onChange={(e) => setPesawatRate(e.target.value)}
              />
            </div>
            {pesawatRate && !isNaN(Number(pesawatRate)) && (
              <p className="text-xs text-muted-foreground">= <strong>{formatRp(Number(pesawatRate))}</strong> per kg</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Hemat+ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4 text-green-600" /> Jastip Hemat+
          </CardTitle>
          <CardDescription>Tarif flat per kg — Surabaya → Manokwari. Minimum 1 kg.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tarif per Kg</Label>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
              <Input
                type="number" step="500" min="0"
                placeholder="Contoh: 10000"
                className="pl-9"
                value={hematRate}
                onChange={(e) => setHematRate(e.target.value)}
              />
            </div>
            {hematRate && !isNaN(Number(hematRate)) && (
              <p className="text-xs text-muted-foreground">= <strong>{formatRp(Number(hematRate))}</strong> per kg</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Kargo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="w-4 h-4 text-orange-500" /> Jastip Kargo
          </CardTitle>
          <CardDescription>Ongkir kargo diisi manual per paket. Tarif di sini hanya sebagai panduan default.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tarif Default per M³/Ton</Label>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
              <Input
                type="number" step="1000" min="0"
                placeholder="Contoh: 7000"
                className="pl-9"
                value={kargoRate}
                onChange={(e) => setKargoRate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pelni */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Ship className="w-4 h-4 text-indigo-500" /> Jastip Pelni
          </CardTitle>
          <CardDescription>
            Harga bertingkat berdasarkan total berat gabungan konsumen dalam 1 batch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tab buttons */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={pelniTab === "jakarta" ? "default" : "outline"}
              onClick={() => setPelniTab("jakarta")}
            >
              Jakarta → Manokwari
            </Button>
            <Button
              size="sm"
              variant={pelniTab === "surabaya" ? "default" : "outline"}
              onClick={() => setPelniTab("surabaya")}
            >
              Surabaya → Manokwari
            </Button>
          </div>

          {pelniTab === "jakarta" ? (
            <TierEditor tiers={pelniTiersJakarta} onChange={setPelniTiersJakarta} />
          ) : (
            <TierEditor tiers={pelniTiersSurabaya} onChange={setPelniTiersSurabaya} />
          )}
        </CardContent>
      </Card>

      {/* Harga minimum Fase 4 */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" /> Harga Ongkir Minimum
          </CardTitle>
          <CardDescription>
            Berlaku sebagai batas total ongkir per customer dan layanan, bukan per baris paket.
            Semua toggle dimulai OFF agar ongkir existing tidak berubah.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {shippingMinimums.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nilai awal belum tersedia. Jalankan migrasi seed Fase 4 terlebih dahulu.
            </p>
          ) : (
            shippingMinimums.map((row) => (
              <div
                key={row.id}
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr,170px,auto] sm:items-center"
              >
                <div>
                  <p className="font-medium">{row.serviceLabel}</p>
                  <p className="text-xs text-muted-foreground">{row.originCity} → Manokwari</p>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
                  <Input
                    type="number"
                    min="0"
                    step="1000"
                    className="pl-9"
                    value={row.minimumAmount}
                    onChange={(event) => {
                      const value = event.target.value === "" ? 0 : Number(event.target.value);
                      setShippingMinimums((current) =>
                        current.map((item) =>
                          item.id === row.id ? { ...item, minimumAmount: value } : item,
                        ),
                      );
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={row.enabled}
                    onCheckedChange={(enabled) => {
                      setShippingMinimums((current) =>
                        current.map((item) =>
                          item.id === row.id ? { ...item, enabled } : item,
                        ),
                      );
                    }}
                    aria-label={`Aktifkan minimum ${row.serviceLabel} ${row.originCity}`}
                  />
                  <span className="text-sm font-medium">{row.enabled ? "ON" : "OFF"}</span>
                </div>
              </div>
            ))
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Perubahan dicatat di riwayat tarif dengan nilai lama, nilai baru, waktu, dan Owner.
            </p>
            <Button
              onClick={handleSaveMinimums}
              disabled={isSavingMinimum || shippingMinimums.length === 0}
              variant="outline"
              className="gap-2"
            >
              {isSavingMinimum ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
              ) : (
                <><Save className="w-4 h-4" /> Simpan Harga Minimum</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Alasan & Save */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Alasan Perubahan <span className="text-muted-foreground font-normal">(opsional)</span></Label>
            <Input
              placeholder="Contoh: Promo bulan Juli, penyesuaian operasional..."
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
            />
          </div>
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            ⚠️ Harga baru <strong>hanya berlaku untuk paket baru</strong> yang diinput setelah perubahan dilakukan. Paket lama tidak terpengaruh.
          </div>
          <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto gap-2">
            {isSaving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
            ) : (
              <><Save className="w-4 h-4" /> Simpan Semua Tarif</>
            )}
          </Button>
        </CardContent>
      </Card>

      <HistoryModal open={showHistory} onClose={() => setShowHistory(false)} />
    </div>
  );
}
