import { NextResponse } from "next/server";
import { getForecastByDate, getForecastWithAnalysis, type Db } from "@/lib/db/queries";
import { getDb } from "@/lib/db/index";
import type { AnalysisHour, ForecastHour } from "@/lib/db/schema";
import { REDIS_TTL, redisKeys, withMemoryCache, withRedisCache } from "@/lib/redis";
import { loadZonesStatic } from "@/lib/geo/zonesServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const ALL_LAYERS = new Set([
  ...Object.keys(WEATHER_KEYS),
  ...Object.keys(ANALYSIS_KEYS),
  "vulnerability",
]);

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * GET /api/tiles?date=YYYY-MM-DD&layer=temp — per-HEATPOINT 24h values for
 * the gradient overlay: `{ date, layer, hours, tiles: { heatPointId: [24] } }`.
 *
 * Flow per your model: unique_location_id → forecast rows (ids +
 * heat_point_ids) → analysis rows by forecast_id. Each tile keeps its OWN
 * values (no zone averaging) so glow discs reflect their tile.
 * Vulnerability resolves per tile from the static zone catalogue.
 * Analysis layers are Redis-cached; everything else is memory-cached.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  const layer = url.searchParams.get("layer") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Invalid date. Expected ?date=YYYY-MM-DD&layer=<layer>" },
      { status: 400 },
    );
  }
  if (!ALL_LAYERS.has(layer)) {
    return NextResponse.json(
      { error: "Invalid layer." },
      { status: 400 },
    );
  }

  try {
    const isAnalysis = layer in ANALYSIS_KEYS;
    const useRedis = isAnalysis;
    const build = () => buildTiles(date, layer, getDb());
    const { data: payload, cached } = useRedis
      ? await withRedisCache(
          `${redisKeys.field(date, layer)}:tiles`,
          REDIS_TTL.field,
          build,
        )
      : await withMemoryCache(
          `${redisKeys.memField(date, layer)}:tiles`,
          REDIS_TTL.memField,
          build,
        );
    if (!payload || payload.tiles === 0) {
      return NextResponse.json(
        { error: `No rows for ${date}` },
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
    console.error("GET /api/tiles failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function buildTiles(date: string, layer: string, db: Db) {
  const tiles: Record<string, Array<number | null>> = {};
  const hourSet = new Set<string>();

  if (layer === "vulnerability") {
    const zonesFile = await loadZonesStatic();
    const vulnByUlid = new Map(
      (zonesFile?.zones ?? []).map((z) => [z.ulid, z.vulnerability]),
    );
    const frows = await getForecastByDate(date, db);
    for (const r of frows) {
      const v = vulnByUlid.get(r.uniqueLocationId) ?? null;
      tiles[r.heatPointId] = new Array(24).fill(
        typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null,
      );
      hourSet.add("00:00");
    }
  } else if (layer in ANALYSIS_KEYS) {
    const extract = ANALYSIS_KEYS[layer];
    const frows = await getForecastWithAnalysis({ date }, db);
    for (const r of frows) {
      const a = (r.analyses ?? [])[0];
      const hours = ((a?.hourlyData ?? []) as HourLike[]).slice(0, 24);
      tiles[r.heatPointId] = hours.map((h) => {
        if (typeof h?.hour === "string") hourSet.add(h.hour);
        const v = extract(h);
        return v === null ? null : Math.round(v * 10) / 10;
      });
      while (tiles[r.heatPointId].length < 24) tiles[r.heatPointId].push(null);
    }
  } else {
    const extract = WEATHER_KEYS[layer];
    const frows = await getForecastByDate(date, db);
    for (const r of frows) {
      const hours = ((r.hourlyForecast ?? []) as HourLike[]).slice(0, 24);
      tiles[r.heatPointId] = hours.map((h) => {
        if (typeof h?.hour === "string") hourSet.add(h.hour);
        const v = extract(h);
        return v === null ? null : Math.round(v * 10) / 10;
      });
      while (tiles[r.heatPointId].length < 24) tiles[r.heatPointId].push(null);
    }
  }

  const hours = [...hourSet].sort();
  while (hours.length < 24) hours.push(`${String(hours.length).padStart(2, "0")}:00`);
  return { date, layer, tiles: Object.keys(tiles).length, hours: hours.slice(0, 24), values: tiles };
}
