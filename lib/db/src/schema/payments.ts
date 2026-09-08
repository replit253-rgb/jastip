import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { shiftSessionsTable } from "./shift-sessions";
import { transactionsTable } from "./transactions";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  paymentType: text("payment_type", {
    enum: ["tunai", "transfer", "piutang"],
  }).notNull(),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 15, scale: 2 }),
  changeAmount: numeric("change_amount", { precision: 15, scale: 2 }),
  packageIds: jsonb("package_ids").notNull().$type<number[]>(),
  packageSummary: jsonb("package_summary").$type<
    { id: number; resiNumber: string; customerName: string; totalShipping: number }[]
  >(),
  adminId: integer("admin_id").references(() => usersTable.id),
  adminName: text("admin_name"),
  shiftSessionId: integer("shift_session_id").references(
    () => shiftSessionsTable.id,
  ),
  transactionId: integer("transaction_id").references(
    () => transactionsTable.id,
  ),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Payment = typeof paymentsTable.$inferSelect;
