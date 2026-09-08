import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { transactionsTable } from "./transactions";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNo: text("invoice_no").notNull().unique(),
  transactionId: integer("transaction_id").references(
    () => transactionsTable.id,
  ),
  customerSnapshot: jsonb("customer_snapshot").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  subtotal: numeric("subtotal", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  discount: numeric("discount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  downPayment: numeric("down_payment", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  total: numeric("total", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  balance: numeric("balance", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  status: text("status", {
    enum: [
      "DRAFT",
      "BELUM_LUNAS",
      "DIBAYAR_SEBAGIAN",
      "LUNAS",
      "BATAL",
    ],
  })
    .notNull()
    .default("DRAFT"),
  manualReason: text("manual_reason"),
});

export type Invoice = typeof invoicesTable.$inferSelect;
export type InsertInvoice = typeof invoicesTable.$inferInsert;