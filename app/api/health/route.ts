import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { redisStatus } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health  dependency + cache visibility.
 * - postgres: simple SELECT 1 round-trip latency.
 * - redis: configured? reachable? round-trip latency? If Redis is down or
 *   REDIS_URL is unset, every read transparently falls back to Postgres +
 *   in-memory cache (slower, but working) — this endpoint tells you which
 *   mode you're in.
 */
export async function GET() {
  let postgres: { ok: boolean; latencyMs: number | null } = {
    ok: false,
    latencyMs: null,
  };
  try {
    const t0 = Date.now();
    await getDb().execute(sql`SELECT 1`);
    postgres = { ok: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    console.error("health: postgres probe failed:", e);
  }
  const redis = await redisStatus();
  return NextResponse.json(
    { postgres, redis, at: new Date().toISOString() },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
