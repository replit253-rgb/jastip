import type { NextFunction, Request, Response } from "express";
import { getActiveShiftForUser } from "../lib/shift-cash";

export async function requireActiveShift(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const shift = await getActiveShiftForUser(Number(user.id));
    if (!shift) {
      res.status(409).json({
        error: "Buka shift terlebih dahulu",
        code: "ACTIVE_SHIFT_REQUIRED",
      });
      return;
    }

    (req as any).activeShift = shift;
    next();
  } catch (err) {
    (req as any).log?.error?.(err);
    res.status(500).json({ error: "Gagal memeriksa shift aktif" });
  }
}