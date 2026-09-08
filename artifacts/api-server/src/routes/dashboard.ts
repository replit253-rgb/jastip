import { Router } from "express";
import {
  db,
  paymentsTable,
  transactionsTable,
  usersTable,
  packagesTable,
} from "@workspace/db";
import { eq, gte, lt } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

// GET /api/dashboard/summary
router.get("/summary", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    let packages = await db.select().from(packagesTable);

    if (user.role === "customer") {
      packages = packages.filter(p => p.customerId === user.id);
    }

    const customers = await db.select().from(usersTable).where(eq(usersTable.role, "customer"));
    const admins = await db.select().from(usersTable).where(eq(usersTable.role, "admin"));
    const { start, end } = todayBounds();
    const [transactionsToday, paymentsToday, activeReceivables] = await Promise.all([
      db.select().from(transactionsTable).where(
        gte(transactionsTable.createdAt, start),
      ),
      db.select().from(paymentsTable).where(
        gte(paymentsTable.createdAt, start),
      ),
      db.select().from(transactionsTable).where(
        eq(transactionsTable.paymentStatus, "BELUM_BAYAR"),
      ),
    ]);
    const transactionsCreatedToday = transactionsToday.filter(
      (transaction) => transaction.createdAt < end && transaction.transactionStatus === "AKTIF",
    );
    const paymentsReceivedToday = paymentsToday.filter(
      (payment) => payment.createdAt < end,
    );
    const rupiah = (value: unknown) => Number(value ?? 0);

    res.json({
      totalPackages: packages.length,
      pendingPackages: packages.filter(p => p.status === "pending").length,
      readyPackages: 0,
      pickedUpPackages: packages.filter(p => p.status === "diserahkan").length,
      totalCustomers: customers.length,
      totalAdmins: admins.filter(a => a.isActive).length,
      finance: {
        transactionsToday: transactionsCreatedToday.reduce(
          (sum, transaction) => sum + rupiah(transaction.total),
          0,
        ),
        paymentsReceivedToday: paymentsReceivedToday.reduce(
          (sum, payment) => sum + rupiah(payment.totalAmount),
          0,
        ),
        newReceivablesToday: transactionsCreatedToday
          .filter((transaction) => transaction.sisaPiutang !== "0")
          .reduce((sum, transaction) => sum + rupiah(transaction.sisaPiutang), 0),
        oldReceivablesReceivedToday: paymentsReceivedToday
          .filter((payment) => payment.paymentType === "PELUNASAN_PIUTANG")
          .reduce((sum, payment) => sum + rupiah(payment.totalAmount), 0),
        activeReceivables: activeReceivables.reduce(
          (sum, transaction) => sum + rupiah(transaction.sisaPiutang),
          0,
        ),
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/dashboard/chart
router.get("/chart", requireAuth, async (req, res) => {
  try {
    const { period = "week" } = req.query as any;
    const now = new Date();
    let days = 7;
    if (period === "month") days = 30;
    if (period === "year") days = 365;

    const packages = await db.select().from(packagesTable);

    const result: { date: string; incoming: number; outgoing: number }[] = [];

    if (period === "year") {
      // Group by month
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleDateString("id-ID", { month: "short", year: "numeric" });
        const year = d.getFullYear();
        const month = d.getMonth();
        const incoming = packages.filter(p => {
          const d2 = new Date(p.createdAt);
          return d2.getFullYear() === year && d2.getMonth() === month;
        }).length;
        const outgoing = packages.filter(p => {
          if (!p.pickedUpAt) return false;
          const d2 = new Date(p.pickedUpAt);
          return d2.getFullYear() === year && d2.getMonth() === month;
        }).length;
        result.push({ date: label, incoming, outgoing });
      }
    } else {
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const label = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
        const incoming = packages.filter(p => p.createdAt.toISOString().startsWith(dateStr)).length;
        const outgoing = packages.filter(p => p.pickedUpAt?.toISOString().startsWith(dateStr)).length;
        result.push({ date: label, incoming, outgoing });
      }
    }

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
