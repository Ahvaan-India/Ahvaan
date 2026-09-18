import { NextResponse } from "next/server";
import {
  getAnalysisCached,
  getLocationById,
} from "@/lib/db/queries";
import { LocationNotFoundError } from "@/lib/db/errors";
import {
  HTSI_PROTOTYPE_NOTE,
  istDateString,
  summarizeDayAnalysis,
  toISODate,
} from "@/lib/analysis";
import type { AnalysisHourEntry } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ locationId: string }>;
}

/**
 * GET /api/analysis/[locationId]?date=YYYY-MM-DD
 * Precomputed engine day from the `analysis` table (ahvaan-engine output),
 * served Website → Redis → Postgres. Defaults to today (Asia/Kolkata).
 *
 *  200 → { locationId, forecastDate, hours, summary, analysis }
 *  400 → invalid locationId / date
 *  404 → unknown location
 *  422 → no precomputed row for this date (engine hasn't run / data gap).
 *        Callers fall back to live /api/risk + /api/forecast.
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
  const date = url.searchParams.get("date") ?? istDateString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Invalid date: must be YYYY-MM-DD", date },
      { status: 400 },
    );
  }

  try {
    const location = await getLocationById(locationId);
    if (!location) throw new LocationNotFoundError(locationId);

    const { data: row, cached } = await getAnalysisCached(locationId, date);
    if (!row) {
      return NextResponse.json(
        {
          error: "No precomputed analysis for this date",
          locationId,
          forecastDate: date,
          hint: "Engine hasn't produced this day yet (run npm run analysis:update) or the weather window had no usable Ta/RH rows.",
        },
        {
          status: 422,
          headers: { "X-Cache": cached ? "HIT" : "MISS" },
        },
      );
    }

    const entries = row.analysis as unknown as AnalysisHourEntry[];
    return NextResponse.json(
      {
        locationId,
        forecastDate: toISODate(row.forecastDate),
        hours: entries.length,
        summary: summarizeDayAnalysis(entries),
        analysis: entries,
        prototypeNote: HTSI_PROTOTYPE_NOTE,
        computedAt: row.createdAt,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=600",
          "X-Cache": cached ? "HIT" : "MISS",
          "X-Analysis-Source": "precomputed",
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
    console.error(`GET /api/analysis/${locationId} failed:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
