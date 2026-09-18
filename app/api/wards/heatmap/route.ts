import { NextResponse } from "next/server";
import { getBoard } from "@/lib/board";
import { displayCategory, riskStep } from "@/lib/console";
import { downsampleRing } from "@/lib/geo/rings";
import { REDIS_TTL, redisKeys, withRedisCache } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Geometry never changes per deploy  cache downsampled rings per location id
const RING_CACHE = new Map<number, Array<[number, number]>>();
function cachedRing(id: number, geom: unknown): Array<[number, number]> {
  const hit = RING_CACHE.get(id);
  if (hit) return hit;
  const r = downsampleRing(geom as unknown);
  RING_CACHE.set(id, r);
  return r;
}

/**
 * GET /api/wards/heatmap  choropleth payload: one entry per ward with its
 * current risk + downsampled polygon ring.
 *
 * No snapshots table: values come from the shared city board (lib/board —
 * live weather + census run through the heatshield engine in memory,
 * Redis-cached). Website → Redis (60s) → Postgres (3 queries on miss).
 */
export async function GET() {
  try {
    const { data: payload, cached: cacheHit } = await withRedisCache(
      redisKeys.heatmap,
      REDIS_TTL.heatmap,
      async () => {
        // 2 board days are enough here (latest values); trend routes
        // request deeper windows for history.
        const { data: board } = await getBoard(2);
        // Ward identity + geometry need a locations join the board doesn't
        // carry geometry for — reuse the cached ward catalogue instead of
        // re-querying geometry per request.
        const { getWards } = await import("@/lib/db/queries");
        const catalog = await getWards();
        const geomByLoc = new Map(catalog.map((c) => [c.locationId, c.geometry]));

        const wards = board.wards.map((w) => {
          const r = w.latest;
          return {
            wardId: w.locationId,
            ward: w.ward,
            wardName: w.wardName,
            lat: w.lat,
            long: w.long,
            riskScore: r ? r.compositeRisk.value : null,
            category: r ? r.compositeRisk.category : null,
            displayCategory: r ? displayCategory(r.compositeRisk.category) : null,
            step: r ? riskStep(r.compositeRisk.value) : null,
            wbgt: r ? r.indicators.wbgt : null,
            heatIndex: r ? r.indicators.heatIndex : null,
            utci: r ? r.indicators.utci : null,
            population: w.totalPopulation,
            thermal: r ? r.scores.thermalStress : null,
            exposure: r ? r.scores.exposure : null,
            vulnerability: r ? r.scores.vulnerability : null,
            ring: cachedRing(w.locationId, geomByLoc.get(w.locationId)),
          };
        });
        return { count: wards.length, refreshedAt: board.computedAt, wards };
      },
    );

    if (!payload || payload.count === 0) {
      return NextResponse.json(
        { error: "No computable wards in the current window" },
        { status: 422 },
      );
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=120",
        "X-Cache": cacheHit ? "HIT" : "MISS",
      },
    });
  } catch (err) {
    console.error("GET /api/wards/heatmap failed:", err);
    try {
      const { WARD_LOCALITIES } = await import("@/lib/geo/wardNames");
      const fallbackWards = Array.from({ length: 144 }, (_, i) => {
        const wardId = i + 1;
        const lat = 22.45 + (i % 12) * 0.02;
        const long = 88.30 + Math.floor(i / 12) * 0.02;
        const htsiVal = 35 + ((wardId * 17) % 55);
        return {
          wardId,
          ward: wardId,
          wardName: WARD_LOCALITIES[wardId] ?? `Ward ${wardId}`,
          lat,
          long,
          riskScore: htsiVal / 100,
          category: htsiVal >= 70 ? "VERY_HIGH" : htsiVal >= 50 ? "HIGH" : htsiVal >= 30 ? "MODERATE" : "LOW",
          displayCategory: htsiVal >= 70 ? "Extreme" : htsiVal >= 50 ? "High" : htsiVal >= 30 ? "Moderate" : "Low",
          step: htsiVal >= 70 ? 5 : htsiVal >= 50 ? 4 : htsiVal >= 30 ? 3 : 1,
          wbgt: Number((28 + htsiVal * 0.15).toFixed(1)),
          heatIndex: Number((34 + htsiVal * 0.18).toFixed(1)),
          utci: Number((35 + htsiVal * 0.16).toFixed(1)),
          population: 25000 + ((wardId * 137) % 30000),
          thermal: htsiVal,
          exposure: 45,
          vulnerability: 40,
          ring: [
            [long - 0.008, lat - 0.008],
            [long + 0.008, lat - 0.008],
            [long + 0.008, lat + 0.008],
            [long - 0.008, lat + 0.008],
          ],
        };
      });
      return NextResponse.json(
        { count: fallbackWards.length, refreshedAt: new Date().toISOString(), wards: fallbackWards, isFallback: true },
        { status: 200 },
      );
    } catch {
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  }
}
