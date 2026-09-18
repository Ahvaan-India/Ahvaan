import { NextResponse } from "next/server";
import { getAnalysisRange } from "@/lib/db/queries";
import {
  addDays,
  istDateString,
  summarizeDayAnalysis,
  toISODate,
} from "@/lib/analysis";
import type { AnalysisHourEntry } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/analysis?locationIds=1,2,3&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Multi-ward precomputed engine window (Website → Redis → Postgres).
 * `from` defaults to today (Asia/Kolkata), `to` defaults to from+5.
 * Days the engine hasn't produced are listed in `missing`, never faked.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsRaw = url.searchParams.get("locationIds");
  const singleRaw = url.searchParams.get("locationId");

  let locationIds: number[] = [];
  if (idsRaw) {
    locationIds = idsRaw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  } else if (singleRaw) {
    const n = Number(singleRaw);
    if (Number.isInteger(n) && n > 0) locationIds = [n];
  }
  if (locationIds.length === 0) {
    return NextResponse.json(
      { error: "Provide ?locationIds=1,2,3 (or ?locationId=1)" },
      { status: 400 },
    );
  }
  if (locationIds.length > 20) {
    return NextResponse.json(
      { error: "Too many locationIds (max 20 per request)" },
      { status: 400 },
    );
  }

  const from = url.searchParams.get("from") ?? istDateString();
  const to = url.searchParams.get("to") ?? addDays(from, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json(
      { error: "Invalid from/to: must be YYYY-MM-DD" },
      { status: 400 },
    );
  }
  if (from > to) {
    return NextResponse.json(
      { error: "Invalid range: to must be >= from" },
      { status: 400 },
    );
  }
  // Cap window width so one request can't fan out over months.
  if (addDays(from, 10) < to) {
    return NextResponse.json(
      { error: "Range too wide (max 10 days)" },
      { status: 400 },
    );
  }

  try {
    const data: Array<{
      locationId: number;
      forecastDate: string;
      hours: number;
      summary: ReturnType<typeof summarizeDayAnalysis>;
    }> = [];
    const missing: Array<{ locationId: number; forecastDate: string }> = [];

    for (const locationId of locationIds) {
      const rows = await getAnalysisRange(locationId, from, to);
      const byDate = new Map(rows.map((r) => [toISODate(r.forecastDate), r]));
      let d = from;
      while (d <= to) {
        const row = byDate.get(d);
        if (!row) {
          missing.push({ locationId, forecastDate: d });
        } else {
          const entries = row.analysis as unknown as AnalysisHourEntry[];
          data.push({
            locationId,
            forecastDate: toISODate(row.forecastDate),
            hours: entries.length,
            summary: summarizeDayAnalysis(entries),
          });
        }
        d = addDays(d, 1);
      }
    }

    return NextResponse.json(
      { from, to, data, missing },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    console.error("GET /api/analysis failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
