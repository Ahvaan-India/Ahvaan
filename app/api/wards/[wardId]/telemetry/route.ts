import { NextResponse } from "next/server";
import {
  getLatestPopulation,
  getLatestWeather,
  getLocationById,
  getWeatherAtOrBefore,
} from "@/lib/db/queries";
import { LocationNotFoundError } from "@/lib/db/errors";
import { computeVulnerabilityScore } from "@/lib/heatshield/vulnerability";
import { outdoorWorkerFraction } from "@/lib/heatshield/exposure";
import { computeForecastDays } from "@/lib/heatshield/forecast";
import { getWeatherRange } from "@/lib/db/queries";
import {
  deltaDir,
  displayCategory,
  qualifyHumidity,
  qualifySolar,
  qualifyTemp,
  qualifyWind,
  settlementDensity,
} from "@/lib/console";
import { timezoneForLocation } from "@/lib/geo/timezone";
import { parseISTWall, toISTWall } from "@/lib/analysis";
import { REDIS_TTL, withRedisCache } from "@/lib/redis";
import { VULNERABILITY_DEFAULTS } from "@/lib/heatshield/config";
import { getDb } from "@/lib/db";
import { weatherTable } from "@/lib/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ wardId: string }>;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * GET /api/wards/[wardId]/telemetry  detail panel payload (wards 1:1
 * locations). Macro readings from the latest hourly row (+24h deltas),
 * demographic snapshot from census + engine components, event history
 * from the alerts table.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { wardId: raw } = await params;
  const wardId = Number(raw);
  if (!Number.isInteger(wardId) || wardId <= 0) {
    return NextResponse.json(
      { error: "Invalid wardId: must be a positive integer", wardId: raw },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const location = await getLocationById(wardId);
    if (!location) {
      return NextResponse.json(
        { error: "Ward not found", wardId },
        { status: 404 },
      );
    }
    const population = await getLatestPopulation(wardId);
    if (!population) {
      return NextResponse.json(
        { error: "No census row for this ward", wardId },
        { status: 422 },
      );
    }

    const { timeZone } = timezoneForLocation(location.lat, location.long);
    const latestWx = await getLatestWeather(wardId);
    const priorWx = latestWx?.timestamp
      ? await getWeatherAtOrBefore(
          wardId,
          new Date(parseISTWall(latestWx.timestamp).getTime() - 24 * 3_600_000),
        )
      : null;

    const temp = num(latestWx?.temperature2m);
    const realFeel = num(latestWx?.apparentTemperature);
    const humidity = num(latestWx?.relativeHumidity2m);
    const wind = num(latestWx?.windSpeed10m);
    // Solar: latest hour is 0 at night, so show the 24h daytime peak for planning.
    // We keep the latest value for the delta, but display the max.
    let solar: number | null = null;
    let priorSolarForDelta: number | null = null;
    try {
      const since24h = new Date(Date.now() - 24 * 3_600_000);
      const maxRows = await db
        .select({
          maxSolar: sql<number>`max(${weatherTable.shortwaveRadiation})`,
        })
        .from(weatherTable)
        .where(
          and(
            eq(weatherTable.locationId, wardId),
            gte(weatherTable.timestamp, toISTWall(since24h)),
          ),
        );
      const maxVal = maxRows[0]?.maxSolar;
      solar =
        typeof maxVal === "number" && Number.isFinite(maxVal)
          ? maxVal
          : num(latestWx?.shortwaveRadiation);
      // Prior 24h window for delta (so night vs night doesn't show flat)
      const since48h = new Date(Date.now() - 48 * 3_600_000);
      const until24h = new Date(Date.now() - 24 * 3_600_000);
      const priorMaxRows = await db
        .select({
          maxSolar: sql<number>`max(${weatherTable.shortwaveRadiation})`,
        })
        .from(weatherTable)
        .where(
          and(
            eq(weatherTable.locationId, wardId),
            gte(weatherTable.timestamp, toISTWall(since48h)),
            lte(weatherTable.timestamp, toISTWall(until24h)),
          ),
        );
      const priorMaxVal = priorMaxRows[0]?.maxSolar;
      priorSolarForDelta =
        typeof priorMaxVal === "number" && Number.isFinite(priorMaxVal)
          ? priorMaxVal
          : num(priorWx?.shortwaveRadiation);
    } catch {
      solar = num(latestWx?.shortwaveRadiation);
      priorSolarForDelta = num(priorWx?.shortwaveRadiation);
    }
    // Fallback to latest if no 24h window (e.g. no rows in last 24h but older rows exist)
    if (solar === null) solar = num(latestWx?.shortwaveRadiation);
    if (priorSolarForDelta === null)
      priorSolarForDelta = num(priorWx?.shortwaveRadiation);

    const macro = {
      temp,
      realFeel,
      humidity,
      wind,
      solar,
      timestamp: latestWx?.timestamp
        ? parseISTWall(latestWx.timestamp).toISOString()
        : null,
      qualifiers: {
        temp: temp !== null ? qualifyTemp(temp) : null,
        humidity: humidity !== null ? qualifyHumidity(humidity) : null,
        wind: wind !== null ? qualifyWind(wind) : null,
        solar: solar !== null ? qualifySolar(solar) : null,
      },
      deltas: {
        temp: deltaDir(temp ?? NaN, num(priorWx?.temperature2m)),
        humidity: deltaDir(humidity ?? NaN, num(priorWx?.relativeHumidity2m)),
        wind: deltaDir(wind ?? NaN, num(priorWx?.windSpeed10m)),
        solar: deltaDir(solar ?? NaN, priorSolarForDelta ?? NaN),
      },
    };

    const vuln = computeVulnerabilityScore(population);
    const total = population.totalPopulation ?? 0;
    const demographics = {
      totalPopulation: total,
      elderlyPct: vuln.components.elderly,
      elderlyCutoff: "60+",
      elderlyDefaulted: vuln.flags.includes("elderly_pct_default"),
      childrenPct: total > 0 ? (population.children0To6 ?? 0) / total : 0,
      outdoorWorkerPct: outdoorWorkerFraction(population),
      informalIndex: VULNERABILITY_DEFAULTS.informalHousingIndex,
      informalDefaulted: vuln.flags.includes("informal_housing_default"),
      settlementDensity: settlementDensity(
        VULNERABILITY_DEFAULTS.informalHousingIndex,
      ),
      flags: vuln.flags,
    };

    // Current risk: shared city board (no snapshots table), falling back to
    // a live single-ward computation when this ward missed the board.
    const { getBoard } = await import("@/lib/board");
    const { data: board } = await getBoard(7);
    const boardWard = board.wards.find((w) => w.locationId === wardId);
    let risk: {
      value: number;
      category: string;
      displayCategory: string;
      thermal: number;
      exposure: number;
      vulnerability: number;
      persistence: number;
      recovery: number;
      wbgt: number;
      heatIndex: number;
      utci: number | null;
      confidence: number;
      computedAt: string;
    } | null = null;
    if (boardWard?.latest) {
      const r = boardWard.latest;
      risk = {
        value: r.compositeRisk.value,
        category: r.compositeRisk.category,
        displayCategory: displayCategory(r.compositeRisk.category),
        thermal: r.scores.thermalStress,
        exposure: r.scores.exposure,
        vulnerability: r.scores.vulnerability,
        persistence: r.scores.persistence,
        recovery: r.scores.nighttimeRecovery,
        wbgt: r.indicators.wbgt,
        heatIndex: r.indicators.heatIndex,
        utci: r.indicators.utci,
        confidence: r.confidence.score,
        computedAt: r.computedAt,
      };
    } else {
      try {
        const { getWeatherWindow } = await import("@/lib/db/queries");
        const { buildRiskResponse } = await import("@/lib/heatshield/service");
        const [weatherRows, pop] = await Promise.all([
          getWeatherWindow(wardId),
          Promise.resolve(population),
        ]);
        const r = buildRiskResponse({
          location,
          weatherRows,
          population: pop,
        });
        risk = {
          value: r.compositeRisk.value,
          category: r.compositeRisk.category,
          displayCategory: displayCategory(r.compositeRisk.category),
          thermal: r.scores.thermalStress,
          exposure: r.scores.exposure,
          vulnerability: r.scores.vulnerability,
          persistence: r.scores.persistence,
          recovery: r.scores.nighttimeRecovery,
          wbgt: r.indicators.wbgt,
          heatIndex: r.indicators.heatIndex,
          utci: r.indicators.utci,
          confidence: r.confidence.score,
          computedAt: r.computedAt,
        };
      } catch {
        risk = null;
      }
    }

    // Reuse the shared forecast engine for the trajectory status line.
    let trajectory: { date: string; risk: number; category: string }[] = [];
    try {
      const now = new Date();
      const rows = await getWeatherRange(
        wardId,
        new Date(now.getTime() - 72 * 3_600_000),
        new Date(now.getTime() + 6 * 24 * 3_600_000),
      );
      trajectory = computeForecastDays({
        location,
        population,
        rows,
        timeZone,
        now,
        days: 5,
      }).map((d) => ({ date: d.date, risk: d.risk, category: d.category }));
    } catch {
      trajectory = [];
    }

    // Whole-response cache (60s): the panel re-requests this on every map
    // hover/selection. Only successful payloads store.
    const { data: payload, cached } = await withRedisCache(
      `ahvaan:telemetry:${wardId}`,
      REDIS_TTL.telemetry,
      async () => ({
        wardId,
        ward: population.ward ?? null,
        wardName: population.wardName ?? null,
        lat: location.lat,
        long: location.long,
        timezone: timeZone,
        risk,
        macro,
        demographics,
        trajectory,
        // No alert/event history: alerts are evaluated client-side
        // (lib/alerts.ts) and nothing is saved to the DB.
        history: [],
      }),
    );

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store", "X-Cache": cached ? "HIT" : "MISS" },
    });
  } catch (err) {
    if (err instanceof LocationNotFoundError) {
      return NextResponse.json(
        { error: "Ward not found", wardId },
        { status: 404 },
      );
    }
    console.error(`GET /api/wards/${wardId}/telemetry failed:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
