import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { batchesTable } from "./batches";
import { usersTable } from "./users";

export const packageImportsTable = pgTable("package_imports", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => batchesTable.id),
  fileName: text("file_name"),
  packageCount: integer("package_count").notNull().default(0),
  importedBy: integer("imported_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("idx_package_imports_batch_id").on(t.batchId),
]);

export type PackageImport = typeof packageImportsTable.$inferSelect;
export type InsertPackageImport = typeof packageImportsTable.$inferInsert;
