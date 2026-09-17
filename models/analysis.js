import {
  pgTable,
  integer,
  timestamp,
  date,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

import { locationsTable } from "./locations.js";

export const analysisTable = pgTable(
  "analysis",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),

    locationId: integer()
      .notNull()
      .references(() => locationsTable.id),

    forecastDate: date().notNull(),

    analysis: jsonb().notNull(),

    createdAt: timestamp({
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
  },

  (table) => [
    unique().on(table.locationId, table.forecastDate),
  ]
);