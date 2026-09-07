import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Ahvaan — Drizzle schema.
 *
 * Three tables keyed by locationId -> locations.id:
 *  - locations:  one row per modelled cell / point
 *  - weather:    hourly meteorological rows per location
 *  - population: census rows per location (latest `year` wins)
 *
 * Do not rename columns without a migration; the calculation engine
 * and query layer depend on these names.
 */

export const locationsTable = pgTable("locations", {
  id: serial("id").primaryKey(),
  lat: doublePrecision("lat").notNull(),
  long: doublePrecision("long").notNull(),
  geometry: jsonb("geometry"),
  lastRefresh: timestamp("last_refresh", { withTimezone: true }),
});

export const weatherTable = pgTable(
  "weather",
  {
    id: serial("id").primaryKey(),
    locationId: integer("locationId")
      .notNull()
      .references(() => locationsTable.id, { onDelete: "cascade" }),
    temperature2m: doublePrecision("temperature2m"),
    relativeHumidity2m: doublePrecision("relativeHumidity2m"),
    dewPoint2m: doublePrecision("dewPoint2m"),
    apparentTemperature: doublePrecision("apparentTemperature"),
    windSpeed10m: doublePrecision("windSpeed10m"),
    windDirection10m: doublePrecision("windDirection10m"),
    windGusts10m: doublePrecision("windGusts10m"),
    shortwaveRadiation: doublePrecision("shortwaveRadiation"),
    directRadiation: doublePrecision("directRadiation"),
    diffuseRadiation: doublePrecision("diffuseRadiation"),
    precipitation: doublePrecision("precipitation"),
    rain: doublePrecision("rain"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  },
  (t) => [
    // Required for the 72h lookback window to stay within Vercel
    // serverless timeouts: WHERE locationId = ? AND timestamp >= ?
    // ordered by timestamp. Do not drop.
    index("weather_location_timestamp_idx").on(t.locationId, t.timestamp),
  ],
);

export const populationTable = pgTable(
  "population",
  {
    id: serial("id").primaryKey(),
    locationId: integer("locationId")
      .notNull()
      .references(() => locationsTable.id, { onDelete: "cascade" }),
    // Census hierarchy / labels (present in live DB, unused by engine)
    state: integer("state"),
    district: integer("district"),
    ward: integer("ward"),
    enumerationBlock: integer("enumerationBlock"),
    level: varchar("level"),
    wardName: varchar("ward_name"),
    tru: varchar("tru"),
    totalPopulation: integer("totalPopulation"),
    malePopulation: integer("malePopulation"),
    femalePopulation: integer("femalePopulation"),
    children0To6: integer("children0To6"),
    literatePopulation: integer("literatePopulation"),
    illiteratePopulation: integer("illiteratePopulation"),
    totalWorkers: integer("totalWorkers"),
    // Main workers (worked >= 6 months), by occupation
    mainWorkers: integer("mainWorkers"),
    mainCultivators: integer("mainCultivators"),
    mainAgriculturalLabourers: integer("mainAgriculturalLabourers"),
    mainHouseholdIndustryWorkers: integer(
      "mainHouseholdIndustryWorkers",
    ),
    mainOtherWorkers: integer("mainOtherWorkers"),
    // Marginal worker totals (present in live DB)
    marginalWorkers: integer("marginalWorkers"),
    marginalCultivators: integer("marginalCultivators"),
    marginalAgriculturalLabourers: integer(
      "marginalAgriculturalLabourers",
    ),
    marginalHouseholdIndustryWorkers: integer(
      "marginalHouseholdIndustryWorkers",
    ),
    marginalOtherWorkers: integer("marginalOtherWorkers"),
    marginalWorkers3To6: integer("marginalWorkers3To6"),
    marginalWorkers0To3: integer("marginalWorkers0To3"),
    // Marginal workers (worked < 6 months): 3–6 month split
    marginalCultivators3To6: integer("marginalCultivators3To6"),
    marginalAgriculturalLabourers3To6: integer(
      "marginalAgriculturalLabourers3To6",
    ),
    marginalHouseholdIndustryWorkers3To6: integer(
      "marginalHouseholdIndustryWorkers3To6",
    ),
    marginalOtherWorkers3To6: integer("marginalOtherWorkers3To6"),
    // Marginal workers: 0–3 month split
    marginalCultivators0To3: integer("marginalCultivators0To3"),
    marginalAgriculturalLabourers0To3: integer(
      "marginalAgriculturalLabourers0To3",
    ),
    marginalHouseholdIndustryWorkers0To3: integer(
      "marginalHouseholdIndustryWorkers0To3",
    ),
    marginalOtherWorkers0To3: integer("marginalOtherWorkers0To3"),
    nonWorkers: integer("nonWorkers"),
    year: integer("year").notNull(),
  },
  (t) => [index("population_location_year_idx").on(t.locationId, t.year)],
);

export const locationsRelations = relations(locationsTable, ({ many }) => ({
  weather: many(weatherTable),
  population: many(populationTable),
}));

export const weatherRelations = relations(weatherTable, ({ one }) => ({
  location: one(locationsTable, {
    fields: [weatherTable.locationId],
    references: [locationsTable.id],
  }),
}));

export const populationRelations = relations(populationTable, ({ one }) => ({
  location: one(locationsTable, {
    fields: [populationTable.locationId],
    references: [locationsTable.id],
  }),
}));

export type Location = typeof locationsTable.$inferSelect;
export type WeatherRow = typeof weatherTable.$inferSelect;
export type PopulationRow = typeof populationTable.$inferSelect;

// ---------------------------------------------------------------------------
// HeatWatch ops console: alerts, deliveries, snapshots.
// Wards map 1:1 to locations (locationId == ward's location row), so wardId
// below is a locations.id. Snapshots are insert-only history: each refresh
// appends one row per ward; "latest" = max(computedAt) per ward.
// ---------------------------------------------------------------------------

/** Operator-facing heat alerts. One row per ward per active episode. */
export const alertsTable = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    wardId: integer("wardId")
      .notNull()
      .references(() => locationsTable.id, { onDelete: "cascade" }),
    severity: varchar("severity", { length: 20 }).notNull(), // HIGH | EXTREME
    riskScore: doublePrecision("riskScore").notNull(),
    peakWindowStart: timestamp("peakWindowStart", { withTimezone: true }).notNull(),
    peakWindowEnd: timestamp("peakWindowEnd", { withTimezone: true }).notNull(),
    advisoryText: varchar("advisoryText", { length: 500 }),
    triggeredAt: timestamp("triggeredAt", { withTimezone: true }).notNull().defaultNow(),
    status: varchar("status", { length: 20 }).notNull().default("active"), // active | resolved
  },
  (t) => [index("alerts_ward_status_idx").on(t.wardId, t.status)],
);

/**
 * Audit log for the WhatsApp prototype button. Logs INITIATION (operator
 * clicked send and opened wa.me), not delivery confirmation — the Click to
 * Chat deep link gives no callback. `status` is forward-compatible with a
 * future Business Cloud API migration (sent/delivered/read/failed).
 */
export const alertDeliveriesTable = pgTable(
  "alert_deliveries",
  {
    id: serial("id").primaryKey(),
    alertId: integer("alertId").references(() => alertsTable.id, {
      onDelete: "set null",
    }),
    channel: varchar("channel", { length: 20 }).notNull().default("whatsapp"),
    recipientPhone: varchar("recipientPhone", { length: 20 }),
    messageText: varchar("messageText", { length: 1000 }),
    sentAt: timestamp("sentAt", { withTimezone: true }).notNull().defaultNow(),
    sentBy: varchar("sentBy", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("initiated"),
  },
  (t) => [index("deliveries_alert_idx").on(t.alertId)],
);

/** Point-in-time per-ward risk rollup. Powers heatmap/KPI/alerts (fast reads). */
export const wardSnapshotsTable = pgTable(
  "ward_snapshots",
  {
    id: serial("id").primaryKey(),
    locationId: integer("locationId")
      .notNull()
      .references(() => locationsTable.id, { onDelete: "cascade" }),
    risk: doublePrecision("risk").notNull(),
    category: varchar("category", { length: 20 }).notNull(),
    thermal: doublePrecision("thermal").notNull(),
    exposure: doublePrecision("exposure").notNull(),
    vulnerability: doublePrecision("vulnerability").notNull(),
    persistence: doublePrecision("persistence").notNull(),
    recovery: doublePrecision("recovery").notNull(),
    wbgt: doublePrecision("wbgt").notNull(),
    heatIndex: doublePrecision("heatIndex").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    computedAt: timestamp("computedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("snapshots_location_time_idx").on(t.locationId, t.computedAt)],
);

export type Alert = typeof alertsTable.$inferSelect;
export type AlertDelivery = typeof alertDeliveriesTable.$inferSelect;
export type WardSnapshot = typeof wardSnapshotsTable.$inferSelect;
