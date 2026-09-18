import {
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Ahvaan  Drizzle schema.
 *
 * Mirrors the LIVE Postgres database exactly (introspected 2026-09-18):
 *  - locations:  141 KMC wards. district/ward mirror the census codes
 *    (`district` is TEXT, e.g. "342"), lat/long are NULLABLE, `status` is
 *    active|inactive, last_refresh is NOT NULL default now().
 *  - weather:    240 hourly rows/location (10-day Open-Meteo window).
 *    `timestamp` is WITHOUT time zone and stores ASIA/KOLKATA WALL CLOCK
 *    (e.g. "2026-09-18 00:00:00") — see lib/db/index.ts timestamp parser.
 *  - population: 141 census rows, metric ints NOT NULL, year default 2011.
 *  - analysis:   precomputed engine days (locationId, forecastDate) unique.
 *  - alerts / alert_deliveries / ward_snapshots: website ops tables
 *    (created by scripts/create-ops-tables.sql; absent from the original
 *    ingestion DB).
 *
 * Do not rename columns without a migration; the calculation engine,
 * query layer, and cron scripts depend on these names.
 */

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

export const weatherTable = pgTable(
  "weather",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
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
    // Naive timestamp holding IST wall clock, exactly as the upstream
    // ingestion writes it (Open-Meteo `timezone=Asia/Kolkata` hourly.time +
    // ":00", e.g. "2026-09-18 00:00:00"). Drizzle `mode: "string"` returns
    // the raw wall string on every host (the driver's Date parsing is
    // host-TZ-dependent for naive timestamps) — interpret values ONLY via
    // parseISTWall() and build comparisons with toISTWall() (lib/analysis).
    // Range comparisons are then wall-to-wall, independent of the DB
    // session time zone.
    timestamp: timestamp("timestamp", { mode: "string" }).notNull(),
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
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    locationId: integer("locationId")
      .notNull()
      .references(() => locationsTable.id, { onDelete: "cascade" }),
    // Census hierarchy / labels (`ward_name` e.g. "Kolkata (M Corp.) WARD NO.-0001")
    state: integer("state").notNull(),
    district: integer("district").notNull(),
    ward: integer("ward").notNull(),
    enumerationBlock: integer("enumerationBlock"),
    level: varchar("level"),
    wardName: varchar("ward_name").notNull(),
    tru: varchar("tru"),
    totalPopulation: integer("totalPopulation").notNull(),
    malePopulation: integer("malePopulation").notNull(),
    femalePopulation: integer("femalePopulation").notNull(),
    children0To6: integer("children0To6").notNull(),
    literatePopulation: integer("literatePopulation").notNull(),
    illiteratePopulation: integer("illiteratePopulation").notNull(),
    totalWorkers: integer("totalWorkers").notNull(),
    // Main workers (worked >= 6 months), by occupation
    mainWorkers: integer("mainWorkers").notNull(),
    mainCultivators: integer("mainCultivators").notNull(),
    mainAgriculturalLabourers: integer("mainAgriculturalLabourers").notNull(),
    mainHouseholdIndustryWorkers: integer(
      "mainHouseholdIndustryWorkers",
    ).notNull(),
    mainOtherWorkers: integer("mainOtherWorkers").notNull(),
    // Marginal worker totals
    marginalWorkers: integer("marginalWorkers").notNull(),
    marginalCultivators: integer("marginalCultivators").notNull(),
    marginalAgriculturalLabourers: integer(
      "marginalAgriculturalLabourers",
    ).notNull(),
    marginalHouseholdIndustryWorkers: integer(
      "marginalHouseholdIndustryWorkers",
    ).notNull(),
    marginalOtherWorkers: integer("marginalOtherWorkers").notNull(),
    marginalWorkers3To6: integer("marginalWorkers3To6").notNull(),
    marginalWorkers0To3: integer("marginalWorkers0To3").notNull(),
    // Marginal workers (worked < 6 months): 3–6 month split
    marginalCultivators3To6: integer("marginalCultivators3To6").notNull(),
    marginalAgriculturalLabourers3To6: integer(
      "marginalAgriculturalLabourers3To6",
    ).notNull(),
    marginalHouseholdIndustryWorkers3To6: integer(
      "marginalHouseholdIndustryWorkers3To6",
    ).notNull(),
    marginalOtherWorkers3To6: integer("marginalOtherWorkers3To6").notNull(),
    // Marginal workers: 0–3 month split
    marginalCultivators0To3: integer("marginalCultivators0To3").notNull(),
    marginalAgriculturalLabourers0To3: integer(
      "marginalAgriculturalLabourers0To3",
    ).notNull(),
    marginalHouseholdIndustryWorkers0To3: integer(
      "marginalHouseholdIndustryWorkers0To3",
    ).notNull(),
    marginalOtherWorkers0To3: integer("marginalOtherWorkers0To3").notNull(),
    nonWorkers: integer("nonWorkers").notNull(),
    year: integer("year").notNull().default(2011),
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
// Upstream (avhaan-db / ahvaan-engine): precomputed per-day heat analysis.
// One row per (locationId, forecastDate). `analysis` is a JSON array of 24
// hourly entries: [{ hour: "13:00:00", analysis: { HTSI, WBGT, HI, UTCI, WBT },
// input: <weather row snapshot> }]. Written by the engine pipeline, read by
// the website (Redis-cached) so dashboard requests never recompute
// WBGT/HI/UTCI per hit.
//
// NOTE: this project keeps NO ops tables. There is no snapshots/alerts/
// deliveries layer — board views (heatmap/summary/trend) are derived
// on demand (lib/board.ts, Redis-cached) and alerts are evaluated
// client-side (lib/alerts.ts) with nothing saved to the DB.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Upstream (avhaan-db / ahvaan-engine): precomputed per-day heat analysis.
// One row per (locationId, forecastDate). `analysis` is a JSON array of 24
// hourly entries: [{ hour: "13:00:00", analysis: { HTSI, WBGT, HI, UTCI, WBT },
// input: <weather row snapshot> }]. Written by the engine (`npm run
// analysis:update`), read by the website (Redis-cached) so dashboard requests
// never recompute WBGT/HI/UTCI per hit.
// ---------------------------------------------------------------------------

export const analysisTable = pgTable(
  "analysis",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    locationId: integer("locationId")
      .notNull()
      .references(() => locationsTable.id, { onDelete: "cascade" }),
    // PG `date`: the pg driver returns a UTC-midnight Date at runtime even
    // though drizzle types it as string — always normalize with toISODate().
    forecastDate: date("forecastDate").notNull(),
    analysis: jsonb("analysis").notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.locationId, t.forecastDate)],
);

export type AnalysisRow = typeof analysisTable.$inferSelect;
export type AnalysisInsert = typeof analysisTable.$inferInsert;

/** Single hourly entry inside `analysis.analysis` (JSONB). */
export interface AnalysisHourEntry {
  hour: string;
  analysis: {
    /** Stored by current engine runs; absent on rows written before HTSI. */
    HTSI?: number;
    WBGT: number;
    HI: number;
    UTCI: number;
    WBT: number;
  };
  input: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Upstream (avhaan-db): ingestion audit log. One row per failed ward/source.
// ---------------------------------------------------------------------------

export const dataIngestionErrorsTable = pgTable("data_ingestion_errors", {
  id: serial("id").primaryKey(),
  district: text("district").notNull(),
  ward: integer("ward").notNull(),
  source: text("source").notNull(),
  errorType: text("error_type").notNull(),
  missingFields: jsonb("missing_fields"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DataIngestionError = typeof dataIngestionErrorsTable.$inferSelect;

// Relations for the upstream tables (declared after the tables above to
// avoid TDZ issues at module load).
export const locationsAnalysisRelations = relations(
  locationsTable,
  ({ many }) => ({
    analysis: many(analysisTable),
  }),
);

export const analysisRelations = relations(analysisTable, ({ one }) => ({
  location: one(locationsTable, {
    fields: [analysisTable.locationId],
    references: [locationsTable.id],
  }),
}));
