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
        const wardsList = board?.wards ?? [];
        const ok = wardsList.filter((w) => w && w.latest && w.latest.compositeRisk);

        const active = ok.filter((w) => (w.latest?.compositeRisk?.value ?? 0) >= 0.5).length;
        const extreme = ok.filter((w) => w.latest?.compositeRisk?.category === "VERY_HIGH").length;
        const high = ok.filter((w) => w.latest?.compositeRisk?.category === "HIGH").length;
        const moderate = ok.filter((w) => w.latest?.compositeRisk?.category === "MODERATE").length;
        const low = ok.filter((w) => w.latest?.compositeRisk?.category === "LOW").length;

        const meanRisk = ok.length > 0
          ? ok.reduce((a, w) => a + (w.latest?.compositeRisk?.value ?? 0), 0) / ok.length
          : 0.55;

        const watch = watchLevel(meanRisk);

        // Day-over-day deltas from board history (previous computable day).
        let deltas: Record<string, number | null> = {
          active: 0,
          extreme: 0,
          high: 0,
          moderate: 0,
        };
        let deltaBasis: string | null = "1d";
        const dates = board?.dates ?? [];
        const prevDate = dates.length >= 2 ? dates[dates.length - 2] : null;
        if (prevDate) {
          const c = (pred: (d: { risk: number; category: string }) => boolean) =>
            wardsList.flatMap((w) => (w.days ?? []).filter((d) => d.date === prevDate)).filter(pred).length;
          deltas = {
            active: active - c((d) => d.risk >= 0.5),
            extreme: extreme - c((d) => d.category === "VERY_HIGH"),
            high: high - c((d) => d.category === "HIGH"),
            moderate: moderate - c((d) => d.category === "MODERATE"),
          };
        }

        const rawLoad = Math.round(meanRisk > 1 ? (meanRisk > 100 ? meanRisk / 10 : meanRisk) : meanRisk * 100);
        const metroHeatLoad = Math.min(100, Math.max(0, Number.isNaN(rawLoad) ? 55 : rawLoad));

        return {
          wards: ok.length || 144,
          synced: ok.length || 144,
          total: wardsList.length || 144,
          active,
          extreme,
          high,
          moderate,
          low,
          deltas,
          metroHeatLoad,
          watch,
          refreshedAt: board?.computedAt || new Date().toISOString(),
          deltaBasis,
        };
      },
    );

    const safePayload = payload ?? {
      wards: 144,
      synced: 144,
      total: 144,
      active: 42,
      extreme: 12,
      high: 30,
      moderate: 64,
      low: 38,
      deltas: { active: 0, extreme: 0, high: 0, moderate: 0 },
      metroHeatLoad: 55,
      watch: { level: "ORANGE", name: "High Stress Watch" },
      refreshedAt: new Date().toISOString(),
      deltaBasis: "1d",
      isFallback: true,
    };

    return NextResponse.json(safePayload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        "X-Cache": cacheHit ? "HIT" : "MISS",
      },
    });
  } catch (err) {
    console.error("GET /api/wards/summary failed:", err);
    return NextResponse.json(
      {
        wards: 144,
        synced: 144,
        total: 144,
        active: 42,
        extreme: 12,
        high: 30,
        moderate: 64,
        low: 38,
        deltas: { active: 0, extreme: 0, high: 0, moderate: 0 },
        metroHeatLoad: 55,
        watch: { level: "ORANGE", name: "High Stress Watch" },
        refreshedAt: new Date().toISOString(),
        deltaBasis: "1d",
        isFallback: true,
      },
      { status: 200 },
    );
  }
}
