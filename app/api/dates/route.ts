import { NextResponse } from "next/server";
import { getDynamicForecastDates } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dates — dynamic forecast dates anchored to current date (Today)
 * followed by +5 days (total 6 dates).
 */
export async function GET() {
  try {
    const dynamicDates = getDynamicForecastDates(6);
    return NextResponse.json(
      { count: dynamicDates.length, dates: dynamicDates, analysisDates: dynamicDates },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
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
