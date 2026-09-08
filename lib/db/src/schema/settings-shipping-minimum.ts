import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { serviceTypesTable } from "./service-types";
import { usersTable } from "./users";

export const settingsShippingMinimumTable = pgTable(
  "settings_shipping_minimum",
  {
    id: serial("id").primaryKey(),
    serviceId: integer("service_id")
      .notNull()
      .references(() => serviceTypesTable.id),
    originCity: text("origin_city").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    minimumAmount: numeric("minimum_amount", {
      precision: 15,
      scale: 2,
    })
      .notNull()
      .default("0"),
    updatedBy: integer("updated_by").references(() => usersTable.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type SettingsShippingMinimum =
  typeof settingsShippingMinimumTable.$inferSelect;
export type InsertSettingsShippingMinimum =
  typeof settingsShippingMinimumTable.$inferInsert;