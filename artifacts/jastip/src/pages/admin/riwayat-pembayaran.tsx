import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useListBatches, useListPackages } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Ship, ChevronRight, CheckCircle2, Lock, Archive } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Pagination } from "@/components/pagination";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRp(n: any) {
  if (!n && n !== 0) return "Rp 0";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

function fmtDate(d: string) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
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
  const res = await fetch("/api/payments", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Gagal memuat data pembayaran");
  return res.json();
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RiwayatPembayaran() {
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

  const batchMap = useMemo(() => {
    const m: Record<number, any> = {};
    for (const b of batches as any[]) m[b.id] = b;
    return m;
  }, [batches]);

  // Group payments by batchId (use first packageId to look up batch)
  const batchGroups = useMemo(() => {
    const map = new Map<number, { batchId: number; payments: any[] }>();
    for (const pmt of payments as any[]) {
      const ids: number[] = pmt.packageIds ?? [];
      const batchId: number | null = ids.length ? (pkgMap[ids[0]]?.batchId ?? null) : null;
      if (batchId === null) continue;
      if (!map.has(batchId)) map.set(batchId, { batchId, payments: [] });
      map.get(batchId)!.payments.push(pmt);
    }
    return [...map.values()].sort((a, b) => {
      const aT = Math.max(...a.payments.map((p: any) => new Date(p.createdAt).getTime()));
      const bT = Math.max(...b.payments.map((p: any) => new Date(p.createdAt).getTime()));
      return bT - aT;
    });
  }, [payments, pkgMap]);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 6;
  const total = batchGroups.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pagedBatchGroups = useMemo(() => {
    return batchGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [batchGroups, page]);

  // Grand totals across all batches
  const grandTotal = (payments as any[]).reduce((s, p) => s + Number(p.totalAmount || 0), 0);
  const grandTunai = (payments as any[]).filter(p => p.paymentType === "tunai").reduce((s, p) => s + Number(p.totalAmount || 0), 0);
  const grandTransfer = (payments as any[]).filter(p => p.paymentType === "transfer").reduce((s, p) => s + Number(p.totalAmount || 0), 0);
  const grandPiutang = (payments as any[]).filter(p => p.paymentType === "piutang").reduce((s, p) => s + Number(p.totalAmount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <History className="h-7 w-7 text-primary" /> Riwayat Pembayaran
        </h1>
        <p className="text-muted-foreground mt-1">Rekap pembayaran per batch pengiriman. Klik batch untuk melihat detail.</p>
      </div>

      {/* Grand summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Semua", value: grandTotal, color: "text-primary", bg: "bg-primary/5 border-primary/20" },
          { label: "Tunai", value: grandTunai, color: "text-green-700", bg: "bg-green-50 border-green-200" },
          { label: "Transfer", value: grandTransfer, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
          { label: "Piutang", value: grandPiutang, color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
        ].map((s) => (
          <Card key={s.label} className={`border ${s.bg}`}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{s.label}</p>
              <p className={`text-xl font-black mt-1 ${s.color}`}>{formatRp(s.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Batch cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-48 pt-4 bg-muted/20" />
            </Card>
          ))}
        </div>
      ) : batchGroups.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <History className="w-14 h-14 mx-auto mb-4 opacity-20" />
          <p className="font-semibold text-base">Belum ada riwayat pembayaran</p>
          <p className="text-sm mt-1">Data akan muncul setelah ada pembayaran di Kalkulator Scan</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pagedBatchGroups.map(({ batchId, payments: pmts }) => {
              const batch = batchMap[batchId];
              const totalAll = pmts.reduce((s: number, p: any) => s + Number(p.totalAmount || 0), 0);
              const totalTunai = pmts.filter((p: any) => p.paymentType === "tunai").reduce((s: number, p: any) => s + Number(p.totalAmount || 0), 0);
              const totalTransfer = pmts.filter((p: any) => p.paymentType === "transfer").reduce((s: number, p: any) => s + Number(p.totalAmount || 0), 0);
              const totalPiutang = pmts.filter((p: any) => p.paymentType === "piutang").reduce((s: number, p: any) => s + Number(p.totalAmount || 0), 0);
              const piutangCount = pmts.filter((p: any) => p.paymentType === "piutang").length;

              return (
                <Card
                  key={batchId}
                  className="cursor-pointer hover:shadow-lg hover:scale-[1.01] transition-all border-2 hover:border-primary/40"
                  onClick={() => setLocation(`${base}/riwayat-pembayaran/batch/${batchId}`)}
                >
                  <CardContent className="pt-5 pb-4 space-y-4">
                    {/* Batch header */}
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                        <Ship className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-base leading-snug truncate">
                            {batch?.namaKapal || `Batch #${batchId}`}
                          </p>
                          {batch && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] flex items-center gap-1 ${batchStatusColor(batch.statusBatch)}`}
                            >
                              {batchStatusIcon(batch.statusBatch)}
                              {batchStatusLabel(batch.statusBatch)}
                            </Badge>
                          )}
                        </div>
                        {batch && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {batch.kotaAsal} → {batch.tujuan} &nbsp;·&nbsp; ETD {fmtDate(batch.etd)}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">{pmts.length} transaksi</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                    </div>

                    {/* Payment summary grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Total", value: totalAll, color: "text-primary", bg: "bg-primary/5 border-primary/20" },
                        { label: "Tunai", value: totalTunai, color: "text-green-700", bg: "bg-green-50 border-green-200" },
                        { label: "Transfer", value: totalTransfer, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
                        { label: "Piutang", value: totalPiutang, color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
                      ].map((s) => (
                        <div key={s.label} className={`rounded-lg border p-2.5 ${s.bg}`}>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
                          <p className={`text-sm font-black mt-0.5 leading-tight ${s.color}`}>{formatRp(s.value)}</p>
                          {s.label === "Piutang" && piutangCount > 0 && (
                            <p className="text-[10px] text-orange-600 mt-0.5">{piutangCount} belum lunas</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
