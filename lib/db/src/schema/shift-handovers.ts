import {
  pgTable,
  serial,
  integer,
  boolean,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { shiftSessionsTable } from "./shift-sessions";

export const shiftHandoversTable = pgTable("shift_handovers", {
  id: serial("id").primaryKey(),
  fromShiftSessionId: integer("from_shift_session_id")
    .notNull()
    .references(() => shiftSessionsTable.id),
  toShiftSessionId: integer("to_shift_session_id")
    .notNull()
    .references(() => shiftSessionsTable.id),
  handoverAmount: integer("handover_amount").notNull(),
  confirmedByGiver: boolean("confirmed_by_giver").notNull().default(false),
  confirmedByReceiver: boolean("confirmed_by_receiver").notNull().default(false),
  manualOverride: boolean("manual_override").notNull().default(false),
  manualReason: text("manual_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ShiftHandover = typeof shiftHandoversTable.$inferSelect;
export type InsertShiftHandover = typeof shiftHandoversTable.$inferInsert;