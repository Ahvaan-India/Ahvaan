import {
  pgTable,
  serial,
  doublePrecision,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export const locationsTable = pgTable("locations", {
  id: serial("id").primaryKey(),

  lat: doublePrecision("lat").notNull(),

  long: doublePrecision("long").notNull(),

  geometry: jsonb("geometry"),

  lastRefresh: timestamp("last_refresh").notNull(),
});
