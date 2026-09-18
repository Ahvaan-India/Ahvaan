import { NextResponse } from "next/server";
import { getBoard } from "@/lib/board";
import { REDIS_TTL, withRedisCache } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/wards/[wardId]/trend?days=7  per-ward risk history (from the
 * shared city board — no snapshots table). One point per available IST
 * date (weather window permitting), oldest→newest, same shape as before.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ wardId: string }> },
) {
  const { wardId: raw } = await params;
  const wardId = Number(raw);
  if (!Number.isInteger(wardId) || wardId <= 0) {
    return NextResponse.json({ error: "Invalid wardId" }, { status: 400 });
  }
  const url = new URL(req.url);
  const days = Math.min(
    Math.max(Number(url.searchParams.get("days") ?? 14), 1),
    30,
  );
  try {
    const { data: history, cached } = await withRedisCache(
      `ahvaan:ward-trend:${wardId}:${days}`,
      REDIS_TTL.trend,
      async () => {
        const { data: board } = await getBoard(days);
        const ward = board.wards.find((w) => w.locationId === wardId);
        if (!ward) return null;
        return ward.days.slice(-days).map((d) => ({
          date: d.date,
          risk: d.risk,
          category: d.category,
          thermal: d.thermal,
          wbgt: d.wbgt,
          computedAt: board.computedAt,
        }));
      },
    );
    if (!history) {
      return NextResponse.json(
        { error: "Ward not found", wardId },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { wardId, history },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120",
          "X-Cache": cached ? "HIT" : "MISS",
        },
      },
    );
  } catch (err) {
    console.error(`GET /api/wards/${wardId}/trend failed:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
