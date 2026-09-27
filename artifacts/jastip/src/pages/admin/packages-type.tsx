import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plane, Ship, Package, Truck, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useState } from "react";

function formatRp(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

const SERVICES = [
  {
    key: "jastip hemat+",
    title: "Jastip Hemat+",
    route: "Surabaya → Manokwari",
    icon: Package,
    color: "text-green-600",
    bg: "bg-green-50",
    ringColor: "ring-green-500",
    borderColor: "border-green-200",
    badgeBg: "bg-green-100 text-green-700",
    rateType: "per-kg" as const,
    rateNote: "Tarif flat Rp 10.000/kg",
    routes: [
      {
        route: "Surabaya → Manokwari",
        rates: [
          { label: "1 kg", ratePerKg: 10000, total: 10000 },
          { label: "5 kg", ratePerKg: 10000, total: 50000 },
          { label: "10 kg", ratePerKg: 10000, total: 100000 },
          { label: "20 kg", ratePerKg: 10000, total: 200000 },
        ],
        flatRate: 10000,
      },
    ],
  },
  {
    key: "jastip pesawat",
    title: "Jastip Pesawat",
    route: "Jakarta → Manokwari",
    icon: Plane,
    color: "text-blue-600",
    bg: "bg-blue-50",
    ringColor: "ring-blue-500",
    borderColor: "border-blue-200",
    badgeBg: "bg-blue-100 text-blue-700",
    rateType: "bracket" as const,
    rateNote: "Tarif per berat paket",
    routes: [
      {
        route: "Jakarta → Manokwari",
        flatRate: null,
        rates: [
          { label: "1 – 200 gram", ratePerKg: null, total: 15800 },
          { label: "201 – 400 gram", ratePerKg: null, total: 30800 },
          { label: "401 – 500 gram", ratePerKg: null, total: 38500 },
          { label: "600 gram", ratePerKg: null, total: 46200 },
          { label: "700 gram", ratePerKg: null, total: 53900 },
          { label: "800 gram", ratePerKg: null, total: 61600 },
          { label: "900 gram", ratePerKg: null, total: 69300 },
          { label: "1 kg", ratePerKg: null, total: 77000 },
          { label: "2 kg", ratePerKg: null, total: 154000 },
          { label: "3 kg", ratePerKg: null, total: 231000 },
          { label: "5 kg", ratePerKg: null, total: 385000 },
          { label: "10 kg", ratePerKg: null, total: 770000 },
        ],
      },
    ],
  },
  {
    key: "jastip kargo",
    title: "Jastip Kargo",
    route: "Jakarta / Surabaya → Manokwari",
    icon: Truck,
    color: "text-orange-600",
    bg: "bg-orange-50",
    ringColor: "ring-orange-500",
    borderColor: "border-orange-200",
    badgeBg: "bg-orange-100 text-orange-700",
    rateType: "per-kg" as const,
    rateNote: "Kargo: M³ / Ton (Tanpa Minimum)",
    routes: [
      {
        route: "Jakarta / Surabaya → Manokwari",
        flatRate: 7000,
        rates: [
          { label: "1 M³ / Ton", ratePerKg: 7000, total: 7000 },
          { label: "5 M³ / Ton", ratePerKg: 7000, total: 35000 },
          { label: "10 M³ / Ton", ratePerKg: 7000, total: 70000 },
          { label: "20 M³ / Ton", ratePerKg: 7000, total: 140000 },
        ],
      },
    ],
  },
  {
    key: "jastip pelni",
    title: "Jastip Pelni",
    route: "Jakarta / Surabaya → Manokwari",
    icon: Ship,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    ringColor: "ring-cyan-500",
    borderColor: "border-cyan-200",
    badgeBg: "bg-cyan-100 text-cyan-700",
    rateType: "tiered" as const,
    rateNote: "Tarif berjenjang per kg",
    routes: [
      {
        route: "Jakarta → Manokwari",
        flatRate: null,
        rates: [
          { label: "1 – 10 kg", ratePerKg: 20000, total: null },
          { label: "11 – 20 kg", ratePerKg: 19000, total: null },
          { label: "21 – 40 kg", ratePerKg: 18000, total: null },
          { label: "41 – 80 kg", ratePerKg: 17000, total: null },
        ],
      },
      {
        route: "Surabaya → Manokwari",
        flatRate: null,
        rates: [
          { label: "1 – 10 kg", ratePerKg: 18000, total: null },
          { label: "11 – 20 kg", ratePerKg: 17000, total: null },
          { label: "21 – 40 kg", ratePerKg: 16000, total: null },
          { label: "41 – 80 kg", ratePerKg: 15500, total: null },
        ],
      },
    ],
  },
];

export default function AdminPackagesType() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const base = user?.role === "owner" ? "/owner" : "/admin";
  const [openRates, setOpenRates] = useState<Record<string, boolean>>({});

  function navigate(serviceType: string, mode: "single" | "grup") {
    const q = new URLSearchParams({ serviceType, packageMode: mode });
    setLocation(`${base}/packages/new?${q.toString()}`);
  }

  function toggleRates(key: string) {
    setOpenRates((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setLocation(`${base}/packages`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pilih Jenis Jastip</h1>
          <p className="text-muted-foreground mt-1">Pilih jenis layanan dan mode input paket.</p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {SERVICES.map((s) => {
          const Icon = s.icon;
          const isOpen = !!openRates[s.key];
          return (
            <Card key={s.key} className={`border-2 ${s.borderColor} transition-all`}>
              {/* Header */}
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center shadow-sm shrink-0`}>
                    <Icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <div>
                    <p className="font-bold text-base">{s.title}</p>
                    <p className="text-xs font-normal text-muted-foreground">{s.route}</p>
                  </div>
                  <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${s.badgeBg}`}>
                    {s.rateType === "tiered" ? "Berjenjang" : s.rateType === "bracket" ? "Bracket" : "Flat/kg"}
                  </span>
                </CardTitle>
              </CardHeader>

              <CardContent className="pt-0 space-y-4">
                {/* Mode buttons */}
                {s.key === "jastip kargo" ? (
                  /* Kargo: hanya 1 paket per input — tidak ada Grup Paket */
                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      onClick={() => navigate(s.key, "single")}
                    >
                      Input Paket Kargo
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Setiap paket Cargo memiliki barcode sendiri
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      className="w-full"
                      onClick={() => navigate(s.key, "single")}
                    >
                      1 Paket
                    </Button>
                    <Button
                      variant="outline"
                      className={`w-full border-2 ${s.borderColor}`}
                      onClick={() => navigate(s.key, "grup")}
                    >
                      Grup Paket
                    </Button>
                  </div>
                )}

                {/* Tarif ongkir — collapsible, at bottom */}
                <div className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted/80 transition-colors text-left"
                    onClick={() => toggleRates(s.key)}
                  >
                    <span className={`text-xs font-semibold ${s.color} uppercase tracking-wide`}>
                      {s.rateNote}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="divide-y">
                      {s.routes.map((rt) => (
                        <div key={rt.route}>
                          {/* Route sub-header (only if multiple routes) */}
                          {s.routes.length > 1 && (
                            <div className="px-3 py-1.5 bg-muted/30 text-xs font-semibold text-muted-foreground border-b">
                              {rt.route}
                            </div>
                          )}
                          {/* Column header */}
                          {s.rateType === "tiered" ? (
                            <div className="grid grid-cols-3 px-3 py-1.5 bg-muted/20 text-xs font-semibold text-muted-foreground border-b">
                              <span>Berat</span>
                              <span className="text-center">Tarif/kg</span>
                              <span className="text-right">Contoh</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 px-3 py-1.5 bg-muted/20 text-xs font-semibold text-muted-foreground border-b">
                              <span>Berat Paket</span>
                              <span className="text-right">Ongkir</span>
                            </div>
                          )}
                          {/* Rows */}
                          <div className="divide-y max-h-52 overflow-y-auto text-xs">
                            {rt.rates.map((r, i) => (
                              <div
                                key={i}
                                className={`px-3 py-1.5 hover:bg-muted/20 ${s.rateType === "tiered" ? "grid grid-cols-3" : "grid grid-cols-2"}`}
                              >
                                <span className="text-muted-foreground">{r.label}</span>
                                {s.rateType === "tiered" && r.ratePerKg != null ? (
                                  <>
                                    <span className="text-center font-semibold">{formatRp(r.ratePerKg)}</span>
                                    <span className="text-right text-muted-foreground">
                                      {r.label.split(" – ")[0].replace(" kg", "")} kg = {formatRp(Number(r.label.split(" – ")[0].replace(/[^0-9]/g, "") || "1") * r.ratePerKg)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-right font-semibold">
                                    {r.total != null ? formatRp(r.total) : r.ratePerKg != null ? formatRp(r.ratePerKg) : "-"}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          {rt.flatRate != null && (
                            <div className="px-3 py-1.5 bg-muted/10 text-xs text-muted-foreground italic border-t">
                              *Berat lainnya = berat × Rp {rt.flatRate.toLocaleString("id-ID")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
