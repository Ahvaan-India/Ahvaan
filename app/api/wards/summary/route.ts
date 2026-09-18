import { NextResponse } from "next/server";
import { getBoard } from "@/lib/board";
import { watchLevel } from "@/lib/console";
import { REDIS_TTL, redisKeys, withRedisCache } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/wards/summary  KPI row + watch level from the shared city board
 * (lib/board — no snapshots table). Deltas compare the latest board day
 * against the previous board day (null when fewer than 2 days compute).
 * Website → Redis (60s) → Postgres (via the board).
 */
export async function GET() {
  try {
    const { data: payload, cached: cacheHit } = await withRedisCache(
      redisKeys.summary,
      REDIS_TTL.summary,
      async () => {
        const { data: board } = await getBoard(2);
        const ok = board.wards.filter((w) => w.latest !== null);
        if (ok.length === 0) return null;

        const count = (pred: (w: (typeof ok)[number]) => boolean) =>
          ok.filter(pred).length;
        const active = count((w) => w.latest!.compositeRisk.value >= 0.5);
        const extreme = count((w) => w.latest!.compositeRisk.category === "VERY_HIGH");
        const high = count((w) => w.latest!.compositeRisk.category === "HIGH");
        const moderate = count((w) => w.latest!.compositeRisk.category === "MODERATE");
        const low = count((w) => w.latest!.compositeRisk.category === "LOW");
        const meanRisk =
          ok.reduce((a, w) => a + w.latest!.compositeRisk.value, 0) / ok.length;
        const watch = watchLevel(meanRisk);

        // Day-over-day deltas from board history (previous computable day).
        let deltas: Record<string, number | null> = {
          active: null,
          extreme: null,
          high: null,
          moderate: null,
        };
        let deltaBasis: string | null = null;
        const prevDate = board.dates.length >= 2 ? board.dates[board.dates.length - 2] : null;
        if (prevDate) {
          const c = (pred: (d: { risk: number; category: string }) => boolean) =>
            board.wards.flatMap((w) => w.days.filter((d) => d.date === prevDate)).filter(pred)
              .length;
          deltas = {
            active: active - c((d) => d.risk >= 0.5),
            extreme: extreme - c((d) => d.category === "VERY_HIGH"),
            high: high - c((d) => d.category === "HIGH"),
            moderate: moderate - c((d) => d.category === "MODERATE"),
          };
          deltaBasis = "1d";
        }

        return {
          wards: ok.length,
          synced: ok.length,
          total: board.wards.length,
          active,
          extreme,
          high,
          moderate,
          low,
          deltas,
          metroHeatLoad: Math.min(100, Math.round(meanRisk > 1 ? (meanRisk > 100 ? meanRisk / 10 : meanRisk) : meanRisk * 100)),
          watch,
          refreshedAt: board.computedAt,
          deltaBasis,
        };
      },
    );

    if (!payload) {
      return NextResponse.json(
        { error: "No computable wards in the current window" },
        { status: 422 },
      );
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        "X-Cache": cacheHit ? "HIT" : "MISS",
      },
    });
  } catch (err) {
    console.error("GET /api/wards/summary failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
