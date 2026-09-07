import { NextResponse } from "next/server";
import { getActiveAlerts } from "@/lib/db/queries";
import { displayCategory } from "@/lib/console";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/alerts/active — live alert cards, highest risk first.
 * Sourced from the alerts table (synced by scripts/refresh.ts from the
 * latest snapshots), joined with ward names + centroids for the UI.
 */
export async function GET() {
  try {
    const rows = await getActiveAlerts();
    return NextResponse.json(
      {
        count: rows.length,
        alerts: rows.map((r) => ({
          id: r.alert.id,
          wardId: r.alert.wardId,
          ward: r.ward,
          wardName: r.wardName,
          lat: r.lat,
          long: r.long,
          severity: r.alert.severity,
          displaySeverity:
            r.alert.severity === "EXTREME" ? "Extreme" : displayCategory("HIGH"),
          riskScore: r.alert.riskScore,
          peakWindowStart: r.alert.peakWindowStart,
          peakWindowEnd: r.alert.peakWindowEnd,
          advisoryText: r.alert.advisoryText,
          triggeredAt: r.alert.triggeredAt,
          status: r.alert.status,
        })),
      },
      {
        status: 200,
        headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60" },
      },
    );
  } catch (err) {
    console.error("GET /api/alerts/active failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
