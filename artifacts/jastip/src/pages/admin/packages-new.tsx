import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useCreatePackage,
  getListPackagesQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calculator, CalendarDays, CheckCircle2, Plus, Users, QrCode, ArrowRight, Layers } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

const packageSchema = z.object({
  packageDate: z.string().optional().nullable(),
  customerId: z.coerce.number().optional().nullable(),
  customerName: z.string().optional().nullable(),
  itemName: z.string().optional().nullable(),
  resiNumber: z.string().min(1, "No Resi wajib diisi"),
  packageNumber: z.string().optional().nullable(),
  packagingType: z.string().optional().nullable(),
  serviceType: z.string().optional().nullable(),
  packageMode: z.string().optional().nullable(),
  deliveryRoute: z.string().optional().nullable(),
  realWeight: z.coerce.number().optional().nullable(),
  length: z.coerce.number().optional().nullable(),
  width: z.coerce.number().optional().nullable(),
  height: z.coerce.number().optional().nullable(),
  volumeWeight: z.coerce.number().optional().nullable(),
  usedWeight: z.coerce.number().optional().nullable(),
  shippingRate: z.coerce.number().optional().nullable(),
  totalWeight: z.coerce.number().optional().nullable(),
  totalShipping: z.coerce.number().optional().nullable(),
  additionalFee: z.coerce.number().optional().nullable(),
  additionalFeeReason: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  // Berat real wajib untuk layanan non-Cargo
  if (data.serviceType !== "jastip kargo") {
    if (!data.realWeight || Number(data.realWeight) <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Berat real wajib diisi", path: ["realWeight"] });
    }
  }
  // Cargo: tarif Ongkir/M3 wajib diisi (totalShipping dihitung otomatis)
  if (data.serviceType === "jastip kargo") {
    if (!data.shippingRate || Number(data.shippingRate) <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ongkir/M3 wajib diisi untuk Cargo", path: ["shippingRate"] });
    }
  }
});

type PackageFormValues = z.infer<typeof packageSchema>;

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

const volumeDivisor: Record<string, number> = {
  "jastip pesawat": 5000,
  "jastip hemat+": 4000,
  "jastip pelni": 4000,
  "jastip kargo": 1000000,
};

const deliveryRouteOptions: Record<string, { value: string; label: string }[]> = {
  "jastip pesawat": [{ value: "Jakarta → Manokwari", label: "Jakarta → Manokwari" }],
  "jastip hemat+": [{ value: "Surabaya → Manokwari", label: "Surabaya → Manokwari" }],
  "jastip kargo": [{ value: "Jakarta/Surabaya → Manokwari", label: "Jakarta/Surabaya → Manokwari" }],
  "jastip pelni": [
    { value: "Jakarta → Manokwari", label: "Jakarta → Manokwari" },
    { value: "Surabaya → Manokwari", label: "Surabaya → Manokwari" },
  ],
};

// Pesawat: pembulatan berat gabungan sesuai spec
// 0.01–0.20→0.20 kg | 0.21–0.40→0.40 kg | 0.41–0.50→0.50 kg | >0.50→berat asli
function roundPesawatGroupWeight(totalWeight: number): number {
  if (totalWeight <= 0) return 0;
  if (totalWeight <= 0.20) return 0.20;
  if (totalWeight <= 0.40) return 0.40;
  if (totalWeight <= 0.50) return 0.50;
  return totalWeight;
}

// Pelni: tarif per-kg berdasarkan TOTAL BERAT GABUNGAN konsumen dalam satu batch.
// Fungsi ini dipakai sebagai estimasi tampilan; server akan menghitung ulang
// dengan benar setelah paket disimpan.
function getPelniRateByTotalWeight(
  totalWeight: number,
  deliveryRoute: string | null | undefined,
): number | null {
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

function getShippingRate(
  serviceType: string | null | undefined,
  deliveryRoute: string | null | undefined,
  weight: number | null | undefined,
): number | null {
  if (!serviceType || !weight || weight <= 0) return null;
  if (serviceType === "jastip pesawat") return 77000;
  if (serviceType === "jastip hemat+") return 10000;
  if (serviceType === "jastip kargo") return 7000;
  if (serviceType === "jastip pelni") return getPelniRateByTotalWeight(weight, deliveryRoute);
  return null;
}

function getTotalShipping(
  serviceType: string | null | undefined,
  deliveryRoute: string | null | undefined,
  weight: number | null | undefined,
): number | null {
  if (!serviceType || !deliveryRoute || !weight || weight <= 0) return null;
  // Pesawat: estimasi per-paket menggunakan aturan pembulatan.
  // Server recalc berdasarkan total berat gabungan konsumen setelah disimpan.
  if (serviceType === "jastip pesawat" && deliveryRoute === "Jakarta → Manokwari") {
    return Math.round(roundPesawatGroupWeight(weight) * 77000);
  }
  if (serviceType === "jastip hemat+" && deliveryRoute === "Surabaya → Manokwari") {
    return Math.max(10000, Math.round(weight * 10000));
  }
  if (serviceType === "jastip kargo" && deliveryRoute === "Jakarta/Surabaya → Manokwari") {
    return Math.max(70000, Math.round(weight * 7000));
  }
  if (serviceType === "jastip pelni") {
    const rate = getPelniRateByTotalWeight(weight, deliveryRoute) || 20000;
    if (rate) return Math.max(20000, Math.round(weight * rate));
  }
  return null;
}

function formatRp(n: number | null | undefined) {
  if (n == null) return "-";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function parseQueryParams() {
  try {
    const q = new URLSearchParams(window.location.search);
    return {
      serviceType: q.get("serviceType") || undefined,
      packageMode: q.get("packageMode") || undefined,
      customerName: q.get("customerName") || undefined,
      packageDate: q.get("packageDate") || undefined,
    };
  } catch {
    return {};
  }
}

type GrupPhase = "inputting" | "naming" | "batch_done";

interface CompletedBatch {
  customerName: string;
  ids: number[];
  count: number;
  weight: number;
}

async function patchPackageCustomerName(id: number, customerName: string) {
  const token = localStorage.getItem("jaj_token");
  const r = await fetch(`/api/packages/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ customerName }),
  });
  if (!r.ok) throw new Error("Gagal memperbarui nama konsumen");
}

function useKargoRate() {
  return useQuery<number | null>({
    queryKey: ["settings", "kargoRate"],
    queryFn: async () => {
      const token = localStorage.getItem("jaj_token");
      const res = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const d = await res.json();
      return d.kargoRate != null ? Number(d.kargoRate) : null;
    },
    staleTime: 60_000,
  });
}

export default function AdminPackagesNew() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const base = user?.role === "owner" ? "/owner" : "/admin";

  const createPackage = useCreatePackage();

  // ── Batch selection ────────────────────────────────────────────────────────
  // Persist last-used batchId in localStorage so admin doesn't re-select every time
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(() => {
    const stored = localStorage.getItem("jaj_last_batch_id");
    return stored ? Number(stored) : null;
  });
  const { data: openBatches = [] } = useQuery<any[]>({
    queryKey: ["batches", "OPEN"],
    queryFn: async () => {
      const token = localStorage.getItem("jaj_token");
      const res = await fetch("/api/batches?statusBatch=OPEN", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });
  // Auto-select the first open batch if nothing is selected or last batch is gone
  useEffect(() => {
    if (openBatches.length === 0) return;
    const ids = openBatches.map((b: any) => b.id);
    if (!selectedBatchId || !ids.includes(selectedBatchId)) {
      const newId = openBatches[0].id;
      setSelectedBatchId(newId);
      localStorage.setItem("jaj_last_batch_id", String(newId));
    }
  }, [openBatches, selectedBatchId]);
  function handleBatchChange(val: string) {
    const id = Number(val);
    setSelectedBatchId(id);
    localStorage.setItem("jaj_last_batch_id", String(id));
  }
  const selectedBatch = openBatches.find((b: any) => b.id === selectedBatchId) ?? null;
  const params = parseQueryParams();
  const packageMode = params.packageMode;
  const isGrup = packageMode === "grup";

  // ── Scanner barcode detection ─────────────────────────────────────────────
  // Hardware scanner mengirim karakter sangat cepat (<80 ms per karakter)
  // diikuti Enter. Kita blok Enter di input No Resi agar tidak men-submit form.
  const resiLastKeyTimeRef = useRef<number>(0);
  const resiIsLikelyScannerRef = useRef<boolean>(false);

  function handleResiKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const now = Date.now();
    const delta = now - resiLastKeyTimeRef.current;
    resiLastKeyTimeRef.current = now;

    // Tandai sebagai input scanner bila karakter datang sangat cepat
    if (e.key.length === 1) {
      if (delta < 80) {
        resiIsLikelyScannerRef.current = true;
      } else {
        // Ketukan lambat = manusia mengetik manual, reset flag
        resiIsLikelyScannerRef.current = false;
      }
    }

    if (e.key === "Enter") {
      // Selalu blok Enter di input ini — baik dari scanner maupun keyboard
      e.preventDefault();
      e.stopPropagation();

      // Setelah scanner mengisi resi, pindah fokus ke field berikutnya
      // sehingga operator bisa langsung lanjut input tanpa klik manual
      if (resiIsLikelyScannerRef.current) {
        const formEl = (e.target as HTMLElement).closest("form");
        if (formEl) {
          const focusable = Array.from(
            formEl.querySelectorAll<HTMLElement>(
              "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])"
            )
          );
          const idx = focusable.indexOf(e.target as HTMLElement);
          if (idx >= 0 && idx + 1 < focusable.length) {
            focusable[idx + 1].focus();
          }
        }
        resiIsLikelyScannerRef.current = false;
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Single-mode group state (legacy)
  const [lastSavedId, setLastSavedId] = useState<number | null>(null);

  const [savedGrup, setSavedGrup] = useState<{
    customerName: string;
    serviceType: string;
    packageDate: string;
    deliveryRoute: string;
  } | null>(null);
  const [singleGrupIds, setSingleGrupIds] = useState<number[]>([]);
  const [singleGrupTotalWeight, setSingleGrupTotalWeight] = useState(0);
  const [singleGrupCount, setSingleGrupCount] = useState(0);

  // Multi-name grup state
  const [grupPhase, setGrupPhase] = useState<GrupPhase>("inputting");
  const [completedBatches, setCompletedBatches] = useState<CompletedBatch[]>([]);
  const [currentBatchIds, setCurrentBatchIds] = useState<number[]>([]);
  const [currentBatchCount, setCurrentBatchCount] = useState(0);
  const [currentBatchWeight, setCurrentBatchWeight] = useState(0);
  const [currentBatchName, setCurrentBatchName] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [isAssigningName, setIsAssigningName] = useState(false);

  const allGrupIds = [
    ...completedBatches.flatMap((b) => b.ids),
    ...currentBatchIds,
  ];
  const totalGrupPackages = completedBatches.reduce((s, b) => s + b.count, 0) + currentBatchCount;

  const defaultRoute = params.serviceType
    ? (deliveryRouteOptions[params.serviceType]?.[0]?.value ?? undefined)
    : undefined;

  const form = useForm<PackageFormValues>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      packageDate: params.packageDate || todayStr(),
      resiNumber: "",
      packageNumber: "",
      itemName: "",
      customerName: isGrup ? "" : (params.customerName || ""),
      serviceType: params.serviceType,
      packageMode: packageMode,
      deliveryRoute: defaultRoute,
    },
  });

  const serviceType = form.watch("serviceType");
  const deliveryRoute = form.watch("deliveryRoute");
  const length = form.watch("length");
  const width = form.watch("width");
  const height = form.watch("height");
  const realWeight = form.watch("realWeight");

  const isKargo = serviceType === "jastip kargo";
  const isPelni = serviceType === "jastip pelni";
  const isPesawat = serviceType === "jastip pesawat";

  const watchedUsedWeight = form.watch("usedWeight");
  const watchedVolumeWeight = form.watch("volumeWeight");
  const watchedShippingRate = form.watch("shippingRate");
  const watchedTotalShipping = form.watch("totalShipping");
  const watchedAdditionalFee = form.watch("additionalFee");

  useEffect(() => {
    if (!serviceType) {
      form.setValue("deliveryRoute", "" as any, { shouldDirty: true });
      return;
    }
    const options = deliveryRouteOptions[serviceType] ?? [];
    if (options.length === 0) {
      form.setValue("deliveryRoute", "" as any, { shouldDirty: true });
      return;
    }
    const currentRoute = form.getValues("deliveryRoute");
    const selectedRoute = options.find((o) => o.value === currentRoute);
    if (!selectedRoute) {
      form.setValue("deliveryRoute", options[0].value, { shouldDirty: true });
    }
  }, [serviceType]);

  useEffect(() => {
    const currentRoute = form.getValues("deliveryRoute");
    let vw: number | null = null;
    const divisor = serviceType ? volumeDivisor[serviceType] : undefined;
    if (divisor && length && width && height && length > 0 && width > 0 && height > 0) {
      vw = Number(((length * width * height) / divisor).toFixed(4));
    }
    form.setValue("volumeWeight", vw, { shouldDirty: true });

    const real = realWeight ?? 0;
    const volume = vw ?? 0;
    const uw = Math.max(real, volume);
    form.setValue("usedWeight", uw > 0 ? uw : null, { shouldDirty: true });

    // Kargo: shippingRate diisi manual, totalShipping dihitung di effect terpisah
    if (serviceType === "jastip kargo") return;

    const effectiveRoute = currentRoute || deliveryRoute;
    const rate = uw > 0 ? getShippingRate(serviceType, effectiveRoute, uw) : null;
    const total = uw > 0 ? getTotalShipping(serviceType, effectiveRoute, uw) : null;
    form.setValue("shippingRate", rate ?? null, { shouldDirty: true });
    form.setValue("totalShipping", total ?? null, { shouldDirty: true });
  }, [serviceType, deliveryRoute, realWeight, length, width, height]);

  // Kargo: auto-hitung totalShipping = Berat Kubikasi × Ongkir/M3
  useEffect(() => {
    if (serviceType !== "jastip kargo") return;
    if (watchedVolumeWeight != null && watchedVolumeWeight > 0 && watchedShippingRate != null && watchedShippingRate > 0) {
      form.setValue("totalShipping", Math.round(watchedVolumeWeight * watchedShippingRate), { shouldDirty: true });
    } else {
      form.setValue("totalShipping", null, { shouldDirty: true });
    }
  }, [watchedVolumeWeight, watchedShippingRate, serviceType]);

  async function onSubmit(values: PackageFormValues) {
    // Require customerName for all modes
    if (!values.customerName?.trim()) {
      form.setError("customerName", { message: "Nama pemilik paket wajib diisi" });
      return;
    }

    if (!selectedBatchId) {
      toast({ variant: "destructive", title: "Pilih Batch Pengiriman", description: "Silakan pilih atau buat Batch Pengiriman terlebih dahulu." });
      return;
    }

    try {
      setIsSubmitting(true);

      if (!isGrup) {
        // --- SINGLE MODE ---
        const newTotalWeight = singleGrupTotalWeight + (values.realWeight ?? 0);
        const result = await createPackage.mutateAsync({
          data: {
            ...values,
            batchId: selectedBatchId,
            totalWeight: packageMode === "grup" ? newTotalWeight : (values.realWeight ?? undefined),
          } as any,
        });
        queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });

        if (packageMode === "grup") {
          const newId = (result as any)?.id;
          if (newId) setSingleGrupIds((prev) => [...prev, newId]);
          setSingleGrupTotalWeight(newTotalWeight);
          setSingleGrupCount((c) => c + 1);
          setSavedGrup({
            customerName: values.customerName || "",
            serviceType: values.serviceType || "",
            packageDate: values.packageDate || todayStr(),
            deliveryRoute: values.deliveryRoute || "",
          });
          form.reset({
            packageDate: values.packageDate || todayStr(),
            resiNumber: "",
            packageNumber: "",
            itemName: "",
            customerName: values.customerName,
            serviceType: values.serviceType,
            packageMode: "grup",
            deliveryRoute: values.deliveryRoute,
          });
          toast({ title: "Paket disimpan", description: "Silakan input paket berikutnya atau klik Selesai." });
        } else {
          // SINGLE MODE: Tetap di halaman input setelah simpan
          const newId = (result as any)?.id;
          setLastSavedId(newId ?? null);
          form.reset({
            packageDate: values.packageDate || todayStr(),
            resiNumber: "",
            packageNumber: "",
            itemName: "",
            customerName: "",
            serviceType: values.serviceType,
            packageMode: values.packageMode,
            deliveryRoute: values.deliveryRoute,
          });
          toast({
            title: "✓ Paket berhasil disimpan",
            description: "Silakan input paket berikutnya. Klik 'Cetak Barcode' jika perlu mencetak label.",
          });
        }
      } else {
        // --- GRUP MULTI-NAMA MODE ---
        const newWeight = currentBatchWeight + (values.realWeight ?? 0);
        const result = await createPackage.mutateAsync({
          data: {
            ...values,
            batchId: selectedBatchId,
            customerName: values.customerName || "",
            totalWeight: newWeight,
          } as any,
        });
        queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });

        const newId = (result as any)?.id;
        const newCount = currentBatchCount + 1;
        const newIds = newId ? [...currentBatchIds, newId] : currentBatchIds;

        setCurrentBatchIds(newIds);
        setCurrentBatchCount(newCount);
        setCurrentBatchWeight(newWeight);
        setCurrentBatchName(values.customerName?.trim() || "");

        form.reset({
          packageDate: values.packageDate || todayStr(),
          resiNumber: "",
          packageNumber: "",
          itemName: "",
          customerName: values.customerName || "",
          serviceType: values.serviceType,
          packageMode: "grup",
          deliveryRoute: values.deliveryRoute,
        });

        toast({
          title: `Paket ke-${newCount} tersimpan — ${values.customerName?.trim() || ""}`,
          description: "Lanjut input paket berikutnya, atau klik 'Selesaikan Batch, Ganti Nama' untuk pindah ke penerima lain.",
        });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal", description: error.message || "Terjadi kesalahan" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAssignName() {
    if (!pendingName.trim()) {
      toast({ variant: "destructive", title: "Nama wajib diisi", description: "Masukkan nama penerima untuk paket-paket ini." });
      return;
    }
    if (currentBatchIds.length === 0) {
      toast({ variant: "destructive", title: "Belum ada paket", description: "Input minimal 1 paket sebelum memasukkan nama." });
      return;
    }
    setIsAssigningName(true);
    try {
      await Promise.all(currentBatchIds.map((id) => patchPackageCustomerName(id, pendingName.trim())));
      queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });

      const newBatch: CompletedBatch = {
        customerName: pendingName.trim(),
        ids: currentBatchIds,
        count: currentBatchCount,
        weight: currentBatchWeight,
      };
      setCompletedBatches((prev) => [...prev, newBatch]);
      setCurrentBatchIds([]);
      setCurrentBatchCount(0);
      setCurrentBatchWeight(0);
      setPendingName("");
      setGrupPhase("batch_done");
      toast({ title: `Nama "${pendingName.trim()}" berhasil disimpan`, description: `${currentBatchCount} paket telah ditugaskan.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gagal menyimpan nama", description: err.message });
    } finally {
      setIsAssigningName(false);
    }
  }

  function startNewBatch() {
    setGrupPhase("inputting");
    setPendingName("");
    form.reset({
      packageDate: form.getValues("packageDate") || todayStr(),
      resiNumber: "",
      packageNumber: "",
      itemName: "",
      customerName: "",
      serviceType: form.getValues("serviceType"),
      packageMode: "grup",
      deliveryRoute: form.getValues("deliveryRoute"),
    });
  }

  function finalizeBatch() {
    if (currentBatchIds.length === 0) return;
    const batchName = currentBatchName || form.getValues("customerName")?.trim() || "(Tanpa Nama)";
    const newBatch: CompletedBatch = {
      customerName: batchName,
      ids: currentBatchIds,
      count: currentBatchCount,
      weight: currentBatchWeight,
    };
    setCompletedBatches((prev) => [...prev, newBatch]);
    setCurrentBatchIds([]);
    setCurrentBatchCount(0);
    setCurrentBatchWeight(0);
    setCurrentBatchName("");
    setGrupPhase("batch_done");
    form.reset({
      packageDate: form.getValues("packageDate") || todayStr(),
      resiNumber: "",
      packageNumber: "",
      itemName: "",
      customerName: "",
      serviceType: form.getValues("serviceType"),
      packageMode: "grup",
      deliveryRoute: form.getValues("deliveryRoute"),
    });
    toast({ title: `Batch "${batchName}" selesai`, description: `${currentBatchCount} paket · Silakan input nama & paket berikutnya.` });
  }

  function goNextPackage() {
    if (!savedGrup) return;
    setSavedGrup(null);
    form.reset({
      packageDate: savedGrup.packageDate,
      resiNumber: "",
      packageNumber: "",
      itemName: "",
      customerName: savedGrup.customerName,
      serviceType: savedGrup.serviceType,
      packageMode: "grup",
      deliveryRoute: savedGrup.deliveryRoute,
    });
  }

  const serviceLabel: Record<string, string> = {
    "jastip pesawat": "Jastip Pesawat",
    "jastip hemat+": "Jastip Hemat+",
    "jastip kargo": "Jastip Kargo",
    "jastip pelni": "Jastip Pelni",
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setLocation(`${base}/packages/type`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Input Paket Baru</h1>
          <p className="text-muted-foreground mt-1">
            {serviceType ? (
              <>
                <span className="font-medium text-foreground">{serviceLabel[serviceType] || serviceType}</span>
                {isGrup ? " — Grup Paket (Multi Nama)" : packageMode === "grup" ? " — Grup Paket" : " — 1 Paket"}
              </>
            ) : (
              "Masukkan data lengkap paket yang diterima."
            )}
          </p>
        </div>
      </div>

      {/* ===== GRUP MULTI-NAMA MODE ===== */}
      {isGrup && (
        <div className="space-y-4">
          {/* Summary bar */}
          {(completedBatches.length > 0 || currentBatchCount > 0) && (
            <Card className="border-blue-300 bg-blue-50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Layers className="h-5 w-5 text-blue-600 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-blue-800">
                      Total: {allGrupIds.length} paket tersimpan
                    </p>
                    {completedBatches.map((b, i) => (
                      <span key={i} className="inline-flex items-center gap-1 mr-2 mt-1">
                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                          ✓ {b.customerName} ({b.count} pkt)
                        </Badge>
                      </span>
                    ))}
                    {currentBatchCount > 0 && currentBatchName && (
                      <Badge variant="outline" className="text-xs text-blue-700 border-blue-400 bg-blue-100 ml-1 mt-1">
                        Sesi aktif: {currentBatchCount} pkt — {currentBatchName}
                      </Badge>
                    )}
                    {currentBatchCount > 0 && !currentBatchName && (
                      <Badge variant="outline" className="text-xs text-amber-700 border-amber-400 bg-amber-50 ml-1 mt-1">
                        Sesi aktif: {currentBatchCount} pkt (isi nama pemilik)
                      </Badge>
                    )}
                  </div>
                  {allGrupIds.length > 0 && (
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => setLocation(`${base}/barcode${allGrupIds.length > 0 ? `?ids=${allGrupIds.join(",")}` : ""}`)}
                    >
                      <QrCode className="h-4 w-4 mr-1" /> Generate {allGrupIds.length} Barcode Paket
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}


          {/* PHASE: batch_done — name assigned */}
          {grupPhase === "batch_done" && completedBatches.length > 0 && (
            <Card className="border-green-500 bg-green-50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-green-800">
                      Nama "{completedBatches[completedBatches.length - 1]?.customerName}" berhasil disimpan!
                    </p>
                    <p className="text-sm text-green-700 mt-0.5">
                      {completedBatches[completedBatches.length - 1]?.count} paket · Total berat: {completedBatches[completedBatches.length - 1]?.weight.toFixed(3)} Kg
                    </p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <Button size="sm" variant="outline" className="gap-1 border-green-400 text-green-700 hover:bg-green-100" onClick={startNewBatch}>
                        <Plus className="h-3.5 w-3.5" /> Tambah Nama Baru
                      </Button>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 gap-1"
                        onClick={() => setLocation(`${base}/barcode${allGrupIds.length > 0 ? `?ids=${allGrupIds.join(",")}` : ""}`)}
                      >
                        <QrCode className="h-3.5 w-3.5" /> Generate Barcode
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Counter badge during inputting */}
          {grupPhase === "inputting" && (
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className="text-sm px-3 py-1 bg-primary text-primary-foreground">
                Paket ke-{currentBatchCount + 1}
              </Badge>
              {currentBatchCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 border-green-500 text-green-700 hover:bg-green-50"
                  onClick={finalizeBatch}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Selesaikan Batch, Ganti Nama
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== NOTIFIKASI SIMPAN SINGLE MODE ===== */}
      {!isGrup && packageMode !== "grup" && lastSavedId !== null && (
        <Card className="border-green-500 bg-green-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-800">Paket berhasil disimpan!</p>
                <p className="text-sm text-green-700 mt-0.5">
                  Form sudah dikosongkan. Silakan input paket berikutnya.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 border-green-400 text-green-700 hover:bg-green-100"
                    onClick={() => setLastSavedId(null)}
                  >
                    Input Paket Baru
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 gap-1"
                    onClick={() => setLocation(`${base}/barcode?ids=${lastSavedId}`)}
                  >
                    <QrCode className="h-3.5 w-3.5" /> Cetak Barcode
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== SINGLE GRUP MODE (legacy - same customer name) ===== */}
      {!isGrup && packageMode === "grup" && singleGrupCount > 0 && !savedGrup && (
        <Card className="border-blue-300 bg-blue-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="font-semibold text-blue-800">Sesi Grup — {singleGrupCount} paket tersimpan</p>
                <p className="text-sm text-blue-700">Total berat sesi: <strong>{singleGrupTotalWeight.toFixed(3)} Kg</strong></p>
              </div>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => setLocation(`${base}/barcode${singleGrupIds.length > 0 ? `?ids=${singleGrupIds.join(",")}` : ""}`)}
              >
                Selesai & Cetak Barcode
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isGrup && savedGrup && (
        <Card className="border-green-500 bg-green-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-800">Paket berhasil disimpan!</p>
                <p className="text-sm text-green-700 mt-0.5">
                  Konsumen: <strong>{savedGrup.customerName}</strong> · {serviceLabel[savedGrup.serviceType] || savedGrup.serviceType}
                </p>
                <p className="text-sm text-green-700">{singleGrupCount} paket · Total berat: <strong>{singleGrupTotalWeight.toFixed(3)} Kg</strong></p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="gap-1 border-green-400" onClick={goNextPackage}>
                    <Plus className="h-3.5 w-3.5" /> Input Paket Berikutnya
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => setLocation(`${base}/barcode${singleGrupIds.length > 0 ? `?ids=${singleGrupIds.join(",")}` : ""}`)}
                  >
                    Selesai &amp; Cetak Barcode
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== FORM ===== */}
      {(!isGrup || grupPhase === "inputting") && (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
                // preventDefault: cegah browser submit form via Enter
                // stopPropagation: pastikan event tidak naik ke elemen lain
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            className="space-y-6"
          >
            {/* ── Batch Pengiriman Selector ── */}
            <Card className={openBatches.length === 0 ? "border-destructive/50 bg-destructive/5" : "border-primary/20 bg-primary/5"}>
              <CardContent className="pt-4 pb-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold flex items-center gap-2">
                    🚢 Batch Pengiriman <span className="text-destructive">*</span>
                  </label>
                  {openBatches.length === 0 ? (
                    <div className="text-sm text-destructive">
                      Belum ada Batch Pengiriman aktif.{" "}
                      <button
                        type="button"
                        className="underline font-medium"
                        onClick={() => setLocation(`${base}/batches`)}
                      >
                        Buat batch baru di sini.
                      </button>
                    </div>
                  ) : (
                    <Select value={String(selectedBatchId ?? "")} onValueChange={handleBatchChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih batch pengiriman..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px] overflow-y-auto">
                        {openBatches.map((b: any) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardContent>
            </Card>

            {isKargo ? (
              /* ====== FORM KHUSUS JASTIP KARGO ====== */
              <>
                {/* Card 1: Info Dasar Kargo */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      Data Kargo
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Nama Konsumen */}
                    <FormField
                      control={form.control}
                      name="customerName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Nama Konsumen <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="Nama pemilik / penerima kargo" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Tgl Masuk */}
                    <FormField
                      control={form.control}
                      name="packageDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tgl Masuk <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Toko / Kurir */}
                    <FormField
                      control={form.control}
                      name="resiNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Toko / Kurir <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Nama toko atau kurir pengirim"
                              {...field}
                              value={field.value || ""}
                              onKeyDown={handleResiKeyDown}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Total Koli */}
                    <FormField
                      control={form.control}
                      name="packageNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total Koli</FormLabel>
                          <FormControl>
                            <Input
                              type="number" min="1" step="1" placeholder="Jumlah koli (kotak/karton)"
                              {...field} value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Koli (nomor/identitas koli) */}
                    <FormField
                      control={form.control}
                      name="packagingType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Koli</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Contoh: Koli 1, Koli 2/3..."
                              {...field} value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Jenis Barang */}
                    <FormField
                      control={form.control}
                      name="itemName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Jenis Barang</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Contoh: Elektronik, Mesin, Material bangunan..."
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Card 2: Ukuran & Kalkulasi Ongkir */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calculator className="h-4 w-4" />
                      Ukuran &amp; Kalkulasi Ongkir
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Ukuran: Panjang × Lebar × Tinggi ÷ 1.000.000 */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Ukuran (Panjang × Lebar × Tinggi ÷ 1.000.000 Kubik)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                          { name: "length" as const, label: "Panjang (cm)" },
                          { name: "width" as const, label: "Lebar (cm)" },
                          { name: "height" as const, label: "Tinggi (cm)" },
                        ].map(({ name, label }) => (
                          <FormField
                            key={name}
                            control={form.control}
                            name={name}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{label} <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                  <Input
                                    type="text" inputMode="decimal" placeholder="0"
                                    {...field} value={field.value ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      field.onChange(v === "" ? null : Number(v));
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>

                    {/* M3 (auto dari dimensi) */}
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">M³ / Ton (Kubikasi)</p>
                      <p className="text-xl font-black text-orange-600">
                        {watchedVolumeWeight != null ? watchedVolumeWeight.toFixed(4) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">P × L × T ÷ 1.000.000</p>
                    </div>

                    {/* Ton (input manual, opsional untuk Cargo) */}
                    <FormField
                      control={form.control}
                      name="realWeight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>M³ / Ton (Berat Aktual) <span className="text-xs font-normal text-muted-foreground">(Opsional)</span></FormLabel>
                          <FormControl>
                            <Input
                              type="number" step="0.001" placeholder="0.000"
                              {...field} value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">Masukkan dalam satuan Ton (opsional untuk Cargo)</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Digunakan = max(M3, Ton) */}
                    {watchedUsedWeight != null && watchedUsedWeight > 0 && (
                      <div className="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">M³/Ton yang Digunakan</p>
                          <p className="text-lg font-black text-orange-700">
                            {watchedUsedWeight.toFixed(4)}
                            <span className="text-xs font-normal ml-1">
                              {watchedVolumeWeight != null && realWeight != null
                                ? (watchedVolumeWeight >= (realWeight ?? 0) ? "(M³ lebih besar)" : "(Ton lebih besar)")
                                : ""}
                            </span>
                          </p>
                        </div>
                        <p className="text-xs text-orange-600">MAX(M³, Ton)</p>
                      </div>
                    )}

                    {/* Ongkir/M3 — tarif per M³ (user-input), totalShipping dihitung otomatis */}
                    <FormField
                      control={form.control}
                      name="shippingRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ongkir/M3 (Tarif per M³) <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
                              <Input
                                type="number" step="1000" placeholder="0"
                                className="pl-9 text-lg font-bold"
                                {...field} value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                              />
                            </div>
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">
                            Total ongkir dihitung otomatis: Berat Kubikasi × Ongkir/M3
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {watchedTotalShipping != null && watchedTotalShipping > 0 && (
                      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 px-4 py-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Ongkir (otomatis)</p>
                        <p className="text-2xl font-black text-primary mt-1">{formatRp(watchedTotalShipping)}</p>
                        {watchedVolumeWeight != null && watchedShippingRate != null && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {watchedVolumeWeight.toFixed(4)} M³ × {formatRp(watchedShippingRate)} = {formatRp(watchedTotalShipping)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Jenis Jastip (otomatis) | Lokasi Pengiriman (otomatis) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="serviceType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Jenis Jastip</FormLabel>
                            <div className="flex items-center h-10 px-3 rounded-md border border-input bg-muted/40 text-sm font-medium">
                              {serviceLabel[field.value || ""] || field.value || "Jastip Kargo"}
                              <span className="ml-auto text-xs text-muted-foreground">Otomatis</span>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="deliveryRoute"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Lokasi Pengiriman</FormLabel>
                            <div className="flex items-center h-10 px-3 rounded-md border border-input bg-muted/40 text-sm font-medium">
                              {field.value || "Jakarta/Surabaya → Manokwari"}
                              <span className="ml-auto text-xs text-muted-foreground">Otomatis</span>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Biaya Tambahan (Opsional) */}
                    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                          Biaya Tambahan <span className="font-normal text-muted-foreground text-[11px]">(Opsional)</span>
                        </p>
                        <span className="text-[11px] text-amber-700">Contoh: Paking kayu, bubble wrap, karung, dll</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="additionalFee"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nominal Biaya Tambahan (Rp)</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
                                  <Input
                                    type="number" step="1000" placeholder="0"
                                    className="pl-9 font-semibold"
                                    {...field} value={field.value ?? ""}
                                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="additionalFeeReason"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Keterangan Biaya Tambahan</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Contoh: Paking kayu, bubble wrap ekstra..."
                                  {...field} value={field.value || ""}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              /* ====== FORM STANDAR (non-kargo) ====== */
              <>
                {/* Section: Identitas Paket */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      Identitas Paket
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="packageDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tanggal <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input type="date" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="customerName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Nama Pemilik Paket <span className="text-destructive">*</span>
                              {isGrup && (
                                <span className="text-xs font-normal text-muted-foreground ml-1">(nama penerima paket ini)</span>
                              )}
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="Masukkan nama pemilik paket" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="resiNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>No Resi <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Contoh: JNE123456789 (bisa scan barcode)"
                                {...field}
                                onKeyDown={handleResiKeyDown}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="packageNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>No Paket</FormLabel>
                            <FormControl>
                              <Input placeholder="Contoh: PKT-001" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="serviceType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Jenis Jastip</FormLabel>
                            {params.serviceType ? (
                              <div className="flex items-center h-10 px-3 rounded-md border border-input bg-muted/40 text-sm font-medium">
                                {serviceLabel[field.value || ""] || field.value || params.serviceType}
                                <span className="ml-auto text-xs text-muted-foreground">Otomatis</span>
                              </div>
                            ) : (
                              <FormControl>
                                <Select onValueChange={field.onChange} value={field.value || ""}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Pilih jenis jastip" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="jastip pesawat">Jastip Pesawat</SelectItem>
                                    <SelectItem value="jastip hemat+">Jastip Hemat+</SelectItem>
                                    <SelectItem value="jastip kargo">Jastip Kargo</SelectItem>
                                    <SelectItem value="jastip pelni">Jastip Pelni</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormControl>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="deliveryRoute"
                        render={({ field }) => {
                          const routeOpts = deliveryRouteOptions[serviceType || ""] || [];
                          const isSingleRoute = params.serviceType && routeOpts.length === 1;
                          return (
                            <FormItem>
                              <FormLabel>Lokasi Pengiriman</FormLabel>
                              {isSingleRoute ? (
                                <div className="flex items-center h-10 px-3 rounded-md border border-input bg-muted/40 text-sm font-medium">
                                  {field.value || routeOpts[0]?.label || "-"}
                                  <span className="ml-auto text-xs text-muted-foreground">Otomatis</span>
                                </div>
                              ) : (
                                <FormControl>
                                  <Select onValueChange={field.onChange} value={field.value || ""} disabled={!serviceType}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder={serviceType ? "Pilih lokasi pengiriman" : "Pilih jenis jastip dahulu"} />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {routeOpts.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </FormControl>
                              )}
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Section: Berat & Dimensi */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calculator className="h-4 w-4" />
                      Berat &amp; Dimensi
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="realWeight"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Berat Real (Kg) <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input
                                type="number" step="0.001" placeholder="0.000"
                                {...field} value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        { name: "length" as const, label: "Panjang (cm)" },
                        { name: "width" as const, label: "Lebar (cm)" },
                        { name: "height" as const, label: "Tinggi (cm)" },
                      ].map(({ name, label }) => (
                        <FormField
                          key={name}
                          control={form.control}
                          name={name}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{label} <span className="text-muted-foreground font-normal text-xs">(Opsional)</span></FormLabel>
                              <FormControl>
                                <Input
                                  type="text" inputMode="decimal" placeholder="0"
                                  {...field} value={field.value ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    field.onChange(v === "" ? null : Number(v));
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>

                    {/* Jenis Paking (opsional) */}
                    <FormField
                      control={form.control}
                      name="packagingType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Jenis Paking{" "}
                            <span className="text-muted-foreground font-normal text-xs">(Opsional)</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Contoh: Karton, Kayu, Plastik..."
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Biaya Tambahan (Opsional) */}
                    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                          Biaya Tambahan <span className="font-normal text-muted-foreground text-[11px]">(Opsional)</span>
                        </p>
                        <span className="text-[11px] text-amber-700">Contoh: Paking kayu, bubble wrap, karung, dll</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="additionalFee"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nominal Biaya Tambahan (Rp)</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
                                  <Input
                                    type="number" step="1000" placeholder="0"
                                    className="pl-9 font-semibold"
                                    {...field} value={field.value ?? ""}
                                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="additionalFeeReason"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Keterangan Biaya Tambahan</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Contoh: Paking kayu, bubble wrap ekstra..."
                                  {...field} value={field.value || ""}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Notif khusus Pesawat: hitung dari total berat gabungan konsumen */}
                    {isPesawat && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex gap-3">
                        <span className="text-blue-500 text-lg shrink-0">✈️</span>
                        <div className="text-xs text-blue-800 space-y-1">
                          <p className="font-bold">Pesawat: Ongkir dihitung dari total berat gabungan konsumen</p>
                          <p>Sistem menjumlahkan berat semua paket konsumen ini dalam batch yang sama, baru dibulatkan dan dikalikan Rp77.000/kg. Nilai di bawah adalah estimasi — akan diperbarui otomatis setelah disimpan.</p>
                          <p className="font-medium">Pembulatan: ≤0,20 kg→0,20 · ≤0,40 kg→0,40 · ≤0,50 kg→0,50 · &gt;0,50 kg→berat asli × Rp77.000</p>
                        </div>
                      </div>
                    )}

                    {/* Notif khusus Pelni: hitung dari total berat konsumen */}
                    {isPelni && (
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 flex gap-3">
                        <span className="text-indigo-500 text-lg shrink-0">🚢</span>
                        <div className="text-xs text-indigo-800 space-y-1">
                          <p className="font-bold">Pelni: Ongkir dihitung dari total berat gabungan konsumen</p>
                          <p>Sistem akan menjumlahkan semua berat paket konsumen ini dalam batch yang sama, lalu menentukan harga/kg dari tabel bertingkat. Nilai di bawah adalah estimasi paket ini saja — akan diperbarui otomatis setelah disimpan.</p>
                          <p className="font-medium">Tabel: ≤10,1 kg → Rp20.000 · ≤20,1 kg → Rp19.000 · ≤40,1 kg → Rp18.000 · ≤80,1 kg → Rp17.000 · &gt;80 kg → Rp16.000</p>
                        </div>
                      </div>
                    )}

                    {/* Auto-calculated summary */}
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        Kalkulasi Otomatis{(isPelni || isPesawat) ? " (estimasi paket ini)" : ""}
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Berat Kubikasi</p>
                          <p className="font-semibold">{watchedVolumeWeight != null ? watchedVolumeWeight.toFixed(3) : "-"}</p>
                          {serviceType && volumeDivisor[serviceType] && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              P × L × T ÷ {volumeDivisor[serviceType].toLocaleString("id-ID")}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Berat Digunakan (Kg)</p>
                          <p className="font-semibold text-primary">{watchedUsedWeight != null ? watchedUsedWeight.toFixed(3) : "-"}</p>
                          {watchedUsedWeight != null && realWeight != null && watchedVolumeWeight != null && (
                            <p className="text-xs text-muted-foreground">
                              MAX({realWeight.toFixed(3)}, {watchedVolumeWeight.toFixed(3)})
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {isPelni ? "Tarif/Kg (estimasi)" : "Tarif / Kg"}
                          </p>
                          <p className="font-semibold">{formatRp(watchedShippingRate)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {isPelni ? "Ongkir (estimasi)" : "Total Ongkir"}
                          </p>
                          <p className="font-semibold text-primary">{formatRp(watchedTotalShipping)}</p>
                        </div>
                        {watchedAdditionalFee != null && Number(watchedAdditionalFee) > 0 && (
                          <div>
                            <p className="text-xs text-amber-700 font-medium">Biaya Tambahan</p>
                            <p className="font-bold text-amber-700">{formatRp(watchedAdditionalFee)}</p>
                          </div>
                        )}
                        {watchedAdditionalFee != null && Number(watchedAdditionalFee) > 0 && (
                          <div>
                            <p className="text-xs text-green-800 font-bold">Total Tagihan</p>
                            <p className="font-black text-green-700 text-base">
                              {formatRp((Number(watchedTotalShipping) || 0) + Number(watchedAdditionalFee))}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            <div className="flex gap-3">
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {isSubmitting
                  ? "Menyimpan..."
                  : isGrup
                  ? `Simpan & Lanjut (Paket ke-${currentBatchCount + 1})`
                  : packageMode === "grup"
                  ? "Simpan & Lanjut"
                  : "Simpan Paket"}
              </Button>
              {!isGrup && packageMode === "grup" && singleGrupIds.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation(`${base}/barcode${singleGrupIds.length > 0 ? `?ids=${singleGrupIds.join(",")}` : ""}`)}
                >
                  Selesai ({singleGrupCount} paket)
                </Button>
              )}
            </div>
          </form>
        </Form>
      )}
    </div>
  );
}
