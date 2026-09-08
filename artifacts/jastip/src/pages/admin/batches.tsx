import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Ship, Package, FileInput, FileSpreadsheet, ChevronDown, ChevronUp,
  Lock, Archive, CheckCircle2, Clock, Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Pagination } from "@/components/pagination";

const BATCH_PAGE_SIZE = 5;

// ── API helpers ───────────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem("jaj_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function fetchBatches(): Promise<any[]> {
  const res = await fetch("/api/batches", { headers: authHeaders() });
  if (!res.ok) throw new Error("Gagal mengambil data batch");
  return res.json();
}

async function createBatch(data: any): Promise<any> {
  const res = await fetch("/api/batches", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Gagal membuat batch");
  }
  return res.json();
}

async function updateBatchStatus(id: number, statusBatch: string): Promise<any> {
  const res = await fetch(`/api/batches/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ statusBatch }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Gagal memperbarui batch");
  }
  return res.json();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function statusColor(status: string) {
  if (status === "OPEN") return "bg-green-100 text-green-800 border-green-200";
  if (status === "CLOSED") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function statusLabel(status: string) {
  if (status === "OPEN") return "Aktif";
  if (status === "CLOSED") return "Ditutup";
  return "Arsip";
}

function statusIcon(status: string) {
  if (status === "OPEN") return <CheckCircle2 className="w-3 h-3" />;
  if (status === "CLOSED") return <Lock className="w-3 h-3" />;
  return <Archive className="w-3 h-3" />;
}

// ── Create Batch Form ─────────────────────────────────────────────────────────

interface CreateBatchFormProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateBatchDialog({ open, onClose, onCreated }: CreateBatchFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    namaKapal: "",
    etd: "",
    periodeClosingMulai: "",
    periodeClosingSelesai: "",
    kotaAsal: "",
    tujuan: "Manokwari",
  });

  const mutation = useMutation({
    mutationFn: createBatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast({ title: "Batch berhasil dibuat" });
      setForm({ namaKapal: "", etd: "", periodeClosingMulai: "", periodeClosingSelesai: "", kotaAsal: "", tujuan: "Manokwari" });
      onCreated();
      onClose();
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Gagal", description: err.message });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.namaKapal || !form.etd || !form.periodeClosingMulai || !form.periodeClosingSelesai || !form.kotaAsal) {
      toast({ variant: "destructive", title: "Lengkapi semua field wajib" });
      return;
    }
    mutation.mutate(form);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ship className="w-5 h-5 text-primary" />
            Buat Batch Pengiriman Baru
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nama Kapal *</label>
            <Input
              placeholder="Contoh: Dobonsolo"
              value={form.namaKapal}
              onChange={(e) => setForm((f) => ({ ...f, namaKapal: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">ETD (Tanggal Berangkat) *</label>
            <Input
              type="date"
              value={form.etd}
              onChange={(e) => setForm((f) => ({ ...f, etd: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Closing Mulai *</label>
              <Input
                type="date"
                value={form.periodeClosingMulai}
                onChange={(e) => setForm((f) => ({ ...f, periodeClosingMulai: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Closing Selesai *</label>
              <Input
                type="date"
                value={form.periodeClosingSelesai}
                onChange={(e) => setForm((f) => ({ ...f, periodeClosingSelesai: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Kota Asal *</label>
            <Select value={form.kotaAsal} onValueChange={(v) => setForm((f) => ({ ...f, kotaAsal: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih kota asal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Jakarta">Jakarta</SelectItem>
                <SelectItem value="Surabaya">Surabaya</SelectItem>
                <SelectItem value="Makassar">Makassar</SelectItem>
                <SelectItem value="Jakarta/Surabaya">Jakarta/Surabaya</SelectItem>
                <SelectItem value="Jakarta/Surabaya/Makassar">Jakarta/Surabaya/Makassar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tujuan</label>
            <Input
              value={form.tujuan}
              onChange={(e) => setForm((f) => ({ ...f, tujuan: e.target.value }))}
            />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Menyimpan..." : "Buat Batch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Batch Card ────────────────────────────────────────────────────────────────

interface BatchCardProps {
  batch: any;
  base: string;
  isOwner: boolean;
  onStatusChange: (id: number, newStatus: string) => void;
  onDelete: (id: number, namaKapal: string) => void;
}

function BatchCard({ batch, base, isOwner, onStatusChange, onDelete }: BatchCardProps) {
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base leading-snug">{batch.namaKapal}</CardTitle>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor(batch.statusBatch)}`}>
                {statusIcon(batch.statusBatch)}
                {statusLabel(batch.statusBatch)}
              </span>
            </div>
            <CardDescription className="mt-1 text-xs leading-relaxed">
              ETD: {formatDate(batch.etd)} &nbsp;·&nbsp;
              Closing: {formatDate(batch.periodeClosingMulai)} s/d {formatDate(batch.periodeClosingSelesai)}
            </CardDescription>
            <p className="text-xs text-muted-foreground mt-0.5">
              {batch.kotaAsal} → {batch.tujuan} &nbsp;·&nbsp;
              <span className="font-medium text-foreground">{batch.packageCount} paket</span>
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-8 w-8 p-0"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {batch.statusBatch === "OPEN" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => setLocation(`${base}/packages/type?batchId=${batch.id}`)}
                >
                  <FileInput className="w-3.5 h-3.5" />
                  Input Manual
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => setLocation(`${base}/packages/import?batchId=${batch.id}`)}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Import Excel
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => setLocation(`${base}/packages?batchId=${batch.id}`)}
            >
              <Package className="w-3.5 h-3.5" />
              Lihat Paket
            </Button>
          </div>

          {/* Status transitions */}
          <div className="flex flex-wrap gap-2 pt-1 border-t">
            {batch.statusBatch === "OPEN" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs text-yellow-700 border-yellow-200 hover:bg-yellow-50"
                onClick={() => onStatusChange(batch.id, "CLOSED")}
              >
                <Lock className="w-3 h-3" />
                Tutup Batch
              </Button>
            )}
            {batch.statusBatch === "CLOSED" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs text-green-700 border-green-200 hover:bg-green-50"
                  onClick={() => onStatusChange(batch.id, "OPEN")}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Buka Kembali
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs text-gray-600 border-gray-200 hover:bg-gray-50"
                  onClick={() => onStatusChange(batch.id, "ARSIP")}
                >
                  <Archive className="w-3 h-3" />
                  Arsipkan
                </Button>
              </>
            )}
            {/* Hapus Batch: soft delete, tersedia untuk OPEN dan CLOSED */}
            {isOwner && (batch.statusBatch === "OPEN" || batch.statusBatch === "CLOSED") && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => onDelete(batch.id, batch.namaKapal)}
              >
                <Trash2 className="w-3 h-3" />
                Hapus Batch
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminBatches() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = `/${user?.role}`;

  const [showCreate, setShowCreate] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<{ id: number; newStatus: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ id: number; namaKapal: string } | null>(null);
  const [showArchivedBatches, setShowArchivedBatches] = useState(false);
  const [openPage, setOpenPage] = useState(1);
  const [closedPage, setClosedPage] = useState(1);
  const [archivedPage, setArchivedPage] = useState(1);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["batches"],
    queryFn: fetchBatches,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      updateBatchStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast({ title: "Status batch diperbarui" });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Gagal", description: err.message });
    },
  });

  function handleStatusChange(id: number, newStatus: string) {
    if (newStatus === "ARSIP") {
      setShowArchiveConfirm({ id, newStatus });
      return;
    }
    statusMutation.mutate({ id, status: newStatus });
  }

  function handleDeleteRequest(id: number, namaKapal: string) {
    setShowDeleteConfirm({ id, namaKapal });
  }

  const openBatches = batches.filter((b: any) => b.statusBatch === "OPEN");
  const closedBatches = batches.filter((b: any) => b.statusBatch === "CLOSED");
  const archivedBatches = batches.filter((b: any) => b.statusBatch === "ARSIP");

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Ship className="w-6 h-6 text-primary" />
            Batch Pengiriman
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Kelola periode pengiriman dan paket yang terikat ke setiap batch
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Buat Batch Baru
        </Button>
      </div>

      {/* OPEN Batches */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <h2 className="font-semibold text-sm">Batch Aktif</h2>
          <span className="text-xs text-muted-foreground">({openBatches.length})</span>
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground p-4">Memuat...</div>
        ) : openBatches.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Ship className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">Belum ada batch aktif.</p>
              <p className="text-xs text-muted-foreground mt-1">Buat batch baru untuk mulai input paket.</p>
              <Button onClick={() => setShowCreate(true)} className="mt-4 gap-2" variant="outline">
                <Plus className="w-4 h-4" />
                Buat Batch Pertama
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {openBatches.slice((openPage - 1) * BATCH_PAGE_SIZE, openPage * BATCH_PAGE_SIZE).map((batch: any) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                base={base}
                isOwner={user?.role === "owner"}
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteRequest}
              />
            ))}
            <Pagination
              page={Math.min(openPage, Math.max(1, Math.ceil(openBatches.length / BATCH_PAGE_SIZE)))}
              totalPages={Math.max(1, Math.ceil(openBatches.length / BATCH_PAGE_SIZE))}
              total={openBatches.length}
              pageSize={BATCH_PAGE_SIZE}
              onPageChange={setOpenPage}
            />
          </>
        )}
      </div>

      {/* CLOSED Batches */}
      {closedBatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-yellow-600" />
            <h2 className="font-semibold text-sm">Batch Ditutup</h2>
            <span className="text-xs text-muted-foreground">({closedBatches.length})</span>
          </div>
          {closedBatches.slice((closedPage - 1) * BATCH_PAGE_SIZE, closedPage * BATCH_PAGE_SIZE).map((batch: any) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              base={base}
              isOwner={user?.role === "owner"}
              onStatusChange={handleStatusChange}
              onDelete={handleDeleteRequest}
            />
          ))}
          <Pagination
            page={Math.min(closedPage, Math.max(1, Math.ceil(closedBatches.length / BATCH_PAGE_SIZE)))}
            totalPages={Math.max(1, Math.ceil(closedBatches.length / BATCH_PAGE_SIZE))}
            total={closedBatches.length}
            pageSize={BATCH_PAGE_SIZE}
            onPageChange={setClosedPage}
          />
        </div>
      )}

      {/* ARSIP Batches (collapsible) */}
      {archivedBatches.length > 0 && (
        <div className="space-y-3">
          <button
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowArchivedBatches((v) => !v)}
          >
            <Archive className="w-4 h-4" />
            <span className="font-medium">Arsip ({archivedBatches.length})</span>
            {showArchivedBatches ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showArchivedBatches && (
            <>
              {archivedBatches.slice((archivedPage - 1) * BATCH_PAGE_SIZE, archivedPage * BATCH_PAGE_SIZE).map((batch: any) => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  base={base}
                  isOwner={user?.role === "owner"}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDeleteRequest}
                />
              ))}
              <Pagination
                page={Math.min(archivedPage, Math.max(1, Math.ceil(archivedBatches.length / BATCH_PAGE_SIZE)))}
                totalPages={Math.max(1, Math.ceil(archivedBatches.length / BATCH_PAGE_SIZE))}
                total={archivedBatches.length}
                pageSize={BATCH_PAGE_SIZE}
                onPageChange={setArchivedPage}
              />
            </>
          )}
        </div>
      )}

      {/* Create dialog */}
      <CreateBatchDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {}}
      />

      {/* Archive confirmation */}
      <AlertDialog open={!!showArchiveConfirm} onOpenChange={() => setShowArchiveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arsipkan batch ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Batch yang sudah diarsip tidak dapat menerima paket baru dan tidak bisa dikembalikan ke status aktif.
              Semua paket tetap tersimpan di database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (showArchiveConfirm) {
                  statusMutation.mutate({ id: showArchiveConfirm.id, status: showArchiveConfirm.newStatus });
                  setShowArchiveConfirm(null);
                }
              }}
            >
              Ya, Arsipkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hapus Batch confirmation (hard delete) */}
      <AlertDialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Hapus Permanen Batch "{showDeleteConfirm?.namaKapal}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>Tindakan ini tidak bisa dibatalkan.</strong> Batch beserta seluruh paket di dalamnya akan
              dihapus permanen dari database.
              <br /><br />
              Gunakan fitur ini jika data batch salah dan perlu diupload ulang dari awal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (showDeleteConfirm) {
                  statusMutation.mutate({ id: showDeleteConfirm.id, status: "HAPUS" });
                  setShowDeleteConfirm(null);
                }
              }}
            >
              Ya, Hapus Permanen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
