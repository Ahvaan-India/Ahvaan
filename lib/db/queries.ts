import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "./index";
import { analysisTable, forecastTable } from "./schema";

/**
 * Parameterized Drizzle queries over the backend-owned forecast/analysis
 * model — no raw string SQL, no local index math.
 *
 * Linking: analysis.forecast_id → forecast.id → heat_point_id (+ zone via
 * unique_location_id). Coordinates/polygons live in the static dataset
 * (`npm run sync:wards`… no — `npm run sync:zones`), never in Postgres.
 */

type Db = ReturnType<typeof getDb>;
export type { Db };

/** All forecast dates present (YYYY-MM-DD ascending). */
export async function getForecastDates(db: Db = getDb()): Promise<string[]> {
  const rows = await db
    .selectDistinct({ date: forecastTable.date })
    .from(forecastTable)
    .orderBy(asc(forecastTable.date));
  return rows.map((r) => r.date);
}

/** Dates with backend analysis rows present (subset of forecast dates). */
export async function getAnalysisDates(db: Db = getDb()): Promise<string[]> {
  const rows = await db
    .selectDistinct({ date: analysisTable.date })
    .from(analysisTable)
    .orderBy(asc(analysisTable.date));
  return rows.map((r) => r.date);
}

/** Latest forecast date, or null when the backend hasn't written any. */
export async function getLatestForecastDate(
  db: Db = getDb(),
): Promise<string | null> {
  const dates = await getForecastDates(db);
  return dates.length ? dates[dates.length - 1] : null;
}

/** Forecast rows for one zone (every tile × date in window). */
export async function getForecastByZone(
  uniqueLocationId: string,
  from: string,
  to: string,
  db: Db = getDb(),
) {
  return db
    .select()
    .from(forecastTable)
    .where(
      and(
        eq(forecastTable.uniqueLocationId, uniqueLocationId),
        gte(forecastTable.date, from),
        lte(forecastTable.date, to),
      ),
    )
    .orderBy(asc(forecastTable.heatPointId), asc(forecastTable.date));
}

/**
 * Forecast rows with their linked backend analysis (`analyses`), one round
 * trip via the forecast→analysis relation. Filter by exact date and/or date
 * window and/or zone (unique_location_id — same key as heatpoints.json).
 * Analysis arrays are empty where the backend hasn't written rows yet.
 */
export async function getForecastWithAnalysis(
  opts: { date?: string; from?: string; to?: string; ulid?: string },
  db: Db = getDb(),
) {
  const conds = [];
  if (opts.date !== undefined) conds.push(eq(forecastTable.date, opts.date));
  if (opts.from !== undefined) conds.push(gte(forecastTable.date, opts.from));
  if (opts.to !== undefined) conds.push(lte(forecastTable.date, opts.to));
  if (opts.ulid !== undefined) conds.push(eq(forecastTable.uniqueLocationId, opts.ulid));
  return db.query.forecastTable.findMany({
    where: conds.length ? and(...conds) : undefined,
    with: { analyses: true },
    orderBy: (f, { asc }) => [asc(f.heatPointId), asc(f.date)],
  });
}

/** All forecast rows for one date (field aggregation input). */
export async function getForecastByDate(date: string, db: Db = getDb()) {
  return db
    .select()
    .from(forecastTable)
    .where(eq(forecastTable.date, date))
    .orderBy(asc(forecastTable.heatPointId));
}
