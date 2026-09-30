import {
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Ahvaan Drizzle schema — backend-owned precomputed model.
 *
 * Linking (follow the ids, no joins to anything else):
 *   analysis.forecast_id → forecast.id → forecast.heat_point_id (+ zone via
 *   forecast.unique_location_id → census-data.json zone polygons).
 *
 * There is deliberately NO heatpoints table: tile-center coordinates are
 * derived from zone polygons at sync time (`npm run sync:zones`) and stored
 * in the static dataset. There are no locations/weather/population tables
 * and no local calculation engine — all indices arrive precomputed from the
 * backend service (currently: raw hourly weather in `forecast`,
 * per-forecast analysis rows in `analysis` once the backend writes them).
 */

export const forecastTable = pgTable("forecast", {
  id: serial("id").primaryKey(),
  heatPointId: integer("heat_point_id").notNull(),
  uniqueLocationId: text("unique_location_id").notNull(),
  // PG `date` as YYYY-MM-DD wall string (drizzle mode:"string" returns the
  // raw calendar string on every host — compare as strings only).
  date: date("date", { mode: "string" }).notNull(),
  // 24 hourly entries: [{ hour: "00:00", temperature, relativeHumidity,
  // windSpeed, rain, shortwaveRadiation, directRadiation, diffuseRadiation }]
  hourlyForecast: jsonb("hourly_forecast").notNull(),
});

export const analysisTable = pgTable(
  "analysis",
  {
    id: serial("id").primaryKey(),
    // The forecast row that was analyzed
    forecastId: integer("forecast_id")
      .notNull()
      .references(() => forecastTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    date: date("date", { mode: "string" }).notNull(),
    // Backend-computed per-hour indices for the forecast above.
    hourlyData: jsonb("hourly_data").notNull(),
  },
  (table) => ({
    // One analysis per forecast
    forecastUnique: unique("analysis_forecast_unique").on(table.forecastId),
    // Extra protection: one analysis for a forecast/date combination
    forecastDateUnique: unique("analysis_forecast_date_unique").on(
      table.forecastId,
      table.date,
    ),
  }),
);

export type ForecastRow = typeof forecastTable.$inferSelect;
export type AnalysisRow = typeof analysisTable.$inferSelect;

/**
 * Linked relations: each forecast row carries its backend analysis rows
 * (`analyses`, at most one due to the unique constraint). Query with
 * `with: { analyses: true }` — one round trip, no manual id plumbing.
 */
export const forecastRelations = relations(forecastTable, ({ many }) => ({
  analyses: many(analysisTable),
}));

export const analysisRelations = relations(analysisTable, ({ one }) => ({
  forecast: one(forecastTable, {
    fields: [analysisTable.forecastId],
    references: [forecastTable.id],
  }),
}));

/** One raw hourly weather entry inside `forecast.hourly_forecast`. */
export interface ForecastHour {
  hour: string;
  temperature: number | null;
  relativeHumidity: number | null;
  windSpeed: number | null;
  rain: number | null;
  shortwaveRadiation: number | null;
  directRadiation: number | null;
  diffuseRadiation: number | null;
  [key: string]: unknown;
}

/** One backend-computed hourly entry inside `analysis.hourly_data`. */
export interface AnalysisHour {
  hour: string;
  [key: string]: unknown;
}
