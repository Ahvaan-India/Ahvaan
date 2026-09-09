import { NextResponse } from "next/server";
import {
  getLatestPopulation,
  getLocationById,
  getWeatherRange,
} from "@/lib/db/queries";
import { DataGapError, LocationNotFoundError } from "@/lib/db/errors";
import { computeForecastDays } from "@/lib/heatshield/forecast";
import { timezoneForLocation } from "@/lib/geo/timezone";

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
export async function GET(req: Request, { params }: RouteParams) {
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
  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get("days") ?? 5);
  const days = Number.isInteger(daysRaw)
    ? Math.max(1, Math.min(daysRaw, 10))
    : 5;

  try {
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

    return NextResponse.json(
      { locationId, timezone: timeZone, days: forecastDays },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=120",
        },
      },
    );
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
