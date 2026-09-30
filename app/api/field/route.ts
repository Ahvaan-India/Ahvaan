import { NextResponse } from "next/server";
import { getForecastByDate, getForecastWithAnalysis, type Db } from "@/lib/db/queries";
import { getDb } from "@/lib/db/index";
import type { AnalysisHour, ForecastHour } from "@/lib/db/schema";
import { REDIS_TTL, redisKeys, withMemoryCache, withRedisCache } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type FieldLayer =
  | "temp"
  | "humidity"
  | "wind"
  | "solar"
  | "rain"
  | "htsi"
  | "wbgt"
  | "hi"
  | "utci"
  | "wbt";

type HourLike = { hour?: unknown; [k: string]: unknown };

const WEATHER_KEYS: Record<string, (h: HourLike) => number | null> = {
  temp: (h) => num((h as ForecastHour).temperature),
  humidity: (h) => num((h as ForecastHour).relativeHumidity),
  wind: (h) => num((h as ForecastHour).windSpeed),
  solar: (h) => num((h as ForecastHour).shortwaveRadiation),
  rain: (h) => num((h as ForecastHour).rain),
};

/** Backend analysis keys are UPPERCASE (HI/WBT/HTSI/UTCI/WBGT). */
const ANALYSIS_KEYS: Record<string, (h: HourLike) => number | null> = {
  htsi: (h) => num((h as AnalysisHour).HTSI),
  wbgt: (h) => num((h as AnalysisHour).WBGT),
  hi: (h) => num((h as AnalysisHour).HI),
  utci: (h) => num((h as AnalysisHour).UTCI),
  wbt: (h) => num((h as AnalysisHour).WBT),
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isFieldLayer(l: string): l is FieldLayer {
  return l in WEATHER_KEYS || l in ANALYSIS_KEYS;
}

/**
 * GET /api/field?date=YYYY-MM-DD&layer=temp — zone-aggregated hourly means
 * for one date: `{ date, layer, hours: [24], values: { ulid: [24] } }`.
 * Means across the zone's heatpoint tiles (order-independent — no tile
 * coordinates needed). Vulnerability is NOT served here (static zones file).
 * Analysis layers are Redis-cached; raw-weather layers use the
 * process-memory cache. Recomputed rarely (backend writes new dates daily).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  const layerRaw = url.searchParams.get("layer") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Invalid date. Expected ?date=YYYY-MM-DD&layer=temp" },
      { status: 400 },
    );
  }
  if (!isFieldLayer(layerRaw)) {
    return NextResponse.json(
      { error: "Invalid layer. Expected one of temp,humidity,wind,solar,rain,htsi,wbgt,hi,utci,wbt" },
      { status: 400 },
    );
  }
  const isAnalysis = layerRaw in ANALYSIS_KEYS;
  const extract = isAnalysis ? ANALYSIS_KEYS[layerRaw] : WEATHER_KEYS[layerRaw];

  try {
    // Redis serves backend analysis fields only; raw weather goes through
    // the process-memory cache.
    const useRedis = isAnalysis;
    const { data: payload, cached } = useRedis
      ? await withRedisCache(
          redisKeys.field(date, layerRaw),
          REDIS_TTL.field,
          async () => buildField(date, layerRaw, extract, getDb()),
        )
      : await withMemoryCache(
          redisKeys.memField(date, layerRaw),
          REDIS_TTL.memField,
          async () => buildField(date, layerRaw, extract, getDb()),
        );
    if (!payload || payload.zones === 0) {
      return NextResponse.json(
        { error: `No forecast rows for ${date}` },
        { status: 404 },
      );
    }
    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=120",
        "X-Cache": cached ? "HIT" : "MISS",
      },
    });
  } catch (err) {
    console.error("GET /api/field failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function buildField(
  date: string,
  layer: string,
  extract: (h: HourLike) => number | null,
  db: Db,
) {
  // Analysis layers follow the linked flow: forecast rows fetched WITH
  // their `analyses` relation (unique_location_id → forecast → analysis).
  // Weather layers read forecast rows directly. Both aggregate to zone means.
  let rows: Array<{ uniqueLocationId: string; hours: HourLike[] }>;
  if (layer in ANALYSIS_KEYS) {
    const frows = await getForecastWithAnalysis({ date }, db);
    rows = frows.flatMap((r) =>
      (r.analyses ?? []).map((a) => ({
        uniqueLocationId: r.uniqueLocationId,
        hours: (a.hourlyData ?? []) as HourLike[],
      })),
    );
  } else {
    rows = (await getForecastByDate(date, db)).map((r) => ({
      uniqueLocationId: r.uniqueLocationId,
      hours: (r.hourlyForecast ?? []) as HourLike[],
    }));
  }
  // ulid → 24 hourly buckets (sum/count for the mean across tiles).
  const buckets = new Map<string, { sum: number[]; n: number[] }>();
  const hourSet = new Set<string>();
  for (const r of rows) {
    const hours = r.hours ?? [];
    let b = buckets.get(r.uniqueLocationId);
    if (!b) {
      b = { sum: new Array(24).fill(0), n: new Array(24).fill(0) };
      buckets.set(r.uniqueLocationId, b);
    }
    hours.forEach((h, i) => {
      if (i >= 24) return;
      if (typeof h?.hour === "string") hourSet.add(h.hour);
      const v = extract(h);
      if (v !== null) {
        b.sum[i] += v;
        b.n[i] += 1;
      }
    });
  }
  const hours = [...hourSet].sort().slice(0, 24);
  while (hours.length < 24) hours.push(`${String(hours.length).padStart(2, "0")}:00`);
  const values: Record<string, Array<number | null>> = {};
  const prec = layer in ANALYSIS_KEYS ? 1000 : 10;
  for (const [ulid, b] of buckets) {
    values[ulid] = b.sum.map((s, i) =>
      b.n[i] > 0 ? Math.round((s / b.n[i]) * prec) / prec : null,
    );
  }
  return { date, zones: buckets.size, hours, values };
}
