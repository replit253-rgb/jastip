import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useListBatches, useListPackages } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Ship, Banknote, CreditCard, Clock, QrCode,
  ChevronDown, ChevronUp, CheckCircle2, History,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

function formatRp(n: any) {
  if (!n && n !== 0) return "Rp 0";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

function fmtDate(d: string) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

const PAYMENT_META: Record<string, { label: string; icon: any; badgeClass: string; rowClass: string }> = {
  tunai: {
    label: "Tunai",
    icon: Banknote,
    badgeClass: "bg-green-100 text-green-700 border-green-200",
    rowClass: "border-l-4 border-l-green-400",
  },
  transfer: {
    label: "Transfer",
    icon: CreditCard,
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    rowClass: "border-l-4 border-l-blue-400",
  },
  qris: {
    label: "QRIS",
    icon: QrCode,
    badgeClass: "bg-purple-100 text-purple-700 border-purple-200",
    rowClass: "border-l-4 border-l-purple-400",
  },
  piutang: {
    label: "Piutang",
    icon: Clock,
    badgeClass: "bg-orange-100 text-orange-700 border-orange-200",
    rowClass: "border-l-4 border-l-orange-400",
  },
};

const SVC_LABELS: Record<string, string> = {
  "jastip pesawat": "Jastip Pesawat",
  "jastip hemat+":  "Jastip Hemat+",
  "jastip kargo":   "Jastip Kargo",
  "jastip pelni":   "Jastip Pelni",
};

async function fetchPayments() {
  const token = localStorage.getItem("jaj_token");
  const res = await fetch("/api/payments", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Gagal memuat data pembayaran");
  return res.json();
}

async function bayarPiutang(id: number, paymentType: "tunai" | "transfer") {
  const token = localStorage.getItem("jaj_token");
  const res = await fetch(`/api/payments/${id}/bayar`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ paymentType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Gagal memperbarui pembayaran");
  }
  return res.json();
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RiwayatPembayaranDetail({ params }: { params: { id: string } }) {
  const batchId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const base = user?.role === "owner" ? "/owner" : "/admin";
  const queryClient = useQueryClient();

  // Read serviceType from query string
  const serviceTypeKey = decodeURIComponent(new URLSearchParams(window.location.search).get("serviceType") || "");

  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dialogPayment, setDialogPayment] = useState<any | null>(null);
  const [filterType, setFilterType] = useState<"semua" | "tunai" | "transfer" | "piutang">("semua");

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

  const batch = useMemo(() => (batches as any[]).find((b) => b.id === batchId), [batches, batchId]);

  // Filter payments: match batchId + serviceType
  const filtered = useMemo(() => {
    return (payments as any[]).filter((pmt) => {
      const ids: number[] = pmt.packageIds ?? [];
      const firstPkg = ids.length ? pkgMap[ids[0]] : null;
      if (firstPkg?.batchId !== batchId) return false;
      const svc: string = (
        pmt.packageSummary?.[0]?.serviceType ||
        firstPkg?.serviceType ||
        ""
      ).toLowerCase().trim();
      return svc === serviceTypeKey.toLowerCase().trim();
    });
  }, [payments, pkgMap, batchId, serviceTypeKey]);

  // Stats
  const totalAll = filtered.reduce((s, p) => s + Number(p.totalAmount || 0), 0);
  const totalTunai = filtered.filter(p => p.paymentType === "tunai").reduce((s, p) => s + Number(p.totalAmount || 0), 0);
  const totalTransfer = filtered.filter(p => p.paymentType === "transfer").reduce((s, p) => s + Number(p.totalAmount || 0), 0);
  const totalPiutang = filtered.filter(p => p.paymentType === "piutang").reduce((s, p) => s + Number(p.totalAmount || 0), 0);

  // Apply payment-type filter
  const displayed = useMemo(() => {
    if (filterType === "semua") return filtered;
    return filtered.filter((p) => p.paymentType === filterType);
  }, [filtered, filterType]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const paginated = displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const mutation = useMutation({
    mutationFn: ({ id, type }: { id: number; type: "tunai" | "transfer" }) => bayarPiutang(id, type),
    onSuccess: (_, vars) => {
      toast.success(`Piutang berhasil diubah ke ${vars.type === "tunai" ? "Tunai" : "Transfer"}`);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      setDialogPayment(null);
    },
    onError: (err: any) => toast.error(err.message || "Gagal memperbarui pembayaran"),
  });

  function enrichPkg(pkg: any) {
    const live = pkgMap[pkg.id];
    if (!live) return pkg;
    return {
      ...pkg,
      packageDate:   pkg.packageDate   || live.packageDate,
      deliveryRoute: pkg.deliveryRoute || live.deliveryRoute,
      realWeight:    pkg.realWeight    != null ? pkg.realWeight    : live.realWeight,
      usedWeight:    pkg.usedWeight    != null ? pkg.usedWeight    : live.usedWeight,
      packagingType: pkg.packagingType || live.packagingType,
    };
  }

  const svcLabel = SVC_LABELS[serviceTypeKey] || serviceTypeKey || "Riwayat Pembayaran";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setLocation(`${base}/riwayat-pembayaran/batch/${batchId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Ship className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{svcLabel}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {batch?.namaKapal || `Batch #${batchId}`}
                {batch && <> &nbsp;·&nbsp; {batch.kotaAsal} → {batch.tujuan}</>}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Semua", value: totalAll, color: "text-primary", bg: "bg-primary/5 border-primary/20" },
          { label: "Tunai", value: totalTunai, color: "text-green-700", bg: "bg-green-50 border-green-200" },
          { label: "Transfer", value: totalTransfer, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
          { label: "Piutang", value: totalPiutang, color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
        ].map((s) => (
          <Card key={s.label} className={`border ${s.bg}`}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{s.label}</p>
              <p className={`text-xl font-black mt-1 ${s.color}`}>{formatRp(s.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter jenis pembayaran */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "semua",    label: "Semua",    count: filtered.length,                                          active: "bg-primary text-primary-foreground border-primary" },
          { key: "tunai",    label: "Tunai",    count: filtered.filter(p => p.paymentType === "tunai").length,    active: "bg-green-600 text-white border-green-600" },
          { key: "transfer", label: "Transfer", count: filtered.filter(p => p.paymentType === "transfer").length, active: "bg-blue-600 text-white border-blue-600" },
          { key: "piutang",  label: "Piutang",  count: filtered.filter(p => p.paymentType === "piutang").length,  active: "bg-orange-500 text-white border-orange-500" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilterType(f.key as any); setPage(1); }}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-semibold transition-all ${
              filterType === f.key
                ? f.active
                : "bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground"
            }`}
          >
            {f.label}
            <span className={`text-xs rounded-full px-1.5 py-0.5 font-bold leading-none ${
              filterType === f.key ? "bg-white/20" : "bg-muted"
            }`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Payment list */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground">Memuat data...</div>
          ) : paginated.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <History className="w-10 h-10 opacity-20" />
              <p>Belum ada riwayat pembayaran.</p>
            </div>
          ) : (
            <div className="divide-y">
              {paginated.map((pmt: any) => {
                const meta = PAYMENT_META[pmt.paymentType] || PAYMENT_META.tunai;
                const Icon = meta.icon;
                const isExpanded = expandedId === pmt.id;
                const pkgSummary: any[] = Array.isArray(pmt.packageSummary) ? pmt.packageSummary : [];
                const pkgCount = Array.isArray(pmt.packageIds) ? pmt.packageIds.length : pkgSummary.length;
                const isPiutang = pmt.paymentType === "piutang";

                return (
                  <div key={pmt.id} className={`${meta.rowClass} transition-colors hover:bg-muted/20`}>
                    <div
                      className="flex items-center gap-4 px-5 py-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : pmt.id)}
                    >
                      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-muted/50">
                        <Icon className="w-4 h-4" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-xs ${meta.badgeClass}`}>
                            {meta.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{pkgCount} paket</span>
                          {pmt.adminName && (
                            <span className="text-xs text-muted-foreground">· {pmt.adminName}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fmtDate(pmt.createdAt)} — {fmtTime(pmt.createdAt)}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-black text-base text-primary">{formatRp(pmt.totalAmount)}</p>
                        {pmt.paymentType === "tunai" && pmt.changeAmount != null && (
                          <p className="text-xs text-muted-foreground">Kembalian: {formatRp(pmt.changeAmount)}</p>
                        )}
                      </div>

                      {isPiutang && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 text-orange-600 border-orange-300 hover:bg-orange-50 hover:text-orange-700 gap-1.5"
                          onClick={(e) => { e.stopPropagation(); setDialogPayment(pmt); }}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Sudah Dibayar
                        </Button>
                      )}

                      <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7 text-muted-foreground">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-5 pb-4 space-y-3">
                        {pkgSummary.length > 0 ? (
                          pkgSummary.map((pkg: any, i: number) => {
                            const pkg2 = enrichPkg(pkg);
                            return (
                              <div key={i} className="bg-muted/30 rounded-lg p-3 border border-border/50">
                                <div className="flex items-start justify-between mb-2.5">
                                  <div>
                                    <p className="font-bold text-sm">{pkg2.customerName || "-"}</p>
                                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{pkg2.resiNumber || "-"}</p>
                                  </div>
                                  <span className="font-black text-base text-primary">{formatRp(pkg2.totalShipping)}</span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs border-t pt-2.5">
                                  <div>
                                    <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">No. Paket</p>
                                    <p className="font-mono font-semibold">{pkg2.packageNumber || "-"}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">Tanggal</p>
                                    <p>{pkg2.packageDate ? new Date(pkg2.packageDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-"}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">Jenis Jastip</p>
                                    <p className="capitalize">{SVC_LABELS[pkg2.serviceType] || pkg2.serviceType || "-"}</p>
                                  </div>
                                  <div className="col-span-2 md:col-span-1">
                                    <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">Rute</p>
                                    <p>{pkg2.deliveryRoute || "-"}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">Berat Real</p>
                                    <p className="font-semibold">{pkg2.realWeight != null ? `${pkg2.realWeight} Kg` : "-"}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">Berat Digunakan</p>
                                    <p className="font-semibold">{pkg2.usedWeight != null ? `${pkg2.usedWeight} Kg` : "-"}</p>
                                  </div>
                                  {pkg2.packagingType && (
                                    <div>
                                      <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">Paking</p>
                                      <p>{pkg2.packagingType}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground text-center">
                            Data paket tidak tersedia
                          </div>
                        )}
                        {pmt.paymentType === "tunai" && pmt.paidAmount != null && (
                          <div className="flex justify-between text-xs text-muted-foreground bg-muted/20 rounded-md px-3 py-2">
                            <span>Dibayar: <span className="font-semibold text-foreground">{formatRp(pmt.paidAmount)}</span></span>
                            <span>Kembalian: <span className="font-semibold text-foreground">{formatRp(pmt.changeAmount)}</span></span>
                          </div>
                        )}
                        {pmt.notes && (
                          <p className="text-xs text-muted-foreground italic px-1">Catatan: {pmt.notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        {filtered.length > PAGE_SIZE && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </Card>

      {/* Dialog konfirmasi pelunasan piutang */}
      <Dialog open={!!dialogPayment} onOpenChange={(open) => { if (!open) setDialogPayment(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-orange-500" />
              Konfirmasi Pelunasan Piutang
            </DialogTitle>
            <DialogDescription>
              Tagihan sebesar{" "}
              <span className="font-bold text-foreground">{formatRp(dialogPayment?.totalAmount)}</span>{" "}
              akan ditandai sudah dibayar. Pilih metode pembayaran:
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ id: dialogPayment.id, type: "tunai" })}
            >
              <Banknote className="w-7 h-7 text-green-600" />
              <span className="font-bold text-green-700 text-sm">Tunai</span>
              <span className="text-xs text-green-600/80">Bayar cash</span>
            </button>

            <button
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ id: dialogPayment.id, type: "transfer" })}
            >
              <CreditCard className="w-7 h-7 text-blue-600" />
              <span className="font-bold text-blue-700 text-sm">Transfer</span>
              <span className="text-xs text-blue-600/80">Bayar transfer</span>
            </button>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="w-full"
              disabled={mutation.isPending}
              onClick={() => setDialogPayment(null)}
            >
              Batal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
