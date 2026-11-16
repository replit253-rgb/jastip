import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useListBatches, useListPackages } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Ship } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  calculatePaymentSubtotals,
  resolveBatchIdForPayment,
  resolveServiceTypeForPayment,
} from "@/lib/payment-history";
import {
  PaymentSummaryCards,
  PaymentHistoryList,
} from "@/components/payment-history-list";

const SVC_LABELS: Record<string, string> = {
  "jastip pesawat": "Jastip Pesawat",
  "jastip hemat+": "Jastip Hemat+",
  "jastip kargo": "Jastip Kargo",
  "jastip pelni": "Jastip Pelni",
};

async function fetchPayments() {
  const token = localStorage.getItem("jaj_token");
  const res = await fetch("/api/payments", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Gagal memuat data pembayaran");
  return res.json();
}

export default function RiwayatPembayaranDetail({
  params: propsParams,
}: { params?: { id: string } } = {}) {
  const routerParams = useParams();
  const rawId = propsParams?.id || routerParams?.id || "0";
  const batchId = Number(rawId);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const base = user?.role === "owner" ? "/owner" : "/admin";

  const serviceTypeKey = decodeURIComponent(
    new URLSearchParams(window.location.search).get("serviceType") || "",
  );

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

  const filtered = useMemo(() => {
    const targetSvc = serviceTypeKey.toLowerCase().trim();
    return (payments as any[]).filter((pmt) => {
      if (resolveBatchIdForPayment(pmt, pkgMap) !== batchId) return false;
      if (!targetSvc) return true;
      return resolveServiceTypeForPayment(pmt, pkgMap) === targetSvc;
    });
  }, [payments, pkgMap, batchId, serviceTypeKey]);

  const subtotals = useMemo(
    () => calculatePaymentSubtotals(filtered),
    [filtered],
  );

  const svcLabel =
    SVC_LABELS[serviceTypeKey] || serviceTypeKey || "Riwayat Pembayaran";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() =>
            setLocation(`${base}/riwayat-pembayaran/batch/${batchId}`)
          }
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
                {batch && (
                  <>
                    {" "}
                    &nbsp;·&nbsp; {batch.kotaAsal} → {batch.tujuan}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Subtotal per metode pembayaran */}
      <PaymentSummaryCards subtotals={subtotals} />

      {/* Daftar pembayaran */}
      <PaymentHistoryList
        payments={filtered}
        subtotals={subtotals}
        pkgMap={pkgMap}
        isLoading={isLoading}
      />
    </div>
  );
}
