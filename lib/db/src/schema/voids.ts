import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  numeric,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { transactionsTable } from "./transactions";

export const voidsTable = pgTable("voids", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactionsTable.id),
  reasonCode: text("reason_code").notNull(),
  notes: text("notes"),
  requestedBy: integer("requested_by")
    .notNull()
    .references(() => usersTable.id),
  approvedBy: integer("approved_by").references(() => usersTable.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  reversalAmount: numeric("reversal_amount", {
    precision: 15,
    scale: 2,
  })
    .notNull()
    .default("0"),
  packageIdsReturned: jsonb("package_ids_returned")
    .notNull()
    .$type<number[]>()
    .default([]),
  statusBefore: text("status_before").notNull(),
  statusAfter: text("status_after").notNull(),
  isPostClosing: boolean("is_post_closing").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type VoidRecord = typeof voidsTable.$inferSelect;
export type InsertVoid = typeof voidsTable.$inferInsert;