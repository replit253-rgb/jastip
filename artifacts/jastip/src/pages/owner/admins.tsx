import { useState } from "react";
import {
  useListAdmins,
  getListAdminsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Edit2, Trash2 } from "lucide-react";

const PAGE_SIZE = 10;

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("jaj_token")}`,
    "Content-Type": "application/json",
  };
}

export default function OwnerAdmins() {
  const [page, setPage] = useState(1);
  const { data: admins, isLoading } = useListAdmins();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  // Edit Admin state
  const [editAdmin, setEditAdmin] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editNewPassword, setEditNewPassword] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Delete Admin state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const total = admins?.length || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const paginated = admins?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openEditModal(admin: any) {
    setEditAdmin(admin);
    setEditName(admin.name || "");
    setEditPhone(admin.phone || "");
    setEditIsActive(Boolean(admin.isActive));
    setEditNewPassword("");
  }

  async function handleSaveEdit() {
    if (!editAdmin) return;
    if (!editName.trim() || !editPhone.trim()) {
      toast({
        variant: "destructive",
        title: "Validasi Gagal",
        description: "Nama dan Nomor HP tidak boleh kosong.",
      });
      return;
    }

    setIsEditing(true);
    try {
      // 1. Update basic data
      const res = await fetch(`/api/admins/${editAdmin.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          name: editName.trim(),
          phone: editPhone.trim(),
          isActive: editIsActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memperbarui admin.");

      // 2. Reset password if provided
      if (editNewPassword.trim()) {
        const passRes = await fetch(`/api/admins/${editAdmin.id}/reset-password`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ newPassword: editNewPassword.trim() }),
        });
        const passData = await passRes.json();
        if (!passRes.ok) throw new Error(passData.error || "Gagal mereset password.");
      }

      await queryClient.invalidateQueries({ queryKey: getListAdminsQueryKey() });
      toast({
        title: "Berhasil",
        description: `Data admin ${editName} berhasil diperbarui.`,
      });
      setEditAdmin(null);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: err.message,
      });
    } finally {
      setIsEditing(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admins/${deleteTarget.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus admin.");

      await queryClient.invalidateQueries({ queryKey: getListAdminsQueryKey() });
      toast({
        title: data.mode === "soft_deleted" ? "Admin Dinonaktifkan & Disembunyikan" : "Admin Dihapus Permanen",
        description: data.message,
      });
      setDeleteTarget(null);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menghapus",
        description: err.message,
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data Admin</h1>
        <p className="text-muted-foreground mt-1">Performa dan kelola staf admin.</p>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Admin</TableHead>
                <TableHead>Nomor HP</TableHead>
                <TableHead className="text-center">Paket Diinput</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bergabung</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Memuat data...
                  </TableCell>
                </TableRow>
              ) : paginated && paginated.length > 0 ? (
                paginated.map((admin: any) => {
                  const isSelf = currentUser?.id === admin.id;
                  return (
                    <TableRow key={admin.id}>
                      <TableCell className="font-medium">{admin.name}</TableCell>
                      <TableCell>{admin.phone}</TableCell>
                      <TableCell className="text-center font-semibold text-primary">
                        {admin.packagesInputted}
                      </TableCell>
                      <TableCell>
                        {admin.isActive ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            Aktif
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            Nonaktif
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {admin.createdAt ? format(new Date(admin.createdAt), "dd MMM yyyy", { locale: localeId }) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs"
                            onClick={() => openEditModal(admin)}
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 px-2.5 text-xs"
                            disabled={isSelf}
                            title={isSelf ? "Owner tidak boleh menghapus atau menonaktifkan akun sendiri" : undefined}
                            onClick={() => setDeleteTarget(admin)}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Hapus
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    Data admin tidak ditemukan.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </Card>

      {/* Edit Admin Dialog */}
      <Dialog open={Boolean(editAdmin)} onOpenChange={(open) => !open && setEditAdmin(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Data Admin</DialogTitle>
            <DialogDescription>
              Perbarui identitas, status aktif, atau reset password staf admin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nama Lengkap</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nama staf admin"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Nomor HP</Label>
              <Input
                id="edit-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="0812..."
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label htmlFor="edit-active" className="text-sm font-medium">Status Akun</Label>
                <p className="text-xs text-muted-foreground">
                  {editIsActive ? "Admin dapat login dan input transaksi" : "Admin tidak dapat login"}
                </p>
              </div>
              <Switch
                id="edit-active"
                checked={editIsActive}
                onCheckedChange={setEditIsActive}
                disabled={currentUser?.id === editAdmin?.id}
              />
            </div>
            <div className="space-y-2 pt-1 border-t">
              <Label htmlFor="edit-password" className="text-xs text-muted-foreground">
                Reset Password (Kosongkan jika tidak ingin mengubah)
              </Label>
              <Input
                id="edit-password"
                type="password"
                value={editNewPassword}
                onChange={(e) => setEditNewPassword(e.target.value)}
                placeholder="Password baru..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAdmin(null)} disabled={isEditing}>
              Batal
            </Button>
            <Button onClick={handleSaveEdit} disabled={isEditing || !editName.trim() || !editPhone.trim()}>
              {isEditing ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete / Deactivate Admin AlertDialog */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.hasActivity
                ? "Nonaktifkan & Sembunyikan Admin?"
                : "Hapus Admin Secara Permanen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.hasActivity ? (
                <>
                  Admin <strong>{deleteTarget?.name}</strong> memiliki riwayat aktivitas di sistem
                  {deleteTarget?.packagesInputted > 0 ? ` (${deleteTarget.packagesInputted} paket)` : ""}
                  {deleteTarget?.transactionsCount > 0 ? ` (${deleteTarget.transactionsCount} transaksi)` : ""}
                  . Akun akan <strong>dinonaktifkan dan disembunyikan</strong> dari daftar agar data audit dan transaksi historis tetap utuh dan aman.
                </>
              ) : (
                <>
                  Admin <strong>{deleteTarget?.name}</strong> belum memiliki riwayat aktivitas apapun (paket, transaksi, atau shift). Akun akan <strong>dihapus secara permanen</strong> dari sistem.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting
                ? "Memproses..."
                : deleteTarget?.hasActivity
                ? "Nonaktifkan & Sembunyikan"
                : "Hapus Permanen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
