import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { locationsTable, populationTable } from "@/lib/db/schema";
import { getLatestSnapshots } from "@/lib/db/queries";
import { displayCategory, riskStep } from "@/lib/console";
import { downsampleRing } from "@/lib/geo/rings";
import { cached } from "@/lib/cache";

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
 * latest snapshot risk + downsampled polygon ring. Geometry comes from
 * locations (wards map 1:1), scores from ward_snapshots.
 * Cached 30s server-side + 10min CDN to make map loads instantaneous on repeat.
 */
export async function GET() {
  try {
    const payload = await cached("heatmap:v3", 30_000, async () => {
      const [latest, locs, pops] = await Promise.all([
        getLatestSnapshots(),
        getDb().select().from(locationsTable),
        getDb().select().from(populationTable),
      ]);
      if (latest.length === 0) return null;
      const snapByLoc = new Map(latest.map((s) => [s.snapshot.locationId, s]));
      const popByLoc = new Map(pops.map((p) => [p.locationId, p]));
      const wards = locs.map((l) => {
        const s = snapByLoc.get(l.id);
        const p = popByLoc.get(l.id);
        return {
          wardId: l.id,
          ward: p?.ward ?? null,
          wardName: p?.wardName ?? null,
          lat: l.lat,
          long: l.long,
          riskScore: s?.snapshot.risk ?? null,
          category: s?.snapshot.category ?? null,
          displayCategory: s ? displayCategory(s.snapshot.category) : null,
          step: s ? riskStep(s.snapshot.risk) : null,
          wbgt: s?.snapshot.wbgt ?? null,
          heatIndex:
            (s?.snapshot as unknown as { heatIndex?: number | null })
              ?.heatIndex ?? null,
          utci:
            (s?.snapshot as unknown as { utci?: number | null })?.utci ?? null,
          population: p?.totalPopulation ?? null,
          // Extra fields for richer analytics (no extra DB hit)
          thermal: s?.snapshot.thermal ?? null,
          exposure: s?.snapshot.exposure ?? null,
          vulnerability: s?.snapshot.vulnerability ?? null,
          ring: cachedRing(l.id, l.geometry as unknown),
        };
      });
      const refreshedAt = latest
        .map((s) => s.snapshot.computedAt)
        .sort((a, b) => +new Date(b!) - +new Date(a!))[0];
      return { count: wards.length, refreshedAt, wards };
    });

    if (!payload) {
      return NextResponse.json(
        { error: "No snapshots yet  run npm run snapshots first" },
        { status: 422 },
      );
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    console.error("GET /api/wards/heatmap failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
