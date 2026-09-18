/**
 * City board: per-ward risk derived ON DEMAND from live weather + census —
 * the replacement for the deleted ward_snapshots rollup table.
 *
 * One board build = 2 tiny catalogue queries + one bounded weather range per
 * ward (concurrency-limited, small payloads each) + pure in-memory
 * heatshield math per ward per day. The result is cached in Redis (2 min)
 * so dashboard stampedes never touch Postgres. No cron, no writes, no ops
 * tables.
 *
 * - `days` per ward run oldest→newest over the available IST dates
 *   (capped at `daysBack`), each day trailing exactly 72h like the live
 *   /api/risk endpoint, so board values match single-ward detail views.
 * - `latest` is the most recent computable day (normally today IST).
 */
import { asc } from "drizzle-orm";
import { getDb } from "./db/index";
import { getWeatherRange } from "./db/queries";
import {
  locationsTable,
  populationTable,
  type Location,
  type PopulationRow,
  type WeatherRow,
} from "./db/schema";
import { buildRiskResponse } from "./heatshield/service";
import type { RiskResponse } from "./heatshield/types";
import { istDateString, parseISTWall } from "./analysis";
import { REDIS_TTL, withRedisCache } from "./redis";

type Db = ReturnType<typeof getDb>;

export interface BoardDayPoint {
  date: string;
  risk: number;
  category: string;
  thermal: number;
  wbgt: number;
}

export interface BoardWard {
  locationId: number;
  ward: number | null;
  wardName: string | null;
  lat: number | null;
  long: number | null;
  totalPopulation: number | null;
  latest: RiskResponse | null;
  error: string | null;
  days: BoardDayPoint[];
}

export interface Board {
  computedAt: string;
  dates: string[];
  wards: BoardWard[];
}

const IST_OFFSET_MS = 5.5 * 3_600_000;

/** IST day-end (exclusive upper bound) of an IST date as a true instant. */
export function istDayEndInstant(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - IST_OFFSET_MS);
}

/**
 * Pure helper (unit-testable): bucket ascending weather rows by IST date and
 * compute one trailing-72h risk point per requested date.
 */
export function computeWardDayPoints(
  location: Location,
  population: PopulationRow,
  rowsAsc: WeatherRow[],
  dates: string[],
): BoardDayPoint[] {
  const instants = rowsAsc.map((r) =>
    parseISTWall(r.timestamp as unknown as string | Date).getTime(),
  );
  const points: BoardDayPoint[] = [];
  for (const date of dates) {
    const slice = trailingSlice(rowsAsc, instants, istDayEndInstant(date).getTime());
    if (slice.length === 0) continue;
    try {
      const r = buildRiskResponse({ location, weatherRows: slice, population });
      points.push({
        date,
        risk: r.compositeRisk.value,
        category: r.compositeRisk.category,
        thermal: r.scores.thermalStress,
        wbgt: r.indicators.wbgt,
      });
    } catch {
      // DataGap for this day (e.g. no usable Ta/RH) — skip the point.
    }
  }
  return points;
}

/** Rows with instant in (endMs - 72h, endMs], preserving ascending order. */
export function trailingSlice(
  rowsAsc: WeatherRow[],
  instants: number[],
  endMs: number,
): WeatherRow[] {
  const start = endMs - 72 * 3_600_000;
  const slice: WeatherRow[] = [];
  for (let i = 0; i < rowsAsc.length; i++) {
    const t = instants[i];
    if (t <= endMs && t > start) slice.push(rowsAsc[i]);
    else if (t > endMs) break;
  }
  return slice;
}

async function buildBoard(daysBack: number, db: Db): Promise<Board> {
  const [locations, populations] = await Promise.all([
    db.select().from(locationsTable).orderBy(asc(locationsTable.id)),
    db.select().from(populationTable),
  ]);
  const popByLoc = new Map(populations.map((p) => [p.locationId, p]));

  // Trailing window per ward: enough history for `daysBack` daily points
  // (each point trails 72h) plus model-future rows for today's point.
  const now = new Date();
  const from = new Date(now.getTime() - (daysBack + 3) * 24 * 3_600_000);
  const to = new Date(now.getTime() + 2 * 24 * 3_600_000);
  const today = istDateString(now);

  const wards = await mapPool(locations, 16, async (loc) => {
    const pop = popByLoc.get(loc.id) ?? null;
    const base = {
      locationId: loc.id,
      ward: pop?.ward ?? loc.ward,
      wardName: pop?.wardName ?? null,
      lat: loc.lat,
      long: loc.long,
      totalPopulation: pop?.totalPopulation ?? null,
    };
    if (!pop) {
      return { ...base, latest: null, error: "no population/census row", days: [] };
    }
    let rows: WeatherRow[];
    try {
      rows = await getWeatherRange(loc.id, from, to, db);
    } catch (e) {
      return { ...base, latest: null, error: (e as Error).message, days: [] };
    }
    const dateSet = new Set<string>();
    for (const w of rows) {
      if (!w.timestamp) continue;
      const d = istDateString(parseISTWall(w.timestamp as unknown as string | Date));
      if (d <= today) dateSet.add(d);
    }
    const dates = [...dateSet].sort().slice(-Math.max(1, daysBack));
    const points = computeWardDayPoints(loc, pop, rows, dates);
    let latest: RiskResponse | null = null;
    let error: string | null = null;
    if (points.length > 0) {
      const lastDate = points[points.length - 1].date;
      const instants = rows.map((r) =>
        parseISTWall(r.timestamp as unknown as string | Date).getTime(),
      );
      const slice = trailingSlice(rows, instants, istDayEndInstant(lastDate).getTime());
      try {
        latest = buildRiskResponse({ location: loc, weatherRows: slice, population: pop });
      } catch (e) {
        error = (e as Error).message;
      }
    } else {
      error = "no computable day in window";
    }
    return { ...base, latest, error, days: points };
  });

  const dateSet = new Set<string>();
  for (const w of wards) for (const d of w.days) dateSet.add(d.date);
  return { computedAt: new Date().toISOString(), dates: [...dateSet].sort(), wards };
}

/** Bounded-parallel map (keeps pooled-connection pressure low). */
async function mapPool<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(size, items.length)) },
    async () => {
      while (i < items.length) {
        const j = i++;
        out[j] = await fn(items[j]);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

export async function getBoard(
  daysBack = 7,
  db: Db = getDb(),
): Promise<{ data: Board; cached: boolean }> {
  return withRedisCache(`ahvaan:board:${daysBack}`, REDIS_TTL.board, () =>
    buildBoard(daysBack, db),
  );
}
