import { useEffect, useMemo, useState } from "react";
import { useListPackages, useListBatches } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/pagination";

// ── Constants ─────────────────────────────────────────────────────────────────

const SERVICE_MAP: Record<
  string,
  { serviceKey: string; label: string; color: string }
> = {
  pesawat: {
    serviceKey: "jastip pesawat",
    label: "Jastip Pesawat",
    color: "bg-blue-700",
  },
  hemat: {
    serviceKey: "jastip hemat+",
    label: "Jastip Hemat+",
    color: "bg-emerald-700",
  },
  kargo: {
    serviceKey: "jastip kargo",
    label: "Jastip Kargo",
    color: "bg-amber-700",
  },
  pelni: {
    serviceKey: "jastip pelni",
    label: "Jastip Pelni",
    color: "bg-purple-700",
  },
};

const TABS = ["Ringkasan", "Transaksi", "Pembayaran", "Paket"] as const;
type Tab = (typeof TABS)[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function formatRp(n: number) {
  return `Rp${Math.round(n).toLocaleString("id-ID")}`;
}

function isoDateOf(d: string | null | undefined) {
  if (!d) return "";
  return d.includes("T") ? d.split("T")[0] : d;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTrxNo(id: number, createdAt: string) {
  const d = new Date(createdAt);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `TRX-${dd}${mm}${yy}-${id}`;
}

function getStatus(p: any) {
  if (p.paymentType === "piutang") return "Piutang";
  const paid = Number(p.paidAmount ?? p.totalAmount ?? 0);
  const total = Number(p.totalAmount ?? 0);
  return paid >= total ? "Lunas" : "Sebagian";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiTotalTagihan({ value, count }: { value: number; count: number }) {
  return (
    <div className="flex-1 min-w-[140px] bg-slate-800 text-white rounded-sm p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300 mb-1">
        Total Tagihan
      </p>
      <p className="text-2xl font-black">{formatRp(value)}</p>
      <p className="text-xs text-slate-300 mt-1">{count} paket</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  textColor,
  borderColor,
}: {
  label: string;
  value: number;
  sub: string;
  textColor: string;
  borderColor: string;
}) {
  return (
    <div
      className={`flex-1 min-w-[140px] bg-white border-2 ${borderColor} rounded-sm p-4`}
    >
      <p
        className={`text-[10px] font-bold uppercase tracking-widest ${textColor} mb-1`}
      >
        {label}
      </p>
      <p className={`text-2xl font-black ${textColor}`}>{formatRp(value)}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

// ── Transaction Table ─────────────────────────────────────────────────────────

function TrxTable({
  payments,
  pkgMap,
}: {
  payments: any[];
  pkgMap: Map<number, any>;
}) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(payments.length / PAGE_SIZE);
  const paginatedPayments = payments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (payments.length === 0) {
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">
        Belum ada transaksi
      </p>
    );
  }

  return (
    <div className="overflow-x-auto space-y-3 p-1">
      <table className="w-full text-sm min-w-[780px]">
        <thead>
          <tr className="bg-slate-700 text-white">
            {[
              "Jam",
              "No. transaksi",
              "Nama Konsumen",
              "Jumlah Paket",
              "Tagihan",
              "Dibayar",
              "Metode",
              "Status",
              "Admin",
            ].map((h) => (
              <th
                key={h}
                className="py-2.5 px-3 text-left text-xs font-semibold whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paginatedPayments.map((p, i) => {
            const ids: number[] = p.packageIds || [];
            const firstPkg = ids.map((id) => pkgMap.get(id)).find(Boolean);
            const customerName = firstPkg?.customerName || "—";
            const status = getStatus(p);
            return (
              <tr
                key={p.id}
                className={`border-b ${i % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-blue-50 transition-colors`}
              >
                <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(p.createdAt)}
                </td>
                <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap text-blue-700">
                  {formatTrxNo(p.id, p.createdAt)}
                </td>
                <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                  {customerName}
                </td>
                <td className="py-2.5 px-3 text-center">{ids.length}</td>
                <td className="py-2.5 px-3 whitespace-nowrap font-medium">
                  {formatRp(Number(p.totalAmount || 0))}
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap font-semibold text-green-700">
                  {formatRp(Number(p.paidAmount ?? p.totalAmount ?? 0))}
                </td>
                <td className="py-2.5 px-3 capitalize whitespace-nowrap">
                  {p.paymentType === "tunai"
                    ? "Tunai"
                    : p.paymentType === "transfer"
                      ? "Transfer"
                      : "Piutang"}
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      status === "Lunas"
                        ? "bg-green-100 text-green-800"
                        : status === "Sebagian"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-orange-100 text-orange-800"
                    }`}
                  >
                    {status}
                  </span>
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">
                  {p.adminName || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100 border-t-2 font-bold">
            <td className="py-2.5 px-3" colSpan={4}>
              Total ({payments.length} transaksi)
            </td>
            <td className="py-2.5 px-3 whitespace-nowrap">
              {formatRp(
                payments.reduce((s, p) => s + Number(p.totalAmount || 0), 0),
              )}
            </td>
            <td className="py-2.5 px-3 whitespace-nowrap text-green-700">
              {formatRp(
                payments
                  .filter((p) => p.paymentType !== "piutang")
                  .reduce(
                    (s, p) => s + Number(p.paidAmount ?? p.totalAmount ?? 0),
                    0,
                  ),
              )}
            </td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>

      {totalPages > 1 && (
        <div className="p-3 border-t">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={payments.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

// ── Package Table ─────────────────────────────────────────────────────────────

function PaketTable({ packages }: { packages: any[] }) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(packages.length / PAGE_SIZE);
  const paginatedPackages = packages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (packages.length === 0) {
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">
        Belum ada paket
      </p>
    );
  }
  return (
    <div className="overflow-x-auto space-y-3 p-1">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="bg-slate-700 text-white">
            {["Nomor Resi", "Customer", "Ongkir", "Status Paket"].map((h) => (
              <th
                key={h}
                className="py-2.5 px-3 text-left text-xs font-semibold whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paginatedPackages.map((p: any, i: number) => (
            <tr
              key={p.id}
              className={`border-b ${i % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-blue-50 transition-colors`}
            >
              <td className="py-2.5 px-3 font-mono text-xs text-blue-700 whitespace-nowrap">
                {p.resiNumber || "—"}
              </td>
              <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                {p.customerName || "—"}
              </td>
              <td className="py-2.5 px-3 whitespace-nowrap font-medium">
                {formatRp(Number(p.totalShipping || 0))}
              </td>
              <td className="py-2.5 px-3 whitespace-nowrap">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    p.statusPengambilan === "SUDAH_DIAMBIL" ||
                    p.status === "diserahkan"
                      ? "bg-green-100 text-green-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {p.statusPengambilan === "SUDAH_DIAMBIL" ||
                  p.status === "diserahkan"
                    ? "Diserahkan"
                    : "Pending"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="p-3 border-t">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={packages.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface Props {
  params?: { service?: string };
}

export default function OwnerFinanceDetail({ params }: Props) {
  const slug = params?.service || "";
  const svc = SERVICE_MAP[slug];
  const [location, setLocation] = useLocation();
  const initialBatch = new URLSearchParams(location.split("?")[1] || "").get(
    "batch",
  );

  // ── Filters ────────────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [adminFilter, setAdminFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState(initialBatch || "all");
  const [statusBayar, setStatusBayar] = useState("all");
  const [statusPaket, setStatusPaket] = useState("all");
  const [activeTab, setActiveTab] = useState<Tab>("Ringkasan");

  // ── Raw data ───────────────────────────────────────────────────────────────
  const { data: allPackages } = useListPackages();
  const { data: batches } = useListBatches();
  const [payments, setPayments] = useState<any[]>([]);
  const [loadingPay, setLoadingPay] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("jaj_token");
    fetch("/api/payments", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setPayments)
      .catch(() => {})
      .finally(() => setLoadingPay(false));
  }, []);

  // ── Package map & this-service packages ───────────────────────────────────
  const pkgMap = useMemo(() => {
    const m = new Map<number, any>();
    (allPackages || []).forEach((p: any) => m.set(p.id, p));
    return m;
  }, [allPackages]);

  const serviceKey = svc?.serviceKey || "";

  // ── Batch helper ───────────────────────────────────────────────────────────
  function paymentInBatch(p: any, batchId: string) {
    if (batchId === "all") return true;
    const ids: number[] = p.packageIds ?? [];
    const firstPackage = ids.length ? pkgMap.get(ids[0]) : null;
    return String(firstPackage?.batchId) === batchId;
  }

  // ── Batch list (batches that have at least one payment for this service) ───
  const batchList = useMemo(() => {
    const activeBatchIds = new Set<number>();
    for (const pmt of payments) {
      const ids: number[] = pmt.packageIds ?? [];
      for (const id of ids) {
        const pkg = pkgMap.get(id);
        if (pkg && pkg.serviceType === serviceKey && pkg.batchId != null) {
          activeBatchIds.add(pkg.batchId);
        }
      }
    }
    return [...(batches || [])]
      .filter((b: any) => activeBatchIds.has(b.id))
      .sort(
        (a: any, b: any) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );
  }, [batches, payments, pkgMap, serviceKey]);

  // Admin list
  const adminList = useMemo(() => {
    const names = new Set<string>();
    payments.forEach((p) => {
      if (p.adminName) names.add(p.adminName);
    });
    return [...names].sort();
  }, [payments]);

  // ── Filtered payments (for this service type + date + filters) ────────────
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const d = isoDateOf(p.createdAt);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      if (adminFilter !== "all" && p.adminName !== adminFilter) return false;
      if (!paymentInBatch(p, batchFilter)) return false;

      // Match admin riwayat-pembayaran: first package/summary determines service.
      const ids: number[] = p.packageIds || [];
      const firstPackage = ids.length ? pkgMap.get(ids[0]) : null;
      const paymentService = (
        p.packageSummary?.[0]?.serviceType ||
        firstPackage?.serviceType ||
        ""
      )
        .toLowerCase()
        .trim();
      if (serviceKey && paymentService !== serviceKey) return false;

      // Status bayar filter
      if (statusBayar !== "all") {
        const st = getStatus(p);
        if (statusBayar === "lunas" && st !== "Lunas") return false;
        if (statusBayar === "sebagian" && st !== "Sebagian") return false;
        if (statusBayar === "piutang" && st !== "Piutang") return false;
      }

      return true;
    });
  }, [
    payments,
    dateFrom,
    dateTo,
    adminFilter,
    batchFilter,
    statusBayar,
    serviceKey,
    pkgMap,
  ]);

  // ── Filtered packages (for this service + date + status filter) ───────────
  const filteredPackages = useMemo(() => {
    return (allPackages || []).filter((p: any) => {
      if (p.serviceType !== serviceKey) return false;
      const d = isoDateOf(p.packageDate || p.createdAt);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      if (batchFilter !== "all" && String(p.batchId) !== batchFilter)
        return false;
      if (statusPaket !== "all") {
        const isDiserahkan =
          p.statusPengambilan === "SUDAH_DIAMBIL" || p.status === "diserahkan";
        if (statusPaket === "diserahkan" && !isDiserahkan) return false;
        if (statusPaket === "pending" && isDiserahkan) return false;
      }
      return true;
    });
  }, [allPackages, serviceKey, dateFrom, dateTo, batchFilter, statusPaket]);

  // ── KPI ───────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const dibayar = filteredPayments.reduce(
      (s, p) => s + Number(p.totalAmount || 0),
      0,
    );
    const belumDibayar = filteredPackages
      .filter(
        (p: any) =>
          !(
            p.statusPengambilan === "SUDAH_DIAMBIL" || p.status === "diserahkan"
          ),
      )
      .reduce((s: number, p: any) => s + Number(p.totalShipping || 0), 0);
    const totalTagihan = dibayar + belumDibayar;
    return { totalTagihan, dibayar, belumDibayar };
  }, [filteredPackages, filteredPayments]);

  // ── Method breakdown (for Pembayaran tab) ─────────────────────────────────
  const byMethod = useMemo(() => {
    const m: Record<string, { amount: number; count: number }> = {
      tunai: { amount: 0, count: 0 },
      transfer: { amount: 0, count: 0 },
      piutang: { amount: 0, count: 0 },
    };
    filteredPayments.forEach((p) => {
      const key = p.paymentType as string;
      if (!m[key]) m[key] = { amount: 0, count: 0 };
      m[key].amount += Number(p.totalAmount || 0);
      m[key].count += 1;
    });
    return m;
  }, [filteredPayments]);

  if (!svc) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-muted-foreground">Layanan tidak ditemukan.</p>
        <Button variant="outline" onClick={() => setLocation("/owner/finance")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
        </Button>
      </div>
    );
  }

  const rangeLabel =
    !dateFrom && !dateTo
      ? "Semua tanggal"
      : dateFrom === dateTo
        ? new Date(dateFrom + "T00:00:00").toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : `${dateFrom} — ${dateTo}`;

  return (
    <div className="space-y-0 -mx-4 sm:-mx-6 -mt-4">
      {/* ── Dark Header ─────────────────────────────────────────────────── */}
      <div className={`${svc.color} text-white px-6 pt-5 pb-4`}>
        <div className="flex items-center gap-3 mb-1">
          <button
            className="text-white/70 hover:text-white transition-colors"
            onClick={() => setLocation("/owner/finance")}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-black leading-tight">{svc.label}</h1>
            <p className="text-sm text-white/70">
              Laporan keuangan dan operasional per layanan
            </p>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────────────── */}
      <div className="border-b bg-white px-6 py-2 flex flex-wrap gap-x-6 gap-y-1 items-center text-sm">
        {/* Tanggal range */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs underline cursor-pointer">
            Tanggal:
          </span>
          <input
            type="date"
            className="text-xs border-0 focus:outline-none bg-transparent font-medium"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-muted-foreground text-xs">s/d</span>
          <input
            type="date"
            className="text-xs border-0 focus:outline-none bg-transparent font-medium"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          {(dateFrom || dateTo) && (
            <button
              className="text-xs text-blue-600 underline ml-1"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              Semua
            </button>
          )}
        </div>

        <div className="w-px h-4 bg-border hidden sm:block" />

        {/* Admin */}
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs">Admin:</span>
          <Select value={adminFilter} onValueChange={setAdminFilter}>
            <SelectTrigger className="h-7 border-0 text-xs font-medium w-auto gap-1 px-1 shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              {adminList.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-px h-4 bg-border hidden sm:block" />

        {/* Batch Pengiriman */}
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            Batch Pengiriman:
          </span>
          <Select value={batchFilter} onValueChange={setBatchFilter}>
            <SelectTrigger className="h-7 border-0 text-xs font-medium w-auto gap-1 px-1 shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              {batchList.map((b: any) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.namaKapal || `Batch #${b.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-px h-4 bg-border hidden sm:block" />

        {/* Status bayar */}
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs">Status bayar:</span>
          <Select value={statusBayar} onValueChange={setStatusBayar}>
            <SelectTrigger className="h-7 border-0 text-xs font-medium w-auto gap-1 px-1 shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              <SelectItem value="lunas">Lunas</SelectItem>
              <SelectItem value="sebagian">Sebagian</SelectItem>
              <SelectItem value="piutang">Piutang</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-px h-4 bg-border hidden sm:block" />

        {/* Status paket */}
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs">Status paket:</span>
          <Select value={statusPaket} onValueChange={setStatusPaket}>
            <SelectTrigger className="h-7 border-0 text-xs font-medium w-auto gap-1 px-1 shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="diserahkan">Diserahkan</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Badge variant="secondary" className="ml-auto text-[10px]">
          {rangeLabel}
        </Badge>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="border-b bg-white px-6">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-blue-600 text-blue-700 bg-blue-50"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      <div className="px-6 py-4 space-y-4">
        {/* ── RINGKASAN ─────────────────────────────────────────────────── */}
        {activeTab === "Ringkasan" && (
          <>
            {/* KPI cards */}
            <div className="flex flex-wrap gap-0 border border-slate-200 rounded overflow-hidden">
              <KpiTotalTagihan
                value={kpi.totalTagihan}
                count={filteredPackages.length}
              />
              <KpiCard
                label="Dibayar"
                value={kpi.dibayar}
                sub="periode terpilih"
                textColor="text-green-700"
                borderColor="border-green-400"
              />
              <KpiCard
                label="Belum Dibayar"
                value={kpi.belumDibayar}
                sub="piutang aktif"
                textColor="text-orange-600"
                borderColor="border-orange-400"
              />
            </div>

            {/* Transaction table */}
            <Card className="overflow-hidden">
              <TrxTable payments={filteredPayments} pkgMap={pkgMap} />
            </Card>
          </>
        )}

        {/* ── TRANSAKSI ─────────────────────────────────────────────────── */}
        {activeTab === "Transaksi" && (
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <p className="font-semibold text-sm">Daftar Transaksi</p>
              <Badge variant="secondary">
                {filteredPayments.length} transaksi
              </Badge>
            </div>
            <TrxTable payments={filteredPayments} pkgMap={pkgMap} />
          </Card>
        )}

        {/* ── PEMBAYARAN ────────────────────────────────────────────────── */}
        {activeTab === "Pembayaran" && (
          <div className="space-y-4">
            {/* Method cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "tunai", label: "Tunai", color: "border-l-green-500" },
                {
                  key: "transfer",
                  label: "Transfer",
                  color: "border-l-blue-500",
                },
                {
                  key: "piutang",
                  label: "Piutang",
                  color: "border-l-amber-500",
                },
              ].map((m) => (
                <Card key={m.key} className={`border-l-4 ${m.color} p-4`}>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {m.label}
                  </p>
                  <p className="text-xl font-black mt-1">
                    {formatRp(byMethod[m.key]?.amount ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {byMethod[m.key]?.count ?? 0} transaksi
                  </p>
                </Card>
              ))}
            </div>
            <Card className="overflow-hidden">
              <TrxTable payments={filteredPayments} pkgMap={pkgMap} />
            </Card>
          </div>
        )}

        {/* ── PAKET ─────────────────────────────────────────────────────── */}
        {activeTab === "Paket" && (
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <p className="font-semibold text-sm">
                Daftar Paket — {svc.label}
              </p>
              <Badge variant="secondary">{filteredPackages.length} paket</Badge>
            </div>
            <PaketTable packages={filteredPackages} />
          </Card>
        )}
      </div>
    </div>
  );
}
