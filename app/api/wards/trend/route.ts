import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { wardSnapshotsTable } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/wards/trend?days=7  city-wide daily mean risk (from snapshots).
 * Groups snapshots by local date (Asia/Kolkata) and averages risk.
 * Returns up to `days` most recent dates, oldest→newest.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(
    Math.max(Number(url.searchParams.get("days") ?? 7), 1),
    30,
  );
  try {
    const db = getDb();
    // Use DB date truncation in IST: convert computedAt to Asia/Kolkata date
    const rows = await db.execute<{
      date: string;
      avgRisk: number;
      count: number;
    }>(
      sql`
      SELECT
        (("computedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date)::text AS date,
        AVG(risk)::float AS "avgRisk",
        COUNT(*)::int AS count
      FROM ${wardSnapshotsTable}
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT ${sql.raw(String(days))}
    ` as unknown as string,
    );

    // drizzle execute returns { rows } shape depending on driver; handle both
    const raw: Array<{ date: string; avgRisk: number; count: number }> =
      (rows as unknown as { rows?: typeof rows })?.rows ??
      (rows as unknown as Array<{
        date: string;
        avgRisk: number;
        count: number;
      }>);
    const sorted = [...(Array.isArray(raw) ? raw : [])].sort((a, b) =>
      a.date < b.date ? -1 : 1,
    );
    return NextResponse.json(
      { days: sorted },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120",
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
