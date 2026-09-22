import { useEffect, useRef, useState } from "react";
import { useImportPackages, getListPackagesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Upload, FileSpreadsheet, Download,
  CheckCircle, XCircle, File, X, ChevronRight, QrCode, AlertCircle, Ship,
  Plus, Loader2, ChevronDown,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// ── Kalkulasi ongkir ──────────────────────────────────────────────────────────
const volumeDivisor: Record<string, number> = {
  "jastip pesawat": 5000,
  "jastip hemat+":  4000,
  "jastip pelni":   4000,
  "jastip kargo":   1000000,
};

function calcVolumeWeight(serviceType: string, l: number, w: number, h: number): number {
  const d = volumeDivisor[serviceType] ?? 6000;
  return (l * w * h) / d;
}

// Pesawat: pembulatan berat gabungan sesuai spec
// 0.01–0.20→0.20 kg | 0.21–0.40→0.40 kg | 0.41–0.50→0.50 kg | >0.50→berat asli
function roundPesawatGroupWeight(totalWeight: number): number {
  if (totalWeight <= 0) return 0;
  if (totalWeight <= 0.20) return 0.20;
  if (totalWeight <= 0.40) return 0.40;
  if (totalWeight <= 0.50) return 0.50;
  return totalWeight;
}

// Pelni: tarif bertingkat berdasarkan TOTAL BERAT GABUNGAN konsumen dalam batch.
// Estimasi preview ini dihitung per-paket; server menghitung ulang dengan benar
// setelah semua paket diimpor.
function getPelniRateByTotalWeight(totalWeight: number, deliveryRoute: string): number | null {
  if (!deliveryRoute || !totalWeight || totalWeight <= 0) return null;
  if (deliveryRoute === "Jakarta → Manokwari") {
    if (totalWeight <= 10.1) return 20000;
    if (totalWeight <= 20.1) return 19000;
    if (totalWeight <= 40.1) return 18000;
    if (totalWeight <= 80.1) return 17000;
    return 16000; // 81–200 kg
  }
  if (deliveryRoute === "Surabaya → Manokwari") {
    if (totalWeight <= 10) return 18000;
    if (totalWeight <= 20) return 17000;
    if (totalWeight <= 40) return 16000;
    return 15500;
  }
  return null;
}

function getTotalShipping(serviceType: string, deliveryRoute: string, weight: number): number | null {
  if (!serviceType || !deliveryRoute || !weight || weight <= 0) return null;
  // Pesawat: estimasi per-paket menggunakan aturan pembulatan.
  // Server recalc berdasarkan total berat gabungan konsumen setelah diimpor.
  if (serviceType === "jastip pesawat" && deliveryRoute === "Jakarta → Manokwari") {
    return Math.round(roundPesawatGroupWeight(weight) * 77000);
  }
  if (serviceType === "jastip hemat+" && deliveryRoute === "Surabaya → Manokwari") {
    return Math.max(10000, Math.round(weight * 10000));
  }
  if (serviceType === "jastip pelni") {
    const rate = getPelniRateByTotalWeight(weight, deliveryRoute) || 20000;
    if (rate) return Math.max(20000, Math.round(weight * rate));
  }
  return null;
}

function getShippingRate(serviceType: string, deliveryRoute: string, weight: number): number | null {
  if (!serviceType || !weight || weight <= 0) return null;
  if (serviceType === "jastip pesawat") return 77000;
  if (serviceType === "jastip hemat+") return 10000;
  if (serviceType === "jastip pelni") return getPelniRateByTotalWeight(weight, deliveryRoute);
  return null;
}

function formatRp(n: number | null | undefined) {
  if (n == null) return "-";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// ── Definisi kolom template ───────────────────────────────────────────────────
type TemplateType = "standard" | "kargo";

const TEMPLATE_STANDARD = [
  { header: "Nama Konsumen",      key: "customerName",        example: "BUDI",        required: true },
  { header: "No Resi",            key: "resiNumber",          example: "JNE-001",     required: true },
  { header: "No Paket",           key: "packageNumber",       example: "PKT-001",     required: false },
  { header: "Berat Real (Kg)",    key: "realWeight",          example: "1.5",         required: true },
  { header: "Panjang (cm)",       key: "length",              example: "30",          required: false },
  { header: "Lebar (cm)",         key: "width",               example: "20",          required: false },
  { header: "Tinggi (cm)",        key: "height",              example: "15",          required: false },
  { header: "Jenis Paking",       key: "packagingType",       example: "Karton",      required: false },
  { header: "Biaya Tambahan",     key: "additionalFee",       example: "15000",       required: false },
  { header: "Ket Biaya Tambahan", key: "additionalFeeReason", example: "Paking kayu", required: false },
];

const TEMPLATE_KARGO = [
  { header: "Nama Konsumen",      key: "customerName",        example: "BUDI",        required: true },
  { header: "Toko/Kurir",         key: "resiNumber",          example: "Tokopedia",   required: false },
  { header: "Total Koli",         key: "packageNumber",       example: "3",           required: false },
  { header: "Koli",               key: "packagingType",       example: "Koli 1/3",    required: false },
  { header: "Jenis Barang",       key: "itemName",            example: "Perabot",     required: false },
  { header: "Ukuran Barang",      key: "ukuranBarang",        example: "100x80x60",   required: false },
  { header: "Panjang (cm)",       key: "length",              example: "100",         required: false },
  { header: "Lebar (cm)",         key: "width",               example: "80",          required: false },
  { header: "Tinggi (cm)",        key: "height",              example: "60",          required: false },
  { header: "Pakai (m3)",         key: "pakaiM3",             example: "0.48",        required: false },
  { header: "Harga Kubikasi",     key: "kargoRate",           example: "7000000",     required: false },
  { header: "Berat Real (Ton)",   key: "realWeight",          example: "0.5",         required: false },
  { header: "Ongkir Paket",       key: "ongkirPaket",         example: "3360000",     required: true },
  { header: "Biaya Tambahan",     key: "additionalFee",       example: "50000",       required: false },
  { header: "Ket Biaya Tambahan", key: "additionalFeeReason", example: "Pallet kayu", required: false },
];

const ROUTE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  "jastip pesawat": [{ value: "Jakarta → Manokwari",          label: "Jakarta → Manokwari" }],
  "jastip hemat+":  [{ value: "Surabaya → Manokwari",         label: "Surabaya → Manokwari" }],
  "jastip kargo":   [{ value: "Jakarta/Surabaya → Manokwari", label: "Jakarta/Surabaya → Manokwari" }],
  "jastip pelni":   [
    { value: "Jakarta → Manokwari",  label: "Jakarta → Manokwari" },
    { value: "Surabaya → Manokwari", label: "Surabaya → Manokwari" },
  ],
};

const SERVICE_LABELS: Record<string, string> = {
  "jastip pesawat": "Jastip Pesawat",
  "jastip hemat+":  "Jastip Hemat+",
  "jastip kargo":   "Jastip Kargo",
  "jastip pelni":   "Jastip Pelni",
};

// ── Download template ─────────────────────────────────────────────────────────
function downloadStandardTemplate() {
  const header  = TEMPLATE_STANDARD.map((c) => c.header);
  const example = TEMPLATE_STANDARD.map((c) => c.example);
  const ws = XLSX.utils.aoa_to_sheet([header, example]);
  ws["!cols"] = TEMPLATE_STANDARD.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template Standard");
  XLSX.writeFile(wb, "template-import-standard-jaj.xlsx");
}

function downloadKargoTemplate() {
  const header  = TEMPLATE_KARGO.map((c) => c.header);
  const example = TEMPLATE_KARGO.map((c) => c.example);
  const ws = XLSX.utils.aoa_to_sheet([header, example]);
  ws["!cols"] = TEMPLATE_KARGO.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template Kargo");
  XLSX.writeFile(wb, "template-import-kargo-jaj.xlsx");
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Step = "setup" | "upload" | "preview";

interface ParsedRow {
  customerName:  string;
  resiNumber:    string;
  packageNumber: string;
  itemName:      string;
  realWeight:    number | null;
  length:        number | null;
  width:         number | null;
  height:        number | null;
  packagingType: string;
  kargoRate?:    number | null;
  ongkirPaket?:  number | null;
  pakaiM3?:      number | null;
  additionalFee?:       number | null;
  additionalFeeReason?: string | null;
  // computed
  volumeWeight?:  number | null;
  usedWeight?:    number | null;
  shippingRate?:  number | null;
  totalShipping?: number | null;
  error?:         string;
}

// ── Komponen utama ─────────────────────────────────────────────────────────────
export default function AdminPackagesImport() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("setup");
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);

  const [serviceType,   setServiceType]   = useState("");
  const [deliveryRoute, setDeliveryRoute] = useState("");
  const [packageDate,   setPackageDate]   = useState(todayStr());
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(() => {
    const stored = localStorage.getItem("jaj_last_batch_id");
    return stored ? Number(stored) : null;
  });
  const [openBatches, setOpenBatches] = useState<any[]>([]);

  // ── Buat Batch Baru ──────────────────────────────────────────────────────────
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [newBatch, setNewBatch] = useState({
    namaKapal: "",
    etd: "",
    periodeClosingMulai: "",
    periodeClosingSelesai: "",
    kotaAsal: "Jakarta",
    tujuan: "Manokwari",
  });

  async function handleCreateBatch() {
    const { namaKapal, etd, periodeClosingMulai, periodeClosingSelesai, kotaAsal } = newBatch;
    if (!namaKapal || !etd || !periodeClosingMulai || !periodeClosingSelesai || !kotaAsal) {
      toast({ variant: "destructive", title: "Lengkapi Data Batch", description: "Semua kolom wajib diisi." });
      return;
    }
    setIsCreatingBatch(true);
    try {
      const token = localStorage.getItem("jaj_token");
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(newBatch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Gagal membuat batch");
      }
      const created = await res.json();
      setOpenBatches((prev) => [created, ...prev]);
      setSelectedBatchId(created.id);
      localStorage.setItem("jaj_last_batch_id", String(created.id));
      setShowCreateBatch(false);
      setNewBatch({ namaKapal: "", etd: "", periodeClosingMulai: "", periodeClosingSelesai: "", kotaAsal: "Jakarta", tujuan: "Manokwari" });
      toast({ title: "Batch Dibuat", description: `Batch "${created.namaKapal}" berhasil dibuat dan dipilih.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gagal Membuat Batch", description: err.message });
    } finally {
      setIsCreatingBatch(false);
    }
  }

  // Derived
  const templateType: TemplateType | null = serviceType === "jastip kargo" ? "kargo" : (serviceType ? "standard" : null);
  const isKargo = templateType === "kargo";

  // Load open batches on mount
  useEffect(() => {
    const token = localStorage.getItem("jaj_token");
    fetch("/api/batches?statusBatch=OPEN", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((batches: any[]) => {
        setOpenBatches(batches);
        if (batches.length > 0) {
          const stored = localStorage.getItem("jaj_last_batch_id");
          const storedId = stored ? Number(stored) : null;
          const ids = batches.map((b: any) => b.id);
          if (!storedId || !ids.includes(storedId)) {
            setSelectedBatchId(batches[0].id);
            localStorage.setItem("jaj_last_batch_id", String(batches[0].id));
          } else {
            setSelectedBatchId(storedId);
          }
        }
      })
      .catch(() => {});
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress]         = useState(0);
  const [importResult, setImportResult] = useState<any>(null);

  const importPackages = useImportPackages();

  // ── Parse Excel ─────────────────────────────────────────────────────────────
  function parseExcel(f: File, tplType: TemplateType) {
    const columns = tplType === "kargo" ? TEMPLATE_KARGO : TEMPLATE_STANDARD;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb   = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (rows.length < 2) {
        toast({ variant: "destructive", title: "File Kosong", description: "File tidak memiliki data." });
        return;
      }

      const headers: string[] = (rows[0] as string[]).map((h) => String(h || "").trim());
      const dataRows = rows.slice(1).filter((r: any[]) => r.some((c) => c !== undefined && c !== ""));

      const parsed: ParsedRow[] = dataRows.map((row: any[]) => {
        const get = (key: string) => {
          const col = columns.find((c) => c.key === key);
          if (!col) return "";
          const idx = headers.indexOf(col.header);
          if (idx < 0) return "";
          const val = row[idx];
          return val !== undefined && val !== null ? String(val).trim() : "";
        };
        // Normalisasi angka: hapus prefix "Rp", tangani pemisah ribuan (titik/koma)
        // Digunakan untuk kolom HARGA (ongkir, tarif) — menerapkan aturan 3-digit ribuan
        const num = (key: string) => {
          let v = get(key).replace(/^Rp\.?\s*/i, "").replace(/\s/g, "").trim();
          // "1.234,56" atau "38.000,00" → titik=ribuan, koma=desimal
          if (v.includes(".") && v.includes(",")) {
            v = v.replace(/\./g, "").replace(",", ".");
          } else if (v.includes(",") && !v.includes(".")) {
            const parts = v.split(",");
            // Jika ada lebih dari satu koma ATAU satu koma dengan tepat 3 digit setelahnya
            // → semua koma adalah pemisah ribuan (mis. "1,890,000" atau "38,000")
            if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
              v = v.replace(/,/g, "");
            } else {
              // "1,5" → koma sebagai desimal
              v = v.replace(",", ".");
            }
          } else if (v.includes(".") && !v.includes(",")) {
            const parts = v.split(".");
            // "38.000" atau "1.234.000" → titik sebagai ribuan (semua bagian setelah titik = 3 digit)
            // PENGECUALIAN: jika bagian integer adalah 0 (mis. "0.192"), pasti desimal — bukan ribuan
            const intPart = parseInt(parts[0], 10);
            if (parts.length > 1 && parts.slice(1).every((p) => p.length === 3) && intPart !== 0) {
              v = v.replace(/\./g, "");
            }
            // else "1.5" atau "0.192" → desimal biasa, biarkan
          }
          const n = parseFloat(v);
          return isNaN(n) ? null : n;
        };

        // Digunakan untuk kolom BERAT & VOLUME — selalu perlakukan koma/titik tunggal sebagai desimal.
        // Tidak ada paket yang beratnya 1903 kg, jadi "1,903" atau "1.903" pasti berarti 1.903 kg.
        const numWeight = (key: string) => {
          let v = get(key).replace(/\s/g, "").trim();
          if (!v) return null;
          // "1.234,56" → titik=ribuan, koma=desimal
          if (v.includes(".") && v.includes(",")) {
            v = v.replace(/\./g, "").replace(",", ".");
          } else if (v.includes(",")) {
            // "1,903" atau "1,5" → selalu desimal
            v = v.replace(",", ".");
          }
          // "1.903" atau "38.000" dengan titik tunggal → desimal biasa (parseFloat sudah benar)
          // Tidak ada konversi — "1.903" → 1.903, "38.000" → 38.0
          const n = parseFloat(v);
          return isNaN(n) ? null : n;
        };

        const customerName = get("customerName");
        const resiNumber   = get("resiNumber");
        const realWeightVal = numWeight("realWeight");
        const ongkirPaketVal = tplType === "kargo" ? num("ongkirPaket") : null;
        const additionalFeeVal = num("additionalFee");
        const additionalFeeReasonVal = get("additionalFeeReason");
        let error: string | undefined;
        if (!customerName && tplType === "standard") error = "Nama Konsumen kosong";
        else if (tplType === "standard" && !resiNumber) error = "No Resi kosong";
        else if (tplType === "standard" && (realWeightVal === null || realWeightVal <= 0)) error = "Berat Real wajib diisi";
        // Kargo: berat tidak wajib, tapi ongkir paket wajib
        else if (tplType === "kargo" && (ongkirPaketVal === null || ongkirPaketVal <= 0)) error = "Ongkir Paket wajib diisi";

        return {
          customerName,
          resiNumber,
          packageNumber: get("packageNumber"),
          itemName:      get("itemName"),
          realWeight:    numWeight("realWeight"),
          length:        num("length"),
          width:         num("width"),
          height:        num("height"),
          packagingType: get("packagingType"),
          kargoRate:     tplType === "kargo" ? num("kargoRate") : undefined,
          ongkirPaket:   tplType === "kargo" ? ongkirPaketVal : undefined,
          pakaiM3:       tplType === "kargo" ? numWeight("pakaiM3") : undefined,
          additionalFee: additionalFeeVal,
          additionalFeeReason: additionalFeeReasonVal || null,
          error,
        };
      });

      setRawRows(parsed);
      setStep("preview");
    };
    reader.readAsArrayBuffer(f);
  }

  function handleFileUpload(f: File) {
    if (!templateType) return;
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast({ variant: "destructive", title: "Format Tidak Didukung", description: "Gunakan .xlsx, .xls, atau .csv" });
      return;
    }
    setFile(f);
    setImportResult(null);
    parseExcel(f, templateType);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFileUpload(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileUpload(f);
  }

  function clearFile() {
    setFile(null);
    setRawRows([]);
    setStep("upload");
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Auto-derive route from the selected Batch Pengiriman (kotaAsal → tujuan).
  // The batch is the source of truth for the route — do not hardcode per jenis jastip,
  // otherwise the displayed route can mismatch the batch actually selected.
  function deriveRoute(svcType: string, batch?: { kotaAsal?: string; tujuan?: string }): string {
    if (batch?.kotaAsal && batch?.tujuan) {
      return `${batch.kotaAsal} → ${batch.tujuan}`;
    }
    // Fallback when no batch is selected yet
    if (svcType === "jastip kargo")   return "Jakarta/Surabaya → Manokwari";
    if (svcType === "jastip pesawat") return "Jakarta → Manokwari";
    if (svcType === "jastip hemat+")  return "Surabaya → Manokwari";
    if (svcType === "jastip pelni")   return "Jakarta → Manokwari";
    return ROUTE_OPTIONS[svcType]?.[0]?.value ?? "";
  }

  function handleServiceTypeChange(val: string) {
    setServiceType(val);
    const batch = openBatches.find((b: any) => b.id === selectedBatchId);
    setDeliveryRoute(deriveRoute(val, batch));
  }

  function handleBatchChange(val: string) {
    const id = Number(val);
    setSelectedBatchId(id);
    localStorage.setItem("jaj_last_batch_id", String(id));
    if (serviceType) {
      const batch = openBatches.find((b: any) => b.id === id);
      setDeliveryRoute(deriveRoute(serviceType, batch));
    }
  }

  // Step 1 → Step 2
  function goToUpload() {
    if (!selectedBatchId) {
      toast({ variant: "destructive", title: "Pilih Batch Pengiriman", description: "Silakan pilih batch pengiriman terlebih dahulu." });
      return;
    }
    if (!serviceType) {
      toast({ variant: "destructive", title: "Pilih Jenis Jastip", description: "Silakan pilih jenis jastip terlebih dahulu." });
      return;
    }
    setStep("upload");
  }

  // ── Hitung nilai per baris ───────────────────────────────────────────────────
  function computedRows(): ParsedRow[] {
    return rawRows.map((row) => {
      if (row.error) return row;

      if (templateType === "kargo") {
        const rw = row.realWeight ?? 0;
        // Pakai (m3): gunakan kolom pakaiM3 jika ada, atau hitung dari dimensi
        let vw: number | null = null;
        if (row.pakaiM3 != null && row.pakaiM3 > 0) {
          // Kolom Pakai (m3) diisi langsung — simpan apa adanya (fix bug 0.01→10)
          vw = row.pakaiM3;
        } else if (row.length && row.width && row.height && row.length > 0 && row.width > 0 && row.height > 0) {
          vw = Number(((row.length * row.width * row.height) / 1000000).toFixed(4));
        }
        // usedWeight = max(realWeight, volumeWeight) — nilai asli, bukan dibulatkan ke minimum
        const usedWeight = rw > 0 && vw !== null ? Math.max(rw, vw) : rw > 0 ? rw : (vw ?? null);
        // Ongkir diambil langsung dari kolom Ongkir Paket; Harga Kubikasi → shippingRate
        const rate  = row.kargoRate ?? null;
        const total = row.ongkirPaket ?? null;
        return {
          ...row,
          volumeWeight: vw,
          usedWeight,
          shippingRate: rate,
          totalShipping: total,
          additionalFee: row.additionalFee,
          additionalFeeReason: row.additionalFeeReason,
        };
      }

      // Standard (Hemat+, Pesawat, Pelni)
      const rw = row.realWeight ?? 0;
      let vw: number | null = null;
      if (row.length && row.width && row.height && row.length > 0 && row.width > 0 && row.height > 0) {
        vw = Number(calcVolumeWeight(serviceType, row.length, row.width, row.height).toFixed(3));
      }
      const uw    = rw > 0 && vw !== null ? Math.max(rw, vw) : (rw > 0 ? rw : (vw ?? null));
      const rate  = uw ? getShippingRate(serviceType, deliveryRoute, uw) : null;
      const total = uw ? getTotalShipping(serviceType, deliveryRoute, uw) : null;
      return {
        ...row,
        volumeWeight: vw,
        usedWeight: uw,
        shippingRate: rate,
        totalShipping: total,
        additionalFee: row.additionalFee,
        additionalFeeReason: row.additionalFeeReason,
      };
    });
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleImport() {
    const rows  = computedRows();
    const valid = rows.filter((r) => !r.error);
    if (!valid.length) return;

    setIsSubmitting(true);
    setProgress(20);
    setImportResult(null);

    try {
      // Kargo: setiap paket punya barcode sendiri (packageMode: "single")
      // Layanan lain: packageMode: "grup" untuk batching barcode per konsumen
      const kargoMode = templateType === "kargo" ? "single" : "grup";

      const payload = valid.map((r) => ({
        customerName:  r.customerName || "-",
        customerPhone: "",
        resiNumber:    r.resiNumber || "-",
        packageNumber: r.packageNumber || undefined,
        itemName:      r.itemName      || undefined,
        realWeight:    r.realWeight,
        length:        r.length,
        width:         r.width,
        height:        r.height,
        packagingType: r.packagingType || undefined,
        volumeWeight:  r.volumeWeight,
        usedWeight:    r.usedWeight,
        shippingRate:  r.shippingRate,
        totalShipping: r.totalShipping,
        additionalFee: r.additionalFee || 0,
        additionalFeeReason: r.additionalFeeReason || undefined,
        serviceType,
        deliveryRoute,
        packageDate,
        packageMode:   kargoMode,
      }));

      setProgress(50);
      if (!selectedBatchId) {
        toast({ variant: "destructive", title: "Pilih Batch Pengiriman", description: "Silakan pilih Batch Pengiriman sebelum import." });
        setIsSubmitting(false);
        return;
      }
      const res = await importPackages.mutateAsync({ data: { packages: payload, batchId: selectedBatchId } as any });
      setProgress(100);
      setImportResult(res);

      if ((res as any).success > 0) {
        queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
        toast({
          title: "Import Berhasil",
          description: `${(res as any).success} paket berhasil diimport dan barcode digenerate.`,
        });
        const ids: number[] = (res as any).ids ?? [];
        if (ids.length > 0) {
          setTimeout(() => {
            setLocation(`/admin/barcode?ids=${ids.join(",")}`);
          }, 1500);
        }
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Import Gagal", description: error.message || "Terjadi kesalahan" });
    } finally {
      setIsSubmitting(false);
      setProgress(0);
    }
  }

  const rows       = step === "preview" ? computedRows() : rawRows;
  const validCount = rawRows.filter((r) => !r.error).length;
  const errorCount = rawRows.filter((r) => !!r.error).length;
  const routeOpts  = ROUTE_OPTIONS[serviceType] ?? [];

  const selectedBatch = openBatches.find((b: any) => b.id === selectedBatchId);

  // Step indicator
  const STEPS: { key: Step; label: string }[] = [
    { key: "setup",   label: "1. Batch & Jenis Jastip" },
    { key: "upload",  label: "2. Upload File" },
    { key: "preview", label: "3. Preview & Import" },
  ];
  const stepOrder: Step[] = ["setup", "upload", "preview"];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setLocation("/admin/packages")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import Excel</h1>
          <p className="text-muted-foreground mt-1">Import banyak paket sekaligus — barcode digenerate otomatis.</p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-sm font-medium">
        {STEPS.map((s, i) => {
          const active = step === s.key;
          const done   = stepOrder.indexOf(step) > i;
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              <span className={`px-3 py-1 rounded-full text-xs transition-colors ${active ? "bg-primary text-primary-foreground" : done ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
                {done ? "✓ " : ""}{s.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-4">

        {/* ── Sidebar ── */}
        <div className="lg:col-span-1 space-y-4">
          {/* Template Standard */}
          <Card className={`border-dashed border-2 h-fit transition-all ${isKargo ? "border-gray-200 bg-gray-50/30 opacity-60" : "border-blue-300 bg-blue-50/50"}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm flex items-center gap-2 ${isKargo ? "text-gray-500" : "text-blue-700"}`}>
                <FileSpreadsheet className="w-4 h-4" />Template 1 — Standard
              </CardTitle>
              <CardDescription className="text-xs">Hemat+, Pesawat, Pelni</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1">
                {TEMPLATE_STANDARD.map((c) => (
                  <div key={c.key} className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.required ? "bg-blue-500" : "bg-muted-foreground/40"}`} />
                    <span className={c.required ? "text-foreground font-medium" : ""}>{c.header}</span>
                    {c.required && <span className="text-red-500 text-[10px]">*</span>}
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground/70 pt-1 border-t">Rute & Tanggal dipilih di step 1</p>
              </div>
              <Button onClick={downloadStandardTemplate} className="w-full" variant="outline" size="sm">
                <Download className="w-3.5 h-3.5 mr-1.5" />Unduh Template 1
              </Button>
            </CardContent>
          </Card>

          {/* Template Kargo */}
          <Card className={`border-dashed border-2 h-fit transition-all ${!isKargo && serviceType ? "border-gray-200 bg-gray-50/30 opacity-60" : "border-orange-300 bg-orange-50/50"}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm flex items-center gap-2 ${!isKargo && serviceType ? "text-gray-500" : "text-orange-700"}`}>
                <FileSpreadsheet className="w-4 h-4" />Template 2 — Kargo
              </CardTitle>
              <CardDescription className="text-xs">Jastip Kargo saja</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1">
                {TEMPLATE_KARGO.map((c) => (
                  <div key={c.key} className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.required ? "bg-orange-500" : "bg-muted-foreground/40"}`} />
                    <span className={c.required ? "text-foreground font-medium" : ""}>{c.header}</span>
                    {c.required && <span className="text-red-500 text-[10px]">*</span>}
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground/70 pt-1 border-t">Harga Kubikasi per baris; Rute dipilih di step 1</p>
              </div>
              <Button onClick={downloadKargoTemplate} className="w-full" variant="outline" size="sm">
                <Download className="w-3.5 h-3.5 mr-1.5" />Unduh Template 2
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ── Main content ── */}
        <div className="lg:col-span-3 space-y-4">

          {/* ── Step 1: Pilih Batch & Jenis Jastip ── */}
          <Card className={step === "setup" ? "border-primary/50 shadow-md" : ""}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Ship className="w-4 h-4" />
                Pilih Batch &amp; Jenis Jastip
              </CardTitle>
              <CardDescription>
                Tentukan batch pengiriman dan jenis layanan sebelum mengupload file Excel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {step !== "setup" ? (
                /* Summary mode */
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/40 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground">
                      {selectedBatch ? (selectedBatch.namaKapal || `Batch #${selectedBatch.id}`) : "-"}
                    </span>
                    {" · "}
                    <span className="font-medium text-foreground">{SERVICE_LABELS[serviceType] ?? serviceType}</span>
                    {deliveryRoute && <>{" · "}{deliveryRoute}</>}
                  </div>
                  {step === "upload" && (
                    <Button variant="ghost" size="sm" className="ml-auto h-7 shrink-0" onClick={() => setStep("setup")}>
                      Ubah
                    </Button>
                  )}
                </div>
              ) : (
                /* Edit mode */
                <div className="space-y-4">
                  {/* Batch Pengiriman */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Batch Pengiriman *</label>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                        onClick={() => setShowCreateBatch((v) => !v)}
                      >
                        {showCreateBatch ? <ChevronDown className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        {showCreateBatch ? "Batal" : "Buat Batch Baru"}
                      </button>
                    </div>

                    {/* Inline form buat batch baru */}
                    {showCreateBatch && (
                      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Form Batch Baru</p>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Nama Kapal / Batch *</label>
                            <Input
                              placeholder="cth: Dobonsolo"
                              value={newBatch.namaKapal}
                              onChange={(e) => setNewBatch((p) => ({ ...p, namaKapal: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">ETD (Tanggal Berangkat) *</label>
                            <Input
                              type="date"
                              value={newBatch.etd}
                              onChange={(e) => setNewBatch((p) => ({ ...p, etd: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Closing Mulai *</label>
                            <Input
                              type="date"
                              value={newBatch.periodeClosingMulai}
                              onChange={(e) => setNewBatch((p) => ({ ...p, periodeClosingMulai: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Closing Selesai *</label>
                            <Input
                              type="date"
                              value={newBatch.periodeClosingSelesai}
                              onChange={(e) => setNewBatch((p) => ({ ...p, periodeClosingSelesai: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Kota Asal *</label>
                            <Select
                              value={newBatch.kotaAsal}
                              onValueChange={(v) => setNewBatch((p) => ({ ...p, kotaAsal: v }))}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Jakarta">Jakarta</SelectItem>
                                <SelectItem value="Surabaya">Surabaya</SelectItem>
                                <SelectItem value="Makassar">Makassar</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Tujuan</label>
                            <Input
                              value={newBatch.tujuan}
                              onChange={(e) => setNewBatch((p) => ({ ...p, tujuan: e.target.value }))}
                            />
                          </div>
                        </div>
                        <Button
                          onClick={handleCreateBatch}
                          disabled={isCreatingBatch}
                          size="sm"
                          className="w-full gap-2"
                        >
                          {isCreatingBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          {isCreatingBatch ? "Membuat Batch..." : "Buat & Pilih Batch Ini"}
                        </Button>
                      </div>
                    )}

                    {/* Selector batch yang sudah ada */}
                    {!showCreateBatch && (
                      openBatches.length === 0 ? (
                        <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 text-sm text-muted-foreground">
                          Belum ada batch aktif — klik "Buat Batch Baru" di atas
                        </div>
                      ) : (
                        <Select
                          value={selectedBatchId ? String(selectedBatchId) : ""}
                          onValueChange={handleBatchChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih batch pengiriman" />
                          </SelectTrigger>
                          <SelectContent className="max-w-[350px] max-h-[280px] overflow-y-auto">
                            {openBatches.map((b: any) => (
                              <SelectItem key={b.id} value={String(b.id)} className="flex-col items-start py-3">
                                <div className="flex flex-col w-full">
                                  <span className="font-medium text-sm truncate">{b.namaKapal || `Batch #${b.id}`}</span>
                                  {(b.kotaAsal || b.tujuan) && (
                                    <span className="text-xs text-muted-foreground truncate">{b.kotaAsal} → {b.tujuan}</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    )}

                    {/* Info detail batch yang dipilih */}
                    {selectedBatch && !showCreateBatch && (
                      <div className="rounded-lg border bg-muted/20 p-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                        <div>
                          <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Rute</p>
                          <p className="font-semibold text-foreground mt-0.5">{selectedBatch.kotaAsal} → {selectedBatch.tujuan || "Manokwari"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">ETD</p>
                          <p className="font-semibold text-foreground mt-0.5">
                            {new Date(selectedBatch.etd).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Periode Closing</p>
                          <p className="font-semibold text-foreground mt-0.5">
                            {new Date(selectedBatch.periodeClosingMulai).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                            {" – "}
                            {new Date(selectedBatch.periodeClosingSelesai).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Status</p>
                          <p className="font-semibold text-green-700 mt-0.5">{selectedBatch.statusBatch}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Paket Masuk</p>
                          <p className="font-semibold text-foreground mt-0.5">{selectedBatch.packageCount ?? 0} paket</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Jenis Jastip */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Jenis Jastip *</label>
                    <Select value={serviceType} onValueChange={handleServiceTypeChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih jenis jastip" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="jastip pesawat">Jastip Pesawat</SelectItem>
                        <SelectItem value="jastip hemat+">Jastip Hemat+</SelectItem>
                        <SelectItem value="jastip pelni">Jastip Pelni</SelectItem>
                        <SelectItem value="jastip kargo">Jastip Kargo</SelectItem>
                      </SelectContent>
                    </Select>
                    {serviceType && deliveryRoute && (
                      <p className="text-xs text-muted-foreground">Rute otomatis: <span className="font-medium text-foreground">{deliveryRoute}</span></p>
                    )}
                  </div>

                  <Button
                    onClick={goToUpload}
                    disabled={!selectedBatchId || !serviceType}
                    className="w-full gap-2"
                  >
                    <ChevronRight className="w-4 h-4" />
                    Lanjut Upload File
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Step 2: Upload File ── */}
          {step !== "setup" && (
            <Card className={step === "upload" ? "border-primary/50 shadow-md" : ""}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="w-4 h-4" />Upload File Excel
                </CardTitle>
                <CardDescription>
                  {templateType === "kargo"
                    ? "Upload file menggunakan Template 2 (Kargo)"
                    : "Upload file menggunakan Template 1 (Standard)"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!file ? (
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                      isKargo
                        ? "border-orange-300 hover:border-orange-500 hover:bg-orange-50/40"
                        : "border-blue-300 hover:border-blue-500 hover:bg-blue-50/40"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileSpreadsheet className={`w-10 h-10 mx-auto mb-3 ${isKargo ? "text-orange-400" : "text-blue-400"}`} />
                    <p className={`font-semibold text-sm ${isKargo ? "text-orange-700" : "text-blue-700"}`}>
                      {isKargo ? "Upload Template Kargo (.xlsx / .xls / .csv)" : "Upload Template Standard (.xlsx / .xls / .csv)"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Klik atau drag &amp; drop file di sini</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                ) : (
                  <div className={`flex items-center gap-3 p-3 rounded-lg border ${isKargo ? "bg-orange-50 border-orange-200" : "bg-blue-50 border-blue-200"}`}>
                    <File className={`w-8 h-8 shrink-0 ${isKargo ? "text-orange-500" : "text-blue-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{file.name}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <Badge variant="secondary" className={`text-xs ${isKargo ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                          {isKargo ? "Template Kargo" : "Template Standard"}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">{rawRows.length} baris</Badge>
                        {validCount > 0 && <Badge className="text-xs bg-green-100 text-green-800 hover:bg-green-100">{validCount} valid</Badge>}
                        {errorCount > 0 && <Badge variant="destructive" className="text-xs">{errorCount} error</Badge>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={clearFile}><X className="w-4 h-4" /></Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Step 3: Preview ── */}
          {step === "preview" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Preview Data ({validCount} baris valid)</CardTitle>
                  {errorCount > 0 && (
                    <Badge variant="destructive">{errorCount} baris error (dilewati)</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto rounded-lg border text-xs max-h-72">
                  {isKargo ? (
                    /* Tabel kargo */
                    <table className="w-full">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">#</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Nama Konsumen</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Toko/Kurir</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Koli</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Jenis Barang</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">P×L×T (cm)</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap text-blue-700">Pakai (M³)</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap text-amber-700">Harga Kubikasi</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap text-green-700">Ongkir Paket</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap text-amber-600">Biaya Tambahan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} className={`border-t ${row.error ? "bg-red-50" : i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                            <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                            {row.error ? (
                              <td colSpan={9} className="px-2 py-1.5 text-red-600">
                                <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" />{row.error}</span>
                              </td>
                            ) : (
                              <>
                                <td className="px-2 py-1.5 font-medium whitespace-nowrap">{row.customerName || "-"}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{row.resiNumber || "-"}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{row.packagingType || "-"}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{row.itemName || "-"}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                  {(row.length && row.width && row.height) ? `${row.length}×${row.width}×${row.height}` : "-"}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap font-semibold text-blue-700">
                                  {(row as any).usedWeight != null
                                    ? Number((row as any).usedWeight).toFixed(4)
                                    : (row as any).volumeWeight != null
                                    ? Number((row as any).volumeWeight).toFixed(4)
                                    : "-"}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap font-semibold text-amber-700">
                                  {row.kargoRate != null ? formatRp(row.kargoRate) : "-"}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap font-semibold text-green-700">{formatRp((row as any).totalShipping)}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap font-medium text-amber-700">
                                  {row.additionalFee ? `${formatRp(row.additionalFee)}${row.additionalFeeReason ? ` (${row.additionalFeeReason})` : ""}` : "-"}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    /* Tabel standard */
                    <table className="w-full">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">#</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Nama Konsumen</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">No Resi</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">No Paket</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Real (Kg)</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">P×L×T (cm)</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Jenis Paking</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Vol (Kg)</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap text-blue-700">Pakai (Kg)</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap text-green-700">Total Ongkir</th>
                          <th className="px-2 py-2 text-left font-medium whitespace-nowrap text-amber-600">Biaya Tambahan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} className={`border-t ${row.error ? "bg-red-50" : i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                            <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                            {row.error ? (
                              <td colSpan={10} className="px-2 py-1.5 text-red-600">
                                <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" />{row.error}</span>
                              </td>
                            ) : (
                              <>
                                <td className="px-2 py-1.5 font-medium whitespace-nowrap">{row.customerName || "-"}</td>
                                <td className="px-2 py-1.5 font-mono whitespace-nowrap">{row.resiNumber || "-"}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{row.packageNumber || "-"}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{row.realWeight ?? "-"}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                  {(row.length && row.width && row.height) ? `${row.length}×${row.width}×${row.height}` : "-"}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{row.packagingType || "-"}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{(row as any).volumeWeight != null ? Number((row as any).volumeWeight).toFixed(3) : "-"}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap font-semibold text-blue-700">{(row as any).usedWeight != null ? (row as any).usedWeight : "-"}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap font-semibold text-green-700">{formatRp((row as any).totalShipping)}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap font-medium text-amber-700">
                                  {row.additionalFee ? `${formatRp(row.additionalFee)}${row.additionalFeeReason ? ` (${row.additionalFeeReason})` : ""}` : "-"}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {isSubmitting && (
                  <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-center">Memproses import & generate barcode...</p>
                  </div>
                )}

                <Button
                  onClick={handleImport}
                  disabled={isSubmitting || validCount === 0}
                  className="w-full gap-2 bg-primary"
                  size="lg"
                >
                  {isSubmitting ? (
                    "Memproses..."
                  ) : (
                    <>
                      <QrCode className="w-5 h-5" />
                      Import {validCount} Paket & Generate Barcode
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Hasil import */}
          {importResult && (
            <Alert
              variant={(importResult as any).failed > 0 ? "destructive" : "default"}
              className={(importResult as any).failed === 0 ? "border-green-400 bg-green-50" : ""}
            >
              <AlertTitle className="flex items-center gap-2">
                {(importResult as any).failed === 0
                  ? <CheckCircle className="w-4 h-4 text-green-600" />
                  : <XCircle className="w-4 h-4" />
                }
                Hasil Import
              </AlertTitle>
              <AlertDescription className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-3 mt-2">
                  <Badge variant="secondary">Total: {(importResult as any).total}</Badge>
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Berhasil: {(importResult as any).success}</Badge>
                  {(importResult as any).failed > 0 && <Badge variant="destructive">Gagal: {(importResult as any).failed}</Badge>}
                </div>
                {(importResult as any).success > 0 && (
                  <p className="text-sm text-green-700">Mengalihkan ke halaman barcode...</p>
                )}
                {(importResult as any).errors?.length > 0 && (
                  <div className="mt-2 p-3 bg-background/50 rounded text-xs font-mono overflow-auto max-h-40 space-y-1">
                    {(importResult as any).errors.map((e: string, i: number) => (
                      <div key={i} className="text-red-600">{e}</div>
                    ))}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
