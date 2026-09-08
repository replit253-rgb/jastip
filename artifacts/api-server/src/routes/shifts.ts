import { Router } from "express";
import {
  db,
  settingsTable,
  shiftClosingsTable,
  shiftHandoversTable,
  shiftSessionsTable,
  usersTable,
} from "@workspace/db";
import {
  and,
  desc,
  eq,
  isNull,
} from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { calculateShiftCash, getActiveShiftForUser, toRupiahInteger } from "../lib/shift-cash";

const router = Router();

function parseOptionalDate(value: unknown, fieldName: string): Date | null {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} tidak valid`);
  }
  return date;
}

function parseNonNegativeInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} harus berupa angka Rupiah bulat >= 0`);
  }
  return parsed;
}

function parsePositiveId(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} tidak valid`);
  }
  return parsed;
}

async function getToleranceAmount() {
  const row = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "cash_variance_tolerance"))
    .limit(1);
  return toRupiahInteger(row[0]?.value ?? 0);
}

async function getShiftForActor(id: number, user: any) {
  const rows = await db
    .select()
    .from(shiftSessionsTable)
    .where(eq(shiftSessionsTable.id, id))
    .limit(1);
  const shift = rows[0];
  if (!shift) return null;
  if (user.role !== "owner" && shift.adminId !== user.id) return null;
  return shift;
}

// GET /api/shifts/current — active shift and non-sensitive dashboard totals.
router.get(
  "/current",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const shift = await getActiveShiftForUser(Number(user.id));
      if (!shift) {
        res.json({ shift: null, summary: null });
        return;
      }

      const cash = await calculateShiftCash(shift);
      const { systemCash: _hiddenSystemCash, ...summary } = cash;
      res.json({ shift, summary });
    } catch (err) {
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal mengambil shift aktif" });
    }
  },
);

// GET /api/shifts/active — active shifts available as handover targets.
router.get(
  "/active",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const rows = await db
        .select({
          id: shiftSessionsTable.id,
          adminId: shiftSessionsTable.adminId,
          adminName: usersTable.name,
          shiftType: shiftSessionsTable.shiftType,
          terminalId: shiftSessionsTable.terminalId,
          actualStart: shiftSessionsTable.actualStart,
          openingBalance: shiftSessionsTable.openingBalance,
          status: shiftSessionsTable.status,
        })
        .from(shiftSessionsTable)
        .leftJoin(usersTable, eq(shiftSessionsTable.adminId, usersTable.id))
        .where(eq(shiftSessionsTable.status, "AKTIF"))
        .orderBy(desc(shiftSessionsTable.actualStart));
      res.json(rows);
    } catch (err) {
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal mengambil daftar shift aktif" });
    }
  },
);

// GET /api/shifts/handovers/pending — pending receiver confirmations.
router.get(
  "/handovers/pending",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const handovers = await db
        .select()
        .from(shiftHandoversTable)
        .where(eq(shiftHandoversTable.confirmedByReceiver, false))
        .orderBy(desc(shiftHandoversTable.createdAt));
      const shifts = await db
        .select({
          id: shiftSessionsTable.id,
          adminId: shiftSessionsTable.adminId,
        })
        .from(shiftSessionsTable);
      const adminByShift = new Map(shifts.map((shift) => [shift.id, shift.adminId]));
      const pending = handovers.filter(
        (handover) =>
          user.role === "owner" ||
          adminByShift.get(handover.toShiftSessionId) === user.id,
      );
      res.json(pending);
    } catch (err) {
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal mengambil serah terima tertunda" });
    }
  },
);

// POST /api/shifts/open
router.post(
  "/open",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const {
        shiftType,
        terminalId,
        scheduledStart,
        scheduledEnd,
        openingBalance = 0,
      } = req.body;

      if (!["PAGI", "MALAM"].includes(shiftType)) {
        res.status(400).json({ error: "shiftType harus PAGI atau MALAM" });
        return;
      }

      const balance = parseNonNegativeInteger(openingBalance, "openingBalance");
      const activeForUser = await getActiveShiftForUser(Number(user.id));
      if (activeForUser) {
        res.status(409).json({
          error: "Anda masih memiliki shift aktif. Tutup shift sebelumnya terlebih dahulu.",
          code: "ACTIVE_SHIFT_EXISTS",
          shiftId: activeForUser.id,
        });
        return;
      }

      if (terminalId) {
        const activeAtTerminal = await db
          .select({ id: shiftSessionsTable.id, shiftType: shiftSessionsTable.shiftType })
          .from(shiftSessionsTable)
          .where(
            and(
              eq(shiftSessionsTable.status, "AKTIF"),
              eq(shiftSessionsTable.terminalId, String(terminalId)),
            ),
          )
          .limit(1);
        if (activeAtTerminal[0]) {
          res.status(409).json({
            error: "Terminal masih memiliki shift aktif yang belum closing.",
            code: "TERMINAL_SHIFT_EXISTS",
          });
          return;
        }
      }

      const [shift] = await db
        .insert(shiftSessionsTable)
        .values({
          adminId: Number(user.id),
          shiftType,
          terminalId: terminalId ? String(terminalId) : null,
          scheduledStart: parseOptionalDate(scheduledStart, "scheduledStart"),
          scheduledEnd: parseOptionalDate(scheduledEnd, "scheduledEnd"),
          actualStart: new Date(),
          openingBalance: String(balance),
          status: "AKTIF",
        })
        .returning();

      res.status(201).json({ shift });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal membuka shift";
      if (message.includes("tidak valid") || message.includes("harus berupa")) {
        res.status(400).json({ error: message });
        return;
      }
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal membuka shift" });
    }
  },
);

// POST /api/shifts/:id/close
// First call creates a pending closing without returning system_cash.
// Second call submits actualCash and returns the comparison result.
router.post(
  "/:id/close",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const id = parsePositiveId(req.params.id, "shift id");
      const shift = await getShiftForActor(id, user);
      if (!shift) {
        res.status(404).json({ error: "Shift tidak ditemukan" });
        return;
      }
      if (shift.status !== "AKTIF") {
        res.status(409).json({ error: "Shift sudah ditutup" });
        return;
      }

      const closingId = req.body?.closingId
        ? parsePositiveId(req.body.closingId, "closingId")
        : null;
      const hasActualCash =
        req.body?.actualCash !== undefined && req.body?.actualCash !== null;

      let closing = closingId
        ? (
            await db
              .select()
              .from(shiftClosingsTable)
              .where(
                and(
                  eq(shiftClosingsTable.id, closingId),
                  eq(shiftClosingsTable.shiftSessionId, shift.id),
                  isNull(shiftClosingsTable.closedAt),
                ),
              )
              .limit(1)
          )[0]
        : undefined;

      if (!hasActualCash) {
        if (!closing) {
          const cash = await calculateShiftCash(shift);
          [closing] = await db
            .insert(shiftClosingsTable)
            .values({
              shiftSessionId: shift.id,
              systemCash: cash.systemCash,
            })
            .returning();
        }
        res.json({
          closingId: closing.id,
          status: "WAITING_ACTUAL_CASH",
          message: "Masukkan kas aktual untuk menyelesaikan closing.",
        });
        return;
      }

      if (!closing) {
        res.status(400).json({
          error: "Mulai proses closing terlebih dahulu untuk mendapatkan closingId.",
          code: "BLIND_CLOSING_REQUIRED",
        });
        return;
      }

      const actualCash = parseNonNegativeInteger(req.body.actualCash, "actualCash");
      const selisih = actualCash - closing.systemCash;
      const tolerance = await getToleranceAmount();
      const alasanSelisih =
        typeof req.body.alasanSelisih === "string"
          ? req.body.alasanSelisih.trim()
          : "";

      if (Math.abs(selisih) > tolerance && !alasanSelisih) {
        res.status(400).json({
          error: "Alasan selisih wajib diisi karena melewati toleransi.",
          code: "CASH_VARIANCE_REASON_REQUIRED",
        });
        return;
      }

      if (Math.abs(selisih) > tolerance && user.role !== "owner") {
        res.status(403).json({
          error: "Selisih di luar toleransi harus disetujui Owner.",
          code: "OWNER_APPROVAL_REQUIRED",
        });
        return;
      }

      const now = new Date();
      const [updatedClosing] = await db
        .update(shiftClosingsTable)
        .set({
          actualCash,
          selisih,
          alasanSelisih: alasanSelisih || null,
          approvedBy: Math.abs(selisih) > tolerance ? Number(user.id) : null,
          closedAt: now,
        })
        .where(eq(shiftClosingsTable.id, closing.id))
        .returning();

      const [closedShift] = await db
        .update(shiftSessionsTable)
        .set({ status: "CLOSED", actualEnd: now })
        .where(eq(shiftSessionsTable.id, shift.id))
        .returning();

      res.json({
        shift: closedShift,
        closing: updatedClosing,
        result: selisih === 0 ? "SESUAI" : selisih > 0 ? "LEBIH" : "KURANG",
        tolerance,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal closing shift";
      if (
        message.includes("tidak valid") ||
        message.includes("harus berupa") ||
        message.includes("harus berupa angka")
      ) {
        res.status(400).json({ error: message });
        return;
      }
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal closing shift" });
    }
  },
);

// POST /api/shifts/:id/handover
// confirmAs=giver creates/confirms the outgoing side; confirmAs=receiver
// confirms the incoming side.
router.post(
  "/:id/handover",
  requireAuth,
  requireRole("admin", "owner"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const fromShiftSessionId = parsePositiveId(req.params.id, "shift id");
      const { toShiftSessionId, handoverId, confirmAs } = req.body;
      if (!["giver", "receiver"].includes(confirmAs)) {
        res.status(400).json({ error: "confirmAs harus giver atau receiver" });
        return;
      }

      let handover;
      if (handoverId) {
        handover = (
          await db
            .select()
            .from(shiftHandoversTable)
            .where(eq(shiftHandoversTable.id, parsePositiveId(handoverId, "handoverId")))
            .limit(1)
        )[0];
        if (!handover) {
          res.status(404).json({ error: "Data serah terima tidak ditemukan" });
          return;
        }
      } else {
        const targetId = parsePositiveId(toShiftSessionId, "toShiftSessionId");
        const amount = parseNonNegativeInteger(req.body.handoverAmount, "handoverAmount");
        if (confirmAs !== "giver") {
          res.status(400).json({ error: "handoverId wajib untuk konfirmasi penerima" });
          return;
        }
        const fromShift = await getShiftForActor(fromShiftSessionId, user);
        if (!fromShift) {
          res.status(404).json({ error: "Shift penyerah tidak ditemukan" });
          return;
        }
        const target = (
          await db
            .select()
            .from(shiftSessionsTable)
            .where(eq(shiftSessionsTable.id, targetId))
            .limit(1)
        )[0];
        if (!target) {
          res.status(404).json({ error: "Shift penerima tidak ditemukan" });
          return;
        }
        [handover] = await db
          .insert(shiftHandoversTable)
          .values({
            fromShiftSessionId,
            toShiftSessionId: targetId,
            handoverAmount: amount,
            confirmedByGiver: true,
            manualOverride: Boolean(req.body.manualOverride),
            manualReason: req.body.manualOverride
              ? String(req.body.manualReason || "").trim() || null
              : null,
          })
          .returning();
      }

      if (confirmAs === "giver" && handover.fromShiftSessionId !== fromShiftSessionId) {
        res.status(403).json({ error: "Anda bukan penyerah shift ini" });
        return;
      }

      const targetShift = (
        await db
          .select()
          .from(shiftSessionsTable)
          .where(eq(shiftSessionsTable.id, handover.toShiftSessionId))
          .limit(1)
      )[0];
      const sourceShift = (
        await db
          .select()
          .from(shiftSessionsTable)
          .where(eq(shiftSessionsTable.id, handover.fromShiftSessionId))
          .limit(1)
      )[0];
      if (!sourceShift || !targetShift) {
        res.status(404).json({ error: "Shift serah terima tidak ditemukan" });
        return;
      }

      if (confirmAs === "giver" && sourceShift.adminId !== user.id && user.role !== "owner") {
        res.status(403).json({ error: "Anda bukan pemilik shift penyerah" });
        return;
      }
      if (confirmAs === "receiver" && targetShift.adminId !== user.id && user.role !== "owner") {
        res.status(403).json({ error: "Anda bukan penerima shift ini" });
        return;
      }

      const [updated] = await db
        .update(shiftHandoversTable)
        .set(
          confirmAs === "giver"
            ? { confirmedByGiver: true }
            : { confirmedByReceiver: true },
        )
        .where(eq(shiftHandoversTable.id, handover.id))
        .returning();

      const confirmed = updated.confirmedByGiver && updated.confirmedByReceiver;
      if (confirmed) {
        await db
          .update(shiftSessionsTable)
          .set({ openingBalance: String(updated.handoverAmount) })
          .where(eq(shiftSessionsTable.id, updated.toShiftSessionId));
      }

      res.json({ handover: updated, confirmed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal memproses serah terima";
      if (message.includes("tidak valid") || message.includes("harus berupa")) {
        res.status(400).json({ error: message });
        return;
      }
      (req as any).log?.error?.(err);
      res.status(500).json({ error: "Gagal memproses serah terima" });
    }
  },
);

export default router;