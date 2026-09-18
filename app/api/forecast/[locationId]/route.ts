import { NextResponse } from "next/server";
import {
  getAnalysisRange,
  getLatestPopulation,
  getLocationById,
  getWeatherRange,
} from "@/lib/db/queries";
import { DataGapError, LocationNotFoundError } from "@/lib/db/errors";
import { computeForecastDays } from "@/lib/heatshield/forecast";
import { timezoneForLocation } from "@/lib/geo/timezone";
import {
  addDays,
  istDateString,
  summarizeDayAnalysis,
  toISODate,
} from "@/lib/analysis";
import type { AnalysisHourEntry } from "@/lib/db/schema";
import { REDIS_TTL, withRedisCache } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ locationId: string }>;
}

/**
 * GET /api/forecast/[locationId]?days=5  N-day upcoming outlook.
 * Wards map 1:1 to locations, so wardId == locationId here.
 * Short edge cache (10 min)  model runs refresh hourly, not per second.
 */
export async function GET(req: Request, { params }: { params: any }) {
  const resolvedParams = await Promise.resolve(params);
  const raw = resolvedParams?.locationId;
  const locationId = Number(raw);
  if (!Number.isInteger(locationId) || locationId <= 0) {
    return NextResponse.json(
      {
        error: "Invalid locationId: must be a positive integer",
        locationId: raw,
      },
      { status: 400 },
    );
  }
  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get("days") ?? 5);
  const days = Number.isInteger(daysRaw)
    ? Math.max(1, Math.min(daysRaw, 10))
    : 5;

  try {
    // Whole-response cache (2 min): every hover/selection re-requests this
    // route, and the weather-range + compute below is the slowest per-ward
    // read. Errors throw (never cached); only successful payloads store.
    const { data: payload, cached } = await withRedisCache(
      `ahvaan:forecast:${locationId}:${days}`,
      REDIS_TTL.forecast,
      async () => {
        const location = await getLocationById(locationId);
        if (!location) throw new LocationNotFoundError(locationId);
        const population = await getLatestPopulation(locationId);
        if (!population)
          throw new DataGapError(locationId, "no population/census row");

        const { timeZone } = timezoneForLocation(location.lat, location.long);
        const now = new Date();
        const rows = await getWeatherRange(
          locationId,
          new Date(now.getTime() - 72 * 3_600_000),
          new Date(now.getTime() + 11 * 24 * 3_600_000),
        );
        if (rows.length === 0)
          throw new DataGapError(locationId, "no usable weather rows in range");

        const forecastDays = computeForecastDays({
          location,
          population,
          rows,
          timeZone,
          now,
          days,
        });

        // Additive enrichment: precomputed engine days (HTSI/WBGT/HI/UTCI/WBT
        // peaks) from the `analysis` table, Redis-cached. Best-effort — the live
        // outlook above is always returned.
        let analysisDays: Array<Record<string, unknown>> = [];
        try {
          const from = istDateString(now);
          const to = addDays(from, days - 1);
          const aRows = await getAnalysisRange(locationId, from, to);
          analysisDays = aRows.map((r) => {
            const entries = r.analysis as unknown as AnalysisHourEntry[];
            return {
              forecastDate: toISODate(r.forecastDate),
              hours: entries.length,
              summary: summarizeDayAnalysis(entries),
            };
          });
        } catch {
          analysisDays = [];
        }

        return {
          locationId,
          timezone: timeZone,
          days: forecastDays,
          analysis: {
            source: "precomputed",
            days: analysisDays,
            prototypeNote:
              "HTSI is an upstream prototype (0–100); composite risk in `days` remains authoritative.",
          },
        };
      },
    );

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=120",
        "X-Cache": cached ? "HIT" : "MISS",
      },
    });
  } catch (err) {
    if (err instanceof LocationNotFoundError) {
      return NextResponse.json(
        { error: "Location not found", locationId },
        { status: 404 },
      );
    }
    if (err instanceof DataGapError) {
      return NextResponse.json(
        {
          error: "Insufficient data for forecast",
          locationId,
          detail: err.detail,
        },
        { status: 422 },
      );
    }
    console.error(`GET /api/forecast/${locationId} failed:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
