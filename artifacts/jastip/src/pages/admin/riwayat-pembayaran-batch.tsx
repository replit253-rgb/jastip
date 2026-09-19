import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useListBatches, useListPackages } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import {
  ArrowLeft,
  History,
  Ship,
  ChevronRight,
  CheckCircle2,
  Lock,
  Archive,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRp(n: any) {
  if (!n && n !== 0) return "Rp 0";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

function fmtDate(d: string) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function batchStatusColor(s: string) {
  if (s === "OPEN") return "bg-green-100 text-green-800 border-green-200";
  if (s === "CLOSED") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}
function batchStatusIcon(s: string) {
  if (s === "OPEN") return <CheckCircle2 className="w-3 h-3" />;
  if (s === "CLOSED") return <Lock className="w-3 h-3" />;
  return <Archive className="w-3 h-3" />;
}
function batchStatusLabel(s: string) {
  if (s === "OPEN") return "Aktif";
  if (s === "CLOSED") return "Ditutup";
  return "Arsip";
}

async function fetchPayments() {
  const token = localStorage.getItem("jaj_token");
  const res = await fetch("/api/payments", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Gagal memuat data pembayaran");
  return res.json();
}

const SVC_DEFS = [
  {
    key: "jastip pesawat",
    label: "Jastip Pesawat",
    border: "border-blue-200",
    bg: "bg-blue-50/60",
    num: "text-blue-700",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
  },
  {
    key: "jastip hemat+",
    label: "Jastip Hemat+",
    border: "border-emerald-200",
    bg: "bg-emerald-50/60",
    num: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  {
    key: "jastip kargo",
    label: "Jastip Kargo",
    border: "border-orange-200",
    bg: "bg-orange-50/60",
    num: "text-orange-700",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
  },
  {
    key: "jastip pelni",
    label: "Jastip Pelni",
    border: "border-indigo-200",
    bg: "bg-indigo-50/60",
    num: "text-indigo-700",
    badge: "bg-indigo-100 text-indigo-700 border-indigo-200",
  },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RiwayatPembayaranBatch({
  params,
}: {
  params: { id: string };
}) {
  const batchId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const base = user?.role === "owner" ? "/owner" : "/admin";

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: fetchPayments,
  });

  const { data: packages = [] } = useListPackages();
  const { data: batches = [] } = useListBatches();

  const pkgMap = useMemo(() => {
    const m: Record<number, any> = {};
    for (const p of packages as any[]) m[p.id] = p;
    return m;
  }, [packages]);

  const batch = useMemo(
    () => (batches as any[]).find((b) => b.id === batchId),
    [batches, batchId],
  );

  // Filter payments that belong to this batch
  const batchPayments = useMemo(() => {
    return (payments as any[]).filter((pmt) => {
      const ids: number[] = pmt.packageIds ?? [];
      const firstPkg = ids.length ? pkgMap[ids[0]] : null;
      return firstPkg?.batchId === batchId;
    });
  }, [payments, pkgMap, batchId]);

  // Group filtered payments by serviceType
  const svcGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const pmt of batchPayments) {
      const svc: string =
        pmt.packageSummary?.[0]?.serviceType ||
        (pmt.packageIds?.[0] != null
          ? pkgMap[pmt.packageIds[0]]?.serviceType
          : "") ||
        "";
      const key = svc.toLowerCase().trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(pmt);
    }
    // Build ordered list from SVC_DEFS first, then any unknowns
    const knownKeys = SVC_DEFS.map((d) => d.key);
    const result: { def: (typeof SVC_DEFS)[0]; payments: any[] }[] = [];
    for (const def of SVC_DEFS) {
      const pmts = map.get(def.key);
      if (pmts?.length) result.push({ def, payments: pmts });
    }
    // Unknown service types
    for (const [key, pmts] of map.entries()) {
      if (!knownKeys.includes(key) && pmts.length) {
        result.push({
          def: {
            key,
            label: key || "Lainnya",
            border: "border-gray-200",
            bg: "bg-gray-50/60",
            num: "text-gray-700",
            badge: "bg-gray-100 text-gray-700 border-gray-200",
          },
          payments: pmts,
        });
      }
    }
    return result;
  }, [batchPayments, pkgMap]);

  // Batch-level totals
  const totalAll = batchPayments.reduce(
    (s, p) => s + Number(p.totalAmount || 0),
    0,
  );
  const totalTunai = batchPayments
    .filter((p) => p.paymentType === "tunai")
    .reduce((s, p) => s + Number(p.totalAmount || 0), 0);
  const totalTransfer = batchPayments
    .filter((p) => p.paymentType === "transfer")
    .reduce((s, p) => s + Number(p.totalAmount || 0), 0);
  const totalPiutang = batchPayments
    .filter((p) => p.paymentType === "piutang")
    .reduce((s, p) => s + Number(p.totalAmount || 0), 0);

  const PAGE_SIZE = 8;
  const [page, setPage] = useState(1);
  const total = svcGroups.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const paginatedSvcGroups = svcGroups.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  function goDetail(serviceTypeKey: string) {
    setLocation(
      `${base}/riwayat-pembayaran/batch/${batchId}/detail?serviceType=${encodeURIComponent(serviceTypeKey)}`,
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setLocation(`${base}/riwayat-pembayaran`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className={`p-1.5 rounded-lg ${batch?.statusBatch === "OPEN" ? "bg-blue-100" : "bg-gray-100"}`}
            >
              <Ship
                className={`w-5 h-5 ${batch?.statusBatch === "OPEN" ? "text-blue-700" : "text-gray-500"}`}
              />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {batch?.namaKapal || `Batch #${batchId}`}
            </h1>
            {batch && (
              <Badge
                variant="outline"
                className={`flex items-center gap-1 text-xs ${batchStatusColor(batch.statusBatch)}`}
              >
                {batchStatusIcon(batch.statusBatch)}
                {batchStatusLabel(batch.statusBatch)}
              </Badge>
            )}
          </div>
          {batch && (
            <p className="text-sm text-muted-foreground mt-1">
              {batch.kotaAsal} → {batch.tujuan}
              &nbsp;·&nbsp; ETD: {fmtDate(batch.etd)}
              &nbsp;·&nbsp; Closing: {fmtDate(batch.periodeClosingMulai)} –{" "}
              {fmtDate(batch.periodeClosingSelesai)}
            </p>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="font-semibold text-foreground">
              {batchPayments.length} transaksi
            </span>
          </p>
        </div>
      </div>

      {/* Batch-level summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Total Semua",
            value: totalAll,
            color: "text-primary",
            bg: "bg-primary/5 border-primary/20",
          },
          {
            label: "Tunai",
            value: totalTunai,
            color: "text-green-700",
            bg: "bg-green-50 border-green-200",
          },
          {
            label: "Transfer",
            value: totalTransfer,
            color: "text-blue-700",
            bg: "bg-blue-50 border-blue-200",
          },
          {
            label: "Piutang",
            value: totalPiutang,
            color: "text-orange-700",
            bg: "bg-orange-50 border-orange-200",
          },
        ].map((s) => (
          <Card key={s.label} className={`border ${s.bg}`}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                {s.label}
              </p>
              <p className={`text-xl font-black mt-1 ${s.color}`}>
                {formatRp(s.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Jenis Jastip cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-48 pt-4 bg-muted/20" />
            </Card>
          ))}
        </div>
      ) : svcGroups.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <History className="w-14 h-14 mx-auto mb-4 opacity-20" />
          <p className="font-semibold">Belum ada pembayaran di batch ini</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {paginatedSvcGroups.map(({ def, payments: pmts }) => {
              const total = pmts.reduce(
                (s: number, p: any) => s + Number(p.totalAmount || 0),
                0,
              );
              const tunai = pmts
                .filter((p: any) => p.paymentType === "tunai")
                .reduce((s: number, p: any) => s + Number(p.totalAmount || 0), 0);
              const transfer = pmts
                .filter((p: any) => p.paymentType === "transfer")
                .reduce((s: number, p: any) => s + Number(p.totalAmount || 0), 0);
              const piutang = pmts
                .filter((p: any) => p.paymentType === "piutang")
                .reduce((s: number, p: any) => s + Number(p.totalAmount || 0), 0);
              const piutangCount = pmts.filter(
                (p: any) => p.paymentType === "piutang",
              ).length;

              return (
                <Card
                  key={def.key}
                  className={`cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all border-2 ${def.border} ${def.bg}`}
                  onClick={() => goDetail(def.key)}
                >
                  <CardContent className="pt-5 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-bold ${def.num}`}>
                        {def.label}
                      </p>
                      <ChevronRight className={`w-4 h-4 ${def.num}`} />
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
                        Total
                      </p>
                      <p className={`text-2xl font-black ${def.num}`}>
                        {formatRp(total)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {pmts.length} transaksi
                      </p>
                    </div>

                    <div className="space-y-1 pt-1 border-t border-border/40">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-green-700 font-medium">Tunai</span>
                        <span className="font-semibold">{formatRp(tunai)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-blue-700 font-medium">
                          Transfer
                        </span>
                        <span className="font-semibold">
                          {formatRp(transfer)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-orange-700 font-medium">
                          Piutang
                        </span>
                        <span className="font-semibold">{formatRp(piutang)}</span>
                      </div>
                      {piutangCount > 0 && (
                        <p className="text-[10px] text-orange-600 pt-0.5">
                          {piutangCount} belum lunas
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="pt-2">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
