import { Router } from "express";
import {
  db,
  invoiceItemsTable,
  invoicesTable,
  packagesTable,
  paymentsTable,
  printLogsTable,
  transactionsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, isNotNull, like, ne, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function witDatePrefix() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jayapura",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
}

function invoiceStatus(total: number, downPayment: number) {
  if (downPayment <= 0) return "BELUM_LUNAS" as const;
  if (downPayment >= total) return "LUNAS" as const;
  return "DIBAYAR_SEBAGIAN" as const;
}

function packageIdsFrom(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
}

function optionalDate(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function nextInvoiceNo(tx: any) {
  const prefix = `INV-${witDatePrefix()}-`;
  const rows = await tx
    .select({ invoiceNo: invoicesTable.invoiceNo })
    .from(invoicesTable)
    .where(like(invoicesTable.invoiceNo, `${prefix}%`));
  const largest = rows.reduce((max: number, row: { invoiceNo?: string | null }) => {
    if (!row?.invoiceNo) return max;
    const suffix = Number(row.invoiceNo.slice(prefix.length));
    return Number.isInteger(suffix) ? Math.max(max, suffix) : max;
  }, 0);
  return `${prefix}${String(largest + 1).padStart(4, "0")}`;
}

function formatItem(pkg: any) {
  const shipping = numberValue(pkg.totalShipping);
  const additional = numberValue(pkg.additionalFee);
  const unitPrice = shipping + additional;
  const descParts = [
    pkg.itemName || "Paket Jastip",
    pkg.resiNumber ? `Resi: ${pkg.resiNumber}` : null,
    pkg.serviceType ? `(${pkg.serviceType})` : null,
    additional > 0
      ? `[+Biaya Tambahan Rp${additional.toLocaleString("id-ID")}${pkg.additionalFeeReason ? `: ${pkg.additionalFeeReason}` : ""}]`
      : null,
  ].filter(Boolean);

  return {
    packageId: pkg.id,
    description: descParts.join(" · ") || `Paket #${pkg.id}`,
    qty: 1,
    weight: numberValue(pkg.usedWeight) || numberValue(pkg.realWeight),
    volume: pkg.length && pkg.width && pkg.height
      ? (numberValue(pkg.length) * numberValue(pkg.width) * numberValue(pkg.height)) / 1_000_000
      : null,
    unitPrice,
    lineTotal: unitPrice,
  };
}

async function getInvoiceDetail(id: number) {
  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, id))
    .limit(1);
  if (!invoice) return null;
  const items = await db
    .select()
    .from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoiceId, id))
    .orderBy(invoiceItemsTable.id);
  return { ...invoice, items };
}

router.get(
  "/",
  requireAuth,
  requireRole("admin", "owner"),
  async (_req, res) => {
    const invoices = await db
      .select()
      .from(invoicesTable)
      .orderBy(desc(invoicesTable.issuedAt), desc(invoicesTable.id));
    res.json(invoices);
  },
);

router.get(
  "/package-map",
  requireAuth,
  requireRole("admin", "owner"),
  async (_req, res) => {
    try {
      const items = await db
        .select({
          packageId: invoiceItemsTable.packageId,
          invoiceId: invoicesTable.id,
          invoiceNo: invoicesTable.invoiceNo,
          status: invoicesTable.status,
          issuedAt: invoicesTable.issuedAt,
        })
        .from(invoiceItemsTable)
        .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
        .where(
          and(
            sql`${invoiceItemsTable.packageId} IS NOT NULL`,
            ne(invoicesTable.status, "BATAL")
          )
        );

      const map: Record<
        number,
        Array<{ invoiceId: number; invoiceNo: string; status: string; issuedAt: string }>
      > = {};
      for (const item of items) {
        if (!item.packageId) continue;
        if (!map[item.packageId]) map[item.packageId] = [];
        map[item.packageId].push({
          invoiceId: item.invoiceId,
          invoiceNo: item.invoiceNo,
          status: item.status,
          issuedAt: item.issuedAt ? new Date(item.issuedAt).toISOString() : "",
        });
      }
      res.json(map);
    } catch (err) {
      console.error("GET /invoices/package-map error:", err);
      res.status(500).json({ error: "Gagal mengambil data penanda invoice paket" });
    }
  },
);

router.get(
  "/:id",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "ID invoice tidak valid" });
      return;
    }
    const invoice = await getInvoiceDetail(id);
    if (!invoice) {
      res.status(404).json({ error: "Invoice tidak ditemukan" });
      return;
    }
    res.json(invoice);
  },
);

router.post(
  "/",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const packageIds = packageIdsFrom(req.body?.packageIds);
      const customerName = String(req.body?.customerName ?? "").trim();
      const manualReason = String(req.body?.reason ?? "").trim() || "Penerbitan Invoice A4";
      const discount = numberValue(req.body?.discount);
      const downPayment = numberValue(req.body?.downPayment);
      const customerPhone = String(req.body?.customerPhone ?? "").trim();
      const notes = String(req.body?.notes ?? "").trim();

      if (!packageIds.length) {
        res.status(400).json({ error: "Pilih minimal 1 paket untuk dibuatkan invoice" });
        return;
      }
      if (!customerName) {
        res.status(400).json({ error: "Nama customer penerima invoice wajib diisi" });
        return;
      }
      const packages = await db.select().from(packagesTable).where(inArray(packagesTable.id, packageIds));
      if (packages.length !== packageIds.length) {
        res.status(400).json({ error: "Satu atau lebih paket tidak ditemukan" });
        return;
      }
      const items = packages.map(formatItem);
      const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
      const total = Math.max(0, subtotal - discount);
      if (discount < 0 || discount > subtotal || downPayment < 0 || downPayment > total) {
        res.status(400).json({ error: "Nominal diskon atau DP tidak valid" });
        return;
      }
      const invoice = await db.transaction(async (tx) => {
        const [created] = await tx.insert(invoicesTable).values({
          invoiceNo: await nextInvoiceNo(tx),
          transactionId: null,
          customerSnapshot: {
            customerName,
            customerPhone: customerPhone || undefined,
            notes: notes || undefined,
            source: "manual",
            packageIds,
            reason: manualReason,
          },
          dueAt: optionalDate(req.body?.dueAt),
          subtotal: String(subtotal),
          discount: String(discount),
          downPayment: String(downPayment),
          total: String(total),
          balance: String(Math.max(0, total - downPayment)),
          status: invoiceStatus(total, downPayment),
          manualReason,
        }).returning();
        await tx.insert(invoiceItemsTable).values(items.map((item) => ({
          invoiceId: created.id,
          ...item,
          weight: item.weight == null ? null : String(item.weight),
          volume: item.volume == null ? null : String(item.volume),
          unitPrice: String(item.unitPrice),
          lineTotal: String(item.lineTotal),
        })));
        return created;
      });
      res.status(201).json(await getInvoiceDetail(invoice.id));
    } catch (err) {
      console.error("POST /invoices ERROR:", err);
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal membuat invoice manual" });
    }
  },
);

router.post(
  "/from-transaction/:transactionId",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const transactionId = Number(req.params.transactionId);
      if (!Number.isInteger(transactionId) || transactionId <= 0) {
        res.status(400).json({ error: "ID transaksi tidak valid" });
        return;
      }
      const created = await db.transaction(async (tx) => {
        const [transaction] = await tx
          .select()
          .from(transactionsTable)
          .where(eq(transactionsTable.id, transactionId))
          .limit(1)
          .for("update");
        if (!transaction) throw new Error("Transaksi tidak ditemukan");
        if (transaction.transactionStatus !== "AKTIF") throw new Error("Transaksi VOID tidak dapat dibuatkan invoice");
        const existing = await tx
          .select({ id: invoicesTable.id })
          .from(invoicesTable)
          .where(and(eq(invoicesTable.transactionId, transactionId), eq(invoicesTable.status, "BATAL")))
          .limit(1);
        if (existing.length) {
          // A cancelled invoice is intentionally not reused; the new invoice gets a fresh snapshot.
        }
        const packageIds = packageIdsFrom(transaction.packageIds);
        const packages = packageIds.length
          ? await tx.select().from(packagesTable).where(inArray(packagesTable.id, packageIds))
          : [];
        if (packages.length !== packageIds.length) throw new Error("Paket transaksi tidak ditemukan");
        const items = packages.map(formatItem);
        const total = numberValue(transaction.total);
        const downPayment = Math.max(0, total - numberValue(transaction.sisaPiutang));
        const resolvedCustomerName =
          transaction.customerName && transaction.customerName.trim() && transaction.customerName !== "-"
            ? transaction.customerName.trim()
            : (packages.find((p) => p.customerName && p.customerName.trim() && p.customerName !== "-")?.customerName?.trim() || transaction.customerName || "Customer Jastip");
        const [invoice] = await tx.insert(invoicesTable).values({
          invoiceNo: await nextInvoiceNo(tx),
          transactionId,
          customerSnapshot: {
            customerName: resolvedCustomerName,
            transactionNo: transaction.transactionNo,
            packageIds,
            jenisJastip: transaction.jenisJastip,
            discount: numberValue(transaction.discount),
          },
          dueAt: optionalDate(transaction.jatuhTempo),
          subtotal: String(numberValue(transaction.subtotal)),
          discount: String(numberValue(transaction.discount)),
          downPayment: String(downPayment),
          total: String(total),
          balance: String(Math.max(0, total - downPayment)),
          status: invoiceStatus(total, downPayment),
          manualReason: null,
        }).returning();
        await tx.insert(invoiceItemsTable).values(items.map((item) => ({
          invoiceId: invoice.id,
          ...item,
          weight: item.weight == null ? null : String(item.weight),
          volume: item.volume == null ? null : String(item.volume),
          unitPrice: String(item.unitPrice),
          lineTotal: String(item.lineTotal),
        })));
        return invoice;
      });
      res.status(201).json(await getInvoiceDetail(created.id));
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Gagal membuat invoice";
      const status = message === "Transaksi tidak ditemukan" ? 404 : 400;
      res.status(status).json({ error: message });
    }
  },
);

router.post(
  "/:id/print",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "ID invoice tidak valid" });
      return;
    }
    const invoice = await getInvoiceDetail(id);
    if (!invoice) {
      res.status(404).json({ error: "Invoice tidak ditemukan" });
      return;
    }
    const user = (req as any).user;
    const previous = await db
      .select({ id: printLogsTable.id })
      .from(printLogsTable)
      .where(and(
        eq(printLogsTable.entityType, "invoice"),
        eq(printLogsTable.entityId, id),
        eq(printLogsTable.printType, "INVOICE_A4"),
      ));
    const copyNumber = previous.length + 1;
    await db.insert(printLogsTable).values({
      entityType: "invoice",
      entityId: id,
      printType: "INVOICE_A4",
      printedBy: user.id,
      copyNumber,
      isReprint: copyNumber > 1,
    });
    res.json({
      invoice,
      print: {
        copyNumber,
        isReprint: copyNumber > 1,
        label: copyNumber > 1 ? "SALINAN / REPRINT" : null,
      },
    });
  },
);

export default router;