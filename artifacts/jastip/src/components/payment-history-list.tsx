import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Banknote,
  CreditCard,
  Clock,
  QrCode,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  History,
  Download,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { downloadReceiptPdf, type ReceiptPrintPayload } from "@/lib/print-receipt";
import {
  formatRp,
  fmtDateTime,
  isVoidReversal,
  resolvePaymentCategory,
  getPaymentMethodLabel,
  getPaymentTypeLabel,
  getDisplayedPaidAmount,
  getNetPaymentAmount,
  type PaymentSubtotals,
} from "@/lib/payment-history";

const PAGE_SIZE = 15;

const PAYMENT_META: Record<
  string,
  { label: string; icon: any; badgeClass: string; rowClass: string }
> = {
  tunai: {
    label: "Tunai",
    icon: Banknote,
    badgeClass: "bg-green-100 text-green-700 border-green-200",
    rowClass: "border-l-4 border-l-green-500",
  },
  transfer: {
    label: "Transfer",
    icon: CreditCard,
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    rowClass: "border-l-4 border-l-blue-500",
  },
  qris: {
    label: "QRIS",
    icon: QrCode,
    badgeClass: "bg-purple-100 text-purple-700 border-purple-200",
    rowClass: "border-l-4 border-l-purple-500",
  },
  piutang: {
    label: "Piutang",
    icon: Clock,
    badgeClass: "bg-orange-100 text-orange-700 border-orange-200",
    rowClass: "border-l-4 border-l-orange-500",
  },
  void_reversal: {
    label: "VOID Reversal",
    icon: RotateCcw,
    badgeClass: "bg-red-100 text-red-700 border-red-300",
    rowClass: "border-l-4 border-l-red-500 bg-red-50/40",
  },
};

const SVC_LABELS: Record<string, string> = {
  "jastip pesawat": "Jastip Pesawat",
  "jastip hemat+": "Jastip Hemat+",
  "jastip kargo": "Jastip Kargo",
  "jastip pelni": "Jastip Pelni",
};

async function bayarPiutang(id: number, paymentType: "tunai" | "transfer" | "qris") {
  const token = localStorage.getItem("jaj_token");
  const res = await fetch(`/api/payments/${id}/bayar`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Gagal memperbarui pembayaran");
  }
  return res.json();
}

export function PaymentSummaryCards({ subtotals }: { subtotals: PaymentSubtotals }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Total Keseluruhan
            </p>
            <p className="text-xl font-black mt-1 text-primary">
              {formatRp(subtotals.totalKeseluruhan)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {subtotals.counts.all} entri pembayaran
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-green-50 border-green-200">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Subtotal Tunai
            </p>
            <p className="text-xl font-black mt-1 text-green-700">
              {formatRp(subtotals.tunai)}
            </p>
            <p className="text-[11px] text-green-700/80 mt-0.5">
              {subtotals.counts.tunai} transaksi
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Subtotal Transfer
            </p>
            <p className="text-xl font-black mt-1 text-blue-700">
              {formatRp(subtotals.transfer)}
            </p>
            <p className="text-[11px] text-blue-700/80 mt-0.5">
              {subtotals.counts.transfer} transaksi
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-purple-50 border-purple-200">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Subtotal QRIS
            </p>
            <p className="text-xl font-black mt-1 text-purple-700">
              {formatRp(subtotals.qris)}
            </p>
            <p className="text-[11px] text-purple-700/80 mt-0.5">
              {subtotals.counts.qris} transaksi
            </p>
          </CardContent>
        </Card>
      </div>

      {(subtotals.counts.voidReversal > 0 || subtotals.counts.piutang > 0) && (
        <div className="flex flex-wrap gap-3 text-xs">
          {subtotals.counts.voidReversal > 0 && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                VOID Reversal ({subtotals.counts.voidReversal}):{" "}
                <strong className="font-bold">{formatRp(subtotals.voidReversal)}</strong>
              </span>
            </div>
          )}
          {subtotals.counts.piutang > 0 && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-orange-700">
              <Clock className="w-3.5 h-3.5" />
              <span>
                Piutang Legacy ({subtotals.counts.piutang}):{" "}
                <strong className="font-bold">{formatRp(subtotals.piutang)}</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PaymentHistoryList({
  payments,
  subtotals,
  pkgMap,
  isLoading,
  title,
}: {
  payments: any[];
  subtotals: PaymentSubtotals;
  pkgMap: Record<number, any>;
  isLoading: boolean;
  title?: string;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dialogPayment, setDialogPayment] = useState<any | null>(null);
  const [downloadingPmtId, setDownloadingPmtId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<
    "semua" | "tunai" | "transfer" | "qris" | "void_reversal" | "piutang"
  >("semua");

  const displayed = useMemo(() => {
    if (filterCategory === "semua") return payments;
    return payments.filter((p) => resolvePaymentCategory(p) === filterCategory);
  }, [payments, filterCategory]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = displayed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const mutation = useMutation({
    mutationFn: ({ id, type }: { id: number; type: "tunai" | "transfer" | "qris" }) =>
      bayarPiutang(id, type),
    onSuccess: (_, vars) => {
      toast.success(
        `Piutang berhasil diubah ke ${
          vars.type === "tunai" ? "Tunai" : vars.type === "transfer" ? "Transfer" : "QRIS"
        }`,
      );
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      setDialogPayment(null);
    },
    onError: (err: any) =>
      toast.error(err.message || "Gagal memperbarui pembayaran"),
  });

  async function handleDownloadReceipt(pmt: any) {
    if (!pmt.transactionId) {
      toast.error("Data transaksi struk tidak ditemukan.");
      return;
    }
    setDownloadingPmtId(pmt.id);
    try {
      const token = localStorage.getItem("jaj_token");
      const res = await fetch(`/api/transactions/${pmt.transactionId}/receipt/print`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Gagal menyiapkan struk");
      downloadReceiptPdf(body.receipt as ReceiptPrintPayload, body.print);
      toast.success("File PDF struk transaksi berhasil diunduh.");
    } catch (err: any) {
      toast.error(err.message || "Gagal mengunduh file PDF struk.");
    } finally {
      setDownloadingPmtId(null);
    }
  }

  function enrichPkg(pkg: any) {
    const live = pkgMap[pkg.id];
    if (!live) return pkg;
    return {
      ...pkg,
      packageDate: pkg.packageDate || live.packageDate,
      deliveryRoute: pkg.deliveryRoute || live.deliveryRoute,
      realWeight: pkg.realWeight != null ? pkg.realWeight : live.realWeight,
      usedWeight: pkg.usedWeight != null ? pkg.usedWeight : live.usedWeight,
      packagingType: pkg.packagingType || live.packagingType,
    };
  }

  const filterChips = [
    {
      key: "semua" as const,
      label: "Semua",
      count: subtotals.counts.all,
      active: "bg-primary text-primary-foreground border-primary",
    },
    {
      key: "tunai" as const,
      label: "Tunai",
      count: subtotals.counts.tunai,
      active: "bg-green-600 text-white border-green-600",
    },
    {
      key: "transfer" as const,
      label: "Transfer",
      count: subtotals.counts.transfer,
      active: "bg-blue-600 text-white border-blue-600",
    },
    {
      key: "qris" as const,
      label: "QRIS",
      count: subtotals.counts.qris,
      active: "bg-purple-600 text-white border-purple-600",
    },
    ...(subtotals.counts.voidReversal > 0
      ? [
          {
            key: "void_reversal" as const,
            label: "VOID Reversal",
            count: subtotals.counts.voidReversal,
            active: "bg-red-600 text-white border-red-600",
          },
        ]
      : []),
    ...(subtotals.counts.piutang > 0
      ? [
          {
            key: "piutang" as const,
            label: "Piutang",
            count: subtotals.counts.piutang,
            active: "bg-orange-500 text-white border-orange-500",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      {title && <h2 className="text-lg font-bold tracking-tight">{title}</h2>}

      {/* Filter metode pembayaran */}
      <div className="flex flex-wrap gap-2">
        {filterChips.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setFilterCategory(f.key);
              setPage(1);
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md border text-sm font-semibold transition-all ${
              filterCategory === f.key
                ? f.active
                : "bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground"
            }`}
          >
            {f.label}
            <span
              className={`text-xs rounded px-1.5 py-0.5 font-bold leading-none ${
                filterCategory === f.key ? "bg-white/20" : "bg-muted"
              }`}
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Payment list */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground">
              Memuat data...
            </div>
          ) : paginated.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <History className="w-10 h-10 opacity-20" />
              <p>Belum ada riwayat pembayaran.</p>
            </div>
          ) : (
            <div className="divide-y">
              {paginated.map((pmt: any) => {
                const category = resolvePaymentCategory(pmt);
                const meta = PAYMENT_META[category] || PAYMENT_META.tunai;
                const Icon = meta.icon;
                const isVoid = isVoidReversal(pmt);
                const isExpanded = expandedId === pmt.id;
                const pkgSummary: any[] = Array.isArray(pmt.packageSummary)
                  ? pmt.packageSummary
                  : [];
                const pkgCount = Array.isArray(pmt.packageIds)
                  ? pmt.packageIds.length
                  : pkgSummary.length;
                const isPiutang = category === "piutang";

                const displayedPaid = getDisplayedPaidAmount(pmt);
                const netAmount = getNetPaymentAmount(pmt);
                const changeAmt = Number(pmt.changeAmount || 0);
                const typeLabel = getPaymentTypeLabel(pmt);
                const methodLabel = getPaymentMethodLabel(pmt);
                const trxLabel =
                  pmt.transactionNo ||
                  (pmt.transactionId ? `#TRX-${pmt.transactionId}` : `PMT-${pmt.id}`);

                return (
                  <div
                    key={pmt.id}
                    className={`${meta.rowClass} transition-colors hover:bg-muted/20`}
                  >
                    <div
                      className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : pmt.id)}
                    >
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                          isVoid ? "bg-red-100 text-red-700" : "bg-muted/50"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-xs font-semibold ${meta.badgeClass}`}>
                            {methodLabel}
                          </Badge>
                          {!isVoid && typeLabel !== "Pembayaran" && (
                            <Badge variant="secondary" className="text-[11px]">
                              {typeLabel}
                            </Badge>
                          )}
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {trxLabel}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            · {pkgCount} paket
                          </span>
                          {pmt.adminName && (
                            <span className="text-xs text-muted-foreground">
                              · {pmt.adminName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-1">
                          <span>{fmtDateTime(pmt.createdAt)}</span>
                          {pmt.paymentReference && (
                            <span className="font-mono text-[11px]">
                              · Ref: {pmt.paymentReference}
                            </span>
                          )}
                          {isVoid && (
                            <span className="text-red-700 font-semibold">
                              · Pembalikan transaksi VOID
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-auto">
                        <p
                          className={`font-black text-base ${
                            isVoid ? "text-red-600" : "text-primary"
                          }`}
                        >
                          {formatRp(displayedPaid)}
                        </p>
                        {!isVoid && (changeAmt > 0 || displayedPaid !== netAmount) && (
                          <p className="text-[11px] text-muted-foreground">
                            Masuk kas: {formatRp(netAmount)} · Kembalian: {formatRp(changeAmt)}
                          </p>
                        )}
                      </div>

                      {pmt.transactionId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 text-teal-700 border-teal-200 hover:bg-teal-50 gap-1 text-xs"
                          disabled={downloadingPmtId === pmt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadReceipt(pmt);
                          }}
                        >
                          {downloadingPmtId === pmt.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          Unduh Struk
                        </Button>
                      )}

                      {isPiutang && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 text-orange-600 border-orange-300 hover:bg-orange-50 hover:text-orange-700 gap-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDialogPayment(pmt);
                          }}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Sudah Dibayar
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-7 w-7 text-muted-foreground"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-5 pb-4 space-y-3">
                        {pkgSummary.length > 0 ? (
                          pkgSummary.map((pkg: any, i: number) => {
                            const pkg2 = enrichPkg(pkg);
                            return (
                              <div
                                key={i}
                                className="bg-muted/30 rounded-lg p-3 border border-border/50"
                              >
                                <div className="flex items-start justify-between mb-2.5">
                                  <div>
                                    <p className="font-bold text-sm">
                                      {pkg2.customerName || "-"}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                      {pkg2.resiNumber || "-"}
                                    </p>
                                  </div>
                                  <span className="font-black text-base text-primary">
                                    {formatRp(pkg2.totalShipping)}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs border-t pt-2.5">
                                  <div>
                                    <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">
                                      No. Paket
                                    </p>
                                    <p className="font-mono font-semibold">
                                      {pkg2.packageNumber || "-"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">
                                      Tanggal
                                    </p>
                                    <p>
                                      {pkg2.packageDate
                                        ? new Date(pkg2.packageDate).toLocaleDateString(
                                            "id-ID",
                                            { day: "2-digit", month: "short", year: "numeric" },
                                          )
                                        : "-"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">
                                      Jenis Jastip
                                    </p>
                                    <p className="capitalize">
                                      {SVC_LABELS[pkg2.serviceType] || pkg2.serviceType || "-"}
                                    </p>
                                  </div>
                                  <div className="col-span-2 md:col-span-1">
                                    <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">
                                      Rute
                                    </p>
                                    <p>{pkg2.deliveryRoute || "-"}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">
                                      Berat Real
                                    </p>
                                    <p className="font-semibold">
                                      {pkg2.realWeight != null ? `${pkg2.realWeight} Kg` : "-"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">
                                      Berat Digunakan
                                    </p>
                                    <p className="font-semibold">
                                      {pkg2.usedWeight != null ? `${pkg2.usedWeight} Kg` : "-"}
                                    </p>
                                  </div>
                                  {pkg2.packagingType && (
                                    <div>
                                      <p className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">
                                        Paking
                                      </p>
                                      <p>{pkg2.packagingType}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : Array.isArray(pmt.packageIds) && pmt.packageIds.length > 0 ? (
                          <div className="bg-muted/30 rounded-lg p-3 border border-border/50 space-y-1.5">
                            <p className="text-xs font-semibold text-muted-foreground">
                              Paket Terkait ({pmt.packageIds.length}):
                            </p>
                            {pmt.packageIds.map((id: number) => {
                              const live = pkgMap[id];
                              return (
                                <div
                                  key={id}
                                  className="flex items-center justify-between text-xs border-t pt-1.5"
                                >
                                  <span>
                                    <span className="font-semibold">
                                      {live?.customerName || `Paket #${id}`}
                                    </span>{" "}
                                    {live?.resiNumber ? `· ${live.resiNumber}` : ""}
                                  </span>
                                  <span className="font-mono font-semibold">
                                    {live?.totalShipping != null
                                      ? formatRp(live.totalShipping)
                                      : "-"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground text-center">
                            Data paket tidak tersedia
                          </div>
                        )}

                        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground bg-muted/20 rounded-md px-3 py-2">
                          <span>
                            Nominal Dibayar:{" "}
                            <span
                              className={`font-semibold ${
                                isVoid ? "text-red-600" : "text-foreground"
                              }`}
                            >
                              {formatRp(displayedPaid)}
                            </span>
                          </span>
                          <span>
                            Nominal Bersih Kas:{" "}
                            <span
                              className={`font-semibold ${
                                isVoid ? "text-red-600" : "text-foreground"
                              }`}
                            >
                              {formatRp(netAmount)}
                            </span>
                          </span>
                          {changeAmt > 0 && (
                            <span>
                              Kembalian:{" "}
                              <span className="font-semibold text-foreground">
                                {formatRp(changeAmt)}
                              </span>
                            </span>
                          )}
                        </div>
                        {pmt.notes && (
                          <p className="text-xs text-muted-foreground italic px-1">
                            Catatan: {pmt.notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        {displayed.length > PAGE_SIZE && (
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={displayed.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </Card>

      {/* Dialog konfirmasi pelunasan piutang */}
      <Dialog
        open={!!dialogPayment}
        onOpenChange={(open) => {
          if (!open) setDialogPayment(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-orange-500" />
              Konfirmasi Pelunasan Piutang
            </DialogTitle>
            <DialogDescription>
              Tagihan sebesar{" "}
              <span className="font-bold text-foreground">
                {formatRp(dialogPayment?.totalAmount)}
              </span>{" "}
              akan ditandai sudah dibayar. Pilih metode pembayaran:
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2.5 py-2">
            <button
              type="button"
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ id: dialogPayment.id, type: "tunai" })}
            >
              <Banknote className="w-6 h-6 text-green-600" />
              <span className="font-bold text-green-700 text-xs">Tunai</span>
            </button>

            <button
              type="button"
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ id: dialogPayment.id, type: "transfer" })}
            >
              <CreditCard className="w-6 h-6 text-blue-600" />
              <span className="font-bold text-blue-700 text-xs">Transfer</span>
            </button>

            <button
              type="button"
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ id: dialogPayment.id, type: "qris" })}
            >
              <QrCode className="w-6 h-6 text-purple-600" />
              <span className="font-bold text-purple-700 text-xs">QRIS</span>
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
