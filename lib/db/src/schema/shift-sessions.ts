import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const shiftSessionsTable = pgTable("shift_sessions", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id")
    .notNull()
    .references(() => usersTable.id),
  shiftType: text("shift_type", {
    enum: ["PAGI", "MALAM"],
  }).notNull(),
  terminalId: text("terminal_id"),
  scheduledStart: timestamp("scheduled_start", { withTimezone: true }),
  scheduledEnd: timestamp("scheduled_end", { withTimezone: true }),
  actualStart: timestamp("actual_start", { withTimezone: true }),
  actualEnd: timestamp("actual_end", { withTimezone: true }),
  openingBalance: numeric("opening_balance", {
    precision: 15,
    scale: 2,
  })
    .notNull()
    .default("0"),
  status: text("status", {
    enum: ["AKTIF", "CLOSED"],
  })
    .notNull()
    .default("AKTIF"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ShiftSession = typeof shiftSessionsTable.$inferSelect;
export type InsertShiftSession = typeof shiftSessionsTable.$inferInsert;