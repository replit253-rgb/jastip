import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  jsonb,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { shiftSessionsTable } from "./shift-sessions";

export const transactionsTable = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    transactionNo: text("transaction_no").notNull().unique(),
    idempotencyKey: text("idempotency_key").unique(),
    customerId: integer("customer_id").references(() => usersTable.id),
    customerName: text("customer_name").notNull(),
    packageIds: jsonb("package_ids")
      .notNull()
      .$type<number[]>()
      .default([]),
    subtotal: numeric("subtotal", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    discount: numeric("discount", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    discountReason: text("discount_reason"),
    total: numeric("total", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    paymentStatus: text("payment_status", {
      enum: ["BELUM_BAYAR", "BAYAR_SEBAGIAN", "LUNAS"],
    })
      .notNull()
      .default("BELUM_BAYAR"),
    transactionStatus: text("transaction_status", {
      enum: ["AKTIF", "VOID"],
    })
      .notNull()
      .default("AKTIF"),
    sisaPiutang: numeric("sisa_piutang", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    jenisJastip: text("jenis_jastip"),
    jatuhTempo: date("jatuh_tempo"),
    penanggungJawab: text("penanggung_jawab"),
    shiftSessionId: integer("shift_session_id").references(
      () => shiftSessionsTable.id,
    ),
    cashierId: integer("cashier_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    createdAtIdx: index("transactions_created_at_idx").on(table.createdAt),
    paymentStatusIdx: index("transactions_payment_status_idx").on(
      table.paymentStatus,
    ),
  }),
);

export type Transaction = typeof transactionsTable.$inferSelect;
export type InsertTransaction = typeof transactionsTable.$inferInsert;