import { NextResponse } from "next/server";
import { getAnalysisDates, getForecastDates } from "@/lib/db/queries";
import { REDIS_TTL, redisKeys, withMemoryCache } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dates — forecast dates + analysis dates present in Postgres
 * (YYYY-MM-DD ascending). Analysis lags forecast (backend backfills), so
 * index layers must default to the latest *analysis* date. Tiny live
 * queries, memory-cached (Redis is analysis-payloads only).
 */
export async function GET() {
  try {
    // Memory only — Redis is reserved for backend analysis payloads.
    const [{ data: dates }, { data: analysisDates }] = await Promise.all([
      withMemoryCache(redisKeys.memDates, REDIS_TTL.memDates, () =>
        getForecastDates(),
      ),
      withMemoryCache(
        redisKeys.memDates + ":analysis",
        REDIS_TTL.memDates,
        () => getAnalysisDates(),
      ),
    ]);
    return NextResponse.json(
      { count: dates.length, dates, analysisDates },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=120",
        },
      },
    );
  } catch (err) {
    console.error("GET /api/dates failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
