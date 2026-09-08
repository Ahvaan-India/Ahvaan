import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { wardSnapshotsTable } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/wards/[wardId]/trend?days=7 — per-ward risk history + 24h hourly thermal.
 * History from snapshots (one point per batch), hourly from weather-derived thermal would be heavier,
 * so for now we return snapshot history; hourly can be added via weather range if needed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ wardId: string }> }) {
  const { wardId: raw } = await params;
  const wardId = Number(raw);
  if (!Number.isInteger(wardId) || wardId <= 0) {
    return NextResponse.json({ error: "Invalid wardId" }, { status: 400 });
  }
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 14), 1), 30);
  try {
    const db = getDb();
    const rows = await db
      .select({
        computedAt: wardSnapshotsTable.computedAt,
        risk: wardSnapshotsTable.risk,
        category: wardSnapshotsTable.category,
        thermal: wardSnapshotsTable.thermal,
        wbgt: wardSnapshotsTable.wbgt,
      })
      .from(wardSnapshotsTable)
      .where(eq(wardSnapshotsTable.locationId, wardId))
      .orderBy(wardSnapshotsTable.computedAt);

    // Keep last `days` distinct dates (if multiple batches per day, keep latest per day)
    const byDate = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const d = new Date(r.computedAt as unknown as string).toISOString().slice(0, 10);
      byDate.set(d, r); // last per day wins (ascending order)
    }
    const history = [...byDate.values()].slice(-days).map((r) => ({
      date: new Date(r.computedAt as unknown as string).toISOString().slice(0, 10),
      risk: r.risk,
      category: r.category,
      thermal: r.thermal,
      wbgt: r.wbgt,
      computedAt: r.computedAt,
    }));

    return NextResponse.json({ wardId, history }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120" } });
  } catch (err) {
    console.error(`GET /api/wards/${wardId}/trend failed:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
