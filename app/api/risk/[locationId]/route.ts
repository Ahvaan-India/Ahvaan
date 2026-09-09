import { NextResponse } from "next/server";
import {
  getLatestPopulation,
  getLocationById,
  getWeatherWindow,
} from "@/lib/db/queries";
import { DataGapError, LocationNotFoundError } from "@/lib/db/errors";
import { buildRiskResponse } from "@/lib/heatshield/service";
import { WEATHER_WINDOW_HOURS } from "@/lib/heatshield/config";

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
export async function GET(_req: Request, { params }: RouteParams) {
  const { locationId: raw } = await params;
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

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
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
