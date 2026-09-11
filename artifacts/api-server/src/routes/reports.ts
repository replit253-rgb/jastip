import { Router } from "express";
import { db, packagesTable, paymentsTable, transactionsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { dateStartsWith } from "../lib/dates";

const router = Router();

// GET /api/reports
router.get("/", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const { type, date, month, year } = req.query as any;
    const packages = await db.select().from(packagesTable);
    const now = new Date();

    let entries: { label: string; incoming: number; outgoing: number }[] = [];
    let periodLabel = "";
    let filteredPkgs = packages;
    const transactions = await db.select().from(transactionsTable);
    const payments = await db.select().from(paymentsTable);

    if (type === "daily") {
      const targetDate = date || now.toISOString().split("T")[0];
      periodLabel = targetDate;
      filteredPkgs = packages.filter(p => dateStartsWith(p.createdAt, targetDate));

      // Hourly breakdown 00-23
      for (let h = 0; h < 24; h++) {
        const label = `${String(h).padStart(2, "0")}:00`;
        const incoming = packages.filter(p =>
          dateStartsWith(p.createdAt, targetDate) && new Date(p.createdAt).getHours() === h
        ).length;
        const outgoing = packages.filter(p =>
          p.pickedUpAt && dateStartsWith(p.pickedUpAt, targetDate) && new Date(p.pickedUpAt).getHours() === h
        ).length;
        entries.push({ label, incoming, outgoing });
      }

    } else if (type === "monthly") {
      // month can be "YYYY-MM" or just number; year is optional
      let targetYear: number, targetMonth: number; // 0-indexed month
      if (month && String(month).includes("-")) {
        const parts = String(month).split("-");
        targetYear = Number(parts[0]);
        targetMonth = Number(parts[1]) - 1;
      } else {
        targetYear = year ? Number(year) : now.getFullYear();
        targetMonth = month ? Number(month) - 1 : now.getMonth();
      }
      const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      periodLabel = new Date(targetYear, targetMonth, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

      filteredPkgs = packages.filter(p => {
        const d = new Date(p.createdAt);
        return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
      });

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const incoming = packages.filter(p => dateStartsWith(p.createdAt, dateStr)).length;
        const outgoing = packages.filter(p => dateStartsWith(p.pickedUpAt, dateStr)).length;
        entries.push({ label: `${d}`, incoming, outgoing });
      }

    } else if (type === "yearly") {
      const targetYear = year ? Number(year) : now.getFullYear();
      periodLabel = String(targetYear);

      filteredPkgs = packages.filter(p => new Date(p.createdAt).getFullYear() === targetYear);

      for (let m = 0; m < 12; m++) {
        const label = new Date(targetYear, m, 1).toLocaleDateString("id-ID", { month: "long" });
        const incoming = packages.filter(p => {
          const d = new Date(p.createdAt);
          return d.getFullYear() === targetYear && d.getMonth() === m;
        }).length;
        const outgoing = packages.filter(p => {
          if (!p.pickedUpAt) return false;
          const d = new Date(p.pickedUpAt);
          return d.getFullYear() === targetYear && d.getMonth() === m;
        }).length;
        entries.push({ label, incoming, outgoing });
      }
    }

    let periodStart = new Date("1970-01-01T00:00:00.000Z");
    let periodEnd = new Date("2999-12-31T23:59:59.999Z");
    if (type === "daily") {
      const target = new Date(`${date || now.toISOString().split("T")[0]}T00:00:00`);
      periodStart = target;
      periodEnd = new Date(target.getTime() + 24 * 60 * 60 * 1000);
    } else if (type === "monthly") {
      let targetYear: number;
      let targetMonth: number;
      if (month && String(month).includes("-")) {
        const [yearPart, monthPart] = String(month).split("-");
        targetYear = Number(yearPart);
        targetMonth = Number(monthPart) - 1;
      } else {
        targetYear = year ? Number(year) : now.getFullYear();
        targetMonth = month ? Number(month) - 1 : now.getMonth();
      }
      periodStart = new Date(targetYear, targetMonth, 1);
      periodEnd = new Date(targetYear, targetMonth + 1, 1);
    } else if (type === "yearly") {
      const targetYear = year ? Number(year) : now.getFullYear();
      periodStart = new Date(targetYear, 0, 1);
      periodEnd = new Date(targetYear + 1, 0, 1);
    }
    const inPeriod = (value: Date) => value >= periodStart && value < periodEnd;
    const financialTransactions = transactions.filter(
      (transaction) =>
        inPeriod(transaction.createdAt) && transaction.transactionStatus === "AKTIF",
    );
     const financialPayments = payments.filter(
       (payment) =>
         inPeriod(payment.createdAt) && payment.paymentType !== "piutang",
     );
    const amount = (value: unknown) => Number(value ?? 0);

    res.json({
      period: periodLabel,
      totalPackages: filteredPkgs.length,
      pickedUp: filteredPkgs.filter(p => p.status === "diserahkan").length,
      pending: filteredPkgs.filter(p => p.status === "pending").length,
      entries,
      finance: {
        transactionsValue: financialTransactions.reduce(
          (sum, transaction) => sum + amount(transaction.total),
          0,
        ),
        paymentsReceived: financialPayments.reduce(
          (sum, payment) => sum + amount(payment.totalAmount),
          0,
        ),
        newReceivables: financialTransactions.reduce(
          (sum, transaction) => sum + amount(transaction.sisaPiutang),
          0,
        ),
        oldReceivablesReceived: financialPayments
          .filter((payment) => payment.paymentType === "PELUNASAN_PIUTANG")
          .reduce((sum, payment) => sum + amount(payment.totalAmount), 0),
        activeReceivables: transactions
          .filter(
            (transaction) =>
              transaction.transactionStatus === "AKTIF" &&
              transaction.paymentStatus !== "LUNAS",
          )
          .reduce((sum, transaction) => sum + amount(transaction.sisaPiutang), 0),
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
