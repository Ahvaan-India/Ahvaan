import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { locationsTable } from "@/lib/db/schema";
import { getLatestSnapshots, getSnapshotsBefore } from "@/lib/db/queries";
import { watchLevel } from "@/lib/console";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/wards/summary — KPI row + watch level from the latest snapshot
 * set. Deltas compare against the snapshot set as of 24h ago (null when no
 * history exists yet, e.g. right after the first refresh run).
 */
export async function GET() {
  try {
    const latest = await getLatestSnapshots();
    if (latest.length === 0) {
      return NextResponse.json(
        { error: "No snapshots yet — run npm run snapshots first" },
        { status: 422 },
      );
    }

    const count = (pred: (s: (typeof latest)[number]) => boolean) =>
      latest.filter(pred).length;
    const active = count((s) => s.snapshot.risk >= 0.5);
    const extreme = count((s) => s.snapshot.category === "VERY_HIGH");
    const high = count((s) => s.snapshot.category === "HIGH");
    const moderate = count((s) => s.snapshot.category === "MODERATE");
    const meanRisk =
      latest.reduce((a, s) => a + s.snapshot.risk, 0) / latest.length;
    const watch = watchLevel(meanRisk);
    const refreshedAt = latest
      .map((s) => s.snapshot.computedAt)
      .sort((a, b) => +new Date(b!) - +new Date(+a!))[0];

    let deltas: Record<string, number | null> = {
      active: null,
      extreme: null,
      high: null,
      moderate: null,
    };
    // Deltas compare against the previous snapshot batch, however old it is —
    // the basis label reports the real span (e.g. "/ 3h"), so "—" only shows
    // when there is genuinely no prior batch yet (first refresh ever).
    let deltaBasis: string | null = null;
    try {
      const before = await getSnapshotsBefore(
        new Date(Date.now() - 24 * 3_600_000),
      );
      if (before.length > 0) {
        const prevAt = Math.max(
          ...before.map((b) => +new Date(b.snapshot.computedAt!)),
        );
        const spanH = Math.max(0, (+new Date(refreshedAt!) - prevAt) / 3_600_000);
        deltaBasis = spanH >= 23 ? "24h" : spanH >= 1 ? `${Math.round(spanH)}h` : "<1h";
        const c = (pred: (r: number, cat: string) => boolean) =>
          before.filter((b) => pred(b.snapshot.risk, b.snapshot.category)).length;
        deltas = {
          active: active - c((r) => r >= 0.5),
          extreme: extreme - c((_, cat) => cat === "VERY_HIGH"),
          high: high - c((_, cat) => cat === "HIGH"),
          moderate: moderate - c((_, cat) => cat === "MODERATE"),
        };
      }
    } catch {
      // deltas stay null — KPI counts are still valid
    }

    return NextResponse.json(
      {
        wards: latest.length,
        // Sync coverage: wards present in the latest snapshot set vs total
        // locations. A ward missing here has no fresh rollup (refresh failed
        // or never covered it) — the heatmap shows those as no-data grey.
        synced: latest.length,
        total: await totalLocations(),
        active,
        extreme,
        high,
        moderate,
        deltas,
        metroHeatLoad: Math.round(meanRisk * 100),
        watch,
        refreshedAt,
        deltaBasis,
      },
      {
        status: 200,
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
      },
    );
  } catch (err) {
    console.error("GET /api/wards/summary failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function totalLocations(): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(locationsTable);
  return rows[0]?.count ?? 0;
}
