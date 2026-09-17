import {
  pgTable,
  serial,
  doublePrecision,
  jsonb,
  timestamp,
  text,
  integer,
} from "drizzle-orm/pg-core";

export const locationsTable = pgTable("locations", {
  id: serial("id").primaryKey(),

  district: text("district").notNull(),

  ward: integer("ward").notNull(),

  lat: doublePrecision("lat"),

  long: doublePrecision("long"),

  geometry: jsonb("geometry"),

  status: text("status").notNull().default("active"),

  lastRefresh: timestamp("last_refresh", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow(),
});
