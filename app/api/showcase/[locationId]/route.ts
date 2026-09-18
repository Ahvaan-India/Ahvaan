import { NextResponse } from "next/server";
import {
  getAnalysisRange,
  getLatestPopulation,
  getLocationById,
} from "@/lib/db/queries";
import { LocationNotFoundError } from "@/lib/db/errors";
import {
  addDays,
  currentIstHourLabel,
  istDateString,
  storedHtsi,
  summarizeDayAnalysis,
  toISODate,
  HTSI_PROTOTYPE_NOTE,
} from "@/lib/analysis";
import { REDIS_TTL, redisKeys, withRedisCache } from "@/lib/redis";
import type { AnalysisHourEntry } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ locationId: string }>;
}

/**
 * GET /api/showcase/[locationId]
 * The analysis-table output showcase: ward identity + the full precomputed
 * engine window (today → +5 IST) with per-day summaries, hourly HTSI/WBGT/
 * HI/UTCI/WBT series, and a `current`-hour pointer.
 *
 * Website → Redis → Postgres. 404 unknown location, 422 when the engine has
 * produced no days in the window yet (run npm run analysis:update).
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { locationId: raw } = await params;
  const locationId = Number(raw);
  if (!Number.isInteger(locationId) || locationId <= 0) {
    return NextResponse.json(
      {
        error: "Invalid locationId: must be a positive integer",
        locationId: raw,
      },
      { status: 400 },
    );
  }

  try {
    const { data: payload, cached } = await withRedisCache(
      redisKeys.showcase(locationId),
      REDIS_TTL.analysisDay,
      async () => {
        const location = await getLocationById(locationId, undefined, {
          skipCache: true,
        });
        if (!location) throw new LocationNotFoundError(locationId);
        const population = await getLatestPopulation(locationId);

        const from = istDateString();
        const to = addDays(from, 5);
        const rows = await getAnalysisRange(locationId, from, to, undefined, {
          skipCache: true,
        });
        if (rows.length === 0) return null;

        const days = rows.map((r) => {
          const entries = r.analysis as unknown as AnalysisHourEntry[];
          return {
            forecastDate: toISODate(r.forecastDate),
            hours: entries.length,
            summary: summarizeDayAnalysis(entries),
            hourly: entries.map((e) => {
              const input = (e.input ?? {}) as Record<string, unknown>;
              const num = (v: unknown): number | null =>
                typeof v === "number" && Number.isFinite(v) ? v : null;
              return {
                hour: e.hour,
                htsi: storedHtsi(e),
                wbgt: e.analysis.WBGT,
                hi: e.analysis.HI,
                utci: e.analysis.UTCI,
                wbt: e.analysis.WBT,
                // Observed/model weather: snapshots of the weather row the
                // engine analysed (lets the UI show temp/RH/wind per hour).
                temp: num(input.temperature2m),
                humidity: num(input.relativeHumidity2m),
                wind: num(input.windSpeed10m),
                solar: num(input.shortwaveRadiation),
              };
            }),
          };
        });

        // Current-hour pointer: latest entry at/before now IST on today's
        // row (falls back to the row's last entry past midnight edge cases).
        let current: Record<string, unknown> | null = null;
        const today = days.find((d) => d.forecastDate === from);
        if (today && today.hourly.length > 0) {
          const now = currentIstHourLabel();
          const past = today.hourly.filter((h) => h.hour <= now);
          const pick = past[past.length - 1] ?? today.hourly[today.hourly.length - 1];
          current = { forecastDate: from, ...pick };
        }

        return {
          locationId,
          ward: location.ward,
          wardName: population?.wardName ?? null,
          district: location.district,
          lat: location.lat,
          long: location.long,
          timezone: "Asia/Kolkata",
          source: "precomputed" as const,
          from,
          to,
          days,
          current,
          prototypeNote: HTSI_PROTOTYPE_NOTE,
        };
      },
    );

    if (!payload) {
      return NextResponse.json(
        {
          error: "No precomputed analysis in the current window",
          locationId,
          hint: "Run npm run analysis:update (engine sweep) to fill the analysis table.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
        "X-Cache": cached ? "HIT" : "MISS",
        "X-Analysis-Source": "precomputed",
      },
    });
  } catch (err) {
    if (err instanceof LocationNotFoundError) {
      return NextResponse.json(
        { error: "Location not found", locationId },
        { status: 404 },
      );
    }
    console.error(`GET /api/showcase/${locationId} failed:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
