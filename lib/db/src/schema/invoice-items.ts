import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
} from "drizzle-orm/pg-core";
import { invoicesTable } from "./invoices";
import { packagesTable } from "./packages";

export const invoiceItemsTable = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoicesTable.id),
  packageId: integer("package_id").references(() => packagesTable.id),
  description: text("description").notNull(),
  qty: integer("qty").notNull().default(1),
  weight: numeric("weight", { precision: 10, scale: 2 }),
  volume: numeric("volume", { precision: 10, scale: 2 }),
  unitPrice: numeric("unit_price", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  lineTotal: numeric("line_total", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
});

export type InvoiceItem = typeof invoiceItemsTable.$inferSelect;
export type InsertInvoiceItem = typeof invoiceItemsTable.$inferInsert;