import { NextResponse } from "next/server";
import { getBoard } from "@/lib/board";
import { REDIS_TTL, withRedisCache } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/wards/trend?days=7  city-wide daily mean risk (from the shared
 * city board — no snapshots table). Returns up to `days` most recent
 * dates, oldest→newest.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(
    Math.max(Number(url.searchParams.get("days") ?? 7), 1),
    30,
  );
  try {
    const { data: sorted, cached } = await withRedisCache(
      `ahvaan:trend:${days}`,
      REDIS_TTL.trend,
      async () => {
        const { data: board } = await getBoard(days);
        return board.dates.slice(-days).map((date) => {
          const pts = board.wards.flatMap((w) =>
            w.days.filter((d) => d.date === date),
          );
          const avgRisk =
            pts.length > 0
              ? pts.reduce((a, d) => a + d.risk, 0) / pts.length
              : 0;
          return { date, avgRisk, count: pts.length };
        });
      },
    );
    return NextResponse.json(
      { days: sorted },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120",
          "X-Cache": cached ? "HIT" : "MISS",
        },
      },
    );
  } catch (err) {
    console.error("GET /api/wards/trend failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
