import {
  pgTable,
  serial,
  integer,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export const dataIngestionErrorsTable = pgTable("data_ingestion_errors", {
  id: serial("id").primaryKey(),

  district: text("district").notNull(),

  ward: integer("ward").notNull(),

  source: text("source").notNull(),

  errorType: text("error_type").notNull(),

  missingFields: jsonb("missing_fields"),

  errorMessage: text("error_message"),

  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow(),
});
