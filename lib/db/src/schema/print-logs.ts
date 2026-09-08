import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const printLogsTable = pgTable("print_logs", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  printType: text("print_type").notNull(),
  printedBy: integer("printed_by").references(() => usersTable.id),
  printedAt: timestamp("printed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  copyNumber: integer("copy_number").notNull().default(1),
  isReprint: boolean("is_reprint").notNull().default(false),
});

export type PrintLog = typeof printLogsTable.$inferSelect;
export type InsertPrintLog = typeof printLogsTable.$inferInsert;