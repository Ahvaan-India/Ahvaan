import { NextResponse } from "next/server";
import {
  getAnalysis,
  getLatestPopulation,
  getLocationById,
  getWeatherWindow,
} from "@/lib/db/queries";
import { DataGapError, LocationNotFoundError } from "@/lib/db/errors";
import { buildRiskResponse } from "@/lib/heatshield/service";
import { WEATHER_WINDOW_HOURS } from "@/lib/heatshield/config";
import { istDateString, summarizeDayAnalysis, toISODate } from "@/lib/analysis";
import type { AnalysisHourEntry } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ locationId: string }>;
}

/**
 * GET /api/risk/[locationId]
 * Per-location detail endpoint  stays fresh (no-store).
 *  200 → RiskResponse
 *  400 → invalid locationId
 *  404 → unknown location
 *  422 → DataGapError (insufficient data, explicit  never silent garbage)
 *  500 → unexpected
 */
export async function GET(_req: Request, { params }: { params: any }) {
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

  try {
    const location = await getLocationById(locationId);
    if (!location) throw new LocationNotFoundError(locationId);

    const [weatherRows, population] = await Promise.all([
      getWeatherWindow(locationId, WEATHER_WINDOW_HOURS),
      getLatestPopulation(locationId),
    ]);

    const payload = buildRiskResponse({ location, weatherRows, population });

    // Additive enrichment from the precomputed `analysis` table (ahvaan-engine
    // output, Redis-cached). Never blocks the live risk response: on miss the
    // endpoint behaves exactly as before.
    let engine: Record<string, unknown> | null = null;
    let analysisHit = false;
    try {
      const today = istDateString();
      const row = await getAnalysis(locationId, today);
      if (row) {
        analysisHit = true;
        const entries = row.analysis as unknown as AnalysisHourEntry[];
        engine = {
          source: "precomputed",
          forecastDate: toISODate(row.forecastDate),
          hours: entries.length,
          summary: summarizeDayAnalysis(entries),
        };
      }
    } catch {
      // enrichment is best-effort; live score above is authoritative
    }

    return NextResponse.json({ ...payload, engine }, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Analysis": analysisHit ? "HIT" : "MISS",
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
          error: "Insufficient data to compute risk",
          locationId,
          detail: err.detail,
          hint: "Location exists but has no usable weather/population rows in the lookback window.",
        },
        { status: 422 },
      );
    }
    console.error(`GET /api/risk/${locationId} failed:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
