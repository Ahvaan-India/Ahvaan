import { NextResponse } from "next/server";
import {
  getLatestPopulation,
  getLocationById,
  getLocationsInBounds,
  getWeatherWindow,
  parseBBox,
} from "@/lib/db/queries";
import { DataGapError } from "@/lib/db/errors";
import { buildRiskResponse } from "@/lib/heatshield/service";
import type { RiskResponse } from "@/lib/heatshield/types";
import { WEATHER_WINDOW_HOURS } from "@/lib/heatshield/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/risk?bbox=minLong,minLat,maxLong,maxLat
 * Multi-location map/dashboard endpoint. Returns an array of the same
 * per-location RiskResponse payload (locations with data gaps are skipped
 * and reported in `errors` via the envelope below — the primary `data`
 * array keeps the exact contract the frontend consumes).
 *
 * Short edge cache (s-maxage=300) since weather doesn't change
 * second-to-second. Use ?bbox=… (GeoJSON order). Also supports
 * ?locationIds=1,2,3 as an alternative selector.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const bboxRaw = url.searchParams.get("bbox");
  const idsRaw = url.searchParams.get("locationIds");

  try {
    if (!bboxRaw && !idsRaw) {
      return NextResponse.json(
        {
          error:
            "Provide ?bbox=minLong,minLat,maxLong,maxLat or ?locationIds=1,2,3",
        },
        { status: 400 },
      );
    }

    let locationIds: number[] | null = null;

    if (idsRaw) {
      locationIds = idsRaw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (locationIds.length === 0) {
        return NextResponse.json(
          { error: "Invalid locationIds: must be comma-separated positive integers" },
          { status: 400 },
        );
      }
      // Cap fan-out so one dashboard request can't blow the function timeout.
      if (locationIds.length > 50) {
        return NextResponse.json(
          { error: "Too many locationIds (max 50 per request)" },
          { status: 400 },
        );
      }
    }

    const locations = locationIds
      ? (
          await Promise.all(locationIds.map((id) => getLocationById(id)))
        ).filter((l) => l !== null)
      : await getLocationsInBounds(parseBBox(bboxRaw)!);

    const data: RiskResponse[] = [];
    const errors: Array<{ locationId: number; error: string }> = [];

    // Sequential per-location fetch keeps pooled-connection pressure low and
    // stays within the serverless timeout; the (locationId, timestamp) index
    // on weather keeps each window query fast. For >20 locations consider a
    // single batched query + pagination.
    for (const loc of locations) {
      try {
        const [weatherRows, population] = await Promise.all([
          getWeatherWindow(loc.id, WEATHER_WINDOW_HOURS),
          getLatestPopulation(loc.id),
        ]);
        data.push(buildRiskResponse({ location: loc, weatherRows, population }));
      } catch (err) {
        if (err instanceof DataGapError) {
          errors.push({ locationId: loc.id, error: err.detail });
          continue;
        }
        throw err;
      }
    }

    return NextResponse.json(
      { data, errors },
      {
        status: 200,
        headers: {
          // Dashboard tiles can be 5-min stale; browsers always revalidate.
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Invalid bbox")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("GET /api/risk failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
