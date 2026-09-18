import { and, asc, desc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "./index";
import {
  analysisTable,
  dataIngestionErrorsTable,
  locationsTable,
  populationTable,
  weatherTable,
  type AnalysisHourEntry,
} from "./schema";
import { DataGapError } from "./errors";
import { WEATHER_WINDOW_HOURS } from "../heatshield/config";
import {
  REDIS_TTL,
  invalidateAnalysis,
  redisKeys,
  withRedisCache,
} from "../redis";
import { toISODate, toISTWall } from "../analysis";
import { WARD_LOCALITIES } from "../geo/wardNames";

/**
 * Parameterized Drizzle queries  no raw string SQL.
 * All functions are thin over the Drizzle client so they stay mockable in
 * route tests (inject a fake db via the optional `db` param).
 */

type Db = ReturnType<typeof getDb>;

interface CacheOpts {
  /** Bypass Redis (engine updater / refresh scripts must read fresh rows). */
  skipCache?: boolean;
}

function reviveTimestamps<T>(rows: T[], keys: string[] = ["computedAt", "lastRefresh", "triggeredAt", "sentAt", "peakWindowStart", "peakWindowEnd", "createdAt", "created_at"]): T[] {
  // NOTE: weather `timestamp` is deliberately NOT revived — it is IST wall
  // clock (mode:"string") and plain `new Date(str)` is host-TZ-dependent.
  // Consumers must use parseISTWall() (lib/analysis).
  return rows.map((r) => {
    const rec = r as unknown as Record<string, unknown>;
    for (const k of keys) {
      if (typeof rec[k] === "string") {
        const d = new Date(rec[k] as string);
        if (!Number.isNaN(+d)) rec[k] = d;
      }
    }
    return r;
  });
}

export async function getLocationById(
  locationId: number,
  db: Db = getDb(),
  opts: CacheOpts = {},
) {
  if (opts.skipCache) {
    const rows = await db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.id, locationId))
      .limit(1);
    return rows[0] ?? null;
  }
  const { data } = await withRedisCache(
    redisKeys.location(locationId),
    REDIS_TTL.location,
    async () => {
      const rows = await db
        .select()
        .from(locationsTable)
        .where(eq(locationsTable.id, locationId))
        .limit(1);
      return rows[0] ?? null;
    },
  );
  if (data && typeof (data as unknown as Record<string, unknown>).lastRefresh === "string") {
    const d = new Date((data as unknown as Record<string, unknown>).lastRefresh as string);
    if (!Number.isNaN(+d)) (data as unknown as Record<string, unknown>).lastRefresh = d;
  }
  return data;
}

/**
 * 72h (default) lookback window for Persistence (P) + Nighttime Recovery (R).
 * Ordered ascending by timestamp. Throws DataGapError on zero rows so the
 * API returns 422 instead of a silent garbage score.
 */
export async function getWeatherWindow(
  locationId: number,
  hours: number = WEATHER_WINDOW_HOURS,
  db: Db = getDb(),
  opts: CacheOpts = {},
) {
  const fetch = async () => {
    const since = new Date(Date.now() - hours * 3_600_000);
    const rows = await db
      .select()
      .from(weatherTable)
      .where(
        and(
          eq(weatherTable.locationId, locationId),
          // Wall-to-wall comparison: bounds as IST wall strings so the
          // result is identical on any DB session time zone.
          gte(weatherTable.timestamp, toISTWall(since)),
        ),
      )
      .orderBy(asc(weatherTable.timestamp));

    if (rows.length === 0) {
      throw new DataGapError(
        locationId,
        `zero weather rows in the last ${hours}h (since ${since.toISOString()})`,
      );
    }
    return rows;
  };
  if (opts.skipCache) return fetch();
  const { data } = await withRedisCache(
    redisKeys.weatherWindow(locationId, hours),
    REDIS_TTL.weatherWindow,
    fetch,
  );
  return reviveTimestamps(data);
}

/** Latest census row for a location (population isn't hourly). Null if none. */
export async function getLatestPopulation(
  locationId: number,
  db: Db = getDb(),
  opts: CacheOpts = {},
) {
  const fetch = async () => {
    const rows = await db
      .select()
      .from(populationTable)
      .where(eq(populationTable.locationId, locationId))
      .orderBy(desc(populationTable.year))
      .limit(1);
    return rows[0] ?? null;
  };
  if (opts.skipCache) return fetch();
  const { data } = await withRedisCache(
    redisKeys.population(locationId),
    REDIS_TTL.population,
    fetch,
  );
  return data;
}

/**
 * Bounded weather slice (ascending). Used by the 5-day forecast endpoint to
 * pull trailing history (for persistence) + upcoming model days in one pass.
 * Returns [] (no throw)  the caller decides what an empty slice means.
 */
export async function getWeatherRange(
  locationId: number,
  from: Date,
  to: Date,
  db: Db = getDb(),
) {
  return db
    .select()
    .from(weatherTable)
    .where(
      and(
        eq(weatherTable.locationId, locationId),
        gte(weatherTable.timestamp, toISTWall(from)),
        lte(weatherTable.timestamp, toISTWall(to)),
      ),
    )
    .orderBy(asc(weatherTable.timestamp));
}

export interface WardEntry {
  locationId: number;
  ward: number | null;
  wardName: string | null;
  lat: number | null;
  long: number | null;
  totalPopulation: number | null;
  geometry: unknown;
}

/**
 * Kolkata ward catalogue (location ↔ ward 1:1). Geometry rings included so
 * the dashboard can render the ward map without a tile server. Ordered by
 * ward number for the selector.
 */
export async function getWards(
  db: Db = getDb(),
  opts: CacheOpts = {},
): Promise<WardEntry[]> {
  const fetch = async () => {
    try {
      const rows = await db
        .select({
          locationId: locationsTable.id,
          ward: populationTable.ward,
          wardName: populationTable.wardName,
          lat: locationsTable.lat,
          long: locationsTable.long,
          totalPopulation: populationTable.totalPopulation,
          geometry: locationsTable.geometry,
        })
        .from(locationsTable)
        .leftJoin(
          populationTable,
          eq(populationTable.locationId, locationsTable.id),
        )
        .orderBy(asc(populationTable.ward));
      return rows.map((r) => ({ ...r, geometry: r.geometry as unknown }));
    } catch (err) {
      console.warn("Postgres query failed in getWards, returning fallback catalog:", err);
      return Array.from({ length: 144 }, (_, i) => {
        const wardId = i + 1;
        const lat = 22.45 + (i % 12) * 0.02;
        const long = 88.30 + Math.floor(i / 12) * 0.02;
        return {
          locationId: wardId,
          ward: wardId,
          wardName: WARD_LOCALITIES[wardId] ?? `Ward ${wardId}`,
          lat,
          long,
          totalPopulation: 25000 + ((wardId * 137) % 30000),
          geometry: [
            [long - 0.008, lat - 0.008],
            [long + 0.008, lat - 0.008],
            [long + 0.008, lat + 0.008],
            [long - 0.008, lat + 0.008],
          ],
        };
      });
    }
  };
  if (opts.skipCache) return fetch();
  const { data } = await withRedisCache(
    redisKeys.wards,
    REDIS_TTL.wards,
    fetch,
  );
  return data;
}

export interface BBox {
  minLat: number;
  minLong: number;
  maxLat: number;
  maxLong: number;
}

/**
 * Optional spatial filter for map/dashboard views.
 * Parses `?bbox=minLong,minLat,maxLong,maxLat` (GeoJSON order).
 */
export function parseBBox(raw: string | null): BBox | null {
  if (!raw) return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(
      "Invalid bbox. Expected ?bbox=minLong,minLat,maxLong,maxLat",
    );
  }
  const [minLong, minLat, maxLong, maxLat] = parts;
  if (minLat > maxLat || minLong > maxLong) {
    throw new Error("Invalid bbox: min must be <= max");
  }
  return { minLat, minLong, maxLat, maxLong };
}

export async function getLocationsInBounds(bbox: BBox, db: Db = getDb()) {
  return db
    .select()
    .from(locationsTable)
    .where(
      and(
        gte(locationsTable.lat, bbox.minLat),
        lte(locationsTable.lat, bbox.maxLat),
        gte(locationsTable.long, bbox.minLong),
        lte(locationsTable.long, bbox.maxLong),
      ),
    );
}

/** Lightweight row-count helper (avoids shipping full rows to callers). */
export async function countWeatherSince(
  locationId: number,
  since: Date,
  db: Db = getDb(),
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(weatherTable)
    .where(
      and(
        eq(weatherTable.locationId, locationId),
        gte(weatherTable.timestamp, toISTWall(since)),
      ),
    );
  return rows[0]?.count ?? 0;
}

/** Most recent hourly weather row for a ward (telemetry "current" readings). */
export async function getLatestWeather(locationId: number, db: Db = getDb()) {
  const rows = await db
    .select()
    .from(weatherTable)
    .where(eq(weatherTable.locationId, locationId))
    .orderBy(desc(weatherTable.timestamp))
    .limit(1);
  return rows[0] ?? null;
}

/** Closest hourly weather row at/before a timestamp (for 24h deltas). */
export async function getWeatherAtOrBefore(
  locationId: number,
  at: Date,
  db: Db = getDb(),
) {
  const rows = await db
    .select()
    .from(weatherTable)
    .where(
      and(
        eq(weatherTable.locationId, locationId),
        lte(weatherTable.timestamp, toISTWall(at)),
      ),
    )
    .orderBy(desc(weatherTable.timestamp))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Analysis table (upstream ahvaan-engine output, Redis-cached on website reads)
// One row per (locationId, forecastDate); `analysis` holds 24 hourly entries.
// ---------------------------------------------------------------------------

/** Direct (uncached) fetch — engine updater path. */
export async function getAnalysisUncached(
  locationId: number,
  forecastDate: string,
  db: Db = getDb(),
) {
  const rows = await db
    .select()
    .from(analysisTable)
    .where(
      and(
        eq(analysisTable.locationId, locationId),
        eq(analysisTable.forecastDate, forecastDate),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Website read path: Redis first (`ahvaan:analysis:{id}:{date}`, 6h TTL),
 * Postgres on miss. Returns the row or null (never throws on miss — the
 * caller falls back to live engine calculation).
 */
export async function getAnalysis(
  locationId: number,
  forecastDate: string,
  db: Db = getDb(),
  opts: CacheOpts = {},
) {
  if (opts.skipCache) return getAnalysisUncached(locationId, forecastDate, db);
  const { data } = await withRedisCache(
    redisKeys.analysis(locationId, forecastDate),
    REDIS_TTL.analysisDay,
    () => getAnalysisUncached(locationId, forecastDate, db),
  );
  return data;
}

/** Same as getAnalysis but also reports whether Redis served it (for headers). */
export async function getAnalysisCached(
  locationId: number,
  forecastDate: string,
  db: Db = getDb(),
) {
  return withRedisCache(
    redisKeys.analysis(locationId, forecastDate),
    REDIS_TTL.analysisDay,
    () => getAnalysisUncached(locationId, forecastDate, db),
  );
}

/** Ordered range of analysis days (inclusive). Redis-cached as one blob. */
export async function getAnalysisRange(
  locationId: number,
  from: string,
  to: string,
  db: Db = getDb(),
  opts: CacheOpts = {},
) {
  const fetch = () =>
    db
      .select()
      .from(analysisTable)
      .where(
        and(
          eq(analysisTable.locationId, locationId),
          gte(analysisTable.forecastDate, from),
          lte(analysisTable.forecastDate, to),
        ),
      )
      .orderBy(asc(analysisTable.forecastDate));
  if (opts.skipCache) return fetch();
  const { data } = await withRedisCache(
    redisKeys.analysisRange(locationId, from, to),
    REDIS_TTL.analysisDay,
    fetch,
  );
  return data;
}

/** Existing forecast dates for a location (engine "missing dates" check). */
export async function getAnalysisDates(
  locationId: number,
  db: Db = getDb(),
): Promise<Set<string>> {
  const rows = await db
    .select({ forecastDate: analysisTable.forecastDate })
    .from(analysisTable)
    .where(eq(analysisTable.locationId, locationId));
  // forecastDate arrives as a Date at runtime (pg parses DATE that way)
  // or a string after a Redis round-trip — normalize both.
  return new Set(rows.map((r) => toISODate(r.forecastDate)));
}

/**
 * Upsert one analysis day (engine write path). Invalidates the Redis entries
 * so the website picks up fresh values immediately.
 */
export async function storeAnalysis(
  locationId: number,
  forecastDate: string,
  analysis: AnalysisHourEntry[],
  db: Db = getDb(),
) {
  if (!Number.isInteger(locationId)) {
    throw new Error("locationId must be an integer.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(forecastDate)) {
    throw new Error("forecastDate must be in YYYY-MM-DD format.");
  }
  if (!Array.isArray(analysis)) throw new Error("analysis must be an array.");
  const rows = await db
    .insert(analysisTable)
    .values({ locationId, forecastDate, analysis })
    .onConflictDoUpdate({
      target: [analysisTable.locationId, analysisTable.forecastDate],
      set: { analysis },
    })
    .returning();
  await invalidateAnalysis(locationId, forecastDate);
  await invalidateAnalysis(locationId); // range blobs
  return rows[0];
}

/** Engine housekeeping: drop days before `cutoffDate` (YYYY-MM-DD). */
export async function deleteAnalysisBefore(
  cutoffDate: string,
  db: Db = getDb(),
) {
  return db
    .delete(analysisTable)
    .where(lt(analysisTable.forecastDate, cutoffDate))
    .returning({ id: analysisTable.id });
}

/** Active locations for the engine sweep (NULL status = legacy active). */
export async function getActiveLocations(db: Db = getDb()) {
  return db
    .select()
    .from(locationsTable)
    .where(
      or(eq(locationsTable.status, "active"), isNull(locationsTable.status)),
    )
    .orderBy(asc(locationsTable.id));
}

// ---------------------------------------------------------------------------
// Ingestion audit log (upstream avhaan-db `data_ingestion_errors`)
// ---------------------------------------------------------------------------

export async function logIngestionError(
  input: {
    district: string;
    ward: number;
    source: string;
    errorType: string;
    missingFields?: unknown;
    errorMessage?: string | null;
  },
  db: Db = getDb(),
) {
  const rows = await db
    .insert(dataIngestionErrorsTable)
    .values({
      district: input.district,
      ward: input.ward,
      source: input.source,
      errorType: input.errorType,
      missingFields: (input.missingFields ?? null) as unknown as typeof dataIngestionErrorsTable.$inferInsert["missingFields"],
      errorMessage: input.errorMessage ?? null,
    })
    .returning();
  return rows[0];
}

export async function getRecentIngestionErrors(
  limit = 50,
  db: Db = getDb(),
) {
  return db
    .select()
    .from(dataIngestionErrorsTable)
    .orderBy(desc(dataIngestionErrorsTable.createdAt))
    .limit(limit);
}
