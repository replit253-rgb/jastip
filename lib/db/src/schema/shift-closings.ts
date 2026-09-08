import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { shiftSessionsTable } from "./shift-sessions";

export const shiftClosingsTable = pgTable("shift_closings", {
  id: serial("id").primaryKey(),
  shiftSessionId: integer("shift_session_id")
    .notNull()
    .references(() => shiftSessionsTable.id),
  systemCash: integer("system_cash").notNull(),
  actualCash: integer("actual_cash"),
  selisih: integer("selisih"),
  alasanSelisih: text("alasan_selisih"),
  approvedBy: integer("approved_by").references(() => usersTable.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ShiftClosing = typeof shiftClosingsTable.$inferSelect;
export type InsertShiftClosing = typeof shiftClosingsTable.$inferInsert;