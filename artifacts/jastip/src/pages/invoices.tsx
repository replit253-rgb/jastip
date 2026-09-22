import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Printer,
  Download,
  Plus,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  Eye,
  Ship,
  PackageCheck,
  Calendar,
  DollarSign,
  Tag,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Filter,
  User,
  Phone,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination } from "@/components/pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { buildInvoiceDocument, downloadInvoicePdf, type InvoicePrintPayload } from "@/lib/print-invoice";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("jaj_token")}` };
}

function formatRp(value: unknown) {
  return `Rp${Math.round(Number(value ?? 0)).toLocaleString("id-ID")}`;
}

function statusLabel(status?: string | null) {
  if (!status) return "-";
  return String(status).replace(/_/g, " ");
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const isAdminOrOwner = user?.role === "admin" || user?.role === "owner";

  // Data states
  const [invoices, setInvoices] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [packageInvoiceMap, setPackageInvoiceMap] = useState<
    Record<number, Array<{ invoiceId: number; invoiceNo: string; status: string; issuedAt: string }>>
  >({});
  const [loadingData, setLoadingData] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<string>("manual-select");

  // Filter & Search states for package selection
  const [searchCustomer, setSearchCustomer] = useState("");
  const [filterInvoiceStatus, setFilterInvoiceStatus] = useState<"all" | "no_invoice" | "has_invoice">("no_invoice");
  const [filterBatch, setFilterBatch] = useState<string>("all");
  const [filterService, setFilterService] = useState<string>("all");

  // Selection states
  const [selectedPackageIds, setSelectedPackageIds] = useState<number[]>([]);

  // Invoice creation form states
  const [invoiceCustomerName, setInvoiceCustomerName] = useState("");
  const [invoiceCustomerPhone, setInvoiceCustomerPhone] = useState("");
  const [invoiceDiscount, setInvoiceDiscount] = useState("");
  const [invoiceDownPayment, setInvoiceDownPayment] = useState("");
  const [invoiceDueAt, setInvoiceDueAt] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Dialog for Package Detail inspection
  const [inspectPackage, setInspectPackage] = useState<any | null>(null);

  // Success Created Modal
  const [createdInvoice, setCreatedInvoice] = useState<any | null>(null);

  // Legacy Transaction form state
  const [transactionId, setTransactionId] = useState("");

  // Search in Invoice List
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>("all");

  // Load all required data
  async function loadAllData() {
    setLoadingData(true);
    setFeedbackMessage(null);
    try {
      const headers = authHeaders();
      const [resInvoices, resTransactions, resPackages, resBatches, resPkgMap] = await Promise.all([
        fetch("/api/invoices", { headers }),
        fetch("/api/transactions", { headers }),
        fetch("/api/packages", { headers }),
        fetch("/api/batches", { headers }),
        fetch("/api/invoices/package-map", { headers }),
      ]);

      if (resInvoices.ok) setInvoices(await resInvoices.json());
      if (resTransactions.ok) setTransactions(await resTransactions.json());
      if (resPackages.ok) {
        const body = await resPackages.json();
        setPackages(Array.isArray(body) ? body : body.packages ?? []);
      }
      if (resBatches.ok) setBatches(await resBatches.json());
      if (resPkgMap.ok) setPackageInvoiceMap(await resPkgMap.json());
    } catch {
      setFeedbackMessage({ type: "error", text: "Gagal memuat data dari server." });
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    loadAllData();
  }, []);

  // Map batchId -> Batch object
  const batchMap = useMemo(() => {
    const map = new Map<number, any>();
    for (const b of batches) {
      map.set(b.id, b);
    }
    return map;
  }, [batches]);

  // Filtered packages based on search & filters
  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      // Search by Customer name or resi / item name / package number
      if (searchCustomer.trim()) {
        const query = searchCustomer.toLowerCase().trim();
        const cName = (pkg.customerName || "").toLowerCase();
        const resi = (pkg.resiNumber || "").toLowerCase();
        const item = (pkg.itemName || "").toLowerCase();
        const pkgNum = (pkg.packageNumber || "").toLowerCase();
        const matchesQuery =
          cName.includes(query) ||
          resi.includes(query) ||
          item.includes(query) ||
          pkgNum.includes(query);
        if (!matchesQuery) return false;
      }

      // Filter by invoice presence
      const hasInvoice = (packageInvoiceMap[pkg.id]?.length ?? 0) > 0;
      if (filterInvoiceStatus === "no_invoice" && hasInvoice) return false;
      if (filterInvoiceStatus === "has_invoice" && !hasInvoice) return false;

      // Filter by batch
      if (filterBatch !== "all") {
        if (filterBatch === "no_batch" && pkg.batchId != null) return false;
        if (filterBatch !== "no_batch" && String(pkg.batchId) !== filterBatch) return false;
      }

      // Filter by service type
      if (filterService !== "all") {
        if ((pkg.serviceType || "").toLowerCase() !== filterService.toLowerCase()) return false;
      }

      return true;
    });
  }, [packages, searchCustomer, filterInvoiceStatus, filterBatch, filterService, packageInvoiceMap]);

  // Selected packages objects
  const selectedPackages = useMemo(() => {
    return packages.filter((p) => selectedPackageIds.includes(p.id));
  }, [packages, selectedPackageIds]);

  // Auto-fill customer name when selecting packages if customerName field is currently empty
  useEffect(() => {
    if (selectedPackages.length > 0) {
      const firstCust = selectedPackages[0]?.customerName;
      if (firstCust && (!invoiceCustomerName || invoiceCustomerName.trim() === "")) {
        setInvoiceCustomerName(firstCust);
      }
      const firstPhone = selectedPackages[0]?.customerPhone;
      if (firstPhone && (!invoiceCustomerPhone || invoiceCustomerPhone.trim() === "")) {
        setInvoiceCustomerPhone(firstPhone);
      }
    }
  }, [selectedPackages]);

  // Summary calculations for selected packages
  const selectedSummary = useMemo(() => {
    let totalWeight = 0;
    let subtotalOngkir = 0;
    let additionalFees = 0;

    for (const p of selectedPackages) {
      const w = Number(p.usedWeight || p.realWeight || p.weight || 0);
      totalWeight += w;
      const shipping = Number(p.totalShipping || 0);
      const addFee = Number(p.additionalFee || 0);
      subtotalOngkir += shipping;
      additionalFees += addFee;
    }

    const subtotal = subtotalOngkir + additionalFees;
    const discount = Math.max(0, Number(invoiceDiscount || 0));
    const downPayment = Math.max(0, Number(invoiceDownPayment || 0));
    const total = Math.max(0, subtotal - discount);
    const balance = Math.max(0, total - downPayment);

    return {
      count: selectedPackages.length,
      totalWeight: Math.round(totalWeight * 100) / 100,
      subtotalOngkir,
      additionalFees,
      subtotal,
      discount,
      total,
      downPayment,
      balance,
    };
  }, [selectedPackages, invoiceDiscount, invoiceDownPayment]);

  // Toggle selection of single package
  function toggleSelectPackage(id: number) {
    setSelectedPackageIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  // Select all visible packages
  function selectAllVisible() {
    const visibleIds = filteredPackages.map((p) => p.id);
    setSelectedPackageIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  }

  // Clear selection
  function clearSelection() {
    setSelectedPackageIds([]);
  }

  // Handle invoice creation from selected packages
  async function handleCreateInvoice() {
    if (selectedPackageIds.length === 0) {
      setFeedbackMessage({ type: "error", text: "Centang minimal 1 paket terlebih dahulu." });
      return;
    }
    if (!invoiceCustomerName.trim()) {
      setFeedbackMessage({ type: "error", text: "Nama customer penerima invoice wajib diisi." });
      return;
    }

    setSaving(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          packageIds: selectedPackageIds,
          customerName: invoiceCustomerName.trim(),
          customerPhone: invoiceCustomerPhone.trim() || undefined,
          notes: invoiceNotes.trim() || undefined,
          discount: Number(invoiceDiscount || 0),
          downPayment: Number(invoiceDownPayment || 0),
          dueAt: invoiceDueAt ? new Date(invoiceDueAt).toISOString() : undefined,
          reason: `Penerbitan Invoice A4 (${selectedPackageIds.length} paket)`,
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Gagal menerbitkan invoice.");

      setCreatedInvoice(body);
      setFeedbackMessage({
        type: "success",
        text: `✓ Invoice ${body.invoiceNo} untuk "${invoiceCustomerName}" berhasil diterbitkan!`,
      });

      // Reset form & selections
      setSelectedPackageIds([]);
      setInvoiceCustomerName("");
      setInvoiceCustomerPhone("");
      setInvoiceDiscount("");
      setInvoiceDownPayment("");
      setInvoiceDueAt("");
      setInvoiceNotes("");

      // Reload invoices & package map
      await loadAllData();
    } catch (err: any) {
      setFeedbackMessage({ type: "error", text: err.message || "Gagal membuat invoice." });
    } finally {
      setSaving(false);
    }
  }

  // Create invoice from transaction
  const eligibleTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.transactionStatus === "AKTIF"),
    [transactions],
  );

  async function createFromTransaction() {
    if (!transactionId) {
      setFeedbackMessage({ type: "error", text: "Pilih transaksi terlebih dahulu." });
      return;
    }
    setSaving(true);
    setFeedbackMessage(null);
    try {
      const response = await fetch(`/api/invoices/from-transaction/${transactionId}`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal membuat invoice dari transaksi.");

      setCreatedInvoice(body);
      setFeedbackMessage({
        type: "success",
        text: `✓ Invoice ${body.invoiceNo} berhasil diterbitkan dari transaksi.`,
      });
      setTransactionId("");
      await loadAllData();
    } catch (error: any) {
      setFeedbackMessage({ type: "error", text: error.message || "Gagal membuat invoice." });
    } finally {
      setSaving(false);
    }
  }

  // State for tracking PDF download
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<number | null>(null);

  // Direct download PDF
  async function downloadInvoice(id: number) {
    setDownloadingInvoiceId(id);
    try {
      const response = await fetch(`/api/invoices/${id}/print`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal menyiapkan invoice.");

      downloadInvoicePdf(body.invoice as InvoicePrintPayload, body.print);
      toast.success("File PDF invoice berhasil diunduh.");
    } catch (error: any) {
      setFeedbackMessage({ type: "error", text: error.message || "Gagal mengunduh file PDF invoice." });
      toast.error(error.message || "Gagal mengunduh PDF.");
    } finally {
      setDownloadingInvoiceId(null);
    }
  }

  // Print invoice popup
  async function printInvoice(id: number) {
    const printWindow = window.open("", "_blank", "width=900,height=1000");
    if (!printWindow) {
      setFeedbackMessage({
        type: "error",
        text: "Popup diblokir browser. Izinkan pop-up untuk mencetak atau unduh PDF langsung.",
      });
      return;
    }
    printWindow.document.write("<p style='font:14px Arial;padding:20px'>Menyiapkan dokumen invoice A4...</p>");
    printWindow.document.close();

    try {
      const response = await fetch(`/api/invoices/${id}/print`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal menyiapkan invoice.");

      printWindow.document.open();
      printWindow.document.write(
        buildInvoiceDocument(body.invoice as InvoicePrintPayload, body.print)
      );
      printWindow.document.close();
      printWindow.focus();
    } catch (error: any) {
      printWindow.close();
      setFeedbackMessage({ type: "error", text: error.message || "Gagal mencetak invoice." });
    }
  }

  // Filtered invoices list
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (invoiceSearchQuery.trim()) {
        const q = invoiceSearchQuery.toLowerCase().trim();
        const invNo = (inv.invoiceNo || "").toLowerCase();
        const cust = (inv.customerSnapshot?.customerName || "").toLowerCase();
        if (!invNo.includes(q) && !cust.includes(q)) return false;
      }
      if (invoiceStatusFilter !== "all" && inv.status !== invoiceStatusFilter) {
        return false;
      }
      return true;
    });
  }, [invoices, invoiceSearchQuery, invoiceStatusFilter]);

  // Package list pagination (Tab 1)
  const PKG_PAGE_SIZE = 10;
  const [pkgPage, setPkgPage] = useState(1);
  const totalPkgPages = Math.ceil(filteredPackages.length / PKG_PAGE_SIZE);
  const paginatedPackages = useMemo(() => {
    return filteredPackages.slice((pkgPage - 1) * PKG_PAGE_SIZE, pkgPage * PKG_PAGE_SIZE);
  }, [filteredPackages, pkgPage]);

  useEffect(() => {
    setPkgPage(1);
  }, [searchCustomer, filterInvoiceStatus, filterBatch, filterService]);

  // Invoice list pagination (Tab 2)
  const INV_PAGE_SIZE = 10;
  const [invPage, setInvPage] = useState(1);
  const totalInvPages = Math.ceil(filteredInvoices.length / INV_PAGE_SIZE);
  const paginatedInvoices = useMemo(() => {
    return filteredInvoices.slice((invPage - 1) * INV_PAGE_SIZE, invPage * INV_PAGE_SIZE);
  }, [filteredInvoices, invPage]);

  useEffect(() => {
    setInvPage(1);
  }, [invoiceSearchQuery, invoiceStatusFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-teal-600/10 flex items-center justify-center text-teal-700">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Penerbitan Invoice A4</h1>
              <p className="text-sm text-slate-500">
                Pilih dan centang paket-paket per customer secara manual untuk membuat invoice cetak A4.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAllData}
            disabled={loadingData}
            className="h-9"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingData ? "animate-spin text-teal-600" : ""}`} />
            Muat Ulang Data
          </Button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl border text-sm transition-all ${
            feedbackMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          {feedbackMessage.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          )}
          <span className="font-medium flex-1">{feedbackMessage.text}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFeedbackMessage(null)}
            className="h-7 px-2 text-xs"
          >
            Tutup
          </Button>
        </div>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-3 max-w-lg">
          <TabsTrigger value="manual-select" className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            <span>Pilih Paket & Buat Invoice</span>
          </TabsTrigger>
          <TabsTrigger value="invoice-list" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Daftar Invoice Terbit ({invoices.length})</span>
          </TabsTrigger>
          <TabsTrigger value="from-tx" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span>Dari Transaksi</span>
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: PILIH PAKET MANUAL & BUAT INVOICE ───────────────────────────────── */}
        <TabsContent value="manual-select" className="space-y-5">
          {/* Quick search and filter bar */}
          <Card className="border shadow-xs">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
                {/* Search Customer Input */}
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={searchCustomer}
                    onChange={(e) => setSearchCustomer(e.target.value)}
                    placeholder="🔍 Cari nama customer (misal: andi), nomor resi, isi barang..."
                    className="pl-10 h-11 text-sm bg-slate-50/50 focus-visible:bg-white border-slate-200"
                  />
                  {searchCustomer && (
                    <button
                      onClick={() => setSearchCustomer("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700 font-bold px-1.5 py-0.5 rounded-full"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Penanda Status Invoice */}
                <div className="flex items-center gap-2">
                  <Select
                    value={filterInvoiceStatus}
                    onValueChange={(v: any) => setFilterInvoiceStatus(v)}
                  >
                    <SelectTrigger className="h-11 w-full lg:w-56 text-xs">
                      <SelectValue placeholder="Status Invoice" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Status Invoice</SelectItem>
                      <SelectItem value="no_invoice">⏳ Belum Ada Invoice (Disarankan)</SelectItem>
                      <SelectItem value="has_invoice">✓ Sudah Ada Invoice</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Filter Batch / Kapal */}
                  <Select value={filterBatch} onValueChange={setFilterBatch}>
                    <SelectTrigger className="h-11 w-full lg:w-52 text-xs">
                      <SelectValue placeholder="Semua Batch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Batch / Kapal</SelectItem>
                      <SelectItem value="no_batch">Tanpa Batch</SelectItem>
                      {batches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.shipName} {b.batchCode ? `(${b.batchCode})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Filter Layanan Jastip */}
                  <Select value={filterService} onValueChange={setFilterService}>
                    <SelectTrigger className="h-11 w-full lg:w-44 text-xs">
                      <SelectValue placeholder="Layanan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Layanan</SelectItem>
                      <SelectItem value="jastip pesawat">Jastip Pesawat</SelectItem>
                      <SelectItem value="jastip pelni">Jastip Pelni</SelectItem>
                      <SelectItem value="jastip hemat+">Jastip Hemat+</SelectItem>
                      <SelectItem value="jastip kargo">Jastip Kargo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Action row / selection badges */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">
                    Menampilkan {filteredPackages.length} paket
                  </span>
                  {searchCustomer && (
                    <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">
                      Pencarian: "{searchCustomer}"
                    </Badge>
                  )}
                  {filterInvoiceStatus === "no_invoice" && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      Hanya Belum Ada Invoice
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllVisible}
                    disabled={filteredPackages.length === 0}
                    className="h-7 text-xs"
                  >
                    Centang Semua ({filteredPackages.length})
                  </Button>
                  {selectedPackageIds.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSelection}
                      className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    >
                      Batal Pilih ({selectedPackageIds.length})
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grid Layout: Left Column = Package Checklist Table, Right Column = Form Pembuatan Invoice */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Package Checklist Cards (7 cols) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-teal-600" />
                  Daftar Paket ({filteredPackages.length})
                </h2>
                <span className="text-xs text-slate-500">
                  Centang paket yang benar-benar atas nama customer yang diinginkan
                </span>
              </div>

              {filteredPackages.length === 0 ? (
                <Card className="border-dashed bg-slate-50/50">
                  <CardContent className="py-12 text-center text-slate-500 space-y-2">
                    <PackageCheck className="h-10 w-10 mx-auto text-slate-300" />
                    <p className="font-semibold text-slate-700">Tidak ada paket yang sesuai</p>
                    <p className="text-xs text-slate-400">
                      Coba ganti kata kunci nama customer atau ubah filter status invoice di atas.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2.5">
                  {paginatedPackages.map((pkg) => {
                    const isSelected = selectedPackageIds.includes(pkg.id);
                    const existingInvoices = packageInvoiceMap[pkg.id] || [];
                    const hasInvoice = existingInvoices.length > 0;
                    const batchInfo = pkg.batchId ? batchMap.get(pkg.batchId) : null;
                    const weightNum = Number(pkg.usedWeight || pkg.realWeight || pkg.weight || 0);

                    return (
                      <div
                        key={pkg.id}
                        className={`rounded-xl border transition-all p-3.5 flex flex-col gap-2.5 ${
                          isSelected
                            ? "bg-teal-50/70 border-teal-500 ring-2 ring-teal-500/20 shadow-xs"
                            : hasInvoice
                            ? "bg-slate-50/80 border-slate-200 opacity-90"
                            : "bg-white border-slate-200 hover:border-teal-300 shadow-xs"
                        }`}
                      >
                        {/* Row 1: Checkbox + Customer Name + Invoice Status Badge */}
                        <div className="flex items-start justify-between gap-3">
                          <label
                            className="flex items-start gap-3 cursor-pointer select-none flex-1 min-w-0"
                            onClick={(e) => {
                              e.preventDefault();
                              toggleSelectPackage(pkg.id);
                            }}
                          >
                            <div className="mt-0.5">
                              {isSelected ? (
                                <div className="w-5 h-5 rounded bg-teal-600 text-white flex items-center justify-center">
                                  <CheckSquare className="w-4 h-4" />
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded border-2 border-slate-300 hover:border-teal-500 bg-white" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-slate-900 text-sm">
                                  {pkg.customerName || "Tanpa Nama"}
                                </span>
                                {pkg.customerPhone && (
                                  <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-slate-400" />
                                    {pkg.customerPhone}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-medium text-slate-600 mt-0.5">
                                {pkg.itemName || "Paket Jastip"} · Resi:{" "}
                                <span className="font-mono font-bold text-slate-800">
                                  {pkg.resiNumber || "-"}
                                </span>
                              </p>
                            </div>
                          </label>

                          {/* Invoice indicator badge */}
                          <div className="shrink-0 flex items-center gap-1.5">
                            {hasInvoice ? (
                              <div className="flex flex-col items-end gap-1">
                                {existingInvoices.map((inv) => (
                                  <button
                                    key={inv.invoiceId}
                                    onClick={() => printInvoice(inv.invoiceId)}
                                    title="Klik untuk cetak / lihat invoice"
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 transition-colors"
                                  >
                                    <FileText className="w-3 h-3" />
                                    {inv.invoiceNo}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-slate-100 text-slate-600 border-slate-200 text-[11px]"
                              >
                                Belum Ber-Invoice
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Row 2: Batch, Service Type, Physical Spec, & Price */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
                          {/* Batch / Kapal */}
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-slate-400">
                              Batch Pengiriman
                            </span>
                            <span className="font-medium text-slate-700 truncate" title={batchInfo?.namaKapal || batchInfo?.shipName || "Tanpa Batch"}>
                              {batchInfo ? `🚢 ${batchInfo.namaKapal || batchInfo.shipName || `Batch #${batchInfo.id}`}` : "— Tanpa Batch —"}
                            </span>
                          </div>

                          {/* Layanan & Paking */}
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-slate-400">
                              Layanan & Paking
                            </span>
                            <span className="font-medium text-slate-700 capitalize">
                              {pkg.serviceType?.replace("jastip ", "") || "Standar"} ·{" "}
                              {pkg.packagingType || "Plastik"}
                            </span>
                          </div>

                          {/* Berat & Dimensi */}
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-slate-400">
                              Berat / Dimensi
                            </span>
                            <span className="font-semibold text-slate-800 font-mono">
                              {weightNum > 0 ? `${weightNum} kg` : "-"}
                              {pkg.length && pkg.width && pkg.height
                                ? ` (${pkg.length}x${pkg.width}x${pkg.height})`
                                : ""}
                            </span>
                          </div>

                          {/* Ongkir */}
                          <div className="flex flex-col sm:items-end">
                            <span className="text-[10px] uppercase font-bold text-slate-400">
                              Total Ongkir
                            </span>
                            <span className="font-bold text-teal-700 font-mono text-sm">
                              {formatRp(Number(pkg.totalShipping || 0) + Number(pkg.additionalFee || 0))}
                            </span>
                          </div>
                        </div>

                        {/* Row 3: Action inspect button & extra info */}
                        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                          <span className="text-[11px]">
                            {pkg.deliveryRoute || "Jakarta → Manokwari"}
                            {pkg.additionalFee > 0 && (
                              <span className="text-amber-700 font-medium ml-1">
                                (+Biaya Tambahan {formatRp(pkg.additionalFee)})
                              </span>
                            )}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInspectPackage(pkg)}
                            className="h-6 px-2 text-[11px] text-slate-600 hover:text-teal-700 hover:bg-slate-100"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Cek Detail Paket
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                  {totalPkgPages > 1 && (
                    <div className="pt-2">
                      <Pagination
                        page={pkgPage}
                        totalPages={totalPkgPages}
                        total={filteredPackages.length}
                        pageSize={PKG_PAGE_SIZE}
                        onPageChange={setPkgPage}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Invoice Creation Form & Live Preview Summary (5 cols) */}
            <div className="lg:col-span-5 sticky top-6 space-y-4">
              <Card className="border-teal-600/30 shadow-md">
                <CardHeader className="bg-teal-50/60 pb-3 border-b border-teal-100">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base text-teal-900 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-teal-700" />
                      Buat Invoice Customer
                    </CardTitle>
                    <Badge className="bg-teal-700 text-white hover:bg-teal-800">
                      {selectedPackages.length} Paket Dipilih
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-teal-700/80">
                    Isi detail tagihan invoice resmi A4 untuk paket yang sudah dicentang.
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  {/* Selected Packages Preview Pills */}
                  {selectedPackages.length > 0 ? (
                    <div className="space-y-1.5 p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <p className="text-xs font-semibold text-slate-700">Paket yang akan dibuatkan invoice:</p>
                      <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                        {selectedPackages.map((p, idx) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between text-xs bg-white p-1.5 rounded border text-slate-700"
                          >
                            <span className="truncate font-medium flex-1">
                              {idx + 1}. {p.customerName} · Resi: {p.resiNumber || p.id}
                            </span>
                            <span className="font-mono font-semibold ml-2 shrink-0">
                              {formatRp(Number(p.totalShipping || 0) + Number(p.additionalFee || 0))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 text-amber-800 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>Silakan centang paket di sebelah kiri untuk mengisi invoice ini.</span>
                    </div>
                  )}

                  {/* Form fields */}
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Nama Customer di Invoice <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        value={invoiceCustomerName}
                        onChange={(e) => setInvoiceCustomerName(e.target.value)}
                        placeholder="Contoh: Andi Wijaya"
                        className="mt-1 h-9 text-sm"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Nomor HP / WhatsApp (Opsional)
                      </Label>
                      <Input
                        value={invoiceCustomerPhone}
                        onChange={(e) => setInvoiceCustomerPhone(e.target.value)}
                        placeholder="Contoh: 08123456789"
                        className="mt-1 h-9 text-sm font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">
                          Diskon (Rp)
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          value={invoiceDiscount}
                          onChange={(e) => setInvoiceDiscount(e.target.value)}
                          placeholder="0"
                          className="mt-1 h-9 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">
                          DP / Bayar Awal (Rp)
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          value={invoiceDownPayment}
                          onChange={(e) => setInvoiceDownPayment(e.target.value)}
                          placeholder="0"
                          className="mt-1 h-9 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Tanggal Jatuh Tempo (Opsional)
                      </Label>
                      <Input
                        type="date"
                        value={invoiceDueAt}
                        onChange={(e) => setInvoiceDueAt(e.target.value)}
                        className="mt-1 h-9 text-sm"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Catatan Tambahan (Opsional)
                      </Label>
                      <Textarea
                        value={invoiceNotes}
                        onChange={(e) => setInvoiceNotes(e.target.value)}
                        placeholder="Catatan khusus invoice..."
                        className="mt-1 text-xs h-16 resize-none"
                      />
                    </div>
                  </div>

                  {/* Financial Summary */}
                  <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2 text-xs">
                    <div className="flex justify-between text-slate-300">
                      <span>Total Berat Gabungan</span>
                      <span className="font-mono font-semibold text-white">
                        {selectedSummary.totalWeight} kg
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Subtotal ({selectedSummary.count} Paket)</span>
                      <span className="font-mono font-semibold text-white">
                        {formatRp(selectedSummary.subtotal)}
                      </span>
                    </div>
                    {selectedSummary.discount > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Potongan Diskon</span>
                        <span className="font-mono font-semibold">
                          -{formatRp(selectedSummary.discount)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-slate-800 text-sm font-bold text-white">
                      <span>Total Tagihan Invoice</span>
                      <span className="font-mono text-teal-400">
                        {formatRp(selectedSummary.total)}
                      </span>
                    </div>
                    {selectedSummary.downPayment > 0 && (
                      <div className="flex justify-between text-slate-300 text-xs">
                        <span>DP / Terbayar</span>
                        <span className="font-mono font-semibold text-white">
                          {formatRp(selectedSummary.downPayment)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs pt-1 text-amber-300 font-semibold border-t border-slate-800/80">
                      <span>Sisa Piutang / Pelunasan</span>
                      <span className="font-mono">{formatRp(selectedSummary.balance)}</span>
                    </div>
                  </div>

                  {/* Action Button */}
                  <Button
                    className="w-full h-11 bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm shadow-sm"
                    onClick={handleCreateInvoice}
                    disabled={saving || selectedPackages.length === 0 || !invoiceCustomerName.trim()}
                  >
                    {saving ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Menerbitkan Invoice...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Terbitkan Invoice A4 ({selectedPackages.length} Paket)
                      </span>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB 2: DAFTAR INVOICE TERBIT ────────────────────────────────────────── */}
        <TabsContent value="invoice-list" className="space-y-4">
          <Card>
            <CardHeader className="p-4 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Riwayat Invoice A4 yang Telah Diterbitkan
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Dokumen invoice snapshot siap dicetak ulang atau diunduh sebagai PDF kapan saja.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={invoiceSearchQuery}
                    onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                    placeholder="Cari no invoice atau nama..."
                    className="h-9 w-52 text-xs"
                  />
                  <Select value={invoiceStatusFilter} onValueChange={setInvoiceStatusFilter}>
                    <SelectTrigger className="h-9 w-36 text-xs">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Status</SelectItem>
                      <SelectItem value="LUNAS">Lunas</SelectItem>
                      <SelectItem value="DIBAYAR_SEBAGIAN">Sebagian</SelectItem>
                      <SelectItem value="BELUM_LUNAS">Belum Lunas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {filteredInvoices.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <FileText className="h-10 w-10 mx-auto opacity-30 mb-2" />
                  <p className="font-semibold text-slate-700">Belum ada data invoice terbit</p>
                  <p className="text-xs text-slate-400">
                    Gunakan tab "Pilih Paket & Buat Invoice" untuk menerbitkan invoice baru.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="divide-y border rounded-xl overflow-hidden">
                    {paginatedInvoices.map((inv) => {
                      const snap = inv.customerSnapshot || {};
                      const pkgCount = Array.isArray(snap.packageIds) ? snap.packageIds.length : 1;

                      return (
                        <div
                          key={inv.id}
                          className="p-4 bg-white hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm text-teal-800">
                                {inv.invoiceNo}
                              </span>
                              <Badge
                                variant={
                                  inv.status === "LUNAS"
                                    ? "default"
                                    : inv.status === "DIBAYAR_SEBAGIAN"
                                    ? "secondary"
                                    : "outline"
                                }
                                className={`text-[11px] ${
                                  inv.status === "LUNAS"
                                    ? "bg-emerald-600 text-white"
                                    : inv.status === "DIBAYAR_SEBAGIAN"
                                    ? "bg-amber-100 text-amber-800 border-amber-300"
                                    : "text-slate-600"
                                }`}
                              >
                                {statusLabel(inv.status)}
                              </Badge>
                            </div>
                            <p className="font-semibold text-slate-900 text-sm">
                              {snap.customerName || "Pelanggan Umum"}
                              {snap.customerPhone ? ` (${snap.customerPhone})` : ""}
                            </p>
                            <p className="text-xs text-slate-500">
                              Terbit: {new Date(inv.issuedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                              {inv.dueAt ? ` · Jatuh Tempo: ${new Date(inv.dueAt).toLocaleDateString("id-ID")}` : ""}
                              {" · "}{pkgCount} paket
                            </p>
                          </div>

                          <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-2 md:pt-0">
                            <div className="text-right">
                              <p className="text-xs text-slate-500">Total Tagihan</p>
                              <p className="font-mono font-bold text-slate-900 text-sm">
                                {formatRp(inv.total)}
                              </p>
                              {Number(inv.balance) > 0 && (
                                <p className="text-[11px] text-amber-700 font-mono">
                                  Sisa: {formatRp(inv.balance)}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => downloadInvoice(inv.id)}
                                disabled={downloadingInvoiceId === inv.id}
                                className="bg-teal-700 hover:bg-teal-800 text-white h-9 shadow-xs"
                              >
                                {downloadingInvoiceId === inv.id ? (
                                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Unduh PDF
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => printInvoice(inv.id)}
                                className="border-slate-300 hover:bg-slate-100 text-slate-700 h-9"
                              >
                                <Printer className="mr-1.5 h-3.5 w-3.5" /> Cetak
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {totalInvPages > 1 && (
                    <div className="pt-2">
                      <Pagination
                        page={invPage}
                        totalPages={totalInvPages}
                        total={filteredInvoices.length}
                        pageSize={INV_PAGE_SIZE}
                        onPageChange={setInvPage}
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: DARI TRANSAKSI SISTEM ────────────────────────────────────────── */}
        <TabsContent value="from-tx" className="space-y-4">
          <Card>
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-base font-bold text-slate-900">
                Terbitkan Invoice dari Transaksi yang Sudah Ada
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Gunakan opsi ini jika transaksi sudah dicatat sebelumnya di menu kasir/transaksi.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4 max-w-xl">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Pilih Transaksi Aktif</Label>
                <Select value={transactionId} onValueChange={setTransactionId}>
                  <SelectTrigger className="mt-1 h-10">
                    <SelectValue placeholder="Pilih nomor transaksi..." />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleTransactions.map((tx) => (
                      <SelectItem key={tx.id} value={String(tx.id)}>
                        {tx.transactionNo} · {tx.customerName} · {formatRp(tx.total)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={createFromTransaction}
                disabled={saving || !transactionId}
                className="bg-teal-700 hover:bg-teal-800 text-white"
              >
                <Plus className="mr-2 h-4 w-4" /> Terbitkan Invoice dari Transaksi
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal: Inspection of Package Detail */}
      <Dialog open={!!inspectPackage} onOpenChange={(open) => !open && setInspectPackage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <PackageCheck className="h-5 w-5 text-teal-600" />
              Detail Informasi Paket
            </DialogTitle>
            <DialogDescription className="text-xs">
              Rincian fisik, resi, dan batch paket untuk verifikasi sebelum dimasukkan ke invoice.
            </DialogDescription>
          </DialogHeader>

          {inspectPackage && (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nama Customer:</span>
                  <span className="font-bold text-slate-900">{inspectPackage.customerName || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Nomor Telepon:</span>
                  <span className="font-mono text-slate-800">{inspectPackage.customerPhone || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Nomor Resi:</span>
                  <span className="font-mono font-bold text-teal-700">{inspectPackage.resiNumber || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Isi Barang:</span>
                  <span className="font-medium text-slate-800">{inspectPackage.itemName || "-"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-lg">
                <div>
                  <span className="text-slate-500 block text-[11px]">Batch Kapal</span>
                  <span className="font-semibold text-slate-800">
                    {inspectPackage.batchId ? (batchMap.get(inspectPackage.batchId)?.namaKapal || batchMap.get(inspectPackage.batchId)?.shipName || `Batch #${inspectPackage.batchId}`) : "Tanpa Batch"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Layanan Jastip</span>
                  <span className="font-semibold text-slate-800 capitalize">
                    {inspectPackage.serviceType || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Berat Terpakai</span>
                  <span className="font-mono font-bold text-slate-800">
                    {inspectPackage.usedWeight || inspectPackage.realWeight || "-"} kg
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Dimensi (PxLxT)</span>
                  <span className="font-mono text-slate-800">
                    {inspectPackage.length && inspectPackage.width && inspectPackage.height
                      ? `${inspectPackage.length} x ${inspectPackage.width} x ${inspectPackage.height} cm`
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Jenis Paking</span>
                  <span className="font-medium text-slate-800">{inspectPackage.packagingType || "Plastik"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Biaya Tambahan</span>
                  <span className="font-mono text-slate-800">
                    {inspectPackage.additionalFee > 0
                      ? formatRp(inspectPackage.additionalFee)
                      : "Rp0"}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center justify-between">
                <span className="font-bold text-teal-900">Total Ongkir Paket:</span>
                <span className="font-mono font-bold text-base text-teal-800">
                  {formatRp(
                    Number(inspectPackage.totalShipping || 0) + Number(inspectPackage.additionalFee || 0)
                  )}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t">
            <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setInspectPackage(null)}>
              Tutup
            </Button>
            {inspectPackage && (
              <Button
                size="sm"
                className="w-full sm:w-auto bg-teal-700 hover:bg-teal-800 text-white font-medium"
                onClick={() => {
                  toggleSelectPackage(inspectPackage.id);
                  setInspectPackage(null);
                }}
              >
                {selectedPackageIds.includes(inspectPackage.id)
                  ? "Batal Centang Paket Ini"
                  : "✓ Centang Paket Ini"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Success Created Invoice Notification */}
      <Dialog open={!!createdInvoice} onOpenChange={(open) => !open && setCreatedInvoice(null)}>
        <DialogContent className="w-[92vw] max-w-md mx-auto p-5 sm:p-6 text-center rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-1">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <DialogHeader className="text-center space-y-1">
            <DialogTitle className="text-lg font-bold text-slate-900 text-center">
              Invoice Berhasil Diterbitkan!
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 text-center leading-relaxed">
              Dokumen invoice A4 dengan nomor{" "}
              <strong className="font-mono font-bold text-teal-800">{createdInvoice?.invoiceNo}</strong> sudah
              tersimpan.
            </DialogDescription>
          </DialogHeader>

          {createdInvoice && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-left space-y-2 my-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-800">
                  {createdInvoice.customerSnapshot?.customerName}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Jumlah Item:</span>
                <span className="font-semibold text-slate-800">
                  {createdInvoice.items?.length ?? 1} paket
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Total Tagihan:</span>
                <span className="font-mono font-bold text-teal-700">
                  {formatRp(createdInvoice.total)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Sisa Piutang:</span>
                <span className="font-mono font-bold text-amber-700">
                  {formatRp(createdInvoice.balance)}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2 w-full">
            <Button
              className="w-full bg-teal-700 hover:bg-teal-800 text-white font-medium py-2.5 h-auto text-xs sm:text-sm shadow-sm"
              disabled={!createdInvoice?.id || downloadingInvoiceId === createdInvoice.id}
              onClick={() => {
                if (createdInvoice?.id) downloadInvoice(createdInvoice.id);
              }}
            >
              {downloadingInvoiceId === createdInvoice?.id ? (
                <RefreshCw className="mr-2 h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4 shrink-0" />
              )}
              <span>Unduh File PDF Invoice</span>
            </Button>
            <Button
              variant="outline"
              className="w-full border-teal-700 text-teal-800 hover:bg-teal-50 font-medium py-2.5 h-auto text-xs sm:text-sm"
              onClick={() => {
                if (createdInvoice?.id) printInvoice(createdInvoice.id);
              }}
            >
              <Printer className="mr-2 h-4 w-4 shrink-0" />
              <span>Cetak / Print Dokumen A4</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full text-slate-500 hover:bg-slate-100 py-2 h-auto text-xs"
              onClick={() => setCreatedInvoice(null)}
            >
              Selesai & Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
