import { and, asc, desc, gte, lte, eq, sql, ne } from "drizzle-orm";
import { getDb } from "./index";
import {
  alertDeliveriesTable,
  alertsTable,
  locationsTable,
  populationTable,
  wardSnapshotsTable,
  weatherTable,
} from "./schema";
import { DataGapError } from "./errors";
import { WEATHER_WINDOW_HOURS } from "../heatshield/config";

/**
 * Parameterized Drizzle queries — no raw string SQL.
 * All functions are thin over the Drizzle client so they stay mockable in
 * route tests (inject a fake db via the optional `db` param).
 */

type Db = ReturnType<typeof getDb>;

export async function getLocationById(locationId: number, db: Db = getDb()) {
  const rows = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, locationId))
    .limit(1);
  return rows[0] ?? null;
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
) {
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows = await db
    .select()
    .from(weatherTable)
    .where(
      and(
        eq(weatherTable.locationId, locationId),
        gte(weatherTable.timestamp, since),
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
}

/** Latest census row for a location (population isn't hourly). Null if none. */
export async function getLatestPopulation(locationId: number, db: Db = getDb()) {
  const rows = await db
    .select()
    .from(populationTable)
    .where(eq(populationTable.locationId, locationId))
    .orderBy(desc(populationTable.year))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Bounded weather slice (ascending). Used by the 5-day forecast endpoint to
 * pull trailing history (for persistence) + upcoming model days in one pass.
 * Returns [] (no throw) — the caller decides what an empty slice means.
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
        gte(weatherTable.timestamp, from),
        lte(weatherTable.timestamp, to),
      ),
    )
    .orderBy(asc(weatherTable.timestamp));
}

export interface WardEntry {
  locationId: number;
  ward: number | null;
  wardName: string | null;
  lat: number;
  long: number;
  totalPopulation: number | null;
  geometry: unknown;
}

/**
 * Kolkata ward catalogue (location ↔ ward 1:1). Geometry rings included so
 * the dashboard can render the ward map without a tile server. Ordered by
 * ward number for the selector.
 */
export async function getWards(db: Db = getDb()): Promise<WardEntry[]> {
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
        gte(weatherTable.timestamp, since),
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
        lte(weatherTable.timestamp, at),
      ),
    )
    .orderBy(desc(weatherTable.timestamp))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Snapshots (insert-only history; latest per ward = current rollup)
// ---------------------------------------------------------------------------

/** Latest snapshot per ward. Empty array when no refresh has run yet. */
export async function getLatestSnapshots(db: Db = getDb()) {
  const latest = db
    .select({
      locationId: wardSnapshotsTable.locationId,
      maxAt: sql<Date>`max(${wardSnapshotsTable.computedAt})`.as("maxAt"),
    })
    .from(wardSnapshotsTable)
    .groupBy(wardSnapshotsTable.locationId)
    .as("latest");
  return db
    .select({
      snapshot: wardSnapshotsTable,
      ward: populationTable.ward,
      wardName: populationTable.wardName,
      totalPopulation: populationTable.totalPopulation,
      lat: locationsTable.lat,
      long: locationsTable.long,
    })
    .from(wardSnapshotsTable)
    .innerJoin(
      latest,
      and(
        eq(wardSnapshotsTable.locationId, latest.locationId),
        eq(wardSnapshotsTable.computedAt, latest.maxAt),
      ),
    )
    .leftJoin(
      populationTable,
      eq(populationTable.locationId, wardSnapshotsTable.locationId),
    )
    .leftJoin(
      locationsTable,
      eq(locationsTable.id, wardSnapshotsTable.locationId),
    );
}

/** Snapshot set as of a cutoff (for KPI trend deltas). */
export async function getSnapshotsBefore(cutoff: Date, db: Db = getDb()) {
  const latest = db
    .select({
      locationId: wardSnapshotsTable.locationId,
      maxAt: sql<Date>`max(${wardSnapshotsTable.computedAt})`.as("maxAt"),
    })
    .from(wardSnapshotsTable)
    .where(lte(wardSnapshotsTable.computedAt, cutoff))
    .groupBy(wardSnapshotsTable.locationId)
    .as("latestBefore");
  return db
    .select({ snapshot: wardSnapshotsTable })
    .from(wardSnapshotsTable)
    .innerJoin(
      latest,
      and(
        eq(wardSnapshotsTable.locationId, latest.locationId),
        eq(wardSnapshotsTable.computedAt, latest.maxAt),
      ),
    );
}

// ---------------------------------------------------------------------------
// Alerts + deliveries
// ---------------------------------------------------------------------------

export interface ActiveAlertRow {
  alert: typeof alertsTable.$inferSelect;
  ward: number | null;
  wardName: string | null;
  lat: number | null;
  long: number | null;
}

export async function getActiveAlerts(db: Db = getDb()): Promise<ActiveAlertRow[]> {
  const rows = await db
    .select({
      alert: alertsTable,
      ward: populationTable.ward,
      wardName: populationTable.wardName,
      lat: locationsTable.lat,
      long: locationsTable.long,
    })
    .from(alertsTable)
    .leftJoin(populationTable, eq(populationTable.locationId, alertsTable.wardId))
    .leftJoin(locationsTable, eq(locationsTable.id, alertsTable.wardId))
    .where(eq(alertsTable.status, "active"))
    .orderBy(desc(alertsTable.riskScore));
  return rows;
}

/** Alert/event history for one ward (newest first). Includes resolved. */
export async function getAlertHistory(wardId: number, limit = 10, db: Db = getDb()) {
  return db
    .select()
    .from(alertsTable)
    .where(eq(alertsTable.wardId, wardId))
    .orderBy(desc(alertsTable.triggeredAt))
    .limit(limit);
}

export async function getAlertById(alertId: number, db: Db = getDb()) {
  const rows = await db
    .select()
    .from(alertsTable)
    .where(eq(alertsTable.id, alertId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createDelivery(
  input: {
    alertId?: number | null;
    recipientPhone?: string | null;
    messageText?: string | null;
    sentBy?: string | null;
    status?: string | null;
  },
  db: Db = getDb(),
) {
  const rows = await db
    .insert(alertDeliveriesTable)
    .values({
      alertId: input.alertId ?? null,
      recipientPhone: input.recipientPhone ?? null,
      messageText: input.messageText ?? null,
      sentBy: input.sentBy ?? null,
      channel: "whatsapp",
      status: input.status ?? "initiated",
    })
    .returning();
  return rows[0];
}

/** Broadcast history for one alert (newest first). Powers "View Broadcast History". */
export async function getDeliveries(alertId: number, db: Db = getDb()) {
  return db
    .select()
    .from(alertDeliveriesTable)
    .where(eq(alertDeliveriesTable.alertId, alertId))
    .orderBy(desc(alertDeliveriesTable.sentAt));
}
