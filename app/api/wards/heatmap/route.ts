import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { locationsTable, populationTable } from "@/lib/db/schema";
import { getLatestSnapshots } from "@/lib/db/queries";
import { displayCategory, riskStep } from "@/lib/console";
import { downsampleRing } from "@/lib/geo/rings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/wards/heatmap — choropleth payload: one entry per ward with its
 * latest snapshot risk + downsampled polygon ring. Geometry comes from
 * locations (wards map 1:1), scores from ward_snapshots.
 */
export async function GET() {
  try {
    const [latest, db] = [await getLatestSnapshots(), getDb()];
    if (latest.length === 0) {
      return NextResponse.json(
        { error: "No snapshots yet — run npm run snapshots first" },
        { status: 422 },
      );
    }
    const snapByLoc = new Map(latest.map((s) => [s.snapshot.locationId, s]));

    const locs = await db.select().from(locationsTable);
    const pops = await db.select().from(populationTable);
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
        population: p?.totalPopulation ?? null,
        ring: downsampleRing(l.geometry as unknown),
      };
    });

    const refreshedAt = latest
      .map((s) => s.snapshot.computedAt)
      .sort((a, b) => +new Date(b!) - +new Date(a!))[0];

    return NextResponse.json(
      { count: wards.length, refreshedAt, wards },
      {
        status: 200,
        headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=120" },
      },
    );
  } catch (err) {
    console.error("GET /api/wards/heatmap failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
