import { useEffect, useMemo, useState } from "react";
import { useListPackages, useListBatches } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Download, FileDown, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import * as XLSX from "xlsx";
import OwnerFinanceTransactions from "./finance-transactions";
import { addExportInfoSheet, saveTabularPdf } from "@/lib/export-utils";
import { useAuth } from "@/lib/auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRp(n: number) {
  return `Rp${Math.round(n).toLocaleString("id-ID")}`;
}
function todayIso() {
  return new Date().toISOString().split("T")[0];
}
function isoDateOf(d: string | null | undefined) {
  if (!d) return "";
  return d.includes("T") ? d.split("T")[0] : d;
}
function formatDateLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SERVICE_SLUG: Record<string, string> = {
  "jastip pesawat": "pesawat",
  "jastip hemat+": "hemat",
  "jastip kargo": "kargo",
  "jastip pelni": "pelni",
};

const SERVICE_LABELS: Record<string, string> = {
  "jastip pesawat": "Pesawat",
  "jastip hemat+": "Hemat+",
  "jastip kargo": "Kargo",
  "jastip pelni": "Pelni",
};

// ─── KPI Card (solid colored background) ─────────────────────────────────────

function KpiCard({
  title,
  subtitle,
  value,
  sub,
  bg,
  onClick,
}: {
  title: string;
  subtitle?: string;
  value: string;
  sub: string;
  bg: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-xl px-5 py-4 cursor-pointer select-none transition-opacity hover:opacity-90 ${bg}`}
      onClick={onClick}
    >
      <p className="text-[11px] font-bold uppercase tracking-widest opacity-80 leading-tight">
        {title}
      </p>
      {subtitle && (
        <p className="text-[10px] opacity-60 leading-tight mt-0.5">
          {subtitle}
        </p>
      )}
      <p className="text-2xl font-black tracking-tight leading-none mt-2">
        {value}
      </p>
      <p className="text-xs opacity-70 mt-1">{sub}</p>
    </div>
  );
}

// ─── Method Card ──────────────────────────────────────────────────────────────

function MethodCard({
  label,
  amount,
  count,
  onClick,
}: {
  label: string;
  amount: number;
  count: number;
  onClick?: () => void;
}) {
  return (
    <div
      className="bg-white border rounded-xl px-5 py-4 cursor-pointer hover:shadow-sm transition-shadow"
      onClick={onClick}
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
        {label}
      </p>
      <p className="text-xl font-black">{formatRp(amount)}</p>
      <p className="text-xs text-muted-foreground mt-1">{count} transaksi</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OwnerFinance() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // ── Filters ──────────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [adminFilter, setAdminFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [metodeFilter, setMetodeFilter] = useState("all");
  const [layananFilter, setLayananFilter] = useState("all");

  // ── Raw data ─────────────────────────────────────────────────────────────
  const { data: packages, isLoading: pkgLoading } = useListPackages();
  const { data: batches } = useListBatches();
  const [payments, setPayments] = useState<any[]>([]);
  const [pengeluaran, setPengeluaran] = useState<any[]>([]);
  const [loadingPay, setLoadingPay] = useState(true);

  // UI state
  const [showTrxDetail, setShowTrxDetail] = useState(false);
  const [activeMethod, setActiveMethod] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("jaj_token");
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch("/api/payments", { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/pengeluaran", { headers }).then((r) =>
        r.ok ? r.json() : [],
      ),
    ])
      .then(([pay, pen]) => {
        setPayments(pay);
        setPengeluaran(pen);
        setLoadingPay(false);
      })
      .catch(() => setLoadingPay(false));
  }, []);

  // ── Derived: unique admin list from payments ──────────────────────────────
  const adminList = useMemo(() => {
    const names = new Set<string>();
    payments.forEach((p) => {
      if (p.adminName) names.add(p.adminName);
    });
    return [...names].sort();
  }, [payments]);

  // ── Package map: id → pkg ─────────────────────────────────────────────────
  const pkgMap = useMemo(() => {
    const m = new Map<number, any>();
    (packages || []).forEach((p) => m.set(p.id, p));
    return m;
  }, [packages]);

  // ── Helper: does a payment touch the selected batch? ─────────────────────
  function paymentInBatch(p: any, batchId: string) {
    if (batchId === "all") return true;
    const ids: number[] = p.packageIds || [];
    const firstPackage = ids.length ? pkgMap.get(ids[0]) : null;
    return String(firstPackage?.batchId) === batchId;
  }

  // ── Filtered payments ─────────────────────────────────────────────────────
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const d = isoDateOf(p.createdAt);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      if (adminFilter !== "all" && p.adminName !== adminFilter) return false;
      if (metodeFilter !== "all" && p.paymentType !== metodeFilter)
        return false;
      if (batchFilter !== "all" && !paymentInBatch(p, batchFilter))
        return false;
      if (layananFilter !== "all") {
        const ids: number[] = p.packageIds || [];
        if (!ids.some((id) => pkgMap.get(id)?.serviceType === layananFilter))
          return false;
      }
      return true;
    });
  }, [
    payments,
    dateFrom,
    dateTo,
    adminFilter,
    batchFilter,
    metodeFilter,
    layananFilter,
    pkgMap,
  ]);

  const receivedPayments = filteredPayments;

  // ── Filtered pengeluaran ──────────────────────────────────────────────────
  const filteredPengeluaran = useMemo(() => {
    return pengeluaran.filter((e) => {
      if (dateFrom && e.tanggal < dateFrom) return false;
      if (dateTo && e.tanggal > dateTo) return false;
      return true;
    });
  }, [pengeluaran, dateFrom, dateTo]);

  // ── Filtered packages (for service table) ────────────────────────────────
  const filteredPackages = useMemo(() => {
    return (packages || []).filter((p: any) => {
      const d = isoDateOf(p.packageDate || p.createdAt);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      if (layananFilter !== "all" && p.serviceType !== layananFilter)
        return false;
      if (batchFilter !== "all" && String(p.batchId) !== batchFilter)
        return false;
      return true;
    });
  }, [packages, dateFrom, dateTo, layananFilter, batchFilter]);

  // ── KPI ───────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const pembayaranDiterima = receivedPayments.reduce(
      (s, p) => s + Number(p.totalAmount || 0),
      0,
    );

    const totalPengeluaran = filteredPengeluaran.reduce(
      (s, e) => s + Number(e.nominal ?? 0),
      0,
    );

    const arusKas = pembayaranDiterima - totalPengeluaran;

    // Piutang terbuka: all-time, but respect admin/layanan/batch filters
    const piutangPayments = payments.filter((p) => {
      if (p.paymentType !== "piutang") return false;
      if (adminFilter !== "all" && p.adminName !== adminFilter) return false;
      if (batchFilter !== "all" && !paymentInBatch(p, batchFilter))
        return false;
      if (layananFilter !== "all") {
        const ids: number[] = p.packageIds || [];
        if (!ids.some((id) => pkgMap.get(id)?.serviceType === layananFilter))
          return false;
      }
      return true;
    });
    const piutangTerbuka = piutangPayments.reduce(
      (s, p) => s + Number(p.totalAmount ?? 0),
      0,
    );

    return { pembayaranDiterima, totalPengeluaran, arusKas, piutangTerbuka };
  }, [
    receivedPayments,
    filteredPengeluaran,
    payments,
    adminFilter,
    batchFilter,
    layananFilter,
    pkgMap,
  ]);

  // ── Method breakdown ──────────────────────────────────────────────────────
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

  // ── Total paid by service (uses the same received payments as the KPI) ──
  // Matches admin riwayat-pembayaran: the first package determines the service
  // group and receives the full transaction amount.
  const paidByService = useMemo(() => {
    const map: Record<string, number> = {};
    receivedPayments.forEach((p) => {
      const ids: number[] = p.packageIds ?? [];
      const totalPaid = Number(p.totalAmount || 0);
      const svc =
        p.packageSummary?.[0]?.serviceType ||
        (ids.length ? pkgMap.get(ids[0])?.serviceType : null);
      if (!svc || (layananFilter !== "all" && svc !== layananFilter)) return;
      map[svc] = (map[svc] || 0) + totalPaid;
    });
    return map;
  }, [receivedPayments, pkgMap, layananFilter]);

  // ── Service table ─────────────────────────────────────────────────────────
  const serviceRows = useMemo(() => {
    const svcMap: Record<
      string,
      {
        sisa: number;
        diserahkan: number;
        totalPkg: number;
      }
    > = {};

    filteredPackages.forEach((p: any) => {
      const svc = p.serviceType || "lainnya";
      if (!svcMap[svc]) svcMap[svc] = { sisa: 0, diserahkan: 0, totalPkg: 0 };
      const ship = Number(p.totalShipping || 0);
      svcMap[svc].totalPkg += 1;
      if (
        p.statusPengambilan === "SUDAH_DIAMBIL" ||
        p.status === "diserahkan"
      ) {
        svcMap[svc].diserahkan += 1;
      } else {
        svcMap[svc].sisa += ship;
      }
    });

    return Object.entries(svcMap)
      .map(([svc, d]) => {
        const totalPaid = paidByService[svc] || 0;
        return {
          svc,
          label: SERVICE_LABELS[svc] || svc,
          ...d,
          totalPaid,
          tagihan: totalPaid + d.sisa,
        };
      })
      .sort((a, b) => b.tagihan - a.tagihan);
  }, [filteredPackages, paidByService]);

  // ── Transactions for detail panel ─────────────────────────────────────────
  const detailTrx = useMemo(() => {
    return [...filteredPayments]
      .filter((p) => activeMethod === null || p.paymentType === activeMethod)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [filteredPayments, activeMethod]);

  // ── Export Excel ──────────────────────────────────────────────────────────
  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const rangeStr =
      !dateFrom && !dateTo
        ? "Semua"
        : `${dateFrom || "—"} s/d ${dateTo || "—"}`;
    addExportInfoSheet(wb, "Laporan Keuangan — Jastip Anggun Jaya", {
      Periode: rangeStr,
      Layanan: layananFilter === "all" ? "Semua" : SERVICE_LABELS[layananFilter] || layananFilter,
      Batch: batchFilter === "all"
        ? "Semua"
        : batchList.find((batch: any) => String(batch.id) === batchFilter)?.namaKapal || batchFilter,
      Status: "Semua",
      Kasir: adminFilter === "all" ? "Semua" : adminFilter,
      "Diekspor Oleh": user?.name || "Pengguna aktif",
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Laporan Keuangan Jastip Anggun Jaya"],
        ["Periode", rangeStr],
        ["Admin", adminFilter === "all" ? "Semua" : adminFilter],
        [
          "Layanan",
          layananFilter === "all"
            ? "Semua"
            : SERVICE_LABELS[layananFilter] || layananFilter,
        ],
        [],
        ["PEMBAYARAN DITERIMA", kpi.pembayaranDiterima],
        ["PENGELUARAN", kpi.totalPengeluaran],
        ["ARUS KAS BERSIH", kpi.arusKas],
        ["PIUTANG TERBUKA", kpi.piutangTerbuka],
      ]),
      "Ringkasan",
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        serviceRows.map((r) => ({
          Layanan: r.label,
          "Tagihan (Rp)": r.tagihan,
          "Total yang sudah dibayar (Rp)": r.totalPaid,
          "Sisa Tagihan (Rp)": r.sisa,
          "Paket Diserahkan": r.diserahkan,
          "Total Paket": r.totalPkg,
        })),
      ),
      "Per Jenis Jastip",
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        filteredPayments.map((p) => ({
          Waktu: formatTime(p.createdAt),
          Admin: p.adminName || "-",
          Metode: p.paymentType,
          "Total Tagihan (Rp)": Number(p.totalAmount || 0),
          "Dibayar (Rp)": Number(p.paidAmount || p.totalAmount || 0),
          Keterangan: p.notes || "",
        })),
      ),
      "Transaksi",
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        filteredPengeluaran.map((e) => ({
          Tanggal: e.tanggal,
          Kategori: e.kategori,
          "Nominal (Rp)": Number(e.nominal || 0),
          Metode: e.metodePembayaran,
          Keterangan: e.keterangan || "",
        })),
      ),
      "Pengeluaran",
    );

    XLSX.writeFile(wb, `keuangan-${dateFrom || "all"}_${dateTo || "all"}.xlsx`);
  }

  function exportPdf() {
    const rangeStr =
      !dateFrom && !dateTo
        ? "Semua"
        : `${dateFrom || "—"} s/d ${dateTo || "—"}`;
    const filters = {
      Periode: rangeStr,
      Layanan: layananFilter === "all" ? "Semua" : SERVICE_LABELS[layananFilter] || layananFilter,
      Batch: batchFilter === "all"
        ? "Semua"
        : batchList.find((batch: any) => String(batch.id) === batchFilter)?.namaKapal || batchFilter,
      Metode: metodeFilter === "all" ? "Semua" : metodeFilter,
      Status: "Semua",
      Kasir: adminFilter === "all" ? "Semua" : adminFilter,
      "Diekspor Oleh": user?.name || "Pengguna aktif",
    };
    saveTabularPdf({
      filename: `keuangan-${dateFrom || "all"}_${dateTo || "all"}.pdf`,
      title: "Laporan Keuangan — Jastip Anggun Jaya",
      filters,
      columns: ["Jenis Data", "Waktu/Tanggal", "Admin/Kategori", "Metode", "Nominal (Rp)", "Keterangan"],
      rows: [
        ...filteredPayments.map((p) => [
          "Pembayaran",
          formatTime(p.createdAt),
          p.adminName || "-",
          p.paymentType,
          Number(p.totalAmount || 0),
          p.notes || "",
        ]),
        ...filteredPengeluaran.map((e) => [
          "Pengeluaran",
          e.tanggal,
          e.kategori,
          e.metodePembayaran,
          Number(e.nominal || 0),
          e.keterangan || "",
        ]),
      ],
      summaryRows: [
        ["Pembayaran Diterima", formatRp(kpi.pembayaranDiterima)],
        ["Pengeluaran", formatRp(kpi.totalPengeluaran)],
        ["Arus Kas Bersih", formatRp(kpi.arusKas)],
        ["Piutang Terbuka", formatRp(kpi.piutangTerbuka)],
      ],
      landscape: true,
      exportedBy: user?.name || "Pengguna aktif",
    });
  }

  const isLoading = pkgLoading || loadingPay;
  const dateLabel =
    !dateFrom && !dateTo
      ? "Semua tanggal"
      : dateFrom === dateTo
        ? formatDateLabel(dateFrom)
        : `${dateFrom} — ${dateTo}`;

  // Batches that have at least one payment — same logic as riwayat-pembayaran
  const batchList = useMemo(() => {
    // Collect batchIds that appear in payments (via packageIds → pkgMap)
    const activeBatchIds = new Set<number>();
    for (const pmt of payments as any[]) {
      const ids: number[] = pmt.packageIds ?? [];
      for (const id of ids) {
        const bid = pkgMap.get(id)?.batchId;
        if (bid != null) activeBatchIds.add(bid);
      }
    }
    return [...(batches || [])]
      .filter((b: any) => activeBatchIds.has(b.id))
      .sort(
        (a: any, b: any) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );
  }, [batches, payments, pkgMap]);

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">
            Laporan Keuangan
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Seluruh penerimaan, pengeluaran, piutang, dan status closing
          </p>
        </div>
        <div className="flex gap-2 self-start">
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-2">
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} className="gap-2">
            <FileDown className="w-4 h-4" /> Export PDF
          </Button>
        </div>
      </div>

      <OwnerFinanceTransactions />

      {/* ── Filter Bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-center border-b pb-3">
        {/* Date range */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Dari
          </span>
          <input
            type="date"
            className="text-sm font-medium border rounded-md px-2 py-1 bg-background h-8 focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">s/d</span>
          <input
            type="date"
            className="text-sm font-medium border rounded-md px-2 py-1 bg-background h-8 focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          {(dateFrom || dateTo) && (
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              Semua
            </button>
          )}
        </div>

        {/* Admin */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Admin</span>
          <Select value={adminFilter} onValueChange={setAdminFilter}>
            <SelectTrigger className="h-8 text-sm w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              {adminList.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Batch Pengiriman */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Batch Pengiriman
          </span>
          <Select value={batchFilter} onValueChange={setBatchFilter}>
            <SelectTrigger className="h-8 text-sm w-[160px]">
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

        {/* Metode */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Metode</span>
          <Select value={metodeFilter} onValueChange={setMetodeFilter}>
            <SelectTrigger className="h-8 text-sm w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              <SelectItem value="tunai">Tunai</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="piutang">Piutang</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Jenis Jastip */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Jenis Jastip
          </span>
          <Select value={layananFilter} onValueChange={setLayananFilter}>
            <SelectTrigger className="h-8 text-sm w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              <SelectItem value="jastip pesawat">Pesawat</SelectItem>
              <SelectItem value="jastip hemat+">Hemat+</SelectItem>
              <SelectItem value="jastip kargo">Kargo</SelectItem>
              <SelectItem value="jastip pelni">Pelni</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ── KPI Cards ───────────────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Pembayaran Diterima"
              subtitle="uang benar-benar diterima"
              value={formatRp(kpi.pembayaranDiterima)}
              sub={`${receivedPayments.length} transaksi`}
              bg="bg-emerald-500 text-white"
              onClick={() => {
                setActiveMethod(null);
                setShowTrxDetail(true);
              }}
            />
            <KpiCard
              title="Pengeluaran"
              subtitle="operasional hari ini"
              value={formatRp(kpi.totalPengeluaran)}
              sub={`${filteredPengeluaran.length} item pengeluaran`}
              bg="bg-orange-500 text-white"
              onClick={() => setLocation("/owner/pengeluaran")}
            />
            <KpiCard
              title="Arus Kas Bersih"
              subtitle="penerimaan − pengeluaran − refund"
              value={formatRp(kpi.arusKas)}
              sub={kpi.arusKas >= 0 ? "positif" : "defisit"}
              bg={
                kpi.arusKas >= 0
                  ? "bg-blue-500 text-white"
                  : "bg-red-500 text-white"
              }
            />
            <KpiCard
              title="Piutang Terbuka"
              subtitle="belum lunas/sebagian"
              value={formatRp(kpi.piutangTerbuka)}
              sub={`${payments.filter((p) => p.paymentType === "piutang").length} transaksi`}
              bg="bg-amber-400 text-amber-950"
              onClick={() => {
                setMetodeFilter("piutang");
                setDateFrom("");
                setDateTo("");
              }}
            />
          </div>

          {/* ── Method Breakdown ─────────────────────────────────────────────── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
              Penerimaan Berdasarkan Metode Pembayaran
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <MethodCard
                label="Tunai"
                amount={byMethod.tunai?.amount ?? 0}
                count={byMethod.tunai?.count ?? 0}
                onClick={() => {
                  setActiveMethod("tunai");
                  setShowTrxDetail(true);
                }}
              />
              <MethodCard
                label="Transfer"
                amount={byMethod.transfer?.amount ?? 0}
                count={byMethod.transfer?.count ?? 0}
                onClick={() => {
                  setActiveMethod("transfer");
                  setShowTrxDetail(true);
                }}
              />
              <MethodCard
                label="Piutang"
                amount={byMethod.piutang?.amount ?? 0}
                count={byMethod.piutang?.count ?? 0}
                onClick={() => {
                  setActiveMethod("piutang");
                  setShowTrxDetail(true);
                }}
              />
            </div>
          </div>

          {/* ── Service Summary Table ─────────────────────────────────────────── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
              Ringkasan Per Jenis Jastip
            </p>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">
                        Jenis Jastip
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">
                        Tagihan
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">
                        Total yang sudah dibayar
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">
                        Sisa Tagihan
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">
                        Paket diserahkan
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-12 text-center text-muted-foreground text-sm"
                        >
                          Belum ada data untuk periode ini
                        </td>
                      </tr>
                    ) : (
                      serviceRows.map((row) => (
                        <tr
                          key={row.svc}
                          className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
                          onClick={() =>
                            setLocation(
                              `/owner/finance/${SERVICE_SLUG[row.svc] || encodeURIComponent(row.svc)}${batchFilter !== "all" ? `?batch=${encodeURIComponent(batchFilter)}` : ""}`,
                            )
                          }
                        >
                          <td className="py-3 px-4 font-medium whitespace-nowrap">
                            {row.label}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold whitespace-nowrap">
                            {formatRp(row.tagihan)}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {row.totalPaid > 0 ? (
                              <span className="font-semibold">
                                {formatRp(row.totalPaid)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {row.sisa > 0 ? (
                              <span className="font-semibold">
                                {formatRp(row.sisa)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <span
                              className={`font-bold ${row.diserahkan > 0 ? "" : "text-muted-foreground"}`}
                            >
                              {row.diserahkan}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {serviceRows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 bg-muted/10 font-bold">
                        <td className="py-3 px-4">Total</td>
                        <td className="py-3 px-4 text-right">
                          {formatRp(
                            serviceRows.reduce((s, r) => s + r.tagihan, 0),
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {formatRp(
                            serviceRows.reduce((s, r) => s + r.totalPaid, 0),
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {formatRp(
                            serviceRows.reduce((s, r) => s + r.sisa, 0),
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {serviceRows.reduce((s, r) => s + r.diserahkan, 0)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>
          </div>

          {/* ── Transaction Detail (collapsible) ─────────────────────────────── */}
          <div>
            <button
              className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors mb-2.5"
              onClick={() => setShowTrxDetail((v) => !v)}
            >
              {showTrxDetail ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              Detail Transaksi Pembayaran
              {activeMethod && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-muted text-[10px] normal-case font-normal capitalize">
                  {activeMethod}
                  <button
                    className="ml-1 opacity-60 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMethod(null);
                    }}
                  >
                    ×
                  </button>
                </span>
              )}
              <span className="ml-1 px-1.5 py-0.5 rounded border text-[10px] font-normal">
                {detailTrx.length} transaksi
              </span>
            </button>

            {showTrxDetail && (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">
                          Jam
                        </th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">
                          Admin
                        </th>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">
                          Tagihan
                        </th>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">
                          Dibayar
                        </th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">
                          Metode
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailTrx.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-10 text-center text-muted-foreground"
                          >
                            Belum ada transaksi
                          </td>
                        </tr>
                      ) : (
                        detailTrx.map((p, i) => {
                          const isPiutang = p.paymentType === "piutang";
                          return (
                            <tr
                              key={p.id}
                              className={`border-b transition-colors ${i % 2 === 1 ? "bg-muted/5" : ""} hover:bg-muted/20`}
                            >
                              <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap font-mono text-xs">
                                {formatTime(p.createdAt)}
                              </td>
                              <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                                {p.adminName || "—"}
                              </td>
                              <td className="py-2.5 px-3 text-right whitespace-nowrap font-medium">
                                {formatRp(Number(p.totalAmount || 0))}
                              </td>
                              <td className="py-2.5 px-3 text-right whitespace-nowrap font-semibold">
                                {isPiutang ? (
                                  <span className="text-amber-700">
                                    {formatRp(Number(p.paidAmount || 0))}
                                  </span>
                                ) : (
                                  <span className="text-green-700">
                                    {formatRp(
                                      Number(
                                        p.paidAmount ?? p.totalAmount ?? 0,
                                      ),
                                    )}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                    p.paymentType === "tunai"
                                      ? "bg-green-100 text-green-800"
                                      : p.paymentType === "transfer"
                                        ? "bg-blue-100 text-blue-800"
                                        : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {p.paymentType === "tunai"
                                    ? "Tunai"
                                    : p.paymentType === "transfer"
                                      ? "Transfer"
                                      : "Piutang"}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {detailTrx.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 bg-muted/10 font-bold">
                          <td className="py-2.5 px-3" colSpan={2}>
                            Total ({detailTrx.length} transaksi)
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {formatRp(
                              detailTrx.reduce(
                                (s, p) => s + Number(p.totalAmount || 0),
                                0,
                              ),
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-green-700">
                            {formatRp(
                              detailTrx
                                .filter((p) => p.paymentType !== "piutang")
                                .reduce(
                                  (s, p) =>
                                    s +
                                    Number(p.paidAmount ?? p.totalAmount ?? 0),
                                  0,
                                ),
                            )}
                          </td>
                          <td colSpan={1} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </Card>
            )}
          </div>

          {/* ── Quick link ───────────────────────────────────────────────────── */}
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground text-xs gap-1.5"
              onClick={() => setLocation("/owner/pengeluaran")}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Kelola pengeluaran operasional
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
