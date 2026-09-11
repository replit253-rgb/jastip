import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Pagination } from "@/components/pagination";

function headers() {
  return { Authorization: `Bearer ${localStorage.getItem("jaj_token")}` };
}

export default function OwnerVoids() {
  const { toast } = useToast();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<number | null>(null);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  async function load() {
    const response = await fetch("/api/voids", { headers: headers() });
    if (!response.ok) throw new Error("Gagal memuat laporan VOID");
    setRecords(await response.json());
  }

  useEffect(() => {
    load().catch((error) => toast({ variant: "destructive", title: error.message }))
      .finally(() => setLoading(false));
  }, []);

  const total = records.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pagedRecords = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function approve(id: number) {
    setApproving(id);
    try {
      const response = await fetch(`/api/voids/${id}/approve`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal menyetujui VOID");
      toast({ title: "VOID disetujui", description: "Transaksi ditandai VOID dan reversal dibuat." });
      await load();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Approval gagal", description: error.message });
    } finally {
      setApproving(null);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Laporan VOID</h1>
        <p className="mt-1 text-muted-foreground">
          Tinjau pengajuan pembatalan transaksi, alasan, approval, dan reversal.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4" /> Riwayat VOID
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Memuat...</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pengajuan VOID.</p>
          ) : (
            <>
              <div className="space-y-3">
                {pagedRecords.map(({ void: record, transactionNo, customerName, requesterName }) => (
                  <div key={record.id} className="rounded-lg border p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{transactionNo} · {customerName}</p>
                        <p className="text-xs text-muted-foreground">
                          Diajukan {new Date(record.createdAt).toLocaleString("id-ID")} oleh {requesterName || `User #${record.requestedBy}`}
                        </p>
                      </div>
                      <Badge variant={record.statusAfter === "VOID" ? "default" : "outline"}>
                        {record.statusAfter === "VOID" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock3 className="mr-1 h-3 w-3" />}
                        {record.statusAfter}
                      </Badge>
                    </div>
                    <p className="text-sm"><strong>Alasan:</strong> {record.reasonCode}</p>
                    {record.notes && <p className="text-sm text-muted-foreground">{record.notes}</p>}
                    {record.statusAfter === "VOID" ? (
                      <p className="text-xs text-muted-foreground">
                        Reversal Rp {Number(record.reversalAmount).toLocaleString("id-ID")}
                        {record.isPostClosing ? " · Koreksi pasca-closing" : ""}
                      </p>
                    ) : (
                      <Button size="sm" onClick={() => approve(record.id)} disabled={approving === record.id}>
                        {approving === record.id ? "Memproses..." : "Setujui & buat reversal"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}